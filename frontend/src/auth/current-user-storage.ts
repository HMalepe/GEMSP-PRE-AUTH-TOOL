const STORAGE_KEY = 'gems-preauth.currentUser';

/**
 * Mirrors backend/src/security/roles.ts's Role type — kept as a plain
 * string union here rather than importing across the frontend/backend
 * split (deliberate, see api/types.ts's header comment).
 */
export type Role = 'consultant' | 'clinical_maintainer' | 'admin' | 'auditor';

export interface CurrentUser {
  userId: string;
  name: string;
  role: Role;
}

/**
 * Stands in for real auth/SSO (Implementation Companion Part B). No login
 * flow exists in v1 — picking an account from GET /users (see
 * api/client.ts's listUsers) is that stopgap. Every API request reads the
 * stored userId straight from here and sends it as X-User-Id
 * (backend/src/security/auth.ts enforces it server-side; this is not a
 * client-side security boundary, just this app's identity bookkeeping).
 */
export function loadStoredUser(): CurrentUser | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    return null;
  }
}

export function saveStoredUser(user: CurrentUser | null): void {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
