import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { recordDecisionOutcome, recordGateOutcomes, renderPrometheusText, resetMetrics, snapshotMetrics } from '../../src/observability/metrics.js';

beforeEach(() => {
  resetMetrics();
});

test('recordDecisionOutcome tallies by outcome', () => {
  recordDecisionOutcome('APPROVE');
  recordDecisionOutcome('APPROVE');
  recordDecisionOutcome('DECLINE');

  const snapshot = snapshotMetrics();
  assert.equal(snapshot.decisionsTotal.APPROVE, 2);
  assert.equal(snapshot.decisionsTotal.DECLINE, 1);
});

test('recordGateOutcomes tallies by gate name and outcome independently', () => {
  recordGateOutcomes([
    { gateName: 'member_active_eligible', outcome: 'CONTINUE' },
    { gateName: 'auth_required', outcome: 'CONTINUE' },
  ]);
  recordGateOutcomes([
    { gateName: 'member_active_eligible', outcome: 'DECLINE' },
  ]);

  const snapshot = snapshotMetrics();
  assert.equal(snapshot.gateOutcomesTotal.member_active_eligible?.CONTINUE, 1);
  assert.equal(snapshot.gateOutcomesTotal.member_active_eligible?.DECLINE, 1);
  assert.equal(snapshot.gateOutcomesTotal.auth_required?.CONTINUE, 1);
});

test('renderPrometheusText produces scrapeable counter lines for both metric families', () => {
  recordDecisionOutcome('ROUTE');
  recordGateOutcomes([{ gateName: 'icd10_valid_codable', outcome: 'ROUTE' }]);

  const text = renderPrometheusText();
  assert.match(text, /# TYPE gemsp_decisions_total counter/);
  assert.match(text, /gemsp_decisions_total\{outcome="ROUTE"\} 1/);
  assert.match(text, /# TYPE gemsp_gate_outcomes_total counter/);
  assert.match(text, /gemsp_gate_outcomes_total\{gate="icd10_valid_codable",outcome="ROUTE"\} 1/);
});

test('resetMetrics clears both counter families', () => {
  recordDecisionOutcome('APPROVE');
  recordGateOutcomes([{ gateName: 'x', outcome: 'CONTINUE' }]);
  resetMetrics();

  const snapshot = snapshotMetrics();
  assert.deepEqual(snapshot.decisionsTotal, {});
  assert.deepEqual(snapshot.gateOutcomesTotal, {});
});
