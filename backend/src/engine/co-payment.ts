import type { CoPayment } from '../domain/decision.js';
import type { CoPaymentRule } from '../domain/entities.js';
import type { AuthRequest, ReferenceData } from './types.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Turns a co_payment_rule row into a rand amount. AMOUNT rows (R1,000 /
 * R15,000) are used as-is; PCT rows (30%) need `quotedAmount` as their
 * base — without it the trigger still fires (so it's visible in the
 * decision reasons) but resolves to R0, since guessing a rand value would
 * violate "never guess" just as much as skipping the trigger would.
 */
export function computeCoPaymentAmount(rule: CoPaymentRule, quotedAmount: number | undefined, reasonLabel: string): CoPayment {
  if (rule.basis === 'AMOUNT') {
    return { amount: rule.amountOrPct, reason: reasonLabel };
  }
  if (quotedAmount === undefined) {
    return { amount: 0, reason: `${reasonLabel} (${rule.amountOrPct}% — no quoted amount supplied to compute a rand value)` };
  }
  return { amount: round2(quotedAmount * (rule.amountOrPct / 100)), reason: `${reasonLabel} (${rule.amountOrPct}% of R${quotedAmount})` };
}

function findRule(ref: ReferenceData, triggerCode: string): CoPaymentRule | undefined {
  return ref.coPaymentRules.find((r) => r.triggerCode === triggerCode && r.optionCode === ref.option.optionCode);
}

/**
 * The four flat co-payment triggers (docs/gems-annexures-compilation.md
 * §3): R1,000 late-auth, R1,000 elective gastroscopy/colonoscopy (2026),
 * R15,000 non-network hospital (handled in Gate 6, not here — it's
 * already known by the time Gate 6 runs), 30% no-referral specialist
 * consult.
 */
export function evaluateFlatTriggers(request: AuthRequest, ref: ReferenceData): CoPayment[] {
  const results: CoPayment[] = [];

  if (request.preAuthLeadHours !== undefined && request.preAuthLeadHours < 48 && !request.isEmergency) {
    const rule = findRule(ref, 'LATE_AUTH');
    if (rule) {
      results.push(computeCoPaymentAmount(rule, request.quotedAmount, 'late pre-authorisation (<48h notice)'));
    }
  }

  if (ref.tariff?.category === 'endoscopy' && request.setting === 'IN_HOSPITAL' && ref.benefitYear >= 2026) {
    const rule = findRule(ref, 'ELECTIVE_GASTRO_COLONOSCOPY_2026');
    if (rule) {
      results.push(computeCoPaymentAmount(rule, request.quotedAmount, 'elective gastroscopy/colonoscopy in acute hospital (2026 rule)'));
    }
  }

  const noReferralOptions = new Set(['TANZANITE_ONE', 'EMERALD_VALUE']);
  if (
    ref.tariff?.category === 'consultation' &&
    request.hasReferral === false &&
    noReferralOptions.has(ref.option.optionCode)
  ) {
    const rule = findRule(ref, 'NON_DSP');
    if (rule) {
      results.push(computeCoPaymentAmount(rule, request.quotedAmount, 'specialist consult without FP referral'));
    }
  }

  return results;
}

/**
 * The three-way medicine co-payment stack
 * (docs/gems-annexures-compilation.md §4): out-of-formulary 30%, DRP/MPL
 * price difference, non-DSP dispensing 30%. Formulary status decides
 * which leg applies — they are mutually exclusive branches, not stacked.
 */
export function evaluateMedicineCoPayment(request: AuthRequest, ref: ReferenceData): CoPayment | undefined {
  if (!request.nappiCode || !ref.nappi) {
    return undefined;
  }
  const nappi = ref.nappi;
  const fallbackBase = nappi.mplPrice ?? nappi.drpPrice ?? undefined;
  const base = request.quotedAmount ?? fallbackBase;

  if (!nappi.formularyFlag) {
    return base === undefined
      ? { amount: 0, reason: 'out-of-formulary medicine 30% (no base price available to compute a rand value)' }
      : { amount: round2(base * 0.3), reason: `out-of-formulary medicine 30% of R${base}` };
  }

  const referencePrice = nappi.drpPrice ?? nappi.mplPrice ?? undefined;
  if (request.quotedAmount !== undefined && referencePrice !== undefined && request.quotedAmount > referencePrice) {
    return {
      amount: round2(request.quotedAmount - referencePrice),
      reason: `DRP/MPL price difference: R${request.quotedAmount} quoted vs R${referencePrice} reference`,
    };
  }

  if (request.dispensingIsDsp === false) {
    return base === undefined
      ? { amount: 0, reason: 'non-DSP dispensing 30% (no base price available to compute a rand value)' }
      : { amount: round2(base * 0.3), reason: `non-DSP dispensing 30% of R${base}` };
  }

  return undefined;
}

/**
 * Combines every co-payment identified across the gate sequence (Gate 6's
 * network flag, Gate 9's own flat triggers and medicine stack) into the
 * single co_payment object the §4.3 decision contract has room for.
 * Amounts sum; reasons join, so nothing silently gets dropped when more
 * than one trigger applies to the same request.
 */
export function aggregateCoPayments(parts: CoPayment[]): CoPayment | null {
  if (parts.length === 0) {
    return null;
  }
  const amount = round2(parts.reduce((sum, p) => sum + p.amount, 0));
  const reason = parts.map((p) => p.reason).join('; ');
  return { amount, reason };
}
