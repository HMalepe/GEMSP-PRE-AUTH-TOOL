import type { DatasetLoader } from '../types.js';

/**
 * Tariff modifiers (0009/0011/0013/0018/0074/0075) + RMR codes
 * (553/469/7208/989/250) from the GEMS Provider FAQ (Implementation
 * Companion A.2.6). Text-extractable — READY, just not yet loaded.
 */
export const loadModifiersRmr: DatasetLoader = () => {
  throw new Error('loadModifiersRmr not implemented — dataset not yet loaded (Implementation Companion A.1)');
};
