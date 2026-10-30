# ClearOS latest confirmation — 27 October 2026

Fresh recheck of the current working tree. Product code and operational records were not changed during this pass. Evidence probes used disposable tenants.

## Confirmed resolved since recheck 2

- Normal multi-item request now returns HTTP 200 using the real quantity/unit-price contract. The invalid per-line CIF requirement was removed; line count and financial-value validation are present.
- Filtered total now matches the fixture: 502 stored records, 501 search matches, reported total 501. The first page still returns 500 as configured.
- Migration 630 no longer uses CREATE INDEX CONCURRENTLY. The specific incompatibility with the transaction-based runner is removed. This is source verification, not proof of successful migration application.
- Unsupported road/rail modes and trailing text in CIF are rejected with HTTP 400.
- Unsupported foreign currency now throws instead of silently calculating at a USD rate. Explicit overrides skip the FX provider lookup. These paths were source-inspected; no current live-provider test was claimed.
- Subscriber recovery is called at startup. Failed handler promises no longer cause subscribers_dispatched to become true. These two specific implementation gaps are corrected.
- Earlier fixes remain present: AIR/AWB prerequisites, row locking against duplicate stage transitions, legacy UUID guard, report text/attribute improvements, cache generation invalidation and visible history-save feedback.

## Still pending before production confirmation

1. **Full pagination:** CommandCenter requests a maximum of 1,000 records and shows a truncation notice; it does not request successive offsets. This is better disclosure, not full browsing of the matching dataset. Client-side group slicing still cannot replace server pages.
2. **Recovery under RLS:** replayAllUndeliveredEvents imports the restricted `db` connection as “globalDb” and queries all tenant IDs without withTenant or dbPlatform. domain_events is RLS-protected. The global discovery query therefore cannot be relied upon to discover other tenants' events. Fix using an audited platform connection or scoped tenant enumeration and verify on the actual restricted role.
3. **Durability and replay:** shipment-step events are still emitted through a separate post-commit write. Recovery still has a 24-hour cutoff and LIMIT 100 without a drain loop, per-subscriber claims/attempts/dead-letter handling, or a scheduled retry worker. A startup call is not a complete delivery guarantee. Marketplace webhook retries remain outside the delivery flag.
4. **Financial idempotency:** migration 631 narrows the previous broad constraints, but category/charge-head or Draft/created_by-null predicates are still not a dedicated subscriber operation key. Manual duty expenses sharing that charge head can conflict, and a previously issued auto-invoice falls outside the draft-only predicate. Validate legitimate split billing/reassessments, duplicate events after invoice issue, and existing duplicates before deployment.
5. **Unverified rates/features:** prohibited-goods penalty and air-storage constants remain unverified estimates. Air UI still does not supply storage_days. Approved tax/fee provenance and effective dates remain outstanding.
6. **Report/browser acceptance:** public report iframe is still unsandboxed. Current printing, public-share isolation, PDF layout, all asset URL cases and accessibility/mobile flows need end-to-end tests.
7. **Workflow configuration:** step_type is read by the resolver, but editable/persisted role configuration and migration/backfill are not demonstrated end to end. Mode-aware preview callers, road/rail transport documents and simulated run aggregation remain incomplete.
8. **Scale and integration acceptance:** virtualization/delta updates, sustained memory/load tests, real provider sandbox deliveries and government/financial acknowledgement reconciliation are not completed.

## Fresh verification

- `npm run typecheck`: passed.
- Remediation, independent probes and shipment-route-access: **26 tests passed across three files**, no skipped tests.
- `multiItemContract.status = 200`; filtered pagination total = expected 501.
- No production build or migrations were run in this pass. No claim that the new migrations are applied is made.
- Evidence: `clearos-confirm-tests.log`, `clearos-confirm-typecheck.log`, `clearos-recheck-evidence.json` (latest run).

**Decision: the specific multi-item and filtered-count blockers are resolved; full ClearOS production readiness is not yet confirmed.**
