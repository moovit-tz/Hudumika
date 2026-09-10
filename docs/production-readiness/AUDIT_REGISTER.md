# Hudumika — Production Readiness Audit Register

Master issue register. IDs are stable (`HUD-####`). Status one of
`OPEN` · `IN PROGRESS` · `FIXED` · `FIXED (VERIFIED)` · `WONTFIX` · `UNVERIFIED`.

Audit started 2026-09-10. Auditor: automated full-stack readiness pass.
Methodology: DISCOVER → TRACE → TEST → DOCUMENT → FIX → RE-TEST → REGRESS → VERIFY.
Evidence is live: queries run against the running Postgres (`localhost:5433/clearos`)
and the running API (`localhost:3001`), not just source reading.

---

## Severity summary (live)

| Severity | Open | Fixed (verified) | Total |
|----------|-----:|-----------------:|------:|
| CRITICAL | 0 | 3 | 3 |
| HIGH | 5 | 1 | 6 |
| MEDIUM | 5 | 0 | 5 |
| LOW | 5 | 0 | 5 |

Regression guard added: `apps/api/src/tests/tenant-rls-coverage.test.ts` — 7 tests,
schema-level assertion that every `tenant_id` base table plus the HUD-0003 children
and the `shipment_cases` partitions enforce `ENABLE`+`FORCE`+policy, plus a live
cross-tenant probe as the restricted role. Full API suite: **8 files / 83 tests pass**
after migrations 456/457/458 (no existing test broken).

Mandatory quality gates:

| Gate | Status | Evidence |
|------|--------|----------|
| Tenant isolation | **PASS (schema layer)** — every `tenant_id` table + structural child now RLS enforced & verified cross-tenant | HUD-0001/0002/0003 |
| No CRITICAL security issues | PASS | — |
| No exposed production secrets (client) | PASS | grep of `apps/web/src` — none |
| Authentication enforced server-side | PASS (spot-checked) | `middleware/auth.ts` — cookie+CSRF, refresh/guest/2fa-setup token rejection, device revocation |
| Authorization enforced server-side | **UNVERIFIED** — needs per-route RBAC matrix (Phase 14) | — |
| Core workflows E2E | **UNVERIFIED** — Phase 5 not yet run platform-wide | — |
| Production build | **UNVERIFIED** — `npm run build` not yet run | — |
| CI meaningful | **FAIL** — CI runs only `npm audit` (non-blocking); no typecheck/lint/test/build gate | HUD-0006 |
| Test coverage of critical workflows | **FAIL** — 8 API test files (now 9 incl. the RLS guard), 0 web test files for 195 routes / 153 services | HUD-0005 |
| Database migrations reproduce prod | **PASS** — fresh-DB proof: 474/474 migrations apply clean; full schema diff vs. live = 0 table/column/RLS mismatches | HUD-0009 |

---

## CRITICAL

### HUD-0001 — 79 tenant-scoped tables had no Row-Level Security · FIXED (VERIFIED)
- **Category:** Security / multi-tenant isolation
- **Module:** platform-wide (HR, Email, ComplyOS, ClearOS, FinOps, CMS, tracking, trade-wizard, platform)
- **Evidence:** Live scan of `pg_class` — 474 tables carry a `tenant_id` column; only 393 had
  `relrowsecurity`. Cross-tenant probe as the restricted `hudumika_app` role with
  `app.tenant_id` set to tenant A returned **every tenant's rows** on `email_outbox` (1077),
  `email_messages` (73), `hr_login_history` (2526), `hr_devices` (77), `tenant_settings` (26),
  `tenant_usage_counters` (218), `api_usage_events` (666k), `data_quality_findings`,
  `org_permissions` (756), `landed_cost_records`, `comply_obligations`, `comply_certificates`,
  `shipment_listeners`, `shipment_report_shares`, `trade_wizard_runs`.
- **Root cause:** RLS was applied per-migration as tables were added; ~81 tables (many added by
  later feature work / multiple agents) never got the standard `tenant_isolation_policy`. RLS is
  the documented "second line of defense" (CLAUDE.md) and it was absent — the only thing standing
  between tenants on these tables was hand-written `.where('tenant_id', …)` in each route.
