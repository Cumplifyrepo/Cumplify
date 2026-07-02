# Execution Evidence Directory

This directory holds proof-of-completion logs for spec tasks. It is the
enforcement point for `19-kiro-truth.md` rule 2: "Tests pass" means the
evidence log exists from a run executed this session.

## Structure

```
.kiro/evidence/
└── <spec-name>/
    └── <task-id>.log    # full stdout/stderr from the verify-evidence gate
```

## What goes here

Each `.log` file is the verbatim, unedited output of the Layer-2 execution
gate (the `verify-evidence` hook):

1. `npm ci`
2. `tsc --noEmit`
3. `lint`
4. `unit + property tests`
5. `cdk synth --all` + CDK Nag
6. Module integration tests

If any step fails, the log captures the failure verbatim and the task
remains NOT complete.

## Rules

- Logs are append-only within a session. Never delete or edit a log to
  make a task appear complete.
- A task may only be marked complete when its log exists AND shows all
  steps passing.
- Deploy-readback evidence (observed-vs-designed assertion tables) is
  appended to the same task log after a successful deployment.
- D-rung evidence (Part 40) references these logs. The `dod-gate` hook
  checks for their existence before allowing close:* tasks to proceed.

## Retention

Evidence logs are committed to the repo alongside the spec they belong to.
They travel with the code and are available for audit, review, and the
hallucination-audit process (Template H).
