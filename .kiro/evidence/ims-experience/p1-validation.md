# P1 VALIDATION — Foundation + IA (architect independent pass, 2026-07-21)

Delivery validated on-disk against architecture §10/§11 — never from the
report. Verdict: **shell/IA/components ACCEPTED; one SEV-1 finding found,
corrected in-tree before commit.**

## F-P1-1 (SEV-1, CORRECTED) — destructive redirect stubs deleted the working product surface
Kiro's delivery replaced ALL six working module pages with 24-line redirect
stubs pointing at 18-line EMPTY stubs: `git diff --stat` showed **4,173
lines deleted** — m1 244→24, m2 357→24, m3 303→24, m4 406→24, m5 364→24,
qms 804→24, m4/forms 322→24 (destroying the day-old AUD-9 fix), plus
page.module.css files and **10 tests** (frontend lane silently shrank
124→114 — the "vitest ✓" gate was vacuous because the tests died with the
pages). Net effect if committed: the entire working app (M2 CAPA timeline,
forms engine register, QMS generation view, M4 trail, M5 risks) becomes
unreachable until P2–P4 — the exact class of surprise the owner ordered
prevented.

**Root cause:** architecture §11 P1 listed "old routes → client-redirect
stubs" without stating the sequencing invariant; Kiro executed the
redirect before any absorbing surface existed. Shared fault (architect
wording / Kiro execution).

**Correction (architect, in-tree, uncommitted work — no history rewrite):**
1. Restored the six page implementations + CSS + tests from HEAD (all
   `_detail`/sub-components had survived untouched).
2. Reversed the interim redirect direction: the six RENAMED IA routes now
   redirect NEW→OLD (`/capa→/m2`, `/forms→/m4/forms`, `/records→/m4`,
   `/risk→/m5`, `/documents→/m1`, `/manual→/qms`) so every nav entry lands
   on a working surface today; direction flips per-route when the absorbing
   view passes its design gate (P2: manual/documents; P3: forms; P4:
   capa/records).
3. Genuinely-NEW routes keep Kiro's honest stubs (/audits,
   /audit-readiness, /cross-reference, /guide, /activity, /analytics,
   /ai-review, /management-review, /setup).
4. Migration law added to architecture §11 P1 (binding for P2–P4).

## Accepted from the delivery (validated present + green)
- `view-designs.md` written BEFORE implementation (§10 discipline) ✓
- `components/shell/nav-config.ts` + Sidebar refactor (§10 IA groups,
  role-gated ADMIN, Ask overlay-only) ✓
- `lib/standard-scope.tsx` + `StandardSwitch` (localStorage-persisted,
  radiogroup keyboard nav) ✓
- `StatTile` / `GuidanceBanner` / `ReadyPill` from existing tokens only ✓
- en/es/pt same-commit ✓

## Gates (re-run by architect on the CORRECTED tree, 2026-07-21 ~19:10 local)
| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run i18n:check` | no hardcoded strings |
| `vitest run` | **17 files, 124/124** (Kiro's report said 114 — the 10 restored tests are the delta) |
| `next build --no-lint` | static export green, all routes prerendered |

## Standing rule added for the owner's contract concern
Every future view-designs.md section MUST cite its architecture §4
coverage-matrix row — the exact query/mutation names it consumes and their
status (BUILT / read-surface-completion / ROADMAP) — BEFORE the build task
opens. A view may not render a control whose backend contract is absent;
honest stubs/zero-states only. Enforced at each per-view DESIGN GATE.

## CHECKPOINT A status
Shell + toggle + working-surface nav: DONE (with correction). The "one
migrated register" (architecture §11) is NOT yet delivered — assigned back
to Kiro as the P1 closer (recommend /risk absorbing m5 as the smallest
real migration, per the interim-redirect flip procedure).
