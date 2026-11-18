# Lens production architecture and implementation prompt

Prepared 17 November 2026. This document is a proposed build specification based on repository inspection and official provider documentation. It does not certify the present implementation or any external account connection.

## Findings from the current repository

- `packages/types/src/lens.ts` defines work items and cycles, including evidence, resolution, parent and cycle references.
- `apps/api/src/routes/lens.routes.ts` provides issue, board, notes, links, cycle, outbound issue creation, notification, integration preflight, and CI lookup operations. Its access boundary is platform-scoped and SUPER_ADMIN-only.
- `apps/web/src/shells/LensShell.tsx` exposes Items, Cycles, Roadmap, and Integrations with the same internal access boundary.
- `lens-integration.service.ts` implements GitHub, Jira, Linear, Slack, and CircleCI calls. The service explicitly says live account operations were never verified in that implementation. Notion is absent from its provider catalog.
- Migration 193 gives each provider one global connection. Credentials and webhook secrets are plaintext columns. This cannot represent several repositories, Jira sites, or Slack installations cleanly.
- The existing service intentionally keeps external status separate from Lens resolution. Preserve the requirement that closure records a resolution.
- Lens has no implemented webhook receiver in its route file, although `docs/lens/GITHUB_INTEGRATION.md` describes one. `docs/lens/DATA_MODEL.md` also describes tenant ownership and statuses that differ from the current code. These are documentation discrepancies to reconcile.
- Hudumika already has AES-GCM helpers in `onsite-secrets.service.ts`, durable outbox and lease patterns in `studio-outbox.job.ts`, accounting reconciliation patterns, BullMQ as an API dependency, and an object-storage abstraction reached through the existing Minio integration. Audit these interfaces before reusing them. Presence does not establish suitability or deployment readiness.

## Target architecture

All Hudumika apps feed a shared engineering-reporting entry point. Each app retains control of its operational records. Lens stores approved engineering context, evidence, issue relationships, delivery history, and snapshots. External systems communicate through provider adapters backed by durable inbox/outbox records and workers.

The principal trace is report -> reproducible issue -> planned work -> commit or patch -> review -> test evidence -> deployment -> verified resolution. A single issue can have several reports and affected releases. A single release can contain several fixes. Model these relationships explicitly.

Preserve the current internal Lens boundary during this build. Tenant reporters can submit reports and read authorized customer-visible updates through their existing app or Support identities. A separately productized, tenant-owned Lens workspace is an expansion requiring its own tenancy design. Do not transform existing platform engineering records into customer-visible rows.

### Internal communication

Use ALL_APP_IDS and the actual route/service registry to enumerate every app, including platform tools. Provide shared report intake in the existing application chrome with app ID, route, release/build identifier, sanitized request/correlation ID, expected and actual behavior, reproducibility, and consented attachments. A working generic report path covers every app; app-specific context adapters add deeper context only where supported.

For each app, inventory useful interactions such as Support report linking, Tasks/Projects work references, Drive evidence storage, Sign release approvals where actually appropriate, Studio workflow triggers, Developer/MCP engineering tools, Email/SMS notifications, and app-specific defect context. Read operational records through existing authorized services. Minimize copied tenant data and distinguish restricted evidence from redacted engineering summaries.

Emit events through an audited transactional pattern so a saved report cannot lose its notification. Preserve correlation and causation IDs through internal and external delivery. A reporting outage must not prevent the originating app from completing unrelated business operations. Do not capture every normal app event or full business record automatically.

### External communication

Use multiple connection instances, each with provider, external organization/site/installation, resource scope, project bindings, encrypted credentials, granted permissions, webhook identity, and health. Provider adapters declare supported entities, operations, authentication, pagination, rate controls, event verification, version policy, and limitations.

Required connectors are GitHub, Jira Cloud, Linear, Notion, Slack, and CircleCI. GitLab, Azure DevOps, Microsoft Teams, Sentry, and Confluence are extension candidates. Inventory their demand and current APIs and record them as planned until implemented and verified. A generic signed webhook API and documented REST API support other systems but do not count as a native connector.

