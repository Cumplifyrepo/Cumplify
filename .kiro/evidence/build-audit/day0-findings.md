# Build Audit — Day 0 findings (2026-07-21, owner walkthrough exhibits)

> Audit opened by owner order after D5 walkthrough rejection. These are the
> first CONFIRMED findings, each root-caused from raw evidence — no vibes.

## AUD-1 (P0, CONFIRMED, root-caused) — M1-M5 timestamp serialization breaks every populated list
**Symptom:** /m1 and /m2 render "An error occurred" (owner screenshots).
**Reproduction (architect, live, SRP-authenticated as walkthrough users):**
the pages' own queries against AppSync return
`Can't serialize value (/listDocuments[0]/createdAt): Unable to serialize
'2026-07-21 18:11:51.350980' as a valid DateTime Object` (M1) and the same
for `/listNonconformities[*]/raisedAt` = '2026-07-15 14:45:56.376536' (M2).
**Root cause:** M1-M5 resolvers return RAW SQL timestamp text
(`YYYY-MM-DD HH:MM:SS.ffffff`) into schema fields typed `AWSDateTime`
(strict ISO-8601). AppSync rejects AFTER the resolver succeeds → zero Lambda
errors (verified: 0 errors across all 24 ApiStack log groups in the window,
while ResolverM1Fn logged 51 clean invocations). The frontend is NOT at
fault — the pages correctly error-state on a violated API contract.
**Why every validation missed it:** the bug is invisible on EMPTY lists.
M1 had zero documents until the owner's own clicks created the first rows
TODAY (17:59:54, 18:11:51Z — writes work). M2 had rows since 07-09 but its
list was never witnessed THROUGH AppSync with rows present; hermetic tests
use ISO-format fixtures that don't match real DB output. Fixture-fidelity
gap + empty-state blindness — both go on the audit's method-fix list.
**Not implicated:** Kiro's view code, the 7/21 pipeline content deploy
(pre-dates it in M2), auth/role gating, model hallucination.
**Fix shape (S):** shared row-mapper in the M1-M5 resolver family
(SQL timestamp → ISO-8601) + hermetic regression tests using REAL
Postgres-format fixtures + int-lane list-with-rows probes + audit sweep of
every AWSDateTime field in schema vs resolver outputs.

## AUD-2 (M) — internal placeholder leaked into production UI
/m4 Record Register renders dev-facing text "Record listing requires
listRecords query (blocked on backend read surface)" — internal, English-only
(i18n bypass), exposes architecture to tenants. Consequence of the parked
BLOCKED-ON-OWNER read-surface decisions being wired as visible copy.

## AUD-3 (M) — HITL Approval card renders raw JSON args blob
Command Center approval card shows `{"args":{...}}` dump instead of
structured fields (action, owner, due date). Design-fidelity failure vs
CARD-7 intent and the CertifyAero bar.

## AUD-4 (M) — test fixtures pollute tenant-visible data
Top Risks shows ACC fixture names ("ACC-1 spine proof AAA"). No demo-data
discipline: ACC fixtures and demo content are the same namespace.

## AUD-5 (S) — zero-state UX absent
Readiness Score renders 0/0/0 with no explanation or onboarding path;
"Agents Working Now" empty with no context.

## AUD-6 (decision, already on owner desk) — Ask latency
Grounded answer took "forever" (owner). Cause: synchronous chain
(retrieval → composition → ApplyGuardrail grounding check) + cold starts.
This is the pending AR latency sync-vs-async decision, now felt in the UI.
**Fact check for the record:** the 4.4 answer came from docs/kb/iso-9001.md
(clause 4.4 entry, seeded to OpenSearch) — there is NO internet retrieval
anywhere in the stack.

## Corrections to walkthrough impressions (evidence-backed)
- Ask 4.5.1 "failure" = honest-miss firing correctly on a NONEXISTENT
  clause (ISO 9001 clause 4 ends at 4.4). The 4.4 retry (owner screenshot)
  returned the grounded, bracket-cited answer — the core promise working.
- Role gating witnessed working (employee saw no approve controls).
- Locale witnessed working (full ES render).
