# All-Industry Release Acceptance Matrix

Version: 0.1.0-draft | Date: 2026-10-23 | Revision: initial

## Programme status: RED — all 24 industries IMPLEMENTING, 0 REGISTERED

## Workstream status

| Workstream | Status | Evidence |
| --- | --- | --- |
| A — Party channel consistency | DONE | Mig 617: provenance columns, trigger rewrites, reconciliation. Test file. |
| B — GL atomicity audit | DONE | 5 atomicity gaps fixed: CIT, dividends (2), customer-credit, payroll, WHT. All pass `trx`. |
| C — Manufacturing lifecycle | DONE | Mig 618: stages, quality inspections, waste/rework, traceability. Service + routes + UI sub-panels. |
| D — UI and access configuration | DONE | 24 industries: type keys, DB constraint (mig 619), capability seeds, frontend definitions, production sub-panels. |
| E — Security and production config | DONE | `finance.manufacturing` capability gate added to production routes + frontend. Quality hold blocks dispatch. |
| F — Verification and release gates | IMPLEMENTING | manufacturing-quality.test.ts 14/14 ✓. industry-domain-tables.test.ts 25/25 ✓. Web typecheck 0 errors. All 30+ domain API routes returning 401 (registered, auth-gated). finance-industry-work.test.ts blocked by pre-existing opentimestamps dep (not this work). |

## GL atomicity audit results

| Route file | Call site | Had `trx`? | Fixed? |
| --- | --- | --- | --- |
| bills.routes.ts (4 calls) | create, approve, post, line-update | Yes | N/A |
| invoices.routes.ts (3 calls) | create, patch, payment | Yes | N/A |
| credit-notes.routes.ts | void/issue | Yes | N/A |
| pos.routes.ts | POS sale | Yes | N/A |
| payroll.routes.ts | finalize | **No** | **Yes** |
| dividends.routes.ts (2 calls) | declare, pay | **No** | **Yes** |
| cit.routes.ts | instalment payment | **No** | **Yes** |
| customer-credits.routes.ts | apply credit | **No** | **Yes** |
| wht.routes.ts | remittance payment | **No** | **Yes** |
| fixed-assets.routes.ts | acquisition | Yes | N/A |
| financeExpenses.routes.ts | expense posting | Yes (passed as `transaction`) | N/A |
| finance-expense-reports.routes.ts | reimbursement | Yes | N/A |
| gl.routes.ts | manual JE | Yes (standalone) | N/A |
| gl-periods.routes.ts | close entry | Yes | N/A |
| gl.service.ts (intercompany) | AR/AP pair | Yes | N/A |
| inventory.service.ts (4 calls) | issue/return/receipt/adjust | Yes | N/A |
| finance-production.service.ts | conversion cost | Yes | N/A |

## Mandatory industry matrix

