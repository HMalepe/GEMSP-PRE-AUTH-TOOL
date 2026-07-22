import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canViewHivDetail, redactHivDetail, redactHivSummary } from '../../src/security/redact.js';

const hivRecord = { is_hiv_related: true, created_by: 'dr.consultant', codes: { icd10Code: 'B20', tariffCode: 'T-1' } };
const nonHivRecord = { is_hiv_related: false, created_by: 'dr.consultant', codes: { icd10Code: 'M17.1', tariffCode: 'T-1' } };

test('canViewHivDetail: a non-HIV record is always visible', () => {
  assert.equal(canViewHivDetail(nonHivRecord, { userId: 'anyone', role: 'consultant' }), true);
});

test('canViewHivDetail: an HIV-authorised role can view regardless of who submitted it', () => {
  assert.equal(canViewHivDetail(hivRecord, { userId: 'someone.else', role: 'clinical_maintainer' }), true);
  assert.equal(canViewHivDetail(hivRecord, { userId: 'someone.else', role: 'admin' }), true);
});

test('canViewHivDetail: the original submitter can view even without an HIV-authorised role', () => {
  assert.equal(canViewHivDetail(hivRecord, { userId: 'dr.consultant', role: 'consultant' }), true);
});

test('canViewHivDetail: a different consultant is denied', () => {
  assert.equal(canViewHivDetail(hivRecord, { userId: 'dr.other', role: 'consultant' }), false);
});

test('canViewHivDetail: an auditor is denied by default (not in HIV_AUTHORISED_ROLES)', () => {
  assert.equal(canViewHivDetail(hivRecord, { userId: 'compliance.auditor', role: 'auditor' }), false);
});

test('redactHivSummary: leaves a non-restricted record untouched', () => {
  const result = redactHivSummary(nonHivRecord, { userId: 'anyone', role: 'auditor' });
  assert.equal(result.codes.icd10Code, 'M17.1');
});

test('redactHivSummary: blanks icd10Code only, for an unauthorised viewer', () => {
  const result = redactHivSummary(hivRecord, { userId: 'dr.other', role: 'consultant' });
  assert.equal(result.codes.icd10Code, '[REDACTED]');
  assert.equal(result.codes.tariffCode, 'T-1', 'non-diagnosis codes are not clinical-diagnosis-identifying and stay visible');
});

test('redactHivSummary: does not mutate the input object', () => {
  const before = JSON.stringify(hivRecord);
  redactHivSummary(hivRecord, { userId: 'dr.other', role: 'consultant' });
  assert.equal(JSON.stringify(hivRecord), before);
});

test('redactHivDetail: blanks codes, reasons, and every gate result reason for an unauthorised viewer', () => {
  const detail = {
    ...hivRecord,
    reasons: ['ICD-10 B20 is a PMB condition', 'member is active'],
    gate_results: [
      { gate_number: 0, gate_name: 'member_active_eligible', outcome: 'CONTINUE', passed: true, reason: 'member M-0001 is active' },
      { gate_number: 3, gate_name: 'pmb_status', outcome: 'CONTINUE', passed: true, reason: 'ICD-10 B20 is a PMB condition' },
    ],
  };

  const result = redactHivDetail(detail, { userId: 'dr.other', role: 'consultant' });

  assert.equal(result.codes.icd10Code, '[REDACTED]');
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0]!, /REDACTED/);
  assert.ok(result.gate_results.every((g) => /REDACTED/.test(g.reason)));
  // Non-clinical-text fields survive redaction — the reviewer can still see the shape/outcome of the decision.
  assert.equal(result.gate_results[0]?.outcome, 'CONTINUE');
  assert.equal(result.gate_results[0]?.passed, true);
  assert.equal(result.gate_results[1]?.gate_name, 'pmb_status');
});

test('redactHivDetail: an authorised viewer sees the record unchanged', () => {
  const detail = { ...hivRecord, reasons: ['x'], gate_results: [{ gate_number: 0, gate_name: 'g', outcome: 'CONTINUE', passed: true, reason: 'x' }] };
  const result = redactHivDetail(detail, { userId: 'someone.else', role: 'admin' });
  assert.equal(result.codes.icd10Code, 'B20');
  assert.equal(result.reasons[0], 'x');
});
