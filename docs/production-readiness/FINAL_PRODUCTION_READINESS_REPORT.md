# Hudumika — Production Readiness Report (in progress)

**Status: PHASE 1–4 COMPLETE, PHASE 6 PARTIAL. NOT YET 98%.**
Date 2026-09-10. This is a live document; it will be wrong the moment the next
phase runs. Do not cite the score below as final.

---

## 1. Executive summary

The audit began at Phase 1 (discovery) and ran through Phase 4 (auth / RBAC /
tenant isolation) with a partial Phase 6 (transport security). The single largest
production blocker was found and fixed:

> **81 tenant-scoped tables and 9 line-item tables had no Row-Level Security.**
> The restricted application database role could read and write every tenant's
> email, HR, compliance, shipment, API-usage and settings data by setting its
> tenant variable to any value. Proven live against the running database.

Fixed in migrations `456` / `457` / `458` with the platform's standard
`tenant_isolation_policy`, and verified live: all 474 `tenant_id` tables plus the
9 structural children now enforce isolation; cross-tenant reads return zero;
owning-tenant reads are unchanged; 12 API endpoints spot-checked return correctly
scoped data.

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
| HUD-0009 | HIGH | Migration history drift — fresh DB didn't reproduce prod | **FIXED (VERIFIED)** |
| HUD-0004 | HIGH | ~25 non-tenant tables unclassified for isolation | OPEN |
| HUD-0005 | HIGH | ~no automated test coverage (7→9 API / 0 web) | OPEN |
| HUD-0006 | HIGH | CI has no build/typecheck/test/migration gate | OPEN |
| HUD-0007 | HIGH | `tenant_id` type split uuid/text (12 tables) | OPEN |
| HUD-0008 | HIGH | Developer/analytics tables isolation unconfirmed | OPEN |
| HUD-0010..0018 | MED/LOW | Repo hygiene, empty catch, env defaults, `tenant_settings` sentinel row | OPEN |
| HUD-0019 | LOW | Two dead, orphaned "marketplace request" tables (found via HUD-0009 fix) | OPEN |

## 4. Production readiness score (provisional)

Weighted per the master model. A dimension is scored only on what has been
*verified*; unverified dimensions are capped at 50% ("cannot confirm").

| Dimension | Weight | Score | Notes |
|-----------|------:|------:|-------|
| Security & Privacy | 15% | 70% | RLS gate now PASS at schema layer; auth spot-checked; SSRF/IDOR/file/log unaudited; dep-vuln backlog |
| Core Functionality | 15% | 50% | not traced (Phase 5) |
| Data Integrity & DB | 10% | 70% | RLS solid; migration drift now fixed+proven (HUD-0009); constraints/precision/concurrency unaudited |
| API & Integrations | 10% | 45% | 195 routes not contract-checked; 9 integrations unaudited |
| Auth / RBAC / Tenancy | 10% | 75% | tenancy PASS; auth spot PASS; per-role RBAC matrix not built |
| Reliability / Error handling | 8% | 45% | not audited; known empty catches |
| Testing & Regression | 8% | 15% | HUD-0005 |
| Performance | 7% | 40% | not measured |
| Responsive / Mobile | 5% | 40% | not tested |
| UI / UX | 5% | 55% | design-system exists + enforced by CLAUDE.md; not forensically audited |
| Accessibility | 3% | 35% | not audited |
| DevOps / CI/CD / Observability | 4% | 30% | HUD-0006 |
| **Overall** | 100% | **≈ 52%** | |

### Mandatory gates

| Gate | State |
|------|-------|
| CRITICAL security = 0 | ✅ PASS |
| CRITICAL data = 0 | ✅ PASS |
| CRITICAL functional = 0 | ⚠ UNVERIFIED (Phase 5 not run) |
| HIGH security/tenancy/authz = 0 | ❌ 4 open (HUD-0004/0005*/0007/0008/0009) |
| Tenant isolation | ✅ PASS (schema layer, verified) |
| Authentication | ◑ PASS (spot) |
| Authorization | ❌ UNVERIFIED |
| Core workflows E2E | ❌ UNVERIFIED |
| Production build | ❌ UNVERIFIED (`npm run build` not run) |
| DB migrations reproduce prod | ✅ **PASS** — proven on a from-scratch database (HUD-0009) |
| No production mocks | ❌ UNVERIFIED |
| No exposed secrets (client) | ✅ PASS |

## 5. Recommended next order

1. ~~HUD-0009~~ — **done.** Migration history drift fixed and proven against a
   from-scratch database (0-diff vs. live).
2. ~~HUD-0005 test #1~~ — **done.** Permanent tenant-isolation regression test
   (`tenant-rls-coverage.test.ts`, 7 assertions) added and passing.
3. **HUD-0006** — real CI (`tsc` + `lint` + `vitest` + `build` + migrate dry-run against
   a fresh database — now that HUD-0009 proved that dry-run actually passes, wiring it
   into CI locks the guarantee in rather than leaving it to manual re-proof).
4. **Phase 14** — RBAC matrix per role × route (mandatory gate: Authorization).
5. **Phase 5** — functional tracing of the core journeys per app (mandatory gate:
   Core workflows).
6. **Phase 6 remainder** — SSRF / IDOR / file-download traversal / webhook signature /
   `api_dev.log` secret scan.
7. **HUD-0004 / HUD-0008** — finish non-tenant table classification.
8. **HUD-0019** — decide the fate of the two dead marketplace-request tables.
9. Phases 7–12 (data integrity, UI/UX, responsive, a11y, performance, integrations).
10. Phase 17 — independent adversarial pass.

## 6. Risks carried

- Concurrent development is active on this branch (multiple `apps/api` files modified
  outside this audit's scope during the session). Re-run the RLS scan after any
  migration lands to catch a new `tenant_id` table shipped without a policy.
- The `text`→`uuid` `tenant_id` migration (HUD-0007) touches live compliance data and
  needs a deliberate, tested rollout.
- No load/volume testing has been done; all evidence is against a dev dataset
  (largest table `api_usage_events` ≈ 666k rows).
