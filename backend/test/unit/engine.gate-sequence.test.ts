import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runGateSequence } from '../../src/engine/index.js';
import type { AuthRequest, Gate, GateResult, ReferenceData } from '../../src/engine/types.js';

const request: AuthRequest = {
  memberId: 'M1',
  icd10Code: 'M17.1',
  tariffCode: 'T1',
  serviceDate: '2025-06-01',
  setting: 'IN_HOSPITAL',
};

const ref: ReferenceData = {
  benefitYear: 2025,
  member: { memberId: 'M1', optionCode: 'BERYL', status: 'ACTIVE', joinDate: '2020-01-01', priorCoverMonths: 24, dob: '1980-01-01' },
  option: { optionCode: 'BERYL', name: 'Beryl', networkType: 'OPEN', benefitYear: 2025 },
  benefitLimits: [],
  benefitBalances: [],
  coPaymentRules: [],
  waitingPeriodRules: [],
};

function mockGate(gateNumber: number, result: Omit<GateResult, 'gateNumber'>): Gate {
  return () => ({ gateNumber, ...result });
}

test('runs gates in order and stops at the first terminal outcome (fail-fast)', () => {
  const calls: number[] = [];
  const gates: Gate[] = [
    () => {
      calls.push(0);
      return { gateNumber: 0, gateName: 'gate0', outcome: 'CONTINUE', reason: 'member active' };
    },
    () => {
      calls.push(1);
      return { gateNumber: 1, gateName: 'gate1', outcome: 'DECLINE', reason: 'waiting period' };
    },
    () => {
      calls.push(2);
      return { gateNumber: 2, gateName: 'gate2', outcome: 'CONTINUE', reason: 'should not run' };
    },
  ];

  const { results, final } = runGateSequence(request, ref, gates);

  assert.deepEqual(calls, [0, 1], 'gate 2 must not run after gate 1 declines');
  assert.equal(results.length, 2);
  assert.equal(final.outcome, 'DECLINE');
  assert.equal(final.gateNumber, 1);
});

test('CONTINUE_WITH_COPAY advances the sequence instead of stopping it', () => {
  const calls: number[] = [];
  const gates: Gate[] = [
    mockGate(0, { gateName: 'gate0', outcome: 'CONTINUE', reason: 'ok' }),
    (_req, _r, prior) => {
      calls.push(6);
      return { gateNumber: 6, gateName: 'gate6', outcome: 'CONTINUE_WITH_COPAY', reason: 'non-network', copay: { amount: 15000, reason: 'non-network hospital' } };
    },
    (_req, _r, prior) => {
      calls.push(9);
      // Gate 9 aggregates whatever copay earlier gates attached.
      const carried = prior.flatMap((r) => (r.copay ? [r.copay] : []));
      return { gateNumber: 9, gateName: 'gate9', outcome: 'APPROVE_WITH_COPAY', reason: 'output emitted', copay: carried[0] };
    },
  ];

  const { results, final } = runGateSequence(request, ref, gates);

  assert.deepEqual(calls, [6, 9], 'gate 6 must not stop the sequence');
  assert.equal(results.length, 3);
  assert.equal(final.gateNumber, 9);
  assert.equal(final.outcome, 'APPROVE_WITH_COPAY');
  assert.equal(final.copay?.amount, 15000);
});

test('runs every gate when all continue, using the last gate as the terminal outcome', () => {
  const gates: Gate[] = [
    mockGate(0, { gateName: 'gate0', outcome: 'CONTINUE', reason: 'ok' }),
    mockGate(1, { gateName: 'gate1', outcome: 'CONTINUE', reason: 'ok' }),
    mockGate(9, { gateName: 'gate9', outcome: 'APPROVE_WITH_COPAY', reason: 'output emitted' }),
  ];

  const { results, final } = runGateSequence(request, ref, gates);

  assert.equal(results.length, 3);
  assert.equal(final.gateNumber, 9);
  assert.equal(final.outcome, 'APPROVE_WITH_COPAY');
});

test('throws if the sequence exhausts every gate without a terminal outcome', () => {
  const gates: Gate[] = [mockGate(0, { gateName: 'gate0', outcome: 'CONTINUE', reason: 'ok' })];

  assert.throws(() => runGateSequence(request, ref, gates), /must never return CONTINUE/);
});
