# RS-8 infra incident — AiStack.Deploy failed, rolled back cleanly, fixed (architect, 2026-07-22)

## What happened
Commit f3a682c's dependency reversal (`AiStack` no longer depends on
`ApiStack`; `ApiStack.addDependency(AiStack)` instead, with both stacks
importing three-then-two new values from each other via `Fn.importValue`)
deployed to Dev and **failed**:

```
2026-07-22T10:29:04Z UPDATE_ROLLBACK_IN_PROGRESS Dev-AiStack
  No export named cumplify-dev-graphql-api-id found
```

CloudFormation rolled `Dev-AiStack` back to its previous working version
automatically (`UPDATE_ROLLBACK_COMPLETE`). **Nothing was left broken in
the live environment** — this is CloudFormation's designed-safe failure
mode, confirmed by direct `describe-stacks` check (ground truth, not
pipeline self-report) immediately after.

## Root cause
`Fn.importValue` carries a value without registering a CDK dependency
edge — that was the whole point of using it. But I added NEW
cross-references in **both directions in the same deploy**: `AiStack`
importing `ApiStack`'s (newly-exported) `appRoleSecretArn`/
`graphqlApiId`/`graphqlApiUrl`, and `ApiStack` importing `AiStack`'s
(newly-exported) `CapaGuruHandlerArn`/`RiskSentinelHandlerArn`. Only ONE
explicit `addDependency` can win an ordering race; whichever stack
CloudFormation deploys second is fine (the first stack's new export
already exists), but whichever deploys FIRST looks up an export the OTHER
stack — which creates it — hasn't deployed yet. `AiStack` deployed first
(per `ApiStack.addDependency(AiStack)`) and failed looking up ApiStack's
NOT-YET-CREATED `graphql-api-id` export. Reversing the explicit dependency
the other way would have failed identically in the other direction
(`ApiStack` looking up AiStack's not-yet-created Lambda ARN exports). This
is a fundamental bootstrap deadlock, not a bug in either specific
direction — you cannot resolve a genuinely bidirectional NEW reference
with a single simultaneous deploy and one dependency edge.

**Process lesson**: `cdk synth` succeeding — even with the actual rendered
templates inspected for exports/imports, as I did before pushing — does
NOT validate deploy-time `Fn::ImportValue` resolution order, because synth
has no concept of "does this export already exist in the target account."
The only way to actually validate this class of change is a real deploy
(or a scripted two-stack-diff simulation), which is why this shipped as an
evidence-logged incident rather than a caught-in-review finding.

## The actual fix — eliminate the bidirectional reference entirely
Found the existing, already-proven precedent in this exact codebase:
`RegenerateSectionFn`/`DocGenStateMachine` (spec-40, GEN-6) solve the
*identical* problem — `AiStack` depends on `ApiStack` (unchanged,
original direction), and `ApiStack` needs to invoke a Lambda / start a
state machine that lives in `AiStack`. The precedent's answer: give the
`AiStack` resource a **deterministic name**
(`cumplify-docgen-regen-${env}`), and have `ApiStack` **construct the ARN
from that name** via `cdk.Stack.of(this).formatArn({...})` — zero
cross-stack export, zero import, zero new dependency edge in either
direction. `Fn::Join`-constructed ARN strings need no CloudFormation
export to exist at all.

Applied the identical pattern:
- `AiStack`: `CapaGuruFn`/`RiskSentinelFn` get explicit
  `functionName: cumplify-capa-guru-${env}` / `cumplify-risk-sentinel-${env}`
  (new `functionName` option added to the local `createAgentHandler`
  helper).
- `ApiStack`: `capaGuruFnArn`/`riskSentinelFnArn` constructed via
  `formatArn({service:'lambda', resource:'function', resourceName: ...,
  arnFormat: ArnFormat.COLON_RESOURCE_NAME})` — same call shape as
  `regenFnArn`. IAM `lambda:InvokeFunction` grants and the
  `CAPA_GURU_FN_ARN`/`RISK_SENTINEL_FN_ARN` env vars are unchanged in
  shape, just sourced from a constructed string instead of an imported one.
- Fully reverted: `AiStackProps` restores `appRoleSecretArn`/
  `graphqlApiId`/`graphqlApiUrl` as native props; `ApiStack`'s three
  `CfnOutput`s lose their `exportName`; `cumplify-stage.ts` restores
  `aiStack.addDependency(apiStack)` / `apiStack` prop-passing exactly as
  it was before this wave, with `apiStack.addDependency(aiStack)` removed.

## Verification (against the rendered cloud assembly, not just synth exit code)
| Check | Result |
|---|---|
| `manifest.json` stack `dependsOn` | `ApiStack` deps: Data/Identity/Security/Eventing (no AiStack) — original. `AiStack` deps: Data/**ApiStack**/Eventing/AuditTrail/Network/Security — original restored. |
| `ApiStack.template.json` `Fn::ImportValue` refs | All pre-existing (Data/Security/Identity/Eventing exports) — zero references to anything in AiStack. |
| `ApiStack`'s 3 `CfnOutput`s | No `Export` block — plain outputs, matching pre-RS-8 shape. |
| `ResolverM2Fn`/`ResolverM5Fn` env vars | `CAPA_GURU_FN_ARN`/`RISK_SENTINEL_FN_ARN` are `Fn::Join`-constructed ARN strings (`arn:<partition>:lambda:us-east-1:697114252993:function:cumplify-capa-guru-dev`), not `Fn::ImportValue`. |
| `AiStack`'s `CapaGuruFn`/`RiskSentinelFn` | `FunctionName` properties are the exact matching literal strings (`cumplify-capa-guru-dev`, `cumplify-risk-sentinel-dev`). |
| `AiStack.template.json` | Zero remaining references to any of the five `cumplify-dev-*` export names from the reverted attempt. |
| `npm run typecheck` | clean |
| Backend `npm run test` | 1212 passed / 3 skipped — unchanged from the pre-incident count (revert only touched infra + 2 test files; no product code changed) |

## Standing lesson
Deterministic-name + `formatArn` is the house pattern for "Lambda A
(stack X) needs to invoke Lambda B (stack Y) where Y already depends on
X" in this codebase — already used for `DocGenStateMachine`/
`RegenerateSectionFn`, now also `CapaGuruFn`/`RiskSentinelFn`. **Never**
reach for a stack-dependency reversal + bidirectional `Fn.importValue`
to solve this class of problem — it looks clean in the CDK diff and
passes `cdk synth`, but deadlocks on the first real deploy whenever BOTH
sides are exporting something new in the same wave. Check for an existing
deterministic-name precedent FIRST.
