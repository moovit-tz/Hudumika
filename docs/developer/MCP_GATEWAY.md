# Hudumika MCP gateway

Hudumika Developer is the MCP integration hub. One Streamable HTTP endpoint (`/mcp`) serves ChatGPT and any standards-compliant MCP client. Each person links their own account with OAuth (PKCE) to one workspace. They see only tools their workspace has enabled and their role may use, and the tools return only records they could already open in the app.

Status (2026-11-17): built and verified locally. Not committed or deployed.

## How it works

| Piece | Where |
| --- | --- |
| Tool contract, schema helpers, projection | `apps/api/src/lib/mcp/types.ts`, `builders.ts`, `validate.ts` |
| Tool catalog, keyed by canonical app id | `apps/api/src/lib/mcp/tools.ts` |
| Actor resolution, policy checks, invocation, write flow, audit | `apps/api/src/services/mcp-gateway.service.ts` |
| Transport (sessions, notification stream, resources, prompts), OAuth, discovery, management API | `apps/api/src/routes/mcp.routes.ts` |
| Prompts | `apps/api/src/lib/mcp/prompts.ts` |
| Schema | migrations `914_mcp_gateway.sql`, `915_mcp_oauth_tokens.sql`, `917_mcp_sessions.sql` |
| Consent page | `apps/web/src/pages/mcp/McpAuthorize.tsx` (`/mcp/authorize`) |
| Developer ▸ MCP | `apps/web/src/pages/developer/McpHubPage.tsx` (`/developer/mcp`) |
| Customer ▸ Connected apps | `apps/web/src/pages/mcp/CustomerConnectedApps.tsx` (`/connected-apps`) |
| Tests | `apps/api/src/tests/mcp-gateway.test.ts` |

**Tools run through the apps' own routes.** Each tool calls an existing REST route in-process (`fastify.inject`) with a two-minute session token for the verified user. That token never leaves the process. As a result, every route's existing entitlement, role and record rules apply unchanged, for example customer scoping, junior-officer assignment, list ownership and budget hiding. Field lists then trim each response to the declared output schema.

**Checks on every call.** These checks run at discovery (`tools/list`) and again on every `tools/call`:

1. The token is RS256, from the Ondi issuer, with `token_use: "mcp"`, the right audience and resource, and not expired.
2. The connection row is still `active` and bound to this user and client.
3. The user is active, the tenant is not suspended, and the platform is not in maintenance.
4. The workspace still allows this actor type (`staff_enabled` / `customers_enabled`).
5. A customer login is still linked to the same customers row, re-resolved without the cache.
6. The tool is enabled for the workspace (read tools on by default, write tools off).
7. The actor type and the staff role are allowed for the tool.
8. The scope is granted (`mcp:read` / `mcp:write`).
9. The app is entitled for this user, using the same `checkEntitlement` logic as the routes, including seat licences.
10. The route's own checks run.

An MCP token is not accepted by the REST API (`authenticate()` only takes Ondi tokens with `token_use: "access"`).

**Protocol.** Protocol versions 2025-11-25, 2025-06-18 and 2025-03-26.

- `POST /mcp` takes one JSON-RPC message, or a batch of up to 20 for 2025-03-26 clients, and answers with JSON.
- **Sessions.** `initialize` returns an `Mcp-Session-Id` (stored in `mcp_sessions` and bound to the connection). A request with an unknown, ended, idle-for-24-hours or other connection's session id gets 404, which tells the client to initialize again. `DELETE /mcp` ends a session. Requests without the header are still accepted, and the bearer token is checked on every request either way.
- **Notification stream.** `GET /mcp` with `Accept: text/event-stream` opens a stream (at most 3 per connection, closed after an hour, with keepalives).
  - It sends `notifications/tools/list_changed`, `prompts/list_changed` and `resources/list_changed` when what the connection may use changes. Workspace switches and revocations made in Hudumika wake it at once, and it rechecks every 30 seconds to catch role and plan changes.
  - It closes when the connection stops being valid.
  - Nothing is sent to the client that it would need to resume.
- **Resources.** `hudumika://workspace/profile` (who you are connected as and which tools you have) and `hudumika://guide/changes`. Templates `hudumika://{shipment|invoice|customer|ticket|lead}/{id}` are listed only when that record's detail tool is available, and reading one runs that tool, with the same checks and audit.
- **Prompts.** `customer_briefing`, `overdue_invoices`, `shipment_status`, `my_day` and `ticket_reply`. Each is listed only when every tool it needs is available. Prompts are text only and grant nothing.
- **ChatGPT `search` / `fetch`.** These two tools have exactly the names and shapes ChatGPT deep research and company knowledge look for.
  - `search` returns `{results:[{id,title,url}]}` with ids like `shipment:<uuid>`. Staff results come from the workspace search; customer results come from their own shipments, invoices and tickets.
  - `fetch` runs that record's detail tool and returns `{id,title,text,url,metadata}`.
