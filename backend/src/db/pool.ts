import { Pool } from 'pg';
import { loadConfig } from '../config/index.js';

let pool: Pool | undefined;

/** Lazily-created singleton pool for the running process (API server, load-all script). */
export function getPool(): Pool {
  if (!pool) {
    const config = loadConfig();
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
