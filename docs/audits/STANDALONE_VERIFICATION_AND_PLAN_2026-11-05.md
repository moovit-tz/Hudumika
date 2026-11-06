# Standalone app verification and implementation plan

Verified on 5 November 2026 against the local checkout, PostgreSQL, the API on port 3001, and the web app on port 5173.

## Result

Lens, ComplyOS, NexusHR, Developer, Petti, and Onsite have individual interfaces and working representative authenticated API reads. Their interfaces and APIs still ship in the shared Hudumika deployment. Independent customer onboarding, purchase, and deployment have not been established for these six.

Ondi has progressed since the earlier audit. The new apps/api/src/ondi-standalone-server.ts process is running on port 3010. Its health, discovery, and signing-key endpoints respond. Its discovery document advertises the shared issuer and authorization screen at http://localhost:5173. This proves a second identity API process, with shared identity storage and keys. A separately served authorization interface and production origin configuration remain to be verified.

The first implementation milestone should be independently hosted interfaces using the existing APIs and identity service. Later milestones can separate backend services after the ownership and integration contracts are verified.

## Verification performed

- Created disposable workspace-free tenants and test users with the real JWT payload shape.
- Tested anonymous requests, access with the app explicitly disabled, and a representative API read with only the target app enabled.
- Used authenticated Playwright contexts against real local API responses for each interface.
- Rechecked Developer after its account request completed and its overview became visible.
- Reproduced Onsite activation on a disposable tenant with no agency history.
- Inspected the live commercial catalogue, shared services, build configuration, and identity discovery.
- Ran the root type check and the web type check.
- Removed the disposable tenants, users, and automatically provisioned developer accounts.

Enabling an app through a tenant override tests its functional access boundary. It does not prove a standalone purchase or provisioned product subscription.

No external payment, domain purchase, hosting deployment, payroll run, or Petti money movement was tested. Cross-tenant object access and complete business workflows need dedicated acceptance tests.

Evidence is saved outside the repository in the Codex visualization directory for this chat.

- standalone-verification.json contains API statuses, browser errors, and observed failed requests.
- standalone-verification-APP.png contains an initial screenshot for each app.
- standalone-developer-settled.json contains the Developer view after account loading.
- standalone-typecheck.txt contains the failed root type check.
- standalone-web-typecheck.txt contains the successful web type check.
- standalone-api-typecheck.txt records the subsequent API type check.

## API and interface results

| App | Representative API | Anonymous | App disabled / ordinary tenant admin | Target app enabled | Browser result |
| --- | --- | --- | --- | --- | --- |
| Lens | GET /v1/lens/areas | 401 | 403 | 200 with SUPER_ADMIN | Interface rendered without observed uncaught JavaScript errors |
| ComplyOS | GET /v1/comply/dashboard | 401 | 403 | 200 | Interface rendered; shared widgets requested unavailable products |
| NexusHR | GET /v1/hr/departments | 401 | 403 | 200 | Interface rendered; shared Notes and eSign requests received 403 |
| Developer | GET /v1/developer/accounts | 401 | 200 | 200 | Account and overview rendered after loading |
| Petti | GET /v1/petti/wallets | 401 | 403 | 200 | Interface rendered; shared HR, Notes, eSign, and SMS requests received 403 |
| Onsite | GET /v1/onsite/overview | 401 | 403 | 200 | Interface rendered; shared widgets requested unavailable products |

Developer uses account ownership and membership checks. Its account endpoint remains available when the workspace developer feature is disabled. Decide and document whether developer accounts are independent of workspace subscriptions before adding another gate.

The browser runs observed no uncaught JavaScript errors. A successful landing page is narrower evidence than a complete operational workflow.

## Findings that affect sequencing

### V1. Onsite activation bypasses the intended recovery conditions

POST /v1/onsite/plan/activate-standalone returned 200 for a normal workspace-free tenant with no agency history. Its plan became onsite-standalone. The handler authenticates and checks the role, then directly updates tenants.plan.

Source: apps/api/src/routes/onsite-plan.routes.ts.

Before standalone sale, define eligible detached agency clients, validate their history, and activate access through the supported purchase or recovery flow. Preserve the tenant's existing base package when granting an Onsite add-on. Record the action and test retries.

Acceptance checks include a never-managed workspace, a detached client, an already subscribed customer, and a customer with an existing paid base plan.

### V2. Developer provisions spendable-looking test balances

The account read auto-created a personal developer account with a 50,000 TZS credit balance. The source labels this a seed test balance. The console also contains fixed default request, latency, and success-rate figures.

