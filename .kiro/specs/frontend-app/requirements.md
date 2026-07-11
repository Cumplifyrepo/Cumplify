# Frontend App — Requirements R2 (EARS Format)

**Spec:** `frontend-app` (spec 9)
**Phase:** P1 (product core — "Internal aha achieved")
**Revision:** R2 (2026-07-10) — addresses architect review FIX-1..9 + OQ answers
**Source documents:**

- `docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md` — Part 3 (authoritative: three-surface app + interaction grammar), Part 11 row 9, Part 13 (role model → ABAC-gated actions), Part 31 (trilingual layer)
- `.kiro/steering/21-framer-ui-source.md` — Framer = UI design source of truth (read FIRST); Figma integrated INTO Framer (owner 2026-07-10)
- `services/api/schema/schema.graphql` — the deployed api-core GraphQL schema (ONLY data contract)
- `contracts/events.md` — event taxonomy (subscription-driven UI updates)

**Depends on:** Spec 3 (`api-core` — GraphQL schema, authorizer, subscriptions). NOTE: this spec DESIGNS the HITL approval mutation contract itself (FIX-3 — `resolveHitlItem` is an internal function in `services/agents/shared/hitl.ts`, not a spec-4 GraphQL mutation; its deployed enum is APPROVED|REJECTED|TIMED_OUT with no payload/note fields and no SendTaskSuccess call).

**Current baseline:** `frontend/` directory contains only `public/brand/cumplify-logo.png`. The Framer project "Spora (copy)" is the design source. `framer-api` SDK is an installed dependency. `scripts/verify-framer.mjs` confirms live connectivity.

---

## 0. Architect Build Constraints (binding, non-negotiable)

| ID | Constraint |
|----|-----------|
| BC-1 | **Framer is the design source.** Layouts are read from the Framer project via the `framer-api` SDK per steering 21 — never invented. The UI design originates in Figma and is integrated into the Framer project (owner 2026-07-10); Framer remains the single machine-readable source. `FRAMER_API_KEY` lives only in `.env`, never committed. |
| BC-2 | **tenantId ALWAYS derives from token claims / resolverContext, never client input** (SCHEMA-5). The frontend never sends tenantId in mutation inputs — the API enforces this. |
| BC-3 | **UI role-gating is presentation only.** Authorization is server-enforced (Lambda authorizer + resolvers). The frontend hides/shows UI elements based on the token's `custom:role` claim, but never trusts client-side checks for security. |
| BC-4 | **No hardcoded user-facing strings.** Every visible string goes through the `next-intl` message catalog (EN/ES/PT). A pseudo-locale CI check fails the build on any hardcoded string. |
| BC-5 | **Every approval result links to its sealed audit event** — visible provenance per Part 3.2. The HITL card footer always shows the audit-trail link. |
| BC-6 | **Pool B/C only.** Sign-in accepts Pool B (`cumplify-tenant-admin`) and Pool C (`cumplify-tenant-user`) tokens via Amplify Auth SRP flow. Pool A rejection is API-enforced (authorizer returns 401) — do not weaken or bypass. Hosted UI would require an IdentityStack OAuth config change (flag as infra diff if wanted). |
| BC-7 | **Consolidated new schema surface** (reviewed as ONE REQUIRES-HUMAN item at design): `listPendingHitlItems` (query, GSI9-backed, paginated), `approveHitlItem` (mutation — this spec designs the contract), `onHitlItemResolved` (subscription), `getProfile` (query), `updateProfile` (mutation). No other new schema surfaces without REQUIRES-HUMAN review. |
| BC-8 | **taskToken must NEVER reach the client.** The HITL approval mutation input is `{hitlItemId, decision, editedPayload?, note?, justification?}` ONLY. The backend resolver derives tenantId + approver sub from token claims, fetches the HITL item server-side, and extracts taskToken itself. `taskToken` is excluded from every GraphQL type and query response. |
| BC-9 | **Brand:** Every logo/wordmark rendering uses `frontend/public/brand/cumplify-logo.png` (or build-time size-optimized derivatives). No recreated logos, no text styled as the logo. |
| BC-10 | AWS verification: `AWS_PROFILE=cumplify-dev-readonly`. Rule 7/8 evidence discipline applies. |

---

## 1. Surface 1 — Command Center (Home)

