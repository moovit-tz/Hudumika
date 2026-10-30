# NexusHR KPI, time recording and integration review

**Superseded after remediation:** see [release readiness and remaining blockers](NEXUSHR_RELEASE_READINESS_2026-10-27.md). Findings below describe the original audit state.

Reviewed 27 October 2026 against the local working checkout and real local database, using disposable tenant fixtures. This is an audit, not a product fix. Existing changes from other sessions were preserved.

## Verdict

NexusHR has functioning attendance, payroll and access-control foundations, but time-record integrity and KPI definitions still need work. Approved hours can disagree with live hours; manual entries and the header timer have independently reproduced defects. Do not treat the current approval snapshot as a reconciled payroll or billing input.

## Reproduced findings

| Priority | Scenario and observed result | Pending work |
|---|---|---|
| High | Header time recording accepted a task UUID belonging to another tenant (HTTP 200). This establishes a foreign-reference validation failure; it does not establish disclosure of that task's contents. | Validate task and project ownership before insertion, with cross-tenant regression tests. |
| High | Three simultaneous header timer starts returned 200, 200, 409 and left **two open entries**. | Serialize starts and enforce the intended active-entry invariant in the database. |
| High | Repeating a manual 09:00–12:00 entry increased an otherwise valid split day's total from **420 to 600 minutes**. | Reject overlapping/duplicate sessions, including concurrent submissions; define correction rules. |
| High | Manual 22:00–06:00 work with a 60-minute break recorded **0 instead of 420 minutes**. The separate pure attendance engine calculated the overnight case correctly. | Use one shared calculation policy, explicit overnight dates and consistent timezone handling across entry paths. |
| High | Adding one hour after approval succeeded: live hours became **480 minutes**, while the approved snapshot remained **420**. An approved submission could subsequently be rejected through the same review endpoint. | Lock or version approved source records; require an auditable amendment/reapproval workflow and valid state transitions. |
| Medium | An unrelated same-tenant manager could approve the employee's submission. | Confirm whether approval is tenant-wide or reporting-line based, then enforce that policy. Self-review protection alone does not establish reporting-line authorization. |
| Medium | A 120-minute break against a 60-minute shift, a completed entry in 2099, and a reversed submission period were accepted. Reversed weekly query ranges also returned 200; malformed dates returned 400. | Validate chronology, duration, break limits, allowed future dates and reporting ranges. |
| Medium | KPI fixture had five internal accounts, four active, plus one customer account. Dashboard endpoint reported **six staff and five active staff**. A LATE attendance row contributed to neither present nor absent. | Define eligible staff and attendance categories consistently; explicitly display late/incomplete/leave states and use a meaningful attendance denominator. |
| Medium | A query spanning October 1–31 still returned **five planned days and 40 planned hours**. | Derive planned time from selected range, shift assignment, work calendar, holidays and employment schedule. |
| Medium | A CLOSED ClearOS shipment was still counted as active. | Normalize lifecycle status predicates and exclude deleted records where applicable. |
| Integration gap | Two hours entered on a ClearOS shipment persisted there but produced **zero HR attendance minutes** for that date. | Establish an explicit relationship between attendance and work allocations, with reconciliation and stable employee IDs. Do not blindly sum both ledgers and double-count work. |

## How the records currently connect

| Area | Current source and connection | Implication |
|---|---|---|
| Attendance clock | `hr_clock_sessions`, rolled into `hr_attendance`; web start/stop also bridges header `hr_time_entries`. | The tested clock-in/start path allowed only one of three simultaneous starts, and clock-out closed its header entry successfully. The header/start path has different concurrency behavior. |
| Timesheet submission | Snapshot of completed attendance sessions in `hr_timesheet_approvals`. | Snapshot totals are not kept consistent with later source edits. |
| Header/task time | `hr_time_entries`; HR staff timesheet/project views read this ledger. | Similar UI labels can refer to different underlying records from attendance approvals. |
| Project task time | Project timesheets read `task_time_entries`. | Project allocation time is another ledger, requiring an explicit reconciliation contract. |
| ClearOS shipment time | `shipment_time_entries`. Shipment events can create HR activity records. | An activity event is not a recorded attendance session; tested shipment hours did not flow into attendance totals. |
| Payroll | Salary history/components and approved unpaid overtime requests feed payroll calculation. | Reviewed payroll code does not consume approved attendance timesheets as a pay calculation input. This is not inherently wrong for salaried staff; hourly/daily pay needs an explicit policy and implementation. |
| CloudSync | HR confidential documents use Cloud-backed storage/access rules. | The confidentiality suite passed using disposable stored bytes, including alternate access paths. |
| Offers/eSign | Offer tests persisted signable envelopes when candidate email was available. | This verifies application persistence, not external delivery or legal acceptance. |

