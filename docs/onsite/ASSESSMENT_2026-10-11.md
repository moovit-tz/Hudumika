# Onsite assessment — 11 October 2026

## Latest implementation status

Explicit deployment connections: migration 590 (applied) adds application and historical deployment connection IDs. Application details provides a design-system selector of active supported connections and a save action. The tenant-scoped PATCH endpoint validates ownership, provider support, credentials and project reference. Both normal and agency deploy routes require a selected connection and persist its ID. Polling uses tenant/provider/connection identity, with no fallback for old unidentified runs. Clones require their own selection. Legacy snapshots normalize missing application mappings to null; restore validates target links and detaches current application links before pruning connections. Historical runs retain their IDs even after a connection is removed.

Seven selection tests pass, including tenant rejection, account selection, revocation and mocked GitHub deployment persistence. Five backup and five preview tests pass. The first parallel combined run had one DNS-import failure; the ten-test Onsite suite passed alone and all 26 tests passed in a sequential combined run, followed by the additional application-snapshot validation test. Parallel repeatability remains unresolved. Design-system (19 checks) and encoding pass. Fresh root typecheck is running. The earlier production build completed with large-chunk warnings; acceptance of the latest UI remains pending because browser control is disconnected. Editing an existing connection's project can still change its target; immutable project identity per deployment is a follow-up.

This document retains the chronological assessment below; later entries supersede earlier pending statements. Tenant-link validation, truthful hosting/mail statuses, retry states, domain pagination, configuration-backup scheduling/retention, restore preview, durable website provider mapping, Hostinger inventory import and selected DNS import/publish are implemented. Production acceptance is incomplete: provider requests were mocked in tests, and browser verification is currently unavailable because browser control is disconnected.

Hostinger publishing requires explicit confirmation, a saved tenant-owned record and a current provider fingerprint. It validates with the provider, checks for drift again, submits `overwrite: false`, then re-reads the result. Existing record sets, CNAME conflicts, NS/MX/SRV publishing and automatic deletes are blocked. Successful imports and publishes emit discoverable audit/workflow events without record values. Repeated exact publishes return idempotently. A provider update and database transaction cannot be atomic; read-back verification does not establish public DNS propagation.

Verification: ten Onsite route integration tests pass against disposable database tenants with mocked provider HTTP; 24 adapter, comparison, backup and restore-preview tests pass. Root typecheck, 19 design-system checks and encoding checks pass. Trigger coverage still warns about existing Projects events `project.issue.resolved` and `project.change_request.submitted`; these unrelated emitters were not modified here.

Remaining work: real Hostinger account acceptance and managed deployment adapter; reviewed conflict/overwrite/delete DNS workflows and propagation checks; Zesha reseller registration/renewal/transfer integration using confirmed API documentation and credentials; provider site-file/database backup and restoration; mailbox/WordPress/database provisioning; dedicated create/edit routes and responsive keyboard/browser acceptance. No live domain purchase, provider DNS change, deployment or workspace restoration was performed.

Zesha source supplied by the user: https://www.zesha.tz/store/reseller-hosting confirms WHM/cPanel, personalized nameservers and a domain reseller program. Its public knowledgebase lists cPanel/DNS/mail/backup tutorials. Neither inspected page supplies a domain reseller API contract or establishes which registrar module/account API is authorized. Hosting control through WHM/cPanel and registrar registration/renewal/transfer therefore require separate confirmed access; a hosting reseller subscription alone does not establish registrar API access.

Deployment polling follow-up: the worker resolves each run's recorded `ci_provider` rather than the workspace's current priority provider, caches by tenant/provider, and refuses fallback for missing, unsupported or revoked recorded providers. Runs without provider identity remain unknown and follow the existing stale-run policy. Status updates require the previously read status, preventing stale worker results from overwriting concurrent transitions; stale timeout updates also require an in-flight status. Four real-database provider-selection tests pass. Selection of an individual connection/project per application remains pending; the provider name alone is not a durable connection identity. Fresh root typecheck, design-system and encoding checks pass; the production build remains running.

Scope: source review of Onsite shells, pages, routes, provider services and scheduled jobs, followed by authenticated browser inspection in Hudumika Workspaces. This is an assessment, not implementation or a production acceptance certificate. No infrastructure was provisioned, credentials connected, domain changes submitted or backups restored.

