import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * Network/DSP provider directory (unblocks Gate 6). NOT one of the eight
 * Phase-0 tracker rows — this is a separate provider-directory feed, not
 * an annexure; add it as its own acquisition item in
 * data/phase0/tracker.md. PLACEHOLDER FIXTURE DATA.
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'network_provider',
  targetTable: 'network_provider',
  columns: ['practice_no', 'provider_type', 'network_membership', 'option_scope'],
  rowKey: (row) => String(row.practice_no),
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.practice_no !== 'string' || row.practice_no.length === 0) {
      errors.push('practice_no must be a non-empty string');
    }
    if (typeof row.provider_type !== 'string' || row.provider_type.length === 0) {
      errors.push('provider_type must be a non-empty string');
    }
    if (!Array.isArray(row.option_scope)) {
      errors.push('option_scope must be an array');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  {
    practice_no: 'PLACEHOLDER-HOSP-001',
    provider_type: 'hospital',
    network_membership: 'DSP',
    option_scope: ['TANZANITE_ONE', 'EMERALD_VALUE'],
  },
  {
    practice_no: 'PLACEHOLDER-HOSP-002',
    provider_type: 'hospital',
    network_membership: 'NON_DSP',
    option_scope: [],
  },
];

export async function loadNetworkProviderFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE — provider directory feed, not yet acquired (no Companion A.1 row — add one)',
    checksum: `fixture-network-provider-${benefitYear}`,
  });
}
