import express, { type Express } from 'express';
import type { Pool } from 'pg';
import type { AppConfig } from '../config/index.js';
import { evaluateAuthorisation } from '../engine/index.js';
import { ReferenceDataError, resolveReferenceData, resolveRulesVersion } from '../engine/resolve-reference-data.js';
import { benefitYearFromServiceDate } from '../engine/date-utils.js';
import { getReviewQueueItem, listReviewQueue, resolveReviewQueueItem } from '../triage/queue.js';
import { LayerBNotApplicableError, triageRoutedCase } from '../triage/extraction.js';
import type { LlmClient } from '../triage/llm-client.js';
import { getTrainingExamples } from '../triage/training-data.js';
import { getAuthDecisionDetail, searchAuthDecisions } from './history.js';
import { AuthDecisionNotFoundError, recordOverride } from './override.js';
import { persistAuthDecision } from './persist-decision.js';
import {
  getMember,
  searchIcd10,
  searchModifier,
  searchNappi,
  searchNetworkProvider,
  searchTariff,
} from './reference-data.js';
import { toAuthDecisionPayload } from './serializers.js';
import { parseAuthRequest } from './validate-request.js';

const RESOLVE_OUTCOMES = new Set(['APPROVED', 'DECLINED', 'MORE_INFO_REQUESTED']);

function parseYearParam(value: unknown): number {
  const year = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(year) ? year : new Date().getUTCFullYear();
}

function parseQueryParam(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Internal REST/JSON decision API (Technical Build Spec §1.1).
 *
 * `pool` is optional so this can be constructed without a live DB for
 * pure endpoint-shape tests; every route below except /health requires it
 * and responds 503 if it's missing (enforced centrally, see the
 * middleware right after /health is registered).
 */
