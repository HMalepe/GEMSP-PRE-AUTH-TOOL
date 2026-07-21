import type { Gate } from '../types.js';

/**
 * Gate 8 — Protocol/step therapy.
 * Reads: formulary + criteria. On fail: Route to Layer B. This is the
 * seam between Layer A and Layer B (see ../../triage/index.ts).
 *
 * Off-formulary medicine for a CDL-listed diagnosis gets the automatic
 * out-of-formulary co-payment (the "+OF" MAC rule — computed in Gate 9),
 * not a route: that's an established, self-service pathway. Off-formulary
 * medicine for anything else needs individual clinical motivation, so it
 * routes to the human queue. Real step-therapy/protocol criteria beyond
 * formulary status aren't modelled anywhere in §2.1 — blocked on data
 * that doesn't exist yet, same as the other gates.
 */
export const gate8ProtocolStepTherapy: Gate = (request, ref) => {
  const gateNumber = 8;
  const gateName = 'protocol_step_therapy';

  if (!request.nappiCode) {
    return { gateNumber, gateName, outcome: 'CONTINUE', reason: 'no medicine in this request' };
  }
  if (!ref.nappi) {
    return { gateNumber, gateName, outcome: 'ROUTE', reason: `NAPPI ${request.nappiCode} not found` };
  }
  if (ref.nappi.formularyFlag) {
    return { gateNumber, gateName, outcome: 'CONTINUE', reason: `NAPPI ${ref.nappi.nappiCode} is on formulary` };
  }
  if (ref.icd10?.cdlFlag) {
    return {
      gateNumber,
      gateName,
      outcome: 'CONTINUE',
      reason: `NAPPI ${ref.nappi.nappiCode} is off-formulary but the diagnosis is CDL-listed — automatic out-of-formulary co-payment applies (Gate 9)`,
    };
  }

  return {
    gateNumber,
    gateName,
    outcome: 'ROUTE',
    reason: `NAPPI ${ref.nappi.nappiCode} is off-formulary and the diagnosis is not CDL-listed — requires clinical motivation`,
  };
};
