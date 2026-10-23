# Claude Code implementation prompt — Hudumika all-industry production programme

Work in D:\Apps\Hudumika. Implement the adopted architectural direction below. This is a request to build, repair, configure, test and document the result—not produce another review or stop after a plan. Work persistently through implementation and verification. Reuse existing code and inspect current repository state because other sessions may have changed it.

## Objective and release scope
Implement, repair, integrate, secure, configure and validate Hudumika for advanced operations across ALL industries in the mandatory coverage matrix below, including merchant ecommerce. Manufacturing is an early implementation slice, not the final scope. Do not stop after the chocolate pilot, a foundation audit, a design document, an industry dropdown, generic CRUD, or a local green test run.

The deliverable is a production-approved release for an explicit versioned acceptance contract covering every listed industry. “100% green” means 100% of that contract's mandatory gates passed with verifiable evidence and required human/domain acceptance, not a guarantee that software has no possible defects. Never silently narrow the industry list, supported jurisdictions, operational volumes, deployment targets or workflows to obtain green status.

At programme start publish the full scope and acceptance matrix. Validate jurisdiction, hosting, provider, hardware, volume, recovery and specialist-domain assumptions with the owner while continuing independent implementation. Mark assumptions provisional until accepted. Distinguish required integrations from optional ones; an owner must approve any later scope change. If essential external evidence or policy is missing, prepare the implementation and executable validation, keep the affected gate blocked, and continue other work. Do not equate absent evidence with a pass or lower a requirement to turn it green.

Use manufacturing first to prove shared contracts, then CONTINUE through every other industry and final release gates. This is a sustained implementation programme, not a promise of completion in one session. Keep durable progress, test evidence and a next-action ledger so work survives context/session limits. Do not mark the programme complete while any mandatory industry is incomplete.

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

## Mandatory all-industry coverage matrix
Create a tracked row for each industry below with business requirements, domain owner, implemented routes/UI/services, permission matrix, migration state, integration status, automated tests, browser journeys, security/privacy evidence, operational tests and domain acceptance. Each row must cover normal operations plus amendments, partial outcomes, cancellations, duplicate requests, reversals, exceptions and recovery.

Industry names are product scope; do not assume every category requires an independent app. Publish domain ownership and app mapping first, reuse shared capabilities and add industry workspaces/pack extensions where their workflows differ. All rows remain mandatory even if implemented in a common app.