Sources: apps/api/src/services/developer.service.ts and apps/web/src/pages/developer/DeveloperConsolePage.tsx.

Define sandbox allowances separately from paid credits, remove fabricated production telemetry, and verify atomic usage deduction and paid top-ups before external sale. Decide whether personal accounts, organization accounts, and workspace subscriptions are separate commercial subjects.

### V3. Shared interface chrome assumes other products are present

With only one app enabled, several interfaces called HR time, HR tasks, Notes, eSign, SMS, Chat, Email, shipment, and other product endpoints. Those requests returned 403.

The authorization response was appropriate. The client should render only controls that apply to the current product and subscribed integrations. Centralize that decision in shared chrome so each independently hosted interface does not need its own workaround.

Acceptance requires an app-only workspace with no unexpected calls to disabled products and working notifications, identity display, settings, and support.

### V4. These apps lack a unified standalone purchase path

The live commercial_products catalogue contains hudumika_business, clearos, hudufreight, seal, and cargotracker. It has no Lens, ComplyOS, NexusHR, Developer, Petti, or Onsite product rows. Onsite does have an active package_addons offer. Lens is explicitly internal.

Extend the existing product and add-on machinery according to product intent. Avoid creating duplicate Onsite offers. Developer already has a separate account billing model that needs reconciliation with platform billing.

### V5. All six interfaces use the shared web build

The routes are mounted in apps/web/src/App.tsx. The Vite configuration creates one web output. The main API registers all six domains. Existing Contabo configuration serves the common web and API images.

Add a supported app entry configuration with direct landing, restricted navigation, branding, and deep-link handling. Verify one app output independently before expanding to the others.

### V6. Ondi needs an interface and origin boundary

Port 3010 serves the new reuse-based Ondi API. Discovery and JWKS return 200, but the advertised issuer and authorization endpoint remain on the common web origin. The test server permits arbitrary CORS origins with credentials. Production needs a configured allowlist.

The older services/ondi-api and apps/web/ondi code also exists. Its dependency references to @ondi/db, @ondi/shared-types, and pnpm workspace files are unresolved in this checkout. The older service did not respond on port 7020.

Use the running, reuse-based process as the first extraction candidate. Decide the authoritative implementation explicitly before investing in the older tree.

### V7. Build verification is blocked

The root type check failed in API compilation. Failures include missing TenantDb exports, Fastify httpErrors typing, enterprise metrics types, launch-planner date values, and existing tests. It therefore did not reach its later checks.

One error in the calculator entitlement route argument came from earlier work in this chat. Its optional route value was corrected during verification. The subsequent API-only check still reports 31 TypeScript errors. The independent web type check passed. The checkout-wide whitespace check also reports two existing trailing-whitespace lines in apps/web/src/pages/TasksApp.tsx.

A successful API build and the full root checks are required before shipping a standalone release.

## Implementation sequence

### M0. Establish a releasable baseline

1. Resolve API compile failures and complete npm run typecheck and npm run build.
2. Guard Onsite recovery and remove uncontrolled Developer production credit provisioning.
3. Make shared chrome aware of app access and enabled integrations.
4. Select the reuse-based Ondi service as the candidate issuer implementation, subject to its acceptance tests.

Exit evidence includes a clean build, reproduced findings covered by regression tests, and app-only browser sessions without unexpected disabled-product requests.

### M1. Extract one independently hosted interface

Use Onsite as the first customer interface after its activation flow is corrected. Keep the shared API and shared identity records initially.

Implement a product entry mode, app-specific root, branded login return, deep links, footer, settings, and upgrade route. Add native Node service and reverse-proxy configuration that can be run without Docker.

Acceptance includes opening the direct app URL in a fresh browser, signing in through Ondi, returning to the intended workspace and deep link, and accessing only entitled product routes.

### M2. Establish the identity boundary

Configure the Ondi issuer URL, signing-key ownership, authorization UI routing, allowed redirect URIs, cookie scope, CSRF rules, and CORS origins.

Verify authorization code with PKCE, client and redirect validation, refresh, logout, disabled users, revoked sessions, and workspace membership. Keep stable user subject identifiers during the migration.

A separate data migration is unnecessary for the first deployment while identity records remain shared.

### M3. Roll out product entry points

