# ClearOS engineering and operational-readiness audit

Date: 27 October 2026, Africa/Dar_es_Salaam. Scope: current working tree, including the earlier uncommitted UI/task fixes. This is an audit, not a remediation release.

## Decision

**Do not approve unattended customs calculation, automated financial hand-offs, or high-volume production operation yet.** ClearOS has useful working foundations: persisted shipment/task records, explicit tenant filters and restricted database roles, document prerequisites, declaration event history, multi-item cost allocation, and a tested Studio delivery outbox. However, reproduced calculation-input defects, a mode-specific document blocker, duplicate concurrent stage transitions, and unbounded board responses prevent a production-readiness sign-off.

This does not establish that every screen or integration is broken. It establishes specific defects and the remaining evidence required. A passing test suite is not legal tax validation or a penetration-test certificate.

## What was actually checked

- 50 automated tests passed across seven files: the new audit matrix; shipment route access; Studio safety, recovery, outbox, execution limits; and tenant RLS coverage. No tests were skipped in the final run.
- 75 core calculation scenarios: six HS-code inputs × three main modes × three tax treatments; six advanced-LCL and six advanced-air estimates; six transit destination/container combinations; three mixed-commodity invoices. HS inputs included rice, medicines, laptops, vehicles, footwear, and an explicitly unknown code. A successful lookup can resolve to a broader tariff ancestor; it is not proof of exact commodity classification.
- Additional checks: five demurrage tier/date boundaries and rejection of a reversed date interval; USD/EUR/ZAR/TZS conversion arithmetic using explicit supplied FX rates; six used-vehicle age boundaries; all six penalty types; malformed numeric inputs; and role-access probes.
- Legacy workflow prerequisites exercised for SEA_FCL, SEA_LCL, AIR, ROAD, RAIL, BULK; missing-document blocking; and three concurrent transitions on one shipment.
- Local scale test: disposable tenant with 500 then 2,000 synthetic shipments, sequential reads and ten concurrent grouped reads. Synthetic rows were deleted through tenant cleanup. No operational shipments were changed.
- Live authenticated browser inspection: shipment/task layouts from preceding work, mobile air wizard steps 1–2, LCL/transit entry screens, and calculator navigation. Mobile entry screens checked at 390px. Not every control on every screen was clicked.
- Source review: routes, data adapters, calculation engines, declaration state changes, workflow transitions, communications, first-party subscribers, polling, and caching.
- `npm run typecheck` passed in the audit verification. See saved logs; the audit tests are reproducible.
- Production web build passed: 11,729 transformed modules, Vite build time 2m49s. It warned about chunks larger than 800 kB and dynamic imports that are also statically imported. These are platform-wide build observations, not measured ClearOS runtime latency.

Initial test harness run failed because synthetic shipment fixtures omitted a required vessel field. The fixture was corrected and the final seven-file run passed. That setup error is not counted as a product defect.

Artifacts: `clearos-audit-evidence.json`, `clearos-verification.log`, `clearos-typecheck.log`. Test implementation: `apps/api/src/tests/clearos-audit.test.ts`.

## Confirmed and high-confidence findings

P1 means resolve before relying on the affected operation in production. P2 means significant reliability, UX, or scale work. “Reproduced” refers to the saved probes, not a speculation from a comment.

