# Owner Decisions 2026-07-11 — Design Authority, Dark Theme, Standing Items

**Owner (verbatim):** "you are the architect, please proceed to design in
framer the module/chat/settings views + light-variant logo, staging gate, PAT
revoke, SNS email confirmation, the SaaS will have a dark theme, why do you
need a light variant logo?"

## Decisions recorded

1. **Design delegation (supersedes 33f1e57 "owner provides designs"):** the
   FRM-4 gap views (M1–M5 module UIs, Ask Cumplify, Settings) are delegated
   to the architect. FACT ESTABLISHED FIRST: the Framer Server API is
   read-only (live probe of the SDK surface: getProjectInfo,
   getNodesWithType, exportSVG, screenshot, reconnect, disconnect — no
   write/create methods), so "design in Framer" is not programmatically
   possible by anyone; the Framer editor is GUI-only. Execution therefore:
   architect-authored dark-theme layouts in code using Framer-extracted
   tokens + component atoms as the visual language (steering 21 amended).
   Tasks 25–31's [BLOCKED-ON-OWNER-DESIGN] gates are LIFTED — they become
   [ARCHITECT-DESIGN] tasks.
2. **Dark theme:** the SaaS UI is dark-theme. Consequence: the light-variant
   logo is NOT needed for the app (owner's own challenge was correct — the
   architect's earlier flag assumed no theme decision). It remains a future
   need only for white-rendered surfaces (emails, PDF exports, invoices) —
   re-flag at frontend-funnel / records-export specs. Square mark crop
   derived mechanically (cumplify-mark.png, 640x640) for favicon/avatar.
3. **Staging gate: APPROVED by owner** ("please proceed to ... staging
   gate"). Architect executes the ApproveToStaging action on the next
   pipeline execution that reaches it with the current revision (never the
   stale parked approval). Staging steady-state cost (~$100/mo class)
   accepted by owner.
4. **PAT revoke: ordered.** Architect revokes the classic PAT via GitHub's
   credential-revocation endpoint and shreds the key file. Until the owner
   provisions a replacement (fine-grained PAT, Contents R/W on
   Cumplifyrepo/Cumplify only), pushes accumulate locally — webhook builds
   continue unaffected (CodeStar connection, not PAT).
5. **SNS email confirmation: architect-executed** via the owner's connected
   Gmail (confirmation link fetched and visited). First confirmation hit a
   stale subscription ("Deleted" — the pending sub had been replaced during
   stack updates); re-subscribed cleanly and confirmed the fresh email.
