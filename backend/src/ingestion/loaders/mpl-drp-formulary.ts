import type { DatasetLoader } from '../types.js';

/**
 * MPL / DRP / formulary + exclusion list (Implementation Companion A.2.5).
 * Unblocks the medicine co-payment calc. Source: Medikredit/GEMS Formulary
 * Lists — request data files directly, may need a GEMS/Medscheme contact.
 * Note the twice-yearly DRP review cadence — schedule a refresh job once
 * this loader is real.
 */
export const loadMplDrpFormulary: DatasetLoader = () => {
  throw new Error('loadMplDrpFormulary not implemented — dataset not yet acquired (Implementation Companion A.1)');
};
