# Architect validation — FIX-T20 wave + Task 21 + Phases 8/9 (Kiro commits 62f12a4..817d20b)
# Executed: 2026-07-16T19:44–19:58 ET | all commands exit 0 unless noted

## Verdict: ACCEPTED (all 8 commits) — with 2 corrections noted below

## Rule-7 audit
- Kiro committed PER TASK this time (first wave to do so) — 8 commits, each
  with its evidence log in the SAME commit. IMPROVEMENT ACKNOWLEDGED.
- MISS: none of the task commits ticked the tasks.md checkboxes. Architect
  ticked 21, 30–34, 36, 37 in this validation commit (35 stays open —
  legitimately BLOCKED on Tasks 27/28). Going forward: tick + log + code in
  the same commit.

## Re-executed evidence (BINDING RULE: root suite at delivered commit)
- HEAD 817d20b: `npx tsc --noEmit` exit 0.
- `npx vitest run` (ROOT): **991 passed | 4 skipped (995), 93 files + 1
  skipped — 0 failures.** Matches Kiro's claim EXACTLY. Duration 20.96s.
- ACC-3 skip is a properly annotated `it.skip('BLOCKED: ar-check.ts not yet
  implemented (Tasks 27/28)')` at acc-integration.test.ts:235.
- acc-integration.test.ts is HERMETIC: bedrock-runtime/dynamodb/eventbridge
  clients all vi.mock'd, env stubbed. ✓ unit-lane discipline.

## Per-commit findings
- **62f12a4 FIX-T20-1 (short-circuit)**: correct shape — early return before
  hop/grounding, Ai.GuardrailChecked with policy 'prompt-attack', usage
  metered. Envelope uses publisher's Omit<auditTrail> API (registry stamps
  it); detailType already registered. ✓
- **9373300 FIX-T20-2 (RAG restore)**: chunks appended as second user-content
  block in all 3 guru handlers; groundingContext retained. Test asserts
  'Relevant ISO' text reaches converse params. ✓
- **0dfe92f FIX-T20-3 (BLOCKED diagnosis)**: **VERIFIED LIVE — Kiro's
  diagnosis is CORRECT and supersedes the architect's signing hypothesis.**
  - Guru9001Fn live VpcConfig: null. ApplyTemplateFn (same signed client,
    works): vpc-067b2b0b8e1693b6d, 2 subnets. (lambda
    get-function-configuration, dev-admin, 19:50 ET)
  - Live network policy cumplify-iso-kb-net: AllowFromPublic:false,
    SourceVPCEs:[vpce-089b26b4a26fc80f5], SourceServices:[bedrock.amazonaws.com]
    (the SourceServices entry was absent from Kiro's log — immaterial to the
    diagnosis).
  - ARCHITECT ADDENDUM (found during fix): the VPC has **natGateways: 0**
    (network-stack.ts:95, deliberate cost lever) and NO Lambda interface
    endpoint — Kiro's Option A/B as written would have BROKEN the guru→invoker
    lambda:Invoke transport. Fix requires the endpoint too (see commit that
    follows this one).
- **67ff985 FIX-W-1 (meter-before-throw + encoding)**: the encoding half is a
  REAL dormant-guardrail find — converse.ts:241 decodes wire names via
  fromWireToolName (underscores→hyphens) before toolUseBlocks, so the old
  underscore registry could NEVER match; L3 hop check was dormant in every
  live run to date. Registry now hyphen-form. Metering wraps checkHopPayload
  in try/catch, meters on HOP_BLOCKED, rethrows. ✓
- **30f2e2a FIX-W-2**: `buildSystemPrompt(request.system ?? '')` —
  unconditional wrap. ✓
- **d7e8499 Task 21**: corpus map is **152 tuples** (68× ISO 9001, 38× ISO
  14001, 46× ISO 45001), zero duplicates — Kiro's "151" claim is off by one
  (cosmetic; commit message + log say 151, disk says 152). Format matches
  BC-2: {standard, edition, clause_number, title}, no ISO body text (no line
  exceeds title length). CORRECTION noted, content accepted.
- **3c55800 Tasks 30–32**: schema modifies `type GuardrailEvidence` IN PLACE
  (no `extend type` — AppSync rule respected); adds FlaggedApproval type; NO
  mutation-input changes (SCHEMA-5 not applicable). HitlDecision enum is
  APPROVE|SEND_BACK only, so L5-2's `decision==='APPROVE' && !justification`
  gate cannot be bypassed via an alternate approve variant. flaggedApproval
  stamped on the sealed audit event on flagged+approved. ✓
- **817d20b Tasks 33–37**: ACC-1/2/4/5 exercised against full invoke()
  orchestration with mocked transports; ACC-3 skip-annotated. ✓

## Corrections applied in this commit
1. tasks.md ticks for 21, 30–34, 36, 37 (rule-7 completion).
2. Corpus-map tuple count corrected on record: 152, not 151.
