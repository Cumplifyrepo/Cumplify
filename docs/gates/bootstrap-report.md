# Bootstrap Report — Cumplify.ai Repo Initialization

**Date:** 2026-07-02
**Branch:** develop
**Commits:** 11 (67d1977 → 4f81da9)
**Stages completed:** 0 (scaffold), 1 (foundation steering), 2 (constitution + 15 generated steering), 3 (agent hooks)

---

## A. Full File Manifest

### Architecture corpus (docs/architecture/) — 10 files
| Path | Description |
|---|---|
| `docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md` | Single-file merge of v1–v7 master architecture |
| `docs/architecture/cumplify-architecture.md` | Backend spine (services, data, auth, agents) |
| `docs/architecture/cumplify-e2e-architecture-v7-extensions.md` | v7 Marketplace extensions (standalone) |
| `docs/architecture/module-spec.md` | M1–M13 module specifications + Appendix B events |
| `docs/architecture/agent-catalog.md` | 22-agent roster with HITL model |
| `docs/architecture/cdk-guidance.md` | CDK construct recommendations + pipeline |
| `docs/architecture/iso-coverage-matrix.md` | 79 sub-clauses × module × agent mapping |
| `docs/architecture/iso-requirements-map.md` | Canonical clause lists (9001/14001/45001) |
| `docs/architecture/gap-and-opportunity-matrix.md` | CertifyAero gap analysis |
| `docs/architecture/competitive-analysis.md` | CertifyAero competitive intelligence |

### Steering files (.kiro/steering/) — 21 files
| Path | Inclusion | Source |
|---|---|---|
| `00-stack-facts.md` | always | Hand-placed verbatim from corrected pack |
| `01-tenancy-rules.md` | always | Generated from Part 9 + spine C.2 |
| `02-aoss-rule.md` | always | Hand-placed verbatim |
| `03-auth-modes.md` | fileMatch `{**/*.graphql,services/api/**}` | Generated from spine D.2 + Part 24.1 |
| `04-immutability.md` | fileMatch `{services/audit-trail/**,**/*audit*}` | Generated from spine E.1 + Part 18.2 |
| `05-hitl.md` | auto | Generated from spine B.1 + agent-catalog + Part 35 |
| `06-cdk-conventions.md` | fileMatch `infra/**` | Generated from cdk-guidance §1 + §4 |
| `07-events.md` | fileMatch `services/**` | Generated from spine D.4 + module-spec App. B |
| `08-legal-consent.md` | fileMatch `{services/legal/**,frontend/**signup**}` | Generated from Parts 12.1, 21.2 |
| `09-sod-rules.md` | auto | Generated from Part 13.2 |
| `10-eqms-musts.md` | manual | Generated from Part 18 (verbatim criteria) |
| `11-soc2.md` | always | Generated from Part 23.1 |
| `12-token-metering.md` | always | Hand-placed verbatim |
| `13-testing.md` | always | Generated from Part 26.2 |
| `14-simplicity.md` | always | Hand-placed verbatim |
| `15-model-policy.md` | always | Generated from Part 30 |
| `16-identity-boundaries.md` | always | Hand-placed verbatim |
| `17-i18n.md` | fileMatch `{frontend/**,services/ai-invoker/**}` | Generated from Part 31 |
| `18-anti-hallucination.md` | always | Generated from Parts 35/38 |
| `19-kiro-truth.md` | always | Hand-placed verbatim |
| `20-marketplace.md` | fileMatch `{services/marketplace/**,frontend/**billing**}` | Generated from Part 46 |
| `product.md` | always | Generated (foundation) |
| `structure.md` | always | Generated (foundation) |
| `tech.md` | always | Generated (foundation) |

