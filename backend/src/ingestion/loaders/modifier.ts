import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * Tariff modifiers 0009/0011/0013/0018/0074/0075 from the Provider FAQ
 * (Implementation Companion A.2.6 — text-extractable, READY). RMR codes
 * (553/469/7208/989/250) from the same FAQ have no entity in §2.1 and are
 * NOT loaded here — there is nowhere to put them until the schema grows
 * one (see loaders/README.md).
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'modifier',
  targetTable: 'modifier',
  columns: ['code', 'effect_rule'],
  rowKey: (row) => String(row.code),
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.code !== 'string' || row.code.length === 0) {
      errors.push('code must be a non-empty string');
    }
    if (typeof row.effect_rule !== 'string' || row.effect_rule.length === 0) {
      errors.push('effect_rule must be a non-empty string');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  { code: '0009', effect_rule: 'Assistant fee = 20% of specialist surgeon fee, minimum 36.00 clinical procedure units' },
  { code: '0011', effect_rule: 'Emergency (operating-time based); funded for emergency authorisations, not scheduled lists' },
  { code: '0013', effect_rule: 'Related endoscopic exam at operation: only 50% of units codeable' },
  { code: '0018', effect_rule: 'BMI >= 35 surgical modifier: +50% surgeon fee, +50% anaesthetic time units' },
  { code: '0074', effect_rule: 'Endoscopic procedure with own equipment: basic fee +33.33%' },
  { code: '0075', effect_rule: 'Endoscopic procedure in own procedure room = 21.00 clinical procedure units' },
];

export async function loadModifierFixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    // Values here are real (hand-transcribed from docs/gems-annexures-compilation.md §8,
    // already extracted per Companion A.2.6 = READY), but this is still a fixture load —
    // a real Phase-0 load must read the acquired source file directly, not this code.
    sourceDoc: 'FIXTURE (hand-transcribed) — GEMS Provider FAQ, from docs/gems-annexures-compilation.md §8',
    checksum: `fixture-modifier-${benefitYear}`,
  });
}
