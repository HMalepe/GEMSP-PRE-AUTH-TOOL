import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageAt, benefitYearFromServiceDate, monthsBetween } from '../../src/engine/date-utils.js';

test('monthsBetween counts whole months, floored', () => {
  assert.equal(monthsBetween('2025-01-01', '2025-04-01'), 3);
  assert.equal(monthsBetween('2025-01-15', '2025-04-01'), 2);
  assert.equal(monthsBetween('2025-01-01', '2025-01-01'), 0);
});

test('monthsBetween never goes negative', () => {
  assert.equal(monthsBetween('2025-06-01', '2025-01-01'), 0);
});

test('ageAt accounts for whether the birthday has passed', () => {
  assert.equal(ageAt('1990-06-15', '2025-06-15'), 35);
  assert.equal(ageAt('1990-06-15', '2025-06-14'), 34);
  assert.equal(ageAt('1990-06-15', '2025-06-16'), 35);
});

test('benefitYearFromServiceDate reads the calendar year', () => {
  assert.equal(benefitYearFromServiceDate('2026-01-01'), 2026);
  assert.equal(benefitYearFromServiceDate('2025-12-31'), 2025);
});
