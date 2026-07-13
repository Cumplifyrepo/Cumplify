# Task 21 — ACC-9: taskToken Exclusion — witnessed 2026-07-13 12:35Z

**Executed:** architect, dev 697114252993, real Pool-B QM token over the wire.

1. **Network traces:** fresh listPendingHitlItems capture (1 pending item) plus
   every ACC-3/ACC-4 capture from this acceptance campaign (list responses with
   3 items incl. full guardrailEvidence, 4 approval mutation responses, live WSS
   subscription frames): `grep taskToken` → **zero occurrences** in every body.
2. **Live schema introspection** (deployed AppSync API, __schema query):
   91 types scanned, fields + inputFields — **no field named taskToken in any
   type** (case-insensitive).
3. **Source schema.graphql:** `taskToken` absent entirely (BC-8 comment lives in
   design.md/resolver code, not the SDL).

BC-8 holds: the token exists only on the DDB item (server-side), read exclusively
by the approval Lambda. ACC-9 PASS.
