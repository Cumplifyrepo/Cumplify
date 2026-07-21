# SMOKE-1 Fix Package — output-driven SmokeTest (2026-07-21)

> Architect-prepared per owner "proceed per plan" (2026-07-21). Companion to
> FINDING SMOKE-1 in `staging-promotion-2026-07-21.md`. Status: READY — the
> paste-ready Kiro block below needs no further owner decision (see §2).

## 1. Finding recap
`infra/lib/pipeline-stack.ts:78`:
`curl -f https://staging.cumplify.ai/health || true`
Two defects: the `|| true` means the step can never fail (it swallowed a live
DNS failure on the 2026-07-21 promotion), and `staging.cumplify.ai` has no DNS.

## 2. Architecture decision — the URL question DISSOLVES
The original framing ("pick CloudFront URL vs. set up staging DNS") is a false
choice. Facts established 2026-07-21:

1. **The smoke URL should never be hardcoded at all.** Every `FrontendStack`
   already emits `FrontendDistributionDomain` as a CfnOutput
   (`frontend-stack.ts:107`). CDK Pipelines' `envFromCfnOutputs` feeds a
   post-deploy ShellStep from exactly that output — the smoke test then always
   targets whatever the stage actually deployed, in any env, with zero DNS
   dependency. This stays correct even if custom domains land later.
2. **A bare DNS record wouldn't work anyway.** CloudFront serves a hostname
   only if it is registered as an alternate domain name backed by an ACM cert
   (us-east-1, in the STAGING account) — a CNAME alone yields 403. The
   `cumplify.ai.` public hosted zone lives in the MGMT account (157082218687,
   verified 2026-07-21), so DNS-validating a staging-account cert requires
   cross-account record plumbing. That is a real (small) custom-domain spec —
   prod will need it for GA regardless — and it is SEPARABLE from SMOKE-1.
3. **A status check is vacuous even with working DNS.** The distribution
   rewrites 403/404 → `/index.html` HTTP 200 (`frontend-stack.ts:83-96`), so
   `curl -f` on ANY path succeeds once the host resolves. Per standing
   discipline (readbacks assert content, not status), the smoke must assert
   page content. Live-verified stable marker: `<title>Cumplify</title>`
   (served by d1tw2kanxo5wnt.cloudfront.net, checked 2026-07-21).

**Decision:** fix SMOKE-1 now with the output-driven, content-asserting step
(below). Route "staging.cumplify.ai / prod custom domains" to the pre-GA
backlog as its own item — it no longer blocks anything.

## 3. Paste-ready Response to Kiro

---8<---
**WORKSPACE GUARD — read first.** Confirm `services/api/schema/schema.graphql`
exists in the workspace root. If it does not, you are in the wrong workspace —
STOP and re-open `~/cumplify`.

**Task: fix FINDING SMOKE-1 — the pipeline SmokeTest is vacuous.**
`infra/lib/pipeline-stack.ts:78` is
`curl -f https://staging.cumplify.ai/health || true`. The `|| true` swallows
all failures (it swallowed a real DNS failure on the 2026-07-21 Staging
promotion), and staging.cumplify.ai has no DNS. Fix in ONE commit, three small
changes plus a test:

1. `infra/lib/frontend-stack.ts` — capture the existing domain output in a
   public field (do NOT create a second output):
   ```ts
   public readonly distributionDomainOutput: cdk.CfnOutput;
   // ...
   this.distributionDomainOutput = new cdk.CfnOutput(this, 'FrontendDistributionDomain', {
     value: distribution.distributionDomainName,
   });
   ```
2. `infra/lib/cumplify-stage.ts` — expose it on the stage:
   `public readonly frontendDistributionDomainOutput: cdk.CfnOutput;`
   assigned from `frontendStack.distributionDomainOutput`.
3. `infra/lib/pipeline-stack.ts` — replace the SmokeTest step:
   ```ts
   new pipelines.ShellStep('SmokeTest', {
     envFromCfnOutputs: {
       FRONTEND_DOMAIN: stagingStage.frontendDistributionDomainOutput,
     },
     commands: [
       // Content assertion, not status: the distribution rewrites 403/404 ->
       // /index.html 200, so an -f status check passes on any path.
       'curl -fsS "https://$FRONTEND_DOMAIN/" | grep -q "<title>Cumplify</title>"',
     ],
   }),
   ```
   (`stagingStage` must be declared before `pipeline.addStage(stagingStage, ...)`
   uses it in `post:` — it already is.) No `|| true` anywhere. A smoke failure
   must fail the stage.
4. NEW `infra/lib/pipeline-stack.unit.test.ts` (colocated, same convention as
   the other `*.unit.test.ts`) — regression pin: synth the PipelineStack (pass
   `codestarConnectionArn` via context) and assert on the template's CodeBuild
   projects that the SmokeTest buildspec (a) does NOT contain `|| true`,
   (b) contains the `grep -q "<title>Cumplify</title>"` content assertion,
   (c) wires `FRONTEND_DOMAIN` from the Staging FrontendStack output.

Constraints: NO other pipeline changes; NO schema/app changes; hermetic unit
lane must stay green (`npm run test`); `npx cdk synth --all` must pass. Rule
7/8: evidence log `.kiro/evidence/ops/smoke-1-fix.log` (tsc + test + synth
outputs with timestamps) in the SAME commit.

Note: the fix takes effect via pipeline self-mutation on the next `develop`
push and is live-witnessed at the NEXT Staging promotion — the architect will
verify the rendered buildspec in the mgmt account after UpdatePipeline runs.
---8<---

## 4. Residual item routed to owner backlog (pre-GA, non-blocking)
Custom domains: `staging.cumplify.ai` + prod domain(s) on `cumplify.ai.`
(mgmt-account public zone) — needs ACM certs in workload accounts with
cross-account DNS validation, `domainNames` on the distributions, and the
Route 53 records. Recommend a dedicated mini-spec when GA branding firms up.
The smoke test needs NO change when that lands (it reads the stack output).
