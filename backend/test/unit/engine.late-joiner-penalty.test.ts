import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateLateJoinerPenalty } from '../../src/engine/late-joiner-penalty.js';

test('no penalty under age 35, regardless of cover', () => {
  const result = calculateLateJoinerPenalty(34, 0);
  assert.equal(result.applies, false);
  assert.equal(result.loadingFraction, 0);
});

test('no penalty when prior cover fully offsets years since 35', () => {
  // A = 40 - (35 + 5) = 0
  const result = calculateLateJoinerPenalty(40, 5);
  assert.equal(result.applies, false);
});

test('golden case 5: age 50, 5 years cover -> 0.25x band', () => {
  // A = 50 - (35 + 5) = 10 -> 5-14y band
  const result = calculateLateJoinerPenalty(50, 5);
  assert.equal(result.applies, true);
  assert.equal(result.yearsWithoutCover, 10);
  assert.equal(result.loadingFraction, 0.25);
});

test('band boundary: A=1 -> 0.05x (lower edge of first band)', () => {
  // A = 36 - (35 + 0) = 1
  const result = calculateLateJoinerPenalty(36, 0);
  assert.equal(result.applies, true);
  assert.equal(result.yearsWithoutCover, 1);
  assert.equal(result.loadingFraction, 0.05);
});

test('band boundary: A=4 -> 0.05x, A=5 -> 0.25x', () => {
  assert.equal(calculateLateJoinerPenalty(39, 0).loadingFraction, 0.05); // A=4
  assert.equal(calculateLateJoinerPenalty(40, 0).loadingFraction, 0.25); // A=5
});

test('band boundary: A=14 -> 0.25x, A=15 -> 0.50x', () => {
  assert.equal(calculateLateJoinerPenalty(49, 0).loadingFraction, 0.25); // A=14
  assert.equal(calculateLateJoinerPenalty(50, 0).loadingFraction, 0.5); // A=15
});

test('band boundary: A=24 -> 0.50x, A=25 -> 0.75x', () => {
  assert.equal(calculateLateJoinerPenalty(59, 0).loadingFraction, 0.5); // A=24
  assert.equal(calculateLateJoinerPenalty(60, 0).loadingFraction, 0.75); // A=25
});

test('very old first-time joiner stays at the top 0.75x band', () => {
  const result = calculateLateJoinerPenalty(80, 0);
  assert.equal(result.loadingFraction, 0.75);
});
