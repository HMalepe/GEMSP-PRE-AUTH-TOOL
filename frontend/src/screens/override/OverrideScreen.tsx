import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getAuthDecision, recordOverride } from '../../api/client';
import type { AuthDecisionDetail } from '../../api/types';
import { useCurrentUser } from '../../hooks/useCurrentUser';

/**
 * Screen 4 — Override / motivation capture (Implementation Companion
 * §C.5). A consultant overriding a Layer-A decision MUST enter a reason;
 * override + reason + user + timestamp are written to the immutable
 * audit log (backend: decision_override table).
 */
export function OverrideScreen() {
  const { authId } = useParams<{ authId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AuthDecisionDetail | null>(null);
  const [user] = useCurrentUser();
  const [overriddenBy, setOverriddenBy] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authId) return;
    getAuthDecision(authId)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load decision'));
  }, [authId]);

  useEffect(() => {
    if (user) {
      setOverriddenBy(user.name);
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authId) return;
    if (!overriddenBy.trim() || !reason.trim()) {
      setError('Both your name and a reason are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await recordOverride(authId, { overriddenBy: overriddenBy.trim(), reason: reason.trim() });
      navigate(`/decision/${authId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record override');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Override decision</h1>
      {detail && (
        <p className="field-hint">
          Overriding a <strong>{detail.decision}</strong> decision for member {detail.member_id} (auth ID {detail.auth_id}).
        </p>
      )}
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="card">
        <div className="field-group">
          <div className="field">
            <label htmlFor="overriddenBy">Your name *</label>
            <input id="overriddenBy" value={overriddenBy} onChange={(e) => setOverriddenBy(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="reason">Reason for override *</label>
          <textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <p className="field-hint">This is written to the immutable audit log and surfaced in reporting.</p>
        <div className="button-row">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Recording…' : 'Confirm override'}
          </button>
          <button type="button" className="secondary" onClick={() => navigate(authId ? `/decision/${authId}` : '/')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
