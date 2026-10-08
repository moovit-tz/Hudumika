# Industry accounting implementation

This implementation extends the existing FinOps ledger rather than creating seven accounting engines. Industry workspaces are at `/finance/industries`. The seven profiles are retail, wholesale, manufacturing, warehousing, professional services, consulting and printing.

## Implemented workflows

| Area | Behaviour |
| --- | --- |
| Industry workspaces | Distinct labels, job specifications, entry points and layouts; shared Hudumika cards, controls, typography, tokens and footer. |
| Work records | Customer-linked jobs, budgets, dates, specifications, controlled lifecycle, search, status filters and server pagination. |
| Service billing | Time, service, milestone, material and expense planning lines; draft corrections; approval; server-authoritative invoice drafts; concurrent billing serialized; invoiced lines cannot be billed again. Approved charges stay locked through the invoice editor, and issued job invoices require credit notes for charge corrections. |
| Production | Immutable, versioned reusable BOM recipes; per-order material snapshots; input/output locations; material release into WIP; conversion-cost accrual; actual-yield completion and weighted-average output valuation. |
| Owned-stock fulfilment | Allocation in base units, reservation checks across jobs, partial dispatch, COGS posting and release of unshipped reservations. Releasing a hold preserves dispatched quantities and their accounting. |
| Job accounting | Issued job invoices carry ledger dimensions and industry revenue accounts. Approved TZS service/time/expense costs can be accrued once to 5020 / 2100. Posted results remain separate from estimates. |
| Accounting transactions | Inventory and its GL journals now commit/roll back together. GL numbering is serialized per tenant. |
| Security | Explicit tenant filters, tenant-scoped foreign-reference checks, forced RLS on new tables, role/entitlement gates and inventory/accounting capability gates for operational actions. |

Production materials debit 1310 WIP and credit 1300 inventory. Conversion costs debit 1310 and credit 2100 accrued liabilities. Finished output debits 1300 and clears 1310. Dispatch debits 5010 COGS and credits 1300. A production order releases and completes once. Release requires active work and available unreserved stock. Quantities include planned waste; actual usable output determines unit cost.

Industry charges create **Draft** invoices through the canonical invoice endpoint. The server replaces caller-supplied lines with approved job lines. Tax treatment must be reviewed in the existing invoice editor before issue. This avoids inventing exemptions or applying a universal industry tax rate. Draft deletion releases line links through the existing invoice FK behaviour.

Cost/revenue values on work records are explicitly **estimates**. They are not represented as audited actual profit. Entering an estimate does not create an expense or payroll obligation. Production conversion costs are a separate explicit accrual and must not duplicate costs already capitalised elsewhere.

The separate posted-results panel is available for TZS jobs and reads tagged ledger entries, including reversal pairs. It excludes unallocated costs elsewhere. Direct approved service-cost accruals are explicit and idempotent, not automatic. A complete profitability report still needs payroll/bill/expense allocations, credit-note attribution and foreign-currency validation.

## Remaining scope for a complete industry solution

The work above is a functional foundation, not a claim that all seven industries are complete or certified for production.

1. MRP recommendations, production cancellation/reversal, scrap/rework/by-products, subcontract production and overhead absorption.
2. Customer-owned warehouse custody separated from owned inventory, storage-rate schedules, scan-based pick/pack, serial tracking and proof of delivery.
3. Project cost allocation from existing expenses, payroll and supplier bills, approved timesheet corrections, retainers/deferred revenue, milestone acceptance and actual margin reporting including credits/FX.
4. Wholesale credit limits, tiered price lists, backorders, replenishment and dispatch-to-invoice quantity reconciliation.
5. Retail returns/exchanges and branch close controls beyond existing POS workflows.
6. Printing price calculations, reusable job templates, proof versions/approval evidence, paper yield/imposition, machine scheduling and waste reporting.
7. Live fiscal integration validation, country-specific tax scenarios, accountant sign-off, recovery drills and documented production load/security checks.

Implement these through the existing procurement, expenses, payroll, inventory, invoice, credit-note and GL APIs. Do not activate broad capabilities merely because an industry workspace exists. Planned capability descriptions remain planned until their advertised scope is delivered.

## Verification criteria

- Cross-tenant customer/item/location/job IDs are rejected; sales users cannot mutate operations.
- Approved lines bill once under concurrent requests; arbitrary caller rates cannot override approved work.
- Insufficient/reserved stock cannot be consumed; partial dispatch preserves remaining reservations.
- Production release/completion cannot repeat; usable yield receives exactly material plus conversion cost; closed GL periods and business failures leave no partial journals/movements.
- Desktop and mobile pages render, controls remain usable and the shared footer is reachable.
- Run repository typecheck, design-system checks and the existing API integration suite.

Final verification: eight real-database integration tests pass for tenant/role boundaries, approved billing under concurrency, invoice-editor protection, WIP/yield valuation, allocation/partial dispatch/release, transaction rollback, issued revenue/direct costs, reversal attribution and immutable BOM versions. Final API and web typechecks pass, including reservation-release, shared-picker and invoice-guard changes. The 19 design-system contract checks and encoding checks pass. Desktop and 390px mobile views were inspected, including the reachable shared footer and searchable customer picker. Both title words were confirmed to inherit the same selected product font and weight.

The broader API run reported 417 passing assertions across 37 files, but six suites failed their 20-second database setup/cleanup hooks. All six passed on rerun with a bounded 120-second hook allowance (82 assertions). Existing Project OS smoke tests include expected-failure cases for documented schema discrepancies; their green result does not establish that those happy paths work. This verification is not a production-readiness certification.

Local rollout uses `node scripts/apply-finance-industry-migrations.mjs`, limited to migrations 561–564 and 566–571. It does not run unrelated pending migrations, including 565. Deployment should use the normal ordered migration runner after reviewing the complete migration queue.

## Completion sequence and acceptance gates

1. Finish production corrections and warehouse custody first. Verify stock/GL conservation under rollback, parallel requests, reversals and closed accounting periods. Customer-owned goods must remain outside owned inventory valuation.
2. Connect existing expense, bill and payroll records to work dimensions before extending margin reports. Reconcile attributed totals to the trial balance; include credits and foreign-currency reversals.
3. Add commercial controls and industry calculators using existing quote, invoice, payment and credit-note services. Storage periods, pricing tiers, print yield and milestone acceptance need persisted source evidence and duplicate-billing protection.
4. Complete retail settlement/returns and operational delivery evidence. Reconcile daily sales, payments, stock and ledger totals; retain approvals and correction history.
5. Validate fiscal integration against actual provider contracts and test environments. Run backup restoration, load, security and accountant acceptance checks before making a production-ready claim.

No integration, statutory certification or industry completion is inferred from a workspace page, a saved specification or a passing typecheck.

## Reference use

The Fuse modern invoice demo was inspected through its demo login. Its seller/buyer hierarchy, concise invoice metadata and totals informed the information hierarchy. It was not used as evidence of backend correctness. Perfex and the Claude artifact were not readable through the initial web fetch; their implementation details were not invented.
