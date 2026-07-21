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

**Phase 1 (ingestion) + Layer A (rules core) + real API wiring, all
complete.** Postgres schema for every §2.1 entity, a generic ingestion
pipeline (stage -> validate -> human-verify -> promote) with fixture
loaders for every reference table, all 10 gates as pure functions, the
late-joiner-penalty formula, the co-payment stack, and full §4.3 decision
assembly. `POST /authorisations` now runs the real thing end to end:
validate the request -> resolve reference data from Postgres -> run the
gate sequence -> persist to `auth_decision` -> respond. The 10-case
golden regression suite runs without a database (gates are pure); a
separate integration suite exercises the real HTTP+DB path.

**Layer B v1**: the human review queue (`backend/src/triage/queue.ts`,
`GET /review-queue`, `GET /review-queue/:authId`,
`POST /review-queue/:authId/resolve`) — a ROUTE decision is "pending"
until a reviewer resolves it with a mandatory reason, which becomes the
audit trail and future labelled training data (Technical Build Spec
§5.2). The LLM confidence-scoring half of Layer B is deliberately not
built yet — building it now, with no real decision log and no LLM
credentials configured, is exactly the overbuilding the spec warns
against; `backend/src/triage/index.ts` documents this.

Phase 0 (real CMS PMB codes, OCR'd Annexure B/C, MPL/DRP data) is still
not acquired — everything above runs on placeholder fixture data. See
`docs/implementation-companion.md` Part A and `data/phase0/tracker.md`.

**Consultant front-end**: all five screens from Implementation Companion
Part C, wired to the real API — New authorisation request (keyboard-first,
every coded field autocompletes against reference data, no free-text
entry), Decision result + evidence trail (colour-coded banner, always-on
money line, collapsible gate-by-gate pass/fail evidence), Review queue
(pre-assembled evidence, resolve with mandatory reason), Override
(mandatory reason, writes to the immutable `decision_override` log), and
History & audit lookup (search by member/date/auth id/code, full decision
object + rules_version). Verified end-to-end in a real browser (Playwright
against the built app, not just typechecked): submit -> approve, submit ->
route -> resolve, override, and history search all confirmed working
against live Postgres data. Deliberately not built, per Companion §C.7: a
member-facing portal, free-text code entry, autonomous ML approval,
batch/bulk processing, or a rules-editing UI.

## Getting started

Requires a local Postgres instance (see `backend/.env.example` for the
expected connection strings — `DATABASE_URL` for dev, `TEST_DATABASE_URL`
for the integration test suite, both defaulting to `postgres/postgres` on
`127.0.0.1:5432`).

```
npm install
npm run build                                  # backend + frontend
npm run migrate --workspace backend -- up      # apply schema to DATABASE_URL
npm run db:seed --workspace backend            # fixture members (plain SQL)
npm run seed:fixtures --workspace backend      # fixture reference data, via the ingestion pipeline
npm run dev --workspace backend                # backend on :3000
npm run dev --workspace frontend               # frontend on :5173, proxies /api to the backend
npm test --workspace backend                   # unit + golden-cases + integration (needs Postgres — see test:unit/test:golden for DB-free subsets)
```
