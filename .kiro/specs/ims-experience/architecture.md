# ARCHITECTURE — Cumplify: the Living Agentic IMS
### Build authority for Claude (architect) + Kiro. Step 0 persists this file to `.kiro/specs/ims-experience/architecture.md`.

## 1. Context (owner directives, locked 2026-07-21)

1. Solve the END USER's pain points — quality / EHS / safety managers running
   ISO 9001/14001/45001 at SMBs.
2. CertifyAero = CONCEPT starting point only (one-button manual, clause-tagged
   forms, readiness, complete first session) — improved into an agentic SaaS
   for IMS. NOT its frontend UI.
3. UI authority = OUR FRAMER DESIGN SOURCE (Spora tokens, steering,
   view-designs.md). "Full CertifyAero look" is DEAD.
4. Reuse the v7 commercial plane: billing, credits/tokens, consultant
   affiliate program — never reinvent (§9 restores it in full).
5. Pack as many manual point-solutions as possible into ONE living agentic SaaS.
6. Cover the ISO MUST-have workflows (records, audits, settings/user admin,
   role + records-approval matrices) as machine-readable contracts AGENTS act on.
7. The agentic Lead Auditor conducts internal audits and its findings CREATE
   NCs/CAPAs automatically.

Grounding: 3 sourced research reports this session (pain points ×12, category
map ×12, commercial-plane inventory) + the v7 agent catalog
(`docs/architecture/agent-catalog.md`) re-read this session.

## 2. Thesis

An SMB pursuing tri-standard IMS buys **~8–11 tools + a consultant
($20k–$75k yr-1, $15k–$60k/yr after)**. Template packs sell dead documents;
eQMS suites (Effivity→MasterControl) sell empty systems whose #1 complaints
are setup burden, vendor-locked config, and silo modules; consultants
($5k–$20k) leave systems "built to pass, not built to last." Nobody
generates AND operates. The tri-standard SMB agentic lane is open (LuMay
skews FDA; CertifyAero has zero market footprint — concept donor only).

**Cumplify = template pack + eQMS + consultant labor collapsed into a
22-agent roster that GENERATES the IMS, OPERATES the registers, CONDUCTS the
audits, DRAFTS the CAPAs, ASSEMBLES management review** — humans approve.
DAU metric = the approval queue.

## 3. The agent operating system (bound to `docs/architecture/agent-catalog.md`)

**Topology (catalog, verbatim):** ControlTower (Nova Pro) is the multi-agent
SUPERVISOR owning cross-standard governance (4.4/5.1/5.3) and routing;
ComplianceCopilot routes user advisory to the 3 Domain Gurus. Model policy =
Part 30 Nova ladder (LegalLedger = the one Sonnet exception, quarterly
re-justified via the Model Justification Register + eval gate).

**BUILT today (agents-existing-8):** ControlTower, DocStudio (M1),
**LeadAuditor (M3)**, CAPAGuru (M2), RecordsVault (M4/M13), ISO 9001/14001/
45001 Gurus. **CATALOGED, build-next:** NCTriage, IncidentInvestigator,
RiskSentinel, HazardScout, AspectWarden, ReviewOrchestrator,
ComplianceCopilot, LegalLedger, ObjectiveTracker, ContextCartographer,
SupplierScout, CompetenceKeeper, EmergencyPlanner, WorkerVoice.

**The wired chains (catalog §handoffs — this IS the living ecosystem):**
- **`LeadAuditor → findings → CAPAGuru`**: LeadAuditor triggers on the audit
  programme calendar (EventBridge cron) or user launch; fans out checklist
  generation per clause/standard (ISO-KB + TENANT-DOCS-KB); conducts;
  `audit-finding-write` records findings + readiness to RDS and **emits
  finding events → CAPAGuru opens the NC/CAPA (root cause, owner, due) →
  RecordsVault seals evidence**. HITL: auditor/QM approval via returnControl
  before any record-of-truth write. ← owner requirement #7: BUILT at the
  agent layer; this architecture surfaces it (P3 cockpit).
- `NCTriage → CAPAGuru → RecordsVault` (intake → corrective action → seal).
- `HazardScout → RiskSentinel → CAPAGuru`; `AspectWarden → RiskSentinel`.
- `ReviewOrchestrator` fan-out/gather of all 9.3.2 management-review inputs.

**The agents' writeback doors:** the six schema-wired `agent*` mutations
with no handler (AUD-7) are the app-plane writeback path. Ruling flips:
**IMPLEMENT per agents-existing-8 REQ-WB** (agentAssessRisk, agentTriageNC
scope per its F-4 note), not strip.

**The living-ecosystem rule:** every governance matrix in §4/§7/§8 is
machine-readable state agents act on — overdue programme entry → LeadAuditor
schedules + drafts; retention expiry → RecordsVault disposition task;
unassigned role → readiness gap; every matrix change → audit event. The
matrices are the agents' operating contracts, not settings pages.

## 4. ISO shall-requirement coverage matrix (MUST-have workflows × agent × surface)

Status: A-BUILT = agent live; A-CAT = cataloged, build-next; ENG-BUILT =
non-agent engine live; PARTIAL = backend yes/surface no; ROADMAP = honest gap.

