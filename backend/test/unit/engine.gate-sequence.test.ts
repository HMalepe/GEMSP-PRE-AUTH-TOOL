import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runGateSequence } from '../../src/engine/index.js';
import type { Gate, GateContext, GateResult } from '../../src/engine/types.js';

const ctx: GateContext = {
  member: {
    memberId: 'M1',
    optionCode: 'BERYL',
    status: 'ACTIVE',
    joinDate: '2020-01-01',
    priorCoverMonths: 24,
    dob: '1980-01-01',
  },
  option: { optionCode: 'BERYL', name: 'Beryl', networkType: 'OPEN', benefitYear: 2025 },
  serviceDate: '2025-06-01',
};

function mockGate(gateNumber: number, result: Omit<GateResult, 'gateNumber'>): Gate {
  return () => ({ gateNumber, ...result });
}

test('runs gates in order and stops at the first non-CONTINUE outcome (fail-fast)', async () => {
  const calls: number[] = [];
  const gates: Gate[] = [
    (c) => {
      calls.push(0);
      return { gateNumber: 0, gateName: 'gate0', outcome: 'CONTINUE', reason: 'member active' };
    },
    (c) => {
      calls.push(1);
      return { gateNumber: 1, gateName: 'gate1', outcome: 'DECLINE', reason: 'waiting period' };
    },
    (c) => {
      calls.push(2);
      return { gateNumber: 2, gateName: 'gate2', outcome: 'CONTINUE', reason: 'should not run' };
    },
  ];

  const { results, final } = await runGateSequence(ctx, gates);

  assert.deepEqual(calls, [0, 1], 'gate 2 must not run after gate 1 declines');
  assert.equal(results.length, 2);
  assert.equal(final.outcome, 'DECLINE');
  assert.equal(final.gateNumber, 1);
});

test('runs every gate when all continue, using the last gate as the terminal outcome', async () => {
  const gates: Gate[] = [
    mockGate(0, { gateName: 'gate0', outcome: 'CONTINUE', reason: 'ok' }),
    mockGate(1, { gateName: 'gate1', outcome: 'CONTINUE', reason: 'ok' }),
    mockGate(9, { gateName: 'gate9', outcome: 'APPROVE_WITH_COPAY', reason: 'output emitted' }),
  ];

  const { results, final } = await runGateSequence(ctx, gates);

  assert.equal(results.length, 3);
  assert.equal(final.gateNumber, 9);
  assert.equal(final.outcome, 'APPROVE_WITH_COPAY');
});

test('throws if the sequence exhausts every gate without a terminal outcome', async () => {
  const gates: Gate[] = [mockGate(0, { gateName: 'gate0', outcome: 'CONTINUE', reason: 'ok' })];

  await assert.rejects(() => runGateSequence(ctx, gates), /must never return CONTINUE/);
});
