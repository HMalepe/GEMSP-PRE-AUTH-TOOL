Implementation Companion
GEMS Pre-Authorisation Decision Engine — Internal Tool
Part A · Phase-0 data-acquisition checklist   |   Part B · Technology-stack decision guide   |   Part C · Consultant front-end UX specification
The three pieces the Technical Build Specification deliberately left open. Part A is the thing to start today — it is procurement and OCR, not code, and it gates everything downstream. Parts B and C are the two ‘house decisions’ your team owns; this gives you a strong, opinionated default plus the trade-offs, so nobody re-litigates them from scratch.

# Contents


# Part A — Phase-0 data-acquisition checklist

Phase 0 is the critical path. The engine is only as good as the reference data loaded into it, and three of the datasets are not machine-readable off the web. Work this checklist to completion before wiring real decisions. Building the shell (Phase 1) can run in parallel; wiring the PMB gate, co-payment calc or formulary check cannot begin until the relevant dataset is acquired AND human-verified.
| Definition of done for Phase 0 Every dataset below is: (1) acquired, (2) loaded into a staging table, (3) validated by the automated loader, (4) signed off by a named human against the source document, and (5) promoted to a versioned live RuleVersion row. Until all eight rows show VERIFIED, Phase 2 (rules core) is blocked. Treat any RED row as a project risk with an owner and a date. |


## A.1 The acquisition tracker

Copy this into your project tracker. Owner and target date per row; do not let a row sit without both.
| Dataset | Where to get it | Method | Difficulty |
| CMS PMB ICD-10 coded list + 271 DTPs | medicalschemes.co.za → PMB / publications | Download XLSX | Low |
| Annexure C — per-option benefit tables (×6) | GEMS Scheme Rules page (2025) or 2025 Benefit Guide | OCR the scanned Annexure; cross-check vs Benefit Guide text | High |
| Annexure B — contributions + LJP bands | GEMS Scheme Rules page (2025) | OCR scanned PDF | High |
| Annexure D — CDL + ACDL per option | GEMS Chronic Medicine Guide 2025 | Text extract | Low |
| MPL / DRP / formulary + exclusion list | GEMS Formulary Lists page / Medikredit | Request data files; may need GEMS/Medscheme contact | Med |
| Tariff modifiers + RMR codes | GEMS Provider FAQ | Text extract | Low |
| Co-payment triggers | GEMS 2025/2026 benefit guides + ‘What’s New’ | Text extract | Low |
| Waiting-period + s29A rules | GEMS Underwriting Guide 2025 | Text extract | Low |

Tracker columns to add per row: Owner · Target date · Acquired? · Loaded to staging? · Validated? · Human-verified by/when · Promoted (RuleVersion id).

## A.2 Dataset-by-dataset: what ‘good’ looks like


### A.2.1 CMS PMB ICD-10 + 271 DTPs (unblocks Gate 3)

❑  Download the current CMS PMB ICD-10 coded list (XLSX) and the DTP list; note the version/year on the file.
❑  Load into ICD10 and DTP tables; set is_pmb, dtp_id, cdl_flag.
❑  Encode precedence: where an ICD-10’s PMB status conflicts with a scheme code, the CMS PMB code wins — enforce in the loader, not in gate logic.
❑  Validate: no orphan DTP references; every dagger/asterisk pair resolved; row count sane vs the source.

### A.2.2 Annexure C — per-option benefits (unblocks Gates 4, 9)

❑  Retrieve all six option PDFs (Tanzanite One, Beryl, Ruby, Emerald, Emerald Value, Onyx). These are scanned images — plain text extraction returns empty.
❑  Run OCR (see A.3). Output a BenefitLimit row per (option, benefit_type, sub_limit, basis, benefit_year).
❑  Cross-check every OCR’d rand value against the text-extractable 2025 Benefit Guide (which mirrors Annexure C). Discrepancy → re-read the source, don’t guess.
❑  Human sign-off: a reviewer initials each option’s table against the source PDF before promotion.

### A.2.3 Annexure B — contributions + LJP (unblocks Gate 7 penalty calc)

❑  OCR the contribution tables (per income band, per option) and the LJP bands.
❑  Encode the LJP formula A = B − (35 + C) with bands 0.05 / 0.25 / 0.50 / 0.75 × risk contribution.

### A.2.4 Annexure D + Chronic Guide — CDL/ACDL (unblocks Gate 8 chronic)

