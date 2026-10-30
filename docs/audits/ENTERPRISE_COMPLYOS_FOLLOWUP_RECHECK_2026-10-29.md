# Enterprise ComplyOS follow-up recheck — 29 October 2026

**Later fixes checked:** see [the third recheck](ENTERPRISE_COMPLYOS_THIRD_RECHECK_2026-10-29.md). The findings below describe the preceding snapshot; candidate detail, null expiry, org actor and HTTP-status fixes have since been verified.

This follows `ENTERPRISE_COMPLYOS_PROGRESS_RECHECK_2026-10-29.md`. Several previously reproduced cases are fixed, but the enterprise implementation remains incomplete and release-blocking gaps remain. The current working tree is still largely uncommitted; no new release/deployment is established.

## Fresh verification

- Ran the ten existing enterprise integrity files plus the new `audit-regression-r01-r07.test.ts`.
- Result: **11 files; 237 tests passed, one failed, 238 total**. Exit 1. All **17** new R01–R07 regression tests passed.
- The failing existing test is `permit-engine-integrity.test.ts > F05 > advances a cycle through the lifecycle`: it still requests `draft → submitted`, now correctly disallowed by the new transition map. Update this fixture to exercise the accepted sequence with evidence and references; do not remove the guard to make it pass. The combined suite is not green yet.
- Repeated authenticated API and real database probes under disposable tenants, with the actual JWT `sub` shape. Evidence: `ENTERPRISE_RUNTIME_FOLLOWUP_2026-10-29.json`.
- Probes cleaned up their tenants and sent no messages, authority applications or payments. Existing metrics tests also compute platform snapshot records in the local development database.
- This pass inspected current routes/services and searched frontend/integration consumers. It did not rerun browser acceptance, full typecheck/build, full-platform tests, provider/host/load or disaster recovery. Earlier browser evidence applies only to the existing ComplyOS pages, not missing enterprise screens.
- Test runner log: `.tmp/enterprise-recheck-r2-2026-10-29.log`.

## Previous findings: observed change

| Previous finding | Fresh result | Assessment |
| --- | --- | --- |
| R01 draft can become issued without evidence | New cycle API rejects the direct jump; evidence/reference guards added | Specific new-engine case closed; legacy issuance bypass still exists below |
| R02 expired permit reported valid | Past-expiry fixture now returns expired | Specific expired-date case closed; missing expiry still misclassified below |
| R03 foreign certificate in cycle | Service rejects foreign certificate with “Certificate not found in this tenant” | Tested certificate-reference case closed; not a blanket certification of every foreign reference |
| R04 tenant owner denied admin functions | TENANT_ADMIN can create a portfolio and compute own-tenant metrics, HTTP 200 | Tested owner paths fixed; full delegated scope enforcement remains pending |
| R05 entitlement/JUNIOR capture access bypass | Disabled plan gets 403; JUNIOR list gets 403 | Partial: by-ID detail still returns 200 to that same JUNIOR |
| R06 missing actor | Launch case, new cycle and candidate preserve the JWT actor | Partial: org entity creation still returns created_by null |
| R07 entity count hardcoded zero | Tenant snapshot reports two entities, matching two source rows | Tested count fixed; platform subscription/MRR/provider measures still contain placeholder zeros |

## Still broken / reproduced

### F1 — High: legacy date editing can still certify issuance without evidence

The hardened `comply_lifecycle_cycles` service is not the only renewal path. Using the existing ComplyOS certificate/renewal API:

1. Created a certificate expiring `2030-12-31`.
2. Opened a renewal; it was pending review.
3. Patched only the expiry to `2031-12-31`.
4. The renewal became **issued**, with no approval, submission, authority receipt or evidence; `approved_at` and `submitted_at` remained null.

The same-date fix remains effective, but any actual date change still triggers issuance in `ComplyService.updateCertificate`. This is not sufficient to distinguish record correction from an authority-confirmed renewal. The legacy UI still uses this domain while the new lifecycle API has separate state.

Required: one authoritative outcome service across legacy/new paths. Date corrections need audit history and must not certify renewal. Verified issuance needs an authorized transition and reviewed issuer/result evidence.

Source: `apps/api/src/services/comply.service.ts`, `if (expiryActuallyChanged)` completion block around line 1053.

### F2 — High: candidate detail bypasses the list permission guard

The same JUNIOR identity received **403** from `GET /v1/permit-capture` and **200** from `GET /v1/permit-capture/:id`, returning the candidate's metadata. The fixture represented an unassigned confidential qualification record.

