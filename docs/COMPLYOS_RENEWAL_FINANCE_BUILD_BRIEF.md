# ComplyOS renewal finance — budget, commitments, spend and forecast

User requirement recorded 29 October 2026: users must be able to trace how much has been spent and how much remains to be spent on permits/renewals. This is missing from the current user-facing ComplyOS flow. This document is an implementation brief, not a claim of delivery.

## Current verified gap

- The existing renewal UI calls `/v1/comply/renewals`; its records expose status, dates, approval and notes, but no estimated, budgeted, committed, invoiced, paid or outstanding amounts.
- The separate new lifecycle model stores `budget_estimate`, `budget_currency` and editable `actual_cost`. These are not a line-item budget or a verified payment ledger.
- There is no Renewal Finance route/navigation or integrated cost/history view in the inspected ComplyOS shell, dashboard, vault or workflow page.
- Catalogue principal/subsidiary fees and fee-definition rows are reference inputs, not proof of an authority's renewal assessment or money paid.
- Tenant metrics initialize `total_cost_ytd` to zero; the inspected path does not derive it from Finance.
- No canonical renewal-cycle-to-Finance bill/expense/payment relationship was found in the inspected flows.

Disposable evidence in `docs/audits/COMPLYOS_RENEWAL_SPEND_EVIDENCE_2026-10-29.json`: a TZS 100,000 estimate and TZS 40,000 manually declared actual value were stored through the new lifecycle service/API; the UI's legacy renewal API exposes neither. No payment occurred. Do not describe this fixture as TZS 40,000 cash spent or claim the cash total should have increased.

## Product deliverable

Add a **Renewal Finance** workspace in ComplyOS and a **Costs & Payments** section on each canonical permit/renewal case. Use existing Finance for authoritative bills, expenses, payments, refunds and accounting; do not introduce a competing money ledger or pretend a typed actual-cost value is a settled payment.

Unify or explicitly map legacy `comply_renewals` and new lifecycle cycles first. A user must not budget in one system while their workflow, reminders and history refer to an unrelated record in the other.

## What users must be able to answer

1. What will the next 30/90/365 days of renewals require, by payment date and by expiry deadline?
2. Which requirements have a known estimate, and which remain unpriced or unassessed?
3. What budget has been approved, by whom, for which entity/site/permit/cycle?
4. What has been committed or invoiced but not yet paid?
5. What has actually been paid, refunded or disputed, to whom and when?
6. What remains to fund, what is overdue, and what may incur a penalty?
7. What did the same permit cost in previous cycles, and why did the amount change?
8. Can every aggregate be traced to a source quote, authority assessment, bill/expense, payment and receipt?

## Financial definitions — keep distinct

| Measure | Definition / authoritative basis |
| --- | --- |
| Latest estimate | Versioned expected cost with source/rate/date, assumptions, currency and known coverage; not a payable |
| Approved budget | Approved spending limit and line allocations; not money paid or automatically the forecast |
| Open commitments | Approved obligations not yet settled; reconcile uninvoiced commitments and unpaid invoices without counting the same obligation twice |
| Incurred cost | Accepted/accounted cost under the existing Finance policy; distinct from settlement timing |
| Net paid / cash spent | Verified Finance settlements allocated to the cycle, less linked settled refunds; include partial payments and reversals |
| Outstanding payable | Posted/accepted payable less allocated settlements/credits under Finance rules, with due date |
| Estimate to complete | Remaining expected cash/cost for the cycle, including existing unpaid obligations once; exclude amounts already paid |
| Forecast final cost | Net paid plus remaining expected spend under the selected cash-view definition; expose an accrual view separately where needed |
| Available budget | Approved amount less paid and outstanding commitments, with the approved reservation/overlap policy applied |
| Budget variance | Clearly labelled difference between approved budget and forecast final cost; define sign convention |
| Penalty exposure | Reviewed estimate/official assessment with legal/rate version, reason/date, dispute/waiver status; not a generic automatic charge |

Agree accounting/rounding/FX and approval policies with the business owner. Display unknown estimates as unknown, not zero. Show “known forecast + N unpriced renewals” when coverage is incomplete. Do not sum USD, TZS and other currencies into one unlabeled amount.

## Data and provenance

Extend the relevant existing models after inspecting Finance conventions. Required concepts:

