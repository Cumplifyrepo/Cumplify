# Task 1 — Hosting Spike: Amplify WEB_COMPUTE Manual Deploy

**Date:** 2026-07-10 (architect-executed live half; Kiro-built app/bundle ed52484)
**Account:** dev 697114252993, us-east-1, profile cumplify-dev-admin (standing auth)
**VERDICT: GATE FIRED — manual deployments do NOT support WEB_COMPUTE/SSR. OQ-1 REOPENED per the Task 1 stop clause.**

## What passed

1. **Bundle is deploy-spec compliant** (after architect build fix, commit pending):
   `.amplify-hosting/` with `deploy-manifest.json` (version 1, 4 routes,
   computeResources[default → server.js, nodejs22.x], framework next@14),
   `compute/default/` standalone server, `static/`.
2. **Local SSR proof:** `node server.js` (port 3111) → two requests returned
   `Cumplify OK` with DIFFERENT timestamps (01:19:59.222Z → 01:20:00.250Z).
3. **Amplify control plane:** `create-app` (WEB_COMPUTE, appId d2y49jit6826eq),
   `create-branch spike` (framework "Next.js - SSR", autoBuild off),
   `create-deployment` → zip upload HTTP 200 → `start-deployment` →
   job 1 status **SUCCEED** (steps DEPLOY + VERIFY both SUCCEED).

## What failed (the finding)

4. **Live URL 404** — `https://spike.d2y49jit6826eq.amplifyapp.com/` returned
   404 across 10 polls over ~3.5 min. Response headers: `server: AmazonS3`,
   `x-cache: Error from cloudfront` → the deployment was published as a
   **static site**; no compute resource was provisioned despite the
   deploy-manifest. The job "SUCCEED" is therefore misleading for compute
   bundles — VERIFY only checks file publication.
5. **Designed BUCKET_PREFIX path tested too** (throwaway bucket
   cumplify-spike-deploy-1783733105 + amplify.amazonaws.com read policy):
   `start-deployment --source-url s3://…/bundle/ --source-url-type BUCKET_PREFIX`
   → `BadRequestException: The bucket must have an index.html file at the path
   provided in the sourceUrl` — the manual-deploy API validates for STATIC
   sites only. Two independent signals; conclusion is firm.

## Build defect found during execution (separate from the gate)

Task 9's i18n scaffold had broken `next build` after Task 1's local proof was
captured (two conflicting next-intl configs: `src/i18n.ts` resolving
`messages/undefined.json` at build; `src/i18n/request.ts` with a `../../../`
path bug; plugin never wired in next.config.mjs). Architect consolidated:
plugin wired to `./src/i18n/request.ts`, path fixed, duplicate deleted.
Lesson (recurring class): a "proof" captured before later commits does not
carry forward — re-run the build after every task that touches the app.

## Teardown

`delete-app d2y49jit6826eq` + `s3 rb --force` executed; `amplify list-apps`
empty after teardown. Zero residual spike resources; cost ≈ $0.

## Consequence

Design §9 (Amplify manual deployments) is INVALID as the deploy mechanism.
OQ-1 reopened with three candidate paths for owner decision:
(a) Amplify + GitHub App connection (autoBuild off, pipeline start-job) —
    keeps SSR + Amplify, reintroduces the GitHub coupling D-4 rejected +
    an owner console step;
(b) CloudFront + Lambda (function URL, OAC) + S3 — keeps SSR, pure CDK,
    no external coupling, most infra code;
(c) Next.js static export → S3 + CloudFront — drops SSR (client-side SPA;
    the app is auth-gated so SEO/SSR value is low), simplest and fully
    in-stack, requires a PERF-2 requirements amendment.
Architect recommendation: (c) for P1, (b) if SSR becomes a hard need.
Tasks 11/12/15 hosting-dependent steps hold until the owner picks.
