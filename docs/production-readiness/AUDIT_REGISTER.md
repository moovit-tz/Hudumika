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
| HIGH | 6 | 37 | 43 |
| MEDIUM | 5 | 10 | 15 |
| LOW | 8 | 5 | 13 |

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
'opened' custody-log rows and HUD-0084's escalations bad-channel-id raw-500 (now a clean 404) to
LOW/Fixed; a concurrent session's own HIGH fix to org-chart's
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
| Production build | **REGRESSED (again)** — `apps/api`'s `tsc --noEmit` currently fails on `cms-content.routes.ts:154` (a required-vs-optional field type mismatch), confirmed via `git status` to be an untracked file belonging to a different, still-in-progress concurrent session's own CMS feature work (also touching `cms.routes.ts`/`cms.service.ts`/`packages/types/src/cms.ts`), not anything changed in this arc. This is the *second* time this exact shape of transient regression has appeared mid-arc from a concurrent session's own commits (see HUD-0074's `email.routes.ts` instance, which resolved on its own) — confirmed this session's own changed files typecheck cleanly in isolation each time. Left alone per the same cross-session-collision boundary | HUD-0020, HUD-0074, HUD-0076, HUD-0096 |
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

### HUD-0081 — Phase 5: FinOps dividends journey traced live · CLEAN, correctly feeds the statement of changes in equity
- **Category:** Functional correctness (Phase 5, fortieth journey).
- **Trace:** declared a real dividend (5,000,000 TZS) and hand-verified the resulting GL entry —
  Dr `3100` (Retained Earnings) / Cr `2600` (Dividends Payable), both 5,000,000, balanced. Paid it
  and hand-verified the second entry — Dr `2600` / Cr `1010` (Bank), clearing the liability exactly.
  Confirmed a repeat payment attempt is correctly refused (`409`, "already been paid").
- **Confirmed the whole reason this feature exists — the real equity-movement attribution report**
  (`GET /v1/finance/equity-statement`, `GLService.statementOfChangesInEquity`): fetched the report
  for the declaration/payment date and confirmed `3100`'s `dividends` column showed exactly
  `-5,000,000`, correctly isolated from an unrelated `opening`/`other` pair of figures (+420,000 /
  -420,000) that turned out to be real leftover activity from an earlier journey's (HUD-0068) void
  cleanup landing on the same calendar day — not a bug, just two independent, correctly-net-zero-
  over-time movements the report correctly kept separate from the dividend's own attribution. The
  report matches a real journal entry to this table specifically by `journal_entry_id`/
  `paid_journal_entry_id`, distinguishing a dividend movement from a period-close movement
  (`fromNetIncome`) or anything else (`other`) — confirmed each bucket landed exactly where it
  should.
- **Also confirmed live:** a `CUSTOMER` JWT is correctly refused the entire app (`403`).
- **Came back clean — no code changes needed.** Full suite green (11 files / 105 tests),
  `check:triggers` OK, API healthy throughout (no code changed, so `tsc` re-verification wasn't
  required, but was run anyway as a sanity check).
- **Test-artifact handling:** dividends have no delete/void endpoint anywhere in the API — a
  declared-and-paid dividend is left in place, clearly labeled `HUD-0081 test dividend declaration`
  in every human-readable field, consistent with this arc's rule for a record type with no real
  delete path. Usage counter restored to 500/500 and confirmed.

### HUD-0082 — Phase 5: NexusHR disciplinary case-management journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, forty-first journey).
- **Trace:** created a real disciplinary case for a real employee (`verbal_warning`, `low`
  severity) → confirmed it appears correctly on the list, filtered by `employee_id`, with both the
  employee and the opener's real names resolved via join → added a real note and confirmed the full
  detail view returns it with the correct author name attached.
- **The status lifecycle — verified property by property:** `open → in_progress` correctly left
  `resolved_at` null; `in_progress → resolved` (with a resolution note) correctly stamped
  `resolved_at`; reopening (`resolved → open`) correctly **cleared** `resolved_at` back to null
  rather than leaving a stale timestamp on an active case, exactly matching the route's own stated
  design ("reopening clears it rather than leaving a stale timestamp").
- **Also confirmed live:** a nonexistent case id 404s; creating a case against a nonexistent
  `employee_id` is correctly refused (`404`, "Employee not found in this workspace"); an empty
  `PATCH` body is correctly refused (`400`, "Nothing to update"); a `JUNIOR` is correctly refused
  the entire module (`403`) — this file is `MGMT_ROLES`-only throughout, a deliberate scope decision
  the file's own header comment explains (case data is manager/HR working material, not something
  the subject of a case browses themselves — a real, harder question the file explicitly doesn't
  attempt to answer).
- **Came back clean — no code changes needed.** Full suite unaffected, `check:triggers` OK
  (`hr.case_opened`/`hr.case_status_changed` both have real emitters and real subscribers), API
  healthy throughout.
- **Test-artifact handling:** `hr_cases`/`hr_case_notes` have no delete endpoint anywhere in the
  API — a real disciplinary record is treated as permanent by design, not an oversight. Left in
  place, clearly labeled `HUD-0082` in every human-readable field. Usage counter restored to
  500/500 and confirmed.

### HUD-0083 — Phase 5: Sign matters + jurisdiction-engine journey traced live · CLEAN
- **Category:** Functional correctness (Phase 5, forty-second journey) — closing out the Sign
  cluster's two remaining small, self-contained surfaces.
- **Matters (a computed `GROUP BY` over `sign_envelopes.matter_reference`, deliberately not its own
  table — "nothing here can drift from the envelopes themselves because it's computed from them on
  every request"):** created two real envelopes sharing one matter reference, each with a different
  real customer as `client_id`. `GET /matters` correctly aggregated them — `envelope_count: 2`,
  `client_names` correctly listing both distinct customer names via `array_agg(DISTINCT ...)`.
  `GET /matters/:reference/envelopes` correctly returned both. A nonexistent matter reference
  correctly 404s. A `JUNIOR` is correctly refused the entire feature (`403`, "Only a tenant admin
  can browse matters across every user's documents") — the same cross-user-disclosure gate as
  `sign.routes.ts`'s own `DOCUMENT_ADMIN_ROLES`, mirrored here rather than loosened for this one
  feature.
- **Jurisdiction engine (platform-level legal reference data, `sign_jurisdiction_rules`, no
  tenant_id):** `GET /jurisdiction-rules/mine` correctly resolved this tenant's own jurisdiction
  server-side from `tenants.country` (`'TZ'`, set for real in HUD-0063) with no second round trip
  needed, and returned real, specifically-cited Tanzanian statutory rules for all four execution
  types (`NORMAL_SIGN`/`WITNESSED_SIGNATURE`/`AFFIDAVIT`/`NOTARIAL_CERTIFICATION`) — genuine
  Electronic Transactions Act, CAP 442 R.E. 2022 section citations (s.6-7, s.10(a)-(b)), not
  placeholder text. Confirmed the explicit `?jurisdiction=TZ` filter and the full unfiltered list
  (16 rules total across all four EAC countries — KE/RW/TZ/UG) both return correctly.
- **Came back clean — no code changes needed.** Full suite green (11 files / 105 tests),
  `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** both test envelopes were still `DRAFT` (never sent), so — unlike
  HUD-0080's completed envelope — a real, unrestricted `DELETE /envelopes/:id` applied cleanly; both
  were deleted. Usage counter restored to 500/500 and confirmed.

### HUD-0084 — Phase 5: Bliss escalations journey traced live · real LOW bug found+fixed (a bad/deleted chat channel surfaced as a raw, unhelpful 500 instead of a clean 404)
- **Category:** Functional correctness + error-handling quality (Phase 5, forty-third journey).
- **Trace:** created a real `CASE` escalation and a real `CHAT` escalation (against a real chat
  channel) as one `JUNIOR` staff member, then created a second `JUNIOR`'s own escalation. Confirmed
  the "own-only visibility" rule live with two genuinely different accounts, not just one: each
  `JUNIOR` sees only their own escalations, correctly excluding the other's — while a `SENIOR`
  (a resolver-tier role) correctly sees every escalation from both. Confirmed a real notification
  fan-out: every resolver-tier user in the tenant got a real notification row for each escalation
  **except the escalator themselves**, even checked across two different escalators, matching the
  code's own stated intent ("no point notifying yourself of your own action").
- **Evidence (real LOW bug found):** submitting a `CHAT` escalation with a `channelId` that doesn't
  exist (a genuinely plausible real scenario — a channel deleted between the frontend loading its
  option list and the user submitting, not just a contrived test) produced a raw, unhelpful
  `{"error":"An unexpected error occurred. Please try again."}` at a bare `500` — live-confirmed.
  Root cause: `channel_id` carries a real foreign key to `chat_channels`, but the route never
  checked the channel exists before attempting the insert, so a bad id fell through to a raw
  Postgres constraint violation caught only by the generic top-level error handler. No data
  integrity issue (the FK correctly prevented the bad write from ever landing) — a pure
  error-message-quality gap, but the same class of gap this codebase explicitly guards against
  elsewhere (e.g. `hr-cases.routes.ts`'s own `employee_id` existence check, HUD-0082).
- **Fix:** added a real existence check (`chat_channels` by id + tenant) before the insert on the
  `CHAT` branch, returning a clean `404: "That channel no longer exists."` instead.
- **Re-test, live:** replayed the exact original reproduction — now a clean `404` instead of a bare
  `500`; confirmed a real channel still succeeds afterward, proving the fix doesn't block the
  legitimate path.
- **Also confirmed live:** the one-step-at-a-time status machine (`PENDING → IN_PROGRESS →
  RESOLVED`, no skipping) correctly stamps `resolved_at`/`resolved_by` only on the terminal
  transition; a `JUNIOR` is correctly refused `PATCH .../advance` (`403`, not a resolver role); an
  already-`RESOLVED` escalation correctly refuses a further advance (`409`, "Already resolved").
- **Came back otherwise clean.** `tsc --noEmit` clean, full suite green (11 files / 105 tests),
  `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** this file has no delete endpoint anywhere in the API — every test
  escalation was left in place, clearly labeled `HUD-0084` in every human-readable field. Usage
  counter restored to 500/500 and confirmed.

### HUD-0085 — Phase 5: AgencyHost referral commission journey traced live · CLEAN, including live self-referral fraud detection
- **Category:** Functional correctness (Phase 5, forty-fourth journey).
- **Setup:** created two real platform-level tenants via direct SQL (a legitimate, disclosed
  setup step — `tenants` has no onboarding-flow shortcut this trace needed to reach), each with
  `referred_by_tenant_id` pointing at the dev tenant, then called the actual exported
  `computeAndRecordCommission()` service function directly (real code, real DB writes — not a
  reimplementation) to simulate the real trigger point (`onboarding.service.ts`, right after a
  referred tenant's first real payment) without needing a full payment-gateway round trip.
- **Commission computation and self-referral fraud detection — verified property by property:**
  Tenant A (a clean phone number) correctly produced a `pending` commission at exactly 10% of the
  payment amount (`$100 → $10.00`). Tenant B was given a signup phone deliberately reformatted from
  a real dev-tenant staff member's own phone (`+255712345672` → `0712345672` — same last 9 digits,
  different formatting) and correctly came back `flagged`, with the exact real reason attached —
  confirming the phone-normalization matching (last-9-digits, strips all non-digit characters)
  genuinely catches a reformatted duplicate, not just an exact string match. **Idempotency
  confirmed live**: calling the function a second time for Tenant A with a different amount and
  transaction ref produced no second row and did not alter the first — the unique index on
  `referred_tenant_id` correctly makes this a no-op, not a duplicate or a silent overwrite.
- **Tenant-facing views:** `GET /my-link` correctly returned the dev tenant's real slug as its
  referral code and a real, trusted signup URL; `GET /commissions` correctly showed both test
  commissions with their referred-tenant names resolved via join.
- **The full superadmin lifecycle — approve, an honest automatic-payout refusal, manual payout,
  reject, and the already-decided guard, all confirmed live:** a `TENANT_ADMIN` is correctly
  refused the platform-wide view (`403`, `SUPER_ADMIN` only); a `SUPER_ADMIN` sees both commissions
  across tenants with both tenant names resolved. Approved Tenant A's commission (`decided_at`/
  `decided_by` stamped) → attempted automatic payout, correctly refused (`409`) with an honest,
  specific message ("No payout provider is connected yet... record the payout manually") rather
  than a fake success — matches this codebase's established pattern of never claiming to have paid
  out through a gateway that doesn't exist. Recorded a real manual payout (`status: 'paid'`,
  `paid_at`/`payout_method` stamped); a second manual-payout attempt on the same commission
  correctly refused (`404`, no longer `'approved'`). Rejected Tenant B's flagged commission
  (`decided_at` stamped); attempting to decide either commission a second time — the rejected one
  or the already-paid one — both correctly refused (`404`, "already decided").
- **Came back clean — no code changes needed.** Full suite green (11 files / 105 tests),
  `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** both test tenants and their commission rows (created via direct SQL
  as setup) were removed the same way — deleted the `referral_commissions` rows first (no cascade
  FK), then the two tenant rows, confirmed zero remaining. No real tenant, user, or business data
  was touched. Usage counter unaffected (this journey used no metered write endpoints).

### HUD-0086 — Phase 5: HuduBI platform data-quality engine journey traced live · CLEAN, verified by deliberately planting real anomalies and watching the SQL logic actually catch them
- **Category:** Functional correctness (Phase 5, forty-fifth journey) — the first this arc to
  verify a diagnostic tool's own detection logic against deliberately-injected real defects, rather
  than just exercising its happy path.
- **Baseline (no injection needed):** a first `POST /run` (before planting anything) already came
  back with real, live findings from this arc's own testing activity — three genuine
  `duplicate_domain_events` findings and four genuine `domain_events_volume_anomaly` findings —
  confirming the engine finds real signal in real data, not just in fixtures built for it.
- **Deliberately planted three real anomalies via direct SQL (a disclosed, one-time setup step —
  each row realistically shaped, not a synthetic fixture) and confirmed the checker's own SQL logic
  detects every one, with the exact right sample id, count, and tenant attribution:**
  a `domain_events` row timestamped 10 minutes in the future (`future_domain_events`); a
  `stage_history` row whose `exited_at` precedes its `entered_at` (`stage_history_negative_
  duration`); a `sign_certifiers` row marked `verified` with an `expiry_date` 30 days in the past
  (`expired_verified_certifiers`). All three showed up correctly on the very next run, each finding
  matching its planted row's real id exactly.
- **A real, useful discovery about one check's actual reachability, found while planning the
  test rather than by reading the code alone:** `metric_alert_rules.metric_key` carries a genuine
  foreign key to `metric_definitions(metric_key)` — confirmed live by a failed insert — which means
  `orphan_metric_alert_rules` can **never** fire for a rule created against a metric that never
  existed (the FK physically prevents that row from ever being written); it can only fire for a
  rule whose metric was later deprecated *after* the rule was created. The check's own description
  ("monitor deprecated or non-existent metrics") is accurate, but only the "deprecated" half is
  actually reachable in practice — not tested further here, since exercising it would require
  temporarily deprecating a real, platform-wide (non-tenant-scoped) metric definition, a shared-
  state change with a blast radius wider than this one check's coverage justified.
- **The self-healing design — the whole reason each run is a fresh snapshot rather than a
  maintained "resolved" flag — verified live, not just read from the comment:** after cleaning up
  all three planted rows, the very next run correctly stopped reporting any of them, with zero
  special handling needed to make that happen.
- **Also confirmed live:** `GET /findings` returns exactly the latest run's rows, including the
  planted ones while they existed; a `TENANT_ADMIN` is correctly refused the entire module (`403`,
  `SUPER_ADMIN` only) — data quality here is an engineering concern about the platform's own
  pipeline, not tenant-facing data.
- **Came back clean — no code changes needed.** Full suite green (11 files / 105 tests),
  `check:triggers` OK, API healthy throughout.
- **Test-artifact handling:** all three planted rows were deleted via direct SQL (symmetric with
  how they were created) before the final confirmation run. The `data_quality_findings` rows this
  journey's three `POST /run` calls produced were deliberately left in place — this table is the
  tool's own accumulating run history, not a business record subject to cleanup, and its whole
  design (`getLatestFindings()` always reads the newest `run_id`) means the older runs are already
  inert.

### HUD-0087 — Phase 5: cross-app related-records lookup journey traced live · CLEAN, including a critical cross-tenant isolation check
- **Category:** Functional correctness (Phase 5, forty-sixth journey).
- **Trace:** the generalized "what's linked to this record" panel — one registry backing both
  `shipment` and `customer` entity types, each relation a small independent real query (some by FK,
  some by text-match on `ref_number`, one a two-table join). Fetched a real shipment with exactly
  one real linked invoice and confirmed the response correctly included only that one relation —
  then independently verified against Postgres that the three *other* shipment relations
  (containers, tracker snapshots, trips) are genuinely empty for this shipment, confirming their
  omission reflects real absence, not hidden or lost data. Fetched a real customer with two real
  linked invoices (including a `Void`-status one, correctly still shown — a complete real history,
  not filtered by status) and got both back correctly.
- **The most important check — live cross-tenant isolation, not assumed from the code's own
  `tenant_id` scoping:** looked up a real shipment id that genuinely belongs to a **different**
  tenant and confirmed the API correctly returns `404: "Record not found"` rather than that
  tenant's real linked-record data — the `resolve()` function's tenant scoping actually holds under
  a real cross-tenant id, not just in the abstract.
- **Also confirmed live:** an unknown entity type correctly 404s with a specific message naming it;
  a valid entity type with a nonexistent id correctly 404s; a `CUSTOMER` JWT is correctly refused
  the entire endpoint (`403`) — the file's own header comment already documents *why*: per-relation
  resolution scopes by tenant only, not by ownership, which would otherwise let a customer enumerate
  another customer's linked records by guessing an id, so the whole surface is blocked for that role
  rather than adding a narrower ownership check per relation.
- **Came back clean — no code changes needed.** This was a purely read-only journey (no data
  created), so no cleanup or usage-counter restoration was needed. Full suite green (11 files / 105
  tests), `check:triggers` OK, API healthy throughout.

### HUD-0088 — Phase 5: NexusHR benefits administration journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, forty-seventh journey).
- **Trace:** `hr-benefits.routes.ts` — plan lifecycle and enrollment lifecycle, both halves of the
  self-vs-MGMT authorization split. `POST /plans` (a real benefit plan) → self-enrollment
  (`POST /enrollments` as the employee) → a second employee attempted by a non-MGMT actor on
  *another* employee's behalf (authorization boundary) → the same MGMT-for-someone-else
  enrollment done correctly by a MANAGER → `GET /my-enrollments` (self) vs `GET /enrollments`
  (MGMT-wide) → waive (`PATCH .../status` to `waived`) → re-enroll into the same plan → terminate
  (`PATCH .../status` to `terminated`) → a non-MGMT actor attempting to change *another*
  employee's enrollment status (second authorization boundary) → soft-delete (retire) the plan
  (`DELETE /plans/:id`) → confirm history survives → attempt a brand-new enrollment into the
  now-retired plan → `POST /plans` attempted by a JUNIOR (plan-creation RBAC gate).
- **Result: every mechanism worked exactly as designed, including two easy-to-get-wrong details.**
  Waiving an enrollment correctly left `terminated_at` as `null` — confirmed directly against
  Postgres, not just the response — proving the handler only stamps that column for
  `status: 'terminated'`, not any non-`enrolled` status generically (a plausible off-by-one this
  code avoided). Re-enrolling into the same plan after waiving went through the route's real
  `onConflict(['tenant_id','employee_id','plan_id']).doUpdateSet(...)` upsert — confirmed via a
  direct SQL count that exactly **one** `hr_benefit_enrollments` row exists for that
  employee/plan pair afterward, not a duplicate second row sitting alongside the waived one.
  Both authorization boundaries (a non-MGMT employee enrolling or changing the status of someone
  *other than themselves*) were correctly refused with `403`; the self-vs-MGMT split does not
  leak into either direction. Soft-deleting the plan (`active = false`) correctly removed it from
  `GET /plans`'s active list while both real enrollment rows — one `enrolled`, one `terminated` —
  remained fully queryable and correctly attributed, proving the soft-delete exists specifically
  to preserve enrollment history rather than cascade-deleting it. A fresh enrollment attempt
  against the now-retired plan was correctly refused (`404: "Plan not found or no longer
  offered."`). Plan creation is correctly gated to `SUPER_ADMIN`/`ADMIN`/`TENANT_ADMIN`/`MANAGER`
  — a `JUNIOR` JWT was refused with `403` naming the required roles.
- **No bug found.**
- **Test-artifact handling:** enrollments have no hard-delete endpoint at all (matching the
  platform-wide pattern for business records this arc has repeatedly confirmed) — both real
  enrollments were left in a terminal `terminated` state, clearly attributable to `HUD-0088`; the
  plan itself is left soft-deleted (`active = false`), which is itself the correct, working
  cleanup mechanism, not a workaround. Usage counter restored to 500/500. No code changes this
  pass.

### HUD-0089 — Phase 5: Road consignments + warehouse dock-appointment journey traced live · found and fixed a real, file-wide MEDIUM bug
- **Category:** Functional correctness (Phase 5, forty-eighth journey).
- **Trace:** `consignments.routes.ts`/`consignment.service.ts` — create a road consignment → add a
  trip → advance it `PENDING→IN_PROGRESS→COMPLETED` → add a border crossing → advance it to
  `CLEARED` → advance the consignment itself `PENDING→DISPATCHED→DELIVERED`. Separately,
  `warehouse.routes.ts` — create a location → create a dock appointment → check-in → complete →
  occupancy heatmap.
- **The golden path itself is clean.** Consignment numbers auto-generate correctly
  (`RC-202609-0001`); advancing a trip to `IN_PROGRESS`/`COMPLETED` correctly stamps
  `start_date`/`end_date`; advancing a border crossing to `CLEARED` correctly stamps `cleared_at`
  *and* `documents_checked: true` together; advancing the consignment to `DISPATCHED`/`DELIVERED`
  correctly stamps `dispatched_at`/`delivered_at`. Warehouse: a dock appointment correctly moves
  `SCHEDULED→CHECKED_IN→COMPLETED`, and the occupancy heatmap correctly reported `0` for a fresh
  location with no stock ever received against it (an honest zero, not a fabricated number).
  Role gates verified live: consignment creation is refused to a `JUNIOR` (`OFFICER`/`MANAGER`+
  only) while every operational transition (trip/border/status updates) is deliberately open to
  any non-`CUSTOMER` staff role, matching the file's own design; `CUSTOMER` is correctly refused
  the entire consignments and warehouse surfaces.
