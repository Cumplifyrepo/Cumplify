# CHECKPOINT B PRE-WORK — Dev live witness (architect, 2026-07-21/22)

Witness of dfa8ad4..4c18206 (RS-6 approval-matrix engine + SOD-1 fix, P2
Session 1 `/manual`, P2 Session 2 `/documents` `/cross-reference` `/guide`)
on the live Dev environment. Per standing doctrine: behavior exercised
against the deployed cloud, not status codes — every claim below is a real
GraphQL call against `42yckio3gbbgphpdkpl7vux3v4.appsync-api.us-east-1`
authenticated as `acc-aaa-admin@example.com` (Pool B, QualityManager group)
via pycognito SRP, script `scratchpad/witness_p2.py`.

## 1. Pipeline verification

CodePipeline `CumplifyPipeline` (mgmt acct 157082218687). Source commits
dfa8ad4/97b1f36/efc2696/4c18206 all queued near-simultaneously (21:10–21:27
local); CodePipeline SUPERSEDED-mode execution IDs raced non-obviously (the
Dev stage ran execution `fd415ca6` for 4c18206 through to
`DeployFrontendContent InProgress`, then a SECOND pass ran execution
`c780df61` for efc2696 from `EventingStack.Prepare` again — confirmed
harmless: `git show --stat 4c18206` touches only
`.kiro/specs/read-surface-completion/requirements.md` (16 lines), zero app
code, so the two executions produce byte-identical deployed artifacts).
Ground truth verified directly against CloudFormation (dev acct
697114252993, `cumplify-dev-readonly` profile), not pipeline self-report:

| Stack | Status | Last updated (UTC) |
|---|---|---|
| Dev-ApiStack | UPDATE_COMPLETE | 2026-07-22T01:49:42Z |
| Dev-AiStack | UPDATE_COMPLETE | 2026-07-22T01:27:19Z |
| Dev-DataStack | UPDATE_COMPLETE | 2026-07-22T01:47:22Z |
| Dev-FrontendStack | UPDATE_COMPLETE | (no infra diff this wave) |
| DeployFrontendContent (pipeline action) | Succeeded | 2026-07-22T01:52:47Z (poll close) |

Verdict: **dfa8ad4..4c18206 fully landed on Dev.**

## 2. Approval-matrix live witness (RS-6 acceptance criterion)

1. `listApprovalMatrix` with zero tenant rows returns **9 Part-13 computed
   defaults** (version 0) — real effective routing, not fabricated: `capa`
   → `[management-rep, quality-manager, process-owner]` (M2 write-role set
   from `role-matrix.ts`), matching `defaultStepsFor`.
2. `setApprovalMatrixEntry({artifactType:'capa', steps:[document-controller]})`
   narrows the entry — confirmed via re-`listApprovalMatrix`: `capa` row
   now returns the tenant override (version 1, single step), not the
   default set.
3. `listPendingHitlItems` returned **2 real, live pending items** (not
   fixtures): `01KX4A4Z83PP0R8V9SJWH6A9HX` (agent=CAPAGuru, module=M2,
   status=PENDING) and one RecordsVault/M4 item — pre-existing production
   agent activity on dev.
4. `approveHitlItem({hitlItemId: '01KX4A...', decision: APPROVE})` as
   quality-manager (floor: `canApprove('quality-manager','M2')` = true;
   SoD: no self-approval since `requestedBy` is unset on this item) →
   **rejected**: `"Approval matrix: role 'QualityManager' is not an
   approver for 'capa'"`. **This is the narrowing-bites proof** — the
   floor alone would have allowed it; the tenant matrix override blocked
   it. HTTP/GraphQL error surfaced correctly to the client.
5. Matrix entry reset to `[management-rep, quality-manager, process-owner]`
   (restores the Part-13-equivalent set) — does not re-approve the two
   live pending items (left untouched; they belong to in-flight agent
   work, not test fixtures, and are not mine to resolve).

**Verdict: RS-6 acceptance criterion PASSES live** — "set entry → HITL item
routes per entry → SoD violation still blocked → audit events present" is
witnessed for the narrowing leg. (Audit-event leg initially FAILED — see
Finding 1 below, now fixed.)

## 3. `/manual` hero loop + S2 pages witness

