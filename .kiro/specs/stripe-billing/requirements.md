# stripe-billing — Requirements

Spec for the full billing engine on top of B4's Customer Portal slice
(`02ee1ee`, witnessed 94d571a). Drafted by the architect 2026-07-23 at the
owner's request; Kiro builds per the reinstatement brief discipline
(mount/call-site gate, rule-8 evidence, hermetic tests).

## Context — what exists today (verified on dev)

- `createBillingPortalSession(returnUrl)` on `BillingFn` (non-VPC, resolver
  pin 99); secret `cumplify/<env>/stripe` = `{secretKey,
  portalConfigurationId, customersByTenant}`; `/billing` page redirects to
  server-minted portal sessions. Seeded: tenant-AAA → `cus_UwDqg9rpivOYlH`,
  active $1,299/mo test subscription.
- Credits metering already live: `ai-invoker` emits
  `telemetry.credits.consumed` to EventBridge
  (services/ai-invoker/src/metering.ts:120) and accrues overage past the
  grant (credit-precheck.ts) per the owner's 2026-07-08 ruling: **serve &
  bill overage, never hard-block**. No downstream consumer exists — a
  recorded pre-GA blocker.
- There is NO tenant record in Postgres (tenant identity = Cognito
  `custom:tenantId`). Known B4 gap: unmapped tenants create a NEW Stripe
  customer on every portal open; the tenant→customer map lives inside the
  secret (interim).

## R1 — Tenant billing record (kills the per-open customer creation)

1. A Postgres system-of-record for billing state, keyed by `tenant_id`:
   Stripe customer id, subscription id, price id, subscription status,
   current period end, plan key, created/updated timestamps.
2. `get-or-create customer` becomes: read row → (miss) create Stripe
   customer with `metadata.tenantId` → INSERT row — exactly once per
   tenant, race-safe (`ON CONFLICT (tenant_id) DO NOTHING` + re-read).
3. `customersByTenant` in the secret becomes a SEED/migration source only:
   a one-time backfill moves existing mappings into the table; the resolver
   stops reading the map after backfill.
4. RLS per house law (`set_config('app.tenant_id', :tid, true)` first
   statement in txn — C-2), FORCE ROW LEVEL SECURITY like 011_qms_engine.

## R2 — Checkout / subscribe flow

1. `createCheckoutSession(planKey, returnUrl)` mutation: mints a Stripe
   Checkout Session `mode: 'subscription'` for the tenant's customer and
   returns only the session URL (same no-key-to-client posture as B4).
2. Stripe rules (from stripe-best-practices, API 2026-06-24.dahlia):
   - NEVER pass `payment_method_types` — omit entirely (dynamic methods).
   - One Product per plan tier; Prices attached per billing variant.
   - Pass `integration_identifier` ('cumplify-checkout-' + 8 random letters).
   - `success_url` carries `{CHECKOUT_SESSION_ID}`; cancel returns to /billing.
3. /billing shows plan state from the R1 record: no subscription → plan
   picker + Subscribe CTA; active → current plan + portal button (existing).
   No hardcoded strings (i18n en/es/pt), honest empty/error states.
4. OWNER INPUT REQUIRED before build: plan catalog (tier names, prices,
   monthly/annual, trial days). Blocked-on-owner the same way B2 was.

## R3 — Webhook ingress → subscription sync

1. A public HTTPS webhook endpoint (API Gateway + non-VPC Lambda — Stripe
   egress/ingress cannot cross the zero-NAT VPC; see B3-VPC-1 lesson).
2. MUST verify the Stripe webhook signature (signing secret stored in the
   same Secrets Manager secret; L4 call-time read). Unverified → 400,
   nothing processed. Signature verification is non-negotiable.
3. Handle at minimum: `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`, `invoice.paid`,
   `invoice.payment_failed`. Each updates the R1 row (status, price,
   period end). Unknown event types → 200 + log (never 500 on unknowns).
4. Idempotent by Stripe `event.id` (Stripe retries): an
   already-processed event id is a 200 no-op. Persist processed ids with
   a TTL ≥ 72h (Stripe's retry window).
5. Failures → 5xx so Stripe retries; alarms on sustained failure (house
   DLQ-alarm pattern is the reference posture).

## R4 — Entitlement read model

1. `getBillingStatus` query: plan key, subscription status, current period
   end, credits grant + consumed this period (from the existing meter), and
   overage-to-date. Powers /billing truthfully.
2. Per the 2026-07-08 ruling, entitlement NEVER hard-blocks agent work.
   Consumers of entitlement state (credit-precheck banner thresholds, GA
   plan gating) read it from ONE place — this query's backing store.

## R5 — Metered overage billing (closes the pre-GA blocker)

1. An EventBridge consumer of `telemetry.credits.consumed` aggregates
   per-tenant overage (credits beyond the plan grant) and reports it to
   Stripe so the monthly invoice carries the overage line.
2. Mechanism decision (OWNER CALL, architect-framed): Cumplify's overage is
   simple pay-as-you-go on an existing Stripe Billing integration → basic
   usage-based billing (Billing Meters) is the per-guidance fit; Metronome
   is the scale-up path if enterprise contracts/credit burndown arrive.
   Default to Billing Meters unless the owner says otherwise.
3. Aggregation must be idempotent and late-event tolerant; a replayed
   telemetry event must not double-bill.

## R6 — Hardening (folds B4's noted gaps)

1. Server-side role floor on ALL billing mutations (portal, checkout):
   admin-class roles only — the first server-side role floor outside HITL;
   document the pattern for reuse.
2. Restricted API key (`rk_`) instead of the raw secret key in
   `cumplify/<env>/stripe`, scoped to customers/checkout/portal/billing —
   per current Stripe guidance (key rotation = owner runbook item).
3. SCHEMA-5 discipline throughout (no tenantId in any input); pin bumps
   with dated changelog per new resolver.

## Out of scope (this spec)

Stripe Tax/registrations (activate only with an active registration —
common trap), seat-based pricing, dunning customization, Connect. The
plaintext-creds sweep in the owner's planning folder stays an owner action.
