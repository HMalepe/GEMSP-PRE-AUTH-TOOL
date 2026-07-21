import { ageAt, monthsBetween } from '../date-utils.js';
import { calculateLateJoinerPenalty } from '../late-joiner-penalty.js';
import type { Gate } from '../types.js';
import { classifyWaitingPeriodScenario } from '../waiting-period.js';

/**
 * Gate 7 — Waiting period / late joiner.
 * Reads: WaitingPeriodRule. On fail: Decline (waiting window). "Apply
 * LJP" doesn't mean decline — the late joiner penalty is a contribution
 * loading, not a funding decision (no field on the §4.3 decision object),
 * so it's surfaced only as an informational reason on an otherwise
 * passing gate.
 *
 * CSWP (condition-specific waiting period for pre-existing conditions) is
 * NOT separately enforced here — that needs a "pre-existing condition"
 * flag this schema doesn't model. Only the GWP (general waiting period)
 * is checked.
 */
export const gate7WaitingPeriod: Gate = (request, ref) => {
  const gateNumber = 7;
  const gateName = 'waiting_period_late_joiner';
  const scenario = classifyWaitingPeriodScenario(ref.member.priorCoverMonths);
  const rule = ref.waitingPeriodRules.find((r) => r.scenario === scenario);

  if (!rule) {
    return {
      gateNumber,
      gateName,
      outcome: 'ROUTE',
      reason: `no waiting_period_rule found for scenario ${scenario}`,
    };
  }

  const monthsSinceJoin = monthsBetween(ref.member.joinDate, request.serviceDate);
  const isPmb = ref.icd10?.isPmb ?? false;
  const withinGwp = monthsSinceJoin < rule.gwpMonths;

  if (withinGwp && !(isPmb && rule.pmbCovered)) {
    return {
      gateNumber,
      gateName,
      outcome: 'DECLINE',
      reason: `within general waiting period (${monthsSinceJoin}/${rule.gwpMonths} months since joining), non-PMB or PMB not covered under ${scenario}`,
    };
  }

  const ageAtJoin = ageAt(ref.member.dob, ref.member.joinDate);
  const priorCoverYears = ref.member.priorCoverMonths / 12;
  const ljp = calculateLateJoinerPenalty(ageAtJoin, priorCoverYears);
  const ljpNote = ljp.applies ? `; late joiner penalty ${ljp.loadingFraction}x flagged` : '';

  return {
    gateNumber,
    gateName,
    outcome: 'CONTINUE',
    reason: `waiting period satisfied under ${scenario}${ljpNote}`,
  };
};
