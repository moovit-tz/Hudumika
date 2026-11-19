# Hudumika staff console

The staff console (`/console`) brings platform administration, customer operations, product operations, security, billing and service monitoring together. Platform staff sign in with their own accounts. Their staff roles, teams and assignments decide where they land, what the navigation shows, which records they can see and what they can do.

Status (2026-11-18): built and verified locally. Not committed or deployed.

## Where things are

| Piece | Location |
| --- | --- |
| Permission catalog, role templates, sections, homes, return-path rules (shared by API and web) | `packages/types/src/staff.ts` |
| Schema | migrations `919_staff_console.sql`, `920_staff_actor_columns.sql` |
| Authorization (identity, permissions, scope, audit) | `apps/api/src/services/staff-access.service.ts` |
| Cases: SLA, routing, claims | `apps/api/src/services/staff-cases.service.ts` |
| API: overview, customers, products, teams, staff, monitoring, security, billing, audit, settings | `apps/api/src/routes/staff-console.routes.ts` (`/v1/staff`) |
| API: cases, incidents, access sessions, customer approvals | `apps/api/src/routes/staff-cases.routes.ts` (`/v1/staff`, `/v1/platform-support/access-requests`) |
| Console UI | `apps/web/src/shells/ConsoleShell.tsx`, `apps/web/src/pages/console/*` |
| Tests | `apps/api/src/tests/staff-console.test.ts` |
| Deployment | `deploy/contabo/compose.yaml` (`admin-api`, profile `admin`), `deploy/contabo/admin-console.Caddyfile.example` |

## What existed before, and what was reused

- **SuperAdmin** (`/admin`, `users.role = 'SUPER_ADMIN'`, `superadmin.routes.ts`) is unchanged and still available. The console links to it for SuperAdmins.
  - A staff SuperAdmin grant does not open the old role-gated routes, and the old role does not open the console without a staff grant.
- **Cases** reuse `platform_support_tickets`: the queue workspaces already use to ask Hudumika for help. There is no second case system.
  - Migration 919 adds owner, team, severity, SLA milestones, a pause clock, escalation, the customer outcome and an optimistic `version`.
  - Messages gain `visibility` (`customer` | `internal`).
  - The workspace-side routes now return only customer-facing columns and customer-visible messages.
- **Lens** links reuse `lens_links` with provider `hudumika_issue`, the same link SuperAdmin's "Send to Lens" already writes. Lens GET routes now also admit staff with `lens.view`; Lens writes stay SuperAdmin-only.
- **Operator audit** (`platform_operator_audit`, migration 643) records staff access sessions and the changes made through them.
- **Telemetry** comes from tables that already existed: `api_usage_events`, `app_status`, `email_outbox`, `zentra_event_outbox`, `studio_event_outbox`, `lens_outbox_events`, `durable_jobs`, `lens_releases` and `platform_activity_log`. No new collector was added.
- **Security** reuses `hr_devices` (sessions; revoking sets `revoked_at`, which `authenticate()` already enforces), `user_totp` (MFA) and `ondi_auth_events` (sign-in history).
- **Billing** reuses `tenant_product_subscriptions`, `subscription_invoices` and `tenants.plan`; plan changes link to the existing SuperAdmin tools.
- **Entitlement** reuses `tenantHasEntitlement`.

### Discrepancies found

- **AGENTS.md is out of date:** it says `apiFetch` attaches a Bearer token from `localStorage['hudumika_token']`. It actually sends the session cookie (`credentials: 'include'`).
- **The sign-in page doesn't validate `returnTo`:** `Login.tsx` passes it straight to `navigate()`. The console validates its own return paths (`safeStaffReturnPath`), but sign-in itself is unchanged and I have not tested it with external URLs.
- **Deleting a workspace that contains staff was blocked:** the actor columns in migration 919 had foreign keys that made the delete fail. Migration 920 fixes this.

## Identity and authorization

- **Staff identity.** A `staff_members` row for an existing user, plus role grants. Workspace roles (`users.role`) are never consulted: a tenant ADMIN, MANAGER or FINANCE gets nothing. A membership with no roles gives no sections.
- **Bootstrap.** Migration 919 makes every existing active `SUPER_ADMIN` user a staff member with the SuperAdmin role. That is the only way in at first; everything after is granted in the console.
- **Every request** reloads the staff context from the database, with no caching:
  - the user is active and their tenant is not suspended;
  - membership is active;
  - only grants that have started, haven't expired and haven't been revoked count.
