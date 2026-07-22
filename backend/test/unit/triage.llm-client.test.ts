import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseExtractionResponse } from '../../src/triage/llm-client.js';

test('parseExtractionResponse: parses a well-formed response', () => {
  const result = parseExtractionResponse(
    JSON.stringify({
      confidence: 0.95,
      recommended_action: 'APPROVED',
      summary: 'Motivation supports off-protocol use.',
      key_findings: ['prior line failed', 'contraindication to formulary option'],
      concerns: [],
    }),
  );
  assert.equal(result.confidence, 0.95);
  assert.equal(result.recommendedAction, 'APPROVED');
  assert.equal(result.extractedEvidence.keyFindings.length, 2);
});

test('parseExtractionResponse: never guesses a recommendation the model did not give', () => {
  const result = parseExtractionResponse(JSON.stringify({ confidence: 0.4, recommended_action: null, summary: 'Unclear.' }));
  assert.equal(result.recommendedAction, null);
});

test('parseExtractionResponse: rejects an invalid recommended_action value rather than passing it through', () => {
  const result = parseExtractionResponse(JSON.stringify({ confidence: 0.9, recommended_action: 'MAYBE', summary: 'x' }));
  assert.equal(result.recommendedAction, null);
});

test('parseExtractionResponse: clamps out-of-range confidence to 0 rather than trusting it', () => {
  const result = parseExtractionResponse(JSON.stringify({ confidence: 1.5, recommended_action: 'APPROVED', summary: 'x' }));
  assert.equal(result.confidence, 0);
});

test('parseExtractionResponse: malformed JSON degrades to zero-confidence, not a crash', () => {
  const result = parseExtractionResponse('not json at all {{{');
  assert.equal(result.confidence, 0);
  assert.equal(result.recommendedAction, null);
  assert.ok(result.extractedEvidence.concerns.length > 0);
});

test('parseExtractionResponse: missing fields default safely', () => {
  const result = parseExtractionResponse(JSON.stringify({}));
  assert.equal(result.confidence, 0);
  assert.equal(result.recommendedAction, null);
  assert.deepEqual(result.extractedEvidence, { summary: '', keyFindings: [], concerns: [] });
});
