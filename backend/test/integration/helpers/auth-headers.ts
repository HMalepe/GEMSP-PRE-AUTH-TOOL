/**
 * The four demo accounts seeded by db/migrations/1700000000004_security-hardening.js
 * (see security/roles.ts) — every integration test hits the real
 * authenticate() middleware now, so every fetch() needs a named identity.
 */
export const CONSULTANT = { 'x-user-id': 'dr.consultant' };
export const CLINICAL_MAINTAINER = { 'x-user-id': 'clin.maintainer' };
export const ADMIN = { 'x-user-id': 'sys.admin' };
export const AUDITOR = { 'x-user-id': 'compliance.auditor' };
