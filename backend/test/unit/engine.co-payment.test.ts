import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aggregateCoPayments,
  computeCoPaymentAmount,
  evaluateFlatTriggers,
  evaluateMedicineCoPayment,
} from '../../src/engine/co-payment.js';
import type { CoPaymentRule, Member, Nappi, Option, Tariff } from '../../src/domain/entities.js';
import type { AuthRequest, ReferenceData } from '../../src/engine/types.js';

const MEMBER: Member = {
  memberId: 'M-TEST',
  optionCode: 'BERYL',
  status: 'ACTIVE',
  joinDate: '2015-01-01',
  priorCoverMonths: 120,
  dob: '1980-01-01',
};

function baseRef(overrides: Partial<ReferenceData> = {}): ReferenceData {
  return {
    benefitYear: 2025,
    member: MEMBER,
    option: { optionCode: 'BERYL', name: 'Beryl', networkType: 'OPEN', benefitYear: 2025 } satisfies Option,
    benefitLimits: [],
    benefitBalances: [],
    coPaymentRules: [],
    waitingPeriodRules: [],
    ...overrides,
  };
}

function baseRequest(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    memberId: 'M-TEST',
    icd10Code: 'M17.1',
    tariffCode: 'TARIFF-001',
    serviceDate: '2025-06-01',
    setting: 'IN_HOSPITAL',
    ...overrides,
  };
}

const AMOUNT_RULE: CoPaymentRule = {
  triggerCode: 'LATE_AUTH',
  optionCode: 'BERYL',
  amountOrPct: 1000,
  basis: 'AMOUNT',
  benefitYear: 2025,
};

const PCT_RULE: CoPaymentRule = {
  triggerCode: 'NON_DSP',
  optionCode: 'TANZANITE_ONE',
  amountOrPct: 30,
  basis: 'PCT',
  benefitYear: 2025,
};

test('computeCoPaymentAmount: AMOUNT basis ignores quotedAmount', () => {
  const result = computeCoPaymentAmount(AMOUNT_RULE, 99999, 'late auth');
  assert.equal(result.amount, 1000);
});

test('computeCoPaymentAmount: PCT basis with a quoted amount', () => {
  const result = computeCoPaymentAmount(PCT_RULE, 2000, 'no referral');
  assert.equal(result.amount, 600);
});

test('computeCoPaymentAmount: PCT basis with no quoted amount resolves to R0, not a guess', () => {
  const result = computeCoPaymentAmount(PCT_RULE, undefined, 'no referral');
  assert.equal(result.amount, 0);
  assert.match(result.reason, /no quoted amount/);
});

test('evaluateFlatTriggers: late auth fires under 48h notice, not for emergencies', () => {
  const ref = baseRef({ coPaymentRules: [AMOUNT_RULE] });
  const late = evaluateFlatTriggers(baseRequest({ preAuthLeadHours: 10 }), ref);
  assert.equal(late.length, 1);
  assert.equal(late[0]?.amount, 1000);

  const emergency = evaluateFlatTriggers(baseRequest({ preAuthLeadHours: 10, isEmergency: true }), ref);
  assert.equal(emergency.length, 0);

  const wellNotified = evaluateFlatTriggers(baseRequest({ preAuthLeadHours: 72 }), ref);
  assert.equal(wellNotified.length, 0);
});

test('evaluateFlatTriggers: elective gastroscopy 2026 rule only applies to endoscopy in-hospital from 2026', () => {
  const rule: CoPaymentRule = { triggerCode: 'ELECTIVE_GASTRO_COLONOSCOPY_2026', optionCode: 'BERYL', amountOrPct: 1000, basis: 'AMOUNT', benefitYear: 2026 };
  const tariff: Tariff = { code: 'GASTRO-1', description: 'Gastroscopy', requiresPreauth: true, category: 'endoscopy' };

  const ref2026 = baseRef({ benefitYear: 2026, tariff, coPaymentRules: [rule] });
  assert.equal(evaluateFlatTriggers(baseRequest(), ref2026).length, 1);

  const ref2025 = baseRef({ benefitYear: 2025, tariff, coPaymentRules: [rule] });
  assert.equal(evaluateFlatTriggers(baseRequest(), ref2025).length, 0, 'must not apply before 2026');

  const outOfHospital = baseRef({ benefitYear: 2026, tariff, coPaymentRules: [rule] });
  assert.equal(evaluateFlatTriggers(baseRequest({ setting: 'OUT_HOSPITAL' }), outOfHospital).length, 0);
});

