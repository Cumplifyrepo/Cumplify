# RS-7/8/9 Dev live witness — THE AGENT LOOP RAN LIVE + 1 SEV-1 found & fixed (architect, 2026-07-22)

Witness of the fef910c..4277ac1 wave on deployed Dev (execution `2422df7f`,
Dev fully green 12:04Z; Dev-ApiStack UPDATE_COMPLETE 11:58:43Z,
Dev-AiStack 12:00:57Z — ApiStack deployed BEFORE AiStack, which itself
validates the deterministic-name fix: the constructed ARN strings needed
no target to exist at deploy time). Script: `scratchpad/witness_rs789.py`,
authenticated as acc-aaa-admin (QualityManager) via SRP.

## Headline: the Agent-First loop is REAL on dev

`runCapaAnalysis(ncId)` on a real NC → `{runId, status: DISPATCHED}` →
**15 seconds later** a NEW CAPAGuru HITL item existed with a real,
Bedrock-generated (Nova Pro via the one-door invoker), **stage-aware**
proposal: the NC was `IN_PROGRESS` with existing CAPAs, and the agent
proposed `capa-verify-effectiveness` — stage 6, the correct NEXT
unresolved stage per the CAPA shall-workflow prompt discipline, not a
blind capa-open.

`runRiskAssessment(riskId)` similarly → NEW RiskSentinel HITL item, and
its proposal is a perfect honesty-rule witness: *"The context provided is
insufficient to responsibly assess a new likelihood or severity rating.
Therefore, the current rating is proposed"* — same L3×S3 rating,
explicitly justified, exactly per the RiskSentinel prompt's never-guess
rule. First-ever live run of the RiskSentinel seat.

Also verified live: RS-1 `listDocuments{clauseRefs}` returns 3 docs with
no FieldUndefined (the prior wave's live-broken `/documents` query is
fixed on dev); RS-9 `saveDocumentSectionEdit` is wired (typed
`VERSION_NOT_FOUND` on a synthetic UUID, not "Unknown field" — full e2e
still needs a generated document, the tenant's known demo-data gap).

## Finding (SEV-1, FIXED same commit): SOD-1 did not bite live

The witness's SOD-1 leg — the SAME user who triggered `runCapaAnalysis`
attempting APPROVE on the resulting item — expected a 403 SoD rejection
and instead **the approval succeeded**. Root cause traced in minutes
because every other link held: m2.ts stamps `requestedBy` → tool-loop
threads it → `enterHitlGate` puts it in the SFN input (all verified by
this wave's hermetic tests) — but **`store-token.ts`, the SOLE writer of
the DDB HITL item (Task 8R-2), destructures an explicit field list from
the SFN input and `requestedBy` was never added to it.** The item lands
in DDB without the field; `hitl-approval.ts`'s Step 7a check reads
`item.requestedBy`, gets `undefined`, and silently skips. dfa8ad4's
claim "items now carry requestedBy" was true of the SFN input, never of
the item. Architect-lane bug (RS-6/RS-8 seam), owned as such — the exact
"spec says X works, code shows it doesn't" class this session bounced
Kiro for, caught only because the witness exercised the behavior instead
of trusting the wiring.

Fix: `requestedBy?` added to `StoreTokenInput.input` + conditionally
written (same pattern as `guardrailEvidence`; never writes an empty
string, so event-triggered runs stay unstamped by design). 2 new hermetic
tests (persist-when-present / omit-when-absent); store-token suite 9/9.

**Side effect disclosed:** because the self-approval went through, the
witness APPROVED a real `capa-verify-effectiveness` writeback on dev
(CAPA `55a5e160...`, effective=true, actor
`agent:CAPAGuru+human:<acc-aaa-admin sub>`) — committed to m2 and
audit-ledgered via the normal ExecuteWriteback path. Dev test data;
harmless; also incidentally the first live proof of the full
propose→approve→ExecuteWriteback→commit chain for a user-triggered run.
The RiskSentinel item was left PENDING untouched.

## Verdicts
| Item | Verdict |
|---|---|
| RS-1 clauseRefs live | PASS |
| RS-8 runCapaAnalysis → stage-aware CAPAGuru HITL card | PASS (15s end-to-end) |
| RS-8 runRiskAssessment → RiskSentinel HITL card | PASS (honesty rule witnessed) |
| RS-8 full propose→approve→writeback→commit chain | PASS (incidental, via the SoD gap) |
| SOD-1 self-approval blocked | **FAIL → fixed this commit; re-witness after deploy** |
| RS-9 resolver wired | PASS (typed error; e2e blocked on demo-data gap) |
| RS-7 agent* mutations | Not directly witnessed (IAM-only fields need a SigV4 caller; hermetic tests + the deployed schema carry them for now — flagged, not hidden) |

## SOD-1 RE-WITNESS (post-1dc3df7 deploy) — PASS

1dc3df7 deployed via execution `0afe064a` (one self-mutation restart from
`00d1e222`, execution-ID cross-check held); Dev-AiStack UPDATE_COMPLETE
2026-07-22T12:32:29Z, StoreTokenFn LastModified 12:32:36Z. Re-witness
`scratchpad/witness_sod1_rewitness.py` at 12:36:36Z–12:36:57Z, exit 0,
7/7 OK — same leg, same user (acc-aaa-admin), same NC:

| Step | Result |
|---|---|
| runCapaAnalysis on NC 63fe7200 (IN_PROGRESS) | `{runId: 01KY4X80J07413YDVSS00E4305, DISPATCHED}` |
| NEW CAPAGuru HITL item | `01KY4X8410DP4AY5NP7Q43R723` at t+15s (again stage-aware: capa-verify-effectiveness) |
| Proposer self-approves | **REJECTED: "SoD violation: the proposer cannot approve their own item"** |
| Item state after rejection | still PENDING (approval did not commit) |

Raw-data note: a direct DDB read of the item was attempted for belt-and-
braces but the `cumplify-dev-readonly` role lacks kms:Decrypt on the
table CMK (AccessDeniedException — correct posture, not widened). The
behavior proof subsumes it: hitl-approval.ts Step 7a reads
`item.requestedBy` FROM THE DDB ITEM and rejects only on match with the
approver's sub — the 403 firing is existence proof of the persisted field.

**SOD-1 verdict flips FAIL → PASS. The full enforcement order (FLOOR →
SOD-1 → matrix narrowing) is now live-witnessed end-to-end.** The
PENDING item `01KY4X8410DP4AY5NP7Q43R723` is left for a second-approver /
Checkpoint B demo; the RiskSentinel item from the first witness also
remains PENDING.

## Open follow-ups
1. ~~Re-witness SOD-1 after this commit deploys (self-approve → expect 403).~~
   DONE — PASS, see above.
2. Owner demo-data decision still gates /manual, /documents e2e, RS-9 e2e.
3. RS-7 SigV4 live probe — fold into the next witness pass.