1. Retail: products/variants/barcodes, store/register/shift scope, channel pricing/promotions, POS, split payments, cash handling, inventory, receipts, returns/refunds, stock/COGS and settlement reconciliation. Verify required peripherals against declared hardware scope; no fake printer/scanner/scale/drawer support.
2. Wholesale/distribution: enquiries/quotes, trade accounts, credit controls, bulk/UOM pricing, sales orders, procurement, reservations, partial pick/dispatch, backorders, delivery, returns and collections.
3. Ecommerce/omnichannel: public storefront, catalog variants/media, customer/guest flows according to approved scope, search, pricing/tax/shipping, promotions, carts, durable orders, checkout, payment authorisation/capture/refund rules, authenticated provider callbacks, duplicate/reordered callback handling, stock contention with POS, fulfilment, customer portal, delivery status, cancellations, returns/refunds and settlement reconciliation. Include B2B account pricing/credit and subscription products where applicable. Keep the add-on Store distinct from merchant commerce. Secure public and customer APIs separately from staff APIs. Complete required payment sandbox and production onboarding gates without sending real money without authorisation.
4. Manufacturing: the full Workstream C lifecycle, including planning, stage execution, actual consumption, traceability, quality, waste/rework, packaging and costing; support declared discrete/process production needs through validated domain design rather than relabelled chocolate forms.
5. Food/beverage/chocolate manufacturing: ingredient/packaging lots, recipe scaling/versioning, shelf life, incoming/process/finished checks, quarantine, allergens and sanitation evidence appropriate to accepted scope, yield, normal/abnormal losses, recall and customer traceability. Obtain specialist policy and acceptance; do not invent compliance certification.
6. Printing: estimation, artwork/evidence versions and approval, substrates/consumables, setup, machine routing/scheduling, job execution, spoilage/reprints, finishing, dispatch and actual job profitability.
7. Warehouse/3PL/bonded operations: owner/custody distinction, receiving, locations/bins, putaway, lots/serials/expiry, directed pick/pack, counts, replenishment, handling units, transfers, reservations, traceability, storage/service billing, SEAL customs boundaries and reconciliation. Never count third-party goods as owned assets by default.
8. Professional services: engagements, contracts, rate cards, resources, approved time/expenses, retainers, milestones, billing, collections and actual project profitability.
9. Consulting: proposals/SOWs, engagement changes, staffing, deliverables/approval, time/expenses, retainer/fixed/time-material billing and profitability.
10. Construction/engineering: tender/estimate/BOQ workflows within accepted scope, contracts, budgets, procurement, site materials, labour/equipment, subcontractors, measurements, progress certificates, variations, retention, advances, milestones, defects and financial reconciliation.
11. Property/rentals: properties/units and rentable assets as appropriate, availability, leases, occupancy, recurring charges, escalation rules, deposits, renewals, arrears, maintenance, move-in/out and owner/tenant statements. Separate deposits/liabilities from income.
12. Automotive/workshop/field service: customer asset/vehicle history, appointments, inspections, estimates/approval, job cards, technicians, parts reservation/consumption, warranty/rework, service delivery and billing.
13. Hospitality/accommodation: property/room inventory, rates, reservations, deposits, check-in/out, folios, housekeeping, maintenance, cancellation/no-show and reconciliation. Business Travel alone is not a hotel operations module.
14. Restaurants/food service: menus/modifiers, tables/tabs, kitchen orders, production/ingredient usage, POS, discounts/tips/service-charge policies, wastage, food quality evidence, shifts and settlement. Reuse hospitality/retail services without conflating their lifecycles.
15. Agriculture/livestock: farm/site/field/herd identity, seasons/cycles, inputs, treatments/tasks, equipment, harvest/output or livestock events, yield, storage, sales and cycle profitability; record applicable traceability and approvals.
16. Education: applicants/students/guardians, admissions/enrolment, programmes/classes, timetables, attendance, assessments, fee schedules, scholarships/deposits/refunds and statements. Implement sensitive/minor-data permissions and specialist acceptance for supported institution types.
17. Healthcare: patient/encounter identity, appointments, clinical documentation/orders/results as scoped, care/resource workflows, stock/dispensing links, billing/claims as required, consent, access audit and sensitive-data restrictions. Obtain qualified clinical/privacy acceptance and jurisdiction-specific release evidence; finance features do not establish clinical readiness.
18. Pharmaceuticals: explicitly cover both distribution/dispensing and pharmaceutical manufacturing where included in owner-approved scope. Lots/serials, expiry/FEFO, storage conditions, quality release, controlled stock workflows where applicable, recalls, recipe/production evidence and specialist acceptance. Do not claim validated regulatory compliance based solely on automated software tests.
19. Mining/extraction: sites, extraction/production quantities, material grades/assay evidence as scoped, stockpiles, movements, weighbridge integration where required, processing/recovery/yield, equipment, safety/compliance evidence, dispatch and costing.
20. Energy/utilities: infrastructure/assets, service/customer accounts, meters/readings or production measures, tariff/rating versions, usage billing, collections/arrears, maintenance and reconciliation for the supported service models. Do not fabricate meter/SCADA integrations.
21. Telecom/subscriptions: service/catalog/contracts, activation/provisioning integration where real, usage/recurring rating, proration/plan changes, invoicing, suspension/termination/refunds and reconciliation. Implement declared scale and audit requirements.
22. Insurance: products/policies, quotations/underwriting decisions and authority, premiums, endorsements, renewals/cancellations, claims/reserves/settlements, commissions, reporting and specialist regulatory/actuarial acceptance for supported products. Do not automate regulated decisions without approved policy and human authority.
23. Lending: applications and approved decision workflow, agreements, disbursement, schedule/interest/fee calculation, accruals, repayments/allocation, arrears, restructuring/write-offs, statements and reconciliation; require specialist financial/legal/domain acceptance. Do not execute real disbursements without explicit transaction authorisation.
24. Logistics/import/export: CRM quote/booking, procurement/import references, customs/clearance, bonded custody, freight jobs, loads/fleet, cargo loading, dispatch, tracking, proof of delivery, demurrage/costing, returns and customer billing. Existing ClearOS/SEAL/HuduFreight/CargoTracker must participate through explicit contracts.

For each regulated/specialist industry, declare supported jurisdictions/products/workflows and obtain qualified acceptance. Research authoritative current requirements when implementing jurisdiction-specific controls; document sources and do not invent legal mandates. Scope cannot be reduced unilaterally because an industry is difficult.

