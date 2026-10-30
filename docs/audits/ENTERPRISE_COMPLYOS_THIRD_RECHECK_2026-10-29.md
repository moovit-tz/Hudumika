# Enterprise ComplyOS third recheck — 29 October 2026

**Newer checkpoint:** [renewal-finance recheck](COMPLYOS_RENEWAL_FINANCE_RECHECK_2026-10-29.md) records a green 245-test targeted run, the additional legacy-submission guard, and the newly verified missing spend/budget/forecast UI and Finance reconciliation.

This follows `ENTERPRISE_COMPLYOS_FOLLOWUP_RECHECK_2026-10-29.md`. Product code was not changed in this review. Authenticated API/database probes used disposable tenants, removed afterwards, with no external applications, payments or notifications. Evidence is in `ENTERPRISE_RUNTIME_THIRD_RECHECK_2026-10-29.json`.

## Freshly verified improvements

| Previous issue | Current observed result |
| --- | --- |
| JUNIOR could read a candidate by ID | Detail now returns **403**, matching the restricted list |
| Missing expiry returned valid | Returns **unknown**, unverified |
| Entity creation lost actor | `created_by` now matches the authenticated user's JWT `sub` |
| Invalid lifecycle transition returned 500 | Returns **409** with an invalid-transition message |
| Unapproved legacy renewal completed after date edit | Remains **pending_review**, with no completion timestamp |
| Tenant administrator blocked | Portfolio/tenant metric actions continue to return 200 |
| Foreign certificate link | Still rejected by tenant ownership check |
| Expired permit returned valid | Still returns expired |
| Disabled plan bypass | Old and new capture endpoints return 403 |
| Tenant metrics entity count | Still reconciles to the two fixture source rows |

The observed fixes are material progress. They do not establish every permission, metric or permit workflow is accepted.

## Outstanding issuance integrity gap

The legacy path now differentiates pending from approved, but internal approval is being treated as equivalent to evidence-backed authority issuance.

**Reproduced:** created a certificate and pending renewal → changed expiry (correctly remained pending) → called the ordinary internal approval endpoint → changed expiry again. The renewal became **issued**, with `submitted_at = null`, no authority receipt and no new permit document/result supplied.

`approveRenewal` changes a local review status; it does not require issuer evidence. `updateCertificate` auto-issues approved renewals when the date changes. The new lifecycle state machine therefore does not protect the legacy UI path. The new regression suite explicitly expects this approved/date-edit behavior to succeed; that test expectation does not satisfy the agreed evidence-backed issuance requirement.

Required: separate internal authorization, verified issuer outcome and record correction. Use a shared outcome service on both paths. A manual renewal may be confirmed by an authorized reviewer with issuer/document evidence, but merely approving a task and changing a date must not create legal assurance.

Sources: `apps/api/src/services/comply.service.ts`, `approveRenewal` and expiry-change completion block; `apps/api/src/tests/audit-regression-r01-r07.test.ts`, approved-renewal date-edit test.

## Metrics: fewer zeros, but business definitions still incorrect

Platform measures now query presence, subscriptions, catalogue prices and provider listings instead of initializing all of these to zero. However source inspection found:

- `paid_subscriptions` counts active tenants whose plan is not the literal legacy `starter`, without requiring verified payment. This can count unpaid/free tenants and exclude legacy paying Starter customers.
- MRR sums current `packages.monthly_price`, without billing-cycle/annual normalization, contracted price snapshots, payment/subscription state, seats or add-ons.
- The MRR sum does not group/convert currencies, so USD and TZS catalogue prices can be added into one amount.
- `support_tickets_open` still initializes to zero.

Required: owner-approved reporting definitions and tests that reconcile realistic paid/unpaid/refunded/annual/legacy/multi-currency cases. Nonzero output does not by itself make a financial metric correct.

Source: `apps/api/src/services/enterprise-metrics.service.ts`, platform snapshot queries and initialization.

## Unknown validity still needs an operational policy

The undated fixture now returns `result: unknown`, but `impact_action: none`. That is not a demonstrated operational gate for a permit-dependent activity. Define supported per-operation unknown/stale policy and enforce it in consuming apps; do not imply a missing-date record is allowed to operate simply because no impact action was assigned.

This is a policy/integration gap, not a claim that a real fleet operation was allowed in this probe.

## Enterprise scope remains unfinished

No new frontend consumers/screens were found for the enterprise APIs in this pass. Cross-app source event/worker integration, scoped document/delegation execution, real industry transactions, launch planning UI, consultant/marketplace journeys, supported authority integrations and reviewed international content still require the work documented in the prior reports.

No fresh browser, typecheck/build, full-platform, provider, load or recovery acceptance is claimed. The current changes are still mostly uncommitted. Backend test progress is not Fortune-500 or production certification.

## Verification record

The third targeted run includes the previous ten integrity suites plus `audit-regression-r01-r07.test.ts`: **243 passed, one failed, 244 tests across 11 files**, exit 1, approximately 136 seconds. Runner log: `.tmp/enterprise-recheck-r3-2026-10-29.log`.

The remaining failure is `permit-check-integrity.test.ts > G04 > returns valid for an active certificate`: its fixture has no expiry, while the corrected resolver returns unknown. Update the test to provide a genuinely valid dated/verified-perpetual fixture, and retain a separate unknown-date regression. Do not restore the unsafe assumption to make the test pass. The prior invalid lifecycle-jump test no longer fails in this run.

The existing metrics suites compute platform snapshots in the local development database as well as using disposable tenant records.

## Next work

1. Close the legacy approved/date-edit issuance shortcut using evidence-backed shared transitions.
2. Reconcile platform commercial metrics to actual contract/payment/period/currency sources and expose unknown measures honestly.
3. Connect unknown/expired/revoked check results to explicit app-operation policies.
4. Deliver integrated enterprise UI and one complete authorized capture → check → renewal → verified history journey, then expand the app/industry coverage matrix.
