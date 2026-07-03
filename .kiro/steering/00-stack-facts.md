---
inclusion: always
---
# Verified Stack Facts (non-negotiable)
- Region: us-east-1 primary, us-west-2 DR. Accounts: dev 697114252993,
  staging 889007427685, prod 077405654066, pipeline in mgmt account 157082218687.
- Models (Part 30 Nova ladder ONLY): us.amazon.nova-micro-v1:0,
  us.amazon.nova-lite-v1:0, us.amazon.nova-pro-v1:0, us.amazon.nova-premier-v1:0.
  SOLE exception: LegalLedger uses us.anthropic.claude-sonnet-4-6 (quarterly-
  expiring justification, IAM-scoped to that one agent).
- Embeddings: amazon.titan-embed-text-v2:0, 1024 dimensions, everywhere.
- bedrock:InvokeModel IAM requires Resource:'*'. Action-group Lambdas need a
  resource-based policy for bedrock.amazonaws.com (SourceAccount + SourceArn).
- DynamoDB CumplifyCore: single table, PK/SK, on-demand, CMK (all 6 KMS
  actions), 9 GSIs. Tenant isolation: dynamodb:LeadingKeys +
  ForAllValues:StringLike on aws:PrincipalTag/tenantId.
- RDS = Aurora Serverless v2 PostgreSQL, RLS keyed to authorizer tenant claim.
- AWS Marketplace APIs (ResolveCustomer, GetEntitlements, BatchMeterUsage)
  are called from us-east-1 only, via the scoped integration role.
- If a fact is not in this file or Appendices A/C/D/E/F/G/H, verify via the
  aws-docs MCP before using it. Never guess service limits, prices, or APIs.
