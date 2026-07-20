# Golden-case regression suite

The most valuable test asset per Technical Build Spec §8.1: worked
authorisation cases with known correct outcomes, spanning every gate and
pathway. Every rules change that breaks a golden case must fail CI.

Blocked until Phase-0 reference data is loaded (a golden case needs real
ICD-10/DTP/benefit-limit/co-payment data to assert a real decision against —
see `docs/implementation-companion.md` Part A). Once unblocked, add one
fixture file per row below and wire a runner that feeds it through
`runGateSequence` + `buildDecision`.

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
