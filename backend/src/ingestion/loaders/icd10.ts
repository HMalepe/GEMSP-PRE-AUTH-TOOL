import type { Pool } from 'pg';
import { loadFixtureDataset, type DatasetDefinition, type LoadFixtureResult } from '../dataset.js';

/**
 * CMS PMB ICD-10 coded list (Implementation Companion A.2.1, unblocks
 * Gate 2/3). cdl_flag folds in what Annexure D + the Chronic Guide would
 * otherwise populate (A.2.4) — there's no standalone CDL table in §2.1.
 *
 * PLACEHOLDER FIXTURE DATA: codes/descriptions below are real WHO ICD-10
 * (public classification), but the is_pmb/dtp_id/cdl_flag assignments are
 * illustrative only — do not trust for a real decision until verified
 * against the acquired CMS PMB coded list (data-quality rule: CMS PMB
 * status always prevails over any other source, enforced here at load
 * time — Technical Build Spec §2.2). Requires dtp.ts loaded first.
 */
const DEFINITION: DatasetDefinition = {
  dataset: 'icd10',
  targetTable: 'icd10',
  columns: ['code', 'description', 'is_pmb', 'dtp_id', 'cdl_flag', 'hiv_flag'],
  rowKey: (row) => String(row.code),
  validateRow: (row) => {
    const errors: string[] = [];
    if (typeof row.code !== 'string' || row.code.length === 0) {
      errors.push('code must be a non-empty string');
    }
    if (typeof row.description !== 'string' || row.description.length === 0) {
      errors.push('description must be a non-empty string');
    }
    if (typeof row.is_pmb !== 'boolean') {
      errors.push('is_pmb must be a boolean');
    }
    if (row.dtp_id !== null && typeof row.dtp_id !== 'string') {
      errors.push('dtp_id must be a string or null');
    }
    if (row.is_pmb === true && !row.dtp_id && row.cdl_flag !== true) {
      // PMB status comes from either the 271-DTP list or the 27 CDL chronic
      // conditions list (docs/gems-annexures-compilation.md §11) — a PMB
      // code needs one or the other, not necessarily both.
      errors.push('a PMB code must reference a dtp_id or have cdl_flag=true');
    }
    if (typeof row.hiv_flag !== 'boolean') {
      errors.push('hiv_flag must be a boolean');
    }
    if (row.hiv_flag === true && row.cdl_flag !== true) {
      // HIV/AIDS is one of the 26/27 PMB CDL conditions (docs/gems-annexures-compilation.md §4) — every HIV-flagged code must also be CDL.
      errors.push('hiv_flag=true requires cdl_flag=true — HIV/AIDS is a PMB CDL condition');
    }
    return errors;
  },
};

const FIXTURE_ROWS: Record<string, unknown>[] = [
  {
    code: 'M17.1',
    description: 'Other unilateral primary osteoarthritis of knee',
    is_pmb: false,
    dtp_id: null,
    cdl_flag: false,
    hiv_flag: false,
  },
  {
    code: 'I21.9',
    description: 'Acute myocardial infarction, unspecified',
    is_pmb: true,
    dtp_id: 'DTP-0001',
    cdl_flag: false,
    hiv_flag: false,
  },
  {
    code: 'K35.80',
    description: 'Unspecified acute appendicitis',
    is_pmb: true,
    dtp_id: 'DTP-0002',
    cdl_flag: false,
    hiv_flag: false,
  },
  {
    code: 'E11.9',
    description: 'Type 2 diabetes mellitus without complications',
    is_pmb: true,
    dtp_id: null,
    cdl_flag: true,
    hiv_flag: false,
  },
  // HIV/AIDS is one of the 26/27 PMB CDL conditions covered on ALL options
  // (docs/gems-annexures-compilation.md §4) — real WHO ICD-10 codes, PMB/
  // CDL/HIV flags illustrative pending real CMS PMB list verification, same
  // caveat as the rest of this fixture (see file header).
  {
    code: 'B20',
    description: 'Human immunodeficiency virus [HIV] disease resulting in infectious and parasitic diseases',
    is_pmb: true,
    dtp_id: null,
    cdl_flag: true,
    hiv_flag: true,
  },
  {
    code: 'B24',
    description: 'Unspecified human immunodeficiency virus [HIV] disease',
    is_pmb: true,
    dtp_id: null,
    cdl_flag: true,
    hiv_flag: true,
  },
];

export async function loadIcd10Fixtures(pool: Pool, benefitYear = 2025): Promise<LoadFixtureResult> {
  return loadFixtureDataset(pool, DEFINITION, FIXTURE_ROWS, {
    benefitYear,
    effectiveFrom: `${benefitYear}-01-01`,
    sourceDoc: 'FIXTURE — CMS PMB ICD-10 coded list, not yet acquired (Implementation Companion A.2.1)',
    checksum: `fixture-icd10-${benefitYear}-v2`,
  });
}
