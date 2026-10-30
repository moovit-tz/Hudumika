# Safetracker remediation — 26 October 2026

Implemented locally against the findings in [the review](SAFETRACKER_REVIEW_2026-10-25.md). This is a verified remediation pass, not a claim that every carrier integration or production deployment is certified.

## Implemented

- Removed the backend mock tracking generator and all operational sample-container presets. Unknown containers return 404; absent/unavailable providers return 503. Missing surveys, inspections, certifications, repairs, voyages and movements remain unrecorded. Diagrams use supplied weights rather than fixed printed ratings and are labelled illustrations.
- Container forms start with empty evidence, retain carrier/specification/cargo edits, validate container check digits and structured weights, and support explicit clearing. Backend owner detection no longer defaults unknown containers to MSC. Existing stored data is not silently rewritten.
- Operations roles are enforced server-side across tracking, freight booking, demurrage and cargo analytics, matching the existing frontend OPS_ROLES group. Tenant-scoped customer, shipment, carrier and rate-card references are checked. Public sharing remains a separate capability route.
- Lifecycle changes require the next valid stage and recorded location/evidence. Changes lock the container row, record the real actor, and are idempotent for the current stage. The UI waits for successful writes, disables invalid jumps, and opens a dedicated evidence page. Reloading a record no longer claims carrier, terminal, AIS or TANCIS synchronization.
- Added persistent survey and repair APIs and dedicated evidence forms. Repair completion persists; survey printing requires a recorded survey and produces a survey record, not an invented safety certificate.
- Added purpose-separated, expiring HMAC proofs for provider results. Forged, modified, expired, cross-tenant and stale provider results cannot be promoted to live snapshots. Manual edits lose provider verification. Refreshing a legacy/manual snapshot resets its untrusted original ETA. Fetch timestamps refer to the signed fetch, not a later save.
- Public shares have explicit output fields, seven-day expiry, rotation, revocation, an audit event, no-store/referrer headers and rate limiting. Share tokens are redacted from request logs. Older shares require recreation. Source/fetch labels appear in saved records, exports and shared views.
- Print templates escape nested business/provider/survey data and reject executable image URLs.
- Booking numbers use a durable tenant/year sequence, transaction locking and a uniqueness constraint. Confirmation locks the booking and creates one shipment under concurrent retries; replay with different details is rejected. Shipment references use collision-resistant IDs. Rate cards must match their carrier/lane/mode, and their currency is retained when quoting.
- Demurrage preserves zero free days, selects the latest applicable dated tariff, validates dates and consecutive rate tiers, preserves currency, and rejects return before discharge. Charges retain a tariff snapshot so later tariff edits cannot rewrite them. Active unposted accruals refresh; posted charges cannot be edited/returned/deleted through these paths. Unpriced active charges are flagged rather than presented as verified zero costs and cannot be posted.
- Cost posting runs with row locks in the same transaction as journal creation, records currency/FX metadata, uses published FX rates for the existing TZS ledger, and refuses posting when a rate is unavailable. Concurrent posting is covered by a real database regression test.
- Tariff creation/editing/tier configuration and availability controls are available in dedicated design-system pages. Dashboards group monetary amounts by currency, exclude unverified snapshots, deduplicate live tracking identities, count the actual container registry and label ETA stability as ETA stability rather than delivery punctuality. Invented risk/monthly/average figures were removed.
- Added bounded cursor pagination and load-more controls for snapshots, containers, bookings, carriers, rate cards and contracts, following the shared PaginatedResponse contract. Legacy array callers remain supported up to 1000 records; larger collections receive an explicit pagination error rather than silent truncation.

## Database changes

Applied locally through the normal migration runner:

- `626_safetracker_provenance_and_sharing.sql`: snapshot provenance/sharing fields, durable booking sequences, unique booking numbers, unassessed defaults.
- `627_safetracker_charge_tariff_snapshot.sql`: frozen tariff evidence for charges.
- `628_safetracker_latest_provider_snapshot_index.sql`: latest verified snapshot lookup index.

Do not edit these applied migrations. Production deployment must run migrations before the corresponding API. The unique booking index deliberately refuses pre-existing duplicates; investigate them rather than automatically deleting or renumbering documents.

## Verification