❑  Extract the 26/27 PMB CDL conditions (common to all options) and the ACDL that widens by option (TZ1/Beryl → Ruby → Emerald/EVO/Onyx).
❑  Capture the MAC symbol legend (+OF, #OF, X, PMB, N, EXG, S, M, ***) as reference metadata.

### A.2.5 MPL / DRP / formulary (unblocks medicine co-payment)

❑  Request the current Medikredit/GEMS MPL and DRP files and the Medicine Exclusion List from the GEMS Formulary Lists page; if not downloadable, obtain via a GEMS/Medscheme contact.
❑  Load Nappi rows with mpl_price, drp_price, formulary_flag.
❑  Note the twice-yearly DRP review cadence — schedule a refresh.

### A.2.6 The three easy text datasets

❑  Modifiers (0009/0011/0013/0018/0074/0075) + RMR codes (553/469/7208/989/250) from the Provider FAQ → Modifier table + RMR reference.
❑  Co-payment triggers (R1,000 late-auth, R1,000 elective scope 2026, R15,000 non-network, 30% non-DSP) → CoPaymentRule table per option/benefit_year.
❑  Waiting-period scenarios (s29A / Rule 8.3) → WaitingPeriodRule table.

## A.3 OCR workflow (for the scanned Annexures)

Rasterise each Annexure page at ≥300 dpi.
Run OCR (Tesseract, or a cloud OCR with a POPIA-compliant processing agreement — note these are benefit tables, not member PHI, so cloud OCR is lower-risk here than for clinical data).
Parse tabular output into structured rows; flag any cell OCR scored as low-confidence.
Auto-reconcile against the 2025 Benefit Guide text; list every mismatch for human review.
Human reviewer confirms each flagged/mismatched cell against the source image, then approves the load.
| Why the double-source matters Annexure C is the legal authority but is an image; the Benefit Guide is readable but is a secondary rendering. Loading from the Guide and verifying against the Annexure (or vice-versa) catches both OCR errors and any Guide typos — e.g. the known ‘R7,761 vs R7,716’ wheelchair discrepancy. |


# Part B — Technology-stack decision guide

This is stack-agnostic by design, but ‘your choice’ shouldn’t mean ‘from a blank page.’ Below is a recommended default that fits the constraints (internal tool, small team, yearly rule cadence, POPIA, South African data residency), each with the trade-off and a safe alternative. Optimise for boring, maintainable and auditable over clever.

## B.1 Decision criteria (rank these for your team)

| Criterion | Why it matters here |
| Team familiarity | Small team; a stack nobody knows is a bigger risk than a ‘sub-optimal’ one everyone knows |
| Maintainability over 5+ years | Rules change yearly; someone must still understand this in 2030 |
| POPIA / data residency | Health data of SA members — prefer SA-region hosting or on-prem |
| Auditability | Every decision must be reconstructable; favour boring, transparent tech |
| Data-driven rules support | The engine leans on relational joins + versioned rule rows |


## B.2 Recommended reference stack (opinionated default)

| Layer | Recommended | Why | Safe alternative |
| Database | PostgreSQL | Relational fits the coded-join model; JSONB for the decision object; rock-solid, free, SA-hostable | SQL Server (if a Microsoft shop) |
| Backend | One of: TypeScript/Node, Python, C#, or Java | Pick what the team maintains best; all handle a rules monolith fine | Whatever the team already runs in prod |
| Rules storage | Decision tables as versioned DB rows | Clinical maintainer edits data, not code; no redeploy for a co-pay change | json-rules-engine / Drools if chaining deepens |
| Front-end | Server-rendered or a light SPA | Internal tool; speed + simplicity beat a heavy framework | React/Vue SPA if the team lives there |
| Hosting | SA region (Azure SA North / AWS Cape Town) or on-prem | POPIA data residency for health data | On-prem VM if cloud isn’t sanctioned |
| Layer-B inference | Private / on-prem LLM endpoint | Member PHI must not leave the compliant boundary | Cloud LLM ONLY with a signed POPIA processor agreement |
| Auth / SSO | Your existing org identity provider | Reuse internal SSO; RBAC for consultant / maintainer / admin / auditor | Local accounts only as a stopgap |

| The one genuinely load-bearing choice Rules-as-data, not rules-as-code. The gate SEQUENCE is fixed code; the thresholds, limits, co-payments and formulary prices are versioned data rows. This is what lets you load the 2026 benefit year without a deploy and roll back a bad dataset in one operation. Get this right and the yearly maintenance is trivial; get it wrong and every January is a code release. |


## B.3 Anti-patterns to avoid

Microservices for a bounded, single-team domain — operational overhead with no benefit at this scale.
Hard-coding rand values / co-payments in application code — guarantees a redeploy every benefit year.
Sending member PHI to a public LLM without a POPIA processor agreement.
A NoSQL store as the primary reference DB — the domain is relational joins; fight that and you rebuild SQL badly.
Letting the ML layer make autonomous funding decisions — it recommends; a human decides.
Chasing a bespoke trained model before you have logged human decisions to train it on.

# Part C — Consultant front-end UX specification

Consultants run this all day. The screen must make the common path — a clean approval — near-instant and keyboard-driven, while making the evidence for any decision one glance away. Design principle: the engine did the navigation the old screen-path forced; the human keeps judgement, not clicking.

## C.1 Information architecture

```
┌─ New authorisation request      (primary screen)
├─ Decision result + evidence     (approve/decline/route)
├─ Review queue                   (routed cases for humans)
├─ Override / motivation capture  (from a routed case)
└─ History & audit lookup         (past decisions, read-only)
```


## C.2 Screen 1 — New authorisation request

A single, fast form. Group inputs by the gate they feed so nothing is asked twice. Autocomplete every coded field against the reference data.
| Field group | Fields | Behaviour |
| Member | Membership no., dependant code | Lookup → auto-fills option, status, benefit-year; shows active/suspended badge |
| Clinical | ICD-10 (autocomplete), procedure/tariff code, NAPPI (if medicine) | Live validity + PMB flag as they type; cross-check dx↔procedure inline |
| Service | Facility / provider practice no., date of service, setting (in/out-hospital) | Network status resolved on entry; date sets the benefit-year dataset |
| Admission (if applicable) | Requested LOS, level of care | Only shown for admissions |

| Efficiency rules Keyboard-first (tab order follows the gate sequence; Enter submits). Every code field autocompletes from reference data — no free-text code entry. Invalid/missing codes flag inline before submit, not after. |


## C.3 Screen 2 — Decision result + evidence trail

The heart of the tool. Lead with the decision and the money; make the reasoning collapsible but one click away.
| Element | What it shows |
| Decision banner | APPROVE (green) / DECLINE (red) / ROUTE (amber) — large, unmistakable |
| Money line | Funding source, co-payment (amount + reason), reimbursement basis — never hidden |
| LOS line | Authorised days + level of care (admissions only) |
| Evidence trail | The ordered gate reasons that produced the decision, each with a pass/fail marker |
| Caveat | ‘Not a guarantee of payment; re-adjudicated at claim stage’ — always present |
| Actions | One-click Approve (commit) · Review evidence · Override (with reason) |

Visual pattern for the three states:
```
APPROVE  ▶  green banner, money line, collapsed evidence,
             [Approve] focused for one-key commit
DECLINE  ▶  red banner, the failing gate surfaced first,
             reasons expanded, [Override] available
ROUTE    ▶  amber banner, 'sent to review queue',
             pre-assembled evidence attached for the reviewer
```


## C.4 Screen 3 — Review queue (Layer-B / human)

Lists routed cases with reason-for-routing (motivation, high-cost, experimental, incomplete docs, appeal).
Each item opens with evidence pre-assembled: the request, the gate that routed it, any Layer-B extraction + confidence, and attached documents.
Reviewer decides: Approve / Decline / Request more info — the outcome is logged as labelled training data for Layer B.
Show queue age / SLA so nothing rots; sort by oldest or by clinical priority.

## C.5 Screen 4 — Override / motivation capture

A consultant overriding a Layer-A decision MUST enter a reason; the override + reason + user + timestamp are written to the immutable audit log.
Overrides are surfaced in reporting — a high override rate on one gate signals a data or rule problem to investigate.

## C.6 Screen 5 — History & audit lookup (read-only)

Search past decisions by member, date, auth id, or code.
Shows the full decision object AND the rules_version it ran under — so a decision is reconstructable years later even after rules change.
Read-only; no edits. Auditor role only for cross-member views.

## C.7 What NOT to build in v1

A member-facing portal — this is an internal consultant tool.
Free-text code entry — autocomplete against reference data only.
Autonomous ML approvals — Layer B recommends into the human queue.
Bulk/batch processing UI — prove the single-request path first.
A rules-editing UI for the clinical maintainer — v1 can load rules via the versioned data pipeline; a friendly editor is a later nicety.
Sequence to execute: start Part A today (it’s the long pole), lock Part B with the team this week so implementation isn’t re-litigated, and treat Part C as the spec for the Phase-2/3 consultant screens. Together with the Technical Build Specification and the four domain artifacts, your senior dev now has the what, the how, the data plan, the stack, and the UX.
Internal working blueprint. All figures, codes and limits must be verified against the acquired source datasets before production use. Engine output is decision support, not a guarantee of scheme payment.