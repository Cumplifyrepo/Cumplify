# QMS Document Engine — Tasks

**Spec:** `qms-document-engine` (spec 40)
**Design approved:** R1 (this commit)
**Convention:** `[KIRO]` = Kiro executes. `[ARCHITECT]` = architect executes (generation core, infra, deploys, readbacks). `[REQUIRES-HUMAN]` = owner reviews before merge.
**Evidence contract:** Rule 7 — checkbox edits ONLY in the same commit as the evidence log. Rule 8 — readback rows carry timestamp + exit code + outputs SHA. Evidence path: `.kiro/evidence/qms-document-engine/`.
**Standing rules:** SCHEMA-5 (no tenantId in user mutation inputs). Never `extend type`; new resolvers need explicit schema node dependency. Hermetic unit lane. Steering 19 §9: blocked = reported, never coded around. i18n en/es/pt same commit.

---

## Task 0 — DONE before task list: BC-5 guardrail [ARCHITECT]

- [x] `DocGenGuardrail` provisioned, deployed, live-verified distinct from agent guardrail; invoker env carries both seats. Evidence: `bc5-docgen-guardrail.log` (commit `543ed78`).

---

## Task 1 — Migration `011_qms_engine.sql` + BC-6 [ARCHITECT — pulled from Kiro 2026-07-15, wave was the cross-spec bottleneck]

- [x] Author migration per design §2: `qms` schema; `clause_registry` (tenant-less, SELECT-only for `app_role`); `org_profiles` + `org_profile_versions`; `clause_applicability` (CHECK: not-applicable requires justification); `generation_runs`; `generation_sections` (`UNIQUE(run_id, harmonization_key)`); `assertion_ledger` (append-only for app_role); `m1.document_versions` += `content_sha256 TEXT`; `m4.records` CHECK += `'IMS'`.
- [x] RLS on EVERY tenant table: ENABLE + FORCE + tenant policy + `app_role` grant (follow `007_rls_policies.sql` pattern).
- [x] Extend the cross-tenant denial test to all new tenant tables (ACC-2) — +14 probes incl. registry INSERT-denied + ledger UPDATE-denied.
- [x] `schema.graphql`: `enum Standard` += `IMS`; widened `PublishAuditEventOptions.standard` AND the downstream envelope unions (`eventing/types.ts`, `audit-trail/{types,appender}.ts`); `ims-standard.test.ts` pins the chain (design §2.6).
- [x] [ARCHITECT] Applied to dev via migrator custom resource (ApiStack deploy), live-verified `_migrations` ledger + `pg_policies` + FORCE flags, denial int suite 38 passed live.

**Depends on:** nothing. **D-rung:** D3 ✓. **Evidence:** `task-1-2-migration-registry.log`

## Task 2 — Clause registry seed + integrity (BC-7, CLR-1..4) [ARCHITECT — pulled with Task 1]

- [x] Seed `014_qms_registry_seed.sql`: 80 rows (28/24/28) from the corpus maps; Grand-Total rows skipped; BC-7 dedup narrowing on 14001/45001 `6.1` (→6.1.1+6.1.4) and 45001 `8.1` (→8.1.1); concept-split keys `6.1.2-aspects`/`6.1.2-hazards` and `8.2-9001`/`8.2-emergency`.
- [x] Corrected the corpus map's tallies IN THE SAME COMMIT (BC-7) — ALL THREE section tallies were wrong (27/15→28/16; 12/12→11/13; 12/15→10/17) + grand total 79→80; now machine-counted with a correction note.
- [x] `qms-registry.test.ts` (14 tests): parse-set equality both directions (never a line count), harmonization invariants, doc_type counts, required_sources shape.
- [x] CLR-3: zero "shall" in `intent_paraphrase` (test + independent grep).

**Depends on:** Task 1. **D-rung:** D3 ✓ (80 rows live-counted per standard). **Evidence:** `task-1-2-migration-registry.log`

## Task 3 — SDL + resolver scaffolds + org profile [KIRO]

- [x] Append design §6 SDL verbatim to `schema.graphql`; wire data sources + resolvers in `api-stack.ts` with explicit schema node dependency.
- [x] `qms.ts` resolver: `getOrgProfile`, `saveOrgProfile` (zod-validated payload, versioned write per design §2.2), `listClauseRegistry`, `listClauseApplicability`, `setClauseApplicability`, `getGenerationRun`, `listGenerationRuns`.
- [x] Hermetic tests: SQL/param-asserting per resolver (the M2 lesson: tests assert real column names against the migration), zod rejection cases, SCHEMA-5 (resolver injects tenant).

