# Hudumika: industry completion review and build backlog

Date: 8 November 2026. Scope: all 29 registered industries and their shared dependencies.

## Evidence and interpretation

This is a build-planning review, not production certification. “Implemented” means identified code/services; it does not establish complete browser, integration, country or production readiness. “Build/connect/verify” identifies a required workflow that the audit did not establish end to end. Search for existing functionality before implementing it: absence from the inspected path is not proof of absence everywhere.

The preceding audit ran 128 API integration tests: 107 passed, 21 failed. The 79 industry/catalog/manufacturing/workflow tests and 28 POS tests passed. Fifteen SEAL and six ClearOS tests failed with `PLAN_UPGRADE_REQUIRED` before their intended business assertions. These are the preceding audit's results, not a fresh rerun of subsequent working-tree changes. The entitlement failures are verification blockers, not proof that every underlying warehouse/customs operation is broken.

Priorities: **P0** release blocker; **P1** everyday operational baseline; **P2** extended functionality requiring explicit scope. External dependencies need actual documentation, credentials, hardware or domain decisions. Never invent integrations or compliance claims.

## Shared backlog: implement once

### S01. Ownership and financial integration — P0

Commerce owns orders/checkout/fulfillment. Inventory owns stock and costing. CRM owns customers. Specialist modules own specialist operational records. FinOps owns financial ledgers, receivables/payables, reconciliation, periods and financial reporting. Resolve tax/payment ownership from the actual repository.

- Map each existing owner and API/event contract; avoid competing catalogs, stock writers or financial balances.
- Durable source identifiers, idempotency, transactional delivery, posting retry and reconciliation.
- Distinguish orders, payments, invoices, operational receipts, fiscal receipts and settlements.
- Corrections and reversals must respect closed periods and preserve history.
- Reconcile operational subledgers to FinOps rather than allowing arbitrary specialist journals.

Acceptance: retry/replay a source operation repeatedly; stock, invoices, payments and balanced journals retain one durable effect and source drill-through.

### S02. Entitlements and truthful capability metadata — P0

- Investigate SEAL/ClearOS failures across fixtures, package features and actual subscriptions; do not weaken gates.
- Verify base plans, standalone products, add-ons, expired subscriptions and read-only access.
- Complete app/industry capability mappings. Only legal, privacy, automotive and logistics had entries in the inspected `industry_app_capabilities` data.
- Record workflow-level availability and evidence. Registry `accepted` status must not imply a finished application.
- Separate industry selection, purchased entitlement, installation, activation and configuration readiness.

Acceptance: marketed presets can be purchased, configured and operated through the intended paths; unauthorized paths fail correctly.

### S03. Ondi, organization and central control — P0/P1

- Verify signup, return sign-in, invitations, expiry, revocation and original-destination handling across apps.
- One legal entity, multiple brands/countries/regions/outlets/business points/registers/devices.
- Central policy inheritance, delegated administration, local override rules and rollout history.
- Tenant/outlet authorization on APIs, jobs, exports and realtime subscriptions.

Acceptance: one central owner operates two outlets and several business points; employees see only authorized operations and records.

### S04. Country and currency configuration — P0/P1

- Effective-dated tax, timezone/business-day cutoff, currency precision, numbering and accounting settings.
- Resolve remaining fixed currency lists and defaults using supported configuration.
- Preserve transaction-time snapshots; do not rewrite history when settings change.
- Country capability matrix distinguishing calculation/reporting from fiscalization, filing and remittance.
- External authority/provider support requires verified interfaces and credentials.

Acceptance: two configured country contexts preserve correct dates, currencies and tax snapshots and reconcile to FinOps. Unsupported external actions are unavailable clearly.

### S05. Payments and settlement — P0/P1

- Recorded CARD/MOBILE_MONEY tenders do not prove actual authorization/capture.
- Connect verified providers/terminals; validate webhooks, signatures, duplicate and out-of-order events.
- Handle timeout/uncertain/late success, partial outcomes, refunds and provider reversals.
- Clearing accounts, fees and settlement reconciliation belong in FinOps.
- No raw card data or secrets in logs, receipts or ordinary application storage.

