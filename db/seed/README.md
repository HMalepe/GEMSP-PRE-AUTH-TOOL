# Seed data

Non-production only. Real reference data (PMB codes, benefit limits,
formulary prices, co-payment rules, etc.) is loaded through the ingestion
pipeline (`backend/src/ingestion`) as versioned `rule_version` rows, not
through seed scripts — see `docs/technical-build-spec.md` §3.

This directory is for local-dev/test fixtures only (e.g. a handful of
synthetic members and options to exercise the API skeleton before Phase-0
data is acquired).
