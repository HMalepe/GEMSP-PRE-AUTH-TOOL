import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, searchAuthDecisions } from '../../api/client';
import type { AuthDecisionSummary } from '../../api/types';

/**
 * Screen 5 — History & audit lookup (Implementation Companion §C.6).
 * Read-only search by member/date/auth id/code; each result opens the
 * full decision object (Screen 2) with the rules_version it ran under.
 * Auditor-only cross-member access isn't enforced — no RBAC/auth exists
 * in v1 (Companion Part B: local accounts only as a stopgap).
 */
export function HistoryScreen() {
  const navigate = useNavigate();
  const [memberId, setMemberId] = useState('');
  const [authId, setAuthId] = useState('');
  const [code, setCode] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [results, setResults] = useState<AuthDecisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const found = await searchAuthDecisions({
        memberId: memberId.trim() || undefined,
        authId: authId.trim() || undefined,
        code: code.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setResults(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <h1>History &amp; audit lookup</h1>

      <form onSubmit={handleSearch} className="card">
        <div className="field-group">
          <div className="field">
            <label htmlFor="h-memberId">Member ID</label>
            <input id="h-memberId" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="h-authId">Auth ID</label>
            <input id="h-authId" value={authId} onChange={(e) => setAuthId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="h-code">Code (ICD-10/tariff/NAPPI)</label>
            <input id="h-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="h-dateFrom">From date</label>
            <input id="h-dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="h-dateTo">To date</label>
            <input id="h-dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="button-row">
          <button type="submit" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {results && results.length === 0 && <p className="empty-state">No matching decisions.</p>}

      {results && results.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Auth ID</th>
              <th>Member</th>
              <th>Decision</th>
              <th>Rules version</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.auth_id} className="clickable" onClick={() => navigate(`/decision/${r.auth_id}`)}>
                <td>
                  <code>{r.auth_id}</code>
                </td>
                <td>{r.member_id}</td>
                <td>{r.decision}</td>
                <td>{r.rules_version}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
