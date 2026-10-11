# Hudumika pending-work implementation plan

Date: 10 October 2026
Baseline: [App completeness review](APP_COMPLETENESS_2026-10-10.md)
Status: implementation started; first CORE-02 production-payment guard completed and locally verified. Remaining work is tracked below.

## Objective

Complete the missing workflows, repair known defects, and obtain the evidence needed to release each app. Preserve working features and existing integrations. Do not rebuild an app merely because it lacks broad acceptance evidence.

The plan covers all 31 IDs declared in the AppId type, Inventory inside SEAL, Demurrage inside CargoTracker, and customer/organization portals. ALL_APP_IDS has 30 entries because it omits AI; confirm whether that exclusion is intentional before changing it. Lens remains internal tooling. Completion is measured against accepted workflow requirements and release gates, not page counts or an arbitrary percentage.

## Delivery rules

- Reconfirm each finding against current code and the running schema before implementation; the audit register contains superseded findings. Record evidence when an item needs verification only.
- Use `apps/web/src/components/ui`, `PageHeader`, documented `PageLayout` exceptions, branding and theme tokens, existing `apiFetch`, and the current localization pattern. Follow CLAUDE.md and AGENTS.md.
- Reuse existing routes, services, queues and provider abstractions before creating another mechanism. Add dependencies only after checking both application manifests and existing implementation.
- Database changes use new ordered migrations and shared types. Every tenant operation uses explicit predicates and `withTenant`; validate foreign IDs before writes. Document legitimate platform exceptions.
- Stage and commit only task-owned paths; preserve concurrent changes. Keep individual changes reviewable and deployable.
- Do not represent fixtures, simulated payments, manual entries or an unconfigured adapter as a real integration. External capability work starts only when its actual contract/API exists.

## Sequencing and milestones

| Phase | Work | Dependencies | Exit milestone |
|---|---|---|---|
| 0 — establish the backlog | Requirements, current failure reproduction, test baseline and staging/provider inventory | None | Each task has scope, owner role, acceptance checks and evidence status |
| 1 — repair blockers | Project OS, production billing, SEAL invoice UI; shared isolation and signing dependency remediation | Phase 0 for affected domains | Known broken core paths repaired; release-critical findings closed or affected capability explicitly withheld |
| 2 — money and durable execution | FinOps, Petti, inventory reconciliation, Studio/event consumers, shared job reliability | Billing/isolation contracts; repaired schemas | Monetary workflows reconcile; retries and restarts do not duplicate effects |
| 3 — finish app workflows and providers | App backlog below; external integrations as credentials/contracts become available | Relevant Phase 1/2 gates | Each app completes its agreed workflows and provider acceptance |
| 4 — UI and portal acceptance | Every routed screen and role; shared design-system corrections | Stable API/workflow contracts | Responsive, accessible light/dark journeys pass with real loaded data |
| 5 — staged release | Performance, monitoring, migrations, restore/failover and domain-owner acceptance | All applicable preceding gates | App-specific release evidence and operating runbooks accepted |

UI corrections and operational preparation can proceed while backend work continues where contracts are stable. This describes workstream dependencies, not authorization to launch additional agents or production changes.

## Phase 0: establish a trustworthy baseline

**BASE-01 — accepted workflow inventory.** For every app, list actors, routes, APIs, state transitions, inputs/outputs, external dependencies and failure cases. Separate missing implementation, confirmed defect, verification-only, external prerequisite and product-policy decision. Reconcile with the existing app and UI inventories, including whether AI belongs in ALL_APP_IDS and the consequences for entitlements/launcher configuration. Assign an accountable owner role, without inventing a person's name.

**BASE-02 — current verification.** Complete the full existing API suite and capture ordinary pass/fail, expected failures and skips separately. Run root typecheck and workspace build. Reproduce Project OS failures against the actual schema. Refresh dependency advisories and the open audit register; historical severity counts are not current measurements.

**BASE-03 — safe acceptance environment.** Inventory staging database/schema, restricted DB role, storage/scanner/converter, Redis/worker topology, callback URLs and provider sandbox configuration. Record configuration presence without exposing secrets. Define disposable tenants, sample data, cleanup and provider spend limits.

Exit: a traceable task ledger, reproducible baselines and a list of external prerequisites. No acceptance test may silently charge real customers or mutate their records.

## Phase 1: concrete blocker work packages

### CORE-01 — Project OS schema and authorization repair

1. Compare migration-created tables, actual schema, Kysely interfaces, services and frontend payloads. Select the existing authoritative domain contract; add migrations only when a required model truly lacks a field.
2. Repair portfolios/programs first, then phases/work packages/deliverables, risks/issues/change approvals, procurement/resources, and detail/command center/EVM. Replace fabricated metrics with calculated values or explicit unavailable states.
3. Fix membership and assigned-approver checks alongside those workflows. Validate referenced project/supplier/resource ownership before writes; keep approval transitions atomic.
4. Convert each repaired `it.fails` case into an ordinary passing assertion. Retain unresolved cases visibly in the backlog rather than deleting coverage.

Acceptance: create/read/update the agreed entities, project member versus outsider and cross-tenant denials, assigned-approver enforcement, no partial writes after rejection, computed EVM fixtures and loaded desktop/mobile journeys. No unresolved expected failure in a release-critical path.

### CORE-02 — production billing correctness

1. Trace subscription payments, onboarding/agency payments, refunds and entitlements across existing gateway and Petti services.
2. Restrict simulation to explicit non-production/demo behavior. When a production gateway is absent, return an actionable unavailable state and keep the invoice unpaid.
3. Use existing hosted checkout and verified callbacks. Make duplicate callbacks safe, record unsettled/failed states, and grant paid entitlements only from the agreed verified payment state.
4. Provide operator reconciliation for uncertain outcomes; never blindly repeat a possibly completed charge.

