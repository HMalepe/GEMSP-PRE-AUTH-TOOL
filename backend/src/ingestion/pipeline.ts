import type { Pool, PoolClient } from 'pg';
import { invalidateBenefitYear } from '../engine/reference-cache.js';

/**
 * Generic staging -> validation -> human-verification -> promotion
 * pipeline (Implementation Companion A.3, Technical Build Spec §3.2).
 * Dataset-specific knowledge (fixture rows, what "valid" means, which
 * table/columns to promote into) lives in backend/src/ingestion/loaders;
 * everything here is dataset-agnostic lifecycle plumbing.
 */

export type RuleVersionStatus = 'STAGED' | 'VALIDATED' | 'HUMAN_VERIFIED' | 'PROMOTED' | 'ROLLED_BACK';

export interface CreateRuleVersionParams {
  dataset: string;
  benefitYear: number;
  effectiveFrom: string;
  sourceDoc: string;
  checksum: string;
}

export async function createRuleVersion(pool: Pool, params: CreateRuleVersionParams): Promise<string> {
  const { rows } = await pool.query<{ version_id: string }>(
    `INSERT INTO rule_version (dataset, benefit_year, effective_from, source_doc, checksum, status)
     VALUES ($1, $2, $3, $4, $5, 'STAGED')
     RETURNING version_id`,
    [params.dataset, params.benefitYear, params.effectiveFrom, params.sourceDoc, params.checksum],
  );
  const versionId = rows[0]?.version_id;
  if (!versionId) {
    throw new Error('createRuleVersion: insert returned no version_id');
  }
  return versionId;
}

/**
 * Looks up any existing version with the same (dataset, benefit_year,
 * checksum) — i.e. this exact content was already staged at some point.
 * (dataset, benefit_year, checksum) is unique on rule_version, so a
 * second createRuleVersion call with the same three values always
 * conflicts; callers use this to decide whether to skip (already
 * PROMOTED) or resume (failed validation last time) instead of erroring.
 */
export async function findRuleVersion(
  pool: Pool,
  dataset: string,
  benefitYear: number,
  checksum: string,
): Promise<{ versionId: string; status: RuleVersionStatus } | undefined> {
  const { rows } = await pool.query<{ version_id: string; status: RuleVersionStatus }>(
    `SELECT version_id, status FROM rule_version
     WHERE dataset = $1 AND benefit_year = $2 AND checksum = $3`,
    [dataset, benefitYear, checksum],
  );
  const row = rows[0];
  return row ? { versionId: row.version_id, status: row.status } : undefined;
}

/** Clears previously-staged rows for a version so it can be re-staged from scratch. */
export async function clearStagedRows(pool: Pool, ruleVersionId: string): Promise<void> {
  await pool.query(`DELETE FROM dataset_staging WHERE rule_version_id = $1`, [ruleVersionId]);
}

async function getRuleVersionStatus(pool: Pool | PoolClient, ruleVersionId: string): Promise<RuleVersionStatus | undefined> {
  const { rows } = await pool.query<{ status: RuleVersionStatus }>(
    `SELECT status FROM rule_version WHERE version_id = $1`,
    [ruleVersionId],
  );
  return rows[0]?.status;
}

export interface StagedRow {
  rowKey: string;
  payload: Record<string, unknown>;
}