Acceptance: timeout followed by late success produces one payment with correct cashier state and eventual settlement reconciliation.

### S06. Live operation, offline and hardware — P1

- Explicit support matrix for scanners, printers, scales, drawers, terminals and displays.
- Realtime version checks, conflict handling, reconnect catch-up and stale indicators.
- Per-capability offline policy, durable queue and restart recovery where advertised.
- Supported Ondi offline-session policy; no invented indefinite sessions.

Acceptance: competing devices cannot double-pay or silently overwrite; reconnect/retry does not duplicate tickets, stock or payments.

### S07. Reusable commercial modules — P1/P2

- Item-level returns/exchanges, original tax references and controlled stock disposition.
- Customer credit, deposits, gift cards, store credit and loyalty with explicit ledger ownership.
- Warranty coverage/claims, inspection, repair/replacement/refund and supplier recovery.
- Shared booking/resource allocation, approval, notification and document capabilities.
- Contract pricing, promotions, units and serial/batch/expiry policies.

Build these once and connect the applicable industries.

### S08. Module marketplace — P1/P2

The inspected `MarketplaceService` supports service-provider listings, enquiries and quotations. That is not evidence of a secure executable module marketplace. Audit app Store capabilities separately and reuse what fits.

- Versioned manifest, compatibility, dependencies, permissions and configuration schemas.
- Event/API/financial contracts and privacy declarations.
- Reviewed install/configure/activate/update/disable/uninstall with recovery.
- Preserve history, resolve open work and revoke access.
- Real third-party sandbox or constrained integration with limits and review; no arbitrary uploaded code or tenant-triggered unreviewed DDL.

Acceptance: a real module completes its lifecycle and loses access when revoked.

### S09. Privacy, operations and release evidence — P0/P1

- Data inventory, least privilege, retention/legal holds and sensitive-record controls.
- Rights requests that coordinate actual authorized actions across app owners, with evidence and exceptions.
- Safe backup/restore/replay, audit review, incident handling and operational runbooks.
- Job visibility/recovery, logs, monitoring and representative load evidence.

Acceptance: a privacy request or restore is traceable across apps without silently resurrecting deleted data or destroying required financial history.

## Industry completion backlog

### 01. Retail

**Baseline:** core checkout, shifts, split tenders/change, held carts, stock effects, full-sale refunds and journal retry; 28 lifecycle tests passed.

- **P0:** real payment/settlement integration and reconciliation (S01/S05).
- **P1:** item-level/partial returns, exchanges, approval limits and original tax reversals. The inspected refund request is sale-level rather than selected-line based.
- **P1:** barcode-first operation, variants, packs, fractional/weighed items and actual hardware support.
- **P1:** promotions/stacking, outlet prices, discounts and shift exceptions.
- **P1/P2:** warranties, store credit, deposits, gift cards and loyalty through shared modules.

**Acceptance:** open register → scan stock/service items → approved promotion → actual supported payment → receipt → partial return/exchange → close/reconcile stock, tax, cash and GL.

### 02. Wholesale

**Baseline:** shared quotes, purchasing, stock allocation, partial dispatch, invoices and trade-work records.

- **P1:** connect quote/customer PO/order/reservation/partial delivery/invoice/collection.
- **P1:** contract price lists, quantity breaks, pack conversion and effective dates.
- **P1:** financial credit limits, overdue holds and controlled release.
- **P1:** backorders, substitutions, shortages, proof of delivery and linked returns/credits.
- **P0 verification:** concurrent reserved/dispatched/invoiced/returned quantity integrity.
- **P2:** ordering portal and verified EDI/provider integrations.

**Acceptance:** partially deliver a credit order, return one line and collect the balance with matching reservations, stock and receivables.

### 03. Manufacturing

