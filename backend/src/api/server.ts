import express, { type Express } from 'express';
import type { Pool } from 'pg';
import type { AppConfig } from '../config/index.js';
import { DEFAULT_CAVEAT, type AuthDecision } from '../domain/decision.js';
import { toAuthDecisionPayload } from './serializers.js';

/**
 * Internal REST/JSON decision API (Technical Build Spec §1.1).
 *
 * POST /authorisations is a STUB: it returns a hard-coded decision object
 * shaped exactly like the §4.3 output contract, without running the gate
 * sequence or touching reference data. It exists to prove the API/wire
 * contract before Phase 2 wires it to backend/src/engine — see that
 * module's gate stubs for what's still blocked on Phase-0 data.
 *
 * `pool` is optional so this can be constructed without a live DB for
 * pure endpoint-shape tests; pass one to get a DB-aware /health.
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

  app.post('/authorisations', (_req, res) => {
    const decision: AuthDecision = {
      decision: 'APPROVE',
      authId: crypto.randomUUID(),
      memberId: 'STUB-MEMBER',
      fundingSource: 'RISK_PMB',
      coPayment: { amount: 1000, reason: 'elective scope' },
      reimbursementBasis: '100% Scheme Rate',
      lengthOfStay: { days: 2, level: 'general ward' },
      reasons: ['member active', 'ICD-10 M17.1 eligible'],
      rulesVersion: '2025.3',
      createdAt: new Date().toISOString(),
      caveat: DEFAULT_CAVEAT,
    };
    res.status(200).json(toAuthDecisionPayload(decision));
  });

  return app;
}
