---
inclusion: fileMatch
fileMatchPattern: "infra/**"
---
# CDK Conventions (cdk-guidance §1 + §4)
One app, one pipeline, N environment accounts. No exceptions.

## Account boundary — mgmt hosts ONLY the pipeline (ENFORCED)
The management account (157082218687) hosts ONLY the CDK PipelineStack. Every
application/workload stack (Network/Security/Data/Identity/Ai/…) deploys to a
dedicated env account — dev/staging/prod — and NEVER to mgmt. The prior (May)
project violated this and deployed the whole app into mgmt; that debris cost
real money and widened blast radius. This is not advisory:
- `assertWorkloadAccountBoundary()` in `env-config.ts` runs at module load and
  fails synth if any `ENV_CONFIGS` entry targets mgmt or collides.
- `CumplifyStage` throws at construction if its env resolves to mgmt.
- Covered by `infra/lib/env-config.unit.test.ts` (runs in `npm run test`).
Note: AWS SCPs cannot restrict the management account, so these synth-time
checks — not an Org policy — are the enforced control. Do not add a workload
stack to PipelineStack's own scope, and never set a workload env `account` to
157082218687.

## Stack boundaries (§1.2)
| Stack | Contents |
|---|---|
| NetworkStack | VPC, subnets, VPC endpoints (AOSS, Secrets, KMS, Bedrock, execute-api), flow logs |
| SecurityStack | 10 KMS CMKs (dynamodb, rds, elasticache, s3-general, secrets, cloudwatch-logs, sns, sqs, eventbridge, bedrock), WAFv2 WebACLs (REGIONAL + CLOUDFRONT), Secrets Manager secrets |
| DataStack | DynamoDB CumplifyCore TableV2, Aurora Serverless v2, ElastiCache, AOSS collection + 3 policies, S3 Object Lock buckets |
| IdentityStack | 3 Cognito User Pools + clients + PreTokenGeneration Lambda + groups |
| AiStack | Bedrock CfnAgent (22), CfnKnowledgeBase, CfnGuardrail, action-group Lambdas |
| ApiStack | AppSync GraphqlApi, Lambda Authorizer, resolvers, CfnApiCache, WAF association |
| EventingStack | EventBridge buses, SQS queues + DLQs, rules, SNS + SES |
| ComputeStack | ECS/Fargate cluster + services for long-running agent orchestration |
| EdgeStack | CloudFront distribution (OAC), Route 53 records, ACM (us-east-1) |

## Pipeline rules
- Pipeline lives in mgmt account; self-mutates; `crossAccountKeys: true`.
- Stages: Dev (no gate) → Staging (manual approval + smoke) → Prod
  (manual approval + LegalSignoffGuard + RollbackInitiator on alarm).
- Never use `fromLookup` inside synth — pre-resolve into cdk.context.json.
- CodeStar Connection: one-time manual authorization (documented in runbook).

## CDK Nag (§4) — non-negotiable
- `AwsSolutionsChecks` applied at the **App** level with `verbose: true`.
- All Nag warnings are treated as **failures** (Cumplify rule).
- Every suppression MUST carry a documented `reason` string.
- Expected justified suppressions: IAM5 (Bedrock InvokeModel requires
  Resource:'*'), L1 (if Nag lags Node runtime).

## Defaults
- Lambda runtime: Node 22 LTS, arm64 (Graviton, ~20% better price-perf).
- Environment selection: `-c env=<dev|staging|prod>` resolves account/region.
- No cross-env shared state. Each env has its own KMS, RDS, Cognito, AOSS.
- Prefer passing constructs via props over `Fn::ImportValue`.

## Why these rules
Finer stack boundaries = smaller blast radius. CDK Nag = automated compliance.
crossAccountKeys = the pipeline actually works cross-account. Graviton =
cost lever (Part 25). Zero NAT gateways = no silent $32/mo/AZ tax (Part 25).

## Logical ID stability (CRITICAL — deploy safety)
- **Never rename the construct ID** of a deployed stateful resource (VPC
  endpoints, S3 buckets, KMS keys, DynamoDB tables, RDS clusters, Cognito
  pools, security groups, etc.).
- The construct ID string passed to the constructor determines the
  CloudFormation logical ID. Changing it forces create-before-delete
  replacement, which can fail (private-DNS conflicts, name collisions,
  resource limits) and leave the stack in ROLLBACK state.
- If you need to clarify intent, use code comments or variable names — NOT
  the construct ID parameter.
- Rule of thumb: once a resource is deployed, its construct ID is a contract
  with CloudFormation. Treat it as immutable.
