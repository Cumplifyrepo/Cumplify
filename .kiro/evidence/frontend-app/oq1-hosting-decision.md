# OQ-1 Hosting Decision (Reopened → Resolved) — Owner Decision

**Date:** 2026-07-10
**Decision maker:** Owner (Julio), option selected: "Static SPA on S3+CloudFront"
**Context:** Task 1 spike gate fired — Amplify manual deployments are static-only
(evidence: task-1-hosting-spike.md; two independent live proofs). Design §9
(Amplify + manual deploys) invalid. Owner chose from three candidates.

## Decision

**Next.js static export (client-side SPA) served from S3 + CloudFront (OAC),
deployed from the CDK pipeline.** SSR is dropped: the app is auth-gated, so
SSR/SEO value is low; all data fetching is client-side against AppSync.

## Consequences

1. **Requirements amendment:** PERF-2 rewritten — no server components for
   data fetching; client-side SPA with code-splitting; LCP ≤ 2.5s target
   stands (light shell + skeleton states).
2. **Design R3 (§9 + affected sections):** `output: 'export'` replaces
   `output: 'standalone'`; hosting = S3 bucket (private, OAC) + CloudFront
   distribution per env, all in a new **FrontendStack** (replaces the planned
   AmplifyStack); deploy = pipeline post-step syncs the export artifact to S3
   + CloudFront invalidation. The cross-account credentialed-step role now
   carries s3 sync + cloudfront:CreateInvalidation instead of amplify:* —
   still ONE role shared with the test:int consumer.
3. **i18n note:** next-intl remains valid for a static export (client
   provider); locale resolution moves fully client-side (PROFILE# fetch after
   sign-in), tenant-default fallback unchanged.
4. **Task plan:** Task 1 CLOSED (gate did its job — the spike existed to fail
   fast); Task 12 becomes FrontendStack (S3+CloudFront+OAC); Task 15's deploy
   step becomes build → export → S3 sync → invalidation; Task 11 unchanged in
   scope but client-components-only.
5. **Amplify:** no Amplify resources anywhere; `aws amplify list-apps` empty
   (verified post-teardown).
