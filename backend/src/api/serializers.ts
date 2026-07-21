import type { AuthDecision } from '../domain/decision.js';

/**
 * Wire format for the engine output contract (Technical Build Spec §4.3).
 * The internal domain type is camelCase; the API contract is snake_case —
 * this is the only place that translation happens.
 */
export interface AuthDecisionPayload {
  decision: AuthDecision['decision'];
  auth_id: string;
  funding_source: AuthDecision['fundingSource'];
  co_payment: AuthDecision['coPayment'];
  reimbursement_basis: AuthDecision['reimbursementBasis'];
  length_of_stay: AuthDecision['lengthOfStay'];
  reasons: string[];
  rules_version: string;
  caveat: string;
}

export function toAuthDecisionPayload(decision: AuthDecision): AuthDecisionPayload {
  return {
    decision: decision.decision,
    auth_id: decision.authId,
    funding_source: decision.fundingSource,
    co_payment: decision.coPayment,
    reimbursement_basis: decision.reimbursementBasis,
    length_of_stay: decision.lengthOfStay,
    reasons: decision.reasons,
    rules_version: decision.rulesVersion,
    caveat: decision.caveat,
  };
}
