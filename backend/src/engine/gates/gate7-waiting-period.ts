import type { Gate } from '../types.js';

/**
 * Gate 7 — Waiting period / late joiner.
 * Reads: WaitingPeriodRule. On fail: Decline (waiting window) or apply LJP
 * loading (bands 0.05 / 0.25 / 0.50 / 0.75 x risk contribution, formula
 * A = B - (35 + C)).
 * Blocked on Annexure B contributions + LJP bands (Implementation Companion
 * A.2.3 — scanned, needs OCR) and the s29A waiting-period text (A.2.6,
 * already text-extractable/READY).
 */
export const gate7WaitingPeriod: Gate = () => {
  throw new Error('gate7WaitingPeriod not implemented (Technical Build Spec §4.2)');
};
