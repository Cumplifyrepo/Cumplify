# Cumplify.ai — Kiro Kickoff Pack

**Document:** `kiro-kickoff-pack.md` · **v2.0** · 2026-07-01 (supersedes v1.0)
**Purpose:** The operational companion to the architecture corpus (spine + consolidated v7, Parts 0–46). Everything is copy-paste ready: repo scaffold, MCP config, steering files (full verbatim text for the six constitution files, generation prompt for the fifteen others), the eight agent hooks, and the prompt templates (A–I) for every stage of every spec. This file lives at the **repo root** and is the file the fire-up prompt reads first.

---

## STAGE 0 — Day-0 setup (30 minutes, one time)

```bash
mkdir cumplify && cd cumplify && git init
mkdir -p .kiro/steering .kiro/specs .kiro/hooks .kiro/settings docs/architecture docs/gates contracts infra services frontend
# docs/architecture/ ← the 7 spine docs + cumplify-CONSOLIDATED-master-architecture-v7-full.md
# this file (kiro-kickoff-pack.md) ← repo root
kiro .
```

**MCP config** — `.kiro/settings/mcp.json` (then enable MCPs in the Kiro panel):

```json
{
  "mcpServers": {
    "aws-docs":    { "command": "uvx", "args": ["awslabs.aws-documentation-mcp-server@latest"] },
    "aws-pricing": { "command": "uvx", "args": ["awslabs.aws-pricing-mcp-server@latest"] },
    "aws-api":     { "command": "uvx", "args": ["awslabs.aws-api-mcp-server@latest"],
                     "env": { "AWS_PROFILE": "cumplify-dev-readonly" } },
    "aws-diagram": { "command": "uvx", "args": ["awslabs.aws-diagram-mcp-server@latest"] }
  }
}
```

Commit everything. `.kiro/` and this pack are code — they always travel with the repo.

---

## STAGE 1 — Foundation steering

Click **Generate Steering Docs** in the Kiro panel (creates `product.md`, `tech.md`, `structure.md`), then immediately run:

> **PROMPT 1.1 — foundation steering rebuild**
> ```
> Read docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md
> (Parts 0, 4, 11, 26.1, 30, 43 and Appendices A/C/D/E/F/G/H) and
> docs/architecture/cumplify-architecture.md.
> Rewrite .kiro/steering/product.md, tech.md, and structure.md so that:
> - product.md summarizes Part 0 (the four planes), the personas (Part 13),
>   the two billing rails (Part 43–44), and the north-star metric
>   (time-to-first-sealed-audit-event).
> - tech.md lists ONLY the verified stack (Appendices A/C/D/E/F/G/H) with the
>   exact model IDs and cross-region profiles from Part 30, and states that no
>   service or model outside those appendices may be introduced.
> - structure.md documents the monorepo layout in Part 26.1 exactly.
> Keep each file under 80 lines. Do not invent anything not in the sources.
> ```

Review the three files by hand — they load into every conversation.

---

## STAGE 2 — The six constitution files (verbatim, hand-placed)

Create these exactly as written. Do not paraphrase, summarize, or "improve".

