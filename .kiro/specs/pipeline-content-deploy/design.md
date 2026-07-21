# Design — Pipeline Frontend Content Deploy (SMOKE-2) rev 2

> **Status:** APPROVED (architect review 2026-07-21, commit 23186fb).
> Adjustments A-1/A-2/A-3 folded from design-review.md.
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
Prod keeps the content-deploy step but no SmokeTest (OQ-3, out of scope).

This eliminates the hand-deploy debt and makes "frontend content = pipeline
artifact" an invariant.

## 2. Components

### 2.1 ContentDeployRole (FrontendStack) — A-1

A new IAM Role created in each env account. Physical name is deterministic
so the pipeline can construct the exact ARN at synth time (env account IDs
are in ENV_CONFIGS):

```ts
const contentDeployRole = new iam.Role(this, 'ContentDeployRole', {
  // Deterministic physical name enables synth-time ARN in the IAM grant (A-1)
  roleName: `cumplify-${envConfig.envName}-frontend-content-deploy`,
  assumedBy: new iam.AnyPrincipal(),
  inlinePolicies: {
    FrontendDeployPolicy: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
          resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['cloudfront:CreateInvalidation'],
          resources: [
            `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          ],
        }),
      ],
    }),
  },
});
// Trust: only mgmt account pipeline CodeBuild roles
const cfnRole = contentDeployRole.node.defaultChild as iam.CfnRole;
cfnRole.addPropertyOverride('AssumeRolePolicyDocument', {
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: { AWS: '*' },
    Action: 'sts:AssumeRole',
    Condition: {
      StringLike: {
        'aws:PrincipalArn': 'arn:aws:iam::157082218687:role/CumplifyPipeline*',
      },
    },
  }],
});
```

**CDK Nag suppressions on the role:**
- `AwsSolutions-IAM4` — no managed policies used; inline only.
- `AwsSolutions-IAM5` — `s3:*` with `/*` suffix is required for S3 sync
  object-level operations; scoped to this stack's bucket only.
- `AwsSolutions-IAM7` — trust policy's `Principal: {AWS: "*"}` is scoped by
  `aws:PrincipalArn StringLike` condition to mgmt pipeline roles;
  `*`-principal is the only CDK pattern for condition-gated arbitrary-account
  trust (A-3).

**Exposed as:** `public readonly contentDeployRoleArn: string` and
`public readonly contentDeployRoleArnOutput: cdk.CfnOutput`.

### 2.2 CfnOutput field capture (SMOKE-1 pattern)

Existing CfnOutputs promoted to public fields. No construct ID changes, no
second outputs — assignment only:

| Stack | Output logical ID | New public field |
|-------|------------------|-----------------|
| `ApiStack` | `GraphqlApiUrl` | `graphqlApiUrlOutput: cdk.CfnOutput` |
| `IdentityStack` | `PoolBId` | `poolBIdOutput: cdk.CfnOutput` |
| `IdentityStack` | `PoolBClientId` | `poolBClientIdOutput: cdk.CfnOutput` |
| `FrontendStack` | `FrontendBucketName` | `bucketNameOutput: cdk.CfnOutput` |
| `FrontendStack` | `FrontendDistributionId` | `distributionIdOutput: cdk.CfnOutput` |
| `FrontendStack` | `ContentDeployRoleArn` | `contentDeployRoleArnOutput: cdk.CfnOutput` (new) |

### 2.3 CumplifyStage exposure

New public fields on `CumplifyStage`, assigned after each stack is constructed:

```ts
public readonly graphqlApiUrlOutput: cdk.CfnOutput;
public readonly poolBIdOutput: cdk.CfnOutput;
public readonly poolBClientIdOutput: cdk.CfnOutput;
public readonly frontendBucketNameOutput: cdk.CfnOutput;
public readonly frontendDistributionIdOutput: cdk.CfnOutput;
public readonly contentDeployRoleArnOutput: cdk.CfnOutput;
```

### 2.4 DeployFrontendContent step (pipeline-stack.ts)

A factory function (DRY — three stages use it). The step:
1. Receives env config from `envFromCfnOutputs`.
2. Bypasses the cdk-outputs.json fallback in `load-env.mjs` (see §2.6).
3. Assumes the ContentDeployRole using the deterministic ARN from
   `envFromCfnOutputs` — ARN is also in `rolePolicyStatements` for the
   pre-grant (A-1).

```ts
function makeDeployFrontendStep(
  stage: CumplifyStage,
  envAccount: string,
  envName: string,
): pipelines.CodeBuildStep {
  // Synth-time ARN — deterministic role name enables this without runtime env vars (A-1)
  const contentDeployRoleArn =
    `arn:aws:iam::${envAccount}:role/cumplify-${envName}-frontend-content-deploy`;

  return new pipelines.CodeBuildStep('DeployFrontendContent', {
    envFromCfnOutputs: {
      NEXT_PUBLIC_GRAPHQL_URL: stage.graphqlApiUrlOutput,
      NEXT_PUBLIC_USER_POOL_ID: stage.poolBIdOutput,
      NEXT_PUBLIC_USER_POOL_CLIENT_ID: stage.poolBClientIdOutput,
      FRONTEND_BUCKET: stage.frontendBucketNameOutput,
      DISTRIBUTION_ID: stage.frontendDistributionIdOutput,
      CONTENT_DEPLOY_ROLE_ARN: stage.contentDeployRoleArnOutput,
    },
    // Explicit AssumeRole grant on the CodeBuild project role (not pipeline role).
    // CDK Pipelines does NOT auto-grant sts:AssumeRole for in-command assumes. (A-1)
    rolePolicyStatements: [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [contentDeployRoleArn],
      }),
    ],
    commands: [
      // cwd = repo root (CDK Pipelines default: source artifact at root)
      // NEXT_PUBLIC_* are already in OS env — load-env.mjs early-exits (see §2.6)
      'cd frontend && npm ci && npm run build',
      // cwd is now frontend/ — out/ is relative to frontend/
      // Assume the env-account ContentDeployRole.
      // NEVER echo $CREDS or set -x — credentials would appear in CloudWatch logs. (A-3)
      'CREDS=$(aws sts assume-role --role-arn "$CONTENT_DEPLOY_ROLE_ARN" --role-session-name pipeline-content-deploy --output json --no-cli-pager)',
      'export AWS_ACCESS_KEY_ID=$(echo "$CREDS" | jq -r .Credentials.AccessKeyId)',
      'export AWS_SECRET_ACCESS_KEY=$(echo "$CREDS" | jq -r .Credentials.SecretAccessKey)',
      'export AWS_SESSION_TOKEN=$(echo "$CREDS" | jq -r .Credentials.SessionToken)',
      // Sync static export to bucket; --delete removes stale objects (ghost-route prevention)
      'aws s3 sync out/ "s3://$FRONTEND_BUCKET/" --delete',
      // Invalidate CloudFront — fire-and-forget; propagation ~60s
      'aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"',
    ],
    buildEnvironment: {
      buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/standard:8.0'),
      computeType: codebuild.ComputeType.SMALL,
    },
  });
}
```

### 2.5 Step ordering

Post steps in CDK Pipelines are unordered by default. SmokeTest must run
after content is deployed — enforced via `addStepDependency`:

```ts
// Staging: deploy content first, then smoke
const deployContent = makeDeployFrontendStep(stagingStage, ENV_CONFIGS.staging.account, 'staging');
const smokeTest = new pipelines.ShellStep('SmokeTest', { ... }); // existing
smokeTest.addStepDependency(deployContent);

pipeline.addStage(stagingStage, {
  pre: [new pipelines.ManualApprovalStep('ApproveToStaging')],
  post: [deployContent, smokeTest],
});

// Dev and Prod: content deploy only, no SmokeTest
pipeline.addStage(devStage, {
  post: [makeDeployFrontendStep(devStage, ENV_CONFIGS.dev.account, 'dev')],
});
// Prod keeps the step; no SmokeTest (OQ-3: Prod post-deploy verification is
// a separate GA-hardening conversation — out of scope for this spec).
pipeline.addStage(prodStage, {
  pre: [ /* existing approval + LegalSignoffGuard */ ],
  post: [makeDeployFrontendStep(prodStage, ENV_CONFIGS.prod.account, 'prod')],
});
```

### 2.6 Frontend build config — load-env.mjs early-exit guard (A-2)

**Corrected narrative:** `cdk-outputs.json` IS committed at repo root and
DOES arrive in the CodeBuild source artifact. Without the guard,
`load-env.mjs` would read `cdk-outputs.json` and write a `.env.local` with
DEV values during every env's build (including staging and prod). While
Next.js's env-var precedence (OS > `.env.local`) means the correct
`NEXT_PUBLIC_*` values still win at build time, a dev-populated `.env.local`
inside a staging or prod build is a confusing latent artifact. The guard is
therefore **required**:

```js
// frontend/scripts/load-env.mjs — add near the top before any file I/O
const alreadySet =
  process.env.NEXT_PUBLIC_GRAPHQL_URL &&
  process.env.NEXT_PUBLIC_USER_POOL_ID &&
  process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;
