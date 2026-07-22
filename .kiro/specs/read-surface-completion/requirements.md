# Requirements Document

read-surface-completion — Requirements (EARS) R2

## Introduction

**Spec:** `read-surface-completion` · **Lane:** architect-authored (ims-experience
architecture §11 P1 ∥ item), Kiro builds. **Authority:**
`.kiro/specs/ims-experience/architecture.md` §3 (AGENT-FIRST LAW) / §4 / §8 /
§11 + the standing contract rule (view-designs may only cite queries that
exist here or in schema). **Fact base verified 2026-07-21** (architect
sweep): file/line citations below are checked against the tree at commit
`ede9bec`.

P2–P5 surfaces (Audit Studio, `/records`, `/activity`, `/documents`,
`/settings/approvals`) need read surfaces and agent writeback handlers that do
not exist yet, and the AGENT-FIRST LAW retrofits agent actions onto the CAPA
and Risk surfaces now. Every addition below is ADDITIVE (no breaking schema
change). All marshalling MUST go through `shared.ts`
`marshalResult`/`marshalOne` (AUD-1-safe timestamps — never hand-rolled).
SCHEMA-5: no `tenantId` in any input; resolvers take it from the authorizer
context. AppSync rule: new resolvers need an explicit node dependency on the
schema; never `extend type`.

## Glossary

| Term | Meaning |
|---|---|
| Quartet | The four m3 list queries (programmes/audits/checklist/findings) |
| Writeback door | An `@aws_iam` `agent*` mutation agents commit through after HITL |
| Floor | role-matrix `canApprove` + hard SoD rules — unbypassable by tenant config |
| One-door | The single bedrock-invoker serving path (agents-existing-8 REQ-SERVE-1) |
| Seat | A Register-resolved model assignment on the one-door path (Part 30) |

## Requirements

### 1. REQ-RS-1 — Document.clauseRefs exposure

The system SHALL add `clauseRefs: [String!]` to type `Document`
(schema.graphql L92-101). Column `m1.documents.clause_refs TEXT[]` exists
(migrations/002 L10) and both `getDocument` (m1.ts:474-486) and
`listDocuments` (m1.ts:488-512) already `SELECT *` — this is SDL-only plus a
marshal pass-through (Data API arrayValue unwrap already handled in shared
`unwrapArray`). Acceptance: hermetic test with real Data-API `arrayValue`
fixture; live probe shows clauseRefs on a generated document.

### 2. REQ-RS-2 — M3 audit quartet (Audit Studio contract)

The system SHALL add four list queries to the M3 resolver (m3.ts handler
switch L31-48) and schema Query block (L522-524), returning existing types
`AuditProgramme`/`Audit`/`AuditChecklist`/`AuditFinding` (schema L193-230):

| Query | SQL (tables per migrations/004) |
|---|---|
| `listAuditProgrammes(standard: Standard): [AuditProgramme!]!` | `SELECT * FROM m3.audit_programmes [WHERE standard] ORDER BY year DESC, created_at DESC` |
| `listAudits(programmeId: ID, status: String): [Audit!]!` | `SELECT * FROM m3.audits [WHERE programme_id / status] ORDER BY planned_date DESC` |
| `listAuditChecklist(auditId: ID!): [AuditChecklist!]!` | `SELECT * FROM m3.audit_checklists WHERE audit_id ORDER BY clause_ref` |
| `listAuditFindings(auditId: ID): [AuditFinding!]!` | `SELECT * FROM m3.audit_findings [WHERE audit_id] ORDER BY created_at DESC` |

Tenant scoping via the established RLS/tenant-transaction pattern (as the
existing m3 queries). Status strings map through REVERSE_ENUMS where the
schema uses enums. Acceptance: hermetic tests (real Data-API fixtures incl.
timestamps) + int-lane list-with-rows probe after `scheduleAudit` +
`generateAuditChecklist` create rows.

### 3. REQ-RS-3 — listAuditEvents (tenant-wide activity ledger)

The system SHALL add `listAuditEvents(limit: Int, nextToken: String):
AuditEventPage!` where `AuditEventPage { items: [AuditEvent!]!, nextToken:
String }` (AuditEvent exists, schema L276-288). Implementation (m4.ts,
alongside getAuditTrail L276-350): base-table DDB Query on
`PK = TENANT#<tenantId>#AUDITLOG`, `ScanIndexForward: false`, native DDB
pagination mapped to nextToken (base64 LastEvaluatedKey), default/max limit
50/200. NO scan, NO new GSI (partition + IAM `LeadingKeys TENANT#*#AUDITLOG`
already exist — audit-trail-stack.ts L184/L315). Reuses getAuditTrail's
`shape()` mapper (L280-292). Acceptance: hermetic DDB-mock test asserting
KeyConditionExpression + no FilterExpression; live probe returns the P0/P1
commit-era events newest-first.

