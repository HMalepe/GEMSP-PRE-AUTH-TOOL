import type { Gate } from '../types.js';

/**
 * Gate 6 — Network/DSP compliant.
 * Reads: NetworkProvider. On fail: Approve + co-pay (NOT a decline — a
 * non-network admission still gets funded, with the flat R15,000 /
 * non-DSP 30% co-payment attached; Technical Build Spec §4.2, Annexures
 * compilation §3).
 * Blocked on network/DSP provider data (not part of the eight Phase-0
 * tracker rows — a separate provider-directory feed).
 */
export const gate6NetworkDsp: Gate = () => {
  throw new Error('gate6NetworkDsp not implemented (Technical Build Spec §4.2)');
};
