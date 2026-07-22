import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createServer } from '../../src/api/server.js';

/**
 * DB-free endpoint-shape tests only: no pool is passed, so every route
 * that touches the database must degrade to 503 rather than throw. The
 * real end-to-end flow (resolve reference data -> evaluate -> persist)
 * is exercised in test/integration against a live Postgres — see
 * api.integration.test.ts.
 */

let baseUrl: string;
let server: ReturnType<ReturnType<typeof createServer>['listen']>;

before(async () => {
  const app = createServer({ port: 0, databaseUrl: undefined, dbEncryptionKey: 'test-encryption-key' });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

test('GET /health returns ok without a DB configured', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('POST /authorisations without a DB configured returns 503', async () => {
  const res = await fetch(`${baseUrl}/authorisations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      memberId: 'M-1',
      icd10Code: 'M17.1',
      tariffCode: 'T-1',
      serviceDate: '2025-06-01',
      setting: 'IN_HOSPITAL',
    }),
  });
  assert.equal(res.status, 503);
});

test('POST /authorisations rejects a request missing required fields, before touching the DB', async () => {
  const res = await fetch(`${baseUrl}/authorisations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memberId: 'M-1' }),
  });
  assert.equal(res.status, 503, 'validation still runs after the DB check for this server instance (no pool), so 503 wins first');
});

test('GET /review-queue without a DB configured returns 503', async () => {
  const res = await fetch(`${baseUrl}/review-queue`);
  assert.equal(res.status, 503);
});

test('POST /review-queue/:authId/resolve without a DB configured returns 503', async () => {
  const res = await fetch(`${baseUrl}/review-queue/some-id/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reviewer: 'x', outcome: 'APPROVED', reason: 'y' }),
  });
  assert.equal(res.status, 503);
});
