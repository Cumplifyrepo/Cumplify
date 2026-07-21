# Tasks — Pipeline Frontend Content Deploy (SMOKE-2)

> Rule 7/8: every task closure commit includes its checkbox tick + evidence
> log at `.kiro/evidence/pipeline-content-deploy/<task>.log`.

## Phase 1 — Infrastructure (FrontendStack + CfnOutput field capture)

- [ ] **Task 1.1:** FrontendStack — add ContentDeployRole with deterministic
  physical name, scoped inline policy, condition-gated trust, and CDK Nag
  suppressions. Expose `contentDeployRoleArn` (string) and
  `contentDeployRoleArnOutput` (CfnOutput) as public fields. Also capture
  existing `FrontendBucketName` and `FrontendDistributionId` CfnOutputs into
  `bucketNameOutput` and `distributionIdOutput` public fields (no logical ID
  change). Evidence: `tsc --noEmit` clean.

- [ ] **Task 1.2:** ApiStack — capture existing `GraphqlApiUrl` CfnOutput
  into `public readonly graphqlApiUrlOutput: cdk.CfnOutput`. No logical ID
  change. Evidence: `tsc --noEmit` clean.

- [ ] **Task 1.3:** IdentityStack — capture existing `PoolBId` and
  `PoolBClientId` CfnOutputs into `poolBIdOutput` and `poolBClientIdOutput`
  public fields. No logical ID change. Evidence: `tsc --noEmit` clean.

- [ ] **Task 1.4:** CumplifyStage — add six public fields and wire from the
  three stacks (§2.3). Evidence: `tsc --noEmit` clean.

## Phase 2 — Pipeline step + ordering

- [ ] **Task 2.1:** pipeline-stack.ts — add `makeDeployFrontendStep` factory
  (§2.4). Add iam import if not present. Wire into Dev post, Staging post
  (with SmokeTest dependency), and Prod post (with existing pre gates).
  Refactor Staging SmokeTest to a named variable + `addStepDependency`.
  Evidence: `tsc --noEmit` clean + `npx cdk synth --all` passes + no new
  CDK Nag errors.

## Phase 3 — Frontend build config

- [ ] **Task 3.1:** `frontend/scripts/load-env.mjs` — add early-exit guard
  (§2.6): when all three `NEXT_PUBLIC_*` vars are present in `process.env`,
  log and exit 0 without writing `.env.local`. Evidence: `npm run test` in
  `frontend/` passes (existing tests still green).

## Phase 4 — Tests

- [ ] **Task 4.1:** `infra/lib/frontend-stack.unit.test.ts` — extend with
  ContentDeployRole assertions (§4.2): role physical name, trust condition,
  inline policy actions/resources, CfnOutput existence. Evidence: test passes.

- [ ] **Task 4.2:** `infra/lib/pipeline-stack.unit.test.ts` — extend with
  DeployFrontendContent assertions (§4.1): step exists per stage, Staging
  ordering, `sts:AssumeRole` grant ARNs on the step's project role, env var
  wiring. Evidence: test passes.

- [ ] **Task 4.3:** `frontend/src/test/load-env.test.ts` — extend with
  env-var-present test (§4.3): when all NEXT_PUBLIC_* vars are set,
  `.env.local` is NOT written. Evidence: test passes.

## Phase 5 — Full verification + evidence

- [ ] **Task 5.1:** Run full gate: `tsc --noEmit` + `npm run test` (both
  workspaces) + `npx cdk synth --all`. All green. Evidence log at
  `.kiro/evidence/pipeline-content-deploy/full-gate.log` with timestamps,
  exit codes, test counts, and git SHA.
