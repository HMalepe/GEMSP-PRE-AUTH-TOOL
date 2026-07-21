import type { Gate } from '../types.js';

/**
 * Gate 1 — Auth required?
 * Reads: Tariff.requires_preauth. On fail (not required): Skip -> claim
 * rules. If the tariff code itself doesn't resolve, that's unknown
 * structured data, not "no auth needed" — routes rather than assuming
 * the safer-sounding skip.
 */
export const gate1AuthRequired: Gate = (request, ref) => {
  const gateNumber = 1;
  const gateName = 'auth_required';

  if (!ref.tariff) {
    return {
      gateNumber,
      gateName,
      outcome: 'ROUTE',
      reason: `tariff ${request.tariffCode} not found — cannot determine whether pre-authorisation is required`,
    };
  }

  if (!ref.tariff.requiresPreauth) {
    return {
      gateNumber,
      gateName,
      outcome: 'SKIP_TO_CLAIM_RULES',
      reason: `tariff ${ref.tariff.code} does not require pre-authorisation`,
    };
  }

  return {
    gateNumber,
    gateName,
    outcome: 'CONTINUE',
    reason: `tariff ${ref.tariff.code} requires pre-authorisation`,
  };
};
