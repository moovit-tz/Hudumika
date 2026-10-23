# Claude Code implementation prompt — Hudumika manufacturing production release

Work in D:\Apps\Hudumika. Implement the adopted architectural direction below. This is a request to build, repair, configure, test and document the result—not produce another review or stop after a plan. Work persistently through implementation and verification. Reuse existing code and inspect current repository state because other sessions may have changed it.

## Objective and release scope
Deliver a production release candidate for the chocolate manufacturing lifecycle, backed by existing FinOps, Party, Inventory, procurement, logistics, Cloud and identity foundations. Fix discovered defects in the affected journeys and shared services. Make backend, frontend, migrations, permissions, configuration, operational guidance and verification evidence complete for that scope.

The target is all defined release gates passing, not an unsupported “100% production ready” statement. Passing local tests does not establish real provider acceptance, physical hardware behaviour, disaster recovery, compliance or operator/accountant sign-off. Complete everything possible with the available environment, clearly record any remaining gate and its exact owner/action, and never invent evidence. Do not expand this into implementation of every industry or a full ecommerce platform. Commerce contracts are an explicitly scoped design deliverable; manufacturing is the implementation priority.

## Governing instructions and existing decisions
Read repository AGENTS.md and CLAUDE.md before queries or UI changes. Read:
- docs/architecture/ADR_MULTI_INDUSTRY_FOUNDATIONS_2026-10-23.md
- docs/architecture/PROPOSED_MULTI_INDUSTRY_PLATFORM_2026-10-23.md, including its verified corrections
- docs/architecture/canonical-parties-and-files.md
Treat the ADR's “proposed” status as historical context: this prompt adopts its modular-monolith/manufacturing-first direction, subject to these explicit implementation constraints. Do not interpret an audit recommendation as a reason to stop fixing a verified problem.

Keep the existing npm workspaces, Fastify/Kysely/Postgres and React stack. Use packages/types for shared interfaces, apps/web/src/components/ui for live UI components, apiFetch for requests and existing test infrastructure. Do not introduce competing frameworks, stock engines, customer directories or event buses. Keep all existing features working.

Capture git status at entry. Preserve changes from other sessions; do not reset/delete/revert unfamiliar files or stage broadly. No commit/push/deployment is requested. Never print secrets or dump production PII. Use disposable local test tenants. Do not perform live payments, send customer communications, alter external production configuration, weaken security or mutate production data. Prepare required production changes and commands for review; execute safe local/test work autonomously.

## Working approach: evidence and fixes together
Perform a bounded initial inspection while beginning work. Confirm deployed local migrations/trigger definitions, inspect existing services and reproduce relevant failures. Produce a concise current/target ownership map and acceptance checklist, then implement vertical slices. Do not spend repeated rounds debating already established architecture. Recheck actual deployed state rather than assuming a migration file has run. Select unused migration numbers from the current checkout; never edit applied migrations.

Inspect at least the current equivalents of:
- migrations 504/505/506/507/508 and party.service.ts, contacts.service.ts, parties/customers/suppliers routes
- finance-production.service.ts, finance-industry-work.routes.ts, finance-stock-allocation.service.ts
- inventory.service.ts and inventory catalog/stock/count/task routes
- gl.service.ts, finance-work-accounting.service.ts, purchase-orders/bills/POS routes
- finance-industry-work.test.ts and current finance integrity tests
- FinanceIndustries.tsx, FinOpsShell.tsx, relevant Inventory/Tracking/Projects shells
- domain-events.service.ts, accounting-outbox.service.ts and Studio/communications workers
Names describe existing inspection starting points, not authority to fabricate missing integrations.

## Workstream A — repair Party channel consistency
The inspected customer/supplier update triggers omit email/phone changes and their update branches do not refresh party_channels. Reproduce current create/edit/clear/import behaviour and fix the actual current implementation.

Define which primary email/phone/WhatsApp channels are managed projections of legacy customer/supplier fields, and how separately managed channels remain independent. Add provenance/mapping if needed after checking existing patterns. Handle insert, update, clear, whitespace/case normalization, repeated values, legacy-null party references, merge tombstones and same-organisation links. A new-value upsert alone is insufficient: it must not leave the replaced managed address active. Deleting/clearing a legacy field must not delete unrelated channels. Do not auto-merge organisations by name or financially net customer and supplier balances.

Preserve channel context, visibility, primary-selection rules, tenant isolation and audit evidence. Avoid recursive dual-write loops. Extend existing database enforcement when it covers all writers safely; do not create conflicting service and trigger authorities. Update Kysely/shared types as necessary.

Build a read-only mismatch/reconciliation report during implementation. Repair unambiguous mappings with a new forward-only, rerunnable reconciliation mechanism and record affected counts. Preserve ambiguous conflicts for explicit resolution rather than silently overwriting independently maintained channels. Do not send messages during repair.

