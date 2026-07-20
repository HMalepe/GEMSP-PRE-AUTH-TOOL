import type { Gate } from '../types.js';

/**
 * Gate 8 — Protocol/step therapy.
 * Reads: formulary + criteria. On fail: Route to Layer B.
 * This is the seam between Layer A and Layer B (see ../../triage/index.ts).
 * Blocked on Annexure D + Chronic Guide CDL/ACDL (Implementation Companion
 * A.2.4) and MPL/DRP/formulary (A.2.5).
 */
export const gate8ProtocolStepTherapy: Gate = () => {
  throw new Error('gate8ProtocolStepTherapy not implemented (Technical Build Spec §4.2)');
};