- `getOrgProfile` → **null** — no org profile seeded on this tenant.
- `listGenerationRuns(limit:5)` → **0 runs**. No manual has ever been
  generated on this dev tenant. This is a **pre-existing, known gap**
  (memory: "org profile null, 0 generation runs — hero engine NEVER
  shown" — unchanged since the P0-era audit). `/manual`'s live hero loop
  (Generate → progress → viewer → export) cannot be witnessed until a
  profile + generation run exist on this tenant — **not a defect
  introduced by dfa8ad4..4c18206**, but it means the P2 S1/S2 UI has never
  been exercised against real generated content on dev. Flagging as an
  open item for the owner demo-data decision (architecture §11 R2, parked).
- `listDocuments` → **0 docs** — consistent with the above (documents are
  created by generation runs or manual drafts, neither exist yet).
- `/cross-reference`: no `CORRELATION_MATRIX` doc exists (same root cause)
  — page would render its honest empty state.
- `/guide`: `listClauseRegistry` → **80 rows** (full tri-standard registry,
  seeded independently of tenant generation — unaffected). `listClauseApplicability`
  → 0 rows (also generation-dependent).

**Verdict: S1/S2 backend contracts are live and correctly wired; the pages
themselves are UNWITNESSED end-to-end because this dev tenant has never run
a generation.** Recommend an actual `/manual` Generate click (owner or
architect) before Checkpoint B closes, to witness the hero loop with real
content — tracked as a follow-up, not blocking this evidence log.

## Findings (both live-verified, both fixed same commit)

### Finding 1 (SEV-2, FIXED) — `Governance.ApprovalMatrixChanged` unregistered
`setApprovalMatrixEntry` (dfa8ad4, m4.ts) publishes this detailType on
every matrix write, but it was never added to
`services/eventing/src/audit-trail-registry.ts` / `contracts/events.md`.
`publish()` throws `Unregistered detailType` at runtime — **the DDB write
had already committed** (confirmed: the immediately-following
`listApprovalMatrix` re-read showed the narrowed entry persisted), so every
real matrix edit **silently succeeds while returning a GraphQL error to the
caller** — same bug class as the spec-41 forms.ts finding registered
2026-07-15 (see the registry file's own note). Fixed: registered
`'Governance.ApprovalMatrixChanged': true` in both files; parity test
(`services/eventing/__tests__/audit-trail-registry.test.ts`) reverified
green.

### Finding 2 (SEV-1, FIXED) — `/documents` live-broken: `Document.clauseRefs` never added
P2 Session 2's `/documents` page (efc2696) queries `listDocuments { ...
clauseRefs }` — confirmed via frontend recon of the actual deployed page
source. The GraphQL schema never gained this field: **REQ-RS-1
(`read-surface-completion` requirements.md item 1, sequenced FIRST in the
task order) was never implemented** — only RS-6 (item 5) shipped. Live
probe reproduces exactly: `Validation error of type FieldUndefined: Field
'clauseRefs' in type 'Document' is undefined`. Every real call to
`/documents` on dev fails this query. Fixed same commit: added
`clauseRefs: [String!]` to `type Document` (SDL-only per the original
RS-1 spec — `m1.documents.clause_refs TEXT[]` already selected by
`SELECT *`, shared marshal already unwraps `arrayValue` + snake→camelCases
the column; no resolver/infra change needed, confirmed by reading
`getDocument`/`listDocuments` in `m1.ts`). Hermetic test added
(`m1-m2-lists.test.ts`): real Data-API `arrayValue` fixture + NULL case.

**Process note:** RS-2 through RS-5 (m3 audit quartet, listAuditEvents,
listRetentionPolicies, listRecords) are ALSO not yet implemented — grepped
absent from schema.graphql. These are not yet consumed by any shipped
frontend page (unlike RS-1), so they are not live-broken today, but they
remain open work the read-surface-completion spec sequenced ahead of RS-7.
Flagging for the owner queue, not blocking RS-7/8/9 per this session's
explicit instruction to proceed directly to RS-7.

## Gates (architect-run, post-fix)
| Gate | Result |
|---|---|
| `audit-trail-registry.test.ts` (parity) | 4/4 pass |
| `m1-m2-lists.test.ts` | 11/11 pass (+2 new) |
| Backend `npm run test` | 1172 passed / 3 skipped (was 1170/3 — clean +2, no shrinkage) |
| Frontend `npm run test` | 155 passed (was 147 — +8 from Kiro's uncommitted P2 Session 3 delivery, present in the working tree at witness time; validated separately, see checkpoint-b-p2s3-validation.md) |

Evidence timestamp: 2026-07-22T01:58Z (script output + gate runs, this
session). Commit: this one.