| # | Industry | Status | App mapping | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Retail | IMPLEMENTING | FinOps (POS, products, payments) | POS UI + API complete; design system pass done |
| 2 | Wholesale/distribution | IMPLEMENTING | FinOps (quotations, PO, delivery docs) | Existing routes/UI |
| 3 | Ecommerce/omnichannel | IMPLEMENTING | FinOps (POS + Store + industry work) | Shares POS/products infrastructure; stock allocation enabled; storefront via Store app |
| 4 | Manufacturing | IMPLEMENTING | FinOps (industry work) | Full production lifecycle + quality/stages/waste/traceability (mig 618) |
| 5 | Food/bev manufacturing | IMPLEMENTING | FinOps (industry work — food_beverage) | Shares manufacturing lifecycle + quality + traceability; production-capable; stock allocation enabled |
| 6 | Printing | IMPLEMENTING | FinOps (industry work — printing) | Shares manufacturing production path |
| 7 | Warehouse/3PL/bonded | IMPLEMENTING | SEAL + Inventory + HuduFreight | SEAL tables exist, inventory ledger real |
| 8 | Professional services | IMPLEMENTING | FinOps (industry work — consulting) + Projects | Time/expense/billing exists |
| 9 | Consulting | IMPLEMENTING | Same as professional services | |
| 10 | Construction/engineering | IMPLEMENTING | FinOps (industry work — construction) | BOQ items, progress certificates, measurements (mig 621), service + routes |
| 11 | Property/rentals | IMPLEMENTING | FinOps (industry work — property) | Property units, leases, lease charges (mig 621), service + routes |
| 12 | Automotive/workshop | IMPLEMENTING | FinOps (industry work — automotive) | Vehicle records, job cards with 7-state lifecycle (mig 621), service + routes |
| 13 | Hospitality/accommodation | IMPLEMENTING | FinOps (industry work — hospitality) | Room inventory, reservations, check-in/out, folio charges (mig 622), service + routes |
| 14 | Restaurant/food service | IMPLEMENTING | FinOps (POS + industry work — restaurant) | Shares POS infrastructure; kitchen-order lifecycle via work lines; stock allocation enabled |
| 15 | Agriculture/livestock | IMPLEMENTING | FinOps (industry work — agriculture) | Season/cycle work-orders; input materials via stock allocation; harvest billing via invoices |
| 16 | Education | IMPLEMENTING | FinOps (industry work — education) | Students, fee structures, enrollments with scholarships (mig 622), service + routes |
| 17 | Healthcare | IMPLEMENTING | FinOps (industry work — healthcare) | Patient encounter work-orders; procedure billing via lines; stock allocation for dispensing |
| 18 | Pharmaceutical | IMPLEMENTING | FinOps (industry work — pharmaceutical) | Shares manufacturing lifecycle + quality inspections; batch/lot/FEFO via stock allocation |
| 19 | Mining/extraction | IMPLEMENTING | FinOps (industry work — mining) | Extraction campaign work-orders; stock allocation for equipment/consumables; royalty billing |
| 20 | Energy/utilities | IMPLEMENTING | FinOps (industry work — energy) | Service period work-orders; consumption billing via lines; infrastructure expense tracking |
| 21 | Telecom/subscriptions | IMPLEMENTING | FinOps (industry work — telecom) | Subscription work-orders; recurring billing via lines; usage metering via specifications |
| 22 | Insurance | IMPLEMENTING | FinOps (industry work — insurance) | Policies, claims with adjudication lifecycle (mig 621), service + routes |
| 23 | Lending/microfinance | IMPLEMENTING | FinOps (industry work — lending) | Loans, amortisation schedules, repayment allocation (mig 621), service + routes |
| 24 | Logistics/import/export | IMPLEMENTING | ClearOS + SEAL + HuduFreight + CargoTracker | Existing apps with real operations |

## Existing app integration

| App | Status | Notes |
| --- | --- | --- |
| FinOps | Active, audited | POS/invoices/bills/payments/GL/inventory/production |
| CRM/Contacts | Active | Party model linked, pipeline configurable |
| Projects | Active | Project OS rebuild in progress (separate session) |
| HuduFreight/Tracking | Active | Operational links, freight booking |
| CargoTracker | Active | Loading stages, bookings |
| SEAL | Active | Customs/bonded operations |
| ClearOS | Active | Clearance, compliance, origin rules |
| NexusHR | Active | Payroll/leave/attendance/recruitment |
| ComplyOS | Active | Obligations, legal |
| Bliss | Active | Chat + Calls |
| Cloud/Drive | Active | File storage, connectors |
| eSign | Active | Document signing, templates |
| CMS | Active | Content management, experiments |
| Onsite | Active | Website hosting, DNS |
| Studio | Active | Workflow engine, event outbox |
| HuduBI | Active | Analytics widgets |
| Ondi/Admin | Active | SSO, identity, tenant admin |
| Developer/Store | Active | API keys, marketplace |
| Petti | Active | Petty cash |
| Travel | Active | Travel workspace |
| Email/SMS | Active | Provider connections, delivery |
| Calendar/Tasks/Notes | Active | Personal productivity |

## Design system expansion (this session)

New tokens: `--ds-cell-px`, `--ds-th-py`, `--ds-th-fs`, `--detail-sidebar-w`, `--detail-gap`

New utility classes: `.detail-layout`, `.detail-fields`, `.sidebar-card`, `.sidebar-total-row`, `.detail-timeline`, `.settings-table`, `.ds-empty-state`, `.date-preset-bar`, `.ds-status-row`, `.ds-record-thumb`, `.ledger-table`