### 2a. `.kiro/steering/00-stack-facts.md`
```markdown
---
inclusion: always
---
# Verified Stack Facts (non-negotiable)
- Region: us-east-1 primary, us-west-2 DR. Accounts: dev 697114252993,
  staging 889007427685, prod 077405654066, pipeline in mgmt account 157082218687.
- Models (Part 30 Nova ladder ONLY): us.amazon.nova-micro-v1:0,
  us.amazon.nova-lite-v1:0, us.amazon.nova-pro-v1:0, us.amazon.nova-premier-v1:0.
  SOLE exception: LegalLedger uses us.anthropic.claude-sonnet-4-6 (quarterly-
  expiring justification, IAM-scoped to that one agent).
- Embeddings: amazon.titan-embed-text-v2:0, 1024 dimensions, everywhere.
- bedrock:InvokeModel IAM requires Resource:'*'. Action-group Lambdas need a
  resource-based policy for bedrock.amazonaws.com (SourceAccount + SourceArn).
- DynamoDB CumplifyCore: single table, PK/SK, on-demand, CMK (all 6 KMS
  actions), 9 GSIs. Tenant isolation: dynamodb:LeadingKeys +
  ForAllValues:StringLike on aws:PrincipalTag/tenantId.
- RDS = Aurora Serverless v2 PostgreSQL, RLS keyed to authorizer tenant claim.
- AWS Marketplace APIs (ResolveCustomer, GetEntitlements, BatchMeterUsage)
  are called from us-east-1 only, via the scoped integration role.
- If a fact is not in this file or Appendices A/C/D/E/F/G/H, verify via the
  aws-docs MCP before using it. Never guess service limits, prices, or APIs.
```

### 2b. `.kiro/steering/02-aoss-rule.md`
```markdown
---
inclusion: always
---
# The 45-Second Rule (OpenSearch Serverless)
AOSS is NextGen scale-to-zero: cold start up to 45 seconds.
EVERY data access to AOSS — Bedrock KB retrieval, semantic search resolver,
audit-trail retrieval — MUST implement application-side retry with exponential
backoff (base 500ms, factor 2, jitter, ceiling 45s) and a minimum 45-second
cold-start timeout budget. Any Lambda touching AOSS: timeout >= 60s.
Every spec, design doc, and code comment on an AOSS path restates this rule.
Code review: an unwrapped AOSS call is a blocking defect.
Why: without this, every scale-to-zero wake-up is a user-facing failure.
```

### 2c. `.kiro/steering/12-token-metering.md`
```markdown
---
inclusion: always
---
# One Door to Bedrock
No code may call bedrock-runtime directly. Every model invocation (agents,
Snapshot, editor AI, support bot) goes through the bedrock-invoker layer
(services/ai-invoker), which: attaches the tenant application inference
profile + Converse requestMetadata {tenantId, agent, module, feature},
pre-checks the Credit balance, applies prompt caching checkpoints, records
exact token counts post-call, and emits telemetry.credits.consumed.
Exception paths that NEVER block on credits: incident reporting, HITL approvals.
Why: this single choke point is the margin control (>50% net mandate, Part 27)
AND the localization point (Part 31) AND the cost-attribution point (Part 22)
AND the anti-hallucination enforcement point (Part 35).
A direct InvokeModel anywhere else fails review.
```

### 2d. `.kiro/steering/14-simplicity.md`
```markdown
---
inclusion: always
---
# Scope Discipline
- No AWS service, model, or third-party dependency outside tech.md and
  Appendices A/C/D/E/F/G/H. If a task seems to need one: STOP, flag it in the
  spec's Open Questions, do not implement.
- Prefer the existing pattern over a new one. If a steering file defines a
  pattern (idempotency, eventing, auth, caching), use it verbatim.
- Human-gated domains — never run autonomously, always propose + wait:
  SecurityStack, IAM policies, billing code (Stripe AND Marketplace),
  legal-consent flows, anything under services/audit-trail, metering jobs.
- Tests: follow 13-testing.md; keep tests proportional; do not generate
  speculative abstraction layers, config options, or TODO scaffolds nobody
  asked for.
- Every mutation names its audit event in design BEFORE implementation
  (evidence-first rule). Every clauseRef must exist in the canonical spine.
```

