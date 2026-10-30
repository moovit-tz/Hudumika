# ClearOS second remediation recheck — 27 October 2026

Current working-tree review. This document supersedes the previous recheck where statuses differ. This pass added/ran probes and wrote evidence; it did not modify product code or apply migrations.

## Result

Additional defects were fixed, but ClearOS is still not ready for production sign-off. Multi-item calculation now has a confirmed request-contract regression, pagination remains disconnected, and the new migration/recovery implementation has release-blocking gaps.

## Newly resolved since the previous recheck

| Item | Verification |
|---|---|
| Malformed CIF such as `10000junk` | Fresh endpoint probe now returns 400. |
| Road/rail requests to the main sea/air calculator | Fresh endpoint probes now return 400, preventing the previously observed sea-port charges. |
| Old in-flight shipment load repopulating cache after reset | Generation counter guards success, error and finally callbacks; reset invalidates generation. Source-confirmed; two-account browser acceptance still pending. |
| History-save feedback | Main single/multi-item and advanced calculator pages now consume `history_saved` and display success/warning feedback. No saved-record ID or idempotent retry flow was established. |
| Air FX override still contacting provider | Lookup is now skipped when an explicit override exists. Source-confirmed. |
| Report image-attribute breakout from last probe | Benign HTML-generation probe now confirms text escaping and absence of the previous quote breakout. This is not a complete XSS assessment. |
| Print-window handle | `noopener` feature removed from window.open; code writes the report, closes the document and clears opener. The earlier null-handle branch is removed. Actual print dialog/PDF acceptance not rerun. |

Previously tested fixes remain present: numeric API guards, zero-declaration handling, SALES transit-write restriction, AIR/AWB transition rules, stage FOR UPDATE locking, legacy communication UUID guard, and preservation of RAIL/BULK identity.

## Confirmed blockers and incomplete work

### P1 — Multi-item calculator rejects the UI's legitimate request

`multiItemLineSchema` now requires each item's `cif_usd`. The UI and route-to-service adapter use `qty` and `unit_price_usd` instead. A normal one-line laptop invoice returns HTTP 400 with `items.0.cif_usd: Invalid input`. This is reproduced in `clearos-recheck-evidence.json` under `multiItemContract`.

Fix the schema to validate the actual shared input contract, including finite positive quantities, nonnegative unit prices, allowed per-line overrides, and valid top-level freight/insurance/FX/mode. A 500-line cap alone does not fix the contract. Test through the endpoint using the actual browser payload.

Sources: `apps/api/src/routes/customs.routes.ts` (`multiItemLineSchema`, multi-item handler); `apps/web/src/pages/LandedCostPage.tsx` (payload around line 419).

### P1 — Pagination still hides records and miscounts filtered totals

`useShipments.ts` still does not send offsets or consume pagination metadata. The backend's default 500-record cap therefore remains a silent truncation for the normal board. Group slicing in CommandCenter is not server pagination.

Independent fixture reproduced again: 502 stored rows, 501 search matches, returned 500, reported total 502. The count query omits search and other filters. Wire paging end to end, preserve stable ordering, and reuse the exact filter predicates for count/group/KPI semantics.

### P1 — Migration 630 is incompatible with the migration runner

The new migration contains `CREATE INDEX CONCURRENTLY`. The runner wraps each migration in BEGIN/COMMIT and executes its SQL inside that transaction. PostgreSQL does not allow CREATE INDEX CONCURRENTLY inside a transaction block. The file therefore cannot be deployed through the current migration path as written. This is a source-level incompatibility; migrations were not applied during recheck.

Sources: `apps/api/src/db/migrations/630_domain_event_subscriber_outbox.sql:21`; `apps/api/src/db/migrate.ts:55`.

### P1 — Migration 631 imposes overly broad uniqueness

The expenses index is unique on `(tenant_id, shipment_id, category)` for **all** non-null shipment IDs, rather than only subscriber-created duty operations. That blocks multiple ordinary expenses in the same category for one shipment.

The invoice index permits only one invoice per tenant/shipment reference, rather than one auto-draft per event/business operation. This can block split invoices and subsequent legitimate billing. Existing duplicate rows can also prevent either index from being created. Use an explicit operation/source idempotency key, preserve valid multi-expense/multi-invoice business flows, and include a migration preflight/backfill strategy.