## Confirmed in the authenticated workspace

- Websites: zero records. Try AI Builder navigates to the website inventory; Add Website offers name/type/domain/URL metadata, not a builder or provider provisioning workflow.
- Provider connections: no external providers connected. The UI offers GitHub, CircleCI, Cloudflare Pages and DigitalOcean App Platform.
- Applications: two probe-named Node.js records, inactive and never deployed. Provider-backed deployment success is unverified.
- Domains: three records, including `hudumika.tz`, a probe subdomain and bare `hudumika`. DNS statuses are unknown, expiry dates absent, and auto-renew disabled. A fixed promotional domain and fixed $35.99/$0.99 prices are displayed despite no registrar pricing integration.
- Monitoring: no synthetic probes configured.
- Servers: no connected servers; the page explicitly says a telemetry agent is unavailable.
- Backups: three completed scheduled configuration snapshots, 8.4KB each; 30-day retention. Latest visible snapshot is 4 October and oldest is 6 September. Daily scheduling and retention pruning must be checked against worker execution; the visible state alone does not establish the cause.
- Email: no connected mailbox. One probe domain has MX/SPF records but no DKIM/DMARC; the other two lack all four. These are stored-record checks, not proof of successful mail delivery.
- Agency: one active client, mogo; its Manage route loads the client's domain, with no applications/checks, plus a billable-customer action. The Agency clients breadcrumb targets `/onsite/agency`, which is absent from the shell's registered routes; correct destination is `/onsite/agency/clients`. No relationship changes made.

## Functional foundation in source

Tenant-scoped inventory, domain metadata, RDAP availability, validated local DNS editing/import/export/templates, provider credential verification and encryption, CI triggering/status polling, HTTP uptime checks, certificate inspection, notifications, server reachability, configuration snapshots/restoration, agency-client access middleware, directory/referral integration and platform support tickets are implemented. Scheduled job entry points are registered. Main routes enforce authentication, entitlement and management-tier roles.

## Priority gaps

1. Truthful product copy: remove unsupported AI builder/store/free-email promises and registrar discounts; website creation should not assert active hosting without evidence. Distinguish configured, requested, provisioned and healthy states.
2. Tenant-link validation: application/website creation must validate project/domain ownership, and deployment must validate supplied environment ownership and application association. Existing tenant filtering/RLS does not replace foreign-ID validation.
3. Reliability: expose read errors and retry instead of silently emptying collections; test worker scheduling, backup retention and failure notifications. Add dedicated Onsite integration tests, including agency isolation.
4. CI completeness: select a provider/project per application instead of resolving one tenant-level provider by fixed priority; verify repository/branch/environment mapping, secret delivery, artifact/runtime URL and rollout outcome. Add logs, cancellation and rollback where supported by confirmed providers.
5. DNS/registrars: stored DNS records are not authoritative provider changes. Add provider synchronization/reconciliation; registration and transfer are pending requests rather than fulfilled transactions. The current transfer endpoint does not retain or forward the supplied EPP code.
6. Hosting: WordPress, managed databases, SSH information and website traffic analytics remain NotProvisioned screens. File management, migration, mailbox provisioning, SSL issuance/renewal and server lifecycle operations need actual provider capabilities.
7. Recovery: current backups contain Onsite configuration, not deployed files/databases. Add provider-backed site backups and independently verified restoration; configuration restore needs clear preview of overwritten/deleted records.
8. UI: standardize forms/actions on the live design system, dedicated create/edit pages, responsive grids/navigation/tables, keyboard labels, avatars, loading/error states and pagination. Fixed minmax(300px,1fr) service grids need small-screen acceptance.

## Implementation sequence

First complete truthful statuses/copy, tenant-link checks, read-error handling and integration tests. Then standardize the UI and demonstrate one real provider deployment in a designated test project. Next implement authoritative DNS and registrar request fulfillment. Finally add hosting/database/mail/WordPress/recovery capabilities through confirmed provider adapters, followed by agency operational acceptance.

Provider deployment, registrar transactions, destructive restores and actual hosting operations were not executed during this assessment. Empty inventories indicate missing workspace configuration, not necessarily absent backend implementation. No numeric completion percentage is assigned without a defined acceptance inventory.

## Hardening implemented after the assessment

