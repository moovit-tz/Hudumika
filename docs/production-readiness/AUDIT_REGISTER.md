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
| CRITICAL | 0 | 6 | 6 |
| HIGH | 5 | 8 | 13 |
| MEDIUM | 5 | 0 | 5 |
| LOW | 6 | 0 | 6 |

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
| Authorization enforced server-side | **PARTIAL** — 8 gaps found+fixed live across 7 files (HUD-0023/0025/0026/0027/0028/0029/0030); 11 more candidates found, not yet fixed (HUD-0031); ~40 files still fully untriaged | HUD-0024/0031 |
| Core workflows E2E | **UNVERIFIED** — Phase 5 not yet run platform-wide | — |
| Production build | **UNVERIFIED** — `npm run build` not yet run | — |
| CI meaningful | **PASS** — `ci.yml` gates on typecheck, fresh-DB migrate, API tests against that fresh DB, and full build; proven locally end to end | HUD-0006 |
| Test coverage of critical workflows | **FAIL** — 9 API test files, 0 web test files for 195 routes / 153 services | HUD-0005 |
| Database migrations reproduce prod | **PASS** — fresh-DB proof: 474/474 migrations apply clean; full schema diff vs. live = 0 table/column/RLS mismatches | HUD-0009 |
| Production build | **PASS** — `npm run build` (types/ui/api/web) now succeeds; was broken (HUD-0020) | HUD-0020 |
| API survives a dropped DB connection | **PASS** — was FAIL, crashed the whole process on a live connection drop during this audit | HUD-0021 |

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

### HUD-0023 — Onsite (infrastructure/hosting) had zero role-based authorization · FIXED (VERIFIED)
- **Category:** Authorization / privilege escalation (Phase 14 RBAC matrix)
- **Evidence:** `apps/api/src/routes/onsite.routes.ts` (~50 mutating endpoints — create/delete
  servers, create/delete domains, DNS records, deploy applications, clone apps, create/read/
  delete deploy secrets) was gated only by `fastify.authenticate` + `requireEntitlement('onsite')`
  — a **feature/plan** check, not a role check. Any authenticated member of a tenant whose plan
  includes the `onsite` feature (confirmed: `growth`/`scale`/`enterprise`/`starter` all do) could
  reach every one of these routes regardless of role.
- **Proven live, not inferred:** signed real JWTs for a `JUNIOR` and — more seriously — a
  `CUSTOMER`-role portal account in the dev tenant. Both successfully `POST`ed a new
  `onsite_health_checks` row (201) and `DELETE`d it (200) through the actual HTTP route. A
  customer-portal account creating and deleting infrastructure-monitoring records (and, by the
  same code path with no additional guard, servers/domains/secrets) is a real privilege-escalation
  vulnerability, not a theoretical one.
- **Root cause:** the file's own header comment said "All routes in this module require valid
  auth + onsite entitlement" — entitlement was conflated with authorization. Every other
  admin/infra-adjacent route file in this codebase (`hr.routes.ts`'s department/designation/shift
  mutations, `org-chart.routes.ts`, `settings.routes.ts`) pairs its entitlement check with a role
  check; this file never got one.
- **Fix:** one added file-level hook, matching the codebase's own convention exactly:
  `fastify.addHook('preHandler', requireRole('SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER'))`.
  Applied to the whole file (reads included) — nothing in the frontend (`OnsiteShell.tsx` has no
  role gating of its own either) or the route semantics suggested any lower-privileged role has a
  legitimate reason to view server/domain/secret-key inventories, so there was no reason to
  split read vs. write exposure.
- **Re-test:** same live probe, same two accounts — `GET /v1/onsite/overview` now returns
  **403** for both `JUNIOR` and `CUSTOMER`. A `TENANT_ADMIN` JWT still gets **200** with real
  data — legitimate access preserved. Full API suite still green (10 files / 103 tests).
- **Methodology note:** found via an automated triage scan of all 195 route files for mutating
  endpoints with no `requireRole`-family preHandler and no recognizable inline
  ownership/role/approver check, refined twice after it flagged legitimate patterns this codebase
  actually uses (named-approver checks in `bills.routes.ts`/`petti.routes.ts`, alternate guard
  names like `requireRoleOrOrgPermission`, deliberate `410 Gone` stubs in `permissions.routes.ts`
  and the old `hr.routes.ts`/`nexushr.routes.ts` payroll paths). After removing those false
  positives the scan still had ~300 candidates across 58 files — too many to hand-verify in this
  pass. Onsite was the one actually read end-to-end and proven live because it was the highest-
  stakes candidate (infrastructure, not a calculator or AI-summary endpoint). **The remaining ~57
  files are unreviewed — this is a triage result, not a completed Phase 14.** See HUD-0024.

