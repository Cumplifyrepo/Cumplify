# Competitive Analysis — CertifyAero (certifyaero.com)

> **Method & operational-security note.** All findings below were obtained via **read-only HTTP GET requests** on public assets (the marketing shell HTML and the single public front-end JavaScript bundle that the browser downloads and renders for *unauthenticated* visitors). No account was created, no form was submitted, no credentials were entered, no authenticated session was opened, and **no Supabase internals were touched** — no tenant tables, no row-level-security policies, no schema, no storage buckets, no project configuration, no keys, and no API endpoints were inspected or recorded. The site is a client-rendered Single-Page Application, so the only way to observe the *rendered* public product copy without a JS-executing browser is to read the human-readable UI strings the bundle ships to every visitor. Only that rendered marketing/feature text and the information-architecture (route/menu) labels are reported here. Where the bundle contained the Supabase auth SDK and data-layer calls, those were **deliberately excluded** from capture per the Supabase-boundary rule.
>
> **Observation date:** 2026-06-30. **Bundle observed:** `/assets/index-B2eD_gnT.js` (~1.93 MB, minified).

---

## 0. Executive Summary

CertifyAero is an **AI-assisted, single-standard Quality Management System (QMS) certification platform** aimed squarely at **small-to-medium aerospace manufacturers and suppliers** pursuing **ISO 9001:2015** and **AS9100D** certification. Its core value proposition is *"Minutes, Not Months"* — one-click AI generation of a full QMS document set, then a set of registers (suppliers, equipment/calibration, training, risk, nonconformances, audits, management review, certifications) to keep the shop "audit-ready."

**Strategic takeaway for Cumplify.ai:** CertifyAero is a **narrow, vertical, quality-only** tool. It does **not** address **ISO 14001 (Environmental)** or **ISO 45001 (Occupational Health & Safety)** at all. Its "AI" is a **document generator + conversational assistant** (Anthropic Claude called directly from the browser), **not** an agentic backend that autonomously executes multi-step compliance workflows. This leaves two enormous differentiation lanes for Cumplify.ai: (1) a **true Integrated Management System** spanning Quality + Environmental + OH&S, and (2) a **genuinely agentic architecture** (Bedrock agents that detect, draft, route, and close the loop) rather than a template generator with a chatbot.

---

## 1. Positioning & Enterprise Signals

| Signal | Observed copy |
|---|---|
| Master tagline | **"Minutes, Not Months"** |
| Product descriptors | "AI-Powered Aerospace Quality Management"; "AI-Powered QMS Certification Platform"; "AI-Powered Documents"; "AI-Powered Compliance Review" |
| Hero promise | *"Generate audit-ready QMS documents tailored to your company — Quality Manual, procedures, work instructions — all mapped to ISO 9001 and AS9100D clauses."* |
| Onboarding framing | **"From zero to audit-ready in four steps."** |
| Ongoing value | "Stay Audit-Ready"; "Audit-Ready Features"; "Review, customize, and get audit-ready" |
| Time-to-value claim | *"…generating your entire QMS document set in minutes instead of months… Most of our users are audit-ready within 3–6 months."* |
| Target customer | *"For a small-to-medium shop…"* — SMB aerospace machine shops / suppliers to primes (Boeing, Airbus, Honeywell explicitly named as customers-of-customers) |
| Company / legal entity | **CertifyAero LLC**, **Acton, MA** (Massachusetts); ASQ Wichita Chapter and other US locations referenced |
| Standards scope | **ISO 9001:2015 + AS9100D only** (AS9110 MRO, AS9120 distributors, NADCAP, ITAR referenced as *things to track*, not modules) |

**Positioning posture:** *self-serve, DIY-certification for shops that cannot afford a consultant.* Explicitly anti-consultant: *"…generating your entire QMS document set in minutes instead of months. The remaining time is implementing the system, training your team, running internal audits…"*

**Enterprise-readiness signals (mostly ABSENT — competitive opening):** No SSO/SAML, no SCIM, no enterprise RBAC depth, no multi-site/multi-entity, no API/webhooks, no SOC 2 / audit-log immutability claims were observed in the rendered marketing. Roles are *collected at onboarding* ("Quality Manager", "safety officer", "ITAR officer") but no enforced role-based access model is surfaced publicly.

