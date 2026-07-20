import { DEFAULT_CAVEAT, type AuthDecision, type DecisionOutcome } from '../domain/decision.js';
import type { GateOutcome, GateResult } from './types.js';

function outcomeToDecision(gateOutcome: GateOutcome): DecisionOutcome {
  switch (gateOutcome) {
    case 'DECLINE':
      return 'DECLINE';
    case 'ROUTE':
      return 'ROUTE';
    case 'APPROVE_WITH_COPAY':
      return 'APPROVE';
    case 'SKIP_TO_CLAIM_RULES':
      return 'NOT_REQUIRED';
    case 'CONTINUE':
      // Gate 9 always terminates the sequence by emitting the decision
      // (Technical Build Spec §4.2 row 9) — reaching here with CONTINUE
      // as the *final* outcome means gate 9 itself resolved to APPROVE.
      return 'APPROVE';
    default: {
      const exhaustive: never = gateOutcome;
      throw new Error(`Unhandled gate outcome: ${exhaustive as string}`);
    }
  }
}

/**
 * Assembles the engine output contract (Technical Build Spec §4.3) from a
 * completed gate sequence. Funding source, reimbursement basis and length
 * of stay are left null pending Phase 2 — they depend on reference data
 * (PMB/benefit gates) that isn't loaded yet.
 */
export function buildDecision(params: {
  authId: string;
  memberId: string;
  results: GateResult[];
  final: GateResult;
  rulesVersion: string;
}): AuthDecision {
  const { authId, memberId, results, final, rulesVersion } = params;
  return {
    decision: outcomeToDecision(final.outcome),
    authId,
    memberId,
    fundingSource: null,
    coPayment: final.copay ?? null,
    reimbursementBasis: null,
    lengthOfStay: null,
    reasons: results.map((r) => r.reason),
    rulesVersion,
    createdAt: new Date().toISOString(),
    caveat: DEFAULT_CAVEAT,
  };
}