### Agent hooks (.kiro/hooks/) — 8 files
| Path | Trigger | Matcher |
|---|---|---|
| `test-sync.json` | PostFileSave | `^(services\|infra)/.*\.ts$` |
| `security-scan.json` | PostFileSave | `(^\|/)(iam\|auth)\|policy\|infra/.*security` |
| `cost-check.json` | PostFileSave | `infra/` |
| `spec-drift.json` | PostTaskExec | (all tasks) |
| `clause-integrity.json` | PostFileSave | `\.(ts\|sql\|md)$` |
| `verify-evidence.json` | PostTaskExec | (all tasks) |
| `deploy-readback.json` | PostTaskExec | (all tasks; early-exit if no deploy) |
| `dod-gate.json` | PreTaskExec | (all tasks; early-exit if not close:*/phase-gate) |

### Configuration & infrastructure
| Path | Description |
|---|---|
| `.kiro/settings/mcp.json` | 4 MCP servers (aws-docs, aws-pricing, aws-api, aws-diagram) |
| `.kiro/evidence/README.md` | Evidence directory conventions |
| `.kiro/specs/.gitkeep` | Placeholder for spec folders |
| `kiro-kickoff-pack.md` | Operational companion (repo root) |
| `contracts/.gitkeep` | Future: OpenAPI, GraphQL, event taxonomy |
| `infra/.gitkeep` | Future: CDK stacks |
| `services/.gitkeep` | Future: backend service code |
| `frontend/.gitkeep` | Future: Next.js app |
| `docs/gates/.gitkeep` | Future: phase-gate reports |

---

## B. Uncertainties Flagged Across All Stages — Resolution Status

| # | Uncertainty | Stage | Resolution |
|---|---|---|---|
| 1 | Titan embed-text-v2:0 dimensions: corpus said 1536, AWS docs say 1024 max | Stage 1 | **Resolved.** aws-docs MCP verified 1024 (default), 512, 256. Corpus corrected at source (6 files). |
| 2 | EventBridge bus name: spine said `cumplify-ims`, module-spec/kickoff said `cumplify-events` | Stage 2 Prompt 2.1 | **Resolved.** Corpus precedence (v7 > spine). Spine corrected at source. |
| 3 | NCTriage model: agent-catalog says Nova Lite, Part 30.1 says Nova Micro duty class | Stage 1 | **Resolved.** Corpus precedence (v4 > spine): NCTriage → Nova Micro. Documented in tech.md. |
| 4 | RecordsVault HITL for sealing | Stage 2 Prompt 2.1 | **Resolved by reviewer.** Sealing = automated (append-only); retention-schedule changes → Quality Manager approval. |
| 5 | Trial length (7 vs 14 days) | Stage 2 Prompt 2.1 | **Resolved.** Part 29 (v4) supersedes Part 21 (v3): 14 days. Omitted from steering (spec-level requirement, not constitution). |
| 6 | Part 18.3/18.4 scope in 10-eqms-musts.md | Stage 2 Prompt 2.1 | **Resolved by reviewer.** §18.3 training-linkage "launch requirement" and vendor-maintained validation pack restored. §18.4 anchored in 11-soc2.md instead. |

---

## C. Gaps Between Kickoff Pack and Execution

