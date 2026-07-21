import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * MPL / DRP / formulary (Implementation Companion A.2.5). Unblocks the
 * medicine co-payment calc. Note the twice-yearly DRP review cadence once
 * this loads real data — schedule a refresh, not just an annual one.
 * PLACEHOLDER FIXTURE DATA.
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'nappi',
  targetTable: 'nappi',
  columns: ['nappi_code', 'product', 'mpl_price', 'drp_price', 'formulary_flag'],
  rowKey: (row) => String(row.nappi_code),
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.nappi_code !== 'string' || row.nappi_code.length === 0) {
      errors.push('nappi_code must be a non-empty string');
    }
    if (typeof row.product !== 'string' || row.product.length === 0) {
      errors.push('product must be a non-empty string');
    }
    if (row.mpl_price !== null && (typeof row.mpl_price !== 'number' || row.mpl_price < 0)) {
      errors.push('mpl_price must be a non-negative number or null');
    }
    if (row.drp_price !== null && (typeof row.drp_price !== 'number' || row.drp_price < 0)) {
      errors.push('drp_price must be a non-negative number or null');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  {
    nappi_code: 'PLACEHOLDER-0001',
    product: 'PLACEHOLDER — metformin 500mg (formulary)',
    mpl_price: 45.5,
    drp_price: 45.5,
    formulary_flag: true,
  },
  {
    nappi_code: 'PLACEHOLDER-0002',
    product: 'PLACEHOLDER — non-formulary chronic drug',
    mpl_price: null,
    drp_price: 120.0,
    formulary_flag: false,
  },
];

export async function loadNappiFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE — Medikredit/GEMS Formulary Lists (MPL/DRP), not yet acquired (Implementation Companion A.2.5)',
    checksum: `fixture-nappi-${benefitYear}`,
  });
}
