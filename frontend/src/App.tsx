import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { DecisionResultScreen } from './screens/decision-result/DecisionResultScreen';
import { HistoryScreen } from './screens/history/HistoryScreen';
import { NewRequestScreen } from './screens/new-request/NewRequestScreen';
import { OverrideScreen } from './screens/override/OverrideScreen';
import { ReviewQueueScreen } from './screens/review-queue/ReviewQueueScreen';

/**
 * Information architecture per Implementation Companion §C.1: new request
 * is the primary screen; decision result and override are reached from a
 * request/queue item rather than linked directly.
 */
export default function App() {
  return (
    <BrowserRouter>
      <nav>
        <NavLink to="/">New request</NavLink>
        {' | '}
        <NavLink to="/review-queue">Review queue</NavLink>
        {' | '}
        <NavLink to="/history">History</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<NewRequestScreen />} />
        <Route path="/decision/:authId" element={<DecisionResultScreen />} />
        <Route path="/review-queue" element={<ReviewQueueScreen />} />
        <Route path="/review-queue/:authId/override" element={<OverrideScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
