# Finance readiness audit — 8 October 2026

## Assessment

Finance is not yet certified production-ready. This review inventories every page module imported by FinOpsShell and exercises registered literal GET endpoints with a disposable Finance tenant. It does not prove every mutation, dynamic endpoint, role, integration or mobile workflow.

## Fixes implemented

- Industries replaces Industry Workspaces and the duplicate Capabilities sidebar entry, under Settings. Its existing capabilities and business-line tabs remain accessible.
- POS replaces Point of Sale in navigation and the page heading.
- Nested navigation now filters each child by role and capability, avoiding inaccessible submenu entries.
- Dashboard uses the typed, tenant-scoped ledger snapshot API and its reporting currency. Fabricated charts, close statuses, anomaly claims and success-only AI controls were removed. Links lead to existing tools.
- Unexpected ledger failures propagate as errors instead of zero balances. Snapshot month/year boundaries consistently use the UTC reporting date, avoiding local-time conversion into the previous day.
- VAT periods, tax classification, budgets, bank reconciliation and accounting integrations surface load failures instead of presenting failed loads as valid empty data.
- New expense entry uses shared Input, Textarea and Button components and the responsive industry form grid. CRM customer/supplier and shipment lookup failures are surfaced. Native hidden file selection is retained.

## Verification

- 49 page modules inventoried; all use the shared PageHeader.
- 50 literal GET endpoints exercised: 47 returned 200, three returned explicit parameter/permission responses, none returned 5xx.
- Four selected database test files passed: 17 tests total, including the read-API audit and expense-report, industry-work and document-filing checks.
- Final API and web TypeScript checks passed. The design-system contract check passed all 19 checks.
- Browser verified the updated overview, sidebar labels and shared footer. Earlier selected page observations are not a full-page certification. Further automated browser inspection encountered a control timeout; the mobile expense check subsequently reached the normal inactivity lock. No financial transaction was submitted.

## Remaining work and implementation order

1. Complete role-specific end-to-end transaction checks on disposable tenants: invoice and credit-note posting/reversal, PO-to-bill flow, expense approvals, payments, reconciliation, POS settlement, period close, FX and asset depreciation. Assert ledger balance, tenant isolation, idempotency and forbidden state transitions.
2. Review quotations lead selection: `/v1/leads` rejects Finance users. Resolve the intended CRM permission/UX contract without widening backend access merely to suppress the error.
3. Review legacy native controls and form patterns page by page. Native control presence alone is not a defect; distinguish hidden uploads, icon actions and toggles from controls requiring migration. Validate keyboard labels, dialogs, mobile overflow and global radius/border inheritance.
4. Test dynamic detail APIs and hook/component-owned API calls, which static extraction does not cover. Verify failed loads, retry and stale-response handling.
5. Verify provider credentials, error recovery and reconciliation in supported integration sandboxes. No fabricated provider or statutory filing capability should be exposed.
6. Finish the larger industry/accounting gaps tracked in PRODUCT_BENCHMARK_ROADMAP.md before claiming complete accounting support.

## Endpoint exceptions

- `/v1/finance/industries`: 400 without the required industry selection.
- `/v1/files`: 400 without the required drive id.
- `/v1/leads`: 403 for Finance role; a real quotations permission/UX issue requiring follow-up.

## Page inventory

| Page module | Shared header | Native control count |
| --- | --- | ---: |
| FinanceIndustries | Yes | 0 |
| FinanceWorkCosts | Yes | 0 |
| FinanceCloseReview | Yes | 0 |
| FinanceTaxPreparation | Yes | 0 |
| FinanceExpenseReports | Yes | 0 |
| FinanceDashboard | Yes | 0 |
| Billing | Yes | 9 |
| Quotations | Yes | 37 |
| PurchaseOrders | Yes | 33 |
| Expenses | Yes | 14 |
| FinanceExpenseNew | Yes | 1 |
| FinanceExpenseCategories | Yes | 0 |
| Bills | Yes | 35 |
| FinanceVendors | Yes | 17 |
| ProductsServices | Yes | 44 |
| ProductCategoriesPage | Yes | 9 |
| ProductReviewsPage | Yes | 7 |
| FinanceTaxCodes | Yes | 5 |
| FinanceTaxClassify | Yes | 8 |
| FinanceVatPeriods | Yes | 0 |
| FinancePayments | Yes | 7 |
| FinanceLedger | Yes | 1 |
| FinanceTrialBalance | Yes | 0 |
| FinanceBalanceSheet | Yes | 1 |
| FinanceProfitLoss | Yes | 1 |
| FinanceEquityStatement | Yes | 0 |
| FinanceAgedReceivables | Yes | 0 |
| FinanceAgedPayables | Yes | 0 |
| MultiEntityAccounting | Yes | 0 |
| FinanceReportsHub | Yes | 0 |
| FinanceSalesReport | Yes | 0 |
| FinanceExpensesReport | Yes | 0 |
| FinanceIncomeVsExpenses | Yes | 0 |
| FinanceTaxReport | Yes | 0 |
| FinanceCashFlow | Yes | 0 |
| AccountsQuery | Yes | 4 |
| ChartOfAccounts | Yes | 15 |
| JournalEntries | Yes | 13 |
| DeliveryDocumentsPage | Yes | 1 |
| AccountingIntegrations | Yes | 1 |
| RecurringInvoices | Yes | 0 |
| CreditNotes | Yes | 2 |
| FixedAssets | Yes | 12 |
| Budgets | Yes | 4 |
| BankReconciliation | Yes | 2 |
| GlPeriods | Yes | 10 |
| ApApprovalWorkflows | Yes | 8 |
| FinancePos | Yes | 10 |
| FinanceFxRevaluation | Yes | 0 |

Machine-readable evidence: PAGE_AUDIT_INVENTORY.json and PAGE_API_AUDIT_RESULTS.json. The extraction is intentionally a starting inventory, not an exhaustive security or accessibility audit.
