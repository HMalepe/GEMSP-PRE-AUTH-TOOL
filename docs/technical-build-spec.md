Technical Build Specification
GEMS Pre-Authorisation Decision Engine — Internal Tool
Solution architecture, data model, rules design, ML triage layer, NFRs & delivery plan
For the senior engineer. This is the how it is built and run layer that sits on top of the domain rules already documented in the Pre-Authorisation Rules-Engine Specification (v2) and the extracted GEMS annexures/guides. Read those two as the functional-requirements input; read this as the engineering blueprint.
| Field | Value |
| Deliverable | Internal pre-authorisation decision engine (no GEMS/Medscheme integration) |
| Primary users | Pre-auth consultants + a rules/clinical maintainer |
| Scope boundary | Reads reference data your team ingests; does not call GEMS or Medikredit live |
| Architecture posture | Deterministic rules core (Layer A) + ML/human triage (Layer B) |
| Hard dependency | Phase 0 data acquisition (CMS PMB codes, Annexure C, MPL/DRP) before rules coding |
| Compliance | POPIA — processing special-category health data of GEMS members |


# 0. Read this first — what this document is and is not

The domain research produced four artifacts: (1) the pre-auth framework, (2) a verification pass, (3) the operational decision-table layer, and (4) the extracted GEMS annexures/guides. Together they answer WHAT the rules are. They are roughly 40% of a build spec — the functional-requirements 40%. This document supplies the remaining 60%: data model, engine design, ML layer, non-functional requirements, security, testing and delivery.
| The single most important thing on this page You cannot start coding rules against data you do not yet hold. Three datasets are not public and must be acquired first (Section 3.1 / Phase 0): the CMS PMB ICD-10 + 271-DTP code lists, the GEMS Annexure C per-option benefit tables (scanned images — need OCR), and the Medikredit MPL/DRP formulary files. Treat Phase 0 as a gate. Everything downstream (PMB gate, co-payment calc, formulary check) is blocked until it is done. Building the shell first is fine; wiring real decisions is not, until the data lands. |

Because this is an internal tool with no GEMS integration, there are no live API contracts to GEMS/Medscheme, no real-time membership handshake and no live claim adjudication feed. That removes a large surface of complexity. In its place, the critical engineering work becomes reference-data ingestion (loading and versioning the datasets your team obtains) and a clean internal decision API that your own front-end consumes.

# Contents


# 1. Solution architecture

A layered monolith is the right first cut — not microservices. The domain is bounded, the team is small, and the rules change on a yearly cadence, not continuously. Keep it deployable as one unit; split only if load or team size later demands it.

## 1.1 Component view

```
┌─ Presentation ─────────────────────────────────┐
│  Consultant web UI (auth request + evidence view) │
└──────────────────────┬──────────────────────────┘
                        │ (internal REST/JSON)
                        ▼
┌─ Application / Decision API ─────────────────────┐
│  Orchestrates the gate sequence, builds output    │
└───────────────────────┬──────────────────────────┘
              ┌──────────┴──────────┐
              ▼                     ▼
┌─ Layer A: Rules core ─┐   ┌─ Layer B: ML triage ──┐
│ deterministic gates   │   │ reads unstructured    │
│ 100% or ROUTE         │   │ confidence + human    │
└───────────┬───────────┘   └───────────┬────────────┘
            └──────────────┬────────────┘
                            ▼
┌─ Reference-data store ────────────────────────────┐
│ PMB codes · Annexure C limits · MPL/DRP · rules    │
│ (versioned by benefit year)                        │
└─────────────────────────────────────────────────────┘
```


## 1.2 The two layers (non-negotiable separation)

|  | Layer A — Rules core | Layer B — ML / human triage |
| Input | Structured: option, ICD-10, tariff/NAPPI, balances | Unstructured: motivation letters, clinical notes, quotes |
| Output | Deterministic per gate (pass / fail / ROUTE) | Confidence score + recommended action to a human |
| Tech | Decision tables / rules engine | NLP model + review queue UI |
| Confidence? | NO — it is 100% or it routes | YES — this is the only place it exists |
| Failure mode | “Unknown” → route, never guess | Low confidence → human decides |

| Build order within the architecture Ship Layer A first and route 100% of unstructured/edge cases to a human queue. Layer B is a fast-follow that shrinks that queue over time. A working deterministic core with an honest manual queue beats a half-trained model that guesses. |


# 2. Data model

The engine is fundamentally a set of joins across coded reference data plus a member/benefit-balance context. The core relational schema:

## 2.1 Core entities

