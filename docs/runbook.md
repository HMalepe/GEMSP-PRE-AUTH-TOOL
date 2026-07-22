# Operations runbook

Short, task-oriented reference for the three operations an on-call
maintainer actually needs: loading a new benefit year, rolling back a bad
load, and adding a co-payment rule — none of which require a code
redeploy. Also covers where to look for RBAC, logs, metrics, and
encryption config. See `docs/technical-build-spec.md` §§3.2/6/7 for the
requirements this implements, and
`backend/test/integration/versioning.integration.test.ts` for a fully
worked, tested example of everything in §1–2 below.

---

## 1. Loading a new benefit year's dataset

Every reference table (`icd10`, `tariff`, `nappi`, `modifier`,
`network_provider`, `option`, `benefit_limit`, `co_payment_rule`,
`waiting_period_rule`, `dtp`) is keyed by `benefit_year` and versioned
through `rule_version`. Loading a new year never touches gate code
(`backend/src/engine/gates/*`) or the API — only data changes.

### 1a. Today: fixture data (Phase 0 real datasets not yet acquired)

Each loader in `backend/src/ingestion/loaders/*.ts` accepts a
`benefitYear` parameter (default `2025`). To stand up a new year with the
current placeholder content:

```ts
import { getPool } from './src/db/pool.js';
import { loadOptionFixtures } from './src/ingestion/loaders/option.js';
// ...one import per loader

const pool = getPool();
const YEAR = 2026;
await loadOptionFixtures(pool, YEAR);       // load option and dtp first — everything else FKs to them
await loadDtpFixtures(pool, YEAR);
await loadIcd10Fixtures(pool, YEAR);
await loadTariffFixtures(pool, YEAR);
await loadNappiFixtures(pool, YEAR);
await loadModifierFixtures(pool, YEAR);
await loadNetworkProviderFixtures(pool, YEAR);
await loadBenefitLimitFixtures(pool, YEAR);
await loadCoPaymentRuleFixtures(pool, YEAR);
await loadWaitingPeriodRuleFixtures(pool, YEAR);
await loadBenefitBalanceFixtures(pool, YEAR);
```

(`backend/src/ingestion/load-all.ts` does exactly this for the default
year — copy its dependency order.) Each loader auto-promotes: stage →
validate → human-verify (auto-signed as `fixture-loader`, since this is
placeholder data) → promote, all in one call.

### 1b. Once real Phase-0 data is acquired: the real 4-step pipeline

Do **not** use the `loadXFixtures` convenience wrappers for real data —
they auto-verify, which is only acceptable for known-placeholder content.
Drive the pipeline primitives (`backend/src/ingestion/pipeline.ts`)
directly, with a **named human** actually reviewing before promotion:

```ts
import { createRuleVersion, stageRows, validateRuleVersion, markHumanVerified, promoteRuleVersion } from './src/ingestion/pipeline.js';

const versionId = await createRuleVersion(pool, {
  dataset: 'co_payment_rule',
  benefitYear: 2026,
  effectiveFrom: '2026-01-01',
  sourceDoc: 'GEMS 2026 Benefit Guide, downloaded 2026-01-05',
  checksum: sha256OfSourceFile,      // anything reproducible; used to detect "already loaded"
});

await stageRows(pool, versionId, 'co_payment_rule', rows.map((r) => ({
  rowKey: `${r.trigger_code}:${r.option_code}`,
  payload: r,
})));

const { invalidRows, totalRows } = await validateRuleVersion(pool, versionId, validateRowFn);
if (invalidRows > 0) {
  // Stop here. Fix the source data or the row mapping and re-run stageRows
  // (clearStagedRows first) — do NOT proceed to markHumanVerified.
}

// A named reviewer has actually checked the staged rows against the source PDF/spreadsheet:
await markHumanVerified(pool, versionId, 'clin.maintainer');

await promoteRuleVersion(pool, {
  ruleVersionId: versionId,
  targetTable: 'co_payment_rule',
  columns: ['trigger_code', 'option_code', 'amount_or_pct', 'basis'],
  benefitYear: 2026,
});
```

`promoteRuleVersion` is one transaction: it replaces every live row for
that `(table, benefit_year)` with the newly-staged, validated rows, marks
the `rule_version` row `PROMOTED`, and invalidates the in-memory
reference-data cache for that year (`engine/reference-cache.ts`) so the
**already-running server sees it on the very next request** — no restart,
no deploy.

### 1c. Before calling it done

