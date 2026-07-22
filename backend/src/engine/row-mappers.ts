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

/**
 * Pure row -> domain-entity mappers, shared between
 * resolve-reference-data.ts (per-member, always-live data) and
 * reference-cache.ts (per-benefit-year reference tables, cached — see
 * that file for why the split exists). Kept dependency-free of both so
 * neither has to import the other.
 */

function num(value: string | number | null): number {
  return typeof value === 'number' ? value : Number(value);
}
function numOrNull(value: string | number | null): number | null {
  return value === null ? null : num(value);
}

export function mapMember(row: Record<string, unknown>): Member {
  return {
    memberId: row.member_id as string,
    optionCode: row.option_code as string,
    status: row.status as string,
    joinDate: row.join_date as string,
    priorCoverMonths: row.prior_cover_months as number,
    dob: row.dob as string,
  };
}

export function mapOption(row: Record<string, unknown>): Option {
  return {
    optionCode: row.option_code as string,
    name: row.name as string,
    networkType: row.network_type as Option['networkType'],
    benefitYear: row.benefit_year as number,
  };
}

export function mapIcd10(row: Record<string, unknown>): Icd10 {
  return {
    code: row.code as string,
    description: row.description as string,
    isPmb: row.is_pmb as boolean,
    dtpId: (row.dtp_id as string | null) ?? null,
    cdlFlag: row.cdl_flag as boolean,
    hivFlag: row.hiv_flag as boolean,
  };
}

export function mapDtp(row: Record<string, unknown>): Dtp {
  return {
    dtpId: row.dtp_id as string,
    description: row.description as string,
    pmbLevelOfCare: row.pmb_level_of_care as string,
  };
}

export function mapTariff(row: Record<string, unknown>): Tariff {
  return {
    code: row.code as string,
    description: row.description as string,
    requiresPreauth: row.requires_preauth as boolean,
    category: row.category as string,
  };
}

export function mapNappi(row: Record<string, unknown>): Nappi {
  return {
    nappiCode: row.nappi_code as string,
    product: row.product as string,
    mplPrice: numOrNull(row.mpl_price as string | number | null),
    drpPrice: numOrNull(row.drp_price as string | number | null),
    formularyFlag: row.formulary_flag as boolean,
  };
}

export function mapModifier(row: Record<string, unknown>): Modifier {
  return { code: row.code as string, effectRule: row.effect_rule as string };
}

export function mapNetworkProvider(row: Record<string, unknown>): NetworkProvider {
  return {
    practiceNo: row.practice_no as string,
    providerType: row.provider_type as string,
    networkMembership: row.network_membership as string,
    optionScope: (row.option_scope as string[]) ?? [],
  };
}

export function mapBenefitLimit(row: Record<string, unknown>): BenefitLimit {
  return {
    optionCode: row.option_code as string,
    benefitType: row.benefit_type as string,
    subLimit: num(row.sub_limit as string | number),
    basis: row.basis as BenefitLimit['basis'],
    benefitYear: row.benefit_year as number,
  };
}

export function mapBenefitBalance(row: Record<string, unknown>): BenefitBalance {
  return {
    memberId: row.member_id as string,
    benefitType: row.benefit_type as string,
    used: num(row.used as string | number),
    available: num(row.available as string | number),
    benefitYear: row.benefit_year as number,
  };
}

export function mapCoPaymentRule(row: Record<string, unknown>): CoPaymentRule {
  return {
    triggerCode: row.trigger_code as string,
    optionCode: row.option_code as string,
    amountOrPct: num(row.amount_or_pct as string | number),
    basis: row.basis as CoPaymentRule['basis'],
    benefitYear: row.benefit_year as number,
  };
}

export function mapWaitingPeriodRule(row: Record<string, unknown>): WaitingPeriodRule {
  return {
    scenario: row.scenario as string,
    gwpMonths: row.gwp_months as number,
    cswpMonths: row.cswp_months as number,
    pmbCovered: row.pmb_covered as boolean,
    benefitYear: row.benefit_year as number,
  };
}
