# Task 14 — Consolidated REQUIRES-HUMAN Sign-Off

**Date:** 2026-07-11
**Owner decision:** "Approve — deploy to dev" (selected from the architect's
three-option bundle presentation; full bundle, no items held).

## Bundle as signed (six items, verified on disk before presentation)

| # | Item | Commits | Verification |
|---|------|---------|--------------|
| 1 | 5-field schema surface: `listPendingHitlItems` (paginated), `approveHitlItem`, `onHitlItemResolved` (@aws_subscribe→approveHitlItem, C-6 VTL), `getProfile`, `updateProfile`; `taskToken` in zero GraphQL types | 72145b4 | schema grep taskToken=0; 5 resolver attachments in ApiStack |
| 2 | HITL-10 SFN amendment: `sfnExecutionArn.$: $$.Execution.Id` into store-token Payload (ai-stack.ts:206) + `Catch [SENT_BACK] → HandleSendBack` (Pass, terminal) | 7c241a3, b659c23 | template assertion green; synth exit 0 all stages |
| 3 | Approval-Lambda IAM: sts:AssumeRole+TagSession on tenant-data role (3 new principals added to trust incl. `#`-injection DENY), events:PutEvents on bus, CMK decrypt, `states:SendTaskSuccess/SendTaskFailure` Resource `*` (callback authz rides the task token — reasoned IAM5 suppression; grant was MISSING in Kiro's build, added by architect hotfix) | 72145b4, 45a2b7b | api-stack.unit.test.ts 14/14 |
| 4 | Sweeper IAM + schedule: `dynamodb:Scan` scoped to `<table>/index/GSI9` ONLY (sparse index; never the base table), UpdateItem on CumplifyCore, CMK decrypt, 5-min EventBridge rule (wiring was ABSENT despite ticked box — rule-7 false tick #4 — implemented by architect hotfix) | 45a2b7b | source-level assertion: exactly one dynamodb:Scan statement, index-scoped |
| 5 | Cross-account pipeline-step role — DESIGN signed, build follows: role in workload account trusted by the mgmt pipeline CodeBuild role; permissions now = s3 sync on the FrontendStack deploy bucket + cloudfront:CreateInvalidation; int-test statements land later under the api-core pipeline carry's own review (same role, additive) | design R3 §9 | nothing deployed yet; pipeline-stack untouched |
| 6 | FrontendStack: private S3 (BLOCK_ALL, enforceSSL, S3-managed encryption) + CloudFront with OAC, SPA error responses (403/404→index.html), HTTPS redirect; joins all 3 stages (staging/prod deploy only when their gates open) | 7677149 | 4 template assertions; Nag reasoned suppressions |

**Pre-sign-off state independently verified by architect:** 529 tests pass
(re-executed), `tsc --noEmit` exit 0, `cdk synth` exit 0.

## Execution plan under standing authorization

Push → pipeline self-mutation (FrontendStack new to stage) → Dev deploys
ApiStack/AiStack/FrontendStack → architect hand-deploys the SPA export to the
FrontendStack bucket for this first pass (pipeline post-step lands with the
item-5 role build) → Task 15 readbacks (invoke, not inspect) → ACC suite.
