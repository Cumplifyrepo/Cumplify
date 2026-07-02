---
inclusion: fileMatch
fileMatchPattern: "infra/**"
---
# CDK Conventions (cdk-guidance §1 + §4)
One app, one pipeline, N environment accounts. No exceptions.

## Stack boundaries (§1.2)
| Stack | Contents |
|---|---|
| NetworkStack | VPC, subnets, VPC endpoints (AOSS, Secrets, KMS, Bedrock, execute-api), flow logs |
| SecurityStack | 8 KMS CMKs, WAFv2 WebACLs (REGIONAL + CLOUDFRONT), Secrets Manager secrets |
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
cost lever (Part 27). Zero NAT gateways = no silent $32/mo/AZ tax.
