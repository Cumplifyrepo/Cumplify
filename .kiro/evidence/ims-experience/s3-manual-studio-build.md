# S3 — Manual Studio gap burn-down loop (build evidence, 2026-07-22)

Plan of record: studio-wave-plan.md §S3 — "every GAP section gets Draft with
DocStudio → agent proposes prose from org data + KB → inline completion on
/manual → watch gapCount 24 → 0 live."

## Architecture decision (the load-bearing one)

The approved draft's persistence does NOT get a new SQL path. GEN-6's
`regenerate-section` engine already owns the single-txn version derivation
(manual assembly from ALL sections + clause-doc version + correlation matrix
+ master-list refresh + run-status recompute). S3 puts a **DocStudio HITL
gate in front of that engine**:

```
/manual GAP row → runManualSectionDraft (qms resolver: reads run/section/
clauses/pinned org profile, Event-invokes DocStudio — agent NEVER touches DB)
→ DocStudio SECTION MODE → manual-section-draft HITL tool (sentences +
rationale) → inline card on /manual (approve / edit-then-approve, SoD+matrix)
→ ExecuteWriteback executeManualSectionDraft → invokes cumplify-docgen-regen
with override:{sentences} → engine SKIPS compose, ships the approved
sentences as the section's prose in the exact compose shape, and every
derivation runs unchanged → gapCount drops on refresh
```

- `executeManualSectionDraft` is the ONE writeback that delegates instead of
  writing SQL — duplicating ~300 lines of derivation SQL would fork the
  corpus shape. Pinned by test: executor body contains no INSERT/UPDATE.
- Override path writes the section content JSON identically to compose
  (schemaVersion/harmonizationKey/clauseRefs/kind:'prose'/sentences) so
  step-3 derivations are shape-blind to the source. NO assertion-ledger rows
  (approved drafts carry no factRefs) — accountability = version author
  `agent:DocStudio+human:<sub>` + audit payload `source: manual-section-draft`.
- Guardrail: `manual-section-draft` routes to the DocGen guardrail (the org
  profile's legalName would otherwise be PII-anonymized OUT of the input);
  the tenant-typed profile rides in guardedText (S2.1 lesson pinned in test).
- The section context (clause intents + pinned profile version) is read by
  the RESOLVER and travels in the Event payload — same no-DB-in-agent rule
  as runNcIntake/runDocDraft.

## Deltas

| Surface | Change |
|---|---|
| qms-generation/regenerate-section.ts | `override?: {sentences}` input; `applyApprovedDraft()` (own txn, compose parity); audit `source` marker |
| schema.graphql | `runManualSectionDraft(runId, harmonizationKey): AgentRunAck! @aws_lambda` |
| api resolvers/qms.ts | `runManualSectionDraft` — guards (RUN_NOT_FOUND / RUN_NOT_FINALIZED / SECTION_NOT_FOUND / SECTION_STILL_COMPOSING), reads context, Event-invokes DocStudio, audit `Agent.RunRequested` |
| agents/doc-studio | SECTION MODE prompt; `manual-section-draft` HITL tool; `runSectionDraft()`; dispatch on `sectionDraftIntent`; HITL set now 5 |
| ai-invoker/guardrail.ts | `manual-section-draft` → DOCGEN routing |
| agents/shared/execute-writeback.ts | `executeManualSectionDraft` (delegation); moduleMap + standard-default entries |
| api permissions/role-matrix.ts | TOOL_MODULES `manual-section-draft: M1` |
| infra api-stack | qmsFn DOC_STUDIO_FN_ARN env + invoke grant; RunManualSectionDraft resolver on QmsDS (+ schema dep); pin 91→92 |
| infra ai-stack | writeback REGEN_FN_NAME env + invoke grant (deterministic name, same stack) |
| frontend /manual | GAP/FAILED rows render `AgentRunButton` (Draft with DocStudio) → inline card; `onResolved` → full re-hydrate (gapCount drop) |
| i18n | `manual.draftSection` en/es/pt same commit |

## Verification (all executed 2026-07-22, exit 0)

| Check | Result |
|---|---|
| `npm run test` | backend **1248** pass / 3 skip (was 1241: +1 regen override, +1 guardrail routing, +2 SECTION MODE, +3 writeback delegation pins); frontend **187** (+1 burn-down UI pin) |
| `npx tsc --noEmit` | clean |
| `npm run i18n:check` | clean |
| Resolver pin | 92 (dated changelog line added) |

Known limits, deliberate:
- Approve leg live-proof still blocked by SoD (second-approver login — standing
  owner ask); the writeback path is unit-pinned end to end.
- Tiptap in-place section editing on /manual (plan §S3 item 2) is the next
  slice — this commit ships the burn-down loop.
- UI witness (real click on a GAP row → card PENDING) follows the deploy —
  recorded in s3-manual-studio-witness.md.
