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

export interface AuthDecision {
  decision: DecisionOutcome;
  authId: string;
  memberId: string;
  fundingSource: 'RISK_PMB' | 'DAY_TO_DAY' | 'PMSA' | null;
  coPayment: CoPayment | null;
  reimbursementBasis: string | null;
  lengthOfStay: LengthOfStay | null;
  reasons: string[];
  rulesVersion: string;
  createdAt: string;
  caveat: string;
}

export const DEFAULT_CAVEAT =
  'Not a guarantee of payment; re-adjudicated at claim stage';
