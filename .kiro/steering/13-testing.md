---
inclusion: always
---
# Testing Rules (Part 26.2)
Without an explicit testing steering file, the build agent defaults tests to
last and over-engineers them. These rules prevent both failure modes.

## Test-first ordering
Tests are written BEFORE or ALONGSIDE the implementation code, never after.
A task that produces code without its paired test is incomplete.

## The pyramid
1. Unit tests: fast, isolated, mock external services. Cover business logic,
   transformers, validators, permission checks.
2. Property-based tests: mandatory on `services/*` code. Use fast-check
   or equivalent.
3. Integration tests: per-module, against real AWS services in dev account.
   Use LocalStack where applicable; real dev account for IAM/KMS/AOSS
   semantics. Cover the happy path + at least one failure/retry path.
4. Tenant-isolation suite: MANDATORY in CI. For every data path, assert that
   Tenant-A cannot read/write Tenant-B's data. A missing denial test is a
   review-blocking defect.

## Keep it simple
- Tests are proportional to the code they protect. Do not generate speculative
  abstraction layers, config options, or TODO scaffolds nobody asked for.
- Prefer concrete assertions over generic parametric frameworks.
- Test names describe the behavior, not the implementation.

## What "passes" means
"Tests pass" = the evidence log at `.kiro/evidence/<spec>/<task>.log` exists
from a run executed this session (19-kiro-truth.md rule 2). Never mark a task
complete without executed evidence.

## CI gate (verify-evidence hook)
Ordered: npm ci → tsc --noEmit → lint → unit+property tests → cdk synth +
CDK Nag → module integration tests. Any step failure = task NOT complete.

## Anti-patterns
- Deleting or loosening a test to make it pass = the one unforgivable move.
- Mocking the thing you're supposed to test (e.g., mocking RLS when testing
  tenant isolation).
- Tests that pass regardless of input (tautological assertions).
