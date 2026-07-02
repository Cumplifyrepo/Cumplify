---
inclusion: fileMatch
fileMatchPattern: "{services/marketplace/**,frontend/**billing**}"
---
# AWS Marketplace Rules (Part 46 steering delta)
Two front doors, one tenant model, one entitlement truth, one immutable trail.

## Activation rule
Activation ONLY after entitlement confirmation (subscribe-success event),
NEVER on token alone. The fulfilled token proves identity; entitlement proves
payment. Activating on token alone = giving away the product.
Why: the Marketplace flow is async — token arrives before payment clears.

## Metering
- Hourly BatchMeterUsage via EventBridge Scheduler → meter Lambda.
- Zero-usage records sent every hour even when idle (recommended practice;
  earliest detector of a broken meter).
- Final meter ≤ 1 hour on cancellation (hard SLA — dedicated final-meter
  Lambda short-circuits the hourly batch on unsubscribe-pending).
- Idempotency token = tenant+hour. Failures → `meteringfailed` state + alarm.
- A failed meter is unbilled revenue — pages on-call.
- Why: AWS requires timely, accurate metering; missed meters = lost revenue.

## Dual-rail rules
- Exactly one rail per tenant (stripe | marketplace), set at provisioning,
  immutable. Rail migration = managed offboard/onboard only.
- One writer per rail: Stripe webhook Lambda writes rail=stripe items ONLY;
  mp-lifecycle handler writes rail=marketplace items ONLY (IAM-enforced on
  item attribute — the two brains physically cannot overwrite each other).
- Readers are rail-agnostic (same abstraction, no branching except UX rules).
- Credit Packs: Stripe tenants buy packs; Marketplace tenants use the metered
  dimension at the identical per-Credit price.

## Price parity
Price parity across both rails is a **tested CI assertion**, not a policy memo.
Part 43.1 dimension prices = Part 17 annual prices. Any drift fails the build.
Why: Marketplace listing compliance requires identical pricing.

## No cross-rail promotion
Marketplace-sourced tenants see Marketplace-native upgrade paths only.
The pricing page branches on `billingRail=marketplace`. No Stripe trial,
no Stripe pricing, no offers unavailable on Marketplace may appear.
Why: Marketplace listing compliance rule (Part 43.3).

## API calls
All Marketplace APIs (ResolveCustomer, GetEntitlements, BatchMeterUsage)
called from us-east-1 ONLY, via the scoped integration role.

## Concurrent Agreements
One AWS account may hold multiple agreements. Mapping: agreement → tenant.
AgreementId stored on ENTITLEMENT item. All math is per-agreement, never
per-AWS-account. Why: mandatory since 2026-06-01 for new listings.
