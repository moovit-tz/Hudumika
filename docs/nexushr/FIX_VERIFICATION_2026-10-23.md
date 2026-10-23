# NexusHR remediation and release evidence

Date: 23 October 2026. Scope: the NexusHR findings in SECURITY_AND_PRODUCTION_READINESS_2026-10-23.md. Changes are local, uncommitted and not deployed. This report supersedes that audit's defect status, not its historical evidence.

## Implemented

| Finding | Actual change | Evidence |
| --- | --- | --- |
| Salary exposed to unrelated managers | Shared pay visibility for roster/history; payroll comparison limited to payroll roles; restricted UI and pay-access records | Original failing regressions now pass |
| GL remains after failed payroll payment | Same database transaction for payroll and GL; row locks on transitions | Fault raised after actual journal insertion leaves zero journal entries; concurrent payments produce one journal |
| Invalid compensation accepted | Runtime validation, finite/nonnegative SQL constraints, strict dates/currencies/frequencies, employee lock and chronological history insertion | Negative/malformed/duplicate/concurrent/backdated cases |
| Current salary used for historical payroll | Salary resolved for run dates; calendar-day proration by default; annual amounts converted to monthly | Historical/future and mid-month integration tests |
| No separate approver | Creator and last calculator cannot approve their own run; enforced in API and reflected in UI | Same user denied; independent finance approver succeeds |
| Untraceable payroll policy | Calculation stores salary basis, currency, tax bands and contribution configuration; comparison uses saved proration policy | Mid-period comparison produces zero variance for the correctly calculated payslip |
| Cloud mirror bypass | Personnel files moved into a managed, restricted HR drive; ordinary staff and stale shares cannot override HR permissions; public links/invites revoked; anonymous/signed URL paths blocked | Real storage byte-level test plus existing Cloud security suites |
| Broad confidential HR access | Admins or explicit `hr.cases.manage` / `hr.documents.manage` permissions; matching Ondi role editor and NexusHR route/navigation gates | Generic manager denied, explicit HR delegate permitted; employee can read own documents but not a peer's |
| Attendance error acknowledged as success | Failed persistence returns 503 with retry guidance; per-device lock and exact punch deduplication | Injected storage failure and simultaneous retries |
| Device credential lifecycle | Rotation endpoint, one-time display, tenant scoping, old credential rejection; production HTTPS required; header token supported | Old/new/deleted credentials and concurrent retry tests |
| Unbounded roster/case lists | Bounded server pages, validated page sizes, real totals and UI page controls; roster child queries limited to page employee IDs | Pagination/oversize rejection integration test |
| Fabricated staff profile | Removed sample identity/bank values, invented ratings/leave/attendance, peer counts, skills, documents/assets and salary-history modals; controls open live records | Browser verifies real tabs and missing values |
| Oversized mobile summaries | Compact two-column mobile cards with wrapping text | 390px browser: four cards approximately 166 × 138px; document width equals viewport |
| Misleading employee hub | Removed hardcoded compliance percentage, holiday, shift times and weekly target; real holidays, attendance, own documents, authenticated file download; failures surfaced | Browser checked actual data and own-document navigation |
| Dependency patches | Compatible lockfile updates for Fastify, sanitize-html, brace-expansion and ip-address | Production dependency findings reduced from 17 to 13; unresolved findings remain below |

Owner confirmed calendar-day proration and a separate approver. The policy endpoint also supports period-end salary selection for explicitly configured tenants. It does not disable separate approval.

Hourly/biweekly calculations and non-TZS payroll fail explicitly until supported calculation/statutory policies exist. Missing contribution configuration or required residency tax bands also blocks calculation. Blocking unsupported payroll prevents a false successful result; it does not implement those pay cycles or certify other countries.

## Database deployment

Forward migrations: `619_nexushr_payroll_integrity.sql`, `620_nexushr_payroll_policy_snapshot.sql`, `621_validate_nexushr_compensation.sql`, `622_nexushr_confidential_cloud_drive.sql`, `623_enforce_personnel_cloud_boundary.sql`. Applied and verified in the local non-production database. All five compensation/salary checks validated; zero invalid compensation rows were found locally. No historical salary values were rewritten. Migration 622 preserves file IDs, hierarchy and stored bytes while moving personnel files out of the tenant-wide Business Records drive; it revokes old file grants, public tokens and invitations. HR access is now granted through the dedicated Ondi permission rather than ordinary Drive membership. Migration 623 enforces this classification at the database boundary for every writer and prevents moving personnel records back into an unrestricted drive. A rollback must retain the confidentiality fixes or disable affected access until a compatible patched API is active; an old API can reintroduce the original read bypasses.

Use the repository migration runner in staging/production. Migration 621 deliberately fails if existing compensation violates the checks. Investigate and obtain payroll-owner approval for corrections; do not replace invalid amounts with zero. Back up and rehearse rollback before deployment. Another concurrent change has migration `619_expand_industry_keys.sql`; the runner tracks full filenames, but duplicate numeric prefixes must be reviewed before release. Already applied migrations were not renamed.

