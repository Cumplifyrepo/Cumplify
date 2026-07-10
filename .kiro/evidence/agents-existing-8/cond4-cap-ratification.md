# COND-4 — LegalLedger Monthly Budget Cap: Ratification + Enforcement

Architect-executed 2026-07-10, dev 697114252993.

## Decision record

- COND-4 (model-register.md, Conditions and Carries) required a monthly budget
  cap to attach to the LegalLedger seat at assignment. Assignment happened
  2026-07-10 (Task 14: zai.glm-5, blind 4.34, zero catastrophic).
- Architect proposed $25/mo platform-wide (dev/beta) at assignment.
- **Owner ratified 2026-07-10, in-session (verbatim "a")** — option (a) of:
  (a) $25/mo alert-only [architect recommendation] / (b) different amount /
  (c) hard-block semantics.
- Semantics: **ALERT-ONLY**. The cap never blocks serving — consistent with the
  owner's F-6 ruling (serve & bill overage; never hard-block). It is Strivana's
  cost circuit-breaker, not a tenant billing control.

## Sizing rationale

- 1,000 credits ≈ $1.00 raw Bedrock (metering §1.4) → cap = 25,000 credits/mo.
- glm-5 grounded run mean $0.0049/task → cap ≈ 5,100 tasks/mo.
- Expected organic beta load (20 tenants × 10 analyses/wk ≈ 870 tasks/mo
  ≈ $4.30/mo) sits ~6× under the cap → the cap is an anomaly detector
  (runaway loop / abuse), not a usage limiter.

## Enforcement (deployed this change)

1. `telemetry.credits.consumed` event now carries `seat` (additive field;
   metering.ts + both index.ts call sites; contract pinned in
   metering.test.ts — `detail.seat` present, `detail.creditsConsumed` NUMERIC,
   both load-bearing for the pipeline below).
2. AiStack `LegalLedgerCapRule`: bus rule on source `cumplify.ai-invoker`,
   detail-type `telemetry.credits.consumed`, `detail.seat = ["legal-ledger"]`
   → CloudWatch Logs target `/cumplify/<env>/credit-cap/legal-ledger`
   (3-month retention).
3. Metric filter → `Cumplify/AI · LegalLedgerCreditsConsumed`
   (value = `$.detail.creditsConsumed`).
4. Alarms (both → SNS `cumplify-<env>-credit-cap-alerts`, CMK-encrypted,
   enforceSSL, owner email subscription):
   - `LegalLedgerDailyPaceAlarm`: SUM ≥ 833 credits/day (25,000 ÷ 30) — fires
     on day 1 of any pattern that would breach the month.
   - `LegalLedgerBurnRateAlarm`: SUM ≥ 250 credits/hr (~50 tasks/hr vs ~1/hr
     organic) — catches runaway loops within the hour.
   - A strict calendar-month total is not expressible as a CloudWatch alarm
     window; the daily-pace alarm is the deliberate approximation. The exact
     monthly total remains available from the METER items / telemetry stream
     (billing consumer carry).
5. SecurityStack: SNS CMK key policy widened to admit
   `cloudwatch.amazonaws.com` (kms:Decrypt/GenerateDataKey*, CallerAccount
   condition) — REQUIRED for alarm→CMK-topic delivery; without it alarms
   "fire" but SNS publish fails silently at the KMS layer. Flagged to owner
   in-session (key-policy diff).

## Verification

- metering.test.ts 7/7 (event shape incl. seat + numeric creditsConsumed).
- ai-stack.unit.test.ts 51/51 — new COND-4 suite pins: rule pattern, metric
  filter, both alarm thresholds/periods, CMK topic + email subscription,
  2 alarms wired to SNS, and an ALERT-ONLY guard (no CAP/BUDGET env var may
  appear on any Lambda in the stack).
- Live 2026-07-10 (dev 697114252993, SecurityStack 91s + AiStack 135s):
  - SNS CMK policy read back: `AllowcloudwatchService → cloudwatch.amazonaws.com` present.
  - Probe through the one door: `SEAT-OK`, glm-5, 13 in / 5 out tokens,
    credits **0.029** (exact to formula), response now carries `seat`.
  - Event matched `LegalLedgerCapRule` → logged to
    `/cumplify/dev/credit-cap/legal-ledger` with `detail.seat="legal-ledger"`,
    `detail.creditsConsumed=0.029` (numeric).
  - Metric datapoint `Cumplify/AI · LegalLedgerCreditsConsumed` Sum = **0.029**
    — end-to-end EXACT match to the metered probe.
  - Alarms live + OK: BurnRate (threshold 250, period 3600s) and DailyPace
    (threshold 833, period 86400s), both with the SNS topic as alarm action.
  - SNS email subscription to owner: **PendingConfirmation** — alerts inert
    until the owner clicks the confirmation email.

## Open

- Owner: confirm the SNS email subscription (delivery inert until then).
- Billing consumer (existing carry): exact monthly seat totals + overage
  line-items downstream of telemetry.credits.consumed.