- **Fix:** `apps/api/src/db/migrations/456_tenant_rls_gap_batch.sql` — `ENABLE` + `FORCE ROW LEVEL
  SECURITY` + standard `tenant_isolation_policy` (`USING` + `WITH CHECK`) on all 79 plain tables
  (67 with `uuid` tenant_id, 12 `comply_*`/`cms_*` with `text` tenant_id → text-compare variant).
  Same policy shape as migrations 242 / 245 / 296 / 440 / 455. Fail-closed when `app.tenant_id` is
  unset; unaffected by the BYPASSRLS `dbPlatform` connection used for audited cross-tenant paths.
- **Access-path review before enabling:** every table is reached only via `withTenant()` (auth
  var set, row `tenant_id` = that value) or `dbPlatform` (BYPASSRLS). Login/device/lockout writes
  (`hr_login_history`, `hr_devices`) run inside `withTenant(tenantId, …)` and are additionally
  wrapped in a "must never block auth" try/catch. CMS null-tenant platform pages are read/written
  only through `dbPlatform`.
- **Re-test:** post-migration probe — all 16 sampled tables now return only the acting tenant's
  rows; bogus tenant returns 0. API smoke (12 GET endpoints incl. `/v1/hr/login-history`,
  `/v1/comply/obligations`, `/v1/permissions`, `/v1/shipments`) all 200 with row counts matching
  the owning tenant exactly (9 obligations, 2 certs, 378 permissions, 68 shipments).
- **Regression:** `_rls_scan` now reports 474/474 tenant_id tables `ENABLED + FORCED + ≥1 policy`.

### HUD-0002 — `shipment_cases` partitions unprotected · FIXED (VERIFIED)
- **Category:** Security / multi-tenant isolation
- **Evidence:** `shipment_cases` is a partitioned table; parent had RLS `ENABLED` but not `FORCED`,
  leaf partitions `shipment_cases_2026` (144 rows) and `shipment_cases_default` (2) had RLS off —
  a query addressing a partition by name bypassed isolation.
- **Fix:** migration 456 forces RLS on the parent + `ENABLE`/`FORCE` on each partition;
  migration `457_shipment_cases_partition_policies.sql` adds the explicit `tenant_isolation_policy`
  to each partition (PG13 does not apply a parent policy to a directly-addressed partition).
- **Re-test:** direct partition query as tenant A → 66 / 2 rows (correct); as another tenant → 0.
  Through-parent query as A → 68; as another tenant → 0.

### HUD-0003 — 9 child/line-item tables had no RLS · FIXED (VERIFIED)
- **Category:** Security / multi-tenant isolation
- **Evidence:** `declaration_items`, `declaration_attachments`, `declaration_item_models`,
  `delivery_document_lines`, `tax_lines`, `geofence_events`, `hr_team_members`,
  `comply_legal_messages` (4 rows), `comply_legal_milestones` (1) — no `tenant_id` of their own,
  no RLS. `hudumika_app` read every tenant's rows.
- **Fix:** `apps/api/src/db/migrations/458_child_table_rls_gap.sql` — EXISTS-through-parent policy
  keyed on each table's real structural FK (`declarations`, `delivery_documents`,
  `declaration_notices`, `geofences`, `hr_teams`, `comply_legal_engagements`). Same pattern as
  `440_contacts_rls_gap.sql`.
- **Re-test:** owning tenant sees exactly its rows (`comply_legal_messages`: tenant X → 2, tenant
  Y → 2), every other/bogus tenant → 0.

---

## HIGH

### HUD-0004 — ~40 non-tenant tables unclassified for isolation · OPEN
- **Category:** Security / multi-tenant isolation (residual)
- **Evidence:** 81 tables have neither `tenant_id` nor RLS. Triage done:
  - **Global reference (correct as-is, RLS would break reads):** `hs_codes`, `sanctions_entries`
    (18k), `sanctions_aliases` (27k), `reference_countries`, `port_tariff_items`,
    `trade_procedures*`, `trade_institutions`, `eac_excise_schedules`, `fx_rates`,
    `dangerous_goods_reference`, `carrier_directory`, `clearing_agents_registry`, `icd_directory`,
    `comply_license_catalog`, `comply_obligation_rules`, `comply_agency_directory`,
    `comply_legal_firms`, `cit_rate_reference`, `wht_rate_reference`, `wma_hs_codes`,
    `tax_jurisdictions`, `tax_code_components`, `origin_rules`, `seal_dg_segregation_rules`,
    `sign_jurisdiction_rules`, `metric_definitions`, `package*`, `packages`.
  - **Platform tables (accessed via `dbPlatform`, isolation is by design):** `tenants`,
    `_migrations`, `organizations`, `organization_users`, `app_status`, `agency_managed_tenants`,
    `password_reset_tokens`, `ondi_oauth_clients`, `ondi_oidc_signing_keys`,
    `platform_signing_identities`, `sign_signing_keys`, `referral_commissions`.
  - **Needs a dedicated pass (HUD-0008):** `api_*`, `dev_*`, `developer_*`, `marketplace_apps`
    (Developer app, 15% built), `lens_*` (internal PM tool), `report_runs` (80), `report_definitions`,
    `query_builder_runs` (8, SuperAdmin-only), `workflow_templates` (4), `workflow_template_proposals`,
    `workflow_learning_signals`, `semantic_entities`, `vessel_positions`.
