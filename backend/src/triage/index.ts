export {
  getReviewQueueItem,
  listReviewQueue,
  resolveReviewQueueItem,
  type QueueItemDetail,
  type QueueItemSummary,
  type ResolveQueueItemParams,
} from './queue.js';

export interface TriageResult {
  confidence: number;
  recommendedAction: 'APPROVE' | 'DECLINE' | 'REQUEST_MORE_INFO';
  evidence: string[];
}

/**
 * The LLM extraction/classification half of Layer B (Technical Build Spec
 * §5). It would read unstructured input, produce a confidence score, and
 * pre-assemble evidence for the human queue — but never override a
 * Layer-A PMB decline (§5.1).
 *
 * Deliberately NOT implemented: v1's actual job is routing 100% of edge
 * cases to the human queue (./queue.ts, wired at GET/POST /review-queue),
 * which is what's built here. There's no labelled decision log yet to
 * set a confidence threshold against, and no LLM credentials configured
 * for this engine to call — building this now would be exactly the
 * overbuilding §5.2 warns against ("resist training a model before you
 * have logged decisions to train it on"). Once review_outcome has real
 * volume, this becomes a real classifier reading that log.
 */
export async function triage(): Promise<TriageResult> {
  throw new Error('Layer B confidence scoring not implemented for v1 — see ./queue.ts for what v1 actually ships (Technical Build Spec §5.2)');
}
