# Feature traceability

| Feature | UI → API → service → store | Verification |
|---|---|---|
| Shipment list/detail | CommandCenter/ShipmentDetail → shipments routes → ShipmentService → shipment_cases/customers | Existing regression GET, browser smoke; complete CRUD NOT VERIFIED |
| Stage progression | ShipmentDetail → workflow routes → WorkflowService → workflow history/documents | AIR/SEA prerequisite and concurrency regressions PASS |
| Declaration create/read | ShipmentDetail → declarations → DeclarationService → declarations/items/events + shipment link | Foreign/missing refs and cross-tenant reads PASS after fix |
| Financial declaration states | status PATCH → updateStatus → declaration/events | PAID/RELEASED prerequisites and concurrent duplicate writes PASS; full lifecycle NOT VERIFIED |
| Estimates | calculators → customs routes → customs/advanced calculators → reference tariff + history | Negative inputs/storage/penalty/history regressions PASS; tariff authority and precision NOT VERIFIED |
| FX | calculators → getUsdToTzs → external provider/cache | Synthetic outage rejects PASS; live provider NOT VERIFIED |
| Sharing/export | report helper → landed-cost-shares → share rows + CRM lead | Static review only; complete PDF/email/consent lifecycle NOT VERIFIED |
| Sanctions | screening page → customs routes → sanctions.service → shared lists + tenant screenings | Empty/stale corpus guard gap found statically; source sync NOT VERIFIED |
| Origin/trade wizard | compliance pages → customs routes → origin/tradeWizard services → rules/products/certificates | Source discovery only |
| Async outcomes | domain events/notifications → Redis/Studio/Cloud | Awaited release event fixed; provider delivery NOT VERIFIED |