| Clause(s) | Mandatory workflow | Agent (catalog) | Status | Surface / phase |
|---|---|---|---|---|
| 4.1–4.3 | Context, interested parties, scope | ContextCartographer | A-CAT; docs ENG-BUILT (spec-40) | `/setup` P1, `/manual` P2 |
| 4.4, 5.1, 5.3 | Process map; leadership; roles assigned+communicated | ControlTower | A-BUILT; Part-13 matrix enforced in `role-matrix.ts`; no surface | diagrams P4; `/settings/roles` P5 |
| 5.2 | Policy controlled + communicated | DocStudio | A-BUILT + spec-40 | `/manual` `/documents` P2 |
| 5.4 Δ45001 | Worker consultation & participation | WorkerVoice | A-CAT; unlimited Worker seats in card | P5 roles + roadmap |
| 6.1 (Δaspects/Δhazards) | Risk & opportunity register | RiskSentinel + HazardScout + AspectWarden | A-CAT; M5 register works | `/risk` P1; agents P7 |
| 6.1.3/9.1.2 Δ | Compliance obligations register + evaluation | LegalLedger (Sonnet, justified) | A-CAT | ROADMAP spec (owner: sequence, §11) |
| 6.2 | Objectives + plans + tracking | ObjectiveTracker | A-CAT; objectives doc generated | `/analytics` + 9.3 pack P4 |
| 7.1.5 | Calibration / measurement resources | RecordsVault | A-BUILT; M4 probes clean | `/records` P4 |
| 7.2/7.3 | Competence, training, awareness | CompetenceKeeper | A-CAT (M13 + DC-4 launch req) | ROADMAP spec |
| 7.5.2 | Doc/record review & APPROVAL before use | DocStudio + HITL plane | ENG-BUILT; routing not tenant-config | §8 approval matrix → `/settings/approvals` P5 |
| 7.5.3 | Records control: availability, protection, retention, disposition | RecordsVault | A-BUILT; `RetentionPolicy` in schema; no surface | §7 `/records` P4 + retention editor P5 |
| 8.2 Δ | Emergency preparedness & response | EmergencyPlanner | A-CAT; forms lane | `/forms` P3; agent P7 |
| 8.4 | Supplier control / approved vendors | SupplierScout | A-CAT | ROADMAP spec |
| 8.7 + 10.2 | Nonconformity control + corrective action | CAPAGuru (+NCTriage) | **A-BUILT** + spec-41 NCR→M2 | `/forms` P3, CAPA Studio P4 |
| 9.1 | Monitoring, measurement, analysis | ObjectiveTracker | A-CAT | `/analytics` P4 |
| **9.2** | **Internal audit: programme→schedule→independence→conduct→findings→CA→records** | **LeadAuditor** | **A-BUILT incl. finding→CAPA event chain**; m3 read surfaces absent | **Audit Studio `/audits` P3** |
| 9.3 | Management review, mandated inputs/outputs | ReviewOrchestrator | A-CAT; derive data exists | `/management-review` P4 |
| 10.2 Δ45001 | Incident investigation + worker reporting | IncidentInvestigator (+NCTriage) | A-CAT; incident forms + role rights BUILT | `/forms` P3; agent P7 |
| 7.5/9.2 access | Certification-body evidence access | — (guest seat) | DESIGNED (free time-boxed External-Auditor seat, Part 14/v7:695) | `/settings/users` P5 |

## 5. Benchmark feature integration matrix (market leaders + CertifyAero → this system)

