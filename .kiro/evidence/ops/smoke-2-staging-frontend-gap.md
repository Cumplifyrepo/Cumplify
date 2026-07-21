# FINDING SMOKE-2 — Staging frontend serves NO content (2026-07-21)

> Found by pre-executing the fixed SmokeTest's exact check before touching the
> Staging gate. The SMOKE-1 fix paid for itself before its first CI run.

## Evidence (2026-07-21 ~13:2xZ)
- Staging distribution domain obtained MGMT-SIDE (no staging profile needed):
  `list-action-executions` on the last green promotion (exec 33b566ca) →
  Staging FrontendStack.Deploy outputVariables:
  bucket `cumplify-frontend-staging-889007427685`,
  domain `d3aaerttp3jmgo.cloudfront.net`, distribution `E1KIT8KD68FH8J`.
- `curl -fsS https://d3aaerttp3jmgo.cloudfront.net/` → **HTTP 403** (curl
  error 22). Even the 403→/index.html error rewrite cannot serve — there is
  no index.html object. Dev proves the stack config is fine (same code,
  serves `<title>Cumplify</title>`): the staging BUCKET IS EMPTY.

## Root cause
SPA content deployment is a MANUAL, dev-only process (architect builds the
static export with dev outputs and syncs to the dev bucket + invalidation).
`FrontendStack` contains no BucketDeployment; no pipeline step deploys
frontend content in ANY environment. The 192f9f5 "full arc" staging
promotion was infra-complete but content-empty — invisible until now because
the old SmokeTest could not fail.

## Gate decision
Staging promotion of the parked executions (73e5dab / 1a58112) is **HELD**:
the deploys would no-op green and SmokeTest would fail on a known, pre-proven
outcome. Both approval tokens left untouched. Promote after content lands
(approve NEWEST, reject stale, per the 7/18 token lesson).

## Fix paths (owner decision)
**Path A — fast unblock (manual, ~15 min once creds exist):** owner provides
a scoped staging profile (S3 write to the frontend bucket + CloudFront
invalidation). Architect builds the SPA with STAGING env (GraphqlApiUrl /
PoolBId / PoolBClientId are all obtainable mgmt-side from the same
outputVariables technique), syncs, invalidates, then promotes → witnessed
green smoke. Keeps the manual-deploy debt.

**Path B — the real fix (Kiro build, architect design review):** pipeline
content-deploy step per env — a CodeBuildStep in each stage's post (ORDERED
BEFORE SmokeTest) that builds the SPA with that env's outputs via
`envFromCfnOutputs` (API URL, pool IDs, bucket, distribution id), syncs to
the env bucket and invalidates. Requires cross-account write: FrontendStack
grants the mgmt pipeline step role (scoped bucket policy + invalidation
permission). Kills the hand-deploy debt in dev AND staging, and makes
`frontend content = pipeline artifact` an invariant. Needs a short design
round (role/bucket-policy shape, build-env injection, step ordering) —
architect drafts the Response-to-Kiro on owner go.

Recommendation: **B is required regardless** (beta cannot depend on hand
deploys); A only if the owner wants the staging walkthrough unblocked before
B lands.

## Status
OPEN — routed to owner (path decision) / Kiro (Path B build).
