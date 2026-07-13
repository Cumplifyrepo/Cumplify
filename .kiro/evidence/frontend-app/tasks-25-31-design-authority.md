# Tasks 25–31 Design Authority — Framer Extraction + Architect View Designs

**Date:** 2026-07-13. **Executor:** architect (owner delegation 2026-07-11, `design-authority-owner-decisions.md`, commit 3433654).

## 1. Fresh SDK inventory (task-gate requirement)

`node --env-file=.env scripts/framer-sync.mjs` against project "Spora (copy)"
(id d7418088a63b…, apiVersion1Id 3368603292), run 2026-07-13T12:53Z and re-run
after the styles upgrade the same session:

- **14 web pages** — `/`, `/dashboard`, `/Features`, `/How-it-works`, `/Pricings`,
  `/Contact-us`, `/Sign-up`, `/Sign-in`, `/Blogs`, `/Blogs/:slug`, `/404`,
  `/legal/:slug`, `/changelog`, `/new-home`. EXACT match with the 2026-07-10
  inventory (incl. count 14/22). `/dashboard` remains the only
  authenticated-app page.
- **22 components** — unchanged set (incl. the "DELETE THIS" artifact).
- **Conclusion:** M1–M5, Ask Cumplify, and Settings pages CONFIRMED ABSENT from
  Framer. Per owner decision 3433654 this resolves to architect design
  authority (`view-designs.md`), not to a block. Task 25–31 gates lifted to
  `[ARCHITECT-DESIGN]` in tasks.md.

## 2. API surface discovery (steering-21 amendment)

The framer-api client is proxy-based — prototype introspection lists only
`disconnect/exportSVG/reconnect/screenshot`, but direct calls succeed for more:

- `getColorStyles()` → 23 color styles (works; values below).
- `getTextStyles()` → 9 text styles (works).
- `getFonts()` → 9,486 items = the full Framer font catalog, NOT project fonts
  (not useful; project fonts read from the text styles instead).
- `getBorderStyles`/`getShadowStyles` → do not exist.
- `screenshot(nodeIdString)` works on WebPageNodes; component masters
  (SmartComponentNode) reject BOTH `screenshot` ("must support x,y position or
  be pinnable") and `exportSVG` ("must be a vector, shape, or SVG node") —
  atoms are captured via the pages that render them.

Steering 21 amended with these facts. `scripts/framer-sync.mjs` upgraded to
also emit `frontend/src/tokens/framer-styles.json` (raw colors + text styles);
run output: `Found 23 color styles, 9 text styles`.

## 3. Extracted tokens (verbatim)

Colors (rgb): Neutral 50 (252,252,252) / 100 (241,242,243) / 200 (227,229,232)
/ 300 (204,208,214) / 400 (174,180,188) / 500 (137,146,159) / 900 (28,30,34);
Dark Mode 50 (59,63,68) / 100 (56,60,66) / 300 (49,53,58) / 400 (46,50,56) /
600 (39,42,48) / 700 (35,40,46) / 800 (33,37,44) / 900 (20,24,31); Black;
Accent (0,101,248); Accent Secondary (117,166,240); Warning (251,191,36);
Success (74,222,128); Danger (248,113,113); Text Primary (255,255,255); Text
Secondary (102,102,102).

Text styles: H1 72px Inter Display (marketing scale, breakpoints 56/40) · H2
48px · H3 32px Inter · H4 24px Inter · H5 20px Inter · Body Regular 16/1.5
Inter Display (color Neutral 300) · Body Medium 16 w500 (Neutral 400) ·
Capitalized Label 14 w600 ls2px · Capitalized Label Small 12 w500 ls2px.
Heading color = Neutral 50 → the ramp is authored FOR dark surfaces,
consistent with the owner's dark-theme ruling.

Encoded in `frontend/src/tokens/design-tokens.ts`: Layer 1 verbatim, Layer 2
semantic dark mapping (bg=DM900, surface=DM800, raised=DM700, hover=DM600,
borders=DM400/300/50, text=Neutral 50/300/400/500, status colors direct).
Radii/spacing (card 16px, pill buttons, 4px grid) are architect-ruled from the
reference renders — the Server API does not expose them; honestly labelled as
derived in the file header.

## 4. Reference anchors

`screenshot()` pulls, session scratchpad: `/dashboard` (196,798 B), `/` home
(1,089,785 B), `/new-home` (317,206 B). Findings: `/dashboard` = light-theme
Spora CRM template — contributes LAYOUT ANATOMY only (260px sidebar with
section-labelled nav + badge counts, main column of grouped cards, page title,
top-right primary action); `/new-home` = fintech template variant (orange), not
Cumplify. The authoritative visual language for the app is therefore the token
set + atoms, applied dark, on the /dashboard anatomy — exactly the framing of
steering 21.

## 5. Deliverable

`.kiro/specs/frontend-app/view-designs.md` — architect design authority:
§1 app shell, §2 shared components, §3 GraphQL client + Command Center live
wiring (completes Task 11 binding; amplify v6 `authMode: 'lambda'` with the
Cognito ID token, per FIX-1 audience pinning; subscriptions proven live at
Task 16), §4–§10 per-view specs for tasks 25–31 (bindings to MOD-3..7,
ASK-1..7, CARD-1..7 incl. the CARD-7 justification enforcement point carried
from Task 17), §11 i18n plan, §12 implementation order. tasks.md View Tasks
section re-pointed at these sections; completion criteria updated (tasks
UNBLOCKED, build-ready).
