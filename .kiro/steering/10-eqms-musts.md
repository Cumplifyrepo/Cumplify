---
inclusion: manual
---
# Platform eQMS Requirements (Part 18 — verbatim acceptance criteria)

## Document Control (ISO 7.5.1–7.5.3, all three standards)
| # | MUST | Acceptance test |
|---|---|---|
| DC-1 | Single source of truth; current-version-only visible in operational contexts | Obsolete version unreachable from operator views; retrievable only in history |
| DC-2 | Full version control with change summaries; prior versions retained | Diff any two versions; supersede chain intact |
| DC-3 | Configurable approval workflows: sequential, parallel, conditional; auto-escalation on overdue | Route matrix test incl. escalation timer firing |
| DC-4 | Controlled distribution with read-acknowledgment; re-ack forced on revision | Publish rev B → affected users flip to unacknowledged + training task created |
| DC-5 | Author ≠ approver (SoD) | Self-approval hard-blocked |
| DC-6 | Controlled print/copy: stamped exports, on-demand complete copies for auditors | Export carries stamps + fingerprint |
| DC-7 | Retention schedules & disposition per record class; disposition logged; legal hold freeze | Hold blocks disposition job; release resumes |
| DC-8 | External-origin documents identified and controlled | Filterable register of external docs |

## Electronic Signatures & Record Integrity (Part 18.2)
| # | MUST | Acceptance test |
|---|---|---|
| ES-1 | Unique user identification + re-auth/MFA step-up at signing | Cognito re-auth challenge fires on sign action |
| ES-2 | Signature manifestation: signer name, date/time, meaning rendered on record | Signature block displays authored/reviewed/approved |
| ES-3 | Signature cryptographically bound to record version | Signature event carries docVersionHash; enters hash chain |
| ES-4 | Secure, time-stamped audit trail protected from alteration including by admins | Append-only IAM + hash chain + Object Lock COMPLIANCE |
| ES-5 | Human-readable + electronic copies producible for inspection | Audit-trail export + record bundles |

## System-level obligations
- Access control: role-based least privilege incl. read-only on approved docs.
- Training linkage: competence records (M13) bound to document revisions
  (DC-4). System flags untrained-on-current-revision.
- Availability: mobile access for Worker roles + offline-tolerant forms.
- Validation pack (Enterprise): IQ/OQ/PQ-style evidence for regulated
  verticals.

## Usage
Import rows verbatim as spec acceptance criteria where document control,
signatures, or records integrity are in scope. Reference as `#10-eqms-musts`.
