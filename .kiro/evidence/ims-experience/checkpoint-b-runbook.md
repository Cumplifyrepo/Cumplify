# CHECKPOINT B — owner demo runbook (staged by architect, 2026-07-22)

Per the Agent-First law: LEAD WITH THE AGENT LOOP, never a register.
All beats below are live on Dev today (witnessed; evidence linked).
Login: acc-aaa-admin@example.com (QualityManager) on the Dev frontend.

## Beat 1 — the agent loop (THE hero, ~90 seconds)

1. Open /capa, pick the IN_PROGRESS NC ("63fe7200…").
2. Trigger **Run CAPA analysis** (runCapaAnalysis).
3. Count to ~15. A CAPAGuru HITL card appears with a REAL Bedrock-generated,
   STAGE-AWARE proposal — for this NC (in progress, CAPAs exist) it proposes
   capa-verify-effectiveness, stage 6 of the shall-workflow, not a blind
   capa-open. (Witness: rs789-dev-witness.md, twice.)
4. **The security beat:** attempt to approve it yourself → 403
   "SoD violation: the proposer cannot approve their own item". The
   compliance engine polices its own operator. (SOD-1 re-witness PASS.)
5. Two PENDING cards are pre-staged if the live run misbehaves:
   CAPAGuru 01KY4X8410DP4AY5NP7Q43R723 + one RiskSentinel item (its
   honesty-rule rationale is worth reading aloud: "context insufficient →
   current rating proposed").
   NOTE: a real approval needs a SECOND login (SoD now enforces this) —
   pick a second user from Cognito Pool B before the demo.

## Beat 2 — the one-click IMS manual (~60 seconds)

1. Open /manual: 46 sections, 22 content-ready, **24 honest gaps**,
   generated in 31 seconds from the org profile (Meridian Design-Build
   LLC, the seeded demo firm).
2. Scroll the ControlledDocViewer: §7 identification block, the BC-1
   disclaimer ("nothing has been invented"), and GAP boxes naming exactly
   what's missing (e.g. register.interested_parties). Honesty IS the
   feature — auditors distrust magic completeness.
3. Optional live regeneration: Regenerate re-runs the engine in ~30s.

## Beat 3 — Collaboration Law editing (~45 seconds)

1. /documents: clause-family browser (4 Context … 10 Improvement).
2. Open "OH&S management system (4.4)": real generated prose in the
   editor, **Insert diagram** (Mermaid), **Regenerate with DocStudio** —
   human and agent iterate on the SAME document.
3. Open "Understanding the organization… (4.1)": an honest gap card —
   the demo of what the system refuses to fake.

## Beat 4 — close the loop (~30 seconds)

- /cross-reference: the correlation matrix across all three standards.
- /billing: skeleton in place — **needs your Stripe portal URL**
  (NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL) to go live.

## Prep checklist (do before the demo)

- [ ] Confirm ab6a2da..1da655e deployed to Dev (AWSJSON fixes — /manual
      and /documents are BROKEN on Dev until this lands).
- [ ] Deployed-Dev re-witness of Beats 2–3 (gate shots ran locally).
- [ ] Second-approver login chosen + password known (SoD).
- [ ] Optional: clear stale PENDING HITL cards if the queue looks messy.

## What each beat proves (the pitch skeleton)

| Beat | Claim |
|---|---|
| 1 | Agents do the compliance work; humans approve — with real SoD enforcement, not checkbox theater |
| 2 | The CertifyAero-class one-click manual, but honest about gaps |
| 3 | Documents are living collaborations between staff and agents |
| 4 | One system, three standards, billing-ready SaaS |
