import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * Procedure/RPL codes + the pre-auth trigger flag (unblocks Gates 1, 5).
 * NOT one of the eight Phase-0 tracker rows — the Companion checklist
 * doesn't name a tariff-code source explicitly, only "Tariff Files" in
 * the document repository structure (docs/gems-annexures-compilation.md
 * §"Document repository structure"). Add this as its own acquisition item
 * in data/phase0/tracker.md before Phase 2. PLACEHOLDER FIXTURE DATA.
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'tariff',
  targetTable: 'tariff',
  columns: ['code', 'description', 'requires_preauth', 'category'],
  rowKey: (row) => String(row.code),
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.code !== 'string' || row.code.length === 0) {
      errors.push('code must be a non-empty string');
    }
    if (typeof row.description !== 'string' || row.description.length === 0) {
      errors.push('description must be a non-empty string');
    }
    if (typeof row.requires_preauth !== 'boolean') {
      errors.push('requires_preauth must be a boolean');
    }
    return errors;
  },
};

// category values are deliberately drawn from the same vocabulary as
// benefit_limit.benefit_type (see benefit-limit.ts) — Gate 4 resolves a
// benefit_type straight from tariff.category, and §2.1 has no separate
// mapping table between the two, so the two columns share one enum by
// convention.
const FIXTURE_ROWS: Record<string, unknown>[] = [
  {
    code: 'PLACEHOLDER-GASTRO-01',
    description: 'PLACEHOLDER — elective gastroscopy',
    requires_preauth: true,
    category: 'endoscopy',
  },
  {
    code: 'PLACEHOLDER-HIP-01',
    description: 'PLACEHOLDER — total hip replacement',
    requires_preauth: true,
    category: 'SURGICAL_PROCEDURES',
  },
  {
    code: 'PLACEHOLDER-GP-CONSULT',
    description: 'PLACEHOLDER — GP consultation, out-of-hospital',
    requires_preauth: false,
    category: 'consultation',
  },
];

export async function loadTariffFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE — GEMS/Medikredit Tariff Files, not yet acquired (no Companion A.1 row — add one)',
    checksum: `fixture-tariff-${benefitYear}-v2`,
  });
}