> The home surface is a work queue, not a module tree. The user's job: see what agents found → review what agents drafted → approve or redirect. (Part 3.1)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| CC-1 | **The system shall** display a **Readiness Score** (numeric, per-standard) with a trend indicator (delta + attribution text, e.g., "+3: emergency plan approved, 45001 8.2") sourced from the `getAuditReadiness(standard)` query. | Part 3.2 progress mechanics |
| CC-2 | **The system shall** display the **HITL Approval Queue**: a list of agent-drafted artifacts awaiting human approval, sourced from the `listPendingHitlItems` query (GSI9 `TENANT#<tenantId>#HITL_PENDING`). | Part 3.1; BC-7 |
| CC-3 | **Every item in the Approval Queue shall** render using the Part 3.2 card anatomy (§1.1 below). | Part 3.2 |
| CC-4 | **The system shall** display an **"Agents working now" live feed** via the `onDocumentStatusChanged`, `onCAPAStatusChanged`, `onFindingRecorded`, and `onRiskEscalated` subscriptions, showing real-time agent activity. | Part 3.1 |
| CC-5 | **The system shall** display a **Top Risks** panel sourced from `getCrossRegisterRiskView(standard, category)`, showing the highest-rated risks across standards. | Part 3.1 |
| CC-6 | **When** a relevant live-feed subscription event arrives (e.g., `onFindingRecorded` after a readiness-affecting finding), **the system shall** refetch `getAuditReadiness` to update the displayed score and trend. There is no direct subscription on `agentScoreReadiness` (it is `@aws_iam` agent-only). | Part 3.2; FIX-4 |
| CC-7 | **The system shall** render all Command Center content within the layout defined in the Framer project (steering 21). | BC-1 |

### 1.1 Part 3.2 Card Anatomy (verbatim acceptance criteria)

Every agent-touched artifact renders the same card anatomy, so the product teaches itself:

```
[Agent avatar + name]  [Clause chip: "ISO 14001 · 6.1.2"]  [Status: Draft → Pending approval]
  Finding / draft body (diff-view when superseding)
  [Approve]  [Edit & approve]  [Send back with note]        ← HITL, role-gated by ABAC
  footer: "On approval, event seals to your audit trail"     ← trust ritual, every time
```

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| CARD-1 | **Every agent-touched artifact shall** render with: agent avatar + name, clause chip (`{standard} · {clauseRef}`), status badge (current → next state). | Part 3.2 verbatim |
| CARD-2 | **The card body shall** display the finding or draft content, with a diff-view when the draft supersedes a prior version. | Part 3.2 verbatim |
| CARD-3 | **The card shall** display three HITL action buttons: **Approve**, **Edit & approve**, **Send back with note** — role-gated by ABAC (BC-3: hidden if the user's `custom:role` claim lacks approval permission for the artifact's module, but server always enforces). | Part 3.2 verbatim |
| CARD-4 | **The card footer shall** always display: "On approval, event seals to your audit trail" (the trust ritual). | Part 3.2 verbatim |
| CARD-5 | **After an approval action completes**, the card shall display a link to the sealed audit event (visible provenance — BC-5). | Part 3.2 psychology (b) |
| CARD-6 | **The card shall** include render-only slots for guardrails evidence fields: grounding score, AR verdict, and citations. These slots display data from the `guardrails-antihallucination` spec's HITL card data contract (`L5-4`) when present; otherwise they remain hidden. | guardrails-antihallucination L5-1 |
| CARD-7 | **When** a draft was flagged by a guardrail layer, **the card shall** require a typed justification in the approval flow before the mutation fires (the `justification` field in the mutation input). | guardrails-antihallucination L5-2 |

---