1. Run the golden-case suite: `npm test -w backend -- test/golden-cases`.
   A rules change that breaks a golden case must not go live.
2. Submit one real request against the new year through the API/UI and
   confirm the decision and `rules_version` look right
   (`rules_version` is `<year>.<8-hex-checksum-hash>` — see
   `resolveRulesVersion` in `engine/resolve-reference-data.ts`).
3. Check `rule_version` for the year: every dataset should show exactly
   one row with `status = 'PROMOTED'` (older rows for that dataset+year,
   if any, are still there for audit history but superseded).

```sql
SELECT dataset, status, promoted_at FROM rule_version
WHERE benefit_year = 2026 ORDER BY dataset;
```

---

## 2. Rolling back a bad load

One function call, one transaction, no redeploy:

```ts
import { rollbackRuleVersion } from './src/ingestion/pipeline.js';

await rollbackRuleVersion(pool, {
  targetTable: 'co_payment_rule',
  columns: ['trigger_code', 'option_code', 'amount_or_pct', 'basis'],
  benefitYear: 2026,
  fromRuleVersionId: badVersionId,   // the currently-PROMOTED (bad) version
  toRuleVersionId: goodVersionId,    // an earlier version that was PROMOTED at some point
});
```

Find the two version IDs from `rule_version`:

```sql
SELECT version_id, status, promoted_at, source_doc
FROM rule_version
WHERE dataset = 'co_payment_rule' AND benefit_year = 2026
ORDER BY created_at DESC;
```

`fromRuleVersionId` must currently be `PROMOTED` (it's the thing being
undone); `toRuleVersionId` must have been `PROMOTED` at some earlier
point (its status can currently be `PROMOTED` or `ROLLED_BACK` — either
is fine). The rollback replays that earlier version's own staged
snapshot — staged rows are never deleted, so there is no separate "undo"
logic to get wrong. After it returns: `fromRuleVersionId` is marked
`ROLLED_BACK`, `toRuleVersionId` is marked `PROMOTED`, the live table
reflects the restored data, and the reference-data cache is invalidated —
again, the running server picks this up immediately.

---

## 3. Adding a new co-payment rule without a deploy