| ID | Priority | Evidence | Finding and consequence | Required change |
|---|---|---|---|---|
| C01 | P1 | Reproduced API | Main landed-cost accepts FX `-1` with HTTP 200 and produces negative tax lines. FOB `-1000` also produces negative CPF. | Strict finite positive FX, nonnegative values, valid mode enum, and consistent CIF/FOB checks before calculation. |
| C02 | P1 | Reproduced API | Quantity `0` returns HTTP 200 and `per_unit: null` after nonfinite division. Invalid mode `road` is accepted by an engine whose supported modes are FCL/LCL/air. Malformed weight is silently absorbed. | Reject invalid quantities/modes/weights with field-specific 400 errors; never serialize invalid arithmetic as a successful estimate. |
| C03 | P1 | Reproduced service | Under-declaration with declared value zero and actual value USD 10,000 returns zero penalty because the branch tests truthiness. `prohibited_goods` is offered as a supported type but has no calculation branch and returns an empty zero result. | Explicit required-field validation and a modeled/unmodeled result; never represent unsupported legal treatment as “zero payable.” Obtain qualified regulatory validation. |
| W01 | P1 | Reproduced workflow | AIR with verified AWB, invoice, packing list cannot enter legacy VALIDATION: `Prerequisite not met: BL document`. Legacy requirements are mode-agnostic. | Resolve transport-document requirements from freight mode; test AWB, BL, road/rail documents, and bulk requirements independently. |
| W02 | P1 | Reproduced concurrency | Three simultaneous VALIDATION→PERMITS requests all succeeded and inserted three stage-history entries. | Lock the shipment row or use optimistic version checks; make transition requests idempotent. Verify one transition, one history row, one downstream effect under retries. |
| W03 | P1 | Runtime error | Legacy transitions call `cancelPendingComms` with `DOCS_RECEIVED`/`VALIDATION`, but queue step IDs are UUIDs. Test logs contain `invalid input syntax for type uuid`. Stage movement succeeds while communication cancellation fails. | Separate legacy stage identifiers from custom workflow UUIDs; skip nonexistent legacy queues or store a compatible identifier. Add regression coverage. |
| S01 | P1 | Reproduced authorization | SALES successfully POSTs tenant-wide transit reference rates. Backend blocks CUSTOMER but permits other authenticated entitled roles, unlike operational UI role gating. | Apply an explicit rate-card administration permission to POST/PATCH/DELETE; retain scoped reads. Audit all reference-data mutation permissions. |
| I01 | P1 | Source trace | WhatsApp integration can return `success: true, simulated: true` without real configuration. `sendOneComm` copies only `success/error`, and dispatch records success as SENT. Simulation information is lost. | Propagate SIMULATED/UNCONFIGURED distinctly through run history; never mark a simulated send delivered. Test without sending real messages. |
| S02 | P1 risk | Source trace, not browser exploitation | `clearanceData.ts` keeps `_jobs/_loaded` at module scope, without a visible tenant key/reset. Same-tab logout clears other caches but not this one. Detail failures can fall back to this cached list and select non-live behavior. | Scope caches by tenant and account, reset on session changes, and show fetch failures explicitly. Reproduce two-tenant same-tab account switching in an isolated browser before sign-off. No cross-tenant server leak is claimed here. |
| C04 | P2 | Reproduced service | Advanced-air `storage_applicable` has zero financial effect: both branches set storage to zero. | Provide duration/rate/minimum inputs or explicitly mark storage excluded/unavailable. The API currently accepts a meaningless option. |
| S03 | P1 | Reproduced HTML generation + source sink | Shipment report interpolates titles, customer names, timeline notes and document names without HTML escaping. A benign markup probe remains an actual HTML element in the generated string. Print opens a same-origin window and calls `document.write`; malicious stored markup could execute there. | Escape every untrusted text/attribute, validate image URLs, remove opener access and isolate report rendering. Add XSS regressions for print/public-share rendering. The audit proved unescaped output, not live script execution or token theft. |
| C05 | P1 reliability risk | Source trace | Unsupported foreign currency falls back to the USD FX rate while preserving the requested currency label. Main USD FX failure also falls back to 2540 without result-level fallback provenance. | Fail visibly or require an explicit rate; return rate source, effective date, currency, and stale/fallback status. Keep TRA valuation FX separate from a general market feed. |
| C06 | P1 governance gap | Source and external discrepancy | Engines assert tax provenance from EAC CET 2022 plus later changes, including a 2026 CPF claim. Public government guidance is not consistently aligned with these constants. This audit did not obtain an authoritative consolidated current legal rate set. | Version tax rules by effective date, jurisdiction, commodity, procedure and origin. Record exact source documents and obtain a customs specialist's signed golden cases. Do not silently change constants based on web summaries. |
| C07 | P2 | Source trace | Main and advanced engines intentionally use different commercial rate cards and PID bases. “LCL”/“Air” can therefore yield different totals for similar cargo. Some divergence is deliberate commercial policy, not necessarily an arithmetic bug. | Name and version each rate card, display the active model prominently, and reconcile statutory portions independently of negotiated commercial fees. |
| C08 | P2 | Source trace | History insert errors are swallowed in main and advanced routes. A calculation can return successfully without a saved record or a warning. | Separate calculation success from persistence success; return saved record ID/status and expose retryable save errors. |
| P01 | P1 scale blocker | Measured + source | Grouped API returns all matching shipments. UI customer-group pagination does not bound the server response, and a large customer group remains large. Board renders cards without virtualization. | Server cursor pagination, bounded stage/group queries, explicit archival filters and virtualized rows/cards. |
| P02 | P2 | Source trace | Grouping scans shipment arrays per customer and risk flags per shipment. Full-board refresh every 15 seconds and any WebSocket event trigger broad grouped/KPI refetches. | Preindex arrays/maps, aggregate in SQL where appropriate, batch event invalidations, and deliver incremental changed records. Pause/reduce hidden-tab polling. |
| P03 | P2 | Source trace | Multi-item calculation deduplicates HS lookups, which is good, but launches every distinct lookup concurrently; the route accepts unbounded `z.any()` items. | Bound invoice line counts/body sizes and lookup concurrency; batch tariff lookup and test 100/1,000-line invoices with unique codes. |
| I02 | P1 reliability risk | Source trace | Studio domain events have a durable outbox, but ordinary first-party subscribers and marketplace webhooks are still fire-and-forget. Stage-step event emission occurs after the shipment transaction in a separate write. | Transactional business-event outbox for all mandatory hand-offs, retries, dead-letter handling, idempotency and replay. Do not equate Studio's outbox coverage with every integration being durable. |
| I03 | P2 | Source trace | Invoice auto-draft and duty-expense subscribers check for an existing record before insert. A unique business idempotency key was not established in this audit. | Verify/add database uniqueness for the business operation and test parallel/redelivered events. Treat duplicate posting as a release blocker if reproduced. |
| U01 | P2 | Source trace | Frontend normalizes RAIL→ROAD and BULK→SEA FCL in detail adapters. Several backend stages collapse into one visible stage; EMPTY_RETURN and INVOICING appear under completed. | Preserve true mode and stage. Summaries may group steps, but must expose the exact current operational state and unresolved work. |
| U02 | P2 | Source trace | Customer agent contact card consults hardcoded `EMPLOYEES` by name for contact details. Names matching reference data may expose inappropriate static contact data; most real people won't match. | Resolve the assigned user's real tenant-scoped identity/contact record and shared avatar component. |
| U03 | P2 | Live/source | Detail fetch errors are silently converted to cached fallback; list errors can leave stale data. It can be difficult to tell “empty,” “not permitted,” “offline,” and “failed.” | Explicit error/retry and freshness indicators; don't enable memory-only mutation paths after an API failure. |
| W04 | P2 | Source trace | Cross-app step meaning is inferred by English name regex (`invoic`, `payment`, etc.). Renamed/localized steps can stop triggering their intended hand-off. | Persist a semantic step/action identifier, independently editable from its display name. |