- **Discovery cost.** `tools/list` checks each distinct entitlement key once and runs those checks in parallel. It never caches across calls: plan, app and seat-licence changes are written from many places, and a cached list could advertise a tool the person has just lost. That tradeoff was tested: a 30-second cache showed an app the SuperAdmin had just disabled.

**OAuth.**

- Discovery: RFC 9728 at `/.well-known/oauth-protected-resource[/mcp]` and RFC 8414 at `/.well-known/oauth-authorization-server`.
- Client registration: RFC 7591 at `/v1/mcp/oauth/register`. It accepts https redirect URIs, loopback http, and private-use app schemes.
  - Clients registered this way are refused by the general Ondi OAuth endpoints, so open registration can't be used to request REST API scopes.
- PKCE S256 is mandatory.
- Authorization codes (2 minutes) and refresh tokens (30 days, rotated) are stored hashed in Postgres and consumed with `DELETE … RETURNING`.
- Revoking a connection deletes its refresh tokens, and access tokens stop working on the next call.
- Platform operator accounts (SUPER_ADMIN) and impersonated sessions cannot link.

**Workspace binding.** A connection binds to the workspace of the account the person signs in with. The consent screen names that workspace and offers "Use a different workspace" (sign out, then sign in to the other account). Hudumika has no cross-workspace account linking, so this is the selection mechanism.

**Writes.** A write tool is listed only when the connection has `mcp:write` and an admin has turned it on. Each change takes two calls:

1. The first call validates the input. Its preview checks referenced records through the app's own routes, and it returns a summary and a single-use confirmation token. Nothing is written.
2. The second call, with the token, runs the app's create route once.

Idempotency:

- `idempotency_key` is required. A retry returns the stored result.
- Reusing a key with different arguments is refused.
- Task IDs are also derived from the key, so a duplicate insert is impossible even past the gateway.

**Audit.** Every call writes `mcp_call_log`: actor, tenant, client, tool, app, outcome, HTTP status, duration, and the argument names. It never stores argument values or results. Connection grants and revocations go to the auth audit chain.

## Coverage matrix

Every id in `ALL_APP_IDS` (38). "Verified" means the tool was discovered and invoked over MCP and returned a valid, schema-conforming result.

- **(T):** verified in `mcp-gateway.test.ts`, a disposable tenant with every app enabled, run through `/mcp` as a tenant admin.
- **(D):** verified against the demo tenant's real data through the full OAuth flow, returning rows.

Field names for tools that only had empty lists to return were checked against the route's select list or table columns.

