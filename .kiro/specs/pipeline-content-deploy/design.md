# Design — Pipeline Frontend Content Deploy (SMOKE-2)

> **Status:** DRAFT — awaiting architect review before implementation.
> **Finding:** SMOKE-2 — Staging CloudFront (d3aaerttp3jmgo.cloudfront.net) serves
> HTTP 403 because the staging bucket is empty. No pipeline step deploys
> frontend content in any environment.

## 1. Overview

Add a `DeployFrontendContent` CodeBuildStep to the pipeline's post-deploy
phase for every env stage (Dev, Staging, Prod). The step builds the Next.js
static export with that env's runtime config (API URL, Cognito pool/client)
injected via `envFromCfnOutputs`, assumes a per-env cross-account
`ContentDeployRole`, syncs the build output to S3, and invalidates
CloudFront. SmokeTest (Staging-only) gains an explicit dependency on it.

This eliminates the hand-deploy debt and makes "frontend content = pipeline
artifact" an invariant.

## 2. Components

### 2.1 ContentDeployRole (FrontendStack)

A new IAM Role in each env account, trusted by the mgmt pipeline's CodeBuild
service roles.

**Trust policy:**
```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "*" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringLike": {
      "aws:PrincipalArn": "arn:aws:iam::157082218687:role/CumplifyPipeline*"
    }
  }
}
```

