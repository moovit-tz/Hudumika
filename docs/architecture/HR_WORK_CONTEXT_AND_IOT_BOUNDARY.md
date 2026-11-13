# Shared work context and IoT boundary

Status: implementation foundation in progress; not a claim that every product or industry is integrated.

## Decision

NexusHR owns attendance, timesheets, approvals, and payroll-facing work records. Product apps own the operational objects being worked on. A time entry can reference one product-owned item through the namespaced tuple `(work_item_app_id, work_item_type, work_item_id)`. The app API remains responsible for resolving the ID, tenant, state, and worker access. HR stores a label/reference snapshot for historical display; it does not become the source of truth for the operational item.

The registered adapters currently cover NexusHR tasks, ClearOS shipments, Projects, Tuma parcels, Seal tasks, and HuduFreight bookings. The time-entry picker exposes Tuma, Seal, and HuduFreight only when the tenant has the product entitlement and the user is assigned to, or created, the item (managers can see active items). Those cross-product entries are non-billable. IDs are opaque strings at the shared boundary because independently deployed products may not use the same key format. Do not accept arbitrary app/type pairs: each adapter must be registered and authorize access server-side.

## Hard scenarios and required behavior

| Scenario | Required design |
| --- | --- |
| Two organizations have the same external ID | Resolve using authenticated tenant plus the registered product adapter; never trust a client-supplied tenant or label. |
| Worker guesses a valid item ID | Recheck assignment/membership and item state on every write. A tenant match alone is insufficient. |
| Product app is disabled, unreachable, or being upgraded | Do not accept a new reference whose ownership cannot be verified. Existing time records retain their snapshot and remain reportable. Define an explicit degraded mode per adapter before enabling offline writes. |
| A worker changes tasks, closes a shift, or opens two browser tabs | Keep the employee-scoped transaction lock and database one-open-entry constraint. Treat switching as stop-old/start-new in one transaction. UI state/local storage is only a cache. |
| Timer crosses midnight, a DST boundary, or a timezone change | Store absolute instants and the tenant/work-location timezone used for payroll grouping. Split or allocate duration by local workday according to an explicit, auditable policy; do not silently assign the whole interval to its start date. This migration only keeps an overnight open timer visible; payroll-grade splitting remains future work. |
| Historical item is renamed/deleted | Preserve snapshot label/reference and immutable work-item identity on the time entry; avoid live joins as the only source of historical display. |
| Billable flag is manipulated by the browser | Derive billability from an authorized contract/rate-card or approved work policy on the server. The current change defaults shipments to non-billable and only honors configured task billability; that is a safe interim rule, not invoice authorization. |
| A submitted/approved period is edited | Enforce approval locks in every mutation path, preserve an auditable correction/reopen flow, and never let UI controls bypass database enforcement. Existing integrity triggers are retained. |
| App has different roles, lifecycle, or data model | Implement a product adapter that translates to the common reference and checks that app's rules. Do not flatten all products into a universal `task` table. |

## Product and industry coverage

This is a shared time-allocation seam, not a promise that all 30+ industries or every Hudumika app is ready. Products such as Tuma, HuduFreight, Seal, SafeTracker, Stride, and ClearOS have distinct workflow objects and permission models. Add each only with an explicit adapter, entitlement check, assignment rules, audit events, and acceptance coverage. A common shell can unify identity, navigation, communications, and finance without making operational schemas identical.

Industry requirements belong in versioned policy/configuration (work calendars, overtime, break rules, approvers, costing dimensions, retention) with jurisdiction-aware defaults and human review. Payroll, safety, union agreements, contractor rules, and country labor law are not interchangeable. Do not ship one global legal rule or let an industry template change approved historical time retroactively.

## Time allocation policy (implemented baseline)

