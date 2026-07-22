# Pending Absorption Flips

These redirect stubs are PREPARED but NOT ACTIVE. Per the migration law
(architecture §11, P1 finding F-P1-1):

> A route in the live nav must ALWAYS land on a WORKING surface. The
> direction flips only when the absorbing view passes its design gate.

## Activation procedure

1. Request design-gate PASS from the architect (post screenshots per
   view-gate procedure for §8 /manual and §10 /documents).
2. On PASS: copy the flip file to the target route's `page.tsx`.
3. Verify: the old route now redirects to the new working surface.

## Files

- `qms-to-manual.tsx` → replaces `(authenticated)/qms/page.tsx`
  - Gate: §8 /manual design-gate **PASSED 2026-07-22** (architect, evidence:
    design-gate-p2-surfaces.md) — flip nevertheless DEFERRED: /qms still
    hosts the only working org-profile wizard and /setup is a stub.
    Redirecting would strand profile creation (the same law's "always land
    on a working surface"). Activate when the Setup Wizard ships at /setup.
- ~~`m1-to-documents.tsx` → replaces `(authenticated)/m1/page.tsx`~~
  - §10 gate PASSED 2026-07-22 → **ACTIVATED** same day (m5-precedent stub;
    old register + _detail removed).

## NEVER

- Never activate without the architect's PASS.
- Never delete the old implementation before the absorbing view is confirmed working.
