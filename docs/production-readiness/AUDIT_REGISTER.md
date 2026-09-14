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
| CRITICAL | 0 | 8 | 8 |
| HIGH | 8 | 35 | 43 |
| MEDIUM | 9 | 2 | 11 |
| LOW | 9 | 1 | 10 |

*This session added: HUD-0053 (Studio `tasks.create_task` crash), HUD-0055's `GET /renewals`
uuid/text join crash, and HUD-0060's supplier-bill line-schema mismatch (silent zero-value lines,
not a crash) to HIGH/Fixed; HUD-0054 (Inventory receipts/count-corrections never reach the GL) to
HIGH/Open; HUD-0055's renewal-workflow dead-end to MEDIUM/Fixed (found documented-not-fixed, then
fixed on explicit user follow-up in the same session); HUD-0057 (demurrage `liable_party`/
`liability_reason`/`WAIVED` completely unreachable through any API) to MEDIUM/Open; HUD-0058's
cross-customer quotation-approval authorization bypass to CRITICAL/Fixed (a real IDOR any customer
could exploit against any other customer's confidential quote — rated at this arc's top severity
band alongside the original HUD-0025-family findings) and its `user.id`-vs-`.sub` attribution bug,
HUD-0066's ComplyOS revoked-certificate status-masking bug, HUD-0067's budget-vs-actuals
void/reversal double-counting bug, and HUD-0070's Store CUSTOMER-portal marketplace-submission
authorization gap, HUD-0073's attendance-device `push_token` secret-leak (the sole credential
authenticating the unauthenticated biometric-device push endpoint, readable by every staff role),
and HUD-0076's FX-revaluation phantom-gain/loss-on-unposted-documents bug to HIGH/Fixed; HUD-0072's
org-chart sync-staff CUSTOMER-account data-correctness bug to MEDIUM/Fixed; HUD-0077's supplier
"blocked" status having zero enforcement anywhere to MEDIUM/Open; HUD-0080's duplicate forensic-case
'opened' custody-log rows to LOW/Fixed; a concurrent session's own HIGH fix to org-chart's
unrestricted-PII-read `GET /` gap noted as an addendum to HUD-0072 rather than a new entry (see
that entry's own addendum for detail); HUD-0032 re-rated
LOW→HIGH/Open after Phase 5 confirmed comprehensive, whole-module schema drift rather than one
endpoint's bug (Project OS, left for its owning team's concurrent rebuild); HUD-0052's noted
withdrawal-cancel-path gap and HUD-0062's zero-amount disposal journal line to LOW/Open. The
pre-existing Open/HIGH
baseline this builds on has not been independently re-audited for its own staleness in this pass
(see the HUD-0024 gate-table correction earlier in `FINAL_PRODUCTION_READINESS_REPORT.md` for a
known instance of that kind of drift) — treat the *delta* from this session as reliable, the
inherited base counts as unverified.*

*Counts are by true severity (matching `FINAL_PRODUCTION_READINESS_REPORT.md`), not by which
`##` section header an entry happens to sit under below — several entries (0025–0032) were
appended near a related finding rather than re-filed under their exact severity section;
cosmetic, not tracked as its own issue.*

Regression guard added: `apps/api/src/tests/tenant-rls-coverage.test.ts` — 7 tests,
schema-level assertion that every `tenant_id` base table plus the HUD-0003 children
and the `shipment_cases` partitions enforce `ENABLE`+`FORCE`+policy, plus a live
cross-tenant probe as the restricted role. Full API suite (as of 2026-09-11, including
a concurrent session's own new tests): **11 files / 105 tests pass**
after migrations 456/457/458 (no existing test broken).

Mandatory quality gates:

| Gate | Status | Evidence |
|------|--------|----------|
| Tenant isolation | **PASS (schema layer)** — every `tenant_id` table + structural child now RLS enforced & verified cross-tenant | HUD-0001/0002/0003 |
| No CRITICAL security issues | PASS | — |
| No exposed production secrets (client) | PASS | grep of `apps/web/src` — none |
| Authentication enforced server-side | PASS (spot-checked) | `middleware/auth.ts` — cookie+CSRF, refresh/guest/2fa-setup token rejection, device revocation |
| Authorization enforced server-side | **PARTIAL, sweep complete** — 105 gaps found and fixed live across 105 files (HUD-0023/0025–0039, 3 CRITICAL), zero known open. Every one of the 196 route files has now been read and triaged at least once for "does this gate by role, not just plan entitlement" — 91 files confirmed already correct. This closes HUD-0024's original scope; it does not mean authorization is proven airtight (see HUD-0039's closure note) — a role check that's present but logically wrong, or a flaw spanning multiple routes/services, would not be caught by this method | HUD-0024 (CLOSED) |
| Core workflows E2E | **UNVERIFIED** — Phase 5 not yet run platform-wide | — |
| Production build | **UNVERIFIED** — `npm run build` not yet run | — |
| CI meaningful | **PASS** — `ci.yml` gates on typecheck, fresh-DB migrate, API tests against that fresh DB, and full build; proven locally end to end | HUD-0006 |
| Test coverage of critical workflows | **FAIL** — 11 API test files, 0 web test files for 195 routes / 153 services | HUD-0005 |
| Database migrations reproduce prod | **PASS** — fresh-DB proof: 474/474 migrations apply clean; full schema diff vs. live = 0 table/column/RLS mismatches | HUD-0009 |
| Production build | **PASS** — `apps/api`'s `tsc --noEmit` briefly regressed (`email.routes.ts:390`) after a concurrent session's own commits (`07d8c1ce`, `9036a0c0`) landed mid-arc, unrelated to any change here (confirmed via `git log`/`git status`); resolved on its own by the next check (HUD-0076), presumably by that same concurrent session finishing its own work — clean again as of this journey | HUD-0020, HUD-0074, HUD-0076 |
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

