import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pgMigrate from 'node-pg-migrate';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, '../../../../db/migrations');

export async function migrateUp(databaseUrl: string): Promise<void> {
  await pgMigrate({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    log: () => {
      // silence node-pg-migrate's own console logging during tests
    },
  });
}

export async function migrateDown(databaseUrl: string): Promise<void> {
  await pgMigrate({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: 'down',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    log: () => {
      // silence node-pg-migrate's own console logging during tests
    },
  });
}