- GitHub should use a GitHub App for scoped installations, issues, pull requests, commit metadata, checks, and release/deployment evidence. Review existing PAT connections for a controlled migration. Verify webhook signatures and deduplicate deliveries.
- Jira Cloud should use a distributable OAuth 2.0 3LO application. Support project-specific field metadata, required fields, issue types, transition discovery, rich-text conversion, webhook lifecycle, identity mapping, and rate limits. Avoid hardcoded workflow names or collecting customer API tokens as the product's normal installation flow.
- Linear needs organization/team scoping, GraphQL error handling, cursor pagination, verified webhooks, and project/cycle mappings. Existing assumptions about API-key formatting must be revisited for OAuth.
- Notion needs OAuth/page sharing, accessible resource discovery, current data-source schemas, paginated block conversion, and webhook processing that fetches the latest resource. Use it for specifications, decisions, and approved release notes. Document conversion limits and preserve source links and revisions.
- Slack needs OAuth installations, channel membership checks, scoped notification rules, issue creation from an explicitly chosen message, linked threads, and authorized interactive actions. Verify signatures and timestamps and acknowledge events within provider deadlines after durable receipt. Resolve the Slack actor to a permitted Lens identity before performing writes.
- CircleCI needs project-scoped pipeline and workflow/run metadata, job outcomes, and evidence links. Keep the existing read-only execution policy unless pipeline triggering is explicitly introduced with permission and audit controls.

Use field-level synchronization ownership. The repository provider owns commit and PR facts, CI owns execution results, and Lens owns verification and resolution. A mapping may explicitly delegate selected issue fields to Jira or Linear. Save the last synchronized base, resource revision and origin so concurrent changes become visible conflicts. Never use unrestricted last-write-wins. Deletions, revoked sharing, and provider deauthorization need explicit tombstone and access-revocation handling. No cascade deletion of engineering history from an external deletion.

### Snapshot storage

Support separately identified file captures, selected-file sets, source-tree archives, Git bundles where supported, and an uncommitted working-tree patch. State which content is included. Preserve commit SHA, repository identity, branch as a label, submodule SHAs, LFS inclusion status, paths, sizes, checksums, creator, reason, issue link, and capture/tool version.

Keep immutable manifest metadata in Postgres and private bytes in existing object storage. Scope deduplication within the appropriate security boundary. Publish READY only after content verification and metadata commit. Recover from interrupted uploads and remove orphaned staging objects safely. Support quotas, bounded streaming, retention, legal holds where configured, authenticated downloads, and actual restore drills. A remote commit URL alone is a link rather than a stored snapshot.

Provide a narrow CLI or local capture command for repositories and uncommitted files that a remote server cannot access. Use bounded subprocess arguments, disable interactive prompts and credential logging, validate permitted repository hosts and paths, reject archive traversal and unsafe symlinks, and do not execute captured code. Restore produces a download or a new working branch with a diff preview. Production deployment remains a distinct controlled workflow.

### Reliability and operations

Persist validated incoming envelopes before acknowledging them. Deduplicate by connection and provider delivery identity. Use leases, bounded retries with jitter, provider Retry-After, failed-job queues, reconciliation cursors, backfill checkpoints, loop prevention, and per-connection concurrency limits. Handle a remote create that succeeds before a timeout through reconciliation before retrying. Exactly-once remote delivery cannot be assumed.

Operate with structured redacted logs, delivery lag metrics, connection health, request correlation, audit records, alerts, backup/restore drills, retention, and tested operational runbooks. Define numeric service objectives and data-loss/recovery targets against measured capacity and production deployment constraints. Record assumptions and test results.

## Official references

- GitHub Apps webhooks: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps
- Jira Cloud OAuth: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
- Jira webhooks: https://developer.atlassian.com/cloud/jira/platform/webhooks/
- Jira rate limits: https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
- Linear webhooks: https://linear.app/developers/webhooks
- Notion webhooks: https://developers.notion.com/reference/webhooks
- Notion limits: https://developers.notion.com/reference/request-limits
- Slack events: https://docs.slack.dev/apis/events-api/
- Slack request verification: https://docs.slack.dev/authentication/verifying-requests-from-slack/
- GitLab webhooks: https://docs.gitlab.com/user/project/integrations/webhooks/

## Copy-ready implementation prompt

You are implementing Lens in D:\Apps\Hudumika. Build it into Hudumika's production engineering management application using this specification. Deliver working software and evidence for each acceptance criterion. Treat readiness as a verified release gate. Report unfinished and unverified work explicitly.

### 1. Establish the baseline and preserve behavior

Read AGENTS.md, CLAUDE.md, this document, existing Lens migrations, shared types, routes, services, pages, integration preflight, deployment configuration, and tests. Capture git status and preserve other sessions' edits. Inspect npm workspace dependencies and existing implementations before introducing a library or parallel subsystem.