**Depends on:** Task 1. **D-rung:** D2. **Evidence:** `task-3-org-profile.log`

## Task 4 — `doc-composer` seat + guardrail routing [ARCHITECT]

- [x] `SeatId` += `'doc-composer'`; registry entry (register ×3 in lockstep, drift-tested) + `MODELWEIGHT#` row (keyed by modelId — nova-pro row pre-exists, pinned by test); structured output schema `{sentences:[{text, factRefs[]}]}` exported for Task 5.
- [x] `guardrail.ts`: route `doc-composer` → `DOCGEN_GUARDRAIL_*`, all other seats unchanged; unit tests both routes + default + no-fallback-to-agent-guardrail.
- [x] Metering smoke: live invoke metered credits 0.4912, DDB meter row written, telemetry emitted (readback rows 6/8/9).
- [x] LIVE FINDING fixed in-lane: PROMPT_ATTACK HIGH blocks JSON-format instructions → `guardedText`/guardContent selective evaluation (HIGH retained; **Task 5 must wrap tenant facts in guardedText**). Schema-retry validator deepened to recursive (was top-level-only — passed factRef-less sentences).

**Depends on:** Task 0. **D-rung:** D3 ✓ (names-unredacted proven live BOTH directions — evidence rows 6-7). **Evidence:** `task-4-seat.log`

## Task 5 — DocGenStateMachine: Seed + Compose + checker [ARCHITECT]

- [x] SFN (design §4.1): SeedSections (harmonization grouping — GEN-3 by construction; N/A → `na_justified` w/ justification in S3 content; idempotent ON CONFLICT), Map MaxConcurrency 4, FinalizeManual stub (terminal status + run_complete). SM named `cumplify-docgen-<env>` — QmsFn starts it BY NAME (no CFN cycle).
- [x] ComposeSection: GAP-before-model-call live-proven (23 gaps at $0 on this tenant; empty/unbuilt registers → gap naming the source); fact assembly (pinned profile version; registers read RLS-scoped in-txn — SECURITY DEFINER only needed where direct SELECT is revoked, i.e. the m5 matview); one-door invoke w/ guardedText facts; deterministic checker; one retry then `failed`; S3 + 106 ledger rows + audit events (3 detailTypes registered same commit).
- [x] `publishGenerationEvent` per section (GEN-5) — FIRST live Lambda→AppSync IAM publisher; ~37 mutations, 0 rejects.
- [x] Hermetic tests: grouping matrix, GAP decision table, checker fixtures (incl. unmapped-sentence FAILS), idempotent re-seed SQL pins, GAP-path-zero-invoker, one-door IAM pin (compose role: zero bedrock:* actions).
- [x] `regenerateSection` (GEN-6) DEFERRED to Task 6/7 wave (needs FinalizeManual m1 writes) — reported, not omitted.

**Depends on:** Tasks 1, 2, 4. **D-rung:** D3 ✓ (live run ae134c91: prose 12 / gap 23 / na 1 / failed 0 in 24s; GEN-5 resume exercised for real after the KMS defect; sha-verified content; 38 hash-chained audit items). **Evidence:** `task-5-generation-core.log`

## Task 6 — FinalizeManual: m1 writes, matrix, master list (GEN-4, GEN-8, BC-8) [ARCHITECT]

- [ ] Assemble manual content JSON (front matter incl. BC-1 disclaimer + ISO purchase link); write manual + per-section clause documents to `m1.documents`/`m1.document_versions` with REAL `content_ref` + `content_sha256`.
- [ ] Derive Standards Correlation Matrix + Documented-Information Master List (data, not prose) as two generated documents.
- [ ] Tripwire: no writer leaves `content_ref=''` (repo-wide test; `execute-writeback.ts:330` updated or explicitly exempted with tracked TODO).
- [ ] Run-complete event + audit event; `generation_runs.status` terminal semantics (`partial` when any section failed).

**Depends on:** Task 5. **D-rung:** D3. **Evidence:** `task-6-finalize.log`

## Task 7 — Subscription + diff [KIRO]

