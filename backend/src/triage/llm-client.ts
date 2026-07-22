import { assertPopiaCompliant, type LlmEndpointConfig, type LlmEndpointType } from './llm-config.js';

/**
 * Extraction/classification over unstructured input (Technical Build
 * Spec §5.1: motivation letters, clinical notes, quotations). Deliberately
 * NOT a bespoke trained model (§5.2 "resist training a model before you
 * have logged decisions to train it on") — this is prompted extraction
 * against a general-purpose model, with rules (the confidence threshold
 * in extraction.ts) on top of its output.
 */
export interface ExtractionInput {
  motivationText: string;
  icd10Code: string;
  tariffCode: string;
  nappiCode?: string;
  /** The reasons Gate 8 (or whichever gate) routed this case — gives the model the actual question to answer. */
  routingReasons: string[];
}

export type RecommendedAction = 'APPROVED' | 'DECLINED' | 'MORE_INFO_REQUESTED';

export interface ExtractionResult {
  confidence: number;
  /** null when the model itself couldn't commit to a recommendation — never guessed into one. */
  recommendedAction: RecommendedAction | null;
  extractedEvidence: {
    summary: string;
    keyFindings: string[];
    concerns: string[];
  };
  modelIdentifier: string;
  endpointType: LlmEndpointType;
}

export interface LlmClient {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

function buildMessages(input: ExtractionInput): { role: string; content: string }[] {
  return [
    {
      role: 'system',
      content:
        'You are a clinical pre-authorisation extraction assistant for a South African medical scheme. ' +
        'You do not make funding decisions — you extract and summarise evidence from the motivation text ' +
        'a consultant has attached to a case that was already routed for human review, so the reviewer has ' +
        'less to read. Respond with ONLY a JSON object matching this shape, no other text: ' +
        '{"confidence": <number 0-1>, "recommended_action": "APPROVED" | "DECLINED" | "MORE_INFO_REQUESTED" | null, ' +
        '"summary": <string>, "key_findings": [<string>], "concerns": [<string>]}. ' +
        'Set recommended_action to null and confidence low if the motivation text does not clearly support a ' +
        'recommendation — do not guess.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        icd10_code: input.icd10Code,
        tariff_code: input.tariffCode,
        nappi_code: input.nappiCode ?? null,
        routed_because: input.routingReasons,
        motivation_text: input.motivationText,
      }),
    },
  ];
}

function isRecommendedAction(value: unknown): value is RecommendedAction {
  return value === 'APPROVED' || value === 'DECLINED' || value === 'MORE_INFO_REQUESTED';
}

/**
 * Parses the model's JSON response defensively — it's an external
 * system's output, and a malformed/missing field must degrade to "we
 * couldn't extract anything reliable" rather than crash the request or
 * fabricate a value.
 */
export function parseExtractionResponse(raw: string): Omit<ExtractionResult, 'modelIdentifier' | 'endpointType'> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const confidence = typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1 ? parsed.confidence : 0;
    const recommendedAction = isRecommendedAction(parsed.recommended_action) ? parsed.recommended_action : null;
    return {
      confidence,
      recommendedAction,
      extractedEvidence: {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        keyFindings: Array.isArray(parsed.key_findings) ? parsed.key_findings.map(String) : [],
        concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String) : [],
      },
    };
  } catch {
    return {
      confidence: 0,
      recommendedAction: null,
      extractedEvidence: { summary: '', keyFindings: [], concerns: ['extraction response could not be parsed'] },
    };
  }
}

/**
 * Speaks the OpenAI-compatible chat-completions shape most self-hosted
 * model servers implement (vLLM, llama.cpp server, Ollama's compat mode,
 * a private Azure OpenAI/Bedrock deployment) — keeps this un-tied to one
 * vendor, matching the private-inference requirement rather than any
 * specific provider.
 */
export class HttpLlmClient implements LlmClient {
  constructor(private readonly config: LlmEndpointConfig) {}

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    // Re-checked on every call, not just at config load — a config that
    // was compliant at startup must still be compliant on every request.
    assertPopiaCompliant(this.config);

    const res = await fetch(this.config.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.config.modelIdentifier,
        messages: buildMessages(input),
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      throw new Error(`Layer B LLM endpoint returned ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Layer B LLM endpoint response did not include choices[0].message.content');
    }

    const parsed = parseExtractionResponse(content);
    return { ...parsed, modelIdentifier: this.config.modelIdentifier, endpointType: this.config.endpointType };
  }
}