## Additional source-confirmed UI and workflow issues

- `ClockInPage.tsx` exposes date-range selection, but its weekly fetch and submit/export period remain fixed to the last seven days. The selected range is not applied.
- Submission notifications link to `/hr/timesheets?pending=1`; the reviewed route configuration does not provide that destination. Use the actual NexusHR route and test navigation.
- Dashboard “Pending Approvals” counts pending leave requests only. It does not represent all timesheet, overtime and payroll approvals.
- The tools overview's file/chat/support figures come from case documents, case messages and notifications respectively. Their provenance should be explicit; they are not unified CloudSync, Bliss and support-ticket totals.
- Stale clock-session cleanup can close a session with unknown worked minutes without immediately synchronizing its attendance summary. Weekly totals currently coerce missing minutes to zero. Unknown time needs a visible exception/review state rather than silently appearing as zero work.

These are code-path findings; browser interaction acceptance remains pending because the available browser session was locked.

## Verification completed

**66 tests passed across nine files, no skips:**

- 54 existing readiness, hardening, authorization, RLS, leave-overlap and staff-access tests.
- Four existing Cloud confidentiality and screening/eSign tests.
- Eight new scenario probes in `apps/api/src/tests/nexushr-timesheet-kpi-audit.test.ts`.

The eight probes deliberately assert observed behavior and emit evidence. Their passing status means the reproduction succeeded, not that the defects are fixed. They should become rejection/correctness regression tests when fixes are implemented.

Verified protections include peer attendance access denial, normal clock start/stop bridging, concurrent attendance-start protection, salary privacy, negative-compensation rejection, device revocation/batch rollback/retry deduplication, leave-overlap rejection, payroll historical salary/proration, dual approval, calculation/payment concurrency and ledger rollback. Recruitment RLS test coverage is not proof that every HR endpoint is isolated.

Evidence: `nexushr-timesheet-kpi-evidence.json`. Test logs: `nexushr-review-tests.log`, `nexushr-integration-tests.log`, `nexushr-timesheet-kpi-tests.log`. Typecheck result is recorded separately in `nexushr-review-typecheck.log`.

## Work still needed before acceptance

1. Fix foreign-reference validation, duplicate header timers, overlap handling, overnight calculation and approval immutability first.
2. Define one documented time model: attendance measures presence; project/shipment entries allocate work; approval versions establish accepted hours. Reconcile rather than merge indiscriminately.
3. Correct KPI eligibility, status definitions, calendar-derived planned hours, shipment lifecycle counts and approval queues.
4. Apply date filters consistently to lists, totals, submission and export; fix notification destinations and expose actionable recording exceptions.
5. Add end-to-end scenarios for part-time staff, rotating/night shifts, leave and public holidays, device/manual reconciliation, timezone boundaries, offline/retry behavior, corrections, overtime approval and downstream billing/payroll reconciliation.
6. Complete unlocked browser checks on desktop and mobile, including keyboard navigation, error states and real notification links.
7. Run production-like volume and soak tests: concurrent employees, large tenant histories, device bursts, reporting/export limits, database/query latency, browser memory and job retries. No throughput or memory-capacity certification was performed here.

External provider delivery, production credentials, live bank/tax filing, current legal tax correctness, recovery exercises and a complete penetration test are not certified by these local tests.
