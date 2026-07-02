# Cumplify.ai — CONSOLIDATED Master Architecture (v7.0 FULL)

**Document:** `cumplify-CONSOLIDATED-master-architecture-v7-full.md`
**Version:** 7.0 consolidated · 2026-07-01
**Audience:** Kiro (spec-driven build) + senior AWS engineer
**What this file is:** The complete, single-file merge of the four architecture documents (v1 master Parts 0–11, v2 extensions Parts 12–20, v3 extensions Parts 21–28, v4 extensions Parts 29–34, v5 extensions Parts 35–38, v6 extensions Parts 39–42, v7 extensions Parts 43–46) in order. Content is unmodified from the source files; only this header is new.
**Precedence rule (unchanged):** later parts override earlier parts on conflict (v7 > v6 > v5 > v4 > v3 > v2 > v1 > spine). Key overrides already resolved in-text: trial model (Part 29 supersedes Parts 21 & v1 S4), model assignments (Part 30 amends the agent catalog), pool topology (Part 32 binds spine D.3), languages (Part 31), P&L targets (Part 27 supersedes 17.3).
**Companion documents (still required context):** the 7 spine docs — cumplify-architecture.md, module-spec.md, agent-catalog.md, cdk-guidance.md, iso-coverage-matrix.md, iso-requirements-map.md, gap-and-opportunity-matrix.md, competitive-analysis.md, progress.md.

## Master Table of Contents
- **v1 MASTER — Parts 0–11:** What we're building · Consumer-psychology journey · AI Readiness Snapshot · In-app journey · E2E AWS architecture · Pain-Point Intelligence · Tenant lifecycle · Stripe billing · Telemetry · Security consolidated · Observability & DR · Kiro build plan · App. A (services) · App. B (cost)
- **v2 EXTENSIONS — Parts 12–20:** Legal & anti-abuse · ISO roles (12 personas) · Settings & Trust Center · DocStudio Pro + Forms Studio M14 + CAPA toolkit · Affiliate program · Pricing & unit economics · Platform eQMS musts · Exceed-CertifyAero matrix · Spec inventory delta · App. C
- **v3 EXTENSIONS — Parts 21–28:** Trial + signup legal gate · AI token economics · SOC 2 fabric · Public API · AWS accelerator/cost scan · Kiro handoff protocol · Profit governance (>50% net) · Spec inventory delta · App. D
- **v4 EXTENSIONS — Parts 29–34:** Trial v2 (14-day, token-gated) · Nova-first model policy · Trilingual EN/ES/PT · 3-pool identity + Standards Update Manager · Amazon Connect support · Spec inventory delta · App. E

---
---

- **v5 EXTENSIONS — Parts 35–38:** Anti-hallucination guardrail stack (contextual grounding + Automated Reasoning) · Bedrock Evaluations release gate · CloudWatch GenAI observability & grounding SLO · Spec inventory delta · App. F

- **v6 EXTENSIONS — Parts 39–42:** Kiro build-time anti-hallucination (MCP-verify, execution gates, deployed-truth read-back) · Definition-of-Done ladder D0–D6 · Live-testing plane (AppConfig flags, CodeDeploy canaries, Synthetics, tenant-zero) · Kickoff-pack delta · App. G

- **v7 EXTENSIONS — Parts 43–46:** AWS Marketplace day-1 readiness — commercial architecture (contract+consumption dimensions, Private Offers, CPPO) · technical integration (fulfillment, entitlements, hourly metering, Concurrent Agreements, dual-rail rules) · FTR 8-week back-plan · specs 40–41 + steering 20 · App. H

<!-- ===== SOURCE: cumplify-e2e-master-architecture.md ===== -->

# Cumplify.ai — End-to-End Master Architecture (Kiro Build Handoff)

**Document:** `cumplify-e2e-master-architecture.md`
**Version:** 1.0 · 2026-07-01
**Audience:** Kiro (spec-driven AI IDE) + senior AWS engineer
**Authority chain:** This document is the **top-level integrator**. It consumes and does not contradict: `cumplify-architecture.md` (backend spine), `module-spec.md` (M1–M13), `agent-catalog.md` (22 agents), `cdk-guidance.md` (constructs & pipeline), `iso-coverage-matrix.md` (79 sub-clauses), `gap-and-opportunity-matrix.md`, `competitive-analysis.md`. Where those documents are silent — the growth front-end, self-serve tenant lifecycle, billing, product telemetry, and the pain-point intelligence engine — **this document is authoritative**.

---

## Table of Contents