Keep compatible existing reads initially. Where migrating reads, use a permission-aware resolver; fallback must never bypass canonical visibility denial. Preserve immutable historical invoice/contract snapshots. Add tests for create/update/clear/import, idempotent repair, independent channels, phone_wa mapping, visibility, cross-tenant IDs and linked customer/supplier records.

## Workstream B — atomicity, stock boundaries and retry integrity
Audit GL posting/reversal call sites involved in purchasing, inventory, production, dispatch, sales and refunds. GLService accepts an optional transaction: prove each invariant's source state, stock movements and internal journals share a transaction. External provider calls must not run inside a long-lived DB transaction; use existing durable delivery/reconciliation mechanisms.

Test deliberate failures after intermediate writes and confirm complete rollback. Test duplicate/retried/concurrent release, completion, receipt, dispatch, payment and reversal operations. Use row/advisory locks and stable operation identities following existing patterns. Check deadlock ordering and unique constraints. Do not claim safety from keyword counts.

Preserve commercial stock, SEAL customs evidence and fleet parts during the pilot. Define physical custody, ownership, customs status, reservations and financial value separately. Do not force ledger mergers or represent a status-only customs release as a physical movement. Where actual cross-domain transfers are needed, define shared correlation ID, item/UOM mappings, atomic or durable paired processing, reconciliation and compensating reversal. Prevent double-counted stock/value. Document any relevant integration not yet implemented; do not fake it.

## Workstream C — complete chocolate manufacturing lifecycle
Expand existing recipes, production orders, materials and stock allocations through domain services. Manufacturing owns execution; InventoryService remains the commercial stock writer; FinOps owns ledger policy. Introduce a coherent Manufacturing workspace/module using existing shells and entitlement conventions; keep existing finance production URLs functional with compatible navigation or tested redirects. Choose the least disruptive deployment; a new app does not require a separate microservice/database. Keep implementation decisions in a concise ADR amendment.

Implement linked, auditable workflows for:
1. Raw materials and packaging: suppliers, purchase orders, partial receiving, units/conversions, lots, expiry, locations and costs. Connect existing import/shipment/landed-cost flows where real integrations exist; identify unsupported boundaries accurately.
2. Recipes/BOM: immutable versions, ingredient and packaging quantities, units, planned output, effective version selected on an order and prevention of changes to released production evidence.
3. Planning/release: requirements and shortages, work centres/stage routing, basic resource scheduling, material reservation/issue and authorised release. Do not label a simple schedule as a full optimising APS engine.
4. Stage execution: applicable mixing/refining/conching/tempering/moulding/cooling/sorting/packaging stages, operator start/finish, quantities and timestamps. Make routing configurable within validated constraints rather than hardcoding all manufacturing around chocolate.
5. Actual consumption/output: partial progress where supported, excess/unused materials, consumption variances, actual good output and controlled reversals/corrections. Avoid completion consuming material twice.
6. Quality: incoming and production inspections, hold/quarantine, authorised disposition/release, rejected quantities and evidence. Held/expired/rejected stock must be blocked server-side from unauthorised allocation, sale or dispatch.
7. Waste/rework: stage, reason, quantity/UOM, recoverable versus disposal, disposition, evidence and cost treatment. Prevent output and waste double counting. Document normal/abnormal-loss and conversion-cost policy for finance-owner validation; do not fabricate statutory compliance.
8. Packaging/finished goods: packaging usage, finished SKU/variant/lot, manufacture/expiry dates, destination, quality status and usable quantity.
9. Sales/dispatch: reservations, picking/packing integration as available, partial dispatch, delivery references/evidence and return handling without duplicate stock or COGS. Preserve distinct order, payment, quality and fulfilment states.
10. Traceability/costing: ingredient lots to output lots to dispatched customers, backward/forward recall queries, material balance, WIP, finished-goods valuation, COGS and variance explanations. Block or flag downstream stock in the recall scope according to explicit permissions/state rules.

Use meaningful decimal precision and rounding consistent with existing financial and UOM conventions. Reject invalid dates, quantities and cross-tenant references. Do not silently accept negative stock, impossible states or zero-output cost division. Ensure correction paths for released/completed batches, downstream dispatch and closed accounting periods are explicit and tested.

## Workstream D — UI and access configuration
Use the Hudumika live design system, selected font, configured app colours and existing PageHeader/PageLayout conventions. New multi-step forms are dedicated routes, not overlay wizards. Update navigation, entitlements/capability maturity and role gates coherently on server and client. Do not expose a feature just because a frontend menu is hidden.

Provide operator, warehouse, quality and finance journeys using existing identity/role policy mechanisms. Define who can release production, approve quality, dispose waste, reverse postings and change configuration. Implement appropriately scoped permissions without granting broad finance/admin access merely to operate a workstation.

