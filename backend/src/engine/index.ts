import type { AuthDecision } from '../domain/decision.js';
import { buildDecision } from './decision.js';
import { gate0MemberEligible } from './gates/gate0-member-eligible.js';
import { gate1AuthRequired } from './gates/gate1-auth-required.js';
import { gate2Icd10Valid } from './gates/gate2-icd10-valid.js';
import { gate3PmbStatus } from './gates/gate3-pmb-status.js';
import { gate4BenefitLimit } from './gates/gate4-benefit-limit.js';
import { gate5ProcedureCovered } from './gates/gate5-procedure-covered.js';
import { gate6NetworkDsp } from './gates/gate6-network-dsp.js';
import { gate7WaitingPeriod } from './gates/gate7-waiting-period.js';
import { gate8ProtocolStepTherapy } from './gates/gate8-protocol-step-therapy.js';
import { gate9CopaymentOutput } from './gates/gate9-copayment-output.js';
import type { AuthRequest, Gate, GateOutcome, GateResult, ReferenceData } from './types.js';

/**
 * The fixed gate order (Technical Build Spec §4.2 / Rules-Engine Spec §3).
 * PMB (Gate 3) runs before the benefit check (Gate 4) deliberately — do
 * not reorder. This sequence is code, not data — only the thresholds
 * each gate evaluates against (in `ReferenceData`) are versioned rows.
 */
export const GATES: readonly Gate[] = [
  gate0MemberEligible,
  gate1AuthRequired,
  gate2Icd10Valid,
  gate3PmbStatus,
  gate4BenefitLimit,
  gate5ProcedureCovered,
  gate6NetworkDsp,
  gate7WaitingPeriod,
  gate8ProtocolStepTherapy,
  gate9CopaymentOutput,
];

/** Everything except CONTINUE/CONTINUE_WITH_COPAY stops the sequence. */
const TERMINAL_OUTCOMES: ReadonlySet<GateOutcome> = new Set([
  'DECLINE',
  'ROUTE',
  'SKIP_TO_CLAIM_RULES',
  'APPROVE_WITH_COPAY',
]);

export interface GateSequenceResult {
  results: GateResult[];
  final: GateResult;
}

/**
 * Runs gates in fixed order, fail-fast: the first terminal outcome stops
 * the sequence (Technical Build Spec §4.2). `gates` defaults to the real
 * GATES array but is injectable so tests can supply mocks. Purely
 * synchronous — gates never do I/O, `ref` is already fully resolved.
 */
export function runGateSequence(
  request: AuthRequest,
  ref: ReferenceData,
  gates: readonly Gate[] = GATES,
): GateSequenceResult {
  const results: GateResult[] = [];
  for (const gate of gates) {
    const result = gate(request, ref, results);
    results.push(result);
    if (TERMINAL_OUTCOMES.has(result.outcome)) {
      return { results, final: result };
    }
  }
  throw new Error(
    'Gate sequence completed without a terminal outcome — the last gate must never return CONTINUE or CONTINUE_WITH_COPAY',
  );
}

/** Runs the full gate sequence and assembles the §4.3 decision object. */
export function evaluateAuthorisation(params: {
  authId: string;
  request: AuthRequest;
  ref: ReferenceData;
  rulesVersion: string;
}): AuthDecision {
  const { authId, request, ref, rulesVersion } = params;
  const { results, final } = runGateSequence(request, ref);
  return buildDecision({ authId, request, ref, results, final, rulesVersion });
}

export type { AuthRequest, Gate, GateOutcome, GateResult, ReferenceData } from './types.js';
