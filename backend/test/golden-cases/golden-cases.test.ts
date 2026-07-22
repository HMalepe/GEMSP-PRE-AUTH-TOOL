import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  BenefitBalance,
  BenefitLimit,
  CoPaymentRule,
  Dtp,
  Icd10,
  Member,
  Nappi,
  NetworkProvider,
  Option,
  Tariff,
  WaitingPeriodRule,
} from '../../src/domain/entities.js';
import { evaluateAuthorisation } from '../../src/engine/index.js';
import type { AuthRequest, ReferenceData } from '../../src/engine/types.js';

/**
 * The golden-case regression suite (Technical Build Spec §8.1). Every
 * case builds its own self-contained ReferenceData — gates are pure, so
 * no database is needed to run these. A rules change that breaks any one
 * of these must fail CI.
 */

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    memberId: 'M-TEST',
    optionCode: 'BERYL',
    status: 'ACTIVE',
    joinDate: '2015-01-01',
    priorCoverMonths: 120,
    dob: '1980-01-01',
    ...overrides,
  };
}

function makeOption(overrides: Partial<Option> = {}): Option {
  return { optionCode: 'BERYL', name: 'Beryl', networkType: 'OPEN', benefitYear: 2025, ...overrides };
}

function makeIcd10(overrides: Partial<Icd10> = {}): Icd10 {
  return {
    code: 'M17.1',
    description: 'Other unilateral primary osteoarthritis of knee',
    isPmb: false,
    dtpId: null,
    cdlFlag: false,
    hivFlag: false,
    ...overrides,
  };
}

function makeTariff(overrides: Partial<Tariff> = {}): Tariff {
  return { code: 'TARIFF-001', description: 'Test procedure', requiresPreauth: true, category: 'SURGICAL_PROCEDURES', ...overrides };
}

function makeNetworkProvider(overrides: Partial<NetworkProvider> = {}): NetworkProvider {
  return { practiceNo: 'PROV-001', providerType: 'hospital', networkMembership: 'DSP', optionScope: [], ...overrides };
}

function makeBenefitLimit(overrides: Partial<BenefitLimit> = {}): BenefitLimit {
  return { optionCode: 'BERYL', benefitType: 'SURGICAL_PROCEDURES', subLimit: 100000, basis: 'PFPA', benefitYear: 2025, ...overrides };
}

function makeBenefitBalance(overrides: Partial<BenefitBalance> = {}): BenefitBalance {
  return { memberId: 'M-TEST', benefitType: 'SURGICAL_PROCEDURES', used: 0, available: 100000, benefitYear: 2025, ...overrides };
}

function makeWaitingPeriodRules(benefitYear = 2025): WaitingPeriodRule[] {
  return [
    { scenario: 'NO_COVER_90_DAYS_S29A_1', gwpMonths: 3, cswpMonths: 12, pmbCovered: false, benefitYear },
    { scenario: 'PRIOR_COVER_LE_24M_GAP_LT_90D_S29A_2', gwpMonths: 0, cswpMonths: 12, pmbCovered: true, benefitYear },
    { scenario: 'PRIOR_COVER_GT_24M_GAP_LT_90D_S29A_3', gwpMonths: 3, cswpMonths: 0, pmbCovered: true, benefitYear },
  ];
}

function makeRequest(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    memberId: 'M-TEST',
    icd10Code: 'M17.1',
    tariffCode: 'TARIFF-001',
    serviceDate: '2025-06-01',
    setting: 'IN_HOSPITAL',
    ...overrides,
  };
}

function evaluate(request: AuthRequest, ref: ReferenceData) {
  return evaluateAuthorisation({ authId: 'test-auth-id', request, ref, rulesVersion: 'test-1.0' });
}

