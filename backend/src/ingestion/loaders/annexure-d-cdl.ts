import type { DatasetLoader } from '../types.js';

/**
 * Annexure D — CDL + ACDL per option (Implementation Companion A.2.4).
 * Unblocks Gate 8 (chronic/step-therapy). Chronic Medicine Guide text is
 * extractable (READY); Annexure D itself needs verification. Also captures
 * the MAC symbol legend (+OF, #OF, X, PMB, N, EXG, S, M, ***) as reference
 * metadata.
 */
export const loadAnnexureDCdl: DatasetLoader = () => {
  throw new Error('loadAnnexureDCdl not implemented — dataset not yet acquired (Implementation Companion A.1)');
};
