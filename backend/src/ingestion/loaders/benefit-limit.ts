import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * Per-option benefit limits (Implementation Companion A.2.2, unblocks
 * Gates 4, 9). option_code+benefit_year composite-FKs to option, so
 * option.ts must be loaded and promoted first. PLACEHOLDER FIXTURE DATA —
 * rand values below are illustrative only; do not trust them, see
 * docs/gems-annexures-compilation.md §2 for the actual 2025 Benefit Guide
 * figures pending OCR verification against Annexure C.
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'benefit_limit',
  targetTable: 'benefit_limit',
  columns: ['option_code', 'benefit_type', 'sub_limit', 'basis'],
  rowKey: (row) => `${row.option_code}:${row.benefit_type}`,
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.option_code !== 'string' || row.option_code.length === 0) {
      errors.push('option_code must be a non-empty string');
    }
    if (typeof row.benefit_type !== 'string' || row.benefit_type.length === 0) {
      errors.push('benefit_type must be a non-empty string');
    }
    if (typeof row.sub_limit !== 'number' || row.sub_limit < 0) {
      errors.push('sub_limit must be a non-negative number');
    }
    if (row.basis !== 'PBPA' && row.basis !== 'PFPA') {
      errors.push('basis must be PBPA or PFPA');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  { option_code: 'TANZANITE_ONE', benefit_type: 'SURGICAL_PROCEDURES', sub_limit: 29213, basis: 'PFPA' },
  { option_code: 'BERYL', benefit_type: 'ONCOLOGY', sub_limit: 292135, basis: 'PFPA' },
  { option_code: 'ONYX', benefit_type: 'ONCOLOGY', sub_limit: 649619, basis: 'PFPA' },
];

export async function loadBenefitLimitFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE — Annexure C per-option benefit tables, not yet OCR-verified (Implementation Companion A.2.2)',
    checksum: `fixture-benefit-limit-${benefitYear}`,
  });
}