- Application, website, domain and environment creation validate linked resource ownership. Deployment environments must belong to the selected application. Agency-managed application creation and deployment apply the same checks against the client workspace.
- Production environments inherit the application's configured default branch.
- New and cloned website configuration starts inactive. Missing hosting providers and URLs remain unset rather than inventing a hosting plan or address.
- Overview, website, provider settings and mail configuration expose load failures with Retry. A failed mail-record request is unavailable, not a claim that records are missing.
- Removed unsupported registrar discount, AI builder and free-email promotions. SSL summary uses actual expiry data rather than treating every domain as an active certificate. Website status is distinguished from measured HTTP/TLS health.
- Corrected agency breadcrumb and service grid minimum widths.

Verification: eight real-database Onsite integration tests pass, including foreign-link rejection, environment association, role denial, cross-tenant reads, configured branch, missing-provider refusal and inactive website creation/cloning. Browser checks confirmed website error/retry recovery and no document overflow at mobile and 1440px desktop widths; theme switching worked. A transient website request returned 500 and recovered on retry; its cause remains unconfirmed. Root typecheck and production build were started; final results must be recorded before release.

This is not a production acceptance certificate. Provider selection and an authenticated provider test project are required for end-to-end deployment acceptance. Authoritative DNS, registrar fulfillment, hosting/database/mail provisioning, full site backups and restore acceptance remain open, as do the broader form/design-system migration and worker/agency acceptance checks listed above.

### Mail follow-up

The mail page consumed `/v1/settings` as though mailbox configuration were at the response root; that endpoint returns a nested `settings` object. Onsite now uses a dedicated tenant-scoped `/v1/onsite/mailbox-status` endpoint, which returns only Gmail/Outlook authorization status, with no credentials or tokens. A ninth integration test checks status isolation and the exact response shape.

During the HTTP 500 investigation, port 3001 had no API listener. A subsequent health request returned 200 after the API resumed. The live mobile mail page then rendered the three existing domains and their stored records; document width and scroll width were both 403px. Screenshot: `onsite-mail-verified.jpg`. All nine integration tests pass, including disposable-tenant cleanup; the suite allows 60 seconds per test and 120 seconds for setup/cleanup under shared-workspace load. The design-system contract check passes all 19 checks, and encoding passes. Older duplicate verification jobs from this task were stopped; a fresh root typecheck is running. The production build still needs a successful complete run.

### Backup reliability follow-up

Scheduled backup discovery now includes website-only and backup-only workspaces. Tenant maintenance serializes overlapping runs with a transaction-level advisory lock, reuses that transaction for configuration reads, retries after failed scheduled snapshots, and prunes expired backups even when a recent successful snapshot exists. Workspaces with no remaining configuration are cleaned up without creating recurring empty snapshots. Failed SQL is rolled back before recording a failed job in a fresh transaction.

Four disposable-tenant database tests pass: discovery, overlapping job deduplication with tenant isolation, retention despite an existing recent snapshot, and backup-only cleanup. No global maintenance sweep or restore was manually executed against workspace data.

The backup page now displays separate retryable history and retention errors. Retention editing and saving remain disabled when settings cannot load, avoiding a fabricated fallback value. Mobile error-state inspection showed no document overflow at 403px. Retry was exercised, but both requests still returned HTTP 500 while port 3001 refused connections; successful recovery remains unverified. The root typecheck process exited without diagnostics or a successful result; a fresh sequential typecheck/build run is pending. This remains incomplete release verification.

### Live server and controls follow-up

The web server is confirmed at http://localhost:5180; its existing Vite proxy targets the API at localhost:3001, whose health endpoint returned 200. Browser navigation reached the new origin but displayed sign-in, so authenticated backup recovery still requires a signed-in session there. Backup creation, retention saving, restore and delete now use shared design-system buttons; the icon-only delete action has an accessible backup-specific label. Full typecheck/build remains pending.

### Retention validation follow-up

The retention field no longer silently converts an empty value or zero to one day. It preserves empty input, describes the 1–365 whole-day range, exposes invalid state accessibly, and blocks saving invalid values, matching the existing API schema. Design-system and encoding checks pass. Authenticated browser verification remains pending because the browser-control transport disconnected after the user signed in; this is a tooling failure, not evidence of an application failure. A fresh root typecheck is running; no successful full build is recorded.

