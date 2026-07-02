---
inclusion: always
---
# One Door to Bedrock
No code may call bedrock-runtime directly. Every model invocation (agents,
Snapshot, editor AI, support bot) goes through the bedrock-invoker layer
(services/ai-invoker), which: attaches the tenant application inference
profile + Converse requestMetadata {tenantId, agent, module, feature},
pre-checks the Credit balance, applies prompt caching checkpoints, records
exact token counts post-call, and emits telemetry.credits.consumed.
Exception paths that NEVER block on credits: incident reporting, HITL approvals.
Why: this single choke point is the margin control (>50% net mandate, Part 27)
AND the localization point (Part 31) AND the cost-attribution point (Part 22)
AND the anti-hallucination enforcement point (Part 35).
A direct InvokeModel anywhere else fails review.
