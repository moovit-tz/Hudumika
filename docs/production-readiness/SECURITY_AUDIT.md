# Hudumika — Security Audit

Snapshot 2026-09-10. Evidence is live (queries against the running DB + API), not
source-reading alone. Findings cross-referenced in `AUDIT_REGISTER.md`.

## 1. Multi-tenant isolation — the headline finding

### Before this audit

Live scan of `pg_class` / `pg_policies`:

```
TOTAL base tables (public) : 580
  with tenant_id column    : 474
  tenant_id + RLS enabled  : 393     <-- 81 tenant tables had NO row-level security
  tenant_id + RLS forced   : 393
```

Cross-tenant probe — connected as the restricted app role
`hudumika_app` (non-superuser, non-BYPASSRLS), `SET app.tenant_id` = tenant A, then
`SELECT count(*)` with no `WHERE`:

| table | total rows | tenant A's rows | rows the app returned as tenant A |
|-------|-----:|-----:|-----:|
| `email_outbox` | 1077 | 370 | **1077** |
| `email_messages` | 73 | 22 | **73** |
| `hr_login_history` | 2526 | 992 | **2526** |
| `hr_devices` | 77 | 29 | **77** |
| `tenant_settings` | 26 | 1 | **26** |
| `tenant_usage_counters` | 218 | 3 | **218** |
| `api_usage_events` | 666 404 | 109 418 | **666 404** |
| `data_quality_findings` | 718 | 327 | **718** |
| `org_permissions` | 756 | 378 | **756** |
| `landed_cost_records` | 143 | 4 | **143** |
| `comply_obligations` | 81 | 9 | **81** |
| `comply_certificates` | 35 | 2 | **35** |
| `shipment_listeners` | 180 | 71 | **180** |
| `shipment_report_shares` | 127 | 57 | **127** |
| `trade_wizard_runs` | 79 | 2 | **79** |

RLS is documented as the platform's "second line of defense" (CLAUDE.md). On these
81 tables it was **absent** — the only thing separating tenants was a hand-written
`.where('tenant_id', …)` in each of ~195 route modules. A single missing filter
(this audit did not yet enumerate all call sites — Phase 14) is a cross-tenant
data leak of email, HR, compliance, shipment and API-usage data.

### Fixes applied

