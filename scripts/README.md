# Ops scripts

Placeholder for the dataset load / promote / rollback CLIs implied by
Technical Build Spec §3.2 ("a dataset can be rolled back to the prior
version in one operation") and §9 (Phase 1 exit criteria: "datasets
queryable").

Intended, not yet built (each wraps the loaders in `backend/src/ingestion`
once a dataset is real):

- `load-dataset` — run one `DatasetLoader` against an acquired source file,
  writing to staging.
- `promote-dataset` — move a human-verified staging load to a live
  `rule_version` row.
- `rollback-dataset` — revert to the prior `rule_version` for a benefit
  year in one operation.

No code here yet — building these against stub loaders would just be more
stubs. Wire them once the first real loader (`loadModifiersRmr` or
`loadCopaymentTriggers` are the least-blocked, per
`data/phase0/tracker.md`) has data to load.
