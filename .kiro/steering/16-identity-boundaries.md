---
inclusion: always
---
# The Four Never-Cross Layers (Part 32)
Three Cognito pools: A=SaaS Admin (internal), B=Tenant Admin, C=Tenant User.
1. Token layer: each surface pins its expected issuer(s). Tenant app rejects
   Pool-A tokens with 401 BEFORE any role logic. Admin plane rejects B/C.
2. Claim layer: PreTokenGeneration (V1_0, ID token only) stamps
   poolClass: internal|tenant-admin|tenant-user; resolvers assert poolClass.
3. IAM layer: Pool-A roles carry explicit Deny on tenant-data paths unless an
   active break-glass grant tag is present; B/C have no admin-plane path.
4. Human layer: one email may exist in at most one pool per environment;
   nightly cross-pool duplicate job + alarm.
Break-glass = time-boxed, ticketed, tenant-notified, immutably logged.
Any code that would let one pool's identity act on another pool's surface is
a security defect regardless of role checks. Subscriptions always verify the
tenant claim. @aws_cognito = user-facing; @aws_iam = agent/service.
