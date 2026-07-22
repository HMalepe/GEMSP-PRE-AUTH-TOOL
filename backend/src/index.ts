import { createServer } from './api/server.js';
import { loadConfig } from './config/index.js';
import { getPool } from './db/pool.js';
import { loadLlmEndpointConfig } from './triage/llm-config.js';
import { HttpLlmClient } from './triage/llm-client.js';

const config = loadConfig();
const pool = config.databaseUrl ? getPool() : undefined;
// Throws PopiaComplianceError at startup (not on first request) if a
// public endpoint is misconfigured without a signed processor agreement.
const llmEndpointConfig = loadLlmEndpointConfig();
const llmClient = llmEndpointConfig ? new HttpLlmClient(llmEndpointConfig) : undefined;
const app = createServer(config, pool, llmClient);

app.listen(config.port, () => {
  console.log(`gems-preauth backend listening on :${config.port}`);
});
