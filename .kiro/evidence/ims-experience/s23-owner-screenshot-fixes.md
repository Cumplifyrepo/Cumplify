# S2.3 — owner-screenshot fixes (2026-07-22)

Owner exercised all three studios live and attached three screenshots.
Triage produced two fixes (this commit) and one design question (below).

## Fix 1 — "[Organization Name]" in doc drafts (doctrine #5 violation)

Owner's /documents card: "The sales policy of [Organization Name] is our
public commitment…". DRAFT MODE never received the org profile — SECTION
MODE (S3) gets it, whole-doc drafting didn't. The agent literally could not
know the tenant's name.
- runDocDraft (m1.ts) now reads the CURRENT org-profile payload in a
  read-only txn and ships it in draftIntent; absent profile (pre-wizard
  tenant) still dispatches.
- DRAFT MODE consumes it as guardedText (S2.1 lesson) with an explicit
  prompt rule: write the ACTUAL legal name — never a placeholder.
- Pins: resolver payload test (profile present + pre-wizard), handler
  guardedText test.

## Fix 2 — reviewer-grade proposal rendering (3 raw-JSON cards in the frames)

New `ProposalView` in the studio chassis, mounted in HitlCard where the raw
`draftBody` paragraph was:
- `manual-section-draft` → section chip + sentences as flowing prose + Why.
- `doc-draft` → title, standard/type chips, clause-headed sections + Why.
- `nc-draft-write` → labeled chips (standard/clause/severity/source/type) +
  description + Why.
- Unknown tools / non-JSON → verbatim body (byte-identical prior behavior;
  capa-open et al. unchanged until their views are added).
- The exact raw JSON stays one `<details>` away — approvers audit the true
  payload; Edit & approve still edits the raw args.
- i18n `proposal.*` en/es/pt same commit. 4 ProposalView tests; HitlCard/
  HitlQueuePanel suites untouched and green.

## Design question — duplicate register rows (NOT fixed here)

Owner's /documents frame shows doubled titles. Verified live (read-only):
2 finalized generation runs (6da72479 COMPLETE 12:59Z, 91577a00 PARTIAL
14:40Z) → 101 documents, 48 duplicated titles. finalize-manual CREATES a
fresh doc set per run; regenerate-section (GEN-6) already does the right
thing — new VERSIONS on the SAME documents. Options for owner ruling:
- (A) Supersede-on-finalize: new run obsoletes the prior run's set.
- (B) View-layer: register shows only the latest master list's entries.
- (C) RECOMMENDED: finalize becomes idempotent per harmonizationKey —
  first run creates, later runs write new versions of the SAME documents
  (consistent with GEN-6; no orphan corpus; version history unbroken).

## Verification

backend 1252 pass / 3 skip (+2), frontend 191 (+4), tsc + i18n clean.
Live witness of both fixes follows the deploy (same doc-draft click:
proposal-view rendering + real legal name in the draft).

## Live witness (81d28b7 deployed, exit 0)

Real click on /documents ("A procedure for handling customer complaints from
intake to closure."):
- `PROPOSAL-VIEW RENDERED: true` — card shows the bold title ("Customer
  Complaint Handling Procedure"), STANDARD/TYPE chips, clause-headed
  sections (ISO 9001 8.2.1 — Complaint Intake / Investigation / Resolution).
- `NAMES REAL ORG: true`, `PLACEHOLDER PRESENT: false` — the draft prose
  reads "the Client Care team at Meridian Design-Build LLC shall log the
  complaint in the Cumplify customer communication log."
- Screenshot: `screenshots/s23-pretty-card-real-org.png`. Card left PENDING.
- Nit for the approver-edit path (not blocking): one section body cites
  ISO 45001 10.2 inside an ISO 9001 procedure — cross-standard reference in
  prose; the Edit & approve flow exists for exactly this.
