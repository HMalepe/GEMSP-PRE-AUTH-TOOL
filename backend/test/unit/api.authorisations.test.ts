import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createServer } from '../../src/api/server.js';

let baseUrl: string;
let server: ReturnType<ReturnType<typeof createServer>['listen']>;

before(async () => {
  const app = createServer({ port: 0, databaseUrl: undefined });
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

test('POST /authorisations returns a hard-coded decision matching the §4.3 contract', async () => {
  const res = await fetch(`${baseUrl}/authorisations`, { method: 'POST' });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(Object.keys(body).sort(), [
    'auth_id',
    'caveat',
    'co_payment',
    'decision',
    'funding_source',
    'length_of_stay',
    'reasons',
    'reimbursement_basis',
    'rules_version',
  ].sort());

  assert.equal(body.decision, 'APPROVE');
  assert.match(body.auth_id, /^[0-9a-f-]{36}$/i);
  assert.equal(body.funding_source, 'RISK_PMB');
  assert.deepEqual(body.co_payment, { amount: 1000, reason: 'elective scope' });
  assert.equal(body.reimbursement_basis, '100% Scheme Rate');
  assert.deepEqual(body.length_of_stay, { days: 2, level: 'general ward' });
  assert.ok(Array.isArray(body.reasons) && body.reasons.length > 0);
  assert.equal(typeof body.rules_version, 'string');
  assert.equal(body.caveat, 'Not a guarantee of payment; re-adjudicated at claim stage');
});

test('POST /authorisations returns a fresh auth_id on every call', async () => {
  const [first, second] = await Promise.all([
    fetch(`${baseUrl}/authorisations`, { method: 'POST' }).then((r) => r.json()),
    fetch(`${baseUrl}/authorisations`, { method: 'POST' }).then((r) => r.json()),
  ]);
  assert.notEqual(first.auth_id, second.auth_id);
});