## Existing app integration programme — mandatory
Review every existing workspace/app and include it in the release matrix. Reuse and improve FinOps, CRM/Contacts, Projects, HuduFreight/Tracking, CargoTracker, SEAL, ClearOS, NexusHR, ComplyOS, Bliss, Cloud, eSign, CMS, Onsite, Studio, HuduBI, Ondi/Admin/Workspace, Developer/Store, Petti, Travel, Email/SMS/Calendar/Tasks/Notes and internal Lens according to their established ownership. Do not blindly rename internal or unrelated apps as industry products. Audit overlap before adding a parallel module.

Required changes across affected apps: canonical references, consistent server authorisation/entitlements, transactional/event contracts, navigation/deep links, shared documents, audit history, operational reconciliation, supported locale/currency/timezone behaviour, accessibility and responsive UI, error recovery and regression tests. Verify unaffected apps retain their existing critical journeys. New workspaces require full route/shell/navigation/branding/permission/onboarding/configuration wiring and must use the live design system.

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
- Industry operator/admin guides and technical deployment/recovery runbook.
- A fully implemented and accepted Commerce workspace, storefront/customer portal and order/payment/fulfilment/return lifecycle, with versioned API contracts and real sandbox/provider verification where required.
- A dated release evidence report showing commit/worktree state, environment, commands, actual results, screenshots, security findings, capacity assumptions, acceptance status and remaining gates. Preserve previous reports; do not overwrite history with a green summary.

Start implementation now. Resolve routine reversible choices using repository patterns. Ask only for genuinely missing domain policy, external access or consequential production actions; continue independent work while those answers are pending. At completion state exactly what was built, tested and configured, and whether the result is a local release candidate, staging-validated release or production-approved release. No “100%” claim without complete evidence for the explicitly defined scope.


## Final programme execution and green-light decision
Workstreams A–F are foundational and manufacturing detail, NOT the end of this assignment. Continue through the entire mandatory industry and existing-app matrices, adding equivalent domain-specific implementation, security controls, integration/browser tests and operations evidence for each. Maintain complete end-to-end coverage rather than merely counting test cases or lines of code.

Create a versioned RELEASE_ACCEPTANCE_MATRIX and release evidence report. Each mandatory row must be one of NOT_STARTED, IMPLEMENTING, FAILED, BLOCKED or PASSED. Only PASSED counts toward completion; NOT_APPLICABLE requires explicit owner-approved rationale and cannot conceal a mandatory industry. Tests must use the actual release candidate, migrations and runtime configuration. Record exact tested revision and dirty-tree state; subsequent changes invalidate affected evidence until rerun.

The single overall production green light is permitted ONLY when:
1. Every mandatory industry and shared-app acceptance row is PASSED for the declared scope, countries, integrations and volume.
2. All critical business invariants, tenant/resource isolation, role journeys, posting/stock/payment safety and exception/recovery scenarios pass with no skipped mandatory coverage.
3. Build/typecheck/applicable lint/design/security checks pass, with no undispositioned release-blocking finding. Risk exceptions must be explicit owner decisions and cannot erase mandatory failures or be invented by the agent.
4. Real staging deployments, migration rehearsals, backup restoration, recovery/rollback, monitoring/alert routing, worker failure/retry/reconciliation and declared load tests pass against accepted targets.
5. Required external provider/hardware integrations have genuine environment-appropriate evidence; sandbox success alone does not prove production configuration.
6. Qualified industry operators, finance/accounting reviewers and required specialist/security/compliance owners approve the relevant evidence. Claude must not impersonate their approval.
7. Production configuration and deployment artefacts are reviewed; any production deployment or consequential external action receives the required explicit authorisation. Version-specific release approval does not grant permission to transact real funds.

If ALL gates pass, issue: “GREEN — production-approved for the complete declared all-industry release scope,” followed by the version, matrix, environments, approved capacity/recovery limits, sign-offs and evidence links. Explain that the approval is scoped to that version/configuration and is not a guarantee of zero future defects.

If ANY mandatory gate remains failed, untested, skipped or blocked, issue: “RED — not yet production-approved for the complete all-industry scope.” List exact remaining items, evidence, owners, next executable actions and which completed industries are independently validated. Continue all authorised work that can advance completion; do not stop simply because external sign-off is pending. Do not change status to green based on effort, elapsed time, partial completion or the desire to satisfy this prompt.
