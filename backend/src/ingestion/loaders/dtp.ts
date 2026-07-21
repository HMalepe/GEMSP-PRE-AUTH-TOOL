import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * 271 diagnosis-treatment pairs (Implementation Companion A.2.1, unblocks
 * Gate 3). PLACEHOLDER FIXTURE DATA — synthetic dtp_ids and descriptions,
 * not the real CMS 271-DTP list. Must load before icd10.ts (icd10.dtp_id
 * FKs to this table).
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'dtp',
  targetTable: 'dtp',
  columns: ['dtp_id', 'description', 'pmb_level_of_care'],
  rowKey: (row) => String(row.dtp_id),
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.dtp_id !== 'string' || row.dtp_id.length === 0) {
      errors.push('dtp_id must be a non-empty string');
    }
    if (typeof row.description !== 'string' || row.description.length === 0) {
      errors.push('description must be a non-empty string');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  {
    dtp_id: 'DTP-0001',
    description: 'PLACEHOLDER — acute myocardial infarction (not real CMS DTP data)',
    pmb_level_of_care: 'Level 1 public hospital equivalent',
  },
  {
    dtp_id: 'DTP-0002',
    description: 'PLACEHOLDER — acute appendicitis (not real CMS DTP data)',
    pmb_level_of_care: 'Level 1 public hospital equivalent',
  },
];

export async function loadDtpFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE — CMS PMB ICD-10 + 271 DTPs, not yet acquired (Implementation Companion A.2.1)',
    checksum: `fixture-dtp-${benefitYear}`,
  });
}
