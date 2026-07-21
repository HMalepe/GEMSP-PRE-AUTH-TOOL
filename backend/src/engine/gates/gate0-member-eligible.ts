import type { Gate } from '../types.js';

/**
 * Gate 0 — Member active/eligible.
 * Reads: Member.status. On fail: Decline.
 */
export const gate0MemberEligible: Gate = (_request, ref) => {
  const gateNumber = 0;
  const gateName = 'member_active_eligible';

  if (ref.member.status === 'ACTIVE') {
    return { gateNumber, gateName, outcome: 'CONTINUE', reason: `member ${ref.member.memberId} is active` };
  }
  return {
    gateNumber,
    gateName,
    outcome: 'DECLINE',
    reason: `member ${ref.member.memberId} is not active (status=${ref.member.status})`,
  };
};
