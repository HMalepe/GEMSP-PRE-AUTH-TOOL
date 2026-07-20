import type { Gate } from '../types.js';

/**
 * Gate 0 — Member active/eligible.
 * Reads: Member.status. On fail: Decline.
 * Blocked on Member reference data (not part of Phase-0 acquisition
 * checklist — assumed to come from the org's own membership source).
 */
export const gate0MemberEligible: Gate = () => {
  throw new Error('gate0MemberEligible not implemented (Technical Build Spec §4.2)');
};