- **Proposed fix:** confirm each platform/dev table is genuinely `dbPlatform`-only or add a
  deny-all-for-app-role policy; scope `report_runs`/`report_definitions` if HuduBI is tenant-facing.
- **Risk if unfixed:** if any route queries these via the plain `db`/`withTenant` path they leak
  across tenants; low likelihood for reference tables, real for `report_runs`.

### HUD-0005 — Effectively no automated test coverage · OPEN
- **Category:** Testing & regression
- **Evidence:** `apps/api` — 7 `*.test.ts` files. `apps/web` — 0 test files. Against 195 route
  modules, 153 services, 40 jobs, 468 pages. `package.json` has `vitest` wired but the suite
  covers a sliver.
- **Impact:** no regression net. Every fix in this audit (and every prior multi-agent change) is
  unverified against future edits. Quality gate "Tests cover critical workflows" = FAIL.
- **Proposed fix:** add API integration tests for the mandatory-gate workflows first —
  tenant-isolation assertions (a permanent guard for HUD-0001/2/3), auth/session, RBAC per role,
  invoice/GL posting, declaration lifecycle. Then web E2E for the top journeys.

### HUD-0006 — CI does not gate on build / typecheck / tests · OPEN
- **Category:** DevOps / CI-CD
- **Evidence:** `.github/workflows/` contains only `dependency-audit.yml`, and that is
  `continue-on-error: true`. No workflow runs `tsc`, `eslint`, `vitest`, `npm run build`, or
  migration validation. "A green pipeline must mean something" — here it means only that
  `npm ci` succeeded.
- **Proposed fix:** add a `ci.yml` running (per workspace) typecheck + lint + `vitest run` +
  `npm run build` + `check:triggers` + a migration dry-run against an ephemeral Postgres.

### HUD-0007 — `tenant_id` column type inconsistent (uuid vs text) · OPEN
- **Category:** Database / schema consistency
- **Evidence:** 12 tables store `tenant_id` as `text` (uuid-format strings): all 3 `cms_*` and 9
  `comply_*`. Every other tenant table uses `uuid`. Forces a second RLS policy variant and blocks
  a uniform FK to `tenants(id)`.
- **Proposed fix:** migrate these columns to `uuid` (data is already uuid-format) in a dedicated
  migration with FK add; low risk (small row counts) but touches live comply data — schedule
  deliberately.

### HUD-0008 — Developer-platform & analytics tables isolation unconfirmed · OPEN
- **Category:** Security / multi-tenant isolation
- **Evidence:** `api_*` / `dev_*` / `developer_*` / `marketplace_apps` / `lens_*` /
  `report_runs` / `query_builder_runs` / `workflow_templates*` — no `tenant_id`, no RLS, mix of
  audit-only FKs to `users`. Developer app is 15% built; Lens is an internal tool. Not a
  confirmed leak, not confirmed safe.
- **Proposed fix:** trace each table's routes; `dbPlatform`-only → add deny-all-for-app policy;
  tenant-facing → add `tenant_id` + policy.

### HUD-0009 — Migration history drift · FIXED (VERIFIED)
- **Category:** Database / deployment
- **Evidence:** `_migrations` had 479 applied filenames; `migrations/` had 470 `.sql` files on
  disk (+15 duplicate-numbered prefixes, 1 `036b_`). 6 tracked filenames no longer existed on
  disk: `008_permissions.sql`, `009_org_chart.sql`, `010_hr_timeclock.sql`, `011_hr_tasks.sql`,
  `012_expenses_recurring.sql`, `094_marketplace_framework.sql`.