test('1. Clean PMB approve: active member, PMB ICD-10, DSP, protocol met -> APPROVE, RISK_PMB, R0', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ isPmb: true, dtpId: 'DTP-1' }),
    dtp: { dtpId: 'DTP-1', description: 'Test PMB DTP', pmbLevelOfCare: 'Level 1 public hospital equivalent' },
    tariff: makeTariff(),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit()],
    benefitBalances: [makeBenefitBalance({ available: 50000 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest(), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.fundingSource, 'RISK_PMB');
  assert.equal(decision.coPayment, null, 'R0 co-payment means no co_payment object, not a zero-amount one');
});

test('2. Non-network hospital: elective, non-network facility, TZ1 -> APPROVE + R15,000 co-pay', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember({ optionCode: 'TANZANITE_ONE' }),
    option: makeOption({ optionCode: 'TANZANITE_ONE', name: 'Tanzanite One', networkType: 'NETWORK' }),
    icd10: makeIcd10({ isPmb: false }),
    tariff: makeTariff(),
    networkProvider: makeNetworkProvider({ networkMembership: 'NON_DSP' }),
    benefitLimits: [makeBenefitLimit({ optionCode: 'TANZANITE_ONE' })],
    benefitBalances: [makeBenefitBalance({ available: 50000 })],
    coPaymentRules: [
      { triggerCode: 'NON_NETWORK_HOSPITAL', optionCode: 'TANZANITE_ONE', amountOrPct: 15000, basis: 'AMOUNT', benefitYear: 2025 },
    ],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest(), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.coPayment?.amount, 15000);
});

test('3. Elective scope 2026: gastroscopy, acute hospital -> APPROVE + R1,000 co-pay', () => {
  const ref: ReferenceData = {
    benefitYear: 2026,
    member: makeMember(),
    option: makeOption({ benefitYear: 2026 }),
    icd10: makeIcd10({ isPmb: false }),
    tariff: makeTariff({ code: 'GASTRO-01', category: 'endoscopy' }),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit({ benefitType: 'endoscopy', benefitYear: 2026 })],
    benefitBalances: [makeBenefitBalance({ benefitType: 'endoscopy', available: 20000, benefitYear: 2026 })],
    coPaymentRules: [
      { triggerCode: 'ELECTIVE_GASTRO_COLONOSCOPY_2026', optionCode: 'BERYL', amountOrPct: 1000, basis: 'AMOUNT', benefitYear: 2026 },
    ],
    waitingPeriodRules: makeWaitingPeriodRules(2026),
  };

  const decision = evaluate(makeRequest({ tariffCode: 'GASTRO-01', serviceDate: '2026-03-01' }), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.coPayment?.amount, 1000);
});

test('4. Waiting period block: new member <90 days prior cover, non-PMB -> DECLINE (waiting window)', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember({ priorCoverMonths: 0, joinDate: '2025-05-01' }), // joined 1 month before service date
    option: makeOption(),
    icd10: makeIcd10({ isPmb: false }),
    tariff: makeTariff(),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit()],
    benefitBalances: [makeBenefitBalance({ available: 50000 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest({ serviceDate: '2025-06-01' }), ref);

  assert.equal(decision.decision, 'DECLINE');
  assert.ok(decision.reasons.some((r) => /waiting period/.test(r)));
});

test('5. Late joiner: age 50, 5 yrs cover -> APPROVE + LJP 0.25x flagged', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember({
      dob: '1975-01-01', // 50 on the 2025-01-01 join date below
      joinDate: '2025-01-01',
      priorCoverMonths: 60, // 5 years
    }),
    option: makeOption(),
    icd10: makeIcd10({ isPmb: false }),
    tariff: makeTariff(),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit()],
    benefitBalances: [makeBenefitBalance({ available: 50000 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  // Service date well past the GWP window so the waiting-period check itself passes.
  const decision = evaluate(makeRequest({ serviceDate: '2025-08-01' }), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.ok(decision.reasons.some((r) => /late joiner penalty 0\.25x flagged/.test(r)), decision.reasons.join(' | '));
});

test('6. Out-of-formulary med: non-formulary chronic (CDL) drug -> APPROVE + 30% OF co-pay', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ code: 'E11.9', description: 'Type 2 diabetes mellitus', isPmb: true, cdlFlag: true }),
    tariff: makeTariff({ category: 'chronic_medicine' }),
    nappi: { nappiCode: 'N-OF-1', product: 'Non-formulary chronic drug', mplPrice: 500, drpPrice: null, formularyFlag: false },
    networkProvider: makeNetworkProvider(),
    benefitLimits: [],
    benefitBalances: [],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest({ nappiCode: 'N-OF-1', quotedAmount: 500, setting: 'OUT_HOSPITAL' }), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.coPayment?.amount, 150);
  assert.match(decision.coPayment?.reason ?? '', /out-of-formulary/);
});