### HUD-0031 — 21 more CUSTOMER-reachable internal endpoints across 23 files · FIXED (VERIFIED)
- **Category:** Authorization (Phase 14, HUD-0024 continuation)
- **Evidence:** having established "can a CUSTOMER JWT even reach this app's base route" as a
  fast, high-confidence signal (4 for 4 real bugs when first checked: Contacts/CMS/Onsite/Onsite-
  Backups), the same probe was run against every other remaining flagged file's base GET. Real
  data came back (200, not just an empty array) for **13 apps**: Petti wallets (financial),
  Sanctions screenings (compliance), Notes (a real "team"-visibility note row — the service's own
  sharing scope is correct, it just never excluded an external role from being "the team"), Org
  tickets, SEAL compartments (+ 8 sibling `seal-*` files sharing the same file-level-hook, plugin-
  per-file gap the HUD-0023/0030 Onsite split already proved happens), HR departments,
  NexusHR (separate file, same `/v1/hr` prefix as `hr.routes.ts`), Depot equipment, Inventory
  warehouses (+ 3 sibling files: counts/stock/tasks), Dangerous Goods declarations, and
  Declarations (+ its sibling `declaration-ledger-anchor.routes.ts`) — the last one alarming in
  its own right: `DeclarationService.list()` has **no `customer_id` scoping at all**, unlike
  `shipments.routes.ts`'s correct model, so a `CUSTOMER` got back the tenant's customs paperwork
  wholesale, not filtered to their own.
  `org.routes.ts` was a distinct sub-case: every route in it casts `req.user` straight to
  `OrgJWTPayload` (`org_id`) with **no runtime check the token is actually an `ORG` token** — an
  accident-of-query-shape "safe" (a non-ORG token's missing `org_id` happened to resolve to zero
  rows), not an enforced guarantee, and `POST /claim`'s customer-linking write would run the same
  way. Fixed by requiring `role === 'ORG'` outright, not just excluding `CUSTOMER`.
  `/v1/project-os/portfolios` returned a client-visible **500** for the `CUSTOMER` JWT — re-tested
  after fixing the gate with a legitimate `JUNIOR` JWT and got the **same 500**, proving the
  crash is a pre-existing, role-unrelated bug in `ProjectOsService.listPortfolios`, not something
  the auth fix could or should paper over (logged separately, HUD-0032; Project OS is under
  active concurrent development, so the crash itself was left for that session).
  Two apps were checked and found **already correct**, left untouched: `/v1/shipments` (real
  `customer_id`-scoped filtering with a safe non-matching fallback — the reference example of
  what "done right" looks like) and `/v1/drives` (already blocked for `CUSTOMER`, a concurrent
  session's own fix). `/v1/reference/icd-operators` was checked and is deliberately entitlement-
  free, broadly-authenticated **global reference data** (tariff/excise/ICD-operator/clearing-
  agent lookups) — correct as-is, not a gap.
- **Fix:** the same minimal, additive one-hook pattern used throughout this session — reject
  `role === 'CUSTOMER'` (or, for `org.routes.ts`, require `role === 'ORG'` specifically) in each
  file's existing preHandler chain, right after its entitlement check. No business-logic edits.
  23 files touched: `petti.routes.ts`, `sanctions.routes.ts`, `org.routes.ts`, `seal.routes.ts` +
  8 `seal-*` siblings, `hr.routes.ts`, `nexushr.routes.ts`, `depot.routes.ts`,
  `inventory-catalog.routes.ts` + 3 siblings, `dangerous-goods.routes.ts`, `declarations.routes.ts`
  + `declaration-ledger-anchor.routes.ts`, `notes.routes.ts`, `project-os.routes.ts`.
- **Re-test, live:** every one of the 13 apps' base route now returns **403** for the `CUSTOMER`
  JWT and is **unaffected (200)** for a `JUNIOR` JWT (except `org/tickets`, correctly 403 for
  `JUNIOR` too — it's not an `ORG` token either) — confirmed in one batch script hitting all 14
  endpoints simultaneously with both tokens. Full suite still green (10 files / 103 tests),
  `tsc --noEmit` clean, API healthy throughout.
- **Not exhaustive:** only the files already flagged by the original HUD-0024 scan were probed
  this way; ~40 files remain fully untriaged (calculators, AI, PDF tools, warehouse, tracker,
  the self-service tail), including for this same CUSTOMER-reachability angle — it has not been
  run against files the first regex pass didn't already flag as having an unguarded mutation.

### HUD-0033 — 10 more files: a forgery-risk stamp gap, an ownership gap on a Sign sibling file, and 6 more CUSTOMER-reachable apps · FIXED (VERIFIED)
- **Category:** Authorization (Phase 14, HUD-0024 continuation, second pass after a session
  boundary — re-verified all prior fixes were intact and committed before starting)
- **Evidence, most serious first:**
  - **`sign-stamps.routes.ts` — `PUT`/`DELETE /stamps/tenant` had zero check at all.** This is
    the tenant's one official e-signature stamp image (company seal/letterhead used when
    signing documents). Any authenticated user with 'sign' entitlement — including a `CUSTOMER`
    — could overwrite it with an arbitrary image (a real forgery vector: replace the legitimate
    stamp with a fraudulent one) or delete it outright. The file already had a correctly-role-
    gated sibling endpoint (`PUT /stamps/access`, using `STAMP_SETTINGS_ADMIN_ROLES`) and even a
    matching constant already declared — it just was never applied to the two routes that touch
    the actual image. `GET /stamps/tenant` (reading the raw stamp bytes) was also unrestricted;
    narrowed to `canApplyTenantStamp()`, the file's own existing "who may use this stamp" check,
    rather than full admin-only, since viewing is a lesser action than replacing it.
  - **`sign-versions.routes.ts` — a whole sibling file of `sign.routes.ts` with no entitlement
    check and no ownership check at all**, missed when HUD-0027 fixed the main file. Any
    authenticated user could list version history, read the full `document_data` of any past
    version, and revert-and-mutate any other user's envelope — including a still-private draft.
    Fixed by exporting `sign.routes.ts`'s own `assertCanActOnEnvelope()` and reusing it here
    rather than duplicating the rule.
  - **`sign-ai-assist.routes.ts`** had no entitlement check, and (noted, not fixed — needs
    Drive's own permission model, not a guessed one) `POST /ai-assist/analyze` accepts an
    arbitrary `file_id` and reads it straight from `cloud_files` scoped only by `tenant_id`,
    bypassing Drive's own per-file sharing rules.
  - **Six more apps reachable in full by a `CUSTOMER` JWT**, each proven live: Customs
    (`GET /penalties` — regulatory violation records, no scoping at all), AI (`GET /memory` —
    deliberately includes every workspace-shared fact, meant for internal staff), CargoTracker
    snapshots (AWB/BL tracking data for the whole tenant, unlike `shipments.routes.ts`'s correct
    per-customer model), HuduBI (cross-cutting business-intelligence dashboards — this dev
    tenant isn't entitled to it so the probe hit `PLAN_UPGRADE_REQUIRED` instead of real data,
    but any tenant that is entitled would expose it), and the HuduFreight `cargoLoading`/
    `warehouse` route files (mutations were already `FLEET_ROLES`-gated; the GET routes weren't).
  - **Confirmed already correct, left untouched:** `notifications.routes.ts` (explicitly branches
    on `role === 'CUSTOMER'` to scope by `customer_id` instead of `user_id` — someone already
    solved this correctly here), `activity-monitor.routes.ts` (self-scoped consent/samples,
    `ADMIN_ROLES`-gated settings, `LEAD_ROLES`-gated team rollup), `tasks.routes.ts` (personal
    lists scoped to `user_id` plus an explicit "shared with me" join), `comply-ocr.routes.ts` /
    `ocr.routes.ts` (stateless scan-and-return, no stored-data access), `sign-pdf-tools.routes.ts`
    (stateless PDF processing, "no persistence of its own" by the file's own header comment —
    missing `requireEntitlement('sign')` is a plan-metering gap, not a privacy/security one, and
    was left as a low-priority note rather than fixed here), `trade-wizard.routes.ts` (reference-
    data lookups + a compute endpoint).
- **Fix:** the same minimal, additive pattern as HUD-0031 — reject `role === 'CUSTOMER'` (7
  files), or the more specific ownership/admin checks described above where a blanket role
  exclusion wasn't the right shape (`sign-stamps.routes.ts`, `sign-versions.routes.ts`).
- **Re-test, live:** every finding above re-verified with real JWTs after the fix — `CUSTOMER`
  403 across all reachable-app fixes; `sign-stamps`: `CUSTOMER`/`JUNIOR` both 403 on `GET`
  (neither is in the tenant's configured `stamp_roles`), `TENANT_ADMIN` 200, `PUT` as `JUNIOR`
  403 ("Only an admin..."), `PUT` as `TENANT_ADMIN` 200 (legitimate admin flow preserved);
  `sign-versions`: a non-creator, non-admin JWT got 403 with the exact `assertCanActOnEnvelope`
  message, the actual creator got 200. Full suite green (11 files / 105 tests), `tsc --noEmit`
  clean, API healthy throughout.
- **Session-boundary note:** this fix batch started in a fresh session after a context reset.
  Before continuing, verified all of HUD-0001–0032 had survived intact — an automated commit
  (`3b699aba "Hudumika"`, not made by this agent) had captured every route-file change and the
  `AUDIT_REGISTER.md` update from the prior turn; `FINAL_PRODUCTION_READINESS_REPORT.md` had not
  yet been synced to match and was updated as the first action this turn.

### HUD-0050 — Phase 5: Onsite infrastructure journey traced live · real crash found+fixed (server provider validation)
- **Category:** Functional correctness (Phase 5, eighth journey) — real bug, HIGH severity per the
  master model ("core feature broken"). Onsite was this whole audit's *first and highest-stakes*
  RBAC finding (HUD-0023 — a `CUSTOMER` JWT could create/delete real infrastructure); this pass
  checks whether the infrastructure-provisioning mechanics themselves are correct now that the
  authorization gate is fixed.
- **Trace:** `POST /v1/onsite/domains` (real domain + auto-created DNS zone) → `GET .../dns`
  (confirmed the two default NS records) → `POST .../dns` with a deliberately invalid A record
  (bad IP) → a valid one → `DELETE .../dns/:recordId` on the apex A record without confirmation
  → with `?confirm=true` → `POST .../dns/check-propagation` (twice — once with a wrong `name`
  parameter that exposed a naming-convention misunderstanding on my part, not a bug, then
  correctly with the `'@'` apex sentinel) → `POST /v1/onsite/servers` (**crashed** — see below,
  fixed, then re-run) → `POST /servers/:id/check` (a real TCP reachability probe against a
  RFC 5737 documentation-only IP, correctly reported `stopped`) → full cleanup.
- **Result: the DNS record safety mechanics are real, not decorative.** An A record with an
  invalid IPv4 value was correctly rejected with a specific message; deleting the domain's own
  apex A record was correctly blocked with `409 requires_confirmation: true` and a plain-language
  consequence ("Removing it takes the website offline"), and proceeded only once explicitly
  confirmed — exactly matching the code's own cited design intent (ONSITE.md §62, "explain the
  consequence"). The DNS-propagation check correctly reported `propagated: false` for a
  guaranteed-unresolvable test domain (RFC 2606 `.invalid`), using the same SSRF-safe Cloudflare/
  Google DNS-over-HTTPS resolvers already reviewed clean in HUD-0040.
- **Evidence (real bug, found and fixed):** `POST /v1/onsite/servers` returned a bare
  `{"error":"An unexpected error occurred."}` `500` for `{"provider":"DigitalOcean"}` — and, to
  isolate the cause, also for a request with no `ip_address` at all, ruling out the reachability-
  probe branch. Root cause, found by reading `onsite_servers`' real constraints directly via
  `information_schema`/`pg_constraint`: `onsite_servers_provider_check` only allows the exact
  lowercase strings `manual`/`digitalocean`/`hetzner`/`aws`/`gcp`/`azure`/`internal`, while
  `serverCreateSchema` validated `provider` as a bare `z.string().max(100).optional()` with no
  connection to that enum at all — any caller typing a provider's own real branding
  ("DigitalOcean", "AWS", "GCP", "Azure" — the natural way a human or a different UI would type
  it) hit the DB's case-sensitive `CHECK` constraint and got an unhandled crash. Confirmed the
  exact lowercase string succeeds (`201`), confirming the casing mismatch as the sole cause.
  Checked whether this is reachable through the real product today: `OnsiteServers.tsx`'s own
  provider picker is a controlled `<Select>` that only ever sends the exact lowercase values
  (`useState('hetzner')` default) — so the shipped UI never hits this, but any other caller
  (a future UI, an integration, direct API use) would, with no defense at all.
- **Fix:** `serverCreateSchema`'s `provider` now runs through `z.preprocess` (lowercase +
  trim) into `z.enum(SERVER_PROVIDERS)`, where `SERVER_PROVIDERS` is a new local constant
  mirroring the DB `CHECK` constraint exactly — any casing of a real provider name is accepted,
  and a genuinely unlisted provider now returns a clean, specific `400` naming the valid options
  instead of a raw constraint-violation crash.
- **Re-test, live:** re-sent the exact original crashing payload (`"DigitalOcean"`) — `201`,
  `provider` correctly normalized to `"digitalocean"` in the stored/returned row; sent a
  genuinely invalid provider (`"totally-made-up-cloud"`) — clean `400` listing the 7 valid
  values. Full suite green (11 files / 105 tests), `tsc --noEmit` clean, `check:triggers` OK, API
  healthy throughout (one slow reload during this pass — confirmed via a retried health check
  rather than assumed).
- **Test-artifact handling:** unlike most records traced this Phase 5 arc, Onsite domains and
  servers **do** have real, unrestricted `DELETE` endpoints — all test records (1 domain, 3
  servers) were fully removed (`{"success":true}` on each), leaving no residue in the dev tenant.
  Usage counter restored to 500/500.

### HUD-0051 — Phase 5: NexusHR recruitment journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, ninth journey). No usage-gate workaround needed —
  `hr.routes.ts`'s recruitment sub-system has no `enforceUsageGate` call (unlike the metered POST
  routes hit in earlier journeys); the counter still had to be lowered/restored because the
  platform's usage gate turned out to apply globally regardless, confirmed live when the very
  first `POST /recruitment/requisitions` returned `402 USAGE_LIMIT_EXCEEDED` at 500/500.
- **Trace:** `POST /recruitment/requisitions` (DRAFT) → `submit` (SUBMITTED) → `approve` (APPROVED,
  by an APPROVER-tier actor) → `publish` (OPEN, creates the linked `hr_job_openings` row with every
  field copied across) → a re-`submit` on the now-OPEN requisition correctly refused `409` → `POST
  /recruitment/candidates` against the new opening (creates `hr_candidates` + `hr_applications`,
  stage `APPLIED`) → the identical candidate/opening pair re-submitted, correctly refused `409`
  with the existing `application_id` (the dedup-by-email-per-opening logic actually works, not just
  documented) → `POST .../applications/:id/interviews` (creates `hr_interviews` **and** a real
  `calendar_events` row — verified directly in Postgres: correct title, correct guest email/name,
  correct 45-minute window) → `PATCH .../interviews/:id` to `COMPLETED` → `POST /recruitment/offers`
  (DRAFT) → `submit` → `approve` → `send` (this is the interesting step — see below) → `mark-viewed`
  → `accept` (first without a `role`, correctly refused `400` listing the valid hire roles; then
  with `role: 'JUNIOR'`, accepted) → verified every downstream effect directly against the DB.
- **Result: CLEAN, and more tightly wired than expected.** `POST /offers/:id/send` doesn't just flip
  a status — it renders a real offer-letter PDF (`renderOfferLetterPdf`, verified live: a genuine
  3,164-byte PDF landed in `sign_envelopes.document_data`) and creates a real `sign_envelopes` +
  `sign_recipients` pair reusing the same e-signature app verified clean in HUD-0045, giving the
  candidate (who has no login anywhere in the platform) a real signable link with no bespoke
  candidate-auth system built. Accepting the offer correctly: (1) stamped `hr_applications.stage =
  'HIRED'` (confirmed in the DB, not just the response), (2) created a real, correctly-fielded
  `hr_invitations` row (7-day expiry, correct role, `PENDING` status) rather than a fabricated
  "hired" flag with no actual onboarding path, (3) emitted two accurately-typed, correctly-payloaded
  `domain_events` (`hr.requisition_approved` at the approve step, `hr.staff_invited` at the accept
  step) and two matching `hr_activity_log` rows, both chronologically correct end to end. `GET
  /recruitment/requisitions/:id` and `GET /openings/:id/applications` were both spot-checked after
  the full run and reflect the true state (closed requisition's linked opening, `HIRED` stage,
  resolved `interviewer_name`) — no stale-read or wrong-join issues like the ones found in earlier
  journeys. No code changes were needed this round.
- **Test-artifact handling:** the recruitment sub-system has **no `DELETE` endpoint anywhere** —
  requisitions, openings, candidates, applications, interviews, offers, and invitations all lack
  one, consistent with the same no-hard-delete-for-business-records pattern already confirmed in
  invoices/payroll/Sign/SEAL. Closed the test requisition via its own real state machine (`POST
  .../requisitions/:id/close`, valid only from `OPEN`), which also closed the linked job opening;
  the test candidate/application/interview/offer/invitation rows are left in the dev tenant,
  clearly labeled "Phase5 Trace" in every human-readable field. Usage counter restored to 500/500
  and confirmed.
- **Not exercised this round:** offer `decline`/`withdraw`, requisition `reject`/`cancel`, interview
  `CANCELLED` (which deletes the calendar event — code-reviewed as correct in the prior session,
  not re-driven live here), `workforce-planning`/`ai-insights` read endpoints, and resume upload/
  download. None of these were on the golden-path spine for this journey; flagging them here rather
  than silently skipping.

### HUD-0052 — Phase 5: Petti petty-cash wallet journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, tenth journey). Same global usage-gate workaround
  as every prior journey — lowered/restored `tenant_usage_counters`, confirmed restored to 500/500.
- **Trace:** `POST /wallets` (creates a real, auto-provisioned `chart_of_accounts` row — a
  non-colliding `PW-####` code, `is_system: true`) → `POST .../deposits` (500,000 TZS, method
  `manual`) → set a real named department approver (`PATCH .../approver`) → `POST .../withdrawals`
  (150,000 TZS) → **three separate authorization guards driven live, all independent of each
  other**: (a) the requester (a `TENANT_ADMIN`, an override role) tried approving their own
  request — refused 403 by a check that runs *before* the override-role check; (b) a `FINANCE`
  user who was *not* the wallet's named approver tried approving — refused 403, proving
  `FINANCE` is not automatically privileged here once a specific person is designated; (c) the
  real named approver (`JUNIOR`) approved successfully → `disburse` attempted as the same
  `JUNIOR` approver — refused 403 (disbursing needs `PETTI_FINANCE_ROLES`, approving doesn't) →
  disbursed successfully as `FINANCE` → verified in Postgres: a real `finance_expenses` row
  (`retirement_status: 'pending'`, i.e. a cash advance, not a paid-in-full expense) and a real,
  balanced `journal_lines` posting (Dr `5002` Transport Costs 150,000 / Cr the wallet's own
  `PW-0002` account 150,000) → `GET /wallets/:id` correctly derived `balance: 350000`
  (500,000 − 150,000) from the ledger, not a stored counter. Then: a second, oversized (400,000)
  withdrawal was approved but **correctly refused at disburse** with an exact insufficient-balance
  message naming the real 350,000 balance — proving the balance check runs at disburse time
  against the *current* derived balance, not a stale snapshot from approval time. A third
  withdrawal tested the reject path (refused-while-approved with a clear "wrong status" message,
  then correctly rejectable while still pending) and the self-service backup-approver mechanism —
  the named approver (`JUNIOR`) set a `SENIOR` backup via `PATCH .../approver-backup` with no
  finance-admin involvement, and that backup then successfully rejected the pending request with a
  reason, which was stamped as the approving/rejecting actor exactly as a primary approver's
  action would be. Finally downloaded `GET .../voucher.pdf` for the disbursed request and read it
  with `pdftotext`: a genuine, fully accurate PDF — correct ref (`WD-0001`), amount, payee,
  category, status, and all three trail names (`Msomi Admin`/`John Mwenda`/`Devota Mushi`)
  correctly resolved from user IDs to real display names, not placeholders.
- **Result: CLEAN.** No code changes needed. This is one of the more tightly-guarded business
  workflows traced in this arc — the named-approver-not-role check (a `FINANCE` role alone doesn't
  suffice once a specific person is designated) is a real, deliberately narrower authorization
  model than most of the platform's `requireRole(...)` route gates, and it held up under a live
  adversarial-shaped test (wrong actor tries each privileged step) rather than just the happy path.
  `GET /activity` was spot-checked after the full run and reconstructed the same event sequence
  (requested/approved/disbursed/rejected, correct actor+amount+ref on each) purely by deriving it
  from the underlying tables — confirms it's a real read, not a separately-maintained audit log
  that could drift from the source data.
- **Test-artifact handling:** wallets have no `DELETE`, only a `status` toggle — closed the test
  wallet (`PATCH .../status {"closed"}`) as the realistic cleanup action. Deposits and withdrawal
  requests have no delete/cancel path at all (same pattern as invoices/payroll/Sign/SEAL/
  recruitment) — the one oversized, approved-but-undisbursable withdrawal request (`WD-0002`) has
  no way to be cancelled or voided once approved and is left in that state permanently; this is a
  real, if minor, gap worth noting on its own (see below) rather than something this trace could
  clean up around.
- **Minor gap noted, NOT fixed (LOW):** there is no way to cancel/void an `approved` withdrawal
  request that turns out to be undisbursable (insufficient funds, plans changed) — `reject` only
  accepts `pending`, and there is no `cancel` endpoint. Such a request sits in `approved` limbo
  indefinitely, still showing in `listWithdrawalRequests`/activity as an open approved request
  needing disbursement. Low severity (a real deposit resolves it, and it doesn't block other
  wallet operations or overstate the derived balance), and fixing it well means a real design
  decision (who can cancel an approved request, and how far back a disbursed one can be reversed)
  rather than a one-line patch — flagged for a future session rather than guessed at here.

### HUD-0053 — Phase 5: Studio automation-builder journey traced live · real HIGH bug found+fixed (tasks.create_task always crashed on a real run)
- **Category:** Functional correctness (Phase 5, eleventh journey) — real bug, HIGH severity per
  the master model ("core feature broken," 100% reproducible on the documented path, not an edge
  case). Studio is the platform's general-purpose automation builder (trigger → condition → action
  node graph, Zapier-shaped); this was its first live trace in this arc.
- **Trace, and why it's the strongest test in this arc so far:** rather than calling the manual
  `POST /apps/:id/run` or `POST /trigger-event` endpoints (which exist specifically to exercise a
  workflow on demand), this journey created a workflow via `POST /apps` (trigger `lead.created`,
  a `value > 100000` condition, a `tasks.create_task` action templated with `{{payload.company}}`/
  `{{payload.value}}`/`{{payload.source}}`), set it `ACTIVE`, and then created a **real CRM lead**
  through the real `POST /v1/leads` endpoint — the exact same endpoint HUD-0048 already traced —
  with **zero manual trigger call of any kind**. The workflow fired entirely on its own through the
  real domain-event bus (`leads.routes.ts` → `emitDomainEvent('lead.created', ...)` →
  `subscribers/studio.subscribers.ts`, which the executor's own code comments describe as replacing
  a prior version that fabricated `status: 'SUCCESS'` and random durations for nodes that never
  actually ran — a past-bug-fix worth noting, though not one made this session). This is a
  meaningfully stronger check than the manual-run endpoints give: it proves the *real* production
  path, the one no "Run Test" button ever exercises, actually works.
- **Self-caught non-bug first:** the first attempt used a condition operator of `"gt"`, which
  failed with "unrecognised operator." Reading `studio/conditions.ts` (the platform's single
  operator vocabulary, shared with the ClearOS workflow-resolver) showed the real value is
  `greater_than` (or `>`) — then confirmed via `apps/web/src/pages/studio/WorkflowEditor.tsx`'s own
  `OPERATORS` list and every seeded template in `studio/templates.ts` that the real UI and every
  shipped template only ever emit registry-valid operator strings. `"gt"` was my own authoring
  mistake, not a reachable product gap — corrected and re-ran.
- **Evidence (real bug, found and fixed):** with the corrected condition, the trigger and condition
  nodes both ran and matched correctly (`{"matched": true, "operator": "greater_than"}`, live and
  provably real — the run row was written by the actual domain-event subscriber, not simulated) —
  but the action node **failed every time**: `"null value in column \"id\" of relation \"tasks\"
  violates not-null constraint"`. `tasks.id` has no DB default (confirmed via
  `information_schema.columns`) and is `NOT NULL`. Grepped every other insert into `tasks` across
  the codebase — `jobs/task-recurrence.job.ts`, `routes/calls.routes.ts`,
  `services/sign-notify.service.ts`, `routes/tasks.routes.ts` (×2), `routes/task-projects.routes.ts`
  — every single one explicitly supplies `id: crypto.randomUUID()` (or a client-supplied id).
  `studio/actions.ts`'s `tasks.create_task` action was the **only** insert site missing it — a
  100%-reproducible crash on every real (non-simulated) invocation of a first-class, documented
  Studio action. Entirely invisible via the "Run Test" button: `simulate: true` short-circuits
  before the insert with a fake "Would create the task..." message, so the only way to ever see
  this failure is a real run — which for most authors means production automation traffic, not
  testing.
- **Fix:** added `import crypto from 'crypto'` and `id: crypto.randomUUID()` to the `insertInto('tasks')`
  call in `studio/actions.ts`, matching every other insert site's pattern exactly.
- **Re-test, live:** a fresh lead (value 250,000) fired the same workflow automatically again —
  `status: SUCCESS` end to end, a real `tasks` row created with `title`/`notes` correctly template-
  resolved from the payload (verified directly in Postgres, not just the API response). Then a
  low-value lead (5,000) correctly evaluated the condition `false`, the action step was correctly
  `SKIPPED` (a false condition is documented as "not a failure" — the run itself still reports
  `SUCCESS`), and zero tasks were created for it (confirmed by count query). Finally, re-ran the
  same workflow through the **manual** dry-run endpoint (`POST /apps/:id/run`, default
  `simulate: true`) to confirm it now correctly reports `SIMULATED` at every node with zero DB
  writes — explaining exactly why this bug shipped invisibly in the first place. Full suite green
  (11 files / 105 tests), `tsc --noEmit` clean, `npm run check:triggers` OK (still "every trigger
  has an emitter and every emitted event has a trigger"), API healthy throughout.
- **Not exercised this round:** the `requiredEntitlement` re-check at execution time (code-reviewed
  as correct — `seal.release_lot` and similar actions re-verify the tenant's entitlement inside the
  executor itself, not only at the route layer, so a lapsed plan stops a live automation mid-flight
  — but not driven live here), `forEach` node iteration, and the unique-index-based idempotency
  guard on `(workflow_id, domain_event_id)` (code-reviewed as a straightforward existence check
  before executing; not forced live since the platform has no natural way to redeliver the same
  domain event through the API).
- **Test-artifact handling:** Studio automations have a real, unrestricted `DELETE /apps/:id` —
  the test workflow was fully deleted. The four test leads were deleted via the real, unrestricted
  `DELETE` confirmed in HUD-0048 (`204` each). The one real task the fixed action created has no
  hard-delete endpoint (`tasks.routes.ts` has no `DELETE /items/:id`) but does have a real soft-
  delete (`PATCH /items/:id` with `deletedAt`) — used that instead of leaving it untouched.

### HUD-0054 — Phase 5: Inventory Control journey traced live · real MEDIUM-HIGH gap found (receipts/count corrections never reach the GL), documented, not fixed
- **Category:** Functional correctness / cross-app financial wiring (Phase 5, twelfth journey) — a
  real, live-verified accounting-completeness gap, not a crash. Rated MEDIUM-HIGH: it silently
  misstates the balance sheet for any tenant using both Inventory and FinOps together, but nothing
  errors, nothing 500s, and no data is corrupted — the gap is an *absence* of a GL entry, not a
  wrong one. This is the same shape of finding this arc has closed before (the old, now-fixed
  "payroll → GL not wired" note in [[finops_audit_fixes]], HUD-0044) — found by the same method:
  trace the golden path, then verify the claimed cross-app wiring against the ledger directly
  rather than trusting that a well-commented service does what its comments say.
- **Trace:** created a real warehouse + location + item via `POST /v1/inventory/{warehouses,
  locations,items}` → recorded a baseline read of GL account `1300` (Inventory) — zero balance —
  → `POST /movements` a `receipt` of 100 pcs @ unit cost 5,000 TZS (item's `avg_cost` correctly
  became 5,000, stock level correctly 100 @ value 500,000) → re-checked account `1300`: **still
  zero**, no entry at all → `POST /movements` an `issue` of 30 pcs (correctly computed
  `totalCost: 150,000` at the standing average cost) → account `1300` now `credit 150,000, debit 0,
  balance -150,000` → opened a real count session over the warehouse (correctly snapshotted
  `expectedQty: 70`, frozen at that instant) → counted the line as 65 (a 5-unit shrinkage) →
  `POST .../post` (correctly inserted one real `count_correction` movement, stock level correctly
  dropped to 65 @ value 325,000) → re-checked account `1300` a third time: **still exactly
  `-150,000`, byte-for-byte unchanged** — the 25,000 TZS of physically-confirmed lost stock
  produced no expense, no asset write-down, nothing.
- **Root cause (confirmed by code and by the live account-balance readings above):**
  `InventoryService.recordMovement` (`apps/api/src/services/inventory.service.ts`) only ever
  touches the GL on one branch — `issue` (correctly credits `1300`/debits COGS `5010`, per a
  deliberate, well-reasoned comment). `receipt` recomputes `avg_cost` but posts nothing; `adjust`
  and `count_correction` change quantity (in either direction — the code path is identical
  regardless of the variance's sign, so a *positive* correction, found extra stock, is code-
  confirmed to be equally un-posted, not separately re-tested live) but touch neither `avg_cost`
  nor the GL at all. Grepped the account code `1300` platform-wide: it is credited only from this
  one `issue` branch and is **never debited anywhere in the codebase** — meaning normal, expected
  Inventory-app usage can only ever push this asset account further negative, with no mechanism to
  ever bring it back in line with physical stock.
- **A second, related disconnect, confirmed by code (not separately live-tested — the wiring is
  unambiguous by inspection and a live PO would add no further certainty):** `purchase-
  orders.routes.ts` never imports or calls `InventoryService` at all. Its `received_qty` line field
  and its `RECEIVED`/`PARTIAL` status values are purely descriptive — `PATCH /:id/status` only
  updates the `status` column. A purchase order marked "Received" has **zero effect** on
  `inventory_stock_levels`, `inventory_items.avg_cost`, or the GL — the only way stock ever enters
  Inventory's own ledger is a manual `receipt` movement through the Inventory app itself, entirely
  disconnected from Procurement.
- **Why this wasn't fixed on the spot:** unlike HUD-0043/0050/0053 (a schema mismatch, a missing
  enum value, a missing `id` — each a one-line, unambiguous correction), closing this gap requires
  real product/accounting decisions this trace can't make unilaterally: what account a receipt
  should credit (a supplier isn't necessarily invoiced yet at the moment stock is physically
  received — normally a "Goods Received Not Invoiced" clearing liability, which does not currently
  exist in this tenant's chart of accounts), what account shrinkage should hit (an "Inventory
  Shrinkage/Write-off" expense account, which also does not exist), and whether either posting
  should require an approval step first (the platform already has exactly this shape of workflow
  built for Petti's petty-cash disbursements, HUD-0052 — that precedent is worth reusing if this is
  ever built, not reinvented). Matches this arc's standing rule for design-level gaps (the SMS
  webhook-signature gap in HUD-0040, Support's SLA-column omission in HUD-0049, Petti's missing
  withdrawal-cancel path in HUD-0052): document with full live evidence, do not guess at the fix.
- **Context on severity:** Inventory is rated 55%→62% "Active development" in the platform's own
  build-maturity tracking (its own code comment calls it "Phase 1 (app scaffold)" — deliberately
  simpler than SEAL's bonded-ledger equivalent), so an incomplete GL integration is not surprising
  in isolation. What makes it worth a MEDIUM-HIGH rather than LOW rating is that it is *silent*: no
  error, no warning banner, nothing in either the Inventory or FinOps UI signals that the two are
  disconnected — a tenant would only discover this by independently reconciling a trial balance
  against a physical stock count, which is precisely the workflow this finding traces.
- **Test-artifact handling:** Inventory has no hard-delete endpoint anywhere in this journey
  (warehouses, items, and count sessions all lack `DELETE`) — deactivated the test warehouse and
  item via their real `active: false` PATCH instead, consistent with this arc's cleanup-via-real-
  API-mechanism rule. The test movements, stock-level row, and count session are immutable ledger
  entries and were left in place, clearly labeled "Phase5 Trace" in every human-readable field.
  Usage counter restored to 500/500 and confirmed. No code changes were made this round, so the
  standard `tsc`/`vitest`/`check:triggers` re-verification was not required.

### HUD-0055 — Phase 5: ComplyOS renewal journey traced live · real HIGH crash found+fixed (GET /renewals always failed) + a real MEDIUM workflow dead-end found+fixed on user follow-up
- **Category:** Functional correctness (Phase 5, thirteenth journey) — two independent findings from
  one trace: a HIGH, 100%-reproducible crash (fixed) and a MEDIUM workflow-design gap (documented).
- **Trace:** created a real compliance certificate (`POST /certificates`, a BRELA business license
  expiring in 20 days) → `POST /renewals` (started a renewal, correctly `pending_review`) → a
  second renewal attempt for the same certificate correctly refused `400` ("already active") →
  `POST /renewals/:id/approve` → **`GET /renewals` crashed** — see below, fixed — → updated the
  certificate's `expiry_date` a full year out via `PATCH /certificates/:id` (the real-world action
  a compliance officer takes once a renewal is actually granted by the government agency; confirmed
  live that this correctly reset both `reminder_90d_sent_at`/`reminder_30d_sent_at` to null) → tried
  starting a **new** renewal cycle for the now-genuinely-renewed certificate — see below — →
  re-fetched `GET /renewals` post-fix and confirmed it now correctly resolves `approved_by_name`.
- **Evidence (HIGH bug, found and fixed):** `GET /v1/comply/renewals` fails unconditionally, for
  every tenant, regardless of how many renewals exist — reproduced directly against raw Postgres,
  independent of the API: `select r.id from comply_renewals r left join users u on u.id =
  r.approved_by` → `operator does not exist: uuid = text`. `comply_renewals.approved_by` is a
  `text` column while `users.id` is `uuid`; `ComplyService.getRenewals`'s
  `.leftJoin('users as u', 'u.id', 'r.approved_by')` compares them with no cast, which Postgres
  rejects at query-plan time — this is a structural failure, not a data-dependent edge case, so
  the ComplyOS Renewals list could never have worked, in any environment, for any tenant. Same
  family of defect as the platform's already-tracked HUD-0007 ("`tenant_id` column type
  inconsistent, uuid vs text, 12 tables") — this is a 13th instance of the same underlying pattern,
  just on `approved_by` rather than `tenant_id`.
- **Fix:** cast explicitly in the join rather than widening the column —
  `.leftJoin('users as u', (join) => join.on(sql<boolean>\`u.id = r.approved_by::uuid\`))` — matching
  the existing `::uuid` cast convention already used in `contacts.service.ts` elsewhere in this
  codebase. `NULL::uuid` evaluates to `NULL` (no error) for the many renewals with no approver yet.
- **Re-test, live:** `GET /renewals` now returns `200` with the real renewal row, `approved_by_name`
  correctly resolved to "Msomi Admin" via the join. Full suite green (11 files / 105 tests),
  `tsc --noEmit` clean, `check:triggers` OK, API healthy throughout.
- **Second finding (MEDIUM, workflow dead-end — found and fixed after user follow-up):**
  `comply_renewals.status`
  has five real intended values, confirmed by the schema itself (`submitted_at`/`completed_at`
  columns exist and are read by `getRenewals`) and by `startRenewal`'s own "already active" guard
  (`status in ('pending_review','approved','submitted')`) — but only two transitions are reachable
  through any code path: create (→ `pending_review`) and approve (→ `approved`). Nothing anywhere
  in the codebase ever sets `submitted_at` or `completed_at` on this table (grepped every write
  site), and `updateCertificate` — the method a compliance officer actually calls once a renewal is
  genuinely granted, confirmed above to correctly reset the reminder timers — never touches
  `comply_renewals` at all. **Live-verified the consequence**: after fully completing the real-world
  side of a renewal (pushing the certificate's expiry a year out), attempting to start the *next*
  renewal cycle for that same certificate was still refused with the exact same "already active"
  error — the first-ever approved renewal for a certificate permanently blocks every subsequent one,
  forever, with no way to clear it. Every certificate that goes through one full renewal in this
  system hits a real, guaranteed dead end on its second cycle.
- **Initially left undecided, then fixed on user follow-up ("fix and continue"):** closing this
  needed a product decision this trace couldn't make alone on first pass — should
  `updateCertificate` auto-complete the certificate's own active renewal when its `expiry_date`
  changes, should there be a separate `/renewals/:id/complete` endpoint mirroring the missing
  `submitted` step, or should `startRenewal`'s guard simply stop blocking on `approved`? Given the
  explicit go-ahead, took the first option: it needed no new endpoint, reused the exact signal the
  codebase already treats as "a real renewal happened" (the same `expiry_date`-changed condition
  `updateCertificate` already uses to reset the 90d/30d reminder timers, and the identical
  interpretation stated in `comply-renewal.job.ts`'s own comment), and closes the loop at the one
  place that actually observes the renewal completing in the real world.
- **Fix:** in `ComplyService.updateCertificate`, after the certificate row is updated, if
  `expiry_date` was part of the patch, mark any of that certificate's `comply_renewals` rows still
  in `pending_review`/`approved`/`submitted` as `completed` (`completed_at: new Date()`). A
  certificate with no active renewal is unaffected (the `WHERE status IN (...)` simply matches zero
  rows) — editing an expiry date to fix a typo, with nothing in flight, has no side effect.
- **Re-test, live — the exact reproduction from the original finding, replayed to confirm it no
  longer reproduces:** created a fresh certificate → started a renewal (`pending_review`) →
  approved it (`approved`) → `PATCH` the certificate's `expiry_date` a year out — `GET /renewals`
  immediately showed the row as `completed` with a real `completed_at` timestamp — → started a
  **second** renewal cycle for the same certificate: **`201`, `pending_review`**, no longer
  refused. Full suite green (11 files / 105 tests) a second time, `tsc --noEmit` clean,
  `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** both test certificates (the original, left stuck at `approved`, and
  the fresh one used to re-prove the fix) were revoked via the real, intentionally-soft `DELETE
  /certificates/:id` (its own code comment: "Certificates are revoked, not hard-deleted — they're
  part of the compliance audit trail"). Renewal records have no delete/cancel endpoint at all and
  are left in the dev tenant — the second one now correctly shows `completed`, not stuck. Usage
  counter restored to 500/500 and confirmed both times.

### HUD-0056 — Phase 5: CargoTracker freight-booking journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, fourteenth journey). No code changes needed.
- **Trace:** `POST /carriers` (real carrier) → `POST /rate-contracts` (buy-side, $1,200 CNSHA→TZDAR,
  28-day transit) → `GET /rate-shopping?mode=...&origin_port=...&destination_port=...` correctly
  surfaced the contract sorted by `buy_rate` with the carrier name resolved via a real join → `POST
  /rate-cards` (the separate sell-side reference-rate table) → `POST /bookings` (a real customer,
  `REQUESTED`) → `PATCH .../quote` (using the carrier found via rate-shopping) → a re-quote attempt
  on the now-`RATE_QUOTED` booking correctly refused `400` ("Only requested bookings can be
  quoted") → `PATCH .../confirm` (vessel/voyage/BL/ETA) → **this converted the booking into a real
  `shipment_cases` row** (`CLR-2026-0070`, correct `type: SEA_FCL` from the booking's mode, correct
  `stage: DOCS_RECEIVED` starting stage, vessel/BL/origin/dest all carried across correctly) →
  `GET /bookings/by-shipment/:id` correctly resolved back to the booking (the exact reverse lookup
  `ShipmentDetail.tsx`'s own booking-reference badge depends on) → attempting to cancel the now-
  `CONFIRMED` booking correctly refused `400` ("cancel the resulting shipment instead") → a second,
  separate throwaway booking left at `REQUESTED` was cancelled directly and succeeded cleanly.
- **Result: CLEAN.** The buy-side/sell-side rate split (rate contracts vs. rate cards), the
  booking state machine (`REQUESTED → RATE_QUOTED → CONFIRMED`, each transition's guard tested and
  correct in both directions), and the booking→shipment conversion (the actual value of this whole
  feature — a quoted freight booking becoming a live, trackable customs shipment with zero manual
  re-entry) all worked exactly as designed on the first real attempt, with no gaps found.
- **Test-artifact handling:** the converted shipment was removed via the real, existing soft-delete
  `DELETE /v1/shipments/:id` (sets `deleted_at`, confirmed `204`). Carriers, rate contracts, and
  rate cards have no hard-delete endpoint — deactivated all three via their real `active: false`
  PATCH instead. Bookings have no delete endpoint at all: the cancelled throwaway booking is left
  at its natural terminal `CANCELLED` state, and the confirmed booking is left `CONFIRMED` with a
  `converted_shipment_id` now pointing at a soft-deleted shipment — checked first whether this FK
  is enforced at the database level (it is not: no foreign-key constraint exists on that column at
  all, consistent with this platform's established "soft-link, don't hard-FK across app boundaries"
  convention), so this is a harmless, clearly-labeled dangling reference rather than a real
  integrity risk. Usage counter restored to 500/500 and confirmed.

### HUD-0057 — Phase 5: Demurrage → GL → invoice-recharge journey traced live · core pipeline CLEAN; a real MEDIUM-HIGH "liability" feature is completely unreachable, documented, not fixed
- **Category:** Functional correctness (Phase 5, fifteenth journey). The core cost pipeline this
  journey set out to check came back clean; a second, independent finding surfaced along the way —
  a whole column/feature the schema and service layer both fully support has no API path to it at
  all, so every real caller gets a permanently wrong default with no error to notice it by.
- **Trace:** `POST /tariffs` (progressive rate tiers: days 1–5 at $50/day, days 6–10 at $100/day)
  → `POST /containers` with a discharge date 12 days back and 5 free days — the service correctly
  computed `demurrage_days: 8` and `demurrage_cost: 550.00`; hand-verified by tier
  (5 days × $50 + 3 days × $100 = $550, exact match) → `POST /v1/finance/post-costs/demurrage?
  dry_run=1` correctly reported the charge without writing anything (confirmed zero
  `journal_entries` rows immediately after) → the real (non-dry-run) post created a genuine,
  balanced journal entry (Dr `1100` Accounts Receivable / Cr `2000` Accounts Payable, $550 both
  sides) → posting again correctly skipped it ("already posted" — the `(source_module, source_id)`
  idempotency check works) → created a real invoice for the container's own shipment customer →
  `POST .../recharge` correctly added a real `sales_invoice_lines` row ($550, "Demurrage recharge —
  container P5DEM0001") and set `recharged_invoice_id` → recharging the same container a second
  time correctly refused ("already been recharged to an invoice").
- **Result: the cost pipeline itself is CLEAN.** Tiered-rate math, GL posting, idempotency, and the
  invoice recharge that `cost-posting.service.ts`'s own header comment once flagged as "still to
  build" (now built, in an earlier session) all worked exactly as designed on live data.
- **Evidence (real MEDIUM-HIGH gap, found, not fixed):** `container_tracking.liable_party`
  (migration 175, `CHECK (liable_party IN ('CUSTOMER', 'COMPANY'))`, `DEFAULT 'CUSTOMER'`) and
  `liability_reason` exist specifically so a compliance/ops person can record "this delay was our
  own fault, absorb it, do not bill the customer" — `cost-posting.service.ts` has a fully-built,
  carefully-commented branch for exactly this (`DR 5003 Storage & Demurrage / CR 2000` instead of
  the receivable entry, and `rechargeDemurrage` correctly refuses to recharge a `COMPANY`-liable
  charge). **Nothing in the entire codebase can ever set either column, or the `WAIVED` status.**
  `demurrageService.updateContainer` whitelists exactly seven fields
  (`container_number/container_size/seal_number/carrier_name/shipment_id/discharge_date/
  free_days`) and silently drops anything else — grepped every route and service file for
  `liable_party`/`liability_reason`/`WAIVED`: only the cost-posting service *reads* them, nothing
  anywhere *writes* them. **Live-verified the silent-failure shape directly**: `PATCH
  /containers/:id` with `{"liable_party":"COMPANY","liability_reason":"...","status":"WAIVED"}`
  returned a plain `200` with no error — the response (correctly, since it reflects the true
  unchanged row) still showed `liable_party: "CUSTOMER"`, `liability_reason: null`,
  `status: "ACTIVE"`. A caller who doesn't diff the response against what they sent would have no
  way to know the update did nothing. Consequence: every demurrage charge in this platform,
  regardless of whose fault the delay actually was, is permanently `CUSTOMER`-liable and will
  always be recharged — the system currently has no way to honestly record "we caused this, we're
  absorbing it," which is both an accounting-accuracy and a customer-trust problem for any tenant
  that has ever caused its own demurrage delay.
- **Why this wasn't fixed on the spot:** unlike HUD-0054's Inventory finding (which needed a real
  product decision about which new GL/clearing accounts to introduce), this one is much more
  narrowly scoped — the column, the CHECK constraint, and the entire downstream GL/recharge logic
  already exist and are already correct; the only missing piece is exposing `liable_party`/
  `liability_reason`/`status` through `updateContainer`'s whitelist and the PATCH schema, with
  validation matching the existing CHECK constraint. Left undecided rather than fixed
  unprompted, per this arc's standing rule for design-level gaps — but flagged here explicitly as
  a low-risk, well-scoped candidate (unlike HUD-0054), in case a future turn is asked to fix it
  (see HUD-0055's own "fix and continue" precedent in this same arc).
- **Test-artifact handling:** the tariff was fully removed via the real `DELETE /tariffs/:id`
  (`204`). The container was **not** deleted — it is now referenced by a real journal entry
  (`source_id`) and a real invoice line's description, and `deleteContainer` is a bare hard delete
  with zero downstream guards (confirmed no FK constraint exists on `container_tracking` from
  either table, consistent with this platform's soft-link convention elsewhere) — deleting it would
  silently orphan those references rather than cleanly reversing them, so it is left in place,
  clearly labeled `P5DEM0001`. The journal entry and invoice line are left in place per this arc's
  standing financial-immutability rule. Usage counter restored to 500/500 and confirmed.

### HUD-0058 — Phase 5: Quotations journey traced live · real CRITICAL/HIGH authorization bypass found+fixed + a real HIGH attribution bug found+fixed
- **Category:** Authorization (IDOR + missing role check) and functional correctness (Phase 5,
  sixteenth journey). Two independent bugs in the same file, both 100%-reproducible, both fixed.
- **Trace:** `POST /quotations` (a real quote for "Juma Test Customer") → attempted the golden
  path as a genuine second identity, not just the usual single-admin trace, specifically because
  `GET /:id` (line ~51) carries its own customer-ownership check worth stress-testing: signed a
  real `CUSTOMER` JWT for a *different* customer ("Dangote Industries Ltd") and confirmed `GET
  /quotations/:id` correctly 404s them against Juma's quote (ownership check works) — then tried
  `PATCH /:id/status {"status":"APPROVED"}` **as that same blocked customer**.
- **Evidence (bug #1, real CRITICAL/HIGH authorization bypass, found and fixed):** the approve/
  reject endpoint **had no role check of any kind** — the only mutating route in this file without
  one; `POST /`, `POST /:id/convert`, and `DELETE /:id` all gate on a local `QUOTE_WRITE_ROLES`
  array, but `PATCH /:id/status` had nothing, and `quotationService.updateStatus` itself does no
  ownership or role check either (it only scopes by `tenant_id`). Live-reproduced exactly as
  hypothesized: the `CUSTOMER` JWT that was correctly refused a `GET` on this same quotation got a
  plain `200` with `status: "APPROVED"` and a real `approved_at` timestamp on the `PATCH`. Any
  customer of the tenant could approve or reject *any other customer's* confidential quote —
  pricing, margins, everything — despite having no read access to it through the normal UI at all.
  Same class of finding as the original HUD-0024 RBAC sweep (a mutating route the file's own
  sibling routes already show the correct pattern for), but one this file's earlier triage missed —
  a reminder that "the file has a role gate" (checked once, file-by-file, in that sweep) does not
  guarantee "every mutating route in the file has one."
- **Fix:** added the same `QUOTE_WRITE_ROLES` check the sibling routes already use. Deliberately
  not a narrower "customer can act on their own quote" carve-out — nothing else in this platform's
  approval workflows (Petti, ComplyOS, NexusHR) lets the *subject* of an approval decide it
  themselves, and this codebase has no candidate-facing/customer-facing accept-or-decline flow for
  quotes today, so extending the existing staff-only pattern is the correct, minimal fix.
- **Evidence (bug #2, real HIGH attribution bug, found and fixed):** `prepared_by` (on create),
  `approved_by` (on approve), and — most consequentially — the **`assigned_to` of every shipment
  created by converting a quote** were all silently `null`, for every quotation and every quote-
  converted shipment, regardless of who acted. Root cause: three call sites in this file passed
  `user.id` as the actor id; `(req as any).user` is cast to `any`, so nothing ever caught that
  `JWTPayload` (`@hudumika/types`) has no `.id` field, only `.sub` — a live, silent no-op exactly
  like HUD-0055's join-cast bug, just at the TypeScript-escape-hatch layer instead of the SQL layer.
  Confirmed directly against Postgres: a quote approved by a real admin showed `approved_by: null`
  in the row; the shipment created from converting it showed `assigned_to: null`. A converted
  shipment landing on nobody's queue is not cosmetic — anything in ClearOS that filters or sorts by
  assignee would never surface it.
- **Fix:** `user.id` → `user.sub` at all three call sites (`create`, `updateStatus`, `convert`).
- **Re-test, live:** re-ran the original exploit as the same blocked `CUSTOMER` JWT — `403
  Insufficient permissions`, confirmed no status change. Re-ran the legitimate admin path — a fresh
  quote's `prepared_by` came back correctly populated with the real actor id, its `approved_by`
  after approval likewise, and converting it produced a shipment with `assigned_to` correctly set
  to the real actor — all three re-verified directly against Postgres, not just the API response.
  Full suite green (11 files / 105 tests), `tsc --noEmit` clean, `check:triggers` OK, API healthy
  throughout.
- **Test-artifact handling:** all three test quotations were fully removed via the real,
  unrestricted `DELETE /:id` (`204` each); the two shipments created via conversion were removed
  via the real soft-delete `DELETE /v1/shipments/:id` (`204` each, `deleted_at` set). Usage counter
  restored to 500/500 and confirmed.

### HUD-0059 — Phase 5: Fleet dispatch → border-crossing → trip-billing journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, seventeenth journey). No code changes needed.
- **Trace:** `POST /vehicles` (real GPS-tracked vehicle) → `POST /drivers` → `POST /trips` (Trip A,
  vehicle+driver, correctly defaults to `PLANNED`) → a second trip (Trip B) created with the *same*
  vehicle+driver while A was still only `PLANNED` correctly succeeded (planning ahead isn't a
  conflict) → dispatched Trip A (`PATCH .../status: IN_PROGRESS`) → dispatching Trip B with the
  same vehicle+driver was correctly refused (`"...is already on an active trip."`) — the
  double-booking guard only fires against a genuinely active trip, exactly as designed → separately
  confirmed the vehicle's own dispatchability gate: marked the vehicle `MAINTENANCE` and a brand
  new trip request for it was correctly refused even at *creation*, not just at dispatch, then
  restored it to `ACTIVE` → `POST /trips/:id/border-crossings` (a real border event, `PENDING`,
  correctly linked via `fleet_trip_id`) → `PATCH .../status: CLEARED` correctly stamped a real
  `cleared_at` → `POST /vehicles/:id/expenses` (a billable toll charge tied to the trip) → `POST
  /trips/:id/bill-expenses` correctly resolved the trip's own `customer_id`, created a real Draft
  `sales_invoice` with a correctly-named line item, and stamped the expense's `invoice_id` — a
  second bill-expenses call on the same trip correctly refused ("No billable, not-yet-invoiced
  expenses"), confirming an expense can't be billed twice.
- **Result: CLEAN.** `assertDispatchable` — the shared gate this file's own comment calls out as
  what "a real cross-border haulier actually lives or dies by" — genuinely enforces every condition
  it claims to (active-trip conflict, non-dispatchable vehicle status, expired documents/overdue
  maintenance not separately re-tested live but code-reviewed as the same shape of check already
  proven correct above) both at trip creation and at the dispatch moment specifically, not just one
  or the other. The border-crossing lifecycle and the trip→invoice billing bridge (the same
  "operational cost sat in one app, invisible to finance" shape of gap this arc already found and
  fixed for demurrage in HUD-0057, but here already correctly built) both worked exactly as
  documented on the first real attempt.
- **Test-artifact handling:** Trip B (never dispatched, no downstream references) was fully removed
  via the real `DELETE /trips/:id` (`200`). Trip A is now referenced by a real border-crossing row,
  a real vehicle expense, and a real Draft invoice — left in place rather than deleted, consistent
  with this arc's standing rule for records already woven into a financial trail. Vehicles have no
  delete endpoint at all in this codebase (only `geofences` do); the test vehicle and driver are
  left active, clearly labeled "Phase5 Trace." Usage counter restored to 500/500 and confirmed.

### HUD-0060 — Phase 5: Supplier bills → GL → payment → void journey traced live · real HIGH schema-mismatch found+fixed (silent, not a crash this time); the rest of a genuinely sophisticated AP pipeline is CLEAN
- **Category:** Functional correctness (Phase 5, eighteenth journey). One real bug, same family as
  HUD-0043 but a materially worse failure mode; everything else in this file — tax-recoverability
  splitting, category-based GL routing, payment application, and void/reversal — is CLEAN.
- **Evidence (real HIGH bug, found and fixed):** `billLineSchema` documented `quantity`/`unit_cost`/
  `amount`/`account_id` — fields `buildBillLines()` has never read. The function actually reads
  `qty`/`unit_price`/`category`/`tax_rate`, matching exactly what the real frontend (`Bills.tsx`)
  sends (confirmed by reading it directly, the same check used for HUD-0043). Unlike HUD-0043
  (a `NOT NULL` violation, a loud crash), `buildBillLines()` defaults a missing `qty`/`unit_price`
  to `1`/`0` rather than erroring — so a caller who trusted the documented schema instead of the
  real frontend would get a **successfully created bill with every line silently priced at zero**,
  no error at all. A real supplier bill for real money recorded as worthless is a materially worse
  failure mode than a crash, even though nothing in production hit it (the shipped UI already uses
  the real field names).
- **Fix:** corrected `billLineSchema` to the real field names (`qty`, `unit_price`, `category`,
  `tax_rate`), matching `buildBillLines()`'s actual contract exactly, same remediation shape as
  HUD-0043.
- **Trace (the rest of the pipeline, all CLEAN):** created a real bill with two lines — one
  `FREIGHT` line taxed at a recoverable 18% code, one `INSURANCE` line taxed at a non-recoverable
  18% code — and hand-verified subtotal (1,500,000), tax (270,000), recoverable (180,000),
  non-recoverable (90,000), and total (1,770,000) all matched the API's own figures to the
  shilling. The resulting journal entry was independently verified against Postgres: Dr `5001`
  Freight Costs 1,000,000 / Dr `5000` Port & Customs Charges 590,000 (net + the *non-recoverable*
  tax, correctly following the line's own account rather than a default one) / Dr `1150` VAT Input
  Recoverable 180,000 / Cr `2000` Accounts Payable 1,770,000 — balanced and exactly right. A
  partial payment (1,000,000) correctly flipped the bill to `PARTIAL`; the final payment
  (770,000) correctly flipped it to `PAID`, with each payment independently posting its own
  correct Dr `2000`/Cr `1010` journal entry, the two summing exactly to the bill's total. A
  second, separate bill was voided: the original journal entry was marked `VOIDED` (preserved, not
  deleted) and a genuine mirror-image reversal entry was posted crediting back every account the
  original had debited — including the `1150` VAT input claim, exactly matching the code's own
  stated design intent ("a voided bill stops contributing to what is recoverable").
- **Re-test, live:** re-verified `tsc --noEmit` clean both before and after the schema fix (the
  fix is a pure type/validation correction, not a runtime-behavior change for the already-correct
  frontend). Full suite green (11 files / 105 tests), `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** both test bills reached real, correct terminal states through the
  API's own mechanisms (`PAID` and `VOID` respectively) rather than needing cleanup — bills cannot
  be hard-deleted once non-`DRAFT` (`DELETE /:id`'s own guard: `DocumentPosted`, pointing the
  caller at `/void` instead, exactly the pattern already confirmed for invoices in this arc). Left
  in place, clearly labeled "Phase5 Trace Supplier." Usage counter restored to 500/500 and
  confirmed.

### HUD-0061 — Phase 5: Credit notes → GL reversal → void journey traced live · CLEAN (plus a systematic sweep that closed out the HUD-0043/0060 bug class)
- **Category:** Functional correctness (Phase 5, nineteenth journey), preceded by a systematic
  regression sweep prompted by HUD-0043 and HUD-0060 sharing one exact root-cause shape (a
  `*LineSchema` documenting fields the matching `build*Lines()` function never reads).
- **Sweep, not guesswork:** grepped every `function build\w*Lines?\b` in the codebase — exactly
  three exist: `buildInvoiceLines` (fixed, HUD-0043), `buildBillLines` (fixed, HUD-0060), and
  `buildPoLines` (`purchase-orders.routes.ts`). Read `buildPoLines` and its `poLineSchema` side by
  side: they already agree field-for-field (`qty`/`unit_price`/`category`/`tax_rate`/
  `tax_code_id`/`received_qty` on both sides) — genuinely clean, not a third instance. Also grepped
  every `*LineSchema` definition platform-wide (a broader net than the exact `build*Lines` naming)
  and found one more candidate, `seal.routes.ts`'s `devanTallyLineSchema` — read it and confirmed
  it's a devanning-tally schema with no `unit_price`/`amount` field at all, so it isn't in this bug
  class regardless. **This closes the HUD-0043/0060 pattern**: every line-schema-vs-processor pair
  in the codebase has now been checked, not just the two that happened to crash or drift.
- **Trace:** `credit-notes.routes.ts`'s own `lineSchema` was read first and already matches
  `POST /`'s line-mapping exactly (`name`/`unit`/`rate`/`qty`/`tax_pct`/`tax_code_id` on both
  sides) — confirmed clean before touching the API. Created a real invoice (TZS 2,000,000 net,
  18% tax, 2,360,000 total) → issued a partial credit note against it (TZS 1,000,000 net, 18%
  tax) → the resulting journal entry was independently verified against Postgres: Dr `4000`
  Freight Revenue 1,000,000 / Dr `2200` VAT Output Payable 180,000 / Cr `1100` Accounts
  Receivable 1,180,000 — balanced and exactly matching the hand-calculated reversal (the same
  amounts an invoice would have posted, direction flipped) → a real `invoice_activity_log` entry
  was correctly attached to the *original* invoice (`credit_note_issued`, the real amount and
  reason) → `POST .../void` correctly reversed the credit note's own journal entry with a genuine
  mirror-image posting (credits where the original debited, and vice versa) → a second void
  attempt on the same credit note was correctly refused ("already void").
- **Result: CLEAN.** Credit notes reuse `invoices.routes.ts`'s own `invoiceGrandTotal`/
  `invoiceNetAndTax` helpers rather than re-implementing the math — the same "share one
  implementation, a second copy drifts" discipline already noted favorably elsewhere in this
  codebase (`studio/conditions.ts`'s header comment makes the identical point) — and it held up
  here: no drift found between the credit-reversal math and the original invoice math.
- **Test-artifact handling:** the credit note reached its own real terminal state (`VOID`) through
  the API itself — nothing left to clean up. Credit notes have no delete endpoint at all (void is
  the only lifecycle exit, matching invoices/bills). The linked test invoice was left in its
  `Unpaid` state, clearly labeled "Phase5 Trace CN Customer," consistent with this arc's standing
  rule for records already part of a financial trail. Usage counter restored to 500/500 and
  confirmed. No code changes were made this round, so the standard `tsc`/`vitest`/`check:triggers`
  re-verification was not required.

### HUD-0062 — Phase 5: Fixed assets → depreciation schedule → dispose/delete journey traced live · CLEAN, with one LOW cosmetic finding and one hypothesis disproven by live evidence
- **Category:** Functional correctness (Phase 5, twentieth journey). No code changes needed.
- **Trace:** created a real asset (12,000,000 TZS forklift, 2,000,000 salvage, 24-month life,
  cash-funded) → verified the acquisition GL entry (Dr `1501` 12,000,000 / Cr `1010` 12,000,000) →
  `GET /:id/schedule` — hand-verified the full 24-month straight-line projection: 416,666.67/month
  for 23 months, with the **final month correctly absorbing the rounding remainder**
  (416,666.59) so accumulated depreciation lands exactly on the 10,000,000 depreciable base and
  net book value lands exactly on the 2,000,000 salvage value — not a cent of drift across two
  years of monthly roundings, a real correctness property naive implementations often get wrong →
  `DELETE` it before any depreciation had posted — succeeded, and the acquisition entry was
  genuinely reversed (`VOIDED` + a real mirror-reversal), not left dangling. A second asset
  (5,000,000 TZS generator, AP-funded) correctly posted Dr `1501` / Cr `2000` (not Bank) → disposed
  it the same month, before any depreciation ever posted (`accumulated = 0`) with proceeds of
  4,000,000 against a 5,000,000 net book value — correctly computed a 1,000,000 **loss**, posted to
  `5900` Other Operating Expenses, balanced against Bank/Accumulated-Depreciation/Asset-cost lines.
- **A hypothesis raised by code-reading, disproven by live evidence:** `disposeFixedAsset`'s own
  comment flags that its journal entry shares its `sourceId` with the asset's depreciation entries
  and states "nothing currently calls `reverseBySource()` for fixed assets, so this isn't
  live-harmful" — but `DELETE /:id` *does* call `reverseBySource(..., 'MANUAL', id, ...)`. Read
  together, this looked like a real bug in the making: deleting the *disposed* generator (zero
  depreciation entries, so the DELETE route's guard doesn't block it) should, by the stated
  reasoning, only reverse the acquisition entry and leave the disposal entry dangling — describing
  a sale of an asset whose purchase had just been erased. **Tested live rather than reported on
  suspicion**: `reverseBySource` turned out to reverse *every* non-voided entry sharing that
  `(sourceModule, sourceId)` pair, not just one — so deleting the disposed asset correctly reversed
  *both* the acquisition and the disposal together. Verified the net effect on every touched
  account (`1501`, `1010`, `2000`, `5900`) sums to exactly zero across all four journal entries —
  a fully, correctly undone asset, not a dangling half-reversal. The comment's stated reasoning
  ("nothing calls this yet") is itself slightly stale — something does, and it happens to still be
  safe — but there is no live bug here, which the trace confirms rather than assumes.
- **One LOW, purely cosmetic finding (not fixed):** because `accumulated = 0` for the same-period
  disposal, the disposal journal entry's `Accumulated Depreciation` line posted with `debit: 0.00,
  credit: 0.00` — a real, meaningless zero-amount line that Postgres and `GLService.post`'s balance
  check both accept without complaint (zero contributes equally to both sides). Harmless — no total
  is wrong, nothing downstream reads it incorrectly — but a GL drill-down would show a no-op line
  for an account no money actually moved through. Not worth a code change on its own; noted in case
  a future general "skip zero-amount lines before posting" cleanup touches `GLService.post` anyway.
- **Test-artifact handling:** both test assets were fully removed via the real `DELETE /:id` — the
  first because no depreciation had posted, the second because it too had none (only the scheduled
  monthly job — never invoked this trace — ever inserts a `fixed_asset_depreciation_entries` row,
  so `DELETE`'s "already has depreciation posted" guard was never actually exercised against a real
  blocking case; confirmed correct by direct code reading, a simple existence check, rather than
  manufacturing a depreciation row through a side channel just to force it). Usage counter restored
  to 500/500 and confirmed. No code changes were made this round, so the standard
  `tsc`/`vitest`/`check:triggers` re-verification was not required.

### HUD-0063 — Phase 5: NexusHR leave-management journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, twenty-first journey). No code changes needed —
  the most thoroughly-guarded golden path traced so far in this arc, every guard held.
- **Setup, not a workaround:** the dev tenant had no `country` set, so `POST .../generate-
  statutory` correctly refused with an honest error ("no statute to apply") rather than guessing.
  Set `tenants.country = 'TZ'` directly — a genuine, previously-missing configuration fact for a
  tenant that is a Tanzanian logistics company in every other respect traced this entire arc (TZS
  currency, TRA/BRELA, Dar es Salaam, TZDAR ports), not fabricated test state — and left it set
  afterward rather than reverting, since it corrects a real gap rather than introducing one.
  `generate-statutory` then produced real Tanzania Employment and Labour Relations Act figures
  (28-day annual leave from the employment anniversary; 126-day sick leave split 63 full-pay/63
  half-pay; 84/100-day maternity; 3/7-day paternity) with an honest disclosure that the seeded
  compassionate-leave figure is "treated as company policy here... because it was not verified
  against the Act directly" — the same never-invent discipline seen elsewhere in this codebase
  (ComplyOS's OCR prompts, SEAL's duty math).
- **Trace:** a real `JUNIOR` test employee's balance correctly showed `SICK: eligible: false,
  ineligible_reason: "Requires 6 months of service; 2 completed."` — a genuine service-tenure
  computation, not a static flag — and confirmed live that **submitting** a SICK request (not just
  displaying the balance) was independently refused with that exact reason → submitted a real
  5-working-day `ANNUAL` request (Mon–Fri, zero weekend days to exclude) — correctly computed
  `days: 5`, `remaining: 23` → a second, overlapping request was correctly refused
  (`LEAVE_OVERLAP`, naming the conflicting dates) → a third, non-overlapping but oversized (30-day)
  request was correctly refused for insufficient balance, **and** in the same response correctly
  identified all 10 real weekend dates in that range that wouldn't have counted anyway — both
  guards computed independently and consistently in one call → approved the original request —
  balance correctly moved `pending: 5 → 0`, `taken: 0 → 5`, `remaining` unchanged at 23 (as it
  should: approval doesn't change the total consumed, only which bucket it sits in) → both
  `hr.leave_requested` and `hr.leave_approved` domain events verified directly against Postgres
  with fully accurate payloads → cancelled the request — balance correctly returned to the full
  28/28, confirming cancelled requests are genuinely excluded from consumption, not just from the
  overlap check.
- **Result: CLEAN.** Every one of five independent guards (working-days exclusion, overlap
  detection, balance sufficiency, service-tenure eligibility, and the pending↔taken bucket
  transition on approval) fired exactly when it should and never fired when it shouldn't — this
  file's own code comments document at least one genuine prior bug already fixed (a stale-balance
  read across a transaction boundary), and nothing resembling it was found live here.
- **Test-artifact handling:** the leave request was cancelled via the real
  `PATCH /leaves/:id/status` (no delete endpoint exists for leave requests — status transitions are
  the only lifecycle exit, matching every other document type traced this arc). The six generated
  leave types were left in place — real, statutorily-grounded configuration for a real Tanzanian
  tenant, not test junk to remove. Usage counter restored to 500/500 and confirmed. No code changes
  were made this round, so the standard `tsc`/`vitest`/`check:triggers` re-verification was not
  required.

### HUD-0064 — Phase 5: Bank reconciliation import → match → delete journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, twenty-second journey). No code changes needed.
- **Trace:** uploaded a real two-line CSV bank statement (`Date,Description,Debit,Credit`, the
  flexible-column parser correctly handling a Debit/Credit split rather than a single signed
  `Amount` column) via real multipart upload → the statement's `closing_balance` correctly summed
  to −720,000 (−770,000 + 50,000) → `GET /statements/:id` surfaced real, unmatched candidate
  journal lines against account `1010` within the statement's date range — including one
  (`JE-2026-0013`, "Bill payment...", amount −770,000) that exactly matched one of the imported
  lines, confirming the query's timezone-aware date range comparison correctly resolved a
  `21:00 UTC`-stored `entry_date` to the right local calendar day → matched it → a second attempt
  to match the *same* journal line to the *other* statement line was correctly refused ("already
  matched to another statement line") → confirmed the matched line disappeared from the candidate
  list (the `LEFT JOIN ... WHERE bsl.id IS NULL` exclusion works) → unmatched it → confirmed it
  reappeared as a candidate and the statement line's `matched_journal_line_id` cleared → `GET
  /statements` correctly reported `total: 2, matched: 0` after the unmatch → deleted the statement
  and independently confirmed the underlying `journal_entries` row (`JE-2026-0013`) was completely
  untouched, still `POSTED` — bank reconciliation is a working-paper layer on top of the GL, not
  part of it, and its deletion correctly never touches the ledger it reconciles against.
- **Self-caught non-bug:** an early verification step read `lines[0]` from the API response and
  saw `matched_journal_line_id: null` where a match was expected — investigated before reporting,
  and found both statement lines share the same `txn_date` with no secondary sort key, so array
  order between them is unspecified; re-checked by id rather than array position and confirmed the
  match was correctly persisted throughout. Not a product bug, an artifact of my own test script's
  assumption — the same "verify before reporting" discipline already applied elsewhere this arc
  (the DNS-propagation and `resolveCustomerId` mismatches earlier in this session).
- **Result: CLEAN.** Every part of the matching lifecycle (candidate suggestion, one-to-one match
  enforcement, unmatch, re-availability, and count aggregation) behaved exactly as designed.
- **Test-artifact handling:** the statement was fully removed via the real, unrestricted `DELETE
  /statements/:id` — appropriate here since a bank statement is reconciliation tooling, not a
  financial-ledger record, so no void-only restriction applies (confirmed live: the real GL entry
  it had been matched against was independently verified untouched). Usage counter restored to
  500/500 and confirmed. No code changes were made this round, so the standard
  `tsc`/`vitest`/`check:triggers` re-verification was not required.

### HUD-0065 — Phase 5: CRM lead scoring + custom fields journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, twenty-third journey). No code changes needed.
- **Trace (lead scoring):** created two real scoring rules (`value > 100000` → 40 pts, `source =
  Referral` → 30 pts) → created a high-value referral lead and a low-value web-form lead —
  `GET /leads` correctly computed scores of exactly 70 and 0, matching the hand-calculated sum of
  matching rules for each → added a third rule (`stage = NEW` → 90 pts, matching both leads) and
  hand-verified the **0–100 clamp**: the high lead's raw total (40+30+90=160) correctly clamped to
  exactly 100, while the low lead's raw total (0+90=90) stayed unclamped at 90, confirming the
  clamp is a ceiling applied per-lead to the real sum, not a fixed cap substituted for it →
  deactivated the third rule and confirmed both scores immediately reverted to 70/0 — rules are
  read fresh on every request, not cached or stale.
- **Trace (custom fields):** created a real `lead`-scoped text field definition → `PUT /values` on
  the real high-value lead succeeded → **live-verified the ownership guard rather than assuming
  it from the code**: the same `PUT` against a syntactically-valid but nonexistent `subject_id`
  (an all-zero UUID) was correctly refused `404 Record not found` — `PUT /values` explicitly
  re-selects the subject from its real entity table scoped by `tenant_id` before writing anything,
  which a code-only read could have mistaken for a gap given `crm_custom_field_values` itself
  carries no `tenant_id` column of its own (it's scoped transitively through `def_id`) → `GET
  /values` round-tripped the exact value that was set.
- **Result: CLEAN.** Both sub-features work exactly as designed; no gaps found in either.
- **Test-artifact handling:** all three scoring rules, the custom field definition, and both test
  leads were fully removed via their real, unrestricted `DELETE` endpoints (`204` each) — CRM
  configuration and lead records are genuinely hard-deletable in this platform, matching HUD-0048's
  earlier finding for leads/deals specifically. Usage counter restored to 500/500 and confirmed.
  No code changes were made this round, so the standard `tsc`/`vitest`/`check:triggers`
  re-verification was not required.

### HUD-0066 — Phase 5: Ondi JIT org-role grant journey traced live · JIT mechanics CLEAN; found+fixed a real HIGH bug in an unrelated app it happened to unlock (ComplyOS revoked certificates permanently masked as active); one LOW dead-code inconsistency documented, not fixed
- **Category:** Functional correctness + a real, high-impact data-display bug discovered as a
  side effect of testing a security feature honestly (Phase 5, twenty-fourth journey).
- **Trace (the JIT mechanics themselves — CLEAN):** confirmed a `JUNIOR` JWT is correctly refused
  ComplyOS (`403`, naming the exact missing permission) → created a real Ondi org role granting
  `comply.manage` → granted it to that same `JUNIOR` user with a 1-hour expiry → **live-verified
  the grant genuinely substitutes for the missing role**: the same JWT that was just refused now
  reached `GET /comply/certificates` with a real `200` and real data → simulated time passing by
  setting the grant's `expires_at` to one minute in the past → the same call was **immediately**
  refused again, `403`, with no cleanup job involved — `hasOrgPermission`'s live `>` comparison
  against `now()` is genuinely the enforcement, not cosmetic. Separately re-granted a permanent
  membership and confirmed the real, immediate manual-revoke path (`DELETE
  /org/roles/:id/members/:userId`) also cuts access off at once. Every real mechanic of this
  feature — grant, time-based expiry, and manual revoke — works exactly as designed.
- **A real setup obstacle, resolved honestly, not routed around:** the dev tenant's plan doesn't
  include `ondi.governance` (a real Enterprise add-on gate on time-boxed grants), and the route's
  own explicit `user.role !== 'SUPER_ADMIN'` bypass for that gate turned out to be **unreachable**
  — see the dead-code finding below. Rather than skip the time-boxed half of this test, applied
  the platform's own existing admin override mechanism (`tenant_settings.settings['enabled-apps']`
  — the same targeted force-enable/disable map `tenantHasEntitlement` already reads) to unlock it
  for this test, then explicitly reverted the override afterward — unlike HUD-0063's `country` fix
  (a factual attribute worth keeping), a plan/billing-tier flag is not something to leave silently
  changed for a future session to trip over.
- **Evidence (real HIGH bug found and fixed, in ComplyOS — surfaced only because this trace
  actually looked at real data rather than a synthetic fixture):** while exercising the newly-
  granted ComplyOS access, `GET /certificates` returned the two certificates revoked back in
  HUD-0055 (`P5-CERT-001`/`002`) with **`status: "active"`** — live-verified directly against
  Postgres that their real, stored `status` column is genuinely `'revoked'`. Root cause:
  `ComplyService.getCertificates` unconditionally overwrote the mapped `status` field with
  `certStatus(expiry_date)` — a pure function of the expiry date that can only ever return
  `'active' | 'expiring' | 'expired'` and has no knowledge of the real column at all. **The
  self-contradiction this produces is total**: filtering explicitly with `?status=revoked`
  correctly used the real column in its `WHERE` clause (returning exactly the two genuinely-revoked
  certificates) — but each returned row's own `status` field still said `"active"`, live-confirmed.
  Revoking is this record type's *only* lifecycle-exit (HUD-0055: "Certificates are revoked, not
  hard-deleted"), and there is no `GET /certificates/:id` single-record endpoint at all — `GET
  /certificates` is the *only* read path this API has, so a revoked certificate was **completely
  and unconditionally invisible as revoked**, for every certificate, for every tenant, 100% of the
  time, from the day this endpoint shipped.
- **Fix:** `status: r.status === 'active' ? certStatus(r.expiry_date) : r.status` — the date-
  derived label is only meaningful while a certificate is in its normal operating state; any other
  real stored value (today, just `'revoked'`) is itself the more specific and correct thing to
  surface, with zero change to the existing active/expiring/expired behavior for every normal
  certificate.
- **Re-test, live:** `?status=revoked` now correctly returns both certificates with
  `status: "revoked"`; the unfiltered list correctly still shows a genuinely-expired certificate as
  `"expired"` and a genuinely-active one as `"active"` — no regression to the date-derived path.
  Full suite green (11 files / 105 tests), `tsc --noEmit` clean, `check:triggers` OK, API healthy
  throughout.
- **A real LOW dead-code inconsistency, documented, not fixed:** every `/org/roles*` route in
  `ondi.routes.ts` (list/create/delete/add-member/remove-member) is gated
  `requireRole('ADMIN', 'TENANT_ADMIN')` — `SUPER_ADMIN` is excluded from all of them, live-
  confirmed (`403: "requires one of [ADMIN, TENANT_ADMIN], user has role: SUPER_ADMIN"`). Yet the
  add-member handler's own logic explicitly checks `user.role !== 'SUPER_ADMIN'` before enforcing
  the `ondi.governance` plan gate — a bypass clearly intended to let a platform `SUPER_ADMIN` grant
  a time-boxed role regardless of the tenant's plan (a common support/ops-override pattern already
  used elsewhere in this codebase for a SUPER_ADMIN-only raw-SQL tool). That bypass has never once
  been reachable: the route gate rejects `SUPER_ADMIN` before that line of code can ever run. Left
  undecided rather than fixed unprompted, since the real fix is an authorization-surface decision
  (should `SUPER_ADMIN` be added to these five routes' `requireRole` lists, letting a platform
  admin manage any tenant's org roles?) rather than a value bug — but it is a narrowly-scoped,
  one-line candidate if a future turn is asked to close it, in the same spirit as HUD-0057's
  demurrage-liability gap.
- **Test-artifact handling:** the test org role and its membership were fully removed via the real
  `DELETE /org/roles/:id` (`204` implicitly cascading the membership, confirmed via the subsequent
  403) and the explicit `DELETE /org/roles/:id/members/:userId` exercised beforehand as its own
  test. The `ondi.governance` entitlement override was explicitly reverted. Usage counter restored
  to 500/500 and confirmed.

### HUD-0067 — Phase 5: FinOps budget-vs-actuals journey traced live · real HIGH bug found+fixed — voiding any bill/invoice touching a budgeted account left a phantom variance instead of netting to zero
- **Category:** Functional correctness / financial reporting integrity (Phase 5, twenty-sixth
  journey).
- **Trace:** created a real FY2026 budget, set a budget line (500,000 TZS on account `5001`
  Freight Costs, September), confirmed `GET /:id/vs-actuals` correctly showed the account's
  pre-existing real GL activity (1,000,000 actual, from an earlier journey's posted bill) against
  it with the right signed variance. Posted a new real supplier bill (300,000 TZS, category
  FREIGHT → account `5001`, `status: POSTED`) and confirmed actuals correctly rose to 1,300,000.
- **Evidence (real HIGH bug found):** voided that same bill via the real `POST /:id/void` endpoint
  (the platform's standard "void, don't delete" cleanup mechanism for any posted financial
  document) and re-checked `vs-actuals` expecting it to return to the pre-bill baseline of
  1,000,000. It instead read **700,000** — a phantom **-300,000** that shouldn't exist, live-
  confirmed with a fresh Postgres query against `journal_lines`/`journal_entries` for the exact
  three rows involved: the original entry (debit 300,000, now `status: 'VOIDED'`), and its mirror
  reversal (`GLService.voidEntry`, a *separate* entry, credit 300,000, `status: 'POSTED'`,
  `reverses_entry_id` pointing at the original). Root cause: the query's own
  `.where('je.status', '!=', 'VOIDED')` excluded the original (correct, in isolation) but not its
  reversal (incorrect) — since `voidEntry` never deletes or mutates the original entry's lines and
  always posts a *new*, separately-`POSTED` mirror rather than just flipping the original's sign in
  place, excluding one side of that pair without excluding the other breaks the cancellation by
  construction, leaving the reversal's lone opposite-signed amount standing as if it were real
  independent activity. Confirmed this is the *only* place with the bug, not a repeat of a wider
  pattern: `GLService.trialBalance` (the platform's other GL-actuals consumer) sums every
  `journal_lines` row with **no** status filter at all, so an original+reversal pair always nets to
  zero there by plain arithmetic — that file's own working code is what exposed the budgets query as
  the outlier. (`bank-reconciliation.routes.ts` uses the same `status != 'VOIDED'` filter, but for a
  different, correct purpose there: candidate-matching intentionally treats each real posting to a
  bank account, void or reversal alike, as its own bank-statement-matchable cash movement — not a
  finding.) Real, reachable impact: any tenant with a budget on an account that later has a bill,
  invoice, or other GL-sourced document voided against it during the same fiscal year — the
  platform's standard, encouraged cleanup path for a posting error — gets a silently wrong Budget
  vs. Actual report for the rest of that period, understating or overstating spend by exactly the
  voided amount with no error or warning anywhere.
- **Fix:** removed the `.where('je.status', '!=', 'VOIDED')` filter from `budgets.routes.ts`'s
  `vs-actuals` actuals query, matching `GLService.trialBalance`'s existing, correct, no-filter
  approach — a void's original and its reversal now cancel through the same plain summation either
  report relies on.
- **Re-test, live:** replayed the exact original reproduction end to end on a fresh budget/bill
  pair — 1,000,000 (baseline) → 1,300,000 (bill posted, correct) → **1,000,000** (bill voided,
  correctly back to baseline; previously 700,000). `tsc --noEmit` clean, full suite green (11 files
  / 105 tests, including a concurrent session's own new `shipment-route-access.test.ts`, left
  untouched), `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** the retest budget was deleted via the real `DELETE /v1/budgets/:id`
  (a planning record with a genuine hard-delete path, unlike posted financial documents); the
  retest bill was voided via `POST /v1/bills/:id/void`, not hard-deleted, per the platform's
  standard immutable-once-posted rule. Usage counter restored to 500/500 and confirmed.

### HUD-0068 — Phase 5: FinOps GL period close/reopen/lock (MONTH + YEAR, with real CIT accrual) traced live · CLEAN
- **Category:** Functional correctness (Phase 5, twenty-seventh journey).
- **Trace (MONTH period lifecycle):** created a real `MONTH` `gl_periods` row for an isolated,
  never-touched month (Nov 2026 — confirmed via Postgres to have zero pre-existing GL activity, so
  the test couldn't disturb any real historical figures) → posted a real manual journal entry
  dated inside it (succeeds, period open) → `POST /:id/close` (correctly returns
  `closing_entry_id: null` for a MONTH period — no closing entries, just a lock — plus a real trial
  balance snapshot whose `period_debit` for the touched account exactly matched the entry just
  posted) → attempted a second posting dated inside the now-closed period and got refused with the
  exact expected message naming the period, live-confirming `GLService.post()`'s single
  chokepoint check (not a per-route guard) actually blocks every posting path, not just the one
  tested → confirmed `FINANCE` is correctly refused `POST /:id/reopen` (`403`, "requires one of
  [SUPER_ADMIN, ADMIN, TENANT_ADMIN]") while `TENANT_ADMIN` succeeds, with the supplied reason
  persisted and the original `closed_at`/`closed_by` preserved as history rather than erased →
  confirmed the previously-refused posting now succeeds again. **Delete boundary, both directions**:
  a fresh period that was never closed hard-deleted cleanly via `DELETE /:id`; the Nov period
  (closed once, then reopened) was correctly and permanently refused deletion — `409`, "A period
  that has ever been closed cannot be deleted" — confirming the guard checks `closed_at` (a fact
  that never un-happens) rather than current `status`.
- **Trace (YEAR period lifecycle, with real corporate-income-tax accrual folded into the close):**
  posted two isolated real journal entries in a disjoint, zero-activity year (2019 — confirmed via
  Postgres) — 1,000,000 TZS revenue (`4000`) and 400,000 TZS expense (`5001`) — then created and
  closed a `YEAR` `gl_periods` row spanning them. Hand-verified the *entire* chain end to end
  before checking the API's own numbers: no tenant-specific `cit_rates` row exists, so the 30%
  `STANDARD` `REFERENCE_DEFAULT` rate applies; zero `fixed_assets` exist for this tenant at all, so
  book/tax depreciation are both zero; accounting profit = taxable income = 1,000,000 − 400,000 =
  600,000; tax liability = 600,000 × 30% = **180,000**. Confirmed the persisted `cit_returns` row
  matched exactly (`accounting_profit`/`taxable_income`: 600,000.00, `rate_pct`: 30.000,
  `rate_source`: REFERENCE_DEFAULT, `tax_liability`: 180,000.00, `status`: ACCRUED) and that
  `accrueCitReturn`'s own Dr `5950`/Cr `2400` accrual entry posted *before* the closing trial
  balance was pulled — live-confirmed by checking the snapshot itself, which correctly showed
  `5950` Income Tax Expense with `period_debit: 180,000`, meaning the tax accrual was itself folded
  into the same-period closing sweep rather than left post-tax-blind. Read the actual posted
  closing journal entry line-by-line and it matched the hand-computed expectation exactly: Dr
  `4000` 1,000,000 (closing revenue) / Cr `5001` 400,000 (closing expense) / Cr `5950` 180,000
  (closing the tax expense too) / Cr `3100` Retained Earnings 420,000 (the true *after-tax* net
  income: 1,000,000 − 400,000 − 180,000) — balanced to the shilling on both sides.
- **Came back clean — no code changes needed.** Every mechanism traced (the single-chokepoint
  closed-period guard in `GLService.post()`, the MONTH-vs-YEAR closing-entry branch, the
  reopen-is-a-new-fact-not-an-erasure history model, the ever-closed-blocks-delete-forever rule,
  and the CIT-accrual-before-closing-snapshot ordering that makes retained earnings reflect true
  after-tax income) worked exactly as its own code comments describe. `tsc --noEmit` clean, full
  suite green (11 files / 105 tests), `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** all four 2019 journal entries (the two test postings, the CIT
  accrual, and the closing entry) were voided via the real `POST /v1/finance/journal-entries/:id/
  void` — each reversal posts dated today, outside the closed 2019 period, so no reopen was needed
  first. The isolated FY2019 `gl_periods` row itself is now a permanent historical record (closed
  periods can never be hard-deleted, by design — the same rule verified above) and was left in
  place, clearly named `HUD-0068 isolated FY2019`. The Nov 2026 MONTH period was left reopened
  (its own test already exercised the full close→reject→reopen→resume cycle). The throwaway Dec
  2026 period was already hard-deleted as part of the delete-boundary test above. Usage counter
  restored to 500/500 and confirmed.

### HUD-0069 — Phase 5: FinOps withholding tax (rate → bill deduction → certificate → remittance) journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, twenty-eighth journey).
- **Trace:** created a real tenant WHT rate (5%, `PROFESSIONAL_SERVICES`, `RESIDENT`) → created a
  real bill (1,000,000 TZS, one line tagged with that rate) → paid it in **two** installments
  (600,000 then 400,000) specifically to test the code's own claim that a bill withholds its total
  WHT once across installments, not once per payment. Hand-verified before checking the API:
  `billTotalWht` = 1,000,000 × 5% = 50,000; payment 1 (60% of the bill) should withhold
  `min(50,000, round(50,000×0.6))` = 30,000; payment 2's *remaining* cap is `50,000 − 30,000` =
  20,000, and `round(50,000×0.4))` = 20,000, so payment 2 withholds exactly 20,000 — summing to
  the full 50,000, never double-withheld. The API returned `wht_deducted: 30000` then `20000`,
  matching exactly, and the two persisted `wht_deductions` rows (each tied to its own
  `bill_payment_id`) confirmed it wasn't a response-only figure. Read every journal line directly
  from Postgres and hand-verified both payments' 3-line postings: payment 1 — Dr `2000` (AP)
  600,000 / Cr `1010` (Bank) 570,000 / Cr `2300` (WHT Payable) 30,000; payment 2 — Dr `2000`
  400,000 / Cr `1010` 380,000 / Cr `2300` 20,000 — each balanced, `2300`'s two credits summing to
  exactly the 50,000 total liability.
- **Certificate:** issued a real certificate for one deduction (`POST .../certificate`), confirmed
  re-issuing it is genuinely idempotent (identical `certificate_number` and `certificate_issued_at`
  on the second call, not a new one), then fetched and read the actual PDF with `pdftotext` rather
  than trusting the `200` alone — every figure on it was real and correct: the right supplier name,
  the right bill reference, the right payment date, gross 400,000 / rate 5.00% / withheld 20,000 /
  net 380,000, all matching the underlying deduction row exactly.
- **Remittance:** batched both deductions into one `PENDING` remittance for the period covering
  both payment dates — `total_amount: 50,000`, `deduction_count: 2`, both correct — then confirmed
  a second remittance attempt for the same period is correctly refused (`400`, nothing left
  unremitted, since both deductions are now tagged to the first batch). Paid the remittance and
  hand-verified its own journal entry: Dr `2300` (clearing the withholding-tax liability) 50,000 /
  Cr `1010` (cash to TRA) 50,000 — netting `2300`'s balance back to exactly zero across the whole
  lifecycle (credited 30,000+20,000 at payment time, debited 50,000 at remittance time). Confirmed
  a second payment attempt on the same remittance is correctly refused (`409`, "already been
  paid").
- **Came back clean — no code changes needed.** Every mechanism traced (proportional-and-capped
  per-installment withholding, idempotent certificate issuance, a real branded PDF, remittance
  batch eligibility filtering, and the remittance-payment GL posting) worked exactly as its own
  code comments describe. `tsc --noEmit` clean, full suite green (11 files / 105 tests),
  `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** the WHT rate could not be hard-deleted once referenced by the bill
  line — confirmed live (`409`, "already used on one or more bill lines... set an effective_to
  date instead") — so it was retired via `PATCH .../rates/:id` with `effective_to` set to today,
  exactly the remediation the API's own error message names, rather than left silently orphaned.
  The bill itself was **left as a real, completed PAID record** rather than voided: by the time
  this trace finished, its WHT had already been both deducted and remitted to the (simulated) tax
  authority — reversing the bill at that point is a real, unusual accounting edge case (money
  already paid out to TRA doesn't come back by reversing the underlying bill) that this golden path
  wasn't testing and wasn't going to manufacture just to exercise a delete path; the bill, its
  payments, its WHT deductions, its certificate and its remittance are all clearly labeled
  `HUD-0069` in every human-readable field. Usage counter restored to 500/500 and confirmed.

### HUD-0070 — Phase 5: Store marketplace-app journey traced live · real HIGH authorization gap found+fixed (CUSTOMER-portal accounts could submit into the platform-wide review queue); also corrects the platform overview's mischaracterization of what this app is
- **Category:** Functional correctness + authorization (Phase 5, twenty-ninth journey).
- **Discovery, before tracing the golden path:** `store.routes.ts` (`/v1/store`) is the entirety of
  the "Store" app's backend — confirmed by grepping every `apiFetch` call in `Store.tsx` (browse/
  install/uninstall), `StoreAdmin.tsx` (the SUPER_ADMIN approval queue) and
  `StoreDeveloperPortal.tsx`, all of which call only `/v1/store/*`. It is a **software/integrations
  marketplace** on a single platform-wide `marketplace_apps` table (`dbPlatform`, not tenant-
  scoped): a signed-in user submits an app, a `SUPER_ADMIN` approves or rejects it, and approved
  apps become installable per-tenant. This is a materially different thing from "B2B procurement &
  equipment marketplace" — the slogan this arc's own `hudumika-overview.html` had been carrying for
  "Store" — so that description was corrected as part of this journey's own artifact sync (see
  below), the same kind of evidence-grounded correction as Projects' 85%→52% re-rating.
- **Trace:** submitted a real app listing as a `JUNIOR` staff account → `SUPER_ADMIN` saw it in the
  admin queue (confirmed a non-`SUPER_ADMIN` staff account is correctly refused that same endpoint,
  `403`) → approved it → confirmed it now appears in the public `GET /apps` catalog with
  `status: "approved"` → confirmed a role outside `STORE_MGMT_ROLES` is correctly refused
  `POST /installed` (`403`) → a `TENANT_ADMIN` installed it → confirmed it shows in
  `GET /installed` → uninstalled it → confirmed it's gone. Separately submitted a second app and
  rejected it, confirming a rejected app never appears in the public catalog (the `WHERE status =
  'approved'` filter holds). Every step of the intended lifecycle worked exactly as designed.
- **Evidence (real HIGH bug found):** before running the golden path, tested `POST /apps` (app
  submission) with a real `CUSTOMER`-role JWT — the identity of a *tenant's own customer*, using
  their customer portal, not a platform developer. It succeeded, `200`, creating a real row in the
  platform-wide review queue with `developer_id` set to that customer's own user id. This file's own
  header comment documents that an earlier pass already fixed this exact class of gap for
  `POST/DELETE /installed` (`STORE_MGMT_ROLES`, "any authenticated user, CUSTOMER included, could
  install/uninstall a marketplace app for the whole tenant") — `POST /apps` was the one mutating
  route in the file that pass missed. Not a tenant-isolation leak (nothing reaches a real user until
  a human `SUPER_ADMIN` approves it) but a clear role-boundary violation matching the platform-wide
  "CUSTOMER accounts blocked from internal-business surfaces" convention enforced everywhere else on
  this platform, including two other routes in this exact file — rated HIGH rather than CRITICAL for
  that reason (bounded by the human approval gate, but a customer account submitting an
  attacker-controlled `webhook_url` for review, per this file's own comment about approved apps with
  webhooks receiving domain events, is a real risk if a reviewer doesn't realize the submitter wasn't
  a real developer).
- **Fix:** added the same "HUD-0024 continuation" CUSTOMER-block `preHandler` already used platform-
  wide to `POST /apps` specifically (not the whole file — `GET /apps` and `GET /installed` are
  deliberately readable by any authenticated role, including CUSTOMER, and were already correct).
- **Re-test, live:** replayed the exact original reproduction — the same CUSTOMER JWT now gets `403:
  "Not available for this account type."` A `JUNIOR` staff account immediately after, same request
  shape, still succeeds `200`, proving the fix is scoped to the role, not accidentally blocking
  everyone. `tsc --noEmit` clean, full suite green (11 files / 105 tests), `check:triggers` OK, API
  healthy throughout.
- **Test-artifact handling:** `marketplace_apps` has **no delete endpoint anywhere in the API** —
  confirmed by reading the entire route file. The pre-fix CUSTOMER-submitted probe row, the
  legitimate approved-then-uninstalled test app, and the rejected test app were all left in place,
  each clearly labeled `HUD-0070` in every human-readable field, consistent with this arc's rule for
  a record type with no real delete path. Usage counter restored to 500/500 and confirmed.

### HUD-0071 — Phase 5: FinOps deferred tax (fixed-asset timing differences, IAS 12) journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, thirtieth journey).
- **Trace:** created a real backdated fixed asset (24,000,000 TZS, `IT_EQUIPMENT` — Tanzania Income
  Tax Act Class 1, 37.5% reducing-balance — acquired exactly 2 years before the test date) with zero
  book depreciation ever posted against it (this platform's fixed-asset depreciation runs only via a
  scheduled job with no manual "run now" API route — a known, already-documented gap — so a
  brand-new asset's `bookNBV` is genuinely `cost − salvage − 0` regardless of how old its
  `acquisition_date` is set to, which is exactly the real, honest state this trace computed against,
  not a fabrication). Hand-verified before checking the API: at the first test date (exactly 1 whole
  year after acquisition), `taxNBV` = 24,000,000 × (1 − 0.375)¹ = 15,000,000; `bookNBV` = 24,000,000
  (unchanged); temporary difference = 9,000,000 (book > tax → taxable → a Deferred Tax
  **Liability**, per IAS 12's sign convention) × the tenant's real 30% reference-default CIT rate
  (already confirmed in HUD-0068) → target DTL = 2,700,000. The API's `POST /compute` response matched every one
  of these figures exactly, and the actual posted journal entry (read straight from Postgres) was
  Dr `5951` (Deferred Tax Expense) / Cr `2450` (Deferred Tax Liability), both 2,700,000, balanced.
- **Idempotency:** re-ran `/compute` with the *same* `as_of_date` and confirmed both `deltaDta` and
  `deltaDtl` correctly came back `0` with the *same* `journal_entry_id` as the first call (the
  `ON CONFLICT ... COALESCE` correctly preserved it rather than nulling it out) — and confirmed
  directly against Postgres that no second journal entry was ever created, not just trusting the
  response.
- **Incremental movement (the most sophisticated part of this feature):** re-ran `/compute` a full
  year later (3 years post-acquisition) and hand-verified the new target: `taxNBV` = 24,000,000 ×
  0.625² = 9,375,000; temporary difference = 14,625,000; target DTL = 4,387,500. The API returned
  `deltaDtl: 1,687,500` (the *movement* from the prior 2,700,000 target to the new 4,387,500 one,
  not the full new balance again) and posted a *second*, separate journal entry for exactly that
  incremental amount — confirmed live that the cumulative `2450` balance across both entries
  (2,700,000 + 1,687,500) landed exactly on 4,387,500, proving `computeAndPostDeferredTax` genuinely
  reads the *live* ledger balance as its "prior" figure on each call rather than trusting its own
  last computation row, exactly as its own header comment claims.
- **Came back clean — no code changes needed.**
- **A self-caught non-bug in my own verification, not a platform bug:** my first cleanup-verification
  query filtered `WHERE je.status != 'VOIDED'` when summing the `2450`/`5951` accounts after voiding
  both test entries — the exact same wrong pattern already found and fixed as HUD-0067 — and it
  produced the same *kind* of misleading nonzero balance HUD-0067 would have. Caught before reporting
  anything: re-summed with no status filter (matching `GLService.trialBalance`'s correct approach)
  and confirmed both accounts net to exactly zero across all four entries (two originals, two
  reversals). Not a new finding — a reminder that the HUD-0067 lesson applies to ad-hoc verification
  scripts just as much as to product code.
- **Test-artifact handling:** both deferred-tax journal entries were voided via the real
  `POST /journal-entries/:id/void`. The fixed asset itself was hard-deleted via the real
  `DELETE /v1/fixed-assets/:id` — legitimate here because no depreciation had ever posted against it
  (per `fixed-assets.routes.ts`'s own documented rule, confirmed in HUD-0062), which also correctly
  reversed its acquisition entry. Usage counter restored to 500/500 and confirmed. `tsc --noEmit`
  clean, full suite green (11 files / 105 tests), `check:triggers` OK, API healthy throughout.

### HUD-0072 — Phase 5: Ondi/NexusHR org chart journey traced live · real MEDIUM data-correctness bug found+fixed (sync-staff added the tenant's own CUSTOMER-portal accounts into the internal staff hierarchy)
- **Category:** Functional correctness / data correctness (Phase 5, thirty-first journey).
- **Trace:** the dev tenant already carried a real 7-node demo hierarchy (CEO→COO/CFO→four
  managers) seeded by an earlier session's own use of `POST /reset`. Ran `POST /sync-staff` (the
  real "import company staff" action) and confirmed it correctly added every real staff user not
  already present, parented to the existing top node.
- **Evidence (real MEDIUM bug found):** the synced result included **two `CUSTOMER`-role accounts**
  ("Sample Contact", "Aliko Dangote Jr" — real customer-portal identities for this tenant's own
  clients) inserted as staff nodes with `job_title: "CUSTOMER"`. Root cause: the `staffUsers` query
  in `sync-staff` selected every row from `users` for the tenant with **no role filter at all** —
  the handler's own name and comment ("import/sync company staff") describe a staff-only action,
  but nothing in the code enforced that. Not a security/tenancy issue (no cross-tenant data, no
  unauthorized access — the bug is a data-*correctness* one: a tenant's own customers get
  mis-classified as members of the company's org structure), but real and reachable: any
  `MANAGER`/`ADMIN`/`TENANT_ADMIN` clicking "Sync Staff" in the real `OrgChart.tsx` UI today gets
  this exact result on any tenant with active customer-portal accounts.
- **Fix:** added `.where('role', '!=', 'CUSTOMER')` to the `staffUsers` query — the same
  CUSTOMER-exclusion convention this codebase already applies platform-wide, here used for data
  correctness rather than access control.
- **Re-test, live:** removed the two polluted nodes via the real `DELETE /:id`, then re-ran
  `POST /sync-staff` — the two `CUSTOMER` accounts correctly did **not** reappear, while all seven
  real staff accounts (JUNIOR/SENIOR/MANAGER/FINANCE/SALES/TENANT_ADMIN) were still present, proving
  the fix is scoped to the one role, not a blanket exclusion.
- **Rest of the golden path — clean:** a `JUNIOR` account (no `org_chart.manage` permission, not in
  the coarse role list) was correctly refused node creation (`403`); a `MANAGER` successfully
  created a real child node and a grandchild under it; **the delete-and-reparent guard was
  live-verified to actually work**, not just read from the code — deleting the middle node correctly
  moved the grandchild's `parent_id` to the deleted node's *own* parent (Head of Logistics),
  live-confirmed against the returned row, rather than orphaning it or leaving a dangling reference.
  Deleting a node is correctly restricted to a narrower role set (`ADMIN`/`TENANT_ADMIN`/
  `SUPER_ADMIN` — `MANAGER` can create/update but not delete, confirmed live as a `403`) than
  create/update/`bulk-positions`, a deliberate and reasonable asymmetry, not a bug. `bulk-positions`
  correctly updated a node's coordinates in one call. A `CUSTOMER` JWT was correctly refused even
  `GET /org-chart` entirely (`403`), confirming the file's existing CUSTOMER-block hook still works.
- **A standing gap, reconfirmed rather than rediscovered — not newly filed:** grepped every
  reference to `org_chart_nodes` outside this file and confirmed the org chart remains a
  **standalone visualization/directory feature with no other module consuming it** — NexusHR's own
  legacy `GET /org-chart` route is now just a `410` redirect notice, not a real integration. The
  2026-08-22 finding that "no org-chart/manager resolution exists anywhere" (referenced in Petti's
  approval-workflow design) is therefore still accurate even though org-chart itself is now a real,
  working feature — nothing elsewhere on the platform resolves "who is this person's manager" from
  it. Not filed as a new issue since it was already known; recorded here as reconfirmed evidence.
- **Test-artifact handling:** the real synced staff nodes were left in place (they are correct,
  genuine state — the tenant's actual staff, not test data). The manually-created test team-lead and
  grandchild nodes were both deleted via the real `DELETE /:id`. Usage counter restored to 500/500
  and confirmed. `tsc --noEmit` clean, full suite green (11 files / 105 tests), `check:triggers` OK,
  API healthy throughout.
- **Addendum (2026-09-14, journey 39) — a real HIGH gap this trace missed, found and fixed by a
  concurrent session:** this journey's own RBAC checks covered create/update/delete/bulk-positions
  but never questioned whether `GET /org-chart` itself needed gating — "any non-CUSTOMER role can
  browse" was accepted as the platform's usual convention without weighing what this specific list
  actually returns: every staff member's real name, job title, department, **email, and phone
  number**, not the more anodyne data most "browse freely" lists expose. A concurrent session found
  exactly that (its own new code comment: "any authenticated non-CUSTOMER role... could read every
  staff member's name, title, department, email and phone straight from the API — a frontend-only
  gate, not a real boundary") and added the same `requireRoleOrOrgPermission(ORG_CHART_MANAGE, ...)`
  gate the rest of the file already uses. Live-reconfirmed here: a `JUNIOR` JWT is now correctly
  refused (`403`). Not this session's fix — recorded for completeness and as a self-correction: a
  "browse vs. mutate" RBAC check needs to weigh what fields a list actually exposes, not just
  whether *a* role gate exists on the mutating siblings.

### HUD-0073 — Phase 5: NexusHR biometric attendance-device journey traced live · real HIGH secret-leak bug found+fixed (`push_token` — the sole credential authenticating the unauthenticated device-push endpoint — was readable by every staff role) + a genuinely sophisticated punch→session→attendance pipeline confirmed CLEAN
- **Category:** Functional correctness + a real credential-exposure bug (Phase 5, thirty-second
  journey).
- **Trace (the real pipeline — CLEAN):** registered a real device (`POST /`, real
  `serial_number`/`push_token`/`serverUrl` generated) → enrolled a real staff user against PIN
  `1001` → used `POST /:id/simulate-punch` (a route built specifically because no physical device
  exists to test against — it drives the *exact same* `recordDevicePunches()` pipeline a genuine
  device push uses, not a separate fake path) to fire two punches a few seconds apart → read the
  resulting `hr_clock_sessions` row directly from Postgres: `source: 'DEVICE'`, correct
  `clock_in_at`/`clock_out_at`, `status: 'COMPLETED'` — confirming the "unreliable status code"
  fallback (device sends no real in/out state, so punches pair sequentially by index) actually
  works, not just the documented-but-untested "reliable status" branch. Confirmed the *same* real
  `hr_attendance` sync every other clock-in source uses also fired (`method: 'BIOMETRIC'`,
  `status: 'PRESENT'`, matching times) — this is genuinely the same pipeline as a web/manual
  clock-in, not a parallel system. Simulated a punch on an **unenrolled** PIN and confirmed it
  correctly lands as an orphan (`user_id: null`, `matched: 0`, `processed: false`) rather than
  being silently dropped or mis-attributed. Assigned the orphan to a real employee via
  `PATCH .../assign` and confirmed it both creates a real enrollment for future punches **and**
  reprocesses that specific historical punch into a real session (`status: 'ACTIVE'`, no
  `clock_out_at`/`worked_minutes` for a lone unpaired punch — correct). RBAC confirmed live: a
  `JUNIOR` is correctly refused every mutation (register/enroll/simulate) but can still browse the
  device list, matching the platform's established "browse freely, mutate restricted" convention.
- **Evidence (real HIGH bug found):** `GET /` (the authenticated device list, open to any
  non-CUSTOMER staff role) used `.selectAll()`, live-confirmed to include the device's real
  `push_token` in the response to a plain `JUNIOR` JWT with zero device-management permission.
  `device-ingest.routes.ts`'s own header comment explains exactly what this token is: the *sole*
  shared secret (alongside the equally-readable `serial_number`) authenticating the genuinely
  unauthenticated (no JWT — a biometric terminal can't carry one) `/iclock` push endpoint, compared
  with a deliberate constant-time check specifically to resist guessing. `attendance-devices.
  routes.ts`'s own registration comment already states the token is "returned once... not
  retrievable again after this" — `GET /` (and `PATCH /:id`, which used `.returningAll()` on an
  update) directly contradicted that. Impact: any authenticated staff member of the tenant,
  regardless of role, could read both values needed to fully impersonate the physical device and
  push fabricated attendance punches for any of its enrolled employees — clocking someone in or out
  at will, fabricating overtime, or hiding an absence, in a system whose entire purpose is
  trustworthy time-and-attendance record-keeping. Confirmed via the frontend (`HRM.tsx`) that
  `push_token` is only ever read from the one-time `POST /` registration response, never from the
  device list — the leak served no UI purpose.
- **Fix:** both `GET /` and `PATCH /:id` now select an explicit safe column list excluding
  `push_token` (`DEVICE_SAFE_COLUMNS`), leaving `POST /`'s one-time reveal untouched.
  `DELETE /:id` was checked and found already safe despite its own `.returningAll()` — it responds
  `204 No Content` with `null`, so the fetched row (needed internally for the activity-log message)
  never reaches the client.
- **Re-test, live:** the same `JUNIOR` JWT's `GET /` response no longer contains a `push_token` key
  at all (confirmed by key-presence check, not just eyeballing); a `PATCH` by a `TENANT_ADMIN`
  confirmed the same for the update response. `tsc --noEmit` clean, full suite green (11 files /
  105 tests), `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** both test enrollments and the device itself were deleted via the real
  API (`DELETE /:id/enrollments/:enrollmentId`, `DELETE /:id`) — device deletion correctly cascaded
  the raw `attendance_device_events` rows (0 remaining) but, exactly as intended, left the two
  *derived* `hr_clock_sessions` rows in place: these are now real attendance history independent of
  whether the originating device still exists, the same "delete the source, keep the posted record"
  boundary already established for bank statements vs. GL entries (HUD-0064). `hr_clock_sessions`
  has no delete endpoint anywhere in `hr.routes.ts` — left in place as a record type with no real
  delete path, consistent with this arc's rule. Usage counter restored to 500/500 and confirmed.

### HUD-0074 — Phase 5: NexusHR overtime journey traced live · CLEAN, including a live-demonstrated race-condition guard
- **Category:** Functional correctness (Phase 5, thirty-third journey).
- **Trace:** set a real basic salary (1,500,000 TZS) on a real staff user via the real
  `PATCH /v1/hr/staff/:id` endpoint (this tenant had no user with a salary set at all, so the
  successful payable-amount path had never been exercised with real data before). Confirmed all
  four pre-write validations live: a claim exceeding 12 hours in a single day is refused (`400`);
  a claim dated in the future is refused (`400`); a second claim on a date that already has one is
  refused with the exact existing claim's id (`409`); and — the load-bearing one — the day's overtime
  *kind* (and therefore its rate) is derived from the tenant's real holiday calendar, not accepted
  from the request: an ordinary weekday claim correctly came back `NORMAL`/1.5x, a Saturday claim
  correctly came back `REST_DAY`/2.0x, with no way for the caller to request the cheaper rate for a
  day it doesn't apply to.
- **The rolling four-week statutory cap (50 hours) — the most interesting part of this journey:**
  built up five real approved claims across a cluster of dates (12+12+12+12+2 = 48 then 50 hours)
  and hand-verified the API's own `remaining_in_window` figure at every step (47→38→26→14→2→0),
  each matching a fresh independent hand-calculation, not just trusting the running total. Confirmed
  the boundary is enforced exactly, not approximately: a claim for 5 hours when only 2 remained was
  refused with the precise remaining figure quoted back (`"48 already approved, so 2 remain and 5
  were claimed"`); a claim for exactly the remaining 2 hours succeeded.
- **Live-demonstrated the exact race condition the code's own header comment names** ("re-checked at
  approval, not only at claim: other claims may have been approved in between, and it is approval
  that spends the allowance"): with 48 hours already approved (2 remaining), created **two separate
  PENDING claims**, each independently valid at claim-time against that same remaining-2 pool (one
  on a Saturday, one on a Sunday, 2 hours each — both correctly priced at the 2.0x rest-day rate).
  Approved the first, bringing the total to exactly 50. Attempted to approve the second — **correctly
  refused** (`409`, "50 already approved, so 0 remain and 2 were claimed"), even though it had been
  perfectly valid at the moment it was submitted. This is a genuine, deliberately-designed safeguard
  against a real double-spend race, verified with an actual two-pending-claims scenario rather than
  just trusted from reading the code.
- **Also confirmed live:** rejecting a claim without a `decision_note` is refused (`400`, "a reason
  is required"); rejecting one with a note correctly clears `approved_by`; a `JUNIOR` viewing another
  user's overtime via `?user_id=` is correctly refused (`403`) while their own unfiltered view
  correctly shows only their own records; `GET /overtime/payable`'s hourly-rate and amount math was
  hand-verified against every one of six approved claims — `1,500,000 ÷ 26 ÷ 8 = 7,211.54`/hour, then
  `× hours × multiplier` for each — and matched the API's own figures to the cent on every row,
  including the mixed 1.5x/2.0x rates in the same period.
- **Came back clean — no code changes needed.**
- **Test-artifact handling:** every test claim was cleaned up via a real, previously-undocumented
  mechanism confirmed live: an approver can transition an already-`APPROVED` claim to `CANCELLED`
  (clearing `approved_by`/`approved_at`), which is the genuine cleanup path for this record type —
  used to cancel all six approved claims rather than leaving them in the tenant's real overtime
  ledger. The one rejected claim (from the race-condition test) was left as a real `REJECTED` record,
  since rejection is itself a legitimate terminal state, not test pollution. The test user's
  `basic_salary` was reverted to its original `null` via the same real `PATCH` endpoint used to set
  it. Usage counter restored to 500/500 and confirmed. No code changed, so the standard
  `tsc`/`vitest`/`check:triggers` re-verification was run anyway as a sanity check and passed —
  except for one unrelated `tsc` finding, noted below rather than investigated further, since it
  falls outside this journey and outside code this session has touched.
- **An unrelated, pre-existing observation, not investigated further:** `apps/api`'s `tsc --noEmit`
  now fails on `email.routes.ts:390` (`Type 'string' is not assignable to type` a template-literal
  UUID type) — confirmed via `git status`/`git log` that this file was never touched by this audit
  session; it arrived via two commits (`07d8c1ce`, `9036a0c0`) made by a different, concurrent
  session's own in-progress feature work sometime during this session's Phase 5 work (that same
  process appears to have also committed this session's own then-uncommitted `budgets.routes.ts`
  fix, HUD-0067, alongside its changes — confirmed present and correct in the current `HEAD`). Not
  fixed here: it is unrelated to this journey, outside this session's own working set, and touching
  a concurrent session's still-evolving commit without being asked is exactly the kind of
  cross-session collision this codebase's own memory already warns about avoiding.

### HUD-0075 — Phase 5: Calendar public booking-page journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, thirty-fourth journey) — the first this arc to
  exercise a genuinely unauthenticated public surface end to end (no JWT anywhere in the request).
- **Trace:** created a real booking page for a real staff member (30-min slots, 15-min buffer,
  09:00–12:00 weekday hours, 14-day window) via the authenticated `POST /v1/tasks/booking-pages` →
  fetched it publicly via `GET /v1/booking-public/:slug` with **no Authorization header at all** and
  confirmed the response correctly strips `tenantId`/`userId` (only `hostName` and display fields
  reach the public) → `GET .../slots?date=...` for a real weekday returned exactly the 6
  hand-computed 30-minute slots between 09:00 and 12:00. Confirmed both boundary cases return an
  empty array rather than an error: a weekend date (not in the page's `workingDays`) and a date past
  the 14-day booking window.
- **The buffer logic — the most subtle part of this feature, verified exactly:** created a real
  30-minute calendar event on the host's own calendar (10:00–10:30) via the authenticated
  `POST /v1/tasks/events`, then re-fetched the public slots for that day. Hand-calculated that the
  15-minute buffer extends the busy window to 09:45–10:45, which should knock out not just the
  10:00 slot but also the adjacent 09:30 and 10:30 slots — the API returned exactly `[09:00, 11:00,
  11:30]`, matching precisely.
- **The real booking + double-booking race guard:** booked the 11:00 slot as a genuinely anonymous
  public caller (name/email only, no auth) and confirmed a real `calendar_events` row was created on
  the host's calendar with the correct title (`"... with Aisha Kimaro"`), correct guest JSON, and
  `booking_page_id` traceability back to the page — plus a real notification for the host. Then
  immediately attempted to book the **exact same slot** again as a different caller — correctly
  refused (`409`, "That time was just booked by someone else"), confirming the code's own claim that
  it re-checks the slot at booking time, not just page-load time, actually holds.
- **Also confirmed live:** a nonexistent slug correctly 404s; creating a second booking page with an
  already-taken slug is correctly refused (`409`).
- **Came back clean — no code changes needed.** `tsc --noEmit` clean (aside from the unrelated,
  already-noted HUD-0074 regression), full suite green (11 files / 105 tests), `check:triggers` OK,
  API healthy throughout.
- **Test-artifact handling:** both calendar events (the booked slot and the blocking meeting) and
  the booking page itself were deleted via their real `DELETE` endpoints; confirmed the public page
  correctly 404s once deleted. Usage counter restored to 500/500 and confirmed.

### HUD-0076 — Phase 5: FinOps period-end FX revaluation journey traced live · real HIGH bug found+fixed (unposted Draft/DRAFT/PENDING_APPROVAL documents were revalued anyway, posting a phantom gain/loss straight onto the real AR/AP balance)
- **Category:** Functional correctness / financial reporting integrity (Phase 5, thirty-fifth
  journey).
- **Trace:** created a real USD sales invoice and a real USD supplier bill (both open, unpaid,
  against a TZS-reporting tenant). Self-caught a test-setup mistake before it became a false
  finding: the first invoice attempt used the wrong field names (`lines`/`customer_name` instead of
  the real `items`/`client_name`), which Zod silently dropped, producing a real invoice with **zero**
  line items and a `0.00` total — correctly excluded from revaluation by the `openFc > 0.01` check.
  Confirmed via Postgres before assuming a bug, voided the empty invoice, and recreated it correctly.
  Ran the *first-ever* revaluation for both real subjects and confirmed the documented "clean
  baseline" design: `comparisonRate === currentRate`, `gainLoss: 0`, no journal entry posted — this
  module deliberately never trusts either document type's own stored `exchange_rate` field as a
  first comparison rate (a real correction the code's own header comment documents finding during
  implementation research, not assumed at design time).
- **Evidence (real HIGH bug found):** the first "real" revaluation run (a later date, a different
  real fetched USD/TZS rate) reported `subjectsRevalued: 3` and a `totalGain` that didn't match
  either of my two real subjects' hand-computed gains. Investigated rather than assumed: a
  **pre-existing Draft invoice already in this tenant** (`INV-0009`, USD, 1550 open) was being
  revalued as a third subject. Confirmed directly against Postgres that this Draft invoice has
  **zero journal entries of any kind** — `invoices.routes.ts`'s own `POST /` only posts to the GL
  `if (inv.status !== 'Draft' && grandTotal > 0)`, so a Draft invoice has never touched the real
  `1100` Accounts Receivable balance at all. Yet the revaluation module posted a real
  5,223.50 TZS debit to `1100` / credit to `5202` (FX Gain) for it anyway — a phantom gain on a
  receivable that does not exist in the ledger, silently inflating the real AR balance and P&L with
  no underlying transaction to justify it. Checked the AP side too: `bills.routes.ts` only posts to
  the GL `if (bill.status === 'POSTED')`, so a bill sitting in `DRAFT` or `PENDING_APPROVAL` has the
  identical unposted-phantom-balance exposure — same bug, same root cause, on the other ledger side.
  Real, reachable impact: any tenant that keeps some invoices/bills in an unfinalized state while
  running a completely normal month-end FX revaluation — not an edge case, an everyday workflow —
  gets its real AR/AP balances silently corrupted by a gain/loss that was never actually earned or
  incurred.
- **Fix:** added `'Draft'` to the invoice exclusion list and `'DRAFT'`/`'PENDING_APPROVAL'` to the
  bill exclusion list in `fx-revaluation.service.ts`'s subject-selection queries, matching each
  document type's own real GL-posting condition exactly (not a guess — read straight from
  `invoices.routes.ts`/`bills.routes.ts`'s own posting `if` statements).
- **Re-test, live:** voided the tainted combined journal entry (it mixed the phantom Draft-invoice
  lines with my two legitimate subjects' correct lines in one entry) and cleared the three
  contaminated `fx_revaluations` tracking rows for that period_date, then re-ran the exact same
  revaluation fresh with the fix active: `subjectsRevalued: 2` (the Draft invoice correctly excluded
  this time), `totalGain`/`totalLoss` matching my hand-computed real-subject figures exactly, and
  the resulting journal entry read back from Postgres containing **only** the two real subjects'
  four lines — no trace of the phantom Draft-invoice posting. Re-confirmed the already-documented
  same-date-doesn't-double-post guard still holds (a same-date re-run correctly posted zero further
  movement, confirmed only one non-voided entry exists for that date). `tsc --noEmit` clean, full
  suite green (11 files / 105 tests), `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** the tainted revaluation entry, the clean re-posted revaluation entry,
  the test bill, and the test invoice were all voided/reversed via their respective real API `/void`
  endpoints — each is a posted financial document under this platform's standard immutable-once-
  posted rule. The two contaminated `fx_revaluations` tracking rows (a supplementary audit table
  with no delete endpoint anywhere in the API) were cleared directly as a narrowly-scoped correction
  of this session's own erroneous test run, not a bypass of any real feature. The pre-existing Draft
  invoice (`INV-0009`) was left untouched — it predates this session, has zero GL impact, and is not
  this session's artifact to clean up. Usage counter restored to 500/500 and confirmed.

### HUD-0077 — Phase 5: Suppliers journey traced live · CRUD CLEAN; a real MEDIUM design-level gap found (a supplier marked "blocked" has zero enforcement anywhere), documented, not fixed
- **Category:** Functional correctness (Phase 5, thirty-sixth journey) + a MEDIUM finding (master
  severity model's design-gap bucket, same shape as HUD-0057's demurrage-liability finding).
- **Trace (CRUD — clean):** created a real supplier with full contact/category/payment-terms
  fields → confirmed a `JUNIOR` can browse/search the directory (search correctly matches on
  `name`, `contact_name`, *and* `email`, live-verified with a contact-name-only query) but is
  correctly refused creation (`403`) → updated fields via `PATCH`, persisted correctly → soft-deleted
  via `DELETE` (`TENANT_ADMIN`-tier) and confirmed the record still exists afterward with
  `status: 'inactive'` rather than being removed — the documented "mirrors the customers convention"
  soft-delete, verified live rather than assumed from the comment.
- **Evidence (real MEDIUM design gap found):** grepped every reference to `'blocked'` platform-wide
  and confirmed the supplier `status` enum's `blocked` value is set and read **only** inside
  `suppliers.routes.ts` itself — nothing in `bills.routes.ts`, purchase orders, or anywhere else
  that transacts with a supplier ever checks it. Live-confirmed the real consequence: set a test
  supplier's status to `blocked` (with a realistic note, "fraud investigation in progress"), then
  created and **posted** a real 500,000 TZS bill against that exact supplier — it succeeded, `201`,
  with a real GL entry, no warning, no refusal, nothing anywhere in the response indicating the
  supplier was blocked. A "Blocked" status that provides zero actual protection against further
  transactions is, today, a purely cosmetic label — the same shape of gap as HUD-0057's demurrage
  `liable_party` (a real column, a real enum value, a real UI affordance, and no code path anywhere
  that acts on it). Not fixed on the spot: whether blocking should hard-refuse a bill outright, only
  warn, or require an explicit override-with-reason is a product decision this trace can't make
  unilaterally, matching this arc's standing rule for design-level gaps.
- **Came back otherwise clean — no code changes needed.** `tsc --noEmit` clean, full suite green
  (11 files / 105 tests), `check:triggers` OK, API healthy throughout (no code changed this
  journey, so this was a sanity re-run rather than a required gate).
- **Test-artifact handling:** the test bill was voided via the real `POST /:id/void` (it posted a
  real GL entry). The test supplier was restored to `active` then soft-deleted via the real
  `DELETE /:id` — left as a genuine `inactive` record, consistent with the platform's own
  soft-delete convention for this record type, rather than force-removed around it. Usage counter
  restored to 500/500 and confirmed.

### HUD-0078 — Phase 5: Email app journey traced live, independently verifying a concurrent session's own just-finished completion pass · CLEAN across every feature exercised
- **Category:** Functional correctness (Phase 5, thirty-seventh journey) — the first this arc
  deliberately triggered by a *different session's* own self-reported work, verified independently
  rather than taken on faith (per the standing "verify from live evidence, not another session's
  self-assessment" discipline this arc already applies to code-derived claims).
- **Context:** a concurrent session's own new memory entry claims a "100% completion" pass on Email
  (real threading, scheduled/undo-send, multi-attachment, full-text search, custom labels,
  quick-reply templates, bulk actions, IMAP test-connection) — the same session whose commits
  briefly regressed this arc's own `tsc --noEmit` at journey 33 (HUD-0074) before self-resolving by
  journey 35 (HUD-0076). Confirmed via the filesystem this is real, substantial work before tracing
  it — three new migrations (460–462, "email_app_completeness/100pct/polish"), a real scheduled-send
  job wired into the dev server's actual job scheduler (`setInterval`, every 15 seconds), and a real
  IMAP ingest job — not just a claim.
- **Trace (undo-send):** sent a real message (default 10-second undo window, confirmed in the
  response) and confirmed it lands in the `scheduled` folder. Self-caught a false alarm along the
  way: a first attempt to verify-then-undo came back empty from `GET /?folder=scheduled` — instead
  of assuming a bug, reasoned through it and confirmed live with a second, faster-executed message:
  the first one had simply already been picked up by the real 15-second delivery sweep in the
  several seconds of real wall-clock time between my own tool calls (the job only requires
  `scheduled_at <= now()`, genuinely 10 seconds after send, which my own round-trip latency had
  already exceeded) — not a folder-filter bug. Confirmed `DELETE /:id` is what "Undo" actually is
  (no separate cancel endpoint, matching the code's own comment), and confirmed live that deleting a
  message still in `scheduled` genuinely prevents the real send — the delivery job's own query
  requires the row to still exist with `folder='scheduled'`, so a deleted row is structurally
  unreachable to it, not just "hopefully" cancelled by a soft flag.
- **Trace (real delivery, read receipts, threading, search, labels — all clean):** sent a second
  message with `requestReadReceipt: true`, waited for the real 15-second sweep, and confirmed via
  Postgres it transitioned to `folder: 'sent'` with a real `message_id`/`outbox_id` — genuine
  delivery through the same `MailService.sendNow` infrastructure already confirmed working in
  HUD-0075's booking-confirmation emails. Hit the actual receipt-pixel endpoint unauthenticated (as
  a real recipient's mail client would) and confirmed it returns a real `image/gif` and stamps
  `read_receipt_confirmed_at` with a real timestamp. Replied to the sent message via `inReplyTo` and
  confirmed `GET /thread/:threadId` correctly returned both messages together, spanning the `sent`
  and `scheduled` folders — the documented "across all folders" behavior, verified rather than
  assumed. Ran a full-text search for a deliberately stemmed term ("deliveri") against a body
  containing "Delivery" and got real Postgres `tsvector`/English-stemming matches, not a substring
  scan. Created a real custom label, assigned it via `PATCH .../:id`, and confirmed via a fresh
  `GET` that it actually persisted (the `PATCH` response itself is a bare `{success:true}`, not the
  updated row — verified the real effect rather than trusting the ack). Bulk-archived a message via
  `POST /bulk` and confirmed the folder move.
- **Came back clean across every feature exercised — no code changes needed.** `tsc --noEmit`
  clean, full suite green (11 files / 105 tests), `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** both real test messages and the test label were deleted via their
  real `DELETE` endpoints — email messages have a genuine, unrestricted hard-delete (no
  void/immutability convention for this record type, unlike the financial documents traced
  elsewhere this arc). Usage counter restored to 500/500 and confirmed.
- **Not re-rated in this pass:** this trace covers a representative slice, not all 11 claimed gaps
  (IMAP test-connection and quick-reply templates specifically weren't exercised) — real enough to
  retire the "take the other session's word for it" uncertainty, not exhaustive enough alone to
  justify a specific new percentage in `hudumika-overview.html` without checking those remaining
  claims too. Recorded here as strong positive evidence for whenever that file is next re-synced.

### HUD-0079 — Phase 5: Notes journey traced live · CLEAN across a genuinely sophisticated per-note ACL, optimistic-locking, and legal-hold feature set
- **Category:** Functional correctness (Phase 5, thirty-eighth journey).
- **Trace (visibility & sharing — the real per-note ACL, all verified live):** created a `private`
  note as one user and confirmed a second, unrelated user (i) never sees it in their own list at
  all and (ii) is refused (`403`) attempting to `PATCH` it directly by id, having guessed or been
  handed the URL. Created a `shared` note naming that same second user with `view`-only permission
  and confirmed live: they can see it (`canEdit: false` in the response, matching reality) but a
  content edit is correctly refused (`403`); upgraded their permission to `edit` and confirmed the
  same content edit now succeeds, correctly attributing `updatedBy` to them and `isOwner: false`.
  Confirmed, in both the view-only and edit states, that the *same* non-creator collaborator is
  still refused changing `visibility`/`shares` itself — a real, deliberately separate permission
  ("Only this note's creator can change who it's shared with"), matching Google Keep's own
  ownership-vs-editing distinction the code comment names, verified rather than assumed from it.
- **Optimistic locking — the one place this app's own design says silent clobbering actually
  matters:** after the collaborator's edit changed the note's `updated_at`, had the *original*
  creator attempt an update carrying the note's *stale*, pre-edit `expectedUpdatedAt`. Correctly
  refused with a `409`/`NOTE_CONFLICT` carrying the note's genuine current state (the collaborator's
  edit, correctly reflected) — real, usable conflict data a client could build a merge UI from, not
  a bare error.
- **Revision history — verified both directions actually preserve everything:** confirmed the
  collaborator's edit created a real revision snapshotting the *original* content, correctly
  attributed to the *original* author (not "now", not the editor) — exactly the subtlety the code's
  own comment calls out. Restored that old revision and confirmed **a second new revision was
  created snapshotting the collaborator's edit before it was overwritten** — read the full revision
  list afterward and found both the original and the collaborator's version intact, nothing lost
  across two real content changes and one restore.
- **Legal hold:** set it on a note, trashed the note, and confirmed permanent delete is refused
  (`403`, "on legal hold and cannot be permanently deleted") — then confirmed it *also* survives a
  bulk `POST /empty-trash` sweep (the note was still fetchable afterward), not just the single-note
  delete path. Removing the hold and deleting again succeeded cleanly.
- **Also confirmed live:** a `CUSTOMER` JWT is correctly refused the entire app (`403`).
- **Came back clean — no code changes needed.** `tsc --noEmit` clean, full suite green (11 files /
  105 tests), `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** both test notes were permanently deleted via the real `DELETE /:id`
  once legal hold was cleared — notes have a genuine, unrestricted hard-delete once not on hold (no
  void/immutability convention for this record type). Usage counter restored to 500/500 and
  confirmed.

### HUD-0080 — Phase 5: Sign forensic case-management journey traced live (a previously-flagged untested gap from HUD-0045) · real LOW bug found+fixed (duplicate 'opened' custody-log rows) in an otherwise genuinely rigorous chain-of-custody system
- **Category:** Functional correctness (Phase 5, thirty-ninth journey) — specifically closing a gap
  HUD-0045 flagged as "not exercised" (the forensic-case investigation tooling).
- **Setup, all real:** built a real PDF via `pdf-lib`, created and sent a real Sign envelope, signed
  it through the actual public token endpoint, and confirmed real completion — `stamp_applied:
  true`, a real `anchor_hash`. Downloaded the actual stamped PDF and submitted it to
  `POST /verify/compare` (a genuinely public, unauthenticated endpoint) against its own verification
  code: got back a live-computed `EXACT_MATCH` with matching SHA-256 hashes and a verified seal
  signature — not a canned response.
- **Manual case-opening from a clean verdict (a real documented use case — "a compliance officer
  wants a permanent record"):** opened a case from that clean job as a `TENANT_ADMIN`. Confirmed the
  evidence manifest holds real, independently-hashed canonical/uploaded/manifest files (canonical
  and uploaded hashes matching each other, correctly reflecting the exact-match verdict).
- **Chain of custody — the entire reason this module exists — verified property by property:**
  confirmed a `GET` on the case is itself logged as a `'viewed'` custody event; because the route
  fetches the audit log *before* recording its own view, that view doesn't appear in its own
  response — confirmed this isn't a bug by re-fetching immediately after, where it correctly
  appeared. Confirmed an evidence download is logged as `'exported'` with the correct filename and
  evidence id.
- **Evidence (real LOW bug found):** the same case-open call above produced **two** `'opened'`
  custody rows at the identical millisecond when a `note` was supplied — one from
  `openForensicCase()`'s own internal logging (real `evidence_count`/`verdict`/`verification_code`
  detail) and a second, redundant one the route handler fired immediately after purely to attach the
  note. For a chain-of-custody log whose entire regulatory purpose (the file's own §45/§50 citations)
  is to be an accurate, non-redundant record of what actually happened, splitting one real action
  into two identically-timestamped rows is a genuine (if minor) correctness defect — not a security
  or data-loss issue, but exactly the kind of thing that reads as confusing or suspicious to anyone
  auditing the log later.
- **Fix:** added an optional `note` parameter to `openForensicCase()` itself, folded into the same
  internal `'opened'` custody event's own `detail` object; the route handler now passes it straight
  through instead of firing a second event afterward.
- **Re-test, live:** opened a fresh case with a note using the fixed code and confirmed exactly one
  `'opened'` row, with the note correctly merged into the same detail object alongside
  `evidence_count`/`content_verdict`/`verification_code`.
- **Auto-open, re-analysis versioning, and reporting — all confirmed clean and real:** submitted a
  deliberately tampered document (a re-created PDF missing the original's real signature/certificate
  page) and got back a live-computed `DOCUMENT_MISMATCH` — real structural findings ("canonical has
  2 pages, uploaded has 1"), a real hash mismatch, genuine PDF metadata comparison. Confirmed this
  non-clean verdict was **auto-opened as a case by the system itself**
  (`opened_by_name: 'System — Digital Execution Seal verification'`) with zero manual action, exactly
  matching `sign-forensic-verify.job.ts`'s documented design. Re-ran `POST .../reanalyze` against the
  case's own already-stored evidence (no new upload) and got the identical verdict back as a new,
  separately-numbered run (2, alongside auto-open's own run 1) — the original run was never
  overwritten. Generated the formal PDF report via `POST .../report` and confirmed it was stored as
  its own durable evidence row, correctly appended to the manifest without disturbing the original
  entries. Transitioned the case `open → reviewing → resolved`, correctly stamping `resolved_by`/
  `resolved_at`/`resolution_note` only on the terminal transition.
- **Also confirmed live:** a `JUNIOR` JWT is correctly refused the entire forensics module (`403`,
  `DOCUMENT_ADMIN_ROLES` only — `SUPER_ADMIN`/`ADMIN`/`TENANT_ADMIN`).
- **Came back otherwise clean.** `tsc --noEmit` clean, full suite green (11 files / 105 tests),
  `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** every record this journey touched is permanently un-deletable by
  design, confirmed rather than assumed — a **completed** Sign envelope explicitly cannot be voided
  (`"Completed envelopes cannot be voided"`, live-confirmed as the same rule that blocks a fresh
  attempt), and forensic evidence/custody rows have no delete endpoint anywhere in the API at all
  (the service's own header comment: "Nothing here ever updates an evidence row once inserted" /
  "append-only, same reasoning" — a deliberate forensic/legal-record design, not an oversight). Left
  in place, every title/filename/note clearly labeled `HUD-0080`. Usage counter restored to 500/500
  and confirmed (needed re-lowering once mid-journey after a real prior-journey usage tally caught
  up with the monthly cap).

### HUD-0049 — Phase 5: Support ticket lifecycle traced live · mostly CLEAN; one LOW completeness gap noted, not fixed
- **Category:** Functional correctness (Phase 5, seventh journey) + a LOW finding (master
  severity model's "cosmetic/tech debt" bucket).
- **Trace:** `POST /v1/support/tickets` (staff, on behalf of a customer) → `POST .../messages`
  (staff first reply) → a second ticket, replied to via `POST .../customer-reply` as the *real*
  linked `CUSTOMER` JWT → the same endpoint attempted by a *different* `CUSTOMER` JWT (isolation
  check) → `PATCH .../status` to `RESOLVED` on the first ticket.
- **Result: the SLA math and event plumbing are real and correct.** `first_reply_time_seconds`
  (17s) and `resolution_time_seconds` (197s) both matched hand-computed diffs between the
  relevant timestamps exactly; the ticket auto-transitioned `OPEN`→`IN_PROGRESS` on the first
  reply, matching the handler's own stated intent; `support.ticket_created`/`ticket_resolved`
  domain events carried accurate payloads (`resolutionSeconds: 197`, matching); a `CUSTOMER` JWT
  not linked to the ticket's owner was correctly refused with a `404` (not confirming the
  ticket's existence), the same "don't leak via error specificity" pattern used elsewhere in
  this codebase.
- **LOW finding, not fixed:** `GET /v1/support/tickets` (list) and `GET /v1/support/tickets/:id`
  (detail) both hand-pick their `SELECT` columns, and neither list includes
  `first_reply_at`/`first_reply_time_seconds`/`resolved_at`/`resolution_time_seconds` — confirmed
  live (`GET /tickets/:id` right after a reply showed `first_reply_at: undefined` despite the row
  holding a correct value, checked directly against Postgres). Two things keep this from being a
  live regression: the `PATCH /:id/status` mutation's own response *does* return these fields
  (`.returningAll()`, not a curated list, so a client watching its own write's response sees them
  fine), and the separate aggregate dashboard (`GET /v1/support/metrics` → `support-metrics.
  service.ts`'s `computeBlissKpis`) reads `support_tickets` with `.selectAll()` and correctly
  powers the tenant-wide average-first-reply/resolution-time KPIs and histogram — grepped the
  entire `apps/web/src` tree for `first_reply_time_seconds`/`resolution_time_seconds` (camelCase
  and snake_case) and found **zero references anywhere**, confirming no current UI reads these
  at the per-ticket level either. Net effect: correctly computed data that only two of its four
  consumers (the write response, the aggregate dashboard) can currently see — a latent gap for
  whoever eventually builds a per-ticket SLA badge, not a broken feature today. Left as a
  documented note rather than added to the two `SELECT` lists unilaterally, since that's new API
  surface for a consumer that doesn't exist yet, not a fix for something currently broken.
- **Test-artifact handling:** `support_tickets` has no delete endpoint at all (matching most
  other business-record types traced this arc) — both test tickets left in place, clearly
  labeled. Usage counter restored to 500/500. No code changes this pass.

### HUD-0048 — Phase 5: CRM lead → deal conversion → pipeline → won journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, sixth journey). CRM's configurable pipeline
  stages and lead-to-deal conversion were built and reviewed in an earlier session (per prior
  memory) but never re-verified against *this* session's current codebase with fresh live
  evidence — worth confirming rather than assuming still-correct.
- **Trace:** `POST /v1/leads` → `POST /:id/convert` → `PATCH /v1/deals/:id/stage` three times
  (Qualification → Proposal → Negotiation → Won, using the tenant's own real configured pipeline
  stages fetched from `GET /v1/crm/pipeline-stages`, not hardcoded strings) → full cleanup via
  `DELETE /v1/deals/:id` and `DELETE /v1/leads/:id`.
- **Result: every claim the code's own comments make about this flow is true, not aspirational.**
  Converting a lead correctly created a real `deals` row carrying over `value`/`source` from the
  lead, linked via `lead_id` — and, matching the handler's own comment ("doesn't touch the
  lead's own stage"), the source lead's `stage` was confirmed unchanged (`NEW`) after conversion,
  verified directly against the row, not just trusted from the response. `crm_activities`
  recorded a complete, correctly-attributed timeline across *both* entities (lead "created" →
  deal "created from a converted lead" → lead "note: Converted to a deal" → three deal
  "stage_change" entries), and `domain_events` fired `lead.created` and `deal.created` with
  accurate payloads. `closed_at` was correctly `null`/unset through Proposal and Negotiation and
  stamped only on reaching the `WON` terminal stage (`is_won: true` on that tenant's own stage
  config) — proving the "won/lost" logic keys off the stage's real configured flag, not a
  hardcoded string comparison.
- **No bug found.**
- **Test-artifact handling:** unlike the four financial/regulatory-record journeys traced
  earlier (HUD-0043/0044/0045/0046 — none deletable once posted), leads and deals **do** have
  real `DELETE` endpoints and both succeeded cleanly (`204`) — full removal, not a soft-delete or
  refusal. Usage counter restored to 500/500. No code changes this pass.

### HUD-0047 — Phase 5: Drive upload → download → public share → access-log journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, fifth journey). `files.routes.ts` was confirmed
  during the RBAC sweep (HUD-0038) as the best-scoped file read this whole audit; this pass
  checks the other half — does the actual storage/retrieval/sharing mechanics work correctly,
  not just the authorization around them.
- **Trace:** `GET /v1/drives` (confirmed the tenant's real "My Drive," auto-created 2026-07-19,
  not by this trace) → `POST /v1/files/upload` (a real multipart file) → `GET /:id/download`
  (byte-for-byte `diff`'d against the original — identical) → `PUT /:id/share` (a public Viewer
  link) → `GET /v1/files-public/:token/download` with **zero authentication** (byte-for-byte
  identical again) → `GET /:id/access-log`.
- **Result: storage round-trips correctly, and the access log is real and accurate.** The
  uploaded file's bytes survived the full `MinioIntegration.uploadCloudFile` → disk-backend
  `put()` → `get()` round trip unmodified for both the authenticated in-app download and the
  fully anonymous public-link download. The access log correctly recorded both as **distinct,
  accurately-attributed events** — the in-app one with the real `user_id`/`actor_name`/
  `action: 'download'`/`via: 'app'`, the anonymous one with `user_id: null`/
  `actor_name: 'Public link'`/`action: 'link_download'`/`via: 'public_link'` — real IP and
  user-agent captured on both, not a single generic "accessed" row that would have blurred who
  did what.
- **No bug found.**
- **Test-artifact handling — a different shape than the previous four traces.** Drive files are
  user content, not audit-critical financial/regulatory records, so the platform's own delete
  story is correspondingly less locked-down: `POST /:id/trash` succeeded normally, but the
  permanent-delete route (`DELETE /:id`) is gated to `isPlatformSuperAdmin` specifically — a
  platform-level check, stricter than any tenant-level role — so it correctly refused a
  tenant-scoped `JUNIOR`/would-be-`SUPER_ADMIN` JWT with "Only the platform SuperAdmin can
  permanently delete a file." Left the file trashed (hidden from normal browsing, the correct
  functional end-state) rather than fabricating a platform-superadmin credential to force full
  deletion. Usage counter restored to 500/500. No code changes this pass.

### HUD-0046 — Phase 5: SEAL bonded-warehouse → customs declaration → duty computation journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, fourth journey). SEAL had the largest single RBAC
  finding of the whole audit (HUD-0031/0037: 9 sibling files with an identical zero-role-check
  gap) but, like Sign, no prior functional verification that the customs/duty math and lifecycle
  state machine are actually correct — real money and real regulatory compliance ride on this.
- **Trace:** `POST /v1/seal/lots` (a real 200-carton lot, HS 8517.12, CIF-relevant fields, entry
  status `FOREIGN_DUTY_SUSPENDED`) → `POST /v1/seal/duty-quote` (pre-check) → `POST /v1/seal/
  customs-entries` (a real declaration against the lot) → the built-in `GET .../recompute`
  self-check → `submit` (GREEN selectivity channel) → `advance` to `ASSESSED` → `advance` to
  `PAID` → `release` → re-fetched the lot → `GET /v1/seal/lots/:id/verify-chain`.
- **Result: the duty math is real and internally consistent, not fabricated.** Independently
  recomputed by hand from the API's own response: CIF = (25,000 + 1,200 + 150) × 2,650 FX =
  69,827,500 TZS; Import Duty 10% = 6,982,750; RDL 2% = 1,396,550; CPF 1% = 698,275; VAT 18% on
  (CIF + Import Duty only, i.e. 76,810,250) = 13,825,845; totals summed and cross-checked exactly
  against `totalDuty`/`totalTax`/`totalPayableLocal` in the response — every figure matched to
  the shilling. The platform's own `/recompute` self-check (stored computation vs. a fresh
  recomputation, compared via a canonical key-sorted form) independently agreed: `matches: true`.
- **Result: the state machine and cross-entity sync are real.** Every transition
  (DRAFT→SUBMITTED→ASSESSED→PAID→RELEASED) was accepted in the correct order and each response's
  own `legalNextStatuses` narrowed correctly at each step (ending empty at RELEASED — a terminal
  state); releasing the declaration correctly flipped the *lot's own* `customsStatus` from
  `FOREIGN_DUTY_SUSPENDED` to `FOREIGN_DUTY_PAID` as a side effect, confirmed by re-fetching the
  lot directly rather than trusting the declaration response alone. `GET .../verify-chain`
  (SEAL's own tamper-evident hash chain over `seal_movements`, the same audit-integrity concept
  as Sign's `anchor_hash`) returned `valid: true` over both recorded movements.
- **No bug found.**
- **Test-artifact handling:** neither `seal_lots` nor `seal_customs_entries` have a delete
  endpoint at all — the fourth confirmation this session of the same platform-wide design
  (invoices, payroll runs, sign envelopes, now customs lots/declarations: financial/regulatory
  records are never hard-deletable via the API once created, only advanced/reversed through
  their own real state machine). Left in place, clearly labeled ("Phase5 SEAL trace"). Usage
  counter restored to 500/500. No code changes this pass.

### HUD-0045 — Phase 5: Sign e-signature envelope lifecycle traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, third journey). Chosen because Sign had a lot of
  *authorization* attention this audit (HUD-0027/0033: `sign.routes.ts`, `sign-stamps`,
  `sign-versions`, `sign-ai-assist`) but zero *functional* verification that a real document
  actually signs, stamps, and verifies correctly end to end — a legally load-bearing feature
  where a silent correctness bug would be serious.
- **Trace:** generated a real, valid PDF with `pdf-lib` (the same library the platform's own
  forensic-report/structural-integrity services use, so a well-formed test input); `POST
  /v1/sign/envelopes` (one recipient, inline `document_data`) → `POST .../send` → fetched the
  recipient's real signing `token` directly from `sign_recipients` → `POST /v1/sign/public/
  :token/sign` (the actual, unauthenticated signer-facing endpoint, exactly as a real signer's
  emailed link would hit it) with a real base64 PNG signature → `GET /v1/sign/public/verify/
  :code` (the public integrity-check endpoint).
- **Result: every stage is real, not decorative.** Envelope status progressed draft → sent →
  completed correctly; `stamp_applied` flipped `true` with a real computed `anchor_hash`;
  `sign_events` recorded a complete, chronologically consistent audit trail (created → sent →
  signed → completed → stamped → verified → stamped) with accurate actor names/emails at each
  step, not a single "updated" catch-all row; the public verify endpoint returned `valid: true`
  with the correct signer name/email/timestamp; the response's QR code and verification-code
  generation both produced real, well-formed output (not placeholders).
- **No bug found.** Not exercised this pass, noted rather than assumed clean: the forensic-case
  investigation tooling (`POST /v1/sign/forensics/cases`) opens a case from a pre-existing
  `sign_forensic_jobs` row (an automated content-comparison flag), not directly from an envelope
  — a specialized fraud-investigation path distinct from the normal signing journey just traced,
  and out of this pass's scope.
- **Test-artifact handling:** attempted `DELETE /envelopes/:id` on the completed envelope —
  correctly refused ("Completed envelopes cannot be voided"), the same immutable-once-final
  design already confirmed for invoices (HUD-0043) and payroll runs (HUD-0044). Left in place,
  clearly labeled ("Phase5 Sign Trace Test", signer `signer-phase5-trace@example.invalid`).
  Usage counter restored to 500/500. No code changes this pass.

### HUD-0044 — Phase 5: NexusHR payroll→GL journey traced live · CLEAN (no finding); retires a stale memory concern
- **Category:** Functional correctness (Phase 5, second journey). This session's own memory
  carried a note from 2026-08-24 ("FinOps audit fixes") flagging "payroll→GL still not wired" as
  a known gap — stale by definition (memory is a snapshot, not current truth), so rather than
  repeat it uncritically this pass re-verified it live, end to end, against the real dev tenant.
- **Trace:** set a real `basic_salary` (1,500,000 TZS) and `tax_residency` on one test employee
  via `PATCH /v1/hr/staff/:id` (confirmed this endpoint's own split — pay fields are `ADMIN`-tier,
  identity fields are `MANAGER`-reachable — matches its own header comment); created a real
  October 2026 payroll run; `POST /runs/:id/calculate` correctly picked up the one salaried
  employee and named-and-skipped the other 8 active staff with "No basic salary recorded" (not a
  silent zero); approved the run; `POST /runs/:id/mark-paid`.
- **Result: GL posting is real, correct, and balanced.** `journal_entries`/`journal_lines`
  inspected directly: one entry (`source_module: 'PAYROLL'`) with five lines — Dr Salaries &
  Wages 1,500,000, Dr Employer Payroll Contributions 202,500, Cr PAYE Payable 233,000, Cr
  Statutory Contributions Payable 397,500, Cr Bank Account 1,072,000 — debits and credits equal
  (1,702,500 each). The payslip's own stored calculation lines cross-checked correctly against
  Tanzania's real statutory formulas: NSSF (10% of basic, deducted *before* income tax per its
  own `basis` string) brings taxable pay to 1,350,000; PAYE at "128,000 + 30% of the amount over
  1,000,000" on that base = 128,000 + 0.3 × 350,000 = 233,000 — matching the posted figure
  exactly, not a plausible-looking but disconnected number.
- **No bug found.** The specific concern the stale memory note raised is confirmed fixed as of
  this session's current codebase — recorded here so the register (not a memory snapshot) is the
  source of truth going forward.
- **Test-artifact handling:** the employee's test `basic_salary`/`tax_residency` were reverted to
  `null` via the same real API afterward. The payroll run itself has no delete/cancel endpoint at
  all (the same "financial records aren't deletable, only reversible" design already confirmed
  for invoices in HUD-0043) — left in place as a real, correctly-posted, clearly-dated (October
  2026, a period no real tenant activity uses) test run rather than hand-deleted around the
  system's own design. Usage counter restored to 500/500. No code changes this pass — nothing to
  re-run `tsc`/`vitest`/`check:triggers` against; API health re-confirmed after.

### HUD-0043 — Phase 5: core ClearOS→FinOps→GL journey traced live; invoice line-item schema didn't match reality · FIXED (VERIFIED)
- **Category:** Functional correctness (Phase 5 — the master prompt's "every action → DB" mandate,
  started fresh after Phase 6's closure). Scope for this first pass: one complete, representative
  "golden path" — create a shipment, advance it through its workflow, record a cost against it,
  raise an invoice from that shipment, finalize it, record a payment — executed for real against
  the live dev tenant via signed JWTs (`JUNIOR` for ClearOS actions, `FINANCE` for FinOps), with
  the actual Postgres rows inspected after every step rather than trusting the HTTP response
  alone. This is a starting slice of Phase 5, not the whole phase — see the note at the end.
- **What traced clean, with live evidence:**
  - `POST /v1/shipments` correctly auto-assigned the tenant's matching default workflow
    ("Sea Import — Standard") and its first step, computed an `sla_deadline`, and derived
    `consignment_type: 'import'` — and emitted a real `shipment.case_opened` domain event with
    an accurate payload (`domain_events` row inspected directly).
  - The workflow engine's stage-advance logic is real, not decorative: attempting to jump two
    steps ahead ("Booking Received" → "Customs Assessment", skipping "Documents Verified") was
    correctly rejected ("not reachable from"), and attempting the adjacent step was correctly
    **blocked** on real, checked prerequisites ("Commercial invoice verified", "Packing list
    verified" — both `false` because no such documents exist for this test shipment). Both
    rejected attempts were durably logged to `workflow_step_runs` with per-condition pass/fail
    detail, not silently dropped.
  - `POST /:id/ledger` correctly persisted a cost entry and emitted a `shipment.cost_recorded`
    domain event with the right shipment id/amount; a charge_head outside the real
    `CHARGE_HEADS` whitelist was correctly, silently coerced to `null` rather than accepted or
    erroring (existing documented behavior, not a bug).
  - Once the invoice schema bug below was fixed: `POST /v1/invoices` → `PATCH .../:id` (Draft →
    Unpaid) → `POST .../:id/payment` produced two correctly-balanced double-entry `journal_lines`
    rows each (Dr Accounts Receivable 1,200,000 / Cr Freight Revenue 1,200,000 on finalization;
    Dr Cash 1,200,000 / Cr Accounts Receivable 1,200,000 on payment), the invoice's `status`
    correctly progressed Draft → Unpaid → Paid with the right `received` amount, and a real
    `invoice.payment_recorded` domain event fired with the right payload.
- **Evidence (real bug, fixed):** `POST`/`PATCH /v1/invoices` crashed with a bare
  `{"error":"An unexpected error occurred."}` 500 the moment a line item was submitted in the
  shape `invoiceLineSchema` itself declares (`description`/`quantity`/`unit_price`/
  `account_id`). Root cause: `buildInvoiceLines()` — the function that actually turns validated
  items into `sales_invoice_lines` rows — has only ever read `name`/`unit`/`rate`/`qty`/
  `tax_pct`/`line_group`/`currency`/`sort_order` (confirmed against `Billing.tsx`'s real save
  payload, which sends exactly that shape and has, by everything in the file's own history
  comments, always sent it — the two shapes have never matched). A caller following the
  documented validation schema either crashed outright (`name` is a `NOT NULL` column in
  `sales_invoice_lines`, confirmed via `information_schema`) or, had `name` been nullable,
  would have silently gotten every line's amount zeroed (`it.rate || 0`, `it.qty || 1`) with no
  error at all. The real, working frontend path was never at risk — it has simply never used
  the field names this schema described.
- **Fix:** rewrote `invoiceLineSchema` to the fields the rest of the file actually reads,
  dropped `account_id` (grepped: read nowhere in the file, ever), and made `name` **required**
  (`.min(1)`, not `.optional()`) so any future caller that still gets this wrong fails with a
  clean, specific `400 Validation failed / items.0.name: Required` instead of a raw Postgres
  constraint crash or a silently-zeroed invoice.
- **Re-test, live:** re-ran the exact real-shape payload (`name`/`qty`/`rate`) — `201`, line
  persisted with the correct `rate: 1200000.00`; re-ran the originally-crashing schema-documented
  shape with `name` omitted — clean `400` naming the missing field, no crash. Full suite green
  (11 files / 105 tests), `tsc --noEmit` clean, `check:triggers` OK, API healthy throughout.
- **Test-artifact cleanup:** the trace shipment was deleted via the real `DELETE /:id` route
  (soft-delete — `deleted_at` set, confirmed — matching `338_customer_soft_delete.sql`'s design,
  not a bug); the trace invoice, once posted to the ledger, could not be hard-deleted by design
  (`DELETE` correctly refused with "has been posted to the ledger... void it instead") — voided
  via the real `/void` endpoint instead, which correctly reversed both journal entries
  (`journals_reversed: 2`, confirmed against `journal_entries`). One harmless orphaned test
  `expenses` row (450,000 TZS, tied to the now-soft-deleted shipment) was left in place rather
  than hand-deleted, since removing it directly would mean bypassing the same referential/audit
  design just verified as correct. Usage counter restored to 500/500.
- **Scope note — this is a first slice, not Phase 5 complete.** One golden path (ClearOS shipment
  → workflow engine → FinOps invoice → GL → payment) was traced end-to-end with live DB
  verification at every step; every other app's core journeys (HR payroll run → payslip → GL;
  Sign envelope → signature → forensic seal; SEAL bonded-warehouse lot → declaration →
  duty-paid; Drive upload → share → access-log; etc.) remain untraced. This entry documents what
  was actually exercised, not a claim that Phase 5 is closed.

### HUD-0042 — Phase 6: SQL/command injection sweep · CLEAN (no finding); Phase 6 CLOSED
- **Category:** Security (Phase 6 completion — the last unchecked item). Checked every escape
  hatch from Kysely's parameterized-by-construction query builder, and the API's only
  process-execution call site.
- **SQL injection — clean.** Two non-Kysely raw-driver call sites exist in the whole codebase,
  neither touching request input: `db/migrate.ts` executes static `.sql` files read from disk (a
  build/ops tool, not a request path) and `tests/tenant-rls-coverage.test.ts` interpolates a
  table name into a raw query from a hardcoded in-test array, not any external input. The only
  two places dynamic SQL identifiers get built from live data are both already properly
  defended: `services/queryBuilder.service.ts`'s Visual/Raw Query tool (`SUPER_ADMIN`-only,
  OTP-verified, time-boxed — see the RBAC sweep's own note on this being the most carefully
  hardened file read this audit) builds every dynamic table/column reference through Kysely's
  `sql.ref()`/`sql.table()` — its own safe, quoting identifier helpers, not raw string
  interpolation — and only after checking the identifier against a hardcoded `ALLOWED_TABLES`/
  column allowlist; its `sql.raw()` raw-SQL path is a deliberate `SUPER_ADMIN` capability (the
  feature *is* "run arbitrary SQL"), not an injection bug — the control here is who can reach
  it, already covered by HUD-0024's RBAC sweep.
- **Command injection — clean.** Exactly one real `child_process` usage in `apps/api/src`:
  `integrations/office-convert.ts`'s LibreOffice-based Office→PDF preview conversion, using
  `execFile` (never `exec`/`spawn` with `shell: true`) with every argument passed as a
  pre-built array element — no shell ever parses the arguments, so no metacharacter in a
  filename or file extension can break out of its own argv slot. The one user-influenced value
  (`ext`) is further sanitized (`.replace(/[^a-z0-9]/g, '')`) before use, and the actual file
  path is always a server-generated `fs.mkdtemp()` temp directory, never a client-supplied path.
- **Phase 6 (full security sweep) is now CLOSED.** CORS/helmet/rate-limit/secrets (checked
  earlier), SSRF (HUD-0040, 4 real gaps fixed), log-secret scan (HUD-0040, clean), path
  traversal / file access (HUD-0041, 1 real gap fixed, Drive/file-storage layer independently
  confirmed already correct), and SQL/command injection (this entry, clean) — every item the
  master prompt's Phase 6 named has now been checked with live evidence, not assumed. This is
  not the same claim as "no security bugs exist anywhere" — see HUD-0024's own closure note for
  the equivalent caveat on the RBAC sweep; the same reasoning applies here: this closes the
  specific, named checklist, not the universe of possible security defects.

### HUD-0041 — Phase 6: arbitrary-file-read via TRA cert registration · FIXED (VERIFIED)
- **Category:** Security (Phase 6 continuation — path traversal / file access). Scanned every
  `fs.readFileSync`/`fs.existsSync`/`path.join`/`path.resolve` call site in `apps/api/src` for a
  path built from user input reaching the filesystem with no containment check, having already
  confirmed the main Drive/file-storage layer (`object-storage.ts`, `integrations/minio.ts`) is
  correctly double-defended (filename sanitization at write time via a `clean()` helper that
  strips every non-alphanumeric character including `/`, plus a resolve-then-verify-containment
  check in `DiskBackend.abs()` — both read by this pass, neither needed a fix).
- **Evidence:** `POST /v1/tra/register` (`tra.routes.ts`) took a client-supplied `pfx_path`
  string with zero validation and passed it straight to `fs.existsSync()` and, on success, into
  `TRAService.register → loadPrivateKeyFromPfx → fs.readFileSync()`. Any `SUPER_ADMIN`/`ADMIN`/
  `TENANT_ADMIN`-tier caller could point it at an arbitrary absolute path on the server's
  filesystem — an existence-probe at minimum (a different error for "not found" vs. any other
  failure), and a successful read of anything the process can read that happens to parse as a
  PKCS12 bundle, further gated only by needing the right `pfx_password` to actually extract a
  key from it. `POST /v1/tra/upload-cert` (the legitimate way to get a cert onto the server)
  always writes to one fixed, tenant-scoped path (`uploads/tra/<tenantId>/cert.pfx` or
  `.p12`), so `/register` never had a real reason to trust a client-supplied path in the first
  place.
- **Fix:** `/register` no longer reads `pfx_path` from the request at all for path resolution —
  it looks up the tenant's own uploaded cert directly at the one fixed location `/upload-cert`
  always writes to, trying `.pfx` then `.p12`. `pfx_path` stays in the request schema
  (frontend/back-compat) but is now inert.
- **Re-test, live:** `POST /register` with `pfx_path: "C:/Windows/win.ini"` and with
  `pfx_path: "../../../../etc/passwd"` — both now return the same clean "No certificate on file
  for this tenant" `400`, proving the value is never consulted, not merely rejected after being
  checked. Full suite green (11 files / 105 tests), `tsc --noEmit` clean, `check:triggers` OK,
  API healthy throughout.
- **Also checked, ruled out as safe:** `tra.routes.ts`'s own `POST /upload-cert` (the destination
  filename is always the literal string `cert.pfx`/`cert.p12` — the client's actual uploaded
  filename is read only through `path.extname()` for a strict `.pfx`/`.p12` equality check, and
  is never itself written into a path); the disk-backend's public signed-URL passthrough
  (`GET /v1/files/blob?key=...`) — `key` is client-supplied but gated by an HMAC over `key+exp`
  that only the server can produce, and `objectStore.get()` re-validates containment
  independently even if a signature were somehow forged.

### HUD-0040 — Phase 6: real SSRF via 4 tenant-configured integration URLs · FIXED (VERIFIED); webhook-receiver signature gaps · OPEN (documented, not fixed)
- **Category:** Security (Phase 6 remainder — the first item picked up after HUD-0024's closure).
  Scanned every server-side `fetch()` call in `apps/api/src` for a target URL that is tenant/
  user-configured rather than a hardcoded third-party API host, then checked each candidate for
  existing validation before treating it as a finding.
- **Evidence (real SSRF, fixed):**
  - **`onsite-uptime.service.ts`'s `probe()`** — a tenant's Onsite "website uptime monitor" URL,
    fetched unattended on a schedule (and on-demand via `POST /health-checks/:id/run`) with zero
    validation. The classic uptime-monitor SSRF shape: point a monitor at `169.254.169.254`
    (cloud metadata) or an internal service and read back status code + timing every few
    minutes. Broadest exploitability of the four — any non-`CUSTOMER` staff role with Onsite
    access can create a monitor, not just an admin.
  - **`workflow-comms.service.ts`'s `webhook` comm type** — `tenant_settings.workflow_webhook_url`,
    fetched with no validation whenever a workflow stage transition fires. Requires Settings-write
    access to configure (`ADMIN`-tier), narrower exploitability than the monitor above.
  - **`gpswox.service.ts`'s `login()`/`getDevicesLatest()`** — `int-gpswox.base_url` is tenant-
    configured by design ("GPSWOX is typically self-hosted per deployment," per the file's own
    comment) and fetched with no validation, both on the recurring tracking-sync poll and on
    `POST /v1/tracking/gpswox/test`. Same `ADMIN`-tier exploitability as the workflow webhook.
  - **`domain-events.service.ts`'s marketplace-webhook dispatch** — `marketplace_apps.webhook_url`
    is developer-submitted and gated by `status = 'approved'` (a `SUPER_ADMIN` reviews the app
    first), which meaningfully narrows this one's exploitability — fixed anyway for defense in
    depth, since nothing in the approval step specifically checks for an internal address, and a
    successful hit here would fire on every tenant that installs the app, on every one of their
    domain events.
  - **Not SSRF, checked and ruled out:** `onsite-dns-probe.service.ts` (the "URL" it builds is
    always a hardcoded Cloudflare/Google DNS-over-HTTPS host; the tenant-supplied value is a
    query-parameter domain name, not the fetch target itself); `petti.service.ts`'s and
    `settings.routes.ts`'s Vodacom M-Pesa `host` values (both hardcoded sandbox/production
    endpoints selected by a boolean flag, never tenant-supplied); every OAuth/accounting/
    contacts-sync `fetch()` (targets are the provider's own hardcoded token/API hosts).
- **Fix:** one shared guard, `apps/api/src/lib/ssrf-guard.ts`'s `assertPublicHttpUrl()` —
  parses the URL, requires http/https, rejects `localhost`, rejects a literal private/loopback/
  link-local/multicast IP, and (for a hostname) resolves it via DNS and rejects if *any*
  resolved address is private — wired into all 4 call sites above. Verified the range logic
  directly (11 cases: cloud metadata, loopback, all three RFC1918 blocks, IPv6 loopback, a
  non-http scheme, a malformed URL, and two real hardcoded third-party hosts as true-negative
  controls — all 11 passed) before wiring it in.
- **Documented limitation, not fixed:** the guard checks the URL once, up front. A `fetch` with
  `redirect: 'follow'` (used by the Onsite prober) will still transparently follow a 3xx from an
  initially-public host to a private one, bypassing this check. Closing that needs
  `redirect: 'manual'` plus per-hop validation, which no caller does yet — none of the 4 targets
  redirects in normal operation, so this closes the direct attack (typing a private URL straight
  in) without closing the redirect-chain bypass. Left as a known gap rather than guessed at.
- **Re-test, live:** created a real Onsite monitor pointed at `http://127.0.0.1:5433/` (this
  machine's own Postgres port) and triggered `POST /health-checks/:id/run` — blocked in ~1ms
  with `"URLs pointing at a private or internal address are not allowed"`, no connection attempt
  reached Postgres. A control monitor pointed at `https://www.google.com/` probed normally
  (`200`, real response time) in the same run, proving the guard doesn't just fail closed on
  everything. Both test monitors deleted after. Full suite green (11 files / 105 tests), `tsc
  --noEmit` clean, `check:triggers` OK, API healthy throughout.
- **Related finding, OPEN — inbound webhook *receivers* have no signature verification:**
  `sms.routes.ts`'s `smsWebhookRoutes` (`POST /africas-talking`, `POST /twilio`, the SMS
  delivery-status callbacks) trust the request body outright — no HMAC, no shared secret,
  nothing — unlike this same file's sibling `webhooks.routes.ts`, where the WhatsApp receiver
  correctly verifies Meta's `X-Hub-Signature-256` and the GPSWOX receiver at least supports an
  optional shared-secret token. Anyone who learns (or, for Twilio's cryptographically-random
  SIDs, would have to already have compromised something to learn) a real
  `provider_message_id` could POST a forged delivery-status update for another tenant's message.
  **Not fixed here**, deliberately: `sms_messages.status` is confirmed (grepped) to drive no
  other business logic anywhere in the codebase — it's a dashboard/observability field only, so
  the actual impact is a falsified delivery statistic, not a security or tenancy breach, and
  Twilio's real signature scheme (`X-Twilio-Signature`, HMAC-SHA1 over the exact callback URL —
  URL construction must be byte-exact behind this deployment's nginx reverse proxy) is exactly
  the kind of fix that's easy to get subtly wrong in a way that silently breaks every legitimate
  webhook instead of just blocking forged ones, and this session has no way to test it against a
  real Twilio-signed request. Recommended as a follow-up with access to a real Twilio sandbox
  account to verify against, not attempted blind. Africa's Talking has no standard signing
  scheme at all (same shape as GPSWOX/WhatsApp's "fails open until a secret is configured"
  pattern) — would need a new tenant-configurable shared-secret field plus a settings-UI change,
  which is a feature addition, not a bug fix, and out of this pass's scope.
- **Log-secret scan (also Phase 6): clean, no finding.** Checked `apps/api/src/index.ts`'s
  Fastify logger config — no custom `serializers`/`redact`, meaning Fastify's *default* request
  serializer is in effect, which only logs `req.{method,url,hostname,remoteAddress,remotePort}`
  and `res.statusCode` — never headers (so the `Authorization` JWT is never logged) or the
  request body (so login passwords, signup fields, and settings-PATCH secrets are never logged).
  Confirmed against the real 27MB/15MB dev log files sitting in the repo root (`api_dev.log`,
  `recheck_dev.log` — both correctly `.gitignore`d, not committed): grepped for
  password/secret/token/apiKey-shaped JSON and found nothing. The one residual, industry-
  standard exposure is that OAuth `code`/`state` values appear in-cleartext in a callback's
  logged URL (query string) for `mail-oauth`/`accounting-oauth`/`calendar-sync`/
  `contacts-sync`/`ondi-oauth` — this is how every real-world OAuth integration's callback works
  (Google/Microsoft/GitHub all do this), the code is single-use and short-lived by protocol
  design, and the actual password-reset token flow was checked specifically and does **not**
  have this shape (the frontend reads `?token=` from its own URL but submits it via the API's
  POST body, which the default serializer never logs).

### HUD-0039 — Last untriaged file (`intelligence.routes.ts`), and HUD-0024 sweep closure · FIXED (VERIFIED)
- **Category:** Authorization (HUD-0024 completion). Re-ran the file-diff method one more time —
  every route file in `apps/api/src/routes/` against every file now marked fixed (HUD-0023/
  0025–0038) or explicitly confirmed correct across this session's notes — and it resolved to
  exactly **one** remaining file: `intelligence.routes.ts`.
- **Evidence:** `GET /v1/intel/accuracy` (Trade Wizard / compliance-rules accuracy telemetry for
  the tenant) had no role check — confirmed live, `200` for a `CUSTOMER` JWT. Lower sensitivity
  than most of this sweep's findings (aggregated accuracy percentages, not individual business
  records), but the same standing rule applied for consistency: an internal staff analytics
  surface, not customer-portal data. The file's own `/platform-accuracy` sibling was already
  correctly `SUPER_ADMIN`-gated and untouched.
- **Fix:** the standard `role === 'CUSTOMER'` → 403 file-level hook, covering `GET /accuracy` and
  the two write endpoints (`POST /hs-classifications`, `POST /compliance-outcomes`) — staff
  workflow signals a `CUSTOMER` has no legitimate occasion to submit either.
- **Re-test, live:** `CUSTOMER` → 403, `JUNIOR` → 200, unchanged. Full suite green (11 files / 105
  tests), `tsc --noEmit` clean, `check:triggers` OK, API healthy throughout.
- **HUD-0024 sweep closure.** Every one of the 196 route files in `apps/api/src/routes/` has now
  been read and triaged at least once across HUD-0031/0033/0034/0035/0036/0037/0038/0039 — the
  file-diff method converged to zero remaining candidates. Final tally: **105 files fixed, 91
  files confirmed already correct** (properly role-gated, deliberately public/device-
  authenticated by design, or self/ownership-scoped in-handler). This does **not** mean
  authorization is now proven airtight — it means the specific, repeatable "does this file gate
  by role, not just by plan entitlement" question has been asked of every file once. It does not
  catch: a role check that's present but logically wrong (e.g. an allowlist missing a role it
  should include, the inverse of everything found this sweep), a multi-step business-logic flaw
  spanning several routes, or anything outside the route layer entirely (services called from
  multiple routes, background jobs, the RLS layer itself). Phase 17 (an independent adversarial
  pass) and Phase 5 (functional tracing of core journeys) — both still `UNVERIFIED` — are the
  next lines of defense for those classes of bug, not this sweep.

### HUD-0038 — 2 more files: unrestricted marketplace-app install/uninstall, and a platform-support-ticket leak · FIXED (VERIFIED); 45 files re-triaged clean · CONFIRMED CORRECT
- **Category:** Authorization (HUD-0024 continuation). Continued the file-diff method from HUD-0037
  on the 47-file remainder, prioritizing the CRM family, `query-builder.routes.ts` (arbitrary-
  query risk), the support/onsite-agency/superadmin families, and misc business-data files.
- **Evidence (fixed):**
  - **`store.routes.ts` — `POST /installed` and `DELETE /installed/:appId` had no role check at
    all.** Any authenticated user, `CUSTOMER` included, could install or uninstall a marketplace
    add-on for the whole tenant — a real billing/feature-exposure action, not just a read.
    Confirmed live past the usage gate: `403` for both `CUSTOMER` and `JUNIOR` once quota was
    briefly lowered to reach the check, matching the same MGMT convention `addons.routes.ts`
    already documents for this exact "browse freely, only these roles change what's installed"
    shape.
  - **`platform-support.routes.ts` — `GET /tickets` had no role check.** This is the tenant's own
    support conversation with Hudumika (billing/technical issues raised by tenant staff) — a
    `CUSTOMER` JWT could read every ticket ever filed. Distinct from `support.routes.ts`, which
    is the tenant's own customer-facing helpdesk and already correctly `CUSTOMER`-aware.
- **Confirmed correct on this pass, not touched (45 files):** the CRM family (`crm-activity`,
  `crm-custom-fields`, `crm-labels`, `crm-lead-scoring`, `crm-pipeline-stages`, `crm-search`,
  `crm-smart-views`), `leads`, `deals`, `organizations` — all file-level `requireRole`-gated
  already; `hr-checklists`, `referrals`, `api-keys`, `data-quality`, `workflow-templates`,
  `lens`, `query-builder` (`SUPER_ADMIN`-only, OTP-gated raw SQL with a time-boxed grant —
  the most carefully hardened file read this whole audit); `tenant`, `analytics`, `workflows`,
  `escalations`, `announcements` (per-route or file-level role gates on every endpoint, verified
  route-by-route, not just spot-checked); the onsite-agency family (`onsite-agency`,
  `onsite-agency-client`, `onsite-agency-directory`, `onsite-agency-manage`, `onsite-plan` — all
  `ADMIN`-tier gated); the superadmin family (`superadmin`, `superadmin-issues`,
  `superadmin-kyb`, `superadmin-referrals`, `superadmin-reports`, `superadmin-signing-cert`,
  `superadmin-trade-wizard` — all file-level `SUPER_ADMIN`); `support.routes.ts` (already
  explicitly `CUSTOMER`-branching, the tenant's real customer-facing helpdesk);
  `workspace-cockpit.routes.ts` (already explicitly returns an empty/safe shape for `CUSTOMER`);
  `webhooks.routes.ts` (deliberately public, HMAC-verified third-party integration endpoints —
  same shape as `device-ingest.routes.ts`); `public-support.routes.ts` (deliberately public
  marketing-site contact form); `onboarding.routes.ts`/`ondi-auth.routes.ts`/
  `oidc-discovery.routes.ts`/`ondi-saml.routes.ts` (pre-authentication login/federation
  infrastructure by nature); `store.routes.ts`'s own `GET /apps`/`GET /installed` (browsing is
  fine, only the mutations needed the fix); `auth.routes.ts` (own per-route `SUPER_ADMIN` checks
  already in place).
- **Noted, not fixed — lower-confidence, needs a follow-up look:** `activity.routes.ts`'s
  per-entity `GET /:entityType/:entityId` has real, careful ownership handling for `task` entities
  specifically (the one type that's genuinely private) but no equivalent check for `customer`/
  `lead`/`invoice`/etc — by the file's own comment, "a shipment or invoice is visible tenant-wide
  to relevant staff already," so this may be intentional parity with how those records are scoped
  elsewhere rather than an oversight. Not treated as a confirmed finding without checking what
  `domain_events` actually exposes per entity type, which this pass didn't do.
- **Re-test, live:** both fixes re-verified with real JWTs after temporarily lowering the usage
  counter to get past the metering gate ahead of the role check (restored to 500/500 after);
  `CUSTOMER` and `JUNIOR` both correctly `403` on the store mutation (JUNIOR isn't MGMT either),
  `CUSTOMER` `403` / `JUNIOR` `200` on the platform-support ticket list. Full suite green (11
  files / 105 tests), `tsc --noEmit` clean, `check:triggers` OK, API healthy throughout.
- **Running total after this pass:** diffing the full 196-route-file list against everything
  examined across HUD-0024's five triage passes (HUD-0031/0033–0038) leaves **14 files** never
  looked at by any pass — the smallest remainder yet, but the same standing caveat applies: every
  pass so far has found at least one real gap using a different method than the pass before it.

### HUD-0037 — 11 more files: 4 SEAL siblings missed by HUD-0031, a full-CRUD gap on delivery documents, and an unscoped quotations IDOR · FIXED (VERIFIED)
- **Category:** Authorization (HUD-0024 continuation). Methodology: diffed the full 196-route-file
  list against every file already touched by HUD-0023/0025–0036 to get the true never-examined
  remainder (105 files), subtracted files already read and confirmed correct earlier this session
  without needing a code comment (34 files: `shipments`, `notifications`, `drives`,
  `activity-monitor`, `tasks`, `comply-ocr`, `ocr`, `sign-pdf-tools`, `reference`, `billing`,
  `seal-billing`, `permissions`, `trade-wizard`, `comply`, `calendar`, `booking`, `fx-rates`,
  `developer`, `presence`, `calendar-sync`, `contacts-sync`, `ondi-oauth`, `setup-guide`,
  `landed-cost-share`, `sign-jurisdiction`, `shipment-report-public`, `payroll`, `platform`,
  `packages`, `addons`, `workflow-engine`, `finance`, `tracking-device`), leaving 72 genuinely
  untouched files. Prioritized the SEAL/Sign family (given the proven "shared prefix ≠ shared
  guard" pattern) and highest-apparent-sensitivity files (finance, HR, identity), then a
  guard-presence grep across the rest, then live-tested every remaining candidate.
- **Evidence:**
  - **`seal-crm-link.routes.ts`, `seal-declarations.routes.ts`, `seal-documents.routes.ts`,
    `seal-examinations.routes.ts`** — exactly the gap HUD-0031 fixed on `seal.routes.ts` and 8
    other siblings, present in 4 more files that sweep never reached: zero role check on bonded-
    warehouse lot data, customs declarations, the SEAL document vault, and examination findings.
    (The other 4 never-examined Sign-family siblings — `sign-billing`, `sign-forensics`,
    `sign-matters`, `sign-seal-admin` — were all already correctly gated; confirmed by reading,
    not assumed.)
  - **`delivery-documents.routes.ts` — worse than a read leak.** No role check on *any* route,
    including the mutations: a `CUSTOMER` JWT could create, edit, issue, or delete the tenant's
    Release Orders/Delivery Notes (confirmed live — GET 200, POST reached the usage gate, i.e.
    passed every check ahead of it). A customer fabricating its own delivery documentation is a
    real integrity risk, not just disclosure.
  - **`quotations.routes.ts` — a real IDOR, fixed with ownership-scoping rather than a blanket
    block.** `customer_id` existed as a filter param on `GET /` but was never enforced, and
    `GET /:id` had no ownership check at all — either let a `CUSTOMER` see every quotation in
    the tenant, including competitors' quoted prices. Unlike the rest of this batch, `CUSTOMER`
    viewing *its own* quotes is plausibly legitimate (a `CustomerQuotations.tsx` page was mid-
    flight in a concurrent session's uncommitted changes), so this file got the
    `shipments.routes.ts`-style fix instead: `GET /` forces `customer_id` to the caller's own
    resolved id for a `CUSTOMER`, `GET /:id` 404s (not 403 — avoids confirming another
    customer's quote exists) on an ownership mismatch.
  - **`consignments.routes.ts`, `demurrage.routes.ts`, `freight-booking.routes.ts`** — the same
    "internal ops tool, only entitlement-gated" shape as HUD-0036: consignment listings with no
    ownership scoping despite a `customer_id` filter param existing (same shape as quotations,
    but left as a blanket exclusion rather than ownership-scoped, since no evidence of a
    legitimate customer-facing consignments view exists yet), demurrage tariffs/container
    tracking, and freight rate cards/contracts (real `cost_rate`/`sell_rate` margin data).
  - **`calls.routes.ts`** — Bliss Calls, the other half of the "Bliss" pillar `chat.routes.ts`
    (Team Chat) belongs to; its own header comment already says "an internal tool, not a public
    webinar product," but nothing enforced that. Fixed across all 43 of its REST routes via a
    shared `blockCustomer` preHandler appended to each one's existing inline preHandler array
    (this file uses per-route arrays throughout, not a file-level hook) — the signaling
    WebSocket route was deliberately left untouched, since its cookie/guest-based auth shape
    wasn't verified as part of this pass.
  - **`workflow-studio.routes.ts`** — no entitlement gate *and* no role check: any authenticated
    user of the tenant, any plan tier, could list/create/run internal workflow automations.
    CUSTOMER-excluded; the missing plan-entitlement gate is a separate, lower-priority metering
    gap, not fixed here.
  - **`metrics.routes.ts`** — the HuduBI-adjacent cross-cutting metrics/KPI/alerts API HUD-0033
    already flagged this shape for (dashboards, not `metrics.routes.ts` itself, at the time).
    The file has a genuinely careful internal MGMT-role gradient (restricted metrics filtered,
    alert/KPI writes gated) that was left completely intact — this only added the CUSTOMER floor
    underneath it. Live-tested 403 on this dev tenant, but that's the plan-entitlement gate
    (this tenant isn't `hudubi`-entitled) rather than proof the role gate would have fired for
    one that is — fixed on the code evidence regardless, matching the identical shape found
    everywhere else this pass.
- **Fix:** the standard `role === 'CUSTOMER'` → 403 hook for 9 of the 11 files;
  ownership-scoping (not a blanket block) for `quotations.routes.ts` specifically, since
  `CUSTOMER` self-access is plausibly a real, in-progress feature there.
- **Re-test, live:** all 11 files re-verified — `CUSTOMER` 403 on the 10 blanket-excluded files,
  200-with-empty-scoped-result on `quotations.routes.ts` (no seed data in this dev tenant to
  prove non-empty scoping further, but the code path matches `shipments.routes.ts`'s own
  proven-correct pattern exactly); `JUNIOR` re-verified 200 on 8 of the 11 to confirm no staff
  regression. Full suite green (11 files / 105 tests), `tsc --noEmit` clean, `check:triggers` OK,
  API healthy throughout.
- **Confirmed correct, not touched:** `sign-billing`/`sign-forensics`/`sign-matters`/
  `sign-seal-admin` (already properly role-gated), `gl.routes.ts` (file-level `FIN_ROLES` already
  covers everything), `hr-cases.routes.ts` (file-level `MGMT_ROLES` already covers everything,
  by explicit design per its own header comment), `payments.routes.ts` (already correctly
  branches `CUSTOMER` to its own resolved id), `files.routes.ts` (the actual ~40-route Drive
  backend — turned out to be the file the earlier "Drive hardening program" memory entry meant,
  not `drives.routes.ts` alone; extremely thorough existing per-route `CUSTOMER` handling
  throughout, the best-scoped file read this whole pass), `customers.routes.ts` (a concurrent
  session had already role-gated every mutation with an explicit comment trail), `task-projects.
  routes.ts` (real per-project ownership/membership ACL, not a blanket tenant-wide list),
  `onboarding.routes.ts`/`device-ingest.routes.ts` (deliberately public/device-authenticated by
  design), `entitlements.routes.ts` (returns only which plan features the tenant has — not
  sensitive to any role).

### HUD-0036 — 38 files: nearly all of Finance, Fleet, HR and Ondi identity admin readable by any CUSTOMER JWT · FIXED (VERIFIED)
- **Category:** Authorization (HUD-0024 continuation — the largest single batch this audit has
  found). Methodology shift for this pass: rather than "does the file have zero guard pattern at
  all" (the heuristic behind HUD-0031/0033/0034/0035), this pass looked for files with **only
  per-route** `requireRole(...)` on mutating endpoints and no file-level guard at all — the exact
  shape of the email-templates.routes.ts bug from HUD-0034, generalized. That surfaced 48
  candidate files; each was checked by actually reading the flagged GET handler's body (several
  turned out to have an in-handler ownership/self-scope check invisible to static grep, e.g.
  `payroll.routes.ts`'s `/employees/:id/payslips` correctly 403s a non-owner, and
  `activity-monitor.routes.ts`'s `/summary` defaults to `scopeUserId: user.sub`), then every
  remaining candidate was live-tested with a real `CUSTOMER` JWT before being treated as a
  finding — some, like `platform.routes.ts`'s branding/design-token/SEO GETs, are genuinely
  platform-wide public config (the file's own comment: "GET is public — even the pre-login
  screen needs the platform logo/name") and `packages.routes.ts`/`addons.routes.ts` are
  deliberately browsable pricing catalogs, not tenant data — both correctly left unfixed.
- **Evidence:** 38 files returned a clean, unrestricted `200` to a `CUSTOMER` JWT with nothing
  but `fastify.authenticate` (+ an unrelated plan `requireEntitlement`) in front of them —
  effectively all of **Finance** (`bills`, `budgets`, `invoices`, `credit-notes`,
  `customer-credits`, `deferred-tax`, `dividends`, `fixed-assets`, `fx-revaluation`,
  `gl-periods`, `purchase-orders`, `tax-codes`, `vat-periods`, `wht`, `cit`,
  `bank-reconciliation`, `financeExpenses`, `accounting-integration`, `ap-approval-workflows`,
  `tra`), all of **Fleet/Tracking** (`tracking`, `fleetOps`, `fleetComms`, `fleetCompliance`,
  `trailers`, `vehicleDetail` — six separate plugin files sharing the `/v1/tracking` prefix, the
  same "shared prefix ≠ shared guard" trap seen repeatedly this session), most of **HR**
  (`hr-benefits`, `hr-training`, `leave`, `overtime`, `org-chart`, `attendance-devices`), all of
  **Ondi's tenant identity/access admin** (`GET /users` — the full staff roster; `/invitations`;
  `/kyc/status` — KYC verification state), plus `documents.routes.ts` (a real **IDOR**: any
  shipment's uploaded documents, by id, with no ownership check — worse than the others since
  it's document *content*, not just metadata), `products.routes.ts`, `rate-card.routes.ts`,
  `suppliers.routes.ts`, and `settings.routes.ts` (tenant configuration; secret fields are
  already masked on read, so this is a config-exposure gap, not a credential leak).
- **Fix:** the same minimal `role === 'CUSTOMER'` → 403 file-level hook used throughout this
  audit, applied to all 38 files via a small script (hand-verified on two representative diffs
  before trusting the rest) rather than 38 manual edits — each file still needed its own
  insertion since, as established repeatedly this session, a shared URL prefix does not imply a
  shared plugin/guard.
- **Re-test, live:** all 38 endpoints re-tested with the same `CUSTOMER` JWT — every one now
  `403`. Re-tested a 10-endpoint sample with a `JUNIOR` JWT and 2 with a `FINANCE` JWT — all
  still `200`, confirming no legitimate staff access regressed. Full suite green (11 files / 105
  tests), `tsc --noEmit` clean, `check:triggers` OK, API healthy throughout.
- **Not fixed, confirmed correct instead:** `activity-monitor.routes.ts` (self-scoped by
  default), `payroll.routes.ts` (`/me/...` self-scoped; the two `/employees/:id/...` routes
  already 403 a non-owner), `platform.routes.ts`, `packages.routes.ts`, `addons.routes.ts`,
  `workflow-engine.routes.ts` (`/entity-types` is a static enum list), `finance.routes.ts`
  (`/:id/invoice` already 403s correctly) — all confirmed via the same live-JWT method, not
  assumed.
- **Standing caveat, sharpened rather than resolved by this pass:** two large batches in a row
  (this one and HUD-0035) each found real gaps using a *different* detection heuristic than the
  one before it. That is a strong signal the untriaged remainder of the 196 route files is not
  low-risk background noise — it is more likely that every new lens applied to this codebase
  finds another real class of gap, and no lens tried so far has been exhaustive (this pass's own
  method — "per-route mutation guard, no file-level guard" — still cannot see a file where a
  file-level guard exists but is itself too weak, e.g. gates on entitlement but not role, unless
  a human or a live probe checks it, which is exactly how HUD-0031/0033/0034/0035 were found).

### HUD-0035 — 10 more files from the HUD-0024 backlog: a cross-tenant search leak, an IDOR, a chat-bootstrap bug, and a second OAuth-hijack gap · FIXED (VERIFIED)
- **Category:** Authorization (HUD-0024 continuation — targeted re-scan of the specific ~30-file
  remainder the register had been citing as untriaged, using a refined heuristic: authenticate
  present, but no `require<Role/Permission>(`-shaped guard, no `role === 'CUSTOMER'` branch, and
  no ownership-scoping idiom anywhere in the file. 30 candidates surfaced; 20 were already fixed
  or confirmed correct earlier this session (stale heuristic hits) or turned out fine on reading
  (`fx-rates`, `calendar`, `booking` [deliberately public], `developer` [API-key gateway is
  correctly unauthenticated by design], `presence`, `calendar-sync`/`contacts-sync` [correctly
  per-user `user_id = user.sub` scoped — connecting your own external account, not a shared
  tenant credential], `setup-guide`, `sign-jurisdiction`, `landed-cost-share` [deliberately
  public, token-gated], `ondi-oauth` [a real OIDC *provider* flow, different shape, already
  covered by the earlier Ondi SSO audit program]). 10 were real gaps:**
- **Evidence:**
  - **`search.routes.ts`** — the header search bar had zero role check. A `CUSTOMER` JWT got
    `200` with other customers' names/emails/tax IDs, every staff member, every driver, every
    vehicle, and matching shipments/invoices tenant-wide (the file's own header comment already
    documents a prior tenant-isolation fix here — this is a second, narrower gap in the same
    file: right tenant, wrong audience).
  - **`related-records.routes.ts` — a real IDOR.** `RELATED_REGISTRY`'s `resolve()` functions
    (`lib/related-records.ts`) scope every entity by `tenant_id` only, never by ownership — the
    `shipment` entry resolves *any* shipment in the tenant. `shipments.routes.ts` itself
    correctly restricts a `CUSTOMER` to their own `customer_id`, but this generic "what's linked
    to this record" endpoint gave any `CUSTOMER` a second path to the same shipment's linked
    invoices/documents by id, with none of that scoping.
  - **`chat.routes.ts` — a real data bug, not just a reachability gap.** The file only required
    `bliss` entitlement, no role check. Worse: the first-access bootstrap that seeds a tenant's
    `#general` channel selected `users WHERE tenant_id = … AND active = true` with **no role
    filter** — and `CUSTOMER`-role accounts are rows in the same `users` table with `active =
    true` (confirmed live: `SELECT role, count(*) FROM users … GROUP BY role` on the dev tenant
    returned a `CUSTOMER` row, `active: true`). A brand-new tenant's first Team Chat use would
    have auto-enrolled every customer-portal account into the internal company-wide channel
    alongside real staff.
  - **`accounting-oauth.routes.ts` — the same OAuth-hijack shape as HUD-0034's mail-oauth
    finding, independently present in a second file.** `GET /:provider/authorize` had only
    `fastify.authenticate`; the signed state token carries just `tenantId`. Any authenticated
    user could have completed the QuickBooks/Xero consent screen with their own account and had
    it saved as the tenant's accounting-sync connection.
  - **`reports.routes.ts`** (`GET /journal`, `GET /summary`) — the tenant's whole revenue/expense
    journal and financial summary, built from `sales_invoices`/`supplier_bills` (the same tables
    `invoices.routes.ts` protects with `FIN_ROLES`), had no role check at all.
  - **`contracts.routes.ts`** — the file's own header comment already states the intent
    ("tenant-wide visibility for any **staff** user") but nothing enforced "staff"; any
    `CUSTOMER` could read every contract's subject/value/full content platform-wide.
  - **`sms.routes.ts`, `fleetAnalytics.routes.ts`, `cargo-dashboard.routes.ts`,
    `advanced-calculators.routes.ts`** — the same "internal ops tool with only an entitlement
    gate" shape as HUD-0031/0033's earlier batches: bulk-SMS contact groups (real phone numbers
    tenant-wide), fleet vehicle-health analytics, cross-customer cargo/demurrage dashboards, and
    a freely-mutable tenant-wide landed-cost reference table (`/transit-routes`) respectively.
- **Fix:** `role === 'CUSTOMER'` → 403 on `search`/`related-records`/`chat`/`contracts`/`sms`/
  `fleetAnalytics`/`cargo-dashboard`/`advanced-calculators` (plus excluding `CUSTOMER` and `ORG`
  from `chat.routes.ts`'s `#general` bootstrap seed query itself, not just gating the route);
  `requireRole(...FIN_ROLES)` on `reports.routes.ts` (matching `invoices.routes.ts`'s existing
  set, since it reads the same tables); `requireRole(...MGMT_ROLES)` on `accounting-oauth.
  routes.ts`'s `/authorize`, mirroring HUD-0034's mail-oauth fix exactly.
- **Re-test, live:** every file re-verified with real JWTs at the corrected route prefix (several
  guessed prefixes 404'd first — corrected against `index.ts`'s actual `server.register(...,
  { prefix })` calls before treating a miss as a pass): `CUSTOMER` → 403 on all eight
  role-excluded files; `JUNIOR` → 200 on `search`/`chat`, 403 on `reports` (not `FIN_ROLES`) and
  on `accounting-integrations/.../authorize` (not MGMT); `FINANCE` → 200 on `reports`; a
  not-found id on `related-records` correctly reached `404` (past the role gate) for `JUNIOR`.
  Full suite green (11 files / 105 tests), `tsc --noEmit` clean, `check:triggers` OK, API healthy
  throughout.
- **Not fixed, documented instead:** none of this pass's candidates needed a "confirmed correct,
  left as-is" writeup beyond what's listed above — every genuine gap found was fixed. The
  broader HUD-0024 caveat still stands: this was a second, more targeted sweep of the specific
  files a refined heuristic flagged, not an exhaustive line-by-line read of all 196 route files —
  an unscoped GET in a file that already has *some* guard elsewhere is still structurally
  invisible to this method, same limitation noted since the first pass.

### HUD-0034 — Email app: 3 more CUSTOMER-reachable endpoints + an OAuth-hijack gap · FIXED (VERIFIED)
- **Category:** Authorization (HUD-0024 continuation, triggered by a user request to audit the
  Email app specifically for production-readiness gaps)
- **Evidence:**
  - **`email.routes.ts` (`emailRoutes` + `emailSendRoutes`, two separate plugin registrations)
    had only `fastify.authenticate` + `requireEntitlement('email')` — no role check at all.**
    Proven live: a `CUSTOMER` JWT got `200` on `GET /v1/emails` (which auto-seeded a real
    personal mailbox for that customer account) and passed every check on
    `POST /v1/email/send` through to the usage-gate 402 (confirmed reaching the real send path
    by temporarily lowering the dev tenant's counter and re-testing — got a clean `200`, i.e. a
    customer-portal account could have sent outbound mail that looks like it came from the
    tenant's own operations address).
  - **`email-templates.routes.ts` — `GET /` had no role check** (writes were already correctly
    `requireRole`-gated to admin/manager). Any `CUSTOMER` JWT could read every one of the
    tenant's transactional email templates verbatim. Proven live, `200`.
  - **`mail-oauth.routes.ts` — `GET /:provider/authorize` had only `fastify.authenticate`.**
    This is more than a data-exposure gap: the signed `state` token it mints carries only the
    `tenantId`, not who initiated the flow. Any authenticated user of the tenant — proven live,
    a `CUSTOMER` JWT reached the route's business logic (400 "Save a Client ID first," not 403,
    on this dev tenant which has none configured) — could complete the Microsoft/Google consent
    screen with their **own personal account** and have nodemailer send the tenant's mail through
    it afterward, silently hijacking what address/identity the whole tenant sends as.
- **Fix:** the same minimal `role === 'CUSTOMER'` → 403 hook as HUD-0031/0033 on the two
  `email.routes.ts` plugins and `email-templates.routes.ts`'s `GET /`; `mail-oauth.routes.ts`'s
  `/authorize` route instead got `requireRole('SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER')`
  (an allowlist, not a denylist) since only the roles already trusted to save the Client
  ID/Secret in Settings should be able to start this flow — the unauthenticated `/callback` leg
  needed no change, since it can now only ever be reached from a state token an admin minted.
- **Re-test, live:** after the fix, `CUSTOMER` → 403 on all three (send re-verified past the
  usage gate the same way); `JUNIOR` (legitimate staff) still `200` on the mailbox/templates
  reads but `403` on `/authorize` (not an admin role); a `TENANT_ADMIN`/`ADMIN`-tier role would
  still get `200` there (not separately re-proven this pass, since the route's pre-existing
  business logic for that role was never in question — only who could reach it). Full suite
  green (11 files / 105 tests), `tsc --noEmit` clean on both apps, `check:triggers` OK, API
  healthy throughout. Usage counter restored to 500/500 after the send re-test.
- **Not a security finding, but worth recording alongside this app's audit — completeness gaps
  for "100%":** the Email app has **no real inbound mail receiving at all** — `email_messages`
  is written only by a one-time fake-sample seed and by copying a message the user themself just
  sent into their own Sent folder; there is no IMAP/webhook ingestion of real external mail the
  way `imap-ticket-ingest.job.ts` does for Support tickets. Compose has no attachment upload
  despite `has_attachment`/`attachmentStorageKey` plumbing existing end-to-end in
  `MailService`/`mail-outbox.job.ts` for other callers. The detail toolbar's "Archive" and
  "Delete" buttons call the exact same handler (both just move to Trash) — no real archive
  concept exists. Drafts and Spam are permanently-empty dead folders (nothing in the frontend
  ever writes `folder: 'drafts'` or `'spam'`, and the backend's real permanent-delete endpoint,
  `DELETE /v1/emails/:id`, is never called from the UI at all). Search and pagination are both
  client-side over whatever the current folder query returned, not server-side. None of this is
  a security bug — it's the gap between "a demo mail client" and "a real corporate mailbox" —
  logged here rather than opened as a separate MEDIUM/LOW issue since it was found and fully
  scoped in one pass; see the chat response for the full breakdown.

### HUD-0032 — Project OS `GET /portfolios` throws a 500 for any real user · OPEN — root cause now confirmed as whole-module schema drift, deepened by Phase 5 (twenty-fifth journey)
- **Category:** Functional / reliability (found as a side effect of HUD-0031, not itself an
  authorization finding). Originally a single-endpoint symptom; this pass root-causes it and shows
  it is not isolated to `/portfolios` at all.
- **Original evidence (still true):** `GET /v1/project-os/portfolios` returns an unhandled 500 for
  a legitimate `JUNIOR`-role JWT (confirmed after the HUD-0031 auth fix was in place, ruling out
  role as the cause) — re-confirmed live again this session, unchanged.
- **Root cause, found by comparing the service code to the real live schema directly:**
  `ProjectOsService.listPortfolios`'s `SELECT` and `createPortfolio`'s `INSERT` both reference
  `owner_id`, `target_roi`, `allocated_budget`, `spent_budget`, `strategic_alignment` — **none of
  which exist** on the real `project_portfolios` table, whose actual columns are `manager_id`,
  `target_budget`, `currency`, `start_date`, `end_date` (confirmed directly via
  `information_schema.columns`). This is not a subtle mismatch on one field — every
  non-common column referenced is wrong, guaranteeing a 100% crash on every call, for every
  tenant, unconditionally — both reading the list *and* creating a new portfolio are equally
  broken. The same exact pattern was found one level deeper: `createPhase`'s `INSERT` references
  `sequence_order`/`gate_review_date`/`gate_approver_role`/`gate_criteria`/`notes` against the real
  `project_phases` table, whose actual columns are `phase_number`/`progress_pct`/`sort_order` — a
  second, independently-confirmed instance of the identical drift.
- **Scope, live-confirmed, not assumed from two data points:** created a real project via the
  (separate, working) `task-projects.routes.ts` `POST /v1/tasks/projects`, then spot-checked five
  representative `project-os.routes.ts` endpoints spanning every category the module offers —
  `GET /portfolios`, `POST /portfolios`, `POST /projects/:id/phases`, `GET /command-center`,
  `GET /resources`, `GET /approvals` — **all six failed identically** with the same generic 500.
  This is not a single broken endpoint; the entire 34-route `project-os.routes.ts` module (and its
  backing `project-os.service.ts`) is non-functional end to end against the live database as it
  actually exists today.
- **Not fixed here, more deliberately than any other finding this arc:** this isn't a "document,
  don't guess" judgment call about which of several reasonable designs to pick (like HUD-0054's
  Inventory GL wiring or HUD-0057's demurrage liability) — it's a standing, already-recorded
  collaboration boundary. [[project_os_transformation_role_split]] (2026-09-09) already documents
  that a separate, concurrent development effort ("Antigravity") is building Project OS's real
  schema (migration 448, 22 tables) and that `project-os.ts` was already known to be "fully
  drifted" from it at that time — with an explicit "no file overlap" understanding for this exact
  module. This session's contribution is confirming, with fresh live evidence, that the drift is
  total rather than partial, and that it affects every category of the module's surface, not
  fixing any of it.

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

### HUD-0024 — RBAC matrix (Phase 14) triaged across all 196 route files · CLOSED
- **Closure note:** the file-by-file sweep this entry tracks ran across HUD-0025–0039 (nine
  batches, several different detection methods) and converged to zero remaining untriaged route
  files as of HUD-0039 — see that entry for the closure summary, final tally (105 files fixed /
  91 confirmed correct), and — importantly — what this sweep does *not* prove (a present-but-
  wrong role check, or a flaw spanning multiple routes/services, would not be caught by it).
  Left as `CLOSED` rather than deleted so the full history below stays attached to one id.
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
- **HUD-0031 and HUD-0033** (below) closed every candidate this file-level probe found: Petti,
  Sanctions, Notes, Org (tickets), the whole `seal-*` family, HR/NexusHR, Depot, Inventory
  family, Dangerous Goods, Declarations family, Project OS (auth side; see HUD-0032 for its
  unrelated 500), Customs, AI memory, CargoTracker, HuduBI, and the HuduFreight
  `cargoLoading`/`warehouse` files. `/v1/reference/icd-operators` was confirmed fine (deliberate
  global reference data). Two Sign sibling files (`sign-stamps.routes.ts`,
  `sign-versions.routes.ts`) had their own distinct gaps beyond simple CUSTOMER-reachability —
  see HUD-0033.
- **Confirmed already correct this pass (no fix needed):** `notifications.routes.ts`
  (explicitly branches on `role === 'CUSTOMER'` to scope by `customer_id`), `activity-
  monitor.routes.ts`, `tasks.routes.ts`, `comply-ocr.routes.ts`/`ocr.routes.ts` (stateless
  scan-and-return), `sign-pdf-tools.routes.ts` (stateless, no stored-data access — missing
  entitlement is a metering gap, not a security one), `trade-wizard.routes.ts`.
- **Still fully untriaged:** ~30 files not touched by any pass so far — the large lower-risk
  tail (remaining calculators, calendar/chat self-service actions not yet spot-checked) plus
  anything outside the original HUD-0024 regex scan entirely (a mutating endpoint is not the
  only shape a leak can take — an unscoped GET-only file was never flagged by that scan and
  would need a separate, broader sweep to catch).

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
| 5 | Functional tracing (every action → DB) | PARTIAL — eight golden paths traced live: ClearOS shipment → workflow engine → FinOps invoice → GL → payment (HUD-0043, 1 real bug found+fixed); NexusHR payroll run → GL (HUD-0044, clean, retires a stale "payroll→GL not wired" memory note); Sign envelope create→send→sign→stamp→verify (HUD-0045, clean); SEAL lot→customs declaration→duty computation→release (HUD-0046, clean, duty math independently hand-verified to the shilling); Drive upload→download→public share→access-log (HUD-0047, clean, byte-for-byte round trip verified twice); CRM lead→deal conversion→pipeline→won (HUD-0048, clean); Support ticket create→reply→customer-reply→resolve (HUD-0049, mostly clean, 1 LOW completeness gap noted); Onsite domain→DNS→server provisioning (HUD-0050, 1 real HIGH bug found+fixed — a case-sensitive DB constraint crashed server creation for any non-lowercase provider name). Every other app's core journey still UNVERIFIED |
| 6 | Full security sweep (SSRF, path traversal, file access, injection) | **CLOSED** — CORS/helmet/rate-limit/secrets checked; SSRF (HUD-0040, 4 fixed); log-secrets (clean); path traversal/file access (HUD-0041, 1 fixed); SQL/command injection (HUD-0042, clean) |
| 7 | Data integrity (idempotency, concurrent edits, rollback) | UNVERIFIED |
| 8 | UI/UX forensic | UNVERIFIED |
| 9 | Responsive / mobile (12 breakpoints) | UNVERIFIED |
| 10 | Accessibility | UNVERIFIED |
| 11 | Performance (100 → 100k rows, N+1) | UNVERIFIED |
| 12 | Third-party integrations (9 integrations, webhook sig, idempotency) | UNVERIFIED |
| 13 | Test authoring | UNVERIFIED (see HUD-0005) |
| 14 | RBAC matrix per role, per route | UNVERIFIED |
| 15–18 | Remediation / regression / adversarial / scoring | IN PROGRESS |