Acceptance: no-gateway, declined, timeout, forged callback, duplicate callback, partial/refund and settlement scenarios; correct invoice/ledger/entitlement result with auditable actor and reference. Gateway sandbox acceptance is a separate gate from mocked tests.

### CORE-03 — SEAL Storage Invoices

1. Reuse the existing lot invoice-generation and FinOps APIs. Confirm tariff units, dates, currency/tax treatment, account mapping and overlap rules with the finance/warehouse owner.
2. Replace the placeholder with a server-paginated invoice register, lot/customer/status/date filters, eligible-lot selection, itemized preview and draft generation. Link invoice details to FinOps.
3. Show draft/posted/paid/void states truthfully. Follow existing posting permissions and correction/reversal flows; protect against duplicate billing windows.

Acceptance: tariff/date boundaries, currency/tax totals, duplicate/concurrent generation, foreign-tenant IDs, forbidden posting, invoice reconciliation and light/dark desktop/mobile interaction. Do not duplicate FinOps posting logic.

### SEC-01 — shared tenant and privileged-access closure

Classify open developer/analytics/non-tenant tables and unscoped-query/transaction heuristics against current code. Implement only confirmed defects; document platform exceptions and add focused negative regressions. Verify restricted-role RLS, explicit tenant predicates, query limits, secrets and privileged audit attribution. Include portals, public shares and provider callbacks.

Acceptance: unrelated tenant/customer/member cannot read, mutate or infer protected records; rejected operations leave no partial state; current findings have reproducible closure evidence.

### SEC-02 — signing/timestamp dependency remediation

Trace actual vulnerable runtime paths. Evaluate a maintained compatible upgrade, fork or protocol-compatible replacement in isolation; do not force an invalid downgrade or fabricate proof verification. Preserve certificate/PDF and historical timestamp proof formats.

Acceptance: existing genuine proofs and certificates verify, malformed/wrong-password inputs fail safely, pending confirmations remain honest, network boundaries and key handling pass. External crypto/legal review is required for the relevant release claim.

## Phase 2: shared financial and execution reliability

**REL-01 — durable delivery.** Inspect existing FinOps outbox/jobs and Studio/event execution first. Extend the current mechanism for uncovered consumers: transactional event persistence, per-consumer state, stable idempotency keys, bounded retry/backoff, dead-letter/reconciliation and operator replay controls. Maintain tenant context and authorization on retry.

Acceptance: crash before/after commit, duplicate delivery, worker restart, provider timeout after a possible write and dead-letter replay produce one business effect or an explicit reconciliation state. A registered trigger alone does not satisfy this gate.

**REL-02 — monetary reconciliation.** Define accountant-approved fixtures for AP/AR, GL, FX, rounding, inventory/GRNI, refunds and wallet settlement. Test duplicate/concurrent requests, period locks and reversal paths. Separate currencies in aggregates and apply workspace date/time policy consistently.

**REL-03 — bounded data and exports.** Finish unbounded Finance feeds and other measured hotspots using existing server-pagination patterns, stable ordering and independent aggregates. Use existing job infrastructure for large exports if suitable; authorize export download, enforce retention and prevent list views from loading whole histories.

**REL-04 — operational workers.** Review recurrence/reminders, webhook dispatch, sync, retention and provisioning workers for singleton/locking, resumability, bounded batch size and failure visibility. Add useful metrics and safe recovery procedures.

## App-specific implementation backlog

Each row is an epic to split into reviewable tasks during Phase 0. Shared UI, isolation and release gates apply to every row.