**Baseline:** versioned recipes/BOMs, production, materials, WIP/conversion costs, output receipt and quality/stage/waste/traceability services.

- **P0:** enforce and verify quality/stage release gates. The inspected `progressProduction` completion path does not itself check required inspection/stage records.
- **P1:** planned/actual materials, partial output, substitutions, rework and scrap.
- **P1:** work-center/capacity planning and material shortages.
- **P1:** labor/overhead capture and WIP/output/variance reconciliation.
- **P1:** complete operator/planner/quality UI and permissions.
- **P2:** subcontract production, co-products and equipment integrations.

**Acceptance:** consume BOM → stage/QC/waste → reject a held batch → approved release → one output receipt → reconciled stock/WIP/variance.

### 04. Warehousing

**Baseline:** extensive SEAL receiving, lots, transfers, counts, reservation, fulfillment, storage billing and operations code; verification blocked.

- **P0:** resolve entitlement failures and rerun all 15 tests without access bypasses.
- **P1:** browser-verify receive/putaway/reserve/pick/pack/dispatch/cancel.
- **P1:** serial/batch/expiry, stale edits/counts, concurrent allocation and stock disposition.
- **P1:** partial transfer/return behavior where advertised.
- **P1:** storage dimensions, effective tariffs, period calculation and invoice idempotency.
- **P1/P2:** scanners/labels, equipment/tasks and validated automation/sensor integration.

**Acceptance:** receive/tally cargo, move/count/reserve/dispatch and bill storage; repeated/concurrent requests do not duplicate stock or charges.

### 05. Logistics & Import/Export

**Baseline:** shipment, freight, parcels, customs and warehouse modules; customs boundary tests blocked. Inspected customs adapter uses an explicit manual submission workflow.

- **P0:** resolve six entitlement-blocked tests and label manual/external boundaries accurately.
- **P1:** quotation/booking/shipment/document/charge/delivery/customer-vendor reconciliation.
- **P1:** connect status and identity across Tuma, tracking, ClearOS, SEAL and FinOps.
- **P1:** assessment/payment/release evidence, holds, amendments and approvals.
- **P1:** short/damaged cargo, failed delivery, demurrage/storage and cost attribution.
- **External:** verified carrier/customs interfaces only; fiscal receipt support is not customs submission support.

**Acceptance:** quote/receive/record submission/assessment/payment/release/deliver and reconcile every charge with its operational evidence.

### 06. Legal Services

**Baseline:** clients, matters, court events/deadlines, time, conflicts and trust transactions.

- **P1:** approved time/disbursement/rate → invoice/credit/collection.
- **P1:** retainers, trust-to-fee transfers and client/matter balance reconciliation.
- **P1:** ethical walls, document versions and matter permissions.
- **P1:** verified jurisdiction deadline rules, changes, reminders and escalation.
- **P1:** archive/closure/legal holds and retention.
- **External/P2:** verified court filing or external diary integrations.

**Acceptance:** conflict-check, open matter, receive retainer, record/approve work, bill/apply funds, reconcile trust and close an auditable file.

### 07. Privacy & Data Protection

**Baseline:** Ngao assessments, registers, incidents, rights requests and vendors.

- **P0:** separate request tracking from actual export/delete/correct execution. Updating a response status is not proof of downstream execution.
- **P1:** identity verification, ownership, scoped execution and evidence/exception approval.
- **P1:** assessment remediation linked to data flows, vendors and processing records.
- **P1:** retention/holds, backup/restore and minimization controls.
- **P1:** incident triage, decisions, communications and response evidence.
- **External:** validated policies/requirements for actual processing; no automatic compliance claim.

**Acceptance:** complete a verified request across two apps, show retained financial exceptions and prove authorized downstream outcomes.

### 08. Food & Beverage

**Baseline:** reusable recipe/batch manufacturing, stock, quality and billing foundations.

