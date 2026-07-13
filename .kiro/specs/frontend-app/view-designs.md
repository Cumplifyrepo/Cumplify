# Frontend View Designs — Architect Design Authority (Tasks 25–31 + Task 11 wiring)

**Status:** ACTIVE design authority for the views absent from Framer.
**Authority:** owner decision 2026-07-11 (`design-authority-owner-decisions.md`, commit 3433654) — gap-view design delegated to the architect; supersedes FRM-4 "owner provides Framer designs" (33f1e57). Steering 21 amended accordingly.
**Fresh inventory (2026-07-13):** `framer-api getNodesWithType("WebPageNode")` re-run — 14 pages, 22 components, unchanged; `/dashboard` remains the only authenticated-app page. M1–M5, Ask Cumplify, and Settings pages CONFIRMED ABSENT from Framer. Per the owner decision, that absence resolves to THIS document, not to a block.
**Token source:** `frontend/src/tokens/design-tokens.ts` (Layer 1 = verbatim `getColorStyles`/`getTextStyles` extraction 2026-07-13; Layer 2 = semantic dark-theme mapping). Raw extraction regenerable via `scripts/framer-sync.mjs` → `framer-styles.json`.
**Reference anchors:** `/dashboard` page render (layout anatomy: fixed left sidebar with section-labelled nav, main column of grouped cards, page title, top-right primary action) and the atom set (Nav Bar, Logo, Card 1/2/3, Primary/Secondary Button, Toggle Button) as rendered on the template pages. The template pages themselves are light-theme marketing content — layout anatomy carries over; ALL surfaces use the dark semantic tokens (owner: dark theme, steering 21).

Binding rule for Kiro: every task 25–31 checkbox that read "Framer page confirmed via SDK inventory" is satisfied by the corresponding section of this document (§4–§10). Do not invent layout outside it; where this document is silent, follow the shared patterns in §2–§3.

---

## 1. App Shell (prerequisite for all views)

Route group: all authenticated views render inside `AppShell` (`frontend/src/components/shell/`). The current `/dashboard` page migrates into it.

```
<AppShell>                          // grid: 260px sidebar | 1fr main; height 100vh
  <Sidebar>                         // bg: surface; border-right: borderSubtle
    <Logo />                        // brand/cumplify-logo.png, white wordmark (BC-9); links to /dashboard
    <NavSection label="OPERATE">    // labelSmall, textMuted
      /dashboard   Command Center
      /ask         Ask Cumplify     // also opens as overlay via chip/shortcut, §4
    <NavSection label="MODULES">
      /m1  Document Studio
      /m2  CAPA
      /m3  Audit Studio
      /m4  Records
      /m5  Risk
    <NavSection label="ADMIN">      // section hidden unless role permits (BC-3)
      /settings    Settings         // Pool B roles only (task 31)
    <UserFooter />                  // avatar initial, custom:role label, locale switcher (updateProfile), sign-out
  </Sidebar>
  <Main>                            // bg: bg; padding panelPad; max-width 1200px column
    <PageHeader title=... actions=... />
    {children}
  </Main>
</AppShell>
```

