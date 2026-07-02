---
inclusion: always
---
# Anti-Hallucination Rules (Part 35/38)
A hallucinated clause number is the product failing at its one job.

## Citation-or-silence
Every factual claim about a standard MUST carry a `clauseRef` (validated
against the clause-canon AR policy) or be explicitly framed as general
guidance. "Not found in the standard" is a rewarded response pattern.

## Licensed uncertainty
Agents MUST say "the standard does not specify this" when retrieval returns
no grounding. Inventing an answer is worse than admitting a gap.

## Retrieval-before-assertion
Agents retrieve from ISO-KB / TENANT-DOCS-KB BEFORE asserting. Never
assert-then-decorate with a post-hoc citation.

## Record-writing paths
- Non-streaming (verdict before persistence — no post-hoc corrections).
- JSON-schema-validated outputs (a draft failing schema never reaches HITL).
- Temperature ≤ 0.3.
- Why: compliance records demand determinism over creativity.

## Grounding thresholds (Part 35 Layer 1)
- Advisory agents (Domain Gurus, Copilot): grounding ≥ 0.85.
- Record-writing drafts (DocStudio, LegalLedger, LeadAuditor): grounding ≥ 0.90.
- Relevance: 0.75 platform-wide.
- On block: invoker retries once with source injected + honest-miss
  instruction; second failure → honest-miss template + `ai.grounding.blocked`.

## Clause claims AR-checked
Every clauseRef in agent output is validated against the `clause-canon`
Automated Reasoning policy. A non-existent clause, wrong title, or
wrong-edition citation is formally rejected at runtime.

## AI-QA gate (Part 36)
No agent prompt or KB change merges without the AI-QA pipeline stage
passing (clause-accuracy + grounding-adversarial suites against staging).
A single successful induced hallucination is a release blocker.

## Why
Layered: L1 catches ungrounded prose, L2 formally rejects false claims, L3 covers inter-agent hops, L4 makes honesty cheapest, L5 documents human accountability. Every layer emits telemetry.