- **P1:** validated ingredient/allergen data and operational rules rather than free-text job fields.
- **P1:** expiry/shelf-life/storage/FEFO and blocked-stock behavior as scoped.
- **P1:** sampling, quality holds and approved release connected to dispatch.
- **P1:** yield, waste, substitutions and unit conversion.
- **P1:** ingredient-to-customer recall execution.
- **External/P2:** label/sensor/inspection interfaces after requirements.

**Acceptance:** produce/hold/release/dispatch a traceable batch, then recall affected stock/customers and reconcile adjustments.

### 09. Printing

**Baseline:** print specifications, work costs, quotations and reusable production.

- **P1:** structured dimensions, substrate, colors, sides, quantity, finishing and spoilage.
- **P1:** reproducible setup/material/machine/finishing/labor estimation; snapshot accepted quotes.
- **P1:** artwork versions, proof approval and production against the approved version.
- **P1:** routed job tickets, press/finishing scheduling and partial delivery.
- **P1:** deposits, change orders, reprints/claims and actual-versus-estimated costs.
- **P2:** verified imposition/press/web-to-print integrations.

**Acceptance:** estimate → approved proof → deposit → production/waste → delivery/invoice with preserved specifications and actual costs.

### 10. Professional Services

**Baseline:** engagements, time/service/expense lines, approvals, costs and invoice linkage.

- **P1:** explicit fixed-fee, time/materials, milestone and retainer contracts.
- **P1:** staffing/rates, time approval, nonbillable work and expense evidence.
- **P1:** scope/client approvals and budget limits.
- **P1:** periodic billing and unbilled work/retainer/invoice/payment reconciliation.
- **P2:** portals, utilization and resource forecast using existing Projects/resource services.

**Acceptance:** approved time and milestones produce one correct invoice; disputed work is adjusted with matching costs/revenue.

### 11. Consulting

**Baseline:** project work, milestones, budgets, time/expenses and billing foundations.

- **P1:** reuse Professional Services and Projects rather than a second engagement engine.
- **P1:** deliverable acceptance, changes, consultant rates and subcontractor costs.
- **P1:** utilization, budget burn, forecast-to-complete and actual margin.
- **P1:** milestone/retainer billing and expense recharge approvals.
- **P2:** client packs and capacity/forecast scenarios.

**Acceptance:** mixed fixed-fee/time project with approved scope change, subcontract costs and client acceptance reconciles to source records.

### 12. Construction

**Baseline:** BOQ, measurements, certificates, retention and project costs; service tests passed.

- **P1:** approved variations to quantities/rates/contract value.
- **P1:** subcontract procurement, certification, payables and retention.
- **P1:** approved certificates linked to invoices, prior certificates and credits.
- **P1:** site materials, equipment/labor and committed/actual cost.
- **P1:** retention release, defects period and final account.
- **P0 verification:** concurrent certificates, cumulative limits, reversal/reissue and period locks.

**Acceptance:** certify two periods and a variation, pay subcontractor, release retention and reconcile without over-certifying quantities/value.

### 13. Property & Rentals

**Baseline:** units, leases, occupancy and rent charges; service tests passed.

- **P1:** leasing UI, renewals, termination, inspections and move-in/out.
- **P1:** connect existing recurring billing; enforce period idempotency and escalation changes.
- **P1:** deposits, utilities/charges, arrears, credits and final settlement.
- **P1:** maintenance and occupant/owner document access.
- **P0 verification:** concurrent leases on one unit and effective-dated occupancy. Work-record locking alone is not proof of resource serialization.
- **P2:** occupant/owner portals and management statements.

**Acceptance:** lease → two billing periods → rent collection → maintenance → termination/deposit settlement with reconciled balances.

### 14. Automotive & Workshop

**Baseline:** vehicles, job lifecycle, estimates/conversion, parts issue and warranty endpoints.

- **P1:** booking/intake/inspection/approved estimate/execution/delivery payment.
- **P1:** technician/bay scheduling, labor, checklists, parts requisition/returns.
- **P1:** estimate revisions and extra-work approval.
- **P1:** warranty coverage/evidence/decision and manufacturer/supplier recovery.
- **P1:** service history, mileage and vehicle access.
- **P2:** dealership sales, VIN procurement, trade-ins and financing as separate extensions.