test('7. Motivation needed: off-protocol high-cost drug -> ROUTE to Layer B', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ isPmb: false, cdlFlag: false }),
    tariff: makeTariff({ category: 'medicine' }),
    nappi: { nappiCode: 'N-HC-1', product: 'High-cost specialised drug', mplPrice: 50000, drpPrice: null, formularyFlag: false },
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit({ benefitType: 'medicine' })],
    benefitBalances: [makeBenefitBalance({ benefitType: 'medicine', available: 10000 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest({ nappiCode: 'N-HC-1', setting: 'OUT_HOSPITAL' }), ref);

  assert.equal(decision.decision, 'ROUTE');
  assert.ok(decision.reasons.some((r) => /requires clinical motivation/.test(r)), decision.reasons.join(' | '));
});

test('8. Limit exhausted, PMB: oncology past rand limit, PMB dx -> APPROVE at PMB level of care', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ code: 'C50.9', description: 'Malignant neoplasm of breast', isPmb: true, dtpId: 'DTP-ONC' }),
    dtp: { dtpId: 'DTP-ONC', description: 'Oncology PMB', pmbLevelOfCare: 'Level 2 specialist oncology unit' },
    tariff: makeTariff({ category: 'ONCOLOGY' }),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit({ benefitType: 'ONCOLOGY' })],
    benefitBalances: [makeBenefitBalance({ benefitType: 'ONCOLOGY', used: 292135, available: 0 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest(), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.fundingSource, 'RISK_PMB');
  assert.ok(
    decision.reasons.some((r) => /PMB entitlement/.test(r) && /Level 2 specialist oncology unit/.test(r)),
    decision.reasons.join(' | '),
  );
});

test('9. Benefit exhausted, non-PMB: day-to-day depleted, non-PMB -> DECLINE', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ isPmb: false }),
    tariff: makeTariff({ category: 'DAY_TO_DAY' }),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit({ benefitType: 'DAY_TO_DAY' })],
    benefitBalances: [makeBenefitBalance({ benefitType: 'DAY_TO_DAY', used: 5000, available: 0 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest(), ref);

  assert.equal(decision.decision, 'DECLINE');
  assert.ok(decision.reasons.some((r) => /exhausted, non-PMB/.test(r)));
});

test('10. Bad ICD/procedure pair: ICD-10 code does not resolve -> ROUTE', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    // icd10 intentionally omitted — simulates a code that isn't codable against our reference data.
    tariff: makeTariff(),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit()],
    benefitBalances: [makeBenefitBalance({ available: 50000 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest({ icd10Code: 'BAD-CODE' }), ref);

  assert.equal(decision.decision, 'ROUTE');
});

/**
 * Cases 11-18 extend coverage to every pathway named in the Rules-Engine
 * Spec's decision-object examples beyond the original 10 baseline cases:
 * PMB sourced from CDL alone (no DTP), a non-PMB chronic (Annexure D
 * "additional") condition, oncology's two-tier general/specialised-drug
 * sub-limits, and the HIV/AIDS CDL pathway (docs/gems-annexures-
 * compilation.md §4/§6). Technical Build Spec §8.1.
 */

