/**
 * Engine output contract (Technical Build Spec §4.3). `NOT_REQUIRED` is not
 * in the spec's example payload but is added to model Gate 1's
 * "skip -> claim rules" outcome, which is neither an approval, a decline,
 * nor a route — TODO: confirm this modelling during Phase 2 build-out.
 */
export type DecisionOutcome = 'APPROVE' | 'DECLINE' | 'ROUTE' | 'NOT_REQUIRED';

export interface CoPayment {
  amount: number;
  reason: string;
}

export interface LengthOfStay {
  days: number;
  level: string;
}

/**
 * Per-gate evidence for Screen 2's evidence trail (Implementation
 * Companion §C.3: "the ordered gate reasons... each with a pass/fail
 * marker"). Additive to the §4.3 contract, not a replacement for it —
 * `reasons` on AuthDecision stays the canonical flat list; this is the
 * structure it's derived from.
 */
export interface GateResultSummary {
  gateNumber: number;
  gateName: string;
  outcome: string;
  passed: boolean;
  reason: string;
}

export interface AuthDecision {
  decision: DecisionOutcome;
  authId: string;
  memberId: string;
  fundingSource: 'RISK_PMB' | 'DAY_TO_DAY' | 'PMSA' | null;
  coPayment: CoPayment | null;
  reimbursementBasis: string | null;
  lengthOfStay: LengthOfStay | null;
  reasons: string[];
  gateResults: GateResultSummary[];
  rulesVersion: string;
  createdAt: string;
  caveat: string;
}

export const DEFAULT_CAVEAT =
  'Not a guarantee of payment; re-adjudicated at claim stage';
