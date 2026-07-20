import type { DatasetLoader } from '../types.js';

/**
 * Annexure B — contributions + LJP bands (Implementation Companion A.2.3).
 * Unblocks Gate 7's penalty calc. Source is a scanned image PDF — requires
 * OCR (A.3). LJP formula: A = B - (35 + C), bands 0.05 / 0.25 / 0.50 / 0.75
 * x risk contribution.
 */
export const loadAnnexureBContributions: DatasetLoader = () => {
  throw new Error('loadAnnexureBContributions not implemented — dataset not yet acquired (Implementation Companion A.1)');
};