| Benchmark feature (who) | Agentic integration | Where |
|---|---|---|
| One-click full manual, 69 sections/36 docs (CertifyAero) | spec-40 engine BUILT (24s run, honest gaps, 4.53/5) — surfaced as ONE button | `/manual` P2 |
| White controlled docs, CONTROLLED stamp + doc-info block (CertifyAero) | vendored pdf-export template → ControlledDocViewer (white paper in dark Framer chrome) | P2 |
| Cross-reference / correlation matrix (CertifyAero) | CORRELATION_MATRIX JSON → interactive grid, click-through to clause docs | `/cross-reference` P2 |
| Clause-tagged forms catalog "Clause X.Y • N fields" (CertifyAero) | spec-41: 15 templates, typed fields, SoD, sealing — catalog front-and-center | `/forms` P3 |
| 407-field static Internal Audit form (CertifyAero) | OUTCLASSED: LeadAuditor generates the checklist scoped to audit + standard, then conducts | Audit Studio P3 |
| Stage 1/2 readiness checklist, CRITICAL tags (CertifyAero) | live checklist over real queries + agent-drafted fixes per gap | `/audit-readiness` P3 |
| 6/6 process/turtle diagrams (CertifyAero) | pure-SVG from org profile; turtle nodes deep-link to LIVE registers (Part 19 Exceed) | dashboard P4 |
| Register CSV/PDF export (CertifyAero) | shared register-export util; ZIP evidence pack BUILT (9.2s) | P2–P4 |
| Demo mode (CertifyAero) | REPLACED by **FREEMIUM** (§9.3: card-on-file at signup, NO document downloads/exports — abuse control) + Snapshot funnel; never fabricated data (BC-3) | §9.3 / P7 |
| Audit scheduling/workflow (AuditBoard, Ideagen) | **AUDIT STUDIO**: ISO-shall audit calendar + the agentic lead auditor RUNS the scheduled audit (EventBridge cron → LeadAuditor conducts → findings → auto-CAPA) | Audit Studio P3 |
| Mobile/field checklist execution, offline (iAuditor) | responsive execution view now; offline PWA = ROADMAP | Audit Studio P3 |
| Engineering problem-solving CAPA (ETQ/Intellect 8D toolkits) | **CAPA STUDIO**: 8D, 5-Why, Fishbone/Ishikawa, FMEA, A3 — CAPAGuru drafts the analysis, human validates | CAPA Studio P4 |
| Advanced doc editing (Qualio's "atrocious" editor is the #1 gripe) | **DOCUMENT STUDIO**: Tiptap MS-Office-grade editor — tracked changes, comments, tables — with Mermaid/tldraw diagrams embedded in controlled docs | Document Studio P2 |
| Doc review/approval workflows + periodic review reminders (Qualio, MasterControl) | DocStudio agent drafts revisions; approval matrix routes; agent nags overdue reviews | P2/P5 |
| Training-on-doc-change read-acknowledgment (Qualio) | DC-4 + CompetenceKeeper | ROADMAP spec |
| Linked records across 28 modules (QT9 — "daisy-chain" gripe) | ONE data plane; ProvenanceLink everywhere; agent chains link records at creation | app-wide |
| Configurable workflows without vendor (ETQ/Effivity gripe "contact vendor to change") | tenant-editable approval/retention/role matrices — config IS self-serve | P5 |
| Incident intake + investigation (Intelex, VelocityEHS) | typed forms → NCTriage → IncidentInvestigator → CAPAGuru chain | P3, agents P7 |
| Calibration schedule/recall (GageList, GAGEtrak) | M4 BUILT + RecordsVault recall/disposition tasks | `/records` P4 |
| KPI/objectives dashboards (BSC Designer; Excel today) | ObjectiveTracker + ReviewOrchestrator assemble the 9.3 pack; StatTile analytics | P4 |
| Risk registers/heatmaps (LogicManager) | RiskSentinel populates from context; M5 register | P1/P7 |
| Guided setup wizard + toolkit (Advisera/Conformio) | `/setup` wizard → generation; Snapshot funnel S0–S5 for signups | P1/P7 |
| QHSE all-in-one bundle (Effivity/Mango — weak multi-site, dated UX) | whole IA, Framer UI, tri-standard toggle; multi-site = Enterprise tier | all |
| Agentic claims (LuMay, CQ.AI) | full roster + HITL + AR guardrails + hash-chained WORM trail + grounded citations — provable, sealed, tri-standard | all |

## 6. Pain → replacement map

| # | Practitioner pain (sourced) | Replaces | Agentic answer | Surface |
|---|---|---|---|---|
| 1 | Audit-prep panic, evidence scrambling | Audit mgmt tools | continuous readiness; gaps → agent-drafted fixes in queue | `/audit-readiness` |
| 2 | Word `_FINAL_v3` chaos | Doc control + template packs | one-button clause-mapped controlled manual, sealed versions | `/manual` `/documents` |
| 3 | Maintenance treadmill | Mgmt-review/KPI tooling | agents run recurring machinery; human approves | `/management-review`, Command Center |
| 4 | Solo operator wearing every hat | (headcount) | work-queue home; system runs itself | Command Center |
| 5 | Enterprise-priced, opaque eQMS | the stack's price tag | §9 pricing: $449/$949/$2,250 + packs; metering BUILT | Settings → Billing (P7) |
| 6 | Silo modules | every point-tool boundary | one data plane, provenance links | app-wide |
| 7 | 2nd/3rd standard triples work (30-40% cost) | separate QMS/EMS/OHSMS | shared clauses once; global StandardSwitch | shell |
| 8 | Incidents/CAPAs fall through cracks | EHS incident + CAPA tools | forms → NCTriage → CAPAGuru chain, sealed | `/forms` `/capa` |
| 9 | Training spreadsheet rot | training trackers | CompetenceKeeper + DC-4 | ROADMAP |
| 10 | Consultants leave unmaintainable systems | consultant labor | Snapshot→seeded system; consultants become CHANNEL (§9.4) | `/setup`; portal P7 |
| 11 | Tender pressure to certify fast | (time) | readiness % + evidence ZIP + auditor guest seat | `/manual` `/audit-readiness` |
| 12 | Over-documentation collapse | doc bloat | generate only required docs; honest gaps (BC-3) | everywhere |

Roadmap hooks from research: built-to-pass DRIFT watchdog (agents diff
registers vs docs), `/analytics` v2 reporting, zero-admin ethos via Ask.

## 7. Records management & controlled-information architecture (7.5 + Part 18)

The eQMS backbone every module writes into — **binding requirements, not
features** (v7 Part 18: DC-1..DC-8 document controls, ES-1..ES-5
Part-11-grade e-signatures; "no launch phase completes while any Match cell
is open" per Part 19).

- **Controlled-document lifecycle (7.5.2, DC-class):** draft (DocStudio or
  human) → review → APPROVE (matrix-routed, §8) → publish (controlled copy,
  stamp + doc-info block) → periodic review (agent-nagged) → revise
  (versioned; diff) → obsolete (superseded copies can't be used). Generated
  docs carry clause mappings (`Document.clauseRefs`) and honest GAP blocks.
- **Mandatory identification block — EVERY controlled render (7.5.2 shall:
  identification & description):** header/footer on every controlled
  document AND record PDF (manual sections, form records, audit reports,
  CAPA exports, register exports) carrying: document code/ID, title,
  revision/version, effective date, approved-by + approval date, page X of
  Y, CONTROLLED-COPY stamp (uncontrolled-when-printed notice), retention
  class, and standard/clause reference. One shared template layer (the
  vendored `template.ts`) renders it everywhere — no PDF ships without the
  block; pinned by a hermetic render test.
- **Records register (7.5.3):** unified view of form records + module
  records; every record shows: approval state, sealed/WORM indicator,
  retention class, computed disposition date. Calibration records (7.1.5)
  live here. Surface: `/records` P4.
- **Retention & disposition (DC-7):** retention schedule per record class —
  `RetentionPolicy` type + `createRetentionPolicy` ALREADY IN SCHEMA (add
  list/update); disposition queue = RecordsVault agent drafts disposition
  tasks on expiry into the approval queue; disposition itself is logged.
  **Legal hold** (Part 14 Data & Retention): freezes disposition for
  litigation; release resumes the job. Editor surface: `/settings/retention`
  P5. Export-bundle generator (all registers + trail JSON + evidence
  manifest) = the tenant-offboarding and auditor-evidence artifact.
- **Immutability (ES-4, exceeded):** append-only audit trail — IAM
  append-only + hash chain + S3 Object Lock COMPLIANCE (not even root);
  attributed per user/agent (`actor=partner:<id>` class tags included);
  retained ≥ record retention. ES-5: human-readable + electronic copies
  producible on demand (trail export + record bundles).
- **DC-4 (launch requirement per design):** read-acknowledgment + training
  linkage on controlled-doc publication — CompetenceKeeper lane, own ROADMAP
  spec, honestly absent until built.
- **Tenant data lifecycle (v7 6.2):** TRIAL → ACTIVE_PAID → PAST_DUE (grace
  14d, read-only after 7) → SUSPENDED (read-only) → PENDING_DELETE (30d) →
  PURGED (RDS rows, DDB partition, TENANT-DOCS-KB, Redis, non-WORM S3);
  WORM archives persist through Object Lock periods BY DESIGN (disclosed in
  ToS); export bundle offered before purge.

## 8. Approval & SoD architecture (7.5.2 + Part 13 — approvals per the ISO standards)

- **Role matrix (5.3) — BUILT:** `services/api/src/permissions/role-matrix.ts`
  = Part 13's 12 roles × module write permissions (write ⇒ may approve in
  that module), Cognito-group-wired. Hard SoD rules enforced in the approval
  Lambda, NOT configurable: author ≠ approver (per-artifact);
  auditor-independence (Internal Auditor cannot audit modules where they
  hold write); incident-investigator ≠ area supervisor. P5 surfaces the
  matrix at `/settings/roles` + SoD rules view; EXPORT as a controlled
  Responsibilities & Authorities document (itself an ISO 5.3 artifact,
  rendered via ControlledDocViewer).
- **Records-approval matrix (NEW — the tenant-configurable layer):** per
  doc/record type → required reviewer/approver ROLES + sequence
  (e.g. Quality Manual: QM review → Top Management approve; NCR: QM;
  incident: EHS Manager). Seeded from Part-13 defaults; tenant-editable at
  `/settings/approvals` P5; **DRIVES HITL routing** (the approval Lambda
  reads it); the hard SoD rules above sit BENEATH any tenant config and can
  never be configured away — pinned by hermetic tests. SDL tenant-scoped,
  SCHEMA-5 (no tenantId in inputs). Every matrix change = audit event.
- **HITL approval plane — BUILT:** CARD-1..7 anatomy, guardrail evidence
  slots, justification flow, sealing ritual, role gating witnessed. All
  agent record-of-truth writes pass through it (returnControl). P3 promotes
  it to `/ai-review` with structured cards (fix AUD-3).
- **E-signatures (ES-1..5, Part 18.2):** Part-11-grade signature manifest on
  approvals/seals — signer identity, meaning of signature, timestamp, bound
  to the record; trail per ES-4 above.
- **Audit programme contract (9.2):** RDS entries via LeadAuditor's
  `audit-programme` tool; the EventBridge calendar IS the agent's trigger;
  auditor assignment validated against the role matrix (independence).
- **Identity topology (Part 32) — the multi-tenant frame:** Pool A
  `cumplify-internal` (staff; separate admin plane `admin.cumplify.ai`;
  tenant data only via time-boxed, ticketed, tenant-notified break-glass —
  every second in the trail); Pool B `cumplify-tenant-admin` (roles #1–5;
  full Settings incl. Billing/Users/Security); Pool C `cumplify-tenant-user`
  (roles #6–12 incl. External-Auditor guest + Partner Consultant).
  Never-cross enforced at token (issuer pinned per surface), claim
  (`poolClass`), and IAM layers. External-Auditor guest seat: FREE,
  time-boxed 30 days, read-only, every view logged, magic-link + MFA — the
  certification-audit sales weapon.

## 9. The SaaS commercial plane (v7 Parts 7/16/17/22/29/43/44 — REUSED, not reinvented)

### 9.1 Pricing — benchmarked ONLINE against Vanta-class compliance SaaS (sourced, 2026-07-21)

**The category comps (procurement data, not sticker pages):**

| Comparable | Entry | Median/typical ACV | Packaging | Source |
|---|---|---|---|---|
| **Vanta** | ~$10–12K/yr (1 framework, <50 emp) | **$20K median** (Vendr, 369 deals; buyers negotiate ~30% off) | employee bands × frameworks; **+~$5K per added framework** | vendr.com/marketplace/vanta; costbench.com |
| **Drata** | $7.5–15K/yr | **$25K median** (Vendr) | headcount bands + framework count; NOT per-seat | vendr.com/marketplace/drata |
| **Secureframe** | ~$7.5K/yr | **$20K avg** | +~$7.5K per added framework | vendr.com/marketplace/secureframe |
| **Sprinto** | $6–8K/yr | **$15K median** | base + frameworks as % uplift | soc2compliancecost.com/sprinto-cost |
| **Thoropass** (audit bundled) | $8.7K platform | **~$30.7K all-in**; 2-framework $35–50K | per-framework + bundled audit | vendr.com/marketplace/thoropass |
| **AuditBoard** | $30–50K | **$40–150K/yr** | modules + users, enterprise | vendr.com/marketplace/auditboard |
| **MasterControl** (eQMS ceiling) | $25K floor | $25–100K+ | modules + users | itqlick.com |
| eQMS floor (Effivity/Isolocity/Conformio) | $1.2–3.6K/yr | — | per-user or flat | public pages |
| **Displaced spend anchor** | — | **$15–60K/yr recurring; $20–75K yr-1** | 8–11 tools + consultant | category-map report |

**Category packaging laws (evidence):** (1) **employee bands × standards
count — never per-seat**; (2) added frameworks are a discrete declining
add-on (+$5–7.5K); (3) **annual-only is the norm** (monthly is penalized
15–25%); (4) pricing is quote-gated everywhere → **transparent public
pricing is a live differentiator**; (5) list prices carry ~30% negotiation
headroom.

**Why the v7 card ($449/$949) is wrong:** it prices an agentic tri-standard
platform BELOW single-framework storage tools (Vanta Core $10–12K does ONE
framework and no labor), and hands the full 22-agent roster to the mid tier
so Enterprise sells only IT checkboxes. Agents are the value axis → agent
depth is the fence; standards count + employee band is the scale axis.

**Card v4 (owner-approved structure & points 2026-07-21; all tiers offer
monthly OR annual with the annual discount). Fence = GENERATE → OPERATE →
GOVERN.**

| Tier | Monthly | Annual (≈−15%) | Standards / band | Agent-class fence | Credits/mo |
|---|---|---|---|---|---|
| **Freemium** | **$0 — card on file required** | — | any 1 · ≤50 emp | GENERATE preview: on-screen manual/docs/readiness only. **NO downloads or exports of any document** (abuse control); hard credit ceiling (the one hard-block tier, consistent with F-6) | 5k one-time |
| Launch | **$749/mo** | **$7,500/yr** | any 1 · ≤50 emp | **GENERATE**: DocStudio + Document Studio editor, Domain Gurus, manual + export, forms, readiness | 40k |
| IMS Pro ⭐ | **$2,350/mo** | **$24,000/yr** | all 3 · ≤200 emp | + **OPERATE**: Audit Studio (LeadAuditor runs scheduled audits), CAPA Studio (CAPAGuru engineering toolkit), NCTriage/IncidentInvestigator, RecordsVault, ReviewOrchestrator, bulk migration + AI clause mapping, Trust Center, partner collab | 150k |
| Enterprise | **$4,700/mo** | **from $48,000/yr** (3–5% escalator) | all 3 + multi-site · 200+ emp | + **GOVERN**: LegalLedger compliance-obligations agent, multi-site rollups, validation pack, attestation report, priority inference | 400k base |

- **Corridor fit (agent's synthesis):** entry $6–10K ✓ ($7.5K = Drata/
  Secureframe entry parity, for a product that WORKS the system, not stores
  it); mid $18–30K ✓ ($24K = Vanta/Drata median, vs Thoropass $35–50K for
  two frameworks of storage+audit); enterprise $40–75K ✓ (from $48K = ⅓ of
  AuditBoard's top, ½ of MasterControl's ceiling, vs Intelex $100–500K).
- Add-ons: +standard on Launch **$5,000/yr** (Vanta-parity); +site
  $1,800/yr; band uplifts published. **Seats are UNLIMITED within the
  employee band** (category norm; per-user pricing is the incumbents' #1
  review complaint; 45001 5.4 worker participation is never a paywall). The
  v7 $29/seat add-on dies.
- Credit grants raised with price (40k/150k/400k) — still within the
  AI-COGS ≤9% rule (150k credits ≈ $150/mo COGS on $2,000/mo). Packs
  25k=$99 / 100k=$349 (71–75% margin) + F-6 serve-and-bill unchanged.
- Transparency wedge kept: public list prices, no quote gate below
  Enterprise; every tier page cites "replaces N tools + $X consultant
  spend" (sourced).
- **Freemium replaces demo mode AND the Part-29 trial as top-of-funnel
  (owner ruling)**: card required at signup (fraud/abuse filter + instant
  conversion path), on-screen value only, zero export rights until paid,
  Snapshot funnel feeds it; upgrade unlocks downloads retroactively (docs
  already generated). `trial.credits.purchased`-class conversion telemetry
  carries over as `freemium.*` events.
- Ruled 2026-07-21: encode card v4 in AR plan-entitlements policy, Stripe
  catalog, and marketplace dimensions (§9.5) during P7.

### 9.2 Credits / token system (Part 22) — **BUILT**
`credits = Σ(input×w_in + cache_read×w_cache + output×w_out)` per model
(`MODELWEIGHT#` items; 1,000 credits ≈ $1 raw Bedrock; included AI-COGS ≤ 9%
of plan price). Implemented in `services/ai-invoker/src/metering.ts`
(computeCredits, loadWeights, atomic incrementMeter on
`TENANT#<id>#METER/MONTH#<yyyymm>`, `emitCreditsTelemetry` →
`telemetry.credits.consumed` on EventBridge, wired at 8 call sites) and
`credit-precheck.ts` — **F-6 OWNER-RESOLVED serve-and-bill**: Enterprise
never blocks; PAYG serves overage and the telemetry event is the billing
signal; only Trial/Launch-without-paygo hard-block at ceiling; safety flows
(incident reporting, HITL approvals) NEVER block. **Remaining build (pre-GA,
flagged since 7/08): the billing CONSUMER** — Firehose→S3→Athena pipe +
monthly close → Stripe metered billing push.

### 9.3 Stripe billing & entitlements (Part 7) — designed, build P7
Stripe Checkout → webhook verifier → ENTITLEMENT writer
(`TENANT#<id>#ENTITLEMENT`: plan/limits/CREDIT_LIMIT) → authorizer stamps
claims (today's static P1 stamp becomes subscription-driven). Dunning ladder
→ tenant lifecycle states (§7). **Top-of-funnel = FREEMIUM (owner ruling
2026-07-21, supersedes Part 29's 14-day trial)**: card on file at signup,
GENERATE-preview scope, NO downloads/exports, 5k one-time credits (hard
ceiling — the only hard-block tier); in-freemium credit-pack purchase or
export attempt = the conversion signals (`freemium.pack.purchased`,
`freemium.export.blocked` → upgrade prompt); click-to-cancel posture
unchanged (one click, Settings → Billing).

### 9.4 Consultant partner program — v7 Part 16 commissions REJECTED (owner 2026-07-21), re-benchmarked online

**Owner ruling: 10% is the HARD ceiling.** The v7 design (25% recurring
months 1–12 → 10% LIFETIME tail) is dead. The market evidence says the
owner is right:
- **The compliance-SaaS leaders pay no fat recurring commission at all**:
  Vanta pays a **$500 flat referral bounty** (help.vanta.com referral
  program); Secureframe **$500** (secureframe.com/referral-terms); Drata/
  Sprinto gate their %, publish none. Their consultant/MSP channels run on
  **reseller margin + enablement + the partner's OWN services revenue**
  (vanta.com/partners/service-providers, drata.com/partners).
- **High-ACV norm**: aggregate 20–30% affiliate rates are low-ACV self-serve
  numbers (PartnerStack avg 23.5%); for $10K+ consultative B2B the norm
  drops to **10–20%, trending one-time** (getreditus.com, track360.io);
  healthy affiliate cost ratio = **8–12% of affiliate-sourced revenue**.
- **AE parity**: a quota-carrying SaaS Account Executive earns ~**8–10% of
  first-year ACV** (ICONIQ 2025 via quotapath.com). A referral partner who
  makes an intro cannot out-earn the closer.
- **Lifetime tails are the poison**: unbounded liability concentrated on
  your best-retained cohorts; fraud becomes an annuity; the market converged
  on 12-month caps (track360.io recurring-commission economics).

**Commission card (OWNER-RULED 2026-07-21 — Track 1, single model):**
- **Annual-plan referral: 10% of the first-year contract, paid ONE-TIME**
  (on cleared payment, after the 45-day hold). $24K IMS-Pro deal → $2,400 —
  ~5× Vanta's $500 bounty, bounded and forecastable.
- **Monthly-plan referral: 8% of each monthly payment, recurring** while
  the referred subscription stays active (naturally self-limiting: monthly
  plans carry the ~15% price premium, and conversion to annual converts the
  stream to the one-time rail at that point).
- **All payouts through Stripe** (Stripe Connect transfers, monthly cycle,
  1099 export). 90-day cookie, clawback on refund/chargeback. Freemium
  signups attribute on first PAID conversion, not on signup.
- Implementation partners earn the SAME Track-1 commission — their upside
  is the category-standard NON-CASH stack: free Partner Consultant seat,
  **multi-client Partner Portal (portal.cumplify.ai)** — per-client
  readiness, authorized HITL queues, commission dashboard — co-branded
  Snapshot links, directory listing that routes them leads,
  enablement/certification, co-sell — and **100% of their own readiness /
  gap-assessment / internal-audit services revenue** on top of our
  platform. That services layer is where ISO consultants actually earn; the
  platform is their wedge, our channel.

Unchanged architecture: partner identity = 4th trust boundary on the
EXISTING 3-pool topology (no 4th pool): `PARTNER#<id>` items + consent-gated
cross-tenant access (tenant admin grants role until date → CONSENT item +
audit event; token carries `{tenantId, role, grantExpiry}`; auto-revoke on
expiry; every partner action tagged `actor=partner:<id>` in the trail).
CPPO (Part 43.2): qualifying partners resell via AWS Marketplace private
offers — one compensation rail per deal (CPPO XOR referral/margin). This
turns pain #10's consultant from cost into CHANNEL — at a payout the P&L
survives.

### 9.5 Marketplace & public API (Parts 43/44/24) — designed, post-P7
AWS Marketplace contract-with-consumption listing at **price parity with
card v4** (owner ruling: marketplace matches the direct prices —
`launch-tier` $7,500/yr, `imspro-tier` $24,000/yr, Enterprise via Private
Offers from $48,000/yr, metered `ai-credits-1k` $3.96; parity-in-CI rule
stands); dual-rail
entitlement (`rail = stripe | marketplace`, one writer each, rail-agnostic
readers); ResolveCustomer/GetEntitlements/BatchMeterUsage hourly meter.
Public API (Part 24): entitlement-gated, plan-tiered rate limits
(60/300/contracted rpm), OAuth2 + scoped keys, webhooks-out. Settings →
Billing surface (Part 14): credits meter, invoices, one-click cancel.

## 10. UI law

Authority: Framer design source — `frontend/src/tokens/design-tokens.ts`
(Spora Layer-1 verbatim + semantic Layer-2), `.kiro/steering/` Framer rules,
view-designs.md extended per new view BEFORE build. **No CertifyAero
pixels/fonts/colors.** New shared components (StatTile, GuidanceBanner,
ReadyPill, Ask trigger) styled exclusively from existing tokens. DESIGN
GATES compare against view-designs.md + tokens, never competitor crops.
IA: Command Center / DOCUMENTS: `/manual` `/documents` `/forms`
`/cross-reference` `/guide` / AUDIT & READINESS: `/audit-readiness`
`/audits` `/ai-review` `/activity` `/analytics` / OPERATIONS: `/capa`
`/risk` `/records` `/management-review` / ADMIN: `/settings` `/setup`.
Old `/m1..m5` `/qms` → client-redirect stubs (static export — no server
redirects). i18n en/es/pt same-commit (Part 31: agent outputs in the USER's
locale; documents in the TENANT's document locale).

## 11. Build phases (checkpoints = screenshot pack + live owner walk)

**P0 — Prerequisites (1 session, architect; blocks all)**
Persist this file → `.kiro/specs/ims-experience/architecture.md` + the 3
research reports → `.kiro/evidence/product-thesis/`. AUD-1 fix:
`sqlTimestampToIso()` in `shared.ts` marshal (~:351/:373) + `forms.ts`
duplicate (~:1594-1678) → shared import; hermetic tests with REAL Data-API
fixtures; error≠empty sweep (AUD-9); live list-with-rows probes.

**P1 — Foundation + IA (2 sessions, Kiro ∥ architect)**
nav-config extraction + §10 IA + redirect stubs; StandardSwitch scope
context (pain 7); shared components from tokens. **Migration law (added
after P1 finding F-P1-1): a route in the live nav must ALWAYS land on a
WORKING surface. Renamed routes redirect NEW→OLD (interim) and the
direction flips only when the absorbing view passes its design gate; old
implementations are never deleted before absorption.** ∥ Architect read-surface
spec: `Document.clauseRefs`, `listAuditEvents`, **m3 audit quartet REQUIRED**
(programmes/audits/checklist/findings), records-register read (M4 rewire +
`listFormRecords`), `listRetentionPolicies`, approval-matrix SDL, **agent
writeback handlers (AUD-7 → REQ-WB implement)**. Defer only:
listRiskTreatments, getPolicy/getImsScope (owner ruling). **CHECKPOINT A.**

**P2 — DOCUMENT STUDIO: generate + edit the manual (3-4 sessions)** — kills
doc-control + template packs; clauses 4.1–4.3, 5.2, 7.5. `/manual`
(profile→ONE Generate→live progress→StatTiles + white ControlledDocViewer +
Export ZIP); vendored `template.ts` + §7 identification-block enforcement +
parity drift test; `/documents` clause-family browser + M1 absorb (wire
`getDocumentContent`); **Document Studio editor: Tiptap MS-Office-grade
editing on controlled docs — tracked changes, comments, tables — with
Mermaid + tldraw diagrams embedded (Part 15.1); edits are drafts that flow
through the §8 approval matrix before publication (DocStudio agent proposes,
human edits, matrix approves)**; `/cross-reference` grid; `/guide` 80-row
registry. **CHECKPOINT B — hero demo.**

**P3 — Operate: forms, incidents, AUDIT STUDIO (2-3 sessions)** — clauses
8.7/10.2, 8.2, 9.2. `/forms` catalog + typed FormField extraction.
**AUDIT STUDIO (`/audits`) — the agentic lead auditor RUNS scheduled
audits**: (a) the **audit calendar per ISO shalls** — annual programme with
per-standard clause coverage, frequency, criteria/scope per audit (9.2.2),
rendered as a live calendar whose entries ARE the agent's EventBridge cron
triggers; (b) **scheduled run**: when an entry comes due, LeadAuditor
launches unattended — checklist fan-out scoped to the audit's
clauses/standard → KB-grounded evidence examination across live registers →
drafted conform/NC/observation per item — and files the draft audit into
the approval queue (human lead auditor reviews/countersigns via HITL);
(c) on approval, `audit-finding-write` → **finding events auto-open CAPAs
(CAPAGuru) → RecordsVault seals**; (d) audit report as controlled doc with
§7 identification block; (e) auditor-independence enforced from the role
matrix; manual launch + responsive field-execution view for human-led
audits; absorbs M3 drawers/heatmap. `/audit-readiness` Stage 1/2 checklist
(live programme state included); `/activity` ledger; `/ai-review`
structured HITL page (FIX AUD-3). **CHECKPOINT C.**

**P4 — CAPA Studio + records + management review + dashboard (3 sessions)**
— clauses 8.7/10.2 depth, 7.5.3, 7.1.5, 9.1, 9.3, 4.4. **CAPA STUDIO
(`/capa`) — engineering problem-solving with AI heavy-lifting (Part 15
toolkit, owner-mandated)**: 8D report builder, 5-Why chains,
Fishbone/Ishikawa, FMEA worksheets (S×O×D scoring), A3 — for each,
**CAPAGuru drafts the analysis from the NC/incident/finding context**
(candidate root-cause chains, fishbone categories populated from register
data, draft 8D steps) and the human validates/edits; effectiveness
verification must cite the methodology artifact; every artifact exports as
a controlled record with the §7 identification block; timeline + aging/
escalation view. `/records` per §7 (register, approval state, retention
class + disposition date, WORM indicator, calibration, disposition queue);
`/management-review` (9.3 pack from live queries v1, ReviewOrchestrator
takes over in P7 — export as controlled doc); dashboard rework (diagrams
deep-linking to live registers); `/analytics` v1; AUD-2/5/10 sweep.
**CHECKPOINT D.**

**P5 — Governance & administration (2 sessions)** — clauses 5.3, 7.5.2,
5.4Δ; §8 surfaces. `/settings/users` (invite, seats, deactivate,
External-Auditor guest); `/settings/roles` (living 5.3 matrix + SoD view +
controlled-doc export); `/settings/approvals` (the records-approval matrix
editor DRIVING HITL); `/settings/retention` (schedule editor + legal hold).
**CHECKPOINT E.**

**P6 — Witness: the real golden loop (1 session, owner + architect)**
NO seeded data (BC-3). Fresh tenant: `/setup` → Generate → manual with
honest GAPs → GAP CTA → real NCR (NCR→M2) → regenerate, gap closes →
readiness moves → invite user, matrix-routed SoD approval → **create audit
programme entry → LeadAuditor generates checklist → record a finding → watch
the CAPA auto-open → seal** → Export ZIP → auditor-guest read-only view.
Doubles as spec-40 T13 + spec-41 T11 ACC + D5 rerun. Script:
`.kiro/specs/ims-experience/acc-golden-loop.md`.

**P7 — Commercial plane + agent wave 2 (own specs, pre-beta)**
§9 build-out: billing consumer of `telemetry.credits.consumed` (monthly
close → Stripe metered), Stripe Checkout/webhook/ENTITLEMENT writer/dunning,
Trial v2 flow, Snapshot funnel S0–S5 + snapshot→seed contract (kickoff after
CHECKPOINT B, owner call), Partner program + portal (Part 16), Marketplace
dual-rail (Parts 43/44). Agent wave 2 (completes the §3 chains): NCTriage,
IncidentInvestigator, RiskSentinel, ReviewOrchestrator, ComplianceCopilot
first; then LegalLedger + CompetenceKeeper (with the compliance-obligations
+ training ROADMAP specs); remainder per catalog.

## 12. Specs & verification

Specs: `.kiro/specs/ims-experience/` (this file = its architecture.md; tasks
cite clause + pain + benchmark rows as acceptance; per-view DESIGN GATES;
Part 19 Match/Exceed cells close before launch-phase completion),
`.kiro/specs/read-surface-completion/` (architect lane incl. agent writeback
handlers), `.kiro/specs/governance-admin/` (P5 lane if Kiro splits it),
P7 specs per §9 area.

Verification: per-view DESIGN GATE (1440px vs view-designs + tokens,
evidence at `.kiro/evidence/ims-experience/view-gates/`); Playwright
`walkthrough.mjs` (SRP sign-in, route walk, screenshots); P6 golden loop =
standing release regression; SoD invariants hermetically pinned
(approval-matrix config can NEVER bypass author≠approver /
auditor-independence); agent chains get int-lane witnesses (finding event →
CAPA row exists); billing math pinned by existing metering/precheck test
suites; existing lanes stay green (hermetic + real-fixture marshal tests,
pseudo-locale, audit gate, tokens drift, nav smoke).

## 13. Owner rulings taken 2026-07-21 + remaining decisions

**RULED (encoded above):** pricing card v4 with monthly option on every
tier + annual discount (§9.1); FREEMIUM replaces demo/trial — card on file,
no downloads (§9.1/9.3); commissions = Track 1 only: 10% one-time on annual
sales, 8% recurring on monthly sales, Stripe payouts (§9.4); marketplace at
parity with card v4 (§9.5); Audit Studio, CAPA Studio, Document Studio
editor, record identification blocks = must-haves (§5/§7/P2-P4).

**Still open:**
1. AUD-7 now recommended IMPLEMENT (REQ-WB) — confirm.
2. AR latency sync-vs-async (AUD-6).
3. listRiskTreatments / getPolicy / getImsScope surfaces (parked).
4. Compliance-obligations (LegalLedger) + training (CompetenceKeeper/DC-4)
   ROADMAP specs: after this rebuild or parallel with P7? (DC-4 is a design
   launch requirement.)

## 14. Estimate
Rebuild: ~15-17 sessions — P0(1) P1(2) P2(3-4, incl. Document Studio
editor) P3(2-3, incl. Audit Studio) P4(3, incl. CAPA Studio) P5(2) P6(1),
checkpoints A–E. P7 (commercial plane + freemium billing + agent wave 2)
sequenced immediately after, pre-beta. Backend engines untouched except P0
fix, additive read surfaces, agent writeback handlers, approval-matrix
engine, freemium entitlement gates.