## 2. Surface 2 — Ask Cumplify (Persistent Chat)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| ASK-1 | **The system shall** provide a persistent chat interface ("Ask Cumplify") accessible from any screen (e.g., sidebar or overlay). | Part 3.1 Surface 2 |
| ASK-2 | **The chat shall** route questions to the appropriate Domain Guru via the `askISO9001(question)`, `askISO14001(question)`, and `askISO45001(question)` queries. The frontend sends the question text only — no `queryVector`. | schema.graphql; OQ-6 ANSWERED |
| ASK-3 | **Every chat answer shall** display the clauseRef citation inline (per the citation-or-silence rule: if no clause, the answer must be framed as general guidance). | Part 35 L4; steering 18-anti-hallucination |
| ASK-4 | **Each answer shall** offer **action chips** ("Draft this procedure → DocStudio", "Raise an NC", "Add to risk register") that, on click, pre-fill and navigate to the corresponding module mutation form. | Part 3.1 Surface 2 |
| ASK-5 | **The chat shall** display agent responses in the requesting user's locale (EN/ES/PT), as determined by the user's profile locale setting. | Part 31.1 "Agent outputs" |
| ASK-6 | **The chat input shall** accept free-text questions in any of the three supported languages (EN/ES/PT) without requiring a language selector. | Part 31 multilingual |
| ASK-7 | **The frontend NEVER embeds.** The `queryVector` parameter exists for server-side use only. When spec-35 (`guardrails-antihallucination`) lands the embedding door (EMB-1), the guru resolver adapter will gain a server-side `embed()` call. Until then, the guru resolvers handle embedding internally. The frontend sends question text only. | OQ-6 ANSWERED; dependency on spec-35 EMB-1 |

---

## 3. Surface 3 — Module Register UIs (M1–M5)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| MOD-1 | **The system shall** provide register UIs for modules M1 (Document Studio), M2 (CAPA), M3 (Audit Studio), M4 (Records Management), and M5 (Risk Management) using the queries and mutations defined in `services/api/schema/schema.graphql`. | Part 3.1 Surface 3; Part 11 row 9 |
| MOD-2 | **Each module UI shall** follow the Framer-defined layouts (BC-1) and render data exclusively from the api-core GraphQL queries. | BC-1; BC-7 |
| MOD-3 | **M1 Document Studio shall** provide: document list (filtered by standard/status), document detail with version history, diff view between versions, and forms for `createDocumentDraft`, `submitDocumentForApproval`, `approveDocumentVersion`, `publishControlledDocument`, `updatePolicy`, `updateImsScope`. | schema.graphql M1 operations |
| MOD-4 | **M2 CAPA shall** provide: NC list (filtered by standard/severity), CAPA detail with root-cause + corrective-actions timeline, and forms for `raiseNonconformity`, `recordRootCause`, `createCorrectiveAction`, `closeCapa`, `verifyEffectiveness`, `disposeNonconformingOutput`. | schema.graphql M2 operations |
| MOD-5 | **M3 Audit Studio shall** provide: audit programme overview, individual audit with checklist + findings, readiness heatmap per standard/clause, and forms for `createAuditProgramme`, `scheduleAudit`, `recordFinding`, `completeAudit`. | schema.graphql M3 operations |
| MOD-6 | **M4 Records Management shall** provide: record register, calibration schedule with due-date warnings (from `listCalibrationsDue`), audit-trail viewer (from `getAuditTrail`), and forms for `registerRecord`, `recordCalibration`, `createRetentionPolicy`. | schema.graphql M4 operations |
| MOD-7 | **M5 Risk Management shall** provide: risk register (filterable by standard/category), cross-register risk view (from `getCrossRegisterRiskView`), and forms for `createRisk`, `addRiskTreatment`, `createChangePlan`. | schema.graphql M5 operations |
| MOD-8 | **Every mutation form shall** omit the `tenantId` field (SCHEMA-5). The resolver injects tenantId from `resolverContext`. | BC-2 |
| MOD-9 | **Every number, date, and audit-trail reference visible in module UIs shall** link to its sealed audit event when one exists (visible provenance). | Part 3.2 psychology (b); BC-5 |
| MOD-10 | **Module UIs shall** display real-time updates via `onDocumentStatusChanged`, `onCAPAStatusChanged`, `onFindingRecorded`, and `onRiskEscalated` subscriptions without requiring page refresh. (`onCalibrationDue` is excluded — it has no `@aws_subscribe` directive and no publisher mutation; calibration due-ness comes from `listCalibrationsDue`.) | schema.graphql; FIX-5 |

---

## 4. HITL Approval Path (End-to-End)

