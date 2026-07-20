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
import type { Gate, GateContext, GateResult } from './types.js';

/**
 * The fixed gate order (Technical Build Spec §4.2). This sequence is code,
 * not data — only the thresholds each gate evaluates against are
 * versioned rows.
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

export interface GateSequenceResult {
  results: GateResult[];
  final: GateResult;
}

/**
 * Runs gates in fixed order, fail-fast: the first non-CONTINUE outcome
 * stops the sequence (Technical Build Spec §4.2). `gates` defaults to the
 * real GATES array but is injectable so callers (and tests) can supply
 * mocks without touching the Phase-0-blocked stubs.
 */
export async function runGateSequence(
  ctx: GateContext,
  gates: readonly Gate[] = GATES,
): Promise<GateSequenceResult> {
  const results: GateResult[] = [];
  for (const gate of gates) {
    const result = await gate(ctx);
    results.push(result);
    if (result.outcome !== 'CONTINUE') {
      return { results, final: result };
    }
  }
  throw new Error(
    'Gate sequence completed without a terminal outcome — the last gate must never return CONTINUE',
  );
}

export type { Gate, GateContext, GateOutcome, GateResult } from './types.js';
