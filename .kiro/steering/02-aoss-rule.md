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