> This spec DESIGNS the approval mutation contract. `resolveHitlItem` (`services/agents/shared/hitl.ts`) is an internal bookkeeping function with enum APPROVED|REJECTED|TIMED_OUT — it takes no payload/note fields and does NOT call SendTaskSuccess. The new approval Lambda this spec designs: validates role (Part 13), calls Step Functions `SendTaskSuccess` (approve/edit) or the send-back path, invokes `resolveHitlItem` for bookkeeping, and publishes the audit event via the registry.

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| HITL-1 | **The system shall** display pending HITL items from the `listPendingHitlItems` query (GSI9 `TENANT#<tenantId>#HITL_PENDING`) in the Command Center Approval Queue, sorted by age (oldest first). | Part 3.1; BC-7 |
| HITL-2 | **When** a user clicks **Approve** on a HITL card, **the system shall** call the approval mutation with `{hitlItemId, decision: 'APPROVE'}`. The backend resolver fetches the HITL item server-side, extracts `taskToken`, calls SFN `SendTaskSuccess`, invokes `resolveHitlItem(APPROVED)` for bookkeeping, and publishes the audit event. **taskToken never reaches the client (BC-8).** | FIX-1; FIX-3 |
| HITL-3 | **When** a user clicks **Edit & approve**, **the system shall** present an inline editor for the draft content, then call the approval mutation with `{hitlItemId, decision: 'APPROVE', editedPayload: <modified content>}`. The backend passes the edited payload through `SendTaskSuccess` so the downstream state machine receives it. | Part 3.2; FIX-1 |
| HITL-4 | **When** a user clicks **Send back with note**, **the system shall** prompt for a free-text note, then call the approval mutation with `{hitlItemId, decision: 'SEND_BACK', note: <text>}`. | Part 3.2; FIX-1 |
| HITL-5 | **The approval mutation's backend resolver shall** pass `$$.Execution.Id` (the `sfnExecutionArn` present on the HITL item from the WaitForApproval Payload — spec-4 carry #3) through the resolution path so the audit event references the execution. | spec-4 carry #3 |
| HITL-6 | **After a successful approval**, **the system shall** display the resulting sealed audit-event link on the card (visible provenance — the audit event is published by the resolver on approval). | BC-5 |
| HITL-7 | **When** the HITL item was flagged by a guardrail layer (grounding score below threshold, AR rejection), **the system shall** display the guardrail evidence (grounding score, AR verdict, citations) in the card and require a typed `justification` field in the mutation input before permitting the Approve action. | guardrails-antihallucination L5-2; CARD-7 |
| HITL-8 | **The HITL action buttons shall** be role-gated per Part 13's permission matrix: only roles with approval rights for the artifact's module see the buttons (based on `custom:role` claim). Other roles see the card in read-only mode. | BC-3; Part 13 |
| HITL-9 | **The `listPendingHitlItems` query response shall NOT include `taskToken`** — it is excluded from the GraphQL type definition. The response includes: `hitlItemId`, `agentName`, `clauseRef`, `standard`, `module`, `draftBody`, `status`, `createdAt`, `guardrailEvidence?` (grounding score, AR verdict, citations). | BC-8; FIX-1 |
| HITL-10 | **FLAG (REQUIRES-HUMAN adjacent):** The send-back decision (`SEND_BACK`) requires a WaitForApproval failure/choice branch in the writeback state machine that does not exist today. This is an **AiStack amendment** that must be designed and reviewed alongside the approval mutation. | FIX-3 |
| HITL-11 | **The `onHitlItemResolved` subscription** (part of the BC-7 consolidated schema surface) shall notify the Command Center when a HITL item is resolved (any decision), enabling real-time queue updates without polling. 15-second polling is acceptable as an interim until this subscription is wired. | FIX-2; OQ-5 ANSWERED |

---

## 5. Authentication & Identity

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| AUTH-1 | **The system shall** authenticate users via Cognito Pool B (`cumplify-tenant-admin`) or Pool C (`cumplify-tenant-user`) using **Amplify Auth with SRP flow** (no hosted UI — hosted UI would require an IdentityStack OAuth config change, flagged in OQ-8 if desired). | Part 32.1; BC-6; FIX-7 |
| AUTH-2 | **The system shall** use the **ID token** (not access token) for AppSync requests, per the spine rule (token_use='id', custom claims including `custom:tenantId`, `custom:role`, `poolClass`). | api-core authorizer design; FIX-6 |
| AUTH-3 | **The system shall** store the authenticated user's locale preference and pass it in request context so agent responses arrive in the correct language. (Storage location TBD — see OQ-7.) | Part 31.1 |
| AUTH-4 | **The system shall NOT** accept or process Pool A tokens — this is enforced server-side (authorizer 401). The frontend does not configure Pool A as an identity provider. | BC-6 |
| AUTH-5 | **The system shall** extract the user's role from the `custom:role` claim (PreTokenGen-stamped) for presentation-only UI gating (show/hide elements). `cognito:groups` is fallback only (per `services/api/src/authorizer.ts:178`). Security enforcement remains server-side. | BC-3; FIX-6 |

