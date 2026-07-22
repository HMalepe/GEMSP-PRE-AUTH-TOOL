import { loadEncryptionKey } from '../security/encryption.js';

export interface AppConfig {
  port: number;
  databaseUrl: string | undefined;
  /** §7 Encryption at rest — pgcrypto key for auth_decision.motivation_text (security/encryption.ts). */
  dbEncryptionKey: string;
  /** §7 Encryption in transit — reject requests that didn't arrive over TLS (security/tls.ts). Optional/falsy by default so local dev/tests over plain HTTP keep working; a real deployment sets REQUIRE_TLS=true behind its TLS-terminating proxy. */
  requireTls?: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: env.PORT ? Number(env.PORT) : 3000,
    databaseUrl: env.DATABASE_URL,
    dbEncryptionKey: loadEncryptionKey(env),
    requireTls: env.REQUIRE_TLS === 'true',
  };
}
