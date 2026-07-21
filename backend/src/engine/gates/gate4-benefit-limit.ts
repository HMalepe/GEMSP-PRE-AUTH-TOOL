import type { Gate } from '../types.js';

/**
 * Gate 4 — Benefit/limit available.
 * Reads: BenefitBalance. On fail: Decline unless PMB.
 * benefit_type is resolved from tariff.category — the §2.1 schema has no
 * separate procedure-to-benefit_type mapping table, so tariff.category
 * and benefit_limit.benefit_type must share one vocabulary (documented in
 * the loader fixtures).
 */
export const gate4BenefitLimit: Gate = (_request, ref) => {
  const gateNumber = 4;
  const gateName = 'benefit_limit_available';
  const isPmb = ref.icd10?.isPmb ?? false;
  const benefitType = ref.tariff?.category;
  const pmbNote = ref.dtp?.pmbLevelOfCare ? ` at ${ref.dtp.pmbLevelOfCare}` : '';

  if (!benefitType) {
    return {
      gateNumber,
      gateName,
      outcome: 'ROUTE',
      reason: 'no benefit_type resolvable from tariff category — cannot check benefit availability',
    };
  }

  const balance = ref.benefitBalances.find((b) => b.benefitType === benefitType);

  if (!balance) {
    if (isPmb) {
      return {
        gateNumber,
        gateName,
        outcome: 'CONTINUE',
        reason: `no benefit_balance record for ${benefitType}, but PMB overrides — approved under PMB entitlement${pmbNote}`,
      };
    }
    return {
      gateNumber,
      gateName,
      outcome: 'ROUTE',
      reason: `no benefit_balance record found for ${benefitType} — cannot verify available benefit`,
    };
  }

  if (balance.available > 0) {
    return {
      gateNumber,
      gateName,
      outcome: 'CONTINUE',
      reason: `${benefitType} benefit available: R${balance.available}`,
    };
  }

  if (isPmb) {
    return {
      gateNumber,
      gateName,
      outcome: 'CONTINUE',
      reason: `${benefitType} benefit exhausted, but PMB overrides — approved under PMB entitlement${pmbNote}`,
    };
  }

  return {
    gateNumber,
    gateName,
    outcome: 'DECLINE',
    reason: `${benefitType} benefit exhausted, non-PMB`,
  };
};
