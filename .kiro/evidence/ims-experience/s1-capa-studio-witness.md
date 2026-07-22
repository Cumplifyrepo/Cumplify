# S1 CAPA Studio — UI witness, REAL BUTTONS (architect, 2026-07-22)

Deploy: exec 150db806 (commit 20fdf8c), Dev-ApiStack 15:35:15Z /
Dev-AiStack 15:37:33Z. Witness rig `witness_s1_capa_studio.mjs` +
`witness_s1_sod_leg.mjs` — Playwright clicking the deployed CloudFront
frontend (SoD leg re-run on the ee9135e frontend locally against the
deployed API; ee9135e deploying now).

## The loop, clicked end-to-end

1. Signed in as acc-aaa-admin → /capa (CAPA STUDIO — register workspace
   + agent rail; `shot_capa_studio.png`).
2. TYPED a real problem report: two crews without fall protection on
   second-storey framing, foreman aware, harnesses unused, no injury.
3. CLICKED **Draft NC with CAPAGuru** → real Bedrock round-trip → the
   inline HitlCard arrived (`shot_capa_intake_card.png`) with the agent's
   draft: **standard ISO45001, ncType incident, severity high, clauseRef
   8.1.2, source incident**, description rewritten audit-ready, rationale
   citing worker-safety violation. The CLAUSE WAS IDENTIFIED BY THE
   AGENT — no manual clause field was touched.
4. CLICKED **Approve** as the same user → **"SoD violation: the proposer
   cannot approve their own item"** rendered in red ON THE CARD
   (`shot_capa_sod_on_card.png`). Item left PENDING for a second approver.

## Finding (FIXED same session, ee9135e): enforcement errors were swallowed

First Approve click showed generic "Action failed": Amplify's
client.graphql REJECTS on mutation errors with the GraphQLResult object
(not an Error) — `.message` undefined. Every SoD/matrix/sealed-write
rejection in the app had this bug. Fixed in lib/api.ts
(rethrowGraphQLError on the reject path, query+mutate) + 4 tests.
Also: witness-rig lesson — `text=Approve` substring-matched the
trust-ritual copy ("On approval…"); exact role-based clicks only.

## Verdicts
| Item | Verdict |
|---|---|
| Studio layout (workspace + agent rail) live | PASS |
| Intake: typed report → agent-drafted NC card inline | **PASS — the hero beat** |
| Clause identified by agent (ISO45001 8.1.2) | PASS |
| SoD rejection verbatim on the card | PASS (after ee9135e) |
| Manual raise demoted to secondary | PASS |
| Approve-as-second-user → NC created | NOT YET WITNESSED (needs second login — owner to provide) |