| ID / app | Build or finish | Acceptance evidence / prerequisites |
|---|---|---|
| APP-01 ClearOS | Complete confirmed clearance variants and exception/recovery flows; wire only real contracted customs capabilities. | Shipment → declaration → invoice/payment; amendments/rejection and role/tenant denials. Customs authority contract and domain-owner acceptance for live integration. |
| APP-02 FinOps | Finish provider bill/payment reconciliation, supported QuickBooks AP, remaining bounded feeds/exports, date/currency consistency and authenticated POS checkout/refund. Reuse the existing delivery register/outbox. | Financial fixtures reconcile; provider sandbox export/reconciliation, duplicate payment/refund and close/reopen tests. Accountant/statutory acceptance. |
| APP-03 ComplyOS | Distinguish demo extraction from real document/OCR/provider results; add actionable unconfigured/failure states; finish confirmed renewal/application/marketplace gaps. | Real uploaded-document extraction, OCR outage/invalid document, renewal transitions, consent/access; verified government/sanctions contracts. |
| APP-04 Bliss | Complete call reconnect/connection-state recovery and accessible composers/attachments; tune existing guest controls from evidence. | TURN-backed multi-browser calls, reconnect/network loss, guest scope, attachments and concurrency. Production-equivalent call topology. |
| APP-05 NexusHR | Close confirmed employee/manager workflow gaps, device ingestion errors and payroll allocations; implement statutory changes only from accepted rules. | Recruitment → employee → payroll/GL → exit; concurrent leave, device replay, employee/manager permissions. HR/privacy/payroll-owner acceptance. |
| APP-06 OneSite/CMS | Close publish/approval/rollback gaps, reliable outbound webhooks and accessible editor/form failures. | Draft → approval → publish → rollback; duplicate dispatch, rejected permissions, mobile editing and staging publication. |
| APP-07 Onsite/AgencyHost | Finish provisioning rollback/status and operator recovery; connect supported registrar/cloud/DNS contracts; remove production simulated-payment reliance. | Provision/update/fail/rollback, tenant ownership, secret rotation and restore rehearsal; real sandbox credentials. |
| APP-08 Ondi | Close IdP compatibility and session/key rotation recovery gaps. | SAML/OIDC issuer/audience/expiry, account linking, revocation, rotation and outage tests; approved external IdP matrix. |
| APP-09 HuduFreight | Complete stale/offline indicators, mobile driver actions and recoverable device ingest. | Real supported device/GPSWOX ingestion, replay/auth denial, geofence entry/exit, stale positions and fleet-scale maps. |
| APP-10 Drive/Cloud | Close scanner/converter/storage failure handling and large-file/resume gaps if confirmed missing. | Quarantine cannot download, quota concurrency, broken object store, resumable transfers if supported, retention/legal holds and share revocation. |
| APP-11 Hudumika AI | Add missing outage/limit handling, action authorization safeguards and measurable usage budgets using existing tooling. | Prompt-injection and cross-tenant/ownership regressions; provider outage/rate limit, partial tool failure, cost controls and audit records. |
| APP-12 Workspace Admin | Complete confirmed role/settings/billing workflows and recovery; CORE-02 payment correctness. | Role changes and entitlements persist correctly; forbidden administration, destructive actions, unpaid billing and real settlement. |
| APP-13 SuperAdmin | Replace Restore and Access Policy Review placeholders with authorized, audited workflows backed by real mechanisms. Preview policy changes; restore into an isolated target before any production promotion. | Privilege/OTP controls, immutable actor trail, policy validation and staged restore proof. Destructive production execution requires separate operational authorization. |
| APP-14 Email | Close provider/bounce/retry and large-mailbox gaps; complete keyboard/mobile compose/reply recovery. | Supported SMTP/IMAP/OAuth send/sync, refresh revocation, duplicate/retry safety, delivery failure and attachment handling. |
| APP-15 CRM | Decide delete/archive/restore behavior; implement the agreed policy and confirmed pipeline/automation scaling fixes. | Lead → deal → won/lost, linked records preserved, deleted-party behavior, large pipeline and role journeys. |
| APP-16 Contacts | Close sync conflict/duplicate and refresh/revocation gaps. | Provider sandbox incremental/full sync, duplicate contacts, concurrent edits, token expiry and large address books. |
| APP-17 Store | Implement agreed submission moderation, package scanning/quarantine, malicious-app handling and refund/commercial lifecycle. | Unsafe package rejected, installation permissions, app removal/revocation and billing/refund reconciliation. Signed-off commercial policy. |
| APP-18 Calendar | Finish provider synchronization and reliable reminder behavior; avoid rebuilding fixed guest invitation handling. | Real provider changes/conflicts, timezone/DST, simultaneous booking, guest accept/decline and mobile keyboard scheduling. |
| APP-19 Tasks | Finish recurrence/reminder restart safety and confirmed collaboration gaps. | Worker restart/replay, concurrent completion/dependency changes, unauthorized collaborator and calendar linkage. |
| APP-20 Demurrage | Finish agreed dispute/waiver approval behavior and tariff/date/currency edge handling. | Carrier statement reconciliation, waiver approval/audit, posted-charge immutability and boundary-day fixtures. |
| APP-21 CargoTracker | Connect a real supported carrier adapter when credentials/contracts exist; improve stale/unavailable tracking and recoverable booking errors. | Real carrier sandbox booking/tracking, timeout/duplicate safety and manual fallback explicitly labelled. No live Maersk claim before acceptance. |
| APP-22 SEAL/Inventory | CORE-03 billing; complete GRNI receipt/bill reconciliation and confirmed warehouse/hardware exception gaps. | Concurrent receipts/counts, PO partial receipts, stock/GL reconciliation, scanner/sensor failures and lot release authorization. Customs/hardware-owner acceptance. |
| APP-23 Studio | REL-01 execution guarantees, recoverable run failures, loop budgets and accessible builder operations. | Duplicate trigger/action, replay, failed steps, permission changes, loop termination and real workflow CRUD. |
| APP-24 HuduBI | SEC-01 isolation closure; agreed metric definitions, query budgets and cache invalidation. | Cross-tenant denials, fixture-backed metrics, large queries/timeouts, stale cache and permission-sensitive exports. |
| APP-25 Petti | Reverify and finish cancel/void for approved but undisbursable requests; gateway settlement and exception reconciliation. | Named approval, cancellation state rules, duplicate disbursement, concurrent balance, failed settlement and GL reconciliation. |
| APP-26 Notes | Validate offline expectations; implement only missing agreed offline/conflict/search behavior and retention controls. | Concurrent edits, reconnect conflicts, share revocation, legal hold, search scope and mobile accessibility. Offline support is a product decision if absent. |
| APP-27 eSign | SEC-02 remediation; finish certificate/key/proof operations and verification recovery gaps. | Sign → verify/revoke with genuine certificates/proofs, historical verification, custody and key-rotation recovery; legal/crypto acceptance. |
| APP-28 SMS | Finish confirmed retry/delivery-state/opt-out gaps and certify supported providers. | Signed callbacks, duplicate/out-of-order delivery events, retries, unsubscribe enforcement and provider sandbox delivery. |
| APP-29 Projects | CORE-01, then populated board/timeline/resource/procurement/approval journeys and measured portfolio reporting. | Ordinary happy-path and negative tests pass; no fabricated metrics or expected-failure release gates. |
| APP-30 Developer | SEC-01 isolation closure; complete quota/metering/key rotation/API-version and marketplace lifecycle gaps. | Usage reconciles with requests, quota enforcement, revoked keys denied, tenant separation and supported API examples. |
| APP-31 Lens (internal) | Reconcile implementation-status document; complete agreed cycle/planning, roadmap/epics and real GitHub OAuth/webhook receiving. | Internal role scope, OAuth state/signature/replay, event-to-record updates, cycle/epic transitions. Keep customer launcher exclusion. |

There is one epic row for each of the 31 declared app IDs. Epic numbering is a backlog identifier; reconcile the registry discrepancy in BASE-01 before estimating, then split each epic into actionable tickets.

## Phase 4: UI and portal delivery checklist