---

## 2. Pricing Model (observed)

| Attribute | Observed value |
|---|---|
| Structure | **Single subscription plan** (no visible tiering by feature) |
| Price | **$349/month**, or **$299/month billed annually** ("Save 15%" / "Billed annually — save $…") |
| Copy | *"$349/month or $299/month billed annually. Cancel anytime."* |
| Free trial | **"Start Free 14-Day Trial"**, "Get Started — Free Trial", "Sign Up Free" |
| Demo | "Try Live Demo" / "Try Demo" (interactive demo path visible pre-auth) |
| Team model | Seat-/invite-based — "Additional team members", "Create Account & Join Team", invite-token flow |
| Payment processor | **Stripe** ("Billing data is processed and stored by Stripe, our payment processor. We do not store credit card numbers on our servers.") |
| Liability posture | Aggregate liability capped at trailing-12-months fees; heavy "no guarantee of certification" disclaimers |

**Read:** flat, low-friction SMB SaaS pricing. No enterprise/volume/multi-standard tier — another opening for a tiered, per-standard, enterprise-priced Cumplify.ai.

---

## 3. Information Architecture / Module Structure

CertifyAero's authenticated app is a **left-nav dashboard**. The following **navigation sections/modules** were confirmed from rendered menu labels and section headings:

| # | Module (nav label) | What it does (observed copy) |
|---|---|---|
| 1 | **Dashboard** | Entry point; "generate your Quality Manual and everything else auto-populates"; readiness overview, "track what needs attention" |
| 2 | **Documents** | AI-generated QMS document set: Quality Manual, documented core processes, procedures/SOPs, work instructions, **Process Interaction Map**, **Turtle Diagrams** (Sales/Purchasing/Operations), Roles & Responsibilities — **all mapped to ISO 9001 & AS9100D clauses**; bulk generation; PDF export (jsPDF, e.g. `01_Quality_Manual.pdf`, `05_Sales_Turtle_Diagram.pdf`) |
| 3 | **Suppliers** | Approved Supplier List / Register, supplier evaluations, **12-month re-evaluation intervals** with overdue alerts, CSV export |
| 4 | **Training** | Training/competence records: who, on what, when completed, competency verifier, expiry; role-specific (CNC, inspection, ESD, FOD, AS9100D awareness, internal audit); CSV export |
| 5 | **Equipment / Calibration** | Master equipment list, calibration intervals (6/12-month), **30-day advance alerts**, monthly cal sweep, NIST-traceable / ISO/IEC 17025 lab tracking, out-of-tolerance impact assessment, CSV export |
| 6 | **Audits** | Internal audit program, **audit checklists**, scheduling, findings with root cause + corrective action, auditor-independence checks, AS9100D/ISO 9001 clause-coverage verification, audit reports |
| 7 | **Risk Register** | **5×5 risk matrix with RPN scoring**; categories **Quality / Supply Chain / Safety**; *"Track risks and opportunities across Quality, Supply Chain, Safety, and more. Filter, sort, and export — Clause 6.1."*; also process-FMEA (Severity × Occurrence × Detection = RPN) |
| 8 | **Nonconformances / CAPA** | NCR logging, disposition (**Accept / Reject / Accept on Concession / Rework**), root-cause analysis, corrective-action tracking, effectiveness verification, timeliness alerts (CAPAs open 6+ months flagged), auto-escalation |
| 9 | **Management Review** | Structured 9.3.2 inputs (previous actions, customer satisfaction, objectives performance, process/product conformity, NC/CA, audit results, supplier performance, resource adequacy, risk-action effectiveness, improvement opportunities; aerospace: on-time delivery, product-safety issues, lessons learned); attendees, minutes |
| 10 | **Certifications** | OASIS / IAQG certification tracking, **accredited-registrar directory** (ANAB, UKAS, DAkkS, JAS-ANZ, SAS, etc.), certificate number/body/expiry, **email reminders before expiry**, ITAR & NADCAP tracking, status badges ("🔴 Certificate expired — verify on OASIS…") |
| 11 | **Analytics** | "Analytics & Insights" dashboard — KPIs, trends (on-time delivery, scrap rate, customer returns, supplier quality) |
| 12 | **AI Assistant** | Embedded conversational assistant — *"Ask anything… e.g., 'how often should I calibrate?'"* — clause guidance, generation offers ("Would you like me to help generate your Internal Audit Procedure?") |
| 13 | **Quality Policy** | Dedicated policy authoring/management |
| 14 | **Objectives** | Quality objectives / KPIs with targets ("On-Time Delivery ≥ 87%", "Scrap Rate ≤ 5%", "Complete 2 internal audits per year"), monthly tracking |
| 15 | **Gap Analysis** | Audit-readiness checklists that flag missing evidence ("Add a Quality Manager name…", "Generate your Quality Manual first…") |
| 16 | **Settings** | Company profile / onboarding (QM name, supplier count, special roles: safety officer, ITAR officer), team management |

