# S2 Document Studio — UI witness PASSED (2026-07-22)

Rig: Playwright chromium against the deployed Dev CloudFront
(`d1tw2kanxo5wnt.cloudfront.net`), signed in as `acc-aaa-admin@example.com`
(tenant-AAA / Meridian Design-Build). Real clicks only — exact role-based
locators (S1 rig lesson). Script: session scratchpad `witness_s2_doc_studio.mjs`.

Prereqs verified live before the run (post-58fe8aa, execution `386ec9c6`):
`cumplify-doc-studio-dev` + `cumplify-capa-guru-dev` in vpc-067b2b0b8e1693b6d
on 2 subnets; `states` + `sqs` interface endpoints `available`.

## The beat (exit 0)

1. `/documents` — rail is the front door: intent textarea + **Draft with
   DocStudio** (doctrine #1: the big button IS the agent; manual create is
   the demoted secondary).
2. Typed: *"A work instruction for daily fall-protection equipment inspection
   on multi-storey framing sites: harness checks, anchor point verification,
   and the sign-off record the foreman keeps."*
3. Clicked `getByRole('button', {name: 'Draft with DocStudio', exact: true})`.
4. **Inline HITL card arrived** (`hitl-card-*`), left **PENDING** for a
   second approver (SoD — no self-approval).

## What the agent did with one sentence (nothing else typed)

Card payload (verbatim from the deployed page):

- `standard: "ISO45001"` — **inferred**, never asked
- `docType: "work_instruction"` — **inferred**
- `title: "Work Instruction for Daily Fall-Protection Equipment Inspection"`
- clause-tagged sections with full prose: 8.1 Introduction, 8.2 Harness
  Checks, … (each `{clauseRef, heading, body}`)
- `rationale` explaining the structure/clause choices for the approver

Screenshot: `screenshots/s2-doc-studio-card-pending.png` — register + rail +
PENDING DOC-DRAFT card in one frame.

## Log readback (same trace, `cumplify-doc-studio-dev` 17:12Z)

- `"AOSS retrieval succeeded" indexName=cumplify-iso-kb` — **the S2.1 401 is
  dead**; retrieval now rides the VPC endpoint.
- No guardrail intervention — guardedText + DocGen routing hold.
- Residual defects exposed by the same readback, fixed as **S2.2** (this
  commit): iso-kb was filtered by the caller's tenantId (canon chunks live
  under `__ISO_CANON__` → 0 rows); tenant-docs 404s (no indexer exists yet)
  and the shared `Promise.all` discarded the succeeded iso leg. Now:
  canon-tenant filter for iso-kb, `allSettled` legs. Pinned by
  `handler.test.ts` "grounding (S2.2)".

## Still open on this surface

- Card renders the proposal as raw JSON — functional, not a reviewer-grade
  preview. Polish backlog: sectioned doc preview on DOC-DRAFT cards.
- Approval leg unwitnessed: SoD blocks self-approval and no second-approver
  login exists on dev (standing owner ask). On approve, `executeDocDraft`
  writes m1.documents + S3 ContentJson + m1.document_versions in one txn
  (unit-pinned; live proof awaits the second login).
- `cumplify-tenant-docs` indexer does not exist (lead-auditor/control-tower
  read it too) — roadmap: index tenant docs on publish.
- Fleet follow-up: lead-auditor/control-tower/records-vault still outside the
  VPC; their retrievals 401 the same way S2's did if/when exercised.