---

## 6. Internationalization (Trilingual EN/ES/PT)

### 6.1 Part 31.1 Rows (verbatim acceptance criteria)

| Layer | Rule | Implementation |
|-------|------|----------------|
| **UI strings** | Full catalogs EN/ES/PT; RTL-ready framework stands (future languages) | next-intl/ICU messages; locale per **user** (profile) with tenant default; pseudo-locale CI check for hardcoded strings |
| **Agent outputs** | Every agent responds in the *requesting user's* locale; documents draft in the *tenant's* document locale (a Settings → Organization field — a Mexican plant may run the IMS in Spanish but publish supplier docs in English) | Locale injected into every invocation context by the bedrock-invoker layer (one choke point, v3 22.3); Nova family is multilingual across all three languages — no per-language model forks |

### 6.2 i18n Requirements

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| I18N-1 | **The system shall** use `next-intl` with ICU message format for all user-facing strings across EN, ES, and PT catalogs. | Part 31.1 "UI strings" |
| I18N-2 | **The system shall** determine the active locale from the user's profile setting (storage TBD — OQ-7), with fallback to the tenant's default locale (Settings → Organization `document-locale` field). | Part 31.1 |
| I18N-3 | **A pseudo-locale CI check shall** fail the build if any hardcoded user-facing string is detected outside the message catalogs. | Part 31.1; BC-4 |
| I18N-4 | **Agent-generated content** (chat answers, draft bodies in HITL cards) **shall** be displayed as-is — the invoker layer handles locale injection at generation time. The frontend does not translate agent outputs. | Part 31.1 "Agent outputs" |
| I18N-5 | **Date, number, and currency formatting shall** follow the active locale's conventions (ICU formatters via `next-intl`). | Standard i18n practice |
| I18N-6 | **The clause chip** (e.g., "ISO 14001 · 6.1.2") **shall NOT** be translated — clause numbers and structure are language-invariant per Part 31.1. Only clause *titles* localize. | Part 31.1 "Clause canon" |

---

## 7. Framer Design Integration & Brand

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| FRM-1 | **All page layouts, component structures, and visual design tokens** (colors, spacing, typography) shall be sourced from the Framer project "Spora (copy)" via the `framer-api` SDK. The Figma design is integrated into the Framer project (owner 2026-07-10); Framer remains the single machine-readable source — no separate Figma API integration. | Steering 21 |
| FRM-2 | **A design-sync script** (under `scripts/` or `frontend/scripts/`) shall connect to the Framer project, extract layout metadata, and produce React component skeletons or design-token files that the Next.js app consumes. | Steering 21 connect pattern |
| FRM-3 | **The `FRAMER_API_KEY` shall** exist only in `.env` (git-ignored). The design-sync script uses `node --env-file=.env` to load it. No dotenv package. | Steering 21; BC-1 |
| FRM-4 | **The system shall NOT** invent UI layouts without referencing the Framer project. Where Framer does not define a specific view, flag it as an Open Question rather than guessing. | BC-1 |
| BRD-1 | **Every logo/wordmark rendering shall** use `frontend/public/brand/cumplify-logo.png` or build-time size-optimized derivatives (e.g., WebP conversion, responsive srcset). No recreated logos, no text styled as the logo. | BC-9; steering 21 Brand assets |
| BRD-2 | **The canonical logo** (blue infinity-checkmark mark + white "Cumplify" wordmark) is legible on dark surfaces only. Light-background usage and favicon/avatar crop are owner-owed assets — see OQ-9. | Steering 21 Brand assets |

---