---

## 4. Feature Taxonomy (observed capabilities)

**A. AI / Generative**
- **One-click QMS document generation** — *"Generate your complete Quality Manual with one click. It auto-populates all clause documents."*
- **Clause traceability** — every generated doc mapped to ISO 9001 / AS9100D clauses ("Adding clause traceability…").
- **AI Document Review / AI-Powered Compliance Review** — reviews a document against clause requirements.
- **Conversational AI Assistant** — clause Q&A + generation hand-offs.
- **AI engine:** Anthropic **Claude** (the string `Anthropic (Claude):` and a browser-direct call header were present) — i.e., the LLM is invoked **directly from the browser client**, not via an orchestrated agent backend.

**B. Registers / Records (CRUD + export)**
- Suppliers, Equipment/Calibration, Training/Competence, Risk/FMEA, Nonconformance/CAPA, Certifications, Objectives, Management Review, Audits — each filterable/sortable with **CSV and PDF export**.

**C. Aerospace-specific (AS9100D) depth**
- Configuration Management (8.1.2), **Product Safety** (8.1.3), **Counterfeit-Parts Prevention** (8.1.4), **FOD** prevention (8.5.4), **Special Process** control / NADCAP (8.4.2 / 8.5.1.2), **First Article Inspection (AS9102 FAI)**, OASIS reporting, Key Characteristics, ITAR.

**D. Workflow / lifecycle**
- Approval workflows with thresholds ("Approval Status Thresholds & Actions"), **auto-escalation**, activity log & audit trail, notifications/alert banners, 30-day/expiry reminders, color-coded status.

**E. Localization**
- Very broad multi-language UI (extensive language list incl. many Arabic locales) — signals international ambitions.

---

## 5. UX Patterns (observed)

- **Aesthetic:** dark theme (near-black `#0A0E17`), **DM Sans** + **Space Mono** typography — modern, "developer-tool" feel rather than legacy enterprise GRC.
- **Generate-then-refine loop:** heavy one-click generation, then **inline editable "highlighted fields"** — *"Click any highlighted field to fill it in"* — to close gaps; auto-save before AI regeneration.
- **Four-step onboarding**: *"From zero to audit-ready in four steps."*
- **Guided, opinionated defaults:** the assistant volunteers concrete SMB targets (OTD ≥ 87%, scrap ≤ 5%) and next actions.
- **Registers everywhere:** consistent list → filter → sort → export → detail pattern across modules.
- **Readiness scoring / checklists** as the organizing metaphor ("Stay Audit-Ready").
- **Assistant-as-copilot:** chat that both answers *and* offers to generate the relevant artifact.
- **Client-heavy:** PDF (jsPDF) and CSV generation happen in the browser; AI calls originate client-side.

---

## 6. Integration Points (observed)

| Integration | Evidence | Notes |
|---|---|---|
| **Stripe** | "Billing data is processed and stored by Stripe" | Payments only |
| **Anthropic Claude** | `Anthropic (Claude):`, browser-direct call header | Sole AI provider; **client-side** invocation |
| **Supabase** | (given context; SDK present) | Backend/auth/data — **not inspected per boundary rule** |
| **OASIS / IAQG** | "Certifications — OASIS", registrar directory | *Referenced/tracked*, not an API integration |
| **Export** | CSV + PDF generation | No inbound API/webhook/Zapier/SSO observed |

**No public API, webhook, SSO/SAML, SCIM, or third-party connector surface was observed.** Data portability is manual export ("Can I export my data if I leave CertifyAero?" → CSV/PDF).

---

## 7. Feature Walls Encountered

