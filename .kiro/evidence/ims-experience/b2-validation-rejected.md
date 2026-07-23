# B2 idempotent finalize (f50bbb3) — STAGE REJECTED (cloud-diff, 3 stacked fatal defects)

**Date:** 2026-07-23 · **Validator:** architect · **Commit:** `f50bbb3`
(LOCAL-ONLY, not pushed — must not deploy as-is). Probes executed against
the LIVE dev cluster as master WITH tenant context (C-2 txn +
`set_config('app.tenant_id','tenant-AAA',true)`), 18:47–18:52Z, exit 0.

## The data reality (corrects every count reported so far)

| doc_type | rows | distinct titles |
|---|---|---|
| procedure | 1062 | 46 |
| policy | 60 | 3 |
| manual | 34 | 4 |
| correlation_matrix | 32 | 1 |
| master_list | 32 | 1 |
| scope | 32 | 3 |
| **total** | **1252** | ~58 |

~23–32 finalize runs accumulated over the project's witnesses. The
"101 docs / 48 doubled" figure everyone (including prior architect
evidence) has been quoting is the /documents UI count — the READ PATH
apparently caps or filters (open question for the amendment; find why
listDocuments renders 101 of 1252).

## Fatal defects, in the order they'd fire

1. **B2-RLS-1 — the backfill DML silently no-ops.** `m1.documents` and
   `m1.document_versions` are `FORCE ROW LEVEL SECURITY` **live**
   (pg_class relforcerowsecurity=true; on-disk 007 shows only ENABLE — a
   later migration forced them). The migrator runs as master with NO
   tenant context by declared invariant (migration-runner.ts header), and
   FORCE subjects even the owner to RLS: bare-role probe sees **0** of the
   1252 rows. The DELETE and UPDATE in 019 would affect nothing, report
   success, and the register would keep every duplicate — then the next
   generation run (hk-stamped, no conflicts against NULL-hk rows) adds a
   full THIRD… strictly, ~24th set.
2. **B2-FK-1 — if the DML could see rows, the DELETE aborts the deploy.**
   `document_versions.document_id REFERENCES m1.documents(id)` has NO
   cascade (002:21), and **774 version rows hang off the deletable
   duplicates**. Kiro's premise "duplicates carry no versions" is false
   against the cloud.
3. **B2-KEY-1 — if that were fixed, the backfill violates its own unique
   index.** `clause_refs[1]` is NOT an identity: **55 collisions among
   surviving docs** (distinct docs share a first clause ref). The step-2
   UPDATE would abort the migration mid-deploy.

Plus: **B2-SCOPE-1** (medium) — backfill covers only
manual/procedure/work_instruction; finalize also produces
policy/scope/correlation_matrix/master_list (156 live rows) which keep
NULL hk → one more duplication cycle each even after everything above is
fixed.

## What was RIGHT in the delivery

Forward-path design is correct and stays: partial unique index; `ON
CONFLICT (tenant_id, harmonization_key) WHERE harmonization_key IS NOT
NULL DO UPDATE` (the partial-index predicate is present — the classic
trap avoided); key assignment (`__MANUAL__`, section.sectionKey,
`__CORRELATION_MATRIX__`, `__MASTER_LIST__`); NULL-exemption for manual
docs; the test pinning ON CONFLICT on every INSERT.

## Amendment requirements (design before code on #2/#3)

1. RLS bracket: `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` → DML as
   owner → re-`FORCE`, inside the migration transaction (or an
   architect-approved equivalent). This is the FIRST migration doing DML
   on FORCE-RLS tables — the pattern becomes house doctrine; document it
   in the migration header.
2. Version disposition rule, stated and quantified: what happens to the
   774 dependent versions (and any approvals referencing them)? Must also
   check whether any DELETABLE duplicate carries human-edited versions
   before choosing keep-latest (quantify, don't assume).
3. A true identity for the backfill key — `clause_refs[1]` is disproven.
   Derive from generation lineage or dedup per DERIVED key; ambiguous
   rows may stay NULL only with an explicit stated cost.
4. Cover all finalize-produced doc_types (policy/scope/correlation_matrix/
   master_list).
5. Explain the 1252-vs-101 read-path gap.
6. Recurring nit (2nd occurrence): state CURRENT baselines — frontend is
   204, not 203.

## Standing lesson (architect, disclosed)

My own first probes ran as bare app_role and returned false-negative
zeros (RLS-filtered) — I nearly cleared B2-FK-1 on them. Data probes
against RLS tables are only valid WITH tenant context; "0 rows" from a
bare role is RLS, not absence. Same class as "silence is not success."