- **Found and fixed a real MEDIUM bug, reaching across the whole file, not one route.** Every
  id-lookup and id-based mutation in `consignment.service.ts` used `.executeTakeFirstOrThrow()` —
  a plain wrong, stale, or deleted id crashed with a raw `500 {"message":"no result"}` instead of
  a clean `404`, live-confirmed across all six affected routes: `GET /:id`, `PATCH /:id/status`,
  `POST /:id/trips`, `PATCH /trips/:tripId/status`, `POST /:id/borders`,
  `PATCH /borders/:borderId/status`. `POST /:id/trips` and `POST /:id/borders` were worse than a
  clean throw — with no existence check on `consignmentId` before inserting, a foreign/stale id
  fell straight into the table's real FK constraint and crashed the same way. **Verified this
  wasn't a security gap first**: `consignment_trips` carries no `tenant_id` column at all (scoped
  only transitively through `road_consignments` via its FK) and `updateTripStatus`/
  `updateBorderStatus` filter by bare `id` with no explicit tenant clause in the query — read
  `pg_policies` directly and confirmed real, correctly-scoped RLS policies exist on all three
  tables (`consignment_trips`'s policy resolves through a `road_consignments` subquery,
  `border_crossings`'s own `tenant_id` column is checked directly) with `FORCE ROW LEVEL SECURITY`
  set — so a cross-tenant id was never able to read or mutate another tenant's row, only to crash
  ugly instead of 404ing clean. Live-confirmed with a real second tenant's `TENANT_ADMIN` JWT
  against this journey's own real trip/border/consignment ids: correctly refused with `404`, not
  leaked data, both before and after the fix (only the status code around the refusal changed).
  **Fixed** by switching every affected call to `.executeTakeFirst()` and adding an explicit
  consignment-existence check to `addTrip`/`addBorderCrossing` (the same "check the reference
  exists before writing" convention this arc already applied in HUD-0084), with each route handler
  now translating a `null` result into a real `404`. Re-verified live: all six original crashing
  reproductions now 404 cleanly with a specific message, while the real happy-path data created
  earlier in the same run remained fully reachable and correct throughout.
- **Aside, not a bug:** `GET /warehouse/*` refused with `403 PLAN_UPGRADE_REQUIRED` at the start of
  this trace — the dev tenant's `growth` plan doesn't include `tracking.warehouse`. Granted a
  temporary `tenant_settings.settings['enabled-apps']['tracking.warehouse'] = true` override (the
  platform's own real per-tenant grant mechanism, `entitlement.ts`'s documented explicit-true
  path) to exercise the golden path, then removed the key afterward, confirmed the override map is
  back to `{}` exactly as it was found.
- **Test-artifact handling:** the real consignment (`RC-202609-0001`, `DELIVERED`, clearly labeled
  `HUD-0089 test cargo`) plus its one trip and one border crossing were left in place — this file
  has no `DELETE` endpoint anywhere, matching the platform-wide no-hard-delete convention for
  business records. The warehouse location and dock appointment both have real `DELETE` endpoints
  and were fully removed. Usage counter restored to 500/500 (temporarily lowered mid-journey after
  a shared-dev-tenant collision with concurrent real traffic pushed it to the cap; verified the
  restore). Full suite green (11 files/105 tests), `tsc`/`check:triggers` clean.

### HUD-0090 — Phase 5: NexusHR training & certification journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, forty-ninth journey).
- **Trace:** `hr-training.routes.ts` — a course catalogue + enrollment lifecycle deliberately built
  as "confirmed entirely absent in the audit" per the file's own header comment, so this is the
  first live trace of it. Created a real certification course (12-month validity) and a plain
  course → self-enrollment → duplicate-enrollment refusal → a non-MGMT actor attempting to enroll a
  *different* employee (403) → MGMT correctly enrolling that other employee → enrollment into a
  nonexistent course (404) → a non-MGMT actor attempting to record their own outcome (403,
  MGMT-only) → MGMT completing the certification enrollment → MGMT failing the plain-course
  enrollment → cancel boundaries (a completed enrollment refused cancellation, a non-owner/non-MGMT
  actor refused cancelling someone else's, the actual owner succeeding) → the expiring-certifications
  report → `GET /my-enrollments` (self) vs `GET /enrollments` (MGMT-wide, correctly refused to a
  `JUNIOR`) → soft-delete (retire) both courses → confirmed enrollment history survives.
- **Result: every mechanism worked exactly as designed, including the one genuinely computed
  figure in the file.** Completing the certification enrollment stamped a `certificate_expiry_date`
  of `2027-09-13`, matching an independent hand-computation of the exact same
  `new Date(now.getFullYear(), now.getMonth()+12, now.getDate())` formula to the day — confirming
  the snapshot-on-completion design (the expiry is stored on the enrollment itself, not
  recalculated from the course's current `validity_months` later) actually holds. Failing the
  *plain* course's enrollment correctly left `certificate_expiry_date: null` — the expiry math only
  fires for `is_certification` courses, not unconditionally on every `COMPLETED`/`FAILED` outcome.
  The expiring-certifications report (365-day horizon) correctly surfaced only the one real
  completed certification (`days_left: 364`, `already_expired: false`) and correctly omitted both
  the cancelled duplicate enrollment and the failed non-certification enrollment. Both authorization
  boundaries (non-MGMT enrolling or cancelling *someone else's* enrollment) were correctly refused
  with `403`; recording an outcome is correctly MGMT-only even for one's own enrollment. Retiring
  both courses correctly removed them from the active catalogue while every enrollment row —
  completed, failed, and cancelled alike — stayed fully queryable and correctly attributed.
- **No bug found.**
- **Test-artifact handling:** enrollments have no hard-delete endpoint (matching the same
  no-hard-delete convention `hr-benefits.routes.ts` already established in HUD-0088) — all three
  real enrollments were left in a terminal state (`COMPLETED`, `FAILED`, `CANCELLED`), clearly
  attributable to `HUD-0090`; both courses left soft-deleted/retired. Usage counter restored to
  500/500 (temporarily lowered for this journey's metered `POST` creates, verified restored). No
  code changes this pass.

### HUD-0091 — Phase 5: NexusHR onboarding/offboarding checklist journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, fiftieth journey).
- **Trace:** `hr-checklists.routes.ts`/`hr-checklists.subscribers.ts` — the whole point of this
  feature is that per-person checklists are never created directly through this route file, only
  generated automatically by a subscriber reacting to real `user.joined`/`hr.staff_deactivated`
  domain events. Rather than testing the subscriber's logic in isolation, drove it through the
  actual production path end to end: set a real 4-item onboarding template → created a real
  `hr_invitations` row and accepted it through the genuinely public, unauthenticated
  `POST /auth/accept-invite` (the same endpoint every real new hire uses) → confirmed a real
  onboarding checklist was auto-generated with all 4 items copied correctly → checked items off one
  at a time, confirming the checklist stays `in_progress` through the first three and auto-completes
  (with a real `completed_at` stamp) only on the fourth → unchecked one item and confirmed the
  checklist auto-reopened (`completed_at` cleared) — a genuinely bidirectional status derivation, not
  a one-way completion flag. Then set a real 3-item offboarding template and deactivated the same
  employee through the actual `PATCH /v1/hr/staff/:id/status` endpoint (the real "someone left"
  action any admin takes), confirming a *second*, independent offboarding checklist was correctly
  auto-generated from the offboarding template — proving the subscriber correctly branches on event
  type/checklist type, not just on "any HR lifecycle event."
- **Result: every mechanism worked exactly as designed.** Checking off an item correctly attributed
  `done_by`/`done_at` to the real acting user (a `MANAGER`, not the employee), matching the file's
  own comment that a checklist can be worked by whoever's actually doing the onboarding tasks, not
  only the new hire. All not-found paths were already correctly built: an unset template returns a
  real empty list rather than a 404 (`{"type":"onboarding","items":[]}` — a template not yet created
  is a legitimate, common state, not an error); an unknown checklist type is a clean `400`; a
  nonexistent checklist or item is a clean `404` via `.executeTakeFirst()` (unlike HUD-0089's
  `consignments.routes.ts`, every id-lookup in this file already does this correctly). Cross-tenant
  isolation verified live with a real second tenant's JWT against this journey's own real checklist
  id: correctly refused `404`, not leaked. The whole file is correctly `MGMT`-only (no
  employee-self-service surface at all, by design — a `JUNIOR` and a `CUSTOMER` were both refused
  every route).
- **No bug found.**
- **Test-artifact handling:** both templates were reverted to empty items via the real
  `PUT /templates/:type` endpoint (symmetric with how they were created), restoring the tenant to
  its original "no template configured" state. The one real new-hire user
  (`c2317842-…`, "HUD-0091 New Hire") and both real checklists have no delete endpoint anywhere in
  the schema — left in place, already in a natural terminal state (`active: false`, one checklist
  `in_progress` with 3/4 items done, one `in_progress` with 0/3), clearly attributable by name. No
  code changes this pass.

### HUD-0092 — Phase 5: SEAL warehouse equipment & maintenance journey traced live · found and fixed a real MEDIUM bug (same family as HUD-0089)
- **Category:** Functional correctness (Phase 5, fifty-first journey).
- **Trace:** `seal-equipment.routes.ts` — warehouse plant/tooling maintenance tracking (forklifts,
  scanners, racking, reefer/HVAC), deliberately distinct from Tracking/Fleet's `vehicles`. Created
  three real equipment items with due dates 5 days out, 3 days overdue, and 90 days out → confirmed
  the derived `alert`/`daysUntilServiceDue` fields computed correctly for all three (`due_soon`,
  `overdue`, `null`) → set the overdue item to `out_of_service` and confirmed its alert switches to
  `out_of_service` regardless of its due date (the file's own documented override) → logged a real
  `repair` maintenance record resolving it back to `operational` with a new condition and due date →
  confirmed the equipment's own `status`/`condition`/`last_service_date`/`next_service_due_date` all
  updated atomically in the same transaction as the maintenance record insert, and the alert
  correctly cleared to `null`.
- **The golden path itself is clean and the derived-alert design is real.** All three alert states,
  the `out_of_service` override, and the maintenance-record-as-source-of-truth cascade (the parent
  row's watermarks are a cached projection of "the latest maintenance event," matching the file's
  own comment comparing it to `seal_lots.storage_billed_through`) all worked exactly as designed.
  `CUSTOMER` is correctly refused the whole surface.
- **Found and fixed a real MEDIUM bug, same class as HUD-0089's consignments finding.**
  `PATCH /equipment/:id` used `.executeTakeFirstOrThrow()`, so a wrong/stale/foreign id crashed with
  a raw `500 {"error":"no result"}` instead of a `404`. `POST /equipment/:id/maintenance` was worse:
  with no existence check on the equipment id before inserting, a bad id fell straight into the real
  FK constraint and crashed with a raw `500` that leaked the constraint's internal name
  (`seal_equipment_maintenance_records_equipment_id_fkey`) in the response body — both
  live-confirmed. Both queries already carried an explicit `.where('tenant_id', '=', ...)` clause
  (unlike HUD-0089's RLS-only-scoped tables), so this was purely a wrong-status-code/verbose-error
  bug, not a tenant-isolation gap. **Fixed** by switching the `PATCH` to `.executeTakeFirst()` with
  a `404` on a falsy result, and adding the same "check the reference exists before writing" guard
  to the maintenance-record insert (matching HUD-0084's and HUD-0089's established convention).
  Re-verified live: both original crashing reproductions now `404` cleanly with a real equipment id
  still working correctly for both routes afterward.
- **Test-artifact handling:** `seal_equipment` has no delete endpoint anywhere in the file — all
  three test items were retired (`status: 'retired'`, a real terminal status in the enum) rather
  than left `operational`, clearly labeled via their `HUD0092-*` asset tags. Usage counter restored
  to 500/500 (temporarily lowered for this journey's metered creates, verified restored). Full suite
  green (11 files/105 tests), `tsc`/`check:triggers` clean.

### HUD-0093 — Phase 5: SEAL zone-occupancy sensor/camera journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, fifty-second journey).
- **Trace:** `seal-sensors.routes.ts` — a real device registry + ingestion endpoint + live
  WebSocket broadcast, honestly built with no physical sensor wired up yet (per the file's own
  header comment). Registered a real occupancy sensor device → ingested a nonexistent `device_id`
  (correctly refused `404`, already built right — no fix needed here, unlike the sibling
  `seal-equipment.routes.ts` this same cluster's HUD-0092 fixed) → connected a real WebSocket client
  to `/ws` (authenticated the same way a browser would, via the `Authorization: Bearer` fallback
  `extractToken()` supports) → ingested three real readings **out of chronological order**
  (`recorded_at` 10:00, then 12:00, then 11:00) to specifically stress the "latest by timestamp, not
  by insertion order" claim.
- **Result: every real-time mechanism worked exactly as designed.** All three ingests correctly
  broadcast a real `seal.sensor_reading` WebSocket message to the connected client, tagged with the
  correct device/compartment/reading-type/value — genuinely live, not a stub. The "current reading"
  `DISTINCT ON` query correctly reported the *12:00* reading (value `7`) as latest, correctly
  ignoring that the *11:00* reading (value `5`) was physically inserted last — proving the ordering
  keys off `recorded_at`, not row-insertion order, exactly as the file's comment claims. The
  readings-history endpoint correctly returned all three in descending chronological order.
  `CUSTOMER` is correctly refused the whole surface.
- **No bug found.** Unlike its sibling `seal-equipment.routes.ts` (HUD-0092, same cluster, same
  session), this file's ingestion path already does the "check the device exists before writing"
  guard correctly and returns a clean `404` — a useful same-cluster contrast confirming the
  HUD-0092/HUD-0089 pattern isn't universal, just wherever `.executeTakeFirstOrThrow()` was used
  carelessly.
- **Test-artifact handling:** `seal_sensor_devices` has no delete/deactivate endpoint exposed in
  this file — the one real test device (`HUD0093-OCC1`) was left in place, clearly labeled, along
  with its three real readings. Usage counter restored to 500/500 (temporarily lowered for this
  journey's metered device-creation, verified restored). No code changes this pass.

### HUD-0094 — Phase 5: SEAL warehouse automation-rules journey traced live · found and fixed a real MEDIUM bug (third instance of the HUD-0089/HUD-0092 pattern)
- **Category:** Functional correctness (Phase 5, fifty-third journey).
- **Trace:** `seal-automation.routes.ts` — a small, purpose-built trigger→action table (explicitly
  not a third generic workflow engine, per the file's own header comment), fired only by a real
  on-demand "Run Automation Check" button, never a hidden background job. Created a real
  `low_stock`/`create_task` rule (threshold 5) and a real `seal_lots` fixture at `qty_on_hand: 3` →
  ran `POST /automation-rules/evaluate` and confirmed it correctly fired against **three** real
  qualifying lots in the tenant (my fixture plus two genuinely pre-existing low-stock lots — not
  narrowed to a made-up scenario) → independently confirmed one of the resulting `seal_tasks` rows
  directly against Postgres: correct title (`[Automation: HUD-0094 low stock alert] …`), correct
  `high` priority, correctly `NULL` assignee/compartment matching the rule's own unset fields → ran
  the exact same evaluation a second time immediately after and confirmed it correctly fired **zero**
  times, proving the `existingOpen` per-rule-per-subject dedup guard actually prevents duplicate
  tasks on a repeat click, not just in theory.
- **Result: the trigger/dedup mechanics are real and correct.** Deactivating the rule and any staff
  role (a `JUNIOR`, not just MGMT) being able to create/toggle a rule both matched this SEAL cluster's
  established "any non-CUSTOMER role" convention (same as HUD-0092/HUD-0093's siblings); `CUSTOMER`
  is correctly refused the whole surface.
- **Found and fixed a real MEDIUM bug — the third occurrence of the exact HUD-0089/HUD-0092 pattern
  in this same SEAL module.** `PATCH /automation-rules/:id` used `.executeTakeFirstOrThrow()`, so a
  wrong/stale/foreign id crashed with a raw `500 {"error":"no result"}` instead of a clean `404`,
  live-confirmed. **Fixed** by switching to `.executeTakeFirst()` with an explicit `404` on a falsy
  result, matching the same fix already applied to `consignments.routes.ts` and
  `seal-equipment.routes.ts`. Re-verified live: the original crashing reproduction now `404`s
  cleanly while the real rule's own `PATCH` still works. **Ran a platform-wide sweep rather than
  just recommending one.** A `grep` for `.where('id', '=', <url param>)…executeTakeFirstOrThrow()`
  across `apps/api/src/routes` surfaced roughly **30 files**, not a small tail — far more than the
  three this arc found journey-by-journey (consignments, SEAL equipment, SEAL automation).
  Spot-checking a sample shows most are *not* live bugs: `fixed-assets.routes.ts`,
  `task-projects.routes.ts`, and `vehicleDetail.routes.ts` all perform a real existence check
  (`executeTakeFirst()` returning a clean `404`, or a `resolveProjectAccess()` helper doing the
  same) immediately before the throwing call, so the "throw" branch is dead code in practice, not a
  reachable crash — materially different from HUD-0089/0092/0094's bare, unchecked update.
  Distinguishing the two requires reading each call site's surrounding handler, not just the grep
  hit itself, so this is correctly its own bounded Phase-5-style sweep for a future session, not a
  quick fix appended here — reported as a scoped, ready-to-start follow-up (`grep -rn ".where('id',
  '=', .*executeTakeFirstOrThrow" apps/api/src/routes`, then classify each hit as guarded vs
  unguarded) rather than an item this journey either fixes wholesale or dismisses as narrow.
- **Test-artifact handling:** the real rule and a stray probe rule (created while testing the
  any-staff-role RBAC boundary) were both fully removed via the real `DELETE` endpoint. The fixture
  `seal_lots` row, its one automation run, and its one auto-created task (all created by this
  journey) were removed via direct SQL, symmetric with the fixture's own SQL-based creation. The
  automation runs/tasks generated against the *other two, genuinely pre-existing* low-stock lots
  were deliberately left untouched — they are real automation output against real tenant data this
  journey did not create, not test debris. Usage counter restored to 500/500 (temporarily lowered
  for this journey's metered rule-creation, verified restored).

### HUD-0095 — Phase 5: AgencyHost managed-client onboarding + cross-agency isolation journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, fifty-fourth journey).
- **Trace:** `onsite-agency.routes.ts`/`onsite-agency-manage.routes.ts`/`agency-tenant.service.ts` —
  an agency tenant provisioning and day-to-day managing a genuinely independent client tenant's
  Onsite resources, without impersonation. Created a real new client tenant via
  `POST /v1/onsite/agency/clients` → independently confirmed against Postgres that all three
  expected rows exist and agree (`tenants` row with `plan: 'agency-managed'`, a real `PENDING`
  `hr_invitations` row for the client's future admin, an `active` `agency_managed_tenants`
  relationship row) → managed the new client end to end from the agency side: overview → created a
  domain (confirmed a DNS zone plus two real NS records auto-created) → added a real A record →
  attempted a deploy on the freshly-created application (honestly refused `409`, no CI provider
  connected for this brand-new tenant — not faked) → created a health check and ran it live
  (a genuine DNS resolution failure against the fictitious test domain, correctly stamped
  `status: critical` with a real error message and response time, not a canned success) → linked a
  billing customer in the *agency's own* books → detached the client.
- **The most important check — live cross-agency isolation, not assumed from the code's own
  tenant-pinning logic:** a genuinely different tenant's `TENANT_ADMIN` (not the agency that created
  this client) was correctly refused `404: "Client not found"` reaching the exact same client's
  overview — not a 403 that would confirm the client's existence, matching the middleware's own
  documented reasoning. That other tenant's own `GET /clients` list correctly showed only its own
  genuinely pre-existing managed client, never the HUD-0095 test client. After detaching, **the
  same agency that had just been managing this client also lost access** — `verifyAgencyClientAccess`
  correctly re-checks `status = 'active'` on every request, not just at attach time — and a second
  detach attempt on the now-inactive relationship correctly 404s too (idempotent, matching the
  file's own comment that "there's nothing to detach twice").
- **Also confirmed live:** `MANAGER` is correctly refused `/clients` (`SUPER_ADMIN`/`ADMIN`/
  `TENANT_ADMIN` only, an account-level action); a nonexistent application id at `/deploy` correctly
  404s (this file already does the "check exists first" guard right, unlike the SEAL-cluster bugs
  found earlier this arc). Self-caught a non-bug: an empty-path-segment URL (`//deploy`, from my own
  stale shell variable) produced a raw 500 — Fastify's own routing behavior for a malformed path,
  not this route's bug; re-tested with a well-formed nonexistent id and got the correct `404`.
- **No bug found.**
- **Test-artifact handling:** the new client tenant has no delete endpoint (tenants are never
  hard-deleted anywhere on this platform) — left in place, clearly labeled
  `HUD-0095 Test Client Co`, already detached from any agency and with a `PENDING` invitation nobody
  will ever accept. The linked billing customer (in the dev tenant's own books) was left in place,
  same label. Usage counter restored to 500/500 (temporarily lowered for this journey's metered
  tenant-creation, verified restored). No code changes this pass.

### HUD-0096 — Phase 5: HuduBI configurable widgets + cross-app entity resolution journey traced live · found and fixed a real LOW bug; a code-reading security hypothesis tested live and disproven
- **Category:** Functional correctness (Phase 5, fifty-fifth journey).
- **Trace:** `hudubi.routes.ts`'s two surfaces beyond the already-closed data-quality engine
  (HUD-0086): the configurable widget/report builder and the M5 cross-app semantic entity resolver.
  Fetched the real metric registry → previewed `customers_count` and independently confirmed it
  against a direct `SELECT count(*)` on Postgres (26, matching exactly) → saved a real widget →
  confirmed `GET /widgets/:id/data` returns the identical figure to the raw preview → renamed it and
  changed its chart type → deleted it. For entity resolution: resolved a real, genuinely
  pre-existing customer (from HUD-0083's own test data) and confirmed a real `client_id`-linked Sign
  envelope was correctly returned; resolved a second real customer with a real email set and
  confirmed a second, genuinely pre-existing `client_id` hit *plus* a newly-planted fuzzy-email-match
  envelope (no `client_id`, a `sign_recipients` row whose email matches the customer's own) — both
  correctly attributed with the exact right `matched_via` value and explanatory summary text.
- **Found and fixed a real LOW bug**: `updateWidget()` used `.executeTakeFirstOrThrow()`, so a
  wrong/stale widget id threw "no result" — but unlike the SEAL-cluster instances of this same
  pattern (HUD-0089/0092/0094), the route's catch block mapped *every* error to `400`, live-confirmed
  turning a legitimate not-found into a response that reads as "your request body was malformed"
  rather than "this widget doesn't exist" — a more actively misleading failure mode than a bare 500,
  even though the status code itself was less obviously wrong. **Fixed** by having `updateWidget()`
  throw the exact same `"Widget not found"` error `getWidgetData()` already throws, and having the
  route map that specific message to `404` — reusing a convention already correct elsewhere in the
  same file rather than inventing a new one. Re-verified live: the original reproduction now `404`s
  cleanly, a real widget's `PATCH` still works.
- **A code-reading security hypothesis was tested live and disproven, not reported on suspicion.**
  `resolveCustomerAcrossApps()` runs on `dbPlatform` (which bypasses RLS) and its fuzzy-email-match
  join only filters `sign_recipients.tenant_id`, never adding an explicit tenant clause on the
  joined `sign_envelopes` row — a pattern that looked, from reading the code alone, like it could
  leak a same-email match from a different tenant's envelope. Tested directly: planted a customer
  and a `sign_envelopes`/`sign_recipients` pair in a **genuinely different, real tenant** sharing the
  exact same email as this journey's own test customer, then confirmed the resolution correctly
  returned *only* the real customer's own two hits — the other tenant's identically-emailed envelope
  never appeared. Root cause of why this is actually safe: `sign_recipients.tenant_id` and its
  parent `sign_envelopes.tenant_id` are always the same value by construction (a recipient is never
  created against a different tenant's envelope anywhere in the codebase), so filtering the
  recipient row's own tenant_id is sufficient in practice even without a redundant filter on the
  join partner. Verified, not assumed — a genuine non-issue, matching this arc's established
  "hypothesis tested live, not reported on suspicion" discipline (see HUD-0062, HUD-0071).
- **Aside, not a bug:** the dev tenant's `growth` plan doesn't include `hudubi` — granted a temporary
  `tenant_settings.settings['enabled-apps']['hudubi'] = true` override (the same real per-tenant
  grant mechanism used in HUD-0089/HUD-0095) to exercise the surface, removed it afterward, confirmed
  the override map is back to `{}`.
- **Test-artifact handling:** the test widget was fully removed via the real `DELETE` endpoint; the
  planted fuzzy-match envelope/recipient and the other-tenant customer/envelope/recipient were
  cleaned up via direct SQL, symmetric with their SQL-based creation. Usage counter restored to
  500/500 (temporarily lowered for this journey's metered widget-creation, verified restored).
- **Separately noted, not investigated**: partway through this journey, `apps/api`'s `tsc --noEmit`
  started failing on `cms-content.routes.ts:154` (a required-vs-optional `key` field type mismatch).
  Confirmed via `git status` this file is untracked and was never touched by this session — it
  belongs to a different, concurrent session's own in-progress CMS feature work (also visible:
  `cms.routes.ts`/`cms.service.ts`/`packages/types/src/cms.ts` all modified, three new untracked
  migrations, several new untracked web files). Confirmed this session's own two changed files
  (`hudubi.routes.ts`, `hudubi-widgets.service.ts`) typecheck cleanly in isolation — the error is
  entirely contained to the concurrent session's own file. Left alone, matching the same
  cross-session-collision boundary already established at HUD-0074's `email.routes.ts` regression.

### HUD-0097 — Platform-wide sweep: unguarded `executeTakeFirstOrThrow()` on a URL id · found and fixed 47 real instances across 21 files (17 in the original single-line sweep, 30 more in an addendum pass)
- **Category:** Functional correctness / error-handling (the standing follow-up flagged in HUD-0094,
  now executed in full).
- **Trace:** `grep -rn ".where('id', '=', <url param or body field>)…executeTakeFirstOrThrow()"`
  across every file in `apps/api/src/routes` — the exact same "no prior existence check, so a
  wrong/stale/foreign id crashes instead of 404ing" pattern already found three times this arc
  (HUD-0089 consignments, HUD-0092 SEAL equipment, HUD-0094 SEAL automation) and once in a related
  400-mismapped form (HUD-0096 HuduBI widgets). The grep surfaced **~90 hits across ~40 files** —
  read every single one in its surrounding handler to classify **guarded** (an `executeTakeFirst()`
  existence check, or an equivalent helper like `resolveProjectAccess()`/`resolveTaskAccess()`,
  already ran against the exact same id moments earlier in the same handler/transaction, making the
  later `executeTakeFirstOrThrow()` unreachable-on-bad-id in practice) from **unguarded** (this is
  genuinely the first touch of that id, with nothing upstream to catch a miss).
- **Result: the overwhelming majority were already correct.** `hr.routes.ts` (15 hits — every
  requisition/offer/delete-request transition route), `task-projects.routes.ts` (7 hits, all behind
  `resolveProjectAccess()`), `security.routes.ts`, `bills.routes.ts`, `cit.routes.ts`,
  `financeExpenses.routes.ts`, `gl-periods.routes.ts`, `wht.routes.ts`, `vat-periods.routes.ts`,
  `files.routes.ts`, `invoices.routes.ts`, `products.routes.ts`, `contracts.routes.ts`,
  `dividends.routes.ts`, `fixed-assets.routes.ts`, `hr-training.routes.ts`, `sign.routes.ts`,
  `sign-stamps.routes.ts`, `sign-forensics.routes.ts`, `sms.routes.ts`, `seal.routes.ts`,
  `ondi.routes.ts`, `ap-approval-workflows.routes.ts`, `addons.routes.ts`,
  `contacts-sync.routes.ts`, `calls.routes.ts`, `tasks.routes.ts` — every one of these already does
  a real existence check (or the id demonstrably comes from a row just fetched/inserted moments
  earlier in the same transaction, e.g. `session.id`, `existing.id`, `row.id`) before the throwing
  call. This confirms the earlier HUD-0089/0092/0094 instances were genuine one-off mistakes in
  specific files, not a codebase-wide habit.
- **Found and fixed 17 real unguarded instances across 5 files, all live-reproduced before the fix
  and re-verified after:**
  - **`cargoLoading.routes.ts`** (4 routes) — `PATCH /manifests/:id`, `PATCH /manifests/:id/status`,
    `POST /manifests/:id/dispatch` all crashed on a bad manifest id; `POST
    /manifests/:id/import-shipment` both never checked the *manifest* existed and threw a bare
    `Error('Shipment not found')` with no `reply.status()` call for a bad *shipment* id (itself a
    second variant of "not found reported wrong"). Fixed all four; added a manifest-existence check
    to `import-shipment` and converted its shipment-not-found throw to a real `404`.
  - **`inventory-counts.routes.ts`** (3 routes) — `PATCH .../lines/:lineId`, `POST .../post`, `POST
    .../cancel` all crashed on a bad session id (and `.../lines/:lineId` also on a bad *line* id
    within a real session) with the local catch reporting it as `422` (implying a malformed
    request) instead of `404`. Fixed using this file's own pre-existing "return null from the trx,
    check outside it" convention (already used by the file's own `POST /count-sessions`).
  - **`seal-fulfillment.routes.ts`** (6 routes) — `POST .../pick` (both the order lookup and the
    pick-line lookup by `lineId`), `.../pack`, `.../dispatch`, `.../cancel`, and `PATCH
    /dispatch-requests/:id` all crashed on a bad id, again reported as `422`. Fixed all six.
  - **`support.routes.ts`** (2 routes) — `PATCH /rules/:id` and `PATCH /kb/articles/:id` both
    crashed on a bad id with no local catch at all, falling to the global error handler as a bare
    `500` (confirmed via `index.ts`'s own error handler: a Kysely `NoResultError` carries no
    Postgres `.code`/`.severity`, so the handler's driver-error sanitizer doesn't recognize it and
    falls through to `reply.send(error)`).
  - **`vehicleDetail.routes.ts`** (2 routes) — `PATCH /issues/:id` and `PATCH /issues/:id/resolve`
    likewise crashed with no local catch and reached the global handler as a bare `500`; neither
    handler even accepted a `reply` parameter, requiring that to be added as part of the fix.
  - Every fix follows the same shape established at HUD-0089: switch the throwing call to
    `.executeTakeFirst()`, check the result, return a real `404` with a specific message. All 17
    were re-verified live post-fix — every original crashing reproduction (a well-formed but
    nonexistent UUID) now returns a clean `404`, and a real, valid id still succeeds on every fixed
    route.
- **Test-artifact handling:** no persistent test data was created — every reproduction used a
  synthetic, well-formed nonexistent UUID (`00000000-…-000099`) against the dev tenant, which by
  construction never matches a real row and needs no cleanup. Two temporary entitlement overrides
  (`tracking.cargo-loading`, granted to reach `cargoLoading.routes.ts`) and one temporary usage
  counter lowering (for the metered `POST`s exercised) were both reverted/restored and verified.
  Full suite green (11 files/105 tests), `check:triggers` OK; `tsc --noEmit` clean on all five
  changed files (the two remaining errors are entirely contained in
  `cms-content.routes.ts`/`cms-content.service.ts`, both untracked files belonging to a different,
  concurrent session's own in-progress work — see this file's "Production build" row).

**Addendum — the original sweep's grep had a blind spot, found by hand and closed in full.**
While live-tracing `seal-warehouse-ops.routes.ts` as the next Phase 5 journey (unrelated to
HUD-0097), found two more crashing routes (`PATCH /containers/:id/yard-slot`,
`PATCH /containers/:id/vehicle`) that the original grep never matched — because the pattern
required `.where('id', '=', …)` and `executeTakeFirstOrThrow()` to appear **on the same line**, and
these call sites (like many in this codebase) wrap the chain across two lines. Re-ran the sweep with
a multi-line-aware pattern (`grep -Pzo` / a multiline regex spanning a newline) across
`apps/api/src/routes` and got **33 files**, not 5 — most already covered by the first pass's own
files (re-confirming those were already correctly classified) but **16 new files** the single-line
grep had silently skipped. Read every hit in its file, classified guarded vs unguarded exactly as
before, and found **30 more real unguarded instances**:
- **`fleetOps.routes.ts`** (5 routes) — `PATCH /drivers/:id`, `/vendors/:id`, `/trips/:id` (only
  reachable when the patch body doesn't include `status: 'IN_PROGRESS'` — that branch alone had its
  own real guard), `/maintenance/:id`, `/parts/:id`.
- **`warehouse.routes.ts`** (4 routes) — `PATCH /warehouse/locations/:id` and all three dock-
  appointment transitions (`check-in`/`complete`/`cancel`) — the same file HUD-0089's own journey
  had already traced the *happy path* of live, but never the not-found case for these specific
  routes.
- **`fleetCompliance.routes.ts`** (3 routes) — documents, reminders, `alerts/:id/acknowledge`.
- **`trailers.routes.ts`** (3 routes) — transporters, trailers, trailer-documents.
- **`seal-warehouse-ops.routes.ts`** (2 routes) — the two that started this addendum.
- **`tracking.routes.ts`** (2 routes) — vehicles, geofences.
- **`inventory-catalog.routes.ts`** (2 routes) — warehouses, items.
- **`org-chart.routes.ts`**, **`quotations.routes.ts`**, **`seal-examinations.routes.ts`**,
  **`seal-documents.routes.ts`**, **`inventory-tasks.routes.ts`**, **`seal-tasks.routes.ts`**,
  **`drives.routes.ts`** (1 route each, the last reported as a misleading `400` from its own local
  catch, same shape as HUD-0096).
- **`billing.routes.ts`** (`PATCH /payment-methods/:id/default`) — worse than the others: this
  route unconditionally clears every payment method's `is_default` flag *first*, then sets the new
  one — so a bad id used to crash *after* that first write had already committed, live-confirmed to
  leave the tenant with **no default payment method at all**, not just a bad response. Fixed by
  checking existence before touching any row, not just before the second write.
- **`superadmin.routes.ts`** (`PATCH /tenants/:id`) — genuinely fetched a `before` row for its own
  later plan-change-pruning logic but never checked it was non-null before proceeding to update.
- All 24 of the newly-fixed routes with a reachable non-SUPER_ADMIN path were re-verified live
  post-fix (the remaining 6 are thin siblings of an already-verified pattern in the same file);
  `superadmin.routes.ts`'s fix was verified with a real platform `SUPER_ADMIN` account. Two real
  records (`vehicles`, `drivers`) were also re-PATCHed with valid ids afterward to confirm the happy
  path was untouched by the fix.
- **Test-artifact handling:** same as the original sweep — every reproduction used a synthetic
  nonexistent UUID needing no cleanup. Temporary entitlement overrides for `tracking.warehouse`,
  `tracking.cargo-loading`, `seal`, and `crm` were granted to reach the gated files and fully
  reverted afterward. `tsc --noEmit` clean on all 16 newly-changed files (same two pre-existing
  concurrent-session CMS errors, unrelated); full suite green (11/105); `check:triggers` OK.
- **HUD-0097 total, both passes combined: 47 real "crash instead of 404" bugs found and fixed
  across 21 files** — the single largest fix count of any entry in this audit arc. The lesson this
  addendum itself demonstrates: a grep-based sweep's completeness is only as good as its pattern's
  tolerance for how the codebase actually formats a call chain — worth remembering before treating
  any future single-pattern sweep's "done" as final without a second pass with a structurally
  different pattern.

### HUD-0136 — Phase 5 follow-up: Developer Platform fabricated-verification-data + broken usage-metering (`developer-gateway.service.ts`, `developer.routes.ts`) — closing HUD-0117's two documented-not-fixed findings · Fixed: usage-metering now genuinely records (real root cause found), landed-cost is now the real engine, seal issue/verify is now genuinely persisted, BRELA lookups reuse ComplyOS's real live scraper honestly
- **Category:** Functional correctness + honesty-of-product-behavior (Phase 5 follow-up, user-directed). HUD-0117 found and deliberately left unfixed a HIGH "every native/external gateway operation is a hardcoded, input-independent fabricated response" finding and a MEDIUM "usage events silently never get recorded" finding, both flagged as needing either a real product-scope build (BRELA/ECDSA) or console access this session didn't have to root-cause the metering failure. Revisited on the user's explicit instruction; this pass had what the original didn't — a genuinely isolated instance with its own captured console log — so the metering bug is now root-caused live, not just reproduced.
- **Root-caused the usage-metering failure, live, with real console capture:** minted a real developer account/project/sandbox credential via direct SQL, started a second, isolated API instance (a different `APP_PORT`, its stdout piped to a file — the missing piece the original investigation lacked), and called the real gateway endpoint. The swallowed error was a genuine Postgres FK violation: `insert or update on table "dev_usage_events" violates foreign key constraint "dev_usage_events_provider_id_fkey"`. Root cause: `resolveOperation()`'s provider query does `selectAll('api_operation_providers').select(['api_providers.code as provider_code', ...])` — `selectAll()` on the join table pulls in *that table's own* primary key as `.id`, a completely different row from the real provider, sitting right alongside the real FK column, `.provider_id`. `recordUsage()` read `params.provider?.id` — the wrong id — for both `dev_usage_events.provider_id` and `dev_provider_settlements.provider_id`, so *every single gateway call, for every operation, native or external*, silently failed to record usage from the day this shipped.
- **Fixed the metering bug:** both `recordUsage()` call sites now read `params.provider?.provider_id`. Also fixed a related, milder symptom of the same ambiguity — `executeExternalAdapter`'s "Upstream Provider" fallback (`provider?.name`) could never resolve either, since `api_providers.name` was never selected under that alias; added `'api_providers.name as provider_name'` to the query and updated the one reader. **Re-verified live**: a native call (`seal.verify`) now creates a real `dev_usage_events` row with the correct real provider id; an external call (`business.verify`) now creates both a `dev_usage_events` row *and* a `dev_provider_settlements` row that correctly joins to the real `brela_gov_adapter` provider (previously impossible — the settlement insert never even ran, since the usage-event insert always threw first).
- **Fixed `landed_cost.compute` for real** (closing half of the fabricated-data finding): replaced the hardcoded 25%-duty/18%-VAT assumption with a real call to `seal-duty.service.ts`'s `computeDuty()` — the same HS-code-driven EAC CET engine ClearOS's own landed-cost pages and SEAL's bonded-warehouse duty computation already use, hand-verified to the shilling earlier in this same audit arc (HUD-0046). A missing or unrecognized `hs_code` now correctly 400s instead of silently substituting a fake default — added `HsCodeNotFound`-aware status-code handling to the gateway route (a caller-input problem is a 4xx, not a 500). **Re-tested live**: the same HS code (`8703.23.90`) now returns real, code-specific RDL (2%) and CPF (1%) line items the old hardcoded version never had at all, not just a recomputed version of the same fake numbers; a bogus HS code now correctly 400s with `HsCodeNotFound`'s real message instead of a fabricated answer.
- **Fixed `seal.issue`/`seal.verify` with real, minimal persistence** (closing another slice of the fabricated-data finding, without attempting the "real ECDSA PKI" full build the original finding correctly scoped as out of reach): added `dev_issued_seals` (migration 487) — `seal.issue` now computes a genuine SHA-256 digest of the submitted body and persists it; `seal.verify` now does a real lookup and digest comparison instead of unconditionally returning `valid:true`. Deliberately dropped two claims that were never backed by anything: the fabricated `algorithm: 'ECDSA_SHA256_P256'` (no real asymmetric keypair infrastructure exists) and the fabricated `verification_url` (no real public verify page exists for this product) — an honest smaller response beats a bigger fake one. **Re-tested live**, all four cases: a real issued seal + its correct digest → `valid:true, EXACT_MATCH`; the same seal + a wrong digest → `valid:false, DIGEST_MISMATCH`; a nonexistent seal id → `valid:false, NOT_FOUND` (previously: `valid:true` for all three).
- **Fixed `business.search`/`business.verify` honestly** (the one piece of the fabricated-data finding that genuinely cannot be made fully real — there is no live BRELA API credential anywhere in this codebase, confirmed by grep): discovered ComplyOS already has a real, live BRELA ORS portal scraper (`comply.routes.ts`'s `/brela-search` — a genuine best-effort HTTP call to `ors.brela.go.tz`'s own public search endpoint, with an honestly-disclosed WAF-blocked-most-of-the-time caveat already in its own header comment) that this session's earlier fabricated-data trace never found. Extracted its scraping logic into a new shared `services/brela.service.ts` (`searchBrelaLive`) so there is one real implementation instead of a second, fake one; `comply.routes.ts` itself now calls the shared function with zero behavior change (re-verified: still logs to `comply_brela_search_history` exactly as before). Wired both gateway operations to it: `business.search` now returns genuinely live BRELA results when the portal is reachable, and an honest `live:false, results:[]` with an explanatory note when it isn't — never a fabricated single result. `business.verify` now reports only what BRELA's public search can actually confirm (registration number, legal name, status, address, type, incorporation date) and honestly nulls out `tin`/`directors`/`vat_registered`/`issued_share_capital_tzs` with an explanatory note, instead of inventing "John A. Temba" and a TIN for every input. **Re-tested live** against the real portal (which, as expected — matching ComplyOS's own documented experience — was WAF-blocked from this environment): both operations correctly returned `live:false`/`verified:false` with an honest explanation, never a plausible-looking fake answer, for a garbage registration number and company name that don't exist.
- **Test-artifact handling:** the test developer account was deleted via the database, cascading (confirmed) through its project, credentials, usage events, and issued seals — zero orphaned rows. `tsc --noEmit` clean. Full API vitest suite green (187/187 tests, 13/13 files — +7 from a concurrent session's own unrelated work). `check:triggers` OK (same pre-existing, unrelated concurrent-CMS-session warnings this arc has flagged repeatedly). Isolated test API instance (a different `APP_PORT`, its own console log captured to a file — the exact missing piece from HUD-0117's original trace) used for the exploit-and-fix cycle and torn down afterward; shared dev server on port 3001 confirmed untouched and healthy throughout.

### HUD-0135 — Phase 5 follow-up: Inventory receipts/count-corrections never post to the GL (`inventory.service.ts`) — closing HUD-0054's documented-not-fixed MEDIUM-HIGH finding · Fixed: two new GL accounts, all four value-changing movement types now post
- **Category:** Functional correctness / cross-app financial wiring (Phase 5 follow-up, user-directed). HUD-0054 found and left unfixed a real accounting-completeness gap — `InventoryService.recordMovement` only ever touched the GL on the `issue` branch; `receipt` and `adjust`/`count_correction` changed quantity/cost with zero GL effect, silently misstating the balance sheet for any tenant using both Inventory and FinOps together. Left undecided because closing it needed new GL accounts this trace couldn't introduce unilaterally (what should a receipt credit before its bill arrives; what should a physical stock loss debit). Revisited on the user's explicit instruction to make that design call and wire it.
- **Design decision + fix — two new accounts** (migration 486, added to `gl.service.ts`'s `STANDARD_COA` for new tenants and backfilled to all 9 existing tenants the same way migration 216 backfilled `5900`): `2050` Goods Received Not Invoiced (GRNI) — a receipt physically arrives before the supplier's bill does, so it is a real clearing liability, not yet a real Accounts Payable line; `5011` Inventory Shrinkage/Write-off — one account for both directions of a physical count correction (a shortage debits it, an overage credits it), the same single-net-line convention `5202` Foreign Exchange Gain/(Loss) already uses for a gain/loss pair.
- **Fix — `recordMovement`:** `receipt` now posts `DR 1300 Inventory / CR 2050 GRNI` at the received quantity × unit cost; `adjust`/`count_correction` now post `DR 5011 / CR 1300` for a shortage (`qty_delta < 0`) or the mirrored `DR 1300 / CR 5011` for an overage, at the item's standing weighted-average cost (unchanged by the correction itself, matching the pre-existing "a correction doesn't move the average" comment). `issue`'s pre-existing COGS posting is untouched. `transfer` still never posts — it moves location, not value. Also populated `inventory_movements.total_cost` for `receipt`/`adjust`/`count_correction` (previously only ever set for `issue`), so the ledger row itself now carries the same cost-impact figure the GL entry does, for every movement type that has one.
- **Deliberately still not fixed, and said so in the code:** Purchase Orders still never call into `InventoryService` at all — marking a PO "Received" has zero effect on stock or the GL, the only way stock enters this ledger is a manual movement through Inventory itself. Whether a PO receipt should auto-create a movement, and whether that needs a match-to-bill step before GRNI clears to `2000`, is a real product decision this fix doesn't make unilaterally — same standing rule as every other design-level gap in this arc, now stated explicitly in `inventory.service.ts`'s own header comment so the next session doesn't have to re-discover it.
- **Re-verified:** `tsc --noEmit` clean; migration ran clean against the dev database and confirmed both accounts landed on all 9 existing tenants (`chart_of_accounts` query, not just the migration's own success message). Not re-run through a full live create-receipt-then-check-account-balance reproduction this pass (HUD-0054's own trace already did that exact reproduction manually and it's the reason the gap was found) — the sanity suite (vitest 187/187, `check:triggers` OK) covers regression.

### HUD-0134 — Phase 5 follow-up: Supplier "blocked" status had zero enforcement anywhere (`bills.routes.ts`, `purchase-orders.routes.ts`, `recurring-documents.service.ts`) — closing HUD-0077's documented-not-fixed MEDIUM finding · Fixed: blocked suppliers can no longer be billed or ordered from, checked before any write per this codebase's own established "validate before insert" convention
- **Category:** Functional correctness (Phase 5 follow-up, user-directed). HUD-0077 found and live-confirmed a real MEDIUM gap — a supplier's `blocked` status was set and read only inside `suppliers.routes.ts` itself; a blocked test supplier could still be billed 500,000 TZS with a real GL entry and zero warning. Left undecided because whether blocking should hard-refuse, only warn, or require an override-with-reason is a product decision. Revisited on the user's explicit instruction; chose hard-refuse, matching how every other "should this action be possible at all" guard in this codebase behaves (not a soft warning a caller can silently ignore).
- **Fix:** added the same guard at every real point a blocked supplier could be committed to a new transaction: `POST /v1/bills` and `POST /v1/purchase-orders` (checked before any write, mirroring this file's own existing "an early 400 from inside `withTenant` still commits the transaction, so validate first" rule); `PATCH /v1/bills/:id` (checked only when the edit actually changes the supplier or is the specific edit that posts the bill for the first time, using the bill's effective post-edit supplier/status — an existing DRAFT bill against a since-blocked supplier can still be saved/edited without tripping this on every unrelated field change); and `generateDueBills` in `recurring-documents.service.ts` (this one runs unattended from the daily job with no human to notice a blocked supplier, so it *skips* the due template with `reason: 'supplier is blocked'` rather than erroring the whole batch). Every guard returns the supplier's own `notes` field in the refusal message when set, since there is no dedicated `blocked_reason` column.
- **Live-verified end to end** against the shared dev server with a real supplier: created active → blocked it with a note ("fraud investigation in progress") → a new bill against it correctly 400s with that exact note in the message → a new purchase order against it correctly 400s the same way → reactivated it → the identical bill payload now correctly succeeds (`201`), confirming zero regression to the legitimate path.
- **Deliberately left alone:** `POST /:id/payment` (paying down an *existing* bill) — refusing to pay a supplier you already owe money to over an unrelated dispute would be the wrong call, not a safety improvement; only *new* commitments are blocked.
- **Test-artifact handling:** the test bill created against the reactivated supplier and the test supplier itself were both removed via the real API (`DELETE`). `tsc --noEmit` clean; full suite green (187/187, 13/13 files); `check:triggers` OK. Shared dev server (port 3001) used directly, confirmed healthy throughout.

### HUD-0133 — Phase 5 follow-up: Ondi `/org/roles*`'s dead `SUPER_ADMIN` bypass (`ondi.routes.ts`) — closing HUD-0066's documented-not-fixed LOW finding · Fixed: added `SUPER_ADMIN` to all 5 routes' `requireRole`, matching every sibling section in the same file
- **Category:** Authorization consistency (Phase 5 follow-up, user-directed). HUD-0066 found a real inconsistency: all five `/org/roles*` routes gate `requireRole('ADMIN', 'TENANT_ADMIN')`, excluding `SUPER_ADMIN` — but the add-member handler's own logic explicitly checks `user.role !== 'SUPER_ADMIN'` before enforcing a plan gate, a bypass clearly written assuming `SUPER_ADMIN` *would* reach that handler, which it never could. Confirmed live at the time (`403` for a `SUPER_ADMIN` JWT). Left undecided since it's an authorization-surface decision, not a value bug — but flagged as narrowly scoped.
- **Fix:** added `'SUPER_ADMIN'` to `requireRole(...)` on all 5 routes (`GET /org/roles`, `POST /org/roles`, `DELETE /org/roles/:id`, `POST /org/roles/:id/members`, `DELETE /org/roles/:id/members/:userId`) — matching the sibling `/org/groups*` section a few hundred lines below in the exact same file, which already includes `SUPER_ADMIN` via `requireRoleOrOrgPermission(...)`. This makes the existing dead bypass code reachable exactly as it reads, rather than writing new logic. Scoping note: a `SUPER_ADMIN`'s own `user.tenant_id` still gates every query inside the handlers via `withTenant()`, same as `/org/groups*` — this grants a platform `SUPER_ADMIN` the same in-tenant role-administration access an `ADMIN`/`TENANT_ADMIN` already has for their own account's tenant, not cross-tenant reach into any other tenant's roles.
- **Re-tested live:** a real `SUPER_ADMIN` JWT now gets a clean `200` from `GET /v1/ondi/org/roles` (previously `403`).
- **Test-artifact handling:** no data created — a read-only re-test of the exact previously-403ing call. `tsc --noEmit` clean; full suite green; `check:triggers` OK.

### HUD-0132 — Phase 5 follow-up: Demurrage `liable_party`/`liability_reason`/`WAIVED` completely unreachable (`demurrage.service.ts`) — closing HUD-0057's documented-not-fixed MEDIUM-HIGH finding · Fixed: wired through `updateContainer`'s whitelist with validation and a financial-immutability guard
- **Category:** Functional correctness (Phase 5 follow-up, user-directed). HUD-0057 found the column, the CHECK constraint, and the entire downstream GL/recharge logic already existed and were already correct — the only missing piece was exposing them through `updateContainer`'s whitelist, flagged explicitly as the lowest-risk, best-scoped candidate in this batch of findings ("just needs the existing column wired through the existing PATCH endpoint").
- **Fix:** `updateContainer` now accepts `liable_party` (`'CUSTOMER' | 'COMPANY'`), `liability_reason`, and `status` (`'ACTIVE' | 'COMPLETED' | 'WAIVED'`), each validated against its real allowed values (a bad value throws a clean `400` via `Object.assign(new Error(...), {statusCode: 400})`, this codebase's established convention). Added a guard neither HUD-0057 nor the original schema anticipated needing until this fix made the columns writable: once a charge has actually been posted to the GL (`cost-posting.service.ts`'s own idempotency check against `journal_entries`), changing liability or waiving it is refused with a clear message — the liability call has already been booked into a real journal entry, and changing it after the fact would desync the container's own record from what was actually debited, the same "financial immutability once posted" rule this arc already applies to invoices and bills.
- **Live-verified end to end**, the exact original reproduction plus the new guard: created a real tariff + container (12 days late, 5 free days → 550 TZS at $50/$100 tiers, matching HUD-0057's own hand-verified math) → `PATCH` with `liable_party: "COMPANY"`, a `liability_reason`, and `status: "WAIVED"` now genuinely persists all three (previously silently dropped, still `CUSTOMER`/`ACTIVE` in the response) → an invalid `liable_party` and an invalid `status` both correctly `400` → reset to `CUSTOMER`/`ACTIVE` → posted to the GL for real (`POST /v1/finance/post-costs/demurrage`, a genuine 550 TZS receivable entry) → a further attempt to change `liable_party` now correctly `400`s ("already been posted to the ledger").
- **Test-artifact handling:** the test tariff was removed via the real `DELETE`. The container now carries a real posted journal entry (same reasoning HUD-0057 itself already established for not force-deleting a referenced container) — left in place, clearly labeled `HUD0057VERIFY2`. `tsc --noEmit` clean; full suite green (187/187, 13/13 files); `check:triggers` OK. Shared dev server (port 3001) used directly, confirmed healthy throughout.

### HUD-0131 — Phase 5 follow-up: Calendar guest-invite visibility gap (`calendar-events.service.ts`, `tasks.routes.ts`, `calendarStore.ts`, `CalendarApp.tsx`) — closing HUD-0124's documented-not-fixed HIGH finding · Fixed: guest-visible events now appear on the invitee's own calendar and free/busy, plus a real accept/decline endpoint
- **Category:** Functional correctness (Phase 5 follow-up, user-directed). HUD-0124 found and deliberately
  left unfixed a real gap: every Calendar query in `calendar-events.service.ts` was scoped strictly to
  `user_id = caller`, so a guest invited to someone else's event got a notification whose own `link`
  pointed at `/calendar` but the event itself never appeared there, never counted toward that guest's
  free/busy, and could never be accepted or declined (the `guests[].status` field existed but nothing
  could ever write to it). Revisited on the user's explicit instruction to close out Calendar's
  remaining gap rather than leave it as a permanent documented exception.
- **Fix — backend (`calendar-events.service.ts`):** Added `ownerOrGuestFilter(userId)`, a
  `.where(eb => eb.or([...]))` clause matching either the `user_id` column or a JSONB containment check
  (`guests @> '[{"userId":"..."}]'`, the same containment-operator convention already used in
  `onsite-agency-directory.routes.ts`), and applied it to both `listEvents` and `getFreeBusy` in place of
  the old owner-only equality check. Threaded a `callerId` through `computeOccurrencesInRange`/
  `mapOccurrence` so every returned occurrence now carries `is_organizer` (false when the row is only
  visible because the caller is a guest) and `my_rsvp_status` (the caller's own `guests[]` entry status,
  null for the organizer). `getFreeBusy` additionally filters out any occurrence the target user has
  personally declined — a declined invite no longer blocks that person's own free/busy, matching how
  workplace calendars treat a declined meeting versus an organized or still-pending one. Added
  `respondToInvite(tenantId, userId, id, status)` — the one write a non-organizer may make on someone
  else's event: loads the master row, confirms the caller actually has a `guests[].userId` entry
  (`EventForbiddenError` if not — an uninvolved user can't RSVP to an event they were never invited to),
  then replaces that one guest's `status` and re-saves the whole array, mirroring `updateEvent`'s own
  existing whole-array-replace convention for the guest list rather than inventing a new per-element
  update path. `updateEvent`/`deleteEvent` were deliberately left untouched — both already scope their
  `WHERE` to `user_id = userId`, so a guest who can now *see* an event they don't organize still can't
  edit or delete it; extending visibility didn't need to extend write access.
- **Fix — route (`tasks.routes.ts`):** Added `PATCH /events/:id/rsvp` (`{status: 'accepted'|'declined'}`),
  mapping `EventNotFoundError` → 404 and the new `EventForbiddenError` → 403, following the exact
  try/catch shape every other event-mutation route in this file already uses.
- **Fix — frontend (`calendarStore.ts`, `CalendarApp.tsx`):** Added `isOrganizer`/`myRsvpStatus` to the
  `CalendarEvent` type (mirroring `Todo.isOwner`'s existing boolean-flag convention) and to
  `fromApiEvent`'s mapping; added `respondToInvite(id, status)`, an optimistic-update mutator matching
  every other mutator in the store (`reportSyncFailure` on a failed persist, no local rollback needed
  since RSVP status is a small, safely-retryable field). In `CalendarApp.tsx`: gated the event-click
  popover's footer so a guest-visible event shows Accept/Decline buttons (or its current
  Accepted/Declined status) instead of an Edit link that would have opened the full edit modal only to
  fail on save (`updateEvent` is still organizer-only server-side); gated drag-to-reschedule and
  drag-to-resize the same way `holiday` synthetic rows already were (`if (!ev.isOrganizer) return`), so
  a guest can no longer start a reschedule drag that would silently fail after the fact; changed the
  cursor from `grab` to `pointer` and hid the resize-handle strip on a guest-visible event across all
  three calendar-grid views (month/week/day) as the matching visual cue.
- **Live-tested end-to-end** against an isolated second API instance (a different `APP_PORT`, shared dev
  server on 3001 left untouched) with two real users in the same tenant (`junior@msomi.co` as organizer,
  `admin@msomi.co` as guest, `sales@msomi.co` as an uninvolved third party): organizer creates an event
  inviting the guest → guest's own `GET /events` now returns it with `is_organizer: false,
  my_rsvp_status: 'pending'` → organizer's own listing still shows `is_organizer: true` → the uninvolved
  third party's listing correctly does **not** include it → `GET /events/freebusy` for the guest shows
  the real busy block → the uninvolved third party's RSVP attempt correctly 403s
  ("You are not invited to this event.") → the guest's attempt at a full `PATCH /events/:id` edit
  correctly 404s (still organizer-only) → the guest accepts via the new RSVP endpoint, re-listing
  confirms `my_rsvp_status: 'accepted'` → the guest then declines, and the freebusy block for that user
  correctly disappears → cleanup delete by the organizer succeeds and the guest's listing no longer
  contains the event. All 10 assertions passed on the first run.
- **Test-artifact handling:** the one real event created for the live test was deleted via the real API
  (`DELETE /events/:id`) as the final step of the test script itself, confirmed gone from the guest's own
  listing afterward; no direct database cleanup needed. `tsc --noEmit` clean on both `apps/api` and
  `apps/web`. Full API vitest suite green (180/180 tests, 13/13 files). `check:triggers` OK (same
  pre-existing, unrelated concurrent-CMS-session `page.${action}`/`post.${action}`/`entry.${action}`
  warnings this arc has already flagged as not this session's concern). Isolated test API instance (a
  different `APP_PORT`) used for the exploit/fix cycle and torn down afterward; shared dev server on
  port 3001 confirmed untouched throughout.

### HUD-0130 — Phase 5: CMS Forms + a systemic sweep of the whole new CMS codebase for the HUD-0097 bug class (`cms-forms.routes.ts`/`.service.ts`, plus `cms-content.service.ts` and `cms-webhooks.service.ts`) traced live and adversarially · Found+fixed 7 real crash/leak-instead-of-404 bugs across 3 service files — the widest single-pass instance of this bug class in the arc
- **Category:** Functional correctness + information disclosure (Phase 5, eighty-sixth journey). Forms —
  a tenant defines a form's field shape once, a real `form` block places it publicly, and a visitor's
  submission is validated server-side against that exact shape (honeypot-guarded, only declared field
  keys ever read or stored, notify-email HTML properly entity-escaped before interpolation). Chosen as
  the next CMS surface specifically for its genuinely public `POST /public/:tenantSlug/forms/:formKey/
  submit` endpoint. While confirming the platform's global rate-limit plugin and its new global
  driver-error-sanitizing handler (`index.ts`'s `setErrorHandler`, itself a recent addition) actually
  cover this route, noticed that plugin only sanitizes *uncaught* errors — any route with its own local
  `catch (err: any) { return reply.status(400).send({ error: err.message }) }` bypasses it entirely by
  forwarding `err.message` directly. Given HUD-0127 (HuduBI) had already found this exact shape once,
  and this "local catch re-leaks the raw error" pattern is used almost universally across every CMS
  route file, this pass deliberately widened from "trace Forms" to "sweep every new CMS service file for
  this pattern" rather than stopping at the one surface.
- **Trace:** Grepped all 7 new CMS service files for unguarded `executeTakeFirstOrThrow()`, then read
  each call site's context to separate genuine bugs from the transitively-safe ones this arc has always
  distinguished (a plain `INSERT...RETURNING`, a `COUNT(*)` aggregate that always returns a row, or a
  by-id `GET` route whose route already catches every error generically as a clean 404 with no message
  forwarded). Of 21 raw hits, found 7 real, reachable, message-leaking ones — every single-resource
  `PATCH` route across three files, and the one place a caller-supplied id feeds a live outbound HTTP
  call: `updateForm` (`cms-forms.service.ts`), `updateModel`/`updateField`/`updateEntry`/
  `updateComponent` (`cms-content.service.ts`), and `CMSWebhooksService.update`/`sendTest`
  (`cms-webhooks.service.ts`). **Live-reproduced 4 of the 7 before writing any fix** (a nonexistent form,
  content-model, webhook, and webhook-test all returned Kysely's own raw `{"error":"no result"}` at
  `HTTP 400`), then treated the remaining 3 as confirmed by the identical code shape rather than
  re-proving an already-established pattern a 5th/6th/7th time.
- **Fixed** all 7 by replacing `executeTakeFirstOrThrow()` with `executeTakeFirst()` plus an explicit
  `if (!row) throw new Error('X not found.')`, then extending each file's own existing error-mapping
  convention to recognize it: `cms-forms.routes.ts` and `cms-content.routes.ts` each already had a
  shared `handleError()` helper, extended with one generic check (`err.message.endsWith('not found.')`
  → 404) rather than one exact-string check per resource type — safe because neither file's own
  `ValidationError`/`FormValidationError` messages ever end that way; the two webhook routes (no shared
  helper) got the same exact-string check HUD-0096 already established for `hudubi-widgets.service.ts`.
  Re-verified live: all 7 reproductions now return a clean, resource-specific 404 (`"Form not found."`,
  `"Model not found."`, `"Field not found."`, `"Entry not found."`, `"Component not found."`,
  `"Webhook not found."` ×2), and a fresh create-then-patch round-trip on all 6 resource types (plus a
  genuine webhook test — a real outbound POST to `https://example.com`, correctly getting back a real
  `405` from that real server) confirmed zero regression to the legitimate path.
- **Test-artifact handling:** one real form, content model (with a field and an entry), component, and
  webhook created while exercising every fixed route were removed directly via the database afterward.
  `tsc --noEmit` clean; full suite green (166/166 tests, 12/12 files — test count grew during this pass
  from the concurrent CMS session's own ongoing work, unrelated); `check:triggers` OK (same unrelated
  concurrent-CMS-session warnings). Shared dev server used directly throughout, confirmed healthy.

### HUD-0129 — Phase 5: CMS Content Model Builder (`cms-content.routes.ts`/`cms-content.service.ts`/`cms-capabilities.service.ts` — no-code content types, typed/relation/computed fields, public dynamic templates, per-role capability matrix) traced live and adversarially · CLEAN (no finding)
- **Category:** Security (Phase 5, eighty-fifth journey). The no-code Content Model Builder — a tenant
  defines its own content type (Product, Employee, Event) with typed fields including a `relation` field
  type that names another model as its target and a `computed` field that evaluates a formula against
  sibling values — plus a genuinely public, unauthenticated dynamic-template route
  (`/public/:tenantSlug/m/:modelKey/:entrySlug`) and a custom per-role capability matrix (§74) gating
  view/manage/publish separately per CMS area. Never traced this arc as its own security-focused pass
  (only exercised functionally in earlier CMS-development passes). Chosen specifically because a
  dynamic, user-defined schema system with a real foreign-key-like `relation` field is exactly the shape
  of feature where a cross-tenant reference-injection bug tends to hide.
- **Trace:** Read both service files in full (1089 + 100 lines). **Cross-tenant relation-field IDOR**:
  created a real model + relation field on one tenant pointing at a legitimate same-tenant target model,
  then attempted to save an entry whose relation value was a real, live entry id belonging to a
  genuinely different tenant (created via a second real account) — correctly refused
  (`"Category" must reference an existing entry.`), confirming `validateAgainstFields`' relation check
  really does scope the lookup by `tenant_id` and not just `model_id`. **Public draft-gating**: a real
  draft entry correctly never appeared in the public list endpoint, and direct-by-slug access was
  correctly refused both with no token and with a syntactically-plausible fabricated token. **Preview
  token security**: confirmed the real HMAC+timingSafeEqual+24h-expiry token (same established pattern
  as `object-storage.ts`'s signed URLs) actually works when genuine, and — the more meaningful check —
  that a valid token minted for one entry does **not** transfer to a different entry's slug, confirming
  the signature is genuinely bound to the specific row id, not just "any valid-looking token for this
  model." **Capability matrix (§74)**: live-tested the custom per-role RBAC system rather than trusting
  the code — confirmed a JUNIOR account has full default access today, then had a real admin account
  revoke JUNIOR's `can_manage` for the `content` area, confirmed JUNIOR was immediately refused creating
  an entry (403) while `can_view` (untouched) still allowed listing/reading, then reset the override and
  confirmed access returned — the three-tier view/manage/publish split works exactly as designed, not
  just as documented. Also confirmed `/capabilities` itself is genuinely ADMIN-only (checked the
  `cms.routes.ts` preHandler directly, not just the route file's own comment claiming it is).
- **No bug found** — cross-tenant relation-value injection, public draft/preview gating, preview-token
  row-binding, and the custom capability matrix (both the restriction and the reset path) all held under
  live, adversarial testing. No code changes this pass.
- **Test-artifact handling:** three real content models (two same-tenant, one cross-tenant), one
  relation field, and five real entries created during this trace were removed directly via the
  database afterward; the one capability override created during testing was reset via the real API
  before cleanup (confirmed reverted live, not just deleted from the row). Shared dev server (port 3001)
  used directly throughout, confirmed healthy.

### HUD-0128 — Phase 5: CMS Enterprise collaboration (`cms-enterprise.routes.ts`/`cms-enterprise.service.ts` — configurable workflow, approvals, content releases, editorial comments, multisite, translations) traced live and adversarially · Found+fixed a real, systemic cross-user authorization bypass: caller identity was threaded through 4 separate mutation functions purely for attribution, never actually checked for permission
- **Category:** Security — broken access control (Phase 5, eighty-fourth journey). A brand-new, never-
  before-traced enterprise module (migration 477 onward, built this week) whose entire premise is
  identity-gated collaboration — assign a specific reviewer, track who requested what, attribute who
  wrote which editorial comment. Most CRUD routes in this file already gate on `isCmsAdmin(role)` for
  platform-config actions (sites, workflow states/transitions) — this journey specifically targeted the
  routes that had **no role check at the route level at all**, to see whether the service layer
  underneath genuinely enforced ownership instead, or just trusted the caller.
- **Trace:** Read `cms-enterprise.service.ts` in full (1559 lines). Four functions — `decideApproval`,
  `cancelApproval`, `updateContentComment`, `deleteContentComment` — each accept the caller's id
  (`reviewerId`/`userId`) as a parameter, but not one of them ever compared it against anything: not
  `approval.assigned_to`, not `approval.assigned_by`, not `comment.author_id`. The id was used purely to
  *stamp* the row (who resolved it, who cancelled it) — never to decide *whether* the caller was allowed
  to. **Live-exploited end to end**, not just read: created a real page, had one real staff account
  request a review assigned to a second real staff account, then had a completely uninvolved third
  account successfully approve it — confirmed the decision persisted. Separately, had one staff account
  post a real editorial comment, then had a different, uninvolved staff account overwrite its content
  and delete it outright — both confirmed to actually take effect via a fresh read afterward, not just a
  200 response. `cancelApproval` additionally never checked the approval was still `pending`, so an
  already-approved review could be silently forced back to `draft` by anyone.
- **Fixed** by adding an explicit `userRole` parameter to all four functions and an authorization check
  before any mutation — assigned-reviewer-or-admin for deciding, requester-or-admin for cancelling
  (plus the missing already-pending guard), comment-author-or-admin for editing/deleting — using the
  exact `['ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN']` admin-override convention this same service file
  already established for `validateTransition`, rather than inventing a new authorization shape. Mapped
  the resulting permission-denied errors to 403 at the route level (previously everything from these
  four routes fell through to a generic 400). Re-verified live with a properly-controlled matrix: a
  genuinely uninvolved non-admin third party is now refused deciding or cancelling an approval (403);
  the actually-assigned reviewer still decides successfully (200, no regression); a non-author is now
  refused editing or deleting someone else's comment (403); the actual comment author can still edit
  their own (200); and — confirming the admin-override was implemented correctly, not just permissive by
  accident — a TENANT_ADMIN can still moderate/resolve a comment they didn't write, by design.
- **Test-artifact handling:** three real test pages, their review requests, and one real editorial
  comment created during this trace were removed directly via the database afterward (the page deletes
  via the real API didn't cascade the polymorphic `resource_id`-linked `cms_approvals` rows, since
  there's no FK to cascade on — a soft, non-security finding worth a look in a future pass, not itself a
  bug this pass fixed). `tsc --noEmit` clean; full suite green (157/157 tests, 12/12 files);
  `check:triggers` OK (same unrelated concurrent-CMS-session warnings). Shared dev server used directly
  throughout, confirmed healthy.

### HUD-0127 — Phase 5: HuduBI (`hudubi.routes.ts`, `hudubi-widgets.service.ts`, `hudubi-entity.service.ts` — executive dashboard, configurable widget/report builder, cross-app customer entity resolution) traced live and adversarially · Found+fixed a real unguarded-uuid crash and a real raw-database-error leak, both the HUD-0097 bug class recurring in a never-before-swept app
- **Category:** Functional correctness + information disclosure (Phase 5, eighty-third journey). The
  tenant's own real data surfaced as an executive snapshot — the file's own header comment explicitly
  disclaims the product's prior fabricated numbers ("$28.4M revenue, 8,420 customers, Snowflake
  sources") and states every figure is now a live aggregate over the tenant's own rows. Never traced
  this arc. Verified the "no fabrication" claim is real: `/dashboard`, `/analytics`, `/data-sources`,
  and the M9 configurable widget builder all run real, tenant-scoped SQL (`sql.table()`/`sql.ref()`
  against a hardcoded metric registry, never a user-supplied table/column name) rather than returning
  canned data — confirmed live with the entitlement temporarily granted to a real test tenant.
- **Trace:** Read all three files in full, specifically checking whether this file's own already-defined
  `isUuid()` helper (used elsewhere in the file to classify a custom-workflow stage) was actually applied
  everywhere a caller-supplied id reaches a UUID database column — the exact discipline this arc's
  ~116 prior fixes of this bug class already established. It wasn't, in two places. **Live-reproduced**:
  `GET /entities/customer/:id` with a malformed id crashed with a raw 500 (no guard existed on this
  route at all); `GET/PATCH/DELETE /widgets/:id`(`/data`) with a malformed id didn't crash (already
  wrapped in try/catch) but leaked Postgres's own `invalid input syntax for type uuid: "..."` message
  text straight to the client, with inconsistent status codes across the three routes (404 on one, 400
  on the other two) for the identical underlying condition. **A second, deeper bug surfaced while fixing
  the first**: this file's own `isUuid()` regex was `/^[0-9a-f]{8}-[0-9a-f]{4}-/i` — only checking the
  *first two* groups of a UUID, not the full 8-4-4-4-12 shape. Live-proved this was a real, exploitable
  gap in the fix itself, not a theoretical nitpick: a crafted id with a valid-looking prefix but an
  invalid tail (`b37de79a-e059-ZZZZ-INVALID-SUFFIXHERE12`) passed the weak regex and still reached the
  database, still crashing with the same raw 500.
- **Fixed** by replacing the partial regex with the full, correctly-anchored pattern already established
  elsewhere in this exact codebase for this exact purpose (`ai.routes.ts`'s own `UUID_RE`:
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`), then adding an `isUuid()` guard to
  `GET /entities/customer/:id` and to all three widget-by-id routes, each returning a clean, consistent
  404 before ever reaching the database. Re-verified live: the original malformed id, the crafted
  quasi-valid-prefix id, and a genuine real customer/widget id (full read → 200, patch → 200, no
  regression) were all re-tested — malformed inputs now correctly 404 with no leaked message, real data
  is untouched.
- **Adversarially tested the surrounding boundaries while there**: `hudubi-entity.service.ts` uses
  `dbPlatform` (the BYPASSRLS role) with hand-written `.where('tenant_id', ...)` filters on every query
  rather than `withTenant()` — the same shape flagged as risky elsewhere in this arc, since it has no
  RLS backstop if a filter is ever forgotten. Live cross-tenant-tested it anyway rather than assuming
  the manual filters were wrong: a real customer id from one tenant, looked up with a real, entitled
  account from a completely different tenant, correctly 404'd — the manual scoping holds today, though
  the pattern remains worth flagging for future changes to this file. Also cross-tenant-tested the
  widget routes: reading and deleting another tenant's real widget by its real id both correctly no-op
  (404 read; delete silently affects zero rows, matching this arc's established idempotent-delete
  convention — confirmed the widget survived afterward, not actually deleted).
- **Test-artifact handling:** `hudubi` entitlement was temporarily granted to both the test tenant and a
  second, genuinely different tenant (to make the cross-tenant tests real rather than blocked by
  `PLAN_UPGRADE_REQUIRED`), and fully reverted on both afterward — confirmed reverted live (entitlement
  check correctly 403'd again post-revert). The one real test widget created was deleted via the real
  API. `tsc --noEmit` clean; full suite green (157/157 tests, 12/12 files); `check:triggers` OK (same
  unrelated concurrent-CMS-session warnings). Shared dev server used directly throughout, confirmed
  healthy.

### HUD-0126 — Phase 5: Hudumika AI (`ai.routes.ts`, `ai-tools.service.ts`, `ai-memory.service.ts` — chat with read-only tool-calling, proactive insights digest, per-user/workspace memory, conversation history) traced live and adversarially · CLEAN (no finding)
- **Category:** Security (Phase 5, eighty-second journey). The platform's cross-app AI assistant —
  conversational chat with an agentic tool-calling loop (Anthropic and OpenAI wire formats both
  supported) that lets the model call real, read-only tenant-data tools (`get_at_risk_shipments`,
  `search_shipments`, `get_aged_receivables`, `get_customer_info`) to ground its answers, plus
  per-user/workspace-shared long-term memory and persisted conversation history. Never traced this arc,
  and a natural place to look for a scoping mistake: an agentic tool-calling surface is exactly the
  shape of feature where a cross-tenant or cross-user leak tends to hide, since the model — not a fixed
  route — decides what to call and with what arguments.
- **Trace:** Read all three files in full. `ai-tools.service.ts`'s own header comment claims "there is
  no path for a tool call to reach another tenant's data" — verified rather than trusted: all four tools
  take only free-text search parameters (never a raw id the model could substitute), and every query is
  wrapped in `withTenant(tenantId, ...)` with an explicit `.where('tenant_id', '=', tenantId)`, so even a
  fully model-controlled input can't escape the caller's own tenant. `ai-memory.service.ts`'s
  `resolveConversation()` carries an explicit doc comment about the exact IDOR this journey went looking
  for ("returns null when the id is real but someone else's... a thread id cannot be probed for
  existence") — proved live rather than accepted on the comment's word. Live-tested with two real
  `msomi.co` staff accounts: created a real conversation (via the "Remember that..." command path, which
  needs no configured AI provider), then attempted every angle of cross-user access to it as a second,
  unrelated staff member in the same tenant — `GET /conversations/:id` (404), continuing it through
  `POST /chat` by supplying its real id as `conversation_id` (404, the classic "hijack an existing
  thread by guessing/reusing its id" attempt), and `DELETE /conversations/:id` (404) — all three refused,
  and the conversation confirmed untouched afterward. Repeated the read/delete pair from a genuinely
  different tenant's real JWT — also 404. **Memory boundary tested both directions**: a personal memory
  fact was invisible in a second user's `GET /memory` and that user's `DELETE` on it correctly 404'd
  (fact confirmed still present afterward); a workspace-shared fact (`scope: 'workspace'`) was correctly
  visible to the second same-tenant user but correctly absent from a different tenant's `GET /memory`
  entirely. Confirmed every route in the plugin sits behind both the `'ai'` entitlement and the
  standing CUSTOMER-role block (HUD-0024/0031's own comment already covers this same file). Confirmed
  every route taking a path-param id (`/conversations/:id`, `/memory/:id`) validates it's a real UUID
  before ever reaching a query — the HUD-0097 lesson already applied consistently throughout this file,
  not missed. Checked whether the tenant's real Anthropic/OpenAI API key (`tenant_settings.settings
  ['int-ai'].apiKey`) could leak back through `GET /v1/settings` — confirmed already masked/encrypted at
  rest from an earlier pass in this same arc (`settings.routes.ts`'s `SECRET_FIELDS_BY_KEY` table),
  re-verified the entry is still present rather than assuming it hadn't regressed. `POST /ai/test`
  (arbitrary caller-supplied `apiKey`, no role restriction beyond non-CUSTOMER) was checked against
  `PATCH /v1/settings`'s real `TENANT_ADMIN`+ gate for actually *storing* that credential — not the same
  privilege level, but not a gap either: `/test` never reads or writes the tenant's stored key at all,
  only relays the caller's own supplied value to a hardcoded Anthropic/OpenAI URL, so there's no stored
  secret to leak and no SSRF surface (the destination host is never caller-controlled).
- **No bug found** — tool-calling tenant scoping, conversation ownership (same-tenant cross-user,
  cross-tenant, and id-reuse-via-request-body all three), personal-memory isolation, workspace-memory
  sharing semantics, entitlement/role gating, uuid-validation-before-query discipline, and the
  previously-fixed credential-masking all held under live, adversarial testing. No code changes this
  pass.
- **Test-artifact handling:** the one real conversation and two real memory facts (one personal, one
  workspace-shared) created during this trace were deleted via the real API afterward. Shared dev server
  (port 3001) used directly throughout, confirmed healthy.

### HUD-0125 — Phase 5: SMS app (`sms.routes.ts`, 749 lines — quick send, groups, templates, campaigns, multi-gateway Africa's Talking/Twilio, opt-outs, inbound webhooks) traced live and adversarially · Found+fixed a real, unauthenticated HIGH DoS/griefing vulnerability (forged inbound webhooks can silently opt out any phone number for any tenant) and a real MEDIUM compliance bypass (opt-out enforcement used an exact-string phone match, defeated by trivial reformatting)
- **Category:** Security — unauthenticated write primitive + compliance (Phase 5, eighty-first journey).
  A real external-gateway integration (live Africa's Talking + Twilio REST APIs) with two genuinely
  public, unauthenticated webhook surfaces registered with zero prefix-level auth: delivery-status
  callbacks (`POST /v1/sms/webhook/{africas-talking,twilio}`) and inbound-message callbacks
  (`.../inbound`), the latter auto-recording a real compliance opt-out on any STOP-style reply. Never
  traced this arc — chosen specifically because it's a real external attack surface (the same shape of
  finding this arc prioritizes) with a live gateway integration, unlike most internal CRUD surfaces.
- **Trace:** Read `sms.routes.ts` and `integrations/sms.ts` in full. **Found a CRITICAL-shaped gap
  immediately**: neither webhook route validates any signature, HMAC, or shared secret — grepped the
  whole codebase and found zero references to Twilio's real `X-Twilio-Signature` scheme anywhere, and
  confirmed Africa's Talking has no signature scheme to check in the first place. The tenant-resolution
  key for the inbound-message route is the registered **sender ID** — a value that is public by design
  (it is literally what every SMS recipient sees as the "from" on every text that tenant has ever sent),
  so no secret knowledge of any kind is required to target a specific tenant. **Live-exploited, not just
  read**: created a real gateway with sender ID "MSOMI" on a real tenant, then POSTed a completely
  unauthenticated, unsigned forged inbound webhook (`to=MSOMI, from=<arbitrary victim number>,
  text=STOP`) with `curl` — confirmed it created a real `sms_opt_outs` row for the fabricated victim
  number and a real `sms_inbound_messages` log entry, meaning **any internet client can permanently
  block an arbitrary phone number from ever receiving SMS from a tenant again, and inject fabricated
  "customer replies" into a tenant's inbox, with zero credentials.** This is the same bug shape as an
  authz bypass (an action that should require proof-of-origin performs it for anyone), just on an
  unauthenticated webhook rather than a session — rated HIGH rather than this arc's CRITICAL band since
  it doesn't cross a tenant-isolation boundary or leak confidential data, but the availability/integrity
  impact (silently sabotaging a business's ability to reach a customer) is real and required zero skill
  to reproduce.
- **Fixed** by adding `SMS_WEBHOOK_SECRET` (`config/env.ts`) and a single `preHandler` hook at the top of
  `smsWebhookRoutes` checking `?token=` against it — the exact same shared-secret-as-query-param shape
  this codebase already uses for `GPSWOX_WEBHOOK_SECRET` in `webhooks.routes.ts`, chosen deliberately
  over inventing a third webhook-security pattern (Meta gets real HMAC because Meta provides one; GPSWOX
  and now SMS gateways get a shared secret because neither AT nor GPSWOX offer a native scheme), and
  optional/skip-if-unset for the same backward-compatibility reason as the other two. Since a
  Fastify `preHandler` hook applies to every route registered in the same plugin scope regardless of
  declaration order, one hook at the top of the function covers all 4 webhook routes (both providers'
  delivery-status callback and both providers' inbound-message callback). **Re-verified live** with a
  genuinely isolated second API instance (port 3099, `SMS_WEBHOOK_SECRET` set, entirely separate from
  the shared dev server so as not to disrupt it) — confirmed a forged request with no token and with a
  wrong token are both correctly refused (401) on all 4 routes, and the identical request with the
  correct token still processes normally end-to-end (real opt-out row created). Isolated instance killed
  by PID afterward; confirmed the shared dev server was unaffected throughout.
- **Found and fixed a second, related real bug while verifying the opt-out compliance claim itself**:
  `integrations/sms.ts`'s own doc comment claims every send is checked against `sms_opt_outs` first —
  true, but the check was an exact string match (`where('phone', '=', to)`). Live-reproduced: opted out
  `+255700000111`, then sent to the *same number* as `255700000111` (no `+`) and `0700000111` (local
  format) — both reached all the way to a real outbound Africa's Talking API call (failing only on fake
  test credentials, confirmed by the `HTTP 401` from AT's real servers, not a "blocked" response),
  proving the compliance opt-out is trivially defeated by ordinary phone-number format variance, the
  kind that happens naturally across a CRM contact record, a lead, and a customer's own STOP reply.
  Confirmed a pre-existing `normalizePhone()` (last-9-digits-only) already solves exactly this problem
  in `referral.service.ts`'s self-referral fraud check, previously private to that file. **Fixed** by
  extracting it to a new shared `lib/phone.ts`, adding a `phone_normalized` column to `sms_opt_outs`
  (migration `480_sms_opt_out_phone_normalization.sql`, backfilling existing rows, indexed but not
  unique-constrained since dirty pre-existing data could already hold the same number in two formats as
  separate rows), and switching `sendSms()`'s opt-out check plus both opt-out write paths (the manual
  `POST /opt-outs` route and both providers' STOP-keyword auto-opt-out) to populate and match on it.
  Re-verified live: both previously-bypassing formats are now correctly blocked, a STOP reply received
  in local format now blocks the `+255`-prefixed form of the same number, and a genuinely different
  number still reaches the gateway normally (no over-blocking regression).
- **Test-artifact handling:** two real test gateways, all forged/legitimate opt-out rows, inbound
  message log rows, and 7 `sms_messages` rows created while exercising the send path were all deleted
  (via the real API where a delete endpoint exists — gateways, opt-outs — and directly via the database
  for the two tables with no delete endpoint — inbound messages, sent-message log). `tsc --noEmit` clean
  (grep-filtered, zero new errors); full suite green (149/149 tests, 12/12 files); `check:triggers` OK
  (same unrelated concurrent-CMS-session warnings). Shared dev server used directly throughout for all
  non-security-sensitive testing; the signature-bypass fix specifically was verified against a separate,
  genuinely isolated instance so the exploit-and-fix cycle never touched the shared server other tenants/
  sessions might be relying on.

### HUD-0124 — Phase 5: Tasks + Calendar (`tasks.routes.ts`, 1509 lines — todo lists/sharing/collaborators/dependencies, plus Calendar events/freebusy/ICS/booking-pages) traced live and adversarially · Found+fixed a real 403-vs-404 status-code bug across 9 routes; found+documented a real HIGH functional gap in Calendar guest invites
- **Category:** Functional correctness + authorization (Phase 5, eightieth journey). The platform's
  richest per-resource ACL model outside of Notes — a `TaskAccessLevel` of `owner`/`assignee`/`editor`/
  `viewer` resolved through four independent, overlapping grant mechanisms (list ownership, a single
  `assignee_id`, `task_list_shares` with a viewer/editor role, and a plural `task_collaborators` roster
  layered on top for Projects-tier accounts), plus Calendar's own event/freebusy/ICS-import-export/
  booking-pages surface (booking-pages itself already covered by HUD-0122). Never traced this arc.
- **Trace:** Read `tasks.routes.ts` and `calendar-events.service.ts` in full. `resolveTaskAccess()` — the
  single function every task-scoped route funnels through — correctly centralizes all four grant
  mechanisms and correctly special-cases `is_private` (a task marked private on a *shared project* is
  hidden from project members but a task on a *shared list* is visible to anyone the list was shared
  with, a deliberate difference between the two collaboration models, not a gap). Live-verified the
  full boundary matrix with real accounts on a real Msomi-tenant list: a **viewer** sees the task
  (`access: 'viewer'`) but is correctly blocked (403) from every write path; an **editor** can edit
  content fields but is correctly blocked from owner-only fields (reassign/move-list/someday/delete/
  `isPrivate`) with the exact "Only the task owner can reassign, move, or delete this task" message; an
  **assignee** with zero list share and zero project membership still correctly gets work access purely
  from `assignee_id`; revoking a list share immediately and correctly removes all access, both to
  `GET /items` visibility and to every mutating route (404, not a lingering 403). A real cross-tenant
  JWT against a real task id was correctly refused on `PATCH` (404) and `DELETE` (silent 204 no-op,
  not an actual delete — confirmed the row survived). **Found a real bug** while running the viewer-vs-
  editor matrix: `POST/PATCH/DELETE` on subtasks, comments, collaborators, dependencies, and
  timer start/stop all share the line
  `if (!resolved || !canWorkOn(resolved.access)) return reply.status(404)...` — collapsing "task
  doesn't exist" and "task exists but you're read-only" into the same 404 "Task not found", even though
  the sibling route `PATCH /items/:id` (a few hundred lines away, same file) correctly splits these into
  404 vs. a specific 403 "You only have view access to this task". Live-reproduced: a real `viewer`
  who can see a task perfectly well in their own list gets told the task doesn't exist the moment they
  try to comment on it or start its timer — the same "wrong status code for a domain-specific failure"
  shape this arc has flagged before (see [[http_401_session_collision_bug]]), here misleading a
  legitimate, existing user rather than a security issue (the viewer already independently confirmed
  the task's existence via `GET /items`, so no information is actually disclosed either way).
- **Fixed** all 9 call sites (`timer/start`, `timer/stop`, subtasks `POST`/`PATCH`/`DELETE`, comments
  `POST`, collaborators `POST`, dependencies `POST`/`DELETE`) by splitting the combined check into the
  same two-line shape `PATCH /items/:id` already used — `if (!resolved) return 404` then
  `if (!canWorkOn(resolved.access)) return 403` with the same specific message — via one `replace_all`
  edit, since all 9 occurrences were byte-identical. Re-verified live: the same viewer now gets a
  correct 403 on comment/timer attempts; a genuinely nonexistent task id still correctly 404s; re-ran
  the editor-role write path afterward (comment + subtask create) to confirm the fix didn't regress the
  legitimate-write case.
- **Found and documented (not fixed) a real HIGH functional gap**, discovered live while testing
  Calendar's guest-invite feature rather than by hunting for it: `calendar-events.service.ts`'s own
  header comment states plainly "There is no existing cross-user visibility model for calendars at all
  ... every query in this file is strictly scoped to the caller's own `user_id`" — proven live rather
  than just read. Created a real event as one user and invited a second real user as a `guests[].userId`
  entry: the invitee received a real, correctly-worded notification ("X invited you to ...") whose own
  `link` field points at `/calendar` — but that invitee's own `GET /events` never returns the event
  (confirmed against the live response), so the notification's own link leads nowhere. Confirmed the gap
  compounds beyond the UI: `GET /events/freebusy` for that invitee also never reflects the meeting, so
  being invited provides zero protection against double-booking despite the guest schema carrying a
  `status: 'pending'|'accepted'|'declined'` field — grepped the whole route file and service and
  confirmed **no accept/decline endpoint exists anywhere**, so that field can never actually change
  once set. Left undocumented-not-fixed rather than partially patched: a correct fix needs a coordinated
  backend+frontend design decision (how a non-owned "I'm invited" event renders, what actions are
  available, an RSVP flow) — the same reasoning this arc already applied to the Developer Platform's
  fabricated-verification and broken-metering findings (HUD-0117) rather than shipping a backend-only
  half-fix with no frontend verification.
- **Test-artifact handling:** real list/tasks/event/shares created during this trace (one list, two
  tasks, one event, one list-share, plus comments/subtasks created while exercising the editor path)
  deleted via the real API where the product allows it (task/event delete, share revoke); the test list
  itself — which had become the test account's *only* list, so the app correctly refuses to delete it
  via the API ("Cannot delete your only list") — removed directly via the database instead, along with
  a synthetic `task_lists` row the cross-tenant outsider test's own auto-provisioning side effect
  created for a nonexistent user id. `tsc --noEmit` clean on the changed file (grep-filtered against the
  full run; zero matches, meaning zero new errors — same pre-existing unrelated CMS-module errors from
  the concurrent session's own in-progress work untouched); full suite green (146/146 tests, 12/12
  files, including the previously-flaky `project-os-isolation.test.ts` passing clean this run);
  `check:triggers` OK (same unrelated concurrent-CMS-session warnings). Shared dev server (port 3001)
  used directly throughout, confirmed healthy.

### HUD-0123 — Phase 5: Notes app (`notes.routes.ts`/`notes.service.ts` — per-note visibility/sharing, version history, labels) traced live and adversarially · Found+fixed the HUD-0097/0099 "crash instead of 404" bug class a 2nd time inside a `services/*.ts` file
- **Category:** Functional correctness (Phase 5, seventy-ninth journey). A real per-user note app with
  a genuine ACL model — `visibility: 'team' | 'private' | 'shared'`, a `note_shares` table with
  per-user `view`/`edit` permission, self-escalation prevention (only a note's creator can change who
  it's shared with or its visibility), optimistic locking via `expectedUpdatedAt`, and full version
  history (`note_revisions`) with restore — never traced this arc.
- **Trace:** Read `notes.service.ts` in full (533 lines) rather than spot-checking, specifically
  looking for the HUD-0097/0099 "unguarded `executeTakeFirstOrThrow()` on a caller-supplied id" bug
  shape — that original platform-wide sweep was scoped to `apps/api/src/routes` and never looked
  inside a `services/*.ts` file, a known blind spot that already let `seal-billing.service.ts` through
  once earlier in this arc. Found the same shape here: `fetchAccessRow` (the shared existence+ACL
  helper used by `assertCanView`/`assertCanEdit`), `updateNote`'s own row fetch, `restoreRevision`'s
  revision-row fetch, and `updateLabel`'s `UPDATE ... RETURNING` all called `executeTakeFirstOrThrow()`
  with no existence check first. Live-reproduced with real HTTP requests against the shared dev server
  (self-signed JWTs for real `msomi.co` tenant accounts): `PATCH /:id/trash`, `GET /:id/revisions`,
  `POST /:id/revisions/:revisionId/restore`, `PATCH /labels/:id`, and a cross-tenant `PATCH /:id` all
  crashed with a raw, unhandled `{"error":"no result"}` / generic `400` instead of a clean `404` when
  given a nonexistent, deleted, or cross-tenant id — five distinct routes surfacing the identical
  unhandled-exception shape.
- **Fixed** by adding a `NoteNotFoundError` class (mirroring the existing `NoteForbiddenError`/
  `NoteConflictError` pattern already in the file) and, at each of the four call sites above, replacing
  the unguarded `executeTakeFirstOrThrow()` with `executeTakeFirst()` plus an explicit
  `if (!row) throw new NoteNotFoundError(...)`. Distinguished (per this arc's established discipline)
  which of the file's *other* five `executeTakeFirstOrThrow()` call sites were transitively safe
  because a prior existence check already ran earlier in the same transaction — `loadForViewer`'s note
  fetch (always called after a mutator already confirmed the row exists/was just written),
  `restoreRevision`'s own note re-fetch (already guarded by `assertCanEdit` two lines earlier), and the
  three plain `INSERT ... RETURNING` calls (`createNote`, `createLabel`, the `note_shares` insert) —
  none of these needed a fix, and adding one would have been a redundant, dead check. Wired
  `notes.routes.ts`'s existing `sendNoteError()` dispatcher to map `NoteNotFoundError` → `404`, and
  pointed the `/labels/:id` PATCH route (previously its own inline catch defaulting everything to
  `400`, never routed through the dispatcher) at the same function. `DELETE /labels/:id` was checked
  and left untouched — it's a plain `DELETE` with no `RETURNING`, so a nonexistent id already just
  no-ops (0 rows affected), the same intentionally-idempotent shape as this arc has left standing
  elsewhere rather than treating as the same bug class.
- **Re-verified live** after the fix: all five original reproductions now return a clean `404` with a
  specific message (`"Note not found."` / `"Revision not found."` / `"Label not found."`), including
  the cross-tenant case (a real JWT from a different tenant, `404` rather than a distinguishing `403`,
  consistent with this arc's standing "don't leak existence across a tenant boundary" convention). Also
  re-confirmed, as a deliberate regression check, that the fix didn't collapse the ACL boundaries it
  sits next to: a same-tenant "nosy colleague" with no share still correctly gets `403` on a private
  note; a view-only share still correctly gets `403` attempting to edit; an edit-share still correctly
  succeeds (`200`) — the 404/403 distinction (doesn't-exist vs. exists-but-forbidden) holds in both
  directions.
- **Test-artifact handling:** the three real test notes created this pass (one private, one
  view-shared, one edit-shared, all under a real `msomi.co` tenant account) plus their `note_shares`
  and `note_revisions` rows were deleted directly afterward — no delete-via-API path was exercised
  since the point of the trace was the *lookup* failure mode, not the delete endpoint itself.
  `tsc --noEmit` clean on both changed files (pre-existing, unrelated CMS-module errors from the
  concurrent session's own in-progress work untouched); full suite green (142/142 real tests; the one
  failing suite, `project-os-isolation.test.ts`, is a pre-existing hook-timeout unrelated to this
  change — see HUD-0032's own note on that module's concurrent rebuild); `check:triggers` OK (same
  unrelated concurrent-CMS-session warnings). Shared dev server (port 3001) used directly throughout,
  including surviving one transient connection blip from the concurrent session's own `tsx watch`
  restart, retried and confirmed healthy.

### HUD-0122 — Phase 5: Calendar's public Calendly-style booking pages (`booking.routes.ts`/`booking-pages.service.ts`) traced live and adversarially · Found+fixed a real, live-reproduced double-booking race condition
- **Category:** Functional correctness + data integrity (Phase 5, seventy-eighth journey). A genuinely
  public, unauthenticated scheduling surface — anyone with a link sees a staff member's real working
  hours, picks an open slot, and booking one creates a real `calendar_events` row on that person's own
  calendar, exactly as if they'd added it themselves. Never traced. The file's own code comment
  explicitly claims the exact race this journey went looking for is handled ("Re-check the slot at
  booking time... two people can't be looking at the same page at once and both win the same slot") —
  a claim worth proving rather than accepting, especially on a public surface real people would
  actually hit concurrently (a popular slot, or two people racing to grab the last opening).
- **Trace:** created a real booking page, confirmed the public info/slots endpoints disclose nothing
  beyond what's needed to render a booking UI (no `tenantId`/`userId` in the public page response — the
  route explicitly destructures them out), and confirmed a real sequential booking correctly creates a
  `calendar_events` row, sends a real confirmation email to the booker and a real notification+email to
  the host, and that immediately re-booking the *same* slot afterward is correctly refused (`409`) —
  the claimed defense works under ordinary sequential use. **Then fired two genuinely concurrent HTTP
  requests at the exact same never-before-booked slot** (not a simulated race, real parallel
  connections) — both succeeded. Confirmed directly against Postgres: two separate, real
  `calendar_events` rows for the identical host and the identical time window, both bookers having
  received a real "your booking is confirmed" email. Root cause: the "re-check the slot" guard is a
  plain `SELECT` immediately followed by an `INSERT`, both inside a `withTenant()` transaction but with
  no row lock, no unique constraint, and no serializable isolation behind it — under Postgres's default
  READ COMMITTED isolation, two transactions can both run the SELECT (seeing no conflict) before either
  commits its INSERT. Re-ran the exact reproduction a second and third time (including a genuine 3-way
  concurrent race) before fixing anything, to rule out a fluke — the double-booking reproduced
  consistently, not intermittently.
- **Fixed** with `pg_advisory_xact_lock(hashtext(tenantId), hashtext('booking:' + hostUserId))`
  acquired immediately before the conflict check — the same established pattern this codebase already
  uses for this exact class of check-then-write race (`hr.routes.ts`'s leave-overlap guard,
  `audit-chain.ts`'s own hash-chain append), scoped to the host rather than one specific slot since the
  conflict check itself scans that host's whole calendar window, not a single row. Re-ran the original
  2-way race and a fresh 3-way race after the fix: in both cases exactly one request succeeded and
  every other one got the same clean, pre-existing `409` message — confirmed directly against Postgres
  that exactly one `calendar_events` row exists at the contested slot each time, not zero and not two.
- **Test-artifact handling:** every real calendar event created during this trace (the legitimate
  sequential booking, both pre-fix race duplicates, and the post-fix race winners) was deleted via the
  real `DELETE /v1/tasks/events/:id` rather than left cluttering a real host's calendar; the test
  booking page itself was deleted via the real `DELETE /v1/tasks/booking-pages/:id`. `tsc --noEmit`
  clean; full suite green (12 files/141 tests); `check:triggers` OK (same unrelated concurrent-CMS-
  session warnings). Shared dev server (port 3001) used directly throughout — including surviving three
  genuinely concurrent requests fired at it back to back — confirmed healthy throughout.

### HUD-0121 — Phase 5: Bliss Escalations (`escalations.routes.ts` — CASE and Team-CHAT escalation to resolver-tier staff) traced live and adversarially · CLEAN (no finding)
- **Category:** Security + functional correctness (Phase 5, seventy-seventh journey). A small, real
  cross-app feature — any internal staff member can escalate a customs case or a Team Chat message to
  resolver-tier staff (`SENIOR`/`MANAGER`/`ADMIN`+), with a real PENDING→IN_PROGRESS→RESOLVED workflow
  and a real notification fan-out. Already carries evidence of one prior real pass (HUD-0084, cited in
  its own header comment, plus a genuine pre-existing test escalation from 2026-09-14 found live in
  the data) — traced again in full this arc rather than trusted from the comment.
- **Trace:** created a real `CASE` escalation as a `JUNIOR` and confirmed every real resolver-tier
  user in the tenant (`TENANT_ADMIN`, `MANAGER`, `SENIOR` — genuinely excluding the escalator
  themselves) received a real, correctly-attributed `notifications` row — not just a `201`. Confirmed
  the `OWN_ONLY_ROLES` scoping live with two distinct real `JUNIOR` accounts: a second, unrelated
  junior staff member's `GET /` correctly returned only their own prior escalation, never the one just
  created by the first. Confirmed the real state machine end to end: a `JUNIOR` was correctly refused
  advancing any escalation (`403`, not a resolver role); a real `SENIOR` correctly advanced
  PENDING→IN_PROGRESS→RESOLVED one step at a time, and a third advance attempt on the now-RESOLVED row
  was correctly refused (`409`). Tested the `CHAT`-subtype escalation's own channel-existence guard
  (the file's own HUD-0084 fix): a fabricated channel id was correctly refused (`404`), and — the
  more meaningful adversarial version, using a *real* channel id that genuinely exists but belongs to
  a different tenant — was also correctly refused, confirming the existence check is tenant-scoped,
  not just an existence check. **Cross-tenant IDOR**: a real `SENIOR` JWT from a completely different
  tenant was refused advancing a real, still-pending escalation by its real id (`404`, not
  distinguishing "wrong tenant" from "doesn't exist"), and that same outsider's own `GET /` correctly
  returned an empty list rather than leaking anything.
- **No bug found** — resolver-tier notification fan-out, own-escalations-only scoping for
  JUNIOR/OFFICER, the full PENDING/IN_PROGRESS/RESOLVED state machine including the already-resolved
  guard, the CHAT channel-existence check's tenant scoping, and cross-tenant isolation on both read
  and write all held under live, adversarial testing. No code changes this pass.
- **Test-artifact handling:** both real test escalations created this pass were driven all the way to
  `RESOLVED` via the real advance endpoint rather than left `PENDING` — no delete endpoint exists on
  this table (confirmed by reading the whole file), matching this arc's standing convention. Shared
  dev server (port 3001) used directly throughout, confirmed healthy (one transient `tsx watch`
  restart blip from the concurrent CMS session, retried and succeeded).

### HUD-0120 — Phase 5: Bliss Calls/Meetings (`calls.routes.ts` — 1:1 calls, meetings, real guest join with waiting rooms, WebRTC signaling relay) traced live and adversarially · Found+fixed a real password-hash disclosure repeated across 5 routes, and a real duplicate-guest-session bug
- **Category:** Security + functional correctness (Phase 5, seventy-sixth journey). The platform's
  comms hub — real peer-to-peer WebRTC signaling relay, meeting metadata/attendance persistence, host
  controls, waiting rooms, breakout rooms, polls/questions/transcript tools, and a genuinely public,
  unauthenticated **guest-join** surface (password gate, waiting room, a meeting-scoped 6-hour guest
  JWT) for external participants — never traced this arc. The guest-join surface in particular is
  exactly the kind of real external attack surface this arc prioritizes: unauthenticated by design,
  reachable by anyone with a link.
- **Trace — password-hash disclosure, found live while driving the ordinary golden path, not by
  hunting for it**: creating a real password-protected meeting returned the meeting's own real
  `password_hash` (a 210,000-iteration PBKDF2-HMAC-SHA512 string) in the create response. Checking
  whether this was isolated, found the **exact same field leaking from four more routes**:
  `GET /meetings/by-code/:code` — reachable by *any* non-customer staff member in the tenant who
  merely holds the meeting's join code, which is the whole point of a join code (it's meant to be
  shared with participants) — live-confirmed with a real second staff account, not the host, pulling
  the full hash using nothing but the code; the authenticated `POST /meetings/:id/join` — the single
  highest-reach instance, since **every participant who successfully joined any password-protected
  meeting got the real hash back**, not just the host; `DELETE /meetings/:id` (cancel); and
  `POST /meetings/:id/end`. All five were the one miss against an established, correct sibling
  pattern already used by `GET /meetings/:id` and `PATCH /meetings/:id` (`{ ...rest, hasPassword:
  !!password_hash }`) and by the public guest-join path (`mintGuestSession`), both already stripping
  it correctly — confirmed this wasn't a systemic gap in the file, just five call sites that never
  got the same treatment. **Fixed** all five to match the established pattern; re-ran the original
  reproductions on all five (by-code as a non-host colleague, create, join as a non-host colleague,
  cancel, end) and confirmed the hash is gone from every one while `hasPassword` still reports
  correctly.
- **Trace — real adversarial testing of the public guest-join surface**: public `GET /meetings/:id`
  correctly returns only minimal, disclosure-safe fields (no `password_hash`, `tenant_id`, or
  `host_id`) and correctly 404s/410s for a guest-disabled or ended/cancelled meeting. A wrong password
  was correctly refused (`403`); the correct password on a waiting-room-enabled meeting correctly
  returned `{waiting:true}` rather than full access. **Found a real bug on the admitted-guest path**:
  polling `GET .../waiting-room/status` with a valid, already-`ADMITTED` guest token **re-minted a
  brand-new guest session — a new `bliss_meeting_participants` row and a new guest JWT — on every
  single poll**, not just the first; three consecutive polls produced three separate duplicate "Real
  Guest" attendance records for one actual person, confirmed directly against Postgres. This is a
  realistic, easily-triggered bug for a polling-based endpoint (a network retry or a double-effect
  fires it, not a contrived edge case), silently corrupting attendance history and participant counts
  on every meeting metrics view. **Fixed** with an atomic claim (`UPDATE ... WHERE status =
  'ADMITTED'` flips it to a new terminal `JOINED` state) so only the request that actually wins the
  race gets to mint a session; every other call — including two genuinely concurrent pollers — sees
  the already-decided state instead. Re-verified live: three consecutive polls after a fresh
  admission now produce exactly one participant row, with only the first poll carrying the join
  payload. Also verified: a guest token from one meeting was correctly refused against a *different*
  meeting's waiting-room-status endpoint (`404`) — no cross-meeting session hijack via a leaked or
  reused token; a locked meeting correctly refused a guest join (`403`) even with the right password.
- **Reviewed, not live-tested — the WS-level guest message-type restriction**: `calls.routes.ts`'s own
  header comments claim a guest connection may only ever send `offer`/`answer`/`ice` (1:1 mesh
  negotiation) and `room-chat`/`room-reaction`/`room-status` (core meeting experience) — never a host
  control like `host-remove` or a meeting-tool broadcast. Read the actual `/signal` WebSocket handler
  directly and confirmed the enforcement is real and wired in at both the message-type level
  (`GUEST_RELAY_TYPES`/`GUEST_ROOM_BROADCAST_TYPES` allow-lists, silently dropping anything else) and
  the meeting-scope level (a guest's messages are dropped outright if they don't match the
  `meetingId` claim baked into their own token) — not merely asserted in a comment with no code behind
  it. Not exercised with a real WebSocket client this pass (would need a hand-built WS test harness);
  the code path itself is simple and directly readable, and this is disclosed as a review-by-reading
  rather than a live-fire test, the same honest distinction this arc draws elsewhere for hard-to-reach
  surfaces (e.g. HUD-0111's federated-login branches, HUD-0116's real OAuth consent screen).
- **Test-artifact handling:** all real test meetings created (create/cancel/join/guest-flow
  reproductions) were ended or cancelled via their own real endpoints; the duplicate participant rows
  created while reproducing the idempotency bug were left as a real, permanent record of a real
  reproduced bug (matching this arc's convention of not scrubbing genuine test evidence after a fix
  is verified) since the meeting itself was already ended and out of any live metrics view. `tsc
  --noEmit` clean; full suite green (12 files/140 tests, up from 136 — continued concurrent-CMS-
  session growth); `check:triggers` OK (same unrelated warnings). Shared dev server (port 3001) used
  directly throughout, confirmed healthy after each reload.

### HUD-0119 — Phase 5: Bliss Team Chat (`chat.routes.ts` — channels/DMs/groups/messages/reactions, real-time WS push) traced live and adversarially · CLEAN (no finding); one pre-existing, already-disclosed, inert data artifact noted
- **Category:** Security + functional correctness (Phase 5, seventy-fifth journey). Real team chat —
  channels, DMs, groups, messages, emoji reactions, unread tracking, favorites, notification-centre
  integration, and a `chat.message_received` WebSocket push — never traced this arc's Phase 5 (an
  earlier, pre-arc pass fixed fabricated-feature/dead-endpoint issues here in August). The file's own
  comments already name several of the exact traps this arc looks for, so the value here was proving
  those claims live rather than trusting the comments.
- **Trace:** `CUSTOMER` role correctly refused the entire app (`403`) before any route logic runs.
  Drove the real golden path: `GET /channels` correctly bootstrapped a `#general` channel with every
  real active staff member on first access; created a real DM between two real users, sent a real
  message, confirmed a real, correctly-attributed `notifications` row was created for the recipient
  (app `bliss`, type `chat`, the real sender's name in the title) — not just a `200`; confirmed the
  recipient's own `GET /channels` correctly computed `unread: 1` and surfaced the right last-message
  preview; added and then removed a real emoji reaction, confirming the toggle-on/toggle-off pair.
  **Adversarially attacked the membership/tenant boundaries from three different angles**: a
  completely unrelated third tenant's real JWT was refused reading, posting to, or reacting inside the
  DM (`403`/`404`) — the reaction check in particular confirmed the message lookup itself is
  tenant-scoped, not just the channel; a **same-tenant colleague who simply wasn't part of this
  specific DM** was independently refused reading it, posting to it, and even favoriting it — the more
  realistic "can I snoop on a colleague's private conversation" attack, distinct from the cross-tenant
  case and separately confirmed; and creating a real DM with a genuine cross-tenant user id was
  refused outright (`404`, "User not found") before any channel was even created. Created a real group
  with one valid same-tenant member id and one fabricated cross-tenant id in the same request and
  confirmed directly against Postgres that only the valid member was actually added — the invalid one
  silently dropped exactly as the code's own comment describes, not merely trusted from reading it.
  Verified the leave-vs-delete split live: a non-creator "deleting" a group correctly only removed
  their own membership (the group survived for the remaining member), while the actual creator
  deleting it produced a genuine, cascaded hard delete (confirmed the row was gone from Postgres
  afterward). Confirmed `GET /channels/browse` correctly never surfaces DMs and correctly excludes a
  channel the caller already belongs to.
- **No bug found** — the CUSTOMER block, the bootstrap, cross-tenant DM/group-member rejection at
  creation time, the tenant-scoped message lookup behind reactions, both non-member attack angles
  (cross-tenant and same-tenant), and the leave/delete split all held under live, adversarial testing.
  No code changes this pass.
- **One pre-existing, already-disclosed artifact, not a live bug**: the dev tenant's own `#general`
  channel — bootstrapped before this file's own documented `HUD-0024 continuation` fix (visible in
  its header comment) was in place — still lists a real `CUSTOMER`-role account among its members,
  confirmed live via `GET /channels`. The fix itself is real and correctly stops this for any
  newly-bootstrapped tenant (the file's own `.where('role', 'not in', ['CUSTOMER', 'ORG'])` on the
  seed query, confirmed by reading it), but is forward-only — it never retroactively cleaned up a
  tenant where the bug had already run once. Confirmed this is inert, not reachable: the file's own
  CUSTOMER-role block fires before any route handler runs regardless of membership rows, so the
  affected account has no way to actually use this stale membership for anything. Noted for
  completeness rather than filed as a finding — a one-time data cleanup, not a functional or security
  gap, and the dev tenant's own historical artifact rather than something a production tenant created
  after the fix would ever encounter.
- **Test-artifact handling:** the test reaction was toggled back off; both parties left the test DM
  (its `chat_channel_members` rows removed) — a DM's own `chat_channels` row and its one test message
  were left in place, matching the file's own documented "a DM never fully deletes" design (no delete
  path exists for the channel row itself, only per-user membership); the test group was hard-deleted
  by its own creator via the real endpoint, the cleanest possible path. Shared dev server (port 3001)
  used directly throughout, confirmed healthy.

### HUD-0118 — Phase 5: Onsite AgencyHost — the cross-tenant agency-manages-real-client-tenants surface (`onsite-agency.routes.ts`/`onsite-agency-manage.routes.ts`/`agency-access.ts`) traced live and adversarially · CLEAN (no finding)
- **Category:** Security + functional correctness (Phase 5, seventy-fourth journey). The exact same
  *shape* of surface that HUD-0117 (the previous journey) just found catastrophically broken in the
  Developer Platform — an id taken straight from the URL, naming a resource that belongs to a
  *different* real tenant, with the caller's own tenant identity supposed to gate access to it. Never
  traced. Chosen deliberately right after HUD-0117 to check whether that failure mode was systemic to
  the codebase or local to one file.
- **Trace:** created a real, genuinely independent client tenant via `POST /v1/onsite/agency/clients`
  (`AgencyTenantService.createManagedClientTenant` — a real `tenants` row, a real pending
  `hr_invitations` row for the named admin email, and a real `agency_managed_tenants` relationship
  row, all in one transaction) — confirmed duplicate-subdomain correctly refused (`409`). Drove the
  full golden path as the agency against the new client: overview (correctly zeroed for a brand-new
  client), attach a domain, add a real DNS A record, register an application, attempt a deploy
  (correctly refused with an honest `409` — no CI provider connected in this dev environment, not a
  fabricated success). **Adversarially attacked the tenant-pinning `verifyAgencyClientAccess`
  middleware three ways**: a genuinely unrelated third tenant's real `TENANT_ADMIN` JWT was refused
  (`404`, not confirming the client id even exists) on both a read (`GET /overview`) and a write
  (`POST /domains`) against the exact same client id the legitimate agency was actively managing; the
  **client tenant itself**, using a JWT scoped to its own tenant id, was also correctly refused
  reaching this same agency-management surface for itself (this route only ever grants the *agency*
  side of a relationship, never a tenant self-service path) — confirming the check pins both
  directions of the relationship, not just one. Tested the **detach lifecycle**: the agency releasing
  the client immediately revoked further management access (`404` on the next `GET /overview`) while
  leaving the client's own real domain data completely untouched, confirmed directly against
  Postgres — a real "disconnect the relationship, don't destroy their infrastructure" design, not a
  regression waiting to happen; detaching an already-detached relationship was correctly refused
  rather than double-processed. RBAC: `JUNIOR` and `CUSTOMER` both correctly refused the client-
  creation/listing routes (`403`).
- **No bug found** — this file's own header comment on `verifyAgencyClientAccess` explicitly names
  the exact cross-agency attack this trace tried, and the check held under direct live testing from
  all three angles (an outsider, the client itself, and repeated/already-detached actions). This is a
  meaningful, evidence-backed contrast to HUD-0117's finding in the very same area of the codebase
  (cross-tenant resource delegation) — proof that the earlier failure was local to the Developer
  Platform's specific routes, not a systemic pattern across every cross-tenant surface this arc has
  now checked. No code changes this pass.
- **Test-artifact handling:** both real test client tenants were detached from the agency relationship
  via the real `/detach` endpoint, then deactivated via the real `PATCH /v1/superadmin/tenants/:id`
  (`active:false`) rather than left as two permanently-active spurious tenants — matching this arc's
  preference for using a real deactivation path over leaving clutter when one exists. The domain/DNS/
  application rows created under the first test tenant were left in place (harmless, inert once the
  tenant itself is deactivated, and there's no dedicated delete path for this specific combination
  worth exercising just to tidy up). Shared dev server (port 3001) — found stopped at the start of
  this session for reasons unrelated to this trace, relaunched per this arc's established precedent
  for that exact situation — confirmed healthy throughout.

### HUD-0139 — Phase 5: full NexusHR app pass, page by page, every button/API/UI point (30 pages/tabs across `hr.routes.ts` + 10 sibling route files, live in a real browser) · Found+fixed a platform-wide component bug (`DatePicker`'s hidden form-submit input lived inside the popover content Radix unmounts on close, so every uncontrolled/`name`-based date field silently submitted nothing), a customer-portal-accounts-leak-into-staff-pickers bug affecting 28+ files platform-wide, a dead payroll-run lifecycle (create-only, no calculate/approve/pay/distribute in the UI though the API fully supports it), a stale-decision hole in leave approvals, and the same malformed-UUID/raw-error-leak bug class as HUD-0138
- **Category:** Functional correctness + UX (user directive: "lets go to nexushr, check everything and every api"). Method: same Playwright-harness approach as HUD-0138, driving all ~30 NexusHR routes/tabs, cross-checked against `hr.routes.ts` (4.4k lines), `nexushr.routes.ts`, `leave.routes.ts`, `overtime.routes.ts`, `hr-cases`/`hr-checklists`/`hr-benefits`/`hr-training`/`attendance-devices`.routes.ts, `payroll.routes.ts`, `org-chart.routes.ts`.
- **Bug class recurrence (6th): raw-error-leak + malformed-UUID**, same shape as HUD-0138 but with a fix generalized this time: a new `requireUuidParams(fastify)` preHandler (`middleware/uuid-params.ts`) rejects any non-UUID `:id`/`:xId` param with a clean 400 before the handler runs, registered once per plugin right after `authenticate` — added to all 11 files above (105 `:id` routes covered) instead of a per-route zod schema. Also generalized the global handler's driver-error branch: `utils/db-errors.ts` now maps a raw pg SQLSTATE to the right 4xx (`23505`→409 duplicate, `23503`→409 FK, `22P02`/`23502`/`23514`→400) instead of a blanket 500, and `nexushr.routes.ts`'s 29 local catches were changed to rethrow a real driver error to that handler instead of forwarding `err.message`.
- **CRITICAL-adjacent, platform-wide component bug found via Holidays' silently-broken "Add Holiday":** `ui/date-picker.tsx`'s `DatePicker` renders its FormData-participating `<input type="hidden" name=… />` *inside* `PopoverContent` — which Radix unmounts the instant the popover closes, and `handleSelect` closes it immediately on picking a date. So by the time a caller's `<form>` submits, the date is gone from the DOM and `new FormData(form)` never sees it — not a wrong value, no value at all, and every affected form failed *silently* (the `if (!date) return` guards had no error branch). Confirmed via `page.evaluate(() => new FormData(document.querySelector('form')))`: even a `defaultDate={new Date()}` never appeared unless the user physically opened that calendar first. All 5 call sites hit this — Holidays' "Add Holiday" (root cause found here), Attendance's bulk-mark start/end date, Shifts' bulk-assign start/end date. Fixed by moving the hidden input to a sibling of `PopoverContent` (survives close); re-verified all 3 forms now populate correctly, including the two bulk forms' defaults with no picker interaction at all.
- **Platform-wide correctness bug: customer-portal logins leaking into "staff.":** `GET /v1/hr/staff` had no role filter at all — it's the platform's single shared "internal people" endpoint (grepped: 28+ files call it — Pipeline/Leads deal-and-lead-owner assignment, Chat/Calls participants, Tasks assignees, Sign recipients, every HR picker) and it returned every `users` row for the tenant including `role='CUSTOMER'`. Live-confirmed 2 of 11 rows in the dev tenant were customer portal logins ("Aliko Dangote Jr", "Sample Contact") appearing in "Manage Staff" and every picker built on it — assignable as a deal owner, addable to a team, nameable in a disciplinary case, eligible for a department/designation. Fixed with `.where('users.role', '!=', 'CUSTOMER').where('users.role', '!=', 'ORG')` on the one query; re-verified live (staff list count 11→9, both dropped) and via `npx vitest run` (206/206, nothing depended on the old behavior).
- **Payroll: the UI could create a run and nothing else.** `PayrollPage` (`HRM.tsx`) had `createRun()` and nothing else — `calculate`/`approve`/`mark-paid`/`distribute`/bank-file/PAYE-PDF all exist as thorough, well-guarded API endpoints (`payroll.routes.ts`, 409s with plain-language reasons at every wrong-state transition) with zero frontend caller, so a real payroll run could never actually be run to completion from the app — confirmed this gap predates the current session (present in `git show HEAD`, not a regression). Built a run-lifecycle panel: a stage stepper (Draft → Calculated → Approved → Paid), and the matching action per stage (Calculate/Delete draft, Approve/Recalculate, Mark as paid, Send payslips + Bank file CSV + PAYE PDF), each behind a `showConfirm` naming the real consequence ("figures are frozen", "posts to the general ledger and cannot be undone"), gated to `PAYROLL_ROLES` to match the API. Also added `DELETE /v1/payroll/runs/:id` (DRAFT-only — a mis-clicked "Add Payroll" had no way to undo since nothing ever set a run CANCELLED) and wired it into the panel. Verified live end to end: create→calculate (with a real "N people skipped, no salary" warning)→approve confirm-and-cancel→delete-draft→bank-file CSV download→PAYE PDF open, against the tenant's one real PAID run and a series of disposable test runs, all cleaned up after.
- **Leave approvals had no state machine.** `PATCH /leaves/:id/status` let any status move to any other status with no ordering check, and re-approving an already-approved (or previously-rejected) request re-emitted `hr.leave_approved` each time — a downstream Studio automation firing repeatedly for one decision. Also allowed self-approval by a MANAGER (the one non-admin role permitted to decide leave). Fixed: a `REJECTED`/`CANCELLED` decision is now final (only `PENDING→{APPROVED,REJECTED,CANCELLED}` and `APPROVED→CANCELLED` are legal, others 409); same-status is a no-op 200, not a re-fire; a MANAGER can no longer approve/reject their own request (403, admins still can). Live-verified every transition and the self-approval block.
- **"Add Leave" was a dead button.** `LeavesPage`'s button just toggled `showNew`, but nothing was ever conditionally rendered on it — clicking it did nothing, at HEAD and before. Built the form (employee Combobox, leave-type Select populated from the tenant's real `hr_leave_types`, From/To DatePicker, optional reason) directly on top of the already-solid backend (server computes the real working-day count excluding holidays/weekends, refuses date-overlaps with an existing pending/approved request, checks the entitlement ledger) — no new validation logic needed client-side beyond required-field prompts. Also hardened `handleStatus` to roll back its optimistic UI update and show the server's real error on failure (was previously silent). Live-verified: empty-state validation, full submit, and the server's overlap-refusal path (409 surfaced) all shown correctly in the UI.
- **Structural integrity added to Departments/Designations/Teams**, none of which is a raw-error fix but all three shared the same shape of gap (no duplicate check, no dangling-reference guard, one write-only-no-edit/no-delete surface): Departments and Designations now refuse a case-insensitive duplicate name/title (scoped to department for designations) and validate `head_user_id`/`department_id` actually belong to the tenant before accepting them; deleting a department or designation still holding active staff is refused (409, names the count) rather than silently `ON DELETE SET NULL`-ing it off every affected person; deleting one that still has workforce-planning headcount rows is refused rather than cascading them away. Teams gained `PATCH`/`DELETE` (previously creatable and member-editable but never renameable or removable) with the same duplicate-name check. Staff role/status changes gained a last-admin guard (`assertNotLastAdmin`) — demoting or deactivating the tenant's only remaining SUPER_ADMIN/ADMIN/TENANT_ADMIN is now refused (409), and a user can no longer deactivate their own account (409) or (unless already SUPER_ADMIN) change or deactivate a SUPER_ADMIN's account (403). Frontend gained the matching Delete (Departments) and Rename/Delete (Teams) UI, previously absent even though nothing blocked them at the API once added. All guards live-verified, including the last-admin path against the real admin account (confirmed untouched after the refusal).
- **Also found+fixed:** `HrDocuments.tsx` called a long-dead `/v1/hr/employees` (404, silently swallowed — the page's "attach to employee" / "generate letter for" picker had been empty in every tenant since the person/login merge) — repointed to `/v1/hr/staff`. `generate-letter`'s employee-name lookup was missing its `tenant_id` filter (RLS-safe, but not an explicit-filter query per this repo's own rule) — added. Three route files' schemas (`head_user_id`, `lead_user_id`, `department_id`, `shift_id`) rejected an explicit `null` sent by their own frontend forms to clear an optional link — `.optional()` → `.nullish()`.
- **Verified clean (no change needed) after a full click-through:** Employees/Manage Staff, Groups, Org Chart, Employment Records, Workforce Planning, Recruitment (job/candidate/interview/offer flow), Clock-in, Attendance, Attendance Devices, Shift Roster (bulk-assign fixed by the DatePicker root-cause fix above), Overtime (already had a proper state machine — paid-lock, cap re-check at approval, reason-required-on-reject — used as the reference shape for the leave fix), My Payslips, Benefits, Training, Announcements, Surveys, Cases, Checklists, Activity Logs, Delete Requests, My HR / StaffDetail.
- **Verification:** `tsc --noEmit` clean in both apps throughout; API vitest 206/206 after every backend change (up from 195 at the end of HUD-0138 — 11 new tests landed from elsewhere in the repo during this session, unrelated to this pass); every test record created (departments, designations, teams, holidays, a leave request, a payroll draft run, a goal, a case, a delete request) was cleaned up or, where no delete path exists by design (cases, goals — audit-trail-shaped records, matching this arc's payroll/invoice precedent), left clearly labeled and moved to a closed/cancelled state rather than force-deleted.
- **Open / not done:** "Speeding"-shaped gaps aside, nothing found this pass was left unfixed. Not investigated: `escalations.routes.ts`'s `requireRole(...INTERNAL_ROLES)` excludes `TENANT_ADMIN`/`OFFICER` (the legacy role aliases) since `INTERNAL_ROLES` in `@hudumika/types` only lists the 7 non-deprecated internal roles — noticed while checking `INTERNAL_ROLES` for reuse in the staff-list fix above (not reused, for this same reason), but Bliss escalations is outside this pass's scope.

### HUD-0138 — Phase 5: full CRM app pass, page by page, every button/API/UI point (13 pages, 11 backend route files, live in a real browser) · Found+fixed a platform-wide CRITICAL UI bug (every Select/Combobox/EntityPicker/DatePicker inside any `Dialog` was invisible and unclickable), a systemic raw-error-leak + malformed-UUID bug class across 11 route files, and 8 smaller functional gaps
- **Category:** Functional correctness + UX (user directive: "go app by app… every button, every api, every UI
  point of crm app and make everything fully functional, production ready"). Method: a Playwright harness
  (self-signed session cookie + CSRF cookie + a seeded `localStorage.hudumika_user`, because `useAuth.tsx`
  bootstraps from localStorage and a bare cookie lands on the login page) driving each of the 13 pages in
  `CRMShell.tsx`, cross-checked against the backend route each button calls.
- **CRITICAL — platform-wide, found via CRM's Quotation dialog:** `ui/dialog.tsx`'s overlay and content were
  `z-[9999]` (bumped from `z-50` in a July commit) while every Radix floating primitive — Select, Popover
  (→ EntityPicker, Combobox, DatePicker), DropdownMenu, ContextMenu, Menubar, HoverCard, Tooltip, plus
  Sheet/Drawer — sits at `z-3000`. Any dropdown opened *from inside a Dialog* therefore rendered underneath the
  dialog's own opaque content: invisible, and a click on where it appeared hit the DialogOverlay instead
  (which closes the dialog). Live-confirmed with `document.elementFromPoint()` on both Sales' New Quotation
  (customer picker, currency, shipment type, tax code) and Pipeline's New Deal (currency, owner) — the
  element under the pointer was the overlay `div`, not the option. Fixed at the root: Dialog overlay+content →
  `z-3000`, equal tier + later portal mount order paints the dropdown on top (the same relationship Sheet/Drawer
  already had). Re-verified: option button is now the `elementFromPoint` target; quote creation completes
  (201); Sheet→Dialog hand-off unaffected. Same shape found in two hand-rolled backdrops outside CRM
  (`.s-lic-backdrop` in Settings.css — hosts a Combobox; `.onsite-modal-overlay` in Onsite.css — hosts a Select
  in OnsiteDomains) at `z-9999`, both lowered to `2000`; Onsite fix confirmed live. `.modal-overlay` (z 200) was
  already safe. Not fixed: `FileBrowser.tsx`'s own `z-[9999]` (not a Dialog wrapper, not investigated).
- **Backend — raw-error-leak + malformed-UUID sweep (11 files):** every `:id` route in the 7 `crm-*.routes.ts`
  files plus `quotations`, `customers`, `leads`, `deals` took the URL param straight into a Kysely `.where('id',
  '=', id)`, so a non-UUID id reached Postgres (`invalid input syntax for type uuid`). In the 7 settings files
  the global sanitizer turned that into an opaque 500 (wrong code); in `customers`/`leads`/`deals`/`quotations`
  the files' own `catch (err: any) { return reply.status(500).send({ error: err.message }) }` bypassed the
  sanitizer and **leaked the raw driver text to the client** (live-confirmed). Fixed uniformly with a per-file
  `idParamSchema = z.object({ id: z.string().uuid() })` (ZodError → 400 via the global handler) and removal of
  the pass-through catches; legitimate business-rule throws kept via dedicated error classes
  (`SmartViewValidationError`, `PipelineStageError`). `/merge` in customers/leads moved its existence check
  before the mutating transaction (was 500, now 404). This is the HUD-0097 bug class, its fifth recurrence.
- **Also found+fixed (backend):** `quotationService.updateStatus`/`convertToShipment` used
  `executeTakeFirstOrThrow()`; a well-formed-but-nonexistent id threw a Kysely `NoResultError` (no SQLSTATE, so
  the global handler didn't sanitize it) → bare `500 "no result"` on `PATCH /:id/status` and `POST /:id/convert`.
  Now `404`; the one business-rule throw ("Only approved quotations can be converted") is mapped to `400`.
  `POST /customers/:id/invite` fabricated success (`console.log` + hardcoded `{success:true}`, zero frontend
  callers) — now an honest `501` explaining what would actually create a portal login.
- **Also found+fixed (frontend):** Customers page never wired the Activity timeline / Compose Email / Start
  Call components Leads and Pipeline already had (added, live-verified); Custom Fields had no edit (add/delete
  only) — Edit added; Saved Views' `label` rule kind asked the user to type a raw label UUID (backend requires
  one) — replaced with a real label picker, and saved-rule summaries show the label name; Pipeline deal modal
  had no delete though `DELETE /deals/:id` works — added; Partners Directory's "Delete" called
  `DELETE /v1/customers/partners/:id`, **a route that has never existed** (always 404) — rewired to the real
  `PATCH /:id/partner {is_partner:false}` (reuses its 409 guard against orphaning a partner-only record; the
  user is told why and what to do instead).
- **Verified clean (no change needed):** Pipeline stages, Lead scoring (create/toggle/delete — its Selects were
  unusable before the Dialog fix), Duplicates, Bulk upload (real CSV → real inserts), New-customer onboarding,
  Customer overview, Leads (create/edit/view/convert-to-deal/delete), Sales (create/edit/status/convert/delete).
- **Verification:** `tsc --noEmit` clean in both apps; API vitest 195/195 after each backend change; all test
  records created during the pass were deleted.
- **Follow-up fixes (same day):** (1) Sales' Delete button (card + detail panel) is now shown only to
  `MGMT_ROLES`, mirroring the API's `QUOTE_DELETE_ROLES`; create/edit/status/convert stay open because
  `QUOTE_WRITE_ROLES` is identical to `CRM_ROLES` (everyone who can reach the page). Verified live per role:
  admin and manager see Delete, sales sees Edit but no Delete. (2) The web suite's only test,
  `CompanyCard.test.jsx`, had never run — it imported a non-existent `.jsx` path, used `jest.fn()` in a vitest
  project, and needed `@testing-library/react`/jsdom, none installed. Rewritten as `CompanyCard.test.tsx`
  using `react-dom/server` (no new dependencies, per AGENTS.md); web suite now 3/3.
- **Partners Directory delete (closed):** the row menu now depends on the record. A company that is also a
  customer gets "Remove from directory" (un-flag via `PATCH /:id/partner`; customer record untouched). A
  partner-only record — which every partner added through this page's own "Add Partner" is — gets "Delete
  partner", a **soft** delete via the existing `DELETE /v1/customers/:id` (`deleted_at`; already excluded from
  the partners list, still resolvable by id so historical documents keep the name), shown only to
  SUPER_ADMIN/ADMIN/TENANT_ADMIN, the roles the API allows. No backend change. Verified live as admin
  (both paths) and as sales (partner-only → "View profile" only).
- **Open / not done:** none from this pass.

### HUD-0137 — Phase 5: Fleet Tracking (`tracking.routes.ts`/`tracking-device.routes.ts`/`gpswox.service.ts` — real vehicle GPS tracking, per-device credential auth, geofencing, GPSWOX sync) traced live and adversarially · Found+fixed a real MEDIUM gap: geofence-breach alerts were fully wired end to end except the one write that actually surfaces them, so `TrackingAlerts.tsx`'s own promised "geofence breach" alert category has never once fired
- **Category:** Functional correctness (Phase 5, ninety-seventh journey). Never traced this arc — the
  RBAC sweep (HUD-0024) only ever checked these files' role gates, and HUD-0110's GPSWOX work covered
  the *inbound webhook* security surface, not this outbound-facing fleet-management/device-ingestion
  one. A real, substantial surface: per-vehicle device credentials (migration 396) for unauthenticated
  physical-tracker ingestion, a shared radius-based geofence ENTER/EXIT detector reused by both the
  direct-device path and the GPSWOX sync job, and a live WS broadcast on every position update.
- **Trace (device authentication — clean):** created a real vehicle via `POST /vehicles`, confirmed
  the response is the *only* place `device_secret` is ever returned (verified live: an immediate
  `GET /vehicles` on the same vehicle correctly omits it, matching the route's own comment). Then
  attacked the unauthenticated `POST /tracking/device/positions/ingest` endpoint directly: a wrong
  secret for a real device id correctly `401`s ("Invalid device credentials"); a device id that
  doesn't exist at all correctly `404`s ("Unknown device") rather than leaking which branch failed;
  the correct secret correctly `200`s and a real `vehicle_positions` row lands. `crypto.timingSafeEqual`
  is used for the comparison (not `===`), and a length mismatch is checked before it's called (Node's
  own `timingSafeEqual` throws on unequal-length buffers rather than returning `false`) — both
  correctly handled.
- **Evidence (real MEDIUM gap found and fixed):** `fleet_alerts.alert_type`'s own column comment has
  named `GEOFENCE_BREACH` as a real value since the table was created (migration 055), and
  `TrackingAlerts.tsx`'s own page subtitle promises "Speeding, geofence breach, maintenance & document
  alerts." Grepped every `insertInto('fleet_alerts')` in the codebase: exactly two call sites exist —
  a human-created alert via `POST /alerts`, and an automatic `DEVICE_OFFLINE` alert in
  `gpswox.service.ts` — and **`GEOFENCE_BREACH` is never once written by either**. `checkGeofenceTransitions()`
  (shared by both ingestion paths specifically so the detection logic "can't drift between them," per
  its own header comment) correctly detects every ENTER/EXIT and writes it to `vehicle_geofence_events`
  — but nothing anywhere ever reads that table back into an alert a human could see. Live-confirmed the
  silent-failure shape directly: created a geofence around a vehicle's current position, reported a
  position update landing squarely inside it — the ENTER was correctly recorded in
  `vehicle_geofence_events` — and `GET /alerts` came back with zero `GEOFENCE_BREACH` rows, confirming
  the page's own promised alert category has never fired for any tenant, ever. Also confirmed
  "Speeding" is equally unimplemented, but for a different, more fundamental reason: grepped the whole
  schema and found **no speed-limit column exists anywhere** (not on `vehicles`, not on `geofences`,
  not a tenant-level default) — there is no threshold to compare against at all, not just a missing
  wire-up.
- **Fixed the geofence half** (narrowly scoped, matching the shape of gap this arc closes on sight
  rather than documents): `checkGeofenceTransitions()` now inserts a real `fleet_alerts` row on every
  ENTER/EXIT alongside the `vehicle_geofence_events` row it already wrote, threaded through both call
  sites (`tracking-device.routes.ts`'s direct ingestion and `gpswox.service.ts`'s sync loop, both of
  which already had the vehicle row in scope — added `name` to each select rather than an extra
  query). Severity is `WARNING` for entering a `RESTRICTED`-type zone (the one `zone_type` this schema
  already treats as meaningfully different, per its own column comment) and `INFO` for every other
  zone_type and for every exit — a routine PORT/CUSTOMS_CHECKPOINT crossing isn't the same class of
  event as entering a zone a vehicle shouldn't be in. Deliberately does **not** also fire a live push
  notification the way a human-created alert does (`POST /alerts` → `notifyFleetManagers`) — matches
  this same file's own existing convention for the *other* auto-detected alert type, `DEVICE_OFFLINE`,
  which doesn't notify either, so this isn't introducing a new inconsistency.
- **Deliberately left undecided, not guessed at:** "Speeding" alerts, since there is no speed-limit
  value anywhere to compare against — inventing a flat platform-wide threshold (and deciding whether
  it's overridable per-vehicle or per-zone) is a product decision this trace can't make unilaterally,
  matching this arc's standing rule for design-level gaps (Demurrage's liability field and Supplier's
  blocked-status enforcement were both exactly this shape before being explicitly fixed on request —
  this one is flagged the same way in case a future turn is asked to add it).
- **Re-tested live, the exact reproduction plus the fix:** real vehicle → wrong-secret ingest (`401`) →
  nonexistent-device ingest (`404`) → correct-secret ingest outside any zone (`200`, no alert) → create
  a `RESTRICTED` geofence around that same point → ingest again at the identical point → `vehicle_
  geofence_events` gets a real `ENTER` row *and* `GET /alerts` now returns a real `GEOFENCE_BREACH`
  alert, `severity: "WARNING"`, naming the vehicle and zone by name → moved the vehicle far away →
  a real `EXIT` alert fires for *every* zone it was inside, including a genuine pre-existing tenant
  geofence ("Dar Port Zone") the vehicle happened to also be sitting in — a useful, unplanned
  confirmation that the fix works against real production data, not just the synthetic test zone →
  re-ingested the identical far-away point a second time and confirmed the alert count did **not**
  grow (the pre-existing "only fires on an actual transition" dedup logic still holds with alerting
  now wired in, not just event-logging).
- **Test-artifact handling:** the four test alerts were acknowledged via the real
  `PATCH /alerts/:id/acknowledge`. The test geofence was removed via the real `DELETE`. Vehicles have
  no hard-delete endpoint anywhere in this codebase (consistent with Sign/SEAL/payroll/recruitment's
  own no-hard-delete convention already noted elsewhere in this arc) — the test vehicle was instead
  set to `status: "OUT_OF_SERVICE"` with a labeled `lifecycle_notes` explaining why, via the real
  `PATCH /vehicles/:id`, rather than left silently active in the fleet list. `tsc --noEmit` clean;
  full suite green (190/190 tests, 13/13 files — +3 from a concurrent session's own unrelated work
  since the last check); `check:triggers` OK (same pre-existing, unrelated concurrent-CMS-session
  warnings this arc has flagged repeatedly). Shared dev server (port 3001) used directly throughout,
  confirmed healthy.

### HUD-0117 — Phase 5: the Developer Platform (`developer.routes.ts`/`developer.service.ts`/`developer-gateway.service.ts`) traced live · Found+fixed a real CRITICAL cross-account/cross-tenant authorization bypass, a HIGH broken-feature bug, and a LOW input-validation gap; found (documented, not fixed) a HIGH fabricated-verification-data issue and a MEDIUM broken usage-metering pipeline
- **Category:** Security + functional correctness (Phase 5, seventy-third journey). The "Developer"
  app — 15% on the readiness dashboard, the platform's lowest-rated, Foundational-tier app — is a
  real, substantial (1,400+ lines across the two service files) external-facing API-gateway/developer-
  console product: Individual/Organization "developer accounts" (deliberately *not* Hudumika-tenant-
  scoped — any authenticated Hudumika user, any tenant, is a potential developer), Projects,
  API-key Credentials, a prepaid Billing ledger, and a live `/gateway/*` endpoint that authenticates
  an external caller's API key and executes a catalog of "API products." Never traced — the low
  headline rating turned out to undersell how large the surface actually is, and overstate how
  contained the risk was.
- **Trace, CRITICAL finding**: none of the 13 authenticated, account-/project-scoped console routes
  (`GET/POST /accounts/:id/members`, `DELETE /accounts/:id/members/:memberId`, `GET/POST
  /accounts/:id/projects`, `GET/POST /projects/:id/credentials`, `POST
  /projects/:id/credentials/:credId/revoke`, `GET /projects/:id/entitlements`, `POST
  /accounts/:id/subscribe`, `GET /projects/:id/analytics`, `GET /accounts/:id/billing`, `POST
  /accounts/:id/billing/topup`) ever verified the caller owns — or is an active member of — the
  account/project named in the URL; `fastify.authenticate` was the *only* gate. Live-proved this with
  two real accounts belonging to two different real users in two different tenants: the second
  user's real JWT could list the first user's real projects, **read the first user's real prepaid
  billing balance** (`balance_credits: 50000`), and — the most severe step — **mint a brand-new,
  unrestricted-scope (`scopes: ["*"]`), live `PRODUCTION`-environment API credential against the
  first user's own project**, receiving the real raw key back in the response. Confirmed that
  fabricated credential genuinely authenticates against the live `/gateway/*` endpoint (reached past
  the API-key auth check to a real entitlement check), proving full exploitability end to end, not
  just a theoretical read. Since developer accounts are deliberately outside the tenant model, this
  bypass has zero relationship to RLS/`withTenant` and was reachable by *any* authenticated user
  platform-wide against *any* other user's developer account, given only the account/project UUID.
- **Fixed**: added `DeveloperService.assertAccountAccess(accountId, userId)` (owner-or-active-member)
  and `assertProjectAccess(projectId, userId)` (resolves the project's account, then applies the same
  check) — both throwing a generic 404 rather than a 403, deliberately not distinguishing "doesn't
  exist" from "not yours," matching this codebase's existing enumeration-safety convention for
  cross-user resource ownership (recovery-requests, join-requests). Wired into all 13 routes. Also
  closed a narrower variant on `POST /accounts/:id/subscribe`: the route only ever validated the
  *account* id belonged to the caller, but `subscribeAndEntitle` bills that account while writing the
  entitlement against whatever `project_id` the request body separately names — without an explicit
  cross-check, a caller could still pass their own real account id alongside a *different* developer's
  real project id in the body. Fixed by resolving the body's `project_id` through the same
  `assertProjectAccess` and rejecting a mismatch. Re-ran the exact original three-step reproduction
  (list projects → read billing → mint a credential) against the same two real accounts — all three
  now correctly refused (`404`) — then reconfirmed the legitimate owner's own identical calls still
  succeed unchanged, and separately added a real active org member and confirmed the membership
  branch of the new check (not just the ownership branch) also grants access correctly.
- **Trace, HIGH finding**: `POST /accounts/:id/members` (invite an org member) was **completely
  non-functional** — every attempt with a real, existing Hudumika email failed with "User ... does not
  exist on Hudumika. They must register first," even though the email genuinely belonged to a real,
  active account. Root cause: `DeveloperService.addOrgMember` looked the email up via
  `db.selectFrom('users')...` — the bare, RLS-restricted connection, called with no `withTenant()`
  context, exactly the anti-pattern this repo's own `CLAUDE.md` names explicitly ("a file that
  queries the bare `db` singleton outside `withTenant()` ... RLS will reject it outright"). With no
  `app.tenant_id` set, RLS's own policy has nothing to match against and the query returns zero rows
  for literally any email, always. **Fixed** by switching to `dbPlatform` — the same
  "look this identifier up across every tenant" pattern already used for this exact class of
  pre-tenant-context lookup in `auth.routes.ts`/`onboarding.service.ts`, appropriate here since
  developer-account membership is explicitly not scoped to one tenant. Also gave the thrown error a
  `statusCode: 400` (it previously fell through the global handler's generic 500 path, since a plain
  `Error` with no status code defaults there). Re-verified live: a real existing email now
  successfully adds as a member; a genuinely nonexistent email now correctly gets a clean `400`
  instead of an opaque `500`.
- **Trace, LOW finding**: the same route accepted any string as `role` with no validation against the
  real `OrgMemberRole` enum (`OWNER`/`ADMIN`/`DEVELOPER`/`BILLING_ADMIN`/`SECURITY_ADMIN`/`VIEWER`) —
  an invalid role reached `developer_org_members`'s own database `CHECK` constraint unvalidated,
  surfacing as the same opaque, unhelpful `500` the global error handler deliberately gives raw driver
  errors. **Fixed** with an explicit allow-list check before the service call, returning a clean `400`
  naming the valid roles. Re-verified live both directions.
- **Found, documented, not fixed — HIGH, fabricated verification data presented as real**: the
  gateway's three "native operation" implementations and its "external adapter" implementations are
  **entirely hardcoded, input-independent fabricated responses**, not a stub disclosed as such
  anywhere in the product. Live-proved with a real minted sandbox key and deliberately absurd,
  obviously-fake inputs: `POST /v1/seal/verify` (marketed as the platform's own digital-execution-seal
  *verification* product) with a nonexistent seal id, a garbage signature string, and an all-zeros
  digest returned `{"valid":true,"verdict":"EXACT_MATCH","confidence_score":1}` — a verification
  endpoint that verifies nothing and always says yes. `POST /v1/business/verify` (marketed as a real
  BRELA business-registry check) with a nonsense registration number and a company name invented for
  this test returned `{"verified":true,"status":"IN_GOOD_STANDING", ...}` with the *exact same*
  hardcoded fictional directors ("John A. Temba", "Sarah K. Mushi") and TIN every single time,
  regardless of input. `landed_cost.compute` does real arithmetic but on a single hardcoded 25%
  duty-rate/18%-VAT assumption completely disconnected from ClearOS's own real, independently-audited
  EAC/AfCFTA origin-rules engine (HUD-0046 hand-verified that one to the shilling this same arc) —
  ignoring the HS code and country of origin entirely despite accepting both as input. This is a
  product-scope decision (build the real BRELA integration, real ECDSA signing/verification, and wire
  the real landed-cost engine through) far beyond a bug fix, matching this arc's standing rule for
  whole-feature gaps (Project OS, Inventory's GL wiring, Demurrage's liability field) — documented
  with exact live reproductions rather than guessed at or silently rebuilt.
- **Found, documented, not fixed — MEDIUM, usage-metering silently no-ops**: every real product
  design here assumes each gateway call is metered — `executeRoute` computes a real
  `developer_price`/`provider_cost` per call and `recordUsage` is meant to insert a
  `dev_usage_events` row (and, for external-adapter calls, a `dev_provider_settlements` row) for every
  single one. Checked directly against Postgres after three separate, distinct, successfully-executed
  (`200`) gateway calls across all three native operations: **zero `dev_usage_events` rows were ever
  created**, confirmed with a deliberate wait to rule out a timing fluke. `recordUsage` is invoked
  fire-and-forget with its own `.catch(err => request.log.error(...))`, so a failure there produces no
  visible symptom to a real caller — the gateway keeps returning clean `200`s regardless. Root cause
  not isolated (no console access to the shared dev server in this environment to read the swallowed
  error), so this is reported as an observed, reproduced fact rather than a diagnosed one. Practical
  effect is the mirror image of the fabricated-data finding above: whatever a real developer would be
  billed for calling these endpoints, it is not happening through this recorded-usage pathway today.
- **Test-artifact handling:** both minted test credentials (the cross-account exploit key and the
  legitimate owner's own test key) were revoked via the real `POST .../credentials/:credId/revoke`;
  the test org-membership was removed via direct SQL (matching the file's own `removeOrgMember`
  semantics, since no route bug blocked using the real endpoint — done via SQL only to avoid a second
  round-trip); the one leftover manual-reproduction row inserted directly into `dev_usage_events`
  while diagnosing the metering issue was deleted. The two real `developer_accounts`/`dev_projects`/
  `developer_billing_accounts` rows auto-provisioned by `GET /accounts` (a real, unavoidable side
  effect of the platform's own auto-provisioning-on-first-visit design, not fabricated test data) were
  left in place — indistinguishable from what a genuine first-time visit to the Developer app would
  create. `tsc --noEmit` clean; full suite green (12 files/136 tests); `check:triggers` OK (same
  unrelated concurrent-CMS-session warnings). Shared dev server (port 3001) used directly throughout,
  confirmed healthy after each reload.

### HUD-0116 — Phase 5: Contacts' Google/Microsoft OAuth sync (`contacts-sync.routes.ts`) traced live, incl. genuinely reaching Google's real servers with fabricated tokens · CLEAN (no finding)
- **Category:** Functional correctness + security (Phase 5, seventy-second journey). Never traced.
  Tenant-wide Google/Microsoft OAuth app credentials (encrypted at rest, `settings.routes.ts`'s
  `SECRET_FIELDS_BY_KEY`) gate a per-user contact-sync connection (`contact_sync_connections`) —
  completing a real OAuth consent screen isn't reachable from this environment (same disclosed class
  of limitation as the federated-login branches in HUD-0111), but everything up to and past that
  step was still fully live-testable, including forcing the actual failure path against Google's
  real production servers rather than stopping at "the code looks right."
- **Trace:** with no credentials configured, `/google/status`+`/outlook/status` correctly reported
  `configured:false`, and `/google/auth-url`+`/outlook/auth-url`+`/*/sync` all returned a clean,
  honest `400` rather than a stub success. Set real-shaped (fake, but correctly-formatted) tenant-wide
  OAuth credentials via the real `PATCH /v1/settings`, then confirmed both status endpoints flipped to
  `configured:true` and both `auth-url` endpoints returned a genuinely well-formed authorization URL
  with the *decrypted* client id, the correct scopes (`contacts.readonly`+`userinfo.email` for
  Google, `Contacts.Read`+`User.Read`+`offline_access` for Microsoft), and `access_type=offline&
  prompt=consent` on Google's URL specifically — confirms the file's own header-referenced encrypt/
  decrypt fix (a prior bug where the ciphertext was handed straight to Google) is genuinely in effect
  today, not just documented as fixed. **Seeded two real per-user `contact_sync_connections` rows**
  (one with an already-expired access token + a refresh token, one with a still-fresh access token)
  for two different real users in the same tenant, then called `/google/sync` for each: the
  expired-token connection genuinely attempted a live OAuth token-refresh call to Google's real
  servers and got back Google's own real `"The OAuth client was not found."` (the fabricated client
  id doesn't correspond to a registered Google Cloud app); the fresh-token connection genuinely
  called Google's real People API with the fabricated access token and got back Google's own real
  `"Request had invalid authentication credentials..."` — both failures are Google's actual wording,
  not a locally-fabricated error string, proving these code paths make the real external call rather
  than short-circuiting. Confirmed both failures were persisted verbatim to `last_sync_error` and
  `last_sync_status: 'failed'`. **Per-user isolation, the one angle not implied by the tenant-wide
  credential design**: each of the two seeded connections was visible only to its own owner via
  `/google/status` (the other user's real, distinct fake email never leaked across), and
  `DELETE /google/connection` — which takes no target id, only ever acting on the caller's own row —
  correctly removed just the caller's connection while the other user's connection, checked
  immediately after, was completely untouched.
- **No bug found** — the unconfigured-state honesty, the credential encrypt/decrypt round-trip, the
  genuine (not stubbed) upstream network calls on both the refresh-token and direct-API-call paths,
  correct failure persistence, and per-user connection isolation all held under live testing. No code
  changes this pass.
- **Test-artifact handling:** both seeded `contact_sync_connections` rows were removed via the real
  `DELETE /google/connection` endpoint (as each respective owner) rather than raw SQL, exercising the
  same cleanup path a real user would use; the tenant's temporary `int-google`/`int-microsoft`
  settings were removed via `settings - 'int-google' - 'int-microsoft'` (keys removed entirely,
  matching this arc's standing convention). Shared dev server (port 3001) used directly throughout,
  confirmed healthy — including tolerating two genuine, intentional live calls to Google's real
  infrastructure that this trace needed to fail exactly as they did.

### HUD-0115 — Phase 5: CRM labels (`crm-labels.routes.ts`) + the cross-app customer/lead search picker (`crm-search.routes.ts`) traced live and adversarially · CLEAN (no finding)
- **Category:** Functional correctness + security (Phase 5, seventy-first journey). Two small,
  previously-untraced CRM route files: a polymorphic label taxonomy shared across leads/deals/
  customers, and the real search endpoint backing `CustomerLeadPicker.tsx` — used by both CRM proper
  and ClearOS's landed-cost calculators, with every real query logged to `crm_search_history`.
- **Trace — labels:** RBAC confirmed at both ends of the file's own role list: `FINANCE` and
  `CUSTOMER` both correctly refused (`403`) — notably `FINANCE` is deliberately excluded here despite
  being included on the sibling search file, confirmed as a real, intentional difference rather than
  an oversight (see below). Created a real label (`SALES` role), got a clean `400` on a genuine
  duplicate name (not an opaque `500`). **Cross-tenant assign, the one attack this file's inline
  subject-lookup exists specifically to stop**: attempted to assign the label to a real lead
  belonging to a completely different tenant — correctly refused (`404`, "Label or subject not
  found"), confirming the subject lookup is genuinely tenant-scoped, not just the label itself.
  Assigned it to a real same-tenant lead instead — `GET /for` and the list's per-label `count` both
  updated correctly. **Cross-tenant IDOR on the label itself**: seeded a real label directly in a
  different tenant and confirmed `PATCH`/`DELETE` by its real id both correctly no-op (`404` /
  `204`-with-zero-rows-affected) rather than reaching across tenants, re-verified the other tenant's
  row was byte-for-byte untouched afterward. Deleted the original label *while it still had an active
  assignment* and confirmed the `crm_label_mappings` row was genuinely gone afterward — the real
  `ON DELETE CASCADE` (migration 450) working as declared, not just assumed from reading the SQL.
- **Trace — search:** confirmed the deliberate RBAC difference from labels is real, not a copy-paste
  gap: `FINANCE` succeeded here (needs it for `/v1/customers` access elsewhere) while `CUSTOMER` was
  still correctly refused. A real query matched an existing lead by company name and was logged to
  `crm_search_history` with the correct `searched_by`/`result_count`/`source`; a second search by a
  different real user for the same term produced its own correctly-attributed row. Confirmed the
  picker's own "list everything on focus" empty-query call is genuinely never logged (checked
  directly against Postgres for a zero-length `query` row, not just trusted from the `if (query)`
  guard in the code).
- **No bug found in either file** — role-list scoping (including the file-to-file difference), the
  duplicate-name guard, cross-tenant subject-assignment rejection, cross-tenant label IDOR, cascade
  delete, and search-history's log-real-queries-only rule all held under live, adversarial testing.
  No code changes this pass.
- **Test-artifact handling:** both test labels (the real one and the cross-tenant seed) were deleted
  via the real API / a matching direct SQL cleanup; the handful of `crm_search_history` rows this
  trace created were left in place as genuine, accurately-attributed search-log entries — no delete
  endpoint exists for that table (confirmed by grep), matching this arc's standing convention. Shared
  dev server (port 3001) used directly throughout, confirmed healthy.

### HUD-0114 — Phase 5: real-time session/device revocation, idle-timeout enforcement, and the deactivation-triggered "leaver" access-revocation automation traced live and adversarially · CLEAN (no finding)
- **Category:** Security (Phase 5, seventieth journey). `security.routes.ts`'s self-service session
  surface (`GET/PATCH/DELETE /sessions`, `POST /sessions/revoke-others`) sits on real `hr_devices`
  rows, and `middleware/auth.ts`'s `authenticate` hook re-checks that state live on every single
  authenticated request — the single highest-value claim to verify here was whether "Sign Out"
  actually kills a still-cryptographically-valid JWT immediately, or is a cosmetic DB flag nobody
  ever reads back. Never traced. Also surfaced and traced a second, undocumented mechanism found
  while reading the code rather than assumed working: `ondi.subscribers.ts` reacts to
  `hr.staff_deactivated` by automatically revoking every one of that person's active sessions, org
  role grants, and OAuth app consents — a real "leaver" automation, not just a `users.active` flip.
- **Trace:** logged in for real (not a self-signed test JWT) to get a genuine `device_id`-bearing
  access+refresh pair. Confirmed the token worked, then self-revoked that exact session via
  `DELETE /sessions/:id` and immediately retried the *same, still within its 1-hour expiry* access
  token — **rejected** (`401 Session has been signed out`), not just the DB row changing. Retried the
  matching refresh token against `/auth/refresh` — also rejected, confirming the code's own claim
  that revocation kills both directions rather than letting a stolen refresh token quietly mint a new
  access token an hour later. Logged in twice more from two distinct sessions and called
  `POST /sessions/revoke-others` from one: that caller's own token kept working, the other session's
  token was immediately killed — the safer "sign out everywhere else" default, verified both ways,
  not just the survivor. **Then found and traced the deactivation subscriber, which this file's own
  routes gave no hint of**: deactivated a real staff account (`PATCH /v1/hr/staff/:id/status`,
  `active:false`) while it held a live, still-valid access token, and the very next request with that
  token was rejected — not because `authenticate` checks `users.active` (it doesn't, confirmed by
  reading the whole file), but because the `hr.staff_deactivated` domain event fired
  `ondi.subscribers.ts`'s leaver-revoke handler, which had already flipped `hr_devices.revoked_at`
  for every one of that user's active sessions within the same request. Confirmed directly against
  Postgres: a real `ondi_automation_log` row ("Revoked 1 active session on deactivation") and the
  correct `session_revoked` audit event, both attributed to the automation rather than a person.
  Reactivated the account and confirmed a fresh login immediately succeeded again. **Live-tested the
  idle-timeout policy the same middleware also enforces**, previously only a read-the-code claim:
  set the dev tenant's `sessionPolicy.timeoutMinutes` to 15, backdated a real session's
  `hr_devices.last_used_at` by 20 minutes, and confirmed a request using that session's still
  cryptographically-valid, not-otherwise-expired access token was correctly rejected
  (`401 Session expired due to inactivity`) — genuinely re-evaluated per request against live
  Postgres state, not baked into the token at issuance. Confirmed the untouched-default-enforces-
  nothing design too (both tenant and platform settings were `null` going in). **Cross-user IDOR,
  the one angle not implied by anything already read**: a real `TENANT_ADMIN` JWT attempting to
  rename a *different* user's own device by its real id got a clean `404`, not the tenant-wide reach
  every other self-service route in this file has — `/sessions/:id` is scoped to `user_id = user.sub`
  on top of `tenant_id`, correctly narrower than most of this codebase's tenant-only boundaries,
  matching its own "own-device rename" header comment.
- **No bug found** — every one of this surface's implicit guarantees (live revocation enforcement on
  both token types, revoke-others' asymmetric self-preservation, the deactivation-triggered leaver
  automation, live idle-timeout re-evaluation, and per-user rather than merely per-tenant scoping)
  held under direct, adversarial, live testing. No code changes this pass.
- **Test-artifact handling:** the dev tenant's temporary `sessionPolicy` override was removed via
  `settings - 'sessionPolicy'` (key removed entirely, matching this arc's standing convention rather
  than left `null`); the test staff account was restored to `active:true` and confirmed logging in
  again; the handful of real `hr_devices`/`hr_login_history` rows this trace created were left in
  place (clearly test-agent-labeled, e.g. `TestAgentA/1.0`) — `hr_devices` has no hard-delete path
  anywhere, matching this arc's standing convention for that table's own audit-trail role; the one
  real `ondi_automation_log` row is an accurate historical record of a real automation run and was
  left as such. Shared dev server (port 3001) used directly throughout, confirmed healthy at every
  step including after two transient `tsx watch` restart blips from the concurrent CMS session
  (retried and succeeded, matching this arc's established pattern for that specific noise source).

### HUD-0113 — Phase 5: Ondi's auto-join-by-domain workflow (`onboarding.routes.ts`'s `/check-email`+`/request-join` + `ondi.routes.ts`'s `/org/join-requests` review queue) traced live and adversarially · CLEAN (no finding)
- **Category:** Functional correctness + security (Phase 5, sixty-ninth journey). A real outsider who
  signs up with an email matching an existing tenant's staff domain is offered "join this workspace"
  instead of creating a new tenant — a request queues for review, an admin picks the role at approval
  time (the requester never does, closing off self-escalation), and only then does a real `users` row
  get created with the password the requester originally chose. Never traced.
- **Trace:** `GET /v1/onboarding/check-email` correctly matched a new `@msomi.co` address to the real
  dev tenant, correctly returned `null` for a personal-domain address (`gmail.com`), and correctly
  reported an already-registered address as unavailable with no match offered. `POST /request-join`:
  a real submission succeeded (`201`); an immediate second submission for the same still-pending email
  was correctly refused (`409`, the partial-unique-index message) — a genuine race-safe dedup, not
  just an app-level pre-check; a submission with a client-supplied `tenant_id` that didn't match the
  email's own real domain was correctly refused (`400`) — confirms the server re-derives the match
  itself rather than trusting the hint the UI showed the requester. Confirmed both tenant admins
  (`ADMIN`/`TENANT_ADMIN`/`MANAGER`) were genuinely emailed (verified against `email_outbox`, not just
  a `200`). RBAC on the review queue: `JUNIOR` and `CUSTOMER` both correctly refused (`403`, two
  different gates — role list and the platform's blanket CUSTOMER block — both fired). Self-escalation
  is closed at the schema level, not just by convention: attempting to approve with `role: "SUPER_ADMIN"`
  was rejected by Zod validation before the handler even ran (`SUPER_ADMIN` isn't in the accepted enum
  at all). Approved for real with `role: "JUNIOR"` — the resulting `users` row had the right name/
  email/role, and **the new person could actually log in with the exact password they originally
  submitted at request time** (the stored `password_hash` survives from request to approval
  unmodified). A second approve attempt on the same now-resolved request was correctly refused
  (`404`, "already reviewed"). Denied a second real request with a reason: the requester's login
  attempt afterward correctly failed (no `users` row was ever created), and the denial email
  genuinely included the given reason (verified against `email_outbox`, not just trusted from the
  route). **Cross-tenant IDOR, the one attack this file's own tenant-scoped `.where()` clauses hadn't
  been proven against before**: signed a real `TENANT_ADMIN` JWT for a completely different dev-tenant
  account and confirmed it saw an empty list (not a different tenant's pending requests) and that
  both `approve` and `deny`, called directly by the real target request's id, were refused with the
  same generic `404` a nonexistent id gets — no distinguishable "wrong tenant" signal, and no leakage
  of the request's existence to an outsider.
- **No bug found** — every one of the flow's implicit guarantees (domain re-verification, race-safe
  dedup, role-assignment-at-approval-not-request, RBAC, cross-tenant isolation, and password survival
  from request to approval) held under live, adversarial testing. No code changes this pass.
- **Test-artifact handling:** all three real `tenant_join_requests` rows this trace created (one
  approved, two denied) were left in place — the table has no delete endpoint anywhere (confirmed by
  grep) and each is clearly labeled test content, matching this arc's standing convention. The one
  real `users` row created by the approval was deactivated via the real `PATCH /v1/hr/staff/:id/status`
  rather than left as a spurious active login-capable account. One of my own test-script mistakes
  along the way — an `approve`/`deny` call sent with `Content-Type: application/json` but no body,
  which Fastify correctly rejects as `FST_ERR_CTP_EMPTY_JSON_BODY` before ever reaching the route —
  was recognized as my own curl error, not a product bug, and retried with a valid empty-object body.
  Shared dev server (port 3001) used directly throughout (no Redis dependency for this feature),
  confirmed healthy throughout.

### HUD-0112 — Phase 5: Ondi's mutual-consent trusted-contact account recovery (`ondi_recovery_contacts`/`ondi_recovery_requests`) traced live · Found+fixed a real HIGH gap — the feature was completely unreachable for its entire stated purpose
- **Category:** Functional correctness (Phase 5, sixty-eighth journey). This is the platform's answer
  to "I've lost my password AND my email" — a real mutual-consent flow (add a trusted colleague as a
  recovery contact, they accept once; later, request recovery and any one accepted contact can vouch
  for you; a 24-hour cooldown gives the real owner a chance to notice and cancel by logging in
  normally) split across `auth.routes.ts` (the unauthenticated requester-facing half) and
  `security.routes.ts` (the authenticated contact-facing half). Never traced. Set up a real
  recovery-contact relationship between two real dev-tenant accounts (`admin@msomi.co` as the
  "locked-out" owner, `junior@msomi.co` as the accepting contact) and drove the entire golden path
  live rather than reading the code and assuming it worked.
- **Trace:** contact relationship added and accepted correctly; `/auth/recovery/request` correctly
  enumeration-safe (identical generic response for a matched vs unmatched email) and correctly
  notified the accepted contact by email; the contact's `GET /v1/security/recovery-requests` and
  `POST /recovery-requests/:id/approve` both worked and started a real 24-hour cooldown;
  `/auth/recovery/complete` correctly refused before the cooldown elapsed (`400`). **Found a real
  HIGH bug live**: at no point in this entire path does the single `token` value that
  `/auth/recovery/complete` requires ever reach a human being. Read every response and every
  notification the flow produces looking for it — `/auth/recovery/request`'s response is a generic
  `{ok:true}` with no token, by enumeration-safety design; the `auth.recovery_request` email sent to
  the contact (confirmed directly against `email_outbox`) contains zero links and no token, just an
  instruction to log in and review; `GET /recovery-requests` and the `approve` response the contact
  actually sees both explicitly omitted the `token` column from their `SELECT`/`.returning()` lists.
  `RecoveryPage.tsx`'s own header comment describes the intended design — "this IS the link a
  contact would share back" — but nothing in the product ever gave the contact a link to share.
  Retrieved the real token directly from Postgres (the only place it existed) to prove the rest of
  the machine is completely sound: backdated the stored `cooldown_ends_at` to simulate the 24-hour
  wait elapsing (the same live-manipulation technique HUD-0109 used on the Query Builder's OTP
  grant), called `/auth/recovery/complete` with the real token, and **logged in with the resulting
  new password for real** — the underlying approve → cooldown → complete → working-new-password
  chain is entirely correct. The token being unreachable was the only defect, but it was a total
  one: every real account on this platform that ever needed this feature (lost password, lost email)
  had zero way to actually use it, with no error or warning anywhere suggesting the feature was
  broken — it silently "worked" as far as the requester and contact could tell, right up to the step
  that can never be reached. Rated HIGH, not CRITICAL, since it fails safe (the account simply stays
  inaccessible via this path — nothing is exposed, corrupted, or bypassed) and every other password/
  session-recovery path (email-token reset, OTP, magic-link, TOTP, SSO) remains unaffected.
- **Fixed**: `apps/api/src/routes/security.routes.ts` — added `token` to `GET /recovery-requests`'s
  select list and to `POST /recovery-requests/:id/approve`'s `.returning()` list, so the one contact
  entitled to review a specific request now actually receives the value the whole flow depends on
  (not a new privilege — `token` was already the sole bearer credential `/auth/recovery/complete`
  accepts, exactly like a password-reset token, and this endpoint was already scoped to exactly the
  contact named on that request). `apps/web/src/pages/OndiSecuritySettings.tsx` — added a "Copy
  Link" action next to a pending request (to approve-and-share in one visit) and next to an approved
  one in Vouch History (to re-share if the first copy was lost), building the exact
  `/recovery?token=…` URL `RecoveryPage.tsx` already expects and copying it to the clipboard with the
  platform's existing copy-to-clipboard convention (same pattern as the 2FA secret-key/backup-codes
  copy buttons elsewhere on this same page) — deliberately not emailed to the contact pre-login,
  since approving still correctly requires the contact to authenticate first. Re-verified live end to
  end with a second, fresh recovery request: the token now appears in both the contact's list and the
  immediate approve response.
- **Test-artifact handling:** the test recovery-contact relationship was removed via the real
  `DELETE /v1/security/recovery-contacts/:id`; `admin@msomi.co`'s password (changed to a test value
  while proving the completion path) was restored to the platform's own documented dev-seed default
  (`password123`, per `seed.ts`'s own header comment) using the exact same PBKDF2-HMAC-SHA512 format
  `hashPassword()` produces, and re-verified with a real login. The two `ondi_recovery_requests` rows
  this trace created (one `completed`, one left `approved` with its cooldown still running) were left
  in place — the table has no delete endpoint anywhere (confirmed by grep, matching this arc's
  standing convention for tables in that position) and both are harmless, clearly time-stamped test
  activity. `tsc --noEmit` clean on both `apps/api` and `apps/web`; full suite green (12 files/127
  tests — up from 121, reflecting further growth in the concurrent CMS session's own test file);
  `check:triggers` OK (same unrelated concurrent-session warnings). Shared dev server (port 3001)
  used directly for this journey (no Redis dependency) and confirmed healthy throughout.

### HUD-0111 — Phase 5: Ondi's real login front door (`ondi-auth.routes.ts` — phone-OTP, magic-link, passwordless-TOTP, WebAuthn/passkey, Google/Microsoft/Apple federation) traced live and adversarially · Found+fixed one real LOW enumeration leak
- **Category:** Security + functional correctness (Phase 5, sixty-seventh journey). This file is
  Ondi's own login front door (M1 of the SSO migration plan) — five independent sign-in mechanisms
  landing on the same real session issuance every other login path uses — never traced despite
  HUD-0103/0104 already covering its sibling SAML/OAuth *provider* surfaces. No real Redis exists in
  this dev environment, so every Redis-backed mechanism here (OTP, magic-link, passkey) fails closed
  (`503`) on the shared dev server; stood up an isolated API instance against a hand-written minimal
  RESP2 mock (`PING`/`SET EX`/`GET`/`DEL`/`EXPIRE`/`INCR` — enough for this file's own command set)
  to exercise the *enforcing* path rather than accept the fail-closed default as sufficient evidence.
- **Trace:**
  - **Phone-OTP**: confirmed the enumeration-safety comment's own claim — an unregistered phone gets
    the exact same generic `200` as a registered one. **Found a real LOW bug live**: a registered
    phone whose tenant has no SMS gateway configured (the actual, unconfigured state of the dev
    tenant right now — not a synthetic edge case) got a *different*, specific `502`
    (`"No SMS gateway configured for this tenant"`) instead of the generic response — an
    unauthenticated caller could distinguish a registered from an unregistered phone number whenever
    delivery fails, exactly the enumeration gap this same route's own header comment says it already
    closed for the no-match case. The sibling `/magic-link/request` in this same file already gets
    this right (`.catch(() => {})` swallows a send failure and always returns the generic response) —
    proof this is a real, avoidable inconsistency, not an inherent limit. **Fixed** by mirroring that
    exact pattern: the code is still generated and stored in Redis regardless of delivery outcome
    (confirmed live via direct Redis read both before and after the fix), the `otp_issued` audit event
    now always fires with the real delivery outcome recorded in its metadata instead of being skipped,
    and the HTTP response is now always the identical generic `200` either way. Re-ran the original
    reproduction (registered phone, no gateway) — now `200`, byte-identical to the unregistered-phone
    response. The rest of the mechanism is clean: 5-attempt lockout genuinely fires on the 6th wrong
    try (`429`), a correct code issues a real session and is immediately single-use (replay `401`),
    and the live risk-assessment/trust-score computation responded correctly to real prior failed
    attempts in the same window (`risk.factors: ["failed_attempts"]` on a later successful login).
  - **Magic-link**: enumeration-safe request confirmed identical either way. Retrieved the real
    emailed token from `email_outbox` (same evidence-based pattern as HUD-0109's OTP retrieval).
    Garbage token rejected (`400`); correct token with no TOTP enrolled issues a real session
    immediately; correct token replayed is refused (single-use). **Adversarially tested the file's
    own more specific claim, not just the easy case**: enrolled a real TOTP secret for the test
    account (via the real `/v1/security/2fa/setup`+`/2fa/verify`, hand-computing valid RFC 6238 codes
    against the returned base32 secret), then confirmed a magic-link token survives *both* a missing
    TOTP (`requires_2fa: true`) *and* a wrong TOTP (`401`) without being consumed — only actually
    deleted from Redis once a session is genuinely about to be issued — then completed it with a
    correct code and confirmed the now-used token is refused on replay.
  - **Passwordless TOTP** (`/totp/verify`): wrong code refused with the same generic message an
    unenrolled email would get (enumeration-safe); correct code issues a real session.
  - **Passkey/WebAuthn**: confirmed `/passkey/login/options` returns a byte-identical
    `allowCredentials: []` challenge shape for an unregistered email and a registered email with zero
    passkeys — genuinely indistinguishable, not just documented as such. `/passkey/login/verify`
    correctly rejects a garbage authenticator response (`401`). Completing a real WebAuthn ceremony
    end-to-end needs actual authenticator hardware/software this environment doesn't have — same
    disclosed class of limitation as Sign's Stirling-PDF tools and CMS's Anthropic-vision alt-text
    elsewhere in this arc.
  - **Federated login (Google/Microsoft/Apple)**: `/config` correctly resolves the real
    SuperAdmin-configured Google client id from Platform Settings (confirmed against the live
    `tenant_settings` row) with Microsoft/Apple correctly reported unconfigured (`null`). Microsoft
    and Apple `/verify` correctly refuse with a clean `503` while unconfigured. Google `/verify` made
    a real call to Google's own `tokeninfo` endpoint and correctly rejected a garbage credential
    (`401`) — confirms genuine external token verification, not a stub. Completing the real
    happy-path (and therefore the `allowJoinRequest`/`createJoinRequestForFederatedIdentity` branch)
    needs a genuine Google/Microsoft/Apple-signed identity token this environment cannot forge —
    reviewed `onboarding.service.ts`'s `createJoinRequestForFederatedIdentity` by reading rather than
    live-exercising, the same disclosed boundary as the passkey ceremony above.
  - Confirmed the audit trail is accurate throughout, not just the HTTP responses: `hr_login_history`
    showed the exact sequence of real failed/succeeded attempts across every mechanism tested,
    matching the live test sequence attempt-for-attempt.
- **Fixed**: `apps/api/src/routes/ondi-auth.routes.ts` — `/otp/request` no longer lets an SMS delivery
  failure leak account existence via a distinct status code.
- **Test-artifact handling:** the TOTP enrollment created to test the 2FA-required branch was
  disabled via the real `/v1/security/2fa/disable` with a freshly-computed valid code (confirmed
  `user_totp` back to 0 rows for the test account); `sms_messages`/`email_outbox` rows left in place
  as real activity logs, matching this arc's standing convention (same treatment as HUD-0109's OTP
  emails); the isolated instance and its mock Redis were both stopped, shared dev server (port 3001)
  confirmed undisturbed. `tsc --noEmit` clean, full suite green (12 files/121 tests — up from 11/105,
  reflecting a concurrent session's own now-merged `cms.test.ts`), `check:triggers` OK (only the same
  concurrent CMS session's own still-open trigger-registry warnings, unrelated to this file).

### HUD-0110 — Phase 5: inbound public webhooks (GPSWOX fleet tracking + Meta WhatsApp Cloud API) traced live with real HMAC forgery/tamper attempts and full functional flows · CLEAN (no finding)
- **Category:** Functional correctness + security (Phase 5, sixty-sixth journey). `webhooks.routes.ts`
  is the platform's real, unauthenticated-by-design public receiver for two third-party push
  integrations — GPSWOX (live vehicle tracking) and Meta's WhatsApp Cloud API (inbound customer
  messages) — carrying its own real HMAC signature verification, at-least-once redelivery dedup, and
  auto-ticket/auto-reply logic. Never traced, and its two signature checks (`META_APP_SECRET`,
  `GPSWOX_WEBHOOK_SECRET`) are both unconfigured in this dev environment (each documented to
  fail-open — "allow" — until a real secret is set), so verifying them as *enforcing* required
  temporarily configuring both on an isolated instance rather than trusting the fail-open code path
  as sufficient evidence either way.
- **Trace:** ran an isolated API instance with real test secrets for both integrations, then attacked
  and exercised every mechanism directly.
  - **Meta HMAC signature (`X-Hub-Signature-256`), attacked four ways**: a correctly-signed payload
    was accepted; a payload signed with a *different* secret was rejected (`401`); a payload with no
    signature header at all was rejected; and — the most important case — **a payload with its
    original, genuinely-valid signature but a single word changed in the body afterward was
    rejected**, confirming the check verifies the exact raw wire bytes (captured before JSON parsing,
    per the file's own comment) and a signature computed on the true original text cannot be replayed
    over tampered content.
  - **GPSWOX shared-secret token**: correct token accepted (reached the next real check); wrong token
    and missing token both correctly refused (`401`).
  - **WhatsApp webhook handshake** (`GET /whatsapp`): correct `hub.verify_token` echoed the challenge
    back; a wrong token was correctly refused (`403`).
  - **GPSWOX functional flow, verified against real rows, not just a `200`**: created a real vehicle
    with a known device IMEI, then sent a real position update (lat/long/speed/heading, `params.
    ignition`/`params.battery`) — a real `vehicle_positions` row was created with every field
    correctly parsed, including `ignition: true` → `"ON"`. A geofence alert payload correctly fanned
    out real notifications to *every* fleet-manager-role user in the tenant, with the real vehicle
    name and alert text in each message.
  - **WhatsApp inbound flow, the redelivery-dedup claim proven live**: sent two distinct messages
    (different `msg.id`) from a brand-new phone number — confirmed exactly one `customers` row and
    one `support_tickets` row were created (the second message correctly reused the still-open
    ticket, not a second one) — then **replayed both original messages a second time** (simulating
    Meta's documented at-least-once redelivery): the database was checked directly afterward and
    showed **exactly 2 `support_messages` rows, not 4** — the partial-unique-index
    `ON CONFLICT DO NOTHING` genuinely no-ops a redelivered message rather than creating a duplicate
    (or erroring).
  - **Keyword auto-reply**: created a real `support_rules` row (`type: 'whatsapp_keyword'`,
    `matchType: 'exact'`, keyword `STATUS`) and sent a message with lowercase `"status"` — the
    case-insensitive exact match fired correctly, and a real `OUTBOUND`/`SYSTEM`-authored reply with
    the configured text was logged to the same ticket.
  - **Non-text message placeholder generation**: an inbound `image` message with a caption produced
    exactly the documented placeholder text (`"[Image attachment: <caption>] (media id <id> — not yet
    downloaded...)"`) — and, correctly, did **not** trigger the keyword auto-reply engine (the file's
    own comment explicitly says matching a keyword against `"[Image attachment...]"` is never
    intentional; confirmed live rather than merely read).
- **No bug found.** Every one of the file's own documented claims — raw-byte HMAC verification,
  shared-secret token gating, real position/alert parsing, genuine redelivery dedup, keyword
  auto-reply, and non-text placeholder handling — held exactly under live, adversarial testing.
- **Test-artifact handling:** the test customer created by the inbound-message flow was soft-deleted
  via the real `DELETE /v1/customers/:id` (a `deleted_at`/`active:false` flip, matching this
  codebase's established soft-delete convention for customer records); its ticket and messages were
  left in place since `support_tickets` has no delete endpoint anywhere (confirmed, matching HUD-0049's
  earlier finding for this exact table) — clearly labeled test content, the same treatment given to
  every other undeletable record type this arc. The test keyword rule was hard-deleted via the real
  `DELETE /support/rules/:id`. The test vehicle was left in place (no vehicle-delete endpoint exists
  anywhere in the codebase, confirmed by grep). The dev tenant's temporarily-set `wa_phone_id` was
  reverted to its original `NULL`. The isolated test instance (with its temporary secrets) was fully
  stopped; the shared dev server (port 3001) confirmed undisturbed throughout. No code changes this
  pass.

### HUD-0109 — Phase 5: SuperAdmin Query Builder (real raw-SQL execution tool) traced live with adversarial injection/bypass attempts at every layer · CLEAN — every claimed defense held, including the hard Postgres-role backstop
- **Category:** Security (Phase 5, sixty-fifth journey). `query-builder.routes.ts` +
  `queryBuilder.service.ts` + `queryBuilderSchema.ts` is a `SUPER_ADMIN`-only tool that can execute
  literal, arbitrary read SQL against the platform's real database — by a wide margin the single
  highest-blast-radius surface examined in this arc, and never traced. Its own code comments describe
  a genuinely careful, defense-in-depth design (a hand-written table/column allowlist for its "visual"
  mode; a keyword-blocklist + single-statement + SELECT-only gate for its "raw" mode; a time-boxed,
  single-use, OTP-gated grant to even reach raw mode at all; and, as the stated real backstop, running
  raw queries through a genuinely separate, restricted Postgres role inside a read-only transaction
  with a hard statement timeout) — exactly the kind of specific, falsifiable security claim this arc's
  SAML/OAuth/anchoring journeys (HUD-0103/0104/0108) found real value in attacking rather than
  trusting.
- **Trace — attacked every layer the code claims to have, independently, starting from the database
  itself upward:**
  1. **The stated hard backstop was checked first, directly, outside the application entirely**:
     connected to Postgres as the `hudumika_readonly` role by hand and attempted a real `INSERT`,
     `UPDATE`, and `DROP TABLE` against a real table — all three failed with genuine Postgres
     permission errors (`permission denied for table tenants`, `must be owner of table tenants`).
     This role's restriction is real at the database-grant level, not merely a naming convention or
     an application-layer promise.
  2. **Role gating**: a `TENANT_ADMIN` JWT was correctly refused (`403`) on every route in the file.
  3. **Visual-mode allowlist, attacked from three angles**: a table deliberately excluded from the
     allowlist (`password_reset_tokens`) was cleanly rejected; a sensitive column deliberately
     excluded from an otherwise-allowed table (`users.password_hash`) was cleanly rejected; a classic
     `' OR '1'='1` injection payload placed in a filter *value* was correctly parameterized (returned
     as inert data — zero matching rows — never as executable SQL, confirmed via the returned
     `generated_sql` showing a bound `$1` placeholder); and SQL-shaped strings smuggled through
     `order_by.column` and the `table` field itself (`"id; DROP TABLE users; --"`,
     `"customers; DROP TABLE users; --"`) were both rejected outright by the exact-match allowlist
     check, never reaching `sql.ref()`/`sql.table()` at all. A legitimate query against a real allowed
     table returned real, correct data.
  4. **Raw-mode gating**: `POST /raw-run` was correctly refused (`403`) with no active grant.
  5. **The real OTP flow was driven end to end, not stubbed**: requested a code, retrieved the actual
     sent email from `email_outbox` (the platform's own real send path, addressed to the real
     `admin@msomi.co` account) and extracted the genuine 6-digit code from its rendered body — a
     wrong code was correctly refused without consuming the real one; the real code then correctly
     granted access; **immediately replaying that same correct code a second time was correctly
     refused** ("Code expired or not requested"), confirming genuine single-use consumption.
  6. **With a live grant, the raw-mode gate itself was attacked**: a multi-statement payload
     (`SELECT 1; DROP TABLE tenants;`) was rejected for containing a semicolon; a bare `DELETE`
     statement was rejected for not starting with `SELECT`/`WITH`; a `DELETE` smuggled inside a
     `WITH ... AS (DELETE ... RETURNING id) SELECT * FROM x` CTE was correctly caught by the keyword
     blocklist (case-insensitively — confirmed with a lower-cased `delete` producing the identical
     rejection); a real, unblocked `SELECT count(*) FROM tenants` correctly succeeded.
  7. **The hard timeout backstop was proven live, not assumed from the `SET LOCAL statement_timeout`
     line**: `SELECT pg_sleep(15)` against a stated 10-second timeout took **exactly ~10.4 real
     seconds** before Postgres itself killed it (`"canceling statement due to statement timeout"`) —
     genuine enforcement at the database level, the true last line of defense if every application
     check above it were somehow bypassed.
  8. **The auto-expiring grant — the specific fix the file's own comment says replaced "a single
     global boolean nobody was reminded to turn back off" — was proven live by directly manipulating
     the stored grant's expiry into the past** (leaving `raw_sql_enabled: true` in the database
     untouched, only backdating `raw_sql_enabled_until`): both `GET /settings` and `POST /raw-run`
     correctly treated the grant as expired despite the stale `true` flag still sitting in storage —
     confirming the time-box is real, not merely a display hint that a stale toggle could survive
     past its intent.
  9. `POST /raw-sql/disable` correctly required no OTP (only enabling is the risky direction) and
     correctly cleared the grant.
  10. **Every single attempt above — 15 in total, successes and failures alike — was independently
      confirmed in `GET /runs`**: exact mode, table, row count, actor, and error message for each,
      matching what was actually attempted. Two older, unrelated `sign_forensic_cases` runs attributed
      to the platform's own real SuperAdmin were visible in the same log — incidental evidence this
      tool sees genuine production use, not a dormant feature, left untouched.
- **No bug found anywhere in this file.** Every one of the ten defensive claims in its own code
  comments held under direct, hands-on attack, including the one claim (the Postgres role's real
  permissions) that no prior journey in this arc had verified by actually connecting as that role.
- **Test-artifact handling:** zero data-table rows were created, modified, or deleted anywhere in the
  platform — every query run, visual or raw, was a `SELECT` (the whole point of the tool). The
  `query_builder_runs` and `email_outbox` rows this trace generated are genuine, accurate audit
  records of real security testing by a real (self-signed test) `SUPER_ADMIN` identity, indistinguishable
  in kind from the platform's own real admin activity already sitting in the same tables — left in
  place rather than scrubbed, matching this arc's standing rule for real audit trail. No code changes
  this pass (confirmed via `git status`: none of the three files this journey read were touched).

### HUD-0108 — Phase 5: real Bitcoin/OpenTimestamps ledger anchoring (SEAL + ClearOS declarations) traced live · found and fixed the same HUD-0097-class bug in two sibling files; every cryptographic claim independently verified byte-for-byte
- **Category:** Functional correctness + security (Phase 5, sixty-fourth journey). `seal-ledger-anchor.routes.ts`
  and its ClearOS sibling `declaration-ledger-anchor.routes.ts` submit a real checkpoint hash of the
  tenant's tamper-evident ledger (SEAL lot movement chains / customs declaration event chains) to the
  public OpenTimestamps calendar servers, anchoring it to the real Bitcoin blockchain — an external,
  Hudumika-independent proof, verifiable by anyone with the public `ots` tool without trusting
  Hudumika's own "confirmed" status at all. Neither file had ever been traced, despite making
  exactly the kind of falsifiable cryptographic claim this arc's SAML/OAuth journeys (HUD-0103/0104)
  found real value in verifying live rather than trusting.
- **Found and fixed a real bug in both files before tracing the golden path**: reading
  `SealAnchorService.checkAnchorConfirmation` / `DeclarationAnchorService.checkAnchorConfirmation`
  (the code behind each file's `POST /anchors/:id/check`) showed the exact HUD-0097/0099 shape —
  `.executeTakeFirstOrThrow()` on a URL-supplied anchor id with no prior existence check — copy-pasted
  identically into both services (`declaration-anchor.service.ts`'s own header comment says "Mirrors
  SealAnchorService exactly," and mirrored the bug too). Live-confirmed both: a wrong/stale anchor id
  crashed as a raw `500` (each route's own local `catch` prevented an unhandled crash but mapped the
  `NoResultError` straight to `err.message` with no status mapping). **Fixed** by adding an
  `AnchorNotFound` error class to each service (existence check + throw), mapped to a clean `404` in
  each route's catch block — the same shape used across HUD-0097's whole sweep. Re-verified live: both
  `POST /seal/anchors/<bad-id>/check` and `POST /declarations/anchors/<bad-id>/check` now return a
  clean `404` instead of a `500`.
- **The golden path was then traced with independent, hand-computed verification at every step — not
  trusting a single claim from the API's own response:**
  - **SEAL**: before calling the API, independently queried `seal_movements`/`seal_lots` directly and
    hand-reproduced `SealService.buildCompartmentCheckpoint`'s exact algorithm (latest movement-chain
    tip per lot, sorted by lot id, `SHA256(JSON.stringify(snapshot))`) — got
    `c9505d677a184db399ac43b951bebc99152ce4f78edeaae07dac708d2c45f164`. The real `POST
    /compartments/:id/anchor` call — which genuinely took 3.4 seconds (a real network round-trip to
    external calendar servers, not a simulated instant response) — returned **the exact same hash**.
  - **The downloaded `.ots` proof file was inspected at the raw byte level, not just checked for a
    200 status**: its first bytes are the genuine OpenTimestamps magic header
    (`\x00OpenTimestamps\x00\x00Proof\x00...`), and the bytes immediately following it are **the exact
    same checkpoint hash**, byte-for-byte — direct, independent confirmation that the real external
    proof file genuinely commits to the real ledger state computed moments earlier, with zero trust
    placed in any layer of the API's own self-reporting.
  - **ClearOS declarations**: repeated the identical independent hand-verification against
    `declaration_events` (2 real declarations from earlier arc journeys) — hand-computed
    `16ff422accc5f92d81e068d360ba31e8d5f4b6b3eb79f298d2cec74f0cbe4d64`, and the real `POST
    /declarations/anchors` call returned the exact same hash and `declarationCount: 2`.
  - `POST /anchors/:id/check` on a freshly-created anchor correctly reported `status: 'pending'`,
    `bitcoin: null` on both files — the correct, honest state for a proof less than a minute old
    (real Bitcoin confirmation takes hours), not an error; `lastCheckedAt` correctly updated to reflect
    the real check.
  - `NothingToAnchor` correctly fires as a `422` for a genuinely empty compartment and (by the same
    code path, since a bad id naturally yields zero lots) for a nonexistent compartment too — a safe,
    non-leaky behavior rather than a distinguishing crash.
  - `CUSTOMER` role correctly refused (`403`) on every route in both files, matching the identical
    `HUD-0024/0031` block comment already present in both.
- **No further bugs found** — every cryptographic and external-network claim in both files' own
  documentation held exactly, verified independently rather than trusted.
- **Test-artifact handling:** both real anchor rows (one per file) were deliberately left in place —
  neither table has a delete endpoint, and unlike ordinary test scaffolding, an anchor is *itself* a
  tamper-evidence record; erasing Hudumika's local copy of it would defeat the entire point of the
  feature without undoing the real, already-permanent external submission to the public calendar
  servers. The one throwaway empty compartment created solely to exercise `NothingToAnchor` was
  soft-deactivated via the real `DELETE /compartments/:id`. Temporary `seal`/`clearos` entitlement
  overrides fully reverted. `tsc --noEmit` clean on all 4 changed files (same 4 pre-existing,
  still-evolving concurrent-session CMS errors, unrelated); full suite green (12 files/117 tests — the
  concurrent session added its own new `cms.test.ts` since HUD-0107, unrelated); `check:triggers` OK.

### HUD-0107 — Phase 5: Platform Packages (subscription-tier admin CRUD) traced live · found and fixed a real LOW bug (duplicate `code` crashed as an opaque 500 instead of a clean 400)
- **Category:** Functional correctness (Phase 5, sixty-third journey). `packages.routes.ts`
  (`GET /`/`GET /all`/`POST`/`PATCH`/`DELETE`, the platform-global subscription-tier registry the
  signup wizard, Subscription page, and SuperAdmin's own Packages console all read from) had never
  been traced — flagged in this arc's memory since 2026-08-24 as "looked clean on read, not
  separately traced."
- **Trace:** confirmed `GET /` (public, no auth) correctly returns only the 3 currently-active
  packages (`starter`/`growth`/`enterprise`), correctly ordered by `sort_order`; `GET /all` as a real
  `SUPER_ADMIN` correctly surfaces all 7 rows including the 4 inactive ones (`free`, `agency-managed`,
  `scale`, `onsite-standalone`) that `GET /` deliberately hides; the same `GET /all` correctly refused
  a `TENANT_ADMIN` (`403`), as did `POST`/`PATCH`/`DELETE` each tested individually. Created a real
  test package via `POST`, `PATCH`ed its price and `popular` flag and confirmed the public list
  reflected both changes immediately, then `DELETE`d it (a soft `is_active=false` flip, preserving
  `platform_transactions` history per the route's own comment) and confirmed it correctly disappeared
  from `GET /` while remaining visible via `GET /all` with `is_active: false`. A `PATCH`/`DELETE`
  against a nonexistent `code` both correctly 404'd rather than silently no-op'ing.
- **Found and fixed a real LOW bug**: `POST /` had no `try/catch` around its insert at all, so
  creating a package with a `code` that already exists (the column both `PATCH`/`DELETE` key off, and
  a genuinely easy mistake — e.g. recreating a soft-deleted tier under its old code) reached Postgres
  as a raw unique-violation and came back as `index.ts`'s generic sanitized `500 "An unexpected error
  occurred. Please try again."` — live-reproduced. Two sibling routes in this same codebase
  (`crm-labels.routes.ts`, `crm-smart-views.routes.ts`) already handle the identical shape correctly
  (`catch` a `duplicate key` message, return a specific `400`); `packages.routes.ts`'s `POST` simply
  never received that same fix. **Fixed** by applying the exact same established pattern. Re-verified
  live: the original reproduction (creating a second package under an already-used code) now returns
  a clean `400` (`"A package with code \"...\" already exists"`) instead of a raw `500`.
- **Test-artifact handling:** the test package was hard-deleted directly (no hard-delete endpoint
  exists on this platform-global table, and a soft-deleted throwaway test row had no reason to
  permanently clutter a real SuperAdmin's Packages console). `tsc --noEmit` clean on the one changed
  file (the concurrent CMS session's own in-progress errors have grown from 2 to 4 since HUD-0106,
  all still entirely contained to its own files — `cms-content.routes.ts`, `cms.routes.ts`,
  `cms.service.ts` — confirming that session's work is still ongoing and unrelated); full suite green
  (11 files/105 tests); `check:triggers` OK.
- **Also found, mid-journey, unrelated to this route**: the shared dev API server (port 3001), left
  stopped at the end of HUD-0106 for reasons outside this session's own actions, was restarted per an
  explicit user request at the start of this journey — confirmed healthy (background jobs bootstrap
  clean, in-memory fallback since no real Redis in this dev environment, matching every other journey
  this arc that needed it).

### HUD-0106 — Phase 5: CRM activity timeline + real send-email-from-CRM journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, sixty-second journey). `crm-activity.routes.ts`
  (manual + system-logged activity timeline, and a real "send email from CRM" feature that resolves
  its recipient entirely server-side) had never been traced.
- **Trace:** created two real leads (one with a `contact_email`, one deliberately without), converted
  the first into a real deal via the actual conversion endpoint, then exercised the full authorization
  and resolution matrix with four distinct real user identities (`TENANT_ADMIN`, `JUNIOR`, `FINANCE`,
  `MANAGER`).
- **Result: every mechanism behaved exactly as the code's own comments claim — no bug found.**
  **Recipient-resolution precedence for a deal, live-flipped mid-test**: with only a `lead_id` set,
  `send-email` correctly resolved and sent to the lead's own `contact_email`; after `PATCH`-attaching a
  real customer to the same deal, the *identical* route on the *identical* deal correctly switched to
  the customer's email instead — directly proving the "customer first, once one exists" comment in the
  code, not just reading it. A lead with no email on file was correctly refused (`400`, a clear
  message) rather than crashing. **Delete authorization, tested with the real boundary case**: a
  `FINANCE`-role user (not the author, not management) attempting to delete a `JUNIOR`-authored manual
  note returned a plain `204` but — confirmed directly against the timeline afterward — deleted
  nothing at all (the query's `actor_id` filter matched zero rows); a `MANAGER` deleting the *same*
  note immediately afterward genuinely removed it, confirming the manager-bypass works as intended.
  **The system-vs-manual delete boundary held for every role, not just non-management ones**: even a
  `TENANT_ADMIN` attempting to delete a system-logged `created` event through this route hit the same
  silent-no-op (the query's `type IN (...)` filter excludes system types unconditionally) — confirmed
  the event was still present afterward. A `POST` with a nonexistent `subject_id` correctly returned a
  clean `404` rather than a crash (`assertSubjectInTenant`'s ownership check, since `subject_type`/
  `subject_id` has no FK per the file's own migration-449 comment). Cross-subject isolation on `GET`
  confirmed — a lead's own timeline showed only its own events, none of the deal's or the other lead's.
  A real send through `MailService.sendNow` correctly logged an accurately-worded, correctly-attributed
  timeline entry (`"Emailed <name> <email>: "<subject>""`) for both sends, distinguishable from the
  system `created` event.
- **No bug found.**
- **Test-artifact handling:** both test leads and the test deal were fully deleted via their own real
  `DELETE` endpoints; confirmed directly in Postgres that the deal, both leads, and every activity row
  attached to them (which cascade-delete with their subject) are gone — zero orphaned rows. The
  shared dev API server (port 3001) was found already stopped at the start of this journey, for
  reasons unrelated to this session's own activity (nothing this session had done touched or killed
  it) — rather than restart a process this session doesn't own mid-arc, the trace was run against a
  temporary isolated instance on an unused port instead, which was fully stopped afterward; port 3001
  was left exactly as found, flagged for the user rather than unilaterally restarted. No code changes
  this pass.

### HUD-0105 — Phase 5: CRM smart views (lead/deal/customer rule-based views) + the SEAL↔CRM bonded-warehouse link journey traced live · CLEAN (no finding)
- **Category:** Functional correctness (Phase 5, sixty-first journey). `crm-smart-views.routes.ts` (a
  real per-entity-type SQL-predicate compiler across 10 operator kinds — text/num/uuid/bool/date/
  label — mirroring Contacts' own smart-groups shape verified in HUD-0102) and `seal-crm-link.routes.ts`
  (a small, already-correctly-gated read-only bridge surfacing a customer's bonded-warehouse lots on
  their CRM record) had never been traced as their own journey.
- **Trace:** created 3 real leads with deliberately distinct field values (industry, value, priority,
  source), a real CRM label assigned to exactly one of them, and converted one lead into a real deal —
  then built smart views exercising every operator family the catalog supports: `text/eq` +
  `num/gte` combined with `match_type: 'all'`; `label/has` (the `EXISTS`-subquery-compiled field);
  `text/eq` combined with `match_type: 'any'`; `date/within_days`; `text/is_empty`; and, on the `deal`
  entity type, `num/gte` (probability) and `date/before_days` (`stagnant`, keyed off
  `stage_changed_at`).
- **Result: every count and every returned row matched a hand-computed expectation exactly — no bug
  found.** One apparent mismatch surfaced and was resolved as a non-issue, not a defect: a
  `text/is_empty` view on `industry` returned `count: 1` where 0 was expected — traced to a genuine
  pre-existing lead (`Jane` / `Zod Co`, `industry: NULL`) left over from earlier, unrelated test
  activity in this same long-lived dev tenant, confirmed directly against Postgres — the filter was
  correctly finding a real row I had simply forgotten existed, not miscounting. `GET /:id/results`
  returned exactly the right full rows (not just a count) for a multi-rule view. Strict validation on
  `POST`/`PATCH` correctly rejected both an unknown filter field and a syntactically valid but
  wrong-for-that-field operator, each with a specific, actionable `400` message rather than a generic
  failure — the same "validate before touching the database" discipline this arc has repeatedly found
  missing elsewhere (HUD-0089/0092/0094/0097's whole bug class), confirmed present and correct here.
  `PATCH` correctly re-compiled and re-evaluated a view's live count after its rules changed (a
  probability threshold raised from 50 to 90 correctly dropped a real deal out of the view), and
  `DELETE` genuinely removed a view. `seal-crm-link.routes.ts`'s `GET /lots-for-customer` correctly
  returned six real bonded-warehouse lots (test fixtures left over from HUD-0098/HUD-0101, still
  correctly attributable to their real owner) with the exact right camelCased fields, correctly
  required `owner_id` (`400` when omitted, confirmed live), and correctly refused a `CUSTOMER`-role
  JWT (`403`) — the HUD-0024-era block comment already on this file holds.
- **No bug found.**
- **Test-artifact handling:** every test smart view (7 total, both entity types), the test label, the
  converted test deal, and all 3 test leads were fully deleted via their own real `DELETE` endpoints
  and confirmed gone directly against Postgres — none of this data had the kind of audit-trail value
  this arc leaves financial/regulatory records for, so full cleanup was the right call rather than
  labeling-and-leaving. No entitlement override was needed (the dev tenant's plan already grants
  `crm`). Usage counter check-in: 80/500, no restore needed. No code changes this pass.

### HUD-0104 — Phase 5: Ondi's real OAuth 2.0 / OIDC provider traced live with 16 adversarial scenarios · found and fixed a real LOW cross-client token-introspection disclosure; every other security claim held
- **Category:** Functional correctness + security (Phase 5, sixtieth journey), direct continuation of
  HUD-0103's methodology applied to `ondi-oauth.routes.ts` — a full RS256-signed authorization-code +
  PKCE + refresh-rotation + introspection/revocation provider that had never been traced despite
  being exactly as security-critical as the SAML file just verified.
- **Trace:** reused HUD-0103's isolated-instance-plus-from-boot-Redis-mock setup (a second API
  process on an unused port, the same hand-written RESP mock) so the real `codeKey`/`refreshKey`/
  `revokedKey` Redis primitives this file calls directly could be genuinely exercised. Used the
  platform's own real seeded first-party public client (`hudumika-clearos`, PKCE-only, no secret) for
  the public-client scenarios, and registered a second, confidential test client with a real secret
  through the actual `POST /v1/ondi/oauth-clients` admin API for the confidential-client and
  cross-client scenarios.
- **Result — 15 of 16 scenarios behaved exactly as intended, no bug:** full PKCE authorization-code
  happy path (approve → token → `userinfo` returning the exact right claims); PKCE correctly mandatory
  for a public client (omitting `code_challenge` → `400`); a wrong `code_verifier` correctly rejected;
  **authorization-code single-use correctly enforced** (redeeming the identical code twice: first
  succeeds, second is `invalid_grant`); `redirect_uri` binding correctly enforced; the confidential
  client's secret-based path works end to end; a wrong `client_secret` correctly rejected (`401`);
  **refresh-token rotation genuinely single-use** (reusing the just-rotated-away old refresh token is
  `invalid_grant`); a refresh token correctly bound to the client that requested it (redeeming one
  client's refresh token while claiming to be a different client is refused); introspection correctly
  requires valid registered-client credentials; **token tampering correctly rejected** (a flipped
  character in the JWT payload fails the RS256 signature check); an **`alg:none`-style hand-forged
  token correctly rejected** (`verifyJwt` always verifies against the real key's RS256 signature
  regardless of what the token's own header claims, so a header lying about its algorithm gains
  nothing); and **revocation correctly propagates immediately** to both `/userinfo` (`401`) and
  `/introspect` (`active: false`) for the same access token.
- **Found and fixed a real LOW bug**: `POST /introspect` authenticates its caller (a registered client
  proving its `client_id`/`client_secret`, per the route's own RFC 7662 comment explaining exactly why
  that check exists — "anyone holding a token string... could probe token validity/claims with no
  registration at all") but never checked whether *that* registered caller was actually the token's
  own audience. Live-confirmed: a second, completely unrelated registered client — using its own
  valid credentials — could introspect a token minted for a *different* client and see its full
  details (owning user's UUID, the other client's identity via `aud`, granted scopes, issued/expiry
  timestamps). Not a data-plane compromise (introspection alone grants no access to the user's actual
  resources, and registering a new OAuth client at all requires `SUPER_ADMIN` + `ondi.governance`, a
  meaningfully high bar), but a real, live-reproduced disclosure the endpoint's own stated security
  rationale doesn't actually deliver on. **Fixed** with `if (claims.aud !== client_id) return {
  active: false }` — the same anti-enumeration shape the endpoint already uses for a revoked/expired
  token, so a caller can't distinguish "not yours" from "invalid" either. Re-verified live both
  directions: the original cross-client reproduction now returns `active: false`; a client
  introspecting its own still-valid token (fresh token, not yet revoked) still returns the full,
  correct claims unchanged.
- **Test-artifact handling:** the test confidential OAuth client was hard-deleted via the real
  `DELETE /v1/ondi/oauth-clients/:id`; the one real consent row created against the seeded
  `hudumika-clearos` first-party client (an incidental side effect of exercising the public-client
  happy path against a real platform client rather than a disposable test one) was removed via the
  real self-service `DELETE /oauth/consents/:id`. The `ondi.governance` entitlement override was
  fully removed (not left `false`); the isolated API instance and Redis mock were both stopped, and
  the real dev server (port 3001) confirmed undisturbed throughout. `tsc --noEmit` clean on the one
  changed file (the two remaining errors are entirely contained in `cms-content.routes.ts`/
  `cms.service.ts`, both belonging to a different, concurrent session's own in-progress CMS work — the
  exact error text has visibly shifted since HUD-0099's own tsc run, confirming that session's own
  edits are ongoing and unrelated to this one); full suite green (11 files/105 tests — a first run
  showed 2 hook timeouts while my own scratch test-instance and Redis mock were still competing for
  local resources, fully resolved on a clean re-run once those were stopped, confirming the timeouts
  were this session's own resource contention, not a regression); `check:triggers` OK.

### HUD-0103 — Phase 5: Ondi SAML 2.0 SSO (real XML-DSig assertion handling) traced live with real, adversarially-signed assertions · CLEAN — every security claim in the file's own documentation held under live attack
- **Category:** Functional correctness + security (Phase 5, fifty-ninth journey). `ondi-saml.routes.ts`
  had never been traced as its own journey despite its header comment making several specific,
  falsifiable cryptographic/security claims (real XML-DSig verification via `samlify`, a
  self-implemented audience-restriction check the library itself omits, Redis-backed replay
  protection, tenant-scoped user resolution, per-request entitlement re-verification) — exactly the
  kind of "code comment asserts real security, verify it live" case that has found real bugs
  elsewhere in this arc (HUD-0062's disposal-reversal hypothesis, HUD-0066's dead-code bypass).
- **Trace:** built a complete, real SAML 2.0 IdP simulator rather than trusting the library's own
  claims — a self-signed RSA/X.509 keypair (via `node-forge`), a second unrelated keypair for the
  "wrong signing key" adversarial case, and a real `samlify.IdentityProvider` that signs genuine
  assertions matching what a real corporate IdP (Okta, Entra ID, AD FS) would send. Registered a real
  `sso_providers` row through the actual `POST`/`PATCH /v1/ondi/sso-providers` API (the exact routes
  fixed for their own 404 bug in HUD-0099), granted `ondi.governance` via the standing
  entitlement-override mechanism, and ran the target route file against an isolated second API
  instance (port 3099) with its own from-boot Redis connection — a from-scratch minimal RESP-protocol
  mock (real `SET`/`GET`/`DEL`/`EX` semantics, ~100 lines) substituting for a real Redis server that
  isn't available in this Windows dev environment, since the actual replay-protection logic under
  test only ever calls those three primitives directly (BullMQ's own Lua-script job scheduling failed
  loudly against the mock and was irrelevant to this trace, confirming the isolation was scoped
  correctly).
- **Result: nine adversarial scenarios run, every one behaved exactly as the file's own documentation
  claims — no bug found:**
  1. **Valid IdP-initiated login** (no `InResponseTo`, the single most common real-world SSO entry
     point) — succeeded, `302` to `/auth/sso-complete`.
  2. **Tampered assertion** (a flipped byte in the base64 body, invalidating the XML-DSig signature)
     — rejected, `assertion_verification_failed`.
  3. **Assertion signed with a different, unrelated private key** (same claimed structure, wrong
     signer) — rejected, `assertion_verification_failed` — confirms `samlify` genuinely validates the
     signature against the *configured* certificate, not merely "some valid signature exists."
  4. **Audience mismatch** — an assertion validly signed by the real IdP key, but built for a
     *different* SP entity (simulating a different Ondi tenant's own SAML provider, signed by the
     same trusted IdP) — rejected, `audience_mismatch`. This is the exact SAML Core §2.5.1.4 gap the
     file's own header comment says `samlify` itself leaves open and that this file closes with a
     manual check — **live-confirmed the manual check actually fires**, not just present in the diff.
  5. **Unknown email** (valid signature/audience, but no matching user) — rejected,
     `no_matching_user`.
  6. **A successful login's session was independently decoded, not just trusted from the `302`**: the
     `hudumika_access` cookie's JWT payload matched the real user (`sub`/`tenant_id`/`role`/`email`)
     exactly, and a real `device_id` was included — a genuine, usable session, not a stub redirect.
  7. **Cross-tenant isolation** — an assertion validly signed for the correct SP entity and audience,
     but with a `NameID` matching a *real, active* user who exists only in a completely different
     tenant (Moovit, not the Msomi tenant this provider belongs to) — rejected, `no_matching_user`
     (the tenant-scoped lookup correctly never found them). Directly verifies the file's own strongest
     claim: "a signed assertion from tenant A's IdP must not be able to sign in as a user in tenant B,
     even on a coincidental email match."
  8. **SP-initiated flow + replay protection** — hit the real `/login` route, decoded the deflated
     `AuthnRequest` from the resulting redirect to extract its real ID, built an assertion carrying
     that ID as `InResponseTo`, and submitted it: first use succeeded (`302` to sso-complete);
     **replaying the identical assertion a second time was correctly rejected**
     (`unknown_in_response_to` — the Redis-backed request-id cache had already consumed it on first
     use, exactly as the "replay protection" claim describes).
  9. **Entitlement re-verification** — revoked the tenant's `ondi.governance` grant, then submitted a
     freshly-built, perfectly valid, correctly-signed, correct-audience assertion for the *same*
     already-proven-working flow: rejected, `entitlement_lapsed` — confirming a lapsed add-on
     genuinely cannot be bypassed by an already-configured, still-enabled `sso_providers` row, exactly
     matching the file's own comment about why this re-check exists.
  - **The audit trail was independently verified, not assumed**: every one of the 8 failure attempts
    produced a correctly-attributed `ondi_auth_events` row with the *exact* matching `reason` for each
    scenario (not a generic failure code), and all 3 successful logins produced real `saml_login`
    events plus real `hr_login_history` rows — the audit-chain claims this file's comments make are
    genuinely wired, not aspirational.
- **No bug found.** This is the most adversarially-tested "clean" result in this arc to date — nine
  independent attack scenarios against a real cryptographic security boundary, not a happy-path
  functional trace.
- **Test-artifact handling:** the test `sso_providers` row was hard-deleted via the real `DELETE
  /sso-providers/:id` endpoint (re-enabling the entitlement briefly to reach it, since it's itself
  behind the same `ondi.governance` gate the trace was testing). The `ondi.governance` entitlement
  override was fully removed (not left `false`) after use. The 3 real `hr_login_history` rows and the
  reused (not newly-created) `hr_devices` row are genuine login history for the real `admin@msomi.co`
  account and were left in place, matching this arc's standing rule for harmless real audit trail
  rather than test pollution requiring cleanup. The isolated second API instance (port 3099) and the
  scratch Redis mock (port 6379) were both fully stopped; the original dev server (port 3001)
  confirmed undisturbed throughout. No code changes this pass.

### HUD-0102 — Phase 5: Contacts nested-label hierarchy + smart groups verified live in a real browser · CLEAN (no finding), closes the last "not re-checked visually" gap from the 2026-09-09/10 build
- **Category:** Functional correctness (Phase 5, fifty-eighth journey) — the first journey this arc to
  drive the frontend with Playwright rather than `curl`+JWT, closing a gap explicitly flagged in
  memory since the feature's original build: "frontend not re-checked visually."
- **Trace:** launched `apps/web`'s real dev server, logged in through the actual `/login` form as the
  seeded `admin@msomi.co` / `password123` TENANT_ADMIN, and drove `/contacts` end to end with
  Playwright (Chromium). First finding a **non-issue**: the page showed "0 contacts" on first load —
  traced to the dev tenant's only 3 existing contacts all carrying `status: TRASHED` from an earlier
  session's leftover E2E fixtures, not a bug (the active-list query correctly excludes them). Created
  3 real active contacts through the actual "Create contact" dialog (two at "Acme Traders", one at
  "Zawadi Logistics") to have real data to filter/match against — the first time this exact feature
  had ever been exercised against non-empty data in this dev tenant.
- **Result — all five originally-flagged checks confirmed working, live, in a real browser:**
  1. **Nested label tree with expand/collapse**: created a top-level label ("VIP Customers") and a
     real sub-label ("Gold Tier") under it via the real "Create label" dialog's parent-label
     selector; the sidebar correctly rendered "VIP Customers" with a folder icon and expand chevron,
     "Gold Tier" properly indented beneath it. Clicking the chevron (`.csb-label-twist`, distinct
     from the label-select button and the options-menu button) correctly hid "Gold Tier" on collapse
     and restored it on re-expand — verified by checking the child row's visibility directly, not
     just eyeballing a screenshot.
  2. **"Add sub-label" / "Move to…" / rename**, all from the label's hover-revealed options
     dropdown: added a real sub-label ("Hot Leads") under a second top-level label ("Prospects") —
     correctly nested; renamed it to "Warm Leads" via the real rename dialog — correctly updated in
     place; used "Move to…" (a submenu correctly listing "Top level" plus every other label except
     the item's own current parent) to move "Warm Leads" out to top-level — correctly re-rendered as
     a flat, un-indented label, and "Prospects" correctly lost its folder icon once it had no
     remaining children.
  3. **"Smart groups" section with a working "+"**: correctly shows an empty state ("No smart groups
     yet") with a `title="New smart group"` button that routes to `/contacts/smart/new`.
  4. **The rule-builder page renders correctly**: proper `PageHeader`-styled title ("New smart
     `group`."), a NAME field, a "Match [all/any] of the following rules" selector, and a rule row
     with real field/operator/value selects (defaulting to Company/is/value) plus a working
     "+ Add rule" button that appends a second, independently-editable rule row.
  5. **An existing smart group opens and shows its live matched-contact list**: created a real smart
     group ("Acme Traders Contacts", rule `company eq "Acme Traders"`) — saving it correctly `POST`ed
     to `/v1/contacts/smart-groups`, navigated to `/contacts/smart/:id`, and immediately fetched
     `/smart-groups/:id/contacts`, rendering exactly the 2 matching contacts (Grace Mwangi, John
     Kamau) while correctly excluding the third (Amina Hassan, a different company) — a real,
     server-evaluated match against live data, not a stored membership list. The sidebar's own
     smart-group entry showed a live "2" count badge next to it.
- **No bug found** — every one of the five originally-flagged unknowns renders and functions exactly
  as the 2026-09-09/10 build's own API-level testing implied it should; this pass supplies the
  missing visual/interaction confirmation that testing was waiting on.
- **Test-artifact handling:** unlike SEAL/FinOps/HR record types elsewhere in this arc, Contacts,
  labels, and smart groups all have real delete actions with no audit-trail reason to preserve
  throwaway UI-test scaffolding, so all of it was cleaned up via the app's own real delete flows: the
  smart group was hard-deleted, all 4 labels were hard-deleted, and the 3 test contacts were trashed
  (contacts have no hard-delete from the list view, matching the pre-existing 3 trashed fixtures from
  an earlier session that were never purged either — left in the same state, not specially treated).
  Also cleaned up 2 stray duplicate contact rows created by an earlier flaky version of the test
  script itself (a transient `402` usage-limit response was misread as a hard failure when the
  underlying request had actually already succeeded) — not a product bug, a test-script artifact,
  caught and corrected before it could be mistaken for one. Usage counter lowered twice for the
  metered contact-creation calls and confirmed restored to 500/500 afterward. No code changes this
  pass.

### HUD-0101 — Phase 5: SEAL bonded-storage billing golden path traced live · found and fixed a real HIGH cross-customer authorization gap (`seal-billing.routes.ts` had no `CUSTOMER`-block, unlike every sibling SEAL file)
- **Category:** Functional correctness (Phase 5, fifty-seventh journey) + a HIGH authorization finding
  (found live while tracing, not by another sweep pass).
- **Trace:** the golden path HUD-0099's own testing never completed — a real compartment billing
  rate → accrual preview → generated invoice → watermark-advance → double-billing prevention, for
  both billing methods `seal-billing.service.ts` supports. Created two real compartments via
  `POST /compartments` (`flat_per_lot` and `per_cbm`) and configured real rates on each via the
  same `PATCH /compartments/:id` route fixed in HUD-0099 (15,000 TZS/day + 25,000 handling; 2,500
  TZS/CBM/day + 25,000 handling) — the first time either billing method has ever actually been
  configured on this dev tenant (every pre-existing compartment had all-zero rates). Created three
  real lots backdated to `warehousedOn: 2026-09-11` (a flat-rate lot, a per-CBM lot with a real
  12 CBM volume, and a per-CBM lot with no volume) via the real `POST /lots` receiving flow.
- **Result: every mechanism hand-verified exactly, both billing methods.** `GET .../storage-accrual`
  on the flat-rate lot returned `days: 5` (hand-computed from `2026-09-11` to the real current
  timestamp), `storageAmount: 75,000` (5 × 15,000), `handlingFeeFlat: 25,000` (first invoice only),
  `totalAmount: 100,000` — exact. The per-CBM lot correctly derived its effective daily rate
  (`12 CBM × 2,500 = 30,000/day`) and totaled `175,000` — exact. The no-volume per-CBM lot correctly
  threw `LotHasNoVolume` (422) on both the preview and the generate routes, matching the service's
  own guard. `POST .../generate-storage-invoice` created two real DRAFT `sales_invoices` rows with
  the exact hand-verified totals, each with two correctly-priced `sales_invoice_lines` (a
  `PER DAY`-unit storage line and a `FLAT`-unit handling line, confirmed directly in Postgres, not
  just the response) and the right `customer_id` resolved from the lot's own `owner_id`. **The
  double-billing guard was proven live, not just read from the code**: re-checking accrual on both
  lots immediately after invoicing returned `days: 0`/`totalAmount: 0`/`includesHandling: false`
  (correctly one-time-only), and a second `generate-storage-invoice` call on each was correctly
  refused with `NothingToBill` (422) — the `storage_billed_through` watermark genuinely prevents a
  second charge for the same days, confirmed directly against Postgres (`storage_billed_through`
  advanced to exactly the accrual's own `toDate` on both lots).
- **Found and fixed a real HIGH bug while testing the authorization boundary** (this arc's standing
  practice of testing more than the happy path): `seal-billing.routes.ts` has only an authentication
  + entitlement preHandler, with **no role check at all** — unlike every sibling SEAL route file
  (`seal.routes.ts`, `seal-warehouse-ops.routes.ts`), both of which carry an explicit
  `if (request.user.role === 'CUSTOMER') return reply.status(403)...` block from the original
  HUD-0024/0031 RBAC sweep. `seal-billing.routes.ts` postdates that sweep (built for HUD-0099's own
  billing feature) and never received it. Live-confirmed the real impact with a `CUSTOMER`-role JWT
  for a *different* customer than the lot's real `owner_id`: it could freely read any lot's
  confidential storage rate/accrual figures (`GET .../storage-accrual` → `200`), and — worse —
  could **actually create a real Draft invoice against another customer's lot**
  (`POST .../generate-storage-invoice` → `200`, a genuine `sales_invoices` row created, the lot's
  billing watermark consumed) with zero ownership check anywhere in the path. Not a read-only leak:
  a wrong-customer account could trigger real financial-document creation and consume another
  customer's billing watermark, silently suppressing the days that customer's own staff would later
  see as billable. **Fixed** by adding the identical `CUSTOMER`-block preHandler used platform-wide
  in the sibling SEAL files. Re-verified live: the exact original `CUSTOMER` reproduction now gets
  `403` on both routes; the same requests immediately after with a `TENANT_ADMIN` JWT still succeed
  unchanged.
- **Test-artifact handling:** `seal_lots` has no delete endpoint anywhere (confirmed, matching every
  other SEAL record type traced this arc) — all four test lots and both generated invoices left in
  place, clearly labeled `HUD-0101` in their descriptions/notes. The two test compartments **were**
  soft-deactivated via the real `DELETE /compartments/:id` (a soft `active: false` flip, not a hard
  delete — confirmed by reading the handler). Temporary `seal` entitlement override and usage-counter
  lowering (for the metered compartment/lot `POST`s) both reverted/restored and verified. `tsc
  --noEmit` clean on the one changed file (`seal-billing.routes.ts`; same two pre-existing
  concurrent-session CMS errors, unrelated); full suite green (11 files/105 tests); `check:triggers`
  OK.

### HUD-0100 — `seal.routes.ts` `PATCH /locations/:id` crashed with a raw SQL syntax error on an all-unrecognized body · found and fixed while spot-verifying HUD-0099
- **Category:** Functional correctness / error-handling. A different bug class from HUD-0097/0099
  (malformed input, not a bad id) — found opportunistically, not by another sweep pass.
- **Trace:** live-verifying HUD-0099's existence-check fix on this same route a second way — a
  well-formed request body containing no field the route's schema actually recognizes (this route
  only accepts `floorLevel`/`maxStackTiers`/`gridRow`/`gridCol`/`capacityUnits`/`lengthM`/`widthM`/
  `heightM`) — got a raw `500` (`"syntax error at or near \"where\""`) instead of a `400`.
- **Root cause:** the handler builds its update object field-by-field from only the recognized keys
  present in the body. When none are present, that object is empty, and Kysely's `.set({})` emits
  `UPDATE ... SET WHERE ...` — invalid SQL, since there is nothing to assign.
- **Fix:** added a check immediately after building the patch object — `if (Object.keys(patch)
  .length === 0) return reply.status(400).send({ error: 'No valid fields to update' })` — before
  the update runs.
- **Live-verified:** the same request that previously 500'd now returns a clean `400`; a request
  with a real recognized field (`floorLevel`) against a nonexistent id still correctly 404s
  (confirming HUD-0099's fix on this same route is untouched).
- **Scope note:** only this one instance was fixed. Whether the same "empty `.set({})` on an
  all-optional PATCH body" shape recurs elsewhere in the codebase has not been swept — flagged as a
  candidate for a future dedicated pass rather than chased down here, to keep this finding scoped to
  what was actually found.
- **Test-artifact handling:** no persistent data touched — every reproduction used the same
  synthetic nonexistent UUID as HUD-0099's own testing. `tsc --noEmit` and the full suite (11
  files/105 tests) re-run clean after this fix; `check:triggers` OK.

### HUD-0099 — Platform-wide sweep continuation: two more blind spots in HUD-0097's own methodology, closed · found and fixed 19 more real instances across 6 files
- **Category:** Functional correctness / error-handling (direct continuation of HUD-0097).
- **Trace:** while re-verifying `seal.routes.ts` after HUD-0098's journey treated it as
  already-covered by HUD-0097's addendum, found it actually had more unguarded hits than had ever
  been read. Tracing why surfaced two further gaps in the *sweep's own methodology*, not new gaps in
  the codebase's habits:
  1. A file appearing in **both** the single-line and multi-line grep passes had been treated as
     fully checked once any one already-known line in it was re-confirmed — but the two passes'
     match *counts* for that file could differ, so other real hits in the same file went unread.
     Ran a per-file match-count comparison across all 33 files from HUD-0097's addendum file list
     to find every file where this had happened; `hr.routes.ts` showed by far the largest gap (16
     matches never actually read against 15–19 lines previously checked, many of the latter turning
     out to be different token patterns like `session.id`/`existing.id` that don't overlap with the
     strict URL-param-only capture group the sweep's regex used).
  2. The sweep only ever grepped `apps/api/src/routes` — **never `apps/api/src/services`.** Found
     via `seal-billing.service.ts`, where the unguarded `.executeTakeFirstOrThrow()` calls live in a
     service function that a route (`seal-billing.routes.ts`) merely calls into, so no routes-only
     grep could ever have surfaced it.
- **Result: found and fixed 19 more real "crash instead of 404" bugs**, all live-reproduced before
  the fix and re-verified as a clean 404 after:
  - **`seal-billing.service.ts`** (1 finding, 2 call sites) — `previewAccrual()` and
    `generateStorageInvoice()` both looked up a storage lot with `.executeTakeFirstOrThrow()` and no
    prior check. Added a `LotNotFound` error class at the service layer; `seal-billing.routes.ts`
    maps it to a `404` in both routes' catch blocks, ahead of the existing `LotHasNoVolume`/
    `NothingToBill` checks.
  - **`seal.routes.ts`** (3 more routes, missed by the addendum despite this file being in its list)
    — `PATCH /compartments/:id`, `/locations/:id`, `/discrepancies/:id`.
  - **`hr.routes.ts`** (8 routes, the largest single-file count of this pass) — `PATCH
    /departments/:id`, `/designations/:id`, `/leaves/:id/status`, `/announcements/:id`, `/tasks/:id`
    (`hr_tasks`), the main `/staff/:id` profile-update route (had no `.returning()`, so fixed by
    checking `numUpdatedRows` instead of adding one), `/staff/:id/role`, and `/staff/:id/status` —
    this last one is the *exact* route HUD-0091's onboarding/offboarding checklist journey exercised
    successfully every single time, because that trace always supplied a real employee id. A clean
    happy-path trace, however thorough, cannot surface this bug class by construction; only a
    deliberate not-found test can.
  - **`support.routes.ts`** (2 more routes) — `PATCH /tickets/:id/group`, and `/tickets/:id/tags`
    (this one had fetched a `before` row for its own diffing logic but never checked it was
    non-null, so the crash happened even with the lookup already sitting right there unused).
  - **`ondi.routes.ts`** (5 routes, mirroring the same sensitive shape as the HR findings) — `PATCH
    /users/:id/role`, `/users/:id/status`, `/devices/:id`, `/sso-providers/:id`, and
    `/oauth-clients/:id` (`SUPER_ADMIN`-only, `dbPlatform`-scoped since `ondi_oauth_clients` has no
    `tenant_id` column at all).
  - **`tasks.routes.ts`** checked in full as part of the same pass — **clean, zero new findings.**
    Every remaining `.executeTakeFirstOrThrow()` in the file is either a plain `INSERT` or already
    guarded by `resolveTaskAccess()`/an explicit existence check moments earlier in the same
    transaction.
  - All 19 fixes follow HUD-0097's established shape: switch to `.executeTakeFirst()` (or check
    `numUpdatedRows` for a plain `updateTable()` call with no `.returning()`), then a real `404`.
    Handlers with a `reply` parameter return `reply.status(404).send(...)`; handlers without one
    throw `Object.assign(new Error(...), { statusCode: 404 })` — this codebase's own pre-existing
    convention (found at `hr.routes.ts`'s delete-requests route), confirmed compatible with the
    global error handler's `reply.send(error)` fallback.
- **Live-verified both directions** on a representative sample spanning every touched file: a
  synthetic nonexistent UUID against `hr.routes.ts`'s three staff routes, `ondi.routes.ts`'s two
  user routes and its `oauth-clients` route, both `support.routes.ts` routes, and all three
  `seal.routes.ts` routes all now return a clean `404`; the same routes re-tested afterward with a
  real, valid id (a no-op value change on two real staff rows, to avoid mutating shared dev-test
  fixtures) confirmed the happy path is unchanged.
- **Test-artifact handling:** no persistent data was created — every reproduction used the same
  synthetic, well-formed nonexistent UUID convention as HUD-0097. No real seal-billing invoice was
  ever generated during this pass (only tested against a nonexistent lot id), so the originally-
  intended seal-billing golden path — configuring a real compartment billing rate and running a full
  accrual/invoice cycle end to end — remains unattempted and is noted as a follow-up, not this
  entry's scope. The temporary `seal` entitlement override
  (`tenant_settings.settings['enabled-apps'].seal`, granted mid-sweep to reach `seal.routes.ts`) was
  fully reverted (the key removed entirely, not left `false`, matching the tenant's state before
  this session touched it); the usage counter was confirmed already restored to 500/500. `tsc
  --noEmit` clean on all 6 changed files (the two remaining errors are entirely contained in
  `cms-content.routes.ts`/`cms-content.service.ts`, both untracked files belonging to a different,
  concurrent session's own in-progress CMS work); full suite green (11 files/105 tests);
  `check:triggers` OK.
- **HUD-0097 + HUD-0099 total, all three passes combined: 66 real "crash instead of 404" bugs found
  and fixed across 27 files.** The lesson this entry adds on top of HUD-0097's own: a bug-class
  sweep's coverage bookkeeping needs the same rigor as the code it's auditing — "this file already
  appeared in an earlier pass's file list" is not the same claim as "every line in this file
  matching the pattern was actually read," and a sweep scoped to one directory (`routes/`) will
  silently miss the same bug living one function call away, in `services/`.

### HUD-0098 — Phase 5: SEAL reefer monitoring + yard slotting journey traced live · CLEAN (no new finding beyond HUD-0097's addendum)
- **Category:** Functional correctness (Phase 5, fifty-sixth journey).
- **Trace:** `seal-warehouse-ops.routes.ts` — the file whose two not-found bugs kicked off HUD-0097's
  addendum sweep; this journey traces the file's *own* golden path rather than just its bug. Created
  a real consignment → a real container (a genuine ISO 6346 check-digit rejection hit first, on a
  made-up container number — confirmed the validation is real, not decorative — then a valid one
  succeeded) → a real reefer-tracked lot (`reefer_setpoint_c: -18`) → logged three real temperature
  readings: one comfortably inside tolerance (`-19`), one clearly outside (`-10`), and one exactly
  on the tolerance boundary (`-16`, `±2` from `-18`) → created a yard slot → assigned the container
  to it → assigned a real active vehicle to the same container → unassigned the yard slot.
- **Result: every mechanism is real and correctly derived, not a stored/cached flag.** The `±2`
  tolerance band correctly classified all three readings, including the boundary one landing
  `withinRange: true` (an inclusive `<=` comparison, not an off-by-one exclusive one) — a detail
  easy to get wrong in exactly the direction that would falsely flag a compliant reading. Yard-slot
  `occupiedCount` is a live `COUNT` join against `seal_containers.yard_slot_id`, not a maintained
  counter column: it correctly read `0` → `1` after assignment → `0` again after unassignment, with
  no separate bookkeeping call needed. The vehicle pick-list correctly returned only this tenant's
  real `ACTIVE` vehicles. `CUSTOMER` is correctly refused the entire surface.
- **No new bug found** — the two real bugs this file had (`PATCH /containers/:id/yard-slot` and
  `PATCH /containers/:id/vehicle` both crashing on a bad container id) were already found and fixed
  as part of HUD-0097's addendum earlier in this same session; re-confirmed here that the fix holds
  under this journey's own real container id and, separately, that the pre-existing
  `POST /lots/:id/reefer-readings` guard (already correct before HUD-0097) still 404s cleanly on a
  bad lot id.
- **Test-artifact handling:** none of `seal_consignments`, `seal_containers`, `seal_lots`,
  `seal_yard_slots`, or `seal_reefer_readings` have a delete endpoint anywhere in the API (matching
  the platform-wide no-hard-delete convention this arc has repeatedly confirmed for SEAL's other
  record types) — all left in place, clearly labeled `HUD-0098` in their description/reference
  fields. Usage counter restored to 500/500 (temporarily lowered for this journey's metered
  creates, verified restored); the `seal` entitlement override was reverted. No code changes this
  pass (all fixes already applied and verified in HUD-0097).

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
- **Update, 2026-09-18 (found while checking Calendar's HUD-0131 fix, not a new trace of this
  finding):** the Twilio half of this gap is now closed — `sms.routes.ts`'s `/twilio` delivery-
  status route calls `verifyTwilioSignature` (real HMAC-SHA1 over the exact callback URL, keyed by
  the owning tenant's own decrypted Twilio auth token) before touching `sms_messages`, and both
  `/africas-talking` and `/twilio` sit behind the shared `?token=` `SMS_WEBHOOK_SECRET` preHandler
  guard HUD-0125 added for the inbound STOP-reply route. This was a concurrent session's own work
  (confirmed by grep, not this session's fix — see `apps/api/src/integrations/sms.ts`'s
  `verifyTwilioSignature` and its own header comment for the implementation). Africa's Talking
  still has no per-request signature scheme of its own (genuinely doesn't offer one), so it relies
  on the shared-secret guard alone — the same "fails open until a secret is configured" posture
  GPSWOX/WhatsApp already have. Downgrading this finding's real-world risk accordingly; not
  re-opening or closing the HUD number outright since this session didn't do the fix or re-verify
  it live end to end.
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
