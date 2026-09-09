# Hudumika Metrics & Sign — continuation plan

Implementation plan for two workstreams already underway this session — the
platform-wide **Metric Registry / HuduBI intelligence layer**, and **Hudumika
Sign's advanced execution** (witness/affidavit/notary on the same envelope,
not a second app). Both are real, live, and verified as far as they go; this
document is the honest remainder, written so another agent can execute
against it without re-deriving what's already settled, and so the work can
be reviewed against a concrete checklist rather than trusted on narrative.

---

## 0. How to use this document

- Each phase below is independently shippable — pick one, read its "What
  exists" pointers first, build, verify against its own checklist, stop.
  Don't start a phase whose "Depends on" line names an unfinished one.
- **Never mark a phase done in this file from a report alone.** The
  Verification Standard (§3) is not optional per-phase — an agent (human or
  AI) reviewing this work checks the live system, not the commit message.
- If a phase's "What exists" turns out to be stale (something changed
  underneath it), that's a real finding — stop and re-audit the current code
  before building on an assumption this file got wrong.
- This file itself gets updated as phases land: move a shipped phase's row
  into the "What exists today" tables in §1/§2 with a real file pointer, the
  same way every other row in those tables is sourced.

---

## 1. What exists today — Metrics & Intelligence

| # | Piece | Where | Real? |
|---|---|---|---|
| 1 | Cross-app event bus | `domain_events` (migration 129), `domain-events.service.ts`, `emitDomainEvent()` | Real. **No idempotency key** — a retried caller can double-write; this is exactly what `data_quality_findings`'s `duplicate_domain_events` check exists to catch, not a reason to add fake dedup logic downstream. |
| 2 | Metric Registry | `metric_definitions` table (411/413), `metrics-registry.service.ts` | Real, 26 rows, 60s in-memory cache (`invalidateMetricDefinitionsCache()` exported for a future write path). |
| 3 | Bliss metrics | `support-metrics.service.ts` (`computeBlissKpis`) | Real — shared by `/v1/support/metrics` (the Support Overview dashboard) and the registry's `bliss.*` keys. One calculation, two callers. |
| 4 | FinOps / ClearOS metrics | `clearos-metrics.service.ts`, `GLService.agedReceivables/agedPayables/trialBalance` wrappers in `metrics-registry.service.ts` | Real. |
| 5 | Metric Explorer UI | `HuduBIMetricExplorer.tsx` → `/hudubi/metrics` | Real — search, app filter, live value, lineage panel, inline alert-rule CRUD. |
| 6 | Alert engine | `metric_alert_rules`/`metric_alert_events` (414), `metric-alerts.service.ts`, `metric-alerts.job.ts` | Real — state-transition-only notifications (no spam on repeated breach), verified firing **autonomously** on the live scheduler, not just via a manual script. |
| 7 | Data-quality engine | `data_quality_findings` (415), `data-quality.service.ts`, `/hudubi/data-quality` | Real — 5 checks; found 26 genuine duplicate `settings.changed` events in production data on first run. |
| 8 | HuduBI's own pre-existing metrics | `hudubi-widgets.service.ts` (`HUDUBI_METRICS`, `runHuduBIMetric`) | Real, predates this session — 13 ClearOS/FinOps/CRM metrics, now also catalogued in `metric_definitions`. |
| 9 | Query Builder | `query-builder.routes.ts`, `queryBuilderSchema.ts` (`ALLOWED_TABLES`) | Real, SUPER_ADMIN-only, allowlist-secured. Now includes `domain_events` (payload column deliberately excluded — unvetted JSONB) and `metric_definitions`. |
| 10 | SuperAdmin cross-tenant reports | `reports.service.ts` (`METRICS`/`runMetric`), `superadmin-reports.routes.ts` | Real — a **separate, deliberately distinct** engine from HuduBI's tenant-scoped one: this one groups BY tenant for platform-ops comparison. Do not merge these two — different audience, different shape. |

**Jobs registered** (all in `apps/api/src/jobs/index.ts`, both BullMQ + interval-fallback paths, `JOB_REGISTRY`): `Metric Alert Evaluation` (15 min), `Data Quality Checks` (daily 03:30).

---

## 2. What exists today — Hudumika Sign

| # | Piece | Where | Real? |
|---|---|---|---|
| 1 | Core e-sign engine | `sign_envelopes/recipients/fields/events/templates/verifications` (267), `sign.routes.ts` (~1300 lines) | Real, `FORCE ROW LEVEL SECURITY` on all six tables (270). Public routes (`signPublicRoutes`) are a **separate exported plugin**, registered without the auth/entitlement hooks — that's intentional, not a gap (see the file's own header comment). |
| 2 | Non-destructive versioning | `previous_version_id`/`version_number` (342) | Real — "amend" creates a new envelope, never mutates a signed one. |
| 3 | Certifier / notary attestation | `is_certifier`/`certifier_title`/`certifier_roll_number`/`certifier_firm` (342) | Real, Tanzania-grounded (`certifier_title` examples are literally "Commissioner for Oaths", "Notary Public"). This is the platform's existing notary concept — extend it, never fork a parallel one. |
| 4 | Certifier credential directory | `sign_certifiers` (417), `sign_recipients.certifier_id` | Real — reusable directory + **live-enforced** expiry/revocation check in `POST /public/:token/sign` (rejects with a real 403, checked against current state, not the snapshot). |
| 5 | Identity verification | `require_otp`, `otp_code_hash/expires_at/verified_at` (273) | Real, SMS-based via `SmsIntegration` — the honest buildable middle ground; there is no gov-ID/KBA vendor integration in this codebase, and none should be invented. |
| 6 | Tamper-evidence | `anchor_hash`/`ots_proof`/`ots_proof_upgraded` (274), OpenTimestamps via `sign-anchor-stamp.job.ts` | Real, Bitcoin-anchored. |
| 7 | Unified execution model | `execution_type` (`NORMAL_SIGN`/`WITNESSED_SIGNATURE`/`AFFIDAVIT`/`NOTARIAL_CERTIFICATION`), `execution_role` (`SIGNER`/`WITNESS`/`AFFIANT`/`CERTIFIER`) (416) | Real — auto-inferred server-side (`inferExecutionType`), distinct audit events (`witnessed`/`certified`/`declared`) alongside `signed`, verified live via `pdftotext` on a real generated certificate. |
| 8 | Tenant stamp | `sign-stamps.routes.ts`, `sign_stamps`/`sign_stamp_requests` (277/278) | Real — the **tenant's own** visual stamp, distinct from a certifier's personal legal attestation. Don't conflate the two. |
| 9 | Certificate / audit trail PDF | `sign-pdf.service.ts` (`buildSignedPdf`, `drawAuditTrail`, `drawCertificationStamp`) | Real — `drawAuditTrail` titlecases `event_type` generically, so a new event type needs **zero** changes there to render correctly. Confirmed this still holds before adding another one. |
| 10 | Verification portal | `GET /v1/sign/public/verify/:code`, `SignVerifyPage.tsx` | Real — logs every lookup (`sign_verifications`), including not-found (migration 270 fixed a fake-zero-UUID sentinel that was silently swallowing that case — see §3.5). |
| 11 | Drive/Tasks/ComplyOS/CRM integrations (Phase S6, items 1/2/4/5) | `sign_envelopes.drive_file_id` (422), `createSignFollowUpTask()` in `sign-notify.service.ts`, `comply_applications.sign_envelope_id` (423) + `comply-declaration-pdf.service.ts`, `sign_envelopes.client_id` (426) + `Customers.tsx`'s "Signatures" tab | Real, shipped + live-verified 2026-09-08. See §5 Phase S6 for the full account — including a real pre-existing `request.user.id`-vs-`.sub` bug (10 call sites, 3 files) and a real, still-open gap where a Drive-sourced envelope's `document_data` never reaches the public unauthenticated signer. |