- Cost line: canonical permit/cycle, legal entity/site/business line/customer context, charge category, payee/authority/provider, currency, quantity/unit/base, amount/tax, due date, source/assessment and version.
- Categories: authority application/renewal, inspection, penalty, professional agent fee, translation/document/travel and actual supported platform/provider charges. Keep each distinct.
- Budget version/approval: owner, approver, approved ceiling, allocations, date, reason and immutable prior versions.
- Commitment/assessment/invoice mapping: links to existing quotes/orders/bills/expenses where supported, revisions/credits and acceptance state.
- Payment/refund allocations: existing Finance identifiers, linked cost line/cycle, original currency, actual settlement, receipt and correction chain. Prevent over-allocation and duplicate counting.
- Forecast snapshot: as-of date, rule/rate/budget version, expected payment windows, confidence/coverage and scoped aggregation.
- Audit: who changed estimates/budgets/allocations/approvals, previous/new values, source and delegated authority.

A certificate PDF, an internal approval, the word “paid” in a milestone or a manually edited amount does not establish settlement. External-services wallet funding is a prepayment/funding source, not consumed permit cost; charge allocation must follow actual consumption without double counting the top-up and debit.

## Required screens

### Renewal Finance overview

Cards: net paid year-to-date, approved budget, open commitments, due/overdue payables, forecast next 30/90/365 days, forecast variance and unpriced requirements. Every card drills into contributing rows; use current tenant/entity/industry/site permissions.

Register columns: permit, holder/entity/site, jurisdiction, renewal cycle/status, expiry, payment deadline, currency, estimate, approved budget, committed/unpaid, net paid, remaining forecast, variance, payee, evidence/reconciliation state and owner.

Filters: entity/company, customer, jurisdiction, site, industry/business line, permit/authority, agent, cycle/status, date basis/window, currency and funding/overdue state. Provide proper pagination, scoped export and accessible mobile record views rather than clipping a wide table.

### Permit/cycle Costs & Payments

Line-item budget and versions → approval → authority assessment/agent quotation → linked Finance bills/expenses → partial/settled payments and receipts → credits/refunds/disputes. Show remaining forecast and explain changes. Include prior-cycle comparison and complete authorized history.

### Calendar and funding queue

Calendar separates expiry, latest safe submission, inspection and payment dates. An expiry month is not automatically the payment month. Funding/approval alerts identify who needs to act and what operations are at risk; notifications need retry/acknowledgement.

## Workflow and controls

`permit/requirement → estimate and rate snapshot → budget approval → commitment/authority assessment → Finance bill/expense → verified settlement allocation → evidence/history → forecast reconciliation`

- Budget approval and evidence of payment do not certify authority issuance. Renewal outcome remains a separate verified lifecycle decision.
- Reject duplicate gateway/Finance callbacks and over-allocation transactionally. Reversals/retries preserve history and remain tenant-safe.
- Keep approvals and money-changing actions separate and permission-gated. Consultant mandates may request/quote spending without approving client funds.
- Where an authority/provider cannot be integrated, support verified manual assessment/receipt attachment with reviewer identity and reconciliation; never generate fake payment confirmation.
- No automatic debits/payments simply because the feature is configured. Apply explicit payer authorization, limits, provider capability and approval policy.
- Platform superadmin can inspect authorized aggregate/per-tenant economics; tenant owners see their tenant; delegated teams/consultants see only allowed amounts and evidence. Exports, jobs and drill-downs enforce the same policy.

## Required acceptance tests

1. A stored estimate or manually declared actual value does not increase verified paid totals.
2. Estimate, commitment, invoice and payment for the same charge are not added together as four costs.
3. Partial payment, refund, credit, dispute, cancellation and duplicate/out-of-order callbacks reconcile correctly.
4. Multiple entities, currencies, annual cycles and historical rates retain original evidence and meaningful scoped totals.
5. Missing/unpriced fees remain unknown; future forecasts identify coverage and expected payment dates.
6. Every register/dashboard/export amount drills down to the same contributing Finance allocations and audit evidence.
7. Cross-tenant IDs, unauthorized cost detail/export, self-approved consultant spending and duplicate allocation are rejected.
8. Approved budget changes, overrun alerts, year-end timezone boundaries and cancelled/superseded cycles are tested.
9. Desktop/mobile/keyboard journeys expose budget, actual settlement and remaining funding clearly.
10. Backfill/import legacy costs preserves provenance and labels unreconciled declarations; it must not manufacture historic Finance payments.

## Delivery order

1. Define canonical cycle mapping, money definitions and source-of-truth/permissions; create the source inventory and migration plan.
2. Implement cost/budget lines and Finance allocation/reconciliation with real disposable-database tests.
3. Build the permit/cycle cost detail and traceable Renewal Finance register/overview.
4. Add dated forecast snapshots, funding alerts, prior-cycle reporting and scoped exports.
5. Verify full journeys, corrections, access and provider/manual reconciliation on staging; update enterprise acceptance evidence.

This requirement remains open until users can trace both future funding needs and actual settled spend through the product. Displaying the two existing manual fields alone does not close it.
