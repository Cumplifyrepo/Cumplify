# CLAUDE.md — Cumplify build repo

Cumplify.ai: multi-tenant agentic ISO 9001/14001/45001 compliance SaaS.
This is the BUILD repository (branch `develop`). The owner's planning corpus
lives outside the repo; if asked about "the consolidated doc" or "the kickoff
pack", that's `kiro-kickoff-pack.md` here plus the owner's planning folder.

## Working model
- The owner (Julio) builds with the Kiro IDE agent; Claude acts as the senior
  AWS architect: validates every Kiro stage INDEPENDENTLY (on-disk + live
  cloud, never trusting reports), drafts paste-ready "Response to Kiro"
  blocks, authors commits directly, and executes deploys/readbacks.
- Detailed project state, AWS profiles, owner decisions, and incident history
  live in Claude's local memory (auto-loaded per session), NOT in this file.

## Non-negotiable discipline (constitution rules 7/8 + standing lessons)
- Every task closure: checkbox ticks + per-task evidence log in the SAME
  commit; every readback table carries timestamp + exit code + outputs SHA.
- Never accept "verified" without executed output; re-execute claims from raw
  data. Diff merged outputs against the CLOUD, not sibling files.
- Readbacks must exercise behavior (invoke Lambdas, assert HTTP content,
  describe live state-machine definitions) — status codes and stack states
  are not content.
- Unit test lane is HERMETIC (fake AWS creds, IMDS disabled) — any unmocked
  AWS client must fail loudly. Live tests belong to the int lane only.
- AppSync: never `extend type` (silently ignored); new resolvers need an
  explicit node dependency on the schema.
- No `tenantId` in any GraphQL mutation input (SCHEMA-5) — resolvers inject it.
- No hardcoded UI strings (pseudo-locale CI check); en/es/pt catalogs updated
  in the same commit.

## Key locations
- Specs + evidence: `.kiro/specs/<spec>/`, `.kiro/evidence/<spec>/`
- Steering (incl. Framer design-source rules): `.kiro/steering/`
- Frontend design authority for view tasks: `.kiro/specs/frontend-app/view-designs.md`
  + tokens `frontend/src/tokens/design-tokens.ts`
- API schema: `services/api/schema/schema.graphql`; deployed outputs:
  repo-root `cdk-outputs.json`
- Verification: `npm run test` (hermetic), `npm run verify`, `npm run readback`

## Workspace guard
If `services/api/schema/schema.graphql` does not exist in the workspace root,
you are NOT in the build repo — stop and re-open `~/cumplify`.
