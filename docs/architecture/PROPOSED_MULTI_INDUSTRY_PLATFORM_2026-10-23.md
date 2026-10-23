# Proposed architecture: advanced multi-industry Hudumika

Status: Proposed, not an implementation or readiness certification.
Date: 2026-10-23
Deciders: Product owner, platform engineering, domain leads and pilot customers.

## Context and inspected evidence
Hudumika already has a Fastify/Kysely/Postgres backend, React workspace shells, shared types, tenancy controls, entitlements, domain events, accounting delivery outbox, workflow automation, inventory services and a documented canonical Party/Cloud file direction. Reuse these foundations. StoreShell is an add-on marketplace, not a merchant ecommerce storefront. FinOps declares eight industry profiles; Projects declares additional industry categories. Neither list establishes complete advanced industry execution. This proposal is based on targeted source inspection, not an exhaustive audit of every app.

## Decision
Evolve a modular monolith with explicit domain ownership and connected workspaces. Keep the npm monorepo and existing stack. A new app is primarily a product boundary, permission set and workspace; it does not automatically require a new deployment or database. Extract services only when measured scale, isolation or team ownership justifies the operational cost. Deploy public storefronts separately from the authenticated administrative workspace where necessary, behind constrained public/customer APIs.

## Options considered
1. Put every operation in FinOps: easiest initial reuse, but poor navigation and excessive coupling; rejected.
2. Independent applications with separate customers, stock and ledgers: local autonomy, but reconciliation and duplicate records; rejected as default.
3. Modular monolith, shared foundations, domain-owned records and industry packs: incremental adoption, fewer distributed transactions and clear extension points; recommended. Requires enforced ownership and disciplined migrations.

## Ownership
- Ondi/platform: identities, memberships, roles and access policy.
- Party directory: canonical tenant-scoped customer/supplier/contact identity; apps own contextual relationships and immutable transaction snapshots.
- Shared catalog: item/service/variant definitions, units and external channel identifiers.
- Inventory: sole writer of quantities, lots, serials, reservations and valuation; supports goods owned by tenant, customer or third party distinctly.
- Commerce/order management: customer orders, channel pricing/promotions, checkout, allocation requests and return authorizations.
- Procurement: requisitions, sourcing, purchase orders and receiving requests; reuse existing purchasing implementation.
- Manufacturing: recipes, versions, planning, execution, output, waste/rework and genealogy.
- Warehouse: bins, directed putaway, pick/pack, counts, handling units and execution; requests shared stock movements.
- FinOps: journals, receivables/payables, taxes, settlement, cost policy, periods, assets and financial reporting.
- HuduFreight: transport jobs, loads, fleet and delivery evidence.
- Projects: project/work breakdown, contracts, resources and project delivery.
- Cloud: files, versions, storage permissions and retention.

## Integration contract
Commands go to the owning domain. Stock movement and related journals use an atomic transaction when in the same database. External delivery uses a transactional outbox, stable operation IDs, tenant-scoped deduplication and retry/reconciliation. Consumers must tolerate duplicate messages; do not promise exactly-once transport. Record source references and versions. Failed workflows expose status, safe replay and compensating operations. Business invariants stay in domain services, not configurable automation or AI agents.

## Shared gaps to close
1. Verify and finish canonical Party/file rollout; define catalog and UOM ownership and migrate duplicates with compatibility mappings.
2. Model tenant, legal entity, branch, warehouse, location and channel separately; use entity-aware authorization and accounting dimensions.
3. Establish resource-level authorization, separation of duties, approvals, server entitlement gates, audit evidence and customer portal isolation.
4. Standardize order/payment/fulfilment/return states without conflating their independent lifecycles.
5. Unify stock valuation, reservations, cost adjustments, landed costs, expiry/quality blocks and concurrent transaction safety.
6. Reuse existing domain-event/outbox patterns; standardize contracts, replay, dead-letter handling and reconciliation.
7. Build contract/integration tests and reference industry journeys, plus capacity, restore, security and operational acceptance gates.
8. Publish capability maturity: planned, foundation, pilot and validated; repair catalog/implementation drift.