Use compact metrics, shared search/filter rows, accessible sorting and pagination, explicit loading/error/empty/retry states, keyboard operability and responsive layouts at desktop/tablet/390px/320px. Long tables may scroll within their container; the page itself must not overflow. Use actual photos/pickers and shared Cloud evidence links with original file permissions. Validate all existing POS, invoice, product, supplier and industry journeys affected by shared changes.

## Workstream E — security and production configuration
Implement and verify appropriate protections in the affected scope:
- Explicit tenant filters and withTenant; enabled/forced RLS and restricted application DB role; scoped foreign-reference checks including batch, item, location, file, customer and source-document IDs.
- Server authentication, role/resource permissions, separation of duties and entitlement checks; revoked/expired sessions and customer-portal isolation.
- Runtime validation, payload limits, output encoding, uploads/attachment permission checks, safe exports and existing CSRF/CORS/rate-limit/SSRF conventions as applicable.
- No client-controlled posting amounts, trusted tenant IDs or bypassable status transitions; protect secrets and redact sensitive logs.
- Permission-filtered search, traceability and reporting; a known UUID must not grant access.
- Tested migrations/backfill, indexes justified by measured queries, safe pagination and bounded report workload.
- Environment validation/configuration documentation, existing worker lease/retry behaviour, failure dashboards/alerts and correlation IDs. Keep separate outboxes with domain-appropriate handling.
- Backup/restore and rollback/recovery runbooks. Perform an isolated restore/recovery drill only where the environment safely supports it; otherwise leave the exact gate open with runnable instructions.
- Dependency/security scanning using existing tooling; investigate findings, record applicability and fixes. Do not blindly force dependency upgrades or claim a scan is a penetration test.

Do not weaken production controls to get tests passing. Do not fabricate provider clients, regulatory approvals, hardware support or successful staging exercises.

## Workstream F — verification and release gates
Write regression tests reproducing the actual defects before fixing where practical. Use the existing API integration framework, local disposable tenants and frontend tooling; no competing framework installation. Tests must assert stock, state, journal and permission outcomes, not only HTTP success.

Required scenarios include two-tenant isolation, per-role allowed/denied browser/API journeys, create/edit/clear channel propagation, partial goods receipt, UOM conversion, shortages/reservations, duplicate/concurrent production transitions, partial production, material/good-output/waste balance, quarantine and expiry blocks, rework, packaging usage, output receipt, dispatch/return, cost reconciliation, reversal/period restrictions, transaction fault injection and retry recovery. Cover recipe version immutability and traceability from ingredient to customer.

Run npm run typecheck after TS changes and at completion; run appropriate focused tests, then affected API/frontend suites and npm run build. Use npm run lint and the repository's design-system/encoding/trigger/security checks as applicable. Report actual exit codes, passed/failed/skipped counts and distinguish pre-existing failures from introduced ones. Do not skip, delete, weaken or rewrite tests solely to turn the report green. Fix affected regressions; isolate unrelated baseline defects with evidence.

Perform actual browser verification of the implemented journeys and role restrictions, including mobile views and console/network errors. Save screenshots. Measure representative workflow/report latency and concurrent stock behaviour against documented pilot volume assumptions. If production volumes/SLOs are unknown, record provisional test assumptions and seek owner acceptance rather than inventing a capacity guarantee.

Release gates:
- All defined critical lifecycle, tenant isolation, authorisation and transactional integrity tests pass with no relevant skipped coverage.
- Typecheck/build and applicable repository checks pass; failures have explicit, reviewed disposition.
- Pilot material balance, batch genealogy, WIP/finished-goods/COGS reconciliation and reversal evidence are complete.
- Migration rehearsal, configuration, monitoring, recovery and security findings have evidence and owners.
- Operator/accountant acceptance and real provider/operational gates are explicitly passed or visibly outstanding. Never label an open critical gate as ready.

## Concrete outputs
Maintain a task checklist and concise progress updates. Produce implementation and relevant regression tests, new migrations/shared types, responsive UI, permission/config changes and safe local seed/demo data. Also produce:
- A current/target ownership and reader/writer map.
- Channel mismatch/reconciliation evidence, including unresolved conflicts.
- A GL/stock atomicity and idempotency coverage matrix.
- Pilot operator/admin guide and technical deployment/recovery runbook.
- A Commerce contract draft reusing validated item/price/order/payment/reservation/fulfilment boundaries; no fabricated ecommerce completion.
- A dated release evidence report showing commit/worktree state, environment, commands, actual results, screenshots, security findings, capacity assumptions, acceptance status and remaining gates. Preserve previous reports; do not overwrite history with a green summary.

Start implementation now. Resolve routine reversible choices using repository patterns. Ask only for genuinely missing domain policy, external access or consequential production actions; continue independent work while those answers are pending. At completion state exactly what was built, tested and configured, and whether the result is a local release candidate, staging-validated release or production-approved release. No “100%” claim without complete evidence for the explicitly defined scope.
