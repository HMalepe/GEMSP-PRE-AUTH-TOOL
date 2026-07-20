import type { DatasetLoader } from '../types.js';

/**
 * Co-payment triggers (Implementation Companion A.2.6): R1,000 late-auth,
 * R1,000 elective gastroscopy/colonoscopy (2026), R15,000 non-network,
 * 30% non-DSP. Flat model, not a per-procedure schedule (see
 * docs/gems-annexures-compilation.md §3). Text-extractable — READY.
 */
export const loadCopaymentTriggers: DatasetLoader = () => {
  throw new Error('loadCopaymentTriggers not implemented — dataset not yet loaded (Implementation Companion A.1)');
};