Reconcile the known Lens documentation discrepancies against actual migrations and code. Preserve current platform-scoped records, SUPER_ADMIN access, existing refs, links, cycles, and written-resolution requirements. Audit existing caller behavior before extracting services. Never edit an applied migration. Choose the next free migration numbers at implementation time and register database interfaces and shared types.

Create a coverage matrix from ALL_APP_IDS and a provider capability matrix. Record each app's authorized reporting entry point, context fields, references, notifications, event producer/consumer, and actual verification. Every app must support shared report intake where a user has app access. Specialized adapters require real backend support. Do not invent routes, integrations, or success states.

### 2. Implement the engineering domain

Extend current entities to support projects, repositories, environments, ownership, assignment, issue dependencies, severity and priority, affected versions, reproductions, root causes, fix summaries, verification evidence, release links, and reopen history. Add comments, restricted attachments, labels, saved filters, searchable history, and issue deduplication/merge with preserved provenance. Reuse existing features where they already work.

Support planning, in-progress work, review/testing evidence, blocking, release readiness, and closure. Preserve historical statuses and migrate deliberately if adding new ones. Keep evidence confidence separate from workflow progress. Closing a bug requires the applicable resolution and verification record. A merged pull request or successful pipeline alone must not falsely claim that production is fixed. Model verification, release, and deployment separately.

Keep changes and lifecycle transitions auditable. Use optimistic concurrency or conditional writes to expose stale edits. Make issue creation and integration actions idempotent where retries can duplicate records. Preserve the ability to reopen and explain regressions.

### 3. Connect all Hudumika apps safely

Implement shared report intake through existing application chrome and Support flows with accessible form controls, sanitized context preview, optional screenshots/files, and clear visibility controls. Validate every supplied tenant record ID and enforce the caller's existing access before creating a link or attachment.

Use server-resolved actor, app and tenant context. Tenant data queries must run inside withTenant() with explicit tenant filters. Use dbPlatform only for the audited platform engineering records that require it. Keep tenant evidence protected after intake. Customer-visible updates must come from an explicit redacted projection with authorized report ownership. An issue linked to several customers must never expose one customer's reports to another.

Use the shared app registry for coverage and branding. Introduce durable events for report creation, triage, assignment, verification, reopening and release updates using an existing suitable outbox pattern. Audit Studio, notifications and Support integration points and implement them through shared services. Avoid circular dependencies and internal HTTP calls where existing service calls fit.

### 4. Build the integration runtime

Replace the single-provider global connection limitation with connection instances and project/resource bindings. Migrate existing credentials to encrypted storage using the existing cryptographic service after auditing its suitability. Add versioned key metadata and a tested rotation/migration path. Never return secrets to the frontend, include them in logs, or persist unredacted provider responses as ordinary error text.

Implement capability-driven adapters, connection setup/preflight, resource selection, test connection, reconnect, disconnect, revocation, health, delivery history, mapping, and recovery controls. A successful auth check must not imply permission to write to a selected resource.

Use durable inbox and outbox records with unique delivery identities, worker leases, retry scheduling, reconciliation and explicit terminal failures. Verify incoming webhooks against each provider's documented mechanism before processing them. Apply body limits, replay protections where supported, and endpoint authentication that does not require an interactive Hudumika session. Reject unknown installations and unauthorized resources. Perform external network calls outside long-running database transactions.

Add field ownership, status and user mappings, source revisions, loop suppression, tombstones and visible conflict resolution. Store sync cursors and support bounded resumable imports, dry-run previews and reconciliation. Handle 429, 5xx, expired tokens, insufficient scopes, missing resources, provider API errors inside HTTP 200 responses, and ambiguous remote-write outcomes. Bind OAuth state to the initiating authorized session and connection; use provider-supported token refresh protections and serialize refresh races.

Implement the required native connectors end to end:
- GitHub App with repository selection, issues, PR/commit/check references, signed webhooks and deployment/release evidence.
- Jira Cloud OAuth with site/project discovery, dynamic required fields, permitted transitions, comments, field mappings, webhook renewal and rate-limit recovery.
- Linear OAuth or a documented supported installation mode, organization/team discovery, issue/comment mappings, GraphQL validation, pagination and verified webhooks.
- Notion OAuth, shared-page/data-source discovery, specification/decision links, controlled approved publication, format conversion and webhook-driven refresh.
- Slack OAuth, selected-channel membership, notifications, issue creation from chosen messages, linked threads and identity-checked interactive actions.
- CircleCI project discovery/validation and read-only pipeline/workflow evidence with freshness indicators.