Create a per-route matrix from the existing UI inventory. Fix shared component defects once, then app deviations. Start with Project OS, SEAL billing, FinOps/POS and administrative money paths, followed by the remaining shells.

For each regular route verify PageHeader/PageLayout, user-selected font/branding, token-based light/dark colors, alignment and readable hierarchy, loaded/empty/error/loading states, visible permission failures and retry, form validation and navigation recovery. Verify keyboard focus, labels and dialogs. Check 390/768/1280px and relevant POS/tablet widths: no document-level horizontal sliding; bounded table scrolling only where appropriate. Keep desktop pagination information/controls/page-size on one row when space permits, and use an explicit responsive layout at narrow widths. Preserve report/PDF formats and documented full-screen exceptions.

Portal acceptance must separately cover CUSTOMER, ORG, guest meeting users and public sign/share/booking users. Test entitlement denial, direct deep links, expiring/revoked shares and ownership rules—not just staff screens.

Exit: retained browser evidence for representative data states and every critical role journey; console errors and confirmed layout defects resolved. A shared-component contract check alone cannot close this phase.

## Phase 5: release gates and evidence

| Gate | Required evidence | Accountable owner role |
|---|---|---|
| Functional | Accepted workflows pass; known core placeholders/failures resolved or capability excluded explicitly | App/product owner + engineering |
| Security | Current findings closed, tenant/role negatives pass, dependency decisions documented | Security/platform owner |
| Financial/legal | Ledger/statutory/privacy/customs/signature claims accepted for relevant apps | Finance, HR, legal/customs owners |
| Provider | Actual sandbox contracts, credential rotation and signed callbacks tested; demo/manual modes honest | Integration/operations owner |
| UI | Authenticated loaded-state browser matrix, dark/light, mobile/tablet, keyboard and error recovery | Frontend/QA owner |
| Capacity | Agreed dataset/concurrency targets and latency/error budgets measured, not assumed | Platform/operations owner |
| Recovery | Ordered migration on staging, isolated restore/failover rehearsal, job restart and storage recovery | Database/operations owner |
| Operations | Useful alerts, audit retention, support/runbooks, rollback and incident owner | Operations/support owner |

Release each app against its applicable gates instead of waiting for unrelated internal Lens work. Cross-app dependency gates still apply—for example, money-producing apps depend on FinOps/payment acceptance; AI/Studio actions depend on target-app authorization; customer documents depend on Cloud/eSign permissions.

## Initial delivery batches

1. **Batch A:** BASE-01–03; reproduce Project OS; current security/dependency baseline; billing state contract; SEAL tariff/billing contract.
2. **Batch B:** Project OS portfolio/program/member/approval foundations; fail-closed production billing; SEAL invoice register and draft generation; confirmed tenant/security repairs.
3. **Batch C:** remaining Project OS schema journeys, SEAL reconciliation, FinOps/Petti financial/provider work and durable consumers; signing remediation.
4. **Batch D:** app-specific workflow/provider completion and shared workers; route-by-route UI migration in stable domains.
5. **Batch E:** staged load/recovery/provider acceptance, domain-owner approval and app-specific rollout.

These are ordered work packages, not promised calendar dates. Estimate each after reproduction and requirements acceptance, using the actual staffing and external lead times. Provider credentials, government contracts and owner sign-offs are tracked dependencies, not engineering estimates.

## Tracking and definition of done

Create tickets with: ID, app/workflow, priority, current evidence, required change, dependencies, accountable role, acceptance cases, migration/rollback considerations and status. Suggested statuses: Ready, In progress, Awaiting external prerequisite, In verification, Accepted. A dependency may block one ticket while independent work continues.

A ticket is done when scoped behavior is implemented, appropriate ordinary regression tests pass, API/web typecheck and required checks pass, UI-visible changes have browser verification, and evidence is recorded. A release milestone additionally requires the applicable gates above. Record expected failures, skipped tests and unmet external acceptance honestly. Re-run the full suite at integrated milestones; do not add another test framework.

Update APP_COMPLETENESS_2026-10-10.md and the audit register as evidence changes, preserving historical findings and recording why a prior blocker is closed. This plan creates reviewable scope; it does not authorize provider purchases, customer communications or destructive production operations.

## Implementation progress — 10 October

| Work package | Status | Evidence / remaining scope |
|---|---|---|
| CORE-02 production simulation guard | Completed slice | Unconfigured production direct payments return 503 without invoice changes; shared simulator refuses production signup charges. Focused billing/storage suite: 21 passed. Root typecheck, 94 trigger entries, 19 design-system checks and encoding passed. |
| CORE-02 complete payment lifecycle | Pending | Real signup checkout, uncertain-outcome reconciliation and external gateway acceptance remain; no live provider calls made. |
| CORE-01 Project OS | In progress | Portfolio/program create/list reconciled with migration 448; foreign manager/portfolio IDs rejected before writes; project-scoped routes reuse existing membership/viewer edit rules. Phase/WBS create/list mappings and gate owner/admin authorization repaired in the second slice. Current remaining expected failures: 10; full enterprise journeys still pending. |
| CORE-03 SEAL invoices | Pending | Confirm existing tariff/invoice contract before replacing the placeholder. |

Source review correction: AgencyHost managed-client creation does not itself simulate a payment; its comment compares it with the separate signup flow. Avoid creating a charge-repair ticket for that unrelated path.

### CORE-01 first implementation slice

Portfolio/program Kysely table types now match the existing columns. API compatibility maps manager/budget fields and lowercases persisted uppercase statuses; ROI/alignment/benefits are preserved in existing JSON metadata. Portfolio expenditure returns null because no reconciled expenditure source exists. Program statuses now match the actual persisted lifecycle (archived, not cancelled). No migration or database backfill was needed.