| Entity | Key fields | Notes |
| Member | member_id, option_code, status, join_date, prior_cover_months, dob | Status drives Gate 0; join/prior-cover drive Gate 7 |
| Dependant | dependant_code, member_id, dob, join_date | Late-add → waiting-period logic |
| Option | option_code, name, network_type (REO/network/open), benefit_year | Six options; benefit design keys off this |
| BenefitLimit | option_code, benefit_type, sub_limit, basis (pbpa/pfpa), benefit_year | From Annexure C / benefit guide |
| BenefitBalance | member_id, benefit_type, used, available, benefit_year | Running balance; Gate 4 |
| ICD10 | code, description, is_pmb, dtp_id, cdl_flag | From CMS PMB coded list |
| DTP | dtp_id, description, pmb_level_of_care | 271 diagnosis-treatment pairs |
| Tariff | code, description, requires_preauth, category | Procedure/RPL codes + trigger flag |
| Nappi | nappi_code, product, mpl_price, drp_price, formulary_flag | Medikredit medicine/appliance data |
| Modifier | code, effect_rule | 0009/0011/0013/0018/0074/0075 |
| NetworkProvider | practice_no, provider_type, network_membership, option_scope | Gate 6 validation |
| CoPaymentRule | trigger, option_code, amount_or_pct, benefit_year | R1,000 / R15,000 / 30% logic |
| WaitingPeriodRule | scenario, gwp_months, cswp_months, pmb_covered | s29A / Rule 8.3 |
| AuthDecision | auth_id, member_id, codes, decision, funding_source, copay, los, reasons[], created_at, rules_version | The output object + audit record |
| RuleVersion | version_id, benefit_year, effective_from, source_doc, checksum | Every dataset load is versioned |


## 2.2 The critical join

The heart of the engine is the diagnosis ↔ procedure ↔ medicine cross-check. A valid request resolves:

```
ICD10.code ── is_pmb? ──► DTP.pmb_level_of_care
     │
     └─ cross-check ──► Tariff.code (procedure valid for dx?)
                              │
                              └──► Nappi.code (medicine/device)
                                        │
                                        └──► MPL/DRP price → co-pay
```

| Data-quality rule ICD-10 and PMB codes can disagree; the CMS PMB code prevails. Encode that precedence in the ICD10 loader, not in application logic scattered across gates. |


# 3. Reference-data ingestion (replaces ‘integration’)

Because there is no live GEMS integration, the engine is only as good as the reference data your team loads. Ingestion is therefore the highest-risk subsystem. Design it as a versioned, validated, repeatable pipeline — not a one-off import.

## 3.1 Datasets, sources & extractability

| Dataset | Source | Format / effort | Status |
| PMB ICD-10 + 271 DTPs | CMS (medicalschemes.co.za) | XLSX download | ACQUIRE |
| Per-option benefit limits | GEMS Annexure C / 2025 Benefit Guide | Guide = text; Annexure C = scanned → OCR | OCR |
| Contributions + LJP bands | GEMS Annexure B | Scanned → OCR | OCR |
| CDL / ACDL per option | GEMS Annexure D + Chronic Guide | Guide text extractable | READY |
| MPL / DRP / formulary | Medikredit / GEMS Formulary Lists | Data files | ACQUIRE |
| Modifiers + RMR codes | GEMS Provider FAQ | Text | READY |
| Co-payment triggers | GEMS benefit guides / What's New | Text | READY |
| Waiting-period rules | GEMS Underwriting Guide (s29A) | Text | READY |


## 3.2 Ingestion pipeline requirements

Each dataset load creates a RuleVersion row (benefit_year, source_doc, checksum, effective_from). Nothing enters the engine unversioned.
Loaders validate on import: schema conformance, referential integrity (every DTP referenced by an ICD-10 exists), no orphan codes, price sanity ranges.
OCR outputs (Annexure B/C) go through a mandatory human verification step — a reviewer signs off the extracted table against the source PDF before it is promoted from staging to live.
Support parallel benefit years: 2025 and 2026 datasets coexist; a request resolves against the year effective on its service date.
A dataset can be rolled back to the prior version in one operation if a bad load is detected.
| Why this matters more than anything else A wrong co-payment or a missed PMB is almost always a data error, not a logic error. Invest here. The rules engine is simple; the data discipline is what makes it world-class. |


# 4. Rules engine design (Layer A)


## 4.1 Build vs buy

Two viable approaches. Both are defensible; pick on team skill and change-frequency.
| Option | Pros | Cons | Recommended when |
| Data-driven decision tables (rules as data rows in the DB) | Non-devs (clinical maintainer) can edit; versioned with data; no redeploy | You build the evaluator | Small team, yearly change cadence — the likely fit |
| Rules engine (Drools / json-rules-engine / JSON-Logic) | Mature evaluation, chaining | Rules in a separate DSL; another skill to maintain | Rules grow complex / conditional chaining deepens |