Co-payment triggers are pure data — `co-payment.ts` and Gate 6/9 look a
rule up generically by `(trigger_code, option_code, benefit_year)`; no
gate contains a hard-coded rand value or trigger name (Technical Build
Spec §6: "never hard-code a rand value, limit, or co-payment in
application code"). To add a brand-new trigger for the current year:

```ts
const newRow = { trigger_code: 'NEW_TRIGGER_CODE', option_code: 'BERYL', amount_or_pct: 2500, basis: 'AMOUNT' };

const versionId = await createRuleVersion(pool, {
  dataset: 'co_payment_rule',
  benefitYear: 2025,
  effectiveFrom: '2025-08-01',
  sourceDoc: 'Circular: new co-payment for X, effective 2025-08-01',
  checksum: 'co-payment-rule-2025-new-trigger-v1',
});
await stageRows(pool, versionId, 'co_payment_rule', [
  { rowKey: `${newRow.trigger_code}:${newRow.option_code}`, payload: newRow },
]);
await validateRuleVersion(pool, versionId, validateRowFn);
await markHumanVerified(pool, versionId, 'clin.maintainer');
await promoteRuleVersion(pool, { ruleVersionId: versionId, targetTable: 'co_payment_rule', columns: [...], benefitYear: 2025 });
```

**The only thing that makes a new trigger code actually fire** is a gate
or `co-payment.ts`'s flat-trigger evaluator looking for that
`trigger_code` string under some condition (e.g. `LATE_AUTH` fires when
`preAuthLeadHours < 48`). If the new trigger needs a *new condition* to
fire under (not just a new rand amount for an existing condition), that
part **is** a code change — it's the difference between "add a value"
(data, no deploy) and "add a rule" (logic, needs a deploy + a golden-case
test). Promoting the row alone is enough when you're changing an amount
on an existing trigger/condition pairing, or adding the same trigger for
an option that didn't have it before.

---

## 4. RBAC quick reference

Four roles (`backend/src/security/roles.ts`), enforced per-route in
`backend/src/api/server.ts`:

| Role | Can | Cannot |
|---|---|---|
| `consultant` | Submit requests, view/search decisions, override | Resolve the review queue, run Layer B triage, see `/metrics` or `/audit-log` |
| `clinical_maintainer` | Everything a consultant can, plus resolve the review queue, trigger Layer B, view training-data export | `/metrics`, `/audit-log` |
| `admin` | Everything | — |
| `auditor` | View/search decisions (read-only), `/metrics`, `/audit-log` | Submit, override, resolve, triage |

Add a named account:

```sql
INSERT INTO app_user (user_id, name, role) VALUES ('j.smith', 'Jane Smith', 'clinical_maintainer');
```

Deactivate one (never delete — the audit log FKs to `app_user`):

```sql
UPDATE app_user SET active = false WHERE user_id = 'j.smith';
```

Every request must carry `X-User-Id: <user_id>` — see
`backend/src/security/auth.ts` for exactly what this does and doesn't
guarantee. **This is a stopgap, not real authentication**: a production
deployment must put a real SSO/mTLS-terminating reverse proxy in front of
this service and have *that* inject a trustworthy identity header; this
middleware only turns an already-authenticated identity into an enforced
role.

HIV-confidentiality redaction (`backend/src/security/redact.ts`):
`clinical_maintainer`/`admin` see full detail always; anyone else sees
full detail only on a case they personally submitted, and a redacted
diagnosis/reasons otherwise. `is_hiv_related` stays visible either way,
so a restriction reads as a restriction, not missing data.

---

## 5. Observability

- **Logs**: structured JSON lines to stdout (`info`/`request`) and stderr
  (`warn`/`error`), one line per HTTP request plus explicit `logger.*`
  calls (`backend/src/logging/logger.ts`). Set `LOG_LEVEL` (`debug` /
  `info` / `warn` / `error`, default `info`) to filter.
- **Metrics**: `GET /metrics` (role: `admin`/`auditor`), Prometheus text
  exposition — `gemsp_decisions_total{outcome=...}` and
  `gemsp_gate_outcomes_total{gate=...,outcome=...}`
  (`backend/src/observability/metrics.ts`). Point a standard Prometheus
  scrape config at it with an `X-User-Id` header for an admin/auditor
  account.
- **Audit trail**: `GET /audit-log` (role: `admin`/`auditor`), filterable
  by `?entity=`/`?entityId=`/`?actor=`. Backed by `access_audit_log`,
  which rejects `UPDATE`/`DELETE` at the database level (a trigger, not
  just application discipline) — see
  `db/migrations/1700000000004_security-hardening.js`.

---

## 6. Encryption

- **At rest**: `auth_decision.motivation_text` (the one genuinely
  free-text PHI field — every other clinical fact is a coded reference)
  is encrypted with pgcrypto (`pgp_sym_encrypt`/`pgp_sym_decrypt`), key
  from `DB_ENCRYPTION_KEY`. **Set a real key in any non-local
  environment** — an unset key falls back to a well-known insecure
  default in dev only, and the process refuses to start with no key when
  `NODE_ENV=production` (`backend/src/security/encryption.ts`). There is
  no automatic key-rotation/re-encryption path — rotating the key today
  means decrypting every row with the old key and re-inserting with the
  new one; that migration doesn't exist yet.
  Everything else PHI-adjacent (member DOB, join date, diagnosis codes)
  lives in the reference/transactional tables as coded values, not free
  text — full-disk or filesystem-level encryption of the Postgres data
  directory and its backups is a deployment-layer requirement this
  application cannot enforce from inside itself; that's on whoever
  provisions the database.
- **In transit**: set `REQUIRE_TLS=true` to make the process itself
  reject any request that didn't arrive over TLS
  (`backend/src/security/tls.ts`, checked via `req.secure` or a trusted
  `X-Forwarded-Proto: https`). This service does not terminate TLS
  itself — put a real TLS-terminating reverse proxy/load balancer in
  front of it in any non-local environment, and make sure that proxy
  strips/overwrites any client-supplied `X-Forwarded-Proto` before
  forwarding, or the check above is worthless.

---

## 7. Test data

Every fixture in `backend/src/ingestion/loaders/*.ts` and
`db/seed/001-fixture-members.sql` is synthetic — illustrative member IDs
(`M-0001`), invented practice numbers (`PLACEHOLDER-*`), and (where real
WHO ICD-10 codes are used for realism) invented PMB/CDL/HIV flags pending
verification against the real CMS PMB list. Nothing in this repository is
a real GEMS member's data. Keep it that way: any future real-data import
for testing must be de-identified before it lands in a fixture loader or
a seed file (Technical Build Spec §7 De-identification).