export async function stageRows(
  pool: Pool,
  ruleVersionId: string,
  targetTable: string,
  rows: StagedRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO dataset_staging (rule_version_id, target_table, row_key, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [ruleVersionId, targetTable, row.rowKey, JSON.stringify(row.payload)],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Returns validation errors for a staged row; an empty array means valid. */
export type RowValidator = (payload: Record<string, unknown>) => string[];

export interface ValidationSummary {
  totalRows: number;
  invalidRows: number;
  status: RuleVersionStatus;
}

export async function validateRuleVersion(
  pool: Pool,
  ruleVersionId: string,
  validate: RowValidator,
): Promise<ValidationSummary> {
  const { rows } = await pool.query<{ id: string; payload: Record<string, unknown> }>(
    `SELECT id, payload FROM dataset_staging WHERE rule_version_id = $1`,
    [ruleVersionId],
  );

  let invalidRows = 0;
  for (const row of rows) {
    const errors = validate(row.payload);
    const status = errors.length === 0 ? 'VALID' : 'INVALID';
    if (errors.length > 0) {
      invalidRows += 1;
    }
    await pool.query(
      `UPDATE dataset_staging SET validation_status = $1, validation_errors = $2::jsonb WHERE id = $3`,
      [status, JSON.stringify(errors), row.id],
    );
  }

  const nextStatus: RuleVersionStatus = invalidRows === 0 ? 'VALIDATED' : 'STAGED';
  await pool.query(`UPDATE rule_version SET status = $1 WHERE version_id = $2`, [nextStatus, ruleVersionId]);
  return { totalRows: rows.length, invalidRows, status: nextStatus };
}

/**
 * A named human sign-off against the source document (Companion A.2.2:
 * "a reviewer initials each option's table against the source PDF before
 * promotion"). Requires VALIDATED — you cannot verify a load that failed
 * its own schema/referential checks.
 */
export async function markHumanVerified(pool: Pool, ruleVersionId: string, reviewer: string): Promise<void> {
  const current = await getRuleVersionStatus(pool, ruleVersionId);
  if (current !== 'VALIDATED') {
    throw new Error(
      `markHumanVerified: rule_version ${ruleVersionId} must be VALIDATED first (was ${current ?? 'not found'})`,
    );
  }
  await pool.query(
    `UPDATE rule_version
     SET status = 'HUMAN_VERIFIED', human_verified_by = $1, human_verified_at = now()
     WHERE version_id = $2`,
    [reviewer, ruleVersionId],
  );
}

const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

function assertSafeIdentifier(name: string, kind: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Unsafe ${kind} identifier: ${name}`);
  }
}

/**
 * Every reference table carries benefit_year and rule_version_id, but
 * neither lives inside a staged row's payload — they're properties of the
 * *load*, not the dataset's own fields, and are the same for every row in
 * one promote/rollback call. The pipeline injects them here rather than
 * making every loader repeat them in its column list and fixture rows.
 */
const SYSTEM_COLUMNS = ['benefit_year', 'rule_version_id'] as const;

/**
 * Replaces every live row for (targetTable, benefitYear) with the given
 * staged rows, inside the caller's transaction. Full-replace, not upsert:
 * a row present in the old version but absent from the new one must
 * disappear too, so promote and rollback are the exact same operation
 * (Technical Build Spec §3.2 "rolled back... in one operation").
 *
 * targetTable/columns are always compile-time constants from a loader
 * module, never user input — building SQL identifiers from them is safe
 * because of that, not because they're escaped. Values are always
 * parameterised.
 */
async function replaceTableRows(
  client: PoolClient,
  targetTable: string,
  columns: string[],
  benefitYear: number,
  ruleVersionId: string,
  rows: { payload: Record<string, unknown> }[],
): Promise<void> {
  assertSafeIdentifier(targetTable, 'table');
  for (const column of columns) {
    assertSafeIdentifier(column, 'column');
  }

  await client.query(`DELETE FROM ${targetTable} WHERE benefit_year = $1`, [benefitYear]);

  if (rows.length === 0) {
    return;
  }
  const allColumns = [...columns, ...SYSTEM_COLUMNS];
  const columnList = allColumns.join(', ');
  const placeholders = allColumns.map((_, i) => `$${i + 1}`).join(', ');
  for (const row of rows) {
    const values = [...columns.map((c) => row.payload[c] ?? null), benefitYear, ruleVersionId];
    await client.query(`INSERT INTO ${targetTable} (${columnList}) VALUES (${placeholders})`, values);
  }
}

export interface PromoteParams {
  ruleVersionId: string;
  targetTable: string;
  /** Dataset-specific column names only — omit benefit_year/rule_version_id, the pipeline adds those. */
  columns: string[];
  benefitYear: number;
}

export async function promoteRuleVersion(pool: Pool, params: PromoteParams): Promise<number> {
  const { ruleVersionId, targetTable, columns, benefitYear } = params;

  const status = await getRuleVersionStatus(pool, ruleVersionId);
  if (status !== 'HUMAN_VERIFIED') {
    throw new Error(
      `promoteRuleVersion: rule_version ${ruleVersionId} must be HUMAN_VERIFIED first (was ${status ?? 'not found'})`,
    );
  }

  const { rows: staged } = await pool.query<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM dataset_staging WHERE rule_version_id = $1 AND validation_status = 'VALID'`,
    [ruleVersionId],
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await replaceTableRows(client, targetTable, columns, benefitYear, ruleVersionId, staged);
    await client.query(
      `UPDATE rule_version SET status = 'PROMOTED', promoted_at = now() WHERE version_id = $1`,
      [ruleVersionId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Reference-cache staleness window is bounded by its TTL either way, but
  // a promotion should be visible on the very next decision, not up to a
  // minute later (Technical Build Spec §6: "in-memory reference data").
  invalidateBenefitYear(benefitYear);

  return staged.length;
}

export interface RollbackParams {
  targetTable: string;
  columns: string[];
  benefitYear: number;
  /** The currently-PROMOTED (bad) version being rolled back. */
  fromRuleVersionId: string;
  /** The earlier version to restore — must have been PROMOTED at some point. */
  toRuleVersionId: string;
}

/**
 * Restores an earlier version's data in one operation. Staged rows are
 * never deleted, so replaying the older version's staged snapshot is all
 * a rollback needs — no separate "undo" logic to get wrong.
 */
export async function rollbackRuleVersion(pool: Pool, params: RollbackParams): Promise<number> {
  const { targetTable, columns, benefitYear, fromRuleVersionId, toRuleVersionId } = params;

  const fromStatus = await getRuleVersionStatus(pool, fromRuleVersionId);
  if (fromStatus !== 'PROMOTED') {
    throw new Error(`rollbackRuleVersion: fromRuleVersionId ${fromRuleVersionId} is not currently PROMOTED (was ${fromStatus ?? 'not found'})`);
  }
  const toStatus = await getRuleVersionStatus(pool, toRuleVersionId);
  if (toStatus !== 'PROMOTED' && toStatus !== 'ROLLED_BACK') {
    throw new Error(`rollbackRuleVersion: toRuleVersionId ${toRuleVersionId} was never a promoted version (was ${toStatus ?? 'not found'})`);
  }

  const { rows: staged } = await pool.query<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM dataset_staging WHERE rule_version_id = $1 AND validation_status = 'VALID'`,
    [toRuleVersionId],
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await replaceTableRows(client, targetTable, columns, benefitYear, toRuleVersionId, staged);
    await client.query(`UPDATE rule_version SET status = 'ROLLED_BACK' WHERE version_id = $1`, [fromRuleVersionId]);
    await client.query(
      `UPDATE rule_version SET status = 'PROMOTED', promoted_at = now() WHERE version_id = $1`,
      [toRuleVersionId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  invalidateBenefitYear(benefitYear);

  return staged.length;
}