| Migration | Scope | Verified |
|-----------|-------|----------|
| `456_tenant_rls_gap_batch.sql` | 79 tenant-`tenant_id` tables — `ENABLE`+`FORCE`+`tenant_isolation_policy` (`USING`+`WITH CHECK`). 67 `uuid` variant, 12 `text` variant (`cms_*`, `comply_*`). Plus `FORCE` on the `shipment_cases` partition parent + `ENABLE`/`FORCE` on its 2 partitions. | ✅ |
| `457_shipment_cases_partition_policies.sql` | explicit `tenant_isolation_policy` on `shipment_cases_2026` / `_default` (PG13 doesn't apply a parent policy to a directly-addressed partition). | ✅ |
| `458_child_table_rls_gap.sql` | 9 child tables with no `tenant_id` — EXISTS-through-parent policy on their real structural FK: `declaration_items`/`declaration_attachments`/`declaration_item_models` → `declarations`; `delivery_document_lines` → `delivery_documents`; `tax_lines` → `declaration_notices`; `geofence_events` → `geofences`; `hr_team_members` → `hr_teams`; `comply_legal_messages`/`comply_legal_milestones` → `comply_legal_engagements`. | ✅ |

Policy shape matches the platform standard (migrations 242 / 245 / 296 / 440 / 455):

```sql
USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
```

Fail-closed: `app.tenant_id` unset → `NULLIF` → `NULL` → zero rows, writes rejected.
The BYPASSRLS `dbPlatform` connection (SuperAdmin consoles, usage rollups, CMS
platform pages, auth-middleware device checks, migrations) is unaffected.

**Access-path review done before enabling** — every one of the 79 + 9 tables is
reached only via `withTenant()` (`app.tenant_id` set, row `tenant_id` = that value)
or `dbPlatform`. Login / device / lockout writes (`hr_login_history`, `hr_devices`)
run inside `withTenant(tenantId, …)`; CMS null-tenant platform pages are read and
written only through `dbPlatform`.

### After

```
TOTAL base tables (public) : 580
  with tenant_id column    : 474
  tenant_id + RLS enabled + forced + >=1 policy : 474   (was 393)
```

Post-fix probe: every sampled table returns **only the acting tenant's rows**;
a bogus tenant id returns 0; the owning tenant of each child-table row still sees
exactly its rows (`comply_legal_messages`: tenant X → 2, tenant Y → 2, others → 0).

API smoke (real signed JWT, tenant `Vihilox`): `/v1/hr/staff`, `/v1/hr/login-history`,
`/v1/comply/obligations` (→ 9), `/v1/comply/certificates` (→ 2), `/v1/org-chart` (→ 7),
`/v1/permissions` (→ 378), `/v1/shipments` (→ 68) all 200, counts matching the owning
tenant exactly — no over-blocking.

### Residual (OPEN)

- **HUD-0004 / HUD-0008** — 81 tables with neither `tenant_id` nor RLS. Triaged in the
  register: ~30 are legitimately global reference data (RLS would break them), ~12 are
  `dbPlatform`-only platform tables, and ~25 (`api_*`, `dev_*`, `developer_*`, `lens_*`,
  `report_runs`, `query_builder_runs`, `workflow_templates*`, `marketplace_apps`,
  `semantic_entities`, `vessel_positions`) need per-route tracing before they can be
  called safe or scoped. Not a confirmed leak; not confirmed safe.
- **HUD-0007** — `cms_*` / `comply_*` store `tenant_id` as `text`. Works, but inconsistent.

## 2. Auth / session (spot-checked — full pass = Phase 14)

Verified present and correct in `middleware/auth.ts` + `middleware/csrf.ts` +
`lib/cookies.ts`:

- httpOnly access/refresh cookies; cookie-first token extraction with Bearer fallback.
- Double-submit CSRF, correctly scoped to ambient-cookie requests only.
- `typ` discrimination — `refresh` / `guest` / `twofa_setup` rejected from ordinary routes.
- Live session revocation via `hr_devices.revoked_at` (checked per request through `dbPlatform`).
- Idle-timeout policy enforcement (tenant + platform settings).
- Post-auth gates: tenant suspension (403), IP allowlist (403), maintenance (503), usage cap (402).
- API-key auth path: hashed lookup, expiry check, read-only-key method restriction, scope check.

**Not yet verified:** password reset token single-use + expiry, email-verification flow,
2FA enrollment/verification end-to-end, refresh-token rotation, org-portal (`ORG`) route
allowlist completeness, impersonation cookie-stacking teardown.

## 3. Transport / headers / secrets (verified)

- `@fastify/helmet` registered (CORP `cross-origin` for the split-origin SPA).
- `@fastify/cors` — allowlist only (`env.CORS_ORIGINS` + tenant extras); unknown origin rejected;
  WS upgrade origin checked explicitly (CORS plugin doesn't run for WS).
- `@fastify/rate-limit` registered, platform-configurable.
- No secrets / keys / PEM blocks in `apps/web/src` (grep). `.env` not git-tracked.

## 4. Known dependency vulns (HUD-0012)

CI `dependency-audit.yml` itself documents unfixed high/critical: `fast-jwt`,
`@fastify/static` path-traversal, `brace-expansion` DoS — all needing forced major
bumps of `fastify` / `@fastify/jwt` / `vite`. No owner, no upgrade plan.

## 5. Not yet audited (Phase 6 remainder)

SSRF (outbound fetch in integrations / `identity` avatar proxy / webhooks), path
traversal on file download/preview, direct-object-reference on `/v1/*/:id` and storage
URLs, SQL injection surface (Kysely parameterises — spot-check raw `sql\`\`` fragments),
file-upload type/size enforcement, webhook signature verification + idempotency,
predictable IDs, sensitive data in logs (`api_dev.log` is 27 MB — needs a scan).
