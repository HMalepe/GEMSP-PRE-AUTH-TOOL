import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { authenticate, requireRole, type AuthenticatedRequest } from '../../src/security/auth.js';

function makeRes() {
  const res: { statusCode?: number; body?: unknown; status: (n: number) => typeof res; json: (b: unknown) => typeof res } = {
    status(n: number) {
      res.statusCode = n;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
  };
  return res;
}

function makePool(rows: Record<string, unknown>[]): Pool {
  return { query: async () => ({ rows }) } as unknown as Pool;
}

test('authenticate: 401 when X-User-Id header is missing', async () => {
  const pool = makePool([]);
  const req = { header: () => undefined } as unknown as import('express').Request;
  const res = makeRes();
  let nextCalled = false;
  await authenticate(pool)(req, res as unknown as import('express').Response, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('authenticate: 401 for an unknown user_id', async () => {
  const pool = makePool([]);
  const req = { header: () => 'nobody' } as unknown as import('express').Request;
  const res = makeRes();
  await authenticate(pool)(req, res as unknown as import('express').Response, () => undefined);
  assert.equal(res.statusCode, 401);
});

test('authenticate: 401 for an inactive user', async () => {
  const pool = makePool([{ user_id: 'x', name: 'X', role: 'admin', active: false }]);
  const req = { header: () => 'x' } as unknown as import('express').Request;
  const res = makeRes();
  await authenticate(pool)(req, res as unknown as import('express').Response, () => undefined);
  assert.equal(res.statusCode, 401);
});

test('authenticate: attaches req.user and calls next() for a known active user', async () => {
  const pool = makePool([{ user_id: 'dr.consultant', name: 'Dr. Consultant', role: 'consultant', active: true }]);
  const req = { header: () => 'dr.consultant' } as unknown as AuthenticatedRequest;
  const res = makeRes();
  let nextCalled = false;
  await authenticate(pool)(req, res as unknown as import('express').Response, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, undefined);
  assert.deepEqual(req.user, { userId: 'dr.consultant', name: 'Dr. Consultant', role: 'consultant' });
});

test('requireRole: 401 when req.user is missing (should be unreachable behind authenticate, but must fail closed)', () => {
  const req = {} as AuthenticatedRequest;
  const res = makeRes();
  let nextCalled = false;
  requireRole('admin')(req, res as unknown as import('express').Response, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('requireRole: 403 for a role not in the allowed list', () => {
  const req = { user: { userId: 'x', name: 'X', role: 'consultant' } } as AuthenticatedRequest;
  const res = makeRes();
  let nextCalled = false;
  requireRole('admin', 'clinical_maintainer')(req, res as unknown as import('express').Response, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('requireRole: calls next() for an allowed role', () => {
  const req = { user: { userId: 'x', name: 'X', role: 'admin' } } as AuthenticatedRequest;
  const res = makeRes();
  let nextCalled = false;
  requireRole('admin', 'clinical_maintainer')(req, res as unknown as import('express').Response, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, undefined);
});