| App id | Tools (read · **write**) | Actors | Verification | Notes / blockers |
| --- | --- | --- | --- | --- |
| clearos | list_shipments, get_shipment, list_declarations, list_quotations, list_shipment_notes, **add_shipment_note** | staff; customer (shipments, quotations) | T, D (66 shipments, declarations, quotations); customer sees only own shipments (T); note write + cross-workspace refusal (T) | Notes route no longer accepts another workspace's shipment id (fixed below) |
| finops | list_invoices, get_invoice, invoice_summary, list_bills, list_payments, **create_draft_invoice**, **record_payment** | staff (route roles); customer (own issued invoices, own payments) | T, D (16 invoices, bills, totals); customer sees own non-draft invoices only (T) | Invoice list has no total column; detail and summary carry totals. Customer portal invoices fixed (below). Invoices are created as Draft only (never issued or fiscalised). Payments are for finance/manager/admin roles only (narrower than the route). The preview refuses drafts, void or paid invoices and amounts above what is outstanding, and the route's own Idempotency-Key is used |
| complyos | compliance_dashboard, list_obligations, list_renewals | admin, manager | T, D | Role loss removes the tools from an existing connection (T) |
| bliss | list_tickets, get_ticket, list_kb_articles, list_chat_channels, **create_ticket**, **reply_to_ticket**, **send_customer_message** | staff; customer (tickets, create_ticket, reply_to_ticket) | T, D (38 tickets); customer ticket always filed for own account; customer reply only on own ticket (T) | reply_to_ticket is in-app (portal) only. send_customer_message sends email, SMS or WhatsApp (annotated `openWorldHint`); the confirmation names the exact address or number, and it is refused when the customer has none. Chat message text is deliberately not exposed |
| nexushr | list_staff, list_departments, my_leave_balances, list_my_leave_requests, list_payroll_runs, **request_leave**, **create_draft_payroll_run** | staff | T, D; leave request executed through HR's own rules (T) | Leave is always for the connected person. Payroll is admins/finance only: run totals (no individual salaries) and creating a DRAFT run. Calculating, approving and paying stay in NexusHR |
| onesite | list_pages, list_posts, list_forms | staff | T (real rows created through the CMS routes) | |
| onsite | hosting_overview, list_domains | staff (route roles) | T, D (overview) | |
| ondi | list_members, list_sign_ins | admins | T, D (11 members, sign-ins) | IP addresses omitted |
| tracking | fleet_summary, list_vehicles, list_consignments | staff (route roles) | T, D (15 vehicles, consignments) | |
| cloud | list_drives, list_files | staff | T, D (drives) | Names/metadata only; no file contents |
| workspace | list_notifications, search, customer_overview (cross-app), `search` + `fetch` (ChatGPT) | staff; customer (notifications, search, fetch) | T, D (SDK: search → fetch on real data) | Admin console itself has no tools; see below |
| admin | — | — | — | **Platform only.** SuperAdmin console; never available through a tenant connection, cannot be enabled by tenant admins (T) |
| email | list_messages | staff | T, D | Sender/subject/snippet only, no bodies or attachments |
| crm | list_customers, get_customer, list_leads, get_lead, list_deals, **create_lead**, **update_lead_stage** | staff (route roles) | T, D (customers, leads); lead create + stage move (T) | Stage changes to/from built-in stages were failing; fixed (below) |
| contacts | list_contacts, upcoming_birthdays, **create_contact** | staff | T (contact created through the tool, then listed) | |
| store | list_apps, list_installed | staff | T, D (5 apps) | |
| calendar | list_events, **create_event** | staff | T, D; event created and listed (T) | No guests are invited by the tool |
| tasks | list_tasks, list_task_lists, **create_task**, **complete_task**, **delete_task** | staff | T, D; write flow + idempotency (T) | |
| notes | list_notes, **create_note**, **delete_note** | staff | T, D; write flow (T) | |
| sign | envelope_counts, list_envelopes | staff; customer (list_envelopes) | T, D (19 envelopes); customer never sees staff envelopes (T) | Customer list leak fixed (below) |
| sms | messaging_stats, list_campaigns | staff | T, D (stats) | Disabling the app removes the tools (T) |
| demurrage | summary, list_containers | staff (route roles) | T, D (containers) | |
| cargotracker | tracking_summary, list_tracked_containers | staff | T, D (summary) | |
| seal | bonded_summary, compartment_occupancy | staff | T, D | |
| studio | automation_stats, list_runs | staff | T, D (stats) | |
| hudubi | list_metrics, dashboard | staff | T (13 metrics, live KPIs) | Not in the demo plan |
| petti | list_wallets, transactions_summary | staff | T, D (2 wallets) | |
| pos | list_sales, sales_report | staff (route roles) | T (real sale row) | No POS sales in demo data |
| projects | list_projects, portfolio_summary, list_risks, list_contracts | staff | T, D | Budget hiding by role is the route's own |
| developer | list_api_products, list_accounts | staff | T, D | Existing `GET /v1/developer/accounts` creates a personal account on first read |
| travel | list_trips, list_expenses, **create_trip** | staff | T (trip created through the tool; expense created through the route; both listed) | Not in the demo plan |
| tuma | list_parcels, list_offices | staff | T (real office + parcel through the parcel route) | list_offices always returned nothing before (wrong response key); fixed |
| lexcore | list_matters, list_deadlines, list_court_events | staff | T (real client + matter through the legal routes) | `/v1/lexcore/*` never authenticated; fixed (below). Deadline, court case and court event created through the legal routes and listed. list_court_events always returned nothing before (wrong response key); fixed |
| ngao | list_incidents, list_assessments | staff | T (real incident and DPIA through the routes) | Not in the demo plan |
| gereji | list_job_cards, list_vehicles | staff | T (real vehicle through the route) | Both tools always returned nothing before (wrong response key); fixed. Job card created through the route and listed |
| zentra | oversight_overview, list_policies | admin, manager | T (live posture) | Not in the demo plan |
| pulse | marketing_overview, list_campaigns, list_segments | admin, manager, sales | T, D (overview) | |
| lens | — | — | — | **Internal.** SuperAdmin-only tooling, excluded from tenant and customer discovery (T) |

