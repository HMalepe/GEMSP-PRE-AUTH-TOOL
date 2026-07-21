import type { AuthDecision, GateResultSummary } from '../domain/decision.js';

/**
 * Wire format for the engine output contract (Technical Build Spec §4.3).
 * The internal domain type is camelCase; the API contract is snake_case —
 * this is the only place that translation happens. member_id, gate_results
 * and created_at are additive fields the front-end needs (Implementation
 * Companion Part C) beyond the strict §4.3 example payload.
 */
export interface GateResultPayload {
  gate_number: number;
  gate_name: string;
  outcome: string;
  passed: boolean;
  reason: string;
}

export interface AuthDecisionPayload {
  decision: AuthDecision['decision'];
  auth_id: string;
  member_id: string;
  funding_source: AuthDecision['fundingSource'];
  co_payment: AuthDecision['coPayment'];
  reimbursement_basis: AuthDecision['reimbursementBasis'];
  length_of_stay: AuthDecision['lengthOfStay'];
  reasons: string[];
  gate_results: GateResultPayload[];
  rules_version: string;
  created_at: string;
  caveat: string;
}

function toGateResultPayload(g: GateResultSummary): GateResultPayload {
  return { gate_number: g.gateNumber, gate_name: g.gateName, outcome: g.outcome, passed: g.passed, reason: g.reason };
}

export function toAuthDecisionPayload(decision: AuthDecision): AuthDecisionPayload {
  return {
    decision: decision.decision,
    auth_id: decision.authId,
    member_id: decision.memberId,
    funding_source: decision.fundingSource,
    co_payment: decision.coPayment,
    reimbursement_basis: decision.reimbursementBasis,
    length_of_stay: decision.lengthOfStay,
    reasons: decision.reasons,
    gate_results: decision.gateResults.map(toGateResultPayload),
    rules_version: decision.rulesVersion,
    created_at: decision.createdAt,
    caveat: decision.caveat,
  };
}
