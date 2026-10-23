# NexusHR security, SaaS and production-readiness audit

**Historical audit:** remediation and current verification are documented in [FIX_VERIFICATION_2026-10-23.md](FIX_VERIFICATION_2026-10-23.md). The original failures below are retained as evidence, not the current defect status.

Date: 2026-10-23. Tested checkout: bcdc86e6 plus existing uncommitted changes. Verdict: RED — not approved for unrestricted production HR/payroll use.

This is a targeted source/API/database audit plus browser smoke verification, not an exhaustive penetration test, legal/payroll compliance certification or production-environment assessment. No application fixes or production configuration changes were made. Tests use disposable local tenants; fault injection did not send funds or invoke a bank provider. Existing unrelated working-tree changes were preserved.

## Release blockers and actionable findings

### P1 — unrelated managers can read salaries through alternative endpoints (reproduced)
`GET /v1/hr/staff/:id` redacts pay for an unrelated MANAGER, as existing tests intend. However, the same JWT receives the employee's salary from `GET /v1/hr/roster` and pay history from `GET /v1/hr/employments/:id/compensation`. A disposable employee salary of 2,500,000 was returned through roster; compensation history returned 2,600,000 after an admin-created record. This is an intra-tenant confidentiality/authorisation bypass, not a demonstrated cross-tenant leak.

Sources: apps/api/src/routes/nexushr.routes.ts:44 and :76; apps/api/src/services/nexushr.service.ts:33 and :133. The similarly broad payroll-vs-contract route should be included in remediation coverage. Fix by applying one resource/field-level pay-access policy across list/detail/history/report/export routes and adding negative tests for unrelated managers and peers. Logging access does not authorise it.

### P1 — payroll GL journal survives rollback of the enclosing operation (reproduced)
`POST /v1/payroll/runs/:id/mark-paid` opens withTenant but calls GLService.post without supplying trx. A fault injected immediately after the actual GL posting returned HTTP 500 and left the payroll run APPROVED, while one PAYROLL journal entry remained committed. The expected zero-journal rollback assertion failed. All writes were isolated to a test tenant and cleaned up.

Source: apps/api/src/routes/payroll.routes.ts:580. Pass the same transaction into GL posting, lock/serialize run transitions, and test simultaneous calculate/approve/mark-paid plus crash/retry/rollback. Do not infer duplicate-post protection from status checks alone. Financial reconciliation is required before repairing any affected real records.

### P2 — negative compensation is accepted and updates live salary (reproduced)
An administrator POSTed base_salary=-100; the route returned 200 and stored -100.00. addCompensation uses Number(data.base_salary) with no positive/finite/range validation before insert. Because effective dates in the past update users.basic_salary, invalid compensation propagates to the payroll source. Calculation excludes non-positive salaries and can therefore omit the employee rather than presenting a valid pay result.

Sources: nexushr.service.ts:149–190; payroll.routes.ts:348–353. Add runtime validation and appropriate DB constraints; cover zero policy, negatives, non-finite/oversized values, dates, currency and pay frequency, duplicate/concurrent histories and non-overlapping effective ranges.

### P1 candidate — payroll salary selection is not period-effective (source finding; no dedicated runtime reproduction in this audit)
Payroll calculation takes basicPay from users.basic_salary (payroll.routes.ts:419). Compensation writes update that projection only when effective <= today's date (nexushr.service.ts:186). The inspected payroll path does not resolve the compensation record effective for the run period. Historical runs/recalculations can use current salary, and future-dated changes need an activation/period-resolution mechanism. Resolve base pay/currency and employment eligibility against explicit run-date policy and test past/future/mid-period changes, proration and currencies. The precise business policy requires owner acceptance.

## Additional security/governance work
- Confidential cases, employment/document downloads and other HR endpoints frequently use broad management roles. Cases explicitly scope access to management tenant-wide. This is a policy/design risk requiring HR-only/case-owner/reporting-line/document classifications and end-to-end tests; this audit does not claim every such endpoint has a reproduced exploit.
- Payroll calculation, approval and mark-paid can be performed by overlapping roles; no creator-versus-approver check is visible in the inspected approval route. Validate maker/checker requirements and configure/enforce them server-side where required.
- Compensation reads/writes and other sensitive alternatives need consistent PII access auditing. Existing nonblocking PII logging is a foundation, not proof every sensitive access is recorded/delivered.
- Device push credentials are sent in query parameters. The app logger serializes request URLs; ensure token-bearing URLs are redacted and proxies/access logs are configured consistently. Credential rotation/replay resilience and real device acceptance remain unverified. Deleted-device credential revocation passed.
- Existing device ingestion acknowledges OK after processing errors and stores a sync-log error. Verify a durable recovery/replay procedure so acknowledged punches cannot silently disappear. No data-loss reproduction performed here.
- Tenant-wide roster/cases and other collections need pagination/query-plan/capacity review for large employers. No enterprise load threshold certified.

## What is implemented and verified
Existing six integration suites: 41 passed, 0 failed, 0 skipped (exit 0).
- HR authorisation: 20 tests, including ordinary-role refusals and retirement of legacy payroll paths.
- Staff detail access tiers/reporting lines: 11 tests.
- Recruitment pipeline: 4 tests.
- Screening/offer e-sign: 3 tests.
- Recruitment cross-tenant isolation: 1 test.
- Leave overlap: 2 tests.