Source: `apps/api/src/db/migrations/631_subscriber_idempotency_keys.sql`. No migration was applied to demonstrate these constraints against operational data.

### P1 — Subscriber recovery is not a reliable outbox yet

- `replayUndeliveredEvents` has no caller anywhere in `apps/api/src`; startup/scheduled recovery is not wired.
- Each subscriber rejection is caught before Promise.all completes, so even failed subscribers lead to `subscribers_dispatched = true`.
- Replay reads only events from the last hour; older undelivered work is ignored.
- Replay dispatches asynchronously, without per-subscriber delivery claims, retry schedule, attempt count or dead-letter recovery.
- Marketplace webhook completion is not part of the dispatched flag and still has no durable acknowledgement/retry path.
- Workflow-step event emission remains a separate post-commit write, leaving a crash gap between changing the shipment and persisting its event.

The new flag is delivery-tracking scaffolding, not completion of the original durable-hand-off requirement. Source: `apps/api/src/services/domain-events.service.ts`, `apps/api/src/services/workflow.service.ts`.

### P1/P2 — Tax and FX truthfulness remains unresolved

Unsupported currencies still get a USD conversion and retain the unsupported currency label; warnings were strengthened, but the erroneous-conversion path is still accepted. Main USD fallback still lacks complete freshness provenance.

Prohibited-goods numeric penalties still use the unverified 5×/TZS 10M formula. It is now labeled an estimate requiring assessment; the exact rule has not been independently validated. Air storage still uses the unverified TZS 50/kg/day constant. Warning labels improve disclosure but do not establish correctness.

Air UI still has no `storage_days` control/payload, so the new storage calculation is not a complete user feature. Regulatory effective dates, exemptions/preferences, approved commercial rate versions and external golden assessments remain pending.

### P2 — Semantic workflow roles are not wired end to end

Migration 629 adds `step_type`; resolver and transition code read it. However, the workflow routes/editor do not expose/persist it, and the workflow-step Database interface has not been updated. Existing steps are not backfilled. English-name heuristics remain as fallback. Source-level support for a column does not let an operator reliably configure it.

Mode-aware transition checks remain ahead of several preview/reassignment resolver callers that omit shipment type. ROAD/RAIL still omit a transport-document requirement instead of supplying a complete mode-specific evidence model.

### P2 — Remaining security, UX and reliability work

- Public report iframe still has no sandbox. Full report execution/asset URL defense and print/PDF flows need browser regressions.
- ShipmentDetail still silently falls back on failed detail requests; the new fetch-error getter is not integrated into that flow.
- SIMULATED is propagated at message level, but run aggregation can still retain SUCCESS when messages are simulated.
- Financial subscriber `onConflict(doNothing())` depends on correctly scoped constraints; replacing broad uniqueness with a true operation key is necessary.
- Task-plus-service charge partial failure/retry safety, complete stage-state fidelity, virtualization, incremental events, bounded lookup concurrency, hidden-tab polling, long-running memory tests and real provider acceptance remain pending.

## Verification

- Fresh remediation + task-access + independent recheck suite: **26 tests passed across three files**. Includes the newly added multi-item contract probe. Evidence probes record faults rather than declaring that behavior correct.
- Root `npm run typecheck`: passed.
- A separate rerun of independent probes was also started; it repeats coverage and should not be double-counted.
- Broader Studio/RLS rerun: **41 tests passed across five files**. Together with the 26 above, **67 distinct tests passed**, with none skipped. The repeated three-probe run is not counted again.
- Benign report-output probe: `textEscaped=true`, `previousLogoBreakoutPresent=false`, saved in `clearos-recheck2-report-security.json`.
- No new production build, migration application, external messages, government filing or operational financial posting was performed in this recheck.

## Next actions

1. Repair the multi-item contract and end-to-end pagination.
2. Correct migration 630 and narrow migration 631 to genuine business idempotency keys.
3. Implement claimed/retryable per-subscriber delivery with an actual recovery worker and transactional event persistence.
4. Reject unsupported FX and complete or explicitly exclude unverified tax/storage treatments.
5. Finish role configuration, previews, UI failure states, sandbox/print tests and production-volume acceptance.

The implementation remains uncommitted; preserve other sessions' changes when addressing these findings.