Totals: 36 apps with tools, 111 tools (93 read, 18 write; 14 available to customers), plus 5 prompts and 2 resources with 5 record templates. 2 apps deliberately have no tools (`admin`, `lens`). No app is blocked for lack of a backend workflow.

## Scenario evidence (`mcp-gateway.test.ts`, 18/18 passing)

- Discovery documents, the 401 challenge with `resource_metadata`, and GET returning 405.
- Registration refuses `javascript:`, non-loopback http and fragment URIs. Registered clients are unknown to Ondi's REST OAuth.
- PKCE: a wrong verifier, a replayed code and a missing challenge are all refused. The MCP token gets 401 on `/v1/shipments`.
- A real read tool was invoked for every implemented app.
- Arguments are validated against the advertised schema, and unknown tools give -32602.
- **Cross-app.** `workspace.customer_overview`:
  - It combines CRM, FinOps, ClearOS and Bliss; each section is checked independently.
  - Disabling FinOps' tool removes only that section.
  - Another tenant's customer id is refused by the CRM route.
- **Two tenants.** Tenant B can't read A's shipment or customer, and its tool list reflects its own apps. An RLS cross-tenant read returns nothing.
- **External customer.**
  - Connecting is blocked until an admin enables it.
  - After that, the customer sees only customer tools and only their own shipments and tickets, and gets an `actor_type` refusal on FinOps.
  - Re-linking the login to another customer cuts access immediately.
- **Writes.**
  - A tool is off until enabled.
  - Confirmation is required, and a bad token is refused.
  - A retry replays the stored result, and reusing a key with different arguments conflicts.
  - Exactly one task is created. Notes work the same way.
  - A customer's ticket is always filed for their own account.
- **Audit.** Outcomes are recorded with no argument values, and the log is admin-only.
- **Live changes.** A role change, a disabled app and a disabled tool all take effect on existing connections.
- **Platform-only.**
  - `lens`/`admin` tools can't be enabled (404), and the catalog marks them platform/internal.
  - No `lens__`/`admin__` tool is ever listed.
  - SUPER_ADMIN can't link.
- **Revocation.** Admin revoke gives 401 and kills the refresh token. Self-revoke works; revoking someone else's connection gives 404. Turning staff MCP off gives 403. Refresh tokens rotate and can't be reused.
- **eSign regression.** A customer login no longer sees staff envelopes, under any `view`.
- **More writes.** All 9 new write tools ran through confirmation to a real change, then the result was read back through a read tool. Shipment notes for another workspace's shipment are refused by the tool and by the REST route.
- **Higher-impact writes.**
  - Draft invoice: the summary states the total including tax (TZS 168,000.00), the invoice is created as Draft, and the customer can't open it. Bad lines are refused by the schema.
  - Payment: refused on a draft and above the outstanding amount. Recorded once, and a retry replays the result without a second payment. SALES can draft invoices but not record payments or start payroll.
  - Outbound message: the confirmation contains the customer's real email address and is refused when there's no phone for SMS. It is not executed in the test, because it would reach the configured mail or SMS gateway.
  - Payroll: a draft run is created and listed, and a second run for the same month is refused.
  - Trash: the task and the note leave their lists and stay restorable.
  - Clients see `openWorldHint` and `destructiveHint` on the right tools.
- **Real rows for previously empty apps.** Records were created through each app's own route (CMS page, post and form; legal client and matter; privacy incident; workshop vehicle; Tuma office and parcel) plus one POS sale row. The list tools return them with the expected values.
- **Customer invoices.** Through MCP and the portal's REST calls: own issued invoice only, no drafts, no other customer's; stats, report, activity and create stay 403.
- **Protocol.**
  - Session issue, 404 on unknown, other-connection and ended ids, and DELETE.
  - A 2025-03-26 batch.
  - Resources list, templates and read, with cross-workspace refusal.
  - Prompts list and get, with argument validation.
  - `search`/`fetch` for staff and customers.
  - Over a real socket, the stream announces `tools/list_changed` when an admin switches a tool, and closes when the connection is revoked.

## MCP clients

