# stripe-billing — Design

## Components (three new, two extended)

```
/billing UI ──┬─ createCheckoutSession ──► BillingFn (extend, non-VPC) ──► Stripe
              ├─ createBillingPortalSession (existing)                      │
              └─ getBillingStatus ─────────► BillingFn ◄── billing schema ◄─┤
                                                            ▲               │
Stripe ──HTTPS──► API GW /stripe/webhook ──► StripeWebhookFn┘ (non-VPC)     │
                                                                            │
EventBridge telemetry.credits.consumed ──► OverageMeterFn ──► Stripe meters ┘
```

- **BillingFn (extend)** — gains `createCheckoutSession` + `getBillingStatus`
  cases; keeps L4 call-time secret read; gains RDS Data API + secret grants
  for the `billing` schema (it is NOT VPC-placed, so rds-data over the
  public AWS endpoint is fine — B3-VPC-1 does not apply outside the VPC).
- **StripeWebhookFn (new, non-VPC)** — API Gateway REST route
  `POST /stripe/webhook` (execute-api exists in the house skill set; the
  endpoint is public + signature-verified, NOT behind Cognito — Stripe is
  the caller). Raw body REQUIRED for signature verification (configure the
  route to pass the unparsed body; JSON-parsing middleware breaks the HMAC).
- **OverageMeterFn (new, non-VPC)** — EventBridge rule on detailType
  `telemetry.credits.consumed` (R-9 rule, eventing-stack house pattern:
  rule → std queue + DLQ + alarm → Lambda). Aggregates overage past the
  plan grant; reports usage to Stripe (Billing Meters, pending owner call).

## Data — migration `01x_billing.sql` (next free number)

```sql
CREATE SCHEMA billing;
CREATE TABLE billing.tenant_billing (
  tenant_id        TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  subscription_id  TEXT,
  price_id         TEXT,
  plan_key         TEXT,
  status           TEXT NOT NULL DEFAULT 'none',  -- none|trialing|active|past_due|canceled
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE billing.processed_webhook_events (
  event_id   TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
RLS + FORCE on `tenant_billing` per 011_qms_engine precedent (C-2 pattern in
every txn). `processed_webhook_events` is system-scope (webhooks carry no
tenant session): accessed ONLY by StripeWebhookFn via app_role with a
documented RLS exemption (system table, no tenant column) — mirror how
migration-runner documents D-7 deviations. Purge rows older than 7 days
(the webhook consumer does it opportunistically; no cron needed).

The webhook resolves tenant via `customer` → `tenant_billing.stripe_customer_id`
(UNIQUE) — never from event metadata alone; `metadata.tenantId` on the
customer is a cross-check, mismatch = log + alarm, do not write.

## Key decisions & their reasons

1. **All three Lambdas non-VPC.** Stripe egress is unreachable from the
   zero-NAT VPC (B4 precedent) and NOTHING here touches AOSS. rds-data from
   outside the VPC uses the public endpoint — the B3-VPC-1 trap only exists
   INSIDE the VPC.
2. **Checkout Sessions, not PaymentIntents** (Stripe routing table:
   subscriptions → Billing APIs + Checkout). No `payment_method_types`
   anywhere. One Product per tier, Prices per variant. Trial via
   `subscription_data.trial_period_days` if the owner wants one.
3. **Webhook is the ONLY writer of subscription state** (single-writer
   law, like GEN-6 owns version derivations). `checkout.session.completed`
   does not shortcut-write from the success redirect — the redirect only
   refreshes /billing; state lands when the webhook does. Prevents the
   classic double-writer drift.
4. **Idempotency at two layers**: Stripe `event.id` table (R3.4), and the
   overage reporter keys usage records to (tenant, billing period) so
   EventBridge redelivery cannot double-report (R5.3).
5. **Secret layout (extend, do not fork):** `cumplify/<env>/stripe` gains
   `webhookSigningSecret` (+ later swaps `secretKey` for a restricted key,
   R6.2). `customersByTenant` is deleted from the secret after the R1
   backfill task ticks.
6. **Plan catalog as code**: `PLAN_CATALOG` map (planKey → {productId,
   priceId, creditsGrant}) in a shared module, per-env ids from the secret
   or env; catalog values are OWNER INPUT (R2.4). creditsGrant feeds both
   the precheck banner and the overage baseline — one source.

## House-law checklist for Kiro (binding)

- SCHEMA-5 (no tenantId inputs); explicit resolver registrations + schema
  node dependency (never `extend type`); pin 99 → +1 per new resolver with
  dated changelog.
- Hermetic tests: Stripe SDK class-mocked (B4's billing.test.ts is the
  pinned shape); webhook signature path tested with a REAL computed HMAC
  over a fixture body (not a mocked verifier) — the one place mocking hides
  the classic raw-body bug.
- L4 env/secret reads at call time; C-2 txn pattern for every billing-schema
  access; i18n en/es/pt same-commit; mount/call-site file:line in every
  delivered claim; rule-8 evidence (timestamp + exit code + digest with
  stated input + cdk-outputs blob).
- Live witness plan (architect): checkout with Stripe test card 4242… on
  dev → webhook fires → `tenant_billing` row flips to active → /billing
  renders the plan → overage: replay one telemetry event, assert exactly-once
  usage report. UI witness ≠ API witness — the checkout click is the witness.
