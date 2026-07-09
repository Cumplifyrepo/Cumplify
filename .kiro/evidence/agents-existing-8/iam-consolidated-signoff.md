# Consolidated IAM Surface Sign-off — agents-existing-8 (Tasks 4/8/8R/8R-2)

**Owner decision (Julio, 2026-07-09, verbatim): "Approve IAM"**

Surface approved (as presented, all architect-validated pre-approval):
1. 8 agent-handler roles carrying AgentHandlerReadOnlyPolicy — zero RDS, zero DDB, zero bedrock
2. State-machine role grantInvoke on exactly {store-token, execute-writeback}
3. AOSS data-access READ block + the 8 exact handler role ARNs
4. Task-4 roles restructured onto Lambda-generated roles (statement-equivalent, verified)
5. 3 AppSync data-source roles (appsync.amazonaws.com → lambda:InvokeFunction, one per guru Lambda)
6. T-9a: AOSS WRITE + apply-template role (pre-approved Task-4 carry, executed in Task 9)

Commits covered: a9f4142 (Task 4, previously approved), fa67b00 (8R), cfaff2e (8R-2), b2d09a6 (hotfix).
Gate satisfied: REQUIRES-HUMAN (IAM) → Task 9 deploy authorized under standing authorization.
