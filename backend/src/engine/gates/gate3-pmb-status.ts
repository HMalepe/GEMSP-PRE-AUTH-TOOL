import type { Gate } from '../types.js';

/**
 * Gate 3 — PMB status (early).
 * Reads: ICD10.is_pmb + DTP. On fail (not PMB): Continue.
 * Runs before Gate 4 deliberately — a PMB diagnosis overrides benefit
 * exhaustion downstream (Technical Build Spec §4.2 intro; do not reorder).
 * Never itself terminal: it only informs Gate 4's decision.
 */
export const gate3PmbStatus: Gate = (_request, ref) => {
  const gateNumber = 3;
  const gateName = 'pmb_status';
  const isPmb = ref.icd10?.isPmb ?? false;

  if (isPmb) {
    return {
      gateNumber,
      gateName,
      outcome: 'CONTINUE',
      reason: `ICD-10 ${ref.icd10?.code} is a PMB condition — overrides benefit exhaustion at Gate 4`,
    };
  }
  return {
    gateNumber,
    gateName,
    outcome: 'CONTINUE',
    reason: `ICD-10 ${ref.icd10?.code} is not a PMB condition`,
  };
};
