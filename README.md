# GEMS Pre-Authorisation Decision Engine

Internal pre-authorisation decision-support tool for GEMS medical-scheme benefits.
No live GEMS/Medscheme integration — the engine reads reference data the team
ingests and exposes an internal decision API to a consultant front-end.

See [`docs/`](docs/) for the full specification set. Start with
[`docs/README.md`](docs/README.md).

## Architecture in one paragraph

A layered monolith with two non-negotiable layers: **Layer A** is a
deterministic rules core — ten fixed gates evaluated in order against
structured input (member, ICD-10, tariff/NAPPI, benefit balances), each
resolving to pass / fail / ROUTE, never a confidence score. **Layer B** is
ML/human triage — it reads unstructured input (motivation letters, clinical
notes), produces a confidence score, and hands anything uncertain to a human
review queue. Layer B never overrides a Layer-A PMB decline. Rules are
data: the gate sequence is fixed code, but thresholds, limits, co-payments
and formulary prices are versioned rows in Postgres, so a benefit-year
change is a data load, not a deploy.

## Repo layout

```
backend/    TypeScript engine: Layer A gates, Layer B triage stub, ingestion
            loaders, decision API
db/         Postgres schema migrations + seed data
frontend/   Consultant web UI (React/Vite)
docs/       Specification set (read this first)
data/       Phase-0 data-acquisition workspace (tracker + staged datasets)
scripts/    Dataset load / promote / rollback CLIs
```

## Status

**Phase 1 complete**: Postgres schema for every §2.1 entity, a generic
ingestion pipeline (stage -> validate -> human-verify -> promote), and
fixture loaders for every reference table. Phase 0 (real CMS PMB codes,
OCR'd Annexure B/C, MPL/DRP data) is still not acquired — see
`docs/implementation-companion.md` Part A and `data/phase0/tracker.md`.

**Layer A (rules core) implemented**: all 10 gates (`backend/src/engine`),
the late-joiner-penalty formula, the medicine co-payment stack and flat
co-payment triggers, and full §4.3 decision-object assembly — as pure
functions over an already-resolved `ReferenceData` bundle, so the
10-case golden regression suite (`backend/test/golden-cases`) runs
without a database. `POST /authorisations` still returns Phase 1's
hard-coded stub, not a real decision — wiring a DB-backed resolver
between the API and `evaluateAuthorisation()` is the next step, along
with Layer B (still untouched).

## Getting started

Requires a local Postgres instance (see `backend/.env.example` for the
expected connection strings — `DATABASE_URL` for dev, `TEST_DATABASE_URL`
for the migration test suite, both defaulting to `postgres/postgres` on
`127.0.0.1:5432`).

```
npm install
npm run build                                  # backend
npm run migrate --workspace backend -- up      # apply schema to DATABASE_URL
npm run db:seed --workspace backend            # fixture members (plain SQL)
npm run seed:fixtures --workspace backend      # fixture reference data, via the ingestion pipeline
npm run dev --workspace backend                # POST /authorisations (still the Phase 1 stub), GET /health
npm test --workspace backend                   # unit + golden-cases + integration (needs Postgres — see test:unit/test:golden for DB-free subsets)
```