### 2e. `.kiro/steering/16-identity-boundaries.md`
```markdown
---
inclusion: always
---
# The Four Never-Cross Layers (Part 32)
Three Cognito pools: A=SaaS Admin (internal), B=Tenant Admin, C=Tenant User.
1. Token layer: each surface pins its expected issuer(s). Tenant app rejects
   Pool-A tokens with 401 BEFORE any role logic. Admin plane rejects B/C.
2. Claim layer: PreTokenGeneration (V1_0, ID token only) stamps
   poolClass: internal|tenant-admin|tenant-user; resolvers assert poolClass.
3. IAM layer: Pool-A roles carry explicit Deny on tenant-data paths unless an
   active break-glass grant tag is present; B/C have no admin-plane path.
4. Human layer: one email may exist in at most one pool per environment;
   nightly cross-pool duplicate job + alarm.
Break-glass = time-boxed, ticketed, tenant-notified, immutably logged.
Any code that would let one pool's identity act on another pool's surface is
a security defect regardless of role checks. Subscriptions always verify the
tenant claim. @aws_cognito = user-facing; @aws_iam = agent/service.
```

### 2f. `.kiro/steering/19-kiro-truth.md`
```markdown
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
```

### 2g. Generate the remaining fifteen

> **PROMPT 2.1 — bulk steering generation**
> ```
> Read docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md.
> Create these steering files in .kiro/steering/, each under 80 lines, each
> with EXACTLY the YAML frontmatter I specify, sourcing content ONLY from the
> parts named. Include a one-line "Why" per rule:
> - 01-tenancy-rules.md   (inclusion: always) ← Part 9 isolation table +
>   spine C.2
> - 03-auth-modes.md      (inclusion: fileMatch, fileMatchPattern:
>   "{**/*.graphql,services/api/**}") ← spine D.2 + Part 24.1
> - 04-immutability.md    (inclusion: fileMatch, fileMatchPattern:
>   "{services/audit-trail/**,**/*audit*}") ← spine E.1 + Part 18.2 ES-3/ES-4
> - 05-hitl.md            (inclusion: auto, description: "human-in-the-loop
>   approval flows, returnControl, agent mutations") ← spine B.1 +
>   agent-catalog HITL model + Part 35 Layer 5 card requirements
> - 06-cdk-conventions.md (inclusion: fileMatch, fileMatchPattern: "infra/**")
>   ← cdk-guidance.md §1 + §4; CDK Nag = fail; Graviton default; stack table
> - 07-events.md          (inclusion: fileMatch, fileMatchPattern:
>   "services/**") ← spine D.4 + module-spec Appendix B: bus name, event
>   naming, SQS+DLQ, FIFO-by-tenant
> - 08-legal-consent.md   (inclusion: fileMatch, fileMatchPattern:
>   "{services/legal/**,frontend/**signup**}") ← Parts 12.1, 21.2
> - 09-sod-rules.md       (inclusion: auto, description: "segregation of
>   duties, approver rules, auditor independence") ← Part 13.2
> - 10-eqms-musts.md      (inclusion: manual) ← Part 18 tables VERBATIM as
>   acceptance criteria
> - 11-soc2.md            (inclusion: always, under 40 lines) ← Part 23.1
>   summary + rule: every design.md fills a "SOC 2 impact" section
> - 13-testing.md         (inclusion: always, under 60 lines) ← Part 26.2:
>   test-first ordering, pyramid, tenant-isolation suite mandatory,
>   property-based tests on services/*, keep tests simple and proportional
> - 15-model-policy.md    (inclusion: always, under 30 lines) ← Part 30:
>   Nova ladder, LegalLedger exception, Model Justification Register rule
> - 17-i18n.md            (inclusion: fileMatch, fileMatchPattern:
>   "{frontend/**,services/ai-invoker/**}") ← Part 31: no hardcoded strings,
>   locale flows through the invoker, clause canon is language-invariant
> - 18-anti-hallucination.md (inclusion: always, under 45 lines) ← Part 38:
>   citation-or-silence; licensed uncertainty; retrieval-before-assertion;
>   record-writing paths non-streaming, schema-validated, temp <= 0.3;
>   grounding thresholds per Part 35; clause claims AR-checked against
>   clause-canon; no prompt/KB change merges without the AI-QA stage passing
> - 20-marketplace.md     (inclusion: fileMatch, fileMatchPattern:
>   "{services/marketplace/**,frontend/**billing**}") ← Part 46: activation
>   only after entitlement confirmation, never on token alone; hourly
>   metering with zero-usage records; final meter <= 1h on cancellation; one
>   rail per tenant, one writer per rail; price parity is a tested assertion;
>   no cross-rail promotion on Marketplace surfaces; Marketplace APIs from
>   us-east-1 via the scoped role
> After creating them, list every rule you were unsure about instead of
> guessing. Do NOT modify the six files placed by hand (00, 02, 12, 14, 16, 19).
> ```

