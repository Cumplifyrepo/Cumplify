# D1 + C1 — draft-document editing + AI-powered RCA (owner directives, 2026-07-22)

Owner: "draft documents must be available for edit, also capa studio is
missing the ai powered analysis, ishikawa, 5 whys....etc"

## D1 — draft editing: the missing SAVE wire

Diagnosis: the Tiptap DocumentEditor mounts on every DRAFT doc (/documents
detail) and manages tracked changes (ES-4 attribution) — but NEVER persisted.
It honestly flagged itself: syncStatus 'pending-rs9' + a sync-pending banner.
The RS-9 `saveDocumentSectionEdit` mutation existed server-side, fully
tested, with zero callers.

Fix: per-section **Save version** button → saveDocumentSectionEdit
{versionId (latest), harmonizationKey, body, trackedChanges (ChangeEntry[]
verbatim)} → new document version (7.5.2 law), doc back to DRAFT, banner
clears; parent refetches content + versions. Prior `humanEditedBody` becomes
the editor baseline on reload (round-trip pinned). Pins: mutation payload
shape, tracked-changes JSON, baseline round-trip (DocumentEditor.test +2).

## C1 — CAPA Studio structured RCA (5 Whys / Ishikawa / FTA)

m2.root_cause_analyses existed since migration 003 (method CHECK
'5why'|'fishbone'|'fta') with ZERO code on top — the NC detail offered only
a MANUAL method/findings form (the CRUD-only pattern Checkpoint A outlawed).

Chain (runNcIntake/runDocDraft patterns throughout):
- Schema: `RcaMethod` enum (FIVE_WHYS/FISHBONE/FTA), `runRootCauseAnalysis
  (ncId, method): AgentRunAck`, `listRootCauseAnalyses(ncId)`,
  RootCauseAnalysis.findings String→AWSJSON + createdBy/createdAt (the
  dormant type had never been queried). Resolver pin 92→94.
- m2 resolver: reads the NC (agent never touches the DB), maps the enum via
  the SHARED RCA_METHOD_MAP (extended with FIVE_WHYS — GraphQL enums cannot
  start with a digit), Event-invokes CAPAGuru with rcaIntent; list query
  returns findings via jsonOut (wire rule).
- CAPAGuru: RCA MODE prompt (5why: 3-5 link chain, root cause must be
  systemic — never "operator error" as terminus; fishbone: 6M categories,
  most-probable branch first; fta: event decomposition; hypotheses must be
  marked "to be confirmed"). New rca-write HITL tool (structured findings:
  whys/categories/tree + rootCauseSummary + rationale). NC description
  guarded (S2.1); nc-history grounding via real embeddings (S2.1 path).
  HITL set now 5.
- Writeback executeRcaWrite: INSERT m2.root_cause_analyses, method
  fail-closed against the 003 CHECK, findings stored as JSON text,
  current_setting tenant scoping, actor = agent+human. Source-pinned.
- UI: NC detail gains a "Root cause analysis" panel — **5 Whys with
  CAPAGuru** / **Ishikawa with CAPAGuru** AgentRunButtons (the manual drawer
  remains as demoted fallback), approved analyses listed with method,
  root-cause summary, and the whys chain / category breakdown. ProposalView
  gains RcaView (numbered whys, category groups, root cause highlighted).

## Verification (2026-07-22, exit 0)

| Check | Result |
|---|---|
| npm run test | backend 1255/3 skip (+3: RCA dispatch + HITL-set pin reworked); frontend 195 (+4: save wire ×2, RcaView ×2) |
| tsc --noEmit | clean (caught: RCA_METHOD_MAP duplicate vs enum-mappings.ts — resolved by extending the SHARED map) |
| i18n:check | clean; en/es/pt same commit (editor.save*, m2.rca*, proposal.method/rootCause) |
| resolver pin | 94 (dated changelog) |

Live witnesses follow the deploy: (D1) edit a draft section → Save version →
version list gains a row; (C1) 5-Whys click on an NC → structured card
PENDING.
