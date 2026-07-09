# agents-existing-8 REQ-SERVE-0 — Owner Decision (REQUIRES-HUMAN)

**Date:** 2026-07-08
**Requirements baseline:** R2 (fd18e6f) — architect-APPROVED
**Decision (verbatim):** "Option B — Custom Converse loop"
**Decided by:** Owner, on architect recommendation (leaned B).

## Decision
The agent orchestration paradigm is **Option B — Custom loop on the one-door
Converse module** (`services/ai-invoker`). NOT managed Bedrock Agents.

Verified against aws-bedrock skill (verified_on 2026-06-06): managed Bedrock
Agents (CfnAgent) bake `foundationModel` at deploy and expose async metering
only — incompatible with invoke-time Register resolution + inline credit
metering. Option B preserves the spec-30 margin model (>50% net at
$0.00396/credit, Register as invoke-time source of truth, exact credit
pre-check, instant EXPIRED fail-closed).

## What this locks for design.md
- REQ-SERVE-2/3/10/11 apply AS WRITTEN (invoke-time Register resolution;
  inline token metering from the Converse response; schema-validate + one-retry;
  prompt-cache weights).
- REQ-CDK-5 → **CDK-5B**: NO `CfnAgent`. Agents are code modules invoked
  through `services/ai-invoker`. (Guardrails still apply via Converse
  `guardrailConfig` — CfnGuardrail with PII + PROMPT_ATTACK per REQ-CDK-5.)
- REQ-EVT-4 → **EVT-4B**: invoker Lambda calls Bedrock **Converse** directly
  (not `InvokeAgent`).
- REQ-WB-2 (HITL): build a `returnControl`-EQUIVALENT — architect-preferred
  **Step Functions `waitForTaskToken`** (durable, audited) over an SQS
  callback. Design specifies the mechanism.
- REQ-CDK-4: `bedrock:InvokeModel` (Resource `*`) belongs ONLY on the
  one-door invoker execution role — NOT on each action-group/tool Lambda.

## Build-time watch items (carry to design/build)
- If this spec configures a Bedrock KB / embeddings: Titan Embed v2 =
  **1024 dimensions** (NOT 1536; the older KB snippet in the skill memory is
  flagged wrong). Corpus-corrected value.
- Agent-catalog's Nova/Sonnet inline models are SUPERSEDED by the Register
  (Anthropic removed). No `anthropic` model ID anywhere (REQ-CDK-7).

## Disposition
Requirements R2 APPROVED. REQ-SERVE-0 RESOLVED (Option B). Design.md
unblocked — author under Option B, resolve REQ-WB-2 HITL mechanism, stop for
architect review.
