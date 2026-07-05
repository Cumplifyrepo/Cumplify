# P0 Cost Estimates

**Data source:** AWS Cost Explorer (`get-cost-and-usage`)
**Period:** 2026-06-01 to 2026-07-05
**Populated during:** Phase-0 Gate Task 2 (architect-witnessed)

---

## Dev Account (697114252993) — Run Rate

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| _<populated from gate-6-dev-cost.json>_ | | |

**Total dev run-rate:** _$X.XX/mo_

---

## Dominant Cost Levers (dev)

- **AOSS:** Scale-to-zero NextGen, but OCU minimum when collection active
- **VPC Endpoints:** 5 interface endpoints × $0.01/hr/AZ × 2 AZs = ~$73/mo
- **KMS:** 10 CMKs × $1/mo = $10/mo + API calls
- **Aurora Serverless v2:** minCapacity 0 (auto-pause) — $0 when idle
- **ElastiCache:** cache.t4g.micro — ~$12/mo
- **DynamoDB:** On-demand, minimal dev traffic — < $1/mo

---

## Mgmt Account (157082218687)

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| _<populated from gate-6-mgmt-cost.json>_ | | |

**MgmtCostMonitor controls:** Budget alarm + anomaly detection (deployed in PipelineStack).

---

## Part 27 Comparison

| Tripwire | Threshold | Actual | Status |
|----------|-----------|--------|--------|
| Dev monthly | ~$150/mo estimate | _$X.XX_ | _<GREEN/BREACH>_ |
| Prod monthly (projected) | $250/mo (owner-approved) | N/A (not deployed) | N/A |

**Note:** The prod ~$250/mo tripwire is owner-approved (Part 27 discussion, architecture review). Not re-raised as a finding.
