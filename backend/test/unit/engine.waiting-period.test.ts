import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyWaitingPeriodScenario } from '../../src/engine/waiting-period.js';

test('no prior cover -> s29A(1)', () => {
  assert.equal(classifyWaitingPeriodScenario(0), 'NO_COVER_90_DAYS_S29A_1');
});

test('prior cover <=24 months -> s29A(2)', () => {
  assert.equal(classifyWaitingPeriodScenario(1), 'PRIOR_COVER_LE_24M_GAP_LT_90D_S29A_2');
  assert.equal(classifyWaitingPeriodScenario(24), 'PRIOR_COVER_LE_24M_GAP_LT_90D_S29A_2');
});

test('prior cover >24 months -> s29A(3)', () => {
  assert.equal(classifyWaitingPeriodScenario(25), 'PRIOR_COVER_GT_24M_GAP_LT_90D_S29A_3');
  assert.equal(classifyWaitingPeriodScenario(120), 'PRIOR_COVER_GT_24M_GAP_LT_90D_S29A_3');
});
