# Tasks Review — iso-kb-seeding

> **Reviewer:** Architect (Claude) — independent on-disk verification
> **Date:** 2026-07-17
> **Inputs reviewed:** `tasks.md` @ b223565 (202 lines), `design.md` rev 2 @ 35818db (diff verified hunk-by-hunk against D-1..D-5)
> **Verdict:** APPROVED WITH ONE CORRECTION — fold T-1 into tasks rev 2, then Phase 1+2 [KIRO] wave may begin. STOP before Phase 3 (architect lane).

---

## Design rev 2 verification (35818db) — ACCEPTED

All five corrections from `design-review.md` verified folded faithfully:

| Item | Verified in rev 2 |
|------|-------------------|
| D-1 (M) | §2.2 new section, MANDATORY: esbuild `loader: { '.md': 'text' }` + build-time `import`; `readFileSync(resolve(__dirname,…))` REMOVED from handler pseudocode; CDK bundling block updated |
| D-2 (M) | New §2.3.1: `_meta` doc `metadata.tenantId='__META__'`, NO `embedding` field, unit-test assertion named; doc shape shown |
| D-3 (L) | §4.1 rewritten: `retrieve()` 404 non-retryable, fails fast attempts:1 — plus a correct NEW distinction I did not ask for but endorse: the seeder's own `withRetry` DOES retry 404 (index-activation delay, deploy-time, no user waiting) while guru retrieval fails fast (user-facing). §5 cross-references it |
| D-4 (L) | Access-policy text now "additive unions … no priority ordering exists" |
| D-5 (L) | `EXPECTED_CHUNK_COUNT = 79` pinned; unit + property tests updated to assert `=== EXPECTED_CHUNK_COUNT` |
| minor | `TABLE_NAME` env dropped from seeder Lambda definition |

Status header updated to APPROVED rev 2 with review pointer. Diff scope is exactly the corrections — no unrequested design drift.

## tasks.md review (b223565)

Structure verified: 13 tasks / 4 phases; lanes correct (T1–T6 [KIRO] hermetic unit lane,
T7–T12 [ARCHITECT] deploy + live readback, T13 [REQUIRES-HUMAN] OQ-1 ratification);
rule 7/8 evidence contract stated per task; ACC-1..6 all mapped (unit + live legs);
dependency graph consistent (1,2,3,6 parallel → 4 → 5 → 7 → 8..12 → 13).
R-3 honored in Task 5 (`Duration.minutes(10)` = 600s ≥ seeder 300s); R-4 in Task 3
(`[Annex SL HLS]` prefix assertion); D-2 gets a LIVE leg in Task 9 (`__META__`
retrieval probe → 0 chunks) beyond the unit assertion — good addition.

### T-1 (M) — D-1 import strategy is bundle-only; the unit lane cannot execute it as written

`import source from '../../../docs/architecture/iso-requirements-map.md'` works in the
deployed bundle (esbuild `loader` map, Task 5) but Tasks 3/4 ALSO exercise the importing
modules under the unit lane, and **two toolchains there know nothing about it**:

1. **vitest (vite)** — `vitest.config.ts` has no `.md` handling; vite cannot resolve a bare
   `.md` import → chunker/handler test files fail at import resolution before any test runs.
2. **tsc --noEmit** — no ambient module declaration for `*.md` → TS2307. Every Task 3/4
   evidence line ("tsc exit 0, vitest passes") is unsatisfiable as specced.

Verified: no `declare module '*.md'` and no vite md-plugin exists anywhere in the repo
(grep over services/ + infra/, 2026-07-17). The prompt-library precedent used inline
constants + parity test precisely because no import wiring existed — but that approach is
rejected here (30KB corpus constant is drift-prone duplication; the .md must stay the
single-source authority).

**Required fold (amend Task 3 scope; Task 1 acceptable alternative):**
- Add ambient declaration `services/iso-kb-seeder/src/md.d.ts`:
  `declare module '*.md' { const content: string; export default content; }`
- Add a minimal vite plugin to `vitest.config.ts` so the SAME bare specifier resolves in
  the unit lane (load `.md` files as `export default JSON.stringify(content)`).
- **Constraint:** do NOT use vite's `?raw` suffix — esbuild/NodejsFunction cannot resolve
  suffixed specifiers; the specifier must stay identical in both toolchains.
- Reading a repo `.md` inside the vite plugin at test time does not breach hermeticity
  (hermetic lane bars live AWS, not repo files).

### Observations (no task change required)

- **O-1 (ACC-4):** the "content change → re-seed" live leg is proven by mechanism
  (CDK fingerprint pin, Task 5) + first-seed-from-empty (Task 7) + same-hash-skip
  (Task 10). A witnessed full cycle (edit source → auto re-seed) will occur naturally at
  the first real corpus edit; log it as supplementary evidence then.
- **O-2 (ACC-5 live method, Task 11):** method as written is vague; the architect lane
  will pick the concrete negative probe at execution time. Unit leg (Task 4) is the
  primary fail-closed proof.
- **O-3:** `EXPECTED_CHUNK_COUNT` placed in `services/agents/shared/constants.ts` is
  acceptable (seeder already imports `signedAossFetch` from agents/shared).

## Order

1. Fold T-1 into tasks.md rev 2 (one commit).
2. Phase 1 + Phase 2 [KIRO] build wave (Tasks 1–6) may proceed immediately after —
   per-task evidence contract, rule 7/8, hermetic lane.
3. STOP at end of Phase 2. Tasks 7–12 are architect lane; Task 13 awaits owner.
