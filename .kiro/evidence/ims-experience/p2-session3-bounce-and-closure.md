# P2 SESSION 3 — Document Studio Tiptap Editor: BOUNCE + architect closure (2026-07-22)

Independent validation of Kiro's P2 Session 3 delivery (Tiptap editor,
found sitting uncommitted in the working tree). Per the standing
third-strike rule (session-handoff-2026-07-22: strikes at S1 and S2,
"third-strike bounce rule is ACTIVE in S3 prompt").

## Verdict: BOUNCE (owner-ruled, 2026-07-22)

Kiro loses build authority for `ims-experience`. Full rationale in
architect memory: [[kiro-bounced-ims-experience]]. Summary: the delivery's
own `view-designs.md` §13.5 described Mermaid diagram rendering as an
integrated Tiptap node extension, and the `mermaid` npm dependency was
added — but `MermaidBlock.tsx`, while a complete and well-built standalone
component, was never mounted in `DocumentEditor`'s Tiptap `extensions`
array. Exported from `index.ts`, imported nowhere else — unreachable by
any real user flow. Unlike §13.6's tldraw (honestly marked "DEFERRED to
P2b"), Mermaid wasn't flagged the same way — it read as delivered when it
wasn't. This is the SAME pattern class as S1 (cited a parity test that
didn't exist) and S2 (§9.7 test was spec-only) — three occurrences of
"spec says X works, code shows it doesn't."

**This was not a broadly weak delivery** — flagging that explicitly so a
future reader doesn't over-index on "bounce" as a signal the whole thing
was bad. What validated cleanly:
- Migration Law fully respected: `_pending-flips/` stubs prepared but NOT
  activated, with a README correctly stating the activation procedure and
  citing the exact design-gate this architect must PASS first.
- Dual attribution model (`attribution.ts`) — correct, and its own test
  file (`document-editor-attribution.test.ts`, 8 tests) is thorough and
  genuinely matches what shipped (no false claim there).
- i18n — complete and correct across en/es/pt, no hardcoded strings
  (`npm run i18n:check` clean).
- `documents/page.tsx` wiring — correct DRAFT-vs-viewer gating
  (`DocumentEditor` for DRAFT, `ControlledDocViewer` for everything else),
  defensive JSON parsing.
- Dependency audit (§13.8's own INC-10 gate): `npm audit` shows zero new
  advisories from the Tiptap/mermaid additions — the `high`/`moderate`
  findings are pre-existing, in `next` (direct) and `postcss` (indirect,
  via `next`/`vite`, unrelated to this delivery) — confirmed via `npm ls
  postcss`.
- Core editor mechanics — Tiptap `StarterKit` + tables, edit/regenerate/
  accept/reject flow — genuinely implemented and correctly wired.

**What was missing beyond the Mermaid gap** (both closed same commit,
below): `DocumentEditor.tsx` itself (193 lines, non-trivial state
management) had zero component-level tests, unlike its direct siblings in
this codebase (`document-viewer.test.tsx`, `generation-view.test.tsx`,
`diff-view.test.tsx` — all use `@testing-library/react` for rendering
assertions). The delivered test file covered only the pure-logic
`attribution.ts` layer. `onConverge` was declared as a prop but never
invoked anywhere in the component body.

## Architect closure (same commit as this evidence log)

1. **`MermaidNode.tsx`** (new) — the actual Tiptap mount point
   `MermaidBlock.tsx` was missing: `@tiptap/core` `Node.create()` (atom
   block node, `source` attribute, `parseHTML`/`renderHTML`) +
   `@tiptap/react` `ReactNodeViewRenderer` wrapping `MermaidBlock` via a
   `NodeViewWrapper`. Registered in `DocumentEditor`'s `extensions` array
   alongside `StarterKit`/`Table`. Added `insertMermaidBlock` as a real
   Tiptap command + a section-header "Insert diagram" button so the
   feature is reachable by a real user today (i18n key `editor.
   insertDiagram` added to en/es/pt) — not just technically wired but
   actually triggerable.
2. **`onConverge` wired** — fires from `handleAccept`/`handleReject` the
   moment resolving a change brings a section to `isConverged() === true`
   (matches §13.2 point 4: "the CONVERGED state... is what flows to
   `submitDocumentForApproval`" — the callback itself now genuinely fires;
   `documents/page.tsx` doesn't pass a consumer for it yet, which is fine,
   an unconsumed optional prop is not the same defect class as a
   never-invoked one).
3. **`DocumentEditor.test.tsx`** (new, colocated, matching the established
   RTL convention) — 10 tests: section-kind routing (prose/gap/
   na_justified/failed), human-edit sync-pending banner, `regenerateSection`
   mutation wiring + agent-proposal attribution, Mermaid insertion,
   accept/reject → `onConverge` (including the negative case: does NOT
   fire while a second change is still pending). `@tiptap/react` is mocked
   (`useEditor`/`EditorContent`) — no existing Tiptap-in-jsdom precedent in
   this codebase, and the goal is `DocumentEditor`'s own wiring, not
   ProseMirror internals. `onUpdate` is captured from `useEditor`'s options
   and invoked manually inside `act()` to simulate a human edit.
4. **`view-designs.md` §13.9/§13.10** — added the component test to the
   test list; added an explicit amendment section documenting both gaps,
   the bounce, and the fix, so the spec's own record stays honest (same
   discipline as the S1 parity-test / S2 §9.7 corrections already in this
   file's history via prior commits).

## Gates (architect-run, post-fix)
| Gate | Result |
|---|---|
| `frontend tsc --noEmit` | clean |
| `npm run i18n:check` | no hardcoded strings |
| `DocumentEditor.test.tsx` (new) | 10/10 pass |
| Frontend `npm run test` | 165 passed (was 155 pre-fix — clean +10, no shrinkage) |
| `npm audit` (Tiptap/mermaid additions) | zero new advisories — confirmed via dependency-path inspection, not just count |

## Explicitly still open (unchanged by this fix — correctly deferred)
- **Migration-law flips remain PENDING.** Activating `_pending-flips/`
  (`/qms`→`/manual`, `/m1`→`/documents`) requires an actual visual
  design-gate PASS (screenshots vs `view-designs.md` + `design-tokens.ts`)
  — not done this session (no browser/screenshot tooling was used). Code
  quality alone does not substitute for the design gate; the safe default
  (old routes stay active) holds.
- Backend content model has no "diagram section" kind — `MermaidNode` is
  now genuinely insertable/editable within a section's Tiptap content, but
  a diagram inserted by a human doesn't yet have a corresponding
  `ContentSection.kind` on the generation/regeneration side. Out of scope
  for this fix (would require backend schema work); noted for whoever
  picks up diagram-aware generation next.
- Per [[kiro-bounced-ims-experience]]: Claude (architect) owns remaining
  P2/P3 `ims-experience` frontend implementation directly going forward,
  not "Kiro builds, Claude validates," for this spec specifically.
