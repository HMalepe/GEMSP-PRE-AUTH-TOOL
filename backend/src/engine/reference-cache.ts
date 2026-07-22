import type { Pool } from 'pg';
import type { BenefitLimit, CoPaymentRule, Dtp, Icd10, Modifier, Nappi, NetworkProvider, Option, Tariff, WaitingPeriodRule } from '../domain/entities.js';
import {
  mapBenefitLimit,
  mapCoPaymentRule,
  mapDtp,
  mapIcd10,
  mapModifier,
  mapNappi,
  mapNetworkProvider,
  mapOption,
  mapTariff,
  mapWaitingPeriodRule,
} from './row-mappers.js';

/**
 * In-memory cache of every *reference* table (rules-as-data, versioned by
 * benefit_year) needed to build a request's ReferenceData bundle —
 * Technical Build Spec §6 NFR: "Layer-A decision < 500ms p95 (in-memory
 * reference data)". Deliberately does NOT cache `member` or
 * `benefit_balance`: those are transactional, per-member, mutable rows
 * that must stay live on every request — only the shared, rarely-changing
 * catalog tables benefit from caching (the same 2025 ICD-10/tariff/co-pay
 * tables are read on every one of thousands of requests that year).
 *
 * A short TTL is the primary safety net for staleness; promoteRuleVersion
 * and rollbackRuleVersion (ingestion/pipeline.ts) additionally call
 * invalidateBenefitYear() explicitly so a data-load or rollback is visible
 * immediately, not after the TTL lapses.
 */
export interface CachedReferenceTables {
  icd10ByCode: Map<string, Icd10>;
  dtpById: Map<string, Dtp>;
  tariffByCode: Map<string, Tariff>;
  nappiByCode: Map<string, Nappi>;
  modifierByCode: Map<string, Modifier>;
  networkProviderByPracticeNo: Map<string, NetworkProvider>;
  optionByCode: Map<string, Option>;
  benefitLimitsByOption: Map<string, BenefitLimit[]>;
  coPaymentRulesByOption: Map<string, CoPaymentRule[]>;
  waitingPeriodRules: WaitingPeriodRule[];
  loadedAt: number;
}

const DEFAULT_TTL_MS = 60_000;

let ttlMs = DEFAULT_TTL_MS;
const cache = new Map<number, CachedReferenceTables>();
const inFlight = new Map<number, Promise<CachedReferenceTables>>();

/** Test/ops hook — production leaves this at the default. */
export function configureReferenceCacheTtlMs(ms: number): void {
  ttlMs = ms;
}

export function invalidateBenefitYear(benefitYear: number): void {
  cache.delete(benefitYear);
  inFlight.delete(benefitYear);
}

export function invalidateAllBenefitYears(): void {
  cache.clear();
  inFlight.clear();
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const existing = map.get(k);
    if (existing) {
      existing.push(row);
    } else {
      map.set(k, [row]);
    }
  }
  return map;
}

async function loadReferenceTables(pool: Pool, benefitYear: number): Promise<CachedReferenceTables> {
  const [icd10Result, dtpResult, tariffResult, nappiResult, modifierResult, networkProviderResult, optionResult, benefitLimitResult, coPaymentRuleResult, waitingPeriodRuleResult] =
    await Promise.all([
      pool.query('SELECT * FROM icd10 WHERE benefit_year = $1', [benefitYear]),
      pool.query('SELECT * FROM dtp WHERE benefit_year = $1', [benefitYear]),
      pool.query('SELECT * FROM tariff WHERE benefit_year = $1', [benefitYear]),
      pool.query('SELECT * FROM nappi WHERE benefit_year = $1', [benefitYear]),
      pool.query('SELECT * FROM modifier WHERE benefit_year = $1', [benefitYear]),
      pool.query('SELECT * FROM network_provider WHERE benefit_year = $1', [benefitYear]),
      pool.query('SELECT * FROM option WHERE benefit_year = $1', [benefitYear]),
      pool.query('SELECT * FROM benefit_limit WHERE benefit_year = $1', [benefitYear]),
      pool.query('SELECT * FROM co_payment_rule WHERE benefit_year = $1', [benefitYear]),
      pool.query('SELECT * FROM waiting_period_rule WHERE benefit_year = $1', [benefitYear]),
    ]);

  const benefitLimits = benefitLimitResult.rows.map(mapBenefitLimit);
  const coPaymentRules = coPaymentRuleResult.rows.map(mapCoPaymentRule);

  return {
    icd10ByCode: new Map(icd10Result.rows.map(mapIcd10).map((r) => [r.code, r])),
    dtpById: new Map(dtpResult.rows.map(mapDtp).map((r) => [r.dtpId, r])),
    tariffByCode: new Map(tariffResult.rows.map(mapTariff).map((r) => [r.code, r])),
    nappiByCode: new Map(nappiResult.rows.map(mapNappi).map((r) => [r.nappiCode, r])),
    modifierByCode: new Map(modifierResult.rows.map(mapModifier).map((r) => [r.code, r])),
    networkProviderByPracticeNo: new Map(networkProviderResult.rows.map(mapNetworkProvider).map((r) => [r.practiceNo, r])),
    optionByCode: new Map(optionResult.rows.map(mapOption).map((r) => [r.optionCode, r])),
    benefitLimitsByOption: groupBy(benefitLimits, (r) => r.optionCode),
    coPaymentRulesByOption: groupBy(coPaymentRules, (r) => r.optionCode),
    waitingPeriodRules: waitingPeriodRuleResult.rows.map(mapWaitingPeriodRule),
    loadedAt: Date.now(),
  };
}

/**
 * Returns the cached tables for a benefit year, loading (or reloading,
 * past TTL) from Postgres on a miss. Concurrent callers during a miss
 * share one in-flight load rather than issuing the same ten queries
 * redundantly — the common case at startup / right after an invalidation.
 */
export async function getCachedReferenceTables(pool: Pool, benefitYear: number): Promise<CachedReferenceTables> {
  const cached = cache.get(benefitYear);
  if (cached && Date.now() - cached.loadedAt < ttlMs) {
    return cached;
  }

  const pending = inFlight.get(benefitYear);
  if (pending) {
    return pending;
  }

  const load = loadReferenceTables(pool, benefitYear)
    .then((tables) => {
      cache.set(benefitYear, tables);
      inFlight.delete(benefitYear);
      return tables;
    })
    .catch((err) => {
      inFlight.delete(benefitYear);
      throw err;
    });
  inFlight.set(benefitYear, load);
  return load;
}
