/**
 * In-memory decision metrics (Technical Build Spec §6 Observability:
 * "decision metrics — approve/decline/route rates" — and, since Layer A's
 * gates are the actual decision-making unit, per-gate outcome rates too,
 * not just the final rollup). Process-local counters, exposed as
 * Prometheus text exposition on GET /metrics — no metrics-vendor
 * dependency needed for a single-process monolith (Build Spec §6
 * Throughput: "a monolith on modest hardware suffices").
 */

const decisionsTotal = new Map<string, number>();
const gateOutcomesTotal = new Map<string, Map<string, number>>();

function inc(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function recordDecisionOutcome(outcome: string): void {
  inc(decisionsTotal, outcome);
}

export function recordGateOutcomes(results: readonly { gateName: string; outcome: string }[]): void {
  for (const r of results) {
    let gateMap = gateOutcomesTotal.get(r.gateName);
    if (!gateMap) {
      gateMap = new Map();
      gateOutcomesTotal.set(r.gateName, gateMap);
    }
    inc(gateMap, r.outcome);
  }
}

/** Test-only — a running server never needs to reset its own counters. */
export function resetMetrics(): void {
  decisionsTotal.clear();
  gateOutcomesTotal.clear();
}

export interface MetricsSnapshot {
  decisionsTotal: Record<string, number>;
  gateOutcomesTotal: Record<string, Record<string, number>>;
}

export function snapshotMetrics(): MetricsSnapshot {
  const gateOutcomes: Record<string, Record<string, number>> = {};
  for (const [gateName, outcomes] of gateOutcomesTotal) {
    gateOutcomes[gateName] = Object.fromEntries(outcomes);
  }
  return {
    decisionsTotal: Object.fromEntries(decisionsTotal),
    gateOutcomesTotal: gateOutcomes,
  };
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Prometheus text exposition format (https://prometheus.io/docs/instrumenting/exposition_formats/) — scrapeable by any standard collector without an extra client library. */
export function renderPrometheusText(): string {
  const lines: string[] = [];

  lines.push('# HELP gemsp_decisions_total Total Layer A decisions by final outcome');
  lines.push('# TYPE gemsp_decisions_total counter');
  for (const [outcome, count] of decisionsTotal) {
    lines.push(`gemsp_decisions_total{outcome="${escapeLabelValue(outcome)}"} ${count}`);
  }

  lines.push('# HELP gemsp_gate_outcomes_total Total gate outcomes by gate name and outcome');
  lines.push('# TYPE gemsp_gate_outcomes_total counter');
  for (const [gateName, outcomes] of gateOutcomesTotal) {
    for (const [outcome, count] of outcomes) {
      lines.push(`gemsp_gate_outcomes_total{gate="${escapeLabelValue(gateName)}",outcome="${escapeLabelValue(outcome)}"} ${count}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
