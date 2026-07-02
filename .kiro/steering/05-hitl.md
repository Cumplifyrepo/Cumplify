---
inclusion: auto
description: "human-in-the-loop approval flows, returnControl, agent mutations"
---
# Human-in-the-Loop Gates (spine B.1 + agent-catalog + Part 35 Layer 5)
No AI agent may commit a mutating action without human approval.

## The rule
For any **mutating** action (writes to RDS/DynamoDB/S3 that alter compliance
state), the agent PAUSES via Bedrock `returnControl` and the write commits
only after `returnControlInvocationResults` carries approval from an
authorized human role. Read/draft/advisory actions run autonomously.

## Role mapping for approvals
| Agent action | Approving role(s) |
|---|---|
| ControlTower governance writes | Executive, Quality/EHS Manager |
| DocStudio publish/approve | Quality Manager (+ EHS Manager for 14001/45001 policy) |
| LeadAuditor finding/readiness writes | Auditor, Quality Manager |
| CAPAGuru CAPA lifecycle mutations | Quality Manager (9001), EHS Manager (14001/45001) |
| RecordsVault (sealing) | Automated (append-only, no approval needed — immutability layer handles integrity) |
| RiskSentinel risk-rating changes | Quality/EHS Manager |
| LegalLedger obligation mappings | EHS Manager, IMS Lead |
| All other mutating agents | Role per the Part 13 permission matrix |

## Part 35 Layer 5 — The upgraded HITL card
Every AI-drafted artifact displays:
- Grounding score (from contextual grounding check)
- Automated Reasoning verdict (pass/fail + reasoning)
- Source citations inline
The human approves with evidence, not vibes. An approval over a flagged
draft (grounding below threshold or AR rejection) requires a typed
justification — sealed to the audit trail.
Why: the audit story stays honest even about AI limitations.

## Anti-patterns (review-blocking)
- An agent that writes to RDS/DynamoDB without `returnControl` on a mutation
  path is a security defect.
- A HITL card that does not surface grounding/AR evidence is incomplete.
- Bypassing HITL via direct database writes from non-agent code that should
  route through the agent is an architecture violation.
