# Axis (formerly NexusHR) — rebrand, baseline and worker-record work

Date: 15 November 2026. Local, uncommitted, not deployed. This continues
[SECURITY_AND_PRODUCTION_READINESS_2026-10-23.md](SECURITY_AND_PRODUCTION_READINESS_2026-10-23.md)
and [FIX_VERIFICATION_2026-10-23.md](FIX_VERIFICATION_2026-10-23.md). It is **not a
release approval** for any scope: the gates in "Still open" apply.

## 1. Rebrand — done and verified

Axis is the customer-facing name. Unchanged for compatibility: `/nexushr` routes and
the `/onepi` redirect, app and entitlement id `nexushr`, event keys, API paths and
every database identifier.

- Display strings renamed in the launcher, check-in widget, right sidebar, setup
  guide, cross-app labels, Ondi permission names, email template groups, comm-event
  labels, error messages, Studio descriptions, query-builder categories, the public
  calendar page and the derived browser title of `/nexushr`.
- Migration `910_axis_display_name.sql` rewrites only saved values that still hold
  the old default: the platform branding name (`NexusHR` → `Axis`), template group
  labels, and the header cell of **unedited** email templates (1,689 updated; the 1
  customer-edited template keeps its text). Workspace branding rows are not touched.
  No workspace had its own override locally — **check production for workspaces whose
  saved name is exactly "NexusHR" before deciding whether they chose it.**
- Evidence: browser pass over 9 pages at 1440 px and 2 at 375 px — titles, headings
  and page text show Axis, no "NexusHR" anywhere; cached app name refreshed from the
  server. Full `npm run typecheck` passed.

## 2. Baseline on the current checkout

| Check | Result |
|---|---|
| `check-payroll-engine.ts` | Pass — both live payslips reproduce to the shilling |
| `check-nexushr-integrity.ts` | Pass — 5/5 constraints validated; 0 overlapping compensation, 0 paid runs without one journal, 0 unpaid runs with a journal, 0 personnel files outside the restricted drive |
| October regression suite (`nexushr-readiness-audit`) | 8/8 — salary leak, payroll journal rollback and negative compensation fixes still hold |
| 13 HR suites | 83/85 pass. 1 was outdated (ClearOS left the enterprise plan) — fixed, now 8/8. 2 use `vi.spyOn` on ES modules and could not run outside vitest on this low-memory machine — **re-run under vitest** |

Found and fixed: the attendance page titled the month's first day as "Today".

## 3. Worker records and lifecycle — first slice done

Decision (owner): extend `users` rather than reintroduce a second person model.

- Workers **without sign-in** (`users.can_login = false`, email optional, unusable
  password). Every sign-in path refuses them (`recordLogin` before its error-swallowing
  block, token refresh); turning sign-in off revokes open sessions.
- **Effective-dated job history** (`hr_assignments`, migration 911): worker type
  (employee/contractor/casual/intern), legal entity, branch, department, role, manager,
  title, working fraction, start/end with reasons, approvals, corrections. Rows are
  never deleted; a correction voids the original with the reason.
- Operations: hire without sign-in, start/rehire, transfer/promotion (manager requests
  wait for a different HR approver), extra assignments, offboarding (ends running jobs,
  cancels future ones, removes access via the existing Ondi deactivation path),
  corrections, sign-in on/off. The current main job is projected onto
  `users.department/designation/location` and the org-chart reporting line, so existing
  screens and reporting-line permissions keep working. A daily job applies dated
  changes.
- Backfill: one current job for each of the 193 local active staff. Former staff were
  not backfilled — their leaving dates were never recorded.
- 42 places that assumed every user has an email were fixed: sign-in code requires
  it (`lib/login-email.ts`), notification emails are skipped when there is no address,
  reviewer lists include sign-in accounts only.
- Evidence: `axis-worker-lifecycle.test.ts` 8/8 under vitest (no-login refusal,
  session revocation, transfer history, cross-tenant id refusal, concurrent overlap,
  manager request + independent approval, correction audit, offboard/rehire, isolation).
  API and web typechecks pass for these changes. Browser: job-history tab, transfer/
  offboard forms, approvals page and staff list render with a no-email worker at
  1440 and 390 px, no overflow, no page errors.
- Not yet: compensation/credential changes tied to assignments; payroll eligibility by
  assignment and legal entity; onboarding checklists triggered by a hire; UI to edit
  legal entities.

## Still open — every gate below is unverified

| Area | Status | Owner / dependency |
|---|---|---|
| 4. Field/record permissions across reports, exports, downloads, events; attendance corrections vs finalised payroll | Not started this round (October fixes still pass) | Engineering |
| 5. Payroll period effects, proration, overtime, rounding, concurrency, FinOps reconciliation | Engine and integrity checks pass; no new concurrency/fault tests this round | Engineering; **payroll specialist acceptance per jurisdiction** |
| 6. Industry templates and the per-app workforce inventory | Not started | Product + each app owner |
| 7. Staging journey, load, migrations/rollback rehearsal, monitoring, backup restore | Not possible locally | Ops (staging access) |
| WorkDo comparison | Not done: requires signing in to a third-party product | A person on the team |
| Production branding values equal to "NexusHR" in workspace rows | Decide per workspace | Product |
| Demo workspace monthly record limit (402) blocks UI creation tests on the demo tenant | Expected metering; tests used disposable tenants | — |

Migrations to deploy (in order, after backup and rehearsal): 910, 911. 911 makes
`users.email` nullable; rolling it back requires no `can_login = false` or null-email
rows.
