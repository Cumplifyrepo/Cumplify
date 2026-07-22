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
  - Gate: §8 /manual design-gate PASS
- `m1-to-documents.tsx` → replaces `(authenticated)/m1/page.tsx`
  - Gate: §10 /documents design-gate PASS

## NEVER

- Never activate without the architect's PASS.
- Never delete the old implementation before the absorbing view is confirmed working.
