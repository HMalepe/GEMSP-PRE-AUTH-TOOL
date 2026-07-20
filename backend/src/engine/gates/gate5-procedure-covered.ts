import type { Gate } from '../types.js';

/**
 * Gate 5 — Procedure covered/coded.
 * Reads: Tariff + Modifier. On fail: Decline / route.
 * Blocked on tariff modifiers + RMR codes (Implementation Companion A.2.6,
 * Provider FAQ).
 */
export const gate5ProcedureCovered: Gate = () => {
  throw new Error('gate5ProcedureCovered not implemented (Technical Build Spec §4.2)');
};
