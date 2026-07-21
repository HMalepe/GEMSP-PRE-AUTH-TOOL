import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * Running per-member benefit balances (unblocks Gate 4). NOT one of the
 * eight Phase-0 tracker rows — this isn't an annual annexure, it's an
 * ongoing operational import from wherever claims/balances are tracked
 * today; add it as its own feed once that source is identified.
 * References member(member_id), so the fixture members in
 * db/seed/001-fixture-members.sql must be loaded first — see
 * ingestion/load-all.ts. PLACEHOLDER FIXTURE DATA.
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'benefit_balance',
  targetTable: 'benefit_balance',
  columns: ['member_id', 'benefit_type', 'used', 'available'],
  rowKey: (row) => `${row.member_id}:${row.benefit_type}`,
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.member_id !== 'string' || row.member_id.length === 0) {
      errors.push('member_id must be a non-empty string');
    }
    if (typeof row.benefit_type !== 'string' || row.benefit_type.length === 0) {
      errors.push('benefit_type must be a non-empty string');
    }
    if (typeof row.used !== 'number' || row.used < 0) {
      errors.push('used must be a non-negative number');
    }
    if (typeof row.available !== 'number' || row.available < 0) {
      errors.push('available must be a non-negative number');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  { member_id: 'M-0001', benefit_type: 'SURGICAL_PROCEDURES', used: 0, available: 29213 },
  { member_id: 'M-0002', benefit_type: 'ONCOLOGY', used: 50000, available: 242135 },
];

export async function loadBenefitBalanceFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE — member benefit-balance import, source feed not yet identified',
    checksum: `fixture-benefit-balance-${benefitYear}`,
  });
}
