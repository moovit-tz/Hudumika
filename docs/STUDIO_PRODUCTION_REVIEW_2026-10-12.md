# Studio production review — 12 October 2026

Scope: source inspection of Studio routes, visual editor, executor, action/trigger/template registries, context resolvers, subscriber dispatch and domain event delivery. Registry checker executed successfully with coverage warnings. No workflows activated, messages sent, ledger changes made or browser acceptance performed.

## Implementation progress

Durable Studio delivery batch: migration 592 is applied. Registered domain events insert a tenant-scoped Studio outbox row in the originating transaction. Studio no longer registers immediate in-process subscribers; the BullMQ worker and interval fallback poll committed rows. Workers claim with row locks and a UUID lease, retry delivery infrastructure failures with capped backoff, and dead-letter after eight failed claims. Expired leases can be reclaimed; existing run reservations suppress duplicate actions. Delivery checks the Studio entitlement. Structured workflow failures remain recorded run failures rather than being blindly re-executed. Other application subscribers and marketplace webhook delivery retain their prior behaviour.

Three outbox database tests verify rollback isolation, post-commit execution/concurrent workers and expired-lease recovery without repeating completed actions; eight prior safety tests also passed. The entitlement adjustment passes the three outbox regressions. Design-system and encoding checks pass; root typecheck is running. No real messages or provider operations were performed. Pending: operator dead-letter/reconciliation UI, per-step recovery, immutable workflow version binding, retention/backpressure, full-app durable dispatch and schedules. Workflows are selected from current ACTIVE configuration at delivery time; published-version binding and activation timing policy are not implemented yet.

First safety batch implemented: new workflows default to DRAFT with a trigger-only graph; requests to create ACTIVE workflows are rejected. Activation and live execution validate registered triggers/actions, one matching trigger, bounded node/edge counts, unique IDs, reachable nodes and valid edges. Cycles, branches/merges, multiple loops, schedules and restricted ledger actions are rejected until supported safely. Static action inputs are validated; dynamic reference typing remains follow-up work. Studio mutation/live-run routes now require TENANT_ADMIN or SUPER_ADMIN. Updates use an optimistic timestamp guard against concurrent publication changes.

Runs reserve a committed RUNNING row before actions, using the existing unique event/run index and INSERT ON CONFLICT. Concurrent deliveries execute once; crashed claims remain RUNNING and are not retried automatically. Final results update the reserved row. This prevents concurrent duplicate execution but does not provide durable delivery, per-step resumption or external-effect reconciliation. Existing committed failed runs also remain deduplicated.

Eight Studio safety tests pass: linear graph acceptance, disconnected/cyclic/branched graph rejection, restricted/unregistered action rejection, concurrent claims, single real action invocation under concurrent delivery, draft/activation behaviour and non-admin mutation denial. Real-action test uses a mocked action; no messages were sent. Root typecheck, design-system and encoding checks pass. Onsite deletion payload schema drift was corrected; two Projects trigger coverage warnings remain. UI browser acceptance, durable outbox, workflow revisions, scheduler, fine-grained policies and step recovery remain pending.

## Current capabilities

106 trigger definitions, nine executable actions and 16 templates exist in the source registries. Trigger definitions include manual and daily/hourly schedule entries; a catalogue entry is not proof of an executing scheduler. Actions: in-app notification, support ticket creation/assignment, expense recording, HR activity logging/available-staff lookup/announcement, task creation and bonded-lot release. Consequently broad event coverage does not imply broad app command coverage.

Existing templates already cover shipment SLA escalation, demurrage alerts, case assignment notification/HR activity, declaration duty expense, bonded-lot release, clearance-to-warehouse tasks, storage billing handoff tasks, dispatch notifications, trip handoff, payment notification, compliance renewal tasks and daily reminder configuration. They should not be recreated as duplicate automation proposals.

The engine performs real actions, records measured step results, validates action inputs, supports simulations, conditions and a limited single forEach, uses tenant-scoped context resolution, and checks action entitlements/finance capability. Marketplace delivery is tenant-install scoped and HMAC signed with SSRF protection.

## Blocking findings

