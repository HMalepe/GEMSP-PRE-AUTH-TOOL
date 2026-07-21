import express, { type Express } from 'express';
import type { Pool } from 'pg';
import type { AppConfig } from '../config/index.js';
import { evaluateAuthorisation } from '../engine/index.js';
import { ReferenceDataError, resolveReferenceData, resolveRulesVersion } from '../engine/resolve-reference-data.js';
import { getReviewQueueItem, listReviewQueue, resolveReviewQueueItem } from '../triage/queue.js';
import { persistAuthDecision } from './persist-decision.js';
import { toAuthDecisionPayload } from './serializers.js';
import { parseAuthRequest } from './validate-request.js';

const RESOLVE_OUTCOMES = new Set(['APPROVED', 'DECLINED', 'MORE_INFO_REQUESTED']);

/**
 * Internal REST/JSON decision API (Technical Build Spec §1.1).
 *
 * `pool` is optional so this can be constructed without a live DB for
 * pure endpoint-shape tests; every route below except /health requires it
 * and responds 503 if it's missing.
 */
export function createServer(_config: AppConfig, pool?: Pool): Express {
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

  app.post('/authorisations', async (req, res) => {
    if (!pool) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const parsed = parseAuthRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid request', details: parsed.errors });
      return;
    }

    try {
      const request = parsed.value;
      const ref = await resolveReferenceData(pool, request);
      const rulesVersion = await resolveRulesVersion(pool, ref.benefitYear);
      const decision = evaluateAuthorisation({ authId: crypto.randomUUID(), request, ref, rulesVersion });
      await persistAuthDecision(pool, request, decision);
      res.status(200).json(toAuthDecisionPayload(decision));
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
    if (!pool) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }
    const items = await listReviewQueue(pool);
    res.json(items);
  });

  app.get('/review-queue/:authId', async (req, res) => {
    if (!pool) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }
    const item = await getReviewQueueItem(pool, req.params.authId ?? '');
    if (!item) {
      res.status(404).json({ error: 'review queue item not found or already resolved' });
      return;
    }
    res.json(item);
  });

  app.post('/review-queue/:authId/resolve', async (req, res) => {
    if (!pool) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

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
      await resolveReviewQueueItem(pool, req.params.authId ?? '', {
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

  return app;
}