| App | Required product work | Required acceptance workflow |
| --- | --- | --- |
| Onsite | Correct activation and recovery; connect offer, access, and provisioning; provider readiness and failure states | New purchase, former agency recovery, website configuration, deployment-provider status, cancellation |
| Developer | Decide account ownership model; sandbox allowance; paid credits; real telemetry; usage settlement | Create account and project, issue a key, execute an entitled call, deduct once, top up once, reject unauthorized account access |
| ComplyOS | Standalone offer; company-profile ownership; optional CRM, OCR, and finance integrations | Create profile, record an obligation/application, attach a document, receive a renewal reminder, verify independent company access |
| NexusHR | Employer onboarding; employee-band pricing; distinguish HR authority from Ondi identity administration; finance boundary | Invite employee, clock attendance, approve leave, run test payroll and issue payslip, revoke staff access |
| Petti | Provision ledger dependencies behind a supported service; own offer; currency and approval rules | Create wallet, record test deposit, request and approve a disbursement, reconcile ledger, prove isolation and retry behavior |
| Lens | Internal origin and admin SSO; platform data permissions; integration secret ownership | Refuse non-admins, load board, create and update a test item, verify audit record and authorized integration access |

The suggested rollout order is Onsite, Developer, ComplyOS, NexusHR, and Petti. Lens can use the same interface extraction infrastructure on an internal release track.

### M4. Separate backend services where justified

Define data ownership and tenant-scoped API or event contracts before splitting shared database access.

- ComplyOS requires a company-record contract with CRM and renewal-finance boundaries.
- NexusHR requires identity and membership contracts with Ondi, plus payroll and ledger boundaries.
- Petti requires a journal and chart-of-accounts contract with FinOps.
- Developer requires identity, balance settlement, provider execution, and secret-management boundaries.
- Onsite requires provisioning, jobs, provider credentials, and agency ownership boundaries.
- Lens requires intentionally platform-scoped access.

Acceptance includes timeout behavior, safe retries, duplicate event handling, tenant isolation, observability, and recovery after the dependency returns.

## Next concrete work package

Implement M0's Onsite activation correction and Developer credit separation first. Then prove M1 with Onsite's direct interface and Ondi login. Record each app against four independent milestones: interface deployed, identity verified, commercial onboarding verified, and operational workflow verified.

This plan assumes shared identity and APIs during interface extraction. That is a reversible starting architecture. Product prices and any plan to separate databases need explicit commercial and data-ownership decisions.

## Status update — Claude Code, 5 Nov 2026

### M0 release blockers — all four closed, re-verified against this checkout

- **V1 (Onsite activation bypass):** fixed in `onsite-plan.routes.ts`. `/activate-standalone` now requires a real `agency_managed_tenants` row with `status='detached'` and grants via `tenant_addons` (additive) instead of overwriting `tenants.plan`. Verified live: no-history tenant gets 403; a real detached client on `business-tzs` gets `onsite:true` with `finops`/base-plan features untouched. Lens: LENS-64.
- **V2 (Developer credits/telemetry):** fixed in `developer.service.ts` / `developer.routes.ts` / `DeveloperConsolePage.tsx`. Turned out worse than described — the top-up endpoint had *no payment check at all* (any amount, any account, for free), not just a seeded 50,000 TZS balance. Replaced with checkout+verify against the real gateway (same shape as ESB top-up), migration 705. Fabricated telemetry (hardcoded 99.8% success rate, randomized latency, `??` fallbacks papering over real zeros) replaced with honest nulls/zeros. Verified live: fresh account seeds at 0; old route 404s; new route genuinely calls Flutterwave (rejected in this dev env for invalid test credentials, same honest-gap posture as every other payment integration here). Lens: LENS-65.
- **V3 (shared chrome cross-product calls):** fixed in `GoogleWorkspaceRightSidebar.tsx`, `CheckInWidget.tsx`, `WorkspaceHome.tsx`. Notes/eSign/Chat panels and the globally-mounted check-in widget/attendance banner were the unguarded exceptions to an otherwise-consistent `isAppEnabled()` pattern already used for every other panel. Verified live against a real HuduFreight-only tenant's `/v1/entitlements` (`notes:false, bliss:false, sign:false, nexushr:false` — exactly the keys now gating these). Lens: LENS-66.
- **V4 (build baseline):** re-checked repeatedly through this session; the ~31 errors are real but 100% in files this session never touched (`consultant-delegation.*`, `marketplace.*`, `enterprise-metrics.*`, `launch-planner.*` and their tests) — confirmed actively mid-edit by a different concurrent session (error count changes between consecutive identical `tsc` runs with no action taken in between). Not fixed here; flagged for whoever owns those files. Every file this pass touched typechecks clean in isolation.

### M1 — Onsite as first independently hosted interface: started, one foundational fix landed