## 8. Real-Time Updates (Subscriptions)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| SUB-1 | **The system shall** establish AppSync real-time WebSocket subscriptions on sign-in for: `onDocumentStatusChanged`, `onCAPAStatusChanged`, `onFindingRecorded`, `onRiskEscalated`, and `onHitlItemResolved` (BC-7 consolidated schema). | schema.graphql; FIX-5 (onCalibrationDue removed) |
| SUB-2 | **Subscription connections shall** use the authenticated user's ID token. The subscription resolvers verify `tenantId` server-side (C-6). | api-core design |
| SUB-3 | **When** a subscription event arrives, **the system shall** update the relevant UI (Command Center live feed, module list, HITL queue) without full page reload. | Part 3.1 |
| SUB-4 | **The system shall** handle WebSocket disconnections gracefully: reconnect with exponential backoff and replay missed events on reconnection (or refetch the affected query). | Robustness |

---

## 9. Settings (Minimal — OQ-2 ruling)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| SET-1 | **The system shall** provide a Settings navigation entry (Pool B users only — `custom:role` claim with admin permission). | Part 14; OQ-2 ANSWERED |
| SET-2 | **The system shall** render a Settings → Organization section containing (at minimum) the `document-locale` field (EN/ES/PT selector) that determines the tenant's default locale for agent-drafted documents. | Part 31.1; I18N-2 dependency |
| SET-3 | **Full Settings UI** (Users & Roles, Security, Billing, Integrations, Approvals & Workflows, Data & Retention, Audit Log) is **out of scope** — deferred to dedicated specs. | OQ-2 ANSWERED |

---

## 10. Accessibility & Performance

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| A11Y-1 | **The system shall** meet WCAG 2.1 Level AA for all interactive surfaces (Command Center, Ask Cumplify, module UIs, HITL cards). | Standard requirement |
| A11Y-2 | **Every HITL action button shall** have an accessible label describing the action and the artifact it applies to. | WCAG 2.1 |
| A11Y-3 | **The chat interface (Ask Cumplify) shall** support keyboard navigation and screen-reader announcements for new messages. | WCAG 2.1 |
| PERF-1 | **Initial page load (Command Center) shall** achieve Largest Contentful Paint ≤ 2.5s on a simulated 4G connection. | Web Vitals target |
| PERF-2 | **The system shall** use Next.js static export (`output: 'export'`) as a client-side SPA. All data fetching is client-side against AppSync after sign-in. Code-splitting and a light shell with skeleton loading states enable LCP ≤ 2.5s. No server components — the app is fully static, served from S3+CloudFront. | Next.js architecture (hosting pivot fc6849a) |

---

## 11. Acceptance Criteria (Headline Proofs)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| ACC-1 | **The Command Center shall** display the readiness score, HITL queue (at least one pending item from `listPendingHitlItems`), live agent feed (subscription event rendered within 5s of publish), and top risks — all for the authenticated user's tenant. Evidenced by a witnessed walkthrough. | Part 3.1 |
| ACC-2 | **An Ask Cumplify query** ("What does ISO 9001 clause 8.5.1 require?") shall return a grounded answer with clauseRef citation, rendered in the user's locale, with at least one action chip. Evidenced by screenshot + network trace showing `askISO9001` query (no `queryVector` sent). | Part 3.1 Surface 2; OQ-6 ANSWERED |
| ACC-3 | **A full HITL approval flow**: pending item visible in `listPendingHitlItems` → user clicks Approve → approval mutation fires `{hitlItemId, decision:'APPROVE'}` (no taskToken in payload) → item disappears from queue → sealed audit event link appears on the card. Evidenced end-to-end. | Part 3.2; HITL-2; BC-8 |
| ACC-4 | **A flagged HITL approval**: item with guardrail flag → typed justification required → mutation includes `justification` field → sealed to audit trail. Evidenced by mutation payload + audit event. | HITL-7; guardrails L5-2 |
| ACC-5 | **Locale switch**: user changes locale EN→ES → all UI strings re-render in Spanish; agent chat responses arrive in Spanish on next query. Evidenced by screenshot comparison. | I18N-1..4 |
| ACC-6 | **Pseudo-locale CI check**: a deliberately hardcoded string in a component fails the build. Evidenced by CI log. | I18N-3; BC-4 |
| ACC-7 | **Role gating (presentation)**: a Pool C user with `Employee` role (from `custom:role`) sees HITL cards in read-only (no Approve button); a Pool B user with `Quality Manager` role sees the full action set. Evidenced by side-by-side screenshots. Server enforcement separately proven by api-core. | BC-3; Part 13; FIX-6 |
| ACC-8 | **Pool A rejection**: the frontend sign-in flow does not offer Pool A as an option; a manually injected Pool A token results in 401 from the API (proven by api-core ACC-3). | BC-6 |
| ACC-9 | **taskToken exclusion**: the `listPendingHitlItems` response schema and all HITL-related GraphQL types do NOT contain a `taskToken` field. Evidenced by schema inspection + network trace of a queue fetch. | BC-8; FIX-1 |