Verification: both Project OS suites pass 47 cases: 30 ordinary checks and 17 explicit expected failures. The remaining expected failures are not counted as completed workflows. A Chrome component-level browser check used actual disposable-tenant API/database responses to render the portfolio and program cards with no page errors. Full-shell navigation timed out during shared branding requests, so no full-shell acceptance is claimed. Temporary fixtures and tenant data were cleaned up. Final compiler/check outcome is recorded in the follow-up evidence.

Final verification: root typecheck passed (API/web, 94 trigger entries, 19 design-system checks, encoding). The compiler identified an optional Fastify route URL in the access hook, fixed with a null-safe check. Web compilation also caught an invalid `refreshCw` icon reference in concurrently modified SealConsignments.tsx; only that reference was changed to the existing `refresh` icon, preserving the other session's changes. After simplifying the tenant-scoped join expressions, the 24-case smoke file passed again (seven ordinary, 17 expected failures). Whitespace checks pass. No full API-suite pass or full-shell browser acceptance is claimed.

### CORE-01 second implementation slice

Phase reads/writes now use the existing `sort_order`, `phase_number`, uppercase lifecycle and description columns. Migration 577 adds JSON metadata for gate configuration and review decisions, preserving scheduling fields instead of creating parallel columns. It was applied locally using the existing migration runner (one migration applied). Optional phase codes get a unique server-generated code; project-row locking serializes automatic ordering. Gate decisions preserve configuration and require existing project owner/admin access; contradictory status/decision payloads are rejected.

Work packages now use the real manager, budget and start/end columns. Compatibility fields map back to the current client contract; parent links and workflow status use existing metadata. Actual cost is summed from tenant/project-scoped linked tasks, and earned value uses budget times reported progress. Linked phases/parents must belong to the same project, managers to the same tenant. Rejected references are covered by no-write assertions.

Regression evidence: the final 27-case smoke run passed (14 ordinary assertions, 13 explicit expected failures); the 23-case isolation suite passed during this slice. Total: 37 ordinary checks and 13 expected failures. Concurrent migration 576, applied by another session, made the existing detail/command-center smoke assertions pass; those two tests were converted to ordinary assertions, without claiming this slice implemented or fully verified reporting. The remaining deliverable, governance, procurement/resource and assigned-approver workflows remain pending. In particular, the schedule page still loads deliverables together with phases/packages; component acceptance cannot establish full-page availability while the deliverable read contract is broken.

Browser evidence: headless Chrome rendered the existing WBS and phase tabs using actual disposable-tenant create/list responses with no page errors. This was an isolated component check with an empty deliverable prop; it does not prove the full schedule page or shell loads. Temporary fixture files and tenant data were removed.

Final second-slice verification: root `npm run typecheck` passed for API and web, with all 94 trigger entries, 19 design-system checks and encoding validation passing. No full API-suite or full-shell browser acceptance is claimed.

### CORE-01 third implementation slice — deliverables

Deliverable create/list/review now use migration 448's actual name/code/owner, uppercase lifecycle, reviewer and review-notes columns. Description, contract linkage and approval timestamp use the existing metadata. Missing owner defaults to the authenticated creator; missing code receives a unique server-generated code. Linked phases/packages must belong to the same project, owner/contract to the same tenant; phase/package mismatches are rejected and an omitted phase is inferred from the linked package. Review requires existing project owner/admin access. No migration was needed.

Signing-document linkage has no confirmed persisted mapping; supplying that optional field now returns an explicit 501 instead of writing an invented integration. Contract links are validated references only, with no implied signing workflow. Remaining signing integration needs a confirmed contract before implementation.

Regression: both Project OS suites pass 52 cases (40 ordinary assertions, 12 explicit expected failures). Tests cover create/list, approval/rejection metadata, forbidden reviewers and rejected references without writes. Chrome loaded the existing schedule component through all three real phase/WBS/deliverable endpoints and rendered each tab without page errors. This resolves the previous combined-load blocker at component level; full app-shell navigation remains unverified. Temporary fixture files and disposable tenant were cleaned up.

Final third-slice verification: root `npm run typecheck` passed for API/web; trigger registry, 19 design-system checks and encoding validation passed. Whitespace checks passed for the changed API files and audit register.

### CORE-01 fourth implementation slice — risks and issues

Risk and issue create/list/update now use migration 448's real columns, mandatory generated codes, integer risk levels and uppercase lifecycle. Risk score uses persisted probability times impact. The shared probability contract now represents level 3 as moderate, rather than mislabelling existing database rows. UI category aliases map to canonical categories; risk strategy, review date, residual-risk decision and issue impacts persist in metadata added by migration 578. A mitigated risk remains canonically monitored, with the client decision retained in metadata. Unrecorded legacy risk strategy returns null. Issues default the required owner to the authenticated creator and persist resolution in resolution_notes. Project detail risk/critical-issue counts now query canonical persisted statuses.

Owners are validated against the tenant before inserts. Risk status and issue resolution endpoints resolve the existing project membership/edit policy, rejecting foreign tenants, viewers and outsiders without changes. Existing project members retain edit access.

Governance now loads sections independently with Promise.allSettled: failures in change requests/approvals no longer erase valid risk/issue data. A design-system warning identifies failed sections and provides retry; unavailable change/approval counts show a dash. The moderate probability option is available in the existing selector.

Migration 578 applied locally through the existing runner (one migration applied). Focused evidence totals 56 cases: 46 ordinary checks and 10 explicit expected failures. Tests cover persistence, score calculation, resolution, scoped owners and forbidden updates. Chrome used actual disposable-tenant API responses, including real change/approval failures, and verified risk/issue rendering and retry behavior without page errors. Full-shell acceptance and remaining change/approval/procurement/resources workflows remain pending. Temporary fixtures and tenant data were removed.

Legacy-score follow-up: risk list scores and ordering are calculated from stored numeric probability/impact, so old default scores cannot misrank risks. The 33-case smoke rerun passed (23 ordinary, 10 expected failures); the 23 ordinary isolation checks passed earlier in this slice. Total focused evidence: 46 ordinary checks, 10 expected failures.

