import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * s29A / Rule 8.3 waiting-period scenarios (Implementation Companion
 * A.2.6, READY; unblocks Gate 7). Distinct from Annexure B's late-joiner
 * penalty bands, which have no §2.1 entity — see loaders/README.md.
 * Values below are the real confirmed scenarios from the annexures
 * compilation (docs/gems-annexures-compilation.md §7), hand-transcribed
 * as a fixture load rather than a real Phase-0 acquisition.
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'waiting_period_rule',
  targetTable: 'waiting_period_rule',
  columns: ['scenario', 'gwp_months', 'cswp_months', 'pmb_covered'],
  rowKey: (row) => String(row.scenario),
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.scenario !== 'string' || row.scenario.length === 0) {
      errors.push('scenario must be a non-empty string');
    }
    if (typeof row.gwp_months !== 'number' || row.gwp_months < 0) {
      errors.push('gwp_months must be a non-negative number');
    }
    if (typeof row.cswp_months !== 'number' || row.cswp_months < 0) {
      errors.push('cswp_months must be a non-negative number');
    }
    if (typeof row.pmb_covered !== 'boolean') {
      errors.push('pmb_covered must be a boolean');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  { scenario: 'NO_COVER_90_DAYS_S29A_1', gwp_months: 3, cswp_months: 12, pmb_covered: false },
  { scenario: 'PRIOR_COVER_LE_24M_GAP_LT_90D_S29A_2', gwp_months: 0, cswp_months: 12, pmb_covered: true },
  { scenario: 'PRIOR_COVER_GT_24M_GAP_LT_90D_S29A_3', gwp_months: 3, cswp_months: 0, pmb_covered: true },
];

export async function loadWaitingPeriodRuleFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE (hand-transcribed) — GEMS Underwriting Guide 2025, from docs/gems-annexures-compilation.md §7',
    checksum: `fixture-waiting-period-rule-${benefitYear}`,
  });
}