- [Part 0 — What We Are Building, In One Page](#part-0)
- [Part 1 — Consumer-Psychology User Journey (Landing → Signup → Instant Value)](#part-1)
- [Part 2 — The Instant-Value Core Feature: AI Readiness Snapshot](#part-2)
- [Part 3 — In-App Journey: "AI Does the Heavy Lifting"](#part-3)
- [Part 4 — End-to-End AWS Architecture (All Planes)](#part-4)
- [Part 5 — Growth Plane: Pain-Point Intelligence Engine](#part-5)
- [Part 6 — Tenant Lifecycle: Self-Serve Provisioning State Machine](#part-6)
- [Part 7 — Monetization Plane: Stripe Billing & Entitlements](#part-7)
- [Part 8 — Product Telemetry & PLG Analytics](#part-8)
- [Part 9 — Security, Multi-Tenancy & Compliance Posture (Consolidated)](#part-9)
- [Part 10 — Observability, SLOs & DR](#part-10)
- [Part 11 — Kiro Build Plan: Specs, Stacks, Phases](#part-11)
- [Appendix A — New-Service Justifications](#appendix-a)
- [Appendix B — Cost Model (order-of-magnitude)](#appendix-b)

---

<a name="part-0"></a>
## Part 0 — What We Are Building, In One Page

**Cumplify.ai** is a **multi-tenant, agentic, enterprise-grade Integrated Management System (IMS)** SaaS covering **ISO 9001:2015 (Quality) + ISO 14001:2015 (Environmental) + ISO 45001:2018 (OH&S)** — 79 sub-clauses, 13 modules (M1–M13), 22 Bedrock agents under a ControlTower supervisor, running the **detect → draft → route → verify → close** loop on an **immutable, hash-chained, WORM-sealed audit trail**.

**The competitive wedge** (from `competitive-analysis.md`): the reference competitor (CertifyAero) is a single-standard, client-side document generator with a chatbot, flat $349/mo, SMB-only, no enterprise controls. Cumplify wins on three axes that compound: (1) tri-standard IMS, (2) genuinely agentic backend, (3) enterprise multi-tenancy with an auditable-by-construction trail.

**The product thesis for the front-of-house** (this document's new contribution): compliance buyers do not wake up wanting "a QMS platform." They wake up with a **pain**: *"our audit is in 90 days and we're not ready," "I inherited a mess of Word docs," "we just lost a bid because we're not 14001 certified," "a worker got hurt and I have no incident system."* The entire journey — landing page, signup, first session — is engineered around **naming that pain in the visitor's own words** (harvested continuously by the Pain-Point Intelligence Engine, Part 5) **and delivering an AI-generated answer to it within ~3 minutes of arrival, before asking for a credit card**.

**Four planes, one platform:**

| Plane | Purpose | Key components |
|---|---|---|
| **Growth Plane** | Attract, convert, activate | Landing page(s), Pain-Point Intelligence Engine, AI Readiness Snapshot (pre-auth), PLG telemetry |
| **Application Plane** | The IMS product | M1–M13 modules, AppSync, Next.js app (existing spine docs) |
| **Intelligence Plane** | Agentic backbone | 22 Bedrock agents, ControlTower, EventBridge/SQS, Bedrock KBs on AOSS (existing spine docs) |
| **Control Plane** | Run the business | Tenant provisioning state machine, Stripe billing/entitlements, admin ops, observability, DR |

Everything below either references the spine docs (marked **[SPINE]**) or is net-new (marked **[NEW]**).

---

<a name="part-1"></a>
## Part 1 — Consumer-Psychology User Journey (Landing → Signup → Instant Value) **[NEW]**

### 1.0 Psychological frame

B2B compliance is a **fear-and-relief purchase**. The buyer (Quality Manager, EHS Manager, Ops Director at a 20–500-person manufacturer/contractor) carries *personal career risk*: a failed audit, a lost contract, a reportable injury lands on **them**. Design principles applied to every screen:

1. **Loss aversion first, aspiration second.** Lead with the cost of inaction ("the audit finding with your name on it"), resolve with relief ("audit-ready, provably, continuously").
2. **Effort heuristic inversion.** The competitor's promise is "minutes, not months" for *documents*. Ours is stronger: *you don't operate the system — agents do*. Every screen must demonstrate the AI doing work the visitor expected to do themselves.
3. **Commitment gradient.** Never ask for more than the value already delivered. Order of asks: attention → one question → email → password → (14 days later) card. No credit card at signup.
4. **Endowed progress.** The Readiness Snapshot starts the visitor at a partially-filled progress state ("Snapshot 2 of 6 sections already assessed from your industry profile") — people finish journeys they perceive as already started.
5. **Authority + social proof + specificity.** Real clause numbers on screen (ISO 45001 6.1.2.1, not "safety stuff"), real pain-point quotes (verbatim, anonymized, from the intelligence engine), certification-body-agnostic factual claims only.
6. **One CTA per screen.** Every screen in the funnel has exactly one primary action. Secondary paths are visually subordinate.

### 1.1 The journey — 6 screens, ~3 minutes to first value, 0 screens of fluff

```
S0 Landing  →  S1 Pain Picker  →  S2 Snapshot (live gen)  →  S3 Reveal + Email Gate
→  S4 Account Create  →  S5 Workspace First-Run (aha #2)  →  [Day 1–14 activation loop]
```

Total required user inputs before first value: **1 click + 3 short fields**. Everything else is inferred or AI-generated.

---

#### S0 — Landing Page (single purpose: get one click into the Snapshot)

Above the fold — five elements, nothing else:

| Element | Content pattern | Psychology |
|---|---|---|
| **Headline** | Pain-mirrored, dynamically selected per traffic source by the Pain-Point Engine. Default: *"Your ISO audit is coming. Your management system isn't ready. Fix that in the next 3 minutes."* | Loss aversion + specificity + time-boxed relief |
| **Subhead** | *"Cumplify's AI agents run your entire ISO 9001 + 14001 + 45001 system — they detect the gaps, draft the fixes, route the approvals, and keep an immutable audit trail. You approve; they work."* | Effort inversion — agents as workforce |
| **Primary CTA** | **"Get my free AI Readiness Snapshot →"** (no signup mentioned) | Commitment gradient — the ask is a click, not an account |
| **Proof strip** | Live counter of "gaps detected & closed by Cumplify agents this month" + 3 rotating verbatim pain quotes with the clause the agent solved | Social proof grounded in the visitor's own language |
| **Anxiety reducers** (under CTA) | "No credit card · No sales call · Snapshot in ~3 minutes" | Removes the three B2B-SaaS trust objections in 9 words |

Below the fold (for scrollers and AI-search crawlers only — the funnel never depends on it): the tri-standard coverage matrix as a visual, the detect→draft→route→verify→close loop animated, the immutable-audit-trail explainer, security posture (per-tenant isolation, WORM evidence, HITL approvals), pricing anchor, FAQ in AEO-citable Q&A schema.

**Technical:** statically generated Next.js page on Amplify Hosting behind CloudFront; headline/quote variants served from a `growth-content` DynamoDB item set (written by the Pain-Point Engine, Part 5) via edge-cached JSON — the page itself never waits on a backend. Core Web Vitals budget: LCP < 1.8s, CLS < 0.05.

#### S1 — Pain Picker (one question; disguised segmentation)

A single full-screen question: **"What's keeping you up at night?"** with 6 large tap targets (copy refreshed weekly by the Pain-Point Engine; each maps to standards scope + urgency):

1. "Certification audit coming up and we're behind" → urgency=high
2. "Our documents are a mess of Word files and tribal knowledge" → M1-led
3. "We need ISO 14001 / 45001 added to our 9001" → IMS expansion (highest-LTV segment)
4. "An incident/near-miss exposed gaps in our safety system" → 45001-led
5. "Customers/tenders demand certification we don't have" → revenue-threat framing
6. "We're certified but maintaining it eats my week" → operate-the-system segment

Plus two typeahead fields: **Industry** (picklist) and **Company size** (4 bands). That's the entire intake. No name, no email yet.

**Psychology:** self-identification of pain = micro-commitment + endowment ("this snapshot is about *my* problem"). The three answers give the Snapshot agent enough to be startlingly specific, which is the whole trick of S2.

#### S2 — Snapshot Generation (the theater of competence)

A 45–90 second live-streaming screen while the pre-auth Snapshot pipeline runs (Part 2). **Do not hide the wait — sell it.** Stream agent activity lines as they actually happen:

```
✓ ControlTower routing: metal fabrication, 80–200 employees, audit-pressure profile
✓ ISO9001 Guru — assessing clauses 4.1–10.3 against your industry baseline …
✓ HazardScout — typical hazard exposure for your sector: 14 hazard classes …
✓ LegalLedger — jurisdiction-typical obligations (US-MD): 23 candidate obligations …
✓ Drafting your 90-day remediation plan …
```

**Psychology:** the labor illusion (people value output more when they see work happening) and a live proof that the "agents" claim is real, not marketing. This is also the moment the visitor internalizes the product model: *named specialist agents doing clause-level work*.

#### S3 — Reveal + Email Gate (value first, ask second)

The Snapshot renders **partially unlocked**:

- **Visible immediately (no email):** the headline **Readiness Score** (e.g., "61/100 — Conditionally ready in ~120 days"), the per-standard gauge (9001/14001/45001), and the **top 3 gaps** with real clause citations and one-line agent-drafted fixes.
- **Blurred, one field away:** the remaining ~12 gaps, the 90-day remediation plan, and the downloadable board-ready PDF.
- **Gate:** one field — work email — with copy *"Email me my full Snapshot + 90-day plan (PDF)."* Button: **"Unlock my full Snapshot."**

**Psychology:** reciprocity (real value already given), curiosity gap (blur is visible, specific, and about *them*), and the ask is framed as *delivery*, not registration. Expected email conversion at this screen for warm intent traffic: 45–65% (vs 2–5% for a cold "start free trial" form).

#### S4 — Account Create (password only; tenant provisioning starts invisibly)

Email is already captured; S4 asks for **password + name + company name** (3 fields, company pre-filled from email domain when resolvable). On submit:

- Cognito sign-up (email OTP verification inline, 6-digit) → **the tenant provisioning state machine fires** (Part 6) *while the user verifies the code* — by the time they land in the app, the workspace exists and is pre-seeded from their Snapshot.
- Plan: **14-day full trial, no card** (matches competitor's friction level; we out-position on value, not on trial mechanics).

**Psychology:** the OTP wait (~20s) is repurposed as provisioning time — zero perceived setup. Never show an empty workspace.

#### S5 — Workspace First-Run: the second aha (agents already worked for you)

The user's first authenticated screen is **not** a dashboard of empty modules. It is the **Command Center** with the Snapshot *already converted into live system state*:

1. **Their gaps are now open items** — the top gaps from the Snapshot exist as agent-drafted, HITL-pending artifacts: a drafted Quality/Environmental/OH&S policy set (DocStudio), a seeded risk register skeleton (RiskSentinel), a starter legal-register candidate list (LegalLedger), an audit-readiness scorecard (LeadAuditor).
2. **One glowing action:** **"Review & approve your first document"** — a single HITL approval of the AI-drafted policy. One click, one signature, and the immutable audit trail records its first hash-chained event *belonging to the user*.
3. The moment they approve, a subtle timeline animates: *"Event #1 sealed to your immutable audit trail."*

**Psychology:** IKEA effect (they approved it, so it's theirs) + endowed progress (score already moving) + the core habit loop is taught in 60 seconds: **agents draft → you approve → trail seals**. That loop IS the product.

**Day 1–14 activation loop (email + in-app, driven by real agent events, never generic drip):**

| Trigger (real event) | Message | Goal |
|---|---|---|
| Snapshot delivered | Full PDF + "your workspace is live" | Return visit |
| First HITL approval | "Your audit trail has begun — here's what your agents queued next" | 2nd approval |
| Day 3, if idle | Agent-found gap in *their* top pain area, pre-drafted | Re-engage via pain |
| First audit-readiness re-score (score ↑) | "Your readiness moved 61 → 68. Here's why." | Value proof |
| Day 10 | Trial-end preview: everything agents did, quantified (docs drafted, gaps closed, events sealed) | Pre-frame conversion |
| Day 13 | Convert: plan selector, annual-save anchor | Payment (Part 7) |

**North-star activation metric:** *time-to-first-sealed-audit-event* (target: < 10 minutes from landing). Secondary: Snapshot→email (>45%), email→account (>60%), account→first approval (>70%), trial→paid (>12% self-serve baseline).

---

<a name="part-2"></a>
## Part 2 — The Instant-Value Core Feature: AI Readiness Snapshot **[NEW]**

The Snapshot is the growth engine's product: a **pre-authentication, unauthenticated-safe, agent-generated ISO readiness assessment** produced from 3 inputs (pain, industry, size). It must be cheap, fast (<90s), rate-limited, and abuse-proof — and its output must convert losslessly into seeded tenant state at signup.

### 2.1 Pipeline

```
Visitor (S1 inputs)
   │  POST /snapshot (API Gateway HTTP API [NEW], throttled, WAF, CAPTCHA on anomaly)
   ▼
snapshot-intake Lambda
   • validates inputs, issues snapshotId (ULID), writes SNAPSHOT#<id> item to CumplifyCore
   • enqueues to SQS snapshot-jobs (standard, DLQ)
   ▼
snapshot-orchestrator Lambda (long-poll consumer, timeout 120s)
   • invokes Bedrock: single "SnapshotComposer" flow =
       ControlTower-routing prompt → parallel InvokeModel calls:
         - Nova Pro: industry-baseline gap synthesis per standard (3 calls, parallel)
         - Nova Lite: 90-day plan composer
       grounded on ISO-KB via Bedrock KB retrieval
       (AOSS VECTORSEARCH — ≥45s cold-start budget, exponential-backoff retry — MANDATORY)
   • streams progress lines to the browser via API Gateway WebSocket [NEW]
     (pre-auth: AppSync subscriptions are Cognito/IAM-bound; WebSocket API is the
      pre-auth realtime channel — see Appendix A)
   • persists result JSON to CumplifyCore (SNAPSHOT#<id>#RESULT) + rendered PDF to
     S3 growth bucket (NOT the WORM evidence bucket; 30-day TTL lifecycle)
   ▼
Reveal (S3 screen) reads result via GET /snapshot/{id} (partial payload pre-email;
full payload + presigned PDF URL post email capture)
```

**Design rules:**

- **No Bedrock *Agents* pre-auth.** The Snapshot uses direct `InvokeModel` + KB `Retrieve` inside its own Lambdas — not the tenant-scoped 22-agent roster — because agents carry action groups that mutate tenant state and require the tenant ABAC context. The Snapshot has no tenant. The agent-activity lines shown in S2 are the *real* pipeline stages, truthfully labeled with the roster names whose prompts/KBs they reuse.
- **Cost ceiling per Snapshot:** ~4 Nova Pro + 1 Nova Lite invocations + KB retrievals ≈ **$0.03–$0.08**. Rate limits: 3/IP/day, 20/IP/month (DynamoDB rate-limit items, already a `CumplifyCore` pattern), WAF Bot Control on the endpoint, CAPTCHA challenge only on anomaly (never by default — friction budget).
- **Email capture** writes a `LEAD#<email>` item + fires `growth.lead.captured` on the EventBridge bus → SES sends the PDF (SES is already justified in the messaging layer).
- **Snapshot → tenant seeding contract:** the result JSON schema is versioned (`snapshotSchemaVersion`) and is a **first-class input to the provisioning state machine** (Part 6). Every gap in the Snapshot maps to `{module, clauseRef, seedAction}` so S5's "agents already worked for you" is a deterministic transform, not a re-generation.

### 2.2 Snapshot result schema (contract)

```json
{
  "snapshotId": "01J...",
  "snapshotSchemaVersion": "1.0",
  "inputs": { "pain": "audit_pressure", "industry": "metal_fabrication", "sizeBand": "51-200" },
  "readiness": { "overall": 61, "iso9001": 72, "iso14001": 48, "iso45001": 55,
                 "estimatedDaysToReady": 120 },
  "gaps": [ { "standard": "ISO45001", "clauseRef": "6.1.2.1 Hazard identification",
              "module": "M10", "owningAgent": "HazardScout", "severity": "high",
              "finding": "...", "draftFix": "...", "seedAction": "SEED_HAZARD_REGISTER_SKELETON" } ],
  "plan90": [ { "day": 1, "action": "...", "agent": "DocStudio", "clauseRef": "5.2" } ],
  "pdfKey": "snapshots/01J.../report.pdf"
}
```

---

<a name="part-3"></a>
## Part 3 — In-App Journey: "AI Does the Heavy Lifting" **[NEW — UX layer over SPINE]**

The app's information architecture inverts the classic GRC pattern. Registers (M1–M13) exist and are one click away, but the **home surface is a work queue, not a module tree**. The user's job is reduced to: *see what agents found → review what agents drafted → approve or redirect*.

### 3.1 The three-surface app

| Surface | What it is | Backing |
|---|---|---|
| **1. Command Center** (home) | Readiness score + trend, the HITL **Approval Queue** (agent-drafted artifacts awaiting `returnControlInvocationResults`), "Agents working now" live feed, top risks | AppSync queries + `onAgentMessage` subscription **[SPINE]** |
| **2. Ask Cumplify** (persistent) | ComplianceCopilot chat, routes to the 3 Domain Gurus; every answer can end in an *action chip* ("Draft this procedure → DocStudio") that enqueues real agent work | ComplianceCopilot → Domain Gurus **[SPINE]** |
| **3. Modules M1–M13** | The registers, for power users and auditors | `module-spec.md` **[SPINE]** |

### 3.2 Interaction grammar (uniform across all 13 modules)

Every agent-touched artifact renders the same card anatomy, so the product teaches itself:

```
[Agent avatar + name]  [Clause chip: "ISO 14001 · 6.1.2"]  [Status: Draft → Pending approval]
  Finding / draft body (diff-view when superseding)
  [Approve]  [Edit & approve]  [Send back with note]        ← HITL, role-gated by ABAC
  footer: "On approval, event seals to your audit trail"     ← trust ritual, every time
```

**Psychology carried into the app:** (a) *approval as the atomic habit* — DAU is measured in approvals, not logins; (b) *visible provenance* — every number links to its sealed audit event, converting the immutable trail from backend feature into daily felt trust; (c) *progress mechanics* — the readiness score is recomputed by LeadAuditor on every material event and its movement is always attributed ("+3: emergency plan approved, 45001 8.2").

### 3.3 Continuous pain-solving loop (the in-app expression of "fetch real human pain points, offer AI solutions")

The Pain-Point Engine (Part 5) doesn't only feed marketing. A weekly distilled **pain→clause map** is written to the ISO-KB metadata layer. Agents use it to *prioritize*: when RiskSentinel or LeadAuditor has multiple candidate findings, the ones matching currently-trending real-world pain (e.g., a surge in "contractor management" pain in the user's industry) surface first, with the framing *"Companies like yours are struggling with 45001 8.1.4.2 contractor controls this quarter — your register has 2 gaps there. Drafts ready."* This is the above-and-beyond move: the product feels like it reads the industry's mind, because it literally does.

---

<a name="part-4"></a>
## Part 4 — End-to-End AWS Architecture (All Planes)

### 4.1 Master diagram

```mermaid
flowchart TB
  subgraph EDGE["Edge & Frontend"]
    R53[Route 53] --> CF[CloudFront + WAF CLOUDFRONT scope]
    CF --> AMP[Amplify Hosting — Next.js app + landing]
    CF --> S3CDN[S3 static/PDF delivery via OAC]
  end

  subgraph GROWTH["Growth Plane [NEW]"]
    APIGW[API Gateway HTTP API — /snapshot, /stripe/webhook + WebSocket API]
    SNAPL[Snapshot Lambdas]
    PPI[Pain-Point Intelligence pipeline — EventBridge Scheduler → Fargate scraper → Bedrock distill]
    GC[(growth-content items — DynamoDB)]
    APIGW --> SNAPL --> BR
    PPI --> GC
    PPI --> KB
  end

  subgraph APP["Application Plane [SPINE]"]
    APPSYNC[AppSync GraphQL — USER_POOL default + IAM + Lambda Authorizer + WAF REGIONAL + CfnApiCache]
    LAM[Module resolver Lambdas M1–M13]
    APPSYNC --> LAM
  end

  subgraph IDENTITY["Identity & Tenancy"]
    COG[Cognito ×3 User Pools — PreTokenGen V1_0 → custom:tenantId ID-token only]
    SFN[Step Functions — Tenant Provisioning State Machine [NEW]]
    COG -- PostConfirmation --> SFN
  end

  subgraph INTEL["Intelligence Plane [SPINE]"]
    CT[ControlTower supervisor — Bedrock multi-agent collab]
    AGENTS[21 collaborator agents — Nova Pro/Lite + Sonnet via us.anthropic.claude-sonnet-4-6]
    BR[Bedrock InvokeModel/InvokeAgent + CfnGuardrail PII+PROMPT_ATTACK]
    KB[Bedrock KBs — ISO-KB · TENANT-DOCS-KB]
    AOSS[(OpenSearch Serverless VECTORSEARCH — 1024-dim Titan v2; 45s cold-start budget + exp backoff EVERYWHERE)]
    CT --> AGENTS --> BR
    KB --> AOSS
  end

  subgraph EVENTS["Event Backbone [SPINE]"]
    EB[EventBridge bus cumplify-events]
    SQSQ[SQS per-consumer queues + DLQs — FIFO where tenant ordering matters]
    EB --> SQSQ --> AGENTS
  end

  subgraph DATA["Data Plane [SPINE]"]
    RDS[(Aurora Serverless v2 PostgreSQL — system of record, RLS per tenant)]
    DDB[(DynamoDB CumplifyCore — single table, CMK, 9 GSIs, append-only AUDITLOG hash chain, LeadingKeys ABAC)]
    REDIS[(ElastiCache Redis — hot registers)]
    S3W[(S3 Object Lock COMPLIANCE — WORM evidence + sealed audit archive)]
    DDB -- Streams 24h --> SEAL[WORM sealer Lambda] --> S3W
  end

  subgraph BIZ["Control Plane [NEW]"]
    STRIPE[Stripe — checkout, billing]
    ENT[Entitlements service — DDB ENTITLEMENT items]
    TELE[PLG telemetry — EventBridge → Firehose → S3 analytics → Athena]
    OBS[CloudWatch + X-Ray + alarms + dashboards]
  end

  AMP --> APPSYNC
  AMP --> APIGW
  LAM --> RDS & DDB & REDIS
  AGENTS --> RDS & DDB & S3W
  LAM --> EB
  STRIPE -- webhook --> APIGW --> ENT
  ENT --> COG
  APPSYNC -. authorizer reads .-> ENT
```

### 4.2 Request-path summaries

- **Public/pre-auth:** CloudFront → Amplify (static) + API Gateway (Snapshot, webhooks, pre-auth WebSocket). Nothing pre-auth touches AppSync, RDS, or tenant data.
- **Authenticated user:** CloudFront → Next.js → AppSync (`@aws_cognito`, Lambda Authorizer injects `resolverContext.tenantId/role`) → resolver Lambda → Redis→RDS (reads) / RDS+EventBridge (writes) → agents react async → HITL approvals return via `returnControlInvocationResults` → sealed audit event → `onAgentMessage`/module subscriptions push UI updates. **[SPINE]**
- **Agent-to-agent:** EventBridge → SQS → invoker Lambda → `InvokeAgent`; UI writes via `@aws_iam` mutations; subscriptions verify tenant claim. **[SPINE]**

---

<a name="part-5"></a>
## Part 5 — Growth Plane: Pain-Point Intelligence Engine **[NEW]**

Purpose: continuously **fetch real human ISO pain points** from the open web and turn them into (a) landing/funnel copy variants, (b) the S1 Pain Picker option set, (c) the pain→clause prioritization map consumed by agents (Part 3.3), and (d) an AEO/GEO content backlog. This is the mechanism behind "we sell the solution to the pain they already voiced."

### 5.1 Pipeline (weekly cadence; fully automated with one HITL gate)

```
EventBridge Scheduler (weekly)
  → Fargate task "pain-harvester" (long-running; polite, ToS-respecting fetchers)
      sources: public forum threads (Reddit r/ISO9001, r/SafetyProfessionals, Quality/EHS
      forums), Q&A sites, review sites for competitor category, industry association
      boards — PUBLIC pages only, robots.txt honored, no auth, no scraping behind walls
  → raw corpus → S3 growth-raw (30-day lifecycle)
  → "pain-distiller" Lambda chain:
      Nova Pro: cluster into pain themes, extract verbatim quotes (anonymized — strip
      usernames/handles/PII via Bedrock Guardrail PII anonymize BEFORE storage),
      map each theme → {standard, clauseRef, module, agent} using ISO-KB retrieval
      (AOSS: 45s cold-start budget + exponential backoff)
  → outputs:
      1. growth-content items (DynamoDB): headline variants, Pain Picker options,
         proof-strip quotes — status=PENDING_REVIEW
      2. pain→clause trend map (versioned JSON) → ISO-KB metadata + S3
      3. AEO content briefs → S3 (for the content workflow)
  → HITL: marketing owner approves growth-content items in an internal admin view
    (Cognito "Executive"/internal group) → status=LIVE → edge cache invalidated
```

**Compliance guardrails:** public sources only; PII anonymization at ingestion; quotes used verbatim only when short and de-identified, otherwise paraphrased; a `source_provenance` field retained internally for every claim so no marketing line is unfalsifiable.

### 5.2 Why this is architecture, not marketing ops

The same distilled map drives **agent prioritization** and **Snapshot specificity** (industry-conditioned gap baselines). Growth copy, pre-auth product, and in-app agent behavior all draw from one continuously-refreshed representation of real-world pain — a data moat the document-generator competitor cannot replicate client-side.

---

<a name="part-6"></a>
## Part 6 — Tenant Lifecycle: Self-Serve Provisioning State Machine **[NEW]**

Signup must yield a fully-isolated, pre-seeded tenant in **< 60 seconds**, invisibly, with saga-grade reliability. This is a **Step Functions Standard workflow** (justification: Appendix A) triggered by the Cognito PostConfirmation Lambda.

### 6.1 States

```
ProvisionTenant (Step Functions, per-state retry + catch → CompensateAndAlert)
 1. AllocateTenant        — write TENANT#<id> metadata to CumplifyCore (idempotent
                            attribute_not_exists); status=PROVISIONING
 2. BindIdentity          — set custom:tenantId on the Cognito user (PreTokenGen V1_0
                            injects it into ID token only [SPINE]); add to default
                            "Quality Manager" group (first user = admin of tenant)
 3. SeedRelationalSchema  — RDS: insert tenant row; RLS policies are static/global,
                            keyed to the authorizer tenant claim [SPINE] — no per-tenant
                            DDL; seed reference data (retention policies, role matrix)
 4. SeedFromSnapshot      — transform snapshot result JSON (Part 2.2) into:
                            draft documents (M1), risk skeleton (M5), hazard/aspect
                            starters (M10/M9), legal-register candidates (M8),
                            readiness scorecard (M3) — all status=DRAFT/PENDING_HITL,
                            authored-by=<agentName>, so S5 is instantly alive.
                            (No Snapshot? Seed from industry template instead.)
 5. RegisterKBTenant      — create tenant metadata-filter entry for TENANT-DOCS-KB
                            (tenant isolation by tenantId metadata filter [SPINE])
 6. StartTrialEntitlement — write ENTITLEMENT item {plan: trial, expires: +14d,
                            standards: [9001,14001,45001], seats: 5}
 7. EmitEvents            — tenant.provisioned on EventBridge → SES welcome,
                            telemetry, first agent warm-up (LeadAuditor initial
                            readiness score job)
 8. Activate              — status=ACTIVE
Compensation path: mark tenant FAILED, alarm, and queue human ops — never leave a
half-tenant reachable (authorizer denies any tenant not ACTIVE/TRIAL).
```

### 6.2 Offboarding / lifecycle states

`TRIAL → ACTIVE_PAID → PAST_DUE (grace 14d, read-only after 7) → SUSPENDED (read-only) → PENDING_DELETE (30d) → PURGED`. Purge is itself a state machine: RDS tenant rows deleted, DDB tenant partition deleted, TENANT-DOCS-KB entries removed, Redis keys flushed, S3 non-WORM objects deleted. **WORM audit archive and sealed evidence are retained through their Object Lock retention periods by design** — communicated in ToS; export bundle (all registers + audit trail JSON + evidence manifest) is offered before purge. Data portability is an enterprise trust feature, not an afterthought.

---

<a name="part-7"></a>
## Part 7 — Monetization Plane: Stripe Billing & Entitlements **[NEW]**

### 7.1 Packaging (positioned against the competitor's flat $349 single-standard plan)

| Tier | Price anchor | Standards | Agents | Key gates |
|---|---|---|---|---|
| **Launch** | $399/mo ($339 annual) | Any **1** standard | Core agents for scope | 5 seats, 1 site |
| **IMS Pro** ⭐ default | $899/mo ($749 annual) | **All 3 (IMS)** | Full 22-agent roster | 20 seats, 3 sites, API export |
| **Enterprise** | From $2,000/mo, annual, sales-assist | All 3 + multi-entity | Full + priority inference | SSO/SAML (Cognito SAML IdP), unlimited-seat bands, custom retention, DR SLA, audit-trail attestation report |

Trial = IMS Pro scope for 14 days (sell down, never up — endowment: taking 14001/45001 *away* at conversion is a felt loss that lifts IMS-tier attach).

### 7.2 Integration architecture

```
Convert CTA → Lambda creates Stripe Checkout Session (tenantId in metadata)
  → Stripe-hosted checkout (PCI stays with Stripe; we store no PAN — parity with
    competitor posture, stated on pricing page)
  → webhook → API Gateway /stripe/webhook → verifier Lambda
      (signature verify, idempotency via CumplifyCore idempotency items,
       event allowlist: checkout.session.completed, customer.subscription.*,
       invoice.payment_failed, invoice.paid)
  → entitlement writer: update ENTITLEMENT item + tenant status; emit
    billing.subscription.updated on EventBridge
  → enforcement: the AppSync Lambda Authorizer already resolves tenant context —
    it additionally loads the ENTITLEMENT item (Redis-cached, 60s TTL) and stamps
    resolverContext.plan/limits; resolvers gate standard-scope and seat mutations.
    DynamoDB remains authoritative for runtime tier [SPINE rule].
Dunning: invoice.payment_failed → PAST_DUE state ladder (Part 6.2) + SES sequence.
```

Stripe is invoked server-side only (Secrets Manager-held API key, rotated); no Stripe JS on compliance pages beyond checkout redirect.

---

<a name="part-8"></a>
## Part 8 — Product Telemetry & PLG Analytics **[NEW]**

Minimal, privacy-sane, and sufficient to operate the funnel metrics in Part 1:

- **Event contract:** `telemetry.*` events (page_view is NOT collected server-side; only funnel milestones: `snapshot.requested/completed`, `lead.captured`, `tenant.provisioned`, `hitl.approved`, `readiness.rescored`, `trial.converted`, `feature.used{module}`) — emitted onto the existing EventBridge bus by the same Lambdas that do the work (no client-side third-party trackers on the app; landing page may carry a consent-gated lightweight analytic).
- **Pipe:** EventBridge rule `telemetry.*` → **Kinesis Data Firehose → S3 analytics bucket (parquet, partitioned) → Athena** (justification: Appendix A). Dashboards: QuickSight optional later; Athena + a saved-query runbook suffices at launch.
- **Tenant health score** (for ops + future CS): computed daily by a Lambda from Athena outputs → `TENANT#<id>#HEALTH` item → drives the activation-loop email triggers (Part 1, S5 table) via EventBridge Scheduler.
- **Privacy:** telemetry carries tenantId/userId (Cognito sub) only; no content payloads; analytics bucket CMK-encrypted, 13-month lifecycle; excluded from any AI training use; documented in the privacy policy.

---

<a name="part-9"></a>
## Part 9 — Security, Multi-Tenancy & Compliance Posture (Consolidated)

All **[SPINE]** controls remain law; this section adds the new planes into the same model and states the posture we will sell to enterprise buyers.

| Layer | Control | Source |
|---|---|---|
| Tenant isolation — DynamoDB | IAM `dynamodb:LeadingKeys` + `ForAllValues:StringLike` on `aws:PrincipalTag/tenantId` | SPINE |
| Tenant isolation — RDS | RLS keyed to Lambda-authorizer `resolverContext.tenantId` | SPINE |
| Tenant isolation — vectors | TENANT-DOCS-KB metadata filter on tenantId in every retrieval | SPINE |
| Tenant isolation — cache | Redis keys tenant-namespaced | SPINE |
| Identity | 3 Cognito pools; `custom:tenantId` via PreTokenGeneration V1_0, **ID token only**; groups→roles→ABAC; MFA available, enforced for Enterprise; SAML federation (Enterprise) | SPINE + NEW(SAML) |
| AuthZ | AppSync `@aws_cognito` user-facing / `@aws_iam` agent paths; subscription resolvers verify tenant claim; entitlement stamped by authorizer | SPINE + NEW |
| Agent safety | CfnGuardrail (PII anonymize/block + PROMPT_ATTACK) on every invocation; HITL `returnControlInvocationResults` on all mutations; per-agent IAM permission boundaries; action-group Lambdas resource-policy-scoped to `bedrock.amazonaws.com` with SourceAccount/SourceArn | SPINE |
| Immutability | 3-layer: append-only `attribute_not_exists(pk)` + no Update/Delete IAM on AUDITLOG + hash chain (payloadHash/prevHash) + S3 Object Lock COMPLIANCE WORM sealing | SPINE |
| Pre-auth surface | Snapshot API: WAF Bot Control, per-IP rate limits, no tenant data reachable, isolated growth S3 bucket with TTL, isolated IAM (no RDS/agent permissions) | NEW |
| Billing | Stripe-hosted checkout; webhook signature verification + idempotency; no card data at rest | NEW |
| Secrets/KMS | Secrets Manager per-secret least privilege; 8 CMKs per env; DynamoDB CMK 6-action rule | SPINE |
| Env isolation | 3 accounts (dev/staging/prod), no shared state; CDK Pipelines mgmt account, `crossAccountKeys: true`; CDK Nag warnings = failures | SPINE |
| Network | VPC + interface endpoints (AOSS, Secrets Manager, KMS, Bedrock, execute-api); RDS/Redis private subnets; flow logs | SPINE |
| Compliance roadmap (sellable) | SOC 2 Type I by GA + Type II at GA+9mo (the immutable trail, HITL gates, and CloudTrail/Config evidence make the audit largely self-documenting — a deliberate architectural dividend); pen test pre-GA; DPA + subprocessor list (AWS, Stripe, Anthropic-via-Bedrock) | NEW |

The enterprise sales artifact is the platform's own dogfood: **Cumplify's SOC 2 evidence is collected in Cumplify** — the story writes itself.

---

<a name="part-10"></a>
## Part 10 — Observability, SLOs & DR

- **SLOs:** app availability 99.9% (Enterprise SLA 99.9 credit-backed); AppSync read p95 < 400ms (Redis hot paths < 120ms); agent HITL-draft turnaround p95 < 5 min; Snapshot completion p95 < 90s; audit-event seal lag (DDB→WORM) p95 < 15 min.
- **Golden signals per plane:** API (AppSync 4xx/5xx, authorizer latency), agents (InvokeAgent error rate, DLQ depth per queue — **DLQ depth > 0 for 15 min pages on-call**), AOSS (cold-start retry count, retrieval latency — validates the 45s budget in production), data (RDS ACU saturation, DDB throttles, Redis evictions), growth (Snapshot funnel drop-off), billing (webhook failure alarm = page).
- **Tracing:** X-Ray across API Gateway/AppSync→Lambda→Bedrock; correlation id = event id end-to-end (already carried in domain events).
- **DR (prod only):** us-east-1 primary / us-west-2 replica — DynamoDB Global Tables, Secrets replicas [SPINE]; Aurora Serverless v2 cross-region automated backups + snapshot copy (RPO ≤ 15 min via continuous backup, RTO 4h documented runbook); S3 WORM CRR within prod boundary; AOSS re-ingest runbook (KBs are derived data — rebuild from S3 sources); quarterly game-day restore test is a launch gate.

---

<a name="part-11"></a>
## Part 11 — Kiro Build Plan: Specs, Stacks, Phases

Kiro is spec-driven: each unit below becomes a Kiro spec (`requirements.md` in EARS form → `design.md` → `tasks.md`), with steering files pinning the global invariants so no generated task can violate them.

### 11.1 Steering files (author these first — they are the constitution)

```
.kiro/steering/
  00-stack-facts.md        # verified model IDs, cross-region Sonnet profile, 1024-dim
                           # Titan v2, account IDs, region rules — verbatim from spine
  01-tenancy-rules.md      # LeadingKeys ABAC, RLS, ID-token-only tenantId, claim checks
  02-aoss-rule.md          # THE 45s cold-start + exponential-backoff rule; every AOSS
                           # touchpoint must restate it; Lambda timeout ≥ 60s
  03-auth-modes.md         # @aws_cognito vs @aws_iam; subscription tenant verification
  04-immutability.md       # append-only AUDITLOG, hash chain, no Update/Delete IAM,
                           # WORM sealing; audit events on every state transition
  05-hitl.md               # returnControl on all mutating agent actions; role mapping
  06-cdk-conventions.md    # stack boundaries (cdk-guidance.md §1.2), CDK Nag=fail,
                           # crossAccountKeys, no console steps, per-env context
  07-events.md             # cumplify-events bus, event naming, SQS+DLQ, FIFO-by-tenant
```

### 11.2 Spec inventory → stack mapping

| # | Kiro spec | Stacks touched (cdk-guidance §1.2 + new) | Depends on |
|---|---|---|---|
| 1 | `platform-foundation` | Network, Security, Data, Identity | — |
| 2 | `eventing-backbone` | Eventing | 1 |
| 3 | `api-core` (AppSync schema M1–M5 + authorizer + entitlement stamp) | Api | 1,2 |
| 4 | `agents-existing-8` (ControlTower, DocStudio, LeadAuditor, CAPAGuru, RecordsVault, 3 Gurus) | Ai | 1–3 |
| 5 | `immutable-trail` (AUDITLOG + hash chain + WORM sealer + retrieval index) | Data, Ai | 1,2 |
| 6 | `tenant-lifecycle` (Step Functions provisioning + offboarding + purge) **[NEW]** | Identity, Data, **LifecycleStack [NEW]** | 1–3 |
| 7 | `growth-snapshot` (API GW HTTP+WS, Snapshot pipeline, landing content API) **[NEW]** | **GrowthStack [NEW]**, Ai | 1,4 |
| 8 | `billing-entitlements` (Stripe, webhooks, plan gates, dunning) **[NEW]** | **BillingStack [NEW]**, Api | 3,6 |
| 9 | `frontend-app` (Next.js: Command Center, HITL queue, Ask Cumplify, M1–M5 UIs) | Amplify/Edge | 3,4 |
| 10 | `frontend-funnel` (S0–S5 screens, activation emails via SES) **[NEW]** | Amplify/Edge, Eventing | 7,6 |
| 11 | `modules-new-8` + `agents-roadmap-14` (M6–M13 per module-spec; agents per catalog) | Api, Ai, Data | 3,4 |
| 12 | `pain-intelligence` (harvester Fargate, distiller, admin review, agent-priority feed) **[NEW]** | Growth, Compute | 2,7 |
| 13 | `telemetry-analytics` (Firehose→S3→Athena, health score) **[NEW]** | **AnalyticsStack [NEW]** | 2 |
| 14 | `observability-dr` (dashboards, alarms, X-Ray, DR runbooks, game day) | all | 1–13 |

### 11.3 Phased delivery (each phase ends in a demoable increment)

- **P0 — Foundation (specs 1,2,5):** accounts, pipeline, data plane, event bus, immutable trail proven end-to-end (synthetic event → hash chain → WORM object).
- **P1 — Product core (3,4,9):** the 5 existing modules tri-standard on AppSync + the 8 built agents + Command Center with a working HITL approval → sealed event. *Internal aha achieved.*
- **P2 — Self-serve (6,7,8,10):** landing → Snapshot → signup → seeded workspace → trial → Stripe conversion. *The full Part 1 journey live.* ← **launchable beta**
- **P3 — IMS completion (11):** M6–M13 + 14 roadmap agents, per the coverage matrix (converts the 39 ROADMAP clauses).
- **P4 — Moat & scale (12,13,14):** pain intelligence feeding funnel + agents, analytics, SOC 2 evidence run, DR game day. ← **GA**

**Definition of done, globally:** every AOSS path demonstrates the 45s/backoff behavior under a forced cold start in staging; every mutation path shows its sealed audit event; every subscription proves cross-tenant denial in an integration test; CDK Nag clean; the Part 1 funnel metrics instrumented before the funnel ships.

---

<a name="appendix-a"></a>
## Appendix A — New-Service Justifications (one line each, per spine convention)

| Service **[NEW]** | Justification |
|---|---|
| **Step Functions** | Tenant provisioning/purge is a multi-step saga needing per-step retry, compensation, and auditability; encoding it in chained Lambdas would re-implement a state machine poorly. No tenant data plane added. |
| **API Gateway (HTTP + WebSocket)** | Pre-auth surfaces (Snapshot, Stripe webhooks, pre-auth progress streaming) cannot ride AppSync, whose auth modes are Cognito/IAM/Lambda-auth bound to tenant context; a hard blast-radius boundary between anonymous traffic and the tenant API is a security feature. |
| **Kinesis Data Firehose + Athena** | Funnel/product analytics need cheap append-and-query over S3; no OLTP load, no new always-on compute; parquet+Athena is the minimal-footprint choice. |
| **AWS WAF Bot Control (on GrowthStack ACL)** | Anonymous Bedrock-invoking endpoint must be abuse-hardened; complements the existing WAF ACLs already in SecurityStack. |
| *(Reconfirmed from spine)* SES/SNS | Existing aws-messaging layer; notifications + activation emails only. |
| *(Reconfirmed from spine)* Aurora Serverless v2 PostgreSQL | Is the RDS PostgreSQL construct; in-scope. |

Everything else in this document uses only the verified stack: Amplify, CloudFront/S3, AppSync, Lambda, Bedrock (Agents/KB/Guardrails), RDS PostgreSQL, DynamoDB, OpenSearch Serverless, ElastiCache, SQS, EventBridge (+Scheduler), Secrets Manager, KMS, ECS/Fargate, Cognito, Route 53, ACM, CloudWatch/X-Ray, CloudTrail/Config.

<a name="appendix-b"></a>
## Appendix B — Cost Model (order of magnitude, prod, pre-scale)

| Layer | Monthly est. | Notes |
|---|---|---|
| Aurora Serverless v2 | $180–$450 | 0.5–4 ACU band early |
| DynamoDB on-demand + CMK | $30–$120 | audit mirror is write-heavy but tiny items |
| OpenSearch Serverless | $0 idle → ~$200–$700 active | scale-to-zero is why the 45s rule exists; watch OCU floor as KBs grow |
| ElastiCache | $50–$150 | single small replica group per env |
| Bedrock inference | $150–$1,500 | dominated by Nova Pro agent volume + Snapshot traffic; Snapshot ≈ $0.03–$0.08 each — model per-tenant agent budgets early |
| Lambda/AppSync/API GW/SQS/EventBridge | $50–$200 | |
| S3 (incl. WORM) + CloudFront + Amplify | $40–$150 | |
| Fargate (harvester + long-run agents) | $30–$100 | scheduled/spiky |
| Firehose/Athena, WAF, misc | $60–$150 | |
| **Total (prod)** | **~$0.6k–$3.5k/mo** | 3-account topology ≈ +35–50% for dev+staging at reduced sizing |

Unit economics guardrail: at IMS Pro $899/mo, a tenant's variable cost (inference + storage) should hold under 8–12% of MRR; per-tenant Bedrock cost is emitted as telemetry from day one so pricing stays evidence-based.

---

*End of master document. This file, together with the seven spine documents, constitutes the complete Kiro build context for Cumplify.ai.*

---

<!-- ===== SOURCE: cumplify-e2e-architecture-v2-extensions.md ===== -->

# Cumplify.ai — Master Architecture v2.0 Extensions

**Document:** `cumplify-e2e-architecture-v2-extensions.md`
**Version:** 2.0 · 2026-07-01
**Status:** Authoritative additions to `cumplify-e2e-master-architecture.md` (v1). Where v2 and v1 conflict (pricing, role model, module count), **v2 wins**. Spine documents remain law for everything untouched here.
**Scope of this extension:** (12) Legal architecture & anti-abuse, (13) ISO role & user model, (14) Settings & Trust Center, (15) Document Studio Pro + Forms Studio (M14) + CAPA engineering toolkit, (16) Affiliate/Partner program, (17) Pricing & unit economics (researched), (18) Platform-level ISO compliance "musts", (19) Exceed-CertifyAero enforcement matrix, plus updated Kiro spec inventory.

---

## Table of Contents
- [Part 12 — Legal Architecture & Anti-Abuse Defense](#part-12)
- [Part 13 — ISO Role & User Model (Full Persona Set)](#part-13)
- [Part 14 — Settings & Trust Center (Vanta-Inspired)](#part-14)
- [Part 15 — Document Studio Pro, Forms Studio (M14), CAPA Engineering Toolkit](#part-15)
- [Part 16 — Affiliate / Consultant Partner Program](#part-16)
- [Part 17 — Pricing & Unit Economics (COGS + $40k OpEx + Affiliate Load)](#part-17)
- [Part 18 — Platform ISO-Compliance Musts (the eQMS Bar We Must Clear)](#part-18)
- [Part 19 — Exceed-CertifyAero Enforcement Matrix](#part-19)
- [Part 20 — Updated Kiro Spec Inventory (v2 delta)](#part-20)
- [Appendix C — New-Service Justifications (v2 delta)](#appendix-c)

---

<a name="part-12"></a>
## Part 12 — Legal Architecture & Anti-Abuse Defense **[NEW]**

Design goal: a legal + technical perimeter that protects Cumplify (Strivana Com LLC, a Delaware LLC) end-to-end — against trial abusers, chargeback scammers, affiliate fraud, competitive scraping, and liability-shifting customers — while staying enterprise-credible. Structure inspired by the layered approach mature AI companies (e.g., Anthropic) use: **a document stack, not one ToS**, each doc scoped to one risk surface, all cross-referencing, all versioned and click-wrapped with recorded acceptance events.

> ⚠️ Engineering handoff note: everything below is *architecture for counsel to finalize*, not legal advice. A Delaware-licensed attorney reviews the stack before GA; the platform is built so their edits are config, not code.

### 12.1 The legal document stack

| Doc | Governs | Key protective clauses (checklist for counsel) |
|---|---|---|
| **Terms of Service** (click-wrap at signup; re-accept on material change) | All customers | **Governing law: State of Delaware**; venue: Delaware state/federal courts; **binding individual arbitration + class-action waiver** (with small-claims and injunctive-relief carve-outs); liability cap = fees paid in trailing 12 months; consequential-damages exclusion; **no guarantee of certification** — Cumplify is a management tool, certification decisions belong to accredited bodies; **not professional advice** — outputs do not replace qualified consultants, legal counsel, or competent persons under OH&S law; termination-for-cause rights incl. immediate suspension for abuse/fraud/non-payment; unilateral-amendment with notice; survival clauses; export-control & sanctions compliance; force majeure |
| **AI Output Terms** (section or annex) | Agentic features | Outputs are AI-generated and may be inaccurate/incomplete; **human review is required before reliance** (this pairs perfectly with our HITL architecture — the product *enforces* what the terms *require*, a defensibility loop no competitor has); customer owns its inputs and its approved outputs; Cumplify owns the platform, models-orchestration, prompts, and aggregate learnings; feedback license (perpetual, royalty-free); no training on customer content without opt-in (enterprise trust requirement) |
| **Acceptable Use Policy** | Everyone | No reverse engineering, benchmarking-for-publication without consent, scraping, bulk export beyond documented APIs, credential sharing, reselling access, uploading unlawful/infringing/malicious content, using the platform to fabricate compliance evidence (**fraud-shield clause**: attempting to backdate, forge, or launder audit evidence = immediate termination + preserved records for authorities) |
| **Privacy Policy + DPA** (DPA auto-countersigned for paid tenants) | Data | Subprocessor list (AWS, Stripe, Anthropic-via-Bedrock); SCCs where applicable; breach-notice SLAs; data-retention schedule aligned to Part 6.2 lifecycle; WORM-retention disclosure (audit archives persist through Object Lock periods post-termination — this is a *feature* customers are told about, not a surprise) |
| **SLA** (Enterprise only) | Uptime | 99.9% credit-backed; credits are sole remedy; exclusions (customer-caused, beta, force majeure) |
| **Affiliate Agreement** | Partners | See Part 16.4 — clawbacks, fraud grounds, FTC-disclosure duty, no self-referral, no PPC-brand-bidding, indemnity |
| **Beta Terms** | Pre-GA features | As-is, no SLA, feedback license, may be discontinued |
| **Trial Terms** | 14-day trials | One trial per organization; anti-circumvention (Part 12.2); data deleted 30 days post-trial unless converted |

**Acceptance architecture:** every acceptance is an event — `legal.accepted {docId, version, userId, tenantId, ip, userAgent, ts}` — written through the **same hash-chained immutable AUDITLOG + WORM sealer** as compliance events. In any dispute, chargeback, or arbitration, Cumplify produces cryptographically chained proof of who accepted what, when, from where. Our compliance backbone doubles as our litigation shield.

### 12.2 Anti-scammer / anti-abuse technical enforcement ("100% protection" = layered, evidence-generating controls)

| Threat | Technical control | Legal hook |
|---|---|---|
| Serial trial abusers | Signup risk score: disposable-email blocklist, email-domain age, IP/ASN reputation, device fingerprint hash, duplicate-company heuristics → risk ≥ threshold requires card-on-file (not charged) or blocks trial; one-trial-per-org enforced via normalized company+domain key in `CumplifyCore` | Trial Terms anti-circumvention |
| Chargeback fraud ("bought it, used it, disputed it") | **Automated dispute-evidence pack**: Lambda assembles Stripe dispute response from the audit trail — acceptance events, login history, HITL approvals performed, documents generated, exports taken — proving active use; submitted via Stripe API within 24h | ToS + recorded acceptance |
| Affiliate fraud (self-referral, cookie-stuffing, refund-cycling) | Referral↔customer identity matching (email/domain/payment fingerprint), commission hold = 45 days (> refund window), clawback on refund/chargeback, velocity anomaly alarms | Affiliate Agreement clawback + termination |
| Competitive scraping / model extraction | WAF Bot Control (already in GrowthStack), per-tenant API rate ceilings, watermark-free but **fingerprinted exports** (per-tenant invisible export ID for leak tracing), AUP anti-benchmarking clause | AUP |
| Evidence forgery attempts (a "bullshitter" tenant trying to fake compliance) | Architecturally impossible to alter history: append-only + hash chain + WORM (spine E.1). Backdating attempts are themselves logged. Cumplify can truthfully tell certification bodies: *records on this platform cannot be silently rewritten — by the customer or by us* | Fraud-shield AUP clause |
| Abusive/fraudulent content uploads | Malware scan on all uploads (Part 15.1), Bedrock Guardrail screening on AI-processed content | AUP + indemnity |

**Corporate posture:** Delaware LLC (Strivana Com LLC) as the contracting entity; IP assignment from all contributors; trademark filings for "Cumplify" word + logo pre-GA; standard insurance stack (Tech E&O + Cyber) sized at Enterprise-tier contract values.

---

<a name="part-13"></a>
## Part 13 — ISO Role & User Model (Full Persona Set) **[EXPANDS SPINE D.3]**

The spine's 5 roles (Quality Manager, EHS Manager, Auditor, Employee, Executive) become the **launch subset** of a 12-persona model that mirrors how real ISO organizations actually staff clauses 5.3 (roles/responsibilities/authorities) and 5.4 (worker participation). Roles remain Cognito groups → ABAC via the Lambda Authorizer; DynamoDB stays authoritative for runtime role/tier [SPINE rule]. New in v2: **fine-grained permission sets layered under groups** and **two cross-boundary identities** (External Auditor, Partner Consultant).

### 13.1 Role catalog

| # | Role (Cognito group) | ISO anchor | Core permissions (module-level; enforced in authorizer + resolvers) |
|---|---|---|---|
| 1 | **Top Management / Executive** | 5.1 leadership, 9.3 review | Read-all dashboards; approve 9.3.3 outputs; approve policies (5.2); no register mutations |
| 2 | **Management Rep / IMS Lead** *(new)* | 5.3 (the "QMS coordinator") | Full write across M1–M13; user/role administration; settings admin; the default first-user role at signup (replaces "Quality Manager-as-admin" in v1 Part 6) |
| 3 | **Quality Manager** | 9001 ownership | Full write M1–M5, M7, M11–M13 (quality domains) |
| 4 | **EHS Manager** | 14001+45001 ownership | Full write M5, M7–M11 (environmental + OH&S domains) |
| 5 | **Document Controller** *(new)* | 7.5.3 | M1/M14 full lifecycle incl. publish/obsolete; distribution management; cannot approve own drafts (**segregation-of-duties rule, enforced**: author ≠ approver on every approval workflow) |
| 6 | **Internal Auditor** | 9.2 | M3 full; read-only everywhere; **auditor-independence check**: cannot audit processes where they hold write roles (system-enforced, mirrors and beats CertifyAero's independence feature) |
| 7 | **External Auditor (guest)** *(new)* | Cert-body stage 1/2 audits | Time-boxed (default 30-day expiry), read-only, scoped to selected standards/modules; every view logged; invited via magic-link + forced MFA; **this seat is free and unlimited** — making the certification auditor's life easy is a sales weapon |
| 8 | **Process Owner** *(new)* | 4.4 processes | Write within assigned processes/registers only (row-level assignment via `owner_id`), read adjacent |
| 9 | **Supervisor** *(new)* | 45001 operational | M10 hazard/incident triage, M13 team training views, approve worker submissions |
| 10 | **Employee / Worker** | 5.4 participation | Report hazards/incidents (M10), forms submission (M14), own training (M13), consultation participation (M6/M10), read published docs relevant to role |
| 11 | **Contractor (limited)** *(new)* | 45001 8.1.4.2 | Induction forms, contractor docs acknowledgment, incident reporting only; auto-expiring |
| 12 | **Partner Consultant** *(new, cross-tenant)* | — (channel) | See Part 16.3 — a partner-pool identity granted per-tenant, per-role, client-approved delegated access |

### 13.2 Mechanics

- **Permission model:** `group → base permission set` + optional per-user grants (`PERMSET#` items in CumplifyCore) evaluated by the authorizer and stamped into `resolverContext.permissions`. Resolvers check permissions, never group names (so counsel/roles can evolve without schema churn).
- **Segregation of duties (SoD):** a small rules table (author≠approver; auditor-independence; incident-investigator ≠ area supervisor of the incident) evaluated at mutation time; violations are hard-blocked and logged — an *enterprise* control CertifyAero lacks entirely.
- **Delegation & absence:** time-boxed delegation records ("EHS Manager delegates approvals to X, Jul 1–14") — required by real orgs, loved by auditors, logged immutably.
- **Seat classes for billing (Part 17):** Full (roles 1–6, 8, 9) / Worker (10, free-to-cheap by band — worker participation must never be seat-gated or 5.4 adoption dies) / Guest-Auditor (free) / Contractor (free, expiring) / Partner (free to tenant; part of partner program).

---

<a name="part-14"></a>
## Part 14 — Settings & Trust Center (Vanta-Inspired) **[NEW]**

Vanta's settings surface works because it treats configuration as *evidence*: every setting is visible, assignable, and auditable. Cumplify adopts the same IA and adds the killer move — a **public Trust Center per tenant**.

### 14.1 Settings IA (left-nav within `/settings`, ABAC-gated per section)

| Section | Contents | Notes |
|---|---|---|
| **Organization** | Legal name, sites/locations (multi-site = Enterprise gate), industry, logo, time zone, fiscal calendar | Sites feed audit programme + registers scoping |
| **Standards & Scope** | Toggle ISO 9001 / 14001 / 45001 per entitlement; IMS scope statement link (M1 4.3); per-standard go-live status | Toggling a standard on triggers agent seeding for that scope |
| **Users & Roles** | Invite, role assignment (Part 13), permission sets, SoD rules view, delegation, deactivation; SCIM (Enterprise) | Every change = audit event |
| **Security** | SSO/SAML config (Enterprise), MFA enforcement policy, session duration, password policy, IP allowlist (Enterprise), API keys (scoped, rotatable, last-used shown) | Mirrors Vanta's "prove your posture" ethos |
| **Approvals & Workflows** | Per-doc-type approval chains (sequential/parallel/conditional), escalation timers, e-signature meaning statements (Part 18), review cadences | The 7.5.3 engine's control panel |
| **Notifications** | Per-role channel matrix (email/in-app) for the event taxonomy; digest schedules; quiet hours | SES/SNS layer |
| **Data & Retention** | Retention schedule editor per record class (feeds M4 + Object Lock), export bundle generator, legal hold toggle *(new: freezes disposition for litigation)* | |
| **Integrations** | Stripe (billing status), webhook endpoints out (Enterprise), CSV/API import/export | Kept deliberately thin at launch |
| **Billing & Plan** | Plan, seats by class, usage (incl. per-tenant AI budget meter from telemetry), invoices, payment method | Stripe-hosted portal embed |
| **Audit Log** | The tenant-facing immutable-trail viewer (filter by actor/module/clause/date, export, chain-verification badge) | Read path via AOSS retrieval — 45s cold-start budget + exponential backoff [SPINE rule] |
| **Trust Center** | See 14.2 | |

### 14.2 Trust Center — per-tenant public compliance page **[differentiator]**

Each tenant can publish `trust.cumplify.ai/<slug>` (or CNAME): a public, read-only page showing **certification status, standards in scope, live readiness score (optional), policy summaries, and verifiable "last internal audit" / "last management review" dates** — each backed by a hash-chain verification stamp. Customers use it to answer supplier-qualification questionnaires ("send them your Trust Center link"). This converts Cumplify tenants into **lead-generating billboards** (footer: "Compliance operated on Cumplify") and directly monetizes the immutability architecture. Cumplify itself dogfoods one for its own SOC 2 posture (Part 18.4).

Technical: static rendering to the growth S3 bucket + CloudFront on publish events; zero live tenant-API exposure; opt-in per widget.

---

<a name="part-15"></a>
## Part 15 — Document Studio Pro, Forms Studio (M14), CAPA Engineering Toolkit **[EXPANDS M1/M2]**

### 15.1 Document Studio Pro (M1 expansion)

**A. Bulk upload & AI migration pipeline** — the #1 objection of every switcher ("I have 400 Word files"):

```
Drag-drop up to 500 files (docx/pdf/xlsx/scans) → S3 multipart presigned uploads
 → GuardDuty Malware Protection for S3 [NEW — Appendix C] quarantines infected objects
 → ingestion Step Functions (Map state, concurrency 25):
     Textract [NEW — Appendix C] OCR/layout for scans & PDFs; native parse for docx
     → chunk + Titan v2 embed (1024-dim) → AOSS tenant-docs index
       (45s cold-start budget + exponential backoff [SPINE rule])
     → DocStudio classification pass: doc_type, standard(s), owner suggestion
     → **AI Clause Mapping**: semantic match vs ISO-KB → proposed clause_refs[]
       each with confidence + cited clause title; below threshold → "unmapped" queue
 → Migration Review Board (HITL): human confirms/edits mappings in bulk grid
 → confirmed docs enter controlled lifecycle as status=imported/current
Result surfaced as the money screen: "We ingested 400 documents. 371 mapped to
clauses automatically. Your coverage heat-map across 79 sub-clauses — and the
23 clauses with NO supporting document." (instant gap analysis from THEIR corpus —
CertifyAero has nothing comparable)
```

**B. Professional editor (MS-Office-grade, Tiptap/ProseMirror):**

| Capability | Implementation |
|---|---|
| Rich editing | Tiptap with tables, styles/heading system, footnotes, TOC generation, image/caption, page-break + header/footer model for print fidelity |
| **Tracked changes & suggesting mode** | ProseMirror change-tracking extension; suggestions resolve only by users with approval rights — the redline IS the 7.5.2 "creating and updating" evidence |
| Comments & mentions | Threaded, @mention → notification event; resolved threads retained in version history |
| Real-time co-editing | Yjs CRDT over the existing WebSocket API (GrowthStack API GW WS reused with Cognito authorizer for authenticated docs channel) — no new service |
| **Diagrams** | Embedded diagram blocks: Mermaid (flow/sequence) + a canvas editor (tldraw, MIT-licensed, client-side) for process maps, turtle diagrams, org charts — turtle diagrams match-and-beat CertifyAero's static ones because ours link nodes to live registers (click a "Risks" node → M5 filtered view) |
| AI in-editor | DocStudio agent inline: draft section, rewrite for clause conformance, "explain what 7.5.3 requires of this doc", diff-aware regeneration — all grounded on ISO-KB (AOSS rule applies) |
| Versioning & export | Immutable version snapshots to S3 on submit/publish (WORM on publish per spine E.2); server-side export to **docx + PDF** (Fargate render task) with controlled-copy stamping: watermark, doc ID, version, "UNCONTROLLED WHEN PRINTED", per-tenant export fingerprint (Part 12.2) |

**C. AI document writing** — unchanged from spine (DocStudio drafts grounded in ISO-KB + tenant corpus) but now lands **into** the pro editor as a tracked-changes draft, so AI work arrives pre-formatted for human review — HITL made ergonomic.

### 15.2 Forms Studio — new module **M14** `[NEW]`, sibling of M1

Purpose: the *structured-data* twin of Document Studio. Documents say what should happen; **forms capture proof that it did** — inspections, checklists, incident reports, induction sign-offs, calibration logs, consultation records. Every submission is a record (M4) with clause traceability.

- **Builder:** drag-drop fields (text, number+unit, select, photo, GPS, date, signature, table/grid, calculated), conditional logic, required-evidence rules, clause_refs tagging per form, version-controlled like documents (a form IS documented information under 7.5).
- **Runtime:** mobile-first fill (Employee/Contractor roles), offline-tolerant draft (local persistence, sync on reconnect), photo attachments → S3 evidence path, e-signature capture per Part 18.2 signature rules.
- **Submissions → records:** each submission writes an M4 record + audit event; numeric fields can feed 9.1.1 monitoring streams (e.g., a waste-log form feeds M9 `env_monitoring_readings`; an inspection failure can auto-raise `NC.Detected` → NCTriage chain).
- **AI:** FormSmith duties assigned to **DocStudio** (no new agent needed at launch): generate a form from a procedure ("turn this SOP into its inspection checklist"), suggest fields from clause requirements.
- **RDS additions (`forms` schema):** `forms`, `form_versions`, `form_fields`, `form_logic`, `form_submissions`, `submission_values`, `submission_attachments` — all tenant-RLS as standard.
- **AppSync:** standard CRUD `@aws_cognito`; `agentGenerateForm @aws_iam` (HITL-gated publish); `onSubmissionCreated(tenantId)` subscription (tenant-claim verified) [SPINE auth rules].

### 15.3 CAPA Engineering Toolkit (M2 expansion) — "engineering-grade problem solving, AI-facilitated"

CAPA stops being a ticket tracker and becomes a **methodology workbench**. CAPAGuru facilitates; humans decide; every artifact is a first-class, versioned, clause-traceable object.

| Tool | What ships | AI facilitation (CAPAGuru, HITL on all conclusions) |
|---|---|---|
| **8D** | Full D0–D8 guided workflow (team, containment, root cause, corrective, preventive, verify, congratulate); each D gates the next | Drafts D2 problem statement (5W2H), proposes D3 containment options, pre-fills D4 from evidence, drafts D7 systemic-prevention actions |
| **5-Why** | Interactive why-tree (branching, not linear) linked to evidence records | Suggests next "why" candidates with cited evidence; flags "why" chains that stop at symptoms |
| **Ishikawa / Fishbone** | Canvas editor (tldraw base) with 6M categories, branch→evidence linking | Populates candidate branches from incident data + similar-NC retrieval (AOSS semantic search — 45s/backoff rule) |
| **FMEA** | Process-FMEA grid: Severity × Occurrence × Detection = **RPN**, action tracking, re-scored RPN after actions | Suggests failure modes from the hazard/aspect registers; recomputes and trends RPN — matches CertifyAero's FMEA, beats it by linking to live M5/M9/M10 registers |
| **A3** | One-page A3 report layout auto-composed from the investigation objects | Generates the A3 narrative; exports controlled PDF |
| **Pareto & recurrence analytics** | NC categories, repeat-finding detection ("this is the 3rd bearing-failure NC in 12 months") | Recurrence detection is an agent job on `NC.Raised` — proactive, not report-pulled |

Data: `capa_methodologies`, `eight_d_records`, `why_nodes`, `fishbone_nodes`, `fmea_items`, `a3_reports` in the `capa` schema; effectiveness verification (spine) now must reference the methodology artifact that predicted it — closing the engineering loop auditors love.

---

<a name="part-16"></a>
## Part 16 — Affiliate / Consultant Partner Program **[NEW]**

Positioning: **"We don't replace consultants — we arm them."** ISO consultants are the trust brokers of this market; CertifyAero's anti-consultant posture ("DIY, no consultant needed") leaves the entire channel un-monetized and mildly hostile. Cumplify makes consultants a primary sales channel *and* a product persona.

### 16.1 Program structure (two motions, one program)

| Motion | Who | Mechanics |
|---|---|---|
| **Referral affiliates** | Content creators, auditors, trainers, agencies | Tracked link/code → 90-day cookie → recurring commission (16.2) on converted tenants |
| **Implementation partners** | Active ISO consultants | Everything referral gets **plus**: free Partner Consultant seat, multi-client Partner Portal (16.3), co-branded Snapshot links (their logo on the S2/S3 experience — their lead magnet, our funnel), directory listing ("Find a Cumplify consultant"), partner enablement kit |

### 16.2 Commission (the "90% of market average" mandate, computed from live research)

Researched benchmarks (2026): analyses of 2,600+ SaaS programs put the typical rate near **30% of revenue**; the widely-cited healthy band is **20–30% recurring**, with B2B-specific datasets ranging 10–20% and top programs (HubSpot et al.) at 30% recurring for 12 months. Taking the defensible **market average ≈ 28%** (midpoint of the dominant 25–30% cluster), the mandate *fee = 90% of market average* gives:

> **Headline rate: 25% recurring for months 1–12** (= 0.9 × 28%, rounded to the standard increment), then **10% lifetime tail** from month 13 (retention alignment — rare in-market, cheap for us, sticky for partners).
> **Implementation-partner tier:** 30% for months 1–12 once ≥5 active referred tenants (tiering is standard practice and keeps the *blended* program cost at ≈25%).
> Cookie window 90 days; commission hold 45 days (> refund window, Part 12.2); paid monthly via Stripe payouts; clawback on refund/chargeback.

Program-cost sanity check vs benchmarks: keeping total affiliate payout within 15–25% of customer LTV is the published health band — at 25%/yr-1 + 10% tail against our churn assumptions, Cumplify's payout ≈ 17–21% of LTV. Inside the band. ✅

### 16.3 Partner Portal & cross-tenant access (the architectural piece)

```
Partner identity = 4th trust boundary (alongside user / agent / external-auditor):
 • Partner accounts live in a dedicated Cognito User Pool context (partner pool
   usage of the existing 3-pool topology [SPINE D.3] — no 4th pool; a partner
   app-client + PARTNER#<id> profile items in CumplifyCore)
 • Client grants access: tenant admin (IMS Lead) approves "Grant <consultant>
   the EHS Manager role until <date>" → CONSENT item + audit event; consultant's
   ID token for that tenant context carries {tenantId, role, grantExpiry} via the
   same PreTokenGeneration/authorizer path — ABAC unchanged, isolation unchanged
 • Partner Portal (portal.cumplify.ai): multi-client dashboard — per-client
   readiness scores, pending HITL queues they're authorized for, upcoming audits,
   commission dashboard (referrals, MRR, payouts), co-branded Snapshot link mgmt
 • Hard rule: a partner NEVER sees data of a tenant without a live consent grant;
   consent expiry auto-revokes; every partner action carries actor=partner:<id>
   in the immutable trail (tenant can audit exactly what their consultant did)
```

Attribution & payouts: referral codes ride the Snapshot → signup flow (Part 1) as a `partnerRef` on the lead/tenant record; conversion events (`trial.converted`) trigger commission accrual items; monthly payout job → Stripe transfers; 1099 data export for US partners. Fraud controls per Part 12.2.

### 16.4 Affiliate Agreement musts (feeds Part 12 stack)

Recurring-commission definition & hold; clawbacks; prohibited conduct (self-referral, cookie-stuffing, spam, **brand-keyword PPC bidding ban**, misleading certification claims — a partner promising "guaranteed certification" is terminated for cause because it creates liability the ToS explicitly disclaims); **FTC disclosure compliance** required of partners; trademark license (limited, revocable); independent-contractor status; Delaware law; termination + 30-day payout wind-down for convenience, immediate + forfeiture for fraud.

---

<a name="part-17"></a>
## Part 17 — Pricing & Unit Economics (COGS + $40k OpEx + Affiliate) **[SUPERSEDES v1 Part 7.1 / Appendix B usage]**

### 17.1 Inputs

| Input | Value | Source |
|---|---|---|
| Fixed OpEx | **$40,000/mo** (salaries + marketing) | Given |
| AWS platform base (all 3 accounts, pre-scale) | **≈ $4,500/mo** (prod $0.6–3.5k midpointed + dev/staging at ~40%) | v1 Appendix B |
| AWS **variable COGS per paying tenant** | **≈ $55–$95/mo** (Bedrock inference dominant: agent chains, Snapshot amortization, KB retrieval; + storage/RDS ACU share) — plan ceiling: **≤12% of ARPA** with per-tenant AI budget metering | v1 Appendix B + telemetry mandate |
| Payment processing | 2.9% + $0.30 | Stripe standard |
| Affiliate load | 25% of yr-1 revenue on affiliate-sourced tenants; assume **45% of new revenue is affiliate-sourced** at steady state (it's a primary channel) → blended ≈ **11.25% of new-cohort revenue**, decaying to the 10% tail | Part 16.2 |
| Market anchors | Competitor: flat $349/mo single-standard; eQMS category: ~$2,000/user/yr mid-market up to six figures enterprise | competitive-analysis.md + researched category pricing |

### 17.2 Price card (v2 final)

| Tier | Monthly | Annual (−15%) | Standards | Seats included | Key gates |
|---|---|---|---|---|---|
| **Launch** | **$449** | $382/mo | Any 1 | 5 Full + unlimited Worker | Core agents for scope, Forms Studio, e-sig, audit trail |
| **IMS Pro** ⭐ | **$949** | $807/mo | All 3 (IMS) | 15 Full + unlimited Worker | Full 22-agent roster, bulk migration + AI clause mapping, CAPA engineering toolkit, Trust Center, Partner collaboration |
| **Enterprise** | **from $2,250** | annual only | All 3 + multi-site/entity | Custom bands | SSO/SAML + SCIM, IP allowlist, legal hold, SLA 99.9%, DR SLA, custom retention, audit-trail attestation report, validation pack (18.3), priority inference |
| Add-ons | Extra Full seat $29/mo · Extra site $149/mo (Pro) · Additional-standard on Launch $199/mo (upgrade nudge to Pro) | | | | |

Rationale: (a) prices sit **1.3×–2.7×** the competitor's flat $349 — justified because the unit of value is *three* management systems plus an agent workforce, and the eQMS category comfortably clears $2k/user/yr; we remain the value buy per standard ($949/3 ≈ $316/standard < $349). (b) Free unlimited Worker seats protect 45001 5.4 adoption (Part 13.2) — a pricing decision that is also a compliance-outcome decision. (c) Guest-auditor and Partner seats free — they are distribution, not cost.

### 17.3 Break-even & targets (blended ARPA assumption: **$820/mo** — mix 40% Launch / 50% Pro / 10% Enterprise)

Per-tenant monthly contribution ≈ ARPA $820 − COGS $75 − Stripe $24 − blended affiliate $92 (11.25%) = **≈ $629**.

| Milestone | Tenants | MRR | Math |
|---|---|---|---|
| **Break-even** | **≈ 71** | **≈ $58k** | ($40,000 + $4,500) ÷ $629 |
| Comfort (+30% buffer for support hire & AWS growth) | ≈ 95 | ≈ $78k | |
| Year-1 target | 150 | ≈ $123k | ≈ $86k/mo contribution → funds team growth |

Sensitivities (monitored via the Part 8 telemetry, reviewed monthly): affiliate mix →60% pushes break-even to ~76 tenants (fine — CAC on that revenue is zero otherwise); COGS discipline is the real lever — every $20/tenant of Bedrock drift moves break-even ~2 tenants, hence the hard per-tenant AI budget meter and Nova-first model routing (Sonnet only where the catalog assigns it) are **finance controls, not just engineering hygiene**. Gross margin at plan: **≈ 77–80%**, squarely in the healthy SaaS band that makes the 25% affiliate rate sustainable per the researched benchmarks.

---

<a name="part-18"></a>
## Part 18 — Platform ISO-Compliance Musts (the eQMS Bar) **[NEW — researched requirements register]**

For certification bodies and quality professionals to accept Cumplify records as *the* system of record, the platform must satisfy the recognized eQMS requirement set. Research across current eQMS guidance converges on the following register. Each row is a **build requirement with an acceptance test** — this section is imported verbatim into Kiro spec acceptance criteria.

### 18.1 Document control engine (ISO 7.5.1–7.5.3 across all three standards)

| # | MUST | Status vs spine | Acceptance test |
|---|---|---|---|
| DC-1 | Single source of truth; current-version-only visible in operational contexts | SPINE (M1) | Obsolete version unreachable from operator views; retrievable only in history |
| DC-2 | Full version control with change summaries; prior versions retained, never silently lost | SPINE + 15.1 | Diff any two versions; supersede chain intact |
| DC-3 | **Configurable approval workflows**: sequential, parallel, conditional by doc type; auto-escalation on overdue | Part 14.1 Approvals engine **[v2]** | Route matrix test incl. escalation timer firing |
| DC-4 | **Controlled distribution with read-acknowledgment**; re-acknowledgment forced on revision ("untrained on current version" until re-ack) | SPINE distribution + **v2: training-on-revision link M1→M13** | Publish rev B → affected users flip to unacknowledged + training task created |
| DC-5 | Author ≠ approver (SoD) | Part 13.2 **[v2]** | Self-approval hard-blocked |
| DC-6 | Controlled print/copy: stamped exports ("uncontrolled when printed", doc ID/version), on-demand complete copies for auditors | 15.1.B export **[v2]** | Export carries stamps + fingerprint |
| DC-7 | Retention schedules & disposition per record class; disposition logged; **legal hold** freeze | SPINE M4 + 14.1 **[v2 legal hold]** | Hold blocks disposition job; release resumes |
| DC-8 | External-origin documents (customer specs, SDS, legal texts) identified and controlled | v2: `origin=external` doc class in M1 | Filterable register of external docs |

### 18.2 Electronic signatures & record integrity (gold standard: 21 CFR Part 11-grade, offered even though ISO alone doesn't mandate it — it future-proofs regulated verticals)

| # | MUST | Implementation |
|---|---|---|
| ES-1 | Unique user identification + authentication at signing (re-auth or MFA step-up on signature) | Cognito re-auth challenge on sign action **[v2]** |
| ES-2 | Signature manifestation: signer name, date/time, **meaning** (authored/reviewed/approved) rendered on the record | Signature block schema + meaning statements configured in Settings (14.1) |
| ES-3 | Signature cryptographically bound to the record version (cannot be excised/transplanted) | Signature event carries `docVersionHash`; enters the hash chain — SPINE E.1 does this natively |
| ES-4 | Secure, computer-generated, time-stamped audit trail of create/modify/delete, attributed per user, retained ≥ record retention, protected from alteration **including by admins** | **SPINE E.1 exceeds requirement** (append-only IAM + hash chain + Object Lock COMPLIANCE — not even root) |
| ES-5 | Human-readable + electronic copies of records producible for inspection | Audit-trail export + record bundles (14.1 Data & Retention) |

### 18.3 System-level obligations

- **Validation pack (Enterprise add-on):** documented IQ/OQ/PQ-style evidence — requirements traceability (our clause matrices already are one), test evidence per release, change-control log — vendor-maintained so regulated customers (13485/GxP-adjacent) can adopt without self-validating from scratch.
- **Access control:** role-based least privilege incl. read-only enforcement on approved docs — Part 13 + SPINE ABAC.
- **Training linkage:** competence records (M13) bound to document revisions (DC-4) — the "system flags untrained-on-current-revision" test is the line between an eQMS and a shared drive, and it is a launch requirement, not roadmap.
- **Availability of documented information where/when needed** (7.5.3): mobile access for Worker roles + offline-tolerant forms (15.2).

### 18.4 Cumplify's own management system (practice what we sell)

Cumplify runs its **own ISO 9001-aligned QMS + ISO/IEC 27001-aligned ISMS inside a Cumplify tenant** (design/dev under 8.3, incidents under 10.2, our legal register in M8). Targets: SOC 2 Type I at GA, Type II GA+9mo, ISO 27001 certification in year 2. Every sales objection about trusting a compliance vendor is answered with our own Trust Center.

---

<a name="part-19"></a>
## Part 19 — Exceed-CertifyAero Enforcement Matrix **[NEW]**

CertifyAero is the floor, never the ceiling. Every observed strength is matched, then structurally exceeded; this matrix is a standing regression gate — **no launch phase completes while any "Match" cell is open.**

| CertifyAero capability (observed) | Match (parity) | Exceed (structural) |
|---|---|---|
| One-click QMS doc generation w/ clause traceability | DocStudio generation, clause_refs on every doc | Tri-standard generation; drafts land as **tracked changes** in a pro editor; clause mapping runs on *imported* legacy corpora too (15.1.A) |
| Turtle diagrams / process interaction map | Diagram editor with turtle template | Diagram nodes **link to live registers** — a diagram is a navigable system view, not a picture |
| Registers with filter/sort/CSV+PDF export | All M1–M14 registers, export | Registers are **agent-maintained**; exports carry controlled-copy stamps + fingerprints |
| 5×5 risk matrix + FMEA RPN | M5 matrix + 15.3 FMEA | FMEA fed by live hazard/aspect registers; RPN re-scored on action closure; recurrence agent |
| NCR dispositions (accept/reject/concession/rework) + CAPA aging alerts + auto-escalation | M2 dispositions (spine `nonconforming_outputs`), aging alerts | 8D/5-Why/Fishbone/A3 workbench; effectiveness must cite methodology artifact; escalation is an *agent* action with drafted next steps |
| Calibration intervals + 30-day alerts + NIST/17025 traceability fields | M4 calibration (7.1.5.2) with due alerts + traceability_ref | Out-of-tolerance triggers automatic impact-assessment CAPA chain |
| Structured 9.3.2 management-review inputs | M11 typed inputs | ReviewOrchestrator **gathers them in parallel automatically**; 9.3.3 outputs dispatch as tracked actions |
| Certification/registrar tracking + expiry emails | Certification records in M4 + SES reminders | Trust Center publishes verified status publicly |
| Readiness scoring / gap checklists | LeadAuditor readiness scores | Score is continuous, event-driven, and **explained** (every point-move attributed to a sealed event) |
| Opinionated SMB defaults (OTD ≥ 87% etc.) | Industry-default objectives seeded in M7 | Defaults conditioned on live pain-intelligence + industry profile (v1 Part 5) |
| AI assistant chat | ComplianceCopilot → Domain Gurus | Answers end in **action chips that enqueue real agent work**; server-side, guardrailed, tenant-grounded — vs their client-side browser calls |
| Multi-language UI ambition | i18n framework from day 1 (string catalog, RTL-ready); launch EN+ES | Agent outputs localized per tenant locale (Nova multilingual) — roadmap flag |
| 14-day trial, Stripe, cancel anytime | Same friction level (v1 Part 1) | No-card trial + instant-value Snapshot **before** signup |
| Approval workflows w/ thresholds | 14.1 approval engine | + SoD, delegation, e-sig meanings, escalation — enterprise-grade per Part 18 |

**Engineering-thinking enforcement (how "exceed enterprise grade" stays true under delivery pressure):** every Kiro spec carries three non-functional gates — (1) *evidence-first*: any state change must name its audit event before the feature is designed; (2) *agent-first*: any recurring human chore in a spec must state why an agent can't do it, or assign the agent; (3) *auditor-empathy*: every register ships with its export + its clause citation + its trail link, because the certification auditor is a user persona (Part 13 #7), not an afterthought.

---

<a name="part-20"></a>
## Part 20 — Updated Kiro Spec Inventory (v2 delta)

Add to v1 Part 11.2 (dependencies reference v1 numbering):

| # | Kiro spec | Contents | Stacks | Depends on |
|---|---|---|---|---|
| 15 | `legal-consent` | Doc-stack versioning, click-wrap acceptance events, re-accept flows, dispute-evidence pack Lambda | Api, Data | 3,5 |
| 16 | `roles-permissions-v2` | 12-persona model, permission sets, SoD engine, delegation, external-auditor guest flow | Identity, Api | 3,6 |
| 17 | `settings-trust-center` | Full settings IA, approval-workflow engine, retention/legal-hold, Trust Center publisher | Api, Edge | 3,16 |
| 18 | `docstudio-pro` | Bulk migration pipeline (Textract, GuardDuty S3), AI clause mapping + review board, Tiptap editor (tracked changes, comments, Yjs co-edit, diagrams), controlled exports | Ai, Data, Compute, Growth(WS) | 4,9 |
| 19 | `forms-studio-m14` | Builder, runtime (mobile/offline), submissions→records, monitoring feeds | Api, Data | 3,18 |
| 20 | `capa-engineering` | 8D/5-Why/Fishbone/FMEA/A3 workbench + CAPAGuru facilitation + recurrence agent job | Api, Ai, Data | 4 |
| 21 | `partner-program` | Partner identity + consent grants, Partner Portal, attribution, commission accrual + Stripe payouts, fraud controls | Identity, Api, Billing | 6,8,16 |
| 22 | `anti-abuse` | Signup risk scoring, trial dedup, chargeback evidence automation, export fingerprinting | Growth, Billing, Data | 7,8,15 |
| 23 | `platform-qms-dogfood` | Cumplify's own tenant + SOC2/27001 evidence mapping | — (config) | P3 complete |

Phase placement: 15,16,22 join **P2** (they gate public launch); 17,18,19,20 join **P3**; 21 spans P2 (referral tracking) → P3 (portal); 23 in **P4**. Steering-file additions: `08-legal-consent.md` (every acceptance is an audit event), `09-sod-rules.md`, `10-eqms-musts.md` (Part 18 register verbatim as acceptance criteria).

---

<a name="appendix-c"></a>
## Appendix C — New-Service Justifications (v2 delta, one line each)

| Service **[NEW in v2]** | Justification |
|---|---|
| **Amazon Textract** | OCR/layout extraction for the bulk-migration pipeline (scanned PDFs are the reality of legacy QMS corpora); batch-only, no data plane persistence beyond the pipeline. |
| **GuardDuty Malware Protection for S3** | Customer bulk uploads are an untrusted-content ingress; scanning before ingestion is a hard enterprise requirement; extends already-standard GuardDuty posture. |
| **Stripe Connect payouts** | Affiliate commission disbursement rides the existing Stripe relationship; no new PSP. |
| *(Reused, not new)* API GW WebSocket | Authenticated Yjs co-editing channel reuses the GrowthStack WebSocket API with a Cognito authorizer — one realtime substrate, two authorizer modes. |
| *(Client-side libs, not services)* Tiptap/ProseMirror, Yjs, tldraw, Mermaid | MIT/OSS front-end components; license review recorded in the legal register (M8) of Cumplify's own tenant. |

---

*End of v2 extensions. v1 master + this document + the seven spine documents = complete Kiro build context.*

---

<!-- ===== SOURCE: cumplify-e2e-architecture-v3-extensions.md ===== -->

# Cumplify.ai — Master Architecture v3.0 Extensions

**Document:** `cumplify-e2e-architecture-v3-extensions.md`
**Version:** 3.0 · 2026-07-01
**Status:** Authoritative additions to v1 (master) + v2 (extensions). Precedence: **v3 > v2 > v1 > spine** on any conflict. Conflicts resolved in this doc: trial model (Part 21 supersedes v1 S4 "14-day no-card" and v2 Trial Terms), AI cost treatment (Part 22 supersedes flat per-tenant COGS assumptions), P&L targets (Part 27 supersedes v2 Part 17.3 milestones — the price card itself stands).

---

## Table of Contents
- [Part 21 — Freemium Trial + Signup Legal Gate (card-on-file, everything signed)](#part-21)
- [Part 22 — AI Token Economics: Metering, Grants & Pay-As-You-Go](#part-22)
- [Part 23 — SOC 2-Ready Architecture (Control Map + AWS Evidence Fabric)](#part-23)
- [Part 24 — Public API Platform & Integration Surface](#part-24)
- [Part 25 — AWS Build-Accelerator & Cost-Optimization Register (full scan)](#part-25)
- [Part 26 — Kiro Handoff Protocol (researched, all stages)](#part-26)
- [Part 27 — Profit Governance: Engineering the >50% Net Margin](#part-27)
- [Part 28 — Updated Kiro Spec Inventory (v3 delta)](#part-28)
- [Appendix D — New-Service Justifications (v3 delta)](#appendix-d)

---

<a name="part-21"></a>
## Part 21 — Freemium Trial + Signup Legal Gate **[SUPERSEDES v1 S4 trial, v2 Trial Terms]**

### 21.1 The new trial model: 7-day full trial, card required, everything signed

| Parameter | v3 rule | Rationale |
|---|---|---|
| Trial length | **7 days**, full IMS Pro scope | Shorter window + card-on-file compresses decision time and filters tire-kickers; the Snapshot + seeded workspace deliver the aha in minutes, so 7 days is ample |
| Payment method | **Credit card required at signup** (SetupIntent — $0 authorization, tokenized by Stripe, never charged during trial) | Kills serial-trial abuse at the root (Part 12.2 risk scoring becomes a second layer, not the only layer); card fingerprint becomes the strongest dedup key |
| Conversion | **Auto-converts to the selected plan on day 8** unless canceled | Standard SaaS negative-option — but see 21.3 compliance rules |
| Token grant during trial | Trial token allowance = 25% of the Pro monthly grant (Part 22) | Caps worst-case trial COGS at ~$15–$20/trial |
| Freemium tail | Canceled/expired trials fall to a **Free Reader tier**: read-only access to their generated Snapshot, their imported documents (view-only), and the Trust Center of others; zero agent invocations, zero seats beyond the owner | Preserves the reactivation asset at near-zero COGS (static reads only) — "freemium" that never threatens the >50% margin goal |

### 21.2 Signup legal gate — the "everything signed before entry" ceremony

The v1 S4 screen gains a **Legal Acceptance Step** between password and card. Design constraint: maximum protection with minimum perceived friction (one screen, ~15 seconds):

```
S4a  Account (email verified, password, name, company)
S4b  LEGAL GATE — single screen:
      • Scrollable consolidated summary panel ("the 8 documents you're agreeing to")
        with expandable full text per doc: ToS (incl. Delaware law + arbitration +
        class waiver), EULA*, AI Output Terms, AUP, Privacy Policy, DPA, Trial
        Terms (incl. auto-conversion disclosure), and — if partnerRef present —
        the referral-attribution notice
      • ONE checkbox per legally-distinct consent cluster (counsel decides the
        clustering; architecture supports N checkboxes): unticked by default,
        no pre-checks (unenforceable in most jurisdictions)
      • Explicit auto-renewal disclosure adjacent to the card step: trial length,
        exact charge amount + date, and cancellation method — restated in the
        confirmation email (negative-option / click-to-cancel compliance, 21.3)
S4c  CARD — Stripe Elements SetupIntent; risk score (Part 12.2) may add 3DS challenge
→ every consent = legal.accepted event {docId, docVersion, checksum(docText),
  userId, ip, userAgent, ts} → hash-chained AUDITLOG → WORM seal (v2 Part 12.1)
→ tenant provisioning fires (v1 Part 6) — the ceremony costs the user ~30s total
```

*EULA: added to the v2 Part 12.1 stack as a distinct instrument covering the software-license grant (limited, non-exclusive, non-transferable, revocable), prohibition on decompilation/derivative works, and license termination mechanics — belt-and-suspenders alongside the ToS for maximum enforceability.

**Litigation posture achieved:** for any future dispute Cumplify produces (a) the exact document text hash the user accepted, (b) proof of affirmative action (checkbox events, not browsewrap), (c) card-verified identity, (d) the immutable chain proving none of it was altered. Combined with v2's automated chargeback-evidence pack, this is the "protect at all cost" perimeter: **contract formation itself is cryptographic evidence**.

### 21.3 Compliance rules for the auto-converting trial (build requirements)

- Clear-and-conspicuous pre-charge disclosure (amount, date, frequency) at S4b/S4c and in the welcome email; **day-5 reminder email** ("your trial converts in 2 days — cancel in one click") — a churn-risk that is also the single best chargeback-rate reducer; **cancellation must be as easy as signup**: one click in Settings → Billing, no retention call, immediate confirmation email (click-to-cancel posture); refund policy: no refunds post-conversion except statutory, but the day-5 reminder makes that defensible.
- Funnel impact accepted and re-baselined: card-required trials start ~2–4× fewer trials but convert trial→paid ~2–3× higher with near-zero abuse; v1 Part 1 metrics update — Snapshot→email target unchanged (>45%), email→trial-start re-set to >25%, trial→paid re-set to **>35%** (card-qualified cohort).

---

<a name="part-22"></a>
## Part 22 — AI Token Economics: Metering, Grants & Pay-As-You-Go **[NEW — margin-protection core]**

Principle: **plans include exactly the AI volume that is economically safe; everything beyond is revenue, not risk.** AI usage flips from Cumplify's largest variable cost to a second monetization axis.

### 22.1 The unit: Cumplify AI Credits (CAC → named "Actions" in UI, "credits" in billing)

Raw Bedrock tokens are the metering substrate but a terrible customer unit (per-model prices differ by orders of magnitude — Nova Micro to frontier models spans ~400×). Cumplify meters internally in tokens per model, and bills in **Credits**, where 1 Credit = normalized cost unit with per-model weights maintained in a pricing table (`MODELWEIGHT#` items):

```
credits_consumed = Σ over invocations [ (input_tokens × w_in(model) +
                    cached_read_tokens × w_cache(model) +
                    output_tokens × w_out(model)) ]
weights calibrated so 1,000 Credits ≈ $1.00 raw Bedrock cost at current prices;
weights are versioned + repriceable without touching plan definitions.
```

### 22.2 Included grants (sized to protect margin) + PAYG overage

| Tier | Monthly included Credits | Worst-case included AI-COGS | % of plan price | Overage |
|---|---|---|---|---|
| Trial (7d) | 15,000 | ≈ $15 | — | none (hard stop → upgrade prompt) |
| Launch $449 | 30,000 | ≈ $30 | 6.7% | **Credit Packs** |
| IMS Pro $949 | 70,000 | ≈ $70 | 7.4% | Credit Packs |
| Enterprise | 200,000 base, contract-custom | ≈ $200 | ≤9% | contracted rate |
| **Credit Packs (PAYG)** | 25,000 Credits = **$99** · 100,000 = **$349** · auto-refill optional | raw cost ≈ $25 / $100 | — | **≈ 71–75% gross margin on overage** (≈4× markup — in line with usage-priced AI SaaS norms and the margin mandate) |

Grant design rules: (1) included-AI-COGS ceiling ≤ **9% of plan price** at worst-case consumption — hard constant in the pricing config, alarm if any tier drifts; (2) grants sized so the median tenant uses 55–70% of grant (headroom = perceived generosity; overage = whale monetization); (3) unused Credits do not roll over (monthly reset; Enterprise may negotiate quarterly pooling); (4) UX: Credits meter in Settings → Billing with per-agent/per-module consumption breakdown, projection line, and soft-limit banner at 80% — **transparency is the anti-bill-shock strategy** and the upsell surface.

### 22.3 Metering architecture (verified AWS pattern)

```
Every Bedrock call (agents + Snapshot + editor AI) goes through ONE invocation
layer: the bedrock-invoker Lambda / action-group wrapper, which:
 1. Attaches the tenant's **application inference profile** (per-tenant Bedrock
    profile, cost-allocation tagged tenantId+plan) AND Converse requestMetadata
    {tenantId, agent, module, feature} — the AWS-documented dual pattern for
    multi-tenant Bedrock cost attribution
 2. Pre-checks the tenant's Credit balance (DynamoDB METER#<tenant>#<yyyymm>
    item, atomic ADD counters; Redis-cached read for the hot check)
    — soft limit: allow + banner event; hard limit (grant exhausted, no PAYG
    auto-refill, not Enterprise): agent work queues PAUSED_FOR_CREDITS, user
    notified with one-click pack purchase; safety exception: incident-reporting
    and HITL-approval flows NEVER block on credits (compliance-safety > billing)
 3. Post-invocation: exact token counts from the Bedrock response → atomic meter
    update + telemetry.credits.consumed event → Firehose→S3→Athena (reuses v1
    Part 8 pipe; Bedrock invocation logs + the Glue-style ETL pattern remain the
    monthly reconciliation source of truth vs the real AWS bill)
 4. Monthly close job: reconcile metered Credits vs actual Bedrock cost per
    tenant (target drift <3%), recalibrate weights if needed, post overage
    invoices via Stripe metered billing
```

Fairness/efficiency rules that make grants go further (customer-visible win, COGS win): **prompt caching on every agent system prompt and ISO-KB preamble** (cached reads billed to tenants at the discounted weight — honesty compounds trust), Nova-first routing per the agent catalog, batch inference for non-interactive nightly jobs (readiness re-scores, recurrence scans) — none of which changes any spine contract.

---

<a name="part-23"></a>
## Part 23 — SOC 2-Ready Architecture **[FORMALIZES v1 Part 9 roadmap]**

"SOC 2-ready" = at GA, a Type I engagement can start without remediation: controls exist, operate, and **generate their own evidence**. Trust Services Criteria in scope: **Security (mandatory) + Availability + Confidentiality** (Processing Integrity added at Type II given our immutability story is literally a processing-integrity control).

### 23.1 Control map (criteria → existing architecture → evidence source)

| TSC area | Control (already architected) | Evidence source (automated) |
|---|---|---|
| CC1/CC2 Governance | Policies authored & version-controlled in Cumplify's own tenant (v2 Part 18.4); role definitions (v2 Part 13) | M1 controlled docs + acknowledgments |
| CC3/CC4 Risk & monitoring | Cumplify's own M5 risk register; Security Hub findings triaged as NCs into M2 | Security Hub → EventBridge → NC records |
| CC5 Control activities | SoD engine, HITL gates, permission sets | AUDITLOG events |
| CC6 Logical access | Cognito MFA policy, ABAC, quarterly **access reviews** (new: scheduled review job generates the user-role attestation packet; IMS Lead signs via e-sig) | Review records in M4 |
| CC6.6/6.7 Encryption & boundaries | 8 CMKs, TLS, VPC endpoints, WAF | AWS Config rules (conformance pack) |
| CC7 Ops & incidents | GuardDuty + Security Hub + CloudWatch alarms → incident runbooks → incidents logged in M2 (10.2!) | Incident records + postmortems in M1 |
| CC8 Change management | CDK Pipelines only path to prod, PR review required, CDK Nag = fail, pipeline approvals staging→prod | CodePipeline history + CloudTrail |
| CC9 Vendor mgmt | Subprocessor register in Cumplify's own M8 (LegalLedger manages our vendors — dogfood) | M8 register + evaluations |
| A1 Availability | SLOs, DR runbooks + quarterly game day (v1 Part 10), **AWS Backup** plans (RDS/DynamoDB/S3 non-WORM) with vault-lock | Backup job reports, game-day records in M4 |
| C1 Confidentiality | Tenant isolation battery (v1 Part 9), retention & disposition engine, legal hold | Isolation integration tests in CI + M4 |
| PI (Type II) | Hash-chained append-only trail + WORM | Chain-verification job report (daily) |

### 23.2 The AWS evidence fabric (new SecurityStack additions — Appendix D)

Organization-wide **CloudTrail** (all 3 accounts → central WORM'd log bucket in prod boundary) · **AWS Config** with the *Operational Best Practices for SOC 2* conformance pack per account · **Security Hub** (CIS + AWS Foundational standards, cross-account aggregation) · **GuardDuty** all accounts (extends v2's S3 malware protection) · **Amazon Inspector** (Lambda + ECR scanning) · **IAM Access Analyzer** (external-access findings = auto-NC) · **AWS Audit Manager** with the SOC 2 framework — continuous evidence collection mapped to controls, cutting audit-prep to review-and-export · **AWS Backup** with vault lock. Auditor-facing: evidence exports + our own Trust Center; the sales line remains *our SOC 2 runs on Cumplify*.

Engineering rule: every new Kiro spec's design.md must fill a "SOC 2 impact" section (which criteria touched, which evidence emitted) — enforced by steering file `11-soc2.md`.

---

<a name="part-24"></a>
## Part 24 — Public API Platform & Integration Surface **[NEW]**

The enterprise checklist item CertifyAero conspicuously lacks (their data exits only as CSV/PDF). Cumplify ships a versioned, documented, entitlement-gated public API from P3.

### 24.1 Architecture

```
api.cumplify.ai → API Gateway REST API [extends the existing GrowthStack API GW
footprint — same service, new API + usage plans]
 • AuthN: OAuth2 client-credentials via Cognito app clients per tenant
   (machine identity) OR scoped API keys (Settings → Security, v2 Part 14.1);
   every token/key carries tenantId + scopes → same Lambda-authorizer ABAC path
   as AppSync — ONE authorization brain, two front doors
 • Scopes: read:documents write:documents read:capa write:capa read:risks
   read:forms write:form-submissions read:audit-trail read:readiness
   webhooks:manage — granted per key, plan-gated (read-only on Launch;
   read/write on Pro; full incl. webhooks + SCIM on Enterprise)
 • Rate limits: API GW usage plans keyed per tenant per plan
   (Launch 60 rpm / Pro 300 rpm / Enterprise contracted) + burst; 429 with
   Retry-After; per-key analytics into the telemetry pipe
 • Versioning: /v1 path prefix; additive-only within v1; deprecation policy
   published (12-month sunset, header warnings)
 • Spec: OpenAPI 3.1 published at api.cumplify.ai/docs (redoc static on the
   growth bucket); Postman collection; the OpenAPI file IS a Kiro contract
   artifact (Phase-1 contract rule, v1 Part 11)
```

### 24.2 Endpoint catalog v1 (maps 1:1 to existing AppSync resolvers — thin REST adapters, no new business logic)

| Resource | Endpoints | Notes |
|---|---|---|
| Documents (M1) | `GET/POST /v1/documents`, `GET /v1/documents/{id}`, `GET .../versions`, `POST .../submit-for-approval` | Publishing stays HITL-in-app (approval cannot be API-bypassed — a *feature*, documented) |
| CAPA (M2) | `GET/POST /v1/nonconformities`, `POST /v1/nonconformities/{id}/actions`, `GET /v1/capas?status=` | ERP/MES can raise NCs programmatically — the killer integration |
| Risks (M5) | `GET /v1/risks`, `POST /v1/risks` | |
| Incidents/Hazards (M10) | `POST /v1/incidents`, `POST /v1/hazards` | Lets safety kiosks/apps feed 45001 directly |
| Forms (M14) | `GET /v1/forms`, `POST /v1/forms/{id}/submissions` | IoT/monitoring feeds → 9.1.1 data |
| Suppliers (M12) | `GET/POST /v1/suppliers`, `POST .../evaluations` | ERP vendor-master sync |
| Training (M13) | `POST /v1/training-records` | LMS integration |
| Readiness & audit trail | `GET /v1/readiness`, `GET /v1/audit-events?since=` (read-only, chain-verifiable export) | BI tools; certification-body evidence pulls |
| Webhooks out | `POST /v1/webhooks` (subscribe to the public subset of the event taxonomy; HMAC-signed deliveries, retries + DLQ, per-endpoint secret) | EventBridge rule → delivery Lambda — the bus we already run becomes the product |

Every API write flows through the identical mutation path (RLS, entitlements, audit events) — the API is a **door, never a tunnel**.

---

<a name="part-25"></a>
## Part 25 — AWS Build-Accelerator & Cost-Optimization Register **[NEW — full scan, researched]**

Two lists, both binding: **adopt** (accelerates the build or cuts cost, decision made) and **evaluate** (spike ticket in backlog). Everything else surveyed is consciously excluded to protect the verified-stack discipline.

### 25.1 ADOPT — build accelerators

| Asset | What it gives Cumplify | Where |
|---|---|---|
| **SaaS Builder Toolkit (SBT-AWS)** — awslabs CDK toolkit | Codified control-plane/app-plane split over EventBridge: tenant provisioning/management constructs, **tiering** construct (maps to our entitlements), and an **AWS Marketplace SaaS product construct** (registration API, subscriber table, entitlement event handling) for the future Marketplace channel | Evaluate-then-adopt in `tenant-lifecycle` + `billing-entitlements` specs: adopt its interface definitions & Marketplace construct; keep our Step Functions saga where SBT is thinner than our needs |
| **Multi-tenant GenAI gateway guidance** (aws-solutions-library sample) | Reference CDK for per-tenant Bedrock usage/cost tracking behind API GW — validates and jump-starts Part 22.3 | `ai-token-metering` spec seed |
| **Bedrock Converse requestMetadata + application inference profiles** | The documented pattern for per-tenant token/cost attribution incl. cache read/write pricing in the ETL | Part 22.3 (already designed in) |
| **Powertools for AWS Lambda** | Structured logging, tracing, idempotency, metrics decorators — uniform across ~all Lambdas; the idempotency utility replaces hand-rolled patterns everywhere except the AUDITLOG (which keeps `attribute_not_exists` by design) | steering `06-cdk-conventions.md` |
| **CDK Nag + AwsSolutionsChecks** | Already spine law | — |
| **AWS Activate** | Startup credits (up to six figures for eligible programs) against the ~$4.5k/mo base — pursue before prod spend ramps | Ops task, pre-P0 |

### 25.2 ADOPT — cost levers (with the margin math they protect)

| Lever | Mechanism | Expected effect |
|---|---|---|
| **Bedrock prompt caching** | Cache checkpoints on static system prompts + ISO-KB preambles; cached reads at ~90% discount; works with cross-region inference (our Sonnet profile) | Benchmarked ~49% inference savings from caching alone on Nova; our agent prompts are long and stable — the single biggest COGS lever |
| **Bedrock batch inference** | 50% off on-demand for async jobs ≤24h SLA: nightly readiness re-scores, recurrence scans, pain-intelligence distillation, KB re-embeds | ~15–25% of our inference volume is batchable |
| **Nova-first model routing** (+ evaluate Intelligent Prompt Routing / distillation at scale) | Catalog already assigns Nova Pro/Lite; add Nova **Micro** for classification/routing micro-tasks (NCTriage-class work) — Micro is ~400× cheaper than frontier models on input tokens | Guards the ≤9% AI-COGS ceiling |
| **Aurora Serverless v2 auto-pause to 0 ACU** | Enable on dev/staging clusters (idle nights/weekends → $0 compute); prod floor 0.5 ACU | Cuts the ~40% non-prod overhead materially |
| **Lambda on Graviton (arm64)** | ~20% better price-perf, one CDK prop | Default in conventions |
| **S3 Intelligent-Tiering + lifecycle** | Evidence/exports auto-tier; growth bucket 30-day expiry already set; WORM archive → Glacier-class tiers after seal | Storage flatlines |
| **CloudWatch discipline** | Log retention 30d default (audit-relevant logs go to the trail, not CloudWatch), Infrequent-Access log class for chatty agent logs, metric filter budget | Observability ≠ second data lake |
| **VPC endpoints over NAT** | Already spine (AOSS/Bedrock/KMS/Secrets/execute-api endpoints); add S3+DynamoDB gateway endpoints (free) — target: **zero NAT gateways** in steady state | Removes the classic $32/mo/AZ + per-GB silent tax |
| **Compute Savings Plan** | 1-yr no-upfront once P2 traffic baselines (~month 4) | ~20% off Lambda/Fargate |
| **Cognito tier choice** | Stay on Essentials-equivalent features; Plus-tier features (advanced security) only if SOC 2 auditor requires — price per MAU differs sharply | Identity cost linear & low |
| **Budgets + Cost Anomaly Detection + per-tenant unit-cost dashboard** | Alarms at account + per-service; anomaly alerts to on-call; tenant unit cost from Part 22 reconciliation | The >50% net goal gets a pager |

### 25.3 EVALUATE (spikes, not commitments)

Bedrock **Intelligent Prompt Routing** (quality-sensitive — A/B behind a flag) · **Model distillation** of high-volume agent tasks onto smaller students (claims up to ~75% cost cut at <2% quality loss — revisit at >$2k/mo inference) · **Bedrock Agents provisioned throughput** (only if latency SLOs demand) · **AWS Marketplace listing** via the SBT construct (P4+ channel) · **QuickSight** over the Athena layer (only when saved queries stop sufficing).

---

<a name="part-26"></a>
## Part 26 — Kiro Handoff Protocol **[NEW — researched against Kiro docs & field practice]**

This project is large; Kiro's own guidance shapes the handoff: **many small specs, never one monolith** (Kiro's best-practices doc recommends multiple specs per repo over a single codebase-spec); three artifacts per spec (`requirements.md` → `design.md` → `tasks.md`); **steering** as persistent project memory (`.kiro/steering/`, default topology product/structure/tech plus custom files); **agent hooks** for event-triggered automation; **MCP servers** for live AWS context; specs **committed to the repo** as first-class code; and the discipline that manual out-of-band changes must be back-ported into specs ("ask Kiro to refresh") or the agent drifts.

### 26.1 Repository & artifact topology

```
cumplify/                          # monorepo, single CDK app (spine pipeline rule)
├── .kiro/
│   ├── steering/                  # 12 files — the constitution (26.2)
│   ├── specs/                     # one folder PER SPEC from the inventory
│   │   ├── platform-foundation/{requirements,design,tasks}.md
│   │   ├── ai-token-metering/...
│   │   └── ... (specs 1–26)
│   └── hooks/                     # 26.4
├── docs/architecture/             # THIS document set (spine + v1 + v2 + v3) —
│   │                              # referenced from steering via #[[file:...]]
├── infra/  services/  frontend/  contracts/ (OpenAPI, GraphQL schema, event taxonomy)
└── .vscode/mcp.json               # 26.5
```

### 26.2 Steering set (final — v1's 00–07, v2's 08–10, plus)

`11-soc2.md` (every design.md fills the SOC 2 impact section) · `12-token-metering.md` (every Bedrock call goes through the invoker layer; no direct InvokeModel anywhere else — a one-paragraph rule that protects the entire Part 22 economics) · `13-testing.md` (test-first ordering — field practice: without an explicit testing steering file Kiro defaults tests to last and over-engineers them; state the pyramid, the tenant-isolation integration suite as mandatory, and "keep it simple" explicitly) · `14-simplicity.md` (Kiro tends to expand scope; bind it: no service outside Appendices A/C/D, no new pattern where a steering pattern exists, flag-don't-implement for anything ambiguous). Default `product.md`/`tech.md`/`structure.md` are generated once from the architecture docs and then hand-curated.

### 26.3 Per-spec workflow (all stages)

1. **Author `requirements.md`** — seeded by pasting the relevant Part(s) of these documents; EARS-style acceptance criteria; the v2 Part 18 eQMS register and Part 23 control map paste in as verbatim acceptance criteria where applicable.
2. **Run Kiro's requirements analysis** — its deep-analysis pass (catches inconsistencies/ambiguities/conflicts) is explicitly recommended for compliance-sensitive domains; for this project it is **mandatory on every spec**, not optional.
3. **`design.md`** — must cite which steering rules it exercises + SOC 2 impact + cost impact (the cost-check hook enforces the latter).
4. **Human gate** — review requirements+design before any task generation (Quick Plan's no-gate mode is banned for this repo except docs-only specs).
5. **`tasks.md` → execution** — use Kiro's dependency-wave engine (Run all Tasks builds a task dependency graph and executes independent tasks concurrently in waves); per-wave human review of diffs; property-based test validation where Kiro offers it.
6. **Sync discipline** — any manual change gets back-ported ("refresh the spec"); specs and code merge together in the same PR; spec drift is a review-blocking defect.
7. **Interface split** — Kiro IDE for local feature work; **Kiro CLI in CI** for pipeline-adjacent automation; **Kiro web autonomous/cloud sessions** reserved for long-running low-risk streams (docs generation, test backfills) — never for SecurityStack or billing code (human-gated domains list lives in `14-simplicity.md`).

### 26.4 Agent hooks (event-driven quality gates)

| Hook | Trigger | Action |
|---|---|---|
| `test-sync` | backend file saved | Update/execute the paired test per `13-testing.md` |
| `security-scan` | any IAM/policy/auth file saved | Review against `01-tenancy-rules`/`03-auth-modes`/`11-soc2`; report by severity |
| `cost-check` | any `infra/**` file saved | Estimate cost delta via AWS Pricing MCP; append to cost log; **flag if > $200/mo delta** (Part 27 guard) |
| `spec-drift` | code merged touching a spec's files | Verify tasks.md status + acceptance criteria still hold; open a refresh task if not |
| `clause-integrity` | any file containing `clauseRef` saved | Validate clause number+title against the canonical spine list (no invented clauses — ever) |

### 26.5 MCP servers

AWS Documentation MCP (live service docs), AWS API MCP (read-only account inspection in dev), **AWS Pricing MCP** (feeds cost-check), aws-diagram MCP (architecture diagrams from code). Config committed; servers pinned by version.

### 26.6 Phase mapping (all stages of the v1 Part 11.3 plan under Kiro)

P0: specs 1,2,5 sequentially (foundation contracts must settle before parallelism) → from P1 onward, run **2–3 specs in parallel** max (matches the pipeline's stage cadence and keeps human review real); each phase closes with the quality-gate checklist from v1 Part 11.3 executed as its own tiny spec (`phase-N-gate`) so even the gates are traceable artifacts. Handoff completeness test: a new engineer (or a fresh Kiro session) given only the repo must be able to answer "why is every AOSS call wrapped in a 45s retry budget?" from steering alone — if any architectural why lives only in someone's head, it goes into steering.

---

<a name="part-27"></a>
## Part 27 — Profit Governance: Engineering the >50% Net Margin **[SUPERSEDES v2 17.3 targets]**

### 27.1 The margin equation (post-v3 structure)

Variable load per revenue dollar drops under v3: AI COGS is now grant-capped at ≤9% of plan price *and* offset by overage revenue at ~71–75% GM; prompt caching + batch + Nova-first cut the raw cost inside those grants by an estimated 35–50%.

| Line | % of revenue (steady state) | Basis |
|---|---|---|
| AI COGS (net of overage margin) | 5–7% | Part 22 ceiling + Part 25 levers |
| Other AWS variable + base amortized | 3–5% | Part 25 register |
| Stripe | ~3% | |
| Affiliate (blended) | 10–11% | v2 Part 16.2, 45% attach |
| **Total variable** | **21–26%** | |
| Fixed OpEx | $40,000/mo | Given |
| Gross margin | **≈ 74–79%** | Healthy-SaaS band, sustains the affiliate rate |

### 27.2 Net-margin milestones

Net margin = 1 − variable% − (fixed ÷ revenue). At 24% blended variable:

| Net margin | Required MRR | ≈ Tenants (ARPA $820 + overage uplift ~6% → effective $869) | Note |
|---|---|---|---|
| 0% (break-even) | $52.6k | ≈ 61 | Improved vs v2's 71 — token capping + cost levers did that |
| 25% | $78.4k | ≈ 90 | |
| **50% (mandate)** | **$153.8k** | **≈ 177** | 40k ÷ (0.76 − 0.50); at 45% affiliate-sourced this is ~80 partner-sourced tenants — why Part 16 is a P2 deliverable, not a nice-to-have |
| 50% with OpEx creep to $55k | $211.5k | ≈ 243 | The honest scenario once support/CS hires land — plan against this line |

### 27.3 The governance loop (margin as an alarmed system, not a hope)

Monthly close (extends Part 22.3's reconciliation): per-tenant contribution margin published to the ops dashboard; **four tripwires page the founder**: (1) any tier's included-AI-COGS > 9% of price for 2 consecutive months → shrink grant or reprice pack; (2) blended variable > 27% → lever review (caching hit-rate, batch share, Nova-mix); (3) fixed-cost growth outpacing MRR growth 2 quarters running; (4) infra cost-check hook cumulative deltas > $500/mo in a phase without a pricing offset. Rule of the house: **no feature ships without its unit-cost line** — the cost-check hook (26.4) makes this mechanical, and the >50% net mandate becomes an engineered invariant instead of a quarterly surprise.

---

<a name="part-28"></a>
## Part 28 — Updated Kiro Spec Inventory (v3 delta)

| # | Spec | Contents | Phase |
|---|---|---|---|
| 24 | `signup-legal-gate` | S4a–c flow, EULA addition, consent-event pipeline, SetupIntent card capture, day-5 reminder, click-to-cancel, Free Reader tier | P2 (gates launch, replaces parts of spec 15/22 scope) |
| 25 | `ai-token-metering` | Invoker layer, application inference profiles, Credit meter + limits, packs via Stripe metered billing, reconciliation close, consumption UI | P2 — **before public traffic**, since it is the margin control |
| 26 | `public-api-v1` | REST adapters, OAuth2/keys, usage plans, OpenAPI, webhooks out | P3 |
| 27 | `soc2-evidence-fabric` | Org CloudTrail, Config conformance pack, Security Hub, Inspector, Access Analyzer, Audit Manager, Backup+vault lock, access-review job | P2 (Security-criteria core) → P4 (Audit Manager polish) |
| 28 | `cost-governance` | Budgets, anomaly detection, unit-cost dashboard, Savings Plan analysis, auto-pause configs, caching/batch enablement | P1 (levers on from the start) |

Steering additions `11–14` and hooks per Part 26 land in P0 alongside spec 1.

<a name="appendix-d"></a>
## Appendix D — New-Service Justifications (v3 delta, one line each)

| Service **[NEW in v3]** | Justification |
|---|---|
| **AWS Config (+ SOC 2 conformance pack), Security Hub, Amazon Inspector, IAM Access Analyzer, AWS Audit Manager, org-wide CloudTrail, AWS Backup (vault lock)** | The SOC 2 evidence fabric — security/audit tooling only; no data-plane or application services added; findings route into the existing EventBridge→M2 path. |
| **Bedrock application inference profiles / prompt caching / batch inference / Nova Micro** | Native Bedrock features and one additional verified-family model ID — per-tenant cost attribution and the Part 25 cost levers; no new service. |
| **Stripe metered billing / SetupIntent** | Existing PSP capabilities for Credit Packs and card-on-file trials; no new vendor. |
| **SBT-AWS (awslabs), Powertools for Lambda** | Open-source CDK/runtime libraries, not services; license review recorded in Cumplify's own M8 register per v2 convention. |

---

*End of v3 extensions. Spine (7 docs) + v1 + v2 + v3 = the complete, Kiro-executable build context. Precedence: v3 > v2 > v1 > spine.*

---

<!-- ===== SOURCE: cumplify-e2e-architecture-v4-extensions.md ===== -->

# Cumplify.ai — Master Architecture v4.0 Extensions

**Document:** `cumplify-e2e-architecture-v4-extensions.md`
**Version:** 4.0 · 2026-07-01
**Status:** Authoritative additions/overrides to v1–v3 + spine. Precedence: **v4 > v3 > v2 > v1 > spine**. Overrides in this doc: trial length & trial-token policy (Part 29 supersedes v3 Part 21.1 rows 1 and 4), model assignments (Part 30 amends the agent catalog's Sonnet assignments), Cognito pool topology (Part 32 makes the spine's "3 User Pools" explicit and binding), launch languages (Part 31 supersedes v2 Part 19's "launch EN+ES" row).

---

## Table of Contents
- [Part 29 — Trial v2: 14 Days, Card On File, Token-Gated Economics](#part-29)
- [Part 30 — Model Policy: Nova-First, Anthropic-by-Exception](#part-30)
- [Part 31 — Trilingual Launch: EN · ES · PT](#part-31)
- [Part 32 — Identity Topology: 3 Hard-Separated User Pools + Standards Update Manager](#part-32)
- [Part 33 — Customer Support Plane: Amazon Connect](#part-33)
- [Part 34 — Updated Kiro Spec Inventory (v4 delta)](#part-34)
- [Appendix E — New-Service & Model Justifications (v4 delta)](#appendix-e)

---

<a name="part-29"></a>
## Part 29 — Trial v2: 14 Days, Card On File, Token-Gated Economics **[SUPERSEDES v3 21.1 rows 1, 4]**

The v3 flag-a concern (card-required trials cut trial starts) is resolved not by removing the card but by **restoring the 14-day window and letting tokens — not time — be the real governor**. Time generosity recovers top-of-funnel psychology; the token grant caps the COGS exposure; and a trial user hitting the token wall is the highest-intent buyer in the funnel.

| Parameter | v4 rule |
|---|---|
| Trial length | **14 days**, full IMS Pro scope, card on file (SetupIntent, $0 auth — unchanged from v3) |
| Trial token grant | **15,000 Credits** (unchanged absolute size ⇒ worst-case trial AI-COGS still ≈ $15, now amortized over 14 days). Grant is front-loaded intentionally: the Snapshot seeding + first-week agent work consume ~8–10k Credits, leaving a taste of week-2 scarcity |
| On grant exhaustion | Agents pause (`PAUSED_FOR_CREDITS`, v3 22.3 semantics; safety flows never block) and the trial user is offered **in-trial Credit Pack purchase** — the standard packs (25k = $99), charged to the card on file immediately. **An in-trial pack purchase is the strongest conversion signal in the system**: it fires `trial.credits.purchased`, flips the tenant health score to hot, and triggers the convert-early offer (buy now, get the unused trial days added to the first billing period) |
| Read access | Never token-gated: registers, documents, dashboards, audit trail remain fully usable when Credits = 0 — the *system of record* stays alive; only *agent labor* is metered. This distinction is the product's honesty and the margin's protection in one rule |
| Conversion | Auto-convert day 15 unless canceled; day-12 reminder (was day-5) per v3 21.3 click-to-cancel posture |
| Funnel metrics re-baseline | Snapshot→email >45% (unchanged) · email→trial-start **>30%** (14-day framing recovers volume vs v3's >25%) · trial→paid **>32%**, plus new metric: in-trial pack attach rate (target >8% of trials — each attach is both revenue and a ~90%-probability conversion) |

P&L note (feeds v3 Part 27 governance): trial COGS ceiling unchanged; in-trial pack revenue is new margin (~73% GM) that v3's model didn't count — the 50%-net milestone math only improves. No other v3 Part 27 figures change.

---

<a name="part-30"></a>
## Part 30 — Model Policy: Nova-First, Anthropic-by-Exception **[AMENDS agent-catalog assignments]**

Binding rule: **every model assignment defaults to the Amazon Nova family. An Anthropic model may be used only with a written, evaluated justification held in the Model Justification Register.** This is simultaneously a cost rule (Part 22/25 economics), a sovereignty rule (single model family = simpler quota, pricing, and prompt-portability posture), and a discipline rule (prevents silent frontier-model creep).

### 30.1 The Nova ladder (verified family, cross-region profiles)

| Model | Profile | Cumplify duty class |
|---|---|---|
| Nova Micro | `us.amazon.nova-micro-v1:0` | Classification, routing, triage micro-tasks (NCTriage-class), telemetry summarization |
| Nova Lite | `us.amazon.nova-lite-v1:0` | Lightweight agents (RecordsVault, ObjectiveTracker, ContextCartographer, SupplierScout, CompetenceKeeper, EmergencyPlanner, WorkerVoice) — unchanged from catalog |
| Nova Pro | `us.amazon.nova-pro-v1:0` | Workhorse agents (ControlTower, DocStudio, LeadAuditor, CAPAGuru, RiskSentinel, AspectWarden, HazardScout, IncidentInvestigator, ReviewOrchestrator, ComplianceCopilot) — unchanged |
| **Nova Premier** | `us.amazon.nova-premier-v1:0` | **New rung**: highest-reasoning Nova — the mandatory first candidate for any duty previously assigned Sonnet |

### 30.2 Re-assignment of the four Sonnet seats (catalog amendment)

| Agent | Was | v4 assignment | Disposition |
|---|---|---|---|
| ISO9001 Domain Guru | Claude Sonnet 4.6 | **Nova Premier** | Clause Q&A is retrieval-grounded (ISO-KB does the heavy lifting); eval gate 30.3 confirms parity before P1 exit |
| ISO14001 Domain Guru | Claude Sonnet 4.6 | **Nova Premier** | Same |
| ISO45001 Domain Guru | Claude Sonnet 4.6 | **Nova Premier** | Same |
| **LegalLedger** (M8) | Claude Sonnet 4.6 | **Claude Sonnet 4.6 — RETAINED, justified** | The one standing exception: statutory/legal-text interpretation across three jurdisdiction-heavy domains (14001 6.1.3 compliance obligations, 45001 6.1.3 legal & other requirements, 9.1.2 evaluation of compliance) is the platform's highest-consequence reasoning task — a wrong obligation mapping is a customer's regulatory exposure. Exception expires each quarter unless re-validated by the 30.3 eval (Nova Premier is re-benchmarked against it every cycle; the day it passes, the seat flips) |

Snapshot pipeline, editor AI, pain-distiller: already Nova (Pro/Lite) — unchanged. Cross-region Sonnet profile plumbing (`us.anthropic.claude-sonnet-4-6`) remains in the AiStack but scoped to exactly one agent's IAM boundary.

### 30.3 The Model Justification Register + eval gate (the "must be able to justify why" mechanism)

- A `MODELEXCEPTION#` record per non-Nova assignment: duty description, why the Nova ladder fails it, eval evidence, cost delta, owner, expiry (max 1 quarter). Stored in Cumplify's own tenant (dogfood: it's a documented decision under our own 7.5) and surfaced in the ops dashboard.
- **Eval harness** (extends spec 25's scope): golden-set benchmark per agent duty (clause-accuracy set for Gurus — 150 Q&A pairs per standard with clause-citation scoring; obligation-mapping set for LegalLedger), run on every model-candidate and every quarterly re-validation via Bedrock model evaluation jobs + human spot-review. Promotion/demotion is data, not taste.
- Steering enforcement: `15-model-policy.md` — Kiro may not introduce any model outside the Nova ladder in any spec; a Sonnet reference outside LegalLedger's boundary fails review.

---

<a name="part-31"></a>
## Part 31 — Trilingual Launch: EN · ES · PT **[SUPERSEDES v2 Part 19 localization row]**

Launch languages: **English, Spanish, Portuguese** — full product, not UI-only. This targets the Americas + Iberia ISO market (LATAM manufacturing is an underserved, consultant-dense segment — perfect for the Part 16 partner channel).

### 31.1 Localization layers (each is a build requirement)

| Layer | Rule | Implementation |
|---|---|---|
| UI strings | Full catalogs EN/ES/PT; RTL-ready framework stands (future languages) | next-intl/ICU messages; locale per **user** (profile) with tenant default; pseudo-locale CI check for hardcoded strings |
| **Agent outputs** | Every agent responds in the *requesting user's* locale; documents draft in the *tenant's* document locale (a Settings → Organization field — a Mexican plant may run the IMS in Spanish but publish supplier docs in English) | Locale injected into every invocation context by the bedrock-invoker layer (one choke point, v3 22.3); Nova family is multilingual across all three languages — no per-language model forks |
| **ISO-KB** | Clause Q&A must ground in the user's language without semantic drift: the KB holds the licensed standard text per language where the tenant has entitlement (official ES/PT translations of ISO standards are separately licensed publications — licensing task, pre-P2, tracked in Cumplify's own M8) with metadata `{standard, clause, lang, edition}`; retrieval filters `lang` first, falls back to EN with a "translated from English source" marker | Same AOSS indexes, language metadata dimension; 45s cold-start rule unchanged |
| Clause canon | **Clause numbers and structure are language-invariant** — the canonical spine stays single-source; only titles/text localize. The clause-integrity hook (v3 26.4) validates against the canon regardless of display language | |
| Legal stack | ToS/EULA/AUP/Privacy professionally translated (not machine); **English version controls** clause in all translations (standard practice, Delaware forum unchanged); consent events record the language of the accepted text | Counsel deliverable, P2 gate |
| Funnel & Snapshot | S0–S5 fully localized incl. pain-picker options; Pain-Point Intelligence Engine (v1 Part 5) harvests ES/PT sources too — the pain quotes on the Spanish landing page must be *Spanish-speaking* pain, not translations | Growth-content items carry `lang`; per-locale headline variants |
| Emails, PDFs, Trust Center | Localized templates; controlled-copy stamps localized; Trust Center renders in visitor's language | |
| Support | Part 33 — Connect queues per language | |

Non-goal at launch: per-tenant *mixed* multi-language document sets beyond the document-locale field (roadmap flag; v2 Part 19's broader localization ambition stands as roadmap).

---

<a name="part-32"></a>
## Part 32 — Identity Topology: 3 Hard-Separated User Pools + Standards Update Manager **[BINDS spine D.3's "3 User Pools"]**

### 32.1 The three pools — populations that never cross

The spine mandated 3 Cognito User Pools; v4 defines them as **three disjoint trust populations with zero shared identities, zero shared app clients, zero shared tokens**:

| Pool | Population | Groups | Reaches |
|---|---|---|---|
| **Pool A — SaaS Admin** (`cumplify-internal`) | Cumplify staff only: platform ops, support engineers, finance ops | `PlatformAdmin`, `SupportEngineer`, `FinanceOps`, `SecurityOps` | The **internal admin plane only**: a separate AppSync API (or namespaced schema) + separate CloudFront origin (`admin.cumplify.ai`, IP-allowlisted, MFA-mandatory, SSO via IAM Identity Center); tenant-data access only through **break-glass**: time-boxed, ticketed, tenant-notified impersonation grants — every second of it in the immutable trail (SOC 2 CC6 evidence by construction) |
| **Pool B — Tenant Admin** (`cumplify-tenant-admin`) | Per-tenant administrators: IMS Lead, Top Management/Executive, Quality Manager, EHS Manager, Document Controller (v2 Part 13 roles #1–#5) | ISO-role groups (admin subset) | Full tenant app + **all of Settings** (v2 Part 14) including Billing, Users & Roles, Security, and the new **Standards Update Manager** (32.2) |
| **Pool C — Tenant User** (`cumplify-tenant-user`) | Everyone else in the tenant, **grouped by the ISO standards roles** (v2 Part 13 #6–#12): Internal Auditor, External Auditor (guest), Process Owner, Supervisor, Employee/Worker, Contractor, Partner Consultant | ISO-role groups (operational subset) | Tenant app scoped by role ABAC; no Settings beyond own profile & notifications |

**Never-cross enforcement (defense in depth, all four layers):**
1. **Token layer** — each pool has its own app clients, issuer, and JWKS; the AppSync Lambda Authorizer and the API GW authorizers **pin the expected issuer per surface**: the tenant app rejects Pool-A tokens outright; the admin plane rejects Pool-B/C tokens outright. A valid token from the wrong pool is a 401, not a role check.
2. **Claim layer** — PreTokenGeneration (V1_0, ID-token-only, spine rule) stamps `poolClass: internal|tenant-admin|tenant-user`; resolvers assert poolClass in addition to role — belt on top of the issuer braces.
3. **IAM layer** — Pool-A-adjacent roles carry an explicit Deny on tenant-data paths absent an active break-glass grant tag; Pool-B/C principals have no path to admin-plane resources at all.
4. **Human layer** — an email address may exist in at most one pool per environment (provisioning uniqueness check across pools); staff who are also beta customers use a separate identity in a separate test tenant. Cross-pool duplicate detection is a nightly job + alarm.

Upgrade path Pool C → Pool B (e.g., a Quality Manager promoted to IMS Lead) is a **managed migration** (new Pool-B identity, old Pool-C identity disabled, continuity via the same `userId` linkage record) — never an in-place group edit across pools.

### 32.2 Standards Update Manager (Tenant Admin Settings → Standards & Scope) **[NEW feature]**

ISO standards revise (9001:2015 → a future :20xx edition; amendments like the climate-change amendments of 2024). The platform must absorb revisions as a product capability, not a migration crisis:

```
Cumplify side (SaaS Admin plane):
 • The canonical spine becomes VERSIONED: clause canon, ISO-KB embeddings, agent
   prompts, coverage matrix all carry {standard, edition} — e.g. ISO9001:2015 vs
   ISO9001:20xx live side by side; publishing a new edition is a content-ops
   release (KB ingest per language, delta map authored: clause old→new mapping,
   NEW/CHANGED/REMOVED flags), pushed via the pipeline like code
Tenant side (Pool B only):
 • Settings shows: current edition per standard, available editions, transition
   deadline (cert bodies grant multi-year transition windows — displayed)
 • "Start transition" → guided, HITL-gated workflow:
    1. DELTA REPORT — LeadAuditor + Domain Guru generate the tenant-specific gap
       delta: which of THEIR documents/registers cite changed clauses, what the
       new requirements demand (grounded on both editions' KB — 45s AOSS rule)
    2. DUAL-EDITION PERIOD — registers/documents tagged per edition; readiness
       score computed against the TARGET edition; old-edition citations flagged
       inline in the editor
    3. AGENT-DRAFTED UPDATES — DocStudio queues revision drafts per affected
       document (tracked changes, of course); CAPA-style action plan tracks the
       transition to done
    4. CUTOVER — tenant admin signs the edition switch (e-sig, sealed event);
       old-edition artifacts retained immutably (auditors love transition evidence)
 • Every step is Credits-metered normally; a transition is a legitimate usage
   spike the token model monetizes fairly
```

This turns every future ISO revision — an existential churn event for static-template competitors — into a Cumplify **retention and revenue moment**.

---

<a name="part-33"></a>
## Part 33 — Customer Support Plane: Amazon Connect **[NEW]**

Support runs on **Amazon Connect** (justified in Appendix E): omnichannel (chat + voice + tasks), per-language routing, and native AWS integration with the identity and telemetry we already have.

### 33.1 Architecture

```
In-app "Support" (all pools) + support widget on marketing site
 → Amazon Connect chat widget (authenticated sessions pass a signed context
   token: tenantId, plan, locale, health score — via a context Lambda; NEVER
   compliance-record content)
 → L0 DEFLECTION: Connect flow fronts questions to a support-scoped
   ComplianceCopilot endpoint (product how-to + billing FAQ grounding only —
   the ISO advisory Gurus stay inside the product where they're metered;
   support-bot usage is NOT charged to tenant Credits)
 → L1 ROUTING: queues by {language: EN|ES|PT} × {tier: Enterprise-priority |
   standard} × {topic: product|billing|partner}; Enterprise SLA queue honors
   the contracted first-response times; voice enabled for Enterprise +
   billing-dispute callbacks
 → L2 ESCALATION: Connect Tasks → SupportEngineer (Pool A) — any tenant-data
   access from a support case goes through the 32.1 break-glass path, so the
   support tool can never become the isolation leak
 → Records: contact transcripts/recordings to a dedicated CMK-encrypted S3
   support bucket (NOT the WORM evidence bucket; own retention class, in the
   Part 14 retention schedule); post-contact summary + CSAT into the telemetry
   pipe (support cost per tenant joins the unit-cost dashboard — Part 27 loop)
 → Ops: Connect metrics → CloudWatch; support volume by topic feeds the
   Pain-Point Intelligence Engine (v1 Part 5) — *our own tickets are the
   highest-signal pain source of all*
```

Staffing reality at launch scale: one bilingual (ES/EN) support engineer + founder escalation covers the ≤100-tenant era; Connect's pay-per-use pricing means the support plane costs ~tens of dollars/month until volume exists — consistent with Part 27 fixed-cost discipline. PT coverage via scheduled hours + async SLA until PT volume justifies a hire.

---

<a name="part-34"></a>
## Part 34 — Updated Kiro Spec Inventory (v4 delta)

| # | Spec | Contents | Phase |
|---|---|---|---|
| 29 | `trial-v2-token-gated` | 14-day trial params, front-loaded grant, in-trial pack purchase + convert-early offer, day-12 reminder (amends specs 24/25 scope) | P2 |
| 30 | `model-policy-evals` | Nova Premier onboarding, Guru re-assignment, Model Justification Register, eval harness + quarterly re-validation job, steering `15-model-policy.md` | P1 (before agents scale) |
| 31 | `i18n-trilingual` | String catalogs EN/ES/PT, locale plumbing through invoker layer, per-language ISO-KB ingestion (licensing task tracked), localized funnel/emails/PDFs/Trust Center, translated legal stack integration | P2 (launch gate) |
| 32 | `identity-3pool-hardening` | Pool topology, issuer pinning per surface, poolClass claims, break-glass workflow + tenant notification, cross-pool uniqueness job, Pool C ISO-role groups | P0–P1 (foundation-adjacent; amends specs 1/16) |
| 33 | `standards-update-manager` | Edition-versioned canon + KB, delta-map content-ops pipeline, tenant transition workflow (delta report → dual-edition → drafts → cutover) | P3 |
| 34 | `support-connect` | Connect instance, flows, language/tier queues, context Lambda, support-bot endpoint, break-glass integration, transcripts bucket + retention, CSAT telemetry | P2 (chat) → P3 (voice/Enterprise SLA) |

Steering delta: `15-model-policy.md` (Part 30.3) · `16-identity-boundaries.md` (the four never-cross layers, verbatim) · `17-i18n.md` (no hardcoded strings; locale flows through the invoker; clause canon is language-invariant).

<a name="appendix-e"></a>
## Appendix E — New-Service & Model Justifications (v4 delta, one line each)

| Addition **[NEW in v4]** | Justification |
|---|---|
| **Amazon Connect** | The support plane: omnichannel contact center with per-language routing and pay-per-use pricing; native to the AWS boundary (IAM, CloudWatch, S3) so support tooling never becomes a third-party data-egress or an isolation bypass — break-glass remains the only tenant-data path. |
| **Amazon Nova Premier** (`us.amazon.nova-premier-v1:0`) | One additional verified-family model rung enabling the Nova-first mandate to absorb three of the four former Sonnet seats; no new service. |
| **Claude Sonnet 4.6 — scope reduced, not new** | Retained solely for LegalLedger under a quarterly-expiring Model Justification Register entry (statutory-interpretation duty); IAM-scoped to that single agent boundary. |
| **IAM Identity Center (SSO for Pool A staff)** | Internal-workforce SSO for the SaaS Admin plane only; standard multi-account org tooling, no tenant data plane. |

---

*End of v4 extensions. Spine (7) + v1 + v2 + v3 + v4 = complete Kiro build context. Precedence: v4 > v3 > v2 > v1 > spine.*

---

<!-- ===== SOURCE: cumplify-e2e-architecture-v5-extensions.md ===== -->

# Cumplify.ai — Master Architecture v5.0 Extensions

**Document:** `cumplify-e2e-architecture-v5-extensions.md`
**Version:** 5.0 · 2026-07-01
**Status:** Authoritative additions to v1–v4 + spine. Precedence: **v5 > v4 > v3 > v2 > v1 > spine**. Amends: spine B.1 Guardrails config (Part 35 expands the CfnGuardrail from PII+PROMPT_ATTACK to the full six-policy anti-hallucination configuration), Part 30.3 eval harness (Part 36 names its engine), v1 Part 10 observability (Part 37 adds the GenAI layer).

**Service-selection verdict (researched):** SageMaker Clarify/FMEval is the wrong tool here — it targets custom/SageMaker-hosted models and adds a whole service family we don't run. The seamless-deployment winner for our all-Bedrock stack is the **Bedrock-native triad**: (1) **Bedrock Guardrails contextual grounding + Automated Reasoning checks** at runtime, (2) **Amazon Bedrock Evaluations** (LLM-as-a-judge + RAG evaluation) as the pre-deploy QA gate, (3) **CloudWatch generative AI observability + Bedrock model-invocation logging** in production. Zero new compute, zero new data plane — every piece attaches to services already in Appendix A.

---

## Table of Contents
- [Part 35 — Anti-Hallucination Guardrail Stack (runtime, 5 layers)](#part-35)
- [Part 36 — AI Quality Assurance: Bedrock Evaluations as the Release Gate](#part-36)
- [Part 37 — CloudWatch GenAI Observability & the Grounding SLO](#part-37)
- [Part 38 — Updated Kiro Spec Inventory + Steering/Hook Delta (v5)](#part-38)
- [Appendix F — Service Justifications (v5 delta)](#appendix-f)

---

<a name="part-35"></a>
## Part 35 — Anti-Hallucination Guardrail Stack (runtime) **[EXPANDS spine B.1]**

A hallucinated clause number in a compliance platform is not a quality bug — it is the product failing at its one job. Anti-hallucination is therefore **layered defense at the invoker choke point** (v3 Part 22.3 — one door to Bedrock means one place to enforce all of this), never a per-agent afterthought.

### Layer 1 — Contextual grounding checks (every KB-grounded response)

The spine's `CfnGuardrail` (PII + PROMPT_ATTACK) expands to the full policy set, headlined by **contextual grounding checks**: for every response produced against a retrieval source (ISO-KB, TENANT-DOCS-KB, obligation texts), the guardrail scores **grounding** (is the response factually supported by the source?) and **relevance** (does it answer the query?), and blocks/flags below threshold.

| Parameter | Cumplify setting |
|---|---|
| Grounding threshold | **0.85** for advisory agents (Domain Gurus, Copilot retrieval answers); **0.90** for record-writing drafts (DocStudio clause statements, LegalLedger obligation mappings, LeadAuditor checklist items) |
| Relevance threshold | 0.75 platform-wide |
| On block | The invoker retries once with the retrieved chunks injected verbatim + a "answer only from the source; say 'not found in the standard' otherwise" instruction; second failure → response replaced by the honest-miss template + the event `ai.grounding.blocked` (telemetry + the agent's HITL card shows "draft withheld — insufficient grounding") |
| Documented limits respected | Grounding source ≤100k chars (our chunked retrievals comply), response ≤5k chars (long documents are checked **section-by-section** by the invoker); conversational multi-turn QA is out of the feature's supported scope — so Copilot chat applies grounding per retrieval-answer turn, not across the conversation |
| Streaming caveat | For streamed responses the verdict can land post-stream; record-writing paths therefore run **non-streaming** (verdict before persistence); only advisory chat streams, with a post-hoc correction banner on late block |

### Layer 2 — Automated Reasoning checks (formal logic for the claims that must never be wrong)

Automated Reasoning checks validate responses against a formal, mathematical policy — the only guardrail class that *proves* rather than pattern-matches, with structured feedback (invalid claim, why, suggested correction, unstated assumptions). Cumplify encodes **Automated Reasoning Policies** for its invariant domains:

| AR Policy | Encodes | Protects |
|---|---|---|
| `clause-canon` | Valid {standard, edition, clause number, exact title} tuples + module/agent ownership from the coverage matrix | Any output citing a clause: a non-existent clause, wrong title, or wrong-edition citation is formally rejected — the runtime twin of the build-time clause-integrity hook |
| `role-permissions` | The Part 13 permission matrix + SoD rules | Copilot/agents can never *tell a user* they may perform an action their role forbids |
| `plan-entitlements` | Tier → standards/seats/features truth table | Billing/support answers can't hallucinate entitlements |
| `legal-register-logic` (P3) | Obligation applicability rules per jurisdiction schema | LegalLedger's highest-stakes mappings get formal validation before HITL even sees them |

Policies are authored from the same canonical spine documents (content-ops artifact, versioned per edition — plugs directly into Part 33's Standards Update Manager), tested with the AR test workflow, and attached to the guardrail on the relevant invocation paths. Where AR feedback suggests a correction, the invoker performs **one steered regeneration** with the feedback injected, then defers to HITL.

### Layer 3 — Standalone checks in agentic steps

For mid-chain agent steps (tool selection, event routing) the invoker uses the **InvokeGuardrailChecks API** — individual safeguards applied at arbitrary points without full guardrail round-trips — so prompt-attack and content screening cover agent-to-agent hops, not just user-facing edges.

### Layer 4 — Structural honesty (prompt + schema contracts)

Uniform across all 22 agents, owned in the shared prompt library: (a) **citation-or-silence rule** — every factual claim about a standard must carry a `clauseRef` (validated against canon by the invoker post-generation) or be explicitly framed as general guidance; (b) **licensed uncertainty** — "the standard does not specify this" is a rewarded response pattern, stated in every system prompt; (c) **JSON-schema-validated outputs** for all record-writing actions (a draft that fails schema never reaches HITL); (d) low temperature (≤0.3) on record-writing paths; (e) retrieval-first ordering — agents must retrieve before asserting, never assert-then-decorate.

### Layer 5 — The human gate, made sharper

HITL (spine) remains the final layer — v5 upgrades the approval card: every AI-drafted artifact displays its **grounding score, AR verdict, and source citations inline**, so the human approves with evidence, not vibes. An approval over a flagged draft requires a typed justification (sealed to the trail — the audit story stays honest even about AI limitations).

**The compounding effect:** L1 catches ungrounded prose, L2 formally rejects false invariant claims, L3 covers inter-agent hops, L4 makes honesty the cheapest path, L5 documents human accountability — and every layer emits telemetry (Part 37), so hallucination pressure is *measured*, not anecdotal.

---

<a name="part-36"></a>
## Part 36 — AI Quality Assurance: Bedrock Evaluations as the Release Gate **[NAMES the Part 30.3 engine]**

**Selection rationale (the "SageMaker or CloudWatch?" question, answered):** the QA layer must evaluate *models and RAG pipelines we run on Bedrock*, inside the existing pipeline, with no new infrastructure. **Amazon Bedrock Evaluations** does exactly that — automatic metrics, **LLM-as-a-judge** scoring, human-review workflows, and **RAG (Knowledge Base) evaluation** for retrieval quality — natively against our models and our KBs. SageMaker Clarify/FMEval would import a second ML platform to evaluate models that don't live there; CloudWatch is the *monitoring* leg (Part 37), not the evaluation leg. Verdict: **Bedrock Evaluations for QA, CloudWatch for observability, Guardrails for runtime** — three legs, one service family, seamless with the CDK pipeline.

### 36.1 The evaluation suites (extends the Part 30.3 golden sets)

| Suite | Contents | Judge/metrics | Gate |
|---|---|---|---|
| `clause-accuracy` | 150 Q&A per standard × 3 languages (450/standard) with expected clauseRefs | LLM-as-a-judge (correctness, completeness) + programmatic clauseRef exact-match | ≥95% clauseRef accuracy, no regression > 2 pts vs last release |
| `rag-retrieval` | KB evaluation over ISO-KB + TENANT-DOCS-KB test corpus | Bedrock RAG eval: context relevance, coverage; per language | Relevance ≥ threshold per index; any drop after re-ingest blocks the KB release |
| `agent-duty` | Per-agent golden tasks (CAPAGuru root-cause drafts, HazardScout hierarchy-of-controls, LegalLedger mappings) | LLM-as-a-judge rubrics + human spot-review sample (10%) | Per-agent pass bar defined in its catalog entry |
| `grounding-adversarial` | Prompts engineered to induce hallucination (fake clauses, wrong editions, cross-standard confusion, injection attempts) | Expected outcome = refusal/honest-miss; guardrail-block rate | **100%** — any successful induced hallucination is a release blocker |
| `model-promotion` | The quarterly Nova-Premier-vs-Sonnet re-benchmark (Part 30.2 LegalLedger exception) | Same rubrics, side-by-side | Data-driven seat flip per the Model Justification Register |

### 36.2 Pipeline integration (the "seamless deployment" requirement, literally)

```
CDK pipeline (mgmt account) — new stage after staging deploy, before prod gate:
  AI-QA stage → Step Functions runs the Bedrock Evaluations jobs against the
  STAGING stack (its guardrails, its KBs, its agent prompts) → results JSON to
  S3 → threshold Lambda compares vs gates → pass: pipeline proceeds /
  fail: pipeline stops + report to the release channel + findings auto-raised
  as NCs in Cumplify's own tenant (our AI quality failures are OUR 10.2 records
  — the dogfood loop closes).
Prompt/KB changes are release artifacts: editing an agent prompt or re-ingesting
a KB without passing AI-QA is impossible by construction — that is the QA
guarantee the certification-body conversation needs.
```

---

<a name="part-37"></a>
## Part 37 — CloudWatch GenAI Observability & the Grounding SLO **[EXPANDS v1 Part 10]**

The mandated CloudWatch layer, specialized for the AI plane:

- **Bedrock model-invocation logging → CloudWatch Logs** (full request/response metadata for agents; PII already masked by the guardrail before logging; 30-day retention per the Part 25 discipline, with eval-relevant samples exported to S3 for suite refresh).
- **CloudWatch generative AI observability** dashboards per agent: invocation volume/latency/error, token consumption (joins the Part 22 Credit telemetry), guardrail intervention counts by policy (grounding blocks, AR rejections, prompt-attack catches, PII maskings), end-to-end agent-chain traces via the existing X-Ray/Application Signals correlation.
- **New SLOs (join the v1 Part 10 set):**
  - **Grounding SLO: ≥99.0%** of KB-grounded responses pass the grounding check without block (measured on the guardrail metrics) — a falling grounding rate is the earliest signal of KB drift, bad chunking, or prompt rot;
  - AR rejection rate < 0.5% on `clause-canon` (spikes page on-call — either the canon changed without a policy release, or an agent prompt regressed);
  - Guardrail invocation latency p95 < 500ms (alarmed — safety must not become the bottleneck);
  - Honest-miss rate tracked per agent (a *rising* "not found in the standard" rate on previously-answerable queries flags retrieval regression, not model honesty).
- **Alarm → action wiring:** every AI-quality alarm emits onto `cumplify-events` → auto-raises an NC in Cumplify's own tenant (severity-mapped) → CAPAGuru drafts the investigation → the platform literally runs corrective action on its own AI quality. This is the enterprise-grade answer to "how do you QA your AI?": *the same ISO 10.2 loop we sell you.*

---

<a name="part-38"></a>
## Part 38 — Updated Kiro Spec Inventory + Steering/Hook Delta (v5)

| # | Spec | Contents | Phase |
|---|---|---|---|
| 35 | `guardrails-antihallucination` | Six-policy guardrail config, grounding thresholds + section-wise checking, AR policies (`clause-canon`, `role-permissions`, `plan-entitlements` at launch; `legal-register-logic` P3), InvokeGuardrailChecks in agent hops, honest-miss templates, HITL card upgrade (scores + citations + flagged-approval justification) | **P1** (with `agents-existing-8` — no agent ships unguarded) |
| 36 | `ai-qa-evaluations` | The 5 evaluation suites, Bedrock Evaluations jobs, pipeline AI-QA stage (Step Functions + threshold gate), NC auto-raise on failure, quarterly model-promotion job (absorbs Part 30.3 harness scope from spec 30) | P1 (suites 1–2, pipeline stage) → P2 (adversarial suite gates launch) |
| 37 | `genai-observability` | Invocation logging, GenAI dashboards, grounding SLO + AR-rate + latency alarms, alarm→NC wiring | P1 |

**Steering delta — `18-anti-hallucination.md` (always, keep under 45 lines):** the citation-or-silence rule; licensed uncertainty; retrieval-before-assertion; record-writing paths are non-streaming, schema-validated, temp ≤0.3; every KB-grounded path passes contextual grounding at the Part 35 thresholds; clause claims are AR-checked against `clause-canon`; no agent prompt or KB change merges without the AI-QA stage passing. **Hook delta — extend `spec-drift`:** any change under `services/ai-invoker/**`, `prompts/**`, or KB ingestion configs auto-triggers the instruction "run the clause-accuracy and grounding-adversarial suites against staging before marking this task complete."

<a name="appendix-f"></a>
## Appendix F — Service Justifications (v5 delta, one line each)

| Addition **[v5]** | Justification |
|---|---|
| **Bedrock Guardrails — contextual grounding + Automated Reasoning checks + InvokeGuardrailChecks** | Native expansion of the guardrail resource already mandated by the spine; the only AWS safeguard class using formal logic against hallucination; no new service. |
| **Amazon Bedrock Evaluations (LLM-as-a-judge + RAG evaluation)** | The Bedrock-native QA engine for the models/KBs we already run — chosen over SageMaker Clarify/FMEval, which targets SageMaker-hosted/custom models and would import an entire second ML platform for no gain. |
| **CloudWatch generative AI observability + Bedrock invocation logging** | Specialization of the CloudWatch layer already in the stack; per-agent AI telemetry, guardrail metrics, and the grounding SLO; no new service. |
| **Step Functions AI-QA stage** | Reuses the already-justified Step Functions (Appendix A) inside the existing CDK pipeline; evaluation-as-a-gate is the seamless-deployment mechanism itself. |

---

*End of v5. Precedence: v5 > v4 > v3 > v2 > v1 > spine.*

---

<!-- ===== SOURCE: cumplify-e2e-architecture-v6-extensions.md ===== -->

# Cumplify.ai — Master Architecture v6.0 Extensions

**Document:** `cumplify-e2e-architecture-v6-extensions.md`
**Version:** 6.0 · 2026-07-01
**Status:** Authoritative additions to v1–v5 + spine. Precedence: **v6 > v5 > … > spine**. Scope: guardrails against the *builder* — Kiro itself — and the redefinition of "complete" from *code written* to *deployed, verified against the live cloud, and usable by a human*. Amends the Kiro Kickoff Pack (steering, hooks, prompt templates) and the phase gates (v1 Part 11.3).

**The two failure modes this document eliminates:**
1. **Kiro hallucination** — invented AWS API shapes/props/limits, phantom package versions, assumed IAM permissions, wrong service defaults, fabricated clause refs, and the subtlest one: *plausible code that synthesizes but cannot deploy or run*.
2. **False completion** — Kiro's own docs warn that a task marked "completed" still needs review, testing, and iteration; and LLM agents reliably over-report success. "Done" must therefore be **machine-verified evidence**, never the agent's self-assessment.

---

## Table of Contents
- [Part 39 — Kiro Anti-Hallucination Guardrails (build-time, 5 layers)](#part-39)
- [Part 40 — The Definition-of-Done Ladder (D0–D6)](#part-40)
- [Part 41 — Live-Testing & Progressive-Deployment Architecture](#part-41)
- [Part 42 — Kickoff-Pack Delta: Steering, Hooks, Prompts (v6)](#part-42)
- [Appendix G — Service Justifications (v6 delta)](#appendix-g)

---

<a name="part-39"></a>
## Part 39 — Kiro Anti-Hallucination Guardrails (build-time) **[NEW]**

Mirror of Part 35's philosophy, aimed at the build agent: hallucination is defeated by **grounding, execution, and read-back** — never by trusting fluent output.

### Layer 1 — Grounded facts only (MCP-verify-before-use)

| Rule | Enforcement |
|---|---|
| **No AWS fact from memory.** Any service API shape, CDK construct prop, quota, limit, pricing figure, or region availability that is not already in `00-stack-facts.md` MUST be verified via the **aws-docs MCP** (and quotas/pricing via **aws-pricing MCP**) *before* it appears in code or design. The verification (source page + date) is cited in the design.md or a code comment. | Steering `19-kiro-truth.md` (always) + review checklist: an unverified AWS claim is a blocking defect, identical in severity to an unwrapped AOSS call |
| **No invented dependencies.** Every package/version must resolve from the registry at pin time; lockfiles are the truth; Kiro may not reference a library API without the package installed and its types compiling. | `npm ci` in every verification run; typecheck gate (L2) makes phantom APIs fail loudly |
| **No assumed permissions.** IAM statements are derived from the documented action list (aws-docs MCP), then *proven* by execution in dev (L3) — "the Lambda probably has access" is not a sentence that exists in this repo. | Access-denied errors in dev read-back are expected and worked, never patched with `*` |
| **No phantom domain facts.** Clause refs → clause-integrity hook (build) + AR `clause-canon` (runtime, Part 35) already cover the ISO domain; Kiro inherits both. | Existing hooks |

### Layer 2 — Execution gates (nothing is true until it ran)

Every task completion triggers the **verify-evidence hook** (Part 42), which actually executes — in order, stopping at first failure:

```
1. npm ci && tsc --noEmit          (phantom-API killer)
2. eslint + prettier check
3. unit + property-based tests      (Kiro's property-based testing catches the
                                     edge cases that pass hand-written unit
                                     tests but break in production — mandatory
                                     on services/*, not optional)
4. cdk synth --all + CDK Nag        (Nag warnings = failures, spine law)
5. targeted integration tests for the touched module (LocalStack where
   applicable; real dev account for IAM/KMS/AOSS semantics that emulators fake)
```

Output is written to `.kiro/evidence/<spec>/<task>.log` and referenced in tasks.md. **A task without an evidence log is not done — definitionally.** The agent's prose claim ("all tests pass") is never accepted as a substitute for the log.

### Layer 3 — Deployed-truth read-back (trust the cloud, not the transcript)

After any dev deploy, the **readback hook** uses the **aws-api MCP** (read-only role) to assert the *deployed reality* matches the *designed intent* — the single most effective anti-hallucination control for infrastructure, because it catches the class of errors that compile fine and deploy fine but are silently wrong:

| Read-back assertion (examples — the full set lives per spec in design.md §7) | Catches |
|---|---|
| `CumplifyCore` table: SSE type = CMK with the expected key ARN; 9 GSIs present; PITR on | Encryption/prop hallucinations |
| Every Lambda on an AOSS path: `Timeout >= 60` | The 45-second-rule silently violated |
| AUDITLOG writer role policy: contains **no** `dynamodb:UpdateItem`/`DeleteItem` | The immutability guarantee, verified in IAM reality |
| S3 evidence bucket: `ObjectLockConfiguration.Mode = COMPLIANCE`, retention set | WORM actually on (a synth-passing stack can omit it) |
| Guardrail: contextual grounding + AR policies attached at Part 35 thresholds | Safety config drift |
| AppSync: WAF association present; authorizer wired; issuer set per pool (Part 32) | Auth topology hallucinations |
| SQS queues: every one has a DLQ; FIFO where mandated | Eventing contract |
| Zero NAT gateways; expected VPC endpoints exist | Cost-architecture drift |

Read-back assertions are code (`infra/readback/*.test.ts`, run against dev by the pipeline and on-demand by the hook), so the checklist can never rot into a wiki page.

### Layer 4 — Behavioral proof (the system does what the spec says, end to end)

Per-spec **golden-path integration tests** derived mechanically from acceptance criteria — the same EARS statements Kiro wrote become executable: cross-tenant denial suite (a Pool-C token of tenant X requesting tenant Y = 401/empty, asserted for queries, mutations, subscriptions, REST); forced-AOSS-cold-start test (scale-to-zero induced, request succeeds within the 45s budget); tamper test (UpdateItem on AUDITLOG → AccessDenied; chain verifier flags a synthetic mutation); HITL round-trip (agent drafts → approval → sealed event → subscription delivery); guardrail adversarial smoke (a fake-clause prompt is blocked). These run in staging on every merge to the phase branch — Kiro executes them, humans read the report.

### Layer 5 — Human gates with adversarial posture

The human review prompt changes from "does this look right?" to **"prove it to me"**: reviewers spot-check evidence logs against the diff (does the log actually cover the changed code?), and once per phase run a deliberate **hallucination audit** — pick 3 completed tasks at random, attempt to falsify their evidence (rerun, tweak, break). Kiro's REQUIRES-HUMAN domains (`14-simplicity.md`) stay autonomous-forbidden. The spec-drift hook (v3) plus Template E remain the sync backbone: manual changes are back-ported or they poison every later inference Kiro makes.

---

<a name="part-40"></a>
## Part 40 — The Definition-of-Done Ladder (D0–D6) **[NEW — redefines "complete"]**

"Complete" is a rung on a ladder, and each rung is machine-checkable. tasks.md checkboxes map to rungs; a task's required rung is declared when the task is generated.

| Rung | Name | Exit evidence (attached, not asserted) |
|---|---|---|
| **D0** | Written | Diff exists. *Worth nothing on its own.* |
| **D1** | Compiles & synths | L2 steps 1–4 logs green |
| **D2** | Tested | Unit + property + module integration logs green; coverage didn't drop |
| **D3** | Deployed & read back | Deployed to dev via pipeline; L3 read-back assertions green against the live account |
| **D4** | Behaves | L4 golden-path suites green in staging; DLQs empty after run; no new CloudWatch errors |
| **D5** | **Human-user ready** | A human (not the author) completes the feature's golden path in staging **unaided by anyone explaining it**: UX acceptance script passed; all 3 languages render (no missing-string keys, no layout breaks); loading/empty/error states exist and are honest; the HITL cards show scores/citations (Part 35 L5); help copy present; accessibility pass (keyboard nav + contrast on the flow); the feature's telemetry events verified firing (Part 8) |
| **D6** | Live-proven | Canary deployment completed without auto-rollback (Part 41); synthetic monitors green for 24h; feature flag advanced to 100%; runbook entry + alarm coverage exist; unit-cost delta logged (Part 27) |

**Binding minimums:** backend/infra tasks close at **D3** (D4 by spec end) · user-facing tasks close at **D5** · **every phase gate (v1 Part 11.3) now requires D6 for that phase's user-facing surface** — P2's gate literally means: a stranger can go landing → Snapshot → signup → approval → sealed event in staging without help, and the same journey has survived a canary in prod. The phase-N-gate spec template (kickoff pack 4.6) is amended to enumerate the D-rung evidence per shipped spec.

---

<a name="part-41"></a>
## Part 41 — Live-Testing & Progressive-Deployment Architecture **[NEW]**

The D6 rung's machinery — how code meets real traffic without betting the platform:

```
1. FEATURE FLAGS — AWS AppConfig [NEW, Appendix G]: every user-facing feature
   ships dark behind a flag; exposure ladder internal → tenant-zero → beta
   cohort → 10% → 100%; flags are configuration deploys (validated, versioned,
   instantly reversible) — no redeploy to retreat.
2. CANARY RELEASES — CodeDeploy for Lambda [NEW]: aliased functions on user-
   facing paths deploy Linear10PercentEvery3Minutes with auto-rollback wired to
   the alarms below; AppSync/CDN config changes ride the same alarm gate via
   pipeline approval.
3. SYNTHETIC MONITORS — CloudWatch Synthetics canaries [NEW] run the golden
   journeys continuously in prod: (a) landing + Snapshot request, (b) signup →
   legal gate → provisioning (against tenant-zero, card in Stripe test-clock
   mode), (c) login → HITL approval → sealed-event verification, (d) public API
   read + webhook delivery, (e) per-language render probe (EN/ES/PT). Canary
   failure = page; canary metrics gate the CodeDeploy rollback.
4. TENANT-ZERO — a permanent synthetic tenant in prod (flagged, excluded from
   analytics/revenue): seeded data, daily agent-chain exercise (hazard →
   RiskSentinel → CAPA → seal), the live target for canaries and for support/
   ops rehearsal. Cumplify's own dogfood tenant (Part 18.4) remains separate —
   tenant-zero is disposable, the dogfood tenant is real.
5. BETA COHORT UAT — 5–10 design-partner tenants (recruited via the Part 16
   consultant channel) run scripted UAT per release wave; findings auto-file as
   NCs in Cumplify's own tenant → CAPAGuru triages → the ISO 10.2 loop closes
   over our own release quality, same as Part 37 did for AI quality.
6. ROLLBACK AS A REHEARSED MOVE — every spec's design.md §7 names its rollback
   (flag off / alias re-point / stack rollback / data-safe migration reversal);
   the phase game-day (v1 Part 10) executes one for real each quarter.
```

---

<a name="part-42"></a>
## Part 42 — Kickoff-Pack Delta: Steering, Hooks, Prompts (v6)

### 42.1 New steering — `.kiro/steering/19-kiro-truth.md` *(always, hand-written like the constitution five)*

```markdown
---
inclusion: always
---
# Truth Discipline (rules about YOU, the build agent)
1. Never state an AWS API shape, construct prop, quota, limit, price, or
   availability from memory. Verify via aws-docs/aws-pricing MCP first and
   cite it. If you cannot verify, say so and stop — flagging beats guessing.
2. Executed evidence or it didn't happen. "Tests pass" means the evidence log
   at .kiro/evidence/<spec>/<task>.log exists from a run YOU executed this
   session. Never mark a task complete without it.
3. "Complete" means the task's declared D-rung (see Part 40), not code written.
   Backend >= D3 (deployed + read back). User-facing >= D5 (a human used it).
4. The deployed cloud outranks your transcript. After deploying, read the
   actual resource state back (readback tests / aws-api MCP) before claiming
   configuration facts.
5. When a command fails, report the real output verbatim. Never summarize a
   failure as a success, never skip a failing step to keep momentum, never
   weaken an assertion to make it pass. Deleting or loosening a test to go
   green is the one unforgivable move.
6. Uncertainty is a valid deliverable: Open Questions sections exist so you
   can use them.
```

### 42.2 New hooks

| Hook | Trigger | Instruction |
|---|---|---|
| `verify-evidence` | postTaskExecution | "Run the Layer-2 execution gate (ci → typecheck → lint → tests → synth+Nag → module integration). Write full output to .kiro/evidence/<spec>/<task>.log. If any step fails, mark the task NOT complete, report the verbatim failure, and stop. Do not summarize failures as partial successes." |
| `deploy-readback` | manual (run after each dev deploy) + pipeline post-deploy step | "Execute infra/readback tests against the dev account via aws-api MCP creds. Report each assertion pass/fail with the actual observed value next to the designed value. Any mismatch is a defect on the deploying spec." |
| `dod-gate` | preTaskExecution on any task named `close:*` or phase-gate tasks | "Before executing, enumerate the D-rung evidence required (Part 40 table) and verify each artifact exists. Refuse to proceed with missing evidence; list exactly what's missing." |

### 42.3 New prompt templates (extend the kickoff-pack library)

> **TEMPLATE F — task closure with evidence**
> ```
> #spec:<name> close task <n.m>. Declare its D-rung. Run the verify-evidence
> gate and attach the log path. If the rung is D3+, run deploy-readback and
> paste the assertion table. State any assertion you could NOT verify and why.
> Only then mark the checkbox.
> ```

> **TEMPLATE G — D5 human-readiness package**
> ```
> #spec:<name> prepare the D5 package for <feature>: (1) a UAT script a
> non-engineer can follow cold — numbered steps, expected result per step,
> in EN/ES/PT; (2) the empty/error/loading-state inventory with screenshots;
> (3) the telemetry events this flow must fire and how I verify them in
> Athena; (4) the rollback move. Do not claim D5 — a human executes the
> script and reports back.
> ```

> **TEMPLATE H — hallucination audit (once per phase)**
> ```
> Select 3 random completed tasks from this phase. For each: rerun its
> evidence gate from scratch, re-execute its readback assertions, and attempt
> one falsification (break the thing its test claims to protect and confirm
> the test catches it). Report honestly — a passed audit proves the evidence
> system; a failed one is a CRITICAL finding on our own process.
> ```

> **TEMPLATE I — pre-launch live-readiness review (per phase gate, D6)**
> ```
> For every user-facing spec in phase <N>: confirm flag exists in AppConfig
> with the exposure ladder defined; canary deployment config + rollback alarms
> wired; the CloudWatch Synthetics journey covering it is green for 24h against
> tenant-zero; runbook entry written; unit-cost delta logged. Produce the D6
> evidence table for the gate report in docs/gates/.
> ```

### 42.4 Spec inventory (v6 delta)

| # | Spec | Contents | Phase |
|---|---|---|---|
| 38 | `build-verification-harness` | Evidence-gate scripts, `.kiro/evidence` conventions, readback test framework (`infra/readback/*`), property-based test scaffolding, hooks 42.2, pipeline post-deploy readback step | **P0** (lands with spec 1 — the harness exists before the first real task closes) |
| 39 | `live-testing-plane` | AppConfig flags + exposure ladder, CodeDeploy canary aliases + rollback alarms, Synthetics golden-journey canaries (incl. per-language probe), tenant-zero provisioning + daily agent exercise, beta-cohort UAT→NC wiring | P2 (flags+canaries+tenant-zero gate the public launch) → P3 (beta cohort) |

<a name="appendix-g"></a>
## Appendix G — Service Justifications (v6 delta, one line each)

| Addition **[v6]** | Justification |
|---|---|
| **AWS AppConfig (feature flags)** | Validated, versioned, instantly-reversible runtime configuration — the D6 exposure ladder and the no-redeploy retreat; no data plane. |
| **CodeDeploy for Lambda (canary/linear aliases)** | Native progressive delivery with alarm-driven auto-rollback on the compute we already run; deployment tooling only. |
| **CloudWatch Synthetics** | Continuous golden-journey probes in prod — the "is it actually usable right now" sensor that alarms before customers do; extends the already-mandated CloudWatch layer. |
| *(Reused)* aws-api / aws-docs / aws-pricing MCP servers | Already in the kickoff pack; v6 promotes them from convenience to enforcement instruments (Layers 1 & 3). |

---

*End of v6. Precedence: v6 > v5 > v4 > v3 > v2 > v1 > spine. The corpus is now: guardrails on the product's AI (v5), guardrails on the builder (v6), and a definition of done that ends at a human successfully using the thing in production.*

---

<!-- ===== SOURCE: cumplify-e2e-architecture-v7-extensions.md ===== -->

# Cumplify.ai — Master Architecture v7.0 Extensions

**Document:** `cumplify-e2e-architecture-v7-extensions.md`
**Version:** 7.0 · 2026-07-01
**Status:** Authoritative additions to v1–v6 + spine. Precedence: **v7 > v6 > … > spine**. Overrides: AWS Marketplace moves from "evaluate, P4+" (v3 Part 25.3) to a **day-1 launch channel** — the integration is a **P2 launch gate**, with FTR started in P1 (its 8-week lead time back-plans from launch). Amends: Part 6 (provisioning gains a `source=marketplace` branch), Part 7/22 (dual billing rails), Part 27 (fee line), Part 16 (CPPO channel motion), v1 Part 11.3 (P1/P2 gate contents).

---

## Table of Contents
- [Part 43 — Marketplace Commercial Architecture (listing, dimensions, offers)](#part-43)
- [Part 44 — Marketplace Technical Integration (fulfillment, entitlements, metering, events)](#part-44)
- [Part 45 — FTR & Launch Operations (the 8-week back-plan)](#part-45)
- [Part 46 — Kiro Delta: Spec 40/41, Steering, Kickoff Prompt](#part-46)
- [Appendix H — Justifications & Fee Impact (v7 delta)](#appendix-h)

---

<a name="part-43"></a>
## Part 43 — Marketplace Commercial Architecture **[NEW]**

### 43.1 Listing type & dimension design

**Listing:** SaaS product, **"contract with consumption"** — the model built for exactly our shape (base plan + variable usage), and the one that unlocks MACC (customers' committed AWS spend can buy Cumplify) and **Private Offers**, where most enterprise Marketplace deals actually close.

**Contract dimensions (annual or monthly contracts):**

| Dimension key | Maps to | List price (parity with Part 17, annual anchor) |
|---|---|---|
| `launch-tier` | Launch plan (1 standard, 5 Full seats, 30k Credits/mo) | $4,584/yr ($382/mo eq.) |
| `imspro-tier` | IMS Pro (all 3 standards, 15 Full seats, 70k Credits/mo) | $9,684/yr ($807/mo eq.) |
| `enterprise-tier` | Enterprise base (custom via Private Offer only) | Private Offer |
| `addl-seat-pack` | +5 Full seats | $1,740/yr |
| `addl-site` | +1 site (Pro+) | $1,788/yr |

**Consumption (metered) dimension:**

| Dimension key | Unit | Price |
|---|---|---|
| `ai-credits-1k` | 1,000 Cumplify AI Credits beyond the contracted grant | **$3.96 per 1k** (= the $99/25k pack rate — strict price parity across rails, Part 43.3) |

Dimension design rules: keys are immutable once live (choose boringly); every future plan change must express itself as new dimensions or Private Offers, never renamed keys; Enterprise always transacts via Private Offer (custom terms, custom EULA attachment, multi-year, flexible payment schedules).

### 43.2 Offers strategy

- **Public offer:** Launch + IMS Pro self-service with the dimensions above; our custom **EULA + ToS stack (v2 Part 12.1)** attached as the license terms (Marketplace supports custom EULAs — Delaware law preserved).
- **Private Offers:** the Enterprise motion — sales-assist quotes rendered as Marketplace Private Offers so the buyer's procurement is "click accept in your AWS account."
- **CPPO (Channel Partner Private Offers):** the Part 16 consultant channel gets a second rail — qualifying implementation partners registered as channel partners can **resell Cumplify via CPPO**, taking their margin through AWS instead of (never in addition to) the affiliate commission. Rule: **one compensation rail per deal** — a CPPO deal pays the partner via their resale margin; the same deal cannot also accrue affiliate commission (enforced in the attribution logic; stated in the Affiliate Agreement).
- **Marketplace free trial:** a **separate 14-day Marketplace free-trial offer** (native Marketplace mechanism), because the Stripe card-trial funnel must not be cross-promoted on Marketplace surfaces (43.3). Same 15k trial Credits, same Free Reader fallback.

### 43.3 Compliance rules for listing & fulfillment surfaces (build requirements, verbatim into spec 40)

1. **No cross-rail promotion:** the Marketplace listing, fulfillment page, and in-product surfaces shown to Marketplace-sourced tenants must not advertise the Stripe trial, Stripe pricing, or any offer not available on Marketplace. The pricing page detects `billingRail=marketplace` and renders the Marketplace-native upgrade paths only.
2. **Fulfillment page requirements:** existing users can log in from it; support contact options displayed on it; new users reach first-use experience directly from it.
3. **In-app subscription visibility:** Settings → Billing for Marketplace tenants shows contract dimensions, entitlement quantities, current metered usage, and renewal date — sourced from GetEntitlements + our meter, not from Stripe.
4. **Cancellation routing:** Marketplace tenants who ask to cancel are directed to AWS Marketplace (their agreement lives there); our one-click cancel remains for Stripe tenants only. Copy in Settings branches on rail.
5. **Price parity:** identical effective prices on both rails (43.1 table = Part 17 annual prices; `ai-credits-1k` = pack rate). Parity is a config assertion tested in CI, not a policy memo.

---

<a name="part-44"></a>
## Part 44 — Marketplace Technical Integration **[NEW — spec 40 content]**

All Marketplace APIs are called from **us-east-1** (mandatory; conveniently our primary region). The SBT-AWS `AWSMarketplaceSaaSProduct` construct is the scaffold (registration API, subscriber table, event-handling Lambdas); we adapt its outputs into our own tenant lifecycle rather than running it as a parallel brain.

### 44.1 Fulfillment & activation flow (the new front door)

```
AWS Marketplace "Subscribe" → POST redirect to
https://aws.cumplify.ai/marketplace/fulfillment  (API GW, GrowthStack — the
pre-auth boundary; WAF; token valid 4h)
 1. Lambda exchanges x-amzn-marketplace-token via ResolveCustomer →
    {CustomerIdentifier, CustomerAWSAccountId, ProductCode, LicenseArn};
    persist as MPSUB#<CustomerIdentifier> in CumplifyCore (idempotent).
 2. DO NOT ACTIVATE YET. Render the landing state: existing-user login OR
    new-account form (email/password/company — the S4 flow, MINUS the Stripe
    card step; the FULL legal gate S4b remains — Marketplace license terms do
    not replace our click-wrapped consent events).
 3. Await the entitlement event (44.2). Only after `subscribe-success` /
    entitlement confirmation: call GetEntitlements, translate dimensions →
    ENTITLEMENT item {rail: marketplace, plan, seats, sites, creditsGrant,
    contractEnd}, then fire the Part 6 provisioning state machine with
    source=marketplace (Snapshot seeding if they came through the funnel;
    industry-template seeding otherwise).
 4. Concurrent Agreements (mandatory for all new listings since 2026-06-01):
    one AWS account may hold multiple simultaneous agreements → our mapping is
    agreement→tenant (each purchase can provision a distinct tenant, or attach
    added dimensions to an existing tenant chosen at fulfillment); AgreementId
    stored on the ENTITLEMENT item; all entitlement math is per-agreement,
    never per-AWS-account.
Failure paths: token expired → friendly re-subscribe guidance; ResolveCustomer
error → retry w/ backoff then support handoff; entitlement never arrives (15
min) → pending page + alert. Every step emits audit events (of course).
```

### 44.2 Subscription lifecycle events

New listings use **EventBridge** for Marketplace subscription notifications (SNS is legacy) — we are EventBridge-native, so: Marketplace events → rule → dedicated SQS `mp-lifecycle` (FIFO by CustomerIdentifier, DLQ) → handler Lambda:

| Event | Action |
|---|---|
| subscribe-success | Unblock activation (44.1 step 3) |
| entitlement-updated | Re-read GetEntitlements → update ENTITLEMENT (upgrade/downgrade/renewal); downgrades apply the same grace semantics as Stripe (Part 6.2) |
| unsubscribe-pending | Tenant → PAST_DUE-equivalent read-only path; **send the final metering record within 1 hour** (hard SLA — a dedicated final-meter Lambda short-circuits the hourly batch) |
| unsubscribe-success | Tenant → SUSPENDED → PENDING_DELETE ladder (Part 6.2 unchanged; WORM retention disclosure unchanged) |
| subscribe-fail | Purge the MPSUB record; no tenant created |

### 44.3 Metering job (Credits → `ai-credits-1k`)

- Hourly EventBridge Scheduler → meter Lambda: reads each Marketplace tenant's Part 22 meter, computes Credits consumed **beyond the contracted grant** this hour, aggregates, calls **BatchMeterUsage** (≤25 records/call, batched).
- Rules honored: requests are de-duplicated per hour (idempotency token = tenant+hour); **zero-usage records sent every hour** even when idle (recommended practice — and our earliest detector of a broken meter); failures land in a `meteringfailed` state with alarm + retry (a failed meter is unbilled revenue — pages on-call); CloudTrail-monitored as AWS recommends.
- Monthly reconciliation (v3 Part 22.3 close) now reconciles **three** ledgers: internal meter ↔ Bedrock actuals ↔ Marketplace-reported usage. Drift >3% on any pair is a tripwire.

### 44.4 Dual-rail entitlement rules (one truth, two writers)

```
ENTITLEMENT item gains: rail = stripe | marketplace, agreementId?, licenseArn?
- Exactly one rail per tenant, set at provisioning, immutable (rail migration
  = a managed offboard/onboard, Enterprise-assisted only).
- Writers: Stripe webhook Lambda writes rail=stripe items ONLY; the mp-lifecycle
  handler writes rail=marketplace items ONLY (enforced by IAM condition on an
  item attribute — the two billing brains physically cannot overwrite each other).
- Readers (authorizer, plan gates, Credit meter, UI) are rail-agnostic: they
  read the same abstraction and never branch on rail except for the UX rules
  in 43.3 (upgrade paths, cancellation routing, billing page rendering).
- Credit Packs: Stripe tenants buy packs via Stripe (unchanged); Marketplace
  tenants do not buy packs — overage flows automatically through the metered
  dimension at the identical per-Credit price (simpler AND parity-true).
```

### 44.5 IAM & seller-account plumbing

Integration role: `aws-marketplace:ResolveCustomer`, `aws-marketplace:BatchMeterUsage`, `aws-marketplace:GetEntitlements` (Resource `*` — the Marketplace APIs' shape), scoped to the two integration Lambdas only; EventBridge/SQS grants per the standard pattern. Seller account = the prod account's management boundary per AWS's multi-account Marketplace guidance (integration calls may assume a role into the seller context). Marketplace test products used for the full integration test matrix before visibility flips public: fulfillment happy-path, expired token, malformed token, entitlement upgrade/downgrade, cancel + 1-hour final meter, zero-usage hours, concurrent second agreement on the same AWS account. **Never enable auto-renew on test subscriptions** (a known and expensive footgun).

---

<a name="part-45"></a>
## Part 45 — FTR & Launch Operations (the 8-week back-plan) **[NEW]**

The Foundational Technical Review is the gating review (security, reliability, performance, operational excellence). Start it **in P1** — its 2–4 week review plus prep back-planned 8 weeks from the P2 launch date. Our posture makes it largely a paperwork exercise:

| FTR area | Answered by |
|---|---|
| Security (encryption, IAM, secrets, no hardcoded creds) | SecurityStack + Part 9 battery + Part 23 fabric |
| Reliability (backups, DR, multi-AZ) | AWS Backup + Part 10 DR + game days |
| Operational excellence (monitoring, runbooks, support) | Part 37 observability + Part 33 Connect + runbooks |
| Well-Architected alignment | Run a formal **Well-Architected Review in P1** — it doubles as the FTR waiver path and the "Deployed on AWS" badge evidence (architecture diagram uploaded to Partner Central) |

**Ops checklist (sequenced):** P0 — APN partner account + Marketplace seller registration (tax/banking, Strivana Com LLC). P1 — Well-Architected review; FTR submission; dimension design frozen (43.1); listing draft (description, categories, keywords, screenshots in EN — listing copy runs through the same pain-point-driven messaging as the funnel); legal stack attached as custom EULA. P2 — spec 40 integration built + full test-product matrix green; limited listing review (3–7 business days) submitted **before** the public-launch week; visibility flips public **the same day** the Stripe funnel opens: **two front doors, one day-1**. Post-launch — disbursement reporting joins the monthly close; Marketplace-sourced MRR tracked as its own telemetry channel; CPPO partner onboarding opens in P3 with the Partner Portal.

---

<a name="part-46"></a>
## Part 46 — Kiro Delta: Specs, Steering, Kickoff Prompt

| # | Spec | Contents | Phase |
|---|---|---|---|
| 40 | `marketplace-integration` | Fulfillment endpoint + activation gating, Concurrent Agreements (agreement→tenant), EventBridge lifecycle handlers + 1-hour final meter, hourly BatchMeterUsage job (zero-usage, dedup, failure alarms), dual-rail ENTITLEMENT rules + IAM writer separation, price-parity CI assertion, rail-aware UX branches (billing page, cancel routing, no cross-rail promotion), test-product matrix | **P2 (launch gate)** |
| 41 | `marketplace-listing-ops` | Seller registration runbook, Well-Architected review artifacts, FTR submission pack, dimension/offer configuration, listing content, disbursement reporting into the monthly close, CPPO onboarding flow (P3) | P0 (registration) → P1 (FTR) → P2 (listing live) |

**Steering delta — `20-marketplace.md`** *(fileMatch: `services/marketplace/**`, `frontend/**billing**`)*: activation only after entitlement confirmation, never on token alone; hourly metering with zero-usage records; final meter ≤1h on cancellation; one rail per tenant, one writer per rail; price parity is a tested assertion; no cross-rail promotion on Marketplace surfaces; all Marketplace API calls from us-east-1 via the scoped integration role.

**Spec 40 kickoff prompt (Template A filled — paste when P2 opens):**

> ```
> Start a new spec named marketplace-integration (Requirements-First, no Quick
> Plan). Source of truth: consolidated doc Parts 43–45; Part 6 (provisioning),
> Part 22 (Credit meter), Part 7 + 22 (entitlements); steering 20-marketplace.md.
> Scope: everything in Part 44 — fulfillment endpoint on the GrowthStack API GW,
> ResolveCustomer/GetEntitlements flow with activation gated on the entitlement
> event, Concurrent Agreements agreement→tenant mapping, EventBridge lifecycle
> handlers with the 1-hour final-meter SLA, the hourly BatchMeterUsage job, the
> dual-rail ENTITLEMENT writer separation (IAM-enforced), price-parity CI test,
> and the rail-aware UX branches from Part 43.3.
> Out of scope: listing content, FTR, seller registration (spec 41); Stripe
> paths (unchanged); CPPO portal features (P3).
> Import verbatim as acceptance criteria: Part 43.3 rules 1–5; the 44.5 test-
> product matrix as the integration test list; "never activate on token alone."
> Verify every Marketplace API shape via aws-docs MCP before design — the
> Concurrent Agreements integration is post-June-2026 mandatory and its API
> surface must be read from current docs, not memory. Open Questions for
> anything the docs leave ambiguous. This spec's IAM and metering code are
> REQUIRES-HUMAN throughout; its D-rung floor is D4, with D6 required at the
> P2 gate (a Marketplace test-product purchase surviving canary + Synthetics).
> ```

<a name="appendix-h"></a>
## Appendix H — Justifications & Fee Impact (v7 delta)

| Addition **[v7]** | Justification |
|---|---|
| **AWS Marketplace Metering + Entitlement Service APIs, Marketplace EventBridge events** | The transaction rail itself; three API actions on a scoped role + event handlers on the existing bus; no new data plane. |
| **SBT-AWS AWSMarketplaceSaaSProduct construct — promoted from "evaluate" to adopted** | Scaffolds registration API, subscriber table, and event Lambdas we then bind into our own lifecycle. |
| **Partner Central / Well-Architected review** | Program artifacts, not services. |

**P&L impact (amends Part 27):** the Marketplace transaction fee on SaaS (low single-digit %; confirm the current schedule at listing time) sits in the same band as the Stripe ~3% it *replaces* on that rail → blended variable % and the >50% net milestones are **unchanged**. Upside not yet modeled: MACC-funded Enterprise deals and CPPO channel volume are pure pipeline expansion at flat unit economics.

---

*End of v7. Precedence: v7 > v6 > … > spine. Day-1 posture: two front doors — cumplify.ai (Stripe rail) and AWS Marketplace (AWS rail) — one tenant model, one entitlement truth, one immutable trail behind both.*

---