- **Impersonated sessions** are never staff.

### Combination rules

- **Permissions.** The union of every live role grant and every live `allow` override, minus every live `deny` override. A deny always wins.
- **Product scope.** All products if any live role is broad-scope, an `all_products` grant exists, or one of the person's teams covers all products. Otherwise, the union of direct product grants and team products. A `deny` product grant removes that product in every case.
- **Customer scope.** The same rules, plus customers the person owns or backs up. A `deny` customer grant removes that customer in every case.
- **Cases.** A case is in scope when its customer or its product is in scope, and neither is excluded. A product team works that product's cases for every customer, but doesn't get those customers' relationship data unless it also covers them.
- **Out-of-scope records** answer 404, the same as missing ones.
- **Same rules everywhere.** Lists, counts, search, records, exports and mutations all use the same predicates: `customerScopeSql` / `caseScopeSql` in SQL, and `canCustomer` / `canCase` for single records.
- **Browser input is never trusted.** Customer ids, app ids and permissions sent by the browser are only things to check.

### Guards

- **No self-escalation:**
  - nobody changes their own grants, status or team membership;
  - nobody grants a permission they don't hold;
  - only broad-scope staff grant broad scope or create broad-coverage teams;
  - nobody edits the permissions of a role they hold.
- **The SuperAdmin role** always holds every permission and cannot be edited.
- **Last SuperAdmin.** You can't revoke or suspend the last active SuperAdmin with a non-expiring grant.
- **Sensitive actions** (opening a customer access session) require the actor to have two-factor sign-in when `STAFF_SENSITIVE_REQUIRES_MFA=true`. This is the default in production and is set on `admin-api`. It is off in development.

### Role matrix (initial templates; editable)

| Permission | SuperAdmin | Ops Manager | Product Ops Lead | Ops Agent | CSM | Security | Billing | Engineer | Auditor |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| overview.platform | ● | | | | | | | | |
| overview.operations | ● | ● | ● | | ● | | | | |
| work.own | ● | ● | ● | ● | ● | | | | |
| customers.view | ● | ● | ● | ● | ● | ● | ● | | ● |
| customers.manage | ● | ● | | | ● | | | | |
| customers.export | ● | ● | | | | | | | |
| products.view / products.manage | ● / ● | ● / | ● / ● | ● / | ● / | | | ● / | |
| teams.view / teams.manage | ● / ● | ● / ● | ● / | ● / | ● / | | | | |
| cases.view, claim, update, internal_notes, reply, verify_outcome | ● | ● | ● | ● | ● | | | view + notes | |
| cases.assign | ● | ● | ● | | | | | | |
| cases.export | ● | ● | | | | | | | |
| incidents.view / manage | ● / ● | ● / ● | ● / ● | ● / | ● / | | | ● / ● | |
| lens.view / lens.link | ● / ● | ● / ● | ● / ● | ● / | | | | ● / ● | |
| access.request | ● | ● | ● | ● | ● | | | | |
| access.approve | ● | ● | | | | ● | | | |
| access.oversee | ● | | | | | ● | | | |
| security.view / revoke / export | ● | | | | | ● ● ● | | | view |
| billing.view / change / export | ● | | | | | | ● ● ● | | view |
| monitoring.view | ● | ● | ● | | | | | ● | |
| maintenance.manage | ● | | | | | | | ● | |
| audit.view / export | ● | view | | | | ● ● | view | view | ● ● |
| staff.view / staff.manage | ● / ● | view | | | | view | | | view |
| settings.view / manage | ● / ● | | | | | | | | |
| Broad scope | yes | no | no | no | no | yes | yes | yes | yes |
| Default home | Platform overview | Operations overview | Assigned products | My work | My customers | Security overview | Billing overview | Service health | Audit and reports |

The live matrix is under Teams & Assignments ▸ Role matrix.

## Landing and navigation

