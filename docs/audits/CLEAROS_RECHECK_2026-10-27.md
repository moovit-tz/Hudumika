# ClearOS remediation recheck — 27 October 2026

Scope: current uncommitted working tree compared with CLEAROS_AUDIT_2026-10-27.md. Existing changes were inspected, not rewritten. Independent disposable-tenant probes were added in `apps/api/src/tests/clearos-recheck.test.ts`. No production shipments, messages or financial postings were changed.

## Verdict

Meaningful fixes have been implemented, but the remediation is incomplete and has introduced or retained release blockers. Do not mark the original audit closed. The earlier audit describes a prior state; use this document to distinguish progress from remaining work.

## Verified implemented

| Finding | Current evidence | Status |
|---|---|---|
| C01 / part of C02: negative FX/FOB, zero quantity, malformed weight | Main endpoint now returns 400 in remediation tests. Positive-rate guard exists in the main service. | Fixed for those specific API inputs; validation across every engine is not complete. |
| C03: zero declared value | Under-declaration now tests null/undefined rather than truthiness, and produces a nonzero result for the regression case. | Original zero-value bug fixed; legal rate correctness is separate. |
| S01: SALES rate writes | Explicit mutation-role gate added; SALES POST returns 403 and ADMIN POST succeeds. | Verified for POST; role-policy and PATCH/DELETE matrix still merit dedicated coverage. |
| W01: AIR transport document | AIR with AWB succeeds; AIR with only BL is rejected; sea BL path succeeds. | Backend transition fixed for tested cases. |
| W02: duplicate concurrent stage history | Shipment read now locks FOR UPDATE. Concurrent regression test confirms one PERMITS history row. | Verified for repeated same-target requests. Conflicting targets and duplicate downstream financial effects remain separate scenarios. |
| W03: legacy step ID UUID error | `cancelPendingComms` skips non-UUID legacy IDs. New transition tests no longer emit the old invalid-UUID errors. | Fixed for the tested legacy transitions. |
| U01: RAIL/BULK type collapse | Adapter union and normalization preserve RAIL and BULK. | Source-confirmed fix; full six-mode UI flow not certified. |
| U02: hardcoded clearing-agent contacts | Agent card uses `job.assigneePhone/Email` and PersonAvatar instead of matching EMPLOYEES names. | Source-confirmed improvement. |

## Partial fixes and remaining defects

### 1. Pagination is incomplete and can hide shipments

Backend grouping now defaults to 500 shipments and allows limit/offset. However `useShipments.ts` does not send page offsets, consume pagination metadata, or fetch later pages. CommandCenter still slices loaded customer groups locally. Records beyond the first 500 can disappear from the normal board rather than become navigable server pages.

The pagination total query also ignores the active filters. Independent fixture: 502 total records, 501 matching the search. Response reports total=502 and returns 500 matches. See `clearos-recheck-evidence.json`.

Required: end-to-end server paging or bounded stage queries, matching filtered counts, stable ordering with an ID tie-breaker, correct KPI/group totals, and tests locating a record beyond page one. Virtualization, delta updates and polling reduction are still absent.

### 2. Main calculator accepts modes it does not properly model

The schema was widened to include road, rail and sea_transit without equivalent calculation branches. Independent probes show road and rail accepted with HTTP 200 and both receive wharfage=400,000 TZS and PID=574,200 TZS for the fixture. Restrict the endpoint to implemented modes or implement properly sourced mode-specific treatments.

`cif_usd: "10000junk"` still passes the parseFloat-based validator and is calculated as 10000. Multi-item input remains `z.array(z.any()).min(1)` with no per-line strict schema or line-count ceiling.

### 3. Report security is not fully resolved; print can regress

Text escaping is now present and independently verified with benign markup generation. But `sanitizeImgUrl` merely checks the prefix, then inserts the value directly into a quoted src attribute. An HTTPS URL containing a quote can still add another attribute. The harmless generation probe confirms the attribute breakout remains. It did not execute malicious JavaScript.

The public report iframe still lacks a sandbox.

Print now calls `window.open(..., 'noopener')` and only writes report HTML if a window handle is returned. An isolated Chromium check returned null with that exact feature, so the conditional write cannot run. Preserve opener isolation with a rendering strategy that actually loads the report; recheck print and public-share behavior in a real browser.

The new “S03” remediation test only checks that JSON can return stored markup. It does not exercise HTML escaping, the logo-attribute case, public iframe isolation, or printing. Its passing result is not proof this finding is closed.

### 4. FX provenance is better, but wrong-currency fallback remains

Air results now expose `fx_source` and warn when an unsupported currency uses the USD rate. The calculation still labels those converted values with the unsupported currency; it was not changed to reject unsupported currency or require an explicit rate.

The air service now performs the external FX lookup even when `fx_rate_override` is supplied, adding avoidable latency and provider dependence. Override calls should avoid that lookup. Main USD fallback remains 2540 without full freshness/effective-date provenance.

The metadata regression assertion accepts `fx_rate === 2500` as an alternative to checking provenance, so it can pass without verifying the intended metadata contract.

