# B4 Stripe Customer Portal — UI witness PASS (real click on deployed Dev)

**Date:** 2026-07-23 · **Witness:** architect (Playwright, `witness_b4_billing.mjs`)
· **User:** acc-aaa-admin (tenant-AAA) · **Build under test:** `02ee1ee`
(owner-directed, built in the owner's Opus 4.8 session) deployed via exec
`169feed5` — Dev stage Succeeded, cross-checked by stage latestExecution id.

## Witness run (all UTC, exit 0)

| Step | Result |
|---|---|
| `/billing` mount | 12:54:09Z — "Open billing portal" button rendered (proves new build; old build had the static-URL stub) |
| Click → mutation → redirect | 12:54:11Z (**2.5 s**) — `window.location` landed on `https://billing.stripe.com/p/session/test_…` — a real one-time TEST-mode portal session minted server-side |
| Portal content | Stripe-hosted page fully rendered: **"Cumplify Pro $1,299.00 per month"**, next billing Aug 23 2026, payment method Visa ••4242 (Default), billing email acc-aaa-admin@example.com, invoice history **Jul 23 2026 $1,299.00 Paid**, "Return to Cumplify.ai sandbox" link (returnUrl round-trip wired) |
| Screenshots | `b4-1-billing.png` sha256 `bd0a1098…` · `b4-2-stripe-portal.png` sha256 `eca6d87d…` |

## What this proves

- The mutation chain end-to-end: Cognito user → AppSync → BillingFn (non-VPC,
  by design) → Secrets Manager `cumplify/dev/stripe` → Stripe API → session URL
  → browser redirect. No Stripe key or customer id ever reached the client
  (only the one-time session URL).
- The seeded tenant mapping resolves: tenant-AAA → `cus_UwDqg9rpivOYlH` with
  the active test subscription and portal configuration applied.
- On-disk validation (same day, architect): SCHEMA-5 clean, L4 call-time secret
  name, returnUrl validated, least-privilege secret grant, schema-node
  dependency present, resolver pin 98→**99** green. Baselines reproduced:
  backend 1280/3 skip, frontend 204, root+frontend tsc clean.

## Known interim gaps (acknowledged in code, future spec)

- Unmapped tenant → a NEW Stripe customer per portal open (id not persisted;
  production needs it on the tenant record + Checkout flow + webhook sync).
- No server-side role floor on `createBillingPortalSession` (matches current
  house posture for non-HITL mutations; flag for a hardening pass).

The standing owner ask "Stripe portal URL" is now CLOSED — superseded by the
server-minted session flow (no static URL needed).
