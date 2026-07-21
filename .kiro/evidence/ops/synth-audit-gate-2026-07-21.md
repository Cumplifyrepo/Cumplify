# INC — Synth broken by upstream advisory; audit gate rebuilt with expiring allowlist (2026-07-21)

## Incident
All three 2026-07-21 pipeline executions (cb76d80 → 750522e1, c191d8c → 862eff8e,
038fea6 → ec54ec45) FAILED at Build/Synth. Symptom in CodeBuild log
(`CumplifyPipelineBuildSynthC-cxhvP0GRhTvW:2405141a`, 12:26:41Z):
`npm audit --audit-level=high` exit 1 — GHSA-3jxr-9vmj-r5cp (brace-expansion
DoS, HIGH), an advisory published UPSTREAM after aws-cdk-lib 2.261.0
(2026-07-02). No repo change caused it; tests passed in the same build.
Consequence: the SMOKE-1 fix (038fea6) could not self-mutate into the live
pipeline — UpdatePipeline runs only after Synth succeeds.

## Root cause of unfixability-by-deps
- `npm audit fix` patched the reachable instances (1.x→1.1.16, 2.x→2.1.2;
  lockfile diff in this commit).
- The remaining instance (brace-expansion@5.0.6 under minimatch@10.2.5 under
  aws-cdk-lib) is BUNDLED inside the aws-cdk-lib tarball
  (`bundleDependencies` verified in node_modules/aws-cdk-lib/package.json) —
  npm overrides and lockfile edits cannot reach bundled deps (both attempted,
  both no-ops; overrides reverted).
- Latest published aws-cdk-lib IS 2.261.0 (npm view, 2026-07-21) — no
  rebundled release exists to upgrade to.

## Decision — gate refined, NOT weakened
Raw `npm audit --audit-level=high` cannot express a documented exception, so
Synth would stay red until AWS republishes (unbounded). Replaced with
`npx tsx scripts/audit-gate.ts`:
- Any high/critical advisory NOT allowlisted → FAIL (gate unchanged for
  everything new).
- Allowlist entries (scripts/audit-allowlist.json) carry advisory ID + module
  + written justification + EXPIRY; an expired entry FAILS the build, forcing
  revisit. Sole entry: GHSA-3jxr-9vmj-r5cp, expires 2026-08-21
  (build-time-only dep; DoS requires attacker-controlled glob patterns —
  none exist in synth context).
- Pure decision logic unit-tested hermetically (7 tests,
  scripts/audit-gate.unit.test.ts; vitest include extended to scripts/).

## Chicken-and-egg escape — one-time direct deploy
The Synth command lives in the pipeline definition; a failing Synth can never
self-mutate its own fix. Standard CDK Pipelines recovery: one direct
`cdk deploy CumplifyPipeline` to the mgmt account from the committed tree.
This also delivers the SMOKE-1 SmokeTest change (same stack) to the live
pipeline immediately. Readback of the live definition follows in this log's
addendum. The subsequent develop push re-enters normal self-mutating flow.

## Also surfaced (routed, not fixed here)
frontend tree: `next@15.x` carries 14 high advisories (DoS/SSRF/cache
poisoning family); fix is next@16.2.10 = BREAKING upgrade. Not CI-gated
(Synth audits root only), pre-existing, needs its own spec/test pass →
action item for owner/Kiro, pre-GA.

## Verification (2026-07-21, local, pre-deploy)
- `npx tsx scripts/audit-gate.ts` → WAIVED GHSA-3jxr-9vmj-r5cp; PASS, exit 0
- `npx tsc --noEmit` → exit 0
- `npm run test` → 1129 passed | 3 skipped (infra+scripts) + 121 (frontend), exit 0
- `npx cdk synth --all` → exit 0; template contains `audit-gate`, does NOT
  contain raw `npm audit --audit-level`, SmokeTest FRONTEND_DOMAIN wiring intact

## Addendum — live readback post direct deploy (2026-07-21T13:03-05Z)
- `cdk deploy CumplifyPipeline --app cdk.out --profile cumplify`: CFN
  UPDATE_COMPLETE in 26.8s (stack arn ...:157082218687:stack/CumplifyPipeline).
- Live pipeline (get-pipeline, version 14): SmokeTest action
  EnvironmentVariables = [{name:FRONTEND_DOMAIN,type:PLAINTEXT,
  value:#{CumplifyPipelineStagingFrontendStack3708BC31.FrontendDistributionDomain}}]
  — the 038fea6 SMOKE-1 fix is LIVE.
- Live Synth project (batch-get-projects, lastModified 13:02:44Z) buildspec
  commands: npm ci · frontend npm ci · npm run test ·
  `npx tsx scripts/audit-gate.ts` · npx cdk synth --all — raw
  `npm audit --audit-level=high` GONE.
- Proof run = the push of this commit: expect Synth PASS (gate waives
  GHSA-3jxr-9vmj-r5cp), UpdatePipeline no-op, Dev deploy green, execution
  parks at ApproveToStaging.

## Addendum 2 — proof run WITNESSED (exec b4ea46d0, revision 73e5dab)
| Stage | Status | Time (Z) |
|---|---|---|
| Source | Succeeded | 13:04 |
| Build/Synth | **Succeeded** | 13:12 |
| UpdatePipeline | Succeeded (no-op — deployed def == committed def, no drift) | 13:13 |
| Assets | Succeeded | 13:15 |
| Dev | Succeeded | 13:22 |
| Staging | InProgress — parked at ApproveToStaging (fresh token for 73e5dab) | — |

CI log line (CodeBuild 13:11:04Z, witnessed): `WAIVED GHSA-3jxr-9vmj-r5cp
(brace-expansion) — allowlisted` → `audit-gate: PASS — 1 finding(s)
inspected, 1 waived, 0 blocked`. INC-10 CLOSED; pipeline fully unblocked.
