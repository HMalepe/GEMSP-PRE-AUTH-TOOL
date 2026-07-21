# Loaders

One loader per Technical Build Spec §2.1 reference table, each running
placeholder fixture data through the pipeline in `../pipeline.ts` and
`../dataset.ts`: stage -> validate -> human-verify -> promote. Real
Phase-0 loads replace the fixture rows in each file with rows read from
an acquired source file — the pipeline calls don't change.

## Mapping to the Phase-0 tracker (Implementation Companion A.1)

| Tracker row | Loader(s) | Note |
|---|---|---|
| CMS PMB ICD-10 + 271 DTPs | `dtp.ts`, `icd10.ts` | dtp.ts must load first (icd10.dtp_id FKs to it) |
| Annexure C — per-option benefits | `benefit-limit.ts` | requires `option.ts` promoted first |
| Annexure B — contributions + LJP | *(none)* | LJP bands have no §2.1 entity — a late-joiner penalty is a premium/contribution loading, out of scope for a funding-decision engine. Contribution rand amounts likewise have nowhere to land. If this ever needs modelling, it's a new table, not a fit for any existing one. |
| Annexure D — CDL/ACDL | *(folded into `icd10.ts`)* | cdl_flag is a column on icd10, not a separate table |
| MPL / DRP / formulary | `nappi.ts` | |
| Tariff modifiers + RMR codes | `modifier.ts` | only the 6 modifier codes — RMR codes (553/469/7208/989/250) have no §2.1 entity either |
| Co-payment triggers | `co-payment-rule.ts` | requires `option.ts` promoted first |
| Waiting-period + s29A rules | `waiting-period-rule.ts` | |

## Loaders with no Phase-0 tracker row (add one before Phase 2)

- `option.ts` — six GEMS options; basic scheme metadata, low difficulty, not currently tracked.
- `tariff.ts` — procedure/RPL codes + preauth flag; source not named anywhere in the Companion, only "Tariff Files" in the annexures compilation's document-repository list.
- `network-provider.ts` — DSP/network directory; a provider feed, not an annexure.
- `benefit-balance.ts` — running member balances; an ongoing operational import, not an annual document. Also depends on `db/seed/001-fixture-members.sql` being loaded first (member_id FK).

## Running them

```
npm run seed:fixtures --workspace backend
```

Runs `../load-all.ts`, which loads in dependency order (option/dtp before
anything that FKs to them) against `DATABASE_URL`.
