import { useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { listUsers } from './api/client';
import type { AppUser } from './api/types';
import { CurrentUserProvider } from './auth/CurrentUserContext';
import { DecisionResultScreen } from './screens/decision-result/DecisionResultScreen';
import { HistoryScreen } from './screens/history/HistoryScreen';
import { NewRequestScreen } from './screens/new-request/NewRequestScreen';
import { OverrideScreen } from './screens/override/OverrideScreen';
import { ReviewQueueScreen } from './screens/review-queue/ReviewQueueScreen';
import { useCurrentUser } from './hooks/useCurrentUser';

const ROLE_LABELS: Record<AppUser['role'], string> = {
  consultant: 'Consultant',
  clinical_maintainer: 'Clinical maintainer',
  admin: 'Admin',
  auditor: 'Auditor',
};

/**
 * Account picker (Technical Build Spec §7: "named accounts, no shared
 * logins") — a stopgap for real SSO, same as before, but now backed by
 * GET /users instead of free text, since the backend enforces RBAC
 * against real app_user rows (backend/src/security/auth.ts). Every API
 * call automatically sends X-User-Id for whichever account is selected
 * here (api/client.ts).
 */
function CurrentUserBadge() {
  const [user, setUser] = useCurrentUser();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(user === null);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(() => setError('Could not load accounts'));
  }, []);

  if (editing) {
    return (
      <form
        className="current-user"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label htmlFor="current-user-select">Account</label>
        {error && <span className="field-error">{error}</span>}
        {!users && !error && <span>Loading…</span>}
        {users && (
          <select
            id="current-user-select"
            value=""
            onChange={(e) => {
              const picked = users.find((u) => u.userId === e.target.value);
              if (picked) {
                setUser(picked);
                setEditing(false);
              }
            }}
            autoFocus
          >
            <option value="" disabled>
              Select an account…
            </option>
            {(['consultant', 'clinical_maintainer', 'admin', 'auditor'] as const).map((role) => (
              <optgroup key={role} label={ROLE_LABELS[role]}>
                {users
                  .filter((u) => u.role === role)
                  .map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        )}
      </form>
    );
  }

  return (
    <span className="current-user">
      Logged in as <strong>{user!.name}</strong>
      <span className={`badge badge-role-${user!.role}`}>{ROLE_LABELS[user!.role]}</span>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setEditing(true);
        }}
      >
        change
      </button>
    </span>
  );
}

/**
 * Information architecture per Implementation Companion §C.1: new request
 * is the primary screen; decision result and override are reached from a
 * request/queue item rather than linked directly.
 */
export default function App() {
  return (
    <CurrentUserProvider>
      <AppShell />
    </CurrentUserProvider>
  );
}

function AppShell() {
  const [user] = useCurrentUser();

  return (
    <BrowserRouter>
      <header className="app-header">
        <nav>
          <NavLink to="/" end>
            New request
          </NavLink>
          <NavLink to="/review-queue">Review queue</NavLink>
          <NavLink to="/history">History</NavLink>
        </nav>
        <CurrentUserBadge />
      </header>
      <main>
        {!user ? (
          <p className="empty-state">Select an account above to continue — every action is attributed to a named account (Technical Build Spec §7).</p>
        ) : (
          <Routes>
            <Route path="/" element={<NewRequestScreen />} />
            <Route path="/decision/:authId" element={<DecisionResultScreen />} />
            <Route path="/decision/:authId/override" element={<OverrideScreen />} />
            <Route path="/review-queue" element={<ReviewQueueScreen />} />
            <Route path="/history" element={<HistoryScreen />} />
          </Routes>
        )}
      </main>
    </BrowserRouter>
  );
}
