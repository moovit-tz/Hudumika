# NexusHR remediation and Contabo launch readiness

Reviewed 27 October 2026 against the local checkout and PostgreSQL. This supersedes the findings in [the original review](NEXUSHR_KPI_TIMESHEET_REVIEW_2026-10-27.md). Changes from other sessions were preserved. Deployment instructions are in [the Contabo runbook](../../deploy/contabo/README.md).

## Release decision

NexusHR time integrity and KPI fixes have been implemented and exercised with disposable tenants. Contabo deployment automation is prepared. The entire Hudumika platform is **not yet certified for production**: broader regression failures remain, and actual Linux image builds, public TLS, provider delivery and off-server recovery require the configured host. Local tests cannot establish sustained VPS capacity or absence of memory leaks.

## Implemented

- Attendance rejects overlapping sessions, invalid dates, excessive breaks, future completed time and inconsistent approvals. Employee locks and database triggers protect concurrent writes and approved periods. Corrections and administrative reopening retain reasons and prior evidence.
- Shift-aware planned time accounts for leave, holidays and explicit weekend/night assignments. Device punches pair across midnight and separate batches; duplicate delivery does not rebuild frozen approved records. Stale shifts become unknown-duration review items instead of invented paid hours.
- Attendance, header timers, tasks and shipment time remain separate ledgers. Reconciliation identifies unknown duration, over-allocation and legacy shipment entries without reliable worker IDs. New shipment entries carry validated worker identity. Manager access is limited to direct reports; tenant ownership is checked on foreign references.
- KPI counts use a single tenant-scoped SQL snapshot, eligible internal staff and distinct employees. Leave approvals and data provenance have accurate labels. Presence includes late/half-day attendance.
- Clock-in filters affect totals, exports and submission periods. The page includes correction/reopening controls and responsive layouts. Failed header timer operations remain visible and preserve the active state.
- Three existing duplicate/stale header timers were closed with unknown duration and audit evidence. The subsequent scan found no duplicate open timers, known overlaps or stale approval snapshots. Eight legacy shipment entries remain unlinked; worker identity was not guessed.
- Zod was upgraded and its converter migrated to the supported public API. The timestamp SDK uses the maintained request transport override, tested against a real local HTTP calendar endpoint and an insecure redirect. Production dependency audit: zero critical/high/moderate advisories, three low advisories in the remaining timestamp cryptography dependency chain.
- Compiled production API resolution now selects the built shared types package. Migration SQL is included in the API build. An empty disposable database successfully applied all 655 migrations.

## Verification and limits

Evidence files live beside this report. `nexushr-final-acceptance.log`, `nexushr-final-typecheck.log` and `nexushr-final-build.log` record the final checks; their final exit/result lines determine completion, not the existence of a log file.

Final root type checking passed with exit 0, including trigger, design-system and encoding checks. The newly compiled API smoke passed authenticated KPI, clock-in and clock-out checks again (`nexushr-built-api-final.log`).

The final full production build passed. Vite retained its bundle-size warning (including a roughly 926 kB minified Three.js vendor chunk); the successful build does not resolve payload/performance optimization. The quiet final payroll/hardening rerun passed **all 12 tests** (`nexushr-hardening-quiet-final.log`), including the historical/future salary and concurrent payment cases. Across focused tests and reruns, all 81 selected cases have passed; the combined run itself remains 79/81 and is not relabeled as a single green run.

The final focused run completed with 79 passing and two timed-out tests across 81 tests in 13 files. The payroll concurrency and development-browser cases timed out while build/typecheck work was also running; the isolated rerun is recorded in `nexushr-acceptance-timeout-rerun.log`. All eleven new time-integrity tests passed. Timeouts are retained as failed first-run evidence rather than counted as passes.

That initial rerun completed with 12 passing and one failed test across two files: the production-preview browser passed, the earlier payroll concurrency case passed, and the historical/future-effective salary case exceeded its existing 20-second timeout. Compilation was still active. The subsequent quiet 12/12 run passed that case without altering its assertion or timeout. The combined acceptance timing remains a useful resource-contention finding.

Earlier targeted runs passed the time-integrity, authorization, RLS, device, payroll fault-injection and KPI cases. Browser verification passed at desktop and mobile widths against the production preview, without page overflow or JavaScript errors. The compiled API smoke exercised real authenticated overview/start/stop requests successfully. A load smoke with 1,000 internal staff, 200 customers and 20 concurrent KPI requests preserved correct counts; observed p95 was approximately 2.94–8.11 seconds under concurrent build/test activity. This is diagnostic evidence, not a production latency guarantee.

The broad platform regression run reported **886 passing and 16 failing tests across 902 tests**, with 84 passing and eight failing files. Follow-up runs passed NexusHR hardening, contacts, party hardening and the migration-number guard. A corrected project test now uses the supported report data type and explicitly rejects an unsupported type; a separate project-risk persistence assertion subsequently failed and remains unresolved.

Remaining platform failures require their own fixes and reruns:

| Area | Observed problems |
| --- | --- |
| POS | Refund inventory enum, malformed held-cart JSON, currency conversion, null notes, payment rounding, failed-posting cash accounting, historical register views, checkout idempotency and refund atomicity |
| Freight | Approved packing remains editable; dimension changes do not invalidate packing; invented measurement values accepted |
| Signing | Catalogue coverage missing for travel |
| Projects | Risk persistence assertion failed on isolated rerun |

No passing claim is made for these modules. The complete first-run and rerun logs are `nexushr-platform-regression.log` and `nexushr-final-reruns.log`.

## Contabo automation

The launch command builds images, initializes private PostgreSQL/Redis and antivirus services, sets upload permissions, backs up, migrates, replaces published database-role passwords, checks least-privilege roles and SMTP authentication, makes another encrypted backup, restores its database into an isolated verification database, starts the API/proxy and verifies public HTTPS. It enables Docker at boot and installs the daily backup timer. An unsuccessful application rollout attempts to restore the prior images; schema changes are retained.

One-time operator inputs are the VPS/DNS hostname, certificate contact, real SMTP credentials and an HTTPS S3-compatible backup repository with independent credentials. Secrets are generated once and preserved across updates. Back up the private configuration and repository password securely. Optional SMS/WhatsApp/banking/government integrations require genuine supported providers and credentials; none are fabricated.

Local validation covered Compose parsing, shell syntax, secret generation/validation, production preview/compiled API and a fresh migration chain. Docker Desktop's Linux daemon was unavailable, so **the Docker images have not been built or launched locally**. Real SMTP authentication/delivery, S3 access, public TLS and the container restore drill remain host acceptance checks. SMTP preflight checks authentication without sending mail. Live uploads and database are separate backup snapshots; a strictly consistent recovery point requires paused writes and upload-reference checks.

The fresh migration run used the available local PostgreSQL 13 instance; the deployment declares PostgreSQL 16. The container deployment must verify that exact runtime version as part of host acceptance.

Before launch, resolve the relevant platform failures, run the Linux deployment in staging, verify actual onboarding/email and configured callbacks, exercise employee/manager/payroll flows and financial reconciliation, and measure sustained load and memory on the chosen VPS. Add operational alerting with a real delivery destination and exercise recovery ownership.

## Documentation drift

AGENTS.md describes the old localStorage bearer-token frontend convention. The current authentication code uses cookies/CSRF; existing behavior was followed. Migration 632 was corrected only after the normal runner proved it unapplied and failing because its foreign key type did not match bigint domain-event IDs. Already-applied migrations were not rewritten. Pre-existing duplicate migration numbers were documented in the test allowlist rather than renamed.
