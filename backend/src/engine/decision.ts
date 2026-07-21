import { DEFAULT_CAVEAT, type AuthDecision, type DecisionOutcome, type GateResultSummary } from '../domain/decision.js';
import type { AuthRequest, GateOutcome, GateResult, ReferenceData } from './types.js';

/** CONTINUE/CONTINUE_WITH_COPAY are a gate letting the request through; APPROVE_WITH_COPAY is Gate 9's own pass. Everything else is that gate stopping the request. */
const PASSING_OUTCOMES: ReadonlySet<GateOutcome> = new Set(['CONTINUE', 'CONTINUE_WITH_COPAY', 'APPROVE_WITH_COPAY']);

function toGateResultSummary(result: GateResult): GateResultSummary {
  return {
    gateNumber: result.gateNumber,
    gateName: result.gateName,
    outcome: result.outcome,
    passed: PASSING_OUTCOMES.has(result.outcome),
    reason: result.reason,
  };
}

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
    case 'CONTINUE_WITH_COPAY':
      // Defensive only — runGateSequence never lets either reach here as
      // the *final* outcome (both are non-terminal; see engine/index.ts).
      return 'APPROVE';
    default: {
      const exhaustive: never = gateOutcome;
      throw new Error(`Unhandled gate outcome: ${exhaustive as string}`);
    }
  }
}

function resolveFundingSource(final: GateOutcome, ref: ReferenceData): AuthDecision['fundingSource'] {
  if (final !== 'APPROVE_WITH_COPAY') {
    return null;
  }
  if (ref.icd10?.isPmb) {
    return 'RISK_PMB';
  }
  // Ruby is GEMS's PMSA option; PMBs may not be paid from PMSA there
  // (docs/gems-annexures-compilation.md §2), so non-PMB Ruby claims fund
  // from PMSA and everything else defaults to day-to-day.
  if (ref.option.optionCode === 'RUBY') {
    return 'PMSA';
  }
  return 'DAY_TO_DAY';
}

function resolveLengthOfStay(final: GateOutcome, request: AuthRequest): AuthDecision['lengthOfStay'] {
  if (final !== 'APPROVE_WITH_COPAY') {
    return null;
  }
  if (request.setting !== 'IN_HOSPITAL' || request.requestedLengthOfStayDays === undefined) {
    return null;
  }
  return {
    days: request.requestedLengthOfStayDays,
    level: request.requestedLevelOfCare ?? 'general ward',
  };
}

/**
 * Assembles the engine output contract (Technical Build Spec §4.3) from a
 * completed gate sequence.
 */
export function buildDecision(params: {
  authId: string;
  request: AuthRequest;
  ref: ReferenceData;
  results: GateResult[];
  final: GateResult;
  rulesVersion: string;
}): AuthDecision {
  const { authId, request, ref, results, final, rulesVersion } = params;
  return {
    decision: outcomeToDecision(final.outcome),
    authId,
    memberId: request.memberId,
    fundingSource: resolveFundingSource(final.outcome, ref),
    coPayment: final.copay ?? null,
    reimbursementBasis: final.outcome === 'APPROVE_WITH_COPAY' ? '100% Scheme Rate' : null,
    lengthOfStay: resolveLengthOfStay(final.outcome, request),
    reasons: results.map((r) => r.reason),
    gateResults: results.map(toGateResultSummary),
    rulesVersion,
    createdAt: new Date().toISOString(),
    caveat: DEFAULT_CAVEAT,
  };
}