- [ ] `onGenerationProgress` None-DS subscription with C-6 tenantId auth (copy `onDocumentStatusChanged` pattern) — explicit schema node dependency.
- [ ] `getDocumentVersionDiff` resolver per design §3: S3 loads, section alignment by `harmonizationKey`, sentence LCS → existing `Diff` type. **Closes the standing BLOCKED item.**
- [ ] Hermetic tests: diff fixtures (add/remove/change section; identical → 0/0), subscription auth denial.

**Depends on:** Tasks 3, 6. **D-rung:** D2 → D3 at ACC-6 readback. **Evidence:** `task-7-sub-diff.log`

## Task 8 — Approval integrity (BC-11, APR-1..3) [KIRO]

- [x] `submitDocumentForApproval` preconditions: all sections reviewed (`UNREVIEWED_SECTIONS`), zero gap/failed sections (`UNRESOLVED_GAPS`).
- [x] `markSectionReviewed` mutation (role-gated).
- [x] `approveDocumentVersion` SoD: approver ≠ `created_by` → block, write nothing, publish `Security.SodViolationBlocked`.
- [x] Hermetic tests incl. negative paths (ACC-7 shape).

**Depends on:** Task 3. **D-rung:** D2. **Evidence:** `task-8-approval.log`

## Task 9 — PDF render + ZIP export + sealing (STO-3..5) [ARCHITECT]

- [ ] `PdfRenderFn` (puppeteer-core + @sparticuz/chromium, x86_64): controlled-document HTML template from `design-tokens.ts` (branded header, CONTROLLED stamp, QMS info block). **Gate:** if bundle/cold-start fails readback → container-image fallback, STOP and re-evidence.
- [ ] `requestImsExport` → ZIP (manual + clause docs + matrix + master list) → presigned URL (15 min).
- [ ] Sealing on `publishControlledDocument`: per-object `ObjectLockRetainUntilDate` from tenant `m4.retention_policies` (seed default policy row if absent); write the `m4.records` pointer row (`retain_until`, `object_lock_until`, `s3_object_ref`). Bucket default stays safety-net only (BC-10 residue).

**Depends on:** Task 6. **D-rung:** D3. **Evidence:** `task-9-pdf-export-seal.log`

## Task 10 — Frontend: Org Profile wizard + registry/applicability UI [KIRO]

- [x] Multi-step wizard per ORG-1 field list (shared zod contract from Task 3); versioned save; industry-neutral taxonomy.
- [x] Clause applicability UI: exclude-with-justification only (ORG-4); "N/A — justified" rendering.
- [x] Named-gap surfacing (ORG-3): missing required-source fields shown per clause.
- [x] i18n `qms.*` namespaces en/es/pt same commit; view-designs.md governs layout; no hardcoded strings.

**Depends on:** Task 3. **D-rung:** D2. **Evidence:** `task-10-org-wizard.log`

## Task 11 — Frontend: generation + document viewer + review [KIRO]

- [ ] Generate action → run view with live per-section progress (`onGenerationProgress`), section states (prose/gap/na/failed), gap CTA links.
- [ ] Document viewer: sections in clause order, GAP blocks visibly distinct (never prose-styled), BC-1 disclaimer block, review action per section, submit-for-approval gated by APR-1/3 errors surfaced honestly.
- [ ] Diff view on version history (Task 7); export button → presigned ZIP.
- [ ] i18n same commit.

**Depends on:** Tasks 7, 8, 10. **D-rung:** D2. **Evidence:** `task-11-doc-ui.log`

## Task 12 — Quality harness: golden-set eval + style validator (NFR-3, ACC-10) [ARCHITECT]

- [ ] Golden set (≥10 org profiles across industries/sizes/standard mixes); eval rubric; mean ≥ 4.0/5, zero low scores.
- [ ] House-style validator as standalone CI check over generated fixtures (no "shall"/bullets/placeholders, org-as-subject).

**Depends on:** Task 5. **D-rung:** D2 (harness) → D3 (live eval run). **Evidence:** `task-12-quality.log`

## Task 13 — ACC readback pass [ARCHITECT, ACC-3/ACC-9 witnessed by owner → D5]

- [ ] ACC-1..ACC-10 executed live per requirements §4, each row: timestamp + exit code + outputs SHA. ACC-4 (honest gaps) and ACC-9 (names unredacted) are the headline demos.

**Depends on:** all. **D-rung:** D3/D5. **Evidence:** `acc-readback.log`
