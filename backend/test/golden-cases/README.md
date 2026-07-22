# Golden-case regression suite

The most valuable test asset per Technical Build Spec §8.1: worked
authorisation cases with known correct outcomes, spanning every gate and
pathway. Every rules change that breaks a golden case fails CI. See
`golden-cases.test.ts`.

Because Layer A's gates are pure functions over an already-resolved
`ReferenceData` bundle (`backend/src/engine/types.ts`), each case builds
its own self-contained fixture inline — no database needed to run this
suite. That's a deliberate architectural choice: it's what makes a fast,
deterministic regression suite possible against placeholder data now, and
it'll keep working unchanged once real Phase-0 data replaces the fixture
loaders — only `backend/src/engine/resolve-reference-data.ts` (the future
DB-backed glue between the API and these gates) needs to change.

| # | Case | Input | Expected output |
|---|---|---|---|
| 1 | Clean PMB approve | Active member, PMB ICD-10, DSP, protocol met | APPROVE, funding RISK_PMB, R0 |
| 2 | Non-network hospital | Elective, non-network facility, TZ1 | APPROVE + R15,000 co-pay |
| 3 | Elective scope 2026 | Gastroscopy, acute hospital | APPROVE + R1,000 co-pay |
| 4 | Waiting period block | New member <90 days prior cover, non-PMB | DECLINE (waiting window) |
| 5 | Late joiner | Age 50, 5 yrs cover | Approve + LJP 0.25x flagged |
| 6 | Out-of-formulary med | Non-formulary chronic (CDL) drug | APPROVE + 30% OF co-pay |
| 7 | Motivation needed | Off-protocol high-cost drug | ROUTE to Layer B |
| 8 | Limit exhausted, PMB | Oncology past rand limit, PMB dx | APPROVE at PMB level of care |
| 9 | Benefit exhausted, non-PMB | Day-to-day depleted, non-PMB | DECLINE |
| 10 | Bad ICD/procedure pair | Mismatched diagnosis vs procedure | ROUTE |
| 11 | PMB via CDL only | Chronic dx, no DTP, day-to-day chronic benefit exhausted | APPROVE at PMB entitlement |
| 12 | Chronic non-PMB (Annexure D "additional") | cdl_flag true but is_pmb false, benefit exhausted | DECLINE |
| 13 | Oncology specialised-drug sub-limit available | Two-tier oncology benefit_type, limit not exhausted | APPROVE, RISK_PMB, R0 |
| 14 | Oncology specialised-drug sub-limit exhausted | General oncology limit untouched, specialised tier depleted | APPROVE at PMB entitlement |
| 15 | HIV/AIDS clean approve | Formulary ART, DSP dispensing | APPROVE, RISK_PMB, R0 |
| 16 | HIV/AIDS off-formulary ART | Off-formulary ART, CDL-listed | APPROVE + 30% OF co-pay |
| 17 | HIV/AIDS benefit exhausted | Chronic medicine benefit_type depleted | APPROVE at PMB entitlement |
| 18 | PMB within waiting period | s29A scenario with pmb_covered=true, inside GWP window | APPROVE, not declined |

Cases 11-18 extend coverage to every pathway named in the task (PMB, chronic,
oncology, HIV) beyond the original 10 baseline cases, including two gate
branches the baseline suite never exercised: `cdl_flag` true with `is_pmb`
false (case 12), and Gate 7's `pmb_covered` bypass of an otherwise-declining
waiting period (case 18).

## Known simplifications (see code comments for the full list)

- **Case 10** routes because the ICD-10 code doesn't resolve at all, not
  because of a modelled diagnosis-procedure compatibility check — the
  §2.1 schema has no ICD10-to-Tariff crosswalk (Technical Build Spec
  §2.2's "critical join" is still blocked on Phase-0 data).
- **CSWP** (condition-specific waiting period) is not enforced — it needs
  a "pre-existing condition" flag the schema doesn't have. Only the GWP
  is checked in Gate 7.
- **benefit_type** is resolved from `tariff.category` — there's no
  separate procedure-to-benefit_type mapping table, so the two columns
  share one vocabulary by convention (see the loader fixtures).
