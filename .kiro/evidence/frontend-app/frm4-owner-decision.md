# FRM-4 Gap Resolution — Owner Decision

**Date:** 2026-07-10
**Decision maker:** Owner (Julio), verbatim: "I choose option 1"
**Context:** Design R1 §8.3 identified 10 views absent from the Framer project
"Spora (copy)" (architect independently confirmed the inventory: 14 pages /
22 components, only `/dashboard` serves the authenticated app).

## Decision

**Option 1 — owner PROVIDES Framer designs** for the missing views (rather than
approving the component-pattern fallback that design R1 D-6 proposed).

## Consequences

1. Design R1 decision **D-6 is SUPERSEDED**: module/chat/settings UIs bind to
   owner-provided Framer designs, not pattern-extrapolated layouts. FRM-4
   ("never invent layouts") now applies to these views with no fallback.
2. **Owner owes the following designs in the Framer project** (frontend build
   tasks for these views gate on delivery):
   - M1 Document Studio — list + detail (version history, diff view) + forms
   - M2 CAPA — NC list + CAPA detail (root-cause, actions timeline) + forms
   - M3 Audit Studio — programme overview, audit detail (checklist + findings),
     readiness heatmap
   - M4 Records Management — record register, calibration schedule,
     audit-trail viewer
   - M5 Risk Management — risk register, cross-register risk view
   - Ask Cumplify — persistent chat panel (citation chip + action chips)
   - HITL approval card + queue (Part 3.2 anatomy: agent avatar/name, clause
     chip, status badge, body w/ diff-view, Approve / Edit & approve /
     Send back buttons, trust-ritual footer, guardrail-evidence slots)
     — unless already present inside the `/dashboard` canvas (owner confirms)
   - Settings → Organization (document-locale selector EN/ES/PT)
3. **Task sequencing:** design-independent work proceeds first (BC-7 schema
   surface, approval Lambda, HITL-10 SFN amendment, PROFILE# plumbing, i18n
   scaffold, Amplify infra, design-sync tooling, Command Center from the
   existing `/dashboard` design). View implementation tasks block on design
   delivery — tasks.md must mark them [BLOCKED-ON-OWNER-DESIGN].
4. When new pages land in Framer, re-run the inventory (design-sync script /
   architect audit script) and bind views to the actual node paths — no
   guessing ahead of delivery.
5. Reminder recorded: canonical logo is white-on-dark (steering 21) — Framer
   designs for light surfaces need the light-variant logo (OQ-9, also
   owner-owed).
