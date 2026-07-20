# Phase-0 acquisition tracker

Definition of done per row: acquired, loaded to staging, validated by the
automated loader, human-verified against the source document, promoted to
a versioned live `rule_version` row. Until all rows show VERIFIED, Phase 2
(rules core) is blocked (Implementation Companion Part A).

| Dataset | Where to get it | Method | Difficulty | Owner | Target date | Acquired? | Loaded to staging? | Validated? | Human-verified by/when | Promoted (rule_version id) |
|---|---|---|---|---|---|---|---|---|---|---|
| CMS PMB ICD-10 coded list + 271 DTPs | medicalschemes.co.za -> PMB / publications | Download XLSX | Low | | | | | | | |
| Annexure C — per-option benefit tables (x6) | GEMS Scheme Rules page (2025) / 2025 Benefit Guide | OCR scanned Annexure; cross-check vs Benefit Guide text | High | | | | | | | |
| Annexure B — contributions + LJP bands | GEMS Scheme Rules page (2025) | OCR scanned PDF | High | | | | | | | |
| Annexure D — CDL + ACDL per option | GEMS Chronic Medicine Guide 2025 | Text extract | Low | | | | | | | |
| MPL / DRP / formulary + exclusion list | GEMS Formulary Lists page / Medikredit | Request data files; may need GEMS/Medscheme contact | Med | | | | | | | |
| Tariff modifiers + RMR codes | GEMS Provider FAQ | Text extract | Low | | | | | | | |
| Co-payment triggers | GEMS 2025/2026 benefit guides + 'What's New' | Text extract | Low | | | | | | | |
| Waiting-period + s29A rules | GEMS Underwriting Guide 2025 | Text extract | Low | | | | | | | |

Do not let a row sit without both an Owner and a Target date. Treat any
row with no progress as a project risk.
