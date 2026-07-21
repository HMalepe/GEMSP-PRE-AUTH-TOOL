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

| Case | Input | Expected output |
|---|---|---|
| Clean PMB approve | Active member, PMB ICD-10, DSP, protocol met | APPROVE, funding RISK_PMB, R0 |
| Non-network hospital | Elective, non-network facility, TZ1 | APPROVE + R15,000 co-pay |
| Elective scope 2026 | Gastroscopy, acute hospital | APPROVE + R1,000 co-pay |
| Waiting period block | New member <90 days prior cover, non-PMB | DECLINE (waiting window) |
| Late joiner | Age 50, 5 yrs cover | Approve + LJP 0.25x flagged |
| Out-of-formulary med | Non-formulary chronic drug | APPROVE + 30% OF co-pay |
| Motivation needed | Off-protocol high-cost drug | ROUTE to Layer B |
| Limit exhausted, PMB | Oncology past rand limit, PMB dx | APPROVE at PMB level of care |
| Benefit exhausted, non-PMB | Day-to-day depleted, non-PMB | DECLINE |
| Bad ICD/procedure pair | Mismatched diagnosis vs procedure | ROUTE |

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
