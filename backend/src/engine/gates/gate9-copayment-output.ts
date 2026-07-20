import type { Gate } from '../types.js';

/**
 * Gate 9 — Co-payment calc + output.
 * Reads: CoPaymentRule + all prior gate results. Always terminal: emits the
 * decision object (see ../decision.ts for assembly, Technical Build Spec
 * §4.3 for the output contract).
 * Blocked on co-payment triggers data (Implementation Companion A.2.6 —
 * READY/text-extractable, but not yet loaded).
 */
export const gate9CopaymentOutput: Gate = () => {
  throw new Error('gate9CopaymentOutput not implemented (Technical Build Spec §4.2)');
};
