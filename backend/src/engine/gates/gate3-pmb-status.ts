import type { Gate } from '../types.js';

/**
 * Gate 3 — PMB status (early).
 * Reads: ICD10.is_pmb + DTP. On fail (not PMB): Continue.
 * Runs before Gate 4 deliberately: a PMB diagnosis overrides benefit
 * exhaustion downstream (Technical Build Spec §4.2 intro).
 * Data-quality rule: where ICD-10/PMB status conflicts with a scheme code,
 * the CMS PMB code prevails — enforce in the ICD10 loader, not here
 * (Technical Build Spec §2.2).
 * Blocked on CMS PMB ICD-10 + 271 DTPs (Implementation Companion A.2.1).
 */
export const gate3PmbStatus: Gate = () => {
  throw new Error('gate3PmbStatus not implemented (Technical Build Spec §4.2)');
};
