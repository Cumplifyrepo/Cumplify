# stripe-billing — Tasks

Discipline: every task closure = checkbox tick + evidence log entry in the
SAME commit (rule 7/8); every delivered claim cites mount/call-site
file:line; baselines stated before/after. Owner-gated tasks are marked.

- [ ] **T1 — Migration `01x_billing.sql`** (R1.1, R1.4): `billing` schema,
  `tenant_billing` (RLS+FORCE), `processed_webhook_events` (documented
  system-scope exemption). Evidence: migration applied on dev via the
  house runner; psql readback of RLS flags.

- [ ] **T2 — Tenant billing record wiring** (R1.2, R1.3): BillingFn
  get-or-create against the table (race-safe), one-time backfill of
  `customersByTenant` → table, then remove map-reading code. Evidence:
  unit tests (miss→create-once, hit→no Stripe call, conflict race), live
  probe showing second portal open creates ZERO new Stripe customers.

- [ ] **T3 — OWNER GATE: plan catalog** (R2.4): tier names, prices,
  monthly/annual, trial days. BLOCKED until supplied; T4 depends on it.
  Products/Prices created in test mode; ids into `PLAN_CATALOG` + secret.

- [ ] **T4 — createCheckoutSession** (R2.1–R2.3): mutation + schema +
  registration + pin bump; /billing plan picker (i18n ×3, honest states).
  NO `payment_method_types`; `integration_identifier` set. Evidence:
  hermetic tests pinned to B4 shape; mount file:line for the picker CTA.

- [ ] **T5 — Webhook endpoint** (R3): API GW route (raw body!) +
  StripeWebhookFn + signature verification + event handlers + `event.id`
  idempotency + unknown-type 200s. Evidence: hermetic tests incl. REAL
  HMAC over fixture body (valid + tampered), replay no-op test; live: CLI
  `stripe trigger checkout.session.completed` (or dashboard resend)
  flipping `tenant_billing.status` on dev.

- [ ] **T6 — getBillingStatus + /billing truth** (R4): query + page renders
  plan/status/period/credits grant+consumed+overage from one store.
  Evidence: mount file:line; test for none/trialing/active/past_due
  renders.

- [ ] **T7 — OWNER GATE then overage consumer** (R5): confirm Billing
  Meters (default) vs Metronome; then R-9 rule + queue + DLQ + alarm +
  OverageMeterFn with (tenant, period)-keyed idempotent reporting.
  Evidence: replay-twice test = one usage record; live meter readback on a
  seeded overage event.

- [ ] **T8 — Hardening** (R6): role floor on billing mutations (+ pattern
  doc), restricted key swap in the secret (owner runbook), changelog.
  Evidence: 403 test for non-admin role; live probe with employee-role
  user rejected.

- [ ] **T9 — Architect witness (not Kiro)**: full checkout → webhook →
  entitlement → overage loop on dev with test card 4242; UI screenshots +
  rule-8 log. Stage closes only on this witness (API ≠ UI).
