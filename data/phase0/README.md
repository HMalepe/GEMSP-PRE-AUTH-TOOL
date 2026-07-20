# Phase-0 data-acquisition workspace

Phase 0 is the critical path (Implementation Companion Part A): the engine
is only as good as the reference data loaded into it, and three datasets
are not machine-readable off the web. Nothing in `backend/src/ingestion`
can be wired to real logic until the relevant row below is VERIFIED.

- `raw/` — acquired source files (XLSX downloads, scanned Annexure PDFs,
  formulary data files). Gitignored — these are large/binary and not code.
- `ocr-staging/` — OCR output pending human verification against source.
  Gitignored for the same reason.
- `tracker.md` — the acquisition tracker (copy of Implementation Companion
  §A.1), kept in git since it's small and is the actual project-management
  artifact.

See `docs/implementation-companion.md` Part A for the full checklist,
what "good" looks like per dataset (§A.2), and the OCR workflow (§A.3).
