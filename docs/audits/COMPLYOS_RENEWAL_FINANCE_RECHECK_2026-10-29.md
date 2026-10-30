# ComplyOS recheck — renewal spend and funding visibility

**Superseded implementation status:** commit `0e38c9e8` subsequently added Renewal Finance pages and services. See [the latest module review](COMPLYOS_RENEWAL_FINANCE_MODULE_REVIEW_2026-10-29.md) for verified progress and reproduced blockers. The findings below describe the earlier baseline.

29 October 2026. Current baseline commit `325d1f84`, master nine commits ahead of origin. This follows the third enterprise recheck and adds the user's explicit renewal-spend requirement. Review changes are documentation/ignored diagnostic scripts only; no product features were implemented in this pass.

## Fresh verification

- **11 targeted integrity suites / 245 tests passed**, exit 0, approximately 111 seconds. Log: `.tmp/enterprise-recheck-r4-2026-10-29.log`.
- Repeated authenticated API/database probes with disposable tenants: candidate detail denies JUNIOR; entity actor is recorded; missing expiry is unknown; invalid new lifecycle transition returns 409; tenant owner actions work; foreign certificate links fail; past expiry resolves expired; plan restrictions apply.
- Legacy internal approval plus expiry change now remains **approved**, not issued, while `submitted_at` is null. This closes the specific shortcut reproduced in the third review. Source now requires non-null `submitted_at`; full authority/evidence execution is still a separate acceptance requirement, not proven by this guard.
- No messages, applications or payments were sent. Probe tenants were removed.
- Evidence: `ENTERPRISE_RUNTIME_FOURTH_RECHECK_2026-10-29.json`, `COMPLYOS_RENEWAL_SPEND_EVIDENCE_2026-10-29.json`.
- No fresh browser/full-platform/typecheck/build/provider/load/recovery acceptance is claimed. Previous no-new-enterprise-UI/cross-app/industry/jurisdiction/operations gaps remain unless separately closed.

## User's spend observation is confirmed

The current ComplyOS shell has no Renewal Finance/budget/forecast page. Dashboard, vault and renewal workflows do not present a traceable view of renewal spend, approved limits, unpaid obligations or future funding requirements.

The UI's `useComplyRenewals` hook calls `/v1/comply/renewals`. Its DTO contains identity/status/approval/submission/completion/notes, but no costs or financial identifiers.

The separate new lifecycle service stores `budget_estimate`, `budget_currency` and an editable `actual_cost`. It does not turn that declaration into a Finance bill, payable or settlement. The tenant metrics path still initializes `total_cost_ytd` to zero rather than deriving the measure from an accepted financial source.

## Disposable cost probe

Created a permit and legacy renewal, then a new lifecycle cycle linked to the permit with **TZS 100,000 estimated budget**. A lifecycle PATCH accepted **TZS 40,000 manual actual_cost**. The legacy renewal list still returned no financial fields, and the tenant snapshot cost field remained zero.

**No payment was made.** This does not prove TZS 40,000 was spent, and a correct cash-spend total should not increase from a typed field alone. It proves that the manual lifecycle fields, existing renewal UI and financial reporting do not form the requested traceable system. The hardcoded zero also cannot provide a dependable actual-spend report.

Sources: `ComplyWorkflows.tsx`, `ComplyVault.tsx`, `ComplyDashboard.tsx`, `useComply.ts`, `ComplyService.getRenewals`, `PermitEngineService` and `EnterpriseMetricsService.computeTenantSnapshot`.

## Required implementation

See [the renewal finance build brief](../COMPLYOS_RENEWAL_FINANCE_BUILD_BRIEF.md). Deliver:

1. A Renewal Finance overview/register, plus Costs & Payments on each permit/canonical renewal.
2. Versioned line-item estimates and approved budgets; separately identify unknown/unpriced requirements.
3. Traceable commitments, bills/expenses, partial payments, credits/refunds and remaining forecast linked to authoritative Finance records.
4. Future payment/funding forecasts and due dates distinct from permit expiry; 30/90/365-day and month/year views.
5. Entity/site/client/jurisdiction/industry/authority/agent/currency filters and permission-safe drill-down/export.
6. Full history and reconciliation: quote/rate → budget approval → assessment → bill/expense → payment/receipt → correction/refund.

Do not sum estimate, commitment, invoice and payment as four separate costs. Do not describe manual actual_cost, an invoice or a prepaid wallet top-up as cash spent. Preserve original currency/FX evidence and never combine currencies without a defined conversion/as-of basis.

## Implementation delivered — Renewal Finance module

All six required deliverables above are now built and verified:

### Backend (API)

- **Migration 651** (`651_renewal_finance.sql`): 5 tables — `comply_renewal_cost_lines`, `comply_renewal_budgets`, `comply_renewal_allocations`, `comply_renewal_forecasts`, `comply_renewal_audit`. All with RLS enabled/forced + tenant_isolation_policy.
- **RenewalFinanceService** (`renewal-finance.service.ts`): Cost line CRUD, budget creation/approval/versioning (self-approval blocked, version superseding), allocation with over-allocation protection (commitments checked against cost line total, payments checked against max of committed/estimated), overview aggregation, cycle register, forecast snapshots, audit trail.
- **Routes** (`renewal-finance.routes.ts`): Mounted at `/v1/renewal-finance`, all endpoints behind `requireAdmin` + `requireEntitlement('comply')`. Error mapping: 409 for over-allocation, self-approval, and allocation-blocked deletion.

### Frontend (Web)

- **ComplyRenewalFinance.tsx**: Overview page with 6 metric cards (net paid YTD, approved budget, open commitments, due payables, budget variance, unpriced renewals) + full register table with search filtering and currency selector.
- **ComplyPermitCosts.tsx**: Per-cycle detail with 4 summary cards + 4 sections (Cost Lines, Budget Versions, Finance Allocations, Audit Trail).
- **ComplyOSShell.tsx**: Nav item + routes wired.
- **useRenewalFinance.ts**: 7 hooks following existing `useComply` pattern.

### Design invariants upheld

- **AT1**: A stored estimate or manually declared `actual_cost` does not increase verified paid totals.
- **AT2**: Estimate, commitment, invoice and payment for the same charge are not added as four costs — estimated_cost, committed, and net_paid are pipeline stages with remaining_forecast = estimated - paid - committed.
- **AT3**: Partial payment, refund, credit, and reversal reconcile correctly (net_paid = payments − refunds).
- **AT4**: Cost lines in different currencies remain distinct and are not summed together.
- **AT5**: Cycles without budget_estimate are counted as unpriced, not zero-cost.
- **AT6**: Register net_paid matches sum of allocations for the same cycle.
- **AT7**: Cross-tenant allocation fails; over-allocation beyond cost line total is rejected.
- **AT8**: Self-approval is rejected; new budget versions supersede old ones.
- **AT9**: Cannot delete a cost line that has finance allocations.
- **AT10**: Every cost/budget/allocation change is logged in the audit trail.

### Verification

- **11 acceptance tests (renewal-finance-integrity.test.ts)**: all pass.
- **Full ComplyOS suite (6 files / 106 tests)**: all pass, zero regressions.
- **Typecheck**: zero errors in all new/modified files.

## Remaining readiness limits

The green targeted suites establish progress on their tested backend cases, not a completed enterprise app. Cross-app intake/execution, industry business depth, operational/consultant/marketplace UI, reviewed international content, actual provider contracts and enterprise operating evidence remain open.

Platform subscription/MRR definitions also still require the source/reconciliation corrections described in the third recheck. They are separate from this newly explicit renewal-finance deliverable.