### Restore preview implementation

Backup restore now loads a tenant-scoped read-only preview before confirmation. The preview returns counts of additions, replacements and removals for each configuration section without row values or secret ciphertext. Missing sections, duplicate IDs and foreign-tenant rows are rejected before restore mutation. Preview counts can change if configuration changes before confirmation; they are not an exact field diff or a concurrency guarantee.

Two restore-preview tests pass, including tenant validation and omission of secret values. Full root typecheck and design-system/encoding checks pass after this change. Production build is running; authenticated browser verification remains unavailable because browser control is disconnected. No live restore was executed.

Cloudflare is the user-selected next provider. Existing Cloudflare Pages trigger/poll support is present; per-application provider selection and authoritative DNS synchronization still need implementation and real-provider acceptance.

### Multi-domain reseller portfolio follow-up

Domain inventory uses the shared list pagination component (25/50/100 rows) for desktop and mobile views, with selection of the visible page and filter-driven reset. Zesha is available as the registrar when recording an existing domain. Unknown registrars are no longer labeled Hudumika DNS. Loading errors preserve cached records and offer retry rather than presenting a false empty inventory. Renewal text identifies a stored preference, not a fulfilled provider operation; new records default to renewal disabled. External-domain guidance no longer instructs users to point nameservers at an unimplemented Hudumika DNS service.

The production build completed successfully before this portfolio change, with large-chunk warnings. Design-system and encoding checks pass after the change; a fresh full typecheck is running. Browser verification is blocked by the closed browser-control connection. Zesha registration/renewal/sync remains pending confirmed reseller module/API documentation; no registrar transaction or external DNS change was performed.

### Hostinger connection foundation

Hostinger is now available in provider settings and the shared provider type. Connection verification uses the documented read-only GET /api/hosting/v1/websites endpoint, with a 15-second timeout, Bearer authentication, response-shape validation and sanitized rejection messages. Credentials use existing encrypted provider storage. The UI explicitly limits this to website inventory verification; Hostinger remains excluded from deployment resolution until a real deployment adapter exists.

Three mocked adapter tests pass (successful inventory access, token rejection without response-body leakage, unexpected success response). Design-system and encoding checks pass. Full typecheck is running. No real Hostinger token was submitted or live account operation executed. DNS import/synchronization and managed-hosting deployment remain pending; official reference: https://docs.hostinger.com/api-reference/overview.

### Hostinger read-only inventory

Added a workspace-scoped GET /v1/onsite/provider-connections/:id/hostinger-websites endpoint. It requires an active Hostinger connection belonging to the authenticated workspace, decrypts the credential only server-side, and returns domain names plus the requested provider page. Provider account metadata is not forwarded. A failed provider call returns a sanitized 502 error. Settings offers View websites with previous/next page controls; no import, deployment or DNS mutation occurs.

Five mocked Hostinger adapter tests pass; design-system and encoding checks pass. The current root typecheck is still running; latest endpoint/UI changes need its completed validation. Route isolation integration and live-provider/browser acceptance remain pending. No real account request was made during development. Official API source: https://docs.hostinger.com/api-reference/overview.

### Selected Hostinger website import

Settings now allows a selected provider domain to be imported as inactive website configuration. The backend re-reads the requested Hostinger inventory page, verifies membership, rejects foreign-workspace or inactive connections, and serializes same-workspace/domain imports with an advisory lock. Repeated imports return the existing record. No hosting identifier, URL, DNS record or registrar transfer is invented; imported website names use the verified domain.

A targeted real-database API integration test passes for foreign connection rejection, absent inventory rejection, successful inactive import and idempotent repeated import. Provider HTTP is mocked; nine other Onsite tests were skipped by the targeted filter, not rerun. Full root typecheck, design-system and encoding checks pass. Browser control remains disconnected, so UI and real Hostinger account acceptance remain pending. Durable provider-resource mapping and DNS reconciliation are still open.

### Durable Hostinger account mapping

Migration 589 adds website provider_connection_id with a composite tenant/id foreign key and index. Imports persist the selected provider connection; repeat import fills missing mappings on older records without rebinding an existing mapping. Website configuration snapshots include the column and restore upserts preserve it. The migration runner also applied existing pending Projects migrations 587 and 588 in its normal sequence; they were not edited in this Onsite change.