- **Proven, not assumed:** created a throwaway database (`hud_fresh_check`, same Postgres
  cluster) and ran `db:migrate` against it end to end. It failed twice, confirming the drift was
  real, not just a filename curiosity:
  1. `077_marketplace_apps.sql`'s seed INSERTs used `(SELECT id FROM users LIMIT 1)` for
     `developer_id NOT NULL` — on a genuinely empty database (no users yet) that subquery
     returns NULL and the INSERT violates the constraint. Historically harmless only because
     migrations always ran against a DB that already had at least one user.
  2. `456_tenant_rls_gap_batch.sql` (this audit's own migration) then failed with
     `relation "complyos_marketplace_requests" does not exist` — that table holds 1 real row on
     the live database but **no migration file creates it anywhere in the repo**; it was created
     by one of the 6 missing files (almost certainly `094_marketplace_framework.sql`) and never
     recreated since. Confirmed orphaned: zero references in `apps/api/src/routes` or `services`.
- **Fix:**
  - `077_marketplace_apps.sql` — added `WHERE EXISTS (SELECT 1 FROM users)` to each of the 3
    seed INSERTs (safe: already applied on the live DB, so this edit only changes fresh-install
    behaviour — seed rows are skipped instead of erroring when no user exists yet).
  - `100_recover_complyos_marketplace_requests.sql` (new, sorts before 456) — recreates
    `complyos_marketplace_requests` **verbatim** from the live schema (columns, types, defaults,
    PK, 3 FKs, 3 indexes, 1 CHECK constraint), captured via `information_schema`/`pg_constraint`/
    `pg_indexes` before writing it. `CREATE TABLE/INDEX IF NOT EXISTS` — a no-op when run against
    the live DB (already applied there too, confirmed row count unchanged at 1).
- **Re-test:** fresh `hud_fresh_check` database, `db:migrate` end to end →
  **474/474 migrations applied, exit 0.** Full schema diff against the live database
  (tables / columns / RLS state): **0 tables missing, 0 column mismatches, 0 RLS mismatches**
  on every table both databases share. One residual, see HUD-0019.
- **Regression:** full API suite still 9 files / 87 tests passing; `tsc --noEmit` clean;
  `check:triggers` OK.

---

## MEDIUM

### HUD-0010 — Repo root littered with scratch artifacts · OPEN
`api_dev.log` (27 MB), `recheck_dev.log` (13 MB), `temp-script*.mjs`, `fix_imports.js`,
`refactor_back_buttons.js`, `scratch_check.js`, `*_dump.html`, `dnd_test.png`,
`trade_procedures_*.json` (2.5 MB) all sit at repo root. Gitignored logs aside, several `.js`/`.mjs`
one-off scripts and `.html` dumps **are** tracked. Move to `scripts/` or delete.

### HUD-0011 — `apps/web` has zero tests despite `vitest` config · OPEN
Sub-item of HUD-0005 tracked separately because the fix owner differs (frontend).

### HUD-0012 — `npm audit` backlog acknowledged but unowned · OPEN
CI comment lists real high/critical findings (`fast-jwt`, `@fastify/static` path-traversal,
`brace-expansion` DoS) whose fix is a forced major bump of fastify/@fastify-jwt/vite. No owner,
no plan. Needs a tracked upgrade task per package.

### HUD-0013 — Empty `catch {}` in auth-adjacent code · OPEN
`recordLogin` swallows all errors ("login/device tracking must never block auth") — intentional
but means a broken `hr_login_history` write (e.g. the RLS `WITH CHECK` this audit just added, if a
caller ever runs it outside `withTenant`) fails silently and lockout/audit data is lost with no
signal. Add a `logger.warn` inside the catch.

### HUD-0014 — Partition RLS relies on PG13 through-parent semantics · OPEN
`shipment_cases` isolation now depends on the parent policy for through-parent queries plus
per-partition policies (added in 457). New partitions created in future years need the same
`ENABLE/FORCE/POLICY` applied — add to the partition-creation migration/job or a check in CI.

---

## LOW

### HUD-0015 — `DATABASE_URL` default in `config/env.ts` points at wrong creds · OPEN
Default `postgresql://clearos:clearos_pass@localhost:5432/clearos` fails auth; real config comes
from root `.env` (`postgres@localhost:5433`). A dev following defaults gets an auth error. Align
the default or document it in `.env.example`.

### HUD-0016 — `.env.example` missing keys present in `.env` · OPEN
Root `.env` carries `DATABASE_URL_APP/READONLY/PLATFORM`, `JWT_SECRET`, MinIO, Meta WA, SMTP, AIS
keys. Confirm `.env.example` lists every key a fresh clone needs.

### HUD-0017 — Two large committed HTML dumps · OPEN
`DESIGN_SYSTEM_ASSETS.html` (100 KB), `hudumika-architecture.html` (81 KB), `my_app_dump.html`,
`step_dump.html` — stale generated artifacts in VCS. Move to `docs/` or drop.

### HUD-0019 — Two dead, orphaned "marketplace request" tables · OPEN
- **Category:** Database / architecture (Phase 30/31 — multi-agent duplicate concepts)
- **Evidence:** found while proving HUD-0009's fresh-install fix. Two near-identically-purposed
  tables, neither referenced by any current route or service:
  - `complyos_marketplace_requests` — exists live (1 row), customer/source_module/
    service_category shaped. Its creating migration is one of the 6 lost (HUD-0009); recreated
    schema-only in `100_recover_complyos_marketplace_requests.sql` so fresh matches live.
  - `compliance_marketplace_requests` — created by `093_compliance_marketplace_requests.sql`
    (Trade-Wizard driven, procedure_id/contact_*), applied and tracked in `_migrations`, but
    **does not exist on the live database** — someone dropped it outside the migration system
    after 093 ran, with no corresponding migration recording the drop. A fresh install recreates
    it (093 is still on disk); live does not have it. Confirmed via a full schema diff between a
    from-scratch migrated database and the live one — this table is the only difference.
- **Impact:** low (zero rows either way, zero code paths). Real cost is architectural noise —
  exactly the "different agents solved the same problem twice" pattern Phase 31 asks to find.
- **Proposed fix:** confirm with the team that both are dead, then in one migration:
  `DROP TABLE complyos_marketplace_requests` (or keep if a ComplyOS marketplace feature is
  actually planned) and either finish wiring `compliance_marketplace_requests` to the Trade
  Wizard or drop it too. Do not drop silently — Phase 41/42 (no destructive change without
  understanding existing data) — this is flagged for a decision, not auto-removed.

### HUD-0018 — `tenant_settings` sentinel default row under the all-zeros tenant_id · OPEN
- **Category:** Database / data model
- **Evidence:** `tenant_settings` has a row with `tenant_id = '00000000-0000-0000-0000-000000000000'`
  and no matching `tenants` row — a "platform default settings" sentinel. Found because the RLS
  regression test's bogus-tenant probe (all-zeros uuid) matched it.
- **Impact:** low. RLS handles it correctly (only a session whose `app.tenant_id` is literally
  all-zeros sees it — i.e. nothing real). But it's an implicit convention with no FK, no comment,
  no CHECK. Any future `tenant_id uuid REFERENCES tenants(id)` FK (see HUD-0007) would reject it.
- **Proposed fix:** document the sentinel, or move platform defaults to a dedicated
  `platform_settings` table with no `tenant_id`.

---

## Phases not yet executed (tracked as UNVERIFIED, not PASS)

| Phase | Area | Status |
|-------|------|--------|
| 5 | Functional tracing (every action → DB) | UNVERIFIED |
| 6 | Full security sweep (SSRF, path traversal, file access, injection) | PARTIAL — CORS/helmet/rate-limit/secrets checked; rest pending |
| 7 | Data integrity (idempotency, concurrent edits, rollback) | UNVERIFIED |
| 8 | UI/UX forensic | UNVERIFIED |
| 9 | Responsive / mobile (12 breakpoints) | UNVERIFIED |
| 10 | Accessibility | UNVERIFIED |
| 11 | Performance (100 → 100k rows, N+1) | UNVERIFIED |
| 12 | Third-party integrations (9 integrations, webhook sig, idempotency) | UNVERIFIED |
| 13 | Test authoring | UNVERIFIED (see HUD-0005) |
| 14 | RBAC matrix per role, per route | UNVERIFIED |
| 15–18 | Remediation / regression / adversarial / scoring | IN PROGRESS |
