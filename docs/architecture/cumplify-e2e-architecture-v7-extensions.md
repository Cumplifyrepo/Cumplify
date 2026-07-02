# Cumplify.ai — Master Architecture v7.0 Extensions

**Document:** `cumplify-e2e-architecture-v7-extensions.md`
**Version:** 7.0 · 2026-07-01
**Status:** Authoritative additions to v1–v6 + spine. Precedence: **v7 > v6 > … > spine**. Overrides: AWS Marketplace moves from "evaluate, P4+" (v3 Part 25.3) to a **day-1 launch channel** — the integration is a **P2 launch gate**, with FTR started in P1 (its 8-week lead time back-plans from launch). Amends: Part 6 (provisioning gains a `source=marketplace` branch), Part 7/22 (dual billing rails), Part 27 (fee line), Part 16 (CPPO channel motion), v1 Part 11.3 (P1/P2 gate contents).

---

## Table of Contents
- [Part 43 — Marketplace Commercial Architecture (listing, dimensions, offers)](#part-43)
- [Part 44 — Marketplace Technical Integration (fulfillment, entitlements, metering, events)](#part-44)
- [Part 45 — FTR & Launch Operations (the 8-week back-plan)](#part-45)
- [Part 46 — Kiro Delta: Spec 40/41, Steering, Kickoff Prompt](#part-46)
- [Appendix H — Justifications & Fee Impact (v7 delta)](#appendix-h)

---

<a name="part-43"></a>
## Part 43 — Marketplace Commercial Architecture **[NEW]**

### 43.1 Listing type & dimension design

**Listing:** SaaS product, **"contract with consumption"** — the model built for exactly our shape (base plan + variable usage), and the one that unlocks MACC (customers' committed AWS spend can buy Cumplify) and **Private Offers**, where most enterprise Marketplace deals actually close.

**Contract dimensions (annual or monthly contracts):**

| Dimension key | Maps to | List price (parity with Part 17, annual anchor) |
|---|---|---|
| `launch-tier` | Launch plan (1 standard, 5 Full seats, 30k Credits/mo) | $4,584/yr ($382/mo eq.) |
| `imspro-tier` | IMS Pro (all 3 standards, 15 Full seats, 70k Credits/mo) | $9,684/yr ($807/mo eq.) |
| `enterprise-tier` | Enterprise base (custom via Private Offer only) | Private Offer |
| `addl-seat-pack` | +5 Full seats | $1,740/yr |
| `addl-site` | +1 site (Pro+) | $1,788/yr |

**Consumption (metered) dimension:**

| Dimension key | Unit | Price |
|---|---|---|
| `ai-credits-1k` | 1,000 Cumplify AI Credits beyond the contracted grant | **$3.96 per 1k** (= the $99/25k pack rate — strict price parity across rails, Part 43.3) |

Dimension design rules: keys are immutable once live (choose boringly); every future plan change must express itself as new dimensions or Private Offers, never renamed keys; Enterprise always transacts via Private Offer (custom terms, custom EULA attachment, multi-year, flexible payment schedules).

### 43.2 Offers strategy

- **Public offer:** Launch + IMS Pro self-service with the dimensions above; our custom **EULA + ToS stack (v2 Part 12.1)** attached as the license terms (Marketplace supports custom EULAs — Delaware law preserved).
- **Private Offers:** the Enterprise motion — sales-assist quotes rendered as Marketplace Private Offers so the buyer's procurement is "click accept in your AWS account."
- **CPPO (Channel Partner Private Offers):** the Part 16 consultant channel gets a second rail — qualifying implementation partners registered as channel partners can **resell Cumplify via CPPO**, taking their margin through AWS instead of (never in addition to) the affiliate commission. Rule: **one compensation rail per deal** — a CPPO deal pays the partner via their resale margin; the same deal cannot also accrue affiliate commission (enforced in the attribution logic; stated in the Affiliate Agreement).
- **Marketplace free trial:** a **separate 14-day Marketplace free-trial offer** (native Marketplace mechanism), because the Stripe card-trial funnel must not be cross-promoted on Marketplace surfaces (43.3). Same 15k trial Credits, same Free Reader fallback.

### 43.3 Compliance rules for listing & fulfillment surfaces (build requirements, verbatim into spec 40)

1. **No cross-rail promotion:** the Marketplace listing, fulfillment page, and in-product surfaces shown to Marketplace-sourced tenants must not advertise the Stripe trial, Stripe pricing, or any offer not available on Marketplace. The pricing page detects `billingRail=marketplace` and renders the Marketplace-native upgrade paths only.
2. **Fulfillment page requirements:** existing users can log in from it; support contact options displayed on it; new users reach first-use experience directly from it.
3. **In-app subscription visibility:** Settings → Billing for Marketplace tenants shows contract dimensions, entitlement quantities, current metered usage, and renewal date — sourced from GetEntitlements + our meter, not from Stripe.
4. **Cancellation routing:** Marketplace tenants who ask to cancel are directed to AWS Marketplace (their agreement lives there); our one-click cancel remains for Stripe tenants only. Copy in Settings branches on rail.
5. **Price parity:** identical effective prices on both rails (43.1 table = Part 17 annual prices; `ai-credits-1k` = pack rate). Parity is a config assertion tested in CI, not a policy memo.

---

<a name="part-44"></a>
## Part 44 — Marketplace Technical Integration **[NEW — spec 40 content]**

All Marketplace APIs are called from **us-east-1** (mandatory; conveniently our primary region). The SBT-AWS `AWSMarketplaceSaaSProduct` construct is the scaffold (registration API, subscriber table, event-handling Lambdas); we adapt its outputs into our own tenant lifecycle rather than running it as a parallel brain.

### 44.1 Fulfillment & activation flow (the new front door)

```
AWS Marketplace "Subscribe" → POST redirect to
https://aws.cumplify.ai/marketplace/fulfillment  (API GW, GrowthStack — the
pre-auth boundary; WAF; token valid 4h)
 1. Lambda exchanges x-amzn-marketplace-token via ResolveCustomer →
    {CustomerIdentifier, CustomerAWSAccountId, ProductCode, LicenseArn};
    persist as MPSUB#<CustomerIdentifier> in CumplifyCore (idempotent).
 2. DO NOT ACTIVATE YET. Render the landing state: existing-user login OR
    new-account form (email/password/company — the S4 flow, MINUS the Stripe
    card step; the FULL legal gate S4b remains — Marketplace license terms do
    not replace our click-wrapped consent events).
 3. Await the entitlement event (44.2). Only after `subscribe-success` /
    entitlement confirmation: call GetEntitlements, translate dimensions →
    ENTITLEMENT item {rail: marketplace, plan, seats, sites, creditsGrant,
    contractEnd}, then fire the Part 6 provisioning state machine with
    source=marketplace (Snapshot seeding if they came through the funnel;
    industry-template seeding otherwise).
 4. Concurrent Agreements (mandatory for all new listings since 2026-06-01):
    one AWS account may hold multiple simultaneous agreements → our mapping is
    agreement→tenant (each purchase can provision a distinct tenant, or attach
    added dimensions to an existing tenant chosen at fulfillment); AgreementId
    stored on the ENTITLEMENT item; all entitlement math is per-agreement,
    never per-AWS-account.
Failure paths: token expired → friendly re-subscribe guidance; ResolveCustomer
error → retry w/ backoff then support handoff; entitlement never arrives (15
min) → pending page + alert. Every step emits audit events (of course).
```

### 44.2 Subscription lifecycle events

New listings use **EventBridge** for Marketplace subscription notifications (SNS is legacy) — we are EventBridge-native, so: Marketplace events → rule → dedicated SQS `mp-lifecycle` (FIFO by CustomerIdentifier, DLQ) → handler Lambda:

| Event | Action |
|---|---|
| subscribe-success | Unblock activation (44.1 step 3) |
| entitlement-updated | Re-read GetEntitlements → update ENTITLEMENT (upgrade/downgrade/renewal); downgrades apply the same grace semantics as Stripe (Part 6.2) |
| unsubscribe-pending | Tenant → PAST_DUE-equivalent read-only path; **send the final metering record within 1 hour** (hard SLA — a dedicated final-meter Lambda short-circuits the hourly batch) |
| unsubscribe-success | Tenant → SUSPENDED → PENDING_DELETE ladder (Part 6.2 unchanged; WORM retention disclosure unchanged) |
| subscribe-fail | Purge the MPSUB record; no tenant created |

### 44.3 Metering job (Credits → `ai-credits-1k`)

- Hourly EventBridge Scheduler → meter Lambda: reads each Marketplace tenant's Part 22 meter, computes Credits consumed **beyond the contracted grant** this hour, aggregates, calls **BatchMeterUsage** (≤25 records/call, batched).
- Rules honored: requests are de-duplicated per hour (idempotency token = tenant+hour); **zero-usage records sent every hour** even when idle (recommended practice — and our earliest detector of a broken meter); failures land in a `meteringfailed` state with alarm + retry (a failed meter is unbilled revenue — pages on-call); CloudTrail-monitored as AWS recommends.
- Monthly reconciliation (v3 Part 22.3 close) now reconciles **three** ledgers: internal meter ↔ Bedrock actuals ↔ Marketplace-reported usage. Drift >3% on any pair is a tripwire.

### 44.4 Dual-rail entitlement rules (one truth, two writers)

```
ENTITLEMENT item gains: rail = stripe | marketplace, agreementId?, licenseArn?
- Exactly one rail per tenant, set at provisioning, immutable (rail migration
  = a managed offboard/onboard, Enterprise-assisted only).
- Writers: Stripe webhook Lambda writes rail=stripe items ONLY; the mp-lifecycle
  handler writes rail=marketplace items ONLY (enforced by IAM condition on an
  item attribute — the two billing brains physically cannot overwrite each other).
- Readers (authorizer, plan gates, Credit meter, UI) are rail-agnostic: they
  read the same abstraction and never branch on rail except for the UX rules
  in 43.3 (upgrade paths, cancellation routing, billing page rendering).
- Credit Packs: Stripe tenants buy packs via Stripe (unchanged); Marketplace
  tenants do not buy packs — overage flows automatically through the metered
  dimension at the identical per-Credit price (simpler AND parity-true).
```

### 44.5 IAM & seller-account plumbing

Integration role: `aws-marketplace:ResolveCustomer`, `aws-marketplace:BatchMeterUsage`, `aws-marketplace:GetEntitlements` (Resource `*` — the Marketplace APIs' shape), scoped to the two integration Lambdas only; EventBridge/SQS grants per the standard pattern. Seller account = the prod account's management boundary per AWS's multi-account Marketplace guidance (integration calls may assume a role into the seller context). Marketplace test products used for the full integration test matrix before visibility flips public: fulfillment happy-path, expired token, malformed token, entitlement upgrade/downgrade, cancel + 1-hour final meter, zero-usage hours, concurrent second agreement on the same AWS account. **Never enable auto-renew on test subscriptions** (a known and expensive footgun).

---

<a name="part-45"></a>
## Part 45 — FTR & Launch Operations (the 8-week back-plan) **[NEW]**

The Foundational Technical Review is the gating review (security, reliability, performance, operational excellence). Start it **in P1** — its 2–4 week review plus prep back-planned 8 weeks from the P2 launch date. Our posture makes it largely a paperwork exercise:

| FTR area | Answered by |
|---|---|
| Security (encryption, IAM, secrets, no hardcoded creds) | SecurityStack + Part 9 battery + Part 23 fabric |
| Reliability (backups, DR, multi-AZ) | AWS Backup + Part 10 DR + game days |
| Operational excellence (monitoring, runbooks, support) | Part 37 observability + Part 33 Connect + runbooks |
| Well-Architected alignment | Run a formal **Well-Architected Review in P1** — it doubles as the FTR waiver path and the "Deployed on AWS" badge evidence (architecture diagram uploaded to Partner Central) |

**Ops checklist (sequenced):** P0 — APN partner account + Marketplace seller registration (tax/banking, Strivana Com LLC). P1 — Well-Architected review; FTR submission; dimension design frozen (43.1); listing draft (description, categories, keywords, screenshots in EN — listing copy runs through the same pain-point-driven messaging as the funnel); legal stack attached as custom EULA. P2 — spec 40 integration built + full test-product matrix green; limited listing review (3–7 business days) submitted **before** the public-launch week; visibility flips public **the same day** the Stripe funnel opens: **two front doors, one day-1**. Post-launch — disbursement reporting joins the monthly close; Marketplace-sourced MRR tracked as its own telemetry channel; CPPO partner onboarding opens in P3 with the Partner Portal.

---

<a name="part-46"></a>
## Part 46 — Kiro Delta: Specs, Steering, Kickoff Prompt

| # | Spec | Contents | Phase |
|---|---|---|---|
| 40 | `marketplace-integration` | Fulfillment endpoint + activation gating, Concurrent Agreements (agreement→tenant), EventBridge lifecycle handlers + 1-hour final meter, hourly BatchMeterUsage job (zero-usage, dedup, failure alarms), dual-rail ENTITLEMENT rules + IAM writer separation, price-parity CI assertion, rail-aware UX branches (billing page, cancel routing, no cross-rail promotion), test-product matrix | **P2 (launch gate)** |
| 41 | `marketplace-listing-ops` | Seller registration runbook, Well-Architected review artifacts, FTR submission pack, dimension/offer configuration, listing content, disbursement reporting into the monthly close, CPPO onboarding flow (P3) | P0 (registration) → P1 (FTR) → P2 (listing live) |

**Steering delta — `20-marketplace.md`** *(fileMatch: `services/marketplace/**`, `frontend/**billing**`)*: activation only after entitlement confirmation, never on token alone; hourly metering with zero-usage records; final meter ≤1h on cancellation; one rail per tenant, one writer per rail; price parity is a tested assertion; no cross-rail promotion on Marketplace surfaces; all Marketplace API calls from us-east-1 via the scoped integration role.

**Spec 40 kickoff prompt (Template A filled — paste when P2 opens):**

> ```
> Start a new spec named marketplace-integration (Requirements-First, no Quick
> Plan). Source of truth: consolidated doc Parts 43–45; Part 6 (provisioning),
> Part 22 (Credit meter), Part 7 + 22 (entitlements); steering 20-marketplace.md.
> Scope: everything in Part 44 — fulfillment endpoint on the GrowthStack API GW,
> ResolveCustomer/GetEntitlements flow with activation gated on the entitlement
> event, Concurrent Agreements agreement→tenant mapping, EventBridge lifecycle
> handlers with the 1-hour final-meter SLA, the hourly BatchMeterUsage job, the
> dual-rail ENTITLEMENT writer separation (IAM-enforced), price-parity CI test,
> and the rail-aware UX branches from Part 43.3.
> Out of scope: listing content, FTR, seller registration (spec 41); Stripe
> paths (unchanged); CPPO portal features (P3).
> Import verbatim as acceptance criteria: Part 43.3 rules 1–5; the 44.5 test-
> product matrix as the integration test list; "never activate on token alone."
> Verify every Marketplace API shape via aws-docs MCP before design — the
> Concurrent Agreements integration is post-June-2026 mandatory and its API
> surface must be read from current docs, not memory. Open Questions for
> anything the docs leave ambiguous. This spec's IAM and metering code are
> REQUIRES-HUMAN throughout; its D-rung floor is D4, with D6 required at the
> P2 gate (a Marketplace test-product purchase surviving canary + Synthetics).
> ```

<a name="appendix-h"></a>
## Appendix H — Justifications & Fee Impact (v7 delta)

| Addition **[v7]** | Justification |
|---|---|
| **AWS Marketplace Metering + Entitlement Service APIs, Marketplace EventBridge events** | The transaction rail itself; three API actions on a scoped role + event handlers on the existing bus; no new data plane. |
| **SBT-AWS AWSMarketplaceSaaSProduct construct — promoted from "evaluate" to adopted** | Scaffolds registration API, subscriber table, and event Lambdas we then bind into our own lifecycle. |
| **Partner Central / Well-Architected review** | Program artifacts, not services. |

**P&L impact (amends Part 27):** the Marketplace transaction fee on SaaS (low single-digit %; confirm the current schedule at listing time) sits in the same band as the Stripe ~3% it *replaces* on that rail → blended variable % and the >50% net milestones are **unchanged**. Upside not yet modeled: MACC-funded Enterprise deals and CPPO channel volume are pure pipeline expansion at flat unit economics.

---

*End of v7. Precedence: v7 > v6 > … > spine. Day-1 posture: two front doors — cumplify.ai (Stripe rail) and AWS Marketplace (AWS rail) — one tenant model, one entitlement truth, one immutable trail behind both.*
