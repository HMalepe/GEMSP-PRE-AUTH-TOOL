import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { Pool } from 'pg';
import { configureReferenceCacheTtlMs, getCachedReferenceTables, invalidateAllBenefitYears, invalidateBenefitYear } from '../../src/engine/reference-cache.js';

/**
 * The cache is what carries Layer A toward its <500ms p95 NFR (Technical
 * Build Spec §6) by turning nine per-request reference-table queries into
 * zero on a cache hit. These tests use a fake Pool (call-counting, no real
 * DB) so they run everywhere unit tests do, independent of Postgres.
 */

beforeEach(() => {
  invalidateAllBenefitYears();
  configureReferenceCacheTtlMs(60_000);
});

test('a cache hit issues no queries at all', async () => {
  const state = { queryCount: 0 };
  const pool = {
    query: async () => {
      state.queryCount += 1;
      return { rows: [] };
    },
  } as unknown as Pool;

  await getCachedReferenceTables(pool, 2025);
  const afterFirstLoad = state.queryCount;
  assert.equal(afterFirstLoad, 10, 'first load issues the 10 reference-table queries');

  await getCachedReferenceTables(pool, 2025);
  assert.equal(state.queryCount, afterFirstLoad, 'a second call within TTL must not query again');
});

test('different benefit years are cached independently', async () => {
  const state = { queryCount: 0 };
  const pool = {
    query: async () => {
      state.queryCount += 1;
      return { rows: [] };
    },
  } as unknown as Pool;

  await getCachedReferenceTables(pool, 2025);
  await getCachedReferenceTables(pool, 2026);
  assert.equal(state.queryCount, 20, 'each benefit year loads its own 10 queries');

  await getCachedReferenceTables(pool, 2025);
  await getCachedReferenceTables(pool, 2026);
  assert.equal(state.queryCount, 20, 'both years now serve from cache');
});

test('invalidateBenefitYear forces a reload only for that year', async () => {
  const state = { queryCount: 0 };
  const pool = {
    query: async () => {
      state.queryCount += 1;
      return { rows: [] };
    },
  } as unknown as Pool;

  await getCachedReferenceTables(pool, 2025);
  await getCachedReferenceTables(pool, 2026);
  const afterFirstLoad = state.queryCount;

  invalidateBenefitYear(2025);
  await getCachedReferenceTables(pool, 2025);
  assert.equal(state.queryCount, afterFirstLoad + 10, 'invalidated year reloads');

  await getCachedReferenceTables(pool, 2026);
  assert.equal(state.queryCount, afterFirstLoad + 10, '2026 was never invalidated and stays cached');
});

test('a load past TTL is treated as a miss', async () => {
  configureReferenceCacheTtlMs(1);
  const state = { queryCount: 0 };
  const pool = {
    query: async () => {
      state.queryCount += 1;
      return { rows: [] };
    },
  } as unknown as Pool;

  await getCachedReferenceTables(pool, 2025);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await getCachedReferenceTables(pool, 2025);
  assert.equal(state.queryCount, 20, 'TTL expiry triggers a fresh load');
});

test('concurrent callers during a miss share one in-flight load', async () => {
  const state = { queryCount: 0 };
  const pool = {
    query: async () => {
      state.queryCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { rows: [] };
    },
  } as unknown as Pool;

  await Promise.all([getCachedReferenceTables(pool, 2025), getCachedReferenceTables(pool, 2025), getCachedReferenceTables(pool, 2025)]);
  assert.equal(state.queryCount, 10, 'three concurrent misses collapse into one load');
});
