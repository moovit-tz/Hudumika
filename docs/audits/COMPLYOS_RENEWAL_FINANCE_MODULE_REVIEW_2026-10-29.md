# ComplyOS Renewal Finance — implementation recheck

**Follow-up:** the reproduced Renewal Finance defects have now been addressed locally. See [fixes and verification](COMPLYOS_RENEWAL_FINANCE_FIXES_2026-10-29.md), including remaining Finance-domain and repository-wide build limitations. This review below records the pre-fix baseline.

29 October 2026. Baseline: `0e38c9e8`. Review only; no product code changed. Existing modification to `apps/web/src/index.css` was preserved.

## Progress verified

Renewal Finance now has a sidebar entry, register/overview at `/complyos/renewal-finance`, and cycle detail at `/complyos/renewal-finance/:cycleId`. Migration 651 is applied. Backend services cover cost lines, budget versions, allocations, forecasts and audit entries. This supersedes the previous review's finding that no dedicated page existed.

Twelve targeted API integrity suites passed: **256 tests**, approximately 113 seconds. Log: `.tmp/enterprise-recheck-r5-2026-10-29.log`. These tests do not establish production readiness: the additional probes below reproduce defects despite the green suite.

## Blocking findings

1. **Entitled owners cannot use the API.** `apps/api/src/routes/renewal-finance.routes.ts:17` requires `comply`, whereas the configured package feature is `complyos`. An enterprise tenant owner receives 403 PLAN_UPGRADE_REQUIRED. Browser requests reproduce this on both new pages.
2. **Declared allocations are treated as verified spending.** `apps/api/src/services/renewal-finance.service.ts:333` validates the cost line but does not validate the referenced Finance record. A random nonexistent supplier bill was accepted, then a random nonexistent payment was accepted and increased net paid to TZS 100,000. Both allocations were unreconciled. No money was actually paid. The system must validate tenant ownership, record existence, settlement/status, currency and available allocatable amounts against Finance before recognizing spending.
3. **Funding and payable calculations contradict each other.** A TZS 100,000 unpaid commitment produced remaining forecast zero because commitments are subtracted from estimates (`renewal-finance.service.ts:463,555`). After the declared payment, open commitments, due payables and overdue payables still each showed TZS 100,000. Outstanding cash needs must include unpaid commitments; payables must reflect verified settlements rather than gross cost lines.
4. **Cross-tenant cycle references are accepted by the allocation service.** An allocation owned by tenant A and linked to A's cost line accepted tenant B's cycle ID. Validate the cycle's tenant and equality with the cost line's cycle within the write transaction. This reproduces an integrity defect in the service; the entitlement failure currently blocks normal API access and does not excuse the missing checks.
5. **Failures appear as empty records.** Hook errors become null/empty data without visible error handling in the pages. The seeded cycle displayed “No cost lines recorded” despite its requests failing with 403. Explicit loading, access-denied, retry and empty states are required.

## Further pending work

- The reviewed pages expose read-only views, without a usable end-to-end UI to add cost lines, create/approve budgets or link Finance records and receipts. Empty states tell users to add/link records without corresponding actions.
- Cycle detail aggregates amounts under the first cost line's currency; mixed-currency behavior needs explicit currency grouping or a documented conversion basis. This is a source finding, not a completed runtime currency scenario test.
- Desktop and 390px mobile routes render without JavaScript crashes. Document width stayed within the viewport, but the mobile register visibly clips table content. Absence of a page scrollbar does not establish usable responsive content.
- Add negative route/service tests for real and nonexistent Finance records, foreign cycles, settlement reconciliation, unpaid commitments, currency differences and concurrent allocation limits. Current service-level green tests do not prove verified spending.
- Prior enterprise coverage, jurisdiction/industry content, cross-app execution and operational acceptance remain separate work; this pass does not certify them.

## Evidence and limits

`COMPLYOS_RENEWAL_FINANCE_MODULE_EVIDENCE_2026-10-29.json` records API responses, service probes, desktop/mobile page text and failed requests. Four `renewal-finance-module-*.png` screenshots capture the pages. Both disposable tenants were removed (`cleaned: true`). No external submission, payment or message was made.

No fresh full-platform build/typecheck, sustained load, deployed provider, backup/recovery or production acceptance is claimed in this review.
