import { useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { DecisionResultScreen } from './screens/decision-result/DecisionResultScreen';
import { HistoryScreen } from './screens/history/HistoryScreen';
import { NewRequestScreen } from './screens/new-request/NewRequestScreen';
import { OverrideScreen } from './screens/override/OverrideScreen';
import { ReviewQueueScreen } from './screens/review-queue/ReviewQueueScreen';
import { useCurrentUser } from './hooks/useCurrentUser';

function CurrentUserBadge() {
  const [name, setName] = useCurrentUser();
  const [editing, setEditing] = useState(name.length === 0);
  const [draft, setDraft] = useState(name);

  if (editing) {
    return (
      <form
        className="current-user"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) {
            setName(draft.trim());
            setEditing(false);
          }
        }}
      >
        <label htmlFor="current-user-name">Consultant name</label>
        <input id="current-user-name" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
        <button type="submit">Set</button>
      </form>
    );
  }

  return (
    <span className="current-user">
      Logged in as <strong>{name}</strong>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setDraft(name);
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
        <Routes>
          <Route path="/" element={<NewRequestScreen />} />
          <Route path="/decision/:authId" element={<DecisionResultScreen />} />
          <Route path="/decision/:authId/override" element={<OverrideScreen />} />
          <Route path="/review-queue" element={<ReviewQueueScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
