import type { Pool } from 'pg';
import {
  clearStagedRows,
  createRuleVersion,
  findRuleVersion,
  markHumanVerified,
  promoteRuleVersion,
  stageRows,
  validateRuleVersion,
  type ValidationSummary,
} from './pipeline.js';

/**
 * Describes one dataset -> one live table. `columns` and each row's keys
 * must match the live table's column names exactly (see pipeline.ts
 * replaceTableRows) — rows are staged and promoted as plain
 * Record<string, unknown> objects, not typed domain entities, because the
 * staging table itself is JSONB and dataset-agnostic.
 */
export interface DatasetDefinition {
  dataset: string;
  targetTable: string;
  columns: string[];
  rowKey: (row: Record<string, unknown>) => string;
  validateRow: (row: Record<string, unknown>) => string[];
}

export interface LoadFixtureParams {
  benefitYear: number;
  effectiveFrom: string;
  sourceDoc: string;
  checksum: string;
}

export interface LoadFixtureResult {
  ruleVersionId: string;
  validation: ValidationSummary | 'ALREADY_PROMOTED';
  promotedRows: number;
}

const FIXTURE_REVIEWER = 'fixture-loader (placeholder data, not a real reviewer)';

/**
 * Runs a dataset through the full pipeline — stage, validate,
 * human-verify, promote — for PLACEHOLDER FIXTURE DATA ONLY. The
 * auto-verification step here (FIXTURE_REVIEWER) exists so this v1
 * framework demonstrably works end-to-end without a review UI that
 * doesn't exist yet.
 *
 * A REAL dataset load (once Phase-0 data is acquired and OCR'd) must NOT
 * use this function for the verify step — call createRuleVersion +
 * stageRows + validateRuleVersion here, then have a named human reviewer
 * call markHumanVerified separately, then promoteRuleVersion. See
 * Implementation Companion A.3.
 */
export async function loadFixtureDataset(
  pool: Pool,
  def: DatasetDefinition,
  rows: Record<string, unknown>[],
  params: LoadFixtureParams,
): Promise<LoadFixtureResult> {
  const existing = await findRuleVersion(pool, def.dataset, params.benefitYear, params.checksum);
  if (existing?.status === 'PROMOTED') {
    return { ruleVersionId: existing.versionId, validation: 'ALREADY_PROMOTED', promotedRows: 0 };
  }

  let ruleVersionId: string;
  if (existing) {
    // Same (dataset, benefit_year, checksum) exists but never got promoted
    // (e.g. failed validation last run) — resume it instead of colliding
    // with the unique constraint on a second createRuleVersion call.
    ruleVersionId = existing.versionId;
    await clearStagedRows(pool, ruleVersionId);
  } else {
    ruleVersionId = await createRuleVersion(pool, {
      dataset: def.dataset,
      benefitYear: params.benefitYear,
      effectiveFrom: params.effectiveFrom,
      sourceDoc: params.sourceDoc,
      checksum: params.checksum,
    });
  }

  await stageRows(
    pool,
    ruleVersionId,
    def.targetTable,
    rows.map((row) => ({ rowKey: def.rowKey(row), payload: row })),
  );

  const validation = await validateRuleVersion(pool, ruleVersionId, def.validateRow);
  if (validation.invalidRows > 0) {
    return { ruleVersionId, validation, promotedRows: 0 };
  }

  await markHumanVerified(pool, ruleVersionId, FIXTURE_REVIEWER);
  const promotedRows = await promoteRuleVersion(pool, {
    ruleVersionId,
    targetTable: def.targetTable,
    columns: def.columns,
    benefitYear: params.benefitYear,
  });

  return { ruleVersionId, validation, promotedRows };
}