test('11. PMB via CDL only (no DTP): chronic diagnosis, day-to-day chronic benefit exhausted -> APPROVE at PMB entitlement', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ code: 'E11.9', description: 'Type 2 diabetes mellitus', isPmb: true, dtpId: null, cdlFlag: true }),
    tariff: makeTariff({ category: 'CHRONIC_MEDICINE' }),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit({ benefitType: 'CHRONIC_MEDICINE' })],
    benefitBalances: [makeBenefitBalance({ benefitType: 'CHRONIC_MEDICINE', used: 4429, available: 0 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest(), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.fundingSource, 'RISK_PMB');
  assert.ok(decision.reasons.some((r) => /PMB entitlement/.test(r)), decision.reasons.join(' | '));
});

test('12. Chronic non-PMB (Annexure D "additional" condition): cdl_flag true but not PMB, benefit exhausted -> DECLINE', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    // cdl_flag=true (it's on an option's additional chronic list) but is_pmb=false — the two flags are independent; only is_pmb unlocks Gate 4's override.
    icd10: makeIcd10({ code: 'M06.9', description: 'Rheumatoid arthritis, unspecified', isPmb: false, dtpId: null, cdlFlag: true }),
    tariff: makeTariff({ category: 'CHRONIC_MEDICINE' }),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit({ benefitType: 'CHRONIC_MEDICINE' })],
    benefitBalances: [makeBenefitBalance({ benefitType: 'CHRONIC_MEDICINE', used: 4429, available: 0 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest(), ref);

  assert.equal(decision.decision, 'DECLINE');
  assert.ok(decision.reasons.some((r) => /exhausted, non-PMB/.test(r)));
});

test('13. Oncology specialised-drug sub-limit available -> APPROVE, RISK_PMB, R0', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ code: 'C50.9', description: 'Malignant neoplasm of breast', isPmb: true, dtpId: 'DTP-ONC2' }),
    dtp: { dtpId: 'DTP-ONC2', description: 'Oncology PMB — specialised/biological drugs', pmbLevelOfCare: 'Level 2 specialist oncology unit' },
    tariff: makeTariff({ category: 'ONCOLOGY_SPECIALISED_DRUGS' }),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit({ benefitType: 'ONCOLOGY_SPECIALISED_DRUGS' })],
    benefitBalances: [makeBenefitBalance({ benefitType: 'ONCOLOGY_SPECIALISED_DRUGS', used: 0, available: 50000 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest(), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.fundingSource, 'RISK_PMB');
  assert.equal(decision.coPayment, null);
});

test('14. Oncology specialised-drug sub-limit exhausted (general oncology limit untouched) -> APPROVE at PMB entitlement', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ code: 'C50.9', description: 'Malignant neoplasm of breast', isPmb: true, dtpId: 'DTP-ONC2' }),
    dtp: { dtpId: 'DTP-ONC2', description: 'Oncology PMB — specialised/biological drugs', pmbLevelOfCare: 'Level 2 specialist oncology unit' },
    tariff: makeTariff({ category: 'ONCOLOGY_SPECIALISED_DRUGS' }),
    networkProvider: makeNetworkProvider(),
    // Gate 4 checks the specific benefit_type this tariff resolves to, not
    // "any oncology limit" — a sibling general-oncology row with room left
    // does not rescue this: only the PMB override does.
    benefitLimits: [makeBenefitLimit({ benefitType: 'ONCOLOGY_SPECIALISED_DRUGS' }), makeBenefitLimit({ benefitType: 'ONCOLOGY', subLimit: 292135 })],
    benefitBalances: [
      makeBenefitBalance({ benefitType: 'ONCOLOGY_SPECIALISED_DRUGS', used: 336702, available: 0 }),
      makeBenefitBalance({ benefitType: 'ONCOLOGY', used: 0, available: 292135 }),
    ],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest(), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.fundingSource, 'RISK_PMB');
  assert.ok(
    decision.reasons.some((r) => /PMB entitlement/.test(r) && /Level 2 specialist oncology unit/.test(r)),
    decision.reasons.join(' | '),
  );
});

