import type { DatasetLoader } from '../types.js';

/**
 * Annexure C — per-option benefit tables, all six options (Implementation
 * Companion A.2.2). Unblocks Gates 4 and 9. Source is a scanned image PDF —
 * requires OCR (A.3) and cross-check against the text-extractable 2025
 * Benefit Guide before human sign-off and promotion.
 */
export const loadAnnexureCBenefitLimits: DatasetLoader = () => {
  throw new Error('loadAnnexureCBenefitLimits not implemented — dataset not yet acquired (Implementation Companion A.1)');
};
