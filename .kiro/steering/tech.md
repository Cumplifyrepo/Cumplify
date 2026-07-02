---
inclusion: always
---
# Verified Stack — Cumplify.ai

No AWS service, model, or third-party dependency outside this file and
Appendices A/C/D/E/F/G/H may be introduced. If a task seems to need one:
STOP, flag it in the spec's Open Questions, do not implement.

## Regions & Accounts
- Primary: us-east-1 · DR: us-west-2
- Dev: 697114252993 · Staging: 889007427685 · Prod: 077405654066
- Pipeline: management account, crossAccountKeys:true, selfMutation

## AI Models (Nova-first mandate, Part 30)
| Model | Profile ID | Duty class |
|---|---|---|
| Nova Micro | `us.amazon.nova-micro-v1:0` | Classification, routing, triage, telemetry summarization, NCTriage (see note below) |
| Nova Lite | `us.amazon.nova-lite-v1:0` | Lightweight agents (RecordsVault, ObjectiveTracker, ContextCartographer, SupplierScout, CompetenceKeeper, EmergencyPlanner, WorkerVoice) |
| Nova Pro | `us.amazon.nova-pro-v1:0` | Workhorse agents (ControlTower, DocStudio, LeadAuditor, CAPAGuru, RiskSentinel, AspectWarden, HazardScout, IncidentInvestigator, ReviewOrchestrator, ComplianceCopilot) |
| Nova Premier | `us.amazon.nova-premier-v1:0` | Highest-reasoning Nova; ISO9001 Domain Guru, ISO14001 Domain Guru, ISO45001 Domain Guru (reassigned from Sonnet per Part 30.2; quarterly 30.3 eval re-validates — if Nova Premier fails the clause-accuracy benchmark, seat reverts to Sonnet under a fresh MODELEXCEPTION record) |
| **Claude Sonnet 4.6** | `us.anthropic.claude-sonnet-4-6` | **SOLE exception:** LegalLedger (M8) only, quarterly-expiring justification, IAM-scoped to that one agent |

**NCTriage assignment note:** agent-catalog.md assigns NCTriage to Nova Lite;
Part 30.1 (v4, higher precedence) classifies "NCTriage-class" as a Nova Micro
duty. Applying corpus precedence (v4 > spine): NCTriage → Nova Micro.

Embeddings: `amazon.titan-embed-text-v2:0`, 1024 dimensions, default; also
supports 512/256. Verified via aws-docs MCP 2026-07-02, corpus corrected at source.

## Verified AWS Services (Appendices A–H consolidated)
**Compute & API:** Lambda, AppSync (GraphQL), API Gateway (HTTP + WebSocket),
ECS/Fargate, Step Functions, Amplify Hosting (Next.js)
**AI/ML:** Bedrock (Agents, KBs, Guardrails, Evaluations, inference profiles,
prompt caching, batch inference, invocation logging), CloudWatch GenAI observability
**Data:** DynamoDB (single-table CumplifyCore), Aurora Serverless v2 PostgreSQL,
OpenSearch Serverless (VECTORSEARCH), ElastiCache Redis, S3 (incl. Object Lock)
**Eventing:** EventBridge (+Scheduler), SQS (+FIFO), SNS, SES
**Identity:** Cognito (3 pools), IAM Identity Center (Pool A staff SSO)
**Security:** KMS, Secrets Manager, WAF (CloudFront + Regional + Bot Control),
GuardDuty (incl. Malware Protection for S3), AWS Config, Security Hub,
Inspector, IAM Access Analyzer, AWS Audit Manager, CloudTrail (org-wide)
**Networking:** Route 53, CloudFront, ACM, VPC (endpoints, ZERO NAT gateways)
**Observability:** CloudWatch (logs/metrics/alarms/dashboards/Synthetics),
X-Ray, AWS Backup (vault lock)
**Deployment:** CodeDeploy (Lambda canary/linear), AppConfig (feature flags),
CDK Pipelines (selfMutation)
**Marketplace:** Metering + Entitlement Service APIs, EventBridge events,
SBT-AWS AWSMarketplaceSaaSProduct construct
**Analytics:** Kinesis Data Firehose, Athena, S3 analytics
**Support:** Amazon Connect (omnichannel, per-language routing)
**OCR:** Amazon Textract (batch migration pipeline only)

## Third-party (non-AWS)
- Stripe (checkout, subscriptions, metered billing, Connect payouts)
- Tiptap/ProseMirror, Yjs, tldraw, Mermaid (MIT front-end libs)
- SBT-AWS, Powertools for Lambda (OSS CDK/runtime libraries)
- next-intl/ICU (i18n)

## Runtime libraries
- CDK (TypeScript), Powertools for Lambda (TypeScript)
- Next.js (React), next-intl

## Verification rule
If a fact is not in this file or the architecture appendices, verify via the
aws-docs MCP before using it. Never guess service limits, prices, or APIs.
