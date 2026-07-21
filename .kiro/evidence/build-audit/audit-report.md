# BUILD AUDIT — Cumplify vs Architecture vs CertifyAero (2026-07-21)

> Ordered by owner after D5 walkthrough rejection. Method: three evidence
> planes — (1) REALITY: full frontend route inventory + live SRP-authenticated
> execution of all 28 frontend queries against dev AppSync + resolver source
> sweep; (2) ARCHITECTURE: view-designs.md / frontend-app requirements /
> specs 40-41 promise extraction; (3) BENCHMARK: CertifyAero reverse-
> engineering (owner-designated north star). Zero claims from reports —
> everything below re-derived from source, live API, or logs this session.

## 0. VERDICT

The product is NOT a mock, and this is not the May failure pattern. It is a
deeply built, correctly architected system whose visible surface collapsed
under FOUR specific, fixable causes:

1. **One P0 bug** (AUD-1): a single marshalling function ships raw SQL
   timestamps into strict AWSDateTime fields — **33 resolver fields at risk,
   breaking EVERY populated register in M1-M5 + forms + QMS runs**. Latent on
   empty lists, invisible to Lambda-error monitoring, detonated the moment
   the owner's clicks created data.
2. **Zero data, zero staging** (AUD-8): no org profile, no generation ever
   run, no demo tenant. The one-click manual engine — built, live-proven,
   golden-eval 4.53/5 — has never been shown to the owner. CertifyAero's
   power is a fully SEEDED demo; we never made demo data a deliverable.
3. **Five parked read-surface decisions** rendered as dev-facing placeholder
   text in the product (AUD-2): M3 programmes, M4 record register, M5
   treatments, M1 policy/scope drawers — parked as BLOCKED-ON-OWNER in specs
   and never surfaced for ruling.