export function createServer(_config: AppConfig, pool?: Pool, llmClient?: LlmClient): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    if (!pool) {
      res.json({ status: 'ok' });
      return;
    }
    pool
      .query('SELECT 1')
      .then(() => res.json({ status: 'ok', db: 'ok' }))
      .catch((err: unknown) => {
        res.status(503).json({ status: 'degraded', db: 'error', error: err instanceof Error ? err.message : String(err) });
      });
  });

  app.use((req, res, next) => {
    if (!pool) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }
    next();
  });
  // Every handler below this line can assume `pool` is defined — the
  // middleware above already 503'd otherwise. requireDb() just gives
  // TypeScript that same guarantee inside each closure.
  const requireDb = (): Pool => {
    if (!pool) {
      throw new Error('unreachable: requireDb() called without a pool despite the guard middleware');
    }
    return pool;
  };

  app.post('/authorisations', async (req, res) => {
    const parsed = parseAuthRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid request', details: parsed.errors });
      return;
    }

    try {
      const request = parsed.value;
      const ref = await resolveReferenceData(requireDb(), request);
      const rulesVersion = await resolveRulesVersion(requireDb(), ref.benefitYear);
      const decision = evaluateAuthorisation({ authId: crypto.randomUUID(), request, ref, rulesVersion });
      await persistAuthDecision(requireDb(), request, decision);
      res.status(200).json(toAuthDecisionPayload(decision));

      // Fire-and-forget: never delays the response above, and a failure
      // here doesn't affect the already-returned Layer-A decision — the
      // manual /triage endpoint below exists precisely for retrying this.
      if (decision.decision === 'ROUTE' && request.motivationText && llmClient) {
        triageRoutedCase(requireDb(), llmClient, decision.authId).catch((err: unknown) => {
          console.error(`Layer B auto-triage failed for ${decision.authId}`, err);
        });
      }
    } catch (err) {
      if (err instanceof ReferenceDataError) {
        res.status(404).json({ error: err.message, code: err.code });
        return;
      }
      console.error('POST /authorisations failed', err);
      res.status(500).json({ error: 'internal error evaluating authorisation' });
    }
  });

  app.get('/review-queue', async (_req, res) => {
    const items = await listReviewQueue(requireDb());
    res.json(items);
  });

  app.get('/review-queue/:authId', async (req, res) => {
    const item = await getReviewQueueItem(requireDb(), req.params.authId ?? '');
    if (!item) {
      res.status(404).json({ error: 'review queue item not found or already resolved' });
      return;
    }
    res.json(item);
  });

  app.post('/review-queue/:authId/resolve', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    if (typeof body.reviewer !== 'string' || body.reviewer.length === 0) {
      errors.push('reviewer is required');
    }
    if (typeof body.outcome !== 'string' || !RESOLVE_OUTCOMES.has(body.outcome)) {
      errors.push('outcome is required and must be APPROVED, DECLINED, or MORE_INFO_REQUESTED');
    }
    if (typeof body.reason !== 'string' || body.reason.length === 0) {
      errors.push('reason is required (Implementation Companion §C.4/§C.5 — overrides must carry a reason)');
    }
    if (errors.length > 0) {
      res.status(400).json({ error: 'invalid request', details: errors });
      return;
    }

    try {
      await resolveReviewQueueItem(requireDb(), req.params.authId ?? '', {
        reviewer: body.reviewer as string,
        outcome: body.outcome as 'APPROVED' | 'DECLINED' | 'MORE_INFO_REQUESTED',
        reason: body.reason as string,
      });
      res.status(200).json({ status: 'resolved' });
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found or already resolved')) {
        res.status(404).json({ error: err.message });
        return;
      }
      console.error('POST /review-queue/:authId/resolve failed', err);
      res.status(500).json({ error: 'internal error resolving review queue item' });
    }
  });

  // Manual/retry trigger for Layer B (Technical Build Spec §5) — covers
  // cases where motivation text was added after submission, or the LLM
  // endpoint wasn't configured yet at auto-trigger time.
  app.post('/review-queue/:authId/triage', async (req, res) => {
    if (!llmClient) {
      res.status(503).json({ error: 'Layer B is not configured (no LAYER_B_LLM_ENDPOINT_URL set)' });
      return;
    }
    try {
      const suggestion = await triageRoutedCase(requireDb(), llmClient, req.params.authId ?? '');
      res.status(200).json(suggestion);
    } catch (err) {
      if (err instanceof LayerBNotApplicableError) {
        const status = err.code === 'AUTH_DECISION_NOT_FOUND' ? 404 : 400;
        res.status(status).json({ error: err.message, code: err.code });
        return;
      }
      console.error('POST /review-queue/:authId/triage failed', err);
      res.status(500).json({ error: 'internal error running Layer B triage' });
    }
  });

  // Labelled training data for future Layer-B model improvement
  // (Technical Build Spec §5.2) — every human decision on a routed case,
  // logged from day one, whether or not Layer B ever suggested anything.
  app.get('/training-data', async (_req, res) => {
    const examples = await getTrainingExamples(requireDb());
    res.json(examples);
  });

  // Screen 1 autocomplete (Implementation Companion §C.2) — every code
  // field must resolve against reference data, never free text.
  app.get('/reference-data/icd10', async (req, res) => {
    const results = await searchIcd10(requireDb(), parseQueryParam(req.query.q), parseYearParam(req.query.year));
    res.json(results);
  });
  app.get('/reference-data/tariff', async (req, res) => {
    const results = await searchTariff(requireDb(), parseQueryParam(req.query.q), parseYearParam(req.query.year));
    res.json(results);
  });
  app.get('/reference-data/nappi', async (req, res) => {
    const results = await searchNappi(requireDb(), parseQueryParam(req.query.q), parseYearParam(req.query.year));
    res.json(results);
  });
  app.get('/reference-data/network-providers', async (req, res) => {
    const results = await searchNetworkProvider(requireDb(), parseQueryParam(req.query.q), parseYearParam(req.query.year));
    res.json(results);
  });
  app.get('/reference-data/modifiers', async (req, res) => {
    const results = await searchModifier(requireDb(), parseQueryParam(req.query.q), parseYearParam(req.query.year));
    res.json(results);
  });

  app.get('/members/:memberId', async (req, res) => {
    const year = req.query.serviceDate
      ? benefitYearFromServiceDate(parseQueryParam(req.query.serviceDate))
      : parseYearParam(req.query.year);
    const member = await getMember(requireDb(), req.params.memberId ?? '', year);
    if (!member) {
      res.status(404).json({ error: 'member not found' });
      return;
    }
    res.json(member);
  });

  // Screen 5 (Implementation Companion §C.6) — read-only search by
  // member/date/auth id/code.
  app.get('/auth-decisions', async (req, res) => {
    const results = await searchAuthDecisions(requireDb(), {
      memberId: req.query.memberId ? parseQueryParam(req.query.memberId) : undefined,
      authId: req.query.authId ? parseQueryParam(req.query.authId) : undefined,
      code: req.query.code ? parseQueryParam(req.query.code) : undefined,
      dateFrom: req.query.dateFrom ? parseQueryParam(req.query.dateFrom) : undefined,
      dateTo: req.query.dateTo ? parseQueryParam(req.query.dateTo) : undefined,
    });
    res.json(results);
  });

  app.get('/auth-decisions/:authId', async (req, res) => {
    const detail = await getAuthDecisionDetail(requireDb(), req.params.authId ?? '');
    if (!detail) {
      res.status(404).json({ error: 'auth decision not found' });
      return;
    }
    res.json(detail);
  });

  // Screen 4 (Implementation Companion §C.5) — mandatory reason, written
  // to an immutable log (decision_override).
  app.post('/auth-decisions/:authId/override', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    if (typeof body.overriddenBy !== 'string' || body.overriddenBy.length === 0) {
      errors.push('overriddenBy is required');
    }
    if (typeof body.reason !== 'string' || body.reason.length === 0) {
      errors.push('reason is required (Implementation Companion §C.5 — an override must carry a reason)');
    }
    if (errors.length > 0) {
      res.status(400).json({ error: 'invalid request', details: errors });
      return;
    }

    try {
      const record = await recordOverride(requireDb(), req.params.authId ?? '', {
        overriddenBy: body.overriddenBy as string,
        reason: body.reason as string,
      });
      res.status(200).json({
        auth_id: record.authId,
        overridden_by: record.overriddenBy,
        reason: record.reason,
        created_at: record.createdAt,
      });
    } catch (err) {
      if (err instanceof AuthDecisionNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      console.error('POST /auth-decisions/:authId/override failed', err);
      res.status(500).json({ error: 'internal error recording override' });
    }
  });

  return app;
}
