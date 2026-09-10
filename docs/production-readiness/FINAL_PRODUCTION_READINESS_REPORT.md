# Hudumika — Production Readiness Report (in progress)

**Status: PHASE 1–4 COMPLETE. PHASE 9/35/36 (migrations, build, reliability)
COMPLETE. PHASE 6 AND 14 PARTIAL. NOT YET 98%.**
Date 2026-09-10. This is a live document; it will be wrong the moment the next
phase runs. Do not cite the score below as final.

---

## 1. Executive summary

The audit began at Phase 1 (discovery) and ran through Phase 4 (auth / RBAC /
tenant isolation), a partial Phase 6 (transport security), and the deployment/CI
phases (35/36). Four CRITICAL and three more HIGH-severity production blockers
were found — each with live evidence, not inferred — and fixed:

> **81 tenant-scoped tables and 9 line-item tables had no Row-Level Security.**
> The restricted application database role could read and write every tenant's
> email, HR, compliance, shipment, API-usage and settings data by setting its
> tenant variable to any value. Proven live against the running database.

> **A fresh install could not reproduce production's schema**, and would have
> crashed partway through: one seed migration assumed a user already existed,
> and one table referenced by this audit's own RLS fix had no creating migration
> anywhere in the repo. Proven by actually running all 470 migrations against a
> database that had never seen data — not assumed from the file-count mismatch.

> **`npm run build` had likely never succeeded** — a shared package couldn't
> compile under its own tsconfig. **CI enforced none of this** — the only
> workflow ran `npm audit`, non-blocking.

> **Any dropped database connection crashed the entire API process** — for
> every tenant at once, with no reconnect. This happened live, mid-audit,
> confirming the finding rather than requiring it to be theorized.

> **A customer-portal account could create and delete infrastructure.**
> `onsite.routes.ts` (servers, domains, deployments, deploy secrets — ~50
> mutating endpoints) checked only whether the tenant's plan included the
> feature, never which role the caller had. Proven live: a real `CUSTOMER`-role
> JWT created and deleted a real database row through the actual route.

All five are fixed and re-verified (fresh-database dry run passes end to end;
full API suite green against both the live and a from-scratch database; the
build succeeds; the crash-causing gap is closed on all four connection pools;
the same customer JWT that could mutate infrastructure now gets 403 on a plain
read, while a legitimate admin role is unaffected). A real CI workflow
(`ci.yml`) now runs the build/test/migration chain on every push/PR.

Phase 14 (the RBAC matrix) is now a multi-session effort in progress: an
automated triage of all 195 route files for mutating endpoints with no role
or ownership check flagged ~300 candidates across 58 files; most inspected so
far turned out to be legitimate patterns (named-approver checks, alternate
guard function names, deliberate `410 Gone` stubs, a deliberate draft-only
invoice path, a one-time-code capability-token flow) rather than real gaps.
**Eight were real** and are now fixed across 7 files, each proven live with a
real low-privilege JWT, not inferred from reading code alone:

- **Onsite + Onsite Backups** (HUD-0023/0030) — a `CUSTOMER`-role JWT created
  and deleted infrastructure records and could restore/delete config backups;
  the fix to one file didn't cover the other, which used the identical gap.
- **ComplyOS Legal Marketplace** (HUD-0025) — any tenant member could
  create/cancel legal engagements and flip milestone payment status.
- **Identity avatars** (HUD-0026) — any tenant member could overwrite or
  delete anyone else's profile photo or a customer/lead/driver/supplier's
  logo, platform-wide (the shared `PersonAvatar`/`CompanyAvatar` endpoint).
- **Sign envelopes/templates** (HUD-0027) — no mutation route checked who
  created the envelope; any tenant member with 'sign' entitlement could void,
  resend, retitle or fully re-edit someone else's document, including a
  still-private draft — contradicting a creator-only rule the list endpoint
  already enforced elsewhere in the same file.
- **Contacts + CMS/OneSite** (HUD-0028/0029) — both reachable in full by a
  `CUSTOMER`-role portal account: the internal address book, and the
  tenant's own public website (edit/delete pages, overwrite site settings).

