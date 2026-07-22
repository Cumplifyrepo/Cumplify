# Design gate — §8 /manual + §10 /documents (architect, 2026-07-22)

Rig: Playwright/Chromium 1440×900, signed in as acc-aaa-admin
(QualityManager) against the local Next dev server → deployed Dev AppSync.
Tenant seeded same day (Meridian Design-Build LLC profile v2 + IMS
generation run 6da72479: 46 sections, 24 honest gaps). Screenshots in
`screenshots/` (committed with this log). Final capture run: ZERO console
errors, ZERO 5xx responses.

## Two blocking defects found AT the gate (fixed in d4334ec + this commit)

The first capture run failed the gate outright — both defects were
invisible until the tenant had real generation data:

1. **AWSJSON output double-encoding (backend, systemic)** —
   `getDocumentContent` returned `JSON.stringify(content)`; AppSync
   serializes the AWSJSON slot again, so EVERY consumer (manual viewer,
   documents detail, cross-reference matrix, qms viewer) parsed to a
   string and silently rendered nothing. Empirical rule pinned by probes:
   resolver returns OBJECT → client receives parsed JSON (this is why
   RS-1 clauseRefs grouping worked); resolver returns string → double-
   encoded wire. Fixed at 5 resolver sites (`jsonOut` helper) + frontend
   `parseAwsJson` both-shapes guard (object/single/double) so cached
   frontends survive the deploy window.
2. **/manual State-4 rendered from the lightweight list row** —
   `listGenerationRuns` deliberately returns `sections: [], gapCount: 0`;
   the page never hydrated via `getGenerationRun`, so every StatTile read
   0 and the section list was empty. Fixed: initialize() hydrates the
   latest run; regression-pinned by the new `manual/page.test.tsx`.
3. (Same class, /documents) the DRAFT detail branch fed `DocumentEditor`
   via bare `JSON.parse` — empty editor in both old AND new wire shapes.
   Fixed with `parseAwsJson`.

## §8 /manual — **PASS**

| §8.1 requirement | Witnessed |
|---|---|
| State 4 StatTile row Total/Prose/Gaps/Reviewed | 46 / 22 / 24 (warning tint) / 0-46 (`shot_manual.png`) |
| Action bar: Regenerate (secondary), Export ZIP (primary), Submit | present, correct button variants |
| Section list w/ kind badges + per-prose "Mark reviewed" | 46 rows, PROSE→green / GAP→amber (`shot_manual.png`) |
| ControlledDocViewer §7 identification block (MANDATORY) | doc ID, type MANUAL, 3 standards, v1, date, org, mgmt rep, sites + CONTROLLED stamp + footer (`shot_manual_viewer.png`) |
| BC-1 honest-gaps disclaimer | rendered verbatim above section 1 |
| Honest GAP boxes | "GAP — REQUIRED INFORMATION NOT RECORDED • register.interested_parties" (`shot_manual_viewer.png`) |
| Agent-First (§8.2) | the Generate button IS the engine — this tenant's manual came from it (run 6da72479, 31s) |
| States 1/2 | witnessed live earlier in P2S1 validation (tenant had no profile/runs then — that's what masked defect 2) |

## §10 /documents — **PASS** (one recorded deviation)

| §10.1 requirement | Witnessed |
|---|---|
| Clause-family grouping 4–10 | real headers: 4 Context / 5 Leadership / 6 Planning… (`shot_documents.png`) |
| Standard + status filters, New draft button | present |
| DataTable per group w/ StatusBadge + updatedAt ProvenanceLink | present |
| Detail: DRAFT → DocumentEditor (Collaboration Law §13) | prose 4.4: REAL generated Meridian prose in Tiptap + **Insert diagram** + **Regenerate with DocStudio** (`shot_documents_detail_prose.png`); gap 4.1: honest gap notice (`shot_documents_detail.png`) |
| Detail: version rail | v1 with author + date |
| Detail: non-DRAFT → ControlledDocViewer | branch in place; component live-proven on /manual; no non-DRAFT doc exists on dev yet — not blocking |

**Deviation D-1 (accepted):** spec columns "Title, StatusBadge,
ClauseChip(s), version, updatedAt" — shipped columns are Title (clause
ref inline), Status, Standard chip, Type, Updated. Clause data is visible
in-row and versions live in the detail rail; information hierarchy
preserved. Recorded, not bounced.

## Migration-law flips (per _pending-flips/README)

- **/m1 → /documents: ACTIVATED** (m5-precedent redirect stub; old
  register + `_detail/` removed — /documents fully absorbs it).
- **/qms → /manual: gate PASSED but flip DEFERRED** — /qms still hosts
  the ONLY working org-profile wizard while /setup is a §5 stub;
  redirecting would strand profile creation, violating the same law's
  "always land on a working surface". Activate when the Setup Wizard
  ships at /setup (architect queue, next).

## /billing (owner directive, same day)

`shot_billing.png` — ADMIN-gated page, Stripe portal link honest
not-configured state (env `NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL` unset
on dev until the owner supplies the portal URL), AI-usage overage note
per the 2026-07-08 ruling.

## DEPLOYED RE-WITNESS (execution b8377c44 → commit 11d88e2) — PASS

Dev green 14:06Z (Dev-ApiStack 14:00:50Z; the wave took TWO
self-mutation restarts because af37ca1 changed the pipeline's own
definition — i18n gate). Probes at 14:07Z against deployed AppSync:

| Probe | Result |
|---|---|
| saveOrgProfile SINGLE-encoded (the frontend wizard's true encoding) | **PASS** — profile v3 saved; the input fix is live (v1/v2 needed the double-encode workaround) |
| getDocumentContent wire shape | parse depth 1 (single-encoded, 46 sections) — output fix live |
| getOrgProfile.payload wire shape | parse depth 1, legalName intact |

CloudFront shots (`shot_manual_deployed.png` captured, matches the
local-gate shots pixel-for-purpose: 46/22/24 tiles, full section list;
/documents grouping identical). One benign console line: Next static-
export RSC prefetch for /guide falls back to browser navigation —
pre-existing pattern, not a functional failure.

Observed AWSJSON wire nuance, recorded for the next engineer: object
returns arrive to raw-HTTP clients as a single-encoded JSON string
(depth 1) but reached the Amplify client parsed (depth 0) — which is
exactly why `parseAwsJson` normalizes depth 0/1/2 rather than assuming.

## Follow-ups
1. ~~Deployed-pair re-witness~~ DONE — PASS, above.
2. Setup Wizard at /setup (unblocks the deferred /qms flip).
3. Non-DRAFT document detail witness once an approval flow runs on dev.