The **entire application** (all 16 modules above) sits **behind authentication**. The public surface is only the marketing shell + an interactive demo path. Wall/CTA language observed (documented, not exercised):

- **"Sign In"**, **"Sign Up Free"**, **"Create Account"**, **"Create Account & Join Team"**
- **"Start Free 14-Day Trial"**, **"Get Started — Free Trial"**, **"Get Started →"**, **"Subscribe Now"**
- **"Try Live Demo" / "Try Demo"** (a pre-auth demo mode)
- Password gate ("At least 8 characters"), MFA/TOTP factors present, password reset — i.e., email/password auth with optional MFA.

Per operational-security rules, **none of these were exercised** — no account, no trial, no demo session, no form submission. The wall *itself* is the competitive signal: the product is a closed, single-tenant-per-account SMB app with no open/enterprise surface.

---

## 8. Gaps Observed (relative to full ISO 9001 / 14001 / 45001 coverage)

| Gap | Detail | Cumplify.ai opening |
|---|---|---|
| **No ISO 14001 (Environmental)** | Zero environmental aspects/impacts, no environmental legal register, no waste/emissions/energy monitoring, no environmental emergency prep | Entire Environmental Management System is greenfield |
| **No ISO 45001 (OH&S)** | No hazard identification, no OH&S risk assessment / hierarchy of controls, no incident/injury reporting, no worker consultation & participation (45001 Cl. 5.4), no OH&S emergency preparedness | Entire OH&S Management System is greenfield |
| **No Integrated Management System (IMS)** | Single-standard, single-scheme; no shared context/leadership/objectives/audit/review across Q+E+OHS | IMS is the flagship differentiator |
| **AI is generator + chatbot, not agentic** | LLM called client-side for doc-gen and Q&A; no autonomous multi-step agents, no orchestration, no event-driven detection/closure | Bedrock **agentic** architecture (detect → draft → route → verify → close) |
| **No immutable/append-only audit trail** | "Activity log" is present but client-heavy; no cryptographic/WORM immutability claim | Append-only event log + WORM (S3 Object Lock) as a compliance guarantee |
| **Thin enterprise controls** | No SSO/SAML, SCIM, granular RBAC, multi-site, or API surface observed | Cognito role mapping, per-module IAM boundaries, multi-tenant enterprise story |
| **SMB single-plan** | Flat $349/mo; no multi-standard or enterprise tier | Per-standard + enterprise tiering |
| **Reactive registers** | Users maintain registers manually; alerts are date-based (expiry/interval) | Agents that *proactively* detect nonconformance, score risk in real time, and pre-stage audits |
| **Scope = certify, not operate** | Explicitly "internal tracking tool… does not guarantee certification" — optimized for *getting* certified | Cumplify can own *operating* the management system continuously across all three standards |

---

## 9. What CertifyAero Does Well (worth matching/beating)

1. **Instant document generation with clause traceability** — genuinely reduces the biggest pain (writing the QMS). Cumplify's **Document Studio + Document Generation Agent** must equal or exceed this, across three standards.
2. **Opinionated, SMB-friendly defaults** — concrete objectives and next-best-actions lower the expertise barrier. Cumplify agents should encode this guidance.
3. **Coherent register model** — every compliance object is a filterable/exportable register with alerts. Cumplify's Records/Risk/CAPA modules should preserve this consistency.
4. **AS9100D domain depth** — real aerospace nuance (FAI, FOD, counterfeit parts, NADCAP, OASIS). If Cumplify targets aerospace, this depth is table stakes; otherwise it is out of scope but instructive as a "vertical depth" model to replicate for Environmental/OH&S.
5. **Readiness-scoring UX metaphor** — "audit-ready" as the north-star metric is sticky. Cumplify can generalize it to a per-standard **conformance/readiness score** driven by agents.

---

## 10. Differentiation Thesis for Cumplify.ai (one line)

> CertifyAero *helps a small aerospace shop get its Quality manual written and stay ready for one audit.* **Cumplify.ai runs the entire Integrated Management System — Quality + Environmental + Occupational Health & Safety — with autonomous AI agents that continuously detect issues, draft and route corrective actions, score risk in real time, and keep an immutable audit trail — as an enterprise-grade, multi-tenant AWS platform.**
