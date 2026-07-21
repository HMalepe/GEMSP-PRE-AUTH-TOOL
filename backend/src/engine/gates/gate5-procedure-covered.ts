import type { Gate } from '../types.js';

/**
 * Gate 5 — Procedure covered/coded.
 * Reads: Tariff + Modifier. On fail: Decline / route.
 * Routes on anything unresolvable (unknown modifier) rather than
 * guessing coverage.
 */
export const gate5ProcedureCovered: Gate = (request, ref) => {
  const gateNumber = 5;
  const gateName = 'procedure_covered_coded';

  if (!ref.tariff) {
    return { gateNumber, gateName, outcome: 'ROUTE', reason: `tariff ${request.tariffCode} not found` };
  }
  if (request.modifierCode && !ref.modifier) {
    return {
      gateNumber,
      gateName,
      outcome: 'ROUTE',
      reason: `modifier ${request.modifierCode} not found — cannot verify procedure coding`,
    };
  }

  const modifierNote = ref.modifier ? ` with modifier ${ref.modifier.code}` : '';
  return {
    gateNumber,
    gateName,
    outcome: 'CONTINUE',
    reason: `procedure ${ref.tariff.code} is coded${modifierNote}`,
  };
};
