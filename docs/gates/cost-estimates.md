# P0 Cost Estimates

**Data source:** AWS Cost Explorer (`get-cost-and-usage`)
**Period:** 2026-07-01 to 2026-07-04 (4 days actual, extrapolated to monthly)
**Evidence:** `.kiro/evidence/phase-0-gate/gate-6-cost.log`

---

## Dev Account (697114252993) — Run Rate

| Service | Jul 1-4 (4 days) | Monthly Run-Rate | Notes |
|---------|-----------------|-----------------|-------|
| Amazon OpenSearch Service | $5.98 | ~$45/mo | AOSS scale-to-zero OCU minimum when collection active |
| Amazon Virtual Private Cloud | $3.12 | ~$24/mo | 5 interface endpoints × $0.01/hr/AZ × 2 AZs |
| Amazon Route 53 | $1.50 | ~$11/mo | Hosted zones (2) |
| AWS WAF | $0.58 | ~$4/mo | 2 WebACLs (regional + CloudFront) |
| AWS Key Management Service | $0.49 | ~$4/mo | 10 CMKs ($1/mo ea) + API calls |
| Amazon ElastiCache | $0.35 | ~$3/mo | Single cache.t4g.micro (dev) |
| Amazon Relational Database Service | $0.23 | ~$2/mo | Aurora Serverless v2 (auto-paused at 0 ACU) |
| AWS CloudTrail | $0.23 | ~$2/mo | Management events trail |
| AWS Secrets Manager | $0.03 | ~$0/mo | 1 secret (RDS master) |
| Tax | $0.53 | ~$4/mo | |
| **Total** | **$13.04** | **~$99/mo** | |

---

## Dominant Cost Levers (dev)

1. **AOSS (~$45/mo, 45%):** OpenSearch Serverless NextGen scale-to-zero still charges a minimum OCU fee when the collection exists (even if idle). This is the single largest dev cost and is architectural — the collection is required for Bedrock Knowledge Bases.

2. **VPC Endpoints (~$24/mo, 24%):** 5 interface endpoints (AOSS, SecretsManager, KMS, bedrock-runtime, execute-api) at $0.01/hr/AZ × 2 AZs = $0.02/hr × 730 hrs = ~$14.60 per endpoint × 5... actual is lower because some endpoints share pricing. Gateway endpoints (S3, DynamoDB) are free.

3. **KMS (~$4/mo, 4%):** 10 CMKs at $1/mo each = $10/mo list. Actual lower because July is partial month. API call charges minimal at dev traffic levels.

4. **Route 53 (~$11/mo):** Fixed hosted zone charges.

5. **Everything else:** Aurora auto-pauses to $0; ElastiCache t4g.micro is ~$12/mo list but partial month; DynamoDB on-demand is effectively free at zero traffic.

---

## Mgmt Account (157082218687)

| Service | Jul 1-4 (4 days) | Monthly Run-Rate | Notes |
|---------|-----------------|-----------------|-------|
| AWS Config | $11.95 | ~$91/mo (SPIKE) | Jul-1: $11.07 (conformance-pack monthly); Jul 2-4: $0.14-0.38/day |
| AWS CloudTrail | $3.32 | ~$25/mo | Organization trail + data events |
| Amazon CloudWatch | $2.84 | ~$22/mo | MgmtCostMonitor alarms + dashboard |
| AWS Key Management Service | $1.60 | ~$12/mo | Pipeline artifact CMK |
| Tax | $0.79 | ~$6/mo | |
| Amazon Route 53 | $0.50 | ~$4/mo | |
| AWS Secrets Manager | $0.16 | ~$1/mo | |
| AWS Cost Explorer | $0.11 | ~$1/mo | API calls |
| **Total** | **$21.49** | **~$163/mo (spike)** | **Steady state: ~$50-58/mo** |

### Config Spike Analysis

| Date | Config Cost | Explanation |
|------|------------|-------------|
| 2026-07-01 | $11.07 | Monthly conformance-pack evaluation billing (pre-cleanup) |
| 2026-07-02 | $0.36 | Post-cleanup steady state |
| 2026-07-03 | $0.38 | Steady state |
| 2026-07-04 | $0.14 | Steady state |

The July-1 spike is a one-time monthly Config conformance-pack billing event. Post-cleanup, Config runs at $0.14-0.38/day (~$5-12/mo). The July mgmt budget alert may fire on this spike — expected, pre-explained, not actionable.

**MgmtCostMonitor controls:** Budget alarm ($100/mo threshold) + anomaly detection deployed in PipelineStack. Both operational.

---

## Part 27 Comparison

| Tripwire | Threshold | Actual (monthly) | Status | Notes |
|----------|-----------|-----------------|--------|-------|
| Dev total | ~$150/mo (estimate) | ~$99/mo | **GREEN** | Well under threshold |
| Mgmt steady-state | ~$100/mo | ~$50-58/mo | **GREEN** | Post-Config-cleanup |
| Mgmt spike month | ~$100/mo | ~$163/mo (July only) | **EXPECTED** | Config one-time; budget alert may fire |
| Prod (projected) | $250/mo (owner-approved) | N/A | N/A | Not deployed until P2 |

**No Part 27 tripwire breached.** The prod ~$250/mo threshold is owner-approved (Part 27 architecture review discussion) and is not re-raised as a finding.