**Acceptance:** inspect, revise/approve estimate, consume/return parts, complete labor, invoice/deliver and process a later warranty claim.

### 15. Hospitality & Accommodation

**Baseline:** rooms, reservations, overlap reads, check-in/out, cleaning status and folio charges; service tests passed.

- **P1:** availability calendar, front desk, room moves and housekeeping operations.
- **P1:** rates, occupancy, deposits, cancellations/no-shows and groups.
- **P1:** folio settlement, room charges, refunds and taxes integrated with FinOps.
- **P0 verification:** concurrent booking of one room across different work records; authoritative resource protection is required.
- **P1:** business-day/night audit and accounting-date behavior.
- **External/P2:** verified channels, locks and property-management integrations.

**Acceptance:** reserve/deposit/check-in/move/post restaurant charge/settle/check-out; a competing booking fails and housekeeping updates correctly.

### 16. Education

**Baseline:** students, fee structures, enrollment and scholarships; service tests passed.

- **P1:** year/term/program/class configuration and administrative UI.
- **P1:** enrollment-driven invoices/installments, scholarships, waivers, adjustments/refunds.
- **P1:** guardian/student accounts, collection allocation, arrears and receipts.
- **P1:** appropriate student/guardian privacy and retention.
- **P2:** attendance, exams/timetables/transcripts if a full school system is marketed.
- **P2:** campus accounts/POS/cafeteria/store/parking through shared modules.

**Acceptance:** enroll with scholarship, bill term, collect installments, correct a charge and reconcile the student balance to receivables.

### 17. Insurance

**Baseline:** policies, claims/reserve fields and adjudication; service tests passed.

- **P0:** coverage-date, deductible and cumulative-exposure validation. Inspected `fileClaim` checks active policy and one claim against sum insured, not the complete rule set.
- **P1:** underwriting/approval/issuance, endorsements, cancellation and renewal.
- **P1:** premium schedules, collections/refunds and lapses.
- **P1:** investigation evidence, decision authority, payment and settlement.
- **P1:** reconcile reserves and claims to approved FinOps treatment.
- **External/P2:** reinsurance, actuarial/regulatory reports and insurer interfaces after verified scope.

**Acceptance:** issue/collect premium, reject an uncovered claim, approve/pay an eligible claim and reconcile reserve/payment effects.

### 18. Lending & Microfinance

**Baseline:** loans, schedules, repayment allocation/closure; service tests passed. The current repayment path locks its loan row.

- **P0:** define surplus handling: inspected code may retain an unallocated remainder while storing full payment amount. Allocate it explicitly to credit/suspense/refund and reconcile.
- **P0:** durable repayment idempotency, reversal and concurrent allocation tests.
- **P1:** applications, assessment, approval/agreement, scoped collateral/guarantors and controlled disbursement.
- **P1:** fees, arrears/penalties, restructuring, early settlement and write-offs.
- **P1:** principal/interest/fees/receipt/GL reconciliation.
- **External/P2:** verified bureau, payment and reporting connections.

**Acceptance:** approve/disburse, retry partial payment once, process surplus/reversal/restructure and close with matching balances.

### 19. E-commerce

**Baseline:** catalog/channel metadata and order/billing/delivery foundations. App Store is not a merchant storefront.

- **P1:** storefront publication, cart, customer checkout and order access.
- **P1:** authoritative pricing/promotions/tax/shipping, reservation expiry and payment confirmation.
- **P1:** picking, fulfillment, shipping/delivery and notifications.
- **P1:** cancellation, partial delivery, returns and refunds.
- **P0:** overselling and duplicate/out-of-order webhook protection.
- **External/P2:** verified channels/couriers and external calculation providers.

**Acceptance:** two buyers compete for final stock; successful customer receives and partially returns the order with matching settlement/stock.

### 20. Restaurant & Food Service