New audit regression suite: 8 tests, 4 passed, 4 failed, 0 skipped (exit 1).
Failures: roster salary confidentiality; compensation-history confidentiality; negative compensation rejection; payroll GL rollback.
Passes: deleted-device credential revocation; unauthenticated/CUSTOMER staff-access denial; tenant-disabled NexusHR denial; existing token rejected after tenant suspension. The unauthenticated/CUSTOMER assertions are combined in one test.

`npx tsx src/scripts/check-payroll-engine.ts`: exit 0; existing arithmetic/reference-payslip checks passed. This does not certify rates as current or validate payroll route lifecycle/security.

Source-confirmed foundations: authentication and NexusHR entitlement hooks; explicit tenant queries/withTenant; UUID checks; server role gates; self-versus-other payroll checks; effective-dated tax/contribution settings; refusal to recalculate approved/paid runs; attendance/leave services; recruitment and offer-signing; cases, benefits and checklists; shared Ondi identity/admin navigation; seat-licence, app-usage/maintenance and tenant enablement infrastructure. Feature existence is not complete module acceptance.

## SaaS support readiness
Partially ready, not certified.
- Tenant isolation and account/app access restrictions have meaningful passing tests, including the added disable/suspend probes.
- Middleware includes plan/add-on grants, maintenance status, API-key scope, app usage checks and restricted-app seat assignments. The new tests do not cover every plan/add-on/seat/downgrade/renewal path.
- Ordinary employees have an employee hub; sensitive payroll endpoints have a distinct role set. Alternative HR routes currently undermine pay confidentiality.
- Pending: tenant onboarding and default policies, seat assignment/revocation, downgrade and billing failure behaviour, data export/offboarding/retention, support-access approval/auditing, entity/branch permissions and enterprise-volume performance.
- Do not market this audit as multi-country payroll validation. Leave statutory generation explicitly reports TZ-only defaults when unsupported; payroll supports configured jurisdictions, but each jurisdiction/rate vintage and statutory export needs specialist acceptance.

## UI smoke checks and improvement work
Browser demo login completed; workforce dashboard and payroll route rendered at desktop. Employee self-service rendered at 390px with no page-level horizontal overflow in the checked view. These are SuperAdmin/self smoke checks, not complete employee/manager/finance role journeys.
Screenshots: payroll-desktop.jpg and self-service-mobile.jpg.
Mobile self-service summary cards consume substantial vertical space; compact them to prioritise actions while preserving readable content. Verify keyboard/screen-reader use, pagination, all form/error states and permission-aware dashboard requests. A local Google sign-in origin/client-ID error was observed during the initial Ondi sign-in view; password/demo sign-in worked afterward. Validate deployed OAuth allowed origins and redirects separately; this does not establish a NexusHR-specific OAuth vulnerability.

## Pending production release gates
1. Fix/retest all reproduced defects and period-effective pay policy.
2. Complete HR/document/case/payroll resource permissions and maker/checker acceptance.
3. Extend concurrency/fault-injection coverage across calculation, approval, overtime allocation and posting; reconcile any affected production data through reviewed procedures.
4. Run complete relevant build/lint/API/frontend regression checks and review dependency/security scan findings; this audit did not run the full platform build, exhaustive suite or penetration test.
5. Verify staging employee, manager, HR administrator, finance and support journeys, including onboarding to offboarding, exports/documents and negative access paths.
6. Accountant/payroll specialist acceptance of configured rates, rounding, proration, leave/overtime, statutory outputs and bank files. Provider/SMTP/device/Cloud/eSign acceptance in their actual required environments.
7. Capacity/load/SLO evidence, backup restoration and recovery/rollback rehearsal, alerts/on-call routing, secret rotation, retention/deletion and security configuration review.
8. Declare supported countries, employer sizes, hosting configuration, integrations and roles before issuing a version-specific release approval.

## Priority plan
First close the salary access bypasses and payroll transaction boundary. Validate and repair compensation input/history semantics. Then finish permission/approval policy, payroll concurrency/period/currency tests and real staging journeys. Finally complete operational, SaaS-commercial and domain acceptance evidence. No percentage score is assigned because open critical gates make a 100% production green light indefensible.

## Reproduction and evidence
- Existing suites: npm run test -w apps/api -- src/tests/hr-authorization.test.ts src/tests/hr-staff-access.test.ts src/tests/hr-rls.test.ts src/tests/hr-leave-overlap.test.ts src/tests/hr-recruitment-pipeline.test.ts src/tests/hr-screening-and-esign.test.ts
- New regressions: npm run test -w apps/api -- src/tests/nexushr-readiness-audit.test.ts
- Computation checks: cd apps/api; npx tsx src/scripts/check-payroll-engine.ts
- Root typecheck: an earlier audit run completed with exit 0. A final repeated run was still processing at the last report update; its result is not counted as a final pass. No application code was changed during this audit.
Evidence logs in the workspace: nexushr-audit-tests.log, nexushr-audit-probes.log, nexushr-payroll-engine.log, nexushr-audit-typecheck.log. Test-derived IDs/data are synthetic. The regression suite is intentionally red on current application code and remains available for remediation.
