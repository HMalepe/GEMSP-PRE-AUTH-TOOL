import type { DatasetLoader } from '../types.js';

/**
 * Waiting-period + s29A rules (Implementation Companion A.2.6), from the
 * GEMS Underwriting Guide. Text-extractable — READY. Encodes GWP (up to
 * 3 months) and CSWP (up to 12 months) scenarios per Rule 8.3 / s29A(1-3).
 */
export const loadWaitingPeriodRules: DatasetLoader = () => {
  throw new Error('loadWaitingPeriodRules not implemented — dataset not yet loaded (Implementation Companion A.1)');
};