Final fourth-slice verification: root `npm run typecheck` passed for API/web, along with trigger registry, 19 design-system checks and encoding validation. Whitespace checks passed for the changed API/UI/shared-type files. No full API-suite or full-shell acceptance is claimed.

### CORE-01 fifth implementation slice — approval inbox and decisions

Approval/step types and services now match the persisted entity, requester, assignment, ordering and decision columns. Migration 579 adds step metadata for review labels and was applied locally. Inbox visibility follows tenant/project membership; project-linked decisions require existing project edit access and the named assigned approver. Role-only placeholders cannot authorize a decision or create a workflow: initiation requires configured named approvers and currently supports change requests only. Parallel workflow decisions explicitly reject unsupported execution.

Approval and step row locks serialize decisions. Parent binding, current-step order, contiguous sequence, prior approvals and pending status are checked before writes. Completion records status/timestamp and updates a scoped change request transactionally. Other entity records, signing and financial effects are not claimed as integrated. Change-request CRUD and approver configuration remain unfinished.

Both focused Project OS suites pass 59 cases: 51 ordinary checks and 8 explicit expected failures. Coverage includes foreign tenants, outsiders, assigned viewers, wrong-parent steps, future steps, replay, concurrent decisions (one success and one conflict), and final change-request approval persistence. Chrome rendered the actual governance approval tab using disposable-tenant API/database responses and persisted its Approve action without page errors. This caught and repaired stale UI target/step/status fields; action buttons now appear only on the current pending step. Remaining change-request endpoint failures are still surfaced independently. Temporary browser fixtures and disposable tenant data were removed. Full-shell and full API-suite acceptance remain unverified.

Final fifth-slice verification: root `npm run typecheck` passed for API/web, trigger registry, all 19 design-system checks and encoding. `git diff --check` passed.

### CORE-01 sixth implementation slice — change-request drafts

Change-request create/list now map to migration 448 canonical code, original scope, requested change, justification and requester columns. Tenant-scoped joins return requester/approver names; numeric cost values and lowercase lifecycle preserve the client response contract. Original scope and requested change are required rather than invented from a title. Requests are saved as DRAFT, with no role-only automatic approval. Duplicate codes return 409. Migration 580 stores the client-review requirement; client approval timestamp remains null because no client sign-off integration is implemented.

The existing governance form collects both scope fields with design-system Textarea controls and explicitly says Save Draft. Both focused suites pass 59 cases: 52 ordinary checks and 7 explicit expected failures. Coverage includes draft create/list, numeric impacts, duplicate/missing-field rejection and absence of fabricated approvals, alongside the existing project/tenant isolation suite. Chrome saved and rendered a DRAFT using the actual component and disposable-tenant API/database, with no page errors; all four governance section reads returned successfully. Temporary fixtures and tenant data were removed. This is component-level acceptance, not full-shell acceptance.

Draft editing, named approver selection/submission, client sign-off, terminal-state/duplicate-workflow integrity, procurement/resources and full Project OS acceptance remain pending. No full API-suite pass is claimed.

Final sixth-slice verification: root npm run typecheck passed for API/web, trigger registry, 19 design-system checks and encoding. Whitespace checks passed.

### CORE-01 seventh implementation slice — draft editing and named submission

Project-scoped draft PATCH preserves optional values and rejects editing after submission. Owner/admin submission accepts an ordered list of distinct named reviewers (1–10), validates tenant and existing project edit access, creates canonical sequential steps and moves the request to UNDER_REVIEW transactionally. Eligible reviewers exclude viewers even when their account has an administrator role, and exclude customer accounts. Target-row locking rejects duplicate/concurrent workflows and terminal-state resubmission; completion rejects a target that is no longer under review. Role-only authority and external client sign-off are not fabricated. Client review requirements remain recorded separately from internal approval.

The existing governance screen supports editing and inline review configuration with design-system controls, searchable reviewer selection and real person avatars. No new wizard/modal workflow was introduced for configuration. Focused tests pass 60 cases: 53 ordinary checks, 7 explicit expected failures. Chrome verified actual API/database edit, configuration, submission and final approval; full-shell acceptance remains unverified. Final root typecheck passed for API/web, trigger registry, 19 design-system checks and encoding; whitespace checks passed. No migration was required.

### Industry project catalogue requested by user

`apps/api/src/scripts/seed-industry-projects.mts` prepares clearly marked sample projects for all 16 supported industries. Each includes realistic scope/objective/acceptance/dependency/stakeholder descriptions, planning dates/budget/location, project and task tags, three phases, three work packages, three deliverables, three milestones, six tasks, one risk and one change-request draft. Planning values do not imply contracts, expenditure or completed work. Existing samples are skipped without overwriting data. Project list responses now expose industry/planning fields and project tags; cards render those tags.

Disposable-tenant verification created 16 projects, 48 phases, 48 work packages, 48 deliverables and 96 tasks; a second run created no duplicates. No user workspace was populated yet: browser/session connectors failed and the destination workspace has been requested from the user. Run the seed only after that workspace and an existing administrator owner are identified. The remaining procurement/resource/industry-record API contracts, client sign-off and full-shell acceptance remain pending.

User confirmed Hudumika Workspaces as the destination. All 16 industry samples were created in that tenant with its existing administrator Viden R as owner. Tenant-scoped verification confirmed 16 distinct industries with project tags, 48 phases, 48 work packages, 48 deliverables, 48 milestones, 96 tasks, 16 risks and 16 change-request drafts. Samples remain not_started with planning budgets and zero expenditure; no approval or completion was fabricated. Temporary lookup/verification scripts were removed.

### CORE-01 eighth implementation slice — purchase requisitions

