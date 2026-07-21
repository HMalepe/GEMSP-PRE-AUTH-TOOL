import { useCallback, useState } from 'react';

const STORAGE_KEY = 'gems-preauth.currentUser';

/**
 * Stands in for real auth/SSO (Implementation Companion Part B: "Auth /
 * SSO: your existing org identity provider... local accounts only as a
 * stopgap"). No login flow exists in v1 — this is that stopgap, just
 * enough identity to attribute reviewer/overriddenBy on the audit log.
 */
export function useCurrentUser(): [string, (name: string) => void] {
  const [name, setNameState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');

  const setName = useCallback((next: string) => {
    localStorage.setItem(STORAGE_KEY, next);
    setNameState(next);
  }, []);

  return [name, setName];
}
