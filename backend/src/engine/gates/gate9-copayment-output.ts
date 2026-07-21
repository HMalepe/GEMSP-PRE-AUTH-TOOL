import { aggregateCoPayments, evaluateFlatTriggers, evaluateMedicineCoPayment } from '../co-payment.js';
import type { Gate } from '../types.js';

/**
 * Gate 9 — Co-payment calc + output.
 * Reads: CoPaymentRule + all prior gate results. Only reached when every
 * earlier gate returned CONTINUE or CONTINUE_WITH_COPAY — always the
 * terminal, always an approval. Aggregates any co-payment noted by an
 * earlier gate (Gate 6's network flag) with the flat triggers and
 * medicine stack this gate evaluates itself, into the single co_payment
 * object the §4.3 contract has room for. See ../decision.ts for how this
 * result becomes the final AuthDecision.
 */
export const gate9CopaymentOutput: Gate = (request, ref, priorResults) => {
  const gateNumber = 9;
  const gateName = 'copayment_calc_output';

  const parts = priorResults.flatMap((r) => (r.copay ? [r.copay] : []));
  parts.push(...evaluateFlatTriggers(request, ref));
  const medicineCopay = evaluateMedicineCoPayment(request, ref);
  if (medicineCopay) {
    parts.push(medicineCopay);
  }

  const copay = aggregateCoPayments(parts);

  return {
    gateNumber,
    gateName,
    outcome: 'APPROVE_WITH_COPAY',
    reason: copay ? `co-payment applied: ${copay.reason}` : 'no co-payment applicable',
    copay: copay ?? undefined,
  };
};