**Permissions (scoped, no wildcards):**
- `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on the frontend bucket
  (ARN + ARN/*).
- `cloudfront:CreateInvalidation` on the one distribution
  (`arn:aws:cloudfront::<account>:distribution/<distId>`).

**CDK Nag:** IAM4 suppression (managed policy not applicable — inline only),
IAM5 suppression for the `s3:*` with `/*` suffix (required for sync).

**Exposed as:** `public readonly contentDeployRoleArn: string` on
FrontendStack, with a `CfnOutput` named `ContentDeployRoleArn`.

### 2.2 CfnOutput field capture (SMOKE-1 pattern)

Existing CfnOutputs that need promotion to public fields for
`envFromCfnOutputs` consumption:

| Stack | Output | New public field |
|-------|--------|-----------------|
| ApiStack | `GraphqlApiUrl` | `graphqlApiUrlOutput: cdk.CfnOutput` |
| IdentityStack | `PoolBId` | `poolBIdOutput: cdk.CfnOutput` |
| IdentityStack | `PoolBClientId` | `poolBClientIdOutput: cdk.CfnOutput` |
| FrontendStack | `FrontendBucketName` | `bucketNameOutput: cdk.CfnOutput` |
| FrontendStack | `FrontendDistributionId` | `distributionIdOutput: cdk.CfnOutput` |
| FrontendStack | `ContentDeployRoleArn` | `contentDeployRoleArnOutput: cdk.CfnOutput` (new) |

Each existing `new cdk.CfnOutput(...)` is captured into a `this.<field> =`
assignment (same as SMOKE-1 `distributionDomainOutput` pattern — no second
output, no logical ID change).

### 2.3 CumplifyStage exposure

New public fields on `CumplifyStage`:

```ts
public readonly graphqlApiUrlOutput: cdk.CfnOutput;
public readonly poolBIdOutput: cdk.CfnOutput;
public readonly poolBClientIdOutput: cdk.CfnOutput;
public readonly frontendBucketNameOutput: cdk.CfnOutput;
public readonly frontendDistributionIdOutput: cdk.CfnOutput;
public readonly contentDeployRoleArnOutput: cdk.CfnOutput;
```

Assigned from the respective stack fields after construction.

### 2.4 DeployFrontendContent step (pipeline-stack.ts)

A factory helper (DRY — three stages use it):

```ts
function makeDeployFrontendStep(stage: CumplifyStage): pipelines.CodeBuildStep {
  return new pipelines.CodeBuildStep('DeployFrontendContent', {
    envFromCfnOutputs: {
      NEXT_PUBLIC_GRAPHQL_URL: stage.graphqlApiUrlOutput,
      NEXT_PUBLIC_USER_POOL_ID: stage.poolBIdOutput,
      NEXT_PUBLIC_USER_POOL_CLIENT_ID: stage.poolBClientIdOutput,
      FRONTEND_BUCKET: stage.frontendBucketNameOutput,
      DISTRIBUTION_ID: stage.frontendDistributionIdOutput,
      CONTENT_DEPLOY_ROLE_ARN: stage.contentDeployRoleArnOutput,
    },
    commands: [
      // Install frontend deps and build static export
      'cd frontend && npm ci && npm run build',
      // Assume the env-account ContentDeployRole
      'CREDS=$(aws sts assume-role --role-arn "$CONTENT_DEPLOY_ROLE_ARN" --role-session-name pipeline-content-deploy --output json)',
      'export AWS_ACCESS_KEY_ID=$(echo $CREDS | jq -r .Credentials.AccessKeyId)',
      'export AWS_SECRET_ACCESS_KEY=$(echo $CREDS | jq -r .Credentials.SecretAccessKey)',
      'export AWS_SESSION_TOKEN=$(echo $CREDS | jq -r .Credentials.SessionToken)',
      // Sync static export to bucket (--delete removes stale objects)
      'aws s3 sync out/ "s3://$FRONTEND_BUCKET/" --delete',
      // Invalidate CloudFront (fire-and-forget; propagation is ~60s)
      'aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"',
    ],
    buildEnvironment: {
      buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/standard:8.0'),
      computeType: codebuild.ComputeType.SMALL,
    },
  });
}
```

**Key decisions:**
- `NEXT_PUBLIC_*` env vars are set directly — the `load-env.mjs` `prebuild`
  script reads `cdk-outputs.json` as a LOCAL-DEV fallback. When
  `NEXT_PUBLIC_*` are already in the environment, Next.js's static export
  inlines them at build time. The `prebuild` hook writes `.env.local`, and
  Next.js picks up env vars from the OS environment with higher precedence
  than `.env.local`. So the pipeline flow is:
  1. `envFromCfnOutputs` sets OS env vars.
  2. `npm run build` triggers `prebuild` → `load-env.mjs` tries
     `cdk-outputs.json`, fails (not present in CodeBuild), writes fallback
     `.env.local`.
  3. Next.js build uses OS-level `NEXT_PUBLIC_*` (higher precedence) → correct
     env injected into the static export.
  **Alternative considered:** modify `load-env.mjs` to skip if env vars
  already exist. Cleaner, but adds a behavioral change to the local-dev path.
  Recommend: add early-exit guard in `load-env.mjs` if all three
  `NEXT_PUBLIC_*` vars are already set (zero-risk, improves CI ergonomics).
- `assume-role` is explicit so the CodeBuild project's pipeline-granted role
  (in mgmt account) can cross into the env account via the scoped trust.
- `--delete` on s3 sync ensures stale assets from previous deploys are
  removed (prevents ghost routes).

### 2.5 Step ordering

```ts
// Staging example (Dev/Prod follow same pattern minus SmokeTest)
const deployContent = makeDeployFrontendStep(stagingStage);
const smokeTest = new pipelines.ShellStep('SmokeTest', { ... });
smokeTest.addStepDependency(deployContent);

pipeline.addStage(stagingStage, {
  pre: [new pipelines.ManualApprovalStep('ApproveToStaging')],
  post: [deployContent, smokeTest],
});
```

For Dev and Prod (which have no SmokeTest today), the step is simply added
to `post:` with no dependency needed:

```ts
pipeline.addStage(devStage, {
  post: [makeDeployFrontendStep(devStage)],
});
```

### 2.6 Frontend build config adaptation

`frontend/scripts/load-env.mjs` — add an early-exit guard:

```js
// If NEXT_PUBLIC vars already set (pipeline CI), skip cdk-outputs fallback
const alreadySet =
  process.env.NEXT_PUBLIC_GRAPHQL_URL &&
  process.env.NEXT_PUBLIC_USER_POOL_ID &&
  process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;
if (alreadySet) {
  console.log('✓ NEXT_PUBLIC_* already in environment; skipping cdk-outputs.json.');
  process.exit(0);
}
```

This maintains the existing local-dev flow (reads `cdk-outputs.json`) while
preventing the fallback-write from overriding pipeline-injected values.

## 3. SOC 2 Impact

| Criterion | Control | Evidence |
|-----------|---------|----------|
| CC8 (Change Management) | All frontend content deploys flow through the same self-mutating pipeline; no out-of-band manual deploys needed | CloudTrail: AssumeRole on ContentDeployRole, S3 PutObject events, invalidation events — all traceable to pipeline execution ID |
| CC6.6 (Logical Access — Encryption in Transit) | S3 sync uses HTTPS (CLI default); CloudFront enforces viewer HTTPS redirect | Config rules (existing) |

## 4. Test Plan

### 4.1 pipeline-stack.unit.test.ts (extend)

- `DeployFrontendContent` step exists in Dev, Staging, and Prod stages.
- Staging SmokeTest has a dependency on DeployFrontendContent (assert via
  CodePipeline action ordering in the template, not buildspec strings —
  SMOKE-1 lesson).
- `envFromCfnOutputs` wires at least: `FRONTEND_BUCKET`,
  `DISTRIBUTION_ID`, `CONTENT_DEPLOY_ROLE_ARN`, `NEXT_PUBLIC_GRAPHQL_URL`,
  `NEXT_PUBLIC_USER_POOL_ID`, `NEXT_PUBLIC_USER_POOL_CLIENT_ID`.

### 4.2 frontend-stack.unit.test.ts (extend)

- `ContentDeployRole` exists with trust condition on
  `arn:aws:iam::157082218687:role/CumplifyPipeline*`.
- Role has `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on the
  frontend bucket.
- Role has `cloudfront:CreateInvalidation` on exactly one distribution.
- No wildcard Resource (except the `/*` suffix for object-level actions).
- `ContentDeployRoleArn` CfnOutput exists.

### 4.3 load-env.test.ts (extend)

- When `NEXT_PUBLIC_GRAPHQL_URL`, `NEXT_PUBLIC_USER_POOL_ID`,
  `NEXT_PUBLIC_USER_POOL_CLIENT_ID` are all set in process.env, the script
  exits 0 without writing `.env.local`.

### 4.4 Verification gate

`tsc --noEmit` + `npm run test` (both workspaces) + `npx cdk synth --all`
must pass. CDK Nag green.

## 5. Files Changed (expected)

| File | Change type |
|------|------------|
| `infra/lib/frontend-stack.ts` | Add ContentDeployRole + capture CfnOutputs into public fields |
| `infra/lib/api-stack.ts` | Capture `GraphqlApiUrl` CfnOutput into public field |
| `infra/lib/identity-stack.ts` | Capture `PoolBId` + `PoolBClientId` CfnOutputs into public fields |
| `infra/lib/cumplify-stage.ts` | Expose new output fields from all three stacks |
| `infra/lib/pipeline-stack.ts` | Add DeployFrontendContent step per stage, reorder Staging post steps |
| `infra/lib/pipeline-stack.unit.test.ts` | Extend with content-deploy assertions |
| `infra/lib/frontend-stack.unit.test.ts` | Extend with ContentDeployRole assertions |
| `frontend/scripts/load-env.mjs` | Add early-exit guard for pre-set env vars |
| `frontend/src/test/load-env.test.ts` | Extend with env-var-present test case |

## 6. Open Questions

1. **CodeBuild IAM for `sts:AssumeRole`:** CDK Pipelines' CodeBuild project
   role in mgmt must have `sts:AssumeRole` on
   `arn:aws:iam::*:role/*ContentDeployRole*`. CDK Pipelines may or may not
   auto-grant this for `envFromCfnOutputs` cross-account steps. If not
   auto-granted, an explicit `pipeline.pipeline.addToRolePolicy(...)` after
   `buildPipeline()` is needed. Needs verification during implementation (synth
   the template and check the pipeline role's policy statements).
2. **Next.js `out/` directory in CodeBuild:** with `output: 'export'`, `next
   build` writes to `frontend/out/`. The `cd frontend` prefix means the sync
   source is `frontend/out/` → correct. Confirm in implementation that the
   build working directory is the repo root (CDK Pipelines default: yes).
3. **Prod SmokeTest:** Prod currently has no SmokeTest. Should one be added
   with the same content assertion + dependency on DeployFrontendContent? Or
   is the LegalSignoffGuard + manual approval sufficient for Prod? (Recommend:
   yes, add it — parity with Staging, catches content deploy failures in Prod
   before the pipeline reports green.)

## 7. Constraints

- NO new AWS services (all actions use S3, CloudFront, STS — already in the
  verified stack).
- NO schema/AppSync changes.
- NO changes to Cognito pools or identity layer.
- i18n untouched — the static export already embeds all locale bundles.
- Logical IDs of existing resources unchanged (CDK Nag + deploy safety).