The targeted import integration test passes with an assertion for the persisted connection ID (nine other tests skipped by filter). Design-system and encoding checks pass; full root typecheck remains running. DNS synchronization, provider-side deployment, older-snapshot compatibility and mapped-configuration restoration acceptance still require follow-up.

### Provider-link restore compatibility

Legacy website snapshots normalize absent provider_connection_id to null without mutating the stored snapshot. Validation rejects mapped websites referencing a provider absent from the target snapshot. Restore detaches current website connection links inside the same transaction before pruning provider connections, then restores target links after provider insertion.

All five real-database backup tests pass, including restoration of an older provider link and removal of the newer provider. All four snapshot-preview validation tests pass. No live workspace restoration was performed. Full root typecheck from the preceding mapping change is still running; latest restore changes require a completed compiler result.

### Hostinger provider DNS inspection

Website inventory includes Read provider DNS. Its tenant-scoped endpoint revalidates selected-page membership before reading the documented Hostinger DNS zone endpoint. DNS groups are flattened into name/type/TTL/value/disabled records with response validation. Failure remains unavailable rather than an empty-zone claim. Records are displayed separately from saved Onsite configuration, and neither DNS mutation nor public propagation verification is performed. Zesha registration does not imply Hostinger authoritative DNS.

Seven mocked Hostinger adapter tests pass, including DNS flattening and malformed-response rejection. Design-system and encoding checks pass. Full typecheck remains pending; UI/live-provider/route-isolation acceptance remains open. Official schemas: https://github.com/hostinger/api-python-sdk/blob/main/docs/DNSZoneApi.md and DNSV1ZoneRecordResource.md / DNSV1ZoneNameRecordResource.md in the same directory.

### DNS comparison preview

Hostinger DNS inspection includes a comparison with records under the matching tenant-owned domain and zones. Counts report exact matches, saved-only/provider-only entries and disabled provider entries. Matching normalizes zone-qualified names and record types, preserves TTL/literal value/priority differences, handles duplicates as a multiset, and excludes disabled provider records from active matches. MX/SRV formats require review; this is not a semantic-equivalence claim or a synchronization plan. Domains absent from Onsite return no comparison rather than assuming an empty configuration.

Three comparison tests pass; design-system and encoding checks pass. No external DNS writes were implemented or executed. Full compiler, live-provider/browser and route-level comparison acceptance remain pending.

### DNS synchronization proposal review

Provider DNS inspection now returns typed import/publish proposals for unmatched records. The UI displays values, TTL, priority and direction individually. Proposals flag record-set drift, CNAME conflicts, validation errors, MX/SRV format/priority review and NS delegation review. Directions are alternatives rather than a bidirectional batch. No deletes or writes are offered; provider validation and chosen-direction execution remain pending.

Five DNS comparison/planning tests pass. A fresh full typecheck is running. Live-provider/browser acceptance remains pending; the synchronization plan is not yet executable.

### Selected provider DNS import

Selected conflict-free Hostinger DNS records can be saved locally. The endpoint validates the record, connection ownership/status, current provider website-page membership and exact current DNS record. It rejects stale values, disabled records, MX/SRV/NS requiring manual review, missing/ambiguous saved zones, and comparison conflicts. Imports serialize per workspace/domain and return existing records idempotently. No provider write, overwrite or deletion occurs.

The targeted database integration test passes for foreign DNS connection rejection, stale-value rejection, successful local import and duplicate prevention; nine other tests are skipped by filter. Design-system and encoding checks pass. Full compiler and live-provider/browser verification remain pending. External publish, priority conversion, and audit-event coverage remain follow-up work.

### DNS import audit and priority conversion

Successful local DNS import now emits onsite.dns_record.created inside the import transaction, with provider/local-import metadata and no record values. Standard MX content (priority target) and SRV content (priority weight port target) normalize into Onsite's separate priority field. Conversion validates numeric ranges; malformed or ambiguous formats remain unconverted and blocked by review. Selected imports revalidate priority as well as value and preserve it in storage. NS remains blocked for delegation review.

Thirteen Hostinger adapter/planning tests pass. Design-system and encoding checks pass. Targeted import regression and fresh typecheck are running; live-account/browser acceptance and external publishing remain open.