Requisition create/list now use canonical req_number, total_estimated_cost, project currency, JSON items and uppercase lifecycle. Migration 581 stores justification and required date in metadata and was applied locally. Numeric estimates and lowercase statuses preserve the client response contract. Tenant/project-scoped joins load requester and package names. Supplied work packages must belong to the same project and tenant. Project-row locking serializes duplicate-code checks; concurrent requests produce one 201 and one 409. These are requisitions only; no approval, purchase commitment, invoice or expenditure integration is implied.

Procurement loads its four sections independently with Promise.allSettled. Successful requisitions remain visible when other sections fail; a design-system warning names failures and provides retry. Unavailable section counts show a dash. Focused suites pass 61 cases: 55 ordinary checks and 6 explicit expected failures. Requisition tests cover create/list persistence, array items, numeric estimate, project currency, duplicate concurrency and rejected foreign package without writes. Chrome rendered the actual procurement component with disposable-tenant API/database responses and verified rendering/retry despite real RFQ/order/receipt failures. Temporary fixtures and tenant were cleaned up. Full-shell and full API-suite acceptance remain unverified; RFQ, order, receipt, resource/allocation and industry-record contracts remain pending.


Final eighth-slice verification: root npm run typecheck passed for API/web, trigger registry, 19 design-system checks and encoding. Whitespace checks passed.


### CORE-01 ninth implementation slice — RFQ creation and comparison

RFQ create/list now use canonical submission_deadline, supplier IDs, currency and lifecycle columns. Migration 582 stores scope, issue date, authenticated issuer and recorded comparison inputs in metadata and was applied locally. Supplier names/contact details come from tenant-scoped supplier records. Linked requisitions must belong to the same project and tenant; duplicate supplier selections and invalid deadlines are rejected before writes. Project-row locking protects duplicate RFQ numbers under concurrency. Missing scores remain absent rather than implying a completed evaluation.

Procurement now includes an inline design-system RFQ form with deadline picker, optional requisition link and searchable existing supplier selection. Saving explicitly confirms that supplier invitations have not been sent. Invitation delivery, quote editing and award workflows remain pending. Focused suites pass 61 cases: 56 ordinary checks and 5 explicit expected failures. Chrome created and rendered an RFQ through the actual component/API/database with a real supplier and deadline and no page errors. Existing order/receipt failures remained visible in the section warning. Temporary fixtures and disposable tenants were cleaned up. This is component-level acceptance; full-shell and full API-suite acceptance remain unverified.

Final ninth-slice verification: API typecheck passed in the root run. Web typecheck initially caught a concurrent ProjectsApp state/prop union mismatch; the state now derives from the existing prop type, preserving the other changes. Rerun web typecheck, 94 trigger checks, 19 design-system checks and encoding passed. Owned-file whitespace checks passed.

### CORE-01 tenth implementation slice — purchase-order drafts and contract examples

Purchase-order create/list now use canonical supplier_id, delivery_due_date, issued_at, JSON items and uppercase lifecycle columns. Migration 583 stores requisition linkage, issue date, authenticated creator and commercial terms in metadata. Suppliers and related requisitions/RFQs are validated within the tenant/project; RFQ suppliers must belong to that RFQ and contradictory requisition links are rejected. Project-row locking guards duplicate codes under concurrency. Currency defaults to the project; order amounts render in their own currency. Orders are saved as DRAFT without fabricating approval, issuance, supplier award or expenditure. The UI labels draft value rather than committed cost.

Migration 584 adds an explicit contract draft lifecycle without changing existing records/defaults. The existing Contracts & Tenders list/detail show Draft for unsigned draft records. Contract body editing uses the design-system Textarea. The idempotent seed-project-contract-examples.mts creates three full fictional examples linked to the existing construction, IT/software and professional-services sample projects. Each has specific scope/exclusions, deliverables, dated milestones whose amounts reconcile to total price, payment/acceptance terms, sector-specific remedies, and general clauses for changes, confidentiality, data, IP, liability, termination, disputes and unsigned execution. Legal identities, governing law/forum and insurance require completion before operational signature; no identity, signing or enforceability is fabricated.

The three drafts were created and tenant-scoped verified in Hudumika Workspaces: construction TZS 850,000,000, software TZS 160,000,000 and advisory TZS 75,000,000; each has over 11,000 content characters, a real matching sample-project link, status draft and no signature envelope. A second seed run creates no duplicates and overwrites nothing. Chrome opened all three through the actual list/detail components and API/database, checked content in light/dark mode and rendered a real draft purchase order. This is component-level acceptance, not full-shell acceptance. Disposable contract rows are explicitly removed before fixture tenant cleanup because customer foreign keys restrict deletion.

Focused suites pass 62 cases: 58 ordinary checks and 4 explicit expected failures. Tests cover saved PO commercial terms/items/currency, supplier and linked-ID scoping, required supplier, duplicate concurrency, deadline rejection, contract idempotence/content/lifecycle and foreign-tenant contract reads. Goods receipts, resources, allocations and industry-record mappings remain expected failures. Supplier invitations, bid editing/awards, PO approval/issuance and complete financial/signing journeys remain pending.

Final UI follow-through: the existing PO entry form now selects a real supplier ID and saves an explicitly labelled draft using inline design-system Card/Input/Combobox/DatePicker/Textarea controls. Chrome verified the complete select/fill/save/list path through actual API/database responses. A residual goods-receipt supplier-name lookup was moved to a tenant-scoped supplier join after typechecking exposed its dependency on the corrected PO interface; receipt schema repair remains pending. The full smoke suite passed again after explicit project-fixture cleanup (39 cases), and final contract/PO assertions passed independently (2 cases; 37 intentionally excluded by test-name filter).

Final tenth-slice checks: root npm run typecheck passed for API/web, the 94 trigger registry entries, 19 design-system checks and encoding. Owned-file whitespace checks passed. Temporary browser/verification scripts and logs were removed; known disposable sample-contract project fixtures were explicitly cleaned up.

