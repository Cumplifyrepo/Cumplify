# P0 CLOSURE — Prerequisites witnessed (2026-07-21)

Architecture: `.kiro/specs/ims-experience/architecture.md` §11 P0.
Commits: 3d49417 (P0.0 architecture + evidence) → a22851b (P0.1/P0.2 AUD-1
fix + real-fixture tests) → fb474f8 (P0.3 AUD-9 error≠empty fix).
Pipeline: exec `b04c78db-1b62-43af-833c-c253f44fdb6d` — Source/Build (audit
gate + CI test lanes)/UpdatePipeline/Assets/**Dev ALL GREEN 22:30:16Z**
(9 stacks + DeployFrontendContent + fail-closed seeder + smoke). Earlier
exec cd5f4129 Failed = supersede collision from the fb474f8 push mid-Build
(source succeeded on the newer exec — not a code failure).

## P0.4 live witness — dev AppSync, 2026-07-21T22:30:45Z, exit code 0

Token: Pool-B ID token via pycognito SRP as `acc-aaa-admin@example.com`
(password rotated via `admin-set-user-password --permanent`, the technique
precedented in frontend-app task-15 readback; password used only in-session,
never logged). Endpoint: `https://42yckio3gbbgphpdkpl7vux3v4.appsync-api.us-east-1.amazonaws.com/graphql`.
Probe: `aud1-live-probe.py` — runs the audit's query corpus, asserts (a) no
GraphQL/serialization errors, (b) rows present where the audit saw rows,
(c) EVERY `*At`/`*Date` string field is ISO-8601 (`scan_timestamps` walk).

| query | verdict | detail | audit baseline (probe-results.json) |
|---|---|---|---|
| ListDocs | OK | rows=2 | SERIALIZATION `/listDocuments[0]/createdAt` `2026-07-21 18:11:51.350980` |
| ListNCs | OK | rows=2 | SERIALIZATION `/listNonconformities[0]/raisedAt` `2026-07-15 14:45:56.376536` |
| OpenCAPAs | OK | rows=5 | SERIALIZATION `/listOpenCAPAs[0]/dueDate` `2023-10-10 00:00:00` |
| ListFormTemplates | OK | rows=15 | OK rows=15 (unchanged) |
| ListFormRecords | OK | rows=2 (real templateId) | AUD-9 screen: error masked as "No records" |
| ListGenerationRuns | OK | rows=0 | OK (unchanged) |
| GetOrgProfile | OK | null (honest — never filled) | OK (unchanged) |
| ListClauseRegistry | OK | rows=80 | OK (unchanged) |
| ListClauseApplicability | OK | rows=0 | OK (unchanged) |
| TopRisks | OK | rows=4 | OK (unchanged) |
| GetCrossRegisterRiskView | OK | rows=4 | OK (unchanged) |
| GetTenantSettings | OK | obj | OK (unchanged) |
| ListPending | OK | obj | OK (unchanged) |

**SUMMARY: 13/13 OK, fails=0, exit 0.** All four AUD-1 victims serve rows
with valid AWSDateTime values; zero regressions in the previously-OK set.

## Hermetic evidence (CI-enforced, same commits)
- `services/api/__tests__/resolvers/marshal-timestamps.test.ts` — 15 cases,
  REAL Data-API wire-shape fixtures (fixture-fidelity rule per RC-2).
- `m4/forms/page.test.tsx` — 2 AUD-9 regression cases (error → ErrorState,
  never empty table; retry → true empty state). DataTable mock now renders
  emptyMessage (empty-state assertions have teeth).
- Lanes at fb474f8: root vitest 1153 passed/3 skipped; frontend 124 passed.

## P0 checklist vs architecture §11
- [x] P0.0 architecture + 5 research reports persisted + committed
- [x] P0.1 AUD-1 single-point fix (shared marshal; forms.ts duplicate deleted)
- [x] P0.2 hermetic tests with REAL RDS-Data-API fixtures
- [x] P0.3 error≠empty sweep — sweep found ONE offender (m4/forms View 2);
      all other list views already branch error-before-empty; fixed + pinned
- [x] P0.4 live list-with-rows probes — witnessed above

**P0 CLOSED. P1 (Foundation + IA, Kiro ∥ architect read-surface spec) is
unblocked.**