1. Durable execution and transaction boundaries: domain-events.service.ts inserts the event then dispatches subscribers fire-and-forget, normally before the enclosing transaction commits. Defer-after-commit support exists but is not universal. A crash can lose dispatch; rollback can leave side effects for an event that never committed. Implement a durable transactional outbox and leased workers with retry/backoff, dead-letter handling and replay.
2. Idempotency: executor.ts checks for a prior run, executes actions, then inserts its run. Two concurrent deliveries can both execute before the unique run index rejects one insert. A crash after side effects and before logging also permits duplicate execution. Reserve/claim runs atomically before actions, persist per-step state and enforce action-specific idempotency. External effects need reconciliation, not an exactly-once promise.
3. Graph semantics: orderNodes walks edges then appends disconnected nodes. False conditions skip the remainder of the flattened sequence, not only the condition's descendants. Cycles are silently suppressed; forEach consumes every following node and nesting is unsupported. Reject invalid graphs and implement explicit branch/loop scope semantics before advertising arbitrary visual workflows.
4. Authorization: Studio route guards authenticate, require the Studio entitlement and exclude CUSTOMER; they do not establish fine-grained create/edit/publish/live-run permissions. Restricted ledger actions are marked in metadata, but the executor does not gate the restricted flag or require approval. Define execution principals and per-action policies; validate all foreign resource IDs. Treat bonded releases and expense writes as controlled actions.
5. Publishing validation: node/edge schemas accept arbitrary values; PATCH permits ACTIVE without a graph validation gate. Create defaults to ACTIVE and its default action is unregistered send_email. Default to DRAFT; validate trigger, exactly one start, reachability, edge endpoints, input/reference types, entitlements and required bindings before activation.
6. Scheduling: daily/hourly catalogue entries and reminder template exist; repository search found no Studio scheduler dispatch path. Add durable timezone-aware schedules, unique occurrence keys, next-run/missed-run policy, DST tests and worker ownership.
7. Runtime limits: the manual-run concurrency map is per process, and event-driven runs bypass it. Add shared tenant concurrency/rate limits, maximum run duration/node/loop/output sizes, cancellation and recursion/causation-loop guards.
8. Versioning/operations: workflows are edited in place; runs do not preserve an immutable graph version. Add draft/published revisions, run-version references, rollback, audit history, safe retry/resume, alerts, metrics, retention and sensitive-payload redaction.
9. Cross-app coverage: only nine trigger keys have context resolvers. Most apps expose payload-only context; targeting is shipment-specific. The action result output is recorded but not added to the later-node reference scope. Add typed context/output mappings and app-owned commands rather than arbitrary table mutation.
10. Tests: no dedicated Studio executor/graph/security/recovery test files were found in the repository test inventory. Add database integration, concurrent duplicate delivery, crash/restart, rollback isolation, tenant-ID smuggling, publish authorization, branch/loop, schedule and browser tests.

## Missing event registrations confirmed by the checker

onsite.subdomain.created/deleted; onsite.email_domain.created/deleted; onsite.mailbox.created/deleted; project.issue.resolved; project.change_request.submitted. Studio registers exact subscribers from its registry, so it cannot react to these emitted events until registered. The checker currently warns rather than fails for missing coverage.

## Candidate automations

Create as deduplicated DRAFT templates with recipient/owner bindings and previews. Do not auto-activate writes, notifications to others, provider changes, financial postings or regulated releases.

Available with current actions and existing event payloads, after binding validation:

- HR leave approval/rejection and staff role changes → manager task/notification.
- Cloud file sharing/version changes → document review task/notification.
- Task completion/comments → handoff task/owner notification.
- Onsite domain requests, DNS publication, backup restoration, CMS approval requests and content publication → accountable-owner review tasks/notifications.
- Bill payment recorded → reconciliation task for finance.
- Staff/user joining → welcome/setup task assigned to a configured owner.
- Ticket creation → available-staff lookup plus assignment, once action-output references are implemented.
- Project issue resolved/change request submitted → project review/approval tasks after registry and project context additions.

Need new triggers/context/actions before end-to-end automation:

- CRM won deal → project kickoff, contract draft and invoice draft.
- Project approval/milestone completion → procurement/AP approval and controlled billing.
- Inventory reorder threshold → purchase requisition; receipt → stock/accounting reconciliation.
- Domain/SSL expiry, deployment failure and backup failure → remediation tasks, followed by approved provider operations.
- Invoice overdue → policy-controlled reminder/collections workflow with delivery tracking.
- Approved HR requisition → recruiting/onboarding provisioning.
- Signed contract → project/billing activation and document filing.
- Payment → close project/shipment only after all business conditions and approvals pass.
- Recurring manager digests → scheduler plus collection/query context and aggregation.
- Email/SMS/WhatsApp delivery, registrar/hosting commands and external webhooks as user-authored actions → confirmed connector APIs, credentials, consent/policy and retry controls.