Found and fixed a platform-wide bug that blocks this milestone's own acceptance test ("sign-in and return to a deep link") for *any* app, not just Onsite: the unauthenticated catch-all route in `App.tsx` rendered the login page in place at whatever URL a signed-out visitor hit, with no `returnTo` ever set — `Login.tsx` and `OndiSignInPanel.tsx` both only read it from the query string. Fixed to redirect with `returnTo` set, mirroring the one sibling route (`/ondi/authorize`) that already did this correctly. Lens: LENS-67. Verified by code trace + clean `apps/web` typecheck; **not yet verified by a live click-through** — no browser automation tool was available this pass.

**Core mechanism built:** `apps/web/src/lib/appEntry.ts` — single-app entry mode resolved from hostname (`onsite.hudumika.tz` -> `onsite`) with a `?app_entry=` dev override, no second build or process. Wired into `App.tsx`'s `HubPage` (direct landing, skips the generic launcher) and `AppHeader.tsx` (cross-app switcher hidden). `deploy/contabo/onsite-subdomain.Caddyfile.example` documents the one extra Caddy block a real deployment would append — not wired into `deploy.sh` automatically, a deliberate operator step. Lens: LENS-68, marked SUSPECTED/IN_PROGRESS — verified by code trace and a clean typecheck only, **not yet by an actual browser click-through** (no automation tool available this pass).

**Settings chrome, done:** `AdminShell.tsx`'s Settings nav filter checked role/org-permission but had no entitlement awareness — every tenant saw "ClearOS / Freight", the whole Finance group, "E-Sign", "SMS" and customs/fleet integrations regardless of whether any applied to them. Added `entitlementKey` to the relevant `NAV` items (`pages/settings/shared.tsx`) and wired the check into the existing filter. Lens: LENS-70. Verified against the real HuduFreight-only test tenant's actual entitlements. Not a security fix — the backend already 403s these sections' own API calls regardless of nav visibility; this stops offering a control that leads nowhere.