---

## 3. Guardrails — read before touching either codebase

These are not generic advice. Every one names a real defect this exact
codebase has shipped before (several from Antigravity's own prior sessions
here — see `antigravity_review_pattern` in project memory), and a phase
below will reproduce it if skipped.

### 3.1 No fabricated data, ever
If a metric/field has no real source, the correct output is an honest empty
state or an explicit "not available — no data source," never a plausible-
looking number. This session's whole Metrics program exists partly because
`hudubi.routes.ts` used to return hardcoded constants (`$28.4M revenue,
8,420 customers`) — don't reintroduce that shape anywhere, including inside
a "demo" or "example" code path that could ship live.

### 3.2 Use the existing design-system primitives — never hand-roll
`Select`/`Combobox`/`DropdownMenu`/`Badge`/`FeaturedIcon` already exist
(`apps/web/src/components/ui/`). A hand-rolled `<select>` styled to look the
same, or a `useState` dropdown with a `mousedown` listener, is a rewrite of
something that already works and already themes correctly. Check
`/admin/components` before building any new UI atom.

### 3.3 No popup/modal forms for multi-step flows
Established platform-wide rule (see `ComplyOS` precedent): a multi-step form
is a dedicated page/route, not a modal overlay. This applies to anything
built for the Certifier Directory admin UI, the Electronic Journal, KPI
targets, etc.

### 3.4 Migrations are additive, numbered sequentially, never destructive
Check the highest existing migration number in `apps/api/src/db/migrations/`
**at build time**, not from this document (concurrent sessions add
migrations too — this file was written at 417). Never rewrite an applied
migration. Never drop/alter a column in a way that loses data — see how 416
backfilled `execution_role`/`execution_type` from the pre-existing
`is_certifier` flag instead of discarding it.

### 3.5 A "not found" case is a real nullable value, never a sentinel UUID
Migration 270's own header documents the exact bug: `sign_verifications`
used a well-known zero-UUID for "code not found," which violated its own FK
and got silently swallowed by a `.catch()` — so not-found lookups were never
actually logged despite the code's own stated intent. If a lookup can
legitimately fail, the column is nullable and the failure path is tested,
not routed through a magic constant.

### 3.6 No `CustomEvent` + `localStorage` cross-tab/cross-component sync
A documented recurring source of race conditions in this codebase. State
that must be shared belongs in a real fetch/refetch cycle or a proper
context, not a `window.dispatchEvent(new CustomEvent(...))` picked up by a
`localStorage` listener elsewhere.

### 3.7 Tenant scoping is not optional, and RLS is the second line, not the first
Every new tenant-scoped table gets `FORCE ROW LEVEL SECURITY` in the same
migration that creates it (see 417's own policy, copied from 270's pattern)
**and** every query still carries an explicit `.where('tenant_id', '=', …)`
— RLS rejects a missing-scope query outright rather than silently leaking,
but a query relying on RLS alone to be "scoped" is still a bug per
`CLAUDE.md`.

### 3.8 Typecheck both apps after every meaningful change, and actually read the result
`npx tsc --noEmit` in both `apps/api` and `apps/web`, confirmed exit 0 —
empty output on success is normal, but the command must be confirmed to have
actually finished (a 0-byte log file mid-run looks identical to a clean
pass; wait for it).

### 3.9 Verify against the live running system, not just a typecheck
Every phase below ends in a **live** check — a real curl/Playwright round
trip against the running dev servers (web on 5173, API on 3001), reading
real output, not asserting behavior from reading the code. Two false alarms
this session (a Radix popper "overlap" and a dark-mode "bug") turned out to
be screenshot artifacts once checked with `getComputedStyle` — the
discipline runs both directions: verify claims of breakage AND claims of
success against the real system.

### 3.10 Delete scratch verification scripts after use — and confirm the delete actually landed
`rm -f` with a path relative to a shell whose cwd silently drifted from an
earlier `cd` will exit 0 while deleting nothing. Use absolute paths for
cleanup, and follow with an `ls` that is expected to fail.

---

## 4. Phases — Metrics & Intelligence

### Phase M1 — Instrument NexusHR and CargoTracker — **Done, re-verified live** 2026-09-09
Shipped earlier in this session (migration 419) with 4 real `'special'`-kind
metrics — `nexushr.headcount`, `nexushr.pending_leave_requests`,
`nexushr.late_clockin_pct`, `cargotracker.active_trips` — each backed by a
real SQL query in `metrics-registry.service.ts` (`users`, `hr_leaves`,
`hr_attendance`, `trips`), not an invented number. Re-verified today after
the dev servers needed a restart (stale/EADDRINUSE processes from an
earlier session, cleaned up and relaunched): called `computeMetricValue()`
directly and the real `GET /v1/metrics/:key/value` HTTP endpoint for all 4
keys against a real tenant with real data, cross-checked two of them
(`headcount`, `active_trips`) against a hand-written SQL count — exact
match on both (7 and 4 respectively).

