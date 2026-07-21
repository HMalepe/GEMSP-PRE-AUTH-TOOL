import type { Pool } from 'pg';

/**
 * Backs Screen 1's autocomplete fields (Implementation Companion §C.2:
 * "Every code field autocompletes from reference data — no free-text
 * code entry") and the member lookup that auto-fills option/status.
 * Read-only, small result sets — no pagination beyond a hard LIMIT.
 */

const SEARCH_LIMIT = 20;

export interface Icd10SearchResult {
  code: string;
  description: string;
  isPmb: boolean;
  cdlFlag: boolean;
}

export async function searchIcd10(pool: Pool, query: string, benefitYear: number): Promise<Icd10SearchResult[]> {
  const { rows } = await pool.query(
    `SELECT code, description, is_pmb, cdl_flag FROM icd10
     WHERE benefit_year = $1 AND (code ILIKE $2 OR description ILIKE $2)
     ORDER BY code LIMIT ${SEARCH_LIMIT}`,
    [benefitYear, `%${query}%`],
  );
  return rows.map((r) => ({ code: r.code, description: r.description, isPmb: r.is_pmb, cdlFlag: r.cdl_flag }));
}

export interface TariffSearchResult {
  code: string;
  description: string;
  requiresPreauth: boolean;
  category: string;
}

export async function searchTariff(pool: Pool, query: string, benefitYear: number): Promise<TariffSearchResult[]> {
  const { rows } = await pool.query(
    `SELECT code, description, requires_preauth, category FROM tariff
     WHERE benefit_year = $1 AND (code ILIKE $2 OR description ILIKE $2)
     ORDER BY code LIMIT ${SEARCH_LIMIT}`,
    [benefitYear, `%${query}%`],
  );
  return rows.map((r) => ({ code: r.code, description: r.description, requiresPreauth: r.requires_preauth, category: r.category }));
}

export interface NappiSearchResult {
  nappiCode: string;
  product: string;
  formularyFlag: boolean;
}

export async function searchNappi(pool: Pool, query: string, benefitYear: number): Promise<NappiSearchResult[]> {
  const { rows } = await pool.query(
    `SELECT nappi_code, product, formulary_flag FROM nappi
     WHERE benefit_year = $1 AND (nappi_code ILIKE $2 OR product ILIKE $2)
     ORDER BY nappi_code LIMIT ${SEARCH_LIMIT}`,
    [benefitYear, `%${query}%`],
  );
  return rows.map((r) => ({ nappiCode: r.nappi_code, product: r.product, formularyFlag: r.formulary_flag }));
}

export interface NetworkProviderSearchResult {
  practiceNo: string;
  providerType: string;
  networkMembership: string;
}

export async function searchNetworkProvider(pool: Pool, query: string, benefitYear: number): Promise<NetworkProviderSearchResult[]> {
  const { rows } = await pool.query(
    `SELECT practice_no, provider_type, network_membership FROM network_provider
     WHERE benefit_year = $1 AND (practice_no ILIKE $2 OR provider_type ILIKE $2)
     ORDER BY practice_no LIMIT ${SEARCH_LIMIT}`,
    [benefitYear, `%${query}%`],
  );
  return rows.map((r) => ({ practiceNo: r.practice_no, providerType: r.provider_type, networkMembership: r.network_membership }));
}

export interface ModifierSearchResult {
  code: string;
  effectRule: string;
}

export async function searchModifier(pool: Pool, query: string, benefitYear: number): Promise<ModifierSearchResult[]> {
  const { rows } = await pool.query(
    `SELECT code, effect_rule FROM modifier
     WHERE benefit_year = $1 AND (code ILIKE $2 OR effect_rule ILIKE $2)
     ORDER BY code LIMIT ${SEARCH_LIMIT}`,
    [benefitYear, `%${query}%`],
  );
  return rows.map((r) => ({ code: r.code, effectRule: r.effect_rule }));
}

export interface MemberLookupResult {
  memberId: string;
  optionCode: string;
  optionName: string | null;
  status: string;
  joinDate: string;
  priorCoverMonths: number;
  dob: string;
  benefitYear: number;
}

/** Auto-fills Screen 1's member section (Companion §C.2: "Lookup -> auto-fills option, status, benefit-year; shows active/suspended badge"). */
export async function getMember(pool: Pool, memberId: string, benefitYear: number): Promise<MemberLookupResult | undefined> {
  const { rows } = await pool.query(
    `SELECT m.member_id, m.option_code, o.name AS option_name, m.status, m.join_date, m.prior_cover_months, m.dob
     FROM member m
     LEFT JOIN option o ON o.option_code = m.option_code AND o.benefit_year = $2
     WHERE m.member_id = $1`,
    [memberId, benefitYear],
  );
  const row = rows[0];
  if (!row) {
    return undefined;
  }
  return {
    memberId: row.member_id,
    optionCode: row.option_code,
    optionName: row.option_name,
    status: row.status,
    joinDate: row.join_date,
    priorCoverMonths: row.prior_cover_months,
    dob: row.dob,
    benefitYear,
  };
}