## Implementation order and acceptance

P0: durable outbox/claims/step idempotency; graph validation/execution correctness; live-run/publish/action authorization; draft defaults; registry coverage enforcement.

P1: scheduler and runtime limits; immutable versions and audit; typed context/action-output references; cross-app test matrix and operational alerts.

P2: deduplicated draft automation catalogue, guided bindings and previews; app-owned command expansion; approvals/waits; supported communications/provider connectors.

Production-ready means agreed acceptance tests pass for every advertised trigger/action/template, concurrent redelivery and restart recovery produce no duplicate controlled effects, unauthorized/cross-tenant operations are rejected, scheduled runs are durable, operators can diagnose/replay safely, and desktop/mobile/keyboard/light/dark UI flows work in the browser. A numeric completeness percentage is not supported by this source-only review.

## Queued execution snapshots — implemented

Migration 593 freezes the active workflow graphs and targeting in the same transaction as each event/outbox insert. Delivery uses those snapshots; later edits or activations do not rewrite queued work. Current PAUSED/deleted workflows are skipped as a stop control. Run reservations retain the executed graph for inspection. Legacy pending deliveries without a snapshot are moved to dead status for review rather than executing a current graph with unknown provenance.

Verification: migration applied; Studio safety and transactional delivery suites pass 14 tests, including concurrent delivery, lease recovery, rollback and graph editing after enqueue, tenant mismatch rejection and pause controls. Full published-version history, operator recovery UI/API, step-level reconciliation and resumption remain pending. Snapshotting does not freeze mutable entity context or provider implementations.

The WordPress installation and domain renewal emitters now use emitDomainEventStandalone instead of passing a null transaction. Both confirmed events are registered. Trigger payload/template checks pass; two Project event coverage warnings remain. Design-system and encoding checks pass.

## Delivery diagnostics and recovery — implemented

Studio Monitor now includes `/studio/deliveries`, with status filters, tenant-scoped details, related execution claims and retry audit history. Admin-only retry requires explicit confirmation and a review reason. Only dead deliveries with valid frozen graphs matching the originating event can be requeued. RUNNING, FAILED and PARTIAL claims block retry: an operator must reconcile their effects, and this control does not resume or repeat actions. Successful claims remain deduplicated by the existing event/workflow unique key. Migration 594 adds the tenant-isolated retry audit table; actor, reason and previous attempt count commit atomically with the requeue.

Verification: 19 Studio API tests passed; the recovery suite passed again after adding actor names and event/graph matching. Playwright checks passed against a disposable tenant and the real Fastify routes: desktop/mobile lists, review form, retry submission and audit history; light/dark mobile screens inspected, including corrected dark-mode link contrast. Final full repository typecheck passed, including API/web TypeScript, trigger payload/template checks, 19 design-system checks and encoding checks. Two Project trigger registry coverage warnings remain. Stuck-run reconciliation, per-step safe resumption, scheduled execution and publish/action approvals remain pending.

## Run reconciliation — implemented

Migration 595 adds an immutable reconciliation record on the original execution claim. Studio Runs and delivery details link to a dedicated run review page with step statuses and durations; arbitrary action outputs and payloads are omitted from this review response. Administrators can record a verified outcome and evidence for FAILED/PARTIAL runs, or annotate RUNNING claims older than 30 minutes. The original status, step history, error and event id remain intact. A review never starts/resumes actions. Reviewed terminal failures permit dead-delivery retry for still-unclaimed workflows; the original claim remains deduplicated. RUNNING claims continue blocking retry, even after review: recording evidence cannot prove a worker stopped.

Tests cover immutable concurrent reviews, tenant/role isolation, active-run rejection, stale-run review, original status preservation, and no action replay after reviewing a failed run. Full safe step resumption, worker cancellation/lease fencing, scheduling, publish/action approval policies and typed cross-app context are still pending.

