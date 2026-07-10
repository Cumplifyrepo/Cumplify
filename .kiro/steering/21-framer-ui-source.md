---
inclusion: fileMatch
fileMatchPattern: "{frontend/**,scripts/verify-framer.mjs}"
---
# Framer Is the UI Design Source of Truth
The SaaS UI is designed in Framer, project "Spora (copy)"
(FRAMER_PROJECT_URL in .env). frontend/ is still empty — UI implementation
work should read the Framer project as the design source, not invent layout.

## Access
- Framer's official Server API (open beta, launched 2026-02-12) is used via
  the `framer-api` npm package — already a dependency. No official Framer
  MCP server exists; do NOT add "framer" to .kiro/settings/mcp.json. Call
  the SDK directly from scripts/agent code instead.
- Credentials live in .env (git-ignored): FRAMER_API_KEY, FRAMER_PROJECT_URL.
  Never hardcode the key or commit it — .env is the only place it belongs.
- Connect pattern:
  ```js
  import { connect } from "framer-api"
  const framer = await connect(process.env.FRAMER_PROJECT_URL, process.env.FRAMER_API_KEY)
  const info = await framer.getProjectInfo()
  await framer.disconnect()
  ```
  Run with `node --env-file=.env <script>` — no dotenv package needed (Node 22).
- scripts/verify-framer.mjs is a working connectivity smoke test — confirmed
  live 2026-07-08 (`getProjectInfo` returns id/name/apiVersion1Id).

## Constraints
- The Server API is a stateful WebSocket session — always `disconnect()` or
  the script hangs.
- Beta API surface: expect method names/shapes to shift; re-verify against
  scripts/verify-framer.mjs before relying on a new call in a spec.
- Why: this is the only sanctioned path from a Framer design to Cumplify's
  React frontend — skipping it means UI specs drift from the actual design.
