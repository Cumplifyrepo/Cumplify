# STUDIO WAVE — bring the surfaces back per design (PROPOSED, awaiting owner approval)

**Status: PROPOSED — architect, 2026-07-22, after Checkpoint B was REJECTED.**

## Owner ruling this plan answers (2026-07-22, verbatim intent)

Checkpoint B: **NOT APPROVED. MEDIOCRE.** The surfaces are registers with
manual filling; the agentic loops are invisible. They are named
**Document Studio / CAPA Studio / Audit Studio** because they contain
INTEGRATED AGENTIC AI SOLUTIONS — that is the product and the top selling
point. AI identifies the clause, analyzes, proposes the remediation plan;
AI drafts, the human completes in the Tiptap editor. As-is: "a dead
dashboard with an expensive useless backend."

## Honest diagnosis (why the rejection is correct)

| Owner complaint | Ground truth |
|---|---|
| CAPA missing creation/approval/audit/validation workflows; all manual incl. clause | TRUE. /capa redirects to the old /m2 register. `runCapaAnalysis` (stage-aware, live-witnessed at 15s) has NO button in any UI. Clause is a manual field. |
| No AI doing heavy lifting anywhere | TRUE at surface level. HITL approvals exist only in a dashboard queue panel, orphaned from the work. |
| Documents "a joke", no Document Studio | TRUE. "New draft" creates an empty shell while DocStudio's `doc-draft`/`doc-version-control`/`doc-publish` HITL tools sit fully built server-side, unreachable from the UI. |
| IMS manual: AI drafts, human completes in Tiptap | Half-true today: generation is real (46 sections, honest gaps) but there is NO gap-filling loop and no inline editing on /manual. |
| "AI Review section????" | It's a stub page. It should not exist standalone — its concept belongs inside each studio. |

What IS real and carries this plan: the one-door invoker, CAPAGuru
(stage-aware, witnessed), RiskSentinel, DocStudio (3 HITL tools),
LeadAuditor (`audit-finding-write`), the guru KB trio (clause
identification), the full HITL plane (SoD + approval matrix, both
live-witnessed), `regenerateSection`, `saveDocumentSectionEdit` (Tiptap
persistence), `agentGenerateChecklist`, `agentScoreReadiness`, the six
agent* writeback doors. The engine exists. The studios don't. This wave
builds the studios.

## Studio doctrine (the design law every phase must satisfy)

Every studio ships ALL of:
1. **Agent-first primary action** — the big button IS the agent
   (never "New <empty form>").
2. **Inline HITL** — proposal cards render WHERE the work happens, with
   approve / reject / edit-then-approve, SoD and matrix states shown
   honestly. (Dashboard panel remains as the cross-studio inbox.)
3. **Draft → human completes** — every prose artifact opens in the
   Tiptap editor with tracked changes and per-section
   Regenerate-with-agent. AI drafts; the human directs and finishes.
4. **Full lifecycle rail** — create → analyze → approve → validate →
   audit trail, visibly driven by the approval matrix.
5. **No manual field the AI can infer** — clause identification is the
   agent's job (guru KB); the human corrects, never types from scratch.

## Phases

### S0 — Studio chassis (shared; ~1 session)
- Extract dashboard `HitlQueuePanel` internals into a shared
  `HitlCard` component (proposal renderer + editedPayload editor +
  approve/reject with SoD/matrix error surfacing).
- `AgentRunButton`: dispatch run mutation → DISPATCHED state → watch for
  the resulting HITL item (subscription if available, else poll) →
  render the `HitlCard` inline.
- Studio layout shell: workspace (left) + agent rail (right).
- Nav renames (en/es/pt): Documents → **Document Studio**, CAPA →
  **CAPA Studio**, Audits → **Audit Studio**, IMS Manual →
  **Manual Studio**. Remove `/ai-review` from nav; delete the stub.

### S1 — CAPA STUDIO (~2–3 sessions) — first, it is the anger epicenter
1. **Intake**: "Describe the problem" (free text + optional refs) →
   CAPAGuru intake run: classifies (NC / NONCONFORMING_OUTPUT /
   INCIDENT), **identifies the clause via the guru KB**, proposes
   severity + immediate containment → inline HITL card → accept creates
   the fully-populated NC. Backend: `runNcIntake` mutation (Event
   dispatch, runCapaAnalysis pattern) + CAPAGuru intake path + `nc-draft`
   writeback tool through the RS-7 door. **The manual clause field dies.**
2. **Workflow rail**: the CAPA shall-workflow stages visualized per NC;
   each unresolved stage gets an `AgentRunButton` wired to the EXISTING
   stage-aware `runCapaAnalysis`; root-cause and remediation-plan
   proposals open in the editor for human completion (editedPayload)
   before approval.
3. **Approval / validation / audit**: matrix-driven per-stage approvals
   (RS-6 live), SoD enforced (witnessed), per-NC audit-trail tab —
   RS-2 `listAuditEvents` read surface built here.
4. `/m2` absorbed; `/capa` becomes the studio (flip only after design
   gate with screenshots).

### S2 — DOCUMENT STUDIO (~2 sessions)
1. **"New document" = DocStudio drafting**: intent prompt → agent drafts
   the full document (title, clause refs, sections) via the existing
   `doc-draft` HITL tool → accept → DRAFT with real content. Backend:
   `runDocDraft` dispatch mutation + UI; writeback via existing
   `agentDraftDocument` door.
2. Every DRAFT opens in the Tiptap editor (exists) with per-section
   **Regenerate with DocStudio** (`regenerateSection`, exists), tracked
   changes, `saveDocumentSectionEdit` (live).
3. Visible lifecycle rail: draft → submit → matrix approval → publish →
   ControlledDocViewer (all backend paths exist).

### S3 — MANUAL STUDIO (~1–2 sessions)
1. **Gap burn-down loop — the hero demo**: every GAP section gets
   "Draft with DocStudio" → agent proposes prose from org data + KB →
   inline Tiptap completion on /manual → watch gapCount 24 → 0 live.
2. Sections editable in place on /manual (same editor mount as S2).

### S4 — AUDIT STUDIO (~2 sessions)
1. Checklist generation + readiness scoring (both mutations EXIST and
   are witnessed) surfaced as studio actions with inline results.
2. LeadAuditor proposes findings (`audit-finding-write` exists) → inline
   HITL → accepted findings spawn NCs in CAPA Studio (cross-studio link).
3. RS-3..RS-5 read surfaces (retention, records) folded in where the
   studio needs them.

## Discipline (unchanged, every phase)
Test-first hermetic; commit per increment; live witness incl. UI
screenshots (buttons clicked in the browser — never again an API-only
witness sold as a UI beat); design gate before any flip; evidence log
per phase; baselines tracked.

## Sequencing proposal
S0 → S1 → S2 → S3 → S4. S0+S1 ship the credibility turn; S3 delivers the
strongest single demo moment (gap burn-down). Owner may reorder.
