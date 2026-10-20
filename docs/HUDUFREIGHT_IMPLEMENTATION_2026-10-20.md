# HuduFreight operational fixes — 20 October 2026

This implementation follows the 15-page source audit. It replaces synthetic production fallbacks with persisted workflows; it does not convert sample numbers into verified real-world facts. Existing records from old seed migrations still require provenance review. Real measurements, fleet identities and external-service credentials must come from the operator.

## Implemented

- Cargo and vehicle detail no longer import the hardcoded fleet dataset, invent approved manifests or substitute fake maintenance, drivers, documents, financial records, sensor states or GPS observations after failures. Unknown vehicles show an error. The illustrative truck is labelled as an illustration.
- One cargo workspace handles creation, measured items, packing, approval and dispatch. Vehicle detail links to that workspace with a vehicle filter instead of maintaining a second implementation.
- Cargo writes validate tenant-owned references and measurements. Draft changes, approval and packing acquire a manifest lock; approval requires every unit to be placed. Changing dimensions invalidates placements. Packing is bounded to 2,000 units. Shipment import rejects missing measurements instead of assigning 2,000 kg. Failed requests retain an error state rather than pretending to succeed.
- Dispatch locks the manifest and vehicle, applies the existing fleet dispatch checks, creates an actual in-progress trip and saves its ID atomically. A dispatched plan cannot be dispatched twice or edited as a draft.
- Parts now support location assignment, an opening-balance record, reasoned receipt/issue/adjustment movements, non-negative balances and a preserved movement history. Zero-stock parts are archived rather than deleting the ledger. Existing balances have no invented historical movements.
- Warehouse locations can reference tenant-owned SEAL compartments. The parts occupancy view retains its own units and exposes values above 100%. Depot receipts can select actual SEAL containers; a receipt and its equipment/container gate state commit together. Cross-tenant equipment and release-document references are rejected.
- Vehicle documents can link an existing Drive attachment or HTTP document URL and a tenant-owned ComplyOS certificate. One shared reader resolves current ComplyOS metadata for the document register, vehicle detail and analytics. Revoked/expired linked certificates block dispatch. A future expiry date is labelled **in date (unverified)**, not issuer verification.
- Pending fleet reminders created by a user appear in that user's Tasks linked-record feed. The existing five-minute reminder job delivers an in-app notification to the creator, recording `notified_at` transactionally. Concurrent sweeps do not duplicate that notification. This is an in-app channel, not a claim that email or SMS was delivered.
- Route planning has real address lookup, selectable geocoding results, road-network estimates and a persisted trip-booking action. Decorative priority/alternative-route controls and hardcoded cargo weight were removed. The UI states the limits of road estimates.
- Telemetry uses supplied event speed/time and handles ignition OFF. Missing batteries do not count as zero. Idling is labelled as idling. Vehicle status no longer guesses warehouse presence or loading from a percentage. Driver IDs remain stable, missing timing evidence is not 100% on time, and scheduled elapsed time is labelled as an estimate.
- History returns the latest bounded 2,000 positions in chronological order, retains unknown speeds as gaps and offers a date range. Analytics distinguishes request failures from entitlement restrictions and reports no fleet score for an empty fleet. Health inputs are batched rather than queried separately for each vehicle; the score remains explicitly rule-based.

## UI components

Registers use the shared Button, Banner, SearchToolbar, Badge, Input, date controls and table primitives. `ResponsiveTable` extends the existing Table: it retains a semantic table on desktop and labels each record field on screens up to 700 px. It supports both native table sections and the shared TableHeader/TableBody primitives. It is appropriate for short operational registers; dense data analysis should use a dedicated responsive view.

Driver, fleet and vehicle-detail tabs use the existing `TabsList wrap` API. Cargo illustrations fit their container, long forms use responsive grids, and the mobile route planner separates the map from its form. Canvas chart colours resolve the live design-system tokens rather than relying on unsupported CSS variable strings or a private palette.

## Verification

- Migrations 608, 609 and 610 applied locally using the existing migration runner.
- Eleven disposable-tenant integration tests exercise packing/dispatch persistence, approval locks, cross-tenant rejection, measured imports, stock ledger/archival, ComplyOS updates/revocation, reminder delivery/idempotency, Tasks aggregation, dock transitions and bounded history.
- Browser testing uses an isolated, labelled UI TEST tenant, not the user's operational records. Measured plan/item creation survived reload; packing saved two placements and then enabled approval. Populated registers and vehicle detail were inspected at mobile widths. Desktop cargo and parts views were also inspected.
- Full compilation, repository checks and final browser coverage are recorded in the final task response; an attempted check is not a pass.

## Practical limits

Packing is a geometric estimate, not an axle-load, restraint or physical-clearance inspection. Public OSRM/Nominatim results are not live traffic or truck-restriction guarantees. Provider/device availability, authentic issuer verification and production notification infrastructure require their real configuration and operational validation. The depot's existing Drive mirror remains best-effort; the saved interchange receipt and its generated PDF are authoritative for this workflow.

Pre-existing uncommitted freight versions were preserved outside the repository at `C:/Users/Viden/.codex/backups/hudufreight-20261020/` before removing their synthetic production paths. Unrelated eSign work and other sessions' untracked assets were not committed or deleted.
