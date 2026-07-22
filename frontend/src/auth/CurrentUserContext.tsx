import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadStoredUser, saveStoredUser, type CurrentUser } from './current-user-storage';

interface CurrentUserContextValue {
  user: CurrentUser | null;
  setUser: (user: CurrentUser | null) => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | undefined>(undefined);

/**
 * A single shared instance, not one useState per call site — the header's
 * account picker and every screen need to see the same value the instant
 * it changes, not just whatever was in localStorage when each happened to
 * mount.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(() => loadStoredUser());

  const setUser = useCallback((next: CurrentUser | null) => {
    saveStoredUser(next);
    setUserState(next);
  }, []);

  const value = useMemo(() => ({ user, setUser }), [user, setUser]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUserContext(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error('useCurrentUserContext must be used within a CurrentUserProvider');
  }
  return ctx;
}
