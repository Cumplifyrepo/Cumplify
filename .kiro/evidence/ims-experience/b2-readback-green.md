# B2 idempotent finalize (f43f351) — READBACK GREEN, ruling-C acceptance PASSED

**Date:** 2026-07-23 · **Validator:** architect · **Chain deployed:**
`26f651c..f43f351` via pipeline execution `d75000a4-0d6d-46dd-96f9-9df6c4a99082`
(revision-pinned `f43f3517…`, Dev stage Succeeded, no self-mutation supersede;
monitor br3ilmxt6). Migration 019 executed for real during ApiStack.Deploy.

## 1. Migration 019 APPLIED (probe 19:51:12Z, exit 0)

| Check | Result |
|---|---|
| `public._migrations` row | `019_document_harmonization_key.sql` @ 2026-07-23 19:43:49.096Z, checksum `26bce9e4429f16d8` |
| `harmonization_key` column | present, nullable — `m1.documents` |
| `idx_m1_documents_tenant_hk` | EXISTS (partial unique — creation would have 23505'd on any surviving dup) |
| FORCE RLS restored | `relrowsecurity=t, relforcerowsecurity=t` both tables |
| Global post-state | 533 docs / 12 tenants — EXACTLY the dry-run prediction (Step1 1160 keyed, 2b −717 versions, 2c −719 docs) |
| Orphan versions | 0 · duplicate `(tenant_id, hk)` pairs: 0 (index proves it) |
| tenant-AAA register | **55 docs** (was 101 in the /documents UI pre-migration) — DB `WHERE tenant_id` and API `listDocuments` as acc-aaa-admin AGREE: 55 = 55 |

Per-tenant truth: AAA 55 · eval-01..10 35–57 · arch-smoke 39.

## 2. Deployed code provenance (before any behavior probe)

`Dev-AiStack-FinalizeManualFnF23FC7B7-55QRWFGtF6Kr` LastModified
**2026-07-23T19:45:28Z** (inside this deploy's Dev window 19:40–19:47),
CodeSha256 `lN1IqcpQaLdN9A4zKdts1m7ryz8aVN5K/PlhT2HAbv8=`. Runs as
**app_role** (`APP_ROLE_SECRET_ARN` in env) → its DML is RLS-scoped.

## 3. Ruling-C acceptance witness — generateImsManual re-run (tenant-AAA)

Dispatched as acc-aaa-admin 19:57:07Z, run `9bca316f-3328-489c-be40-226584f0f955`,
standards `[ISO9001, ISO14001, ISO45001]` (org-profile scope, empty input).

Terminal 19:57:35Z status **PARTIAL** (45/46 sections composed; one composer
error, see negative control below).

| Invariant | PRE (19:57:01Z) | POST (19:58:06Z) | Verdict |
|---|---|---|---|
| tenant-AAA docs (DB = API) | 55 = 55 | 59 = 59 | +4 = exactly the NEW keys → **no duplicates created** |
| Keyed docs / distinct hk | 45 / 45 | 49 / 49 | dup-hk query empty; unique index holding |
| Document ids on existing keys | — | **0 changed, 0 missing** | identity stable across a full re-run |
| Version on existing keys | all v | **44/45 bumped exactly v→v+1** | ON CONFLICT DO UPDATE fired 44× in production |
| NULL-hk rows (policy/scope/procedure) | 10 | 10, **id-identical set** | exemption respected, untouched |
| New keys | — | `4.3`, `5.2#ISO9001/14001/45001` | legit INSERTs (no `5.2*` existed pre) |

**Unplanned negative control:** the single unbumped key `10.2#ISO45001` is
precisely the section whose composer errored (`factRefs expected ≥1 items,
got 0`, retry exhausted → run PARTIAL). Errored section → no finalize call →
version unchanged: bumps come only from real finalize executions. The
composer flake is a pre-existing generation-lane class, NOT a B2 defect.

**Pre-B2 this same action added ~46 duplicate rows per run (the 101 → 147
pattern). Post-B2 it added zero.** Ruling C is live.

### UI witness (20:01:08Z, exit 0)

`witness_b2_register.mjs` — signed in as acc-aaa-admin, `/documents`
register renders **59 rows** across clause-family groups (4 Context … 10
Improvement + Other Documents). Screenshot `b2-register-post.png`
(committed alongside). UI = API = DB = 59. Pre-migration this page showed 101.

### Read-path question (from b2-validation) CLOSED

The "1252 vs 101 gap" was never a read-path cap: 1252 was the GLOBAL row
count seen by an RLS-exempt master session (§4); 101 was tenant-AAA's true
register. 101 − 46 deduped = 55; +4 new keys = 59. `listDocuments` has no
LIMIT — Kiro's amendment-1 claim was RIGHT, and my "disproven" ruling on it
is retracted with this evidence.

## 4. Live finding — Aurora exempts rds_superuser members from RLS (evidence-grade)

While verifying, master-credential probes saw ALL tenants' rows with **no**
tenant context, despite FORCE RLS. Root cause identified empirically on the
live cluster (Aurora PostgreSQL 16.4):

- `row_security_active('m1.documents')` = **false** for `cumplify_admin`
  (member of `rds_superuser`), though `rolsuper=f`, `rolbypassrls=f` on every
  role in the chain and both RLS flags are set. `EXPLAIN` as owner shows **no
  policy filter**; `EXPLAIN` as `app_role` shows
  `Index Cond: (tenant_id = current_setting('app.tenant_id', true))`.
- `app_role` (the ONLY runtime role) is correctly scoped: 0 rows without
  context, exactly 55 tenant-AAA rows with it. **Tenant isolation at runtime
  is intact.**

Corrections this forces, disclosed per doctrine:

1. **B2-RLS-1's premise was wrong.** The migrator (master creds) was never
   going to no-op — it bypasses RLS entirely on Aurora. The NO FORCE→FORCE
   bracket in 019 is **unnecessary-but-harmless** here. House doctrine
   updated: KEEP the bracket in DML migrations (explicit, and correct on
   vanilla PostgreSQL where owners ARE subject to FORCE), but know it is not
   what makes Aurora migrations work.
2. **Standing probe rule:** master-credential probes are NEVER tenant-scoped
   by `set_config` — always add explicit `WHERE tenant_id = …`. Prior
   "in-context master" probe counts were global truth, not tenant-scoped
   (their conclusions all survive — the 1252/533 totals were global anyway).

## Rule-8 provenance (sha256 first-16 of raw outputs)

| Artifact | exit | sha256₁₆ |
|---|---|---|
| migration probe `readback_b2_migration.py` output (19:51:12Z) | 0 | in transcript |
| dispatch output `tasks/baxi41di1.output` (19:57Z) | 0 | `61634292677cdfc5` |
| poll+verdict output `tasks/b1407ieuk.output` (19:58Z) | 0 | `097e0e3b752fb9d2` |
| `b2_acceptance_pre.json` (55 docs: id/hk/version/status) | — | `6c92415d50ac12b2` |
| `b2_acceptance_post.json` (59 docs) | — | `882f9c2ad2321c59` |
| `b2-register-post.png` UI witness (20:01:08Z) | 0 | `f562cc61b350a347` |

Verdict recomputed from raw snapshots after a Data-API NULL-marshalling
quirk was found in the first pass (NULLs deserialize as `True` in the
row extractor — NULL-hk lines in the live verdict print were wrong; the
corrected analysis above is computed from the JSON snapshots directly).

## B2: CLOSED GREEN. Kiro's next stage: HITL-REACH-1 (queue pagination).