**Depends on:** nothing (Metric Registry is fully built).
**What exists to build on:** `hr_payroll`, `hr_clock_sessions`/attendance
tables (NexusHR), `shipment_cases`/`stage_history` already partly used by
`clearos.clearance_turnaround_hours` (CargoTracker overlaps ClearOS's own
tables — check for an existing CargoTracker-specific table before assuming
one is needed).
**Build:** Following the exact `finops.*`/`clearos.*` pattern in
`metrics-registry.service.ts` — real headcount/attendance-punctuality
metrics for NexusHR (e.g. `nexushr.late_clockin_pct`), real shipment
turnaround/dwell metrics for CargoTracker if genuinely distinct from what
ClearOS already covers. **Audit first**: if NexusHR or CargoTracker already
computes one of these numbers somewhere (a dashboard, a report route), reuse
that calculation the way `support-metrics.service.ts` reused Bliss's
existing `/metrics` endpoint — don't re-derive.
**Don't:** invent a metric with no real backing table. If NexusHR has no
attendance data for a given tenant, the registry entry still registers
(definitions are global), but `computeMetricValue` returns 0/empty honestly.
**Verify:** direct script call to `computeMetricValue()` against a real
tenant with real data (mirror the Milestone-2 FinOps/ClearOS verification in
this session's history — cross-check the new metric's value against
whatever existing UI already shows that number, if one exists).