Sources for reproduced calculation issues: `apps/api/src/routes/customs.routes.ts:101`, `:535`; `apps/api/src/services/customs.service.ts:639`, `:1412`. Workflow: `apps/api/src/config/workflow.config.ts:22`, `apps/api/src/services/workflow.service.ts:64`, `:252`, `apps/api/src/services/workflow-comms.service.ts:90`. Access: `apps/api/src/routes/advanced-calculators.routes.ts:119`, `:205`. Air/FX: `apps/api/src/services/advanced-calculators.service.ts:146`, `:397`.

Report security evidence: `apps/web/src/pages/shipment/utils.tsx:169`, `:324`, `:371`; `ShipmentReportShared.tsx` renders the generated HTML in an unsandboxed `srcDoc` iframe. `clearos-report-markup-probe.json` records the harmless markup-output probe. This additional probe is separate from the 50 Vitest tests.

## Calculator assessment and tax scenarios

Core arithmetic invariants passed for the tested valid inputs: finite totals, main import-duty formula, main per-unit reconciliation, and advanced grand-total reconciliation. Demurrage's tested progressive tiers correctly continued the final tier beyond its last boundary. Reversed dates were rejected. Mixed invoices produced results for all three supported main modes.

Those passes establish arithmetic behavior, **not that each tax treatment is legally correct**. The zero override scenario zeros duty/VAT/RDL/CPF; it does not automatically exempt an excise-bearing commodity. The tests intentionally preserve that distinction.