## New or substantially expanded workspaces
- Commerce: public storefront and customer portal, merchandising, variants, channel prices, checkout, orders, payment callbacks, fulfilment, returns, promotions and B2B trade accounts. Separate from the add-on Store.
- Manufacturing: expand and migrate existing production foundation; recipes/BOM, MRP, routings, work centres, scheduling, stage execution, actual consumption, outputs, packaging, rework, waste and batch genealogy.
- Inventory/Warehouse operations: establish one coherent inventory workspace and expand to WMS using current inventory services and logistics boundaries. No second stock ledger.
- Quality: reusable inspections, quarantine/release, nonconformance, corrective actions and recall. May launch inside Manufacturing before a separate cross-industry workspace is warranted.
- Maintenance/field service: equipment, preventive plans, breakdowns, technician jobs, spares and service history; finance fixed assets retain accounting ownership.
- Vertical extensions as demand warrants: hospitality/food service, agriculture, healthcare, education, property/rental, utilities/subscriptions and financial-services operations. These require domain discovery and expert acceptance, not generic templates.

## Existing-app work programme
- FinOps: strengthen posting/stock contracts, landed and actual production costs, valuation/COGS, customer deposits/refunds, entity accounting and operational reconciliation. Delegate shop-floor execution.
- CRM/Contacts: finish Party adoption; commercial accounts, price agreements, portal relationships and consent; no independent customer copies.
- Projects: align finance industry jobs and Projects records through explicit links or staged consolidation; construction/engineering extensions add measurement, retention, variations, site execution and subcontract controls.
- HuduFreight/CargoTracker: connect fulfilment orders to loads, dispatch and proof of delivery; carrier references, returns and delivery exceptions; distinguish telemetry from stock custody.
- SEAL: retain bonded/customs warehouse regime ownership and link normal inventory custody explicitly; avoid parallel stock quantities.
- ClearOS: connect procurement/import documents, clearance milestones, duties/fees and actual landed-cost allocation.
- NexusHR: labour skills/availability, shifts and approved time references for project/production costing.
- ComplyOS: attach obligations, inspections and evidence to business records; specialist quality and domain controls retain explicit ownership.
- Bliss: order-aware support, complaints/returns/warranty links and communications consent.
- Cloud/eSign: shared document identities, versioned evidence, signing links and permission-aware retention.
- CMS/Onsite: reuse content/site foundations where appropriate for storefront presentation; Commerce owns prices, availability, checkout and orders.
- Studio: orchestrate approved domain actions, version workflows, retries and failure visibility; no bypass of posting or safety invariants.
- HuduBI: shared metric definitions, tenant-safe reporting, transaction lineage and refreshed analytical views.
- Ondi/Admin/Workspace: branch/entity scope, role policies, app/pack entitlements, provisioning and audited configuration.
- Developer/Store: versioned APIs and signed integrations/packs with explicit scopes, compatibility, installation migrations and lifecycle policy.
- Petti: clarify wallet/payment boundary and reconcile authorized settlements with FinOps; do not represent it as an unrestricted payment provider.
- Email/SMS/Calendar/Tasks/Notes: permission-aware links and notifications on business records; remain shared productivity tools.
- Travel: retain business trip/booking/expense scope; not a hotel property-management system.
- Lens: internal architecture/release/evidence tracking; keep separate from tenant operations.

## Rollout and exit criteria
A. Foundation: ownership map, capability inventory, canonical data migration plan, contract tests, idempotency, authorization and observability. Exit: a documented transaction cannot create duplicate stock or postings across retry/recovery.
B. Trade/Commerce pilot: purchasing -> goods receipt -> shared availability -> POS/web sale -> dispatch -> payment reconciliation -> return/refund. Exit: accountant and operator acceptance, concurrent stock/payment tests and recovery drill.
C. Manufacturing pilot: chocolate procurement/import -> ingredient receipt -> staged production -> quality release -> packaging -> finished goods -> sale/dispatch -> recall/waste/rework. Exit: traceable lot genealogy, material balance and cost reconciliation.
D. Project/service pilots: approved time/cost -> contract/progress billing -> collection, with resource and construction-specific controls.
E. Additional vertical packs: one named reference customer, explicit workflows, domain controls and acceptance evidence per pack. No simultaneous claim of advanced support for every sector.

