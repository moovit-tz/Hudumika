# Finance product benchmark and additions

Reviewed 2026-10-07. This is a product roadmap, not an implementation or certification claim. Public product pages show advertised workflows; they do not establish the vendors' internal architecture or backend correctness. Priorities below are Hudumika recommendations.

## Lessons from the references

- [Zoho Books](https://www.zoho.com/us/books/): connected receivables, payables, banking, inventory, projects, reports and customer/vendor collaboration. Hudumika should connect its existing modules around a complete transaction lifecycle.
- [Zoho Expense](https://www.zoho.com/expense/): receipt capture, policy checks, duplicate detection, mileage, approvals and reimbursements. Extend existing expense approval and advance retirement into a complete employee-claim workflow.
- [Zoho Billing](https://www.zoho.com/in/billing/): customer subscription lifecycle, metered charges, proration, payment pages and failed-payment recovery. Scheduled invoices are only one part of this lifecycle. The inspected landing page is the India edition; its GST claims are not evidence of Tanzania support.
- [TurboTax](https://turbotax.intuit.com/): guided questions, document import and expert review. Apply that interaction pattern to a jurisdiction-aware preparation wizard, with visible calculation evidence and unresolved questions.
- [Lacerte](https://accountants.intuit.com/tax-software/lacerte/): diagnostics and professional review workflows. Adopt an accountant review queue, evidence requests, issue severity and approval history. Do not copy its US forms or advertised acceptance-rate claims.
- [Zoho Books construction](https://www.zoho.com/us/books/industry/construction-accounting-software/): actual project profitability, budget comparisons, advance collections, contractor management and approved timesheets. BOQ, retention and variation workflows below are additional Hudumika recommendations, not claims attributed to that page.

## Existing Hudumika foundation

Repository inspection confirms routes/pages for invoices, recurring invoices, credit notes, quotations, bills, purchase orders, expenses, payments, inventory/POS, reconciliation, fixed assets, budgets, FX revaluation, tax codes and VAT periods. Expenses already support optional approval and advance retirement; receipt images can be attached. Industry work now adds approved billing, production/WIP, stock reservations and tagged ledger results.

Code presence is not proof of complete workflows or production readiness. Manufacturing, warehouse, professional-services and project-accounting capabilities remain marked planned. Project OS smoke tests include expected failures for documented schema mismatches.

## Recommended additions, in delivery order

| Priority | Addition | Extend existing components | Completion evidence |
| --- | --- | --- | --- |
| P0 | Actual job profitability | Job dimensions, expenses, bills, NexusHR payroll, stock and credits | No duplicate cost allocation; totals reconcile to GL; reversals and FX included. |
| P0 | Accounting close workspace | Reconciliation, GL periods, VAT periods and existing reports | Checklist, unresolved exceptions, reviewer sign-off, reasoned reopen and complete audit history. |
| P0 | Guided tax preparation | Tax codes, classifications, VAT computation and ComplyOS | Effective-dated jurisdiction rules, source-document links, blocking diagnostics, reviewed exports and real submission acknowledgements where supported. |
| P1 | Employee expense reports | Finance expenses, Petti advances, NexusHR identity, Cloud documents | Capture -> policy check -> approval -> reimbursement -> reconciliation; duplicate claims rejected; rejected claims never post. |
| P1 | Customer billing contracts | Recurring invoices, customer records, payments and credits | Contract versions, usage periods, proration, deposits/retainers, retry controls, renewals and deferred-revenue schedules; retries never duplicate invoices or payments. |
| P1 | Customer and supplier self-service | Existing CRM parties, invoice/payment APIs, Cloud and eSign | Strictly scoped statements, quote approval, payment evidence, dispute tracking and supplier document requests. Verify existing portal coverage before adding routes. |
| P1 | Construction accounting profile | Industry work, procurement and reconciled Project OS | BOQ/cost codes, commitments, variations, progress certificates, retention receivable/payable, subcontractor claims and project cash-flow forecasts. Add as an eighth profile only after these workflows work. |
| P2 | Controlled finance assistance | Existing agent planner, Workflow Studio and ledger reports | Explainable categorization, anomaly review and cash-flow scenarios; human approval for posting, payment or filing. |

These additions do not replace unfinished production corrections, warehouse custody, retail returns or printing calculators listed in [the industry implementation plan](INDUSTRY_IMPLEMENTATION.md).

## UI and architecture

Keep one accounting ledger and shared customers, suppliers and document records. Finance manages business-customer billing contracts; workspace subscription billing remains a separate platform function. Reuse Petti for advances, NexusHR for employee/payroll identity, Cloud for evidence, eSign for signatures and ComplyOS for compliance obligations.

Use Hudumika's global typography, colour, radius, border and control tokens. Suggested sections are Overview, Sales, Purchases, Expenses, Banking, Jobs, Tax and Close. Industry views change the dashboard metrics, work labels and primary actions while preserving familiar navigation. Use paginated/filterable registers, dedicated form pages, mobile capture, visible review states and a consistent transaction detail layout.

Every financial operation needs tenant-scoped references, authorization, an atomic document/ledger transaction, duplicate-request protection, period-lock checks and a correction path through reversals or credits. Provider feeds, payment mandates, OCR and tax filing must be integrated against confirmed providers rather than presented as working placeholders.

## Implementation checkpoint — 2026-10-08

Implemented the first delivery slice:

- Posted job cost allocation with explicit tenant validation, available-balance checks, serialized concurrent allocation, neutral expense reclassification and source-linked automatic reversals. TZS jobs only; foreign-currency job reporting remains pending.
- Close review page with live checks for pending expense approvals, unmatched bank lines and ledger balance, plus persisted reviewer checklist and evidence note. Closing now requires a current sign-off; new ledger activity, changed bank evidence and a reopened period invalidate it. Year-end closing uses one transaction for its journal, snapshot and period lock and requires an already accrued CIT return. Reopen correction handling and a complete transition audit remain pending.
- Receipt-backed expense reports: paginated status register, owner submission, exact-file duplicate detection, independent finance approval, atomic expense/payable posting and recording an already completed TZS bank reimbursement. Claims recorded through reports cannot be edited/deleted through ordinary expense endpoints. Mileage, configurable policies, OCR, correction/withdrawal flows and report audit history remain pending.
- Expense approval now fails atomically if its ledger posting fails. Invoice/bill reversal uses the shared ledger reversal path, preserving dimensions and reversing job allocations with the source.
- CRM now exposes the existing supplier master through a paginated vendor directory and dedicated record form. CRM and Finance use the same `/v1/suppliers` API and IDs; no separate vendor table or synchronization job was added. CRM-only entitlement permits master-record access without granting Finance workflows.
- Expense report items search the existing `/v1/customers` and `/v1/suppliers` APIs, validate active same-tenant references, show live CRM names and retain those IDs on the approved expense. Customers remain CRM records. Migration 570 adds the reference columns.
- Internal VAT preparation with six evidence checks, existing jurisdiction-aware calculation, missing classification/FX/registration diagnostics, saved source snapshots and independent accountant review. Changes to the calculated snapshot or source-document timestamps invalidate review. Migration 571 stores preparation history. This does not submit a return, replace tax advice or gate the older export/close endpoints yet.

Verification: nine real-database industry tests and two real-database expense/close tests passed. API typecheck and 19 design-system contracts passed. Frontend typecheck and encoding check passed. Expense register and new-report form rendered in the browser; the mobile register footer was reachable. Full transaction-detail and close-review browser checks remain pending.

Follow-up verification on 2026-10-08: 13 real-database industry/expense/close/tax tests passed together, including CRM-only entitlement boundaries and cross-tenant VAT lookup. Three document-filing/period-lock tests passed separately after adding the required close sign-off. API and frontend typechecks passed; 19 design-system contracts, encoding and all 92 Studio trigger/emitter checks passed. Browser checks covered the CRM vendor register/form, shared customer/vendor claim pickers at desktop and 390px mobile widths, reachable claim footer and VAT diagnostics/preparation page. An empty, unsubmitted `CRM integration review draft` was created for UI verification; no claim, approval, reimbursement or tax filing was performed through the browser. Close-review history and year-end/reopen cycles still need broader accountant acceptance verification.

The remaining P0/P1/P2 recommendations above are not complete: reviewed tax exports and filing acknowledgements, billing contracts and revenue schedules, portal coverage, construction accounting and controlled finance assistance still need implementation and verification. Existing capability flags remain unchanged; this checkpoint is not a production-readiness or tax-certification claim.

## Inter-app ownership and follow-up

| Record | Owner and integration rule | Current checkpoint |
| --- | --- | --- |
| Customers | CRM, `/v1/customers`; Finance references customer IDs | Existing invoice/job usage retained; claim pickers and tenant validation added |
| Vendors | Shared supplier master, `/v1/suppliers`, exposed in CRM | Same record used by CRM, Finance bills, POs and claims; paginated CRM UI added |
| Employees | NexusHR and workspace identity; preserve employee/user references | Expense owner uses the authenticated user; payroll/HR cost allocation is still pending |
| Advances | Petti wallet/advance records; no duplicate Finance wallet | Existing dashboard/expense integration retained; report advance settlement remains pending |
| Evidence | Cloud document references where supported | Claims currently store validated receipt images; Cloud filing remains pending |
| Signatures | eSign envelope references | Billing-contract execution remains pending |
| Compliance | ComplyOS obligations and existing tax rules | Internal VAT preparation added; obligation links and authority submission are pending |

Next integrations must extend these owners, validate referenced rows within the tenant and use `apiFetch` in the UI. Do not introduce copied master records, placeholder provider integrations or a parallel HTTP client.