### 5. New monetary rules lack validated provenance

Prohibited-goods handling was changed from zero to `max(5 × value, TZS 10,000,000)` with a legal-reference string. The recheck has not established an authoritative source for that exact rule. A test that merely requires a positive amount encourages replacing an unsupported zero with another unsupported number. Return “requires assessment” until the legal rule and effective date are verified.

Air storage now uses a new constant of TZS 50/kg/day, described as an Aleka rate-card figure. The source worksheet or approved rate version was not established by this recheck. The UI does not expose the new `storage_days` input. Therefore a positive service-level test is insufficient to call the user workflow functional.

Current statutory rule approval, effective-date versioning, exemption/preference evidence, and independent tax golden cases remain pending. This recheck does not decide the applicable law.

### 6. History save feedback stops at the API

Routes return `history_saved` and log failures. The main and advanced calculator UIs do not consume it, so users still receive no clear saved/failed indication or retry workflow. No saved record ID or idempotent retry contract was added. The regression accepts either true or false, which verifies field presence rather than successful persistence or recovery.

### 7. Cache reset does not invalidate old in-flight loads

Login/logout now call `clearShipmentCache`, which clears rows and resets flags. A previously started load promise can still resolve afterward and overwrite the cleared cache; there is no request-generation/tenant guard or abort. The cache itself is not keyed by tenant. Reset also leaves `_fetchError` unchanged.

The new fetch-error getter is not used by ShipmentDetail, whose failed detail read still falls back silently. Test logout/login while a delayed shipment request resolves before marking cache isolation complete.

### 8. Mode-aware workflow previews and road/rail requirements remain incomplete

The transition path supplies shipment type to the resolver. Several detail/preview/reassignment callers still omit it. With transport documents removed from the shared config, a preview synthesized without type can omit a document required by the actual transition.

ROAD and RAIL return no transport-document requirement at all. This avoids the former impossible BL prerequisite but does not implement mode-specific road/rail evidence. Custom semantic roles also still depend on English-name regex; only legacy roles gained an explicit map.

### 9. Simulation is propagated, but end-to-end outcome handling needs verification

Immediate and delayed comm paths now carry SIMULATED. That is real progress. Run aggregation still primarily changes SUCCESS to PARTIAL on FAILED, not SIMULATED; a run may retain SUCCESS while individual messages say SIMULATED. Test UI visibility, queue storage, aggregation and real-provider acknowledgement. Do not equate SENT with DELIVERED.

## Still pending from the original audit

- Transactional outbox and replay/idempotency for mandatory first-party subscribers and marketplace deliveries. The existing Studio outbox does not cover every business hand-off.
- Database-enforced business idempotency for invoice/expense creation and retry-safe task-plus-service charging.
- Preserved distinct backend operational stages in the compact frontend step model; rail/bulk mode preservation alone does not solve early “completed” labels.
- Versioned commercial rate cards, reconciliation between calculator engines, tariff provenance and current legal sign-off.
- Server paging wired through the UI, virtualized board, bounded tariff lookup concurrency, coalesced WebSocket updates and hidden-tab polling management.
- Explicit errors/retries for detail, tasks and time-entry failures; complete accessibility and responsive regression coverage.
- Provider sandbox acceptance: government acknowledgements, tracking, storage recovery, email/WhatsApp/SMS delivery, and multi-app financial reconciliation.
- High-volume multi-customer tests, sustained memory/heap profiling, and complete creation-to-close flows for every freight mode.
- Updated remediation checklist and migration/deployment notes. No new migration was present in the inspected diff; schema-backed semantic-role/idempotency work has not been demonstrated.

## Verification and limitations

- Fresh run: `clearos-remediation.test.ts` + `shipment-route-access.test.ts`: **23 passed**.
- Independent recheck probes: **2 passed**, recording the remaining numeric/mode/pagination defects rather than asserting they are correct.
- Fresh root `npm run typecheck`: passed.
- Fresh Studio/RLS regression run: **41 passed** across five files. Combined with the above runs, **66 tests passed**; none skipped. The two evidence probes deliberately record remaining defects.
- Additional API TypeScript check passed after adding the independent probes.
- Existing remediation changes are uncommitted. No new production build was run in this recheck; the original audit build does not certify the subsequently changed code.
- This recheck added evidence/tests/reports only and did not silently fix or revert another session's changes.

Evidence: `clearos-recheck-tests.log`, `clearos-recheck-probes.log`, `clearos-recheck-typecheck.log`, `clearos-recheck-workflows.log`, `clearos-recheck-evidence.json`, `clearos-recheck-report-security.json`.

## Next implementation order

1. Finish report escaping/isolation and repair printing; wire pagination fully and correct filtered totals.
2. Reject unsupported calculator modes/malformed values; resolve prohibited-goods and storage provenance; fix FX override/fallback behavior.
3. Invalidate in-flight cached requests on session changes and show fetch/save failures in the UI.
4. Complete mode-aware previews, road/rail requirements, simulation outcome aggregation and financial/event idempotency.
5. Complete scale, external-provider and operational acceptance coverage before production sign-off.
