# Task 7 Incident 1 — first live seed FAILED; deploy green anyway (fail-closed breach)

> **Date:** 2026-07-18 (UTC) | **Architect readback** | Task 7 remains OPEN
> **Pipeline:** execution 6fb7d0c2 (source b540818), Dev stage Succeeded on 2nd stage-retry
> **Stack:** Dev-AiStack UPDATE_COMPLETE 03:35:49Z | Seeder: Dev-AiStack-IsoKbSeederFn50E136BB-ghwWB5tiEN6l

## Deploy timeline (witnessed)

| Time (UTC) | Event |
|-----------|-------|
| 01:54:47.976 | attempt 1: invoke policy CREATE_COMPLETE |
| 01:54:50.604 | attempt 1: CR CREATE_FAILED — provider AccessDenied lambda:InvokeFunction (**2.6 s post-policy — IAM propagation race**) |
| 02:38→03:19 | rollback stuck: IsoKbSeederFnSecurityGroup DELETE_FAILED ×3 (ENI lag); sg-0e6f14465b88d7e35 ORPHANED (cleanup carry) |
| ~03:23 | architect stage-retry #1 (FAILED_ACTIONS) → ChangeSetNotFound (change set consumed; lesson: CDK-pipelines deploy retries need ALL_ACTIONS) |
| 03:34:51→03:35:07.4 | retry #2 (ALL_ACTIONS): policy re-created |
| 03:35:08 | CR invoke — **2.3 s post-policy, race WON this time** (coin-flip confirmed: 2.6 s lost / 2.3 s won) |
| 03:35:09.7–31.5 | seeder ran 21.8 s: Chunked 109 → Template verified (lang present, live) → Index created → 109 embeds OK (21 s) → **first chunk PUT → HTTP 400 → Invoke Error** |
| 03:35:34.981 | **CR CREATE_COMPLETE despite FunctionError** → stack UPDATE_COMPLETE 03:35:49 |

## F-3 (M) — LIVE-PROVEN fail-closed breach: AwsCustomResource swallows Lambda FunctionError

`AwsCustomResource` + `Lambda.invoke`: the SDK call succeeds (HTTP 200) even when the
invoked function errors (`FunctionError` header + error payload) — the CR reports
SUCCESS and the deploy goes green on a failed seed. ACC-5's "fail-closed propagates to
deploy" (Task 5 mapping) is falsified by direct observation. FIX-P12-3 (CFN-direct
custom resource) is upgraded from hardening to REQUIRED bugfix — it kills BOTH this
class and the IAM propagation race.

## F-4 (M) — seed-blocking: AOSS vector collections reject client-supplied document IDs

Error (seeder log 03:35:31.552Z):
`indexChunk:0:ISO 9001 4.1 FAILED …: HTTP 400 — "Document ID is not supported in create/index operation request"`

bulk-index.ts PUTs to `/_doc/chunk-${i}`; meta-doc.ts PUTs/GETs `/_doc/_cumplify_iso_kb_meta`
— all client-supplied IDs. This constraint is DOCUMENTED IN-REPO: aoss-prover.ts
("AOSS VECTORSEARCH collections reject client-supplied _id — POST auto-ID") and the
prover seeds via POST. Kiro violated a known constraint; the architect's Phase 1+2
review ALSO missed the connection while having both files open — logged as a shared
miss (validation gap: live-shape probes catch what code review doesn't).

Note: the "FAILED after 12 attempts" message is misleading — 400 is correctly
non-retryable and the loop broke on attempt 1; the throw message hardcodes
MAX_ATTEMPTS. Cosmetic fix ordered with P12-4.

## Incidental LIVE wins (carried into eventual Task 7/12 closure)

- verifyTemplate passed live with `lang` present (T1 leg live-proven).
- Index create via template works (empty `cumplify-iso-kb` now exists; next seed
  delete→recreates it — no manual cleanup needed).
- 109 embeds through the one-door in ~21 s (~190 ms each), all under `__ISO_CANON__`.
- **Metering live-proven:** `TENANT#__ISO_CANON__#METER / MONTH#202607` row exists,
  creditsUsed 0.18938, lastUpdated 2026-07-18T03:35:31.384Z (== embed completion
  timestamp). Partial ACC-6 evidence banked.

## Fix order (Kiro lane, pre-deploy blockers)

**FIX-P12-3 — CFN-direct custom resource (kills F-3 + the IAM race):**
- New `services/iso-kb-seeder/src/cfn-handler.ts`: cfn-response protocol wrapper around
  the seed logic. Create/Update → seed → SUCCESS (Data: contentHash, chunksIndexed) or
  FAILED with reason; Delete → no-op SUCCESS (index outlives stack; collection is
  DataStack's). Internal deadline ~280 s (Promise.race) so CFN never waits the 1-hour
  CR timeout. ALWAYS respond (try/catch around everything, response PUT via https).
- ai-stack.ts: replace `AwsCustomResource`/`IsoKbSeederTrigger` with `CustomResource`
  (`serviceToken: isoKbSeederFn.functionArn`, resourceType `Custom::IsoKbSeed`,
  properties `{ SourceHash: fingerprint }`). CFN invokes same-account service tokens
  directly — no provider, no invoke policy, no propagation window. Keep node
  dependencies on BOTH access policies + applyTemplateTrigger. Handler entry switches
  to cfn-handler.
- Unit tests: SUCCESS/FAILED response shapes, Delete no-op, deadline path, response
  always sent on throw.

**FIX-P12-4 — auto-ID indexing + search-based meta (kills F-4):**
- bulk-index.ts: `POST /{index}/_doc` (auto-ID) per chunk — mirror aoss-prover.ts.
- meta-doc.ts: write via `POST /{index}/_doc` (auto-ID); read via `POST /{index}/_search`
  `{query:{bool:{filter:[{term:{'metadata.tenantId':'__META__'}},{term:{'metadata.clauseRef':'_meta'}}]}},size:1}`
  → `hits.hits[0]._source.contentHash ?? null`. GET-by-ID is unusable on vector
  collections. Old _meta dies with index deletion on re-seed — no duplicate handling
  needed beyond size:1 newest-irrelevant (single writer).
- withRetry: throw message reports actual attempt count.
- Unit tests: chunk POST auto-ID (no ID in path), meta search-read shape, D-2
  assertions unchanged (tenantId `__META__`, no embedding).

Evidence per rule 7/8; full suite + tsc + synth green; COMMIT LOCALLY — push remains
architect's (next push = Task 7 re-deploy; CR type change replaces the trigger →
onCreate fires → idempotent re-seed expected to run and SUCCEED or fail the deploy
loudly, as designed).