---

## STAGE 3 — The eight agent hooks

Create via the Kiro panel (Agent Hooks → +) or as `.kiro/hooks/*.kiro.hook` files:

| Hook | Trigger | Instruction (paste as the hook prompt) |
|---|---|---|
| `test-sync` | fileSaved: `services/**/*.ts`, `infra/**/*.ts` | "Per 13-testing.md: create/update the paired test for the changed file, run it, report pass/fail verbatim. Keep tests simple and proportional." |
| `security-scan` | fileSaved: `**/iam*`, `**/*policy*`, `**/auth*`, `infra/**/security*` | "Review the change against 01-tenancy-rules, 03-auth-modes, 16-identity-boundaries, 11-soc2. Report findings by severity CRITICAL/HIGH/MEDIUM/LOW with exact locations and fixes. Do not auto-fix; propose." |
| `cost-check` | fileSaved: `infra/**` | "Identify added/modified/removed resources. Use the aws-pricing MCP to estimate the monthly cost delta. Append to infra/cost-estimates.md. FLAG LOUDLY if delta > $200/mo (Part 27 tripwire)." |
| `spec-drift` | postTaskExecution | "Verify the just-completed task's acceptance criteria still hold against the actual diff. If code and spec diverged, open a refresh note in the spec folder and mark the task for review. If the change touches services/ai-invoker/**, prompts/**, or KB ingestion configs: also require the clause-accuracy and grounding-adversarial suites to run against staging before the task may close." |
| `clause-integrity` | fileSaved: `**/*.ts`, `**/*.sql`, `**/*.md` containing `clauseRef` | "Validate every clauseRef value against the canonical clause list in docs/architecture/iso-requirements-map.md (numbers AND titles, edition-aware per Part 33). Any invented or mistitled clause is a CRITICAL finding." |
| `verify-evidence` | postTaskExecution | "Run the Layer-2 execution gate in order (npm ci → tsc --noEmit → lint → unit+property tests → cdk synth --all + CDK Nag → module integration tests). Write full output to .kiro/evidence/<spec>/<task>.log. If any step fails, mark the task NOT complete, report the verbatim failure, and stop. Do not summarize failures as partial successes." |
| `deploy-readback` | manual (run after each dev deploy; also a pipeline post-deploy step) | "Execute infra/readback tests against the dev account via aws-api MCP creds. Report each assertion pass/fail with the observed value next to the designed value. Any mismatch is a defect on the deploying spec." |
| `dod-gate` | preTaskExecution on tasks named `close:*` or phase-gate tasks | "Before executing, enumerate the D-rung evidence required (Part 40 table) and verify each artifact exists. Refuse to proceed with missing evidence; list exactly what's missing." |

---

## STAGE 4 — Prompt templates A–I (every spec cycles A→B→C→D; E–I situational)