## Verification

`npx tsx src/scripts/check-nexushr-integrity.ts` is a read-only aggregate preflight. Local result: five validated constraints; zero overlapping compensation pairs, paid runs without one journal, unpaid runs with a payroll journal, personnel files outside the restricted drive, personnel files with stale grants, or file-backed personnel envelopes needing creator-access review (`nexushr-data-integrity.log`). It does not repair or rewrite financial records.

- Eight targeted API suites: 61 tests passed in the latest complete run, with no skipped tests. Covers the original six suites, original audit regressions and new hardening suite. See `nexushr-final-tests.log`. An earlier repeat passed all 60 assertions but timed out in fixture cleanup under compiler load; the subsequent complete run used a 60-second cleanup-hook timeout, with test assertions unchanged.
- Payroll reference-engine script: exit 0 (`nexushr-final-payroll-engine.log`). Synthetic tax/configuration in isolation tests is explicitly test-only, not a production statutory rate.
- Browser: payroll and policy settings rendered; mobile self-service checked at 390 × 844. Screenshots: `payroll-policy-verified.jpg`, `self-service-mobile-fixed.jpg`.
- Root `npm run typecheck`: an earlier run exited 0, including API/web types, event-trigger validation, all 19 design-system checks and encoding checks (`nexushr-final-typecheck.log`). A repeat after the additional Cloud protections is recorded in the same log. Build status is recorded separately in `nexushr-final-build.log`; a started process is not a pass.
- Follow-up after the additional compensation/contract guards: 23 tests passed (`nexushr-final-security.log`), including trusted-proxy HTTPS, spoofed-forwarded-protocol rejection, oversized device batches and credential-server URL protection.
- Root lint cannot run: its `eslint` executable is absent and there is no root ESLint configuration. The separate Ondi subproject has its own config. No lint pass is claimed.

- Cloud regression run: 41 tests passed across six suites (`nexushr-cloud-security.log`). This includes a real uploaded personnel document, blocked search/entity/download/share alternatives, and authorised HR/employee byte-level retrieval. Follow-up eSign/AI/support attachment guards and signing editor regressions: 16 tests passed (`nexushr-cloud-alternatives.log`). The unauthorised AI request is rejected before the provider boundary; no AI provider receives the protected fixture. Same-name employee folder isolation and database downgrade rejection are included in the final combined run.
- Server/client pagination rendering: 2 frontend tests passed (`nexushr-pagination-ui-tests.log`).

Additional fixes during verification: awaited Cloud domain-event writes inside their transaction; awaited public access-log writes before responding; stopped same-name employees from reusing each other’s folder. Earlier repeated tests exposed the logging race and folder collision, and those failures were retained until corrected.

## Remaining release gates — not a production green light

1. Dependency scan still reports 13 production findings: 2 critical, 2 high, 8 moderate, 1 low. Critical findings are in the legacy OpenTimestamps/request/form-data chain; signing dependencies also remain flagged. Do not use `npm audit fix --force` to replace OpenTimestamps with the suggested 0.0.0 package. Replacement or audited mitigation requires actual timestamp/signature interoperability tests. Native verification mitigation elsewhere in the checkout does not make the package audit clean.
2. Roster/case paging is implemented; large-employer query plans and measured capacity/SLOs remain unqualified. This change does not claim an enterprise capacity result.
3. Complete employee/manager/HR/finance/support staging journeys, including onboarding/offboarding, branch/entity boundaries, export and retention/deletion. Targeted access tests are not complete SaaS lifecycle acceptance.
4. Payroll/accountant acceptance of real statutory rate vintages, rounding, leave/overtime, bank files, employee start/end eligibility and payroll-country scope. Calendar-day salary-change tests do not certify every employment-proration scenario.
5. Previously issued S3 presigned URLs require expiration or storage-side invalidation before release; changing application permissions cannot revoke copies already downloaded or emails already sent. Audit existing file-backed signing envelopes and support attachments for historical unauthorised disclosures. Real device HTTPS/proxy compatibility and retry behaviour, storage/eSign/email/provider acceptance. Software retry tests do not certify physical ADMS hardware. Set `API_BASE_URL` to the real externally reachable HTTPS API origin; registration and rotation use this configured address, not an untrusted Host header or the frontend origin. The server trusts loopback proxies; do not broadly trust forwarded headers to make HTTPS checks pass.
6. Production backup restoration/failover, alert delivery/on-call routing, retention, secret rotation, support-access audit delivery and security/penetration testing. No production environment was accessed or reconfigured.
7. PII logger uses the existing nonblocking delivery model. Sensitive reads now use it on the changed pay surfaces; durable SIEM delivery remains an operational verification requirement. Existing request serialization already strips query strings: the original audit's implication that application logs necessarily expose device tokens was too broad. Reverse-proxy logs must be checked separately.

Passing local regressions proves the tested defects were corrected. It is not an unrestricted, all-country or 100% production certification.
