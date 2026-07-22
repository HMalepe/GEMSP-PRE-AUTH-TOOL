/**
 * The compliance gate for Layer B's outbound LLM call (Technical Build
 * Spec §5.2 Guardrail; Rules-Engine Spec §1.2): "PHI leaves the internal
 * boundary only if POPIA-compliant; prefer on-prem/private inference for
 * health data." This module is the one place that rule is enforced —
 * llm-client.ts calls assertPopiaCompliant() before every single request,
 * not just at startup, so a config change mid-process can't silently
 * open the hole.
 */

export type LlmEndpointType = 'PRIVATE' | 'PUBLIC';

export interface LlmEndpointConfig {
  url: string;
  endpointType: LlmEndpointType;
  popiaProcessorAgreementSigned: boolean;
  modelIdentifier: string;
}

export class PopiaComplianceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PopiaComplianceError';
  }
}

/**
 * A PUBLIC endpoint is refused unless popiaProcessorAgreementSigned is
 * explicitly true — that flag is an attestation a human made deliberately
 * (there is no default that turns it on), not a feature switch. This
 * can't verify a real signed legal agreement exists; it can only refuse
 * to proceed until someone consciously asserts one does.
 */
export function assertPopiaCompliant(config: Pick<LlmEndpointConfig, 'endpointType' | 'popiaProcessorAgreementSigned' | 'url'>): void {
  if (config.endpointType === 'PUBLIC' && !config.popiaProcessorAgreementSigned) {
    throw new PopiaComplianceError(
      `Refusing to send member health data to a public LLM endpoint (${config.url}) without a signed POPIA processor ` +
        'agreement (Technical Build Spec §5.2 Guardrail; Rules-Engine Spec §1.2). ' +
        'Either point LAYER_B_LLM_ENDPOINT_TYPE at a private/on-prem endpoint, or — only once your organisation actually ' +
        'has a signed processor agreement in place for this specific endpoint — set LAYER_B_POPIA_AGREEMENT_SIGNED=true. ' +
        'That variable is a compliance attestation, not a convenience flag; do not set it to unblock local testing.',
    );
  }
}

/**
 * Reads Layer B's LLM endpoint config from the environment. Returns
 * undefined (Layer B extraction simply stays off) when no endpoint URL
 * is configured at all — there is no default endpoint, public or
 * private. Throws PopiaComplianceError immediately, at load time, if a
 * public endpoint is configured without the signed-agreement flag —
 * fail at startup, not on the first real request.
 */
export function loadLlmEndpointConfig(env: NodeJS.ProcessEnv = process.env): LlmEndpointConfig | undefined {
  const url = env.LAYER_B_LLM_ENDPOINT_URL;
  if (!url) {
    return undefined;
  }

  const rawType = (env.LAYER_B_LLM_ENDPOINT_TYPE ?? '').toUpperCase();
  if (rawType !== 'PRIVATE' && rawType !== 'PUBLIC') {
    throw new Error(
      `LAYER_B_LLM_ENDPOINT_TYPE must be set to PRIVATE or PUBLIC when LAYER_B_LLM_ENDPOINT_URL is configured (got: ${JSON.stringify(env.LAYER_B_LLM_ENDPOINT_TYPE)}). ` +
        'No default is assumed on purpose — an endpoint\'s data-residency status must be stated explicitly, not guessed.',
    );
  }

  const config: LlmEndpointConfig = {
    url,
    endpointType: rawType,
    popiaProcessorAgreementSigned: env.LAYER_B_POPIA_AGREEMENT_SIGNED === 'true',
    modelIdentifier: env.LAYER_B_LLM_MODEL_ID ?? 'unspecified-model',
  };

  assertPopiaCompliant(config);

  return config;
}
