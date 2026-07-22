import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PopiaComplianceError, assertPopiaCompliant, loadLlmEndpointConfig } from '../../src/triage/llm-config.js';

test('assertPopiaCompliant: refuses a public endpoint without a signed agreement', () => {
  assert.throws(
    () => assertPopiaCompliant({ endpointType: 'PUBLIC', popiaProcessorAgreementSigned: false, url: 'https://public.example.com' }),
    PopiaComplianceError,
  );
});

test('assertPopiaCompliant: allows a public endpoint once the agreement flag is explicitly true', () => {
  assert.doesNotThrow(() =>
    assertPopiaCompliant({ endpointType: 'PUBLIC', popiaProcessorAgreementSigned: true, url: 'https://public.example.com' }),
  );
});

test('assertPopiaCompliant: a private endpoint never needs the agreement flag', () => {
  assert.doesNotThrow(() =>
    assertPopiaCompliant({ endpointType: 'PRIVATE', popiaProcessorAgreementSigned: false, url: 'https://internal.example.com' }),
  );
});

test('loadLlmEndpointConfig: returns undefined when no endpoint URL is configured — Layer B simply stays off', () => {
  const config = loadLlmEndpointConfig({});
  assert.equal(config, undefined);
});

test('loadLlmEndpointConfig: throws for a public endpoint with no signed-agreement flag set', () => {
  assert.throws(
    () =>
      loadLlmEndpointConfig({
        LAYER_B_LLM_ENDPOINT_URL: 'https://public.example.com',
        LAYER_B_LLM_ENDPOINT_TYPE: 'PUBLIC',
      }),
    PopiaComplianceError,
  );
});

test('loadLlmEndpointConfig: throws for a public endpoint even if unrelated env vars are noisy', () => {
  assert.throws(
    () =>
      loadLlmEndpointConfig({
        LAYER_B_LLM_ENDPOINT_URL: 'https://public.example.com',
        LAYER_B_LLM_ENDPOINT_TYPE: 'PUBLIC',
        LAYER_B_POPIA_AGREEMENT_SIGNED: 'false',
        SOME_OTHER_VAR: 'true',
      }),
    PopiaComplianceError,
  );
});

test('loadLlmEndpointConfig: succeeds for a private endpoint with no agreement flag at all', () => {
  const config = loadLlmEndpointConfig({
    LAYER_B_LLM_ENDPOINT_URL: 'https://internal.example.com/v1/chat/completions',
    LAYER_B_LLM_ENDPOINT_TYPE: 'PRIVATE',
    LAYER_B_LLM_MODEL_ID: 'on-prem-clinical-llm',
  });
  assert.deepEqual(config, {
    url: 'https://internal.example.com/v1/chat/completions',
    endpointType: 'PRIVATE',
    popiaProcessorAgreementSigned: false,
    modelIdentifier: 'on-prem-clinical-llm',
  });
});

test('loadLlmEndpointConfig: succeeds for a public endpoint once explicitly attested as signed', () => {
  const config = loadLlmEndpointConfig({
    LAYER_B_LLM_ENDPOINT_URL: 'https://public.example.com',
    LAYER_B_LLM_ENDPOINT_TYPE: 'PUBLIC',
    LAYER_B_POPIA_AGREEMENT_SIGNED: 'true',
  });
  assert.equal(config?.popiaProcessorAgreementSigned, true);
});

test('loadLlmEndpointConfig: rejects a missing/garbage endpoint type rather than defaulting', () => {
  assert.throws(() =>
    loadLlmEndpointConfig({
      LAYER_B_LLM_ENDPOINT_URL: 'https://example.com',
    }),
  );
  assert.throws(() =>
    loadLlmEndpointConfig({
      LAYER_B_LLM_ENDPOINT_URL: 'https://example.com',
      LAYER_B_LLM_ENDPOINT_TYPE: 'ONPREM',
    }),
  );
});