Reconciliation verification: the 9 recovery/reconciliation tests passed after isolating the worker fixture from another queued event; existing 8 safety and 6 outbox tests passed. Playwright passed desktop/mobile rendering, action-output redaction and permanent review submission; light/dark mobile screens inspected. Full repository typecheck passed, including API/web TypeScript, trigger payload/template validation, design-system contracts and encoding. Final API typing was rechecked after the worker fixture change and passed. The same two Project trigger-coverage warnings remain.

## Execution limits and cooperative stop foundation — implemented

The executor now caps expanded execution at 1,000 steps and rejects collections above 100 items before any loop-body action. A five-minute elapsed-time boundary prevents starting further steps. An optional AbortSignal stops execution at the next boundary, including a second check after entitlement/input preparation immediately before an action. In-flight actions are awaited to settle; this is a cooperative time limit, not a hard timeout or rollback. Completed actions stay SUCCESS and subsequent interruption produces PARTIAL. Failed loops stop visiting later iterations rather than expanding skipped logs indefinitely.

Verification: the existing 23 safety/outbox/reconciliation tests and four initial boundary tests passed together; the final five-test boundary suite passed after adding expanded-step coverage. Full repository typecheck passed, followed by a final API typecheck after that test addition. No UI changed in this phase. Two existing Project trigger coverage warnings remain.

At this foundation stage, persisted operator cancellation requests and worker acknowledgement were pending; the subsequent phase below adds them. Worker lease fencing, durable step checkpoints and safe resumption remain pending. A hung provider call cannot be declared stopped by the elapsed-time boundary.

## Audited operator cancellation — implemented

Migration 596 adds a permanent cancellation request and worker acknowledgement timestamp to each execution claim. The tenant-admin-only cancellation endpoint requires a reason and explicit confirmation; tenant isolation, row locking and terminal-status checks prevent cross-tenant access, duplicate requests or cancelling a completed run. The run review page offers the request form and displays its author, reason, request time and acknowledgement state using shared design-system controls.

Workers read the durable request before each step and immediately before actions. An in-flight action is awaited; completed effects are recorded and cancellation stops the next action. Only an observed request receives acknowledgement when the final execution record commits. A crashed/hung worker remains RUNNING and unacknowledged; a run that finishes before seeing the request is reported accordingly. This does not resume/replay effects or constitute distributed lease fencing.

Verification: migration applied; all 31 Studio tests passed, including cancellation concurrency, tenant/role/confirmation guards and cancellation during an action with exactly one completed effect. Playwright against the real Fastify API and a disposable tenant passed desktop/mobile rendering, no horizontal overflow, cancellation submission and pending acknowledgement; light/dark mobile screenshots inspected. Full repository typecheck passed, including API/web TypeScript, trigger payload/template checks, 19 design-system checks and encoding. Two existing Project trigger coverage warnings remain. Worker lease fencing, durable step checkpoints/resumption, scheduling and approval policy remain pending.

## Worker fencing and step evidence — implemented

Migration 597 adds a worker token, expiry and current-action marker to execution claims. Database-clock checks require the same token, RUNNING status and unexpired ownership for renewal, progress commits and finalization. Each boundary renews a 60-second lease; an action that exceeds that lease cannot start subsequent actions or finalize under expired ownership. There is no takeover/replay path. Original event claims remain deduplicated. Worker tokens are omitted from API responses.

Completed step results commit after each node, including failed nodes, and an action start marker commits immediately before effects. A crash or failed progress write leaves RUNNING evidence for review. If ownership is lost during an action, the previous checkpoint and unresolved action marker remain intact; the stale worker cannot overwrite them. Finalization and workflow counters commit atomically. The run review page shows saved steps, claim expiry and the unresolved action, omitting arbitrary action outputs.

This fences execution boundaries and database progress writes, not an external provider's in-flight request. There is no heartbeat during actions; slow/hung actions remain uncertain after expiry. Provider idempotency/fencing, safe resumption and automatic recovery require action-specific contracts and remain pending, along with scheduling and approvals.

Verification: migration applied; 34 Studio tests passed, including interruption after a committed action checkpoint, token replacement and expiry during an action. The final 15-test recovery suite also passed after adding worker-token redaction coverage. Playwright with the real API and a disposable tenant passed saved-step rendering, unresolved-action warnings and output redaction at desktop/mobile widths in light/dark modes, without overflow. Full repository typecheck passed, including API/web TypeScript, trigger payload/template checks, 19 design-system checks and encoding. Two existing Project trigger coverage warnings remain.