The list has `requireAdmin`; the detail handler does not have an equivalent action/record scope check. Knowing an ID must not grant access that the list deliberately denies. This probe establishes metadata disclosure, not private file download.

Required: a shared policy on list/detail/download/history/actions and on the source document, with explicit permitted employee/industry-app scopes where appropriate. Audit other check/candidate endpoints for matching bypasses.

Source: `apps/api/src/routes/permit-check.routes.ts`, list/detail handlers near lines 31–41.

### F3 — High: missing expiry still produces a valid operational check

A fixture with stored status `active`, null expiry and no verified perpetual-validity evidence returned **valid**, **unverified**, **impact_action: none**. The new derivation fixes expired dates but still treats an active row with no expiry as valid.

Required: include the explicit validity kind and assurance/evidence in resolution. Unknown date is unknown/review-required unless a non-expiring permit type and supporting evidence justify perpetual validity. Align the shared check contract with the vault's corrected unknown state and the actual operation's impact policy.

Source: `apps/api/src/services/permit-check.service.ts`, `deriveCertValidity` around lines 17–39.

### F4 — Audit gap: org-model API still drops the actor

Creating a legal entity with a proper authenticated TENANT_ADMIN JWT succeeded but persisted **created_by: null**. Launch/cycle/capture routes now use `sub`; org-model mutations still read `request.user.id` (create/update/entity-industry/site paths).

Required: finish the actor conversion across all routes and audit calls. Add authenticated API tests for entity/site creation and assignments rather than relying on service calls supplied with a fixture ID.

Source: `apps/api/src/routes/org-model.routes.ts`, lines 124, 156, 244 and 286 at inspection.

### F5 — Reporting gap: some enterprise measures remain fabricated zeros

Tenant entity/site/permit counts and platform permit/queue counts have been connected to source queries. However platform `active_users_7d`, subscription counts, paid subscriptions, MRR, providers, marketplace engagements and open support tickets still initialize as zero in `computePlatformSnapshot`. These cannot be presented as measured business facts.

Required: implement source-reconciled metrics with accepted definitions, or mark unavailable/unimplemented explicitly. A partial accurate dashboard is preferable to false complete-looking financial/operational reporting.

Source: `apps/api/src/services/enterprise-metrics.service.ts`, platform snapshot initialization.

### F6 — API contract: expected workflow rejection returns HTTP 500

The direct draft → issued request is now prevented, but the API returns **500 Internal Server Error** for the expected invalid state transition. This should be a structured 400/409 domain rejection, preserving consistent frontend error handling and operational error classification.

Source: `PermitEngineService.updateCycle` and its route error mapping.

## What remains unimplemented or unaccepted

No new evidence was found that closes the major user-facing/integration gaps from the previous report:

- New enterprise screens and navigation: entity/site industry administration, permit capture/review, launch planner, consultant mandates and enterprise reporting.
- Actual intake/event/worker/consumer wiring across Hudumika apps, including source-document permission checks, classification, backfill and duplicate/retry reconciliation.
- Organization/field/delegation policies consistently used by real app reads, exports, jobs and delegated document/permit actions.
- Executable industry-specific business workflows beyond generic definitions/instance/transaction tracking.
- A complete, unified evidence-backed authority renewal/payment/status pipeline; manual adapters remain distinct from real authority submission.
- Reviewed multi-country/subnational legal content, fee/penalty schedules and supported integrations.
- Usable provider/client marketplace journeys, real participant verification, approved settlement/disputes and operational handover.
- Accurate full metric definitions, workload/soak tests, region/data-placement acceptance, monitoring, failover/restore and independent assurance.

No completion percentage is assigned. Schema/services, API guard fixes, integrated UI, cross-app business execution, provider acceptance and enterprise operating proof remain different milestones.

## Next required closure sequence

1. Fix F1–F4 with real API-level negative tests, preserving the now-working transition/expiry/ownership/owner-role fixes.
2. Return a domain error for invalid state; update the old lifecycle test to the valid sequence and obtain a green combined suite without weakening safeguards.
3. Complete metric definitions or explicitly remove unavailable measures from factual displays.
4. Deliver one full authorized UI-to-worker-to-permit-history vertical slice, then extend through the coverage matrix.
5. Continue industry/provider/consultant and enterprise acceptance work; do not report all ten phases complete based on the current backend test count.
