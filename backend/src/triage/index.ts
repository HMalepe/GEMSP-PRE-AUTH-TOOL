export interface TriageResult {
  confidence: number;
  recommendedAction: 'APPROVE' | 'DECLINE' | 'REQUEST_MORE_INFO';
  evidence: string[];
}

/**
 * Layer B entry point (Technical Build Spec §5). It reads unstructured
 * input, produces a confidence score, and hands anything below threshold —
 * or any high-cost/experimental/appeal case — to a human review queue. It
 * must never override a Layer-A PMB decline (§5.1).
 *
 * Not implemented for v1: ship Layer A first and route 100% of cases here
 * to the human queue; there is no labelled decision log yet to set a
 * confidence threshold against (§5.2 "Do not overbuild this first").
 */
export async function triage(): Promise<TriageResult> {
  throw new Error('Layer B triage not implemented for v1 (Technical Build Spec §5.2)');
}