**Baseline:** general POS and restaurant-related fields. Inspected POS routes did not establish actual table/kitchen workflows.

- **P1:** areas/floor plans/tables/capacity/seats/party/server/status.
- **P1:** open checks/tabs/amendments/transfers/merges and item/seat/amount splits.
- **P1:** modifiers/substitutions/courses/hold-fire/menu availability.
- **P1:** kitchen/bar routing, display/printing, timers, cancellations and pickup.
- **P1:** tips/service charges, comp/void approval and ingredient consumption.
- **P0 verification:** competing servers, partial payment, reconnect and duplicate tickets.

**Acceptance:** seat/order by seat/route/amend/fire/move/split/pay and reconcile ingredients, tax, tips and cash.

### 21. Agriculture & Livestock

**Baseline:** season/cycle specifications and shared purchasing/cost/billing; registry pilot.

- **P1:** farms/plots/pens and crop/animal identities/cycles.
- **P1:** planting/inputs/harvest/grading/yield and stock receipt.
- **P1 livestock scope:** births, movements, feed, treatment records, mortality and sales.
- **P1:** lot traceability, loss and co-op aggregation/fulfillment.
- **P1:** cycle actual cost/valuation/margin through FinOps.
- **External/P2:** verified scales/sensors/specialist systems and valuation policy.

**Acceptance:** inputs → cycle → graded harvest → traceable lot → loss/sale with matching quantities and costs.

### 22. Healthcare

**Baseline:** catalog and generic episode/billing fields; registry pilot, not a complete clinical product.

- **P0:** choose administrative commerce/billing versus clinical scope, with separate acceptance requirements.
- **P1:** patient identity/deduplication, booking, staff access and authorization.
- **P1 if clinical:** domain-validated encounters/orders/results/prescriptions and amendment audit.
- **P1 if payer scope:** authorization, claim submission, rejection/correction and reconciliation.
- **P0:** sensitive-data access, record retention and jurisdiction requirements.
- **External:** actual clinical interfaces, professional validation and product operating requirements; no invented medical rules.

**Acceptance:** authorized patient registration/booking/service/billing or verified payer claim, with demonstrated access and audit controls.

### 23. Pharmaceutical

**Baseline:** product attributes and reusable production/quality/stock; registry pilot.

- **P0:** split pharmacy dispensing from pharmaceutical manufacturing.
- **P1 pharmacy:** medicine/strength/form/pack, prescription, pharmacist approval, dispensing/substitution and returns under validated requirements.
- **P1:** batch/expiry/FEFO/quarantine/recall and controlled-product access as applicable.
- **P1 manufacturing:** master recipes/batch records, tests, deviations, change control, release authority and scoped stability program.
- **P0:** enforce quality/signature/evidence gates; remove unsupported compliance claims.
- **External:** jurisdiction-specific requirements and verified product/regulator interfaces.

**Acceptance:** trace lot through permitted receipt/production/sale or dispensing/recall; expired and held stock is blocked with attributable approvals.

### 24. Mining & Extraction

**Baseline:** campaign specifications and shared purchasing/cost/billing; registry pilot.

- **P1:** site/concession, campaign and equipment/material identity.
- **P1:** output measurements, assays/grade, stockpiles, yield and losses.
- **P1:** equipment/labor/consumable campaign costing.
- **P1:** dispatch weights, commercial settlement and adjustments.
- **External/P1:** verified contract/jurisdiction royalty/levy rules and reports.
- **P2:** weighbridge/laboratory/production interfaces.

**Acceptance:** extract/assay/process/reconcile stockpile/dispatch/settle and reconcile configured royalties and cost.

### 25. Trading & Distribution

**Baseline:** shared wholesale/inventory/logistics; separate registry entry is pilot.

- **P0:** resolve overlap with Wholesale and Logistics; retain one order/stock/customer model.
- **P1:** multi-site allocation, replenishment, transfers, delivery and evidence.
- **P1:** territory/customer prices, credit approval, expiry/serial-aware returns.
- **P1:** verified landed-cost attribution to stock where applicable.
- **P1:** seller order/warehouse/freight/customer settlement reconciliation.
- **P2:** distributor portals/route sales and principal integrations.

