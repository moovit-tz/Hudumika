# Hudumika — API Audit

Status: **NOT YET EXECUTED** (2026-09-10). Placeholder so the phase has a home.
Nothing here is PASS. See FINAL_PRODUCTION_READINESS_REPORT.md §5 for ordering.

## Planned scope (Phase 10)
- Enumerate all 195 route modules → method, path, auth decorator, RBAC guard,
  zod/valibot input schema, tenant scoping (`withTenant` vs bare `db` vs `dbPlatform`),
  response shape, error shape, pagination/filter/sort.
- Cross-check every `apiFetch(...)` in `apps/web/src` against a real backend route
  (method + payload + response assumption).
- Flag: missing authz, missing tenant filter, `db` outside `withTenant`, excessive
  field exposure, N+1, inconsistent error envelope, dead/duplicate endpoints.
- The tenant-filter check is now partly backstopped by RLS (HUD-0001..0003) but a
  missing `.where('tenant_id')` on a route is still a bug (wrong-tenant 404 vs 403,
  and any `dbPlatform` route has no backstop).