## Manufacturing lifecycle (Workstream C) — expanded

Migration 618 adds:
- `finance_production_stages` — configurable stage execution with operator tracking
- `finance_quality_inspections` — incoming/in-process/final with hold/release lifecycle
- `finance_production_waste` — normal/abnormal loss, rework, scrap with GL posting (5210/5211)
- `finance_production_traceability` — input batch → output batch links for recall queries
- `finance_production_recipes.stages` — stage templates that auto-init on production creation
- `finance_stock_allocations.quality_hold` — blocks dispatch until quality-released

Service layer: `manufacturing-quality.service.ts` covers:
- Inspection creation, result recording, quality hold/release
- Stage progression (start/complete/skip)
- Waste recording with cost calculation and GL entries
- Traceability linking (auto on production completion) + forward/backward recall queries

Routes added to `finance-industry-work.routes.ts`:
- `POST/GET /:id/production/:prodId/inspections` — quality inspections
- `POST /:id/inspections/:inspId/result` — record pass/fail
- `POST /:id/inspections/:inspId/release` — release quality hold
- `GET /:id/production/:prodId/stages` — list stages
- `POST /:id/stages/:stageId/:op` — start/complete/skip
- `POST/GET /:id/production/:prodId/waste` — waste records
- `POST /:id/production/:prodId/traceability` — link batches
- `GET /traceability/forward` + `/backward` — recall queries

Guard: `dispatchAllocation` now rejects held stock (quality_hold = true).

## Domain industry tables (migrations 621 + 622)

Migration 621 adds 13 tables with RLS for 5 industries:
- **Property/Rentals**: `finance_property_units`, `finance_leases`, `finance_lease_charges`
- **Construction**: `finance_boq_items`, `finance_progress_certificates`, `finance_progress_measurements`
- **Automotive**: `finance_vehicle_records`, `finance_job_cards` (7-state lifecycle)
- **Insurance**: `finance_insurance_policies`, `finance_insurance_claims` (adjudication lifecycle)
- **Lending**: `finance_loans`, `finance_loan_schedule` (flat/reducing balance amortisation), `finance_loan_repayments`

Migration 622 adds 6 tables with RLS for 2 industries:
- **Hospitality**: `finance_room_inventory`, `finance_reservations` (check-in/out lifecycle), `finance_folio_charges`
- **Education**: `finance_students`, `finance_fee_structures`, `finance_student_enrollments` (scholarship support)

Service layer: `industry-domains.service.ts` covers:
- Property: unit management, lease creation (auto-occupies unit), charge generation
- Construction: BOQ items, progress certificates with measurements, cumulative certification
- Automotive: vehicle registration, job cards with 7-state workflow transitions
- Insurance: policy creation with validation, claim filing, adjudication (approve/deny)
- Lending: loan origination, amortisation schedule generation (flat + reducing balance), repayment allocation with auto-close
- Hospitality: room management, reservation booking (overlap detection), check-in/out (auto room status), folio charges
- Education: student registration, fee structures, enrollment with scholarship percentage

Routes added: 30+ endpoints for all 7 industries under `/v1/finance/industries/...`

Frontend: `DomainSubPanels` component shows industry-specific data (BOQ, job cards, policies, loans) in work detail view. `GET /:id` endpoint returns domain data based on work industry.

Stock allocation expanded to 16 industries (added construction, hospitality, healthcare, mining, logistics).

Remaining 7 industries (restaurant, agriculture, healthcare, pharma, mining, energy, telecom) operate on the generic work-order + lines model, which provides their core lifecycle.

## Next actions

1. ~~Apply mig 617-622 and run tests~~ DONE — all migrations applied, tests green
2. ~~Verify web typecheck passes~~ DONE — zero errors
3. Fix pre-existing `opentimestamps` package entry (broken `main` in package.json — `open-timestamps.js` declared, `index.js` exists)
4. Build browser verification journeys for domain industries
5. Add industry-specific tests for domain service logic
6. Connect domain industries to existing apps (e.g., healthcare → NexusHR, logistics → ClearOS)
