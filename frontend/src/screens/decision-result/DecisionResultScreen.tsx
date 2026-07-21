import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, getAuthDecision } from '../../api/client';
import type { AuthDecisionDetail, DecisionOutcome } from '../../api/types';

const BANNER_TEXT: Record<DecisionOutcome, string> = {
  APPROVE: 'APPROVE',
  DECLINE: 'DECLINE',
  ROUTE: 'ROUTE',
  NOT_REQUIRED: 'PRE-AUTHORISATION NOT REQUIRED',
};

function formatRand(amount: number): string {
  return `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Screen 2 — Decision result + evidence trail (Implementation Companion
 * §C.3). Leads with the decision and the money; the ordered gate reasons
 * are one click away, not hidden. Visual pattern per outcome: APPROVE
 * collapses the evidence with a one-key Approve action; DECLINE expands
 * it with Override available; ROUTE tells the consultant it's off to the
 * human queue.
 */
export function DecisionResultScreen() {
  const { authId } = useParams<{ authId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AuthDecisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!authId) {
      return;
    }
    setDetail(null);
    setError(null);
    setAcknowledged(false);
    getAuthDecision(authId)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load decision'));
  }, [authId]);

  if (error) {
    return <div className="error-banner">{error}</div>;
  }
  if (!detail) {
    return <p className="empty-state">Loading…</p>;
  }

  const evidenceDefaultOpen = detail.decision === 'DECLINE';

  return (
    <div>
      <div className={`banner banner-${detail.decision}`}>
        <h1>{BANNER_TEXT[detail.decision]}</h1>
        <p>
          Auth ID: <code>{detail.auth_id}</code> · Member: {detail.member_id}
        </p>
      </div>

      {detail.overrides.length > 0 && (
        <div className="card">
          <h2>Override history</h2>
          <ul className="evidence-trail">
            {detail.overrides.map((o) => (
              <li key={o.created_at}>
                <span>
                  Overridden by <strong>{o.overridden_by}</strong> on {new Date(o.created_at).toLocaleString()} — {o.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.review_outcome && (
        <div className="card">
          <h2>Review queue resolution</h2>
          <p>
            <strong>{detail.review_outcome.outcome}</strong> by {detail.review_outcome.reviewer} on{' '}
            {new Date(detail.review_outcome.decided_at).toLocaleString()} — {detail.review_outcome.reason}
          </p>
        </div>
      )}

      <dl className="money-line">
        <div>
          <dt>Funding source</dt>
          <dd>{detail.funding_source ?? '—'}</dd>
        </div>
        <div>
          <dt>Co-payment</dt>
          <dd>{detail.co_payment ? `${formatRand(detail.co_payment.amount)} — ${detail.co_payment.reason}` : 'None'}</dd>
        </div>
        <div>
          <dt>Reimbursement basis</dt>
          <dd>{detail.reimbursement_basis ?? '—'}</dd>
        </div>
        {detail.length_of_stay && (
          <div>
            <dt>Length of stay</dt>
            <dd>
              {detail.length_of_stay.days} day(s) — {detail.length_of_stay.level}
            </dd>
          </div>
        )}
      </dl>

      {detail.decision === 'ROUTE' && (
        <div className="card">
          <p>Sent to the review queue for manual review. Evidence below is pre-assembled for the reviewer.</p>
          <Link to="/review-queue">Go to review queue</Link>
        </div>
      )}
      {detail.decision === 'NOT_REQUIRED' && (
        <div className="card">
          <p>This tariff does not require pre-authorisation — proceed via normal claims submission.</p>
        </div>
      )}

      <details className="card" open={evidenceDefaultOpen}>
        <summary>Review evidence ({detail.gate_results.length} gates evaluated)</summary>
        <ol className="evidence-trail">
          {detail.gate_results.map((g) => (
            <li key={g.gate_number}>
              <span className={`gate-marker ${g.passed ? 'pass' : 'fail'}`}>{g.passed ? '✓' : '✗'}</span>
              <span>
                Gate {g.gate_number} ({g.gate_name}): {g.reason}
              </span>
            </li>
          ))}
        </ol>
      </details>

      <p className="caveat">{detail.caveat}</p>

      <div className="button-row">
        {detail.decision === 'APPROVE' && (
          <button type="button" autoFocus disabled={acknowledged} onClick={() => setAcknowledged(true)}>
            {acknowledged ? 'Approved ✓' : 'Approve'}
          </button>
        )}
        {(detail.decision === 'DECLINE' || detail.decision === 'APPROVE') && (
          <button type="button" className="secondary" onClick={() => navigate(`/decision/${detail.auth_id}/override`)}>
            Override
          </button>
        )}
        <button type="button" className="secondary" onClick={() => navigate('/')}>
          New request
        </button>
      </div>
    </div>
  );
}
