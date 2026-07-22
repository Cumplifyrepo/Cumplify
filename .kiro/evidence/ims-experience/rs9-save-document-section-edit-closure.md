# RS-9 CLOSED — saveDocumentSectionEdit (architect, 2026-07-22)

Closes REQ-RS-9 (Collaboration Law persistence) — the mutation the
Document Studio editor (P2 Session 3) ships against a flagged local draft
until it lands. `frontend/src/components/document-editor/attribution.ts`
was already sitting uncommitted in the working tree when this was built
(Kiro's P2 S3 delivery — validated separately, see the forthcoming P2S3
validation log); read it directly to confirm the real consumer contract
before designing the mutation, rather than building from the spec text
alone.

## One deliberate deviation from the literal spec text (documented, not
silent — same class as RS-6's storage design amendment)

Spec text names the input field `sectionIndex: Int!`. Implemented as
`harmonizationKey: String!` instead. Two independent reasons converge:
1. `ContentSection` (the S3 content JSON's own shape, `m1.ts`) is keyed by
   `harmonizationKey`, never a numeric index — every other section-addressing
   code path in this codebase (`computeSectionDiff`, `regenerateSection`,
   `markSectionReviewed`) already uses it.
2. The Document Studio editor's ALREADY-BUILT `SectionDraft` type
   (`attribution.ts:31-41`) is keyed by `harmonizationKey` too — matching the
   spec's literal field name would have required Kiro's editor to invent an
   index mapping that doesn't exist anywhere in its own data model.

## Design
- `saveDocumentSectionEdit(input: {versionId, harmonizationKey, body,
  trackedChanges: AWSJSON})`: `@aws_lambda` (human-facing, ordinary
  `extractContext` — no SCHEMA-5 exception needed here, unlike RS-7).
- ALWAYS writes a NEW `m1.document_versions` row (7.5.2 versioning law —
  never mutates an existing row in place). Loads the current version's
  content JSON from S3, replaces the matching section's `humanEditedBody`
  + `trackedChanges` (stored verbatim — no shape transformation, since
  `attribution.ts`'s `ChangeEntry[]` is already a complete, richer
  attribution record than the spec's `{author,ts,op}` triple), writes a new
  S3 key (`tenants/<t>/documents/<docId>/v<n>.json`, same convention as
  `regenerate-section.ts`'s `versionContentKey`), INSERTs the new version
  row.
- **Sealed-version rejection (7.5.2)**: an edit against a document whose
  `status` is `APPROVED` or `OBSOLETE` throws `SEALED_VERSION_REJECTED`
  before any S3 write — status lives on `Document`, not `DocumentVersion`
  (confirmed: no `status` column on `m1.document_versions` in any
  migration), so the check joins to the parent document.
- Document reset to `DRAFT` on every edit — an edit invalidates any prior
  review, same rationale `regenerate-section.ts` already documents for
  clearing `reviewed_by`/`reviewed_at` (APR-1: review state is not
  inheritable across content changes).
- `Document.SectionEdited` audit event (newly registered, `auditTrail:
  true`) carries `harmonizationKey` + `changeCount` — the "dual-attribution
  summary" the spec calls for, without duplicating the full payload (already
  in the version's S3 content).

## Gates
| Gate | Result |
|---|---|
| `rs9-save-document-section-edit.test.ts` (new) | 5/5 pass — happy path (new version + S3 body assertions + trackedChanges round-trip), APPROVED rejection, OBSOLETE rejection, VERSION_NOT_FOUND, SECTION_NOT_FOUND |
| `api-stack.unit.test.ts` | resolver count 86→87 (one new Mutation field), schema node dependency added |
| `cdk synth` | Successfully synthesized |
| `npm run typecheck` | clean |
| Backend `npm run test` | 1188 passed / 3 skipped (was 1183 after RS-7 → clean +5, no shrinkage) |

## Still open (per the spec's own acceptance criteria)
Int-lane witness (edit → new version listed in `listDocumentVersions`) not
yet run — needs a real document + version on a live tenant, same
prerequisite gap the Dev witness evidence log already flagged for `/manual`
(this dev tenant has zero generation runs). Will fold into the next live
witness pass alongside RS-8's e2e HITL proof and P2S3's design-gate
screenshots.
