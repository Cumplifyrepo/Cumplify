# IMS Experience — P1 View Designs

**Authority:** `.kiro/specs/ims-experience/architecture.md` §10 UI law + §11 P1 scope.
**Token source:** `frontend/src/tokens/design-tokens.ts` (Layer 1 + Layer 2 semantic).
**Extends:** `.kiro/specs/frontend-app/view-designs.md` (P0 shell + module views).
**Binding rule:** new shared components and nav changes are built ONLY from the specs below. Deviations go to the architect, not into the code.
**Standing rule (owner order, post F-P1-1):** every section must cite its
architecture §4 matrix row — exact query/mutation names + status (BUILT /
read-surface-completion / ROADMAP) — before the build task opens. A view may
not render a control whose backend contract is absent; honest stubs/zero-states only.

---

## 1. Shell / Navigation — §10 IA Restructure

**§4 matrix citation:** Shell/nav is infrastructure — no data queries. Consumed
by all views. No backend contract dependency.

The existing sidebar (view-designs.md §1) is preserved structurally but the
nav sections and routes are replaced with the §10 information architecture.

### 1.1 Nav Config Extraction

All nav data moves from hardcoded JSX in `Sidebar.tsx` to a typed config
module `frontend/src/components/shell/nav-config.ts`:

```ts
type NavItem = { href: string; labelKey: string };
type NavSection = {
  labelKey: string;        // i18n key under `nav.*`
  items: NavItem[];
  roleGate?: (role: string) => boolean;  // presentation-only filter
};
```

### 1.2 New IA Sections

| Section label (i18n) | Routes | Notes |
|---|---|---|
| — (no section, top item) | `/dashboard` Command Center | Always first, standalone |
| DOCUMENTS | `/manual` `/documents` `/forms` `/cross-reference` `/guide` | Document lifecycle cluster |
| AUDIT & READINESS | `/audit-readiness` `/audits` `/ai-review` `/activity` `/analytics` | Audit + readiness cluster |
| OPERATIONS | `/capa` `/risk` `/records` `/management-review` | Operate cluster |
| ADMIN | `/settings` `/setup` | Pool B roles only (canSeeAdmin gate) |

- Command Center remains the logo-link target and the first nav item (no
  section header — direct item at the top of the nav, above the first section).
- Ask Cumplify is removed from nav — it's accessible via the floating overlay
  trigger only (§4 ASK-1 in the existing view-designs; overlay already wired
  in authenticated layout).
- All new routes are initially stub pages (PageHeader + EmptyState with
  "Coming soon" copy) — the real views build in P2–P5.

### 1.3 Legacy Redirect Stubs

Old routes (`/m1`, `/m2`, `/m3`, `/m4`, `/m5`, `/qms`) become client-side
redirect pages (static export — no server redirects). Each stub renders a
`useEffect` with `router.replace(target)`:

| Old | New |
|---|---|
| `/m1` | `/documents` |
| `/m2` | `/capa` |
| `/m3` | `/audits` |
| `/m4` | `/records` |
| `/m4/forms` | `/forms` |
| `/m5` | `/risk` |
| `/qms` | `/manual` |

The old route directories remain in `(authenticated)/` with a single
`page.tsx` performing the client redirect + a t('nav.redirecting') fallback.

---

## 2. StandardSwitch — Global Scope Context

**§4 matrix citation:** UI affordance only in P1 — no query dependency. Filters
wire into view queries in P2+ (e.g. `getCrossRegisterRiskView(standard)` for
§6.1 risk register). No backend contract required for the toggle itself.

Implements pain #7 (2nd/3rd standard triples work).

### 2.1 Provider

`frontend/src/lib/standard-scope.tsx`:
- React context + provider wrapping authenticated layout.
- State: `standard: 'ISO9001' | 'ISO14001' | 'ISO45001' | 'IMS'`
- Default: `'IMS'` (integrated view — shows all standards combined).
- Persisted to `localStorage` key `cumplify:standardScope`.
- Hook: `useStandardScope()` returns `{ standard, setStandard, isIMS }`.

