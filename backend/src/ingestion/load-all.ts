import { closePool, getPool } from '../db/pool.js';
import type { LoadFixtureResult } from './dataset.js';
import { loadBenefitBalanceFixtures } from './loaders/benefit-balance.js';
import { loadBenefitLimitFixtures } from './loaders/benefit-limit.js';
import { loadCoPaymentRuleFixtures } from './loaders/co-payment-rule.js';
import { loadDtpFixtures } from './loaders/dtp.js';
import { loadIcd10Fixtures } from './loaders/icd10.js';
import { loadModifierFixtures } from './loaders/modifier.js';
import { loadNappiFixtures } from './loaders/nappi.js';
import { loadNetworkProviderFixtures } from './loaders/network-provider.js';
import { loadOptionFixtures } from './loaders/option.js';
import { loadTariffFixtures } from './loaders/tariff.js';
import { loadWaitingPeriodRuleFixtures } from './loaders/waiting-period-rule.js';

/**
 * Loads every fixture dataset in dependency order:
 * option and dtp have no FK dependencies and must come before anything
 * that references them (benefit_limit, co_payment_rule -> option;
 * icd10 -> dtp). benefit_balance depends on member rows existing —
 * run db/seed/001-fixture-members.sql first (`npm run db:seed`).
 *
 * This is placeholder-data plumbing to prove the ingestion framework
 * works end to end, not a real Phase-0 load.
 */
async function main(): Promise<void> {
  const pool = getPool();
  const benefitYear = 2025;

  const steps: [string, () => Promise<LoadFixtureResult>][] = [
    ['option', () => loadOptionFixtures(pool, benefitYear)],
    ['dtp', () => loadDtpFixtures(pool, benefitYear)],
    ['icd10', () => loadIcd10Fixtures(pool, benefitYear)],
    ['tariff', () => loadTariffFixtures(pool, benefitYear)],
    ['nappi', () => loadNappiFixtures(pool, benefitYear)],
    ['modifier', () => loadModifierFixtures(pool, benefitYear)],
    ['network_provider', () => loadNetworkProviderFixtures(pool, benefitYear)],
    ['benefit_limit', () => loadBenefitLimitFixtures(pool, benefitYear)],
    ['co_payment_rule', () => loadCoPaymentRuleFixtures(pool, benefitYear)],
    ['waiting_period_rule', () => loadWaitingPeriodRuleFixtures(pool, benefitYear)],
    ['benefit_balance', () => loadBenefitBalanceFixtures(pool, benefitYear)],
  ];

  for (const [name, run] of steps) {
    const result = await run();
    if (result.validation === 'ALREADY_PROMOTED') {
      console.log(`${name}: already promoted (rule_version=${result.ruleVersionId}), skipped`);
      continue;
    }
    if (result.validation.invalidRows > 0) {
      console.log(`${name}: ${result.validation.invalidRows}/${result.validation.totalRows} row(s) failed validation, not promoted (rule_version=${result.ruleVersionId})`);
      continue;
    }
    console.log(`${name}: promoted ${result.promotedRows} row(s), rule_version=${result.ruleVersionId}`);
  }
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exitCode = 1;
  });
