# Architect review — iso-kb-seeding requirements.md (draft 1)
# Executed: 2026-07-17T21:50 ET | verification commands exit 0

## Verdict: APPROVED WITH CORRECTIONS — proceed to design.md after OQ resolutions below

## Independently verified TRUE
- aoss-index-template.json: metadata {tenantId, standard, clauseRef} ALL
  keyword + embedding 1024 faiss/hnsw — CHUNK-2 alignment claim exact.
- verifyTemplate() exists (aoss-apply-template.ts); prover refuses prod
  indexes (stays untouched — SEED-1g correct).
- steering 17-i18n quote EXACT ("Retrieval filters lang first, falls back
  to EN…"). steering 12-token-metering exception-paths quote EXACT — and
  the MECHANISM ALREADY EXISTS: checkCreditBalance(tenantId, creditExempt)
  has the exempt flag (SERVE-9); embed.ts currently hardcodes false.
- clause-corpus-map has individual 8.3.1–8.3.6 tuples → chunk-per-sub-
  clause aligns with clause-canon AR.
- 79 sub-clause count: plausible (73 top-level bold entries + 6× 8.3.x
  bullets); to be pinned exactly by the chunker's deterministic output.

## Corrections
- R-1 (M, process): "committed and ready" was FALSE — the spec dir was
  UNTRACKED, no commit existed. Architect committed it with this review.
  Deliveries are committed deliveries; a claim of committed must match
  `git log`.
- R-2 (L): source file is 422 lines, not "~530" — corrected on record.

## Review findings (bind the design)
- R-3 (M): DEPLOY-1b — cr.AwsCustomResource's provider Lambda has its own
  timeout (default far below 300s). Design MUST set the provider timeout
  ≥ seeder timeout or CFN fails while the seeder still runs.
- R-4 (L): CHUNK-1g HLS chunk — do NOT prefix it "[ISO HLS Annex-SL]":
  anything matching "[ISO …" invites the model to cite it, the citation
  regex can't parse it, and clause-canon has no HLS rows. Prefix it
  "[Annex SL HLS]" (outside the citation pattern); metadata.standard='HLS'
  is acceptable (retrieval doesn't filter standard today).
- R-5 (L): SEED-2c full-replace leaves a no-index window during re-seed;
  gurus degrade gracefully to the dormant path (proven live) — acceptable
  for dev/beta; zero-downtime swap is a Part 32.2 carry (see OQ-2).

## OQ resolutions (ARCHITECT)
- **OQ-1 metering: Option 2-minimal via the EXISTING exempt flag.**
  Thread `systemOp: true` through EmbedRequest → call
  checkCreditBalance(tenantId, true) (SERVE-9 mechanism, no new precheck
  path); STILL meter usage under TENANT#__ISO_CANON__#METER as a platform-
  COGS counter; stamp `systemOp: true` on the credits-telemetry payload so
  the future billing consumer excludes it (billing-signal integrity —
  telemetry.credits.consumed is THE billing signal per owner decision
  2026-07-08). No unlimited-credits tenant row (rejects option 3).
  FLAGGED for owner ratification (billing-adjacent).
- **OQ-2 index name: keep `cumplify-iso-kb`, unversioned.** It is pinned
  by deployed retrieval callers, the guru env, and data-access policy
  resource patterns (index/cumplify-iso-kb/*). Zero-downtime versioned
  swap = Part 32.2 standards-update carry.
- **OQ-3 i18n: YES — add `metadata.lang` keyword to the shared template
  NOW**, seed all chunks `lang:'en'`; ES/PT content stays the Part 31
  carry. Template change is additive/non-breaking; SEED-2c recreates the
  index anyway. Update the template-verify expectations in the same
  commit (keep verify fail-closed honest).
- **OQ-4 chunking: one chunk per SUB-clause** (8.3.1…8.3.6 individually) —
  matches the map's (b)/(c) granularity AND the clause-canon tuples.
  Parent headers without their own (b)/(c) content get no standalone
  chunk. Titan 8k-token limit is nowhere near threatened.

## Requirements addition ordered (fold into requirements.md rev 2, then design)
- ACC-6: metering evidence — seeding run meters embeddings under
  __ISO_CANON__ with systemOp flag; NO real-tenant meter row touched.
