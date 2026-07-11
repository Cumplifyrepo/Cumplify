# Frontend App — Tasks

**Spec:** `frontend-app` (spec 9)
**Design approved:** R2 (commit `faf7da0`)
**Convention:** `[KIRO]` = Kiro executes. `[ARCHITECT]` = architect/owner executes. `[REQUIRES-HUMAN]` = owner reviews diff before merge. `[BLOCKED-ON-OWNER-DESIGN]` = blocked on owner-provided Framer designs (decision 33f1e57).
**Evidence contract:** Rule 7 — checkbox edits ONLY in the same commit as the evidence log. Rule 8 — readback rows carry timestamp + exit code + cdk-outputs.json blob SHA. Evidence path: `.kiro/evidence/frontend-app/`.

---

## Task 1 — Hosting Spike: Amplify WEB_COMPUTE Manual Deploy [KIRO+ARCHITECT]

> GATES all hosting-dependent tasks. If the deploy spec rejects WEB_COMPUTE manual bundles, STOP — hosting decision reopens.

- [x] Create `frontend/` Next.js App Router hello-world app (minimal: one page, SSR `getServerSideProps` or RSC fetch, renders "Cumplify OK" + request timestamp).
- [x] Run `next build` and produce the Amplify Hosting deployment artifact per the Amplify deployment specification: `deploy-manifest.json` + compute bundle layout (routes, handlers, static assets in the structure Amplify expects for WEB_COMPUTE).
- [x] [ARCHITECT] Create a dev Amplify app via CLI: `aws amplify create-app --name cumplify-frontend-spike --platform WEB_COMPUTE --no-enable-branch-auto-build`.
- [x] [ARCHITECT] Create branch: `aws amplify create-branch --app-id <id> --branch-name spike --framework "Next.js - SSR" --enable-auto-build false`.
- [x] [ARCHITECT] Deploy: `aws amplify create-deployment --app-id <id> --branch-name spike` → upload to presigned URL → `aws amplify start-deployment --app-id <id> --branch-name spike --job-id <jobId>`.
- [x] [ARCHITECT] Verify: `curl -f https://<branch>.<appId>.amplifyapp.com/` returns SSR response (timestamp changes on reload, proving server-side execution).
- [x] Evidence: screenshot + curl output + job status JSON. If WEB_COMPUTE rejects the manual bundle → STOP, document failure, reopen OQ-1.
- [x] [ARCHITECT] Tear down spike app after proof: `aws amplify delete-app --app-id <id>`.

**D-rung:** D3 (deployed + read back).
**Evidence:** `.kiro/evidence/frontend-app/task-1-hosting-spike.md`

---

## Task 2 — Schema SDL + Resolver Scaffolds [KIRO]

- [x] Append the BC-7 consolidated SDL (design §2.2) to `services/api/schema/schema.graphql`: types (`HitlItem`, `HitlApprovalResult`, `GuardrailEvidence`, `Citation`, `HitlItemConnection`, `UserProfile`), enums (`HitlDecision`), inputs (`ApproveHitlItemInput`, `PaginationInput`, `UpdateProfileInput`), extended Query/Mutation/Subscription.
- [x] Create resolver stub files: `services/api/src/resolvers/hitl-approval.ts`, `services/api/src/resolvers/hitl-query.ts`, `services/api/src/resolvers/profile.ts` (each exports a handler that returns a placeholder 501).
- [x] Create subscription auth resolver stub: `services/api/src/resolvers/hitl-subscription-auth.ts` (C-6 tenantId verification pattern from existing subscription resolvers).
- [x] Wire data sources + resolvers in `infra/lib/api-stack.ts` (4 new NodejsFunction data sources + 1 None DS for subscription).
- [x] `tsc --noEmit` passes, `cdk synth` passes, CDK Nag zero non-compliant.
- [x] Unit test: template assertion verifies 4 new Lambda data sources + 5 new resolvers exist.

**Depends on:** nothing (parallel-ready).
**D-rung:** D1 (code + synth).
**Evidence:** `.kiro/evidence/frontend-app/task-2-schema.log` — tsc + synth + test exit codes.

---

## Task 3 — Permission Matrix Module [KIRO]