- **Navigation and route guards come from one table.** Both are built from `STAFF_SECTIONS`, and each route is wrapped in `SectionGuard`. The API checks every request again on its own.
- **`/console` resolves the landing page in this order:**
  1. A `returnTo` that `safeStaffReturnPath` accepts: an internal `/console/…` path the viewer may open. Schemes, hosts, `//`, backslashes and control characters are rejected.
  2. The person's chosen home, if still allowed.
  3. Their first role's default home.
  4. The first allowed home in `STAFF_HOME_FALLBACK_ORDER`.
  5. Otherwise, an "access is being set up" state.
- **Choosing a home.** `PUT /v1/staff/me/home` accepts only homes the person can currently open.
- **Deep links and refresh.** Signed-out deep links go through the existing `/?returnTo=…` sign-in flow. Direct links and refreshes keep their route, and a section the person can't open shows a clear access-denied state.
- **Scope banner.** Always shown, with the person's roles, product and customer scope, exclusions and environment (local, staging or production).

## Teams, ownership and assignment

- **Teams.** Each team is a product team, a customer portfolio or a shared specialist team. A team covers products and/or named customers. Covering all products or all customers must be set explicitly. One team can be marked as the fallback queue.
- **Members.** Each member has a role (lead or member) and an optional expiry date.
- **Customers.** Each customer has an accountable owner, an optional backup owner (who must be a different person), assigned teams, contacts with escalation order, and service terms (standing authorization, maximum session length).
- **Assignment.** Assigning, reassigning, routing and handoffs (with an internal handoff note) each require a reason. Every change is written to `staff_assignment_history` and `platform_case_events`.
- **Removing a member** never deletes or silently reassigns their open work. The API returns their open cases, and **My Work ▸ Needs reassignment** lists every open case whose owner is no longer active staff, is deactivated, or has left the case's team. A team can't be deactivated while it still has open cases.
- **Handing a case to someone** is refused if that person couldn't see the case with their own grants.

## Cases, queues, SLA and routing

**Queues:** mine, my teams, unassigned, onboarding (category `onboarding`), escalations, overdue, confirm-outcome, incident cases and all. All queues are scoped to the viewer.

**Routing** is explainable. The reason is stored on the case and shown on it.
1. Use the first active rule, by position, whose non-empty fields (product, category, priority, customer) all match.
2. Otherwise, use a team covering the product, then a team covering the customer, then the fallback team. If none exists, the case goes to the Unassigned queue.
3. Within the team, pick an available, active member below their open-case limit, with the fewest open cases.

**Claims are atomic.** `UPDATE … WHERE owner_user_id IS NULL AND version = $v`, so of two concurrent claims exactly one succeeds and the other gets 409. Assignments and updates use the same version check.

**SLA:**
- **Due times.** Calculated from `staff_sla_policies` by priority. Business-hours policies count only `staff_business_hours` (time zone, work days, hours, holidays). URGENT runs 24/7.
- **First response.** The first customer-visible staff reply; internal notes don't count.
- **Pausing.** Waiting on the customer pauses the resolution clock. When work resumes (an operator changes it, or the customer replies through the workspace), the resolution due time moves later by the time it was paused. Waiting on engineering or a third party does not pause it.
- **Resolution and outcome.** Resolved means the status is RESOLVED or CLOSED. The customer outcome (`confirmed` / `not_resolved`) is recorded by a person with a note. "Not resolved" reopens the case.
- **Existing cases.** Migration 919 gave them due times from their priority (wall-clock) and took their first response from existing staff replies.

## Operations and Lens

Three records stay separate:
- the case (customer communication and outcome);
- the Lens item (engineering investigation and fix);
- the Lens release (deployment and verification).

A Lens item marked done never resolves or closes a case. The case page shows the engineering status beside the case, and the operator still confirms the customer outcome.

**Visibility:**
- Lens details need `lens.view`; others see "not visible with your access".
- Internal notes need `cases.internal_notes`, and the workspace never receives them.
- An incident's customer-facing summary is shown only after it is explicitly approved. Editing it withdraws the approval.

**Incidents:**
- Each incident covers a product. It can link a Lens item, has affected customers, and can be linked to cases.
- Resolving an incident closes nothing for customers. The response reports how many linked cases are still open.