if (alreadySet) {
  console.log('✓ NEXT_PUBLIC_* already in environment; skipping cdk-outputs.json.');
  process.exit(0);  // .env.local is NOT written — test §4.3 asserts this
}
```

Test §4.3 asserts that `.env.local` is NOT written (not merely that the
script exits 0) when all three `NEXT_PUBLIC_*` vars are present in env.

## 3. SOC 2 Impact

| Criterion | Control | Evidence |
|-----------|---------|----------|
| CC8 (Change Management) | All frontend content deploys flow through the self-mutating pipeline; no out-of-band manual deploys possible | CloudTrail: `AssumeRole` on ContentDeployRole, `s3:PutObject` events, `cloudfront:CreateInvalidation` — all traceable to pipeline execution ID |
| CC6.6 (Logical Access — Encryption in Transit) | S3 sync uses HTTPS (CLI default); CloudFront enforces viewer HTTPS redirect | Existing Config rules |

## 4. Test Plan

### 4.1 pipeline-stack.unit.test.ts (extend)

Assert on the synthesized CloudFormation template (mechanism, not command
strings — SMOKE-1 lesson):

- `DeployFrontendContent` CodeBuild project exists in Dev, Staging, and Prod
  stages.
- Staging SmokeTest CodeBuild action depends on DeployFrontendContent
  (assert action run order in the synthesized CodePipeline resource).
- The step's CodeBuild project role policy contains
  `sts:AssumeRole` on the three exact deterministic ARNs
  (`arn:aws:iam::<envAccount>:role/cumplify-<envName>-frontend-content-deploy`)
  — confirms OQ-1 resolution.
- `envFromCfnOutputs` wires at least: `FRONTEND_BUCKET`, `DISTRIBUTION_ID`,
  `CONTENT_DEPLOY_ROLE_ARN`, `NEXT_PUBLIC_GRAPHQL_URL`,
  `NEXT_PUBLIC_USER_POOL_ID`, `NEXT_PUBLIC_USER_POOL_CLIENT_ID` (assert
  via `EnvironmentVariables` in the CodeBuild action's environment block).

### 4.2 frontend-stack.unit.test.ts (extend)

- `ContentDeployRole` IAM Role exists with physical name
  `cumplify-<envName>-frontend-content-deploy`.
- Trust policy `Principal.AWS` is `"*"` with `Condition.StringLike.aws:PrincipalArn`
  matching `arn:aws:iam::157082218687:role/CumplifyPipeline*`.
- Role policy: `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on bucket
  ARN and `<bucketArn>/*`.
