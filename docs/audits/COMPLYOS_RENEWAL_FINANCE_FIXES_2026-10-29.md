# ComplyOS Renewal Finance fixes

29 October 2026. Changes address the defects reproduced against baseline `0e38c9e8`. They are local working-tree changes; no deployment or commit was requested.

## Implemented

- Corrected the entitlement key to `complyos`; entitled tenant owners can access the API.
- Added request validation for IDs, dates, currencies, categories and amounts, and tenant ownership checks for cost-line references and budget cycles.
- Allocations now require an existing, same-tenant posted supplier bill or recorded supplier payment, in the same currency as the cost line. The cycle must match the cost line. Random IDs, foreign records, draft/void bills and unsupported record/type combinations are rejected.
- Transaction locks serialize allocation checks against both the cost line and Finance source. Allocations across different cost lines cannot exceed the source amount. Allocated cost amounts/currencies cannot be silently edited.
- New verified allocations record reconciliation actor/time and use the Finance source date. Reports recheck source existence and bill status, so voided/deleted sources stop counting. Historical unreconciled allocations remain visible as unverified and are excluded from spending totals.
- Remaining funding is estimated cost less verified payments; unpaid commitments are retained. Open commitments and due/overdue payables reduce after payments. Overview and forecast snapshots use the same calculations, with original currencies kept separate. Forecast windows include dated outstanding charges, including overdue charges; undated charges remain visible in the cycle register.
- Removed nested report transactions to prevent connection-pool exhaustion during concurrent reports. Source lookups are restricted to linked Finance IDs rather than loading the entire Finance ledger.
- Budget requests retain the current approved budget until another administrator approves its replacement. Requesters cannot approve their own requests. Creation/approval share a consistent cycle lock order.
- Added full-page forms to add costs, request budgets and link existing Finance records. Added second-administrator approval/rejection controls, a searchable Finance picker and links to the source bill.
- Added explicit error/retry states instead of silently showing empty data. Register and detail tables become labelled cards on narrow screens; amounts are not horizontally clipped. Detail currency selection prevents mixed-currency summation.

## Verification

- **12 targeted integrity suites / 261 tests passed.** Log: `.tmp/renewal-fix-regression.log`.
- **16 Renewal Finance tests passed again after the final backend changes.** Log: `.tmp/renewal-fix-final-focused.log`. Coverage includes nonexistent/foreign/draft/currency-mismatched sources, foreign cycles, partial payments, unpaid forecasts, budget separation of duties, concurrent source allocation, voided evidence and 12 simultaneous reports.
- **Web TypeScript check passed:** `npx tsc --noEmit -p apps/web/tsconfig.json`.
- Design-system contract check passed (19 checks); encoding and workflow-trigger checks passed.
- Real browser flow passed: create TZS 100,000 cost; request TZS 120,000 budget; approve as a different administrator; link posted bill and TZS 40,000 recorded payment; confirm TZS 60,000 remaining/open commitment. Self-approval controls, explicit failure display and Retry were verified.
- Register and detail checked at 1440px and 390px, with no document-width overflow or browser JavaScript errors. Evidence: `COMPLYOS_RENEWAL_FINANCE_FIX_BROWSER_2026-10-29.json` and `renewal-finance-fixed-*.png` screenshots.
- Disposable tenants were removed. No real payment, external application or message was sent.

## Remaining limits

The full repository `npm run typecheck` is still blocked by errors in other modules: duplicate `quotationRoutes` imports, missing `TenantDb` exports, consultant/marketplace route typing, launch-planner date typing and existing test typing. Its output reports no errors in the changed Renewal Finance files. See `.tmp/renewal-fix-typecheck-final.log`. A clean full-platform build/production certification is therefore not claimed.

The existing Finance model does not provide an authoritative supplier refund/credit settlement record or a currency-bearing expense settlement suitable for this allocation contract. Those links are explicitly rejected, rather than fabricating payments or reducing verified spend from manual declarations. Supporting those workflows requires real Finance domain support first. Customer invoice receipts are not supplier renewal spending.

No FX conversion is performed. Totals remain in their original currency. No deployed provider, sustained production load or backup/recovery acceptance was performed in this scope.

The pre-existing `apps/web/src/index.css` change was preserved and is not part of this fix.
