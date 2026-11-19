# Lens production readiness audit

Date: 19 November 2026
Scope: all ten routes registered in LensShell, their local API paths, underlying services, migration 918, the existing Lens integration tests, root typecheck and production build.
Verdict: release blocked. The pages generally render, but authorization, webhook trust, reliable delivery, recovery artifacts and several primary workflows are incomplete or defective.

## Verification and limitations

- Signed in with the existing local demo SuperAdmin through the normal login API and used its session cookies for browser checks.
- Visited Items, Item Detail, Projects, Roadmap, Cycles, Reports, Releases, Repositories, Snapshots and Integrations at desktop width. All ten rendered without uncaught page errors or failing Lens GET requests observed during the visits.
- Revisited all ten routes at a verified 390px viewport. Item Detail has a fixed two-column grid that pushes its metadata panel outside the visible mobile area. A normal document-width check alone misses this because the surrounding layout clips content.
- Clicked New Cycle and observed its placeholder dialog. Followed Projects -> View Issues and observed that subsequent API requests omit project_id. Probed the board's note endpoint and received 404.
- Used unauthenticated read-only HTTP requests to confirm the authentication bypass described below. Did not attempt anonymous writes or poison provider events.
- `npm run test -w apps/api -- src/tests/lens-production.test.ts`: 9 passed, 0 failed, 0 skipped. The tests exercise service functions, not the full routes and page workflows.
- `npm run typecheck`: passed, including design-system and encoding checks. The existing unrelated Studio trigger warning for hr.assignment_changed remains.
- `npm run build`: passed for shared packages, API and web. Vite reported existing bundling warnings.
- No live provider installation, Slack message, Jira creation, OAuth grant, deployment or destructive recovery was performed. Third-party behavior remains unverified.
- No application fixes were made during this review. The working tree already contains concurrent staff-console changes. Findings describe the inspected working tree and local server, not a verified production deployment.
- The existing Lens suite writes a global snapshot and outbox event and only cleans up its disposable tenant. Some test artifacts can remain. This is itself a test-isolation gap.

## Page-by-page results

| Route | Observed behavior | Remaining production work |
| --- | --- | --- |
| /lens | Board and list render. Add Note uses a route returning 404. Project query parameters are ignored. | Repair notes; wire URL filters; use the shared item domain; expose project/cycle/assignee/release fields; handle failures visibly; bound queries. |
| /lens/items/:ref | Detail renders with discussion, verification and external push controls. Fixed 1fr/340px columns clip the sidebar on mobile. | Responsive layout; visible pending/error states; deliberate connection selection; reliable mutation/verification rules; connect the board to the full detail experience. |
| /lens/projects | Project list and creation dialog render. View Issues navigates with project_id but Items does not use it. | Working scoped issue navigation, project detail/editing, repository and connection bindings, real scoped progress. |
| /lens/roadmap | Renders existing EPIC records or an empty state. | EPIC creation/editing, hierarchy, scoped progress, ordering and navigation. The main item composer currently excludes EPIC. |
| /lens/cycles | Existing cycles render. New Cycle only opens alert('New cycle modal'). | Real creation/editing, date validation, membership, transitions and progress through normal UI entry points. |
| /lens/reports | Report list and triage dialog render. List API omits fields that the dialog expects. | Authorized report detail endpoint, full reproduction/context/attachments, existing-item linking, transactional triage and explicit resolution rules. |
| /lens/releases | Release cards and manual status buttons render. | Validated lifecycle, project/item membership, test and deployment evidence, controlled publish transitions, accurate release actor/history. |
| /lens/repositories | Registry and registration dialog render. Registration stores metadata. | Authenticated resource discovery, provider verification, bindings, branch/commit browsing, editing/disconnect, actual capture integration. |
| /lens/snapshots | Text captures, metadata, preview and downloads exist. | Real archive/bundle capture, manifests and format validation, streaming, checksum enforcement on download, quotas/retention, retry and restore evidence. |
| /lens/integrations | Legacy five-provider configuration screen renders. | One integration system, encrypted legacy migration, multi-instance UI, proper installation/auth flows, honest capability status, webhook/retry/health management. |

Rendering and readiness are separate results. These visits do not establish every mutation or external workflow works.

## Findings in priority order

### F01 — P0 — Query strings can bypass Lens authentication

Source: apps/api/src/routes/lens.routes.ts:93.

