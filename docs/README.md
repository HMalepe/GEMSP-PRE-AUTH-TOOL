# Documentation index

| File | Source | Covers |
|---|---|---|
| `technical-build-spec.md` | *GEMS PreAuth Technical Build Spec* (supplied .docx) | Solution architecture, data model, ingestion, rules-engine design, ML/human triage layer, NFRs, security/POPIA, testing strategy, phased delivery plan. The engineering blueprint. |
| `implementation-companion.md` | *GEMS PreAuth Implementation Companion* (supplied .docx) | Part A: Phase-0 data-acquisition checklist. Part B: technology-stack decision guide. Part C: consultant front-end UX spec. |
| `gems-annexures-compilation.md` | *GEMS 2025/2026 Scheme Rules Annexures and Benefit Guides — Extracted Contents Compilation* (supplied .pdf) | Raw domain data: per-option 2025 benefit grids, chronic (CDL/ACDL) conditions, oncology limits, co-payment triggers, waiting-period/LJP rules, tariff modifiers/RMR codes. This is domain artifact #4 referenced by the Technical Build Spec. |

## Known gap

The Technical Build Spec (§0) references a *"Pre-Authorisation Rules-Engine Specification (v2)"* as one of four domain-research artifacts feeding it (the pre-auth framework, a verification pass, the operational decision-table layer, and the extracted annexures/guides above). That standalone v2 document was not supplied to this repo — only its outputs were: the Technical Build Spec quotes the corrected 10-gate sequence directly (§4.2), and the annexures compilation supplies the underlying benefit/co-payment/waiting-period data. If the original v2 rules-engine spec exists, add it here as `rules-engine-spec.md`; until then, treat §4.2 of the Technical Build Spec as the authoritative gate sequence.

## Reading order

1. `implementation-companion.md` Part A — the actual long pole (Phase-0 data acquisition) and the thing to start first.
2. `technical-build-spec.md` — architecture and how the engine is built.
3. `implementation-companion.md` Parts B & C — stack decision and consultant UX, once the shape of the engine is clear.
4. `gems-annexures-compilation.md` — reference when encoding actual gate logic/thresholds (all figures need re-verification against acquired source datasets before production use, per both documents' own caveats).
