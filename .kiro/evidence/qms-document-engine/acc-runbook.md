# Spec-40 Task 13 — ACC-1..10 witnessed runbook

Prepared by the architect 2026-07-16, after the GEN-6 wave landed
(regenerateSection live — the last ACC blocker; 8/8 probe PASS, see
`gen6-regenerate.log`). **Witness rule:** ACC-3 and ACC-9 are owner-witnessed
→ D5; headline demos are ACC-3 (live generation), ACC-4 (honest gaps) and
ACC-9 (names unredacted). Rows land in `acc-readback.log` with timestamp +
exit code + outputs SHA.

## The spine: ONE witnessed generation run covers ACC-3/4/5/7/8/9

Stage: `tenant-AAA` (the UI-credentialed fixture tenant) has NO org profile
yet — the owner drives the whole flow in the SPA as `acc-aaa-admin`:

1. **Wizard** (ACC-9 input): fill the org profile — legal name, management
   rep (real-looking names — they must survive to the manual), industry,
   sites, core processes, `standardsInScope = [ISO9001, ISO45001]`
   (deliberately NO 14001 → ACC-5), leave design responsibility ON and the
   8.3 exclusion unrecorded or record it — owner's choice (F5 context).
2. **Generate** (ACC-3, WITNESSED): trigger the run; watch sections stream
   into the generation view live (WSS `onGenerationProgress` — delivery
   live-proven 2026-07-15 incl. the C-6 cross-tenant negative). Timebox:
   `SELECT finished_at - started_at FROM qms.generation_runs WHERE id='<run>'`
   → EXPECT **< 120 s** (reference: 24 s for 36 sections on arch-smoke;
   eval fleet p95 well under).
3. **Honest gaps** (ACC-4, headline): tenant-AAA's registers are empty →
   register-sourced sections are GAP blocks produced at **$0** (decided in
   code BEFORE any model call — D-1). Verify:
   - `SELECT COUNT(*) FROM qms.generation_sections WHERE run_id='<run>' AND status='gap'` > 0;
   - fetch one gap section JSON → `gap.missingSources[]` named, ZERO
     declarative sentences;
   - the assertion ledger has rows ONLY for prose sections
     (`SELECT COUNT(*) FROM qms.assertion_ledger al JOIN qms.generation_sections
     gs ON gs.id=al.section_id WHERE gs.run_id='<run>' AND gs.status<>'prose'` = 0);
   - approval blocked: review every section (script: loop
     `markSectionReviewed`), `submitDocumentForApproval(manual)` → EXPECT
     `UNRESOLVED_GAPS`.
4. **Scope honesty** (ACC-5): zero 14001 content —
   `SELECT COUNT(*) FROM qms.generation_sections gs WHERE run_id='<run>' AND
   NOT EXISTS (SELECT 1 FROM qms.clause_registry cr WHERE cr.id = ANY(gs.clause_registry_ids)
   AND cr.standard IN ('ISO9001','ISO45001'))` = 0; correlation-matrix JSON
   `standards` == `["ISO9001","ISO45001"]` (no 14001 column). N/A-justified:
   `setClauseApplicability` exclusion with justification on one clause →
   regenerate that section (GEN-6) → renders "N/A — justified" (eval-07
   pattern, now witnessable live).
5. **Approval integrity** (ACC-7): before reviewing: submit → EXPECT
   `UNREVIEWED_SECTIONS`; SoD: `approveDocumentVersion` by the version author
   → `SOD_VIOLATION` + `Security.SodViolationBlocked` on the trail, nothing
   written; the `UNRESOLVED_GAPS` block from step 3 completes the trio.
6. **Export** (ACC-8): `requestImsExport(manualDocumentId)` → presigned ZIP;
   download; EXPECT `00-…manual…pdf` first + clause docs + correlation matrix
   + master list; PDFs open to the controlled-document design (brand bar,
   CONTROLLED stamp, QMS info block). Post-GEN-6 bonus: entries serve LATEST
   versions (master-list refresh — the pinned-at-v1 carry-forward is closed).
7. **Names unredacted** (ACC-9, WITNESSED): open the manual (viewer or PDF)
   → the org's legal name and management rep from step 1 appear VERBATIM in
   prose/front matter. Guardrail distinctness:
   `aws bedrock list-guardrails` → `cumplify-docgen-guardrail-dev` and the
   agent guardrail are separate resources (D3 2026-07-15: doc-composer
   unredacted vs workhorse `{NAME}`/`{EMAIL}` anonymized — cite + re-show).

## The rest

- **ACC-1** (registry integrity): `npx vitest run
  services/api/__tests__/qms-registry.test.ts` green (parsed clause numbers,
  set-equality vs corrected corpus, zero verbatim-ISO text) + live counts:
  `SELECT standard, COUNT(*) FROM qms.clause_registry GROUP BY standard` →
  28 / 24 / 28.
- **ACC-2** (RLS on new tables): `SELECT tablename, rowsecurity FROM pg_tables
  WHERE schemaname IN ('qms','forms')` all true + FORCE flags via pg_class;
  `C7_AWS_PROFILE=cumplify-dev-admin npm run test:int` → 38 live denial
  probes green (includes qms/forms).
- **ACC-6** (content plane + diff): one command —
  `AWS_PROFILE=cumplify-dev-admin QMS_FN=<qms> M1_FN=<m1> node
  acc-scripts/gen6-diff-probe.mjs` → regenerates a section on the arch-smoke
  run, proves NEW manual version, `getDocumentVersionDiff(v1,v2)` NON-ZERO
  keyed by the section, 0/0 control, review-state reset. (D3 pre-verified
  2026-07-16: 3+/3− at `4.4`, 9.4 s.) `content_sha256` spot-check:
  sha256 of the fetched S3 body == the version row.
- **ACC-10** (quality gates): `npx vitest run
  services/qms-generation/__tests__/golden-eval.test.ts
  services/qms-generation/__tests__/house-style-ci.test.ts` → green
  (NFR-3 official mean 4.530/5 pinned via real aggregateRubricScores; 115
  committed prose sections, zero style violations). Owner MAY re-grade from
  the committed sealed-key sheet (grader identity recorded per row).

## Session prep checklist (architect, morning of)

- [ ] `tenant-AAA` has no org profile (fresh wizard) — else delete rows in
      `qms.org_profiles`/`_versions` for the tenant and note it.
- [ ] `acc-aaa-admin` / `acc-aaa-employee` logins verified against the SPA.
- [ ] Re-resolve Lambda names into the session shell (`QMS_FN`, `M1_FN`,
      `FORMS_FN`, `M4Fn`).
- [ ] `git pull` + `npm run test` green on the session machine.

## Purge after session

tenant-AAA gains: org profile + versions, 1 generation run (~sections +
ledger + AUDITLOG items), ~30+ m1 documents/versions, S3
`tenants/tenant-AAA/…` content + pdf + export zip, meter rows. Record the
ids in `acc-readback.log`'s purge section.
