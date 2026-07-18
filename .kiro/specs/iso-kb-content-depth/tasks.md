# Tasks — ISO KB Content Depth

> **Spec:** iso-kb-content-depth
> **Design:** `#[[file:.kiro/specs/iso-kb-content-depth/design.md]]` (rev 2, approved)
> **Evidence rule:** Every task closure = checkbox tick + `.kiro/evidence/iso-kb-content-depth/task-N.log`
> + code in the SAME commit (rule 7/8). No tick without evidence; no evidence without a tick.

---

## Lane Legend

| Lane | Meaning |
|------|---------|
| [KIRO] | Build agent executes autonomously |
| [ARCHITECT] | Architect executes (deploy, live readback, content spot-check) |
| [REQUIRES-HUMAN] | Owner/architect decision or manual verification required |

---

## Task List

### Phase 1 — Code Foundations (hermetic unit lane)

- [ ] **Task 1** [KIRO] — Clause-ref parser module + unit tests
  - Create `services/agents/shared/clause-ref-parser.ts` per design §3.1.
  - Unit tests (`services/agents/shared/__tests__/clause-ref-parser.unit.test.ts`):
    - Priority 1: "ISO 9001 4.1" → clauseRef='ISO 9001 4.1', standard='ISO9001'
    - Priority 1 variant: "ISO 14001:2015 clause 6.1.2" → correct extraction
    - Priority 2: "clause 4.1" → clauseNum='4.1', clauseRef=null, standard=null
    - Priority 2: "section 7.1.5.2" → clauseNum='7.1.5.2'
    - Priority 3: bare "4.1" → clauseNum='4.1'
    - **N-1 false-positive: "improve efficiency by 4.1 percent" → clauseNum='4.1'
      (known behavior, documented, safe via RETRIEVAL-2f fallback)**
    - **D-3' cross-standard: "ISO 14001 4.1" → standard='ISO14001' (parser standard
      wins over any guru's own standard)**
    - Multiple refs: first wins (RETRIEVAL-1c)
    - No match: "How do I improve quality?" → all null
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes.
  - **D-rung:** D1 (code + unit tests pass).
  - **ACC mapping:** Foundation for ACC-1, ACC-3, ACC-4.

- [ ] **Task 2** [KIRO] — Hybrid retrieval extension + unit tests
  - Add `HybridRetrievalOptions` interface to `services/agents/shared/retrieval.ts`.
  - Update `buildKnnQuery` to compose compound `bool.must` filter when hybrid options present.
  - Implement RETRIEVAL-2f zero-result fallback (retry without clauseRef/standard).
  - Unit tests (`services/agents/shared/__tests__/retrieval-hybrid.unit.test.ts`):
    - With clauseRef → query contains `term` filter on `metadata.clauseRef`
    - With standard → query contains `term` filter on `metadata.standard`
    - With both → `bool.must` array with all three terms (tenantId + clauseRef + standard)
    - Without hybrid → unchanged single-term kNN query (backward compat, NFR-4)
    - Zero-result fallback: mock returns 0 chunks on first call → second call without hybrid
    - tenantId ALWAYS present in filter regardless of hybrid options
    - **Verified-clear pin: query contains NO `min_score` key when scoreThreshold is undefined**
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes (existing retrieval tests + new).
  - **D-rung:** D1.
  - **ACC mapping:** ACC-1, ACC-3, ACC-4.

- [ ] **Task 3** [KIRO] — Grounded-composition prompt fragment + guru prompt integration + parity test
  - Create `prompts/shared/grounded-composition.md` per design §4.1.
  - Update `services/agents/guru-9001/prompt.ts`: import fragment, append to system prompt.
  - Update `services/agents/guru-14001/prompt.ts`: same.
  - Update `services/agents/guru-45001/prompt.ts`: same.
  - Create parity test (`services/agents/__tests__/guru-prompt-parity.test.ts`):
    all three guru prompts contain `'Grounded Composition Rules'` marker.
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes (parity test green).
  - **D-rung:** D1.
  - **ACC mapping:** ACC-1, ACC-2 (answer style contributes to grounding score).