- `npm run typecheck`: API/web TypeScript, trigger/emitter checks, 19 design-system checks and encoding checks passed in the final completion run.
- API/database suite: 15 tests passed across two files, with no skipped tests. Safetracker integrity tests plus the existing ClearOS shipment-route access regression suite; disposable tenants and real Postgres, not a mocked database. Covers permissions, foreign references, persistence, lifecycle rejection/idempotency, survey/repair writes, provider-proof tampering, provider outage behavior, sharing, cursor isolation, concurrent booking/confirmation/posting, currency, tariff dates, frozen rates and chronology.
- Provider success/outage responses in those tests are controlled fixtures; no claim of live vendor acceptance is made.
- Frontend suites: 16 tests passed (carrier identification/assets and escaped print/empty-evidence regressions).
- Final production web build passed, with the existing large-chunk warning. This warning is not a build failure or proof of acceptable load performance.
- Authenticated browser checks confirmed the dashboard, container directory, rejected invalid save, empty/new form evidence, unassessed survey display, disabled invalid movement jumps, honest manual labels and the survey form. The normal narrow viewport and 390px layout were inspected; the idle lock interrupted further resized interaction checks. Actual writes were exercised in disposable API tenants rather than altering the user's business records.

## Legacy data requiring owner review

### Authenticated mobile continuation

The user subsequently unlocked the browser. At 390×844, verified survey date-picker selection, cancellation without saving, mobile menu navigation, tariff-page navigation, adding a second tier (31–60 follows 1–30), and cancellation without business-data writes. The tariff form measured 390px content width in a 390px viewport. Survey printing without evidence correctly displayed “Record a survey before printing a report”. Fixed the remaining missing-tariff average and labelled carrier breakdown amounts as recorded/incomplete; verified those labels in the browser. The full typecheck passed after this UI correction. Saved screenshots: `safetracker-survey-mobile.png`, `safetracker-tariff-mobile.png`, `safetracker-demurrage-mobile.png`.

Clicking a saved snapshot's PDF button did not expose a print window in the in-app browser. Actual PDF pagination/appearance and printer acceptance remain unverified; no successful PDF export is claimed. No inspection evidence or tariff was invented to create a printable business report. The normal viewport was restored after testing.

[Read-only aggregate audit](SAFETRACKER_LEGACY_DATA_AUDIT_2026-10-26.json): one stored container has an invalid check digit; three snapshots have unverified legacy provenance; three legacy shares require recreation. No cross-tenant customer links were found in the audited container/booking records. No business data was mutated by this audit.

Do not guess corrected container identifiers, certify old specifications or relabel old snapshots as live. Confirm the actual container/inspection documents and refresh tracking from a configured provider. Legacy records can contain values generated by the previous implementation even though new fallback generation is removed.

## Remaining production acceptance work

Continuation check: the read-only configuration audit found zero tenants with a ShipsGo key and zero with a Ship24 key. No credentials were exposed and no external requests were made. Live provider acceptance is blocked until credentials and authorised test tracking references are supplied through workspace integration settings. Provider proof parsing now rejects appended segments; regression assertions also verify expired proof rejection, expired public-share rejection and no-store headers. The updated API/database suite still passes all 15 tests, and the full typecheck passes. The survey tab remained locked when checked again, so the outstanding interactive mobile/print checks remain open.

1. Verify real ShipsGo/Ship24 credentials, current response contracts, quotas, outage recovery and monitoring against authorised test shipments. Signed fixture tests are not a substitute for this. Carrier booking remains the explicit manual adapter; automated carrier booking is not implemented. AIS remains the existing configured regional feed, not verified global coverage.
2. Approve carrier-specific commercial rules. The implemented calculator explicitly uses UTC calendar days excluding discharge day, consecutive tiers and continuation at the final tier rate. Business-day calendars, holidays, separate detention clocks and carrier-specific exceptions must not be assumed supported.
3. Review the legacy records above; recreate required public shares and reconcile historical financial/inspection evidence before operational reliance.
4. Complete the remaining authenticated mobile journeys, real print/PDF visual acceptance, deployment/load tests, operational alert delivery, restore/recovery exercise and production-environment configuration checks. Large legacy related-entity pickers must use the paged APIs when collections exceed the retained compatibility limit.

No production deployment or broad commit was made. Existing unrelated FinOps/catalogue changes in this shared checkout were preserved.

## Documentation drift observed

The supplied AGENTS.md description of apiFetch's development base URL is older than the current helper: the current code defaults to same-origin through Vite's proxy. This work uses the existing apiFetch helper and did not introduce another API base URL or HTTP client.