### TEMPLATE A — spec kickoff (requirements)
> ```
> Start a new spec named <spec-name> using the Requirements-First workflow.
> Do NOT use Quick Plan.
> Source of truth: docs/architecture/cumplify-CONSOLIDATED-master-architecture
> -v7-full.md <Parts X, Y> and docs/architecture/<spine-doc> <sections>.
> Scope: <one-paragraph scope from the spec inventory row>.
> Out of scope: <adjacent specs' territory — name them>.
> Write requirements.md as user stories with EARS acceptance criteria.
> Import verbatim as acceptance criteria: <e.g. "#10-eqms-musts rows DC-1..8" /
> "Part 23.1 rows CC6" / "Part 43.3 rules 1–5">.
> Every requirement touching AOSS restates the 45-second rule.
> End with an Open Questions section — flag, don't guess.
> ```

### TEMPLATE B — mandatory analysis gate
> ```
> Run Analyze Requirements on #spec:<spec-name>. This project is
> compliance-sensitive: treat every ambiguity, conflicting constraint, and gap
> as blocking. List each finding with your proposed resolution and WAIT for my
> approval before touching design.
> ```

### TEMPLATE C — design phase
> ```
> Proceed to design.md for #spec:<spec-name>. Requirements approved <date>.
> The design MUST include: 1) architecture & data flow (mermaid), citing the
> steering rules it exercises by filename; 2) contracts consumed/produced
> (GraphQL, OpenAPI, event names → update contracts/); 3) data model changes
> with tenant-isolation statement; 4) audit events emitted (evidence-first);
> 5) SOC 2 impact (11-soc2.md); 6) cost impact (aws-pricing MCP, monthly
> delta); 7) failure modes, retry/DLQ story, and the rollback move (Part 41).
> Do not generate tasks yet.
> ```

### TEMPLATE D — tasks + execution
> ```
> Requirements and design for #spec:<spec-name> are approved. Generate
> tasks.md: discrete tasks traceable to requirement numbers, each with its own
> acceptance check and declared D-rung (Part 40: backend >= D3, user-facing
> >= D5), tests included per 13-testing.md. Mark tasks in human-gated domains
> (14-simplicity.md) as REQUIRES-HUMAN — proposed as diffs only.
> Then: Run all Tasks. Pause at the end of each dependency wave for my review.
> ```

### TEMPLATE E — sync / drift repair (after ANY manual change)
> ```
> I made manual changes outside this session: <what/where>. Refresh
> #spec:<spec-name>: back-port the changes into requirements/design/tasks so
> the spec matches reality, and list anything the change broke against the
> acceptance criteria.
> ```

### TEMPLATE F — task closure with evidence
> ```
> #spec:<name> close task <n.m>. Declare its D-rung. Run the verify-evidence
> gate and attach the log path. If the rung is D3+, run deploy-readback and
> paste the assertion table. State any assertion you could NOT verify and why.
> Only then mark the checkbox.
> ```

### TEMPLATE G — D5 human-readiness package
> ```
> #spec:<name> prepare the D5 package for <feature>: (1) a UAT script a
> non-engineer can follow cold — numbered steps, expected result per step, in
> EN/ES/PT; (2) the empty/error/loading-state inventory with screenshots;
> (3) the telemetry events this flow must fire and how I verify them in
> Athena; (4) the rollback move. Do not claim D5 — a human executes the script
> and reports back.
> ```

### TEMPLATE H — hallucination audit (once per phase)
> ```
> Select 3 random completed tasks from this phase. For each: rerun its
> evidence gate from scratch, re-execute its readback assertions, and attempt
> one falsification (break the thing its test claims to protect and confirm
> the test catches it). Report honestly — a failed audit is a CRITICAL finding
> on our own process.
> ```

### TEMPLATE I — live-readiness review (per phase gate, D6)
> ```
> For every user-facing spec in phase <N>: confirm the AppConfig flag exists
> with its exposure ladder; canary deployment config + rollback alarms wired;
> the CloudWatch Synthetics journey covering it is green 24h against
> tenant-zero; runbook entry written; unit-cost delta logged. Produce the D6
> evidence table for the gate report in docs/gates/.
> ```