4. **The final ACC witness passes were never run** — spec-40 Task 13,
   spec-41 Task 11, frontend-app D5 — and the D5 script the architect issued
   did not include the QMS Engine page at all (method failure, architect's).

Distance to "the SaaS skeleton CertifyAero sets the bar for": **days, not
weeks** — R1-R4 below.

## 1. WHAT IS VERIFIABLY BUILT AND WORKING (witnessed this session)

- **Anti-hallucination guru line**: grounded bracket-cited answers from the
  in-house KB (owner witnessed 4.4 live; 4.5.1 refusal = guard firing on a
  nonexistent clause). NO internet retrieval exists in the stack.
- **HITL approval plane**: full CARD-1..7 anatomy incl. guardrail evidence
  slots, justification flow, sealing ritual; role gating witnessed (employee
  saw read-only cards); ACC-3/9 previously closed with evidence.
- **QMS document engine (spec 40, 12/13 tasks)**: state machine live (run
  ae134c91: 12 prose / 23 honest-gaps / 1 NA in 24s), PdfRenderFn live
  (39/39 valid PDFs), ZIP export 9.2s e2e, sealing verified to the ms,
  prose golden-eval 4.530/5, 0 house-style violations over 10 manuals.
- **Forms engine (spec 41, 10/11 tasks)**: 15 templates seeded (probe: 15
  returned live), NCR = 6 sections / 35 typed fields vs CertifyAero's 30
  text inputs — with real select dispositions, relation links, SoD approval,
  NCR→M2 row creation, sealing. Internal Audit solved as a checklist
  GENERATOR over the 80-clause registry (their 407-field static form,
  outclassed). RLS load-test gate passed (p95 235-272ms).
- **Frontend**: complete wired SPA — CAPA timeline, readiness heatmap,
  typed-field forms w/ autosave + server-computed completion, generation
  view w/ live progress subscription, document viewer w/ BC-1 disclaimer +
  review/submit/export, diff views, full i18n en/es/pt (ES witnessed),
  Ask overlay everywhere. 9/28 live queries return data cleanly today.
- **Platform**: pipeline that cannot lie (fail-closed seeder, content
  deploys in all envs, smoke with teeth), audit gate with expiring
  allowlist, 1,262 hermetic tests, hash-chained audit trail.

## 2. GAP MATRIX (reality vs promise vs CertifyAero)

Classification: **DEFECT** (built, broken) · **PARKED** (missing by
unsurfaced owner decision) · **UNSTAGED** (built, never demonstrated/no
data) · **SCHEDULED** (later phase by plan) · **MISSING** (vs CertifyAero,
not yet specced).

| Surface | State | Detail |
|---|---|---|
| Command Center readiness | UNSTAGED | Panels correct; getAuditReadiness returns [] — no assessment data seeded; no zero-state UX (AUD-5) |
| Command Center HITL | DEFECT (S) | Works end-to-end; card body renders raw JSON args blob instead of structured fields (AUD-3) |
| Command Center risks/feed | UNSTAGED + DEFECT (S) | Works; polluted by ACC fixture names (AUD-4); feed empty without agent activity |
| Ask Cumplify | WORKING + DECISION | Grounded, cited, chips work; sync latency = AR sync-vs-async decision (AUD-6, owner desk since 7/19) |
| M1 register/detail | **DEFECT (P0)** | AUD-1 kills list; detail actions built; content viewer renders placeholder (getDocumentContent exists — wire it, R6); policy/scope drawers PARKED (no getPolicy/getImsScope) |
| M1 version diff | PARKED (deep) | Real diff needs draft-content persistence in agent writeback (cross-spec design, known 7/14); spec-40 docs DO have real content_ref |
| M2 register/timeline | **DEFECT (P0)** | AUD-1 kills both tabs (rows since 7/09); timeline + 4 drawers fully built |
| M3 programmes | PARKED | listAuditProgrammes/listAudits/listAuditChecklist/listAuditFindings absent from schema; write drawers exist, placeholder leaks (AUD-2); heatmap works (empty data) |
| M4 record register | PARKED + rewire | listRecords absent; spec-41's listFormRecords covers forms records — m4 tab never rewired; placeholder leaks |
| M4 calibration/trail | WORKING | Probes clean (empty data); audit-trail viewer is the app-wide provenance target |
| M4 forms engine | **DEFECT (P0)** + UNSTAGED | Catalog renders (15 templates); register dies on AUD-1 (owner saw "No records yet" — an AUD-1 error masked as empty state, AUD-9); detail form fully built |
| M5 register | WORKING + PARKED | Cross-register view probes clean; treatments listing PARKED (listRiskTreatments absent), placeholder leaks |
| QMS engine page | UNSTAGED + DEFECT (S) | Full wizard/registry/generation/viewer built; org profile never filled, zero runs; dead "Complete Profile" button; hardcoded industry taxonomy (i18n breach); export-blocked stale guard (backend now live — verify at demo) |
| Settings | WORKING (scoped) | As promised; full settings = SCHEDULED (dedicated specs) |
| Agent mutations (6× agent*) | **DEFECT (P1)** | AUD-7: wired in schema/stack, NO handler implements them — any invocation 500s. Implement or strip (owner/architect ruling) |
| Demo data / demo mode | **MISSING** | CertifyAero's demo mode (seeded full QMS) has no Cumplify equivalent; ACC fixtures pollute tenant data — needs demo-tenant-seeding spec (R2) |
| Process/turtle diagrams | MISSING (known) | CertifyAero ships 6/6; spec-40 OQ-3 explicitly deferred fast-follow |
| Custom domains | SCHEDULED | cumplify.ai wiring = pre-GA item (7/21) |

## 3. ROOT CAUSES (why the walkthrough looked like a mock)

- **RC-1 — single-point marshal gap**: `services/api/src/resolvers/shared.ts`
  unwrapField/marshalRow do no timestamp conversion; RDS Data API returns
  TIMESTAMPTZ as `YYYY-MM-DD HH:MM:SS.ffffff`; 33 fields across m1(9) m2(8)
  m3(4) m4(4) m5(1) qms(6) forms(7) ship it into AWSDateTime. Duplicate
  marshal in forms.ts:1594-1678 has the identical gap. Full field-level
  table in the API sweep (this directory).
- **RC-2 — validation method**: hermetic fixtures use ISO strings (don't
  match real DB output); lists were validated empty or below AppSync's
  serializer; Lambda-error monitoring is blind to post-resolver rejection.
- **RC-3 — reporting altitude**: spec-completion % reported as product
  completion; BLOCKED-ON-OWNER parkings never rolled up into "these pages
  cannot list data until you rule."
- **RC-4 — no demo discipline**: no seeded tenant, no staged hero demo, ACC
  fixtures share the tenant namespace with real data.
- **RC-5 — witness passes deferred**: three final ACC sessions (40-13,
  41-11, D5) all pending; the D5 script omitted the QMS page.

## 4. FINDINGS REGISTER

| ID | Sev | Finding | State |
|---|---|---|---|
| AUD-1/BUG-18 | P0 | Raw SQL timestamps → AWSDateTime, 33 fields, single-point cause | ROOT-CAUSED, fix ready to build |
| AUD-7 | P1 | 6 agent* mutations wired with no handler — 500 on invocation | NEW (API sweep) |
| AUD-2 | P1 | Dev placeholder copy in product UI (m3/m4/m5 + qms export note) | Tied to R3 rulings |
| AUD-8 | P1 | No demo/seed data discipline; hero engine never staged | R2 |
| AUD-9 | P1 | AUD-1 errors masked as empty states (forms register "No records yet") | R4 |
| AUD-3 | M | HITL card renders raw JSON args | R4 |
| AUD-4 | M | ACC fixtures pollute tenant-visible data | R2 |
| AUD-5 | M | Zero-state UX absent (readiness, feed) | R4 |
| AUD-10 | M | Dead "Complete Profile" button; hardcoded INDUSTRY_TAXONOMY + misc strings (i18n/pseudo-locale escape) | R4 |
| AUD-6 | DEC | Ask latency — AR sync-vs-async owner decision pending since 7/19 | Owner |

## 5. RE-BASELINE — ordered remediation (effort: S<1 session, M=1-2)

- **R1 (P0, S)**: timestamp conversion in shared.ts marshal + forms.ts
  duplicate (one mapper, both sites) + hermetic tests with REAL Data-API
  format fixtures + live list-with-rows probes. Un-breaks every register.
- **R2 (P0-product, M)**: demo-tenant seeding mini-spec — org profile,
  registers populated, one full generateImsManual run + export witnessed,
  ACC fixtures moved out of the demo namespace. This is "CertifyAero demo
  mode" for Cumplify.
- **R3 (P1, M, needs owner ruling first)**: read-surface completion — add
  listAuditProgrammes/listAudits/listAuditChecklist/listAuditFindings,
  listRiskTreatments, getPolicy/getImsScope; rewire m4 register tab to the
  forms/records surface; delete all placeholder copy.
- **R4 (P1, S)**: UX debt sweep — structured HITL card body, error≠empty
  states, zero-states, dead button, hardcoded strings.
- **R5 (P1, S, ruling)**: agent* mutations — implement against the real
  writeback path or strip from schema.
- **R6 (P2)**: M1 content viewer wiring; draft-content persistence design
  (cross-spec); process diagrams (OQ-3); AR latency decision; next@16.
- **R7 (the payoff)**: ONE combined owner witness session on the seeded
  tenant — spec-40 ACC, spec-41 ACC, frontend D5 rerun, hero demo
  (click → manual → export ZIP). Scheduled after R1+R2 land.

Sequence R1→R2→(R3∥R4∥R5)→R7. Estimated wall-clock to R7: 3-5 working days
at current cadence. R6 rides behind.

## 6. OWNER DECISIONS NEEDED (blocking specific rows above)

1. Approve R1 fix now (P0, surgical).
2. R3 read-surface ruling: build the six missing queries as specced?
3. R5: agent* mutations — implement or strip?
4. AR latency sync-vs-async (AUD-6 — you have now felt it).
5. Schedule R7 witness session once R1+R2 report done.
