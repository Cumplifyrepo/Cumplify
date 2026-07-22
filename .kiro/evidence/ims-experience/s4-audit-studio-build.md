# S4 — Audit Studio slice 1 (build evidence, 2026-07-22)

Plan §S4: findings via LeadAuditor → inline HITL → accepted findings spawn
NCs in CAPA Studio (cross-studio link). Slice 1 = the findings loop + the
missing read surfaces; RS-3..RS-5 fold in as needed later.

## Chain

/audits (NEW Audit Studio page) → audit row expands → checklist (existing
generateAuditChecklist) + findings list → **Propose finding with
LeadAuditor** → `runAuditFindings(auditId)` (m3 resolver reads audit +
checklist + prior findings — agent never touches the DB) → LeadAuditor
FINDINGS MODE (most SIGNIFICANT new finding, objective evidence, never
duplicate priors; major-nc = systemic absence, minor-nc = isolated lapse,
thin evidence → observation) → audit-finding-write HITL card →
**approval writes the finding AND, for major/minor NC, opens the
nonconformity in CAPA Studio in the SAME transaction** (severity major→high
minor→medium, source 'audit', clause parsed from the citation; both rows or
neither — pinned).

## Deltas

- Schema: listAudits/listAuditFindings/listAuditChecklists Queries +
  runAuditFindings Mutation (register read surfaces did not exist). Pin 94→98.
- m3.ts: 3 list SELECTs (finding_type reverse-mapped to the UPPERCASE enum)
  + runAuditFindings dispatch (runNcIntake pattern).
- lead-auditor: dual-entry handler (SQS | findingsIntent); FINDINGS MODE
  prompt; tool schema gains required `standard`; shared retrieveGrounding
  with ALL S2.1/S2.2 lessons applied AT BUILD TIME (real Titan embeddings —
  the placeholder vector is gone from this agent too, canon-tenant iso-kb,
  allSettled legs).
- execute-writeback: executeAuditFindingWrite cross-studio NC spawn.
- infra: LeadAuditorHandlerFn → deterministic `cumplify-lead-auditor-<env>`
  + vpcPlaced (its KB retrievals 401'd outside the VPCE-only policy — same
  class as S2.1); m3 fn LEAD_AUDITOR_FN_ARN env + invoke grant; 4 resolvers
  in the schema-dependency list; VPC pin list += agent-lead-auditor.
- frontend: /audits stub → Audit Studio (register, expandable detail,
  checklist gen, findings list, agent front door); ProposalView FindingView;
  i18n auditStudio ×3 + proposal.findingType.

## Verification (2026-07-22, exit 0)

| Check | Result |
|---|---|
| npm run test | backend 1262/3 skip (+7: 4 LeadAuditor dispatch/grounding, +2 NC-spawn pins, +1 VPC pin); frontend 197 (+2) |
| tsc --noEmit / i18n:check | clean |
| resolver pin | 98 (dated changelog) |

Honest gap: no dedicated m3-resolver dispatch unit test this commit — the
resolver is pattern-identical to qms.runManualSectionDraft (which is pinned)
and the live witness exercises it end-to-end; add with slice 2.

UI witness follows the deploy — s4-audit-studio-witness.md.