## Controlled customer access

**Requesting a session.** An operator who needs a customer's workspace records opens an access session from a dedicated page. The session records:
- the staff member;
- the customer and product (optional);
- the actions (`read`, `configure`);
- the purpose or linked case;
- the minutes requested (capped by the customer's service terms);
- the basis (`customer_approval`, or `standing_authorization` when the customer's service terms allow it).

**Approval.**
- A customer-approval request is pending until one of the customer's workspace ADMIN or TENANT_ADMIN users approves it (`/v1/platform-support/access-requests`). Pending requests lapse after 24 hours.
- A standing-authorization session starts immediately.

**While a session is open:**
- A persistent banner shows the customer, product, actions, time left and purpose, with "Open records" and "End session".
- Records are reached only through `/v1/staff/access-sessions/:id/records/*`. Each read or change is checked against the live session and the operator's current grants, and is logged on the session (allowed or denied).
- Changes are also written to `staff_audit_log` and `platform_operator_audit`.
- The operator acts as themselves. Nothing mints a customer token.

**Records available:** workspace users (no credentials), and product switches (read; or change with `configure`).

**Sessions end when** they expire, the operator ends them, `access.oversee` revokes them, or the access behind them goes away. Losing the role, the customer scope or the product scope revokes the session on the operator's next request.

**Queued actions.** None exist: every access-session action runs synchronously in the request. A future background action must call `currentAccessSession` again when it runs and drop its work if the session is no longer active.

## Monitoring (Overview ▸ Service health)

| Metric | Definition | Source | Window | Refresh | Coverage |
| --- | --- | --- | --- | --- | --- |
| App state | healthy < 2% 5xx; degraded 2–25%; unavailable ≥ 25%; unknown = no requests; maintenance = declared | `api_usage_events`, `app_status` | 1 h | on load | Authenticated requests only; public pages, webhooks and unauthenticated failures are not recorded |
| p95 latency | worst route segment of the app | `api_usage_events.duration_ms` | 1 h | on load | as above |
| Deliveries | failed / pending outbox rows | `email_outbox`, `zentra_event_outbox`, `studio_event_outbox`, `lens_outbox_events` | 24 h | on load | SMS and WhatsApp delivery not summarised |
| Durable jobs | failed / pending by type | `durable_jobs` | 24 h | on load | BullMQ scheduled jobs keep no run history: **health unknown** |
| Incidents | active incidents and affected customers | `platform_incidents` | current | on load | only declared incidents |
| Deployments | last Lens releases | `lens_releases` | last 10 | on load | server container deploys are not reported back |
| Config changes | system-category activity | `platform_activity_log` | last 20 | on load | only changes made through endpoints that log |

Maintenance is shown as a declared state and is never read as a health measurement. Operational telemetry (Service health), audit history (Reports & Audit) and business analytics (the existing `/admin/analytics`) stay separate.

**Missing instrumentation:**
- scheduled-job run history;
- unauthenticated request failures;
- SMS and WhatsApp delivery roll-up;
- integration health per third-party provider;
- deploy events from the server.

## SuperAdmin merged into the console (2026-11-19)

There is one admin app. `/admin/*` now only redirects to the matching
`/console/...` page, and every former SuperAdmin screen is mounted unchanged
inside the console as a **platform tool** under one of the sections. The
tool table, `STAFF_TOOLS` in `packages/types/src/staff.ts`, drives the
sidebar, the route guards (`ToolGuard`), the safe return path, the `/admin`
redirects and the `tools` list in `GET /v1/staff/me`.

| Section | Tools (former /admin page) | Permission |
|---|---|---|
| Overview | Platform dashboard (`/admin/dashboard`) | overview.platform |
| Customers | Companies, Business verification (KYB), Announcements | customers.view (changes: customers.manage) |
| Products | Domains, App status | products.view / monitoring.view (changes: products.manage / maintenance.manage) |
| Billing & Subscriptions | Subscriptions, Packages, Transactions, Finance, Referral commissions | billing.view (changes: billing.change) |
| Reports & Audit | Activity log, Analytics | audit.view / overview.platform |
| Platform Settings | Platform configuration, Design system, SEO, CMS pages, SMS gateways, Signing certificate | SuperAdmin role only |
| Cases & Incidents | Reported Issues → redirected to Cases; "Send to Lens" ported as `POST /v1/staff/cases/:id/lens/new` | lens.link |

**API rule** (`apps/api/src/services/platform-admin-access.ts`). The
`/v1/superadmin/*` endpoints and the package/add-on catalogue writes read and
change every customer with no per-customer filter, so a staff member may use
one only with the mapped permission **and platform-wide scope** (every
customer and product, no exclusions). Scoped staff (Operations Manager,
Product Operations Lead, Operations Agent, CSM) get a 403 with code `scope`
and use the console's own scoped sections. Unmapped endpoints (settings,
integrations tests, signing certificate, Issues, reports builder, tenant
create/delete, a customer's own customer list) stay SuperAdmin-only.
Mutations through the staff path are written to `staff_audit_log` as
`platform_admin.<method>` with route, target, HTTP outcome and a clipped,
redacted body.

**SUPER_ADMIN accounts.** A real (not impersonated) `users.role =
SUPER_ADMIN` account still passes these APIs directly — the bootstrap and
emergency path. Because `/admin` now lands in the console, such an account
that has never been staff gets the SuperAdmin staff role on its first console
visit (`bootstrapSuperAdminAccount`, audited as `staff.bootstrap_superadmin`).
A suspended or revoked staff record is never re-granted.

**Follow-ups closed (2026-11-19).**
- **Console link for all staff.** The header menu's "Admin Console" link now shows for every active staff member, not only SUPER_ADMIN accounts. It is backed by `GET /v1/staff-entry`, a single lookup that grants nothing.
- **Platform settings writes take the staff SuperAdmin role.** Branding, design tokens, design-system version, SEO, workspaces and Stirling (`/v1/platform/*`) and CMS platform pages accept it. The Design System pages' own SuperAdmin checks also accept it inside the console (`useIsPlatformSuperAdmin`).
- **"Login As" (full impersonation) stays with SUPER_ADMIN accounts.** In Companies, other staff get **Request access** instead, which opens a controlled customer access session for that company.
- **SMS gateways stays a workspace page.** It manages the operator's own workspace gateways and keeps that workspace's role rules.
- **The admin API surface allows the extra APIs the tools call.** `API_SURFACE=admin` now allows `/v1/packages`, `/v1/addons`, `/v1/cms/platform-admin` and `/v1/sms/gateways`.

The tool screens themselves are still the SuperAdmin pages as they were. The console UI pass is the next step.

## Console UI (2026-11-19)

The console's own pages are built from the same parts as the former SuperAdmin pages, so the two read as one app. The shared kit is `apps/web/src/pages/console/console-ui.tsx`:
- `KPICard` cards that link into the list behind each number.
- The `rtbl` tables (`DataTable`, `TR`, `TD`).
- Coloured status pills (`Pill`) for case status, priority, severity, SLA, outcome, health, sessions and incidents.
- `.card` panels with a titled header (`Panel`), `Facts`, `Empty` and `Notice`.
- Product display names (`appName`) instead of raw app ids.

Layout and type sizes in `console.css` use tokens only.

**Page layouts.**
- **Case detail:** a two-column workspace. The conversation and the customer outcome sit on the left; details, assignment, Lens and history sit on the right.
- **Queues:** a search toolbar with a queue filter.
- **Team product coverage:** removable chips and a searchable picker.
- **Staff:** a table with a manage panel.

**Quota fix found in the browser pass.** `/v1/staff` and `/v1/lens` are now unmetered in `lib/usage.ts`. Before, every console write counted against the staff member's own workspace plan quota, which locked staff on small plans out after about 100 actions a month.

## Deployment

**Locally,** everything runs in the existing API and web dev servers; open `/console`.

**Implemented support:**
- **`API_SURFACE`** (API environment):
  - `all` (default) behaves exactly as before;
  - `customer` refuses `/v1/staff`, `/v1/superadmin` and `/v1/lens` before any route runs;
  - `admin` serves only the console API, sign-in and the shared endpoints the console shell uses. Add more with `ADMIN_SURFACE_EXTRA_PREFIXES`.
- **`admin-api`** compose service (profile `admin`): same image, `API_SURFACE=admin`, its own CORS origin and public URL, two-factor required for sensitive actions, `mem_limit` / `cpus` budget (`ADMIN_API_MEMORY`, `ADMIN_API_CPUS`), `no-new-privileges`, all capabilities dropped. Validated with `docker compose --profile admin config`.
- **`admin-console.Caddyfile.example`:** an admin host restricted by `remote_ip {$ADMIN_ALLOWED_CIDRS}`, with no-index and no-frame headers. It proxies the API only to `admin-api` and redirects `/` to `/console`.

**To turn it on in production:**
1. Set `ADMIN_DOMAIN` and `ADMIN_ALLOWED_CIDRS`, and point DNS at the server.
2. Append the example to the Caddyfile and run `docker compose --profile admin up -d admin-api gateway`.
3. Set `API_SURFACE=customer` on the public `api` and restart it.
4. Make sure every staff member has two-factor sign-in turned on.

**Not done (needs a decision or external configuration):**
- **Separate frontend bundle.** The admin host serves the same SPA build. Only the API and the host are separated. A separate Vite entry would be needed for release independence of the UI.
- **Separate database role.** `admin-api` uses the same `hudumika_app` / `hudumika_platform` credentials. A narrower staff-only role (grants on the `staff_*` tables plus read access to what the console reads) would need a new role in `configure-roles.mjs` and a separate platform connection in `db/client.ts`.
- **Dedicated identity client and audience.** Admin sign-in uses the shared session cookie scoped to the admin host. There is no separate Ondi client, audience or access policy for the console yet.
- **Not deployed or tested on Contabo.**

## Verification (2026-11-18)

- **`staff-console.test.ts`: 14/14 passing.** It runs through the real routes, with disposable tenants that are removed afterwards and a check that nothing survives. It covers:
  - **Migration:** the SuperAdmin bootstrap, due times on existing cases, and role templates seeded.
  - **Entry:** workspace ADMIN and MANAGER refused; a `users.role` SUPER_ADMIN without a grant refused while `/v1/superadmin` keeps working; a staff SuperAdmin doesn't widen `/v1/superadmin`; impersonation refused.
  - **Landing:** every role lands on its home with the right sections; no role means no sections.
  - **Combined roles and homes:** multiple roles combine; a chosen home is kept, an unavailable one is refused, and the home falls back when a role is revoked.
  - **Return paths:** external and unpermitted ones rejected.
  - **Scope:** applied to lists, counts, search, detail, PATCH, exports, profile billing and sensitive sections.
  - **Two paths, one record:** product → cases and customer → cases return the same records.
  - **Routing and concurrency:** routing reasons; two concurrent claims → one 200 and one 409; stale versions refused; can't assign to someone without access.
  - **Removal:** removing a team member hides the cases at once, and they surface for reassignment; expired grants are ignored; a deny override beats a role; suspension ends access.
  - **Self-escalation guards.**
  - **Lens separation:** done ≠ resolved; outcome needs resolution; internal notes hidden from the workspace; staff-only fields hidden; Lens read-only for `lens.view`.
  - **SLA:** business hours including a holiday; pause and resume through a customer reply.
  - **Access sessions:** approval by the right customer only; read vs configure; logging; scope removal revokes; standing authorization; expiry; oversight revoke.
  - **Audit:** entries for consequential actions, with no secrets.
- **Browser (headless Chromium, 63/63)** against the dev servers, with a disposable fixture (removed afterwards). Signed in through `/auth/login` as each role:
  - landing URL, navigation and scope banner per role;
  - direct link denied; return destinations kept or rejected; case detail; out-of-scope case;
  - refresh on a deep link; access request banner and cancel;
  - workspace admin refused; no-role state;
  - 390 px without horizontal scroll on four pages;
  - keyboard reaches content; no page errors; controls named.
- **`npm run typecheck`** (API, web, trigger, design-system and encoding checks): passes. **`npm run build`**: passes.

**Not verified:**
- the last-SuperAdmin guard (the shared dev database has three real SuperAdmins, which I didn't touch);
- live email, SMS or WhatsApp effects (none are sent by the console);
- deployment on a server.