Recommendation for an internal tool with yearly rule changes: data-driven decision tables stored in the reference-data store and versioned alongside the benefit data. The gate sequence is fixed code; the thresholds, limits and co-payments are data. This lets the clinical maintainer change a co-payment for 2026 without a code deploy.

## 4.2 The gate sequence (fixed order, fail-fast)

Encode the corrected order from the v2 spec. PMB is evaluated early because it overrides benefit exhaustion.
| # | Gate | Reads | On fail |
| 0 | Member active/eligible | Member.status | Decline |
| 1 | Auth required? | Tariff.requires_preauth | Skip → claim rules |
| 2 | ICD-10 valid & codable | ICD10 + Tariff/Nappi | Route |
| 3 | PMB status (early) | ICD10.is_pmb + DTP | Continue (not PMB) |
| 4 | Benefit/limit available | BenefitBalance | Decline unless PMB |
| 5 | Procedure covered/coded | Tariff + Modifier | Decline / route |
| 6 | Network/DSP compliant | NetworkProvider | Approve + co-pay |
| 7 | Waiting period/late joiner | WaitingPeriodRule | Decline window / apply LJP |
| 8 | Protocol/step therapy | formulary + criteria | Route to Layer B |
| 9 | Co-payment calc + output | CoPaymentRule + all | Emit decision object |


## 4.3 The decision object (engine output contract)

```json
{
  "decision": "APPROVE | DECLINE | ROUTE",
  "auth_id": "uuid",
  "funding_source": "RISK_PMB | DAY_TO_DAY | PMSA",
  "co_payment": { "amount": 1000, "reason": "elective scope" },
  "reimbursement_basis": "100% Scheme Rate",
  "length_of_stay": { "days": 2, "level": "general ward" },
  "reasons": [ "member active", "ICD-10 M17.1 eligible", "..." ],
  "rules_version": "2025.3",
  "caveat": "Not a guarantee of payment; re-adjudicated at claim stage"
}
```


# 5. ML / human-triage layer (Layer B)

Layer B exists to shrink the human queue, not to make funding decisions autonomously. Scope it modestly for v1.

## 5.1 What it does

Classifies and extracts from unstructured inputs: motivation letters, clinical notes, quotations, histology/staging reports.
Produces a confidence score and a recommended action; below a threshold, or for any high-cost / experimental / appeal case, it hands to a human with the evidence pre-assembled.
Never overrides a Layer-A decline on PMB care; it surfaces the motivation for a human clinician to decide.

## 5.2 Pragmatic v1

| Concern | v1 recommendation |
| Model | Start with a hosted LLM for extraction/classification + rules on the output; defer a bespoke trained model until you have labelled volume |
| Training data | Log every human decision on routed cases from day one — that becomes your labelled set |
| Confidence threshold | Set high initially (e.g. auto-suggest only >0.9); tune down as accuracy is proven |
| Human-in-the-loop | Mandatory review queue; consultant one-click approves or overrides; both outcomes logged |
| Guardrail | PHI leaves the internal boundary only if POPIA-compliant; prefer on-prem/private inference for health data |

| Do not overbuild this first A rules core with a disciplined manual queue is a shippable product. Layer B is an optimisation. Resist training a model before you have logged decisions to train it on. |


# 6. Non-functional requirements

| Category | Requirement / target |
| Latency | Layer-A decision < 500 ms p95 (in-memory reference data); routed cases async |
| Throughput | Size to peak concurrent consultants × requests/hour; a monolith on modest hardware suffices |
| Availability | Business-hours critical; define RTO/RPO; nightly backups of decision + audit log |
| Rule updates | New benefit-year datasets loaded WITHOUT redeploy (data-driven rules); staged → verified → promoted |
| Auditability | Every decision persisted immutably with inputs, rules_version and reasons — reconstructable years later |
| Explainability | Every APPROVE/DECLINE returns the ordered reasons that produced it; no black-box outcomes in Layer A |
| Observability | Structured logs, decision metrics (approve/decline/route rates), data-load audit trail |
| Testability | Golden-case regression suite runs on every build (Section 8) |


# 7. Security & POPIA compliance

The engine processes members’ special-category health information (diagnoses, HIV status, medicines). POPIA obligations apply even though it is internal.
Lawful basis & minimisation: process only the fields a decision needs; do not import full clinical records where a code suffices.
Access control: role-based (consultant, clinical maintainer, admin, auditor); least privilege; named accounts, no shared logins.
Encryption: at rest (DB + backups) and in transit (TLS internally); segregate the reference store from PHI.
Audit trail: who viewed/decided what, when — immutable and retained per policy.
HIV confidentiality: mirror GEMS’s confidential-DMP posture; restrict HIV-flagged records to authorised roles.
Layer-B data boundary: if using a hosted LLM, ensure a POPIA-compliant processing agreement or keep inference on-prem for PHI.
De-identification: use de-identified data for model training and test fixtures.

