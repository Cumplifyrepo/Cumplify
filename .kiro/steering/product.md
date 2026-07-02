---
inclusion: always
---
# Product Context — Cumplify.ai

## What it is
Multi-tenant, agentic Integrated Management System (IMS) SaaS covering
ISO 9001:2015 (Quality) + ISO 14001:2015 (Environmental) + ISO 45001:2018 (OH&S).
79 sub-clauses, 13 modules (M1–M13), 22 Bedrock agents under a ControlTower
supervisor, running detect → draft → route → verify → close on an immutable,
hash-chained, WORM-sealed audit trail.

## Four planes

| Plane | Purpose | Key components |
|---|---|---|
| Growth | Attract, convert, activate | Landing pages, Pain-Point Intelligence Engine, AI Readiness Snapshot (pre-auth), PLG telemetry |
| Application | The IMS product | M1–M13 modules, AppSync, Next.js app |
| Intelligence | Agentic backbone | 22 Bedrock agents, ControlTower, EventBridge/SQS, Bedrock KBs on AOSS |
| Control | Run the business | Tenant provisioning state machine, billing/entitlements, admin ops, observability, DR |

## Personas (12 roles, 5 seat classes)
1. Top Management / Executive — 5.1 leadership, 9.3 review
2. Management Rep / IMS Lead — 5.3 coordinator, first-user role at signup
3. Quality Manager — 9001 ownership
4. EHS Manager — 14001+45001 ownership
5. Document Controller — 7.5.3, segregation-of-duties enforced
6. Internal Auditor — 9.2, auditor-independence enforced
7. External Auditor (guest) — time-boxed, read-only, free unlimited seats
8. Process Owner — 4.4, row-level scoping
9. Supervisor — 45001 operational
10. Employee / Worker — 5.4 participation
11. Contractor (limited) — auto-expiring
12. Partner Consultant — cross-tenant, client-approved delegated access

Seat classes: Full (1–6,8,9) · Worker (10, free-to-cheap) · Guest-Auditor (free) ·
Contractor (free, expiring) · Partner (free to tenant).

## Two billing rails (one tenant, one rail, immutable)
- **Stripe rail:** checkout, subscriptions, Credit Packs, dunning. Card-on-file
  trial (14-day, 15k Credits). Plans: Launch $399/mo, IMS Pro $899/mo, Enterprise custom.
- **AWS Marketplace rail:** contract-with-consumption listing. Same plans as
  contract dimensions + metered `ai-credits-1k` overage. Private Offers for
  Enterprise. CPPO for partner channel. Free trial via native Marketplace mechanism.
- Rule: exactly one rail per tenant, set at provisioning. No cross-rail promotion.
  Price parity is a tested CI assertion.

## North-star metric
**Time-to-first-sealed-audit-event** — the elapsed seconds from a user's first
action to the first immutable, hash-chained audit record proving the system
worked on their behalf. Every product decision optimizes toward shrinking this.

## Competitive wedge (vs CertifyAero: single-standard, $349/mo, SMB-only)
1. Tri-standard IMS (not single-standard documents)
2. Genuinely agentic backend (not client-side chatbot)
3. Enterprise multi-tenancy with auditable-by-construction trail

## Margin mandate
>50% net margin is an engineered invariant (Part 27). Per-tenant AI COGS ≤9%
of plan price. No feature ships without its unit-cost line.
