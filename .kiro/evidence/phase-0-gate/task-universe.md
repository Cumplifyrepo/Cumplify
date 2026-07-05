# Phase-0 Task Universe

All completed tasks across the 4 P0 specs, enumerated for GATE-7 selection.

---

## Enumeration

| # | Spec | Task | Description |
|---|------|------|-------------|
| 1 | build-verification-harness | 1.1 | Project tooling setup + evidence-gate script |
| 2 | build-verification-harness | 1.2 | Property-based test scaffold |
| 3 | build-verification-harness | 2.1 | Readback test framework + sample assertion |
| 4 | build-verification-harness | 3.1 | Hook prompt updates |
| 5 | build-verification-harness | 3.2 | Deliberate evidence-gate failure proof (AC-5.1) |
| 6 | build-verification-harness | 3.3 | Deliberate readback failure proof (AC-5.2) |
| 7 | platform-foundation | 1.1 | CDK app skeleton + stage construct + pipeline |
| 8 | platform-foundation | 1.2 | NetworkStack |
| 9 | platform-foundation | 1.3 | SecurityStack |
| 10 | platform-foundation | 1.4 | DataStack |
| 11 | platform-foundation | 1.5 | IdentityStack |
| 12 | platform-foundation | 1.6 | Readback assertions R-1..R-23 |
| 13 | platform-foundation | 1.7 | CDK bootstrap |
| 14 | platform-foundation | 1.8 | DrRegionStack + prod DR wiring |
| 15 | platform-foundation | 2.1 | Direct CLI deploy to dev + readback |
| 16 | platform-foundation | 3.1 | GitHub + CodeStar + pipeline deploy |
| 17 | platform-foundation | 3.2 | Pool A IAM Identity Center federation |
| 18 | eventing-backbone | 1 | Initialize services/eventing workspace package |
| 19 | eventing-backbone | 2 | Implement publisher + types |
| 20 | eventing-backbone | 3 | Implement consumer library + router + demo handler |
| 21 | eventing-backbone | 4 | Implement EventingStack (CDK) |
| 22 | eventing-backbone | 5 | R-3 event pattern verification (FIX-7) |
| 23 | eventing-backbone | 6 | Deploy to dev + create contracts/events.md |
| 24 | eventing-backbone | 7 | Readback (behavioral proof, D3 closure) |
| 25 | immutable-trail | 1 | services/audit-trail scaffold + hash-chain + types |
| 26 | immutable-trail | 2 | appendAuditEvent library |
| 27 | immutable-trail | 3 | services/eventing createFifoHandler extension |
| 28 | immutable-trail | 4 | Lambda handlers (consumer, sealer, tripwire, verifier) |
| 29 | immutable-trail | 5 | AuditTrailStack CDK + template assertions |
| 30 | immutable-trail | 6 | HITL Review Checkpoint |
| 31 | immutable-trail | 7 | Deploy to dev + readback green (13 tests) |
| 32 | immutable-trail | 8 | Closure |

**Total: N = 32 completed tasks**

---

## GATE-7 Selection Derivation

**Seed:** Approved spec commit `a392299` (full: `a39229919879e57826643c9fae99c208fadb6cbd`)

**Hash:** `sha256("a39229919879e57826643c9fae99c208fadb6cbd")`
= `e40278cf182ed7ee9c51b7013596fbcae204f18be8c9c59a35d32856e68444f4`

**Method:** Take successive 4-byte (8 hex char) big-endian windows, parse as unsigned 32-bit integer, compute `mod 32` for 0-indexed task index. Skip if same spec as a previous pick. Continue until 3 tasks selected across >= 2 specs.

### Window 1: bytes 0-3
- Hex: `e40278cf`
- Integer: `3825367247`
- `3825367247 mod 32 = 15` → **index 15 (0-based) = task #16: platform-foundation / 3.1 (GitHub + CodeStar + pipeline deploy)**
- Spec: platform-foundation ✓ (first pick)

### Window 2: bytes 4-7
- Hex: `182ed7ee`
- Integer: `405723118`
- `405723118 mod 32 = 14` → **index 14 (0-based) = task #15: platform-foundation / 2.1 (Direct CLI deploy to dev + readback)**
- Spec: platform-foundation — SAME as Window 1, **SKIP**

### Window 3: bytes 8-11
- Hex: `9c51b701`
- Integer: `2622600961`
- `2622600961 mod 32 = 1` → **index 1 (0-based) = task #2: build-verification-harness / 1.2 (Property-based test scaffold)**
- Spec: build-verification-harness ✓ (second spec, constraint progressing)

### Window 4: bytes 12-15
- Hex: `3596fbca`
- Integer: `899087306`
- `899087306 mod 32 = 10` → index 10 = task #11: platform-foundation / 1.5 (IdentityStack)
- Spec: platform-foundation — SAME as Window 1, **SKIP**

### Window 5: bytes 16-19
- Hex: `e204f18b`
- Integer: `3791974795`
- `3791974795 mod 32 = 11` → index 11 = task #12: platform-foundation / 1.6 (Readback assertions)
- Spec: platform-foundation — SAME as Window 1, **SKIP**

### Window 6: bytes 20-23
- Hex: `e8c9c59a`
- Integer: `3905537434`
- `3905537434 mod 32 = 26` → **index 26 (0-based) = task #27: immutable-trail / 3 (services/eventing createFifoHandler extension)**
- Spec: immutable-trail ✓ (third spec, constraint satisfied — 3 tasks across 3 specs)

### Selected Tasks (3 tasks, 3 specs)

| Audit # | Task | Spec | D-Rung |
|---------|------|------|--------|
| A1 | 3.1 — GitHub + CodeStar + pipeline deploy | platform-foundation | D3 |
| A2 | 1.2 — Property-based test scaffold | build-verification-harness | D1 |
| A3 | 3 — services/eventing createFifoHandler extension | immutable-trail | D1 |