For each connector validate API operations and scopes against current official documentation. Provider registrations, public callback URLs, credentials and test organizations are genuine external dependencies. Implement and test all independent work, list the exact missing configuration, and report live verification as pending until performed. Do not fabricate working connections or require an unavailable provider to block unrelated features.

### 5. Implement recoverable code and file snapshots

Build capture jobs, immutable manifests, private artifact storage, checksums, download, text/binary-aware comparison, issue/commit links, retention and restore-to-branch/export workflows. Distinguish source archives, full Git history, selected files and uncommitted patches in both API and UI.

Reuse the existing storage facade and upload controls. Enforce authorization, quotas, size/time limits, safe archive handling, content checks, secret exclusion/detection and download audit. Use streaming paths for large content. Track QUEUED, CAPTURING, VERIFYING, READY and FAILED states or existing equivalents. Failed or partial captures must be recoverable and visibly incomplete.

Provide a documented narrow local capture tool for authorized repositories and uncommitted work. Never upload arbitrary machine paths automatically. Use checksum verification on restore and exercise an actual downloadable recovery artifact in tests. Preserve legacy external links without misrepresenting them as stored snapshots.

### 6. Build a complete Hudumika UI

Use the live components/ui design system, PageHeader, PageLayout, app branding, density and shape tokens, and apiFetch. Cover Overview, Projects, Issues, Cycles, Repositories, Snapshots, Releases, Reports and Integrations using existing pages where possible. Multi-step configuration belongs on dedicated routes.

Provide a full issue detail route with reproduction, evidence, discussion, activity, development references, snapshots, verification and release history. Make loading, empty, permission-denied, validation, retry, stale/conflict, disconnected and partial-sync states actionable. Include mobile and keyboard flows, accessible names and focus handling, pagination, server-side filtering and bounded search. Keep setup secrets masked and scope choices understandable.

Expose planned connectors honestly through a capability/status catalog. Every active control must perform a real supported operation. Produce progress reports from recorded changes and events, with clear definitions and date ranges. Link release notes to actual verified issue and deployment records.

### 7. Expose controlled automation and MCP

Inspect the current Hudumika MCP gateway and its readiness before integrating Lens. Reuse it if suitable. Add scoped tools for searching issues, reporting defects, reading progress, attaching approved evidence, and requesting snapshot capture. Enforce Lens's current internal permissions independently of the surrounding Developer UI.

Treat imported documents, comments and repository content as untrusted data for AI workflows. External content cannot grant permissions. Apply the same actor, record, scope and audit checks as normal APIs. Separate read and write tools and protect high-impact actions with existing application controls. AI summaries retain source links and must not manufacture verification evidence.

### 8. Test and meet the release gate

Use the existing API integration-test framework and real disposable database records. Add tests for actual regressions and new security/reliability boundaries. Verify legacy Lens data and integrations migrate correctly. Cover unauthorized users, customer evidence isolation, cross-tenant IDs, bad and duplicate webhooks, reordered events, concurrent edits, OAuth disconnect/refresh, pagination, deleted resources, retry-after handling, sync loops, and remote-write ambiguity.

Test worker crashes after remote success and before local acknowledgement. Verify deduplication, reconciliation and lease recovery. Test interrupted captures, corrupt checksums, unsafe archives, expired downloads and recovery of an actual stored snapshot. Verify private content is absent from public/customer views and provider error logs.

Run npm run typecheck, relevant API integration tests and npm run build. Use browser checks through normal routes for admin and reporter flows at desktop/mobile sizes. Test actual configured external sandboxes with narrowly scoped operations. Report skipped tests, missing credentials and provider limitations accurately.

Add suitable health/readiness checks, redacted observability, queue lag and delivery metrics, backup/restore procedures, retention enforcement, deployment/migration sequence and rollback/recovery instructions. Measure representative load using a documented dataset and publish latency, error rate, worker throughput and storage results. Set numeric production objectives based on the measured deployment and record unachieved targets.

Finish with a file-change summary, completed app/provider matrices, test commands and actual results, migration/backfill status, deployment requirements, measured release gates and unresolved blockers. Claim production readiness only for capabilities with completed evidence. Keep implementing independent work until the specified build is delivered.