- [ ] **Task 4** [KIRO] — Guru handler hybrid-retrieval wiring + D-3' standard logic
  - Update `services/agents/guru-9001/handler.ts`:
    - Import `parseClauseRef` from shared.
    - Compose clauseRef and standard per design §3.3 (D-3': parsed standard wins).
    - Pass `hybrid` option to `retrieve()`.
  - Update `services/agents/guru-14001/handler.ts`: same pattern (GURU_STD_NUM='14001').
  - Update `services/agents/guru-45001/handler.ts`: same pattern (GURU_STD_NUM='45001').
  - Unit tests (per-guru handler test files):
    - Clause-number question → retrieve called with hybrid.clauseRef set
    - Topic question (no clause ref) → retrieve called WITHOUT hybrid
    - **D-3' test: ISO9001Guru asked "ISO 14001 4.1" → hybrid.standard='ISO14001' (not 'ISO9001')**
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes.
  - **D-rung:** D1.
  - **ACC mapping:** ACC-1, ACC-3 (cross-standard isolation).

- [ ] **Task 5** [KIRO] — CDK: `.md` text-loader for agent handlers + fingerprint update + assertions
  - Update `infra/lib/ai-stack.ts`:
    - Add `loader: { '.md': 'text' }` to createAgentHandler / shared bundling config (D-1').
    - Change fingerprint from `'docs/architecture/iso-requirements-map.md'` to `'docs/kb'`.
  - CDK assertion test (addition to `infra/__tests__/ai-stack.unit.test.ts`):
    - Guru Lambda bundling includes `.md` text-loader.
    - Custom resource SourceHash property uses directory fingerprint.
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes, `cdk synth --all` exit 0,
    CDK Nag clean (or justified suppressions).
  - **D-rung:** D2 (synth-verified).
  - **ACC mapping:** ACC-7 (re-seed trigger), D-1' compliance.


### Phase 2 — Chunker Migration (depends on Phase 1)

- [ ] **Task 6** [KIRO] — Rewrite chunker + seeder handler + unit tests (D-4')
  - Rewrite `services/iso-kb-seeder/src/chunker.ts`:
    - New `chunkContentSources(sources: ContentSource[]): Chunk[]` API per design §2.3.
    - DELETE `chunkIsoRequirementsMap` — no backward-compat wrapper (D-4').
    - Simpler blank-line-delimited parsing algorithm.
  - Update `services/iso-kb-seeder/src/handler.ts`:
    - Four static `.md` imports (design §2.4).
    - Replace `chunkIsoRequirementsMap(source)` with `chunkContentSources(CONTENT_SOURCES)`.
  - Rewrite chunker unit tests (`services/iso-kb-seeder/__tests__/chunker.unit.test.ts`):
    - Golden count = 109
    - **Golden-SET equality: `Set(clauseRefs)` === pinned 108-ref fixture + 'Annex SL HLS' (D-2')**
    - Per-standard count pins: ISO9001=50, ISO14001=26, ISO45001=32, HLS=1
    - Every ISO chunk text >= 200 chars (N-5: full text incl. prefix)
    - Correct prefix format `[ISO NNNN C.C]` / `[Annex SL HLS]`
    - Determinism: two calls yield identical output
    - No empty guidance bodies
  - Retire old chunker tests that reference `chunkIsoRequirementsMap`.
  - **NOTE:** This task requires content files (Tasks 7-9) to exist for the tests to
    pass against real content. The golden-SET fixture is derived from the content files.
    Task ordering: Tasks 7-9 content authoring can run in parallel with Tasks 1-5,
    but Task 6 tests are validated AFTER content is committed.
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes (all chunker tests green).
  - **D-rung:** D1.
  - **ACC mapping:** ACC-5 (content depth minimum), ACC-6 (chunk count + format stability).

### Phase 3 — Content Authoring (parallel with Phase 1; reviewable prose)

- [ ] **Task 7** [KIRO] — Author `docs/kb/iso-9001.md` (50 entries)
  - Create `docs/kb/iso-9001.md` with 50 expanded clause entries per design §2.2 format.
  - Each entry: `[ISO 9001 <clauseNum>] <title>` prefix line + 3-6 sentences covering
    requirement essence, implementation guidance, and Cumplify feature mapping.
  - BC-2 HARD CONSTRAINT: zero reproduction of ISO standard text. All content is
    original Cumplify-authored guidance, independently reworded.
  - Clause coverage must match the 50 ISO 9001 clauseRefs in the pinned fixture (D-2').
  - Every entry >= 200 chars total (N-5).
  - **Evidence:** File committed, `wc -l` shows expected entry count, spot-check sample
    entries for BC-2 compliance + guidance quality.
  - **D-rung:** D1 (content authored; quality validated at Task 10 spot-check).
  - **ACC mapping:** ACC-5, ACC-6.

- [ ] **Task 8** [KIRO] — Author `docs/kb/iso-14001.md` (26 entries)
  - Create `docs/kb/iso-14001.md` with 26 expanded clause entries.
  - Same format, BC-2, and quality rules as Task 7.
  - Clause coverage must match the 26 ISO 14001 clauseRefs in the pinned fixture.
  - **Evidence:** File committed, entry count verified.
  - **D-rung:** D1.
  - **ACC mapping:** ACC-5, ACC-6.

- [ ] **Task 9** [KIRO] — Author `docs/kb/iso-45001.md` (32 entries) + `docs/kb/hls.md` (1 entry)
  - Create `docs/kb/iso-45001.md` with 32 expanded clause entries.
  - Create `docs/kb/hls.md` with 1 HLS cross-reference entry per design §2.2.
  - Same format, BC-2, and quality rules as Task 7.
  - Clause coverage must match the 32 ISO 45001 clauseRefs + 1 HLS in the pinned fixture.
  - **Evidence:** Files committed, entry counts verified.
  - **D-rung:** D1.
  - **ACC mapping:** ACC-5, ACC-6.

- [ ] **Task 10** [ARCHITECT] — Content spot-check (BC-2 + guidance quality)
  - Architect spot-checks 5+ entries per standard (15+ total) for:
    - BC-2 compliance: no verbatim ISO normative prose reproduction
    - Guidance quality: substantive, accurate, Cumplify-feature-mapped
    - Format compliance: correct prefix, sufficient depth (>= 200 chars)
  - **Evidence:** Spot-check results recorded in task log (pass/fail per entry sampled,
    any corrections noted).
  - **D-rung:** D1 (content quality gate).
  - **ACC mapping:** Foundation for ACC-1, ACC-2 (content quality → grounding quality).

### Phase 4 — Content-Canon Validation (depends on Phase 2 + 3)

- [ ] **Task 11** [KIRO] — Content-canon gate unit test + property-based tests
  - Create `services/iso-kb-seeder/__tests__/content-canon.unit.test.ts`:
    - Every chunk's `metadata.clauseRef` exists in parsed `contracts/clause-corpus-map.md`
    - 108/108 ISO refs covered (PRE-VERIFIED by architect; test validates at build time)
  - Property-based test (fast-check): all chunks satisfy metadata invariants
    (tenantId='__ISO_CANON__', lang='en', text starts with correct prefix, length >= 200
    for non-HLS).
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes.
  - **D-rung:** D1.
  - **ACC mapping:** ACC-6 (format stability + canon alignment).


### Phase 5 — Deploy + Live Verification

- [ ] **Task 12** [ARCHITECT] — Deploy to dev + live re-seed
  - Push to pipeline, Dev stage deploys.
  - Verify: seeder Lambda invoked by custom resource (fingerprint change on `docs/kb/`),
    logs show `status: 'seeded'`, `chunksIndexed: 109`, new contentHash.
  - Readback: AOSS index `cumplify-iso-kb` exists, document count = 109.
  - **Evidence:** Pipeline run ID, CloudWatch log excerpt (seeded, chunk count, hash),
    AOSS document count query result, timestamp, git blob SHA of cdk-outputs.json.
  - **D-rung:** D3 (deployed + read back).
  - **ACC mapping:** ACC-6 (live chunk count), ACC-7 (re-seed triggered by content change).

- [ ] **Task 13** [ARCHITECT] — ACC-1: Clause-number question grounded >= 0.85 (live)
  - Invoke `askISO9001` with probe: **"What does clause 4.1 require?"**
  - Verify:
    - `groundingSource` non-empty in guru handler logs (retrieval returned chunks)
    - Top-1 chunk `metadata.clauseRef` = `ISO 9001 4.1` (hybrid retrieval worked)
    - Grounding score >= 0.85 in guardrail log (L1 check PASSES)
    - Response is NOT the honest-miss template
  - Transport: AppSync fixture-token (primary) or direct-invoke in resolver event shape (N-4).
  - **Evidence:** AppSync response excerpt, CloudWatch guru handler log (groundingSource
    present, hybrid retrieval log), guardrail log (grounding score >= 0.85).
  - **D-rung:** D4 (live-proven end-to-end).
  - **ACC mapping:** ACC-1.

- [ ] **Task 14** [ARCHITECT] — ACC-2: Topic question grounded >= 0.85 (live)
  - Invoke `askISO9001` with probe: **"How should our organization determine external
    and internal issues relevant to its purpose?"**
  - Verify:
    - Grounding score >= 0.85 (L1 check passes)
    - Response is NOT the honest-miss template
    - Retrieved chunks relevant to ISO 9001 clause 4.1
  - **Evidence:** Same shape as Task 13.
  - **D-rung:** D4.
  - **ACC mapping:** ACC-2.

- [ ] **Task 15** [ARCHITECT] — ACC-3: Cross-standard clause-ref isolation (live)
  - Invoke `askISO9001` with probe referencing "clause 4.1".
  - Verify: all returned chunks have `metadata.standard === 'ISO9001'` (retrieval log).
  - Also test D-3' live: ask ISO9001Guru "What does ISO 14001 4.1 require?" → verify
    retrieval targets ISO14001 (parsed standard wins).
  - **Evidence:** Retrieval log showing standard filter, chunk metadata in response.
  - **D-rung:** D4.
  - **ACC mapping:** ACC-3.

- [ ] **Task 16** [ARCHITECT] — ACC-4: Fallback to kNN on unrecognized clause-ref (live)
  - Invoke `askISO9001` with probe: **"What does clause 99.9 require?"**
  - Verify: hybrid retrieval returns 0 results → fallback to kNN → closest semantic
    match returned (or honest-miss if grounding fails — both acceptable for non-existent
    clause).
  - **Evidence:** Retrieval log showing fallback path, response (not empty/error).
  - **D-rung:** D4.
  - **ACC mapping:** ACC-4.

- [ ] **Task 17** [ARCHITECT] — ACC-7: Idempotent re-seed preserved (live)
  - Re-invoke seeder Lambda (same content hash) → verify logs show `skipped: true`,
    zero embeddings consumed.
  - **Evidence:** CloudWatch log excerpt (skipped: true, durationMs low).
  - **D-rung:** D4.
  - **ACC mapping:** ACC-7.

### Phase 6 — A/B Iteration + Closure

- [ ] **Task 18** [ARCHITECT] — A/B iteration gate (§7.4 decision)
  - Review grounding scores from Tasks 13-14:
    - **If both >= 0.85:** ACCEPT v1 wording. Task complete, proceed to Task 19.
    - **If 0.70-0.85:** Refine grounded-composition.md wording (one iteration).
      Adjust prohibited-patterns-by-example specificity, re-deploy, re-probe.
      Record v2 scores.
    - **If < 0.70 after content expansion + hybrid retrieval:** Root cause is
      likely LEG-1 content depth, not prompt style. Escalate to architect for
      content revision.
  - **Evidence:** Grounding scores (v1 and v2 if iterated), decision recorded.
  - **D-rung:** D4 (measured + decided).
  - **ACC mapping:** ACC-1, ACC-2 (final grounding gate).

- [ ] **Task 19** [KIRO] — ACC-8: Close iso-kb-seeding Task 8
  - After Tasks 13+14 pass (ACC-1 + ACC-2 met):
    - Tick iso-kb-seeding Task 8 checkbox in `.kiro/specs/iso-kb-seeding/tasks.md`.
    - Record cross-reference evidence in `.kiro/evidence/iso-kb-seeding/task-8.log`
      (append closure note with iso-kb-content-depth evidence references).
  - **Evidence:** Both task checkboxes ticked, cross-reference evidence committed.
  - **D-rung:** D4 (closure proven by live probes in Tasks 13-14).
  - **ACC mapping:** ACC-8.

---

## ACC → Task Mapping Summary

| ACC | Description | Proven by |
|-----|-------------|-----------|
| ACC-1 | Clause-number question grounded >= 0.85 | Task 13 (live) + Task 18 (A/B gate) |
| ACC-2 | Topic question grounded >= 0.85 | Task 14 (live) + Task 18 (A/B gate) |
| ACC-3 | Cross-standard clause-ref isolation | Task 15 (live) |
| ACC-4 | Fallback to kNN on unrecognized clause-ref | Task 16 (live) |
| ACC-5 | Content depth minimum (>= 200 chars) | Task 6 (unit) + Task 11 (property) |
| ACC-6 | Chunk count + format stability | Task 6 (unit: golden-SET + count pins) + Task 11 (canon gate) + Task 12 (live) |
| ACC-7 | Idempotent re-seed preserved | Task 17 (live) |
| ACC-8 | iso-kb-seeding Task 8 closure | Task 19 (cross-reference) |

---

## Dependency Order

```
Phase 1 (parallel):
  Task 1 (parser) ──┐
  Task 2 (hybrid)   ├──► Task 4 (guru wiring) ──┐
  Task 3 (prompt)   │                            │
  Task 5 (CDK) ─────┘                            │
                                                  ├──► Task 6 (chunker) ──► Task 11 (canon)
Phase 3 (parallel with Phase 1):                  │            ▲
  Task 7 (9001 content) ──┐                       │            │
  Task 8 (14001 content)  ├──► Task 10 (spot-check)────────────┘
  Task 9 (45001+HLS)   ───┘

Phase 5 (sequential after Phase 4):
  Task 12 (deploy) → Task 13 → Task 14 → Task 15 → Task 16 → Task 17

Phase 6:
  Task 18 (A/B gate, after 13+14) → Task 19 (closure, after 18 passes)
```

**Parallelism notes:**
- Tasks 1-5 (code) and Tasks 7-9 (content) can run in parallel — no cross-dependency.
- Task 6 (chunker rewrite) depends on Tasks 1-5 (code foundations) AND Tasks 7-9
  (content files must exist for tests to pass against real content).
- Task 10 (spot-check) depends on Tasks 7-9 (content authored).
- Task 11 (canon gate) depends on Task 6 (chunker) + Task 10 (content accepted).
- Phase 5 (Tasks 12-17) is sequential after deploy.
- Task 18 depends on Tasks 13+14 (grounding scores measured).
- Task 19 is gated on Task 18 passing.
