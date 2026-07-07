---
inclusion: always
---
# Model Policy (Part 30 — eval-driven, Register-authoritative)

> **REQUIRES-HUMAN — RATIFICATION BLOCK**
>
> This amendment awaits owner sign-off. The owner is approving:
> 1. The eval-driven model ladder (lowest-$/task Bedrock model passing the seat's eval bar)
> 2. Micro bar recalibration (0.95 → 0.90; justified by 11-model evidence showing zero passers at 0.95)
> 3. Three PROVISIONAL conditions: guru-45001 retrieval-gate, workhorse scaffolding+retry, micro bar ratification
> 4. LegalLedger non-assignment (retrieval-gated; leading candidates identified, budget cap attaches on assignment)
> 5. Anthropic removal (owner decision 2026-07-06: use-case form declined + margin-fail)
>
> Until sign-off is recorded in `.kiro/evidence/model-policy-evals/steering-15-ratification.md`,
> this file is a DRAFT and does not govern builds.

## Policy (owner amendment 2026-07-05)

Every model assignment defaults to **the lowest-$/task model on Bedrock that
passes the seat's eval bar**. The Model Justification Register
(`contracts/model-register.md`) is the sole source of truth for all assignments.

## Register as Source of Truth

- All seat assignments, $/task measurements, margin headroom, and expiry dates
  live in `contracts/model-register.md` — NOT duplicated here.
- This steering file governs the RULES; the Register governs the DATA.
- A Sonnet or any Anthropic model reference anywhere in the codebase fails review
  (owner decision 2026-07-06: platform removal).

## Removed Models

- **Nova Premier v1** (`us.amazon.nova-premier-v1:0`): LEGACY, not invocable. Removed from all consideration.
- **Claude Sonnet 4.6** (`us.anthropic.claude-sonnet-4-6`): REMOVED by owner decision 2026-07-06 (Bedrock use-case form declined + margin-fail: $0.0126/task vs $0.0198 revenue = 36% margin, below >50% mandate).

## Rules

1. The Register is append-only. New seats require eval evidence before assignment.
2. Register entries carry expiry dates (max 90 days). An expired entry without
   re-validation is flagged EXPIRED — invoke-time enforcement is the ai-core
   spec's responsibility.
3. No model outside the Register may be introduced without a written, evaluated
   justification passing quality bar + margin mandate.
4. The one-door rule (steering 12-token-metering) is UNCHANGED: every model
   invocation goes through the bedrock-invoker layer. A direct InvokeModel
   anywhere else fails review.
5. Re-validation is runbook-initiated for all seats (quarterly cadence). No
   unattended Bedrock spend — every run requires architect-approved budget.
6. New models accessible on Bedrock are candidates by default (open candidate
   set). The quarterly re-validation checks for newly available models.

## Eval Quality Bars (from design §2.3)

| Tier | Bar |
|------|-----|
| Guru (clause-citation) | >= 85% mean |
| Workhorse (schema + content) | 100% schema AND 85% correctness |
| Lightweight | >= 90% task correctness |
| Micro (multi-label F1) | >= 0.90 (recalibrated from 0.95; owner ratifies) |
| Snapshot | 100% schema + architect spot-review |
| Editor-AI | 100% schema + architect spot-review |
| Pain-distiller (label coverage) | >= 85% |
| LegalLedger (rubric) | mean >= 4.0, no criterion at 1 |

## Cost Discipline

- Margin mandate: every assigned model's measured $/task must clear >50% net
  at planned credit pricing ($0.00396/credit, Part 22).
- Candidates that pass quality but fail margin are not eligible for assignment.
- The Register records margin headroom per seat for ongoing monitoring.