# 8. Testing strategy


## 8.1 Golden-case regression suite

The most valuable asset. Build a set of worked authorisation cases with known correct outcomes, spanning every gate and pathway. Run on every build; a rules change that breaks a golden case fails CI.
| Case | Input | Expected output |
| Clean PMB approve | Active member, PMB ICD-10, DSP, protocol met | APPROVE, funding RISK_PMB, R0 |
| Non-network hospital | Elective, non-network facility, TZ1 | APPROVE + R15,000 co-pay |
| Elective scope 2026 | Gastroscopy, acute hospital | APPROVE + R1,000 co-pay |
| Waiting period block | New member <90 days prior cover, non-PMB | DECLINE (waiting window) |
| Late joiner | Age 50, 5 yrs cover | Approve + LJP 0.25× flagged |
| Out-of-formulary med | Non-formulary chronic drug | APPROVE + 30% OF co-pay |
| Motivation needed | Off-protocol high-cost drug | ROUTE to Layer B |
| Limit exhausted, PMB | Oncology past rand limit, PMB dx | APPROVE at PMB level of care |
| Benefit exhausted, non-PMB | Day-to-day depleted, non-PMB | DECLINE |
| Bad ICD/procedure pair | Mismatched diagnosis vs procedure | ROUTE |


## 8.2 Other test layers

Unit tests per gate; property tests on the co-payment calculator.
Data-load validation tests (reject malformed Annexure/CMS imports).
Benefit-year boundary tests (service date resolves to correct dataset).
Layer-B: precision/recall on a held-out labelled set; monitor drift.

# 9. Phased delivery plan

| Phase | Goal | Exit criteria |
| Phase 0 — Data acquisition (GATE) | Obtain & verify CMS PMB codes, Annexure B/C (OCR), MPL/DRP | All datasets loaded, versioned, human-verified in staging |
| Phase 1 — Skeleton | Data model, ingestion pipeline, reference store, internal API shell | Datasets queryable; API returns stub decisions |
| Phase 2 — Rules core (Layer A) | Encode gate sequence + decision tables; co-payment calc; output object | Golden-case suite green; consultant UI can get real decisions |
| Phase 3 — Human queue | Route all edge/unstructured cases to a review UI; log every decision | Consultants working live off Layer A + manual queue |
| Phase 4 — ML triage (Layer B) | Add extraction/classification on the logged data; confidence gating | Queue volume measurably reduced; accuracy tracked |
| Phase 5 — Hardening | NFRs, POPIA audit, rollback drills, yearly-update rehearsal | 2026 dataset swaps in with no redeploy; audit passes |

| The honest critical path Phase 0 is the real long pole — it is procurement and OCR, not coding. Start it today, in parallel with Phase 1 scaffolding. Do not let the team build elaborate rules logic against placeholder data; it will be re-worked when the real tables land. |


# 10. Does your dev now have enough?

With this document plus the earlier four artifacts, the answer is: enough to start Phases 0–2 confidently. Honestly stated, here is the coverage and the residual gaps.

## 10.1 Now covered

WHAT the rules are (four domain artifacts): gates, PMB/chronic/oncology/HIV pathways, co-payments, waiting periods, network/DSP, modifiers, RMR codes, per-option limits.
HOW to build it (this document): architecture, data model, ingestion, rules-engine choice, ML layer, NFRs, security, testing, delivery.

## 10.2 Residual gaps your dev must close

The data itself (Phase 0). Documents describe the datasets; they are not the datasets. CMS codes, Annexure B/C and MPL/DRP must be acquired and OCR-verified.
Internal environment specifics. Language/framework, hosting, existing auth/SSO, DB platform and backup tooling are your team’s house decisions — this spec is deliberately stack-agnostic.
Front-end detailed UX. The consultant screen (request form, evidence panel, one-click approve, override capture) needs its own UI spec.
Governance. Who signs off a rule/data change; the yearly re-registration workflow; clinical accountability for routed decisions.
Bottom line: this is a build-ready blueprint for an internal engine, gated on Phase-0 data acquisition. It is stack-agnostic by design so your senior dev owns the implementation choices. Pair it with the v2 rules spec and the extracted-annexures compilation as the functional input.
Prepared as an internal working blueprint. All benefit figures, codes and limits must be verified against the acquired source datasets (registered GEMS Scheme Rules Annexures and current CMS PMB code lists) before production use. An engine authorisation is a decision-support output, not a guarantee of scheme payment.