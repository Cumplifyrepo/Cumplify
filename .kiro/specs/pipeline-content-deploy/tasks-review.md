# Architect Tasks Review — pipeline-content-deploy (2026-07-21)

**Verdict: APPROVED — BUILD WAVE AUTHORIZED** (Phases 1→5 in order; rule 7/8
per-task evidence logs as headed in tasks.md).

## Rev 2 verification
All three adjustments folded faithfully: A-1 (deterministic roleName,
`rolePolicyStatements` on the step with synth-time ARN from ENV_CONFIGS,
explicit "not pipeline role" comment), A-2 (narrative corrected —
cdk-outputs.json IS in the source artifact; guard REQUIRED; §4.3 asserts
`.env.local` NOT written), A-3 (IAM4/IAM5/IAM7 suppressions with condition
justification; never-echo/no-set-x comment; `"$CREDS"` quoted). OQ-3 fold
correct (Prod keeps content-deploy, no SmokeTest). Task sequencing correct
(4.2 requires Phase 2 — already ordered).

## Kiro's two flags — resolved by architect, pre-build
1. **`rolePolicyStatements` availability: CONFIRMED in the installed
   aws-cdk-lib 2.261.0** (`pipelines/lib/codepipeline/codebuild-step.d.ts:60`).
   The Task 2.1 contingency is MOOT — no fallback verification needed.
   **Correction on the proposed fallback (must never be used):**
   `pipeline.pipeline.role.addToPrincipalPolicy(...)` grants on the PIPELINE
   role, not the step's CodeBuild PROJECT role — the same misdirection A-1
   already excluded. If a fallback were ever required, the correct target is
   the step's project role after `buildPipeline()`. It isn't required.
2. **Phase 4→2 ordering:** acknowledged; sequence as written is correct.

## One S-level adjustment (fold into Task 1.1, no rev round needed)
Trust policy: prefer
`assumedBy: new iam.PrincipalWithConditions(new iam.AnyPrincipal(), {
  StringLike: { 'aws:PrincipalArn': 'arn:aws:iam::157082218687:role/CumplifyPipeline*' } })`
over `AnyPrincipal` + raw `CfnRole.addPropertyOverride`. Same rendered
template, but it goes through the normal L2 path (CDK Nag evaluates the real
document rather than a pre-override one; less raw-override surface). Keep
the IAM7 suppression either way.

## Delivery note (no task needed)
Synth is healthy again (INC-10 closed), so this wave lands via normal push →
self-mutation. Ordering is sound by construction: SelfMutate restarts the
execution under the new definition, so each stage's FrontendStack deploy
creates the ContentDeployRole + outputs BEFORE that stage's post step
consumes them via `envFromCfnOutputs`.

## Architect gates after the wave
1. Re-execute full gates + synthesized-template inspection (three exact
   AssumeRole ARNs on the step project roles, Staging action ordering, env
   wiring) — before push.
2. Post-push: watch execution through Synth/self-mutation/Dev; MGMT-side
   readback of Dev content deploy (bucket listing via outputVariables curl of
   dev distribution — expect `<title>Cumplify</title>` still green, now
   pipeline-shipped).
3. Live witness: owner-approved Staging promotion — DeployFrontendContent
   runs, then SmokeTest asserts content on d3aaerttp3jmgo.cloudfront.net.
   Green closes SMOKE-2 / FIND-5; red is a genuine finding.
