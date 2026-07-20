import type { Gate } from '../types.js';

/**
 * Gate 4 — Benefit/limit available.
 * Reads: BenefitBalance. On fail: Decline unless PMB (see Gate 3 result).
 * Blocked on Annexure C per-option benefit tables (Implementation Companion
 * A.2.2 — scanned, needs OCR + human sign-off before this can be wired).
 */
export const gate4BenefitLimit: Gate = () => {
  throw new Error('gate4BenefitLimit not implemented (Technical Build Spec §4.2)');
};
