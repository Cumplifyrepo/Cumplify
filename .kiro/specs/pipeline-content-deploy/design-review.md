# Architect Review — pipeline-content-deploy design.md (2026-07-21)

**Verdict: GO WITH ADJUSTMENTS** — fold rev 2, then tasks.md. Design quality
is high; component split, trust-condition shape, DRY step factory, and the
mechanism-not-strings test plan are all right. Three adjustments (2 M, 1 S)
and rulings on all three OQs below. All claims independently re-verified
(repo files, live pipeline template, stack output constructs).

## Adjustments

**A-1 (M) — OQ-1 resolved: explicit AssumeRole grant via deterministic role
name.** CDK Pipelines does NOT auto-grant `sts:AssumeRole` for in-command
assume-roles; `envFromCfnOutputs` wires env vars only. And the grant cannot
consume the ContentDeployRoleArn output (runtime env var ≠ synth-time token;
cross-account stage tokens can't flow into mgmt-stack IAM). Resolution:
- FrontendStack sets an explicit physical `roleName:
  cumplify-<envName>-frontend-content-deploy`.
- The CodeBuildStep gets `rolePolicyStatements: [sts:AssumeRole on
  arn:aws:iam::<envAccount>:role/cumplify-<envName>-frontend-content-deploy]`
  — ARN constructed at synth time from ENV_CONFIGS (accounts are there).
  One statement per stage's step, exact ARN, no wildcards.
- NOT `pipeline.pipeline.addToRolePolicy(...)` — that's the pipeline role,
  not the step's CodeBuild project role.
Keep the ContentDeployRoleArn CfnOutput + env var for the runtime command
(as designed) — the deterministic name serves the IAM grant only.

**A-2 (M) — load-env narrative corrected; guard is MANDATORY, not optional.**
Design §2.4 step 2 says cdk-outputs.json is "not present in CodeBuild" —
FALSE: it is COMMITTED at repo root (refreshed c191d8c, 2026-07-21) and
arrives in the source artifact. Without the guard, `load-env.mjs` writes
`.env.local` with DEV values during every env's build and correctness rests
solely on Next's env precedence (OS > .env files — true, but a dev-value
.env.local inside a staging/prod build is a latent landmine and a confusing
artifact). The §2.6 early-exit guard is therefore REQUIRED, with test §4.3
asserting `.env.local` is NOT written when the three NEXT_PUBLIC_* vars are
set. Fold the corrected rationale into the design text.

**A-3 (S) — Nag + credential-hygiene pins.** The trust policy's
`Principal: {AWS: "*"}` (condition-scoped) WILL trip CDK Nag's star-principal
check — add the suppression alongside IAM4/IAM5 with the justification
"scoped by aws:PrincipalArn StringLike condition to mgmt pipeline roles".
Step commands: never echo `$CREDS`, no `set -x` (assume-role credentials
would land in CloudWatch logs).

## OQ rulings

- **OQ-2 (working dir): CONFIRMED as designed, from live raw data** — the
  deployed pipeline's SmokeTest action carries
  `InputArtifacts: [Cumplifyrepo_Cumplify_Source]`, i.e. post-steps default
  to the repo source artifact at repo root. `cd` persistence across buildspec
  commands is established repo precedent (Synth does `cd frontend && npm ci
  && cd ..`). Keep the design's relative `out/` sync (cwd = frontend/ after
  the build command) — add a one-line comment in the commands marking the
  cwd dependence.
- **OQ-1: resolved by A-1** (explicit grant; verify in the synthesized
  template during build that the step project's role policy contains the
  three exact ARNs — add to the §4.1 assertions).
- **OQ-3 (Prod SmokeTest): NO — out of scope for this spec.** Prod stage
  shape under LegalSignoffGuard is the owner+legal lane, and Prod
  post-deploy verification (smoke semantics, RollbackInitiator interplay,
  fail-after-deploy policy) deserves its own decision in the GA hardening
  conversation, not a rider here. Prod KEEPS the DeployFrontendContent step
  (as designed). Logged as owner follow-up.

## Also noted (no action required)
- Cost: +~3-4 min CodeBuild per stage per execution (npm ci dominates);
  acceptable. If it grates later, cache node_modules via CodeBuild cache —
  separate change.
- NEXT_PUBLIC_* values are public client config — env-var delivery is fine.
- jq ships in standard:8.0 ✓; sts default 1h session ample; invalidation
  fire-and-forget ✓; `--delete` on sync ✓ (ghost-route prevention).

## Ordered next
Kiro: fold rev 2 (A-1/A-2/A-3 + OQ text updates) → author tasks.md (small
phases; per-task evidence logs; rule 7/8 ticks+evidence same commit) → STOP
for architect tasks review. Architect gates: post-build template inspection
(role policy ARNs, step ordering, env wiring), then live witness = next
Staging promotion (content deploy → smoke green), which also closes SMOKE-2
and FIND-5.
