import express, { type Express } from 'express';
import type { AppConfig } from '../config/index.js';

/**
 * Internal REST/JSON decision API (Technical Build Spec §1.1). Orchestrates
 * the gate sequence and returns the decision object — until Phase-0
 * reference data lands, /decisions responds 501 rather than fabricate a
 * result off placeholder data (Technical Build Spec §0, §9 Phase 0 gate).
 */
export function createServer(_config: AppConfig): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/decisions', (_req, res) => {
    res.status(501).json({
      error:
        'Not implemented — Layer A gates are stubbed pending Phase-0 reference-data acquisition (see docs/implementation-companion.md Part A).',
    });
  });

  return app;
}
