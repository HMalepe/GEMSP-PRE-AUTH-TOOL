import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * The six GEMS options. Not one of the eight Phase-0 tracker rows (basic
 * scheme metadata, low difficulty) but a prerequisite dimension for
 * benefit_limit and co_payment_rule, which composite-FK to
 * (option_code, benefit_year). PLACEHOLDER FIXTURE DATA — network_type
 * classifications below are illustrative, not verified against the 2025
 * Scheme Rules; do not trust for a real decision (docs/gems-annexures-compilation.md §2).
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'option',
  targetTable: 'option',
  columns: ['option_code', 'name', 'network_type'],
  rowKey: (row) => String(row.option_code),
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.option_code !== 'string' || row.option_code.length === 0) {
      errors.push('option_code must be a non-empty string');
    }
    if (typeof row.name !== 'string' || row.name.length === 0) {
      errors.push('name must be a non-empty string');
    }
    if (row.network_type !== 'REO' && row.network_type !== 'NETWORK' && row.network_type !== 'OPEN') {
      errors.push('network_type must be one of REO, NETWORK, OPEN');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  { option_code: 'TANZANITE_ONE', name: 'Tanzanite One', network_type: 'NETWORK' },
  { option_code: 'BERYL', name: 'Beryl', network_type: 'OPEN' },
  { option_code: 'RUBY', name: 'Ruby', network_type: 'OPEN' },
  { option_code: 'EMERALD', name: 'Emerald', network_type: 'OPEN' },
  { option_code: 'EMERALD_VALUE', name: 'Emerald Value', network_type: 'NETWORK' },
  { option_code: 'ONYX', name: 'Onyx', network_type: 'OPEN' },
];

export async function loadOptionFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE — GEMS 2025 Scheme Rules Annexure A (option definitions), not yet acquired',
    checksum: `fixture-option-${benefitYear}`,
  });
}
