# B3 tenant-docs indexer — deployed readback GREEN, stage CLOSED

**Date:** 2026-07-23 · **Readback:** architect · **Deploy:** `3830acb`
(amendment 2) via exec `eab98693` — Dev Succeeded, **revision-pinned**
(lesson below). All timestamps UTC, all commands exit 0.

## The full loop, witnessed end-to-end on dev

| Leg | Evidence |
|---|---|
| Emitter (new) | m1 ResolverM1Fn LastModified 16:25:20Z; re-publish of "Leadership and commitment (5.1)" v2 `1f5594ef` at 16:44:25Z via `publishControlledDocument` |
| Event → indexer | eventId `01KY7XTC98M7YKK2K6SD4CCWQ8` processing at 16:44:26.5Z (sub-second), payload carried `contentRef` (no skip-warn) |
| Index write | **"Document indexed successfully" sectionsIndexed: 1** at 16:44:41Z — S3 fetch + ai-invoker embed + AOSS POST auto-ID, all inside the VPC, 15 s total |
| Agent retrieval | DocStudio dispatch `01KY7XXPGS…` at 16:46:14Z → **`AOSS retrieval succeeded, indexName cumplify-tenant-docs, resultsReturned: 1`** (16:46:15.1Z, 154 ms) — **the historic tenant-docs 404 is gone from the agent path** |
| Old-format drain | Both DLQ messages (pre-amendment events, no contentRef) redriven onto new code → skip-warn in **9 ms** each, queues + DLQ empty after |
| Honest no-prose skip | Policy 5.2 (gap-content doc) republished through the new emitter → "No prose sections to index" at 16:38:38Z — correct, not an error |
| IAM/env reduction live | Lambda 16:27:59Z, CodeSha `XMNoPKZY…`, env has NO `CLUSTER_ARN`/`APP_ROLE_SECRET_ARN` |

First retrieval attempt (16:45:19Z, 38 s after the write) returned 0 — AOSS
eventual consistency, resolved by the refresh window; second attempt
returned the chunk. Note for witness rigs: allow ≥60 s between first index
write and retrieval assertions.

## Process disclosures (architect)

- **Wrong-execution readback:** the first "Dev green" I acted on was the
  docs-only spec commit's no-op run — my monitor matched any new execution
  id instead of pinning the revision. Both in-flight events burned retries
  on old code and hit the DLQ; recovered by redrive after the real deploy.
  STANDING LESSON: deploy monitors must pin the pipeline execution id
  sourced from the revision under test, and verify Lambda CodeSha/env
  BEFORE behavior probes.
- My earlier log-watch filter didn't include "Task timed out" — silence
  ≠ success; terminal-state coverage widened mid-readback.

## State left on dev (disclosed)

- 5.1 + 5.2 re-published (extra sealed evidence objects, same content);
  the 5.1 chunk is chunk #1 of `cumplify-tenant-docs`.
- Two new DocStudio PENDING HITL cards from the retrieval dispatches
  (queue is now ~26 — HITL-REACH-1 pagination defect makes page 2
  invisible; already on Kiro's list).

## Verdict

**B3 CLOSED.** Baselines at close: backend 1282/3 skip, frontend 204,
pin 99, root+frontend tsc clean. Backlog carried: per-standard trail
clauseRef on the emitter; IMS-standard retrieval semantics (standard-
filtered legs skip IMS docs — design question, not a defect); stale-
version cleanup job (re-publish currently adds chunks per version).
Kiro's next stage: **B2** (duplicates, owner ruling C) then HITL-REACH-1.
