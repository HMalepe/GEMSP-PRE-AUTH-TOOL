/**
 * Which s29A scenario a member falls into, from Member.prior_cover_months
 * (docs/gems-annexures-compilation.md §7). The schema has no separate
 * "gap since prior cover ended" field — prior_cover_months=0 is treated
 * as covering both "never had cover" and "had a >=90-day gap", since both
 * resolve to the same s29A(1) GWP/CSWP treatment. Scenario strings match
 * the waiting_period_rule fixture rows in
 * backend/src/ingestion/loaders/waiting-period-rule.ts.
 */
export function classifyWaitingPeriodScenario(priorCoverMonths: number): string {
  if (priorCoverMonths <= 0) {
    return 'NO_COVER_90_DAYS_S29A_1';
  }
  if (priorCoverMonths <= 24) {
    return 'PRIOR_COVER_LE_24M_GAP_LT_90D_S29A_2';
  }
  return 'PRIOR_COVER_GT_24M_GAP_LT_90D_S29A_3';
}
