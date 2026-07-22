import { useCurrentUserContext } from '../auth/CurrentUserContext';
import type { CurrentUser } from '../auth/current-user-storage';

/** Thin wrapper kept for call-site stability — the real state lives in CurrentUserContext (a single shared instance, not one per call site). */
export function useCurrentUser(): [CurrentUser | null, (user: CurrentUser | null) => void] {
  const { user, setUser } = useCurrentUserContext();
  return [user, setUser];
}
