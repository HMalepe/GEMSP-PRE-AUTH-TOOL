import type { Gate } from '../types.js';

/**
 * Gate 1 — Auth required?
 * Reads: Tariff.requires_preauth. On fail (not required): Skip -> claim rules.
 * Blocked on Tariff data (Implementation Companion A.1: "easy text" datasets,
 * Provider FAQ / Tariff Files).
 */
export const gate1AuthRequired: Gate = () => {
  throw new Error('gate1AuthRequired not implemented (Technical Build Spec §4.2)');
};