test('15. HIV/AIDS clean approve: formulary ART, DSP dispensing -> APPROVE, RISK_PMB, R0', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ code: 'B20', description: 'HIV disease', isPmb: true, dtpId: null, cdlFlag: true, hivFlag: true }),
    tariff: makeTariff({ category: 'CHRONIC_MEDICINE' }),
    nappi: { nappiCode: 'N-ART-1', product: 'PLACEHOLDER — antiretroviral (formulary)', mplPrice: 300, drpPrice: 300, formularyFlag: true },
    networkProvider: makeNetworkProvider(),
    benefitLimits: [],
    benefitBalances: [],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest({ nappiCode: 'N-ART-1', quotedAmount: 300, dispensingIsDsp: true, setting: 'OUT_HOSPITAL' }), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.fundingSource, 'RISK_PMB');
  assert.equal(decision.coPayment, null);
});

test('16. HIV/AIDS off-formulary ART -> APPROVE + 30% OF co-pay (same mechanism as case 6, HIV/CDL pathway)', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ code: 'B20', description: 'HIV disease', isPmb: true, dtpId: null, cdlFlag: true, hivFlag: true }),
    tariff: makeTariff({ category: 'CHRONIC_MEDICINE' }),
    nappi: { nappiCode: 'N-ART-OF-1', product: 'PLACEHOLDER — antiretroviral (off-formulary)', mplPrice: 400, drpPrice: null, formularyFlag: false },
    networkProvider: makeNetworkProvider(),
    benefitLimits: [],
    benefitBalances: [],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest({ nappiCode: 'N-ART-OF-1', quotedAmount: 400, setting: 'OUT_HOSPITAL' }), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.coPayment?.amount, 120);
  assert.match(decision.coPayment?.reason ?? '', /out-of-formulary/);
});

test('17. HIV/AIDS chronic medicine benefit exhausted -> APPROVE at PMB entitlement (PMB override applies uniformly, not just to oncology/DTP conditions)', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    member: makeMember(),
    option: makeOption(),
    icd10: makeIcd10({ code: 'B20', description: 'HIV disease', isPmb: true, dtpId: null, cdlFlag: true, hivFlag: true }),
    tariff: makeTariff({ category: 'CHRONIC_MEDICINE' }),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit({ benefitType: 'CHRONIC_MEDICINE' })],
    benefitBalances: [makeBenefitBalance({ benefitType: 'CHRONIC_MEDICINE', used: 4429, available: 0 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  const decision = evaluate(makeRequest(), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.fundingSource, 'RISK_PMB');
  assert.ok(decision.reasons.some((r) => /PMB entitlement/.test(r)), decision.reasons.join(' | '));
});

test('18. PMB within a waiting-period scenario that still covers PMB -> APPROVE, not declined (Gate 7 pmb_covered bypass)', () => {
  const ref: ReferenceData = {
    benefitYear: 2025,
    // >24 months' prior cover selects scenario S29A_3 (gwpMonths=3, pmbCovered=true).
    member: makeMember({ joinDate: '2025-04-01', priorCoverMonths: 30 }),
    option: makeOption(),
    icd10: makeIcd10({ isPmb: true, dtpId: 'DTP-1' }),
    dtp: { dtpId: 'DTP-1', description: 'Test PMB DTP', pmbLevelOfCare: 'Level 1 public hospital equivalent' },
    tariff: makeTariff(),
    networkProvider: makeNetworkProvider(),
    benefitLimits: [makeBenefitLimit()],
    benefitBalances: [makeBenefitBalance({ available: 50000 })],
    coPaymentRules: [],
    waitingPeriodRules: makeWaitingPeriodRules(),
  };

  // 2 months since joining — inside the scenario's 3-month GWP window. A
  // non-PMB request here would DECLINE (see case 4); this one must not.
  const decision = evaluate(makeRequest({ serviceDate: '2025-06-01' }), ref);

  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.fundingSource, 'RISK_PMB');
  assert.ok(
    decision.reasons.some((r) => /waiting period satisfied under PRIOR_COVER_GT_24M_GAP_LT_90D_S29A_3/.test(r)),
    decision.reasons.join(' | '),
  );
});