The preHandler skips authentication whenever request.url contains '/webhooks/'. request.url includes the query string, so ordinary management URLs can enter the public webhook exemption.

Confirmed local evidence without cookies or Authorization headers:

- GET /v1/lens/projects -> 401.
- The same projects route with a query value containing /webhooks/ -> 200 and one project.
- The items route with that query value -> 200 and 24 issue rows at probe time.

Impact: unauthorized access to internal engineering data. Handlers that do not require request.user may also expose mutation paths; anonymous writes were not attempted.

Required repair: register public webhook endpoints in a separate explicitly scoped plugin or use exact route metadata. Authenticate all management routes independently of URL text. Add negative authorization tests for every route family, query parameters, encoded input, ordinary tenant users and delegated staff. Assess actual deployed exposure separately.

### F02 — P0 — Unverified webhooks are processed

Sources: lens.routes.ts:124; lens-inbox.service.ts:48, 76 and 87.

The receiver never supplies a connectionId. Signature verification requires a connectionId, leaving verified false. The service stores the event and executes processWebhookPayload regardless of verification. GitHub payloads can update links and append issue events. The handler also reconstructs JSON instead of preserving the signed raw request bytes.

Required repair: resolve a registered provider installation/resource, validate its relationship and connection status, verify the original raw body using provider-specific rules, and reject invalid requests before domain writes. Scope deduplication to the connection and provider event identity. Verify provider challenges and retries. Tests must prove malformed, missing-signature, cross-installation and replayed requests cannot change domain data.

### F03 — P1 — Two incompatible integration systems remain active

Sources: LensIntegrations.tsx:51; lens.routes.ts:251, 273 and 960; lens-integration.service.ts; lens-adapters.service.ts.

The UI edits lens_integrations through the legacy endpoints, where credentials are still written directly to plaintext columns. New connection instances store encrypted credentials and are used by new push/outbox paths. Saving a connection in the visible UI does not configure those new consumers. Notion and GitLab declarations exist in the new adapter catalog but are absent from the visible legacy setup flow.

Required repair: migrate legacy credentials and bindings transactionally to one encrypted connection model; update every consumer and the UI; remove or redirect legacy writes; implement rotation/revocation and explicit instance selection. Validate migration against pre-existing accounts.

### F04 — P1 — Outbox work has no scheduled runtime consumer

Sources: lens.routes.ts:1048; lens-outbox.service.ts:36; repository search for processLensOutbox.

The worker function is called by a manual management endpoint and tests. No scheduled job/startup worker invocation was found. Normal report and issue creation can therefore leave notifications pending.

Required repair: register a durable scheduled worker using existing job infrastructure, including deployment configuration, health checks, queue age metrics, retry/dead-letter visibility and shutdown handling.

### F05 — P1 — Worker claims and delivery results are unreliable

Source: lens-outbox.service.ts:56-67 and 108-136.

Candidates are selected before claiming. The claim update checks status but does not recheck due time or acquire an exclusive row claim. A second worker that already selected the row can claim it again while the first lease is active. In addition, sendSlackAlert returns an ok=false result for failures, but dispatch ignores that result, allowing failed deliveries to be marked delivered. Missing connections and unsupported events also return successfully without recording a skipped outcome.

Required repair: atomic due-row claims, lease ownership and expiry checks, explicit delivery/skipped/failure outcomes, adapter result validation, per-destination delivery records, bounded retries and ambiguous-write reconciliation. Test with concurrent workers and crashes after remote success.

### F06 — P1 — New adapters mistake some provider errors for success

Source: lens-adapters.service.ts:127-156 and provider test methods.

callAdapter treats all HTTP 2xx responses as successful. Slack can return ok=false and GraphQL can return errors inside HTTP 200. Auth testing and notifications can therefore look successful while failing at the provider.

Required repair: implement provider-level result validation and response schemas, and propagate failures through connection health, UI and workers. Test HTTP-success/application-failure responses without sending real notifications.

### F07 — P1 — Snapshot labels do not establish recoverable artifact formats

Sources: LensSnapshots.tsx:228-231 and its text content form; lens-snapshot.service.ts:31-60.

All snapshot types accept text and store its UTF-8 bytes. Selecting Git Bundle or Source Archive does not create or validate those formats. The UI does not supply a verified file manifest or bind captures to an issue/repository. No local capture CLI or Git capture job was found in the snapshot flow. Text patch storage is implemented, but the broader recovery claims exceed it.

