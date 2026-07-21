import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * Flat co-payment triggers (Implementation Companion A.2.6, READY). GEMS
 * has no per-procedure schedule — R1,000 late-auth, R1,000 elective
 * gastroscopy/colonoscopy (2026), R15,000 non-network, 30% non-DSP
 * (docs/gems-annexures-compilation.md §3). option_code+benefit_year
 * composite-FKs to option, so option.ts must load first. Values below are
 * the real confirmed figures from the annexures compilation, not
 * invented — but this is still a fixture/hand-transcribed load, not a
 * real Phase-0 acquisition.
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'co_payment_rule',
  targetTable: 'co_payment_rule',
  columns: ['trigger_code', 'option_code', 'amount_or_pct'],
  rowKey: (row) => `${row.trigger_code}:${row.option_code}`,
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.trigger_code !== 'string' || row.trigger_code.length === 0) {
      errors.push('trigger_code must be a non-empty string');
    }
    if (typeof row.option_code !== 'string' || row.option_code.length === 0) {
      errors.push('option_code must be a non-empty string');
    }
    if (typeof row.amount_or_pct !== 'number' || row.amount_or_pct < 0) {
      errors.push('amount_or_pct must be a non-negative number');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  { trigger_code: 'LATE_AUTH', option_code: 'BERYL', amount_or_pct: 1000 },
  { trigger_code: 'ELECTIVE_GASTRO_COLONOSCOPY_2026', option_code: 'BERYL', amount_or_pct: 1000 },
  { trigger_code: 'NON_NETWORK_HOSPITAL', option_code: 'TANZANITE_ONE', amount_or_pct: 15000 },
  { trigger_code: 'NON_DSP', option_code: 'TANZANITE_ONE', amount_or_pct: 30 },
];

export async function loadCoPaymentRuleFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE (hand-transcribed) — GEMS benefit guides / What’s New, from docs/gems-annexures-compilation.md §3',
    checksum: `fixture-co-payment-rule-${benefitYear}`,
  });
}
