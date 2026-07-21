import { computeCoPaymentAmount } from '../co-payment.js';
import type { Gate } from '../types.js';

/**
 * Gate 6 — Network/DSP compliant.
 * Reads: NetworkProvider. On fail: Approve + co-pay (NOT a decline — a
 * non-network admission still gets funded, with the flat R15,000
 * co-payment). Outcome is CONTINUE_WITH_COPAY, not a terminal approval —
 * Gate 9 still needs to run to aggregate this with anything else and
 * emit the final decision object.
 */
export const gate6NetworkDsp: Gate = (request, ref) => {
  const gateNumber = 6;
  const gateName = 'network_dsp_compliant';
  const provider = ref.networkProvider;
  const isCompliant = provider !== undefined && provider.networkMembership === 'DSP';

  if (isCompliant) {
    return {
      gateNumber,
      gateName,
      outcome: 'CONTINUE',
      reason: `provider ${provider.practiceNo} is DSP/network compliant`,
    };
  }

  const rule = ref.coPaymentRules.find(
    (r) => r.triggerCode === 'NON_NETWORK_HOSPITAL' && r.optionCode === ref.option.optionCode,
  );
  const copay = rule ? computeCoPaymentAmount(rule, request.quotedAmount, 'non-network hospital') : undefined;
  const providerNote = provider
    ? `provider ${provider.practiceNo} is non-DSP/non-network`
    : `no network provider record for ${request.practiceNo ?? 'the requested facility'} — treated as non-network`;

  return {
    gateNumber,
    gateName,
    outcome: 'CONTINUE_WITH_COPAY',
    reason: copay ? `${providerNote}; co-payment: ${copay.reason}` : providerNote,
    copay,
  };
};