### CORE-01 eleventh implementation slice — goods receipts (2026-10-11)

Receipt create/list now use canonical purchase_order_id, inspector_id, received_items, inspection_status, notes and received_at columns. Migration 585 stores physical receipt date and carrier-note reference without replacing the canonical recording timestamp. The authenticated user is the inspector; all order/supplier/inspector joins are tenant-scoped and order links are project-scoped. Receipts require an issued or partially delivered order, positive item quantities and units; future physical receipt dates and duplicate codes are rejected. Project/order locks prevent duplicate concurrent receipt creation.

Pending inspection is the default. Explicit accepted, rejected and concession outcomes map to the real database lifecycle. Recording evidence does not automatically mark an order delivered, increase accepted/delivered counts, post inventory or create expenditure: quantity reconciliation and these integrations remain pending. The inline design-system form collects a receipt number, eligible order, one item/quantity/unit, carrier reference, inspection status and notes. Lists display saved quantities and avoid inventing a carrier when none is recorded. API supports up to 100 item lines; multi-line form editing remains pending.

Both focused suites pass 62 cases: 59 ordinary checks and 3 explicit expected failures (resources, allocations and industry records). Receipt coverage includes create/list persistence, inspector identity, quantities, all inspection outcomes, foreign links, draft-order rejection, empty items, duplicate concurrency and unchanged order status. Chrome saved and rendered a pending receipt using the actual component/API/database; all four procurement section reads returned 200 with no page errors. Disposable fixtures were removed. Full-shell/full-suite acceptance and PO issuance/quantity reconciliation remain unverified.

Final eleventh-slice verification: root npm run typecheck passed for API/web, 94 trigger registry entries, 19 design-system checks and encoding. Owned-file whitespace checks passed. Temporary browser fixtures and verification logs were removed.

### CORE-01 twelfth implementation slice — resources and allocations (2026-10-11)

Resource registration/list now use canonical model_or_specs, cost_rate/rate_unit, uppercase lifecycle and required unique code. Migration 586 preserves both independently entered hourly/daily rates and optional resource details in metadata, along with allocation planning details. Missing codes receive unique generated identifiers; duplicate concurrent codes return one 201 and one 409. Referenced personnel must belong to the tenant. Responses retain the existing client field names and normalize numeric rates.

Allocation create/list now use allocation_pct and the real allocation lifecycle. Dates are validated; resource, work-package and operator IDs are checked within tenant/project boundaries. Resource-row locking serializes capacity checks across all projects for that tenant/resource. Inclusive-window peak capacity is checked at each booking start; disjoint bookings are not incorrectly summed together. Maintenance/decommissioned resources cannot be allocated. Planning hours stay separate from actual hours and allocated cost; no financial posting, telemetry or live availability update is fabricated. Resource global status is unchanged by dated bookings. Release/edit workflows, actual usage and live availability reconciliation remain pending.

The existing resource/allocation forms are inline design-system cards using Input, Select, Combobox and DatePicker. Rates render in each resource's currency, loading errors expose retry, and absent specifications/code no longer show invented values. Chrome verified real component/API/database registration and dated allocation in light/dark mode with no page errors. This is component-level acceptance; full-shell acceptance remains unverified. Disposable browser fixtures were cleaned up.

Focused suites pass 62 cases: 61 ordinary checks and one explicit expected failure (industry records). Allocation checks include persistence, foreign links, date ordering, concurrent capacity conflicts and unchanged global resource status. A targeted allocation rerun passed the additional maintenance/disjoint-booking assertions (one passed, 38 intentionally excluded). Repository documentation drift: AGENTS.md describes localStorage bearer auth in apiFetch, but the current helper uses same-origin cookie sessions. Existing helper behavior was preserved; the isolated browser harness supplies a real test JWT at the API bridge.

Final twelfth-slice verification: root npm run typecheck passed for API/web, 94 trigger entries, 19 design-system checks and encoding. Owned-file whitespace checks passed. Temporary browser fixtures and verification logs were removed.

### Projects workspace UI and functional follow-through — 2026-10-11

Replaced placeholder project surfaces with tenant-scoped API data, added dedicated create/edit routes, corrected currency and zero-actual financial displays, and added loading/error/retry states across the directory, dashboard and workspace pages. Project search includes reference, industry and tags. Navigation now persists the selected page in the URL. Industry records preserve editable structured data; resources support asset edits and allocation release with retained history. Risk mitigation edits and issue resolution use the existing lifecycle endpoints. Approval inbox fields now match the canonical API and decisions carry comments.

Demo organization contains one currency-specific portfolio with sixteen industry programs linked to the industry examples; the organization seed is idempotent. Existing contract examples remain unsigned drafts. Browser checks verified project metadata edits, industry record edits, assigned task details, fleet edits, portfolio drill-through, risk mitigation saving and configured submission of the zero-impact example baseline change. The resulting approval is pending in the current user's queue; no contract was signed and no financial commitment was executed.

The workspace header removes the duplicated back-navigation row, bounds the project switcher, aligns status controls and Options, and places More within the wrapping tab navigation. Browser measurements at 838px and 1440px show no document-level horizontal overflow. Light and dark evidence is saved beside this plan. Root typecheck, trigger registry, design-system and encoding checks passed; subsequent web typecheck passed after the header changes. Both Project OS integration suites passed all 65 tests without expected failures or skips.

Remaining acceptance work: actual file upload/download round-trip; issue create/resolve browser journey; all legacy discussion, timesheet, ticket and billing actions; portfolio/program and WBS metadata editing. Procurement still needs supplier invitation delivery, quote editing/award, controlled PO issuance and receipt quantity reconciliation. Actual resource usage and finance postings remain separate integration work. These are tracked gaps, so the entire Projects app is not yet claimed production-complete.
