import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { benefitYearFromServiceDate } from './date-utils.js';
import { getCachedReferenceTables } from './reference-cache.js';
import { mapBenefitBalance, mapMember } from './row-mappers.js';
import type { AuthRequest, ReferenceData } from './types.js';

export class ReferenceDataError extends Error {
  constructor(
    message: string,
    public readonly code: 'MEMBER_NOT_FOUND' | 'OPTION_NOT_FOUND',
  ) {
    super(message);
    this.name = 'ReferenceDataError';
  }
}

/**
 * Resolves an AuthRequest into the fully-materialised ReferenceData bundle
 * the (pure) gates need — this is the only impure piece of Layer A.
 *
 * Every *reference* table (icd10/tariff/nappi/modifier/network_provider/
 * option/benefit_limit/co_payment_rule/waiting_period_rule) comes from the
 * in-memory reference-cache (Technical Build Spec §6: "< 500ms p95,
 * in-memory reference data") — those change only on a rules promotion, not
 * per-request. member and benefit_balance are transactional per-member
 * data and are always queried live, in parallel with the cache lookup.
 *
 * Member and option are the two things a request cannot proceed without;
 * everything else is left undefined when not found, matching how the
 * gates already treat missing codes (Gate 2 routes on a missing ICD-10,
 * Gate 6 treats a missing provider as non-network, etc.) rather than
 * duplicating that judgment here.
 */
export async function resolveReferenceData(pool: Pool, request: AuthRequest): Promise<ReferenceData> {
  const benefitYear = benefitYearFromServiceDate(request.serviceDate);

  const [memberResult, tables] = await Promise.all([
    pool.query('SELECT * FROM member WHERE member_id = $1', [request.memberId]),
    getCachedReferenceTables(pool, benefitYear),
  ]);
  const memberRow = memberResult.rows[0];
  if (!memberRow) {
    throw new ReferenceDataError(`member ${request.memberId} not found`, 'MEMBER_NOT_FOUND');
  }
  const member = mapMember(memberRow);

  const option = tables.optionByCode.get(member.optionCode);
  if (!option) {
    throw new ReferenceDataError(`option ${member.optionCode} not found for benefit year ${benefitYear}`, 'OPTION_NOT_FOUND');
  }

  const icd10 = tables.icd10ByCode.get(request.icd10Code);
  const dtp = icd10?.dtpId ? tables.dtpById.get(icd10.dtpId) : undefined;
  const tariff = tables.tariffByCode.get(request.tariffCode);
  const nappi = request.nappiCode ? tables.nappiByCode.get(request.nappiCode) : undefined;
  const modifier = request.modifierCode ? tables.modifierByCode.get(request.modifierCode) : undefined;
  const networkProvider = request.practiceNo ? tables.networkProviderByPracticeNo.get(request.practiceNo) : undefined;

  const benefitBalancesResult = await pool.query('SELECT * FROM benefit_balance WHERE member_id = $1 AND benefit_year = $2', [
    member.memberId,
    benefitYear,
  ]);

  return {
    benefitYear,
    member,
    option,
    icd10,
    dtp,
    tariff,
    nappi,
    modifier,
    networkProvider,
    benefitLimits: tables.benefitLimitsByOption.get(option.optionCode) ?? [],
    benefitBalances: benefitBalancesResult.rows.map(mapBenefitBalance),
    coPaymentRules: tables.coPaymentRulesByOption.get(option.optionCode) ?? [],
    waitingPeriodRules: tables.waitingPeriodRules,
  };
}

/**
 * A short, reproducible rules_version tag (Technical Build Spec §4.3
 * shows e.g. "2025.3") derived from every dataset PROMOTED for this
 * benefit year — changes whenever any dataset gets re-promoted with
 * different content, giving real traceability without the verbosity of
 * listing every rule_version_id.
 */
export async function resolveRulesVersion(pool: Pool, benefitYear: number): Promise<string> {
  const { rows } = await pool.query<{ dataset: string; checksum: string }>(
    `SELECT dataset, checksum FROM rule_version WHERE benefit_year = $1 AND status = 'PROMOTED' ORDER BY dataset`,
    [benefitYear],
  );
  const material = rows.map((r) => `${r.dataset}:${r.checksum}`).join('|');
  const hash = crypto.createHash('sha256').update(material).digest('hex').slice(0, 8);
  return `${benefitYear}.${hash}`;
}