### Phase-gate prompt (end of each phase P0–P4)
> ```
> Create a small spec named phase-<N>-gate. Its requirements are the
> phase-exit checklist from Part 11.3 PLUS: forced AOSS cold-start test
> passing in staging; cross-tenant denial suite green; every mutation path
> shows its sealed audit event; CDK Nag clean; cost-estimates.md reviewed
> against Part 27 tripwires; all phase specs drift-free; Template H executed;
> Template I evidence table complete for user-facing specs. Execute it and
> produce a signed-off gate report in docs/gates/.
> ```

---

## STAGE 5 — Concrete P0 kickoff (paste in order)

**5.1 — Spec 38 `build-verification-harness` FIRST** (the harness exists before the first real task closes — Part 42.4):

> ```
> Start a new spec named build-verification-harness (Requirements-First, no
> Quick Plan). Source: consolidated Parts 39, 40, 42.
> Scope: the evidence-gate script (the ordered Layer-2 command chain writing
> .kiro/evidence/<spec>/<task>.log), the infra/readback test framework and its
> first assertion set (Part 39 Layer-3 table), property-based test scaffolding
> for services/*, and wiring the verify-evidence / deploy-readback / dod-gate
> hooks to these scripts.
> Out of scope: any product code; the live-testing plane (spec 39).
> Acceptance criteria: a deliberately broken sample task fails the evidence
> gate with verbatim output; a deliberately mis-deployed sample resource fails
> readback with observed-vs-designed values shown.
> ```

**5.2 — Spec 1 `platform-foundation`:**

> ```
> Start a new spec named platform-foundation (Requirements-First, no Quick
> Plan). Source: consolidated Parts 4, 9, 11, 32; cdk-guidance.md §1–§2.
> Scope: the CDK app skeleton + pipeline (mgmt account, crossAccountKeys:true,
> selfMutation, dev→staging→prod stages), NetworkStack (VPC, endpoints incl.
> S3/DynamoDB gateway endpoints, ZERO NAT gateways), SecurityStack (10 CMKs,
> WAF ACLs, Secrets), DataStack (CumplifyCore TableV2, Aurora Serverless v2
> with auto-pause 0 ACU on dev/staging, ElastiCache, AOSS collection + its 3
> policies, S3 Object Lock buckets), IdentityStack (3 pools A/B/C with app
> clients and PreTokenGeneration stub).
> Out of scope: eventing (spec 2), audit-trail logic (spec 5), pool hardening
> (identity-3pool-hardening), any application code.
> Import verbatim: 00-stack-facts.md as constraints; CDK Nag = failure;
> account IDs. Every AOSS-touching requirement restates the 45-second rule.
> All SecurityStack tasks are REQUIRES-HUMAN. Every infra task closes via
> Template F at D3 (deployed to dev + readback green).
> ```