- Role policy: `cloudfront:CreateInvalidation` on exactly one distribution
  resource.
- `ContentDeployRoleArn` CfnOutput exists.

### 4.3 load-env.test.ts (extend)

- When all three `NEXT_PUBLIC_*` vars are in `process.env`, the script:
  - exits 0.
  - does **NOT** write `.env.local` (assert file was not created/modified).

### 4.4 Verification gate

`tsc --noEmit` + `npm run test` (both workspaces) + `npx cdk synth --all`
must pass. CDK Nag green.

## 5. Files Changed (expected)

| File | Change type |
|------|------------|
| `infra/lib/frontend-stack.ts` | Add ContentDeployRole; capture `FrontendBucketName` + `FrontendDistributionId` + new `ContentDeployRoleArn` CfnOutputs into public fields |
| `infra/lib/api-stack.ts` | Capture existing `GraphqlApiUrl` CfnOutput into public `graphqlApiUrlOutput` field |
| `infra/lib/identity-stack.ts` | Capture existing `PoolBId` + `PoolBClientId` CfnOutputs into public fields |
| `infra/lib/cumplify-stage.ts` | Expose six new output fields from the three stacks |
| `infra/lib/pipeline-stack.ts` | Add `makeDeployFrontendStep` factory; wire Dev/Staging/Prod; `addStepDependency` on Staging SmokeTest |
| `infra/lib/pipeline-stack.unit.test.ts` | Extend: content-deploy step assertions, SmokeTest ordering, IAM grant ARNs |
| `infra/lib/frontend-stack.unit.test.ts` | Extend: ContentDeployRole trust + scoping |
| `frontend/scripts/load-env.mjs` | Add early-exit guard (REQUIRED per A-2) |
| `frontend/src/test/load-env.test.ts` | Extend: assert `.env.local` not written when env vars present |

## 6. Open Questions (resolved)

- **OQ-1:** Explicit `sts:AssumeRole` grant via `rolePolicyStatements` on
  the CodeBuild step (not the pipeline role). Deterministic role name enables
  synth-time ARN. Resolved by A-1.
- **OQ-2:** Working directory confirmed — post-steps receive the repo source
  artifact at root; `cd frontend` in commands persists within the buildspec
  phase. Confirmed from live pipeline data.
- **OQ-3:** No Prod SmokeTest. Prod post-deploy verification is a separate
  GA-hardening conversation. Prod keeps `DeployFrontendContent`.