**Acceptance:** procure/import, allocate to two outlets, deliver on credit, return damage and reconcile landed cost, stock and receivables.

### 26. Energy & Utilities

**Baseline:** generic meter/tariff fields and billing; proposed registry status.

- **P0:** separate utility billing, fuel retail and EV charging modules.
- **P1 utility:** account/meter/service point, readings/corrections, validated tariffs/periods, collections/credits/arrears.
- **P1 fuel:** tanks/nozzles, deliveries, meter totals, shifts and variance if included.
- **P1 EV:** connector/session identity, measurements, tariff and session settlement if included.
- **P0:** measured quantities and financial reconciliation under retry/correction.
- **External:** verified meters/pumps/chargers, providers and country requirements.

**Acceptance:** selected measured-service workflow → invoice/payment → corrected reading/session → reconciled quantities and finance.

### 27. Telecom & Subscriptions

**Baseline:** generic subscriber fields/shared billing; platform subscriptions do not establish telecom charging.

- **P1:** subscriber/service identity, plan versions and provisioning.
- **P1:** usage ingestion/validation/deduplication, rating/allowance/overage.
- **P1:** recurring charging, proration, plan changes/credits and dunning.
- **P1:** authorized suspend/resume/cancel and effective dates.
- **P0:** usage-to-invoice reconciliation and disputed-usage correction.
- **External/P2:** network/provisioning/interconnect/reporting interfaces.

**Acceptance:** provision → duplicate-safe usage → mid-period plan change → bill/collect → suspend/resume with reconciled usage/revenue.

### 28. Technology & Telecom

**Baseline:** proposed registry entry and reusable service/project/billing foundations.

- **P0:** resolve technology services versus SaaS subscriptions versus telecom scope.
- **P1 services:** reuse Projects/Professional Services for delivery/support/SLAs.
- **P1 SaaS:** customer subscription/seat/license/provisioning/billing contracts using reusable existing systems.
- **P1:** renewals, cancellations, support escalation and scoped service credits.
- **P2:** customer portal, license/asset inventory and verified provisioning integrations.

**Acceptance:** sell a defined service/subscription, provision/deliver/support, renew/cancel and reconcile fees and credits.

### 29. Fintech & Financial Services

**Baseline:** proposed registry entry and shared finance/identity/integration foundations; not a wallet/payment operating system.

- **P0:** approve actual product scope and authorized operating role before build.
- **P1 if wallet/payment:** authoritative transaction subledger, available/reserved balances, authorization, limits, fees, transfers and reversals.
- **P0:** distinguish operational subledger from authoritative FinOps GL and reconcile them.
- **P1:** verified customer/business checks, approvals, exception investigation and evidence.
- **P1:** bank/provider settlement, uncertain/failed transactions and recovery.
- **External:** actual partners, permissions/contracts and country requirements; do not fabricate money movement.

**Acceptance:** after scope/partner verification, controlled authorization/settlement/reversal reconciles under duplicate/outage scenarios.

## Requested business types not separately represented in the 29 labels

These need explicit presets/modules and acceptance, rather than an assumption that a broad industry label covers them.

