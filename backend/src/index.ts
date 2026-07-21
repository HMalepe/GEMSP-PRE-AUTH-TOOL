import { createServer } from './api/server.js';
import { loadConfig } from './config/index.js';
import { getPool } from './db/pool.js';

const config = loadConfig();
const pool = config.databaseUrl ? getPool() : undefined;
const app = createServer(config, pool);

app.listen(config.port, () => {
  console.log(`gems-preauth backend listening on :${config.port}`);
});
