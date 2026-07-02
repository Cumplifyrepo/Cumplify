---
inclusion: always
---
# Repository Structure — Cumplify.ai

Monorepo, single CDK app (spine pipeline rule). Layout from Part 26.1:

```
cumplify/
├── .kiro/
│   ├── steering/          # Constitution files (always-loaded + conditional)
│   ├── specs/             # One folder PER spec from the inventory
│   │   ├── platform-foundation/
│   │   │   ├── requirements.md
│   │   │   ├── design.md
│   │   │   └── tasks.md
│   │   ├── eventing-backbone/...
│   │   └── ... (specs 1–41)
│   ├── hooks/             # Agent hooks (quality gates)
│   │   └── *.kiro.hook
│   ├── settings/
│   │   └── mcp.json       # MCP server configuration
│   └── evidence/          # Execution evidence logs per spec/task
│       └── <spec>/<task>.log
├── docs/
│   ├── architecture/      # The architecture corpus (spine + v1–v7 consolidated)
│   └── gates/             # Phase-gate reports
├── contracts/             # OpenAPI, GraphQL schema, event taxonomy
├── infra/                 # CDK stacks (single app, multi-stage pipeline)
│   ├── bin/               # CDK app entry point
│   ├── lib/               # Stack definitions
│   │   ├── network-stack.ts
│   │   ├── security-stack.ts
│   │   ├── data-stack.ts
│   │   ├── identity-stack.ts
│   │   ├── eventing-stack.ts
│   │   ├── api-stack.ts
│   │   ├── ai-stack.ts
│   │   ├── compute-stack.ts
│   │   ├── edge-stack.ts
│   │   ├── growth-stack.ts
│   │   ├── billing-stack.ts
│   │   ├── lifecycle-stack.ts
│   │   ├── analytics-stack.ts
│   │   └── pipeline-stack.ts
│   ├── readback/          # Deployed-truth readback test scripts
│   └── cost-estimates.md  # Running cost delta log
├── services/              # Backend service code (Lambda handlers, shared libs)
│   ├── ai-invoker/        # The ONE door to Bedrock (12-token-metering.md)
│   ├── eventing/          # Powertools publisher/consumer library
│   ├── audit-trail/       # Append-only + hash chain + WORM sealer
│   ├── marketplace/       # AWS Marketplace integration Lambdas
│   └── ...                # Module-specific services
├── frontend/              # Next.js application (Amplify Hosting)
│   ├── src/
│   ├── public/
│   └── ...
└── prompts/               # Agent prompt templates and KB ingestion configs
```

## Conventions
- Every spec lives in `.kiro/specs/<spec-name>/` with requirements.md,
  design.md, and tasks.md committed as code.
- Specs and code merge together in the same PR; spec drift is review-blocking.
- `contracts/` is the single source of truth for API shapes and event schemas.
- `infra/cost-estimates.md` is updated by the cost-check hook on every infra change.
- Evidence logs at `.kiro/evidence/<spec>/<task>.log` are the proof of completion.
