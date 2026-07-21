# IMS Experience — P1 View Designs

**Authority:** `.kiro/specs/ims-experience/architecture.md` §10 UI law + §11 P1 scope.
**Token source:** `frontend/src/tokens/design-tokens.ts` (Layer 1 + Layer 2 semantic).
**Extends:** `.kiro/specs/frontend-app/view-designs.md` (P0 shell + module views).
**Binding rule:** new shared components and nav changes are built ONLY from the specs below. Deviations go to the architect, not into the code.

---

## 1. Shell / Navigation — §10 IA Restructure

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

The AskOverlay (existing, wired in authenticated layout) provides the
floating trigger. Per §10 IA, Ask is removed from the sidebar nav — the
overlay is the sole access point. No changes to the AskOverlay component
itself; just the nav removal.

---

## 5. Stub Pages (P2–P5 placeholders)

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
