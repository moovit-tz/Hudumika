# ADR: Incremental multi-industry foundations and manufacturing-first delivery

Status: Proposed for owner acceptance; not implementation authorisation or a readiness certification.
Date: 2026-10-23
Decision owners: Product owner, platform engineering, finance lead and operational pilot owner.

## Context
The attached decision correctly favours the current modular monolith, reuse of Party/Inventory/GL/Cloud and a manufacturing-first pilot. Previous source inspection established a customer/supplier channel-update synchronisation gap in migration definitions; deployed behaviour and affected row counts remain unverified. Existing GL transaction injection, inventory domains and outboxes should be audited, not replaced blindly.

## Decision
Retain the npm monorepo, Fastify/Kysely/Postgres backend and connected workspaces. Strengthen explicit domain contracts and deliver one complete chocolate manufacturing journey. No broad rewrite, speculative microservices migration, universal organisation tree or outbox-table merger.

### 1. Party channel consistency
Treat the channel sync gap as a priority investigation and bounded repair, not a proven ranking above every platform defect. Reproduce customer/supplier create, edit, clear and import operations against deployed trigger state first.

Before implementing trigger changes, define ownership of legacy primary email/phone/WhatsApp projections versus additional user-managed Party channels. For changed managed channels, replace/deactivate the previous value; an upsert of the new value alone leaves stale active addresses. Clearing a legacy value must clear its managed projection without deleting independently managed channels. Preserve normalization, channel context, primary flags, visibility, actor/audit evidence and tenant isolation. Handle linked parties, conflicting writes and loop prevention explicitly. Either database or service enforcement may be chosen after reviewing every writer; extend existing triggers where that reliably covers routes/imports without creating two competing writers.

Use a new forward-only migration; do not edit applied 505/506. Prepare a read-only mismatch report and classify conflicts. Backfill only unambiguous mappings, record changes and make the repair rerunnable; manually review ambiguous conflicts. Do not assume legacy columns are authoritative in every conflict. Migration backfill must not silently transmit messages.

### 2. Canonical read adoption
Retain current compatible reads while consistency is repaired. Then migrate one domain at a time to a permission-aware resolver with explicit legacy-fallback policy and measurable fallback usage. Do not blindly fall back to legacy private channels when canonical access is denied. Keep immutable financial-document contact snapshots distinct from current operational contact details. Remove compatibility fields only after consumer coverage and data validation permit it.

### 3. Financial atomicity
Audit every business call to GL posting/reversal. Source state, inventory effects and internal journal entries forming one invariant must share a transaction. External provider calls stay outside database transactions and use durable delivery/reconciliation. Validate failure rollback, concurrent requests and retry deduplication; grep alone is insufficient. Add narrowly scoped domain wrappers or static checks if they prevent recurring missed-transaction errors without replacing GLService.

### 4. Stock ownership and inter-domain transitions
Preserve current commercial inventory, SEAL evidence and fleet records during the pilot. This is a migration-safety decision, not a permanent assertion that every quantity ledger must remain independent. Define physical custody, legal ownership, regulatory status, commitments and accounting value separately.

A bonded release can change regulatory status without physical movement; fleet consumption can change usage without an inter-warehouse transfer. Do not manufacture two physical movements for every domain event. Where a real cross-ledger transfer exists, use one tenant-scoped transfer identity, mapped items/UOMs, source and destination references, state/approval model, valuation policy and compensating reversal. Same-database changes should be atomic; distributed changes require durable state and reconciliation. Explicitly distinguish mirrored evidence from independently owned stock so totals and asset value are not counted twice.

### 5. Manufacturing first
Deliver vertical slices over existing production/inventory/finance components. Manufacturing owns recipes, production planning and execution, quality and output decisions; inventory owns stock effects; FinOps owns posting policy and ledger. Do not duplicate Projects, Cloud or identity data.

Pilot scope: raw-material purchase/import receipt, tracked ingredient stock, recipe version, production release, stage execution/actual consumption, quality hold/release, sorting, waste/rework, packaging, finished goods, allocation/dispatch and cost reconciliation. Establish source-of-truth and lifecycle mapping before adding tables. Conversion-cost treatment and normal/abnormal losses require finance-owner acceptance.

Commerce discovery runs in parallel. Build merchant order management/public checkout according to customer priorities and proven contracts, not an absolute rule that every commerce activity must wait for manufacturing. Existing payment links and POS services are reusable candidates, not proof of ecommerce completion. No merchant-commerce completeness or zero-code claim is made.

### 6. Reliability domains
Keep event recording, Studio delivery, email/SMS delivery and external accounting sync distinct unless an evidence-based future ADR changes that. Standardize observable contracts: event/operation ID, tenant, source, correlation, attempt/lease handling, retry policy, dead-letter state and audit-safe replay. A durable producer log does not itself prove every subscriber has durable delivery.

### 7. Organisation and physical sites
Keep legal entities, branches, departments, warehouses/bins, registers and regulated zones as explicit concepts. Audit existing site/location models before introducing any shared physical-site identity. If adopted, a shared tenant-scoped site reference is optional and distinct from inventory_locations; mobile/virtual resources need not have a physical site. Shared site membership never grants access automatically. Legal-entity reporting, tax/accounting boundaries and authorisation scopes need their own contracts.

### 8. Industry extension contract
An industry pack comprises domain models, services, routes, UX, entitlements, migrations, tests and acceptance evidence. Domain complexity, privacy, safety and jurisdiction requirements influence architecture as well as product scope. Existing app patterns demonstrate reuse, not advanced readiness for every industry. No missing integration is fabricated.

## Alternatives
- Broad rewrite or early microservices: rejected for current delivery; migration and operational burden without established need.
- Merge all stock/outbox/organisation tables: rejected; loses semantics and increases coupling.
- Keep independent data without ownership contracts: rejected; drift, double counting and unreliable recovery.
- Incremental modular monolith: selected; reuses working foundations while requiring disciplined contracts and migration evidence.

## Delivery gates, without unsupported dates
1. Evidence gate: deployed schema/trigger inventory; channel mismatch report; GL writer audit; stock-domain ownership map and pilot acceptance matrix.
2. Integrity gate: tested channel repair and reconciliation; critical posting/stock rollback and duplicate-operation tests; existing IDs and permissions preserved.
3. Pilot slices: purchasing/receipt -> production/material balance -> quality/waste/packaging -> dispatch/cost reconciliation. Each includes failure and reversal cases.
4. Acceptance gate: operator/accountant approval; batch traceability; permissions journeys; operational recovery evidence and explicitly scoped release claims.
5. Commerce/vertical expansion: reuse validated contracts, with independent scope and acceptance gates.

## Consequences and remaining decisions
Reuse and smaller migrations reduce implementation risk. Transitional compatibility and reconciliation require active ownership. Outstanding decisions are channel authority/provenance, legal-entity model, site reuse, stock transfer semantics and pilot accounting policy. Estimates follow scoped backlog, staffing and acceptance criteria; 1–2, 2–4 or 8–12 week estimates are not approved by this ADR.

## Validation status
Documentation decision only. Prior source findings inform it; no application changes, live-data repairs, migration execution or tests were performed as part of creating this ADR.