- [x] Create `services/api/src/permissions/role-matrix.ts` with the Part 13 permission map (12 roles → module sets) and `canApprove(role, module): boolean`.
- [x] Unit tests: each role's expected modules asserted; unknown role returns false; edge cases (document-controller can approve M1 only, etc.).
- [x] `tsc --noEmit` passes.

**Depends on:** nothing.
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-3-permissions.log`

---

## Task 4 — HITL Approval Lambda [KIRO]

- [x] Implement `services/api/src/resolvers/hitl-approval.ts` per design §2.3:
  - Step 1–2: extract resolverContext, validate role via `canApprove()` → 403.
  - Step 3: GetItem base-table key `PK=TENANT#<tenantId>#HITL, SK=PENDING#<hitlItemId>` → 404 on missing/mismatch.
  - Step 4: Conditional UpdateItem (`attribute_exists(PK) AND #status = :pending`, SET status=RESOLVING, resolvingAt=<now>) → catch `ConditionalCheckFailedException` → 409.
  - Step 5–6: extract taskToken + sfnExecutionArn from item.
  - Step 7a (APPROVE): SFN `SendTaskSuccess` → catch `TaskDoesNotExist`/`TaskTimedOut` → 410. Call `resolveHitlItem(APPROVED)`.
  - Step 7b (SEND_BACK): SFN `SendTaskFailure(error:'SENT_BACK', cause: note)` → catch same → 410. Call `resolveHitlItem(REJECTED)`.
  - Step 8: publish `Hitl.Approved` or `Hitl.SentBack` via `publishAuditEvent`.
  - Step 9: return `HitlApprovalResult`.
- [x] Unit tests (mock DDB + SFN + EventBridge): happy-path approve, happy-path send-back, 403 wrong role, 404 missing item, 409 already resolved, 410 expired token, justification pass-through for flagged items.
- [x] `tsc --noEmit` passes.

**Depends on:** Task 3 (role-matrix).
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-4-approval-lambda.log`

---

## Task 5 — HITL Query Resolver (listPendingHitlItems) [KIRO]

- [x] Implement `services/api/src/resolvers/hitl-query.ts`:
  - Query GSI9 with `KeyConditionExpression: GSI9PK = :pk` where `:pk = TENANT#<tenantId>#HITL_PENDING`.
  - Pagination: `Limit` from input (default 20, max 50), `ExclusiveStartKey` decoded from `nextToken` (base64). Validate decoded key's PK matches caller's tenantId.
  - Map DDB items → `HitlItem` type (exclude `taskToken` from response — BC-8).
  - Return `HitlItemConnection { items, nextToken }`.
- [x] Unit tests: empty queue, single page, pagination round-trip, taskToken exclusion assertion, cross-tenant nextToken rejection.
- [x] `tsc --noEmit` passes.

**Depends on:** nothing.
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-5-hitl-query.log`

---

## Task 6 — PROFILE# Plumbing (getProfile / updateProfile) [KIRO]

- [x] Implement `services/api/src/resolvers/profile.ts`:
  - `getProfile`: GetItem `PK=TENANT#<tenantId>#PROFILE, SK=USER#<sub>`. Return `{ userId: sub, locale, updatedAt }` or default `{ locale: 'en' }` if not found.
  - `updateProfile`: PutItem (upsert) same key with `locale` + `updatedAt`. Validate locale ∈ ['en','es','pt'].
- [x] Unit tests: get existing, get missing (default), update, invalid locale rejected.
- [x] `tsc --noEmit` passes.

**Depends on:** nothing.
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-6-profile.log`

---

## Task 7 — Event Registration [KIRO]

- [x] Append to `contracts/events.md` Hitl domain: `Hitl.Approved` (auditTrail: true), `Hitl.SentBack` (auditTrail: true).
- [x] Append to `services/eventing/src/audit-trail-registry.ts`: both events with `auditTrail: true`.
- [x] Parity test (existing api-core Task 3 pattern) passes: registry keys ↔ events.md agreement.
- [x] `tsc --noEmit` passes.

**Depends on:** nothing.
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-7-events.log`

---

## Task 8 — RESOLVING-Cleanup Sweeper [KIRO]