**Still open from M1:** Onsite-specific branding/favicon override (deliberately not attempted — the existing branding system is tenant-scoped, not per-app, and extending it risks contradicting the already-established "platform-only branding on pre-auth surfaces" rule; this needs a product decision, not a guess), "Support" chrome (checked — no generic Support nav item exists to scope; `/support-ticket` is already universal), and a live browser verification of the whole chain (visit the subdomain fresh, sign in through Ondi, land on `/onsite`, follow a deep link through sign-in, see only Onsite's entitled routes) — still outstanding, no browser automation tool available this session.

### M2 — identity boundary: issuer and CORS fixed, consent UI still shared by design

Found and closed the actual boundary gap the port-3010 process had: it shared the embedded server's exact issuer identity (both derive from the same `PUBLIC_APP_URL`/`CORS_ORIGINS`), and its CORS policy reflected any origin with credentials (`cb(null, true)`, explicitly flagged in its own comment as temporary). Fixed in `lib/oidc.ts` (`issuerUrl()` now honors a process-only `ONDI_ISSUER_OVERRIDE`, never written to the shared `.env`) and `ondi-standalone-server.ts` (explicit `ONDI_STANDALONE_CORS_ORIGINS` allowlist). Lens: LENS-69. Verified live: `/.well-known/openid-configuration` on 3001 vs 3010 now report different `issuer` values; a CORS preflight from an unlisted origin gets no `Access-Control-Allow-Origin` header; a real sign-in against the standalone instance still works post-change. Cookie scope checked — already consistent between both processes, nothing to fix.

**Still open from M2:** per-relying-party registered-redirect-URI review, and the standalone instance's own browser-facing consent UI — still proxied through the shared `apps/web` origin by design (rewriting that proxy would redirect all of `apps/web`'s traffic, not just Ondi's); a dedicated consent page for this issuer is real follow-on work, not done here.

**Full cycle re-verified post-hardening:** ran the complete OAuth flow against port 3010 with a temporary public test client (PKCE only, cleaned up after) — authorize/info → authorize/approve → token exchange → userinfo → refresh → revoke, all real HTTP calls, all green. Decoded the actual issued access token and confirmed `iss: "http://localhost:3010"` — the issuer fix reaches real tokens, not just the discovery document. Old refresh token correctly rejected after a refresh (single-use); the refreshed token correctly rejected after revoke (logout). LENS-69 updated with this evidence.

## Status update — Claude Code, 5 Nov 2026 (continued, revised handoff)

### Release blocker: Developer settlement atomicity — closed

The revised handoff correctly flagged that the earlier Developer fix (LENS-65) left settlement non-atomic: `verifyTopUp()` did three unguarded writes — read `balance_credits` in JS, write a JS-computed `newBalance`, separately mark the checkout `completed`, separately insert the ledger row. Two concurrent verify calls for the same `tx_ref` (a client retry racing a redirect-return call, a double-click) could both pass the pre-check, both get a real "yes, paid" from the gateway, and both credit the account.

Fixed in `apps/api/src/services/developer.service.ts`: `verifyTopUp()` now claims the checkout with a single conditional `UPDATE ... WHERE status='pending'` inside `db.transaction()` — only the caller whose `UPDATE` actually matches a row proceeds to credit the account, using `balance_credits + amount` as a SQL expression (not a JS-computed literal) and inserting the one ledger row, all in the same transaction. A losing concurrent call returns the existing idempotent `already_processed` response instead of erroring or double-crediting. Gateway verification (a pure read) stays outside the transaction so the row-lock window never waits on a network call.

Verified live with a disposable account and a stubbed `PaymentGateway.verifyByReference` (no real Flutterwave credentials in this dev environment, consistent with every other payment integration's honest-gap posture here): 5 concurrent `verifyTopUp()` calls for the identical `tx_ref` produced exactly 1 fresh credit, 4 idempotent responses, final `balance_credits = 5000.0000` (not 25000), exactly 1 `dev_billing_events` row. A second, distinct top-up fired concurrently with a re-check of the first correctly summed to `8000.0000`. `npx tsc --noEmit` from `apps/api` stays at the same 31 pre-existing errors, none in `developer.service.ts`. Lens: LENS-71.

**Legacy seeded credits — checked, deliberately not touched.** Queried all 4 real `developer_billing_accounts` rows: 2 sit at exactly `50000.0000`, the old fabricated seed value from before LENS-65. The other 2 are at different nonzero balances, which this session cannot disambiguate into "real top-up" vs. "spent fabricated seed" without ledger evidence that predates the LENS-65 fix (the old code never logged a ledger event for the free seed). Changing live account balances needs an explicit decision and an auditable basis, not a guess — left exactly as found, per the handoff's own instruction to "review legacy seeded credits separately using auditable evidence before changing balances."

### Release blocker: Onsite recovery concurrent retries — closed, and it caught a real bug in the earlier LENS-63 fix too

`POST /v1/onsite/activate-standalone` had no claim guard at all: two parallel retries of the same recovery click could both pass the pending-row check and race the `tenant_addons` write. Added the same catch-then-requery shape LENS-63 (fleetOps trip idempotency) used — and building a genuine-concurrency test for it (8 truly parallel calls, not sequential retries) surfaced that **both** fixes had the same real bug: PostgreSQL marks the whole transaction aborted after any failed statement, so the fallback `SELECT` inside the `catch` block was itself failing with `current transaction is aborted, commands ignored until end of transaction block`. `hr.routes.ts` already has a documented helper (`bestEffortInTransaction`) for exactly this failure mode — neither fix had used it.

Fixed both `onsite-plan.routes.ts` and `fleetOps.routes.ts` (`POST /trips`) with an explicit `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` / `RELEASE SAVEPOINT` around the conflicting write, same shape as the existing helper. Verified live under real concurrency, not sequential retries: Onsite — 8 concurrent `activate-standalone` calls against a disposable detached-agency tenant, 0 rejections, all 8 report `status: active`, exactly 1 `tenant_addons` row (pre-fix: 7 of 8 threw the aborted-transaction error). FleetOps — 8 truly concurrent real HTTP `POST /v1/tracking/trips` calls against the live dev API with the same `idempotency_key`, against the real HuduFreight-only test tenant: all 8 returned the identical trip id, 0 errors, confirmed via `GET` that exactly 1 trip row exists. `npx tsc --noEmit` stays at the same 31 pre-existing errors. Lens: LENS-72.

## Status update — Claude Code, 5 Nov 2026 (Onsite browser milestone)

### Build baseline — restored

The root API build baseline (the ~31 errors tracked since the first status update) is fixed at the source, not deferred — rechecking git history showed these files (`consultant-delegation.*`, `marketplace.*`, `enterprise-metrics.service.ts`, `launch-planner.service.ts`, their tests, `esb-ledger-integrity.test.ts`) have no uncommitted changes and were last touched by a single already-landed commit (`9c7f9fbb`) — the "another session is actively mid-edit on these" read from the earlier pass no longer holds, so fixing them directly was safe.

Fixed: `request.server.httpErrors.notFound(...)` (never a real Fastify decoration here — `@fastify/sensible` isn't registered) replaced with this codebase's own `reply.status(404).send({ error: ... })` convention in `consultant-delegation.routes.ts` and `marketplace.routes.ts`; a `TenantDb` type three services imported but `db/client.ts` never exported, added as `export type TenantDb = Transaction<Database>` (exactly what `withTenant`'s own callback already receives); an `.innerJoin(... as any)` chain whose `.select()` overload resolution failed, fixed with an `as any` on the join result (`enterprise-metrics.service.ts`); several implicit-`any` callback params (`oc`, `r`) given explicit `: any` annotations, consistent with the heavy pre-existing `as any` casting style in these files; two `string | null` values assigned into `Date | null` columns (`launch-planner.service.ts`'s `target_date`/`deadline`) fixed with `new Date(...)`; a test seeding a nonexistent `'ESB'` role (`esb-ledger-integrity.test.ts`) changed to `'TENANT_ADMIN'`.

`npm run typecheck` (both `tsc -p` passes, `check:triggers`, `check:design-system`, `check:encoding`) and `npm run build` (`packages/types`, `packages/ui`, `apps/api`, `apps/web`/Vite) both run clean end to end, exit code 0 — not just the two `tsc --noEmit` passes checked in isolation earlier. Only output is Vite's pre-existing chunk-size advisory (informational, not an error). **Build acceptance check: passed.**

### Finish the direct Onsite entry — app_entry hardened

`apps/web/src/lib/appEntry.ts`'s `?app_entry=` dev override had neither restriction the handoff asked for: it accepted *any* string (not just a known app ID) and fired on *any* hostname, not just local dev — a crafted link against a real deployed domain could silently flip a visitor's own browser into single-app mode via `localStorage`, persisting past that one visit. Fixed: the override now only fires when `window.location.hostname` is `localhost`/`127.0.0.1`, and only accepts a value already present in `SINGLE_APP_HOSTS`'s own value set. The always-on hostname mapping (the real production mechanism) is unchanged and checked first.

**Navigation/settings/support sanity, checked:** `OnsiteShell.tsx`'s own nav is self-contained (`Support` is a real in-app item, not relying on anything cross-app); Settings is already entitlement-filtered (LENS-70); the generic cross-app launcher is already hidden in single-app mode (LENS-68). One real gap found and **not** fixed this pass (time-boxed, logged instead): the shell's `Agency` nav group (`Clients`, `Directory listing`, `Directory moderation`, `Referrals`) is a static, unfiltered list — it shows for every Onsite tenant, including a plain detached client with no managed clients of its own. Not a security issue (same class as LENS-70 pre-fix: the backend almost certainly empties/403s these for a non-agency tenant), and not named in this milestone's own acceptance table. Lens: LENS-73, logged SUSPECTED/OPEN, not blocking.

**Workspace selection:** checked — this codebase has no separate multi-tenant workspace-switcher UI; a user's workspace is fixed by their JWT's `tenant_id` at sign-in, and entitlement is re-checked server-side on every request regardless of which UI surface asked. Nothing new needed here; the acceptance line is satisfied by the existing login + entitlement architecture.

### Serve Ondi's advertised authorization page — real browser-facing page added, CSRF gap caught and fixed before shipping

Discovery's `authorization_endpoint` for the standalone issuer (port 3010) pointed browsers at `http://localhost:3010/ondi/authorize` — a path that process never served (it's a pure API, no React app). Reused the existing consent UI instead of building a second one: `ondi-standalone-server.ts` now has `GET /ondi/authorize`, which 302s the browser to the shared web app's own `/ondi/authorize` (same page, `OndiAuthorize.tsx`) with the original query string plus one added param, `api_base=<this issuer's own ONDI_ISSUER_OVERRIDE>`. `OndiAuthorize.tsx` reads that param and, when present, calls `authorize/info`/`authorize/approve` against that origin directly via `fetch(credentials:'include')` instead of the normal relative-path-through-the-5173-proxy-to-3001 route — the session cookie is host-scoped (port doesn't factor into cookie matching) and the standalone issuer's own CORS allowlist (LENS-69) already permits the web origin with credentials, so the same signed-in session authenticates there with no extra login step.

Caught one real bug before it shipped, not after: the direct-`fetch` path didn't attach the `X-CSRF-Token` header `apiFetch` normally sends on every cookie-authenticated write (double-submit pattern, `middleware/csrf.ts`) — and the standalone server's `authenticate()` preHandler is the *exact same shared code* as the embedded server's, so it enforces that check too. Without this, `authorize/approve` would have 403'd the moment this was tried against a real cookie session. Fixed by reading `csrfToken()` the same way `lib/api.ts` does and attaching the header manually for the `api_base` path.

**Redirect URIs reviewed:** all 11 registered `ondi_oauth_clients` rows checked directly — every one is `first_party: true` with exactly one local-dev redirect URI each (`http://localhost:5173/oauth/callback` for the apps/web-hosted products; distinct per-service dev callback URLs for LexCore/Gereji/Stride/Tuma). No stray, wildcard, or production entries to flag. Nothing to fix here.

**Open-redirect check on `returnTo`:** `Login.tsx` (and every other post-login redirect site) calls React Router's `navigate(returnTo)`, never `window.location.href =`. A `returnTo` carrying an absolute external URL can't actually leave the SPA through `navigate()` — it gets treated as an in-app path and falls through to the catch-all route, not a real browser redirect. Verified by code trace across every `returnTo` call site; satisfies the acceptance line "an untrusted external return destination is rejected" by construction, not by an added explicit check.

**Not yet done from this section:** a live browser run of the full PKCE cycle through the *redirected* consent page specifically (API-only PKCE cycle against port 3010 directly was already verified in the M2 pass above; the new browser-facing redirect hop itself has only been traced through code + verified not to break CSRF, not click-tested) — blocked on browser automation, see below.

### Still open — acceptance checks requiring a real browser

No browser automation tool was available this pass (`mcp__claude-in-chrome__*` tools were not loaded; `WebFetch` explicitly refuses `localhost`). Everything in this section is **source-trace- and API-only-verified, not browser-verified** — called out separately per the handoff's own instruction not to conflate the two:

- The actual end-to-end run: fresh browser, no cached identity, direct Onsite host (or `?app_entry=onsite` locally) → `/onsite/domains?foo=bar` → sign-in → authorization screen (now rendering, per the fix above, but never clicked through) → final URL/workspace/page content.
- The deep-link-survives-sign-in behavior (LENS-67's fix) — verified by code trace only, as in the prior pass.
- The repeat single-product browser sweep (Onsite, Lens, ComplyOS, NexusHR, Developer, Petti) comparing network requests against the original audit's `standalone-verification.json` — not run; needs the same browser tooling.

These remain the concrete next step once browser automation is available, or if the user wants to drive it manually with this session narrating what to check.

## Status update — Claude Code, 5 Nov 2026 (second round)

### Security fix: api_base on the consent page was unvalidated — closed

The previous pass's redirect-to-shared-consent-UI fix (LENS-76) took `api_base` straight off the URL with no validation. Since that value drives a credentialed `fetch` (CSRF token attached) whose response's `redirect_url` goes straight to `window.location.href`, an unvalidated value would let a crafted link turn the real, trusted `/ondi/authorize` page into an open-redirect/phishing proxy pointed at an attacker's server — the session cookie itself was never actually exposed (cookies are domain-scoped; an attacker's origin never receives it), but the CSRF token leak and open redirect were both real.

Fixed with `TRUSTED_ONDI_ISSUERS` (`apps/web/src/lib/appEntry.ts`), an explicit allowlist in the same shape as the existing `SINGLE_APP_HOSTS`/`KNOWN_APP_IDS` pattern. `OndiAuthorize.tsx` now validates `api_base` against it before using it for anything; an untrusted value silently falls back to the normal relative `apiFetch` path rather than erroring, so a tampered link just degrades to the ordinary (embedded-server) flow instead of breaking sign-in for anyone who follows a legitimate link. Lens: LENS-77.

**Restarted and reverified the standalone issuer against the current checkout**, since the user correctly flagged it was still serving stale pre-fix code (confirmed: a direct request to `/ondi/authorize` 404'd before the restart). Killed the stale process (found via its listening port), relaunched `ondi-standalone-server.ts` fresh, and confirmed live: the route now returns a real `302` with `location: http://localhost:5173/ondi/authorize?...&api_base=http%3A%2F%2Flocalhost%3A3010` — exactly the allowlisted value. Verified the allowlist logic itself directly (no browser needed for this part): imported `appEntry.ts` under `tsx`, confirmed `TRUSTED_ONDI_ISSUERS.has('http://localhost:3010') === true` and `.has('https://evil.com') === false`.

### Onsite Agency nav — gated by real role, not shown to everyone (closed LENS-73)

Cross-checked the actual backend role requirements before writing the fix, rather than guessing: `onsite-agency.routes.ts`/`onsite-agency-client.routes.ts` require `SUPER_ADMIN`/`ADMIN`/`TENANT_ADMIN`; `onsite-agency-directory.routes.ts`'s `/admin` moderation endpoints require `SUPER_ADMIN` specifically; `referrals.routes.ts` additionally allows `MANAGER`. `OnsiteShell.tsx`'s static `NAV` showed all four Agency items to every signed-in user regardless of role, so a regular staff account (SENIOR/JUNIOR/FINANCE/SALES) saw controls that would 403 the moment they were clicked.

Replaced the static array with `buildNav(role)`, filtering each Agency item to match its own backend's real requirement, and dropping the whole "Agency" section from the sidebar entirely when none of its items apply. Verified by extracting and running the exact filter logic under `tsx` against every real role: `SUPER_ADMIN` sees all 4 items, `ADMIN`/`TENANT_ADMIN` see 3 (no moderation), `MANAGER` sees only Referrals, every staff role and no-role sees the section hidden outright. `apps/web` `tsc` clean.

**Support/Settings for a detached client, checked:** `onsite.routes.ts`'s base preHandler chain only requires the `onsite` entitlement plus one of `SUPER_ADMIN`/`ADMIN`/`TENANT_ADMIN`/`MANAGER` — nothing agency-specific — so a detached client's own admin user (who already has the `onsite` addon active per LENS-72) reaches Support and Settings exactly as any other Onsite tenant would. Verified by code trace; not yet click-tested in a real browser.

### Entry points extended to the other 5 apps (LENS-78)

Extended `SINGLE_APP_HOSTS` to `lens.hudumika.tz`, `complyos.hudumika.tz`, `nexushr.hudumika.tz`, `developer.hudumika.tz`, `petti.hudumika.tz`, each mapping to the app's real top-level route prefix (checked against `App.tsx`'s actual routes, not assumed). Added a matching Caddy example (`deploy/contabo/standalone-apps-subdomains.Caddyfile.example`) covering all five, same not-auto-wired posture as the existing Onsite one. Verified the resolution logic directly under `tsx` (stubbed `window`/`localStorage`, no browser): all 6 real hostnames resolve to the correct app id; an unrecognized hostname correctly returns `null`.

**Not done this pass, and why:** a disposable single-product tenant per app plus a live browser network-tab inspection for unrelated cross-product calls — the former is buildable without tooling but wasn't built this pass (only HuduFreight-only and SEAL-only test tenants exist from earlier sessions; Lens is role-gated rather than tenant-entitlement-gated, and Developer uses its own account model, so "one disposable tenant per app" doesn't map cleanly onto all five the way it did for Onsite/HuduFreight); the latter strictly requires browser tooling regardless. The original Codex audit baseline this handoff cites already confirmed "representative authenticated API reads returned 200 with the target app enabled" for all six apps, so the entitlement boundary itself isn't unverified — only the entry mechanism and the browser-level cross-call inspection are.

### Still blocked

No browser automation tool was available this pass either (`mcp__claude-in-chrome__*` not loaded). Everything above involving a real sign-in click-through, a rendered consent screen, or a network-tab inspection remains source-traced, logic-tested, and API/curl-verified only — not browser-verified. This is the one gate every other acceptance item in this milestone is now waiting on.

### Security fix: payment-gateway return URLs built from a spoofable header (LENS-79)

Both `developer.routes.ts`'s prepaid top-up checkout and `billing.routes.ts`'s ESB top-up checkout built the Flutterwave hosted-checkout `redirect_url` as `${request.headers.origin || request.headers.referer}/...` with no validation — Origin/Referer are ordinary headers any non-browser caller sets freely, so a crafted request could send a real paying user back to an attacker's domain after a genuine transaction. Found the identical bug duplicated at the second call site while fixing the first.

Added `trustedRedirectOrigin()` (`apps/api/src/lib/webauthn-config.ts`): validates the request's Origin/Referer-derived origin against `env.CORS_ORIGINS` (the same static allowlist `index.ts`'s own CORS plugin checks first) and falls back to `webauthnOrigin()` otherwise — the same safe-default pattern already used elsewhere in this codebase for "build a link back to our own app." Applied at both call sites. Verified directly: a trusted origin passes through unchanged; `https://evil.com`, a Referer with a path, a missing header, and a malformed value all degrade to the safe fallback instead of passing through or erroring. `apps/api` typecheck clean (exit 0). Lens: LENS-79. This was the explicit "Developer also needs a trusted checkout return URL" ask raised before paid rollout.

### Not started: the commercial milestone (V4 — standalone purchase/activation per app)

Giving Lens, ComplyOS, NexusHR, Developer, and Petti their own `commercial_products` rows, tenant-currency pricing, and usage meters (the work after this browser milestone) is a substantially larger build — new migrations, pricing/currency logic per app, checkout flows, and per-app usage-meter wiring — not something to start without confirming scope and sequencing first. Flagging here rather than beginning partway through it.