### HUD-0030 — `onsite-backups.routes.ts`: same Onsite gap, separate file, missed by HUD-0023 · FIXED (VERIFIED)
- **Category:** Authorization / privilege escalation (Phase 14, HUD-0024 continuation)
- **Evidence:** `POST /v1/onsite/backups/:id/restore` (overwrites live tenant config from a
  snapshot) and `DELETE /v1/onsite/backups/:id` had the identical gap HUD-0023 fixed —
  `requireEntitlement('onsite')` only, no role check — but live in a **separate route file**
  (`onsite-backups.routes.ts`) that HUD-0023's fix to `onsite.routes.ts` never touched. Found by
  systematically probing every remaining flagged file's base route with a real `CUSTOMER` JWT:
  `GET /v1/onsite/backups` returned 200.
- **Fix:** identical guard — `requireRole('SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER')`.
- **Re-test, live:** `CUSTOMER` JWT → 403; `TENANT_ADMIN` JWT → 200 (`{data:[]}`).

### HUD-0027 — Sign envelopes/templates: no mutation ever checked who owned them · FIXED (VERIFIED)
- **Category:** Authorization (Phase 14, HUD-0024 continuation)
- **Evidence:** `sign.routes.ts` — `PUT /envelopes/:id` (full edit), `PATCH /:id/title`,
  `POST /:id/send`, `POST /:id/remind`, `DELETE /:id` (void), `POST /:id/amend`,
  `DELETE /templates/:id`, `POST /templates/:id/bulk-send` all fetched the row scoped only to
  `tenant_id` — never to `created_by`. Any authenticated tenant member with 'sign' entitlement
  could void, resend, retitle or fully re-edit **any other user's** envelope, including one
  still in draft. This directly contradicts a rule the file already enforces elsewhere:
  `GET /envelopes?view=all` treats a draft as private to its creator and gates the tenant-wide
  view behind `DOCUMENT_ADMIN_ROLES` — that rule just was never applied to the single-record
  mutation endpoints, or to `GET /envelopes/:id` (fetchable by id regardless of draft/owner).
  `POST /journal/:eventId/correction` (annotating the tamper-evident audit trail) had no check
  of any kind.
- **Fix:** a shared `assertCanActOnEnvelope()` helper — creator (`created_by === user.sub`) OR
  `DOCUMENT_ADMIN_ROLES` (the same admin tier `sign-forensics.routes.ts` already uses for
  comparably sensitive material) — applied to all 8 mutation sites plus the single-envelope
  `GET` (only for `status === 'draft'`, matching the list endpoint's own rule exactly; sent/
  completed/voided/declined envelopes stay tenant-wide readable, unchanged). The journal
  correction endpoint got its own, stricter `DOCUMENT_ADMIN_ROLES`-only check — it's an
  authoritative correction to someone else's audit record, not something ownership should grant.