- [x] Create `services/api/src/resolvers/hitl-sweeper.ts`: scheduled Lambda (EventBridge rate 5 min) that scans GSI9 for items with `status=RESOLVING` and `resolvingAt` older than 5 minutes (NOT `tokenStoredAt` — that would race live approvals the instant they enter RESOLVING).
- [x] Reset uses a conditional UpdateItem: `ConditionExpression: #status = :resolving` (prevents resurrecting an item that completed between SendTaskSuccess and resolveHitlItem). SET status=PENDING, remove resolvingAt, re-set GSI9PK/GSI9SK so the item reappears in the queue.
- [x] Wire in ApiStack: NodejsFunction + EventBridge Schedule (rate 5 min) + IAM (Scan scoped to GSI9 index + UpdateItem on CumplifyCore). NOTE (architect, 2026-07-11): this box was ticked in e11c686 with NO wiring on disk (rule-7 false tick #4, caught at validation); wiring implemented by architect hotfix alongside the missing states:SendTask* grant.
- [x] Unit tests: item with resolvingAt > 5min ago AND status=RESOLVING → reset; item with resolvingAt < 5min → untouched; item with status=APPROVED (race) → ConditionalCheckFailedException caught, skipped.
- [x] `cdk synth` passes, CDK Nag zero non-compliant.

**Depends on:** nothing.
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-8-sweeper.log`

---

## Task 9 — i18n Scaffold + Pseudo-Locale CI Check [KIRO]

- [x] Initialize `next-intl` in `frontend/`: App Router integration, `messages/en.json`, `messages/es.json`, `messages/pt.json` (seed with Command Center strings: readiness score labels, HITL card anatomy, approval buttons, trust-ritual footer).
- [x] Implement locale resolution: read from PROFILE# item (server component fetch) → fallback to tenant `document-locale` → fallback to `en`.
- [x] Create pseudo-locale CI script (`scripts/check-hardcoded-strings.ts` or eslint rule): fails the build if any JSX string literal outside `useTranslations()` / `getTranslations()` is detected in `frontend/src/`.
- [x] Wire into `package.json` scripts (runs in `npm run lint` or a dedicated `npm run i18n:check`).
- [x] Test: deliberately hardcoded string → CI check fails (evidence captured).

**Depends on:** Task 1 (frontend/ exists).
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-9-i18n.log`

---

## Task 10 — Design-Sync Tooling [KIRO]

- [x] Create `scripts/framer-sync.mjs`: connects to Framer project via `framer-api` SDK, extracts design tokens (colors, spacing, typography from the component library), writes to `frontend/src/tokens/design-tokens.ts` (or JSON consumed by Tailwind/CSS variables).
- [x] Extracts page metadata (available routes) and writes `frontend/src/tokens/framer-pages.json` for build-time route validation.
- [x] `node --env-file=.env scripts/framer-sync.mjs` runs successfully (evidence: output + generated files).
- [x] `.env` keys required: `FRAMER_API_KEY`, `FRAMER_PROJECT_URL` (git-ignored, per steering 21).

**Depends on:** Task 1 (frontend/ exists).
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-10-design-sync.log`

---

## Task 11 — Command Center (Surface 1, from /dashboard Framer design) [KIRO]

- [ ] Implement `/dashboard` page using the Framer `/dashboard` design (extracted via Task 10 design-sync).
- [ ] Panel: Readiness Score — server component fetching `getAuditReadiness(standard)` for each standard. Trend indicator with attribution text.
- [ ] Panel: HITL Approval Queue — client component calling `listPendingHitlItems`, rendering Part 3.2 card anatomy (CARD-1..7). Role-gated buttons per `custom:role` claim.
- [ ] Panel: Agents Working Now — live feed via `onDocumentStatusChanged`, `onCAPAStatusChanged`, `onFindingRecorded`, `onRiskEscalated` subscriptions.
- [ ] Panel: Top Risks — server component fetching `getCrossRegisterRiskView`.
- [ ] CC-6: readiness score refetch triggered on relevant subscription events.
- [ ] 15s polling interim for HITL queue (until `onHitlItemResolved` subscription wired in deploy).
- [ ] All strings via `next-intl` catalogs (no hardcoded strings).
- [ ] Brand: logo renders from `frontend/public/brand/cumplify-logo.png` (BC-9).

**Depends on:** Tasks 1, 2, 9, 10.
**D-rung:** D2 (built + locally tested).
**Evidence:** `.kiro/evidence/frontend-app/task-11-command-center.log`

---

## Task 12 — FrontendStack CDK Infrastructure (S3+CloudFront) [KIRO]

- [ ] Create new `infra/lib/frontend-stack.ts` (FrontendStack — own lifecycle, keeps ApiStack lean): private S3 bucket (SSE-S3, block all public access) + CloudFront Distribution (OAC origin, custom error responses 403/404 → /index.html for SPA routing, HTTPS redirect).
- [ ] CfnOutputs: bucket name, distribution ID, distribution domain name.
- [ ] Wire FrontendStack into `infra/lib/cumplify-stage.ts` with addDependency on ApiStack (needs API URL output for build-time env vars).
- [ ] `cdk synth` passes, CDK Nag zero non-compliant.
- [ ] Template-assertion test: S3 bucket (BlockPublicAccess=BLOCK_ALL) + CloudFront distribution (OAC, error responses) exist.

**Depends on:** Task 1 CLOSED (hosting decision resolved).
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-12-frontend-infra.log`

---

## Task 13 — HITL-10 SFN Amendment + Carry #3 [KIRO] [REQUIRES-HUMAN]

- [ ] Amend the WaitForApproval task Parameters: add `"sfnExecutionArn.$": "$$.Execution.Id"` to the payload passed to store-token.
- [x] Amend `services/agents/shared/store-token.ts`: add `sfnExecutionArn` to the UpdateItem SET expression (from `input.sfnExecutionArn`).
- [ ] Add Catch on WaitForApproval: `{"ErrorEquals":["SENT_BACK"],"Next":"HandleSendBack"}`.
- [ ] Add `HandleSendBack` state: Pass state logging the send-back (downstream re-draft logic owned by `agents-existing-8`).
- [ ] `cdk synth` passes, CDK Nag zero non-compliant.
- [x] Unit test: store-token writes sfnExecutionArn field.
- [ ] **[REQUIRES-HUMAN]** — AiStack state machine amendment. Owner reviews diff.

**Depends on:** nothing.
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-13-hitl10-sfn.log`

---

## Task 14 — Consolidated REQUIRES-HUMAN Sign-Off [ARCHITECT]

> ONE stop before any deploy. Assemble the full diff list for owner sign-off.

**Scope of review (all in one bundle):**

1. **5-field schema bundle** (Task 2): `listPendingHitlItems`, `approveHitlItem`, `onHitlItemResolved`, `getProfile`, `updateProfile` — new types, inputs, resolvers, data sources.
2. **HITL-10 SFN amendment** (Task 13): carry #3 (`sfnExecutionArn` in payload) + Catch/HandleSendBack branch.
3. **Approval Lambda IAM** (Task 4): `states:SendTaskSuccess`, `states:SendTaskFailure` on HITL state machine ARN(s); `dynamodb:GetItem`+`UpdateItem` (tenant-scoped); `events:PutEvents`.
4. **RESOLVING-cleanup sweeper IAM** (Task 8): EventBridge schedule + DDB Query/UpdateItem on CumplifyCore (tenant-scoped).
5. **Cross-account credentialed-step role** (shared with pipeline `test:int` carry): a single role in the dev workload account assumable by the pipeline mgmt-account role, granting `s3:PutObject`+`s3:DeleteObject`+`s3:ListBucket` on the frontend bucket + `cloudfront:CreateInvalidation` on the distribution + integration-test permissions. Designed ONCE with both consumers.
6. **FrontendStack infra** (Task 12): S3 bucket (private, OAC) + CloudFront distribution + pipeline deploy step (s3 sync + invalidation).

- [x] **[ARCHITECT]** All diffs assembled and presented as a single review package (six items, verified on disk pre-presentation).
- [x] **[ARCHITECT]** Owner sign-off obtained 2026-07-11: "Approve — deploy to dev", full bundle, no items held.
- [x] Evidence: sign-off record in `.kiro/evidence/frontend-app/task-14-requires-human.md`.

**Depends on:** Tasks 2, 4, 8, 12, 13 (all code written, synth passing).
**STOP until sign-off obtained.** No deploy proceeds without this.

---

## Task 15 — Deploy to Dev [ARCHITECT]

- [x] Deployed (direct-deploy fallback lane; push paused on owner PAT): ApiStack UPDATE_COMPLETE after 3 live defects fixed (schema/resolver CFN race; AppSync extend-type unsupported; tenant-data trust 2048-byte quota → owner-re-signed PrincipalArn pattern), AiStack SFN amendment live, FrontendStack CREATE_COMPLETE.
- [x] Frontend deployed: build → s3 sync → invalidation (architect creds this once; cross-account step role still to build). LIVE: d1tw2kanxo5wnt.cloudfront.net.
- [x] Outputs blob sha256 e83f79b4beaceb90 @ 2026-07-11T13:42:40Z.
- [x] Readback (invoked live, Pool-B SRP token):
  - [x] `listPendingHitlItems` — returned a REAL pending CAPAGuru item, tenant-scoped; taskToken field rejected at schema level (FieldUndefined).
  - [x] `getProfile` — fail-safe default en.
  - [x] `updateProfile(es)` → `getProfile` = es, live round-trip.
  - [x] CloudFront 200 on / and /dashboard (SPA fallback verified).
  - [ ] Subscription `onHitlItemResolved` — resolver LIVE on the API (config verified); WSS connect deliberately left open, fires at Task 16 ACC-3 E2E.

**Depends on:** Task 14 (sign-off obtained).
**D-rung:** D3 (deployed + read back).
**Evidence:** `.kiro/evidence/frontend-app/task-15-deploy-readback.md` — timestamp + exit code + cdk-outputs.json blob SHA per Rule 8.

---

## Task 16 — ACC-3: Full HITL Approval Flow [ARCHITECT]

- [ ] Trigger an agent HITL gate (or manually create a HITL_PENDING item via store-token invocation).
- [ ] Verify item appears in `listPendingHitlItems` response.
- [ ] Call `approveHitlItem(hitlItemId, decision:APPROVE)` with a valid Pool-B Quality Manager token.
- [ ] Verify: item disappears from pending query (GSI9PK removed).
- [ ] Verify: sealed audit event `Hitl.Approved` written to AUDITLOG (query by eventType).
- [ ] Verify: SFN execution completed successfully (execution history shows TaskSucceeded).
- [ ] Verify: no `taskToken` in any GraphQL response captured in network trace.

**Depends on:** Task 15.
**D-rung:** D3.
**Evidence:** `.kiro/evidence/frontend-app/task-16-acc3-hitl-flow.md`

---

## Task 17 — ACC-4: Flagged HITL Approval [ARCHITECT]

- [ ] Create a HITL item with `guardrailEvidence` populated (simulate flagged draft).
- [ ] Attempt `approveHitlItem` WITHOUT `justification` field → verify backend rejects (or frontend blocks — depending on enforcement location per design; if server-enforced, verify 400).
- [ ] Call `approveHitlItem` WITH `justification` → verify sealed event includes `justification` in payload.

**Depends on:** Task 15.
**D-rung:** D3.
**Evidence:** `.kiro/evidence/frontend-app/task-17-acc4-flagged.md`

---

## Task 18 — ACC-5: Locale Switch [ARCHITECT]

- [ ] Authenticate as Pool-B user, confirm UI renders in English (default).
- [ ] Call `updateProfile(locale:'es')`.
- [ ] Reload Command Center — all UI strings render in Spanish.
- [ ] Call `askISO9001(question:"¿Qué requiere la cláusula 8.5.1?")` — response arrives in Spanish.
- [ ] Screenshot comparison EN vs ES.

**Depends on:** Task 15.
**D-rung:** D5 (human used it).
**Evidence:** `.kiro/evidence/frontend-app/task-18-acc5-locale.md`

---

## Task 19 — ACC-6: Pseudo-Locale CI Check [KIRO]

- [ ] Introduce a deliberately hardcoded string in a frontend component.
- [ ] Run `npm run lint` (or `npm run i18n:check`) — verify the check FAILS.
- [ ] Remove the hardcoded string — verify the check PASSES.
- [ ] Evidence: CI log output showing failure + pass.

**Depends on:** Task 9.
**D-rung:** D1.
**Evidence:** `.kiro/evidence/frontend-app/task-19-acc6-pseudo-locale.log`

---

## Task 20 — ACC-7: Role Gating [ARCHITECT]

- [ ] Authenticate as Pool-C Employee role → view Command Center → HITL cards show in read-only (no Approve/Edit/Send-back buttons).
- [ ] Authenticate as Pool-B Quality Manager → same HITL cards show full action set.
- [ ] Side-by-side screenshot evidence.

**Depends on:** Task 15.
**D-rung:** D5.
**Evidence:** `.kiro/evidence/frontend-app/task-20-acc7-role-gating.md`

---

## Task 21 — ACC-9: taskToken Exclusion [ARCHITECT]

- [ ] Capture network trace of `listPendingHitlItems` response.
- [ ] Grep response body for "taskToken" — assert zero occurrences.
- [ ] Inspect deployed GraphQL schema (introspection or `schema.graphql` file) — assert `taskToken` not present in any type.

**Depends on:** Task 15.
**D-rung:** D3.
**Evidence:** `.kiro/evidence/frontend-app/task-21-acc9-tasktoken.md`

---

## Task 22 — ACC-1: Command Center Walkthrough [ARCHITECT]

- [ ] Authenticate as Pool-B user (dev).
- [ ] Verify readiness score displayed (per-standard, with trend).
- [ ] Verify HITL queue shows at least one pending item.
- [ ] Trigger an agent event (or publish manually) → verify live feed updates within 5s.
- [ ] Verify top risks panel populated.
- [ ] Witnessed walkthrough documented.

**Depends on:** Task 15 + Task 11 deployed.
**D-rung:** D5.
**Evidence:** `.kiro/evidence/frontend-app/task-22-acc1-command-center.md`

---

## Task 23 — ACC-2: Ask Cumplify Query [ARCHITECT]

- [ ] Call `askISO9001(question:"What does clause 8.5.1 require?")` via the frontend chat panel.
- [ ] Verify: response includes `clauseRef` citation inline.
- [ ] Verify: at least one action chip rendered.
- [ ] Verify: no `queryVector` sent in network trace (frontend sends question text only).
- [ ] Screenshot + network trace captured.

**Depends on:** Task 15 + Ask Cumplify view (Task 25, blocked on design).
**D-rung:** D5.
**Evidence:** `.kiro/evidence/frontend-app/task-23-acc2-ask-cumplify.md`

---

## Task 24 — ACC-8: Pool A Rejection [ARCHITECT]

- [ ] Verify frontend sign-in does not offer Pool A as identity provider.
- [ ] Manually inject a Pool A token → AppSync returns 401 (proven by api-core ACC-3; re-confirm from frontend context).

**Depends on:** Task 15.
**D-rung:** D3.
**Evidence:** `.kiro/evidence/frontend-app/task-24-acc8-pool-a.md`

---

## View Tasks [BLOCKED-ON-OWNER-DESIGN]

> Per owner decision 33f1e57: these tasks unblock when the owner provides Framer designs. Before implementation, re-run `framer-api getNodesWithType("WebPageNode")` to confirm the pages exist.

### Task 25 — Ask Cumplify Chat Panel [KIRO] [BLOCKED-ON-OWNER-DESIGN]

- [ ] Framer page confirmed via SDK inventory: `/<path-tbd>`.
- [ ] Implement persistent chat overlay/sidebar per Framer layout.
- [ ] Route questions to `askISO9001`/`askISO14001`/`askISO45001` (question text only, no queryVector).
- [ ] Render clauseRef citations inline; action chips per ASK-4.
- [ ] All strings via `next-intl`.

**Binds to:** owner-provided Framer page for Ask Cumplify.
**D-rung:** D2.
**Evidence:** `.kiro/evidence/frontend-app/task-25-ask-cumplify.log`

---

### Task 26 — M1 Document Studio UI [KIRO] [BLOCKED-ON-OWNER-DESIGN]

- [ ] Framer page confirmed via SDK inventory.
- [ ] Document list (filtered by standard/status), detail + version diff, forms per MOD-3.
- [ ] Real-time via `onDocumentStatusChanged`. Visible provenance links (MOD-9).
- [ ] All strings via `next-intl`.

**Binds to:** owner-provided Framer page for M1.
**D-rung:** D2.
**Evidence:** `.kiro/evidence/frontend-app/task-26-m1.log`

---

### Task 27 — M2 CAPA UI [KIRO] [BLOCKED-ON-OWNER-DESIGN]

- [ ] Framer page confirmed via SDK inventory.
- [ ] NC list, CAPA timeline, forms per MOD-4.
- [ ] Real-time via `onCAPAStatusChanged`. Visible provenance links.
- [ ] All strings via `next-intl`.

**Binds to:** owner-provided Framer page for M2.
**D-rung:** D2.
**Evidence:** `.kiro/evidence/frontend-app/task-27-m2.log`

---

### Task 28 — M3 Audit Studio UI [KIRO] [BLOCKED-ON-OWNER-DESIGN]

- [ ] Framer page confirmed via SDK inventory.
- [ ] Programme overview, audit + checklist + findings, readiness heatmap, forms per MOD-5.
- [ ] Real-time via `onFindingRecorded`. Visible provenance links.
- [ ] All strings via `next-intl`.

**Binds to:** owner-provided Framer page for M3.
**D-rung:** D2.
**Evidence:** `.kiro/evidence/frontend-app/task-28-m3.log`

---

### Task 29 — M4 Records Management UI [KIRO] [BLOCKED-ON-OWNER-DESIGN]

- [ ] Framer page confirmed via SDK inventory.
- [ ] Record register, calibration schedule (from `listCalibrationsDue`), audit-trail viewer, forms per MOD-6.
- [ ] Visible provenance links.
- [ ] All strings via `next-intl`.

**Binds to:** owner-provided Framer page for M4.
**D-rung:** D2.
**Evidence:** `.kiro/evidence/frontend-app/task-29-m4.log`

---

### Task 30 — M5 Risk Management UI [KIRO] [BLOCKED-ON-OWNER-DESIGN]

- [ ] Framer page confirmed via SDK inventory.
- [ ] Risk register, cross-register view, forms per MOD-7.
- [ ] Real-time via `onRiskEscalated`. Visible provenance links.
- [ ] All strings via `next-intl`.

**Binds to:** owner-provided Framer page for M5.
**D-rung:** D2.
**Evidence:** `.kiro/evidence/frontend-app/task-30-m5.log`

---

### Task 31 — Settings → Organization [KIRO] [BLOCKED-ON-OWNER-DESIGN]

- [ ] Framer page confirmed via SDK inventory.
- [ ] Settings nav entry (Pool B only, per `custom:role`).
- [ ] Organization section: tenant `document-locale` field rendered **READ-ONLY** (displays the tenant default locale). The `updateProfile` mutation writes the per-USER locale only — it must NOT be used for the tenant document-locale. The tenant-settings write surface is a **NAMED CARRY to the settings spec**.
- [ ] All strings via `next-intl`.

**Binds to:** owner-provided Framer page for Settings.
**Named carry:** tenant document-locale write → `settings-ui` spec.
**D-rung:** D2.
**Evidence:** `.kiro/evidence/frontend-app/task-31-settings.log`

---

## Completion Criteria

All acceptance criteria green = spec closes at D5 (human used it):
- ACC-1 ✓ (Task 22) — Command Center walkthrough
- ACC-2 ✓ (Task 23) — Ask Cumplify query
- ACC-3 ✓ (Task 16) — HITL approval flow
- ACC-4 ✓ (Task 17) — Flagged HITL approval
- ACC-5 ✓ (Task 18) — Locale switch
- ACC-6 ✓ (Task 19) — Pseudo-locale CI check
- ACC-7 ✓ (Task 20) — Role gating
- ACC-8 ✓ (Task 24) — Pool A rejection
- ACC-9 ✓ (Task 21) — taskToken exclusion

**Blocked tasks (25–31) do not gate closure** if their acceptance criteria (ACC-2 for Ask Cumplify) can be proven via a minimal implementation or they are explicitly deferred to a follow-up. ACC-2 requires Task 25 — if owner designs are not delivered by closure time, ACC-2 becomes a named carry.
