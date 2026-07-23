# B4 Stripe Billing Portal — Build Evidence

**Date:** 2026-07-23 · **Builder:** Architect (owner-directed, Option A) · **Commit:** this commit
**Owner directive:** "stripe api keys at … use them to configure the billing module" →
scope choice **A — build the portal integration now** (per-customer Stripe Customer
Portal session, seed a test subscription, wire the /billing button, deploy + witness).

## Summary

`/billing` "Open billing portal" now mints a **one-time Stripe Customer Portal
session** server-side and redirects. No Stripe key or customer id ever reaches the
browser. Replaces the earlier static-URL stub (`NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL`,
never set on dev) with the real API integration the page comment anticipated.

## Architecture

```
/billing button (admin-gated, canSeeAdmin)
  → createBillingPortalSession(returnUrl) mutation  [@aws_lambda]
  → BillingDataSource → BillingFn (api-stack.ts)
      NOT VPC-placed on purpose: zero-NAT VPC has no egress to api.stripe.com;
      this fn runs outside the VPC (rds-data/Secrets Manager are public AWS
      endpoints, so nothing here needs the VPC).
      1. extractContext → tenantId (SCHEMA-5, never from input)
      2. GetSecretValue cumplify/<env>/stripe → { secretKey, portalConfigurationId,
         customersByTenant }
      3. customerId = customersByTenant[tenantId] ?? stripe.customers.create({metadata:{tenantId}})
      4. stripe.billingPortal.sessions.create({customer, return_url, configuration})
  → { url } → window.location.assign(url)
```

## Secret & seed (dev, out-of-band — not in code)

- **Secret** `cumplify/dev/stripe` (ARN …secret:cumplify/dev/stripe-yASra6), default
  AWS-managed KMS. JSON: secretKey (sk_test), publishableKey (pk_test), mode=test,
  accountId, portalConfigurationId, customersByTenant.
- **Stripe account** acct_1TdKY2GZtt7OrWMp ("Cumplify.ai sandbox"), TEST mode.
- **Seeded** tenant-AAA → customer `cus_UwDqg9rpivOYlH` (Meridian Design-Build LLC,
  metadata.tenantId=tenant-AAA), **active subscription** `sub_1TwLOq…` on the
  $1,299/mo price (`price_1Tk9fK…`), portal config `bpc_1TwLOu…` (is_default=true).
- Key handling: plaintext `Stripe API KEYS` file gitignored (untracked, never
  committed); keys moved into Secrets Manager. Recommend deleting the file + rotating.

## Files

- schema.graphql: `type BillingPortalSession { url }` + `createBillingPortalSession(returnUrl): BillingPortalSession! @aws_lambda`
- services/api/src/resolvers/billing.ts (new resolver Lambda)
- services/api/__tests__/resolvers/billing.test.ts (new, 6 hermetic tests)
- infra/lib/api-stack.ts: BillingFn + BillingDataSource + resolver + schema-node
  dependency + Nag suppression entry + GetSecretValue grant on the stripe secret
- infra/lib/api-stack.unit.test.ts: resolver pin 98 → **99**
- frontend/src/app/(authenticated)/billing/page.{tsx,test.tsx}: button → mutation → redirect
- frontend/messages/{en,es,pt}.json: +openingPortal, +portalError
- package.json: +stripe@^22.3.2 (bundled, externalModules:[])

## Local gates (all green, 2026-07-23)

| Gate | Result |
|---|---|
| Backend vitest | **1280 passed / 3 skip** (incl. 6 new billing tests) |
| Frontend vitest | **204 passed** (billing page: 4) |
| Root `tsc --noEmit` | exit 0 |
| Frontend `tsc --noEmit` (L9) | exit 0 |
| `i18n:check` (hardcoded strings) | ✓ none |
| schema-guard (SCHEMA-5, auth directives) | 6/6 ✓ (no tenantId in input) |
| api-stack pin (resolver count) | 99 ✓ |
| `cdk synth --all` | exit 0; Dev-ApiStack has BillingFn (STRIPE_SECRET_NAME=cumplify/dev/stripe, VpcConfig absent), BillingDataSource, resolver→createBillingPortalSession, GetSecretValue on stripe secret |

## Live witness

_Pending deploy (pipeline exec) — appended in the follow-up evidence commit:
log in as an admin → /billing → Open billing portal → real Stripe portal loads
showing the active $1,299/mo subscription → close → returns to /billing._
