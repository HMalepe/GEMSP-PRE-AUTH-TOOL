/**
 * The four roles named in Technical Build Spec §7 Access control:
 * "role-based (consultant, clinical maintainer, admin, auditor); least
 * privilege; named accounts, no shared logins."
 */
export type Role = 'consultant' | 'clinical_maintainer' | 'admin' | 'auditor';

export const ROLES: readonly Role[] = ['consultant', 'clinical_maintainer', 'admin', 'auditor'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * "Mirror GEMS's confidential-DMP posture; restrict HIV-flagged records to
 * authorised roles" (§7 HIV confidentiality). Deliberately a short list —
 * the whole point is that most staff, including most of the roles that
 * can otherwise read decision history, do not get this by default.
 * security/redact.ts also allows a record's own submitter through
 * regardless of role, since they necessarily already know what they typed.
 */
export const HIV_AUTHORISED_ROLES: readonly Role[] = ['clinical_maintainer', 'admin'];

export function isHivAuthorised(role: Role): boolean {
  return HIV_AUTHORISED_ROLES.includes(role);
}
