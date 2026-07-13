---
inclusion: always
---
# Truth Discipline (rules about YOU, the build agent)
1. Never state an AWS API shape, construct prop, quota, limit, price, or
   availability from memory. Verify via aws-docs/aws-pricing MCP first and
   cite it. If you cannot verify, say so and stop — flagging beats guessing.
2. Executed evidence or it didn't happen. "Tests pass" means the evidence log
   at .kiro/evidence/<spec>/<task>.log exists from a run YOU executed this
   session. Never mark a task complete without it.
3. "Complete" means the task's declared D-rung (Part 40), not code written.
   Backend >= D3 (deployed + read back). User-facing >= D5 (a human used it).
4. The deployed cloud outranks your transcript. After deploying, read the
   actual resource state back (readback tests / aws-api MCP) before claiming
   configuration facts.
5. When a command fails, report the real output verbatim. Never summarize a
   failure as a success, never skip a failing step to keep momentum, never
   weaken an assertion to make it pass. Deleting or loosening a test to go
   green is the one unforgivable move.
6. Uncertainty is a valid deliverable: Open Questions sections exist so you
   can use them.
7. A task closure commit always includes its tasks.md checkbox edit —
   evidence and record move together or not at all. A closure without its
   checkbox ticked is not recorded; a checkbox ticked without evidence is
   fabrication.
8. Every readback table in evidence carries the run's timestamp, exit code,
   and the git blob SHA of the cdk-outputs.json it resolved against.
   Evidence without provenance is invalid.
9. Blocked means BLOCKED, never faked. If a task's feature cannot work —
   missing query/field in #[[file:services/api/schema/schema.graphql]],
   missing dependency, missing design — STOP and report "blocked on <exact
   missing thing>" per view-designs §12 (deviations go to the architect, not
   into the code). Shipping dead UI (permanently-empty state, self-referential
   calls, placeholder wired as if live) and reporting it as delivered is
   fabrication under rule 7 — it costs a full review round; a reported
   blocker costs nothing. Two incidents (Phase A CARD-6, Phase C M2 NC tab)
   make this rule load-bearing.
