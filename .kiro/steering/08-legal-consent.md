---
inclusion: fileMatch
fileMatchPattern: "{services/legal/**,frontend/**signup**}"
---
# Legal Consent Architecture (Parts 12.1, 21.2)
Every acceptance is an audit event. Contract formation is cryptographic evidence.

## The legal document stack (8 instruments)
ToS, AI Output Terms, AUP, Privacy Policy + DPA, SLA (Enterprise), Affiliate
Agreement, Beta Terms, Trial Terms. Each versioned, click-wrapped, recorded.

## Signup legal gate (Part 21.2 — S4b ceremony)
```
S4a  Account (email verified, password, name, company)
S4b  LEGAL GATE — single screen:
     • Scrollable summary panel with expandable full text per doc
     • One checkbox per legally-distinct consent cluster (unticked by default)
     • Explicit auto-renewal disclosure: trial length, charge amount + date,
       cancellation method
S4c  CARD — Stripe Elements SetupIntent
```
Total friction: ~30 seconds. Maximum protection, minimum perceived friction.

## Consent event schema
Every acceptance emits:
```json
{
  "eventType": "legal.accepted",
  "docId": "<instrument>",
  "docVersion": "<semver>",
  "checksum": "sha256(docText)",
  "userId": "<cognito-sub>",
  "tenantId": "<id>",
  "ip": "<client-ip>",
  "userAgent": "<string>",
  "timestamp": "<ISO8601>"
}
```
→ hash-chained AUDITLOG → WORM seal (immutable trail, 04-immutability.md).

## Build rules
1. Every consent event MUST be written through the immutable trail path —
   never a standalone database write.
2. Re-accept flow on material doc change: existing users prompted on next
   login; new version acceptance logged as a distinct event.
3. Day-5 trial reminder email MUST fire (click-to-cancel compliance).
4. Cancellation = one click in Settings → Billing, no retention call,
   immediate confirmation email.
5. Card-on-file = SetupIntent ($0 auth, tokenized by Stripe, never charged
   during trial). Card fingerprint is the primary dedup key.
6. Marketplace tenants: the FULL legal gate S4b remains — Marketplace license
   terms do not replace our click-wrapped consent events.

## Why
In any dispute, Cumplify produces: (a) exact document text hash accepted,
(b) proof of affirmative action (checkbox, not browsewrap), (c) card-verified
identity, (d) immutable chain proving nothing was altered.