A systematic "can a `CUSTOMER` JWT even reach this app" probe against the
remaining flagged files (once that pattern proved out 4 different times)
turned up **11 more likely gaps, not yet fixed** — real, non-empty data
reachable at Petti wallets, Sanctions screenings, Notes, Org tickets, SEAL
compartments, HR departments, Depot equipment, Inventory warehouses, and
Dangerous Goods/Customs declarations, plus an unhandled 500 at Project OS
(logged as HUD-0031). Two apps were checked and found already correct:
Shipments (real `customer_id`-scoped filtering) and Drives (already blocked
for `CUSTOMER` by a concurrent session's own fix).

**~40 files are still fully untriaged** — this is explicitly a partial
result, not a completed authorization audit.

**The remaining 44 sections of the master audit have not been executed.** Large
areas — functional tracing of every action to the database, the full RBAC matrix,
data-integrity/concurrency, UI/UX, responsive, accessibility, performance at
realistic volume, the 9 third-party integrations, and test authoring — are
UNVERIFIED and are explicitly *not* marked PASS.

## 2. What was done

| Phase | Area | Result |
|------:|------|--------|
| 1 | Repo / architecture discovery | ✅ `ARCHITECTURE_MAP.md` |
| 2–3 | App / route / table inventory | ✅ (195 routes, 153 services, 40 jobs, 580 tables, 470 migrations, ~35 web shells, 468 pages) |
| 4 | Multi-tenant isolation | ✅ **3 CRITICAL fixed + verified** (HUD-0001/0002/0003); residual triaged (HUD-0004/0008) |
| 4 | Auth / session | ◑ spot-checked PASS; full flow pass pending |
| 6 | Transport security | ◑ CORS / helmet / rate-limit / client-secret scan PASS; SSRF / path-traversal / IDOR / file-upload / webhook-sig / log-scan pending |
| 14 | CI/CD | ✅ audited → **FAIL** (HUD-0006) |
| 13 | Test coverage | ✅ audited → **FAIL** (HUD-0005) |

## 3. Issues

| ID | Sev | Title | Status |
|----|-----|-------|--------|
| HUD-0001 | CRITICAL | 79 tenant tables no RLS | FIXED (VERIFIED) |
| HUD-0002 | CRITICAL | `shipment_cases` partitions unprotected | FIXED (VERIFIED) |
| HUD-0003 | CRITICAL | 9 child/line-item tables no RLS | FIXED (VERIFIED) |
| HUD-0021 | CRITICAL | Any dropped DB connection crashed the whole API | **FIXED (VERIFIED)** — found live during this audit |
| HUD-0023 | CRITICAL | Onsite: any authenticated role (incl. CUSTOMER) could create/delete infrastructure | **FIXED (VERIFIED)** — proven live with a real CUSTOMER JWT |
| HUD-0009 | HIGH | Migration history drift — fresh DB didn't reproduce prod | FIXED (VERIFIED) |
| HUD-0006 | HIGH | CI had no build/typecheck/test/migration gate | **FIXED (VERIFIED)** |
| HUD-0020 | HIGH | `npm run build` was broken (`packages/ui`) | **FIXED (VERIFIED)** |
| HUD-0025 | HIGH | ComplyOS Legal Marketplace had no role gate | **FIXED (VERIFIED)** |
| HUD-0026 | HIGH | Any user could overwrite/delete anyone else's avatar or a company logo | **FIXED (VERIFIED)** |
| HUD-0030 | CRITICAL | Onsite Backups: same gap as HUD-0023, separate file, missed by that fix | **FIXED (VERIFIED)** |
| HUD-0027 | HIGH | Sign: no envelope/template mutation checked who owned it | **FIXED (VERIFIED)** |
| HUD-0028 | HIGH | Contacts: internal address book reachable by CUSTOMER accounts | **FIXED (VERIFIED)** |
| HUD-0029 | HIGH | CMS/OneSite: CUSTOMER account could edit/delete the tenant's public website | **FIXED (VERIFIED)** |
| HUD-0004 | HIGH | ~25 non-tenant tables unclassified for isolation | OPEN |
| HUD-0005 | HIGH | ~no automated test coverage (10 API / 0 web) | OPEN |
| HUD-0007 | HIGH | `tenant_id` type split uuid/text (12 tables) | OPEN |
| HUD-0008 | HIGH | Developer/analytics tables isolation unconfirmed | OPEN |
| HUD-0031 | HIGH | 11 more CUSTOMER-reachable internal endpoints found, not yet fixed | OPEN |
| HUD-0024 | HIGH | RBAC matrix triaged, not completed — ~40 route files still fully unreviewed | OPEN |
| HUD-0010..0018 | MED/LOW | Repo hygiene, empty catch, env defaults, `tenant_settings` sentinel row | OPEN |
| HUD-0019 | LOW | Two dead, orphaned "marketplace request" tables (one now RLS-protected regardless) | OPEN |
| HUD-0022 | MEDIUM | `npm run lint` completely non-functional — eslint not installed, no config | OPEN |

## 4. Production readiness score (provisional)

Weighted per the master model. A dimension is scored only on what has been
*verified*; unverified dimensions are capped at 50% ("cannot confirm").

| Dimension | Weight | Score | Notes |
|-----------|------:|------:|-------|
| Security & Privacy | 15% | 70% | RLS gate now PASS at schema layer; auth spot-checked; SSRF/IDOR/file/log unaudited; dep-vuln backlog |
| Core Functionality | 15% | 50% | not traced (Phase 5) |
| Data Integrity & DB | 10% | 70% | RLS solid; migration drift now fixed+proven (HUD-0009); constraints/precision/concurrency unaudited |
| API & Integrations | 10% | 45% | 195 routes not contract-checked; 9 integrations unaudited |
| Auth / RBAC / Tenancy | 10% | 55% | tenancy PASS; auth spot PASS; 8 RBAC gaps found+fixed live across 7 files, but 11 more found and not yet fixed (HUD-0031) and ~40 files fully untriaged — the hit rate so far (19 real issues in ~15 files actually read) argues for more, not fewer, in the untriaged remainder |
| Reliability / Error handling | 8% | 55% | HUD-0021 (process-crashing pool bug) found+fixed; broader error-handling sweep not done |
| Testing & Regression | 8% | 20% | HUD-0005 open, but CI (HUD-0006) now runs the tests that do exist on every push |
| Performance | 7% | 40% | not measured |
| Responsive / Mobile | 5% | 40% | not tested |
| UI / UX | 5% | 55% | design-system exists + enforced by CLAUDE.md; not forensically audited |
| Accessibility | 3% | 35% | not audited |
| DevOps / CI/CD / Observability | 4% | 65% | HUD-0006 fixed (real CI); HUD-0022 (lint) still open |
| **Overall** | 100% | **≈ 53%** | |

### Mandatory gates

| Gate | State |
|------|-------|
| CRITICAL security = 0 | ✅ PASS |
| CRITICAL data = 0 | ✅ PASS |
| CRITICAL functional = 0 | ⚠ UNVERIFIED (Phase 5 not run) |
| HIGH security/tenancy/authz = 0 | ❌ 6 open (HUD-0004/0005/0007/0008/0024/0031) |
| Tenant isolation | ✅ PASS (schema layer, verified) |
| Authentication | ◑ PASS (spot) |
| Authorization | ◑ **PARTIAL** — 8 gaps found+fixed live across 7 files (2 CRITICAL); 11 more found, not yet fixed (HUD-0031); ~40 of 195 route files still fully untriaged (HUD-0024) |
| Core workflows E2E | ❌ UNVERIFIED |
| Production build | ✅ **PASS** — was broken (HUD-0020), fixed and verified |
| DB migrations reproduce prod | ✅ **PASS** — proven on a from-scratch database (HUD-0009) |
| CI meaningful | ✅ **PASS** — real gate added (HUD-0006) |
| API resilient to a dropped DB connection | ✅ **PASS** — was FAIL, crashed live during this audit (HUD-0021) |
| No production mocks | ❌ UNVERIFIED |
| No exposed secrets (client) | ✅ PASS |

## 5. Recommended next order

1. ~~HUD-0009~~ — **done.** Migration history drift fixed and proven against a
   from-scratch database (0-diff vs. live).
2. ~~HUD-0005 test #1~~ — **done.** Permanent tenant-isolation regression test
   (`tenant-rls-coverage.test.ts`, 7 assertions) added and passing.
3. ~~HUD-0006~~ — **done.** Real CI (`ci.yml`): typecheck, fresh-DB migrate, API tests
   against that fresh DB, full build. Proven locally end to end before being trusted.
4. ~~HUD-0020~~ — **done.** `npm run build` was broken (`packages/ui` couldn't compile);
   fixed, all 4 workspaces build clean.
5. ~~HUD-0021~~ — **done.** Found live mid-audit: an unhandled `pg` pool error crashed
   the whole API on any dropped DB connection. Fixed on all 4 connection pools.
6. ~~HUD-0023~~ — **done, partial Phase 14.** Automated triage of all 195 route files
   found ~300 mutating-endpoint candidates with no role/ownership check across 58 files;
   the highest-stakes one (Onsite — servers/domains/deploy secrets) was read end to end
   and proven live: a `CUSTOMER`-role JWT could create and delete infrastructure. Fixed,
   re-verified live (403 for low-privilege roles, 200 unchanged for admin roles).
7. ~~HUD-0025 / HUD-0026~~ — **done.** ComplyOS Legal Marketplace (create/cancel legal
   engagements, message a law firm, flip milestone payment status) and the shared
   identity-avatar endpoint (any user could overwrite anyone else's photo or a company's
   logo, platform-wide) both had the same shape of gap. Both fixed, both proven live —
   including confirming self-service avatar editing (the real product feature) still works.
   `billing.routes.ts` was checked and found already correctly gated;
   `seal-billing.routes.ts` and `org.routes.ts POST /claim` were checked and are
   deliberately open by design (draft-only invoice, one-time-code capability token).
8. ~~HUD-0027 / 0028 / 0029 / 0030~~ — **done.** Sign (ownership, not role — void/resend/
   retitle/edit any other user's envelope), Contacts and CMS/OneSite (both fully reachable
   by a `CUSTOMER`-role portal account), and Onsite Backups (the exact HUD-0023 gap,
   missed because it's a separate route file) all fixed and proven live. Discovered that
   "does a `CUSTOMER` JWT even reach this app's base route" is a fast, high-confidence
   signal — 4 of 4 apps checked that way turned out to be real bugs — and used it to probe
   the remaining flagged files quickly.
9. **HUD-0031** — that probe surfaced 11 more likely gaps (Petti wallets, Sanctions
   screenings, Notes, Org tickets, SEAL compartments, HR/Depot/Inventory base routes,
   Dangerous Goods/Customs declarations, plus a 500 at Project OS) that are **not yet
   fixed** — each needs the actual handler read (not just the probe result) before fixing,
   prioritizing Petti and Sanctions first (financial/compliance, same severity class as
   HUD-0025). Continue from here — this is the immediate next step, not a later phase.
10. **HUD-0024 remainder** — ~40 files never touched by either pass (seal-* sub-files,
    warehouse/tracker, inventory beyond the base route, calculators/AI/PDF-tools/self-
    service tail).
8. **Phase 5** — functional tracing of the core journeys per app (mandatory gate:
   Core workflows).
9. **Phase 6 remainder** — SSRF / IDOR / file-download traversal / webhook signature /
   `api_dev.log` secret scan.
10. **HUD-0004 / HUD-0008** — finish non-tenant table classification.
11. **HUD-0022** — wire up real linting (currently completely non-functional).
12. **HUD-0019** — decide the fate of the two dead marketplace-request tables.
13. Phases 7–12 (data integrity, UI/UX, responsive, a11y, performance, integrations).
14. Phase 17 — independent adversarial pass.

## 6. Risks carried

- Concurrent development is active on this branch (multiple `apps/api` files modified
  outside this audit's scope during the session). Re-run the RLS scan after any
  migration lands to catch a new `tenant_id` table shipped without a policy.
- The `text`→`uuid` `tenant_id` migration (HUD-0007) touches live compliance data and
  needs a deliberate, tested rollout.
- No load/volume testing has been done; all evidence is against a dev dataset
  (largest table `api_usage_events` ≈ 666k rows).
