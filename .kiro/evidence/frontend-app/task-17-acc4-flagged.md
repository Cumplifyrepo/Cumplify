# Task 17 — ACC-4: Flagged HITL Approval — witnessed 2026-07-13 12:27Z

**Executed:** architect, standing auth, dev 697114252993. Raw captures: session
scratchpad acc4-*.

## Verdict

ACC-4 API-side PASS — flagged-item data path and justification sealing proven live.
The "reject without justification" leg is **frontend-enforced by design**
(CARD-7/HITL-7: the card requires typed justification BEFORE the mutation fires)
and the card is not built yet (tasks 25–31) — that leg stays OPEN and re-verifies
at the card build. Server-side enforcement is spec-35 L5-2 territory (see finding).

## Witnessed

1. **Flagged items created:** two deterministic HITL gates via StartExecution
   (store-token path, task-permitted): items 01KXDQ30KS0WZHAKRZA90M205X (leg A)
   and 01KXDQ30KS51SV4R8P96H89HQX (leg B), tool capa-open, real ncId.
   guardrailEvidence populated on both via direct DDB update (SIMULATION of the
   spec-35 L5 emission — spec 35 not built; shape matches the GraphQL type:
   groundingScore 0.42, arVerdict fail, arDetails, citations[1], flagged:true).
2. **Evidence surfaces to the client:** listPendingHitlItems returned BOTH items
   with fully-typed guardrailEvidence (score/verdict/details/citations) —
   the CARD-6/L5-1 render-slot data path works end-to-end. Unflagged item
   (01KX4A4Z83) correctly shows guardrailEvidence: null.
3. **Leg A — approve WITHOUT justification:** mutation returned 200
   (auditEventId 01KXDQ4PEHY30592D07HQ63YKR). EXPECTED per current design: the
   requirement places enforcement in the card (CARD-7), which doesn't exist yet;
   no server rule exists until spec-35 L5-2. Sealed Hitl.Approved payload:
   justification: null. SFN SUCCEEDED, writeback committed.
4. **Leg B — approve WITH justification:** 200 (auditEventId
   01KXDQ4PX9NMMYBFN4BET1S7R8); sealed Hitl.Approved payload contains the typed
   justification VERBATIM (L5-3 proven live). SFN SUCCEEDED, writeback committed.
5. **Chain verifier:** tenant-AAA itemsChecked=11, chainValid=true,
   s3Mismatches=0, brokenLinks=[].

## Findings routed to spec-35 design (Kiro)

- **F-E (design input, IMPORTANT):** L5-1 puts guardrailEvidence on EVERY
  HITL item, so evidence-presence ≠ flagged. The L5-4 card data contract needs an
  explicit `flagged: boolean` (or equivalent derived rule) — otherwise both the
  card (CARD-7) and any server rule would demand justification for every approval.
- **F-F (defense-in-depth):** until spec-35 implements L5-2 server-side, a raw
  API caller can approve a flagged draft without justification (leg A witnessed).
  Recommend the L5-2 build add the check in hitl-approval (400 when flagged &&
  !justification), keyed on the explicit flagged marker from F-E.

## Dev artifacts

2 corrective_actions rows (leg A/B writebacks, tenant-AAA, due 2026-08-20),
2 resolved HITL items with simulated guardrailEvidence, 4 sealed events
(2× Hitl.Approved + 2× Agent.WritebackCommitted). Stale 410-fixture item
01KX4A4Z83 untouched.
