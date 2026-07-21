import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type {
  BenefitBalance,
  BenefitLimit,
  CoPaymentRule,
  Dtp,
  Icd10,
  Member,
  Modifier,
  Nappi,
  NetworkProvider,
  Option,
  Tariff,
  WaitingPeriodRule,
} from '../domain/entities.js';
import { benefitYearFromServiceDate } from './date-utils.js';
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

function num(value: string | number | null): number {
  return typeof value === 'number' ? value : Number(value);
}
function numOrNull(value: string | number | null): number | null {
  return value === null ? null : num(value);
}

function mapMember(row: Record<string, unknown>): Member {
  return {
    memberId: row.member_id as string,
    optionCode: row.option_code as string,
    status: row.status as string,
    joinDate: row.join_date as string,
    priorCoverMonths: row.prior_cover_months as number,
    dob: row.dob as string,
  };
}

function mapOption(row: Record<string, unknown>): Option {
  return {
    optionCode: row.option_code as string,
    name: row.name as string,
    networkType: row.network_type as Option['networkType'],
    benefitYear: row.benefit_year as number,
  };
}

function mapIcd10(row: Record<string, unknown>): Icd10 {
  return {
    code: row.code as string,
    description: row.description as string,
    isPmb: row.is_pmb as boolean,
    dtpId: (row.dtp_id as string | null) ?? null,
    cdlFlag: row.cdl_flag as boolean,
  };
}

function mapDtp(row: Record<string, unknown>): Dtp {
  return {
    dtpId: row.dtp_id as string,
    description: row.description as string,
    pmbLevelOfCare: row.pmb_level_of_care as string,
  };
}

function mapTariff(row: Record<string, unknown>): Tariff {
  return {
    code: row.code as string,
    description: row.description as string,
    requiresPreauth: row.requires_preauth as boolean,
    category: row.category as string,
  };
}

function mapNappi(row: Record<string, unknown>): Nappi {
  return {
    nappiCode: row.nappi_code as string,
    product: row.product as string,
    mplPrice: numOrNull(row.mpl_price as string | number | null),
    drpPrice: numOrNull(row.drp_price as string | number | null),
    formularyFlag: row.formulary_flag as boolean,
  };
}

function mapModifier(row: Record<string, unknown>): Modifier {
  return { code: row.code as string, effectRule: row.effect_rule as string };
}

function mapNetworkProvider(row: Record<string, unknown>): NetworkProvider {
  return {
    practiceNo: row.practice_no as string,
    providerType: row.provider_type as string,
    networkMembership: row.network_membership as string,
    optionScope: (row.option_scope as string[]) ?? [],
  };
}

function mapBenefitLimit(row: Record<string, unknown>): BenefitLimit {
  return {
    optionCode: row.option_code as string,
    benefitType: row.benefit_type as string,
    subLimit: num(row.sub_limit as string | number),
    basis: row.basis as BenefitLimit['basis'],
    benefitYear: row.benefit_year as number,
  };
}

function mapBenefitBalance(row: Record<string, unknown>): BenefitBalance {
  return {
    memberId: row.member_id as string,
    benefitType: row.benefit_type as string,
    used: num(row.used as string | number),
    available: num(row.available as string | number),
    benefitYear: row.benefit_year as number,
  };
}

function mapCoPaymentRule(row: Record<string, unknown>): CoPaymentRule {
  return {
    triggerCode: row.trigger_code as string,
    optionCode: row.option_code as string,
    amountOrPct: num(row.amount_or_pct as string | number),
    basis: row.basis as CoPaymentRule['basis'],
    benefitYear: row.benefit_year as number,
  };
}

function mapWaitingPeriodRule(row: Record<string, unknown>): WaitingPeriodRule {
  return {
    scenario: row.scenario as string,
    gwpMonths: row.gwp_months as number,
    cswpMonths: row.cswp_months as number,
    pmbCovered: row.pmb_covered as boolean,
    benefitYear: row.benefit_year as number,
  };
}

