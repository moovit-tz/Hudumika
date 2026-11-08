# FinOps visual review

Scope: configured app-color metric emphasis, light/dark behavior, and responsive page rendering.

- Source reviewed: 53 routed page files, including record-specific screens.
- Browser sweep: 60 static routes at desktop/light (1440px) and mobile/dark (390px), 120 checks.
- Follow-up: Multi-Entity Accounting and Cash Flow rechecked in both layouts after fixes, four checks.
- Browser exceptions: none. Horizontal page overflow: none.
- API regression coverage: 15 tests passed, including tenant-isolated entity statistics and empty-workspace cash flow.
- Design-system contract checks passed. Full repository typecheck status is recorded in the JSON evidence when finished.

## Changes

Primary metrics on 29 shared-metric pages and eight custom layouts now use the app-scoped primary surface and contrast-safe foreground. Dark mode uses the app shell’s existing lightened accent. Other applications retain their styles. Error and loading metrics remain neutral, and semantic warning/risk indicators remain distinct.

Fixed two API failures discovered during the sweep:

1. Entity statistics referenced nonexistent `finance_entities.is_active`; the real model is `accounting_entities.active`.
2. Cash flow generated an empty SQL `IN ()` for new workspaces without cash accounts; these now return zero observed cash totals.

## Limits and retained observations

Record-specific detail screens were source-reviewed; the disposable workspace did not contain every invoice, bill, industry job, or signed document needed to navigate all parameterized routes. This was a visual/read-only route review, not verification of posting, payment, approval, or tax-filing workflows.

The first browser sweep also observed intermittent 500 responses on additional list/configuration endpoints. All 13 corresponding endpoint regression checks subsequently passed; the initial observations remain in `finops-visual-review.json` rather than being erased. The two reproducible failures above passed dedicated browser rechecks.

Evidence: `finops-visual-review.json`. Regression tests: `apps/api/src/tests/finops-page-review-regression.test.ts`. Browser runner: `scripts/finops-visual-smoke.mts` (run from `apps/api` with `NODE_ENV=test`).