Required repair: implement distinct validated capture/upload pipelines, immutable verified manifests, repository/commit bindings, bounded streaming, secret detection, storage quotas, retention and real restore drills. Label unsupported capture types accurately until implemented.

### F08 — P1 — Snapshot failure and download integrity are mishandled

Sources: lens-snapshot.service.ts:81-94 and 117-123; lens.routes.ts:437-459 and 480-489; LensSnapshots.tsx:44-60.

Capture failures return a FAILED object instead of throwing; the route still responds 201 and the UI closes the form. getSnapshotContent returns verified=false for corrupted bytes, but the direct download handler ignores it and sends those bytes. Restore preview checks integrity, creating inconsistent guarantees between two download paths.

Required repair: represent failed capture explicitly, preserve actionable errors, reject mismatched content before any download, and quarantine/retry failed artifacts. Test storage failure, partial upload, missing content and checksum corruption.

### F09 — P1 — Verification and release gates are mostly manual labels

Sources: lens.routes.ts:45-68, 385-420 and 722-764.

Issue closure requires a resolution string but does not enforce the intended bug-verification evidence. VERIFIED can be set without validated evidence; invalidation of evidence after code changes is not defined. Releases can be created/patched as RELEASED without checking issue membership, verification or deployment evidence. released_by is set during creation rather than consistently recording the publishing actor.

Required repair: define permitted transitions and validation per item/release type; distinguish verification, release and deployment; preserve genuine exemptions such as WONTFIX; record the approving/publishing actor and evidence. Add API tests for bypass attempts and concurrent transitions.

### F10 — P1 — Related writes are not atomic

Sources: lens-intake.service.ts:65-153; lens.routes.ts:510-553, 663-720 and item patch/event writes.

Reports, linked items, history and outbox records are written as separate statements through dbPlatform. A later failure can leave an orphan item, a saved report without its notification, or a changed issue without complete history. Concurrent report triage can create duplicate Lens items. Mutations lack revision checks to detect stale edits.

Required repair: transaction-aware domain services, transactional outbox insertion, row locking or conditional triage, uniqueness/idempotency constraints and optimistic concurrency. Keep remote API calls outside long database transactions.

### F11 — P1 — Report context sanitization and tenant scoping need hardening

Sources: lens-intake.service.ts:30-44 and 106; lens.routes.ts:188-198.

Sanitization recurses through objects but leaves arrays untouched and does not redact secrets embedded in URL/string values. The authenticated reports/mine query filters reporter_id through dbPlatform without an explicit tenant filter. Arbitrary attachment path metadata is accepted without validating an owned uploaded file.

Required repair: use an allowlisted context schema, bounded recursive handling, URL/query redaction and authorized attachment IDs. Resolve the reporter/tenant from the session. Apply explicit tenant scope to tenant report reads and writes using the appropriate tenant-aware services. Keep customer-visible updates separate from internal notes. Add cross-tenant and nested-secret tests.

### F12 — P1 — Repository identity and inbound event ordering are insufficient

Source: lens-inbox.service.ts:31-35 and GitHub link upserts.

Deduplication is a read-before-insert operation and is not scoped to a connection. GitHub links use the numeric issue/PR number as external_id without repository or object type in the unique identity. An issue #42 and PR #42, or #42 in another repository, can collide for the same Lens item. External events have no revision/order protection and processing is synchronous with no reliable failed-inbox worker found.

Required repair: use canonical installation/repository/object identities, atomic conflict-safe deduplication, durable asynchronous processing, ordered reconciliation and resumable retries. Test duplicate and out-of-order deliveries across multiple repositories.

### F13 — P1 — Configurable provider destinations lack network restrictions

Source: lens-adapters.service.ts Jira site and GitLab host construction; legacy integration/preflight destinations.

Configured hosts feed server-side fetch with provider credentials. No scheme/host/private-address validation or redirect destination control was found in these paths. This is an SSRF and credential-forwarding risk, especially combined with F01.

Required repair: validate provider origins and allowed self-hosted destinations, block disallowed network ranges, enforce HTTPS in production, validate redirects and avoid credential forwarding across origins. Test using a local controlled transport, without probing internal services.

### F14 — P2 — Primary Items actions are disconnected

Sources: Lens.tsx:109-131, 393 and 64; LensProjects.tsx:117.