### Phase M2 — KPI Center with real targets — **Done, re-verified live** 2026-09-09
Shipped earlier in this session — `metric_kpi_targets` (tenant-scoped,
migrations 420/421, the latter a real fix for a column the concurrent
agent's own migration had never added), `kpi-targets.service.ts`'s
`listKpiTargets` computing `ON_TARGET`/`AT_RISK`/`OFF_TARGET` live against
the metric's current value, `GET/POST/DELETE /v1/metrics/kpi-targets`, and
`HuduBIKpiCenter.tsx` reading only those real endpoints (checked — no
fabricated fallback data). Re-verified today: created a real target
(`nexushr.headcount`, target 8, direction `above`) via real HTTP against a
tenant whose real headcount is 7 — the live status came back exactly
`AT_RISK` with `progress_pct: 87.5` (7/8×100), matching the hand-computed
prediction from reading the actual classification logic before running it.
Target deleted and confirmed gone afterward.

**Depends on:** M1 optional, not required.
**What exists:** none — this is genuinely new. `metric_definitions` has no
`target`/`threshold` concept today (that's what `metric_alert_rules` has,
but a KPI target is a different thing: a standing goal, not a firing
condition).
**Build:** Add `target_value`/`target_direction` (`above`/`below`) as
optional columns on a new **tenant-scoped** table `metric_kpi_targets`
(mirrors `metric_alert_rules`'s shape — tenant sets its own target per
metric, not a global one). A `/hudubi/kpi-center` page listing every metric
with a target set, colored `ON_TARGET`/`AT_RISK`/`OFF_TARGET` per §23 of the
original spec, reusing `Badge` variants exactly like the Alert engine does.
**Don't:** rebuild alert-rule infrastructure — a KPI target with no
notification is a simpler, separate concept from an alert rule; don't force
them into one table just because they're both "a threshold on a metric."
**Verify:** set a real target on `bliss.sla_compliance`, confirm the badge
reflects the real live value against it, confirm it updates on the metric's
own TTL-cached refresh cadence.

### Phase M3 — Expand data-quality checks — **Done, re-verified live** 2026-09-09
The concurrent agent added 3 real checks to `data-quality.service.ts`
earlier in this session: `sign_recipient_signed_before_envelope_created`,
`orphan_metric_alert_rules`, `expired_verified_certifiers` — each a real
SQL query, same `Finding` shape as the original 5. Re-verified today more
rigorously than a smoke test: ran `POST /v1/superadmin/data-quality/run`
clean first (no crash, real pre-existing `duplicate_domain_events` findings
returned, proving all 8 checks execute inside the same `Promise.all`
without any of the 3 new ones throwing) — then inserted a real, deliberate
violation (a `sign_certifiers` row marked `verified` with an expiry date in
2020) and re-ran: the check correctly flagged exactly 1 finding, correct
count, correct sample id, correct description. Deleted the test row and
ran once more — the finding correctly cleared. Not just "doesn't crash,"
genuinely proven to detect what it claims to detect.

**Depends on:** nothing.
**What exists:** `data-quality.service.ts`'s 5 checks, each a real SQL query
against a real table with genuine timestamp/duplication logic.
**Build:** More checks in the same file, same `Finding` shape. Candidates,
each needs the same "does this column pair actually exist and could
plausibly go wrong" check `stage_history`/`support_tickets` got before
building:
  - `sign_recipients.signed_at < sign_envelopes.created_at` (mirrors the
    exact "ticket.resolved before ticket.created" example from the original
    metrics spec, now applied to Sign)
  - Orphaned `metric_alert_rules.metric_key` pointing at a `deprecated` or
    now-missing `metric_definitions` row
  - `sign_certifiers` with `expiry_date` in the past and
    `verification_status = 'verified'` (a live-relevant finding, not just a
    hygiene check — flags exactly the credentials Sign's own enforcement
    will start rejecting)
**Don't:** add a check for something the schema already makes impossible —
audit the target columns' constraints first, the same way 415's own header
explains skipping the `actor_id` orphan check because a real FK already
prevents it.
**Verify:** seed one real violation per new check (mirroring how the
existing 5 were verified against genuine data), run `POST
/v1/superadmin/data-quality/run`, confirm the finding appears with the
correct tenant/count, clean up the seed.

### Phase M4 — Cost & unit economics — **audited, confirmed not buildable**, 2026-09-08
Did the real audit rather than assuming. Searched the whole codebase for
any cloud-provider billing API integration, a stored per-tenant compute/
storage metering table, or any table/column named anything like
`infra_cost`/`unit_economics`/`cost_per_unit`/`cloud_spend` — **zero
matches**. Checked the plan's own flagged exception specifically:
`sms_messages.segments` (288_sms_app.sql) is real — it tracks how many
160-char GSM-7 segments a message used, explicitly "for real cost/usage
visibility" per that migration's own comment — but that's *usage*
(a count), not *cost*. Searched every SMS/gateway migration and route for
a stored per-segment or per-message **rate** and found none — no gateway
config table has a price column, `lib/usage.ts`'s own metering is a plan-
quota item counter with no dollar figure attached anywhere. There is
consequently no real number to multiply a segment count by; "SMS sent ×
$0.01" would be a fabricated rate, not a traceable one, exactly the outcome
the plan itself warned against.

**Verdict: not buildable for real, full stop** — not "SMS is real but infra
isn't," the same "no" everywhere, because no cost figure of any kind is
stored anywhere in this platform. Building this phase would require either
(a) a tenant manually entering their real contracted rates with each
provider (SMS gateway, MinIO/object storage, the AI providers) — a real
feature, but a data-entry one, not a metrics one — or (b) integrating each
provider's real billing API, both of which are new scope decisions for a
human to make, not something to build silently on a guess. Nothing shipped
for this phase; recording the audit itself so a future session doesn't
redo this same search.

### Phase M5 — Semantic layer — **Done**, 2026-09-08
Built exactly the thin version the plan called for — resisted the urge to
build a graph-relationship engine. Migration 433 adds `semantic_entities`
(platform-level reference data, no tenant_id/RLS, same shape as
`metric_definitions`/`sign_jurisdiction_rules`), seeded with 3 real rows
describing how a `customer` resolves in `crm` (the canonical
`customers` row) and in `sign` (two ways: the structured `client_id` FK
from Phase S6, and a fuzzy `sign_recipients.email` match). The registry is
real metadata a resolver function actually reads (`hudubi-entity.service.
ts`'s `resolveCustomerAcrossApps` queries it to describe which apps are
registered) — not decoration sitting beside separately-hardcoded logic
with no relationship to it. The join itself stays a plain, specific,
safe function rather than registry-driven dynamic SQL: a future entity
added to the registry needs a matching resolver case, which is the
deliberate scope boundary, not an oversight.

New `GET /v1/hudubi/entities/customer/:id` and a new `HuduBIEntityExplorer.
tsx` page ("Entity Explorer," under HuduBI's Data Management nav) let
someone search for a real customer and see every real record resolved for
them across apps, each one labeled by *how* it was matched (direct link
vs. email match) — the point being that this makes the difference visible
and honest rather than presenting fuzzy and structured matches as
identical.

**Verified live via real HTTP against real data**: created two real test
envelopes for a real customer — one linked via the structured `client_id`
FK, one deliberately *not* linked but with a recipient typed with the same
email — and confirmed `GET /entities/customer/:id` returned exactly those
two hits, correctly labeled `client_id` and `email` respectively, with the
right customer name/email and the full registered-apps list, and no
double-counting. Both test envelopes deleted afterward, confirmed gone.

---

## 5. Phases — Hudumika Sign advanced execution

### Phase S1 — Electronic journal — **Done, re-verified live** 2026-09-09
Shipped earlier in this session — real `GET /v1/sign/journal`, filtered
join over `sign_events`/`sign_envelopes`/`sign_recipients`. Re-verified
today with a full real round trip: created and sent a real test AFFIDAVIT
envelope, completed it via the real public sign endpoint, confirmed the
journal correctly shows it — right `event_type: "declared"` (the
AFFIANT-specific event, not a generic "signed"), right title/execution_type/
verification_code/anchor_hash/recipient — then confirmed the append-only
guarantee for real: attempted `PATCH`/`DELETE` on the journal entry and
`PATCH` on the underlying event directly, all three correctly 404 (no such
route exists to attempt). Test envelope and all child rows deleted
afterward, confirmed gone.

**Depends on:** nothing (416 + 417 are both shipped).
**What exists:** every act is already a real, queryable `sign_events` row —
`witnessed`/`certified`/`declared` (416) plus the original `signed`/
`stamped`/`verified`/etc. A journal is a **filtered view**, not new capture.
**Build:** `GET /v1/sign/journal` (authenticated, `DOCUMENT_ADMIN_ROLES` or
broader per-tenant read) — joins `sign_events` (filtered to
`certified`/`witnessed`/`declared`) against `sign_envelopes`/`sign_recipients`
for document title, certifier/witness name+credential, hash
(`sign_envelopes.anchor_hash`), verification code. A dedicated
`/sign/journal` page, reusing `SignInbox.tsx`'s table patterns.
**Correction control** (original spec §17 — "must not be casually edited"):
do **not** allow UPDATE/DELETE on a journal row. A correction is a new
`sign_events` row with `note` explaining what's being corrected and
referencing the original event's id in that note — append-only, matching
`domain_events`'s own "a log, not a ledger" philosophy stated in its own
migration header.
**Verify:** real certifier completes a real (test) certification, confirm
the journal shows it with the correct hash/credential/timestamp, confirm no
UPDATE path exists (attempt one via curl against a route that shouldn't
exist — 404 is the correct, verified answer).

### Phase S2 — QR verification code — **Done, re-verified live** 2026-09-09
Shipped earlier in this session — `sign-notify.service.ts` generates
`QRCode.toDataURL(verify_url, ...)`, confirmed by direct source read to
encode `verify_url` specifically, never the private document. Re-verified
today to the plan's own stricter standard ("scan a real generated QR... a
QR-decoding library," not just confirm one exists): completed a real test
envelope, took the real returned `qr_data_uri`, actually decoded the raw
PNG pixel data with `pngjs` + `jsqr` (both already real project
dependencies) — the decoded QR content was byte-for-byte
`http://localhost:5173/sign/verify/HSGN-244CBF-5122CB`, exactly the real
`verify_url` in the same response. Then called that exact decoded URL and
confirmed it resolves correctly (`valid: true`, right title/status, and —
a bonus cross-check — the concurrent agent's Digital Execution Seal system
also correctly verified the same document: `sealPresent: true,
signatureValid: true`). Test envelope deleted afterward, confirmed gone.

**Depends on:** nothing.
**What exists:** `GET /v1/sign/public/verify/:code` and `SignVerifyPage.tsx`
already do everything the original spec's §59-60 verification portal asks
for — status, hash, timestamp, no private content exposed by default. **This
phase is smaller than it looks**: it's "generate a QR image encoding the
existing verify URL," not a new verification system.
**Build:** A QR-generation library loaded the same way any other frontend
dependency is (check `package.json` for one already present — `qrcode` is
common and small; if absent, this is a real new dependency and should be
flagged, not silently added) rendering `https://.../sign/verify/HSGN-...`
(the code already exists on every envelope) into the stamp `sign-pdf.service.ts`
draws, next to the existing text verification code.
**Don't:** point the QR at anything other than the verify URL — original
spec §60 is explicit that it must never be the private document download
URL.
**Verify:** scan a real generated QR (a phone camera or a QR-decoding
library) against a real completed test envelope's stamp, confirm it lands
on the correct `/sign/verify/:code` page showing correct status.

### Phase S3 — Sign metrics → Metric Registry (fast — do this early) — **Done, re-verified live** 2026-09-09
Shipped earlier in this session — `sign-metrics.service.ts`'s
`computeSignKpis`, one shared calculation reused by both `GET /v1/sign/
metrics` and the registry's 6 `sign.*` special handlers
(`envelopes_created`, `completion_rate_pct`, `avg_completion_hours`,
`witnessed_count`, `certified_count`, `otp_verified_count`). Re-verified
today by calling both surfaces independently and comparing every field —
`created: 8` = `sign.envelopes_created: 8`, `completionRatePct: 85.7` =
`sign.completion_rate_pct: 85.7`, `avgCompletionHours: 0.9` =
`sign.avg_completion_hours: 0.9`, and all three zero-count fields matched
too. Exact match on every field is real proof of "one shared calculation,
two callers," not two formulas that happen to look similar.

**Depends on:** nothing from Sign; everything from Part 1 of this session's
Metrics program (already shipped).
**What exists:** the exact same `'special'`-kind registry pattern
`bliss.*`/`finops.*` already use. Sign has real, ready-to-register
countables: envelopes created/sent/completed/declined/expired,
`AVG(completed_at - sent_at)` for completion time, witness/certifier
completion counts (`sign_events.event_type IN ('witnessed','certified')`).
**Build:** a `sign-metrics.service.ts` mirroring `support-metrics.service.ts`
exactly (one function, e.g. `computeSignKpis(trx, tenantId, days)`, reused by
both a new lightweight `/v1/sign/metrics` summary endpoint — if Sign doesn't
already have one, check first — and the registry's `sign.*` special
handlers), then a migration seeding the new `metric_definitions` rows the
same shape as 413's FinOps/ClearOS seed.
**Verify:** identical to this session's Milestone 2 FinOps/ClearOS
verification — direct `computeMetricValue()` call against real tenant data,
cross-checked against whatever Sign's own dashboard already shows (or a
direct SQL count if it doesn't have one yet).

### Phase S4 — Remote session — **Done**, 2026-09-08
Audited first, and reuse turned out to be an even better fit than the plan
guessed: this is not just "a real meeting system exists" — a **cross-app
meeting-link component already exists and is already shared three ways**
(`components/MeetingLinkPanel.tsx`, wired into Calendar/Tasks/Notes via
`369_meeting_link_everywhere.sql`). It creates a real Bliss meeting via the
real `POST /v1/calls/meetings` when the tenant is entitled, and — critically
— **already has a built-in Jitsi fallback** for a tenant that isn't, so
gating this behind Bliss's own entitlement (every meeting route requires
`requireEntitlement('bliss')`) can never leave a Sign-only tenant with a
dead button. Reused the component completely unmodified; wrote zero new
meeting-creation code.

Migration 432 gives `sign_envelopes` the exact same two columns, same
names, same semantics `369_meeting_link_everywhere.sql` already established
for calendar_events/tasks/notes (`meeting_url`, `bliss_meeting_id`) — not a
fourth, differently-shaped copy. `SignEditor.tsx` renders `MeetingLinkPanel`
for a NOTARIAL_CERTIFICATION envelope only; the sender sees a "Join Notary
Session" badge on the envelope detail page; the external certifier/affiant
sees the same real join link on the *public* signing page. No fabricated
`session_completed` event — the existing generic `logEvent(..., 'updated', ...)`
on every envelope save already captures "a session was attached" in the
real audit trail honestly, without inventing a "meeting ended" signal this
platform has no way to actually observe.

**Found and fixed in the same pass, caught only by testing the real HTTP
response (not by reading the code):** `GET /public/:token` does not pass
the raw `sign_envelopes` row through — it reconstructs an explicit "safe
public fields" allowlist object (phone-masking, internal-field exclusion),
which I read the *query* for but not the *response shape*. `meeting_url`
was silently dropped from that allowlist, so the external signer would
never have actually seen the join link despite everything else working —
confirmed the gap with a real curl call, then confirmed the fix the same
way. A real, structural reminder that `.selectAll()` on the query says
nothing about what a route actually returns.

**Verified live via real HTTP, not just reading code**: created a real
Bliss meeting through the actual `POST /v1/calls/meetings`, created a real
envelope with a CERTIFIER recipient (confirmed `execution_type` correctly
inferred to `NOTARIAL_CERTIFICATION`) carrying that meeting's URL and id,
confirmed `GET /envelopes/:id` returns both fields correctly, confirmed
`GET /public/:token` — the external certifier's own view — returns
`meeting_url` correctly only after the fix above. Bliss's own video-calling
UI itself (joining, waiting room, etc.) was not re-tested — that is
pre-existing, already-proven infrastructure this phase only had to link
to, not re-verify. Test envelope and test meeting both deleted afterward,
confirmed gone.

### Phase S5 — Jurisdiction engine — **Done**, 2026-09-08
Built `sign_jurisdiction_rules` (migration 430) — platform-level reference
data (no tenant_id/RLS, same shape as `metric_definitions`), and did the
real primary-source research the plan called for rather than inventing
rules: fetched and OCR'd (`pdftotext`, since both government PDFs are
scanned images, not text) Tanzania's actual **Electronic Transactions Act,
CAP 442 R.E. 2022** (mof.go.tz's own published consolidated text) —
s.6/s.7 (secure electronic signature — maps directly onto how Hudumika
Sign's own signing flow already works), s.10 (notarisation/oath — the
explicit statutory basis for AFFIDAVIT/NOTARIAL_CERTIFICATION, conditioned
on the certifier being a real, currently-verified `sign_certifiers` entry,
which the platform already enforces live). Also checked the **Notaries
Public and Commissioners for Oaths Act, CAP 12 R.E. 2023** for a
conflicting physical-presence requirement — its own OCR came back too
corrupted to safely quote, so the migration says exactly that rather than
guessing, and relies on the ETA's own explicit s.10 instead. Seeded: TZ
`NORMAL_SIGN`/`WITNESSED_SIGNATURE` = SUPPORTED, `AFFIDAVIT`/
`NOTARIAL_CERTIFICATION` = SUPPORTED_WITH_CONDITIONS (with the real
condition spelled out); KE/UG/RW = honest `NOT_SUPPORTED`/"not yet
reviewed" for all 4 execution types — architecture only, no legal claim.

Built `sign-jurisdiction.routes.ts` (own file) — `GET /jurisdiction-rules/
mine` resolves `tenants.country` server-side (a column that already
existed for holiday calendars, reused here) so the editor needs no second
lookup, plus a generic `GET /jurisdiction-rules?jurisdiction=` for the
small fixed set. `SignEditor.tsx` computes the effective execution type
client-side (mirrors `sign.routes.ts`'s own `inferExecutionType` priority
order) and shows a non-blocking, color-coded advisory — never "legally
valid," only whatever the seeded row's own `status`/`conditions` text
says.

**Found and fixed in the same pass**: a real, live, freshly-introduced
break in `sign.routes.ts` — the concurrent Sign-seal work had retyped and
exported `DOCUMENT_ADMIN_ROLES` as `UserRole[]` (for `sign-forensics.
routes.ts` to reuse) but never updated `userRole()`'s own return type,
breaking `tsc` at 4 call sites; plus one more in `sign-forensics.routes.ts`
itself (a `status` query-string filter passed as bare `string` against a
literal-typed column). Neither was mine, both were real and currently
blocking a clean project-wide typecheck; fixed both narrowly (`userRole()`
now returns the real `UserRole`; the forensic-case filter casts to the
already-exported `ForensicCaseStatus`) rather than left standing or
silently worked around.

**Verified live via real HTTP against real, pre-existing tenant data**
(not seeded for this check): a real tenant with `country: 'TZ'` already
set correctly resolved all 4 real TZ rows through `/mine`; the generic
lookup correctly returned all 16 seeded rows (4 jurisdictions × 4
execution types) with case-insensitive matching; a real tenant with no
`country` set returned the honest `{jurisdiction_code: null, rules: []}`
empty state, not an error or a guessed default.

### Phase S6 — Platform integrations, in priority order
**Depends on:** nothing blocking; do these roughly in this order (cheapest/
highest-value first):
1. ~~**Drive**~~ — **Done.** A completed envelope's signed PDF now writes
   back into Cloud Drive as a real `cloud_files` row (`sign_envelopes.
   drive_file_id`, migration 422) via the same `MinioIntegration.
   uploadCloudFile`/`bumpCloudFolderCount` primitives `files.routes.ts`
   already uses — best-effort (try/catch) inside the public completion
   handler, so a MinIO-less dev environment no-ops rather than failing the
   signing itself (confirmed live: `drive_file_id` stayed `null` in local
   dev with no MinIO running, and the signing flow still completed cleanly).
2. ~~**Tasks**~~ — **Done.** `createSignFollowUpTask()`
   (`sign-notify.service.ts`) creates a real `tasks` row (dedicated "Sign
   Follow-ups" `task_lists` row per user, `subject_type: 'sign_envelope'`)
   on decline (`POST /public/:token/decline`) and from
   `sign-expiry.job.ts`'s existing sweep — mirrors the exact pattern
   `calls.routes.ts`'s `create-tasks` endpoint already established.
3. ~~**Calendar**~~ — **Corrected, 2026-09-08: not a separate increment.**
   Previously flagged this as "a notary session could get a real
   `calendar_events` row too, the same way Calendar's own 'Add video call'
   creates one" — checked that claim against the actual code before
   building it and it was wrong. Tasks and Notes, the two existing
   `MeetingLinkPanel` consumers Phase S4 mirrored, do **not** create a
   parallel `calendar_events` row when a meeting is attached — `meeting_url`/
   `bliss_meeting_id` stored directly on the owning row (task, note — now
   envelope) is the *entire* mechanism (`tasks.routes.ts`'s `POST /events`
   is Calendar's own generic event-creation endpoint hosted in that same
   file for an unrelated reason — Tasks+Calendar share one Fastify plugin —
   not a "Tasks also creates a calendar shadow entry" pattern). Auto-
   creating a `calendar_events` row from Sign would have been a genuinely
   new pattern with no precedent anywhere in this codebase, not a reuse of
   an existing one. Phase S4 already matches the real, established Tasks/
   Notes precedent exactly — there is nothing left to build here.
4. ~~**CRM**~~ — **Done**, 2026-09-08. `sign_envelopes.client_id` (migration
   426 — deliberately named to match Phase S7's own planned column, not
   `customer_id`, so S7 never needs a second competing FK; see that
   migration's header). `Customers.tsx` gets a new "Signatures" tab
   (mirroring the existing "Documents" tab's layout, not a new one) showing
   `GET /v1/sign/envelopes?client_id=X` and a "Send for Signature" action
   that picks an already-linked Drive file (same picker UI as "Link
   Existing File") and creates+sends a `NORMAL_SIGN` envelope to the
   customer's own email. Verified live end-to-end via real HTTP: uploaded a
   real test PDF tagged to a real customer, sent it for signature,
   confirmed `client_id` set correctly, confirmed the public unauthenticated
   sign-page endpoint actually receives real document bytes, confirmed the
   `client_id` list filter returns exactly that envelope. Test data (file +
   envelope + recipients/fields/events, including the physical MinIO
   object) fully cleaned up afterward.

   **Found, not fixed — flagged for whoever picks up Sign core next**: the
   established "Drive-sourced envelope" pattern (`file_id` set,
   `document_data` left `null` — see `SignEditor.tsx`'s `handleSave`/
   `handleSend`) relies on the internal editor's *authenticated*
   `/v1/files/:id/preview` fetch to render the document. `GET /public/:token`
   and `SignPublicPage.tsx` were checked directly and neither has an
   equivalent fallback — only `document_data` is ever read. That means
   **any envelope composed from an existing Drive file today shows a blank
   document to the external signer** (nothing to review, nothing to sign),
   not just something my Customers.tsx flow could have hit. Worked around
   it *for this phase's own code only* by resolving the real bytes into
   `document_data` up front (see `sendFileForSignature` in `Customers.tsx`)
   rather than touching the shared `sign.routes.ts`/`SignPublicPage.tsx`
   files the concurrent Sign-seal work was mid-flight on at the time. The
   real fix belongs in `GET /public/:token` (resolve `file_id` → real bytes
   server-side, same as the internal editor already does, so nothing else
   in Sign needs to change) — someone should pick this up before it causes
   a real support ticket.
5. ~~**ComplyOS**~~ — **Done**, 2026-09-08. `comply_applications.
   sign_envelope_id` (migration 423) → `POST /v1/comply/applications/:id/
   request-signature` (`comply.routes.ts`) renders a real declaration PDF
   (`comply-declaration-pdf.service.ts`, cloned from `contract-pdf.service.
   ts`'s structure) and creates a real `sign_envelopes`/`sign_recipients`
   row set with `execution_type: 'AFFIDAVIT'` / `execution_role: 'AFFIANT'`
   (the applicant self-signs). `ComplyApplications.tsx` shows a "Request
   Signature" action and, once linked, a "Declaration" status row. Verified
   live end-to-end via real HTTP: request-signature → real public sign →
   completed certificate PDF (execution-type line, QR code, full audit
   trail with the role-specific `declared` event all render correctly) →
   `comply_applications.sign_envelope_id`/joined `envelope_status` both
   correct. Test data cleaned up afterward.

   **Found and fixed in the same pass, not a pre-existing "done" item**:
   `request.user.id` doesn't exist on `JWTPayload` (only `.sub` does — see
   `packages/types/src/user.ts`) — a real, live bug, invisible to `tsc`
   only because these handlers are typed `request: any`. Confirmed live
   (`null value in column "created_by"... violates not-null constraint`)
   before fixing. Hit **10 call sites across 3 files**: `comply.routes.ts`
   (5 — including `POST /applications`, the plain "create application"
   endpoint, i.e. this was breaking ordinary ComplyOS usage, not just the
   new route), `cms.routes.ts` (3), `comply-legal.routes.ts` (2). All
   changed to `request.user.sub`; a repo-wide grep after the fix confirms
   zero remaining `request.user.id`/`req.user.id` anywhere in `apps/api/
   src`. **If you see `request: any` plus `.user.id` anywhere else in this
   codebase, it is broken the same way — check `.sub`, not `.id`.**
6. ~~**NexusHR**~~ — **Already done, pre-dates this plan.** Audited (not
   just assumed) 2026-09-08: `403_screening_candidate_profile_offer_esign.sql`
   added `hr_offers.sign_envelope_id`; `hr.routes.ts` genuinely generates a
   real offer-letter PDF (`offer-letter-pdf.service.ts`), creates a real
   envelope, and exposes `GET /recruitment/offers/:id/signing-link` — the
   exact same shape as the ComplyOS/CRM integrations above. Nothing to
   build here.
7. ~~**FinOps**~~ — **Done**, same deliverable as Phase S9 (billing for
   notary/consultant services) — see that section for the full account.
   Not a second thing to build.
8. ~~**Ondi**~~ — **Audited, deliberately not built**, 2026-09-08. Confirmed
   Ondi's identity-verification ladder is real: `users.verification_level`
   (`unverified`/`phone_verified`/`id_verified`/`enhanced`, migration 358)
   is genuinely earned — `phone_verified` via a real OTP flow
   (`security.routes.ts`), `id_verified` via a real KYC-document approval
   (`ondi.routes.ts`). But it's a **durable, earned-once, stays-forever**
   record, while Sign's `require_otp` is a **live, in-the-moment** check a
   sender explicitly opts into per envelope ("SMS / WhatsApp OTP" in
   `SignEditor.tsx`). Silently letting an Ondi-verified level bypass a
   sender's explicit per-envelope OTP request would be a real relaxation of
   a security control someone deliberately turned on — not a pure
   technical improvement, and not this session's call to make unilaterally.
   Put the tradeoff to the user directly; their answer was explicit: leave
   `require_otp` exactly as it is. No code changed for this item.
**Don't**, for any of these: build a second copy of Drive/Tasks/Calendar/
CRM/ComplyOS/FinOps/Ondi's own data model. Every integration here is a
foreign-key-shaped link plus a UI panel, never a parallel table.
**Verify:** each integration gets its own live round trip — e.g. for Tasks,
confirm a real task row appears with the correct `sign_envelope_id`-shaped
link when a real test envelope is left pending past its reminder window.

### Phase S7 — Consultant / matter model — **Done**, 2026-09-08
`client_id` already existed (migration 426, built for Phase S6's CRM item —
see that section). Added `sign_envelopes.matter_reference TEXT` (migration
428) — deliberately a free-text tag, not a `sign_matters` entity table: a
matter here is a GROUP BY, not a new object with its own lifecycle, exactly
the "thin, additive layer... not a second CRM" the plan called for. Checked
`comply_legal_engagements` (096) first — a real, different concept (hiring
an *external* law firm from Hudumika's own marketplace for one ComplyOS
filing) already reachable from a Sign envelope indirectly via
`comply_applications.sign_envelope_id`; reusing it as the general "any
tenant's own case tag" would have forced every tenant's Sign usage through
a ComplyOS-specific, marketplace-shaped schema, so it was correctly left
alone.

Built: `SignEditor.tsx` gets a "Matter / Reference" field next to Message;
`POST`/`PUT /envelopes` both accept it (the PUT handler was also missing
`client_id` entirely until now — fixed in the same pass); a new
`sign-matters.routes.ts` (its own file, not added to the actively-being-
edited `sign.routes.ts`) exposes `GET /matters` (grouped summary — count,
distinct client names, last activity) and `GET /matters/:reference/
envelopes`, both gated the same `DOCUMENT_ADMIN_ROLES` way as `view=all`
since a matter aggregates across every user's envelopes, the same
disclosure shape; a new `SignMattersPage.tsx` (list + detail) reachable
from a "Matters" nav item next to "All Documents"; the envelope detail page
shows the reference as a plain badge (not a link — the grouped view stays
admin-only, the badge doesn't need to be).

**Verified live via real HTTP**, not just reading the code: created 4 real
envelopes tagged `CASE-2026-S7TEST` (2 sharing a real customer, 2 without)
plus 2 untagged control envelopes; `GET /matters` correctly returned
`envelope_count: 4` with `client_names` correctly de-duplicated to one
name via DISTINCT, with the 2 untagged envelopes correctly excluded;
`GET /matters/:reference/envelopes` returned exactly those 4; confirmed a
non-admin role gets a real 403; confirmed `PUT /envelopes/:id` (a draft
edit) correctly re-tags an envelope and it moves to the new group. All 6
test envelopes and their recipients/fields/events deleted afterward,
confirmed zero remaining.

### Phase S8 — AI assistance — **Done**, 2026-09-08
Audited first, per the plan: `ai.routes.ts`'s `/chat` is per-tenant-configured
(`tenant_settings.settings['int-ai']`, the tenant's own API key) — wrong fit
for a bounded document-vision task that should work out of the box. Found
the actually-reusable pipeline one layer over: `getGeminiApiKey()`
(`ocr.routes.ts`) is a **platform-level** key (not per-tenant), already
used by `sign-seal-verify.service.ts`'s forensic content comparison —
"Gemini reads PDF bytes directly via inlineData, no rasterization needed."
Reused that exact mechanism rather than standing up a second OCR
integration or requiring per-tenant AI setup for this feature.

Built `sign-ai-assist.service.ts` (`analyzeDocumentForSigningAssist`) —
one Gemini call, structured JSON output, bounded to exactly the two tasks
the spec lists (missing-field detection, witness/notary-block detection).
No simulated fallback: `available: false` with a real reason if the key
isn't configured, matching `sign-seal-verify.service.ts`'s own "returns
'unavailable' rather than ever fabricating a result" precedent — a false
detection here would mislead a real preparer. The prompt itself instructs
the model not to comment on legal validity/sufficiency, only report what's
visible on the page. New `sign-ai-assist.routes.ts` (`POST /ai-assist/
analyze`, own file per the established pattern) accepts either an existing
Drive file (`file_id`) or a fresh in-progress upload (`document_data`).
`SignEditor.tsx` gets an "AI Scan" toolbar button (next to PDF Tools) and a
dismissible results panel — findings shown as amber (missing field) /
blue (witness or notary block) suggestion chips, never a pass/fail verdict.

**Verified live against the real Gemini API** (a real platform key was
already configured in this environment) with a real generated test PDF
(pdfkit) containing a genuine affidavit + jurat block: 2 real transient
503s from Google's own service on the first two attempts (proof this is a
real network call, not a mock), then a real successful response correctly
identifying all 9 actual blank fields on the page (name, DOB, signature,
date, jurat day/month, commissioner signature/name/roll-number) and
correctly detecting and quoting the jurat/notary block — with zero false
positive for a witness block, which the test document didn't contain.
Scratch PDF and test scripts deleted afterward.

### Phase S9 — Billing integration — **Done**, 2026-09-08
Audited `billing.routes.ts` first — wrong layer: that file is Hudumika
billing the *tenant* for its own seat subscription (Petti wallets appear
there only as a payment *method*), not a tenant billing *their own
customer* for a service, which is what S9 actually needs. Found the real
precedent one file over: `seal-billing.service.ts`'s `generateStorageInvoice`
already solved this exact problem (a domain event that should become a
FinOps invoice) months ago, with the design decision spelled out in its own
comment — "invoice finalization (GL posting, accounting sync) stays
entirely inside FinOps's own POST /v1/invoices flow, not duplicated here."
Mirrored that shape exactly, using the real `getNextDocNumber(trx, tid,
'invoice')` (`lib/doc-numbering.ts`) rather than seal-billing's own
timestamp-prefixed number, so a Sign-originated invoice sits in the same
real sequence as every other FinOps invoice.

No fee schedule was invented — Sign has no existing notary/consultant rate
card anywhere in this codebase, and one wasn't fabricated to fill this gap.
Migration 431 (`sign_envelopes.invoice_id`) + new `sign-billing.routes.ts`
(`POST /envelopes/:id/bill`, gated to the same role tier `invoices.routes.
ts`'s own POST / already requires) accept a preparer-typed description and
amount, create a real DRAFT `sales_invoices` row + one line item on the
envelope's linked customer (`client_id`, Phase S6/S7's own column), and
link back. `SignEnvelopeDetail` gets a "Bill Client" action (shown only
when there's a customer to bill and it hasn't been billed yet) opening a
small two-field dialog, and an "Invoiced" badge linking straight to
`/finance/invoices?id=` once billed.

**Verified live via real HTTP**: created a real envelope with a real linked
customer, billed it — got back a real sequential `INV-00xx` number; the
resulting `sales_invoices` row and its line item, read directly from the
database, are byte-for-byte the same shape a manually-created FinOps
invoice would have (correct customer_id, currency uppercased, Draft status,
notes referencing the real envelope title and verification code); the
envelope's `invoice_id` correctly linked back. Also confirmed all three
real rejections: billing the same envelope twice → 409; billing an
envelope with no linked customer → a clear, actionable 400; a
non-positive amount → a real Zod validation error. All test data (invoice,
line item, both envelopes and their child rows) deleted afterward,
confirmed gone.

---

## 6. Verification standard (applies to every phase above)

1. `npx tsc --noEmit` in both `apps/api` and `apps/web`, confirmed exit 0.
2. Every migration applied via `npm run db:migrate -w apps/api`, confirmed
   idempotent (`⏭ Skipping` on a second run).
3. Live verification against the **running** dev servers (web `:5173`, API
   `:3001`) — curl with a real login for backend logic, Playwright for UI —
   never a claim based on reading the code alone.
4. **A completed/successful state is never recorded unless the real
   underlying action actually happened.** No fabricated timings, no
   `status: 'SUCCESS'` written before the real work occurred.
5. Every new table is tenant-scoped with `FORCE ROW LEVEL SECURITY` (or has
   an explicit, documented reason it's a platform-level table — `metric_
   definitions` and `data_quality_findings` are the only two so far, both
   with that reasoning written in their own migration header).
6. Every scratch verification script/seed is deleted afterward, with the
   delete confirmed (an `ls` expected to fail), and any test data written
   into real tenant rows (notifications, envelopes, certifiers) cleaned up
   the same way.
7. Report what's real and what isn't in the same breath — a phase that's
   half-built is reported as half-built, with the honest remainder named,
   not rounded up to "done."

---

## 7. Immediate next step

**Phase S3** (Sign metrics → Metric Registry) is the cheapest, lowest-risk,
highest-leverage next step — it needs no new investigation, reuses a fully
built and already-verified registry, and closes the loop the original
Metrics spec asked for (§50: "ONE metric definition... Sign → Query Builder
→ HuduBI") using infrastructure that already exists end to end.

**Phase S1** (Electronic journal) is the next-best if advanced-execution
depth matters more right now than cross-cutting analytics — it's real,
self-contained, and directly extends 416/417 with no new external
dependency.