## Consequences
Shared transactional consistency and gradual reuse become easier. Migration and contract discipline become mandatory. A separate public commerce surface adds operational/security work. Regulated and specialist sectors need distinct discovery and validation. UI breadth and generic industry names must not be presented as production readiness.

## Documentation discrepancy
The September production-readiness architecture map lists React 18 and presents the workspace UI/API-client packages as shared foundations; current repository instructions specify React 19 and identify those packages as near-dead. Treat that map as a historical snapshot and revalidate it before implementation.


## Verified corrections after external review — 23 October 2026

This section refines the target-state proposal against current source. It supersedes earlier rollout ordering where stated. It does not establish applied migration state or production readiness.

### Findings
- Party is already substantial: migration 504 creates party_relationships as well as channels, affiliations and file links; party.service.ts implements SAME_ORGANIZATION/NOT_SAME_ORGANIZATION decisions; parties.routes.ts exposes suggestions, links and management-controlled link/unlink actions. Do not add another relationship table. Customer/supplier IDs can remain separate commercial-context records linked to identities. Identity linking must not automatically net receivables/payables or merge transaction histories.
- Contacts already integrates Party visibility and channel writes; Party APIs read canonical channels and relationships. Legacy customer/contact/supplier reads still need endpoint-by-endpoint review. Neither 80% structural completion nor 0% canonical reads is supported by this source review. Legacy columns and nullable FKs are compatibility mechanisms until coverage, backfill and external consumers justify tightening them.
- Current stock ownership is plural: general inventory, SEAL customs stock records, fleet parts and work reservations have distinct purposes. Choose one authoritative quantity per stock pool/business meaning; retain regulatory evidence where required, with explicit custody/title/ownership mappings and reconciliation. Reservations are commitments, not automatically a second physical ledger. POS calls InventoryService.recordMovement; it is not proof of an independent POS stock engine.
- Existing tenants, platform organizations, HR company scopes, warehouses and locations are not absent. Establish the meaning and scope of each before considering a shared org-unit model. Platform organizations are documented as cross-tenant portal identity, not a substitute for tenant legal entities. Physical locations, legal entities and channels should not be forced into one universal tree.
- finance_accounting_outbox is external QuickBooks/Xero delivery, not the internal GL posting ledger. domain_events is an event log with in-process/best-effort dispatch; studio_event_outbox is durable workflow delivery tied to those event IDs; communications have separate delivery queues. Standardize common retry/lease/idempotency/observability contracts where useful, but do not blindly merge all tables. Audit durable delivery per critical consumer.
- Merchant ecommerce is not established by the inspected code, but literal zero commerce hits is false: template names and hosted invoice/platform payment-link surfaces exist. These do not constitute merchant checkout. Reuse POS/catalog/stock/payment primitives where their contracts fit; separate counter-sale and web-order lifecycles. Full scope and estimates require discovery.
- Idempotency already exists in several domains. Work is a coverage and failure-mode audit, not invention. Search-hit counts cannot prove concurrency safety, crash recovery or exactly-once financial effects.
- Vertical tiers should reflect workflow depth, safety/regulatory exposure, available foundations and pilot demand. Property/rental is not automatically near; mining/energy is not automatically a separate product; pharmacy stock distribution differs from pharmaceutical manufacturing. No generic certification or duration claim is made here.

### Revised sequence
1. Bounded architecture audit: current vs target ownership, endpoint/data consumers, migration deployment state, org scopes, retries/leases and source-to-stock-to-GL links. Deliver a writer/reader matrix and evidence-based backlog. Reuse working foundations; do not require a complete rewrite before a pilot.
2. Chocolate manufacturing pilot first, reflecting the current user use case. Resolve relevant inventory/regulatory/parts boundaries before connecting them. Implement vertical slices with operator/accountant acceptance, lot genealogy, material balance and cost reconciliation.
3. In parallel, perform Commerce/order-management discovery and define reusable catalog, pricing, payment, reservation and fulfilment contracts. No full storefront build is assumed.
4. Deliver order-management/Commerce pilot after shared contracts are proven; storefront and customer portal consume a constrained public/customer API.
5. Extend additional industries only after named reference journeys pass permissions, concurrent operations, partial fulfilment, reversal, retry and recovery tests.

No fixed 4–6 week, 8–12 week or 6–12 month commitment is supported without staffing, scope, throughput and acceptance criteria.
