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

Scaffolding only. Phase 0 (CMS PMB codes, OCR'd Annexure B/C, MPL/DRP data)
is not yet acquired — see `docs/implementation-companion.md` Part A. Gate
and loader modules are stubs until that data lands; wiring real decisions
against placeholder data is explicitly out of scope until then.

## Getting started

```
npm install
npm run build   # backend
npm test        # backend unit tests (gate orchestrator sequencing)
```

A local Postgres instance and `DATABASE_URL` are required for migrations
(`npm run migrate`) — see `backend/.env.example`.