- **Official MCP TypeScript SDK 1.17.5, rerun after the protocol work: passed.** It listed 77 tools for the demo admin, ran `search` → `fetch` on real demo data, listed and got prompts, listed and read resources (profile and a real shipment), got a session id, and received `notifications/tools/list_changed` on the GET stream it opened itself when the admin switched a tool (switched back afterwards).
- **Official MCP TypeScript SDK 1.17.5 (first run): passed.** It ran its own discovery from the 401, dynamic registration and PKCE through the public origin (`http://localhost:5173/mcp`, via the Vite proxy). It then ran `initialize` and listed 71 tools for the demo admin. It also called `clearos__list_shipments`, `finops__invoice_summary`, `workspace__search` and `tasks__list_tasks`, and the SDK validated each `structuredContent` against the advertised `outputSchema`. Only the consent click was scripted, using the same approve API the page calls.
- **Scripted raw-HTTP client:** the full OAuth flow and every tool, against the demo tenant.
- **ChatGPT: not tested.** ChatGPT connectors need a public HTTPS URL and a signed-in ChatGPT account with developer mode. Neither is available from this machine, and signing into third-party accounts is out of scope here. To test, deploy (or tunnel) with `PUBLIC_APP_URL` set to the public origin, then follow Developer ▸ MCP ▸ Connect a client. Tool names use `app__action` because OpenAI tool names don't allow dots.

## Browser checks (headless Chromium, 21/22, the one miss a false positive)

These were run against the dev server:

- **Consent page:** shows the client, a self-registered badge, the redirect host, the workspace and account, and the "Allow changes" toggle. Unticking that toggle grants read only. Connect returns a code and state.
- **Developer ▸ MCP:**
  - It lists all 38 app ids, the workspace switches, and the internal note on Lens.
  - Toggling a tool saves.
  - All five tabs render, and Setup fits a 390 px phone with no horizontal scroll.
- **Customer:** consent, Connected apps and revoke work at phone width.
- **Errors:** none on the page.

The one flagged control is the shared sidebar toggle, which is named by its `title`.

## Other things found and fixed on the way

- **`/v1/lexcore/*` never authenticated.** It used `requireEntitlement` with no `authenticate` hook, so every LexCore page got 401. The fix adds the hook (`lexcore.routes.ts`).
- **eSign envelope list leaked to customers.** `GET /v1/sign/envelopes` without `view` (or with only `status`) skipped every scoping branch, and a CUSTOMER login received the tenant's whole envelope list. Customers are now always scoped to envelopes they created or were sent. `customer_id` is accepted as an alias for `client_id`; CustomerDetailPage sends that name, and the filter used to be ignored (`sign.routes.ts`).
- **Customer portal invoices never loaded.** A router-wide hook on `/v1/invoices` returned 403 to every customer login, although the list route has its own per-customer scoping. The list, detail and PDF are now open to customers. Detail and PDF check ownership, which they never did. Drafts are hidden from customers. Every other invoice route stays staff-only. `CustomerDashboard.tsx` also passed the user's own id as `customer_id` (another 403); it now relies on server scoping (`invoices.routes.ts`).
- **Shipment notes accepted any workspace's shipment id.** `POST /v1/shipments/:id/notes` only had the FK, which ignores RLS. It now checks that the shipment is in the caller's workspace (`shipments.routes.ts`).
- **Lead stage changes from or to a built-in stage failed.** `leadStageLabel` compared `NEW`/`CONTACTED`… with the uuid column `crm_lead_stages.id`, which makes Postgres throw. New leads start at `NEW`, so moving one failed. A non-uuid custom stage now gets a clean 400 (`leads.routes.ts`).
- **Reading the Developer accounts list created an account.** `GET /v1/developer/accounts` no longer writes anything. The console page creates the personal account with an explicit POST the first time it opens.
- **Usage metering.** `/v1/mcp` is unmetered (connection setup). Writes made by tools still count, through each app's own route.

## Not done / follow-ups

- **ChatGPT end-to-end is still untested.** It needs a public HTTPS address and a signed-in ChatGPT account. Steps are under Developer ▸ MCP ▸ Connect a client. The server side ChatGPT needs is in place: `search`/`fetch`, discovery, dynamic registration, and names without dots.
- **send_customer_message was checked only up to its confirmation**, so that a test never messages a real address. The send itself is the existing Bliss route.
- **Still deliberately not offered through MCP:** issuing or fiscalising invoices, approving or paying payroll, and permanent deletes. Each is irreversible, or a legal or financial commitment, so it stays a human action in the app.
- The stream has no resumability (`Last-Event-ID`); it only carries list_changed notifications.
- **Dev Redis:** `.env` points `REDIS_URL` at port 6380, which only a Docker Redis would provide. Docker Desktop is installed but not running, and the only native Redis is 3.0, too old for BullMQ. MCP doesn't need Redis.
- Developer ▸ API Keys is being rebuilt by another session and was not touched here.