- **Re-test, live:** a `SALES`-role JWT (not the envelope's creator, not an admin) got **403**
  attempting `PATCH /envelopes/:id/title` on an existing `sent` envelope it didn't create;
  `GET` on that same non-draft envelope stayed **200** (reads unaffected for non-drafts, as
  intended). Full suite still green.

### HUD-0028 — Contacts: the tenant's internal address book was reachable by CUSTOMER accounts · FIXED (VERIFIED)
- **Category:** Authorization (Phase 14, HUD-0024 continuation)
- **Evidence:** `contacts.routes.ts` has no role check anywhere (by design — neither does the
  frontend; it's a flat, shared address book any internal staff role can already manage). But
  "any authenticated tenant member" also includes `CUSTOMER` — an external portal account with
  no legitimate reason to browse, bulk-delete, import into, or merge the tenant's internal
  contact book. Proven live: `GET /v1/contacts` returned 200 for a `CUSTOMER` JWT (empty in this
  tenant, but the access itself is the bug — the same route also serves `POST /bulk-delete`,
  `POST /import`, `POST /merge`).
- **Fix:** one added file-level check rejecting `role === 'CUSTOMER'` specifically — every
  internal role keeps exactly the flat access it already had; nothing else changed.
- **Re-test, live:** `CUSTOMER` → 403 (`"Not available for this account type."`); `JUNIOR` → 200
  (unaffected).

### HUD-0029 — CMS/OneSite: a CUSTOMER account could edit or delete the tenant's public website · FIXED (VERIFIED)
- **Category:** Authorization (Phase 14, HUD-0024 continuation)
- **Evidence:** `cms.routes.ts`'s tenant-route hook (applied by URL prefix to `/pages`, `/posts`,
  `/comments`, `/site-settings`) ran `fastify.authenticate` + `requireEntitlement('onesite')`
  only. A `CUSTOMER`-role JWT could reach `PUT /site-settings` and `DELETE /pages/:id` — the
  tenant's own public-facing marketing site. Proven live: `GET /v1/cms/pages` → 200 for a
  `CUSTOMER` JWT.
- **Fix:** same shape as HUD-0028 — reject `role === 'CUSTOMER'` in the existing prefix-scoped
  hook, right after the entitlement check.
- **Re-test, live:** `CUSTOMER` → 403; `JUNIOR` → 200 (unaffected).

### HUD-0031 — More CUSTOMER-reachable internal endpoints found; not yet fixed · OPEN
- **Category:** Authorization (Phase 14, HUD-0024 continuation)
- **Evidence:** having established "can a CUSTOMER JWT even reach this app's base route" as a
  fast, high-confidence signal (4 for 4 real bugs when checked: Contacts/CMS/Onsite/Onsite-
  backups), the same probe was run against every other remaining flagged file's base GET. Real
  data came back (200, not just an empty array — i.e. genuinely reachable, not merely
  "authenticated but nothing to show") for: **`/v1/petti/wallets`** (wallet/financial data),
  **`/v1/sanctions/screenings`** (compliance screening results), **`/v1/notes`** (returned a
  real note row, though title/content were blank for this one), **`/v1/org/tickets`**,
  **`/v1/seal/compartments`**, **`/v1/reference/icd-operators`** (likely fine — looks like
  public reference data, needs confirming not assuming), **`/v1/hr/departments`**,
  **`/v1/depot/equipment`**, **`/v1/inventory/warehouses`**, **`/v1/dangerous-goods/declarations`**
  and **`/v1/declarations`** (both returned real declaration rows).
  `/v1/drives` was checked and is **already correctly blocked** (`"Not available for customer
  accounts"` — a concurrent session's own fix, not this audit's). `/v1/project-os/portfolios`
  returned a **500** for a `CUSTOMER` JWT — an unhandled exception, not yet triaged (Project OS
  is under active concurrent development — check with the owning session before touching it).
  `/v1/shipments` was checked and is **correctly scoped already** (real `customer_id`-based
  row filtering, with a safe non-matching fallback when unresolved) — not a bug, left as
  reference for what the fix should look like.
- **Proposed fix:** for each, read the actual handler (not just the base route) to confirm
  whether it's a genuine unintended-CUSTOMER-access gap (most likely) or, like `shipments`,
  already-correct scoping my probe couldn't see from one GET call. Prioritize `petti/wallets`
  (financial) and `sanctions/screenings` (compliance) first — same severity class as HUD-0025.
  This list is itself not exhaustive — only the files already flagged by the original HUD-0024
  scan were probed; the ~40 files still fully untriaged (calculators, AI, PDF tools, seal-*
  family beyond the base route, warehouse, tracker, etc.) have not been checked at all yet,
  including for this specific CUSTOMER-reachability angle.

### HUD-0025 — ComplyOS Legal Marketplace had no role gate · FIXED (VERIFIED)
- **Category:** Authorization (Phase 14 RBAC matrix, HUD-0024 follow-up)
- **Evidence:** `comply-legal.routes.ts` — create/cancel a legal engagement, message a law
  firm on the tenant's behalf, and flip a milestone's payment status
  (`pending`/`paid`/`released`) — gated only by `requireEntitlement('complyos')`, no role
  check, no service-layer check either (`LegalMarketplaceService.*` takes no actor/role
  parameter at all). Its sibling `comply.routes.ts` already carries
  `requireRoleOrOrgPermission(ORG_PERMISSIONS.COMPLY_MANAGE, ...MGMT_ROLES)` from an earlier
  audit pass (the fix's own code comment documents that prior finding) — this file was missed.
- **Fix:** same guard, same permission key, mirroring the sibling file exactly.
- **Re-test, live:** `GET /v1/comply/legal/engagements` — `JUNIOR` and `CUSTOMER` JWTs now 403,
  `TENANT_ADMIN` unaffected (200). Full suite still green (10 files / 103 tests).
- **Note:** `setMilestoneStatus` only flips a status column — no GL posting, no fund transfer,
  no Petti wallet interaction — so this was a business-process-integrity gap (any tenant member,
  including an external customer-portal account, could misrepresent legal engagement state or
  message a firm as the tenant), not a direct financial-loss one. Fixed regardless.

### HUD-0026 — Any user could overwrite or delete anyone else's avatar/logo · FIXED (VERIFIED)
- **Category:** Authorization (Phase 14 RBAC matrix, HUD-0024 follow-up)
- **Evidence:** `identity.routes.ts` `PUT`/`DELETE /:kind/:id/avatar` (the shared avatar/logo
  endpoint documented in CLAUDE.md, backing `PersonAvatar`/`CompanyAvatar`/`AvatarPicker`
  platform-wide across 6 subject kinds — people/customers/leads/contacts/drivers/suppliers) had
  no ownership or role check at all: any authenticated tenant member could set or clear the
  picture on ANY `id`, including another person's own profile photo or a customer/lead/driver/
  supplier's logo.
- **Fix:** `(kind === 'people' && id === user.sub) || MGMT_ROLES.includes(user.role)` — self-
  service on your own picture (the actual product feature) stays open to everyone; every other
  case (a colleague's photo, any non-person subject's logo) now needs a management role.
- **Re-test, live:** a `JUNIOR` and a `CUSTOMER` JWT both get **403** attempting to `PUT` another
  user's avatar; the same `JUNIOR` JWT successfully sets (200) and then deletes (200) **their own**
  avatar — self-service unaffected. Full suite still green.

### HUD-0024 — RBAC matrix (Phase 14) triaged, not completed · OPEN
- **Category:** Authorization (process/coverage gap)
- **Evidence:** the scan behind HUD-0023 flagged ~300 mutating routes across 58 files with no
  `requireRole`-family guard and no recognizable inline check. Manually reading each one's
  actual authorization story (some are legitimately open self-service actions — e.g. a user
  consenting to their own activity monitoring, a PDF tool operating only on a file the caller
  uploaded; some delegate to a service-layer check my route-level scan can't see; at least one,
  Onsite, was a real gap) was only done for the single highest-stakes file.
- **Proposed fix:** work through the remaining files in domain-sensitivity order, reading the
  actual handler (and any service it calls) rather than trusting the route file alone, and where
  a real gap is found, fix + prove live exactly as HUD-0023/0025/0026 did.
- **Reviewed this pass:**
  - `onsite.routes.ts` — real gap, fixed (HUD-0023).
  - `onsite-backups.routes.ts` — same gap, separate file, fixed (HUD-0030).
  - `comply-legal.routes.ts` — real gap, fixed (HUD-0025).
  - `identity.routes.ts` — real gap, fixed (HUD-0026).
  - `sign.routes.ts` — real gap (ownership, not role), fixed (HUD-0027).
  - `contacts.routes.ts` — real gap (CUSTOMER-reachable), fixed (HUD-0028).
  - `cms.routes.ts` — real gap (CUSTOMER-reachable), fixed (HUD-0029).
  - `billing.routes.ts` — already correctly gated (`requireRoleOrOrgPermission(...MGMT)`);
    original scan hit was a false positive from before the guard-detection regex was broadened.
  - `seal-billing.routes.ts` (`POST /lots/:id/generate-storage-invoice`) — reviewed and left
    as-is: the code comment documents a deliberate design — this creates a **Draft**
    `sales_invoices` row only (no GL posting), specifically so a SEAL-only warehouse manager
    doesn't need FinOps provisioning to generate it; the real gate (finalize/send) is enforced by
    `invoices.routes.ts`'s own FINANCE/MANAGER/ADMIN+ role check. Not a gap.
  - `org.routes.ts POST /claim` — reviewed and left as-is: a one-time-code redemption flow
    (capability-token model, same shape as password reset) — possession of a valid, unexpired,
    unused code is the authorization; a role check would be meaningless here. Not a gap.
  - `hr.routes.ts PATCH /profile/avatar` — reviewed and left as-is: already correctly
    self-scoped (`.where('id', '=', user.sub)`) — genuinely a false-positive scan hit; the
    file's separate `PATCH /staff/:id/avatar` (editing someone else's) is already
    `requireRole`-gated. `/time/:id/{stop,ack,extend}` were reviewed but **not** fixed — no
    ownership check either, but plausibly a manager routinely closes out a colleague's forgotten
    clock-out; left as a judgment call pending clearer evidence, not waved through as fine.
  - `shipments.routes.ts` — checked specifically because it looked CUSTOMER-relevant by nature;
    already correctly scoped (`customer_id`-based filter with a safe non-matching fallback). Not
    a gap — kept as the reference example of what "done right" looks like here.
  - `drives.routes.ts` — checked; already correctly blocks `CUSTOMER` (a concurrent session's
    own fix, not this audit's).
- **New candidates found this pass, not yet fixed:** see HUD-0031 — a CUSTOMER-JWT reachability
  probe run against the remaining flagged files' base routes found real, non-empty data
  reachable at `/v1/petti/wallets`, `/v1/sanctions/screenings`, `/v1/notes`, `/v1/org/tickets`,
  `/v1/seal/compartments`, `/v1/reference/icd-operators`, `/v1/hr/departments`,
  `/v1/depot/equipment`, `/v1/inventory/warehouses`, `/v1/dangerous-goods/declarations`,
  `/v1/declarations` — and a 500 at `/v1/project-os/portfolios`. None of these fixed yet.
- **Still fully untriaged:** ~40 files not touched by either the file-read pass or the
  CUSTOMER-reachability probe — the `seal-*` sub-files beyond the base route, `warehouse.routes.ts`,
  `tracker.routes.ts`, `inventory-*` beyond the base route, and the large lower-risk tail
  (calculators, AI assist, PDF tools, calendar/notes/chat self-service actions — plausibly fine
  to stay open to any authenticated user, but not yet confirmed either way).

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

### HUD-0006 — CI does not gate on build / typecheck / tests · FIXED (VERIFIED)
- **Category:** DevOps / CI-CD
- **Evidence:** `.github/workflows/` contained only `dependency-audit.yml`, `continue-on-error:
  true`. No workflow ran `tsc`, `vitest`, `npm run build`, or migration validation.
- **Fix:** added `.github/workflows/ci.yml` — Postgres 13 service container, `npm run typecheck`
  (api + web + `check:triggers`), `npm run db:migrate` against the fresh service-container
  database (the HUD-0009 proof, now automatic on every push/PR), `npm test -w apps/api` against
  that same freshly-migrated database, `npm run build` (all 4 workspaces). Deliberately does
  **not** invoke `npm run lint` (see HUD-0020) or `apps/web` tests (see HUD-0005) — including a
  step that always fails for reasons unrelated to the change under review isn't a real gate.
- **Re-test, done locally against the exact recipe (not just written and assumed correct):**
  created a from-scratch database, ran migrate → 474/474 applied; ran the full API suite against
  it with `DATABASE_URL_APP`/`DATABASE_URL_PLATFORM`/`DATABASE_URL_READONLY` pointed at the fresh
  DB (not the long-lived dev database) → **9 files / 87 tests passed**; ran `npm run build` → all
  4 workspaces (`types`, `ui`, `api`, `web`) built clean. This also caught two more real bugs
  before they could ever reach CI — see HUD-0020 and the `compliance_marketplace_requests` note
  under HUD-0009.

### HUD-0020 — `npm run build` was broken; `packages/ui` cannot compile · FIXED (VERIFIED)
- **Category:** Build / dependency
- **Evidence:** `packages/ui/tsconfig.json` extends `tsconfig.base.json` (`lib: ["ES2022"]`,
  correct for the Node-only `apps/api`) with no DOM override, but `Drawer.tsx`/`Modal.tsx` use
  `document` and `KeyboardEvent`. `npm run build` therefore failed at step 2 of 4
  (`packages/types` → **`packages/ui` fails** → `apps/api` / `apps/web` never even attempted).
  Given the file dates (`Drawer.tsx`/`Modal.tsx` untouched since Jul 22), the root `build` script
  had likely never succeeded.
- **Fix:** added `"lib": ["DOM", "DOM.Iterable", "ES2022"]` to `packages/ui/tsconfig.json`,
  matching `apps/web/tsconfig.json`'s own lib list exactly.
- **Re-test:** `npm run build` — all 4 workspaces build clean, exit 0.
- **Related architecture note:** only one file in the whole app (`ShipmentRow.tsx`) imports from
  `@hudumika/ui`; the real, actively-developed design system is `apps/web/src/components/ui/`
  per CLAUDE.md. `packages/ui` is a small, mostly-abandoned earlier package (Phase 31 — duplicate
  implementation from earlier development). Not removed here (one real caller); worth a decision
  later on whether to port that one usage and retire the package.

### HUD-0021 — Any dropped DB connection crashed the entire API process · FIXED (VERIFIED)
- **Category:** Reliability / error handling (CRITICAL in production; found live, not theorized)
- **Evidence:** the API dev server crashed mid-audit with `Error: Connection terminated
  unexpectedly` from `pg`, `Unhandled 'error' event`, taking the whole Node process down —
  confirmed in `recheck_dev.log`. Root cause: `apps/api/src/db/client.ts` creates three
  `pg.Pool`s (`pool`/`hudumika_app`, `readonlyPool`/`hudumika_readonly`,
  `platformPool`/`hudumika_platform`) and `db/migrate.ts` a fourth, **none with an `.on('error',
  …)` listener**. node-postgres's own documented behavior: an idle pooled client stays connected
  to its backend, so a dropped connection (network blip, Postgres restart, a killed idle
  session) emits `'error'` on the *pool* itself, not on any in-flight query — with no listener,
  Node treats it as an unhandled error and kills the process. In production this means **any
  transient database hiccup takes down the API for every tenant simultaneously**, with no
  graceful reconnect, regardless of how solid the RLS/RBAC/etc. work above it is.
- **Fix:** added a `pool.on('error', …)` handler (logs and lets the pool recycle the client — the
  standard node-postgres-recommended fix) to all 4 pools (`pool`, `readonlyPool`, `platformPool`
  in `db/client.ts`; the migration pool in `db/migrate.ts`).
- **Re-test:** restarted the API, `tsc --noEmit` clean, full suite still 9 files / 87 tests
  passing, `tsx watch`'s hot-reload of the edited file itself didn't crash the process.
  (Reproducing the original network-drop condition on demand wasn't attempted — the fix is the
  library-documented one for exactly this error shape.)
- **Note on cause:** this session ran many short-lived, ad-hoc `pg.Client`/`pg.Pool` connections
  and repeated `CREATE DATABASE`/`DROP DATABASE` while proving HUD-0009 and HUD-0006. Postgres's
  connection count was checked immediately after (6 of 100 `max_connections`, nowhere near the
  limit) so exhaustion wasn't the trigger, but a `DROP DATABASE` or similar exclusive operation
  can still transiently disrupt unrelated sessions on the same server. Whatever the exact
  trigger, the underlying gap — zero resilience to a dropped connection — was real and
  pre-existing; this audit is what surfaced it.

### HUD-0022 — `npm run lint` is completely non-functional · OPEN
- **Category:** DevOps / code quality
- **Evidence:** root `package.json`'s `lint` script is `eslint . --ext .ts,.tsx`; `eslint` is not
  installed (not in any `devDependencies`) and no `.eslintrc*` / `eslint.config.*` exists
  anywhere in the repo. Running it fails immediately with "'eslint' is not recognized."
- **Impact:** there has never been automated linting on this codebase. Not wired into HUD-0006's
  new CI on purpose — a step that fails on every single run regardless of the change under
  review is worse than no step, and papering over it with `continue-on-error` repeats
  `dependency-audit.yml`'s existing mistake.
- **Proposed fix:** install `eslint` + `typescript-eslint` (flat config, matches the TS/ESM
  setup), pick a starting ruleset lenient enough not to fail on 468 pre-existing pages/195 routes
  on day one, add it as a real (non-`continue-on-error`) CI step once it passes clean.

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
    from-scratch migrated database and the live one — this table was the only difference.
    **Update:** 093 never gave it RLS at all, so on any fresh install (or if live ever gets it
    back) it would have shipped as another unprotected tenant table — a second HUD-0001-shaped
    gap the live-DB scan literally could not see, since the table isn't there to scan. Found only
    because HUD-0006's CI dry-run runs the full suite against a fresh database. Fixed in
    `101_compliance_marketplace_requests_rls.sql` (`ALTER TABLE IF EXISTS` / a guarded `DO`
    block, safe no-op on live where the table is absent). Re-verified: the tenant-RLS regression
    test now passes against both the live database and a from-scratch one.
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