| Business type | Reuse | Additional workflow |
|---|---|---|
| Fashion, accessories, jewelry | Retail | Size/color/compatibility, serial/value and warranty controls as applicable |
| Grocery, deli, liquor | Retail/food stock | Weighing, barcodes, expiry and verified regulated-sale rules |
| Coffee shop, bakery, bar, food truck | Restaurant/production | Counter/pickup, modifiers, prep stations, recipes, tabs |
| Salon, spa, barber | Services/booking | Staff/room durations, deposits, no-shows, commission |
| Gym, fitness, yoga | Booking/subscriptions | Membership access, class capacity, attendance/freezes |
| Veterinary, grooming, daycare | Services/booking | Animal/owner identities, scoped clinical/care records, capacity |
| Cinema, museum, theme park, entertainment | POS/booking | Ticketing, timed/capacity/seat access and validation |
| Sports/equipment rental | Inventory/booking | Resource issue/return, deposits, damage, time charges |
| Tours/travel | Booking/commerce | Departures, manifests, allocation and cancellation |
| Laundry/dry cleaning | Jobs/POS | Item tags, condition, processing, pickup/claims |
| Parking/tolls/transit | POS/ticketing | Entry/exit or journey/session rating and devices |
| Fuel/EV | Energy modules | Meter/session hardware and reconciliation |
| Civic/municipal counters | Collections | Fee schedules, service references, approvals, treasury links |
| Charity/religious/nonprofit | FinOps/POS | Donations, restricted funds, acknowledgments/campaigns |
| Campus commerce | Education/POS | Campus accounts, cafeteria/store/parking controls |

## Suggested build sequence

1. **P0 shared release truth:** ownership, entitlement failures, source/posting contracts, Ondi/organization, country configuration and honest capability metadata.
2. **Shared operations:** payments, orders/stock/returns, deposits/credits, warranties, bookings and live-device behavior. Extend existing services once.
3. **Strongest release candidates:** retail, wholesale, warehouses/logistics and manufacturing, with real browser/recovery/provider evidence.
4. **Complete partial modules:** services/consulting, printing, construction/property, automotive, lodging, education, legal/privacy. Sequence by customer commitments and shared dependencies.
5. **Actual restaurant operations:** table/check and kitchen workflow; reuse into cafés/bars.
6. **Scoped pilots:** food safety, agriculture, healthcare, pharmacy/pharmaceutical and mining with domain validation.
7. **Approve complex product scope:** insurance/lending completion, energy/fuel/EV, telecom, technology subscriptions and fintech.
8. **Marketplace:** first-party lifecycle followed by verified third-party execution/integration.

This is a dependency order, not a time estimate or a commitment to release all industries simultaneously.

## Release acceptance for every industry

Each module needs: a named owner; supported workflows/countries/exclusions; real setup/permissions/entitlements; end-to-end UI/API including failure states; tenant/outlet/foreign-ID protection; concurrency/idempotency; validated stock/FinOps/tax effects; correction/refund/period-close rules; outage/replay recovery; privacy/retention/restore evidence; actual hardware/provider support; meaningful tests, browser acceptance, load evidence, deployment and runbooks.

Use existing repository tooling, including required typechecks. Report skipped checks honestly. A catalog-field test or table-existence test does not certify an industry application. Do not invent readiness percentages.

## Primary evidence to inspect when building

- `apps/api/src/services/industry-registry.service.ts` and migration `642_industry_registry.sql`.
- `apps/web/src/pages/FinanceIndustries.tsx` and `apps/api/src/routes/finance-industry-work.routes.ts`.
- `apps/api/src/services/finance-industry-work.service.ts`, `finance-production.service.ts`, `manufacturing-quality.service.ts`, `finance-stock-allocation.service.ts`.
- `apps/api/src/services/industry-domains.service.ts`.
- `apps/api/src/routes/pos.routes.ts`, `legal.routes.ts`, `lexcore.routes.ts`, `ngao-crud.routes.ts`, `gereji-crud.routes.ts`.
- `apps/api/src/services/seal-customs-adapter.ts`.
- Reusable `recurring-documents.service.ts`, `project-resources.service.ts`, `booking-pages.service.ts` and existing finance/payment/tax services.
- `apps/api/src/services/marketplace.service.ts` and `apps/api/src/routes/store.routes.ts` have distinct purposes; inspect before extending.
- Tests: `industry-domains`, `finance-industry-work`, `industry-workflow-integrity`, `industry-catalog`, `manufacturing-quality`, `pos-lifecycle-audit`, `seal-operations-integrity`, `clearos-production-boundaries` under `apps/api/src/tests/`.