/**
 * Resolves an AuthRequest into the fully-materialised ReferenceData bundle
 * the (pure) gates need — this is the only impure piece of Layer A.
 * Member and option are the two things a request cannot proceed without;
 * everything else is left undefined when not found, matching how the
 * gates already treat missing codes (Gate 2 routes on a missing ICD-10,
 * Gate 6 treats a missing provider as non-network, etc.) rather than
 * duplicating that judgment here.
 */
export async function resolveReferenceData(pool: Pool, request: AuthRequest): Promise<ReferenceData> {
  const benefitYear = benefitYearFromServiceDate(request.serviceDate);

  const memberResult = await pool.query('SELECT * FROM member WHERE member_id = $1', [request.memberId]);
  const memberRow = memberResult.rows[0];
  if (!memberRow) {
    throw new ReferenceDataError(`member ${request.memberId} not found`, 'MEMBER_NOT_FOUND');
  }
  const member = mapMember(memberRow);

  const optionResult = await pool.query('SELECT * FROM option WHERE option_code = $1 AND benefit_year = $2', [
    member.optionCode,
    benefitYear,
  ]);
  const optionRow = optionResult.rows[0];
  if (!optionRow) {
    throw new ReferenceDataError(`option ${member.optionCode} not found for benefit year ${benefitYear}`, 'OPTION_NOT_FOUND');
  }
  const option = mapOption(optionRow);

  const icd10Result = await pool.query('SELECT * FROM icd10 WHERE code = $1 AND benefit_year = $2', [
    request.icd10Code,
    benefitYear,
  ]);
  const icd10 = icd10Result.rows[0] ? mapIcd10(icd10Result.rows[0]) : undefined;

  const dtpResult = icd10?.dtpId
    ? await pool.query('SELECT * FROM dtp WHERE dtp_id = $1 AND benefit_year = $2', [icd10.dtpId, benefitYear])
    : undefined;
  const dtp = dtpResult?.rows[0] ? mapDtp(dtpResult.rows[0]) : undefined;

  const tariffResult = await pool.query('SELECT * FROM tariff WHERE code = $1 AND benefit_year = $2', [
    request.tariffCode,
    benefitYear,
  ]);
  const tariff = tariffResult.rows[0] ? mapTariff(tariffResult.rows[0]) : undefined;

  const nappiResult = request.nappiCode
    ? await pool.query('SELECT * FROM nappi WHERE nappi_code = $1 AND benefit_year = $2', [request.nappiCode, benefitYear])
    : undefined;
  const nappi = nappiResult?.rows[0] ? mapNappi(nappiResult.rows[0]) : undefined;

  const modifierResult = request.modifierCode
    ? await pool.query('SELECT * FROM modifier WHERE code = $1 AND benefit_year = $2', [request.modifierCode, benefitYear])
    : undefined;
  const modifier = modifierResult?.rows[0] ? mapModifier(modifierResult.rows[0]) : undefined;

  const networkProviderResult = request.practiceNo
    ? await pool.query('SELECT * FROM network_provider WHERE practice_no = $1 AND benefit_year = $2', [
        request.practiceNo,
        benefitYear,
      ])
    : undefined;
  const networkProvider = networkProviderResult?.rows[0] ? mapNetworkProvider(networkProviderResult.rows[0]) : undefined;

  const benefitLimitsResult = await pool.query('SELECT * FROM benefit_limit WHERE option_code = $1 AND benefit_year = $2', [
    option.optionCode,
    benefitYear,
  ]);
  const benefitBalancesResult = await pool.query('SELECT * FROM benefit_balance WHERE member_id = $1 AND benefit_year = $2', [
    member.memberId,
    benefitYear,
  ]);
  const coPaymentRulesResult = await pool.query('SELECT * FROM co_payment_rule WHERE option_code = $1 AND benefit_year = $2', [
    option.optionCode,
    benefitYear,
  ]);
  const waitingPeriodRulesResult = await pool.query('SELECT * FROM waiting_period_rule WHERE benefit_year = $1', [
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
    benefitLimits: benefitLimitsResult.rows.map(mapBenefitLimit),
    benefitBalances: benefitBalancesResult.rows.map(mapBenefitBalance),
    coPaymentRules: coPaymentRulesResult.rows.map(mapCoPaymentRule),
    waitingPeriodRules: waitingPeriodRulesResult.rows.map(mapWaitingPeriodRule),
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