- The board's Add Note calls /items/:ref/events. The server implements /items/:ref/notes. The former returned 404 in a local probe.
- View Issues adds project_id to the URL, but the page ignores it. Browser evidence showed requests containing only limit and offset.
- Shared/backend kinds include EPIC; the page-local Kind type and composer omit it.
- Board cards open a legacy drawer while a richer full detail route exists; important features are split across the two experiences.

Required repair: shared contracts, working URL filters, corrected note endpoint, complete planning fields and coherent detail navigation. Verify through normal buttons and deep links.

### F15 — P2 — Cycles, project planning and repository workflows are incomplete

Sources: LensCycles.tsx:32; LensProjects.tsx; LensRoadmap.tsx; LensRepositories.tsx and corresponding routes.

New Cycle is a placeholder. Roadmap is an EPIC list without a management workflow or derived progress. Project repository/connection binding tables exist but the UI does not manage those relationships. Repository registration does not prove a provider connection, discover resources or verify branch access.

Required repair: complete the essential planning and resource-binding workflows, with proper validation, status transitions, useful detail routes and real progress definitions.

### F16 — P2 — Report triage cannot display the collected evidence

Sources: lens.routes.ts:495-508; LensReports.tsx:158-182.

The list response omits steps_to_reproduce, expected_behavior, actual_behavior, client_context, attachments and resolution_notes. The triage modal reads those fields directly from the list row. A local response-key check confirmed the omissions. No report detail GET route supplies them.

Required repair: introduce an authorized detail read or an appropriate full projection, load it when inspecting a report, display attachments safely and retain existing notes during edits. Support linking an existing issue as well as creating one.

### F17 — P2 — Error handling, responsive layout and UI consistency are incomplete

Sources: LensItemDetail.tsx:197; list-page load catch handlers; LensIntegrations.tsx:50-57.

Several list pages turn API failures into empty arrays, so failed loading appears to mean no records. Integrations starts without a distinct loading state and test failures can become unhandled promises. Fixed grids and unbounded horizontal rows hide useful content on mobile. Forms use raw controls, unassociated labels and hardcoded dimensions rather than consistently following the current design-system contract. Several multi-field forms use modal overlays.

Required repair: visible errors with retry, accessible labels and focus, consistent shared controls, responsive grids, pending-action guards and dedicated routes for substantial forms. Verify with keyboard and a real narrow viewport. Existing static design checks did not catch all of these conditions.

### F18 — P2 — Tests, scale controls and operational documentation are insufficient

Sources: lens-production.test.ts; list and history queries in lens.routes.ts; docs/lens/IMPLEMENTATION_STATUS.md and related architecture documentation.

The nine passing tests focus on crypto, service intake, capture and basic outbox behavior. They do not cover route authorization, normal page actions, live provider installations, worker concurrency or corrupt downloads. The dedup test even accepts unsigned events. Snapshot/outbox test data is not fully isolated. Item pagination retrieves all matches before slicing in memory; several lists/history reads are unbounded or silently capped without continuation. Documentation remains behind the code, and no production load/backup/restore evidence was established.

Required repair: add meaningful security and end-to-end regression tests, isolated test artifacts, SQL-level pagination/search, bounded history, structured observability, documented worker deployment, recovery drills, provider sandbox evidence and an accurate implementation/coverage matrix.

## Repair sequence and release gates

### Gate A — Contain exposure

Fix F01 and F02 first. Prove unauthenticated/ordinary-tenant requests cannot reach engineering management data or writes. Prove forged provider events cannot affect Lens. Verify the deployed environment separately; local reproduction does not establish whether production has the same version.

### Gate B — Make existing workflows dependable

Unify integrations and encrypted credentials; register and harden delivery workers; repair notes, filters, triage details, Cycles and mobile layout. Add atomic mutations and actionable error handling. Keep capability labels aligned with completed behavior.

### Gate C — Establish engineering and recovery truth

Complete real artifact formats, verified downloads, retention and restore workflows. Implement coherent project/repository/issue/release relationships, verification rules and deployment evidence. Prevent a label or manual status change from making unsupported recovery or release claims.

### Gate D — Demonstrate operational readiness

Require API authorization coverage for every route family, representative browser workflows for all ten pages, isolated concurrent-worker and partial-failure tests, successful sandbox verification for every enabled external connector, and an actual restored artifact. Run root typecheck/build and regression tests. Measure representative load and document numeric latency, error-rate, queue-age and recovery objectives against the deployment capacity.

Record every remaining missing credential, service dependency and skipped verification. Production readiness should be decided against these gates rather than a guessed completion percentage.
