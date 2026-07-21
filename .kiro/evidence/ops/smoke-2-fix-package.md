# SMOKE-2 Fix Package — pipeline frontend-content deploy (Path B) (2026-07-21)

> Companion to `smoke-2-staging-frontend-gap.md`. Paste §2 to Kiro on owner
> "go B". Requirements-level: Kiro authors design.md first and STOPS for
> architect review before building (standard flow).

## 1. Architect design pins (non-negotiable in review)
- **Per-env ContentDeployRole, not bucket-policy-only:** S3 sync could ride a
  bucket policy, but CloudFront `CreateInvalidation` cannot cross accounts —
  so FrontendStack creates a `ContentDeployRole` in the env account (trust:
  mgmt pipeline CodeBuild roles via `aws:PrincipalArn` pattern
  `arn:aws:iam::157082218687:role/CumplifyPipeline*`) scoped to: write/list
  on the frontend bucket + `cloudfront:CreateInvalidation` on the one
  distribution. The pipeline step assumes it explicitly.
- **Env injection, no hardcoding:** the step gets GraphqlApiUrl, PoolBId,
  PoolBClientId, bucket, distribution id via `envFromCfnOutputs` (capture the
  existing CfnOutputs into public fields — same pattern as the SMOKE-1 fix;
  ApiStack/IdentityStack outputs need the same field-capture + stage
  exposure). Frontend build must accept env-var config with the existing
  repo-root cdk-outputs.json path as LOCAL-DEV fallback only (SCHEMA/i18n/
  CON-2 constraints unchanged).
- **Ordering:** content deploy runs post-deploy and SmokeTest gains an
  explicit `addStepDependency` on it — smoke must test the content just
  shipped, and post steps are NOT ordered by default.
- **All three envs** get the step (Dev too — kills the hand-deploy debt;
  Prod inherits for later). SmokeTest exists only on Staging today; that
  stays as-is.
- **Hermetic pins:** extend pipeline-stack.unit.test.ts — step present per
  stage, SmokeTest depends on it, env wiring asserted on the pipeline action
  (mechanism, not command strings — SMOKE-1 lesson). FrontendStack unit test
  asserts ContentDeployRole trust + scoping.

## 2. Paste-ready Response to Kiro

---8<---
**WORKSPACE GUARD — read first.** Confirm `services/api/schema/schema.graphql`
exists in the workspace root. If not, STOP and re-open `~/cumplify`.

**Task: FINDING SMOKE-2 — frontend content is never deployed by the pipeline.**
Staging CloudFront (d3aaerttp3jmgo.cloudfront.net) serves HTTP 403: the
staging bucket is EMPTY. Dev only works because the architect hand-deploys.
Author `design.md` for a pipeline frontend-content-deploy step, then STOP for
architect review. Requirements:

1. New CodeBuildStep (e.g. `DeployFrontendContent`) in the post of EVERY env
   stage (Dev, Staging, Prod), ordered BEFORE SmokeTest via an explicit
   `addStepDependency` (post steps are unordered by default).
2. The step: `npm ci` (frontend), build the static export with THAT env's
   config from `envFromCfnOutputs` (GraphqlApiUrl, PoolBId, PoolBClientId —
   capture the existing CfnOutputs into public fields on ApiStack /
   IdentityStack and expose on CumplifyStage, exactly like the SMOKE-1
   distributionDomainOutput pattern), assume the env's ContentDeployRole,
   `aws s3 sync` to the frontend bucket (with delete), CloudFront
   invalidation, wait not required.
3. FrontendStack: add `ContentDeployRole` (trust scoped to
   `arn:aws:iam::157082218687:role/CumplifyPipeline*` via aws:PrincipalArn
   condition; permissions: bucket write/list + CreateInvalidation on the one
   distribution ONLY). No wildcard resources. CDK Nag must stay green.
4. Frontend build config: env vars take precedence, repo-root
   cdk-outputs.json remains the local-dev fallback. NO hardcoded endpoints
   (CON-2), no tenantId anywhere, i18n untouched.
5. Hermetic tests: pipeline-stack.unit.test.ts — step exists in each stage,
   SmokeTest has the dependency, env wiring asserted on the CodePipeline
   ACTION (not buildspec strings); frontend-stack test — role trust +
   scoping. Full suite + synth green.
6. Rule 7/8: design.md first → STOP for architect review. No build until the
   design is approved. Evidence log per task in the same commit as ticks.
---8<---

## 3. Path A note (if owner also wants the fast unblock)
With a scoped staging profile (bucket write + invalidation), the architect
can hand-deploy staging content in ~15 min using staging outputs already
obtainable mgmt-side, then promote and witness the smoke green. Path A does
NOT close SMOKE-2 — only Path B does.
