import express from 'express';
import { createServer } from '../backend/src/api/server.js';
import { loadConfig } from '../backend/src/config/index.js';
import { getPool } from '../backend/src/db/pool.js';
import { HttpLlmClient } from '../backend/src/triage/llm-client.js';
import { loadLlmEndpointConfig } from '../backend/src/triage/llm-config.js';

/**
 * Vercel serverless entry point. Mirrors backend/src/index.ts (same
 * config/pool/LLM-client wiring) but exports the Express app instead of
 * calling .listen() — Vercel's Node runtime invokes an exported Express
 * app directly as a request handler.
 *
 * Mounted under /api so the app's own routes (defined relative to '/',
 * e.g. '/authorisations') don't need to change: vercel.json rewrites
 * every /api/* request to this function with the original path intact
 * (e.g. /api/authorisations), and `app.use('/api', backendApp)` strips
 * that prefix before backendApp's routes ever see the request.
 *
 * `pool`/`llmClient` are constructed once at module scope so warm
 * invocations reuse the same connection pool rather than opening a new
 * one per request — with Supabase's pooled (PgBouncer) connection string
 * this is what keeps a burst of concurrent invocations from exhausting
 * Postgres's own connection limit.
 */
const config = loadConfig();
const pool = config.databaseUrl ? getPool() : undefined;
const llmEndpointConfig = loadLlmEndpointConfig();
const llmClient = llmEndpointConfig ? new HttpLlmClient(llmEndpointConfig) : undefined;
const backendApp = createServer(config, pool, llmClient);

const app = express();
app.use('/api', backendApp);

export default app;