---

## 12. Out of Scope

| Item | Reason | Owning spec |
|------|--------|-------------|
| Marketing funnel S0–S5 + activation emails | Growth-plane screens | `frontend-funnel` |
| Snapshot landing page | Pre-auth growth surface | `growth-snapshot` |
| Signup / trial / legal consent screens | Identity + legal gate | `signup-legal-gate` |
| Billing UI (plan, seats, invoices, Stripe portal) | Billing spec owns the UI | `billing-entitlements` |
| Modules M6–M13 | Phase 3 IMS completion | `modules-new-8` |
| Trust Center (public per-tenant page, Part 14.2) | Separate public surface | `trust-center` (OQ-3 ANSWERED) |
| Admin plane (`admin.cumplify.ai`, Pool A) | Separate app, IP-allowlisted | Future spec |
| Full Settings UI (Users & Roles, Security, etc.) | Beyond nav + Organization section | Dedicated spec(s) per OQ-2 |
| Guardrail configuration / AR policy authoring | Backend invoker concern | `guardrails-antihallucination` |
| `onCalibrationDue` subscription | Inert — no @aws_subscribe, no publisher; api-core closure will disposition | api-core follow-up |
| Hosted UI / OAuth configuration | Would require IdentityStack infra diff | Flag in OQ-8 if wanted |

---

## 13. Open Questions

| # | Status | Question | Impact | Resolution |
|---|--------|----------|--------|------------|
| OQ-1 | OPEN | **Amplify Hosting vs CloudFront+S3 for Next.js SSR under our CDK pipeline.** Amplify Hosting is managed (zero infra code for SSR/ISR/streaming) but may not integrate cleanly with the self-mutating CDK Pipeline in the mgmt account. CloudFront+S3+Lambda@Edge gives full CDK control but requires SSR function management. | Deployment architecture | Investigate both options at design with evidence; no ruling yet. |
| OQ-2 | **ANSWERED** | Where does the Settings surface land? | I18N-2 dependency; nav structure | **This spec builds the Settings navigation entry and the Organization section (document-locale field) only. Full Settings UI deferred to dedicated specs.** |
| OQ-3 | **ANSWERED** | Trust Center spec ownership. | Nav + scope | **Separate `trust-center` spec. This spec does not build it.** |
| OQ-4 | **ANSWERED** | HITL item schema / resolveHitlItem contract. | HITL-2..7 | **The contract does NOT exist in spec 4. This spec designs the approval mutation contract per FIX-1/FIX-3. `resolveHitlItem` is internal bookkeeping only.** |
| OQ-5 | **ANSWERED** | Subscription for HITL queue updates. | CC real-time | **Option (a): `onHitlItemResolved` subscription, folded into BC-7's consolidated schema review. 15s polling acceptable as interim.** |
| OQ-6 | **ANSWERED** | `queryVector` in Ask Cumplify. | ASK-7 | **The frontend NEVER embeds. Send question only. The guru adapter gains a server-side embed() call when spec-35 lands the embedding door. Dependency noted.** |
| OQ-7 | **ANSWERED** | **Where does the per-user locale preference live?** | AUTH-3; I18N-2 | **Option (b) ruled (architect 2026-07-10): `PROFILE#<userId>` item in CumplifyCore DynamoDB. No pool schema change needed.** |
| OQ-8 | OPEN (new) | **Hosted UI.** Pool B/C app clients are SRP-only today. If hosted UI (social login, forgot-password flow) is desired, an IdentityStack OAuth config change is needed. Flag as infra diff if wanted. | AUTH-1 | Not blocking — SRP works. Owner decision if/when needed. |
| OQ-9 | OPEN (new) | **Light-background logo variant + square mark-only favicon crop.** The canonical logo (`frontend/public/brand/cumplify-logo.png`) is white-wordmark-on-dark — usable only on dark surfaces. A light-background variant and a square mark-only crop (for favicon/avatar) are needed from the owner. **Do not fabricate.** | BRD-2; favicon | Owner-owed asset. Flag, don't guess. |