- Active nav item: `surfaceRaised` background + `accent` left rail (3px), text `textHeading`; inactive text `textSecondary`, hover `surfaceHover`.
- Nav role-gating is PRESENTATION only (hide what the role can't use); the server always enforces (BC-3). Use `role-matrix.ts` vocabulary via the `custom:role` claim (normalizeRole aliases apply — see BUG-11a).
- All nav strings under i18n namespace `nav.*`.

## 2. Shared components (build once, in `frontend/src/components/`)

| Component | Spec |
|---|---|
| `Panel` | Card 1 language: bg `surface`, radius `card`, border 1px `border`, padding `cardPad`–`panelPad`; optional title (panelTitle) + subtitle (small, textMuted) + header-right slot. |
| `StatusBadge` | pill, labelSmall; status→color: draft/pending=`warning`, approved/closed/published=`success`, rejected/overdue/escalated=`danger`, in-progress/info=`accentMuted`. Text on dark chip bg = 12% tint of the status color over `surfaceRaised`. |
| `ClauseChip` | pill chip `{standard} · {clauseRef}` (e.g. "ISO 9001 · 8.5.1"), bg `surfaceRaised`, text `textSecondary`, labelSmall. |
| `ProvenanceLink` | MOD-9: any number/date/state that has a sealed audit event renders with a subtle chain-link icon suffix (accentMuted); click → audit-trail viewer (§8) filtered to that `entityId`, or the event detail when `auditEventId` is known (CARD-5 reuses this). Tooltip: t('provenance.sealed'). |
| `DataTable` | header row `surfaceRaised` + labelSmall textMuted; rows border-bottom `borderSubtle`, hover `surfaceHover`; body text `textBody`; empty state = `EmptyState`. Column defs per view below. |
| `FormDrawer` | right-side drawer (480px, bg `surface`, border-left `border`) hosting every mutation form. Fields NEVER include tenantId (MOD-8/SCHEMA-5). Inputs: bg `surfaceRaised`, radius `control`, border `borderSubtle`, focus border `accent`. Primary submit = pill accent button (PrimaryButton); cancel = SecondaryButton (pill, transparent, border `borderStrong`). On success: close, toast with `ProvenanceLink` to the resulting audit event when the mutation is audit-trailed. |
| `EmptyState` | centered, textMuted body + optional action button. Every list view defines its copy key. |
| `ErrorState` | body text `danger` tint + retry (common.retry). |
| `useTenantSubscription(hook)` | wraps an AppSync subscription with (a) tenantId arg from the ID-token claim, (b) reconnect w/ backoff, (c) cleanup. All real-time bindings (§3, §5–§9) go through it. |

Buttons: `PrimaryButton` = pill, bg `accent`, text `textOnAccent`, hover 8% lighten; `SecondaryButton` = pill, transparent, 1px `borderStrong`, text `textHeading`; destructive variant swaps accent→`danger`.

## 3. GraphQL client + Command Center live wiring (completes Task 11; exercised by Task 22/ACC-1)

**Client:** `aws-amplify` v6 `generateClient`, configured in `frontend/src/lib/api.ts`:
- `API.GraphQL.endpoint` = ApiStack GraphQL URL, `defaultAuthMode: 'lambda'`, `authToken` = the Cognito **ID token** (the Lambda authorizer verifies issuer + pinned audience of Pool B/C app clients — FIX-1). Subscriptions ride the same auth mode over AppSync realtime WSS (proven live at Task 16: `onHitlItemResolved` delivered twice).
- **Auth:** Amplify Auth category configured with Pool B (managers) — SRP sign-in form (app clients are SRP-only; no client changes needed). Pool C added to the sign-in flow when Pool-C journeys open; Pool A is NEVER offered (BC-6/ACC-8). Sign-in page = minimal dark card (logo, email, password, PrimaryButton) at `/sign-in`.
- **Build-time env:** `NEXT_PUBLIC_GRAPHQL_URL`, `NEXT_PUBLIC_USER_POOL_ID`, `NEXT_PUBLIC_USER_POOL_CLIENT_ID` — sourced from `cdk-outputs.json` at build (script step in `frontend/package.json`, `predev`/`prebuild`), NOT hardcoded. Static export (OQ-1c) means all data fetching is client-side after auth — the "server component" language in Task 11 resolves to client components with suspense boundaries.

**Panel bindings (Part 3.1, CC-1..CC-6):**
| Panel | Binding | Notes |
|---|---|---|
| Readiness Score | `getAuditReadiness(standard)` × 3 standards on mount | Big numeric (pageTitle size) + `TrendIndicator` (delta + attribution text, CC-1): positive=`success`, negative=`danger`. One sub-card per standard (Card 2 language, grid 3-up). CC-6: refetch on any `onFindingRecorded`/`onCAPAStatusChanged` event. |
| HITL Approval Queue | `listPendingHitlItems(pagination)` + `onHitlItemResolved` to remove/refresh resolved cards; keep 15s polling as fallback until the subscription bind is verified in the walkthrough, then drop it. | Card anatomy = CARD-1..7 verbatim (avatar+agent name, ClauseChip, StatusBadge current→next, body w/ diff when superseding, 3 role-gated buttons, trust-ritual footer CARD-4, ProvenanceLink after approve CARD-5, guardrail-evidence slots CARD-6). **CARD-7 lives here:** when `guardrailEvidence` marks the item flagged, the Approve action opens a required-justification modal and the mutation includes `justification` — this is the enforcement point Task 17 left open; re-verify at implementation. |
| Agents Working Now | `useTenantSubscription` on `onDocumentStatusChanged`, `onCAPAStatusChanged`, `onFindingRecorded`, `onRiskEscalated`; append-only feed (max 50, newest first) | Row: dot (accent, pulse while <60s old), event label, ClauseChip when present, relative time (textMuted). |
| Top Risks | `getCrossRegisterRiskView()` top 5 by riskRating | Row: title, StatusBadge(severity by rating: ≥15 danger, ≥8 warning, else success), rating number w/ ProvenanceLink, standard chip. "View all →" → /m5. |

## 4. Task 25 — Ask Cumplify (`/ask` + global overlay)

Persistent access (ASK-1): sidebar item AND a floating trigger (bottom-right, pill, logo mark) on every view; both open the same `AskPanel` — full page at `/ask`, overlay (420px right sheet) elsewhere. State persists across open/close within a session (client store).

```
<AskPanel>
  <MessageList>            // user msg: bg surfaceRaised, right-aligned, radius inner
                           // answer: bg surface, border border, radius card
    <Answer>
      <MarkdownBody/>                      // body, textBody
      <CitationRow/>                       // ClauseChip per citation (ASK-3); if NO clauseRef →
                                           // labelSmall banner t('ask.generalGuidance') (citation-or-silence)
      <ActionChips/>                       // ASK-4, see table
    </Answer>
  <StandardSelector/>      // segmented pill: 9001 | 14001 | 45001 (routes to askISO*)
  <ChatInput/>              // multiline, free text any locale (ASK-6), send = PrimaryButton
</AskPanel>
```

- Routing (ASK-2): selected standard → `askISO9001|askISO14001|askISO45001(question)` — question text ONLY, never `queryVector` (ASK-7; ACC-2 network trace asserts this).
- Answers arrive in the profile locale (ASK-5) — no client-side translation.
- Action chips (ASK-4) — chip → navigation with prefill (URL params consumed by the target FormDrawer):
  | Chip | Target |
  |---|---|
  | t('ask.chipDraftProcedure') | `/m1?draft=1&title=<derived>&standard=<sel>` → createDocumentDraft drawer |
  | t('ask.chipRaiseNc') | `/m2?raise=1&description=<derived>&standard=<sel>` → raiseNonconformity drawer |
  | t('ask.chipAddRisk') | `/m5?create=1&title=<derived>&standard=<sel>` → createRisk drawer |
- Loading: shimmer on a ghost answer card; errors: ErrorState inline. i18n namespace `ask.*`.
- ACC-2 closes against this view: grounded answer + clauseRef + ≥1 action chip + no-queryVector trace.

## 5. Task 26 — M1 Document Studio (`/m1`, detail `/m1/[id]`)

- **List:** PageHeader("Document Studio", action: PrimaryButton t('m1.newDraft') → createDocumentDraft drawer). Filter bar: standard pills + status select (`listDocuments(standard,status)`). DataTable: Title, StatusBadge(status), standard ClauseChip, version, updatedAt w/ ProvenanceLink.
- **Detail:** header (title, StatusBadge, ClauseChip) + action row gated by status AND role: submitDocumentForApproval (DRAFT), approveDocumentVersion (IN_REVIEW, approver roles), publishControlledDocument (APPROVED). Body: document content panel + right rail = version history list (each version row → select two → t('m1.compare')).
- **Diff view:** `getDocumentVersionDiff(v1,v2)` full-width panel; added = `success` 12% tint bg line, removed = `danger` tint + strikethrough; monospace 14px. (CARD-2 reuses this component for superseding drafts.)
- **Forms (MOD-3):** createDocumentDraft, updatePolicy, updateImsScope in FormDrawers.
- **Real-time:** `onDocumentStatusChanged` patches list/detail rows in place (MOD-10); provenance links per MOD-9.
- i18n `m1.*`. Empty list copy per filter state.

## 6. Task 27 — M2 CAPA (`/m2`, NC detail `/m2/[id]`)

- **List:** two tabs — t('m2.nonconformities') (default) and t('m2.openCapas') (`listOpenCAPAs(standard,severity)`). Filter: standard + severity. NC table: Title, severity StatusBadge, standard, raisedAt, status. PageHeader action: t('m2.raiseNc') → raiseNonconformity drawer (Ask Cumplify chip lands here prefilled, §4).
- **Detail = CAPA timeline** (the differentiating layout, MOD-4): vertical timeline, dot per stage on a `borderSubtle` rail — NC raised → root cause (`recordRootCause` drawer) → corrective actions (n, `createCorrectiveAction`) → effectiveness check (`verifyEffectiveness`) → closed (`closeCapa`). Future stages ghosted (textMuted, dashed dot) with their action button inline at the next actionable stage; completed stages carry timestamps w/ ProvenanceLink. `disposeNonconformingOutput` = secondary action in the header overflow.
- **Real-time:** `onCAPAStatusChanged` advances the timeline live. i18n `m2.*`.

## 7. Task 28 — M3 Audit Studio (`/m3`, audit detail `/m3/[id]`)

- **Overview:** two stacked panels. (1) Programme overview — programmes with their audits (`createAuditProgramme`, `scheduleAudit` drawers). (2) **Readiness heatmap** (MOD-5): grid rows = clause families, columns = standards, cell = readiness bucket from `getAuditReadiness` per standard (cell bg: `success`/`warning`/`danger` at 25% tint over surface, score on hover); cells link to /m3 filtered.
- **Audit detail:** header (StatusBadge, dates, ClauseChip) + checklist panel (items with pass/fail/observation ticks) + findings list (`recordFinding` drawer per row context; finding rows severity-badged w/ ProvenanceLink). `completeAudit` = PrimaryButton in header when all checklist items resolved (else disabled w/ tooltip).
- **Real-time:** `onFindingRecorded` appends to the findings list + repaints the heatmap (same CC-6 refetch rule). i18n `m3.*`.

## 8. Task 29 — M4 Records Management (`/m4`)

Three tabs (no detail route in P1):
1. **Record register:** DataTable (Name, type, retention class, registeredAt w/ ProvenanceLink); `registerRecord` + `createRetentionPolicy` drawers.
2. **Calibration schedule:** `listCalibrationsDue(windowDays: 90)`; table sorted by due date; due-soon (<14d) row accent = `warning` left rail, overdue = `danger` (MOD-6 due-date warnings); `recordCalibration` drawer per row.
3. **Audit-trail viewer:** entityId search input → `getAuditTrail(entityId)`; renders the sealed chain — event rows: detailType, ULID (mono, labelSmall), timestamp, actor; expandable payload (mono, `surfaceRaised`). This view is the ProvenanceLink TARGET for the whole app (§2) — deep-linkable via `/m4?trail=<entityId>#<eventId>`.
No module subscription (MOD-10 excludes onCalibrationDue by design). i18n `m4.*`.

## 9. Task 30 — M5 Risk Management (`/m5`)

- **Register:** DataTable (Title, category, standard, riskRating numeric w/ severity StatusBadge + ProvenanceLink, owner, status), filters standard+category (`getCrossRegisterRiskView(standard,category)` is also the register query — it IS the filterable cross-register view; a "cross-register" toggle simply clears the standard filter, MOD-7). PageHeader: t('m5.newRisk') → createRisk drawer (Ask chip target).
- **Row expand:** treatments list + `addRiskTreatment` drawer; `createChangePlan` drawer from the row overflow (Change.Planned events don't hit records-q — known contract note, no UI implication).
- **Real-time:** `onRiskEscalated` re-sorts + flashes the escalated row (`danger` rail, 3s). i18n `m5.*`.

## 10. Task 31 — Settings → Organization (`/settings`)

- Nav entry visible to Pool B roles only (`custom:role` in the admin set per role-matrix; presentation-gate, server enforces).
- **Organization panel:** tenant name (read-only), tenant default document-locale rendered **READ-ONLY** (labelled t('settings.tenantLocale'), value + explainer t('settings.tenantLocaleReadOnly')). The write path is a NAMED CARRY to the `settings-ui` spec — do NOT wire updateProfile here (AM-3: updateProfile is the per-USER item only).
- **My profile panel:** per-user locale select (EN/ES/PT) → `updateProfile` (the same control the shell UserFooter exposes; one component, two mounts). Locale change re-renders via next-intl immediately (ACC-5).
- i18n `settings.*`.

## 11. i18n plan

New namespaces: `nav`, `shell`, `ask`, `m1`–`m5`, `settings`, `provenance` — added to `messages/{en,es,pt}.json` in the same task that introduces the strings (pseudo-locale CI check enforces no hardcoded JSX strings). EN authored with the view; ES/PT translated in the same commit (no English fallbacks left in es/pt catalogs).

## 12. Implementation order (Kiro)

1. §1–§2 shell + shared components + §3 client/auth (unblocks everything; Task 11 panels bind here; Task 18/20/22 ACC run on this).
2. §4 Ask Cumplify (Task 25 — unblocks ACC-2/Task 23).
3. §5–§9 modules M1→M5 (Tasks 26–30; M1 and M2 first — they anchor the Ask chips).
4. §10 Settings (Task 31).
Each task's evidence log cites the section it implements; deviations come back to the architect, not into the code.