| # | Gap | Impact | Mitigation |
|---|---|---|---|
| 1 | **Hook file format:** Pack assumed `.kiro/hooks/*.kiro.hook`; Kiro's `createHook` tool produces `.kiro/hooks/*.json` (v1 JSON schema). | Low — functional difference is zero; the runtime reads `.json` files. | `structure.md` updated to document `*.json` with explanatory note. |
| 2 | **Hook trigger: `manual`** not available in schema. Pack specifies `deploy-readback` as manual + pipeline step. | Medium — hook fires on every PostTaskExec instead of on-demand. | Early-exit guard: "If no cdk deploy in evidence log, skip." Pipeline integration deferred to spec 38 (`build-verification-harness`) as a post-deploy script. |
| 3 | **Hook trigger: PreTaskExec cannot filter by task name.** Pack specifies `dod-gate` on `close:*` or phase-gate tasks only. | Low — hook fires on all task starts but self-skips via prompt guard. | Early-exit guard: "If not close:*/phase-gate, reply skipped." |
| 4 | **Hook matcher: content-based filtering** not available. Pack specifies `clause-integrity` on files "containing clauseRef". | Low — fires on all .ts/.sql/.md saves; prompt self-skips if no clauseRef. | Early-exit guard: "If no clauseRef occurrence, do nothing and stop." |
| 5 | **Pipeline readback integration** not expressible as IDE hook. | None for now — this is a CI/CD concern. | Deferred to spec 38 (`build-verification-harness`): post-deploy shell step in CDK pipeline. |
| 6 | **Part 18.4 anchoring:** The pack's `10-eqms-musts.md` does not contain §18.4 (Cumplify's own QMS). | Low — content is captured. | Anchored in `11-soc2.md` instead (Cumplify's own posture line). |
| 7 | **Corpus corrections made at source:** | — | Two corrections applied to architecture docs in-repo and at archive: (a) Titan embed dimensions 1536 → 1024 (6 files), (b) spine bus name `cumplify-ims` → `cumplify-events` (1 file). Both verified via MCP/precedence before application. |

---

## D. Human-Side Actions Required

### Immediate (machine-side, before spec 38)
- **MCP enablement:** Open Kiro panel → enable the 4 MCP servers (aws-docs,
  aws-pricing, aws-api, aws-diagram). The aws-api server uses the verified
  `cumplify-dev-readonly` profile (read-only, dev account only).
- **Bedrock model access:** Ensure the following models are enabled in
  us-east-1 (and us-west-2 for DR) on the dev account:
  - `amazon.nova-micro-v1:0`
  - `amazon.nova-lite-v1:0`
  - `amazon.nova-pro-v1:0`
  - `amazon.nova-premier-v1:0`
  - `anthropic.claude-sonnet-4-6` (cross-region profile `us.anthropic.claude-sonnet-4-6`)
  - `amazon.titan-embed-text-v2:0`

### P0 priority
- **APN partner account + Marketplace seller registration** (Strivana Com LLC;
  tax/banking setup). Required before FTR submission in P1.
- **AWS Activate application** (startup credits against ~$4.5k/mo base).
  Submit before prod spend ramps.

### Pre-P2 (before public launch)
- **ISO standard translation licensing** — official ES/PT translations of
  ISO 9001/14001/45001 for the multilingual ISO-KB. Licensed publications;
  procurement lead time.

### Pre-GA
- **Delaware counsel** to finalize the 9-instrument legal document stack
  (ToS, EULA, AI Output Terms, AUP, Privacy Policy, DPA, SLA, Affiliate
  Agreement, Beta/Trial Terms). Architecture is built so their edits are
  config, not code.
- **Trademark filings** for "Cumplify" word + logo (pre-GA timing).
- **Tech E&O + Cyber insurance** sized at Enterprise-tier contract values.

---

## E. Commit History

```
4f81da9 Stage 3 amendment: early-exit guards, tighter matchers, structure.md hook format fix
2976aac Stage 3: eight agent hooks per kickoff pack table
1c66e26 Corpus correction: spine bus name cumplify-ims → cumplify-events
ae1cf98 Stage 2g amendments: corpus-fidelity fixes from three-way review
1140903 Stage 2 Prompt 2.1: generate fifteen steering files from architecture corpus
aa7182e Stage 2: place six constitution files verbatim from corrected kickoff pack
0b8e9dc tech.md: resolve Titan dimension open question (corpus corrected, verified)
e4ca279 Corpus correction: Titan embed-text-v2 dimensions 1536 → 1024
c89834c Stage 1 amendment: add Domain Gurus + NCTriage resolution, compute/edge stacks
5aa4cbd Stage 1: foundation steering files (product.md, tech.md, structure.md)
67d1977 Stage 0: Day-0 monorepo scaffold, architecture docs, MCP config, kickoff pack
```

---

## F. Next Session

Spec 38 `build-verification-harness` — the evidence-gate script, readback
test framework, property-based test scaffolding, and wiring the
verify-evidence / deploy-readback / dod-gate hooks to executable scripts.
This spec exists before the first real task closes (Part 42.4).

---

*End of bootstrap report. The repo is ready for spec-driven development.*