### 2.2 UI Component

`frontend/src/components/shell/StandardSwitch.tsx`:
- Placed in the sidebar, between the logo and the nav sections.
- Segmented control (pill shape): 4 options.
- Styling from tokens:
  - Container: bg `surfaceRaised`, radius `pill`, padding `xs`.
  - Active segment: bg `accent`, text `textOnAccent`, radius `pill`.
  - Inactive: text `textSecondary`, hover text `textHeading`.
  - Font: `labelSmall` (12px, 500, 2px letter-spacing, uppercase).
- Labels (i18n `shell.standard*`): "9001" / "14001" / "45001" / "IMS".
- Accessible: `role="radiogroup"` with `role="radio"` per option,
  `aria-checked`, keyboard navigation (arrows).

### 2.3 Integration

- Context consumed by views to filter queries by standard (P2+ wiring).
- Command Center already queries per-standard — will consume in P2.
- The switch is a UI affordance in P1; query filtering wires in later phases.

---

## 3. Shared Components — StatTile, GuidanceBanner, ReadyPill

**§4 matrix citation:** Presentation-only components — no data queries. Consumed
by views that have their own backend contracts. No backend contract dependency.

All styled exclusively from `design-tokens.ts`. No CertifyAero pixels.

### 3.1 StatTile

`frontend/src/components/shared/StatTile.tsx`

A numeric-highlight card for KPIs / readiness scores / counts.

```
┌─────────────────────┐
│  label (labelSmall)  │  ← textMuted
│  42%                 │  ← pageTitle size, color by `variant`
│  +2% this week       │  ← small, textSecondary (optional trend line)
└─────────────────────┘
```

Props:
- `label: string` — i18n'd metric name
- `value: string | number` — the big number
- `trend?: { delta: string; label: string }` — optional trend indicator
- `variant?: 'default' | 'success' | 'warning' | 'danger'` — colors the value

Styling:
- Container: bg `surface`, border 1px `border`, radius `card`, padding `cardPad`.
- Label: `labelSmall`, color `textMuted`.
- Value: `pageTitle` (32px, 400), color per variant (default=`textHeading`,
  success=`success`, warning=`warning`, danger=`danger`).
- Trend: `small` (14px), color `textSecondary`; delta prefix colored
  (positive=`success`, negative=`danger`).

### 3.2 GuidanceBanner

`frontend/src/components/shared/GuidanceBanner.tsx`

A contextual guidance strip shown at the top of views to orient the user —
explains what the page does and optionally suggests a next action.

```
┌────────────────────────────────────────────────────────────────┐
│ 💡  <message body text>                        [Action Button] │
└────────────────────────────────────────────────────────────────┘
```

