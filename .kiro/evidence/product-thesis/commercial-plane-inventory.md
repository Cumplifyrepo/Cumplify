# EVIDENCE — v7 Commercial-Plane Inventory: built vs designed-only (2026-07-21)

> Architect-directed mining of the v7 consolidated architecture doc (2,155
> lines) + repo. Grounds §9 of `.kiro/specs/ims-experience/architecture.md`.
> Line numbers = v7 doc exact. NOTE: §9.1 pricing and §9.4 commissions were
> SUPERSEDED by owner rulings 2026-07-21 (see architecture.md §13) — this
> file records what v7 designed and what code exists.

## 1. Billing & credits/token system
- **v7 locations:** Part 7 (Stripe/entitlements) 443–474; Part 22 (AI token
  economics) 1072–1124; Part 17 (pricing/unit economics) 857–891; Part 29
  (trial v2) 1382–1395; Part 44.3/44.4 (marketplace metering) 2060–2081;
  Part 8 (telemetry pipe) 479–486.
- **Mechanics:** unit = "Cumplify AI Credits"; `credits = Σ(input×w_in +
  cache_read×w_cache + output×w_out)` per model via `MODELWEIGHT#` items;
  1,000 credits ≈ $1.00 raw Bedrock; included AI-COGS ≤ 9% of plan price;
  packs 25k=$99 / 100k=$349 (~71–75% margin).
- **BUILT:** `services/ai-invoker/src/metering.ts` — computeCredits,
  loadWeights, atomic incrementMeter (`TENANT#<id>#METER/MONTH#<yyyymm>`),
  `emitCreditsTelemetry` → `telemetry.credits.consumed` (metering.ts:120),
  wired at 8 call sites in `index.ts` (:150–571).
  `services/ai-invoker/src/credit-precheck.ts` — **F-6 OWNER-RESOLVED
  serve-and-bill** (line 85): Enterprise never blocks (:87); paygo serves
  overage, telemetry is the billing signal (:91–96); Trial/Launch-no-paygo
  hard-block (:98–104). Tests: metering.test.ts, credit-precheck.test.ts,
  acc-integration.test.ts:320/380/443, invoke-grounding.test.ts:303.
  IAM: `infra/lib/ai-stack.ts:301` LeadingKeys scoping.
- **DESIGNED-ONLY:** all Stripe integration (checkout, webhook, ENTITLEMENT
  writer, dunning); the billing CONSUMER of telemetry.credits.consumed
  (no Firehose/Athena/close job anywhere in services/ or infra/);
  ENTITLEMENT items are read (static P1 authorizer stamp,
  api-core/design.md:18–28) but never written by billing.

## 2. Consultants / affiliate / partner program
- **v7 locations:** Part 16, lines 808–852; Part 43.2 CPPO line 2000.
- **Design:** two motions (referral affiliates + implementation partners);
  v7 commissions 25% mo 1–12 → 10% lifetime tail, 30% at ≥5 tenants
  (**REJECTED by owner 2026-07-21 — replaced by Track-1: 10% one-time
  annual / 8% monthly, Stripe payouts**); partner = 4th trust boundary on
  the 3-pool topology (no 4th pool), `PARTNER#<id>` + consent-gated
  cross-tenant access (CONSENT item, `{tenantId, role, grantExpiry}` in
  token, auto-revoke, `actor=partner:<id>` trail tags); Partner Portal at
  portal.cumplify.ai; CPPO XOR affiliate per deal; legal musts 850–852.
- **In code: NONE.** (`pre-token-gen` implements no partner grant; the
  consultant grep hits in seat-configs.ts / role-matrix.ts are unrelated.)

## 3. Pricing tiers
- v7 authoritative card = Part 17.2 v2 (lines 870–879): Launch $449 / IMS
  Pro $949 / Enterprise from $2,250; add-ons seat $29, site $149, standard
  $199; trial 14-day IMS-Pro 15k credits (Part 29); marketplace parity
  dimensions Part 43.1 (1980–1992). Part 7.1 card (447–451) superseded.
- **SUPERSEDED 2026-07-21 by card v4** (architecture.md §9.1): Freemium $0
  card-on-file no-exports / Launch $749/mo·$7,500/yr / IMS Pro $2,350/mo·
  $24,000/yr / Enterprise $4,700/mo·from $48,000/yr; fence =
  GENERATE/OPERATE/GOVERN; unlimited seats within employee band.
- **PARTIALLY BUILT:** `infra/data/ar-policies/plan-entitlements.json`
  encodes the Part 17.2 card as a Bedrock AR guardrail (ai-stack.ts:204–207,
  validated by ar-check.ts) — VALIDATION only, not billing enforcement;
  needs re-encoding to card v4 in P7.

## 4. Onboarding / snapshot funnel (commercial linkage)
- Part 1 (journey S0–S5) 78–190; Part 2 (Snapshot + snapshot→seed contract
  line 228) 192–249; Part 6 (provisioning state machine) 402–442; Part 21
  (freemium/trial legal gate) 1024–1067; Part 29 (trial v2) 1382–1395
  (**trial superseded by FREEMIUM ruling 2026-07-21**); Part 8 PLG
  milestones 483–485.
- **In code: DESIGNED-ONLY** (no growth/snapshot service; only
  model-evals eval-set snapshot-pipeline.json).

## 5. Other reusable commercial designs (all DESIGNED-ONLY)
- Part 43 marketplace commercial (1972–2010): contract-with-consumption,
  CPPO, MACC, price-parity-in-CI.
- Part 44 marketplace technical (2014–2085): ResolveCustomer /
  GetEntitlements / BatchMeterUsage, EventBridge lifecycle, dual-rail
  entitlement (`rail = stripe | marketplace`); deferred per
  eventing-backbone/requirements.md:85,220.
- Part 24 public API platform (1158–1199): entitlement-gated, plan-tiered
  rate limits, OAuth2 + scoped keys, webhooks-out.
- Part 14 Settings & Trust Center (712–740): Billing usage dashboard,
  Users & Roles (invite/assignment/SoD view/SCIM), Data & Retention
  (retention editor, legal hold, export bundles).
- Enterprise features: SSO/SAML + SCIM, IP allowlist, legal hold, custom
  retention, DR/SLA, attestation report, validation pack (17.2:876,
  18.3:925, Part 9:501).
- Part 23 SOC 2-ready architecture (1129–1153).
- Tenant lifecycle (v7 6.2, line 438): TRIAL → ACTIVE_PAID → PAST_DUE →
  SUSPENDED → PENDING_DELETE → PURGED; WORM persists through Object Lock.

## Build-status summary
| Area | Status |
|---|---|
| Credit metering + telemetry emit | **BUILT** |
| Credit pre-check + F-6 serve-and-bill | **BUILT** |
| Plan card as AR guardrail | PARTIAL (validation only; re-encode to v4) |
| ENTITLEMENT authorizer stamp | PARTIAL (static; not billing-driven) |
| Stripe, overage consumer, monthly close | DESIGNED-ONLY |
| Affiliate/partner/portal/CPPO | DESIGNED-ONLY |
| Snapshot funnel, freemium flow, PLG telemetry | DESIGNED-ONLY |
| Marketplace, public API, Trust Center billing UI | DESIGNED-ONLY |
