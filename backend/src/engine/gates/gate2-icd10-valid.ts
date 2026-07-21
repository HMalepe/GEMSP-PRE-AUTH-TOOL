import type { Gate } from '../types.js';

/**
 * Gate 2 — ICD-10 valid & codable.
 * Reads: ICD10 + Tariff/Nappi. On fail: Route.
 * "Codable" is checked here as: does the ICD-10 code resolve, does the
 * tariff resolve, and does a supplied NAPPI code resolve. A real
 * diagnosis-procedure compatibility cross-check needs a crosswalk dataset
 * this schema doesn't have (Technical Build Spec §2.2's "critical join"
 * is still blocked on Phase-0 data) — this gate can only validate that
 * each individual code is known, not that the pairing is clinically
 * sound.
 */
export const gate2Icd10Valid: Gate = (request, ref) => {
  const gateNumber = 2;
  const gateName = 'icd10_valid_codable';

  if (!ref.icd10) {
    return {
      gateNumber,
      gateName,
      outcome: 'ROUTE',
      reason: `ICD-10 ${request.icd10Code} not found in reference data for benefit year ${ref.benefitYear}`,
    };
  }
  if (!ref.tariff) {
    return {
      gateNumber,
      gateName,
      outcome: 'ROUTE',
      reason: `tariff ${request.tariffCode} not found — cannot validate against ICD-10 ${ref.icd10.code}`,
    };
  }
  if (request.nappiCode && !ref.nappi) {
    return {
      gateNumber,
      gateName,
      outcome: 'ROUTE',
      reason: `NAPPI ${request.nappiCode} not found in reference data`,
    };
  }

  return {
    gateNumber,
    gateName,
    outcome: 'CONTINUE',
    reason: `ICD-10 ${ref.icd10.code} and tariff ${ref.tariff.code} both resolve`,
  };
};