Props:
- `message: string` — guidance text (i18n'd)
- `action?: { label: string; onClick: () => void }` — optional CTA
- `variant?: 'info' | 'success' | 'warning'` — tints the left accent

Styling:
- Container: bg `surfaceRaised`, border 1px `borderSubtle`, radius `inner`,
  padding `md` `lg`, flex row, align-center, gap `lg`.
- Left accent: 3px vertical bar, radius `pill`, color per variant
  (info=`accent`, success=`success`, warning=`warning`).
- Message: `body` (16px), color `textBody`.
- Action: `SecondaryButton` (small variant — 14px, padding `sm` `md`).

### 3.3 ReadyPill

`frontend/src/components/shared/ReadyPill.tsx`

Honest-state readiness indicator with three states.

Props:
- `state: 'ready' | 'partial' | 'not-ready' | 'unknown'`
- `label?: string` — optional override text

Styling:
- Pill shape: radius `pill`, padding `xs` `sm`, inline-flex, gap `xs`.
- Dot: 8px circle, color per state (ready=`success`, partial=`warning`,
  not-ready=`danger`, unknown=`textMuted`).
- Text: `labelSmall`, color matches dot color.
- Default labels (i18n `shared.ready*`): "Ready" / "Partial" / "Not ready" / "Unknown".

---

## 4. Ask Trigger Placement

**§4 matrix citation:** Ask overlay is an existing BUILT component (per
frontend-app/view-designs.md §4). Queries: `askISO9001|askISO14001|askISO45001`
— status: BUILT. P1 change is nav-removal only, no new backend contract needed.

The AskOverlay (existing, wired in authenticated layout) provides the
floating trigger. Per §10 IA, Ask is removed from the sidebar nav — the
overlay is the sole access point. No changes to the AskOverlay component
itself; just the nav removal.

---

## 5. Stub Pages (P2–P5 placeholders)

**§4 matrix citation:** Stub pages render zero data — no backend queries.
They display PageHeader + EmptyState only. Each stub's real view will cite
its own §4 row when its build phase opens (per standing rule).

Every new route in the IA that doesn't have a real view yet gets a stub page:

```tsx
<PageHeader title={t('<namespace>.title')} />
<EmptyState message={t('<namespace>.comingSoon')} />
```

Stub routes for P1: `/manual`, `/documents`, `/cross-reference`, `/guide`,
`/audit-readiness`, `/audits`, `/ai-review`, `/activity`, `/analytics`,
`/capa`, `/risk`, `/records`, `/management-review`, `/setup`.

Note: `/dashboard`, `/settings`, and `/ask` already have real implementations.
`/forms` already has a real implementation (M4 forms catalog).

The existing `/m1`–`/m5` real views migrate to their new routes:
- `/m1` content → `/documents` (P2 will rebuild it)
- `/m2` content → `/capa`
- `/m3` content → `/audits`
- `/m4` content → `/records`
- `/m5` content → `/risk`
- `/m4/forms` content → `/forms`

For P1, we do NOT migrate the view implementations — only the routes in nav.
The old routes get redirect stubs (§1.3). The new routes get placeholder
stubs. The real content migration happens when each phase builds the view.

---

## 6. i18n Keys (new for P1)

Namespace `nav` — new/changed keys:
- `documents` (section label)
- `auditReadiness` (section label)
- `operations` (section label)
- `manual`, `docBrowser`, `crossReference`, `guide`
- `auditReadiness` (item), `audits`, `aiReview`, `activityLog`, `analyticsLabel`
- `capa`, `risk`, `records`, `managementReview`
- `setup`
- `redirecting`

Namespace `shell` — new keys:
- `standardIso9001`, `standardIso14001`, `standardIso45001`, `standardIms`
- `standardScopeLabel`

Namespace `shared` — new keys:
- `readyReady`, `readyPartial`, `readyNotReady`, `readyUnknown`
- `comingSoon`

All keys authored EN, translated ES/PT same commit.


---

## 7. Risk Register (`/risk`) — P1 Migration (one migrated register)

**§4 matrix citation:**
- Row: `6.1 (Δaspects/Δhazards)` — Risk & opportunity register
- Agent: RiskSentinel + HazardScout + AspectWarden (A-CAT; M5 register works)
- Surface: `/risk` P1; agents P7
- **Queries consumed:**
  - `getCrossRegisterRiskView(standard, category)` — **BUILT** (returns risk
    register filtered by standard and/or category; the same query serves as
    the filterable cross-register view)
  - `onRiskEscalated(tenantId)` subscription — **BUILT** (real-time escalation)
- **Mutations consumed:**
  - `createRisk(input)` — **BUILT**
  - `addRiskTreatment(input)` — **BUILT**
  - `createChangePlan(input)` — **BUILT**
- **DEFERRED (owner ruling, §11):**
  - `listRiskTreatments` — ROADMAP (treatments panel shows honest "blocked" state)

### 7.1 Migration procedure (per §11 migration law)

The M5 risk register implementation migrates to `/risk`. Direction:
- `/risk/page.tsx` receives the full M5 implementation + StandardSwitch awareness.
- `/m5/page.tsx` becomes a client-redirect stub → `/risk`.
- CSS module copies to the new route.
- Tests migrate with the implementation (test count grows, never shrinks).

### 7.2 StandardSwitch integration

The existing M5 standard filter pills are replaced with StandardSwitch
awareness:
- When `standard !== 'IMS'`, the query passes `standard` param and the
  standard pills hide (the global toggle is the filter).
- When `standard === 'IMS'`, the local standard pills show (existing behavior)
  for per-standard drill-down within the integrated view.
- The category filter remains independent of StandardSwitch.

### 7.3 Layout (unchanged from frontend-app/view-designs.md §9)

- PageHeader("Risk Management", action: PrimaryButton t('m5.newRisk'))
- Filter bar: standard pills (visible only in IMS mode) + category select
- DataTable: description, category, standard ClauseChip, riskRating w/
  ProvenanceLink + StatusBadge, owner, status
- Row expand: treatments (honest "blocked" state until listRiskTreatments
  ships) + addTreatment + createChangePlan drawers
- Real-time: `onRiskEscalated` → refetch + flash escalated row (3s danger rail)
- Ask chip target: `?create=1&title=<>&standard=<>` consumed by createRisk drawer


---

## 8. IMS Manual (`/manual`) — P2 Hero Surface

**§4 matrix citation:**
- Row: `5.2` — Policy controlled + communicated; `4.1–4.3` — Context/scope
- Agent: DocStudio (A-BUILT + spec-40)
- Status: ENG-BUILT (spec-40 engine: 24s run, honest gaps, 4.53/5)
- **Queries consumed:**
  - `getOrgProfile` — **BUILT** (returns org profile JSON payload)
  - `listGenerationRuns(limit)` — **BUILT** (returns run history with sections)
  - `getGenerationRun(id)` — **BUILT** (single run detail for polling)
  - `getDocumentContent(versionId)` — **BUILT** (returns content JSON for viewer)
  - `listDocumentVersions(documentId)` — **BUILT** (version history)
- **Mutations consumed:**
  - `generateImsManual(input)` — **BUILT** (triggers DocStudio engine)
  - `markSectionReviewed(input)` — **BUILT** (per-section review tracking)
  - `submitDocumentForApproval(id)` — **BUILT** (approval flow entry)
  - `requestImsExport(documentId)` — **BUILT** (returns presigned URL for ZIP)
- **Subscriptions:**
  - `onGenerationProgress(tenantId)` — **BUILT** (WebSocket; runId/type/harmonizationKey/kind/summary)
- **DEFERRED:** Document.clauseRefs (RS-1, architect-side this week) — render
  without clause grouping until RS-1 lands; no blocker.

### 8.1 Page States

```
┌─────────────────────────────────────────────────────────────────────┐
│ STATE 1: No Profile                                                  │
│   GuidanceBanner(warning): "Complete your org profile to generate"   │
│   PrimaryButton → /setup                                             │
├─────────────────────────────────────────────────────────────────────┤
│ STATE 2: Profile exists, no generation runs                          │
│   GuidanceBanner(info): "Generate your IMS manual — one button"      │
│   PrimaryButton "Generate IMS Manual" (the Agent-First button)       │
├─────────────────────────────────────────────────────────────────────┤
│ STATE 3: Generation RUNNING                                          │
│   GenerationProgress panel (ported from qms/generation-view)         │
│   Live section list: kind badges + real-time subscription updates    │
│   Polling fallback: 10s while status=RUNNING                         │
├─────────────────────────────────────────────────────────────────────┤
│ STATE 4: Generation COMPLETE/PARTIAL                                 │
│   StatTile row: Total sections | Prose | Gaps | Reviewed             │
│   ControlledDocViewer (§9) renders the manual                        │
│   Action bar: Regenerate (SecondaryButton) | Export ZIP (Primary)    │
│   Section-level review badges + "Mark reviewed" per prose section    │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Agent-First compliance

The Generate button IS DocStudio working — it invokes `generateImsManual`
which triggers the agent engine. The surface is NOT a CRUD register; the
agent does the heavy lifting (generates 69 sections across standards), human
reviews section-by-section and approves. Per the COLLABORATION LAW: future
iteration threads (P3+) will allow directing DocStudio to revise specific
sections — P2 ships the generate→review→approve→export loop first.

### 8.3 Error states

- `ORG_PROFILE_REQUIRED` → switch to State 1
- `NO_STANDARDS_IN_SCOPE` → GuidanceBanner(warning) + CTA to /setup
- `GENERATION_UNAVAILABLE` → ErrorState with retry
- Network/unknown → ErrorState with retry

### 8.4 Export ZIP

`requestImsExport(documentId)` returns `{ url, expiresAt }`. PrimaryButton
opens presigned URL in new tab. If the mutation returns `EXPORT_NOT_AVAILABLE`
or `Unknown field`, render honest "Export not yet available" state (graceful
degradation per the existing pattern).

### 8.5 Absorption (migration law)

`/manual` absorbs `/qms`. The flip `/qms` → redirect to `/manual` happens
ONLY when this view passes its design gate. Until then, `/manual` redirects
interim to `/qms` (current state).

---

## 9. ControlledDocViewer — Shared Component

**§4 matrix citation:**
- Row: `7.5.2` — Doc/record review & APPROVAL before use
- Law: §7 identification block — MANDATORY on every controlled render
- Source: `services/pdf-export/src/template.ts` (vendored to frontend)
- **No direct queries** — receives content JSON as a prop from parent views

### 9.1 Architecture

```
<ControlledDocViewer contentJson={...} meta={...} />
  └─ sandboxed <iframe srcDoc={html} sandbox="allow-same-origin" />
       └─ template.ts renders: brand-bar + CONTROLLED stamp + QMS info block
                               + clause-numbered sections + footer
```

### 9.2 Props

```ts
interface ControlledDocViewerProps {
  contentJson: ContentJson;     // from getDocumentContent parse
  meta: DocMeta;                // title, documentId, versionNo, docType, standard, tenantName, generatedAt
  className?: string;
}
```

### 9.3 §7 Identification Block (mandatory)

Every render carries (from `template.ts` `qmsInfoBlock`):
- Document ID, Title, Document Type, Standard(s), Version, Generated date
- CONTROLLED DOCUMENT stamp (top-right branded)
- Footer: "CONTROLLED when viewed through Cumplify or as a sealed export.
  Printed or copied instances are uncontrolled unless stamped otherwise."
- Additional rows when available: Organization, Management Rep, Sites

### 9.4 Styling

- Outer container: bg `surface`, border 1px `border`, radius `card`,
  overflow hidden.
- iframe: width 100%, min-height 600px, border none, bg white.
- Print button (SecondaryButton): triggers `iframe.contentWindow.print()`.
- The document inside is WHITE (light-theme, print-ready) — the surrounding
  app chrome is dark per the UI law. This contrast IS the controlled-doc
  visual language.

### 9.5 Parity drift test

A hermetic test renders the same fixture JSON through both the frontend
`lib/controlled-doc/template.ts` and asserts the HTML includes the §7
identification block fields. If template.ts drifts from
`services/pdf-export/src/template.ts`, the test flags it.

### 9.6 Vendor procedure

Copy `services/pdf-export/src/template.ts` → `frontend/src/lib/controlled-doc/template.ts`.
The frontend copy is the iframe render source. The backend copy remains the
PDF/ZIP export source. Both MUST stay in sync (parity drift test enforces).

---

## 10. Documents (`/documents`) — Clause-Family Browser + M1 Absorb

**§4 matrix citation:**
- Row: `5.2` — Policy controlled + communicated
- Agent: DocStudio (A-BUILT)
- **Queries consumed:**
  - `listDocuments(standard, status)` — **BUILT** (M1 register query)
  - `getDocumentContent(versionId)` — **BUILT** (renders in ControlledDocViewer)
  - `listDocumentVersions(documentId)` — **BUILT** (version sidebar)
  - `Document.clauseRefs` — **read-surface-completion RS-1** (landing this
    week; used for clause-family grouping; renders without grouping until
    it lands — no blocker)
- **Mutations consumed:**
  - `createDocumentDraft(input)` — **BUILT**
  - `submitDocumentForApproval(id)` — **BUILT**
  - `approveDocumentVersion(versionId)` — **BUILT**
  - `publishControlledDocument(id)` — **BUILT**
- **Subscriptions:**
  - `onDocumentStatusChanged(tenantId)` — **BUILT**

### 10.1 Layout

- PageHeader("Documents", action: PrimaryButton "New draft" → createDocumentDraft drawer)
- StandardSwitch-aware filter (effectiveStandard from scope context) + status filter
- **Clause-family grouping (4–10):** when `Document.clauseRefs` is available
  (RS-1), group documents by ISO clause family (4.x Context, 5.x Leadership,
  6.x Planning, 7.x Support, 8.x Operation, 9.x Evaluation, 10.x Improvement).
  Collapsible sections with clause-family headers. Without RS-1: flat list
  (current M1 behavior).
- DataTable per group: Title, StatusBadge, ClauseChip(s), version, updatedAt w/ ProvenanceLink
- Detail (click row): ControlledDocViewer + version sidebar + approval actions

### 10.2 Absorption (migration law)

`/documents` absorbs `/m1`. The flip `/m1` → redirect to `/documents`
happens ONLY when this view passes its design gate (clause-family grouping
working + ControlledDocViewer integrated). Until then, `/documents` redirects
interim to `/m1` (current state).

---

## 11. Cross-Reference (`/cross-reference`) — Correlation Matrix Grid

**§4 matrix citation:**
- Row: `5.2` + all clause rows — Correlation matrix spans all standards
- Source: `CORRELATION_MATRIX` JSON (kind='correlation_matrix' content from
  `getDocumentContent` of the system-generated correlation-matrix document)
- **Queries consumed:**
  - `listDocuments(standard)` → find the correlation-matrix document — **BUILT**
  - `getDocumentContent(versionId)` → retrieve matrix JSON — **BUILT**
  - `listDocumentVersions(documentId)` — **BUILT** (version history)
- No mutations (read-only view)

### 11.1 Layout

- PageHeader("Cross-Reference Matrix")
- StandardSwitch: when scope ≠ IMS, highlight the column for that standard
- Interactive grid: rows = harmonization sections (harmonizationKey), columns = standards
- Each cell shows: clauseNo + clauseTitle + annexSlMode badge
- Click cell → navigate to `/documents` filtered by that clause family
- Rendered from `ContentJson.rows[]` (MatrixRow shape with coverage[])
- If no correlation-matrix document exists: GuidanceBanner(info) + CTA to /manual

### 11.2 Styling

- Grid: `DataTable`-like layout with fixed first column (section name)
- Standard columns: equal width, header = standard name pill
- Cell badge (annexSlMode): `success` for "Shall", `warning` for "Should", `textMuted` for "—"
- Hover: `surfaceHover` row highlight
- Empty state: "Generate your manual first to see the cross-reference matrix"

---

## 12. Clause Guide (`/guide`) — 80-Row Registry

**§4 matrix citation:**
- Row: `4.1–4.3` through `10.2` — entire clause spine
- **Queries consumed:**
  - `listClauseRegistry(standard)` — **BUILT** (80 rows, sorted by sortOrder)
  - `listClauseApplicability` — **BUILT** (applicability state per clause)
- No mutations from this view (applicability editing is in /qms registry tab)

### 12.1 Layout

- PageHeader("Clause Guide")
- StandardSwitch-aware: when scope ≠ IMS, filter by standard; when IMS, show all with standard column
- Table: clauseNo, clauseTitle, standard (ClauseChip), intentParaphrase (truncated), applicability badge
- Applicability badge: ReadyPill (ready=applicable, not-ready=excluded/N/A, unknown=not set)
- Harmonization indicators: clauses that map to the same harmonizationKey across standards show a link icon + tooltip ("Harmonized with ISO XXXX Y.Z")
- Row click: expand to show full intentParaphrase + requiredSources
- No mutation actions — this is a reference view; edits happen in /qms registry tab

### 12.2 Styling

- Standard DataTable with the existing column pattern
- intentParaphrase column: max-width 400px, text-overflow ellipsis, expand on click
- Harmonization badge: inline icon (chain-link, `accentMuted`) after clauseNo when harmonized