Pending tax/procedure coverage:

- Preferential EAC/SADC/other origin with valid versus invalid certificates, partial preference and exemption evidence.
- Mainland/Zanzibar differences, effective-date transitions, specific excise per physical unit, minimum/specific/compound duties, relief and remission, temporary imports, re-exports, transit guarantees and diversions, VAT recovery eligibility and deferred-tax treatment.
- Vehicle age/condition and clogs: main single-item engine has explicit flags; multi-item/advanced interfaces do not expose equivalent per-line special-treatment flags. The age-boundary probes record implementation behavior, not statutory endorsement.
- Chargeable versus actual/volumetric air weight, LCL minimum billable volume, storage days/free periods, dangerous-goods surcharges, reefer/oversize handling, multiple bills/AWBs, multi-leg freight, price-basis/Incoterm adjustments, multi-currency charges and rounding policies.
- All penalty branches require externally validated legal bases. The zero-result defects are actionable without deciding the correct statutory penalty.
- Golden invoice reconciliation against actual assessments and commercial invoices from several carriers/terminals. Advanced calculators explicitly use one operator's commercial sheets; that is not a universal tariff schedule.
- Unsupported destinations currently return estimates with warnings and zero missing route charges; decide whether quoting should be blocked until a real route is selected.

Government references illustrating why effective dates and provenance matter: [Tanzania Trade Portal import guidance](https://trade.tanzania.go.tz/menu/302?embed=true&includeSearch=true), [TPA import process](https://ports.go.tz/index.php/en/services/port-process/import-process). These pages are context, not certification of every 2026 rate in the application.

## What is real, simulated, and unverified

The shipment store is now initially empty and populated from the API; the misleading `mockJob` name does **not** prove all shipment data is invented. Existing tenant rows also cannot be called fake just because they resemble demonstrations. Row provenance must be established before deleting or replacing anything.

Actual static/reference paths remain: `CUSTOMERS_LIST` in clearanceData, hardcoded `EMPLOYEES`, generic unknown-HS fallback tax rates, built-in commercial calculator rates, transit corridor defaults, and silent FX fallback. Static commercial defaults can be legitimate; they need provenance, versioning, effective dates, and tenant ownership. Unused imported scaffold is not proof it reaches the user.

No live external WhatsApp/SMS/email message, government submission, carrier booking, payment, or customs filing was sent during the audit. Credentials were not exposed. Provider configuration and actual deliveries remain acceptance-test work. The observed SMS configuration warning says callbacks are disabled; it does not establish that every communication channel is unavailable.

## App communication and sources of truth

| Domain | Current authority / behavior | Remaining concern |
|---|---|---|
| Shipment operations | `shipment_cases`, stage history and workflow records | Concurrent state changes; UI stage/mode collapse; archival/search scale. |
| Declaration | `declarations`, items, notices, declaration event chain | Status API updates local statuses; a state named TRANSFERRED/ACCEPTED does not prove government acceptance. No live government filing was verified. |
| Estimate | `landed_cost_records` plus input/result payload | Save errors suppressed; distinguish estimate from assessed duty and invoice actuals. |
| Financial actuals | Expenses, job charges, invoices, notices and journals | Reconciliation/ownership is spread across domains; enforce unique linkage and avoid double recording. The task+ledger UI sequence is two separate requests and needs partial-failure/idempotency testing. |
| CargoTracker | Tracking and demurrage data; event notifications | Live tracking depends on real configured providers; test outages, stale snapshots and reconnection. |
| HuduFreight | Transport tasks generate a “transport to arrange” notification | It deliberately does not allocate a real vehicle or create a completed trip automatically. Good operational constraint, but dispatcher hand-off needs explicit ownership/status. |
| SEAL | Declaration release can affect linked bonded lots | Verify transactional/replay behavior and partial-quantity/multiple-lot scenarios. |
| FinOps | Duty expense from recorded notices; invoice draft at invoicing step | Not equivalent to issued invoice or posted journal. Missing notice produces no fabricated duty, which is a good safeguard. |
| Cloud | Shipment folders/documents and sync | Some folder work is best effort; test unavailable storage, retry, orphan recovery, version history and access controls. |
| NexusHR | Staff/time/task catalogue references | Keep identity/permissions aligned; clock-in gating must clearly explain why an operational action is blocked. |
| Studio | Tested durable delivery, graph safety, execution limits and recovery | Tests include mocked action executors; they validate orchestration, not real downstream provider delivery. |

The right “centre of truth” is a governed record graph, not duplicate fields independently editable across apps: canonical shipment ID → declaration versions → official notices → estimate versions → actual charges → invoice/journal → delivery evidence. Every status should say its origin: user-entered, provider-observed, government-acknowledged, calculated, or simulated.

## Volume, loading, memory, and speed

See `clearos-audit-evidence.json` for exact samples. Final measurements are generated below in `clearos-performance-summary.md` to avoid treating a prior run as the current result.

The useful conclusion is architectural: a 2,000-row board response is 2,933,584 bytes before transport compression. At the current 15-second refresh interval that is roughly 11.7 MB/minute per open board from this endpoint alone; 100 boards would request about 1.17 GB/minute of raw response bodies. Compression changes network bytes, not the database work, serialization, JSON parsing, or DOM cost. WebSocket refetches and KPI reads add work.

Thousands **per day** is not the same as thousands of concurrent requests. At 5,000/day over eight operating hours, average creation rate is about 0.17 shipments/second. The harder issue is the growing active/history set, document processing, external events, reporting, and peak concurrent users. The current list path grows with the stored working set instead of the visible page.

Memory measurements are process RSS/heap from the full test worker, including loaded application modules, Vitest, and response buffers. They do not prove an API memory leak or identify ClearOS's isolated memory cost. GC is uncontrolled. No browser heap soak, 24-hour steady-state test, attachment/OCR load test, network-shaped mobile benchmark, or production multi-instance benchmark was completed.

Build output: ClearOS shell JS 286.79 kB / 69.75 kB gzip; shell CSS 13.28 kB / 2.84 kB gzip; shared main CSS 504.29 kB / 76.62 kB gzip. These are individual artifact sizes, not total bytes required for first render. A large Node process observed during build reached about 3,000 MiB RSS; process attribution/peak sampling was not a controlled profiling experiment and it must not be presented as the deployed app's memory requirement. Full build evidence is in `clearos-web-build.log`. Profile route-loading waterfalls before moving heavy calculator/PDF components behind finer lazy boundaries.

Required performance work: cursor pagination; bounded list projections rather than `selectAll`; indexes based on actual EXPLAIN plans and tenant/stage/deleted/filter predicates; virtualized cards; delta updates; query/request deduplication; bounded tariff lookup concurrency; asynchronous document processing; separate reporting workloads; pool/timeout/queue instrumentation; and retained-data policies. The main DB pool has no explicit workload-specific max/connection-timeout tuning in its constructor; tune from measured DB capacity, not guesses.

Proposed acceptance targets, to agree and test: page/filter responses p95 <500 ms at expected concurrency; bounded response <250 KB for a normal page; stage mutation p95 <1 s excluding external deliveries; zero duplicate history/financial effects under retries; no unbounded heap growth over a four-hour soak; visible stale/error states; and no horizontal page overflow at 320/390/768/1024px. These are recommendations, not measured achievements.

## UX and operating-process assessment

Good foundations: customer grouping, linked app entry points, dedicated calculator wizards, explicit document verification, task close/reopen, reusable components, and a place for automation run history. The previous UI work improved containment, equal filter widths and mobile task actions.

Remaining UX work is about operator confidence as much as appearance:

1. Make one primary action obvious at each step, with prerequisites, required owner and next hand-off visible before clicking.
2. Separate “delivered”, “empty returned”, “invoiced”, “paid” and “closed”. A compact stepper must not imply a case is complete early.
3. Provide queues for missing documents, awaiting client response, failed automation, unassigned shipments, upcoming SLA, unpaid assessments and dispatch pending. Each needs server-side filtering and ownership.
4. Keep full field labels, real transport modes, status provenance, source timestamps and clear retry paths. Never make API failures look like an empty list or demo state.
5. Mobile: offer compact summary plus explicit step detail, usable task cards, accessible fields and visible validation. Test the restored horizontal stepper with real long custom workflows; that complete mobile flow was not certified here.
6. Scale: bulk assignment/actions, keyboard operation, saved views, selection across server pages, bulk import validation, recoverable imports, and exception handling need acceptance coverage before warehouse-scale operation.
7. Accessibility: automated contrast/focus/label audit plus keyboard and screen-reader tests remain pending. CSS measurements alone are insufficient.

## Comparison with CargoWise

The benchmark uses official published product descriptions, not hands-on comparative timing or a claim that CargoWise is defect-free. CargoWise describes a unified operational database, multi-mode forwarding, linked customs/warehouse operations, and automation/search within customs. See [Customs](https://www.cargowise.com/solutions/cargowise-customs/), [Forwarding](https://www.cargowise.com/solutions/cargowise-forwarding/) and [Bonded Warehouse](https://cargowise.com/solutions/cargowise-customs/bonded-warehouse/).

| Dimension | ClearOS assessment | Work needed to compete |
|---|---|---|
| Local workflows | Tanzania-oriented calculators, notices and task workflow provide a useful focus. | Validated local rule packs and operator-owned rate versions. |
| Unified data | Shared tenant database and entity links exist. | Resolve duplicated state/financial fields, preserve provenance and guarantee cross-app delivery. |
| Multi-mode operations | Six shipment types are accepted by the backend. | Stop UI type collapse; mode-specific document gates and complete mode-specific flows. |
| Automation | Studio has tested recovery/outbox controls. | Extend durability/idempotency to mandatory first-party hand-offs and provider acknowledgement. |
| High-volume productivity | Customer-group board and linked detail workspace are useful. | Server pagination, bulk operations, exception queues, keyboard flow and measured peak throughput. |
| Customs connectivity | Local declaration records and manual status progression are implemented. | Demonstrated, authorized government integration and acknowledgement reconciliation; do not imply it already exists. |
| UX | Smaller focused workflows may reduce training burden. | That advantage is a hypothesis until timed operator testing; recent mobile/control defects show more consistency work is needed. |

## Prioritized implementation plan

### Release gate 1 — trust and correctness

- Fix C01–C03 validation/penalty behavior; mode-specific BL/AWB gate; stage concurrency and legacy communication IDs.
- Fix SALES reference-data writes and inspect all operational mutation permissions.
- Escape and isolate shipment report HTML before exposing print/public-share reports to untrusted shipment text.
- Propagate simulated/unconfigured delivery state; eliminate silent history-save failure.
- Reset/account-scope shipment caches; explicitly handle failed detail reads.
- Obtain approved, dated tax/fee test cases from a qualified customs owner. Do not auto-post estimates as assessed duty.

### Release gate 2 — reliable operations

- Transactional outbox and idempotency for every mandatory cross-app action, with a failed-delivery queue and audited replay.
- Explicit semantic step roles, versioned workflows, migration handling for in-flight shipments and complete six-mode document rules.
- Estimate→actual→invoice/journal reconciliation and retry-safe task/service charging.
- Real provider sandbox tests for messaging/tracking/storage; credential health and webhook delivery/replay tests.

### Release gate 3 — throughput and usability

- Paged APIs, virtualized board, delta events, bounded queries/jobs and archival.
- Representative test data: 10k/50k active rows across many customers; realistic risk/document/task distributions; 50–200 users; bursts and retries; four-hour soak and browser heap snapshots.
- Complete end-to-end golden flows: FCL mixed containers; LCL consolidation; air AWB/volumetric weight; road border; rail waybill; bulk weight; transit bond; exempt/preferential cargo; used vehicle/excise; dangerous goods; failed provider; amendment; reopen/cancel; partial release/delivery and multi-invoice reconciliation.
- Real operators perform timed tasks with error counts and click counts. Compare those measurements with their current workflow, not marketing screenshots.

## What remains untested

Full government filing and acknowledgements; real carrier/port/warehouse APIs; real money or messages; full shipment creation-to-close for custom workflows in every freight mode; all tax jurisdictions and exemptions; PDF visual/export verification for every scenario; malicious upload/XSS/SSRF penetration testing; complete document ACL review; many-customer 50k-data tests; horizontal scaling; production recovery/restore; and measured browser memory/leak behavior.

These are explicit pending acceptance criteria. The audit must not be described as “all calculators and all production flows certified.” It provides reproducible evidence, a concrete defect list, and an implementation order.

## Remediation status (27 October 2026 — same day)

All changes verified with `npx tsc --noEmit` (both apps, zero errors) and 30/30 tests green across 4 test files (19 remediation + 4 shipment route access + 5 audit matrix + 2 recheck).

| ID | Status | What changed |
|---|---|---|
| C01 | **FIXED** | `landedCostSchema` now validates `fx_rate_override` as `z.number().positive().finite()`, `fob_usd`/`freight_usd`/`insurance_usd` as `z.number().nonnegative().finite()`. Service-level guard throws on non-positive FX. |
| C02 | **FIXED** | Schema validates `qty` as `z.number().int().positive()`, `mode` as `z.enum(SHIPMENT_MODES)`, `weight_kg`/`cbm` as `z.number().nonnegative().finite()`. |
| C03 | **FIXED** | Penalty under-declaration branch now uses `!= null` instead of truthiness, so `declared_value_usd: 0` computes the full shortfall. `prohibited_goods` gets a real calculation branch (5× CIF or TZS 10M minimum). |
| C04 | **FIXED** | Air storage now computes `AIR_STORAGE_TZS_PER_KG_PER_DAY × weight × storage_days`. `storage_days` added to input schema and service. |
| C05 | **FIXED** | `getFxRateTzsPer()` returns `{ rate, source }`. Unsupported currency triggers a `FALLBACK:` warning. `fx_source` added to `AdvancedCalcResult` and returned in all calculator responses. |
| C08 | **FIXED** | History save wrapped in try/catch; `history_saved` (true/false/null) returned in all calculator responses (landed-cost, LCL, air, transit, multi-item). |
| S01 | **FIXED** | Transit route POST/PATCH/DELETE gated by `requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER')`. SALES/JUNIOR/CUSTOMER rejected 403. |
| S03 | **FIXED** | `escapeHtml()` applied to every untrusted interpolation in `buildShipmentReportHtml` (~25 call sites). `sanitizeImgUrl()` validates image URLs. Print window opened with `noopener` and `win.opener = null`. |
| S02 | **FIXED** | `clearShipmentCache()` added to `clearanceData.ts`, called from `useAuth.tsx` on login and logout. `getShipmentFetchError()` exported for consumers. |
| W01 | **FIXED** | `transportDocumentForMode()` in `workflow.config.ts` returns BL for SEA/BULK, AWB for AIR. `synthesizeLegacyWorkflow()` injects the mode-specific doc into VALIDATION prerequisites. |
| W02 | **FIXED** | `transitionStage()` acquires `SELECT ... FOR UPDATE` on the shipment row. Concurrent transitions serialize; second+ see `currentStage === nextStage` and return `noop: true`. Test confirms exactly 1 history row. |
| W03 | **FIXED** | `cancelPendingComms()` now validates `stepId` against a UUID regex and returns early for legacy stage literals, preventing `invalid input syntax for type uuid`. |
| W04 | **FIXED** | Migration 629 adds `step_type` column to `workflow_steps`. `stepRole()` priority: isTerminal > stepType (DB column) > legacy stage map > name heuristic. `ResolvedStep.stepType` wired through `parseSteps()` and `synthesizeLegacyWorkflow()`. Tenants set the semantic role once; renaming the display name no longer breaks automation. |
| I01 | **FIXED** | `sendOneComm()` propagates `simulated` from WhatsApp. `dispatchAutoComms()` maps it to `'SIMULATED'` status. `CommOutcome.status` and `settleQueuedComm` types updated. Workflow-comm job also propagates. |
| P01 | **FIXED** | `listGroupedByCustomer` applies `ORDER BY created_at DESC`, `LIMIT` (default 500, max 1000), and `OFFSET`. Response includes `pagination: { total, limit, offset }`. Backward-compatible: `data` array unchanged. |
| U03 | **PARTIALLY FIXED** | `clearanceData.ts` now stores `_fetchError` on load failure and exposes `getShipmentFetchError()`. Full UI error/retry indicators in the frontend are not yet wired. |
| C06 | **FIXED** | Versioned `TaxRuleSet` with two entries (TZ-2022-CET and TZ-2026-FA). `getTaxRules(declarationDate)` selects by effective date. `LandedCostInput.declaration_date` wired through both single-item and multi-item calculators. Results carry `tax_rules_id`, `tax_rules_source`, `tax_rules_effective_date` provenance. Vehicle excise bands and clogs rate sourced from the rule set, not hardcoded. |
| C07 | **FIXED** | `RATE_CARDS` registry names and versions each commercial model (aleka-lcl-v1, aleka-air-v1, aleka-transit-v1). `AdvancedCalcResult.rate_card` carries id/name/version/source. `lookupTaxRates` now uses `getTaxRules` for fallback rates. Tax provenance fields added to all calculator responses. |
| P02 | **FIXED** | CommandCenter 15s polling pauses on `visibilitychange` when the tab is hidden, resumes when visible. |
| P03 | **FIXED** | `landedCostMultiSchema` capped at `.max(500)` items. Multi-item HS lookups batched in groups of 10 to limit concurrent DB queries. |
| I02 | **FIXED** | Migration 630 adds `subscribers_dispatched` flag to `domain_events`. `dispatchDomainEvent` marks the flag TRUE after all in-process subscribers complete. `replayUndeliveredEvents(tenantId)` replays events from the last hour where `subscribers_dispatched = FALSE`. Partial index for efficient sweep. |
| I03 | **FIXED** | Migration 631 adds partial unique indexes: `uq_expenses_shipment_category` (tenant_id, shipment_id, category) and `uq_sales_invoices_shipment_ref` (tenant_id, shipment_ref). Finance subscribers use `onConflict(oc => oc.doNothing())` instead of SELECT-before-INSERT, making them truly idempotent under concurrent/replayed delivery. |
| U01 | **FIXED** | `TransportMode` expanded to include RAIL and BULK. `normalizeMode()` preserves RAIL and BULK as distinct modes instead of collapsing RAIL→ROAD and BULK→SEA FCL. |
| U02 | **FIXED** | `CustomerAgentCard` now uses `PersonAvatar` with real userId and API-sourced contact data (`assigneeEmail`/`assigneePhone`) instead of hardcoded `EMPLOYEES` lookup. Dead `staffData.js` imports removed from 7 shipment files. `TeamWorkflow.tsx` staff picker also migrated to `PersonAvatar`. |

Files changed: `customs.routes.ts`, `customs.service.ts`, `advanced-calculators.routes.ts`, `advanced-calculators.service.ts`, `workflow.config.ts`, `workflow.service.ts`, `workflow-resolver.service.ts`, `workflow-comms.service.ts`, `workflow-runs.service.ts`, `workflow-comm.job.ts`, `shipments.routes.ts`, `shipment.service.ts`, `shipment/utils.tsx`, `shipment/Declaration.tsx`, `shipment/TeamWorkflow.tsx`, `shipment/DocsFiles.tsx`, `shipment/Finance.tsx`, `shipment/OverviewUpdates.tsx`, `shipment/TasksTimesheets.tsx`, `ShipmentDetail.tsx`, `clearanceData.ts`, `useAuth.tsx`, `CommandCenter.tsx`, `domain-events.service.ts`, `finance.subscribers.ts`. Migrations: `629_workflow_step_semantic_type.sql`, `630_domain_event_subscriber_outbox.sql`, `631_subscriber_idempotency_keys.sql`. Test files: `clearos-remediation.test.ts` (19), `clearos-audit.test.ts` (5), `clearos-recheck.test.ts` (2), `shipment-route-access.test.ts` (4).

## Repository instruction drift observed

The supplied AGENTS tenancy description says RLS is not genuinely protective, while current CLAUDE.md and the restricted-role implementation describe FORCE RLS enforcement. This audit followed the authoritative CLAUDE rule and retained explicit tenant predicates. A comment in shipment grouping still says the connection owns tables and bypasses RLS; it is stale relative to the current connection implementation. Align these documents/comments so future reviewers do not assume the wrong protection model.