test('evaluateFlatTriggers: no-referral 30% only on TZ1/EVO specialist consults without a referral', () => {
  const rule: CoPaymentRule = { triggerCode: 'NON_DSP', optionCode: 'TANZANITE_ONE', amountOrPct: 30, basis: 'PCT', benefitYear: 2025 };
  const tariff: Tariff = { code: 'CONSULT-1', description: 'Specialist consult', requiresPreauth: false, category: 'consultation' };
  const option: Option = { optionCode: 'TANZANITE_ONE', name: 'Tanzanite One', networkType: 'NETWORK', benefitYear: 2025 };

  const noReferral = baseRef({ option, tariff, coPaymentRules: [rule] });
  const fired = evaluateFlatTriggers(baseRequest({ hasReferral: false, quotedAmount: 1000 }), noReferral);
  assert.equal(fired.length, 1);
  assert.equal(fired[0]?.amount, 300);

  const withReferral = evaluateFlatTriggers(baseRequest({ hasReferral: true, quotedAmount: 1000 }), noReferral);
  assert.equal(withReferral.length, 0);
});

test('evaluateMedicineCoPayment: out-of-formulary charges 30% of the quoted amount', () => {
  const nappi: Nappi = { nappiCode: 'N1', product: 'Non-formulary drug', mplPrice: null, drpPrice: null, formularyFlag: false };
  const ref = baseRef({ nappi });
  const result = evaluateMedicineCoPayment(baseRequest({ nappiCode: 'N1', quotedAmount: 500 }), ref);
  assert.equal(result?.amount, 150);
  assert.match(result?.reason ?? '', /out-of-formulary/);
});

test('evaluateMedicineCoPayment: formulary drug over the DRP reference price charges the difference', () => {
  const nappi: Nappi = { nappiCode: 'N2', product: 'Formulary drug', mplPrice: 100, drpPrice: 100, formularyFlag: true };
  const ref = baseRef({ nappi });
  const result = evaluateMedicineCoPayment(baseRequest({ nappiCode: 'N2', quotedAmount: 150 }), ref);
  assert.equal(result?.amount, 50);
  assert.match(result?.reason ?? '', /DRP\/MPL price difference/);
});

test('evaluateMedicineCoPayment: formulary drug at or under DRP price has no co-payment', () => {
  const nappi: Nappi = { nappiCode: 'N3', product: 'Formulary drug', mplPrice: 100, drpPrice: 100, formularyFlag: true };
  const ref = baseRef({ nappi });
  const result = evaluateMedicineCoPayment(baseRequest({ nappiCode: 'N3', quotedAmount: 90, dispensingIsDsp: true }), ref);
  assert.equal(result, undefined);
});

test('evaluateMedicineCoPayment: formulary drug dispensed non-DSP charges 30%', () => {
  const nappi: Nappi = { nappiCode: 'N4', product: 'Formulary drug', mplPrice: 100, drpPrice: 100, formularyFlag: true };
  const ref = baseRef({ nappi });
  const result = evaluateMedicineCoPayment(baseRequest({ nappiCode: 'N4', quotedAmount: 100, dispensingIsDsp: false }), ref);
  assert.equal(result?.amount, 30);
  assert.match(result?.reason ?? '', /non-DSP dispensing/);
});

test('evaluateMedicineCoPayment: no medicine in the request means no medicine co-payment', () => {
  const ref = baseRef();
  assert.equal(evaluateMedicineCoPayment(baseRequest(), ref), undefined);
});

test('aggregateCoPayments: sums amounts and joins reasons', () => {
  const result = aggregateCoPayments([
    { amount: 1000, reason: 'late auth' },
    { amount: 15000, reason: 'non-network hospital' },
  ]);
  assert.equal(result?.amount, 16000);
  assert.equal(result?.reason, 'late auth; non-network hospital');
});

test('aggregateCoPayments: empty list means no co-payment (null, not R0)', () => {
  assert.equal(aggregateCoPayments([]), null);
});
