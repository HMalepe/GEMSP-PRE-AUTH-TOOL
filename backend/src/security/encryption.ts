/**
 * Column-level encryption at rest for `auth_decision.motivation_text`
 * (Technical Build Spec §7 Encryption) via pgcrypto's symmetric
 * pgp_sym_encrypt/pgp_sym_decrypt — the one genuinely free-text PHI field
 * in the schema; every other clinical fact is a coded reference
 * (ICD-10/tariff/NAPPI), which full-volume/backup encryption already
 * covers at the infra layer (see docs/runbook.md — that layer is a
 * deployment concern this application cannot enforce from inside itself).
 *
 * The key never touches application code as a constant — it's read once
 * at startup and passed as a query parameter on every encrypt/decrypt
 * call, the same way any other bound value is.
 */

const INSECURE_DEV_DEFAULT = 'INSECURE-DEV-DEFAULT-DO-NOT-USE-IN-PRODUCTION';

export function loadEncryptionKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.DB_ENCRYPTION_KEY;
  if (key) {
    return key;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'DB_ENCRYPTION_KEY is not set. Refusing to start in production without a real encryption key for motivation_text ' +
        '(Technical Build Spec §7 Encryption at rest).',
    );
  }
  // eslint-disable-next-line no-console
  console.warn(
    'DB_ENCRYPTION_KEY is not set — falling back to an insecure, publicly-known development key. ' +
      'This is fine for local dev/CI, never for a real deployment.',
  );
  return INSECURE_DEV_DEFAULT;
}
