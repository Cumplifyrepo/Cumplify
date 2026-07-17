# Architect review — iso-kb-seeding design.md (draft 1, acadd11)
# Executed: 2026-07-17T22:15 ET

## Verdict: APPROVED WITH CORRECTIONS — fold D-1..D-5 into design rev 2, then author tasks.md

## Verified honored (against repo, not the summary)
- R-3: cr.AwsCustomResource `timeout: Duration.minutes(10)` explicit, correct
  rationale (provider default < seeder 300s). ✓
- R-4: HLS chunk prefixed [Annex SL HLS] + property test asserting no chunk
  starts "[ISO HLS". ✓
- R-5: degraded window documented with live-proven dormant fallback. ✓
- OQ-1 threading EXACT per review: EmbedRequest.systemOp additive →
  checkCreditBalance(tenantId, request.systemOp ?? false) (SERVE-9 flag,
  verified in credit-precheck.ts:31) → telemetry systemOp marker (field
  addition to existing detailType — no new registration needed). ✓
- Canon wiring correct AND the user's tenantId still flows to invokeFn —
  real-tenant Q&A metering unaffected. ✓
- Data-access policy uses the EXACT seeder role ARN (T4-F2 lesson). ✓
- Template lang addition + verifyTemplate fail-closed extension. ✓

## Corrections (bind rev 2)
- **D-1 (M — INCIDENT CLASS): source-file loading must be BUILD-TIME, not
  runtime fs.** §2.2 reads `resolve(__dirname, '../../../docs/…')` "or from
  local filesystem" — that repo-relative path DOES NOT EXIST in /var/task;
  unit tests (repo cwd) would pass while the deployed Lambda ENOENTs — the
  prompt-library incident shape exactly. MANDATE: esbuild text loader
  (`bundling.loader: { '.md': 'text' }`) + `import source from
  '<path>/iso-requirements-map.md'` — true build-time inlining, zero
  runtime fs. The chunker stays pure; the handler passes the imported
  string.
- **D-2 (M): _meta doc must be UNRETRIEVABLE.** SEED-2b stores the content
  hash in a `_meta` doc in the index; if it carries
  metadata.tenantId='__ISO_CANON__' it becomes a retrievable "chunk" and
  can pollute grounding sources. Pin: `_meta` doc uses
  metadata.tenantId='__META__' (never the canon constant) and has no
  `embedding` field (kNN can't match it anyway — belt) — plus a unit test.
- **D-3 (L): §4.1 mechanism text wrong (outcome right).** retrieve() treats
  404 as NON-retryable and fails FAST (retrieval.ts isAossRetryable:
  5xx/503/429/timeout only; live T20-3 log shows attempts:1) — no retry
  burn, straight to the guru catch → dormant. Correct the narrative; §5's
  404-retryable applies to the SEEDER's own activation polling only.
- **D-4 (L): §3.3 wording — AOSS data-access policies have NO priority;**
  they are additive unions. The second policy approach is fine; drop the
  "higher priority" phrase. Name ≤32 chars ✓ (22).
- **D-5 (L): pin the chunk count.** The chunker's expected output count
  (~79) must be a golden-test constant so source drift is caught in the
  unit lane, not discovered at deploy.

Minor: env TABLE_NAME "(optional DDB path)" is dead once _meta lives in
AOSS — drop it or justify.

## Process note
Both deliveries COMMITTED this time (2e60b75, acadd11) — claim matched
git log. Acknowledged.