### 4. REQ-RS-4 — listRetentionPolicies

The system SHALL add `listRetentionPolicies: [RetentionPolicy!]!` (type
exists, schema L252-257; table `m4.retention_policies`, migrations/005
L20-30; write path createRetentionPolicy m4.ts:190-228 + api-stack L637-640).
SQL: `SELECT * FROM m4.retention_policies ORDER BY record_type`. Acceptance:
hermetic + create-then-list int probe.

### 5. REQ-RS-5 — listRecords (M4 records register)

The system SHALL add `listRecords(recordType: String): [Record!]!` (type
exists, schema L242-250) over `m4.records` (write path registerRecord
m4.ts:54-101): `SELECT * FROM m4.records [WHERE record_type] ORDER BY
created_at DESC`. This closes the AUD-2 placeholder ("listing requires
listRecords") honestly. The `/records` P4 surface consumes this PLUS spec-41's
existing `listFormRecords`. Acceptance: hermetic + register-then-list probe.

### 6. REQ-RS-6 — Approval matrix (tenant-configurable, drives HITL)

**Today:** approval routing is code-only — `role-matrix.ts` (12 roles ×
module writes) consumed by hitl-approval.ts (`canApprove` L92). No
approval-matrix table/SDL exists anywhere (verified).

The system SHALL:
- **(a) Storage:** new table `governance.approval_matrix` (new migration):
  `id, tenant_id, artifact_type TEXT` (doc-type / form-template-key /
  'audit_report' / 'capa' …), `standard TEXT NULL`, `steps JSONB`
  (ordered `[{roleSlug, action: review|approve}]`), `created_by, created_at,
  updated_at, version`, UNIQUE (tenant_id, artifact_type, standard).
- **(b) SDL:** `type ApprovalMatrixEntry { id, artifactType, standard,
  steps: AWSJSON }`, `listApprovalMatrix: [ApprovalMatrixEntry!]!`,
  `setApprovalMatrixEntry(input: SetApprovalMatrixEntryInput!):
  ApprovalMatrixEntry!` (input: artifactType, standard, steps — SCHEMA-5).
  Mutation restricted to tenant-admin roles (Part-13 #1-#5); every change
  publishes an audit event (`Governance.ApprovalMatrixChanged`).
- **(c) Seed:** on first read with zero rows, resolvers return the Part-13
  DEFAULTS derived from `role-matrix.ts` (computed, not fabricated rows) —
  the UI shows real effective routing from day one; explicit
  setApprovalMatrixEntry materializes overrides.
- **(d) HITL integration:** hitl-approval.ts SHALL consult the matrix entry
  for the item's artifact type FIRST (steps' roleSlugs replace the
  module-write default for the approve step), THEN enforce the FLOOR
  unconditionally: `canApprove(role, module)` (role-matrix) AND the hard SoD
  rules (author≠approver; auditor-independence; investigator≠supervisor).
  **Tenant config can narrow who approves; it can NEVER widen beyond the
  role-matrix floor nor bypass SoD** — pinned by hermetic tests (a matrix
  entry granting 'employee' approve on M1 MUST still 403).
- Acceptance: hermetic floor tests; int-lane witness — set entry → HITL item
  routes per entry → SoD violation still blocked → audit events present.

### 7. REQ-RS-7 — Agent writeback handlers (AUD-7 closure per REQ-WB)

**Corrected fact:** all six `agent*` mutations (schema L604-609, all
`@aws_iam`) ARE wired to module datasources (api-stack.ts L652-670:
m1/m2/m2/m3/m3/m5) — but no module handler has a matching switch case, so
every call throws `Unknown field` (AUD-7's real mechanism). `appendAuditEvent`
was removed 2026-07-16 (api-stack L671-673) — stays removed.

Per agents-existing-8 **REQ-WB-1 scope (F-4 corrected)** the system SHALL
implement handler cases for the four in-catalog-built-agent mutations:
- `agentDraftDocument` (m1.ts, DocStudio) → creates DRAFT document row
- `agentProposeCorrectiveAction` (m2.ts, CAPAGuru) → creates PROPOSED CA
- `agentGenerateChecklist` (m3.ts, LeadAuditor) → SHALL delegate to the
  existing `generateAuditChecklist` internals (m3.ts:261-384, idempotent
  ON CONFLICT) — one implementation, two entry points
- `agentScoreReadiness` (m3.ts, LeadAuditor) → upserts
  `m3.audit_readiness_scores` rows

Each mutating writeback flows through the HITL gate per REQ-WB-2 (pause →
authorized-role approval per §6(d) → commit) and emits the REQ-WB-3 audit
event through the proven spine (REQ-WB-4; no parallel path).

**SCOPE AMENDED per the AGENT-FIRST LAW (owner ruling 2026-07-21):** ALL SIX
handler cases SHALL be implemented now — `agentTriageNC` (m2.ts: writes the
triage classification as a PROPOSED update, HITL-gated) and
`agentAssessRisk` (m5.ts: writes likelihood/severity/rationale as a PROPOSED
assessment, HITL-gated) are pulled forward from wave 2. The agent side:
CAPAGuru (BUILT) covers CA/triage duties; a **RiskSentinel seat is stood up
on the one-door serving path** (Register-resolved Nova Pro per Part 30 — a
new seat config + prompt, NOT a new serving paradigm) for assessRisk.
Acceptance: REQ-WB-5 witnessed e2e (propose → pause → approve → commit →
sealed trail row) for at least `agentProposeCorrectiveAction`; hermetic
tests for all six cases.

### 7b. REQ-RS-8 — User-triggered agent runs (the "AI does the heavy lifting" buttons)

The system SHALL provide user-triggered agent invocation for the two legacy
surfaces retrofitted per the AGENT-FIRST LAW, reusing the existing invoke
plane (one-door bedrock-invoker; credits metered; guardrails applied):
- `runCapaAnalysis(ncId: ID!): AgentRunAck!` — invokes CAPAGuru with the NC
  row + related records context. **AMENDED (owner ruling): the run is
  STAGE-AWARE per the CAPA shall-workflow (architecture §8, 10.2/8.7 state
  machine)** — the agent drafts the artifact for the record's CURRENT stage
  (containment → triage → root-cause analysis → CA plan → effectiveness
  verification → closure record), each landing as its own matrix-routed
  HITL gate; approval commits ONE stage transition via the writeback door.
  There is NO single-approve shortcut: stage 3's analysis approval, stage
  4's plan approval, and stage 6's verifier≠implementer SoD are separate,
  sequential, sealed gates.
- `runRiskAssessment(riskId: ID!): AgentRunAck!` — invokes the RiskSentinel
  seat with the risk row + register context; proposal (likelihood, severity,
  rationale) lands as a HITL card; on approval commits via
  `agentAssessRisk`.
`AgentRunAck { runId: ID!, status: String! }` — async ack; the HITL card is
the deliverable (surfaces in Command Center queue + `/ai-review` + the
originating drawer). UI: an "AI: draft this" primary action on the M2 CAPA
drawer and the `/risk` register row/drawer. **Per the COLLABORATION LAW
(architecture §3): the card renders the artifact as an EDITOR (human edits
attributed separately from agent contributions) and carries an
Iterate-with-agent thread (artifact-scoped, routed to the owning agent;
each iteration re-versions the artifact). Approval seals the CONVERGED
version — approve/reject-only cards are a defect.** Frontend copy in
en/es/pt same-commit. Acceptance: int-lane witness — click → run → HITL
card → human EDITS one node + one agent ITERATION revises the artifact →
approve converged version → row updated + sealed event with dual
attribution; SoD floor holds (§6d).

### 8. Non-functional / gates
- Hermetic lane stays hermetic (fake AWS creds; unmocked clients fail loudly).
- All new list resolvers use shared marshal (AUD-1 rule); fixtures use REAL
  Data-API wire shapes (P0 fixture-fidelity rule).
- `cdk synth` green; schema-guard test updated; resolver node dependency on
  schema declared for every new field.
- Rule 7/8: each task closure = checkbox + per-task evidence log, same commit.

### 9. Task seed (Kiro refines into tasks.md)
1. REQ-RS-1 (SDL + marshal test) — S
2. REQ-RS-2 quartet — M
3. REQ-RS-3 listAuditEvents — S/M
4. REQ-RS-4 + RS-5 — S
5. REQ-RS-6 approval matrix (migration + SDL + HITL integration + floor tests) — M/L
6. REQ-RS-7 writeback handlers + REQ-WB-5 witness — M/L
Order: 1→2→3→4 unblock P2/P3 read surfaces; 5→6 unblock P3 HITL depth + P5.
