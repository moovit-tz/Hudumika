# SEAL operating flow

SEAL navigation follows receiving, inventory, outbound work, warehouse operations,
customs (where applicable), billing, reporting and setup. Standard and bonded
facilities retain the same inventory destinations; customs adds its own section.

## Stock boundaries

- Lot stock, warehouse transfers, cycle counts, fulfillment and storage billing use
  `seal_lots` and the append-only `seal_movements` ledger.
- Item stock used by FinOps and production still uses `inventory_stock_levels` and
  `inventory_movements`. Those records are reachable from Stock Overview, alongside
  their own item counts and warehouse setup. They are not added to lot balances.
- Moving the old Inventory routes into SEAL did not migrate their ledger. No
  historical balances are copied or merged by this change. Consolidating those
  ledgers requires an explicit ownership, unit, valuation and duplicate-balance
  migration; treating matching names as proof of equivalence would corrupt stock.
- Catalogue product links are optional references, not stock synchronization.

## Daily work

1. Configure warehouses, zones, locations and storage rates in Setup. Standard
   warehouse is an available facility type; receive domestic stock as `DOMESTIC`.
2. Schedule an appointment or process a consignment. Receive stock directly from
   the dashboard, Stock Overview or Lots & Batches. The receipt is persisted with
   its initial ledger movement, owner, optional catalogue product and batch.
3. Put away or re-slot stock from its lot detail. Stock Overview shows actual
   on-hand, allocated and available quantities within the selected warehouse.
4. Transfer whole lots through approval and execution. Execution changes the
   warehouse and records a transfer movement; target zone codes resolve to real
   locations. Partial-lot splitting is not implemented and cannot be submitted as
   a completed transfer. Stock changed since request creation must be reviewed.
5. Start a physical lot count from Counts & Adjustments. Record every quantity,
   review variances and reconcile. Reconciliation posts adjustments atomically,
   is repeat-safe, and rejects snapshots where stock moved in the meantime.
6. Approve dispatch requests or create fulfillment orders. New orders reserve
   available stock; picking releases that line's reservation and records its
   physical deduction. Cancellation releases untouched reservations. Packing and
   dispatch follow picking; dispatch has its own durable release movement.
7. Review actual unbilled charges and generate a draft invoice. Existing FinOps
   owns invoice review and finalization. Invoice generation locks the lot and
   advances its billing watermark to prevent duplicate generation for the period.

## Reports and navigation

- Stock Aging uses actual receipt dates and the existing charge calculator.
  Missing CBM data is shown as a billing issue, not zero charges. Currency totals
  remain separate.
- Movement History is tenant-scoped, warehouse-filterable and cursor-paginated.
- Operational Reports currently cover all warehouses and say so on the page.
- Warehouse layout, heat grid and sorting remain contextual warehouse views.
- POS/Finance integration menu links were removed because no pages implement them.
- The dashboard displays a live summary and a five-lot preview; simulated import,
  barcode, deletion and local-only stock changes were removed.
- The legacy `/inventory/counts/:id` URL redirects to its working SEAL item-count
  detail page. Lot-count detail lives at `/seal/adjustments/:id`.

## Verification

The integration suite is `apps/api/src/tests/seal-operations-integrity.test.ts`.
It exercises receipt/scoping, tenant isolation, count reconciliation and stale
counts, transfer execution, billing, fulfillment, and reservation cancellation.
The append-only audit ledger prevents deleting its test tenant; the suite disables
that isolated fixture tenant after execution and retains its immutable records.

Browser verification uses an isolated workspace against the running API, including
actual count reconciliation, draft invoice generation, desktop/mobile rendering,
and standard/mixed warehouse navigation. No mocked success responses are used.


The follow-up action audit and lot-editing coverage are recorded in
[SEAL_ACTION_RECHECK.md](SEAL_ACTION_RECHECK.md).