**5.3 — Spec 2 `eventing-backbone`** (after spec 1's DataStack contracts exist):

> ```
> Start a new spec named eventing-backbone (Requirements-First, no Quick Plan).
> Source: spine D.4, module-spec.md Appendix B, steering 07-events.md.
> Scope: EventBridge bus cumplify-events, the SQS queue topology with DLQs
> (FIFO with messageGroup=tenantId for CAPA lifecycle + audit sink), rules,
> the event-taxonomy registry at contracts/events.md (every later spec appends
> to it), Powertools-based publisher/consumer library in services/eventing.
> Out of scope: consumer business logic; the audit-trail sealer (spec 5);
> Marketplace lifecycle events (spec 40 adds its rule + queue later).
> Acceptance: a demo event round-trips bus→queue→consumer→DLQ-on-poison in
> dev, evidenced per Template F.
> ```

**5.4 — Spec 5 `immutable-trail`:**

> ```
> Start a new spec named immutable-trail (Requirements-First, no Quick Plan).
> Source: spine C.2 + E.1, Part 18.2 rows ES-3/ES-4/ES-5, steering
> 04-immutability.md.
> Scope: appendAuditEvent path (PutItem attribute_not_exists(pk)), hash chain
> (payloadHash/prevHash), IAM writer role with NO Update/Delete on AUDITLOG
> items, DynamoDB Streams → WORM sealer Lambda → S3 Object Lock COMPLIANCE,
> daily chain-verification job, audit-trail retrieval Lambda over the AOSS
> index (45-second rule).
> Acceptance: (1) a tamper attempt on any sealed or chained item is detected
> by the verification job; (2) UpdateItem on an AUDITLOG item with the writer
> role is denied by IAM (readback-proven); (3) end-to-end synthetic event →
> chained item → sealed S3 object with retention, demonstrated in dev.
> IAM and sealer code REQUIRES-HUMAN throughout.
> ```

**5.5 —** Run the Phase-gate prompt for P0.

---

## STAGE 6 — Cadence rules from P1 onward

- **Parallelism:** max 2–3 specs in flight. P1 opens with `model-policy-evals`
  + `api-core` (models and contracts gate everything), then
  `agents-existing-8`, `guardrails-antihallucination` (no agent ships
  unguarded), `frontend-app`, `cost-governance`, `genai-observability`,
  `ai-qa-evaluations`; **spec 41 `marketplace-listing-ops` FTR work also runs
  in P1** (8-week lead back-planned from the P2 launch).
- **P2 launch gates:** signup-legal-gate, trial-v2-token-gated,
  ai-token-metering, growth-snapshot, frontend-funnel, tenant-lifecycle,
  identity-3pool-hardening, billing-entitlements, **marketplace-integration
  (spec 40)**, soc2-evidence-fabric (security core), live-testing-plane
  (flags/canaries/tenant-zero), i18n-trilingual, support-connect (chat),
  anti-abuse, legal-consent. Launch day = both front doors open.
- **Chat discipline:** work inside spec context (`#spec:<name> implement task
  3.2`); reference `#10-eqms-musts` manually in document-control/Forms
  sessions; never loose vibe prompts against spec-owned files.
- **Interface split:** IDE for feature work; Kiro CLI in CI for
  lint-the-specs jobs; Kiro web autonomous sessions ONLY for docs/test
  backfills — never SecurityStack, billing (either rail), legal, audit-trail,
  or metering.
- **Weekly ritual (15 min):** Template E across active specs; skim
  cost-estimates.md against Part 27 tripwires; check Model Justification
  Register expiry; glance at grounding-SLO and DLQ dashboards.

---

## Appendix — Situational prompt library

| Situation | Prompt |
|---|---|
| Kiro proposes an out-of-stack service | `Per 14-simplicity.md this service is out of scope. Add it to the spec's Open Questions with your justification and continue with an in-stack alternative.` |
| Model creep check | `Audit the repo for any bedrock model ID outside the Nova ladder in 15-model-policy.md. Report violations with file:line. LegalLedger's boundary is the sole allowed Sonnet reference.` |
| New ISO edition lands (Part 33) | `Start spec standards-edition-<std>-<yyyy>: ingest the new edition into the versioned canon per Part 33, produce the old→new delta map, and update clause-integrity validation to be edition-aware.` |
| Onboarding a second engineer | `Give me a guided tour of this codebase using only .kiro/steering and .kiro/specs as sources. Where the answer to a "why" isn't in steering, list it — those gaps become steering additions.` |
| Pre-launch legal sweep | `#spec:signup-legal-gate verify every consent event field in Part 21.2 is captured and hash-chained; produce the evidence walkthrough a lawyer would ask for.` |
| Marketplace pre-flight | `#spec:marketplace-integration run the full test-product matrix from Part 44.5 against staging and produce the evidence table; confirm the price-parity CI assertion is green and the 1-hour final-meter path fired in the cancellation test.` |

---

*This pack (repo root) + the architecture corpus in docs/architecture/ is the complete handoff. First keystroke: Stage 0.*