- New time intervals store the tenant IANA timezone used at start in `work_timezone`; legacy intervals remain unset because backfilling them from today's workspace preference would rewrite history.
- `date` is the local calendar date at interval start. A closed interval is allocated by elapsed instants across local midnight for daily time summaries. DST days therefore have their real 23/25-hour length; they are never treated as fixed 24-hour durations.
- The absolute start/end instants are authoritative. A timezone change affects new intervals only. A correction to an approved period requires an administrator reopen with a reason, then the normal resubmission/approval path. Existing database approval locks remain the enforcement boundary.
- Billability remains server-derived: only a configured NexusHR task can produce billable minutes. Shipment, parcel, Seal task, project and freight booking references default to non-billable. This flag is not permission to invoice; contract/rate-card approval is still required downstream.
- This is a time-recording allocation baseline, not a statutory overtime calculator. Workweek boundaries, night premiums, breaks, rounding, holidays, union/collective agreements, contractor rules, and country-specific thresholds must be configured and legally reviewed per tenant before payroll treats these summaries as payable hours. Overnight work is not truncated at midnight.
- Corrections preserve the source record and its original timezone. Never mutate a historical timezone to match a later workspace setting. Approved payroll outputs require their own immutable calculation snapshot and a versioned policy reference before this can be described as payroll-grade.

## IoT implementation boundary

Do not let a reader, kiosk, vehicle tracker, or biometric device write `hr_time_entries` directly. The first implementation already has a separate ADMS ingestion route, provider adapter, tenant-scoped append-only event rows, event-to-session reconciliation, one-time device credentials, token rotation, and sync logs. Credentials are stored as SHA-256 hashes after migration 756; device-local time and its IANA zone are retained, and event retries are deduplicated at the database boundary. Device time is resolved against the configured device timezone (or tenant timezone when no device zone is configured). Automated API tests cover token rotation, duplicate/replayed events, request-size rejection, TLS policy, and timezone/DST handling; these are protocol tests, not evidence of compatibility with a physical terminal.

The current adapter is ZKTeco ADMS only; it does not establish device signatures, mutual TLS, trusted clock attestation, or firmware integrity. A physical pilot must verify enrollment/network reachability; HTTPS termination and certificate validation on the device; device timezone and clock drift; normal and overnight punches; retry after timeout; duplicate and delayed/out-of-order event delivery; token revocation/rotation; and reconciliation against the device's own event log. Record model, firmware, wiring/network topology, observed event identifiers, and acceptance results before enabling production ingestion. Rate/volume limits at the edge, drift alarms, revocation runbooks, offline/out-of-order review, monitoring, and a human correction/audit process are production rollout requirements. If firmware offers no stable event ID, the current deterministic PIN/time/status fingerprint can collapse two genuine same-second identical-status taps; verify event identity behavior with the chosen hardware. Keep raw device events separate from approved payroll records.

At-least-once delivery is normal; every event needs a stable device event ID and a uniqueness boundary. Offline buffering creates delayed, duplicated, and out-of-order events, so retain device time and server receipt time and reconcile deterministically. Lost devices must be revocable quickly. Site reassignment, employee transfers, shared badges, proxy attendance, failed clocks, power/network loss, and emergency/manual overrides all need explicit policy.

Biometrics and location are sensitive personal data. Prefer non-biometric credentials unless a documented lawful basis and necessity assessment supports biometrics. Minimize collection, separate identifiers from measurements, encrypt with managed keys, tightly scope access, set retention/deletion schedules, log access, and support employee rights and incidents under applicable local law. A raw face/fingerprint template must never appear in a general HR event stream or analytics table.

## Rollout gates

1. Task/shipment switching and tenant-scoped writes are in place; browser verification still requires a live authenticated staff session.
2. Work-item resolution now also covers Tuma parcels, Seal tasks, and HuduFreight bookings, with explicit eligibility checks. Add per-product acceptance coverage before enabling the picker in each app.
3. Timezone snapshots and local-day allocation are implemented for daily work summaries. Employer-specific overtime/payroll rules and immutable payroll calculation snapshots remain a release gate.
4. The device ingestion path has unit and simulated ADMS coverage; a physical non-biometric pilot is still required to validate firmware and real network behavior.
5. Treat each new jurisdiction/product/device family as a release gate with named owners, retention rules, support procedures, and rollback behavior.

## Reference standards

- NIST IoT device cybersecurity capabilities: <https://www.nist.gov/itl/applied-cybersecurity/nist-cybersecurity-iot-program/nistir-8259-series>
- MQTT 5.0 delivery semantics: <https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html>
- OAuth device authorization for input-constrained devices (where applicable): <https://www.rfc-editor.org/rfc/rfc8628>
- Tanzania Employment and Labour Relations Act (verify current applicability and amendments with local counsel): <https://oagmis.oag.go.tz/portal/acts/revised/570/download>
