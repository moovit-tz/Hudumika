# Hudumika — project context, current progress and production target

**Snapshot date:** 27 October 2026, Africa/Dar_es_Salaam  
**Purpose:** Upload this standalone Markdown file to the Hudumika project in Claude Web. It supplies project context without requiring access to the local repository.  
**Repository at preparation:** `24468e600684410d97f5c20523fbc2c883826e4a`, local `master`, seven commits ahead of `origin/master`. One existing uncommitted change was present in `apps/api/src/routes/field-policy.routes.ts`. This document is not a test of that change.

## 1. The essential distinction

Hudumika is a substantially implemented, multi-tenant business platform. It is **not established as 100% complete or fully production-ready** by the available evidence.

This document describes both:

1. **Current progress:** implemented surfaces, observed results and known verification limits.
2. **The completion target:** what Hudumika should deliver after its agreed scope is implemented, tested, operationally accepted and released.

Future capabilities below are acceptance targets, not claims that the present system delivers them. No defensible overall completion percentage exists without a reconciled requirements checklist. A route, a screen, source code, a passing isolated test and a working deployed integration are different forms of evidence.

The most recent work in this conversation focused on NexusHR and Contabo preparation. This file was assembled from that work, repository routes, dated audit documents and project memory. It is **not a fresh end-to-end test of every application**. More recent code may resolve an older finding, but closure requires a relevant rerun rather than inference from a commit title.

## 2. What Hudumika is

Hudumika provides a shared workspace for logistics, customs clearance, freight/fleet operations, warehousing, finance, HR, customer relationships, communications, documents, automation and administration.

Its intended advantage is continuity across apps: people, customers, suppliers, shipments, documents, tasks, approvals, money and events should retain their identities and provenance throughout a business process. Each domain owns its authoritative records; other apps link to them or consume controlled events. A dashboard is a derived view, not a second source of truth.

Tenant isolation, role permissions, subscription entitlements, branding and auditability apply across the workspace. Internal staff, managers, finance users, administrators, customers and invited external participants have different access boundaries. User-visible app names and colours can be configured; names below identify the underlying domains.

## 3. Current application landscape and completion target

“Implemented” below means source/workflows or dated test evidence exists. It does not grant production approval. Where October 10–20 reviews are the basis, they remain historical until rechecked against the release commit.

| Domain / app | Current progress and limits | Capability expected at accepted completion |
| --- | --- | --- |
| **ClearOS** | Shipment/case workflows, declarations, landed cost, compliance and finance linkage exist. Recent commits describe further audit remediation; a fresh all-mode acceptance run is not established here. | Traceable clearance from intake through release/delivery; reliable tasks, documents, approvals, duty/penalty estimates and financial reconciliation across supported freight modes and commodities. Government connectivity claimed only for contracted, configured, tested adapters. |
| **FinOps** | AP/AR, invoices/bills, GL, FX, budgets, assets, reconciliation, close and payroll/POS links exist. Accounting/provider acceptance remains necessary. | Balanced, auditable, currency-consistent financial workflows with controlled approvals, corrections, close, reconciliations, exports and real payment/provider results. |
| **POS** | Operational and financial surfaces exist. Latest recorded broad regression exposed checkout/refund/accounting defects; closure is not established here. | Atomic checkout/refund, idempotent retries, correct currency/rounding/tax/stock and register reconciliation under concurrent use. |
| **NexusHR** | Recruitment, employee records, leave, attendance/devices, payroll/GL, cases, benefits, training and lifecycle workflows exist. October 27 time/KPI hardening is detailed below. Statutory, hardware and production acceptance remain. | Reliable employee lifecycle, confidential HR data, shift/leave-aware attendance, attributable time, approved payroll inputs and reconciled payroll-to-ledger processes. |
| **HuduFreight / Tracking** | Fleet, drivers, dispatch, trips, billing, borders, telemetry and planning exist. October work improved truthful telemetry, bounded history and responsive registers. Later tests still exposed packing guards/measurement defects. | Controlled planning, packing approval, dispatch, movement history and trip settlement using validated operational measurements and actual configured device/provider data. |
| **CargoTracker / Demurrage** | Container tracking, booking/rates/contracts, conversion and demurrage tariffs/waivers exist. October 10 review identified manual carrier adapter paths and an unwired Maersk adapter. | Supported carrier connectivity, attributable tracking updates, reconciled tariff liability and controlled waivers; manual and live data clearly labelled. |
| **SEAL / Inventory** | Bonded lots, declarations, duty/release, yard/reefer/equipment, stock movements/counts and financial links exist. Historical storage-invoice register UI and reconciliation gaps require recheck. | Traceable bonded/standard stock, receipts/counts/releases, controlled billing, customs obligations and reconciled inventory/GL movements. |
| **ComplyOS** | Applications, renewals, certificates and marketplace workflows exist. Some government/OCR/provider paths require contracts, credentials or further validation. | Auditable compliance cases with reliable renewals, document evidence and truthful results from supported real providers; failures never presented as approvals. |
| **Bliss / Support** | Chat, tickets, escalations, meetings/calls and cross-app support flows exist. Production TURN/WebRTC, reconnection, abuse controls and provider/device acceptance remain. | Reliable customer/internal communications with correct routing, permissions, attachments, delivery state, escalation and recovery. |
| **Email** | Compose, threads, drafts, attachments, labels, scheduled sending and OAuth surfaces have prior implementation/test evidence. | Tested supported SMTP/IMAP/OAuth providers, retries, bounces, refresh/revocation, mailbox scale and accessible compose/reply flows. |
| **SMS** | Messaging, contacts/groups, templates, campaigns and opt-out flows exist. Real provider and callback acceptance required. | Authorized delivery through a real provider with verified callbacks, opt-out enforcement, retries, cost visibility and attributable delivery status. |
| **CRM** | Leads/deals, scoring, custom fields, views, labels and customer/email linkage exist. | A reliable customer pipeline with explicit ownership, permission-safe automation, deduplication and continuity into operational/financial records. |
| **Contacts** | Shared contacts, labels/smart groups and Google/Microsoft sync implementations exist. | Stable identities and tested sync/conflict/duplicate handling, including expired or revoked provider access. |
| **Cloud / Drive** | Files, versions, ACLs, sharing, quota, scanning, retention and previews exist. October 19 audit requested changes for sensitive-document use despite 66 passing tests. OneDrive implementation is not proof of connection; Box/Dropbox/Mega were unsupported sync/bookmark paths in that audit. | Permission-consistent file lifecycle, safe uploads/versions/search/shares, atomic quota accounting, real scanning/storage, dependable large-file recovery and tested supported connectors. |
| **eSign / Sign** | Envelopes, public verification, document/custody and signing workflows exist. October 17 recheck findings were followed by remediation; consult the later review trail. October 27 transport/dependency fixes do not establish legal/cryptographic certification. | Truthful signing assurance, verified identity/credentials, safe finalization/recovery, artifact integrity, timestamp validation and approved key/certificate operations. |
| **Tasks / Projects** | Tasks, dependencies, collaboration, project planning, contracts and billing surfaces exist. A project-risk persistence test remained unresolved in the latest recorded rerun. | Controlled task/project lifecycle, permissions, schedules, dependencies, risk/change management, time/cost tracking and reconciled delivery/billing. |
| **Calendar** | Events, invitations, booking/free-busy and provider sync implementations exist. | Timezone-correct scheduling, race-safe bookings, reminder recovery and tested supported external sync. |
| **Notes** | Notes, ACLs, versions, optimistic locking and legal holds have prior evidence. | Dependable collaborative knowledge with authorized search, conflict handling, retention and accessible editing. |
| **Petti** | Wallets, approvals, deposits/withdrawals/disbursements and GL linkage exist. Historical cancellation/disbursement and gateway reconciliation need current acceptance. | Controlled petty-cash lifecycle with reconciled real settlement, approvals and reversible/audited corrections. |
| **Studio** | Visual workflow builder, event/action registries, run history and durable outbox work exist. October 12 review reported unsupported graph/schedule capabilities and recovery/versioning gaps. Counts in older registries are not current coverage guarantees. | Version-bound, authorized workflows with durable delivery, bounded execution, idempotent effects, observable retries/dead letters and supported recovery/schedules. |
| **Hudumika AI** | Conversation/tool execution, ownership, provider keys and governed agent work exist. Older milestone claims require current recheck. | Tenant-safe assistance and explicitly authorized actions with provenance, prompt-injection defenses, cost limits, provider failure handling and audit logs. |
| **Ondi** | Identity/SSO, roles, joining/JIT, recovery and revocation have source and historical adversarial evidence. | Tested identity lifecycle with real supported IdPs, key rotation, session revocation, recovery and privileged-access controls. |
| **Workspace / SuperAdmin** | Branding, users, roles, plans, subscriptions and operator controls exist; historical placeholders and recovery controls require recheck. | Complete governed tenant/platform administration, honest billing, least privilege, audit and tested recovery rather than inactive controls. |
| **OneSite / CMS** | Content/models/forms, collaboration, publishing and release surfaces exist. | Proven create/review/publish/rollback journeys with correct permissions, webhook retry and deployment evidence. |
| **Onsite / AgencyHost** | Hosting, domain/DNS, provisioning, backups and agency workflows have implementation. | Actual supported hosting/registrar integrations with secret management, safe rollback, tested restoration and operational monitoring. |
| **HuduBI** | Cross-app data/semantic resolution, widgets and data-quality analysis exist. | Owner-approved metrics, tenant-safe queries, query budgets and understandable drill-down to authoritative records. |
| **Store / Developer** | Marketplace/developer surfaces and integration tooling exist. | Governed installation, package review, version compatibility, scoped integrations and a supported extension lifecycle. |
| **Travel and portals** | Dedicated Travel and customer/organization-facing routes exist. Full acceptance was not performed in this session. | Defined and tested role-specific business journeys and integrations; inclusion in the navigation alone is insufficient. |
| **Lens / internal tools** | Historical review described unfinished SuperAdmin/internal tooling. | Explicitly scoped internal tooling or exclusion from the release contract; do not advertise it as a finished customer product. |

## 4. Most recent verified work: NexusHR, 27 October

### Time integrity and permissions

- Strict dates/ranges, future-time checks, break/duration bounds and overlapping-session rejection.
- Per-employee serialization and database guards protect concurrent writes and approved periods.
- Corrections and administrative reopening require reasons and preserve prior evidence.
- Planned time uses shifts, approved leave and holidays, including explicit overnight/weekend assignments.
- Device punches pair across midnight and separate batches; duplicate delivery does not rebuild approved records.
- Stale live sessions become unknown-duration review items rather than fabricated paid hours.
- Attendance, header timers, task time and shipment time remain distinct ledgers; reconciliation flags unknowns and over-allocation instead of adding overlapping time together.
- New shipment time uses a validated stable worker ID; manager access is restricted to direct reports and references are tenant-checked.
- KPI counts use a single tenant-scoped SQL snapshot, eligible internal staff and distinct people. Labels/provenance were corrected.
- Clock-in filters affect totals, exports and submission; correction/reopening and responsive layouts were verified. Failed timer operations retain state and expose errors.

### Data and release engineering

- Migrations 633 and 634 add time-integrity guards/worker identity and audit metadata.
- Migration 632 was corrected only after the normal runner proved it unapplied and failing against bigint event IDs. Applied migrations were not rewritten.
- Three duplicate/stale header timers were closed with unknown duration and audit evidence. Eight legacy shipment entries still lack reliable worker identity; identities were not guessed.
- Zod migrated to v4/public schema conversion. The timestamp SDK request transport override was tested with real local HTTP and redirect behavior.
- Production dependency audit at that checkpoint: **0 critical, 0 high, 0 moderate, 3 low** advisories. This is a dated result, not a permanent guarantee.
- Compiled API/shared-type resolution and migration SQL packaging were fixed.

### Actual evidence

| Check | Recorded outcome | Limit |
| --- | --- | --- |
| Root typecheck | Passed, including trigger/design-system/encoding checks | Not a functional certification |
| Full production build | Passed | Bundle-size warning remains; ~926 kB minified Three.js vendor chunk |
| Fresh database migrations | 655 applied successfully | Local PostgreSQL 13; target container PostgreSQL 16 still needs verification |
| Compiled authenticated API | KPI/start/stop smoke passed | Local execution |
| Production-preview browser | Desktop/mobile passed without observed page overflow or JS errors | Selected journeys, not all apps |
| Focused combined acceptance | 79 passed, 2 timed out, out of 81 | Preserve the original failed-run result |
| Follow-up verification | Browser passed; final quiet payroll/hardening run 12/12 passed | All 81 selected cases passed across runs, not in one consistently green combined run |
| KPI load smoke | Correct counts with 1,000 staff, 200 customers and 20 concurrent reads | p95 ~2.94–8.11 seconds under competing build/test load; not a capacity, SLO or memory-leak certificate |
| Broad platform regression | 886 passed / 16 failed, 902 tests | Some failures cleared on reruns; others remain last-known open below |

## 5. Last-known blockers and uncertainties

These are **last recorded findings**, not a claim that every defect is still present at this snapshot's commit. Reproduce each against the intended release version and attach closure evidence.

| Area | Required follow-up |
| --- | --- |
| POS | Refund inventory enum/atomicity, malformed held-cart JSON, currency conversion, null notes, payment rounding, failed-posting cash totals, historical register views and checkout idempotency |
| Freight | Approved packing edit protection, packing invalidation after dimension changes and rejection of fabricated measurements |
| Signing | Travel catalogue coverage; independent legal/crypto acceptance and genuine certificate/timestamp/key operations |
| Projects | Risk persistence assertion from isolated rerun |
| Cloud | October 19 privacy/authorization, lifecycle, quota/concurrency, OAuth and scale findings need a current closure ledger before sensitive-document release |
| Automation | Validate the actual supported graph/schedule/action set, workflow version binding, retries/dead letters and recovery; do not infer this from event counts |
| External integrations | Live contracts/credentials, callback authenticity, provider failures, refresh/revocation and reconciliation remain provider-specific acceptance work |
| Operations | Real Linux containers, public TLS, provider delivery, off-server recovery, monitoring/alerts and sustained VPS workload/memory acceptance |
| Historical findings | Reconcile older audit claims and newer remediation; do not blindly carry forward stale percentages, “complete” labels or old blockers |

## 6. Cross-app process model at full completion

The target is a coherent, auditable chain—not unrestricted replication of data across apps. The following are intended acceptance journeys. Verify each actual connection before claiming it works.

### Customer to clearance to cash

CRM customer/opportunity → approved shipment/case → documents/compliance → mode-specific planning and clearance → approvals/release/delivery → charges/invoice → settlement → GL and reconciliation. Tasks, communications and time retain links to the shipment. Cost estimates remain distinguishable from posted/actual charges.

### Freight and warehouse execution

Booking/shipment → packing measurements and approval → dispatch/trip → real tracking events → receipt/yard/bonded-stock activity → controlled release/delivery → stock, liability and billing reconciliation. Changed dimensions invalidate dependent approvals where required. Offline/stale telemetry remains visibly uncertain.

### People, time and payroll

Recruitment/onboarding → staff permissions → shift/leave plan → device/manual attendance → correction and approval → reconciled payroll input → payroll calculation/approval → financial posting/payment. Task/shipment effort can support costing, but must not be silently counted again as attendance or salary entitlement.

### Documents, signing and support

Authorized document intake → scanning/storage/versioning → controlled sharing or signing → identity/assurance checks → immutable verification evidence and retention. Support cases may originate from other domains and preserve the initiating record/event without disclosing unrelated private documents or HR data.

### Events, workflows and analytics

An originating transaction commits its authoritative state/event → durable consumer delivery → tenant/entitlement/permission checks → idempotent action → auditable outcome/retry/dead letter → owner-approved analytics. External side effects need reconciliation after uncertain delivery; “exactly once” must not be promised merely because a run row is unique.

## 7. What “100% complete and production-ready” must mean

Use this phrase only for a **defined release scope, release commit, supported configurations and accepted operating envelope**. It is not a promise of zero future bugs or support for every possible provider, country or commodity.

### Gate A — accepted product scope

- Requirements, exclusions and supported providers/modes/jurisdictions are reconciled per app.
- Every promised control has real behavior; placeholders, simulated charges and sample data are removed from production flows or explicitly labelled/excluded.
- Record ownership, currencies, units, timestamps and metric definitions have named owners and documented contracts.

### Gate B — business correctness and scenarios

- Full role-specific journeys pass with realistic data and authoritative persisted results.
- Freight matrix includes supported sea FCL/LCL, air, road and other explicitly supported modes; import/export/transit; commodity and unit variations; amendments/cancellations/returns; partial and exceptional outcomes.
- Calculator matrix covers supported valuation/incoterm/FX inputs, charge bases, dates, free time/penalties, commodity classification, tax/exemption scenarios, rounding and invalid/missing data. Expected results are independently reconciled to dated authoritative rules/tariffs. Do not invent rates or statutory rules.
- Finance/payroll calculations are independently reconciled, money mutations are atomic, retries do not double-post, and approvals/corrections preserve audit evidence.
- Concurrency, stale data, duplicates, provider timeouts, partial failure and recovery are tested, not only happy paths.

### Gate C — security, privacy and audit

- Explicit tenant predicates, tenant transaction context and RLS enforce boundaries; foreign IDs cannot smuggle cross-tenant references.
- Role/entitlement/field restrictions cover UI, APIs, exports, queues, attachments and analytics.
- Authentication/session/revocation, secrets/rotation, public links, uploads/scanning and privileged operations pass threat-based review.
- Dependency/security findings have documented remediation or accepted risk; sensitive domains receive independent review appropriate to their use.
- Legal/statutory claims have qualified sign-off. A timestamp, OTP, scan or passing test alone does not establish legal compliance.

### Gate D — usability and accessibility

- Supported mobile/tablet/desktop widths work without clipped actions or accidental page-wide overflow; dense data has an intentional usable layout.
- Controls use consistent sizing, spacing, borders/radii and app branding, with readable labels and appropriate touch targets.
- Keyboard/focus, screen-reader semantics, validation, empty/error/loading states, long text and slow/reconnecting networks are tested.
- Each critical action produces clear feedback and a recoverable path; unknown data is never represented as zero or success.

### Gate E — real integrations and automation

- Supported providers are configured and tested end to end, including real delivery/settlement where applicable.
- Government/customs/carrier/bank/device interfaces are named accurately as live, sandbox, manual or unavailable.
- Durable event delivery, retries, idempotency, versioning, dead-letter handling and operator recovery meet the agreed process contract.
- Connected apps reconcile against authoritative records rather than maintaining inconsistent copies.

### Gate F — capacity and operations

- The intended daily shipment volume, peak concurrency, record/document counts, retention and jobs are specified before a capacity claim.
- Thousands of shipments/day are a **target scenario to measure**, not an established supported capacity. Test peaks, bulk operations, queues, indexes/pagination, large exports, storage growth, browser payloads and provider rate limits.
- Sustained latency, CPU, memory/RSS, database connections/locks, queue lag and recovery meet agreed thresholds on the actual deployment. A short load smoke cannot prove leak-free behavior.
- Deployment, migrations, health checks, certificates, backups, restores, rollback compatibility, alert delivery and incident ownership are exercised.
- Recovery objectives and acceptable data loss are agreed and demonstrated. A backup job reporting success is insufficient without a restore drill.

### Gate G — release evidence and sign-off

- One named release commit has passing required CI and recorded browser/business/security/operational acceptance; intermittent failures are resolved or explicitly accepted.
- Critical/high-impact open findings are closed with evidence or the affected capability is excluded from launch.
- Release owners approve the scope, known limitations, support runbooks and monitoring. Update this file with dates, environment and evidence references before changing readiness wording.

## 8. Contabo preparation

Deployment assets exist under `deploy/contabo/`. After one-time real configuration, the intended launch command is:

```bash
sudo bash deploy/contabo/deploy.sh
```

Prepared automation includes private PostgreSQL/Redis/scanner services, non-root API, Caddy HTTPS, persistent data/uploads/certificates, generated secrets preserved across updates, migrations, restricted database roles, SMTP preflight, encrypted off-server Restic backups, an isolated restore drill, service restarts/boot setup and a daily backup timer. Deployment and backups share a lock. Failed application rollout attempts image rollback; schema changes remain.

Required operator inputs: Linux VPS with Docker/Compose and documented prerequisites, actual domain/DNS, certificate contact, real SMTP credentials and HTTPS S3-compatible backup repository/credentials. Optional providers need their own genuine supported configuration. No default/demo accounts are seeded by the launch script.

**Not yet demonstrated:** actual Linux image build/container launch, public TLS, real email delivery, real S3 access/container restore, full operational alerting and sustained Contabo load. Docker Desktop's Linux daemon was unavailable during preparation. SMTP authentication checks do not send email. Live database and upload backups are separate snapshots; strict consistency needs controlled writes and reference checks. Keep private configuration and repository passwords securely backed up; never upload secrets to Claude Web.

## 9. Engineering constraints for any follow-up work

- Workspace: `D:\Apps\Hudumika`. npm workspaces; React 19, Router 7, Vite, Tailwind 4; Fastify, Kysely and PostgreSQL.
- Read repository `CLAUDE.md` and `AGENTS.md` before editing; they are authoritative engineering guidance, not proof that a feature works.
- Real shared interfaces: `packages/types`. Real UI: `apps/web/src/components/ui`. Existing request helper: `apps/web/src/lib/api.ts`.
- Do not introduce a parallel UI/API/state framework. `packages/ui` and `packages/api-client` are not the live conventions for new feature work.
- Use explicit tenant filters and `withTenant`; restrict platform bypass access. JWT actor identity is `request.user.sub`, not `.id`.
- Existing auth is cookie/CSRF based; older AGENTS wording about bearer/localStorage is documentation drift.
- Never rewrite applied migrations, fabricate integrations, weaken tests to hide failures, or infer completion from a passing build.
- Preserve concurrent changes; stage only owned paths. This document does not authorize publishing, payments or messages to third parties.
- Local memory and PostgreSQL mirrors are not the same thing as Claude Web project memory. A local Markdown file is not uploaded automatically.

## 10. Instructions for Claude Web using this file

Treat this as dated project context, not live access to the repository or production. When answering:

1. State whether a capability is implemented, locally verified, host/provider verified, planned, blocked or unknown.
2. Separate current facts from the completion target. Avoid invented percentages, certifications, integrations or throughput claims.
3. Prefer the most recent relevant evidence, but require a matching closure test before declaring an old finding fixed. A later commit title alone is insufficient.
4. Ask the coding agent for specific evidence when needed: release SHA, commands/exits, scenario results, deployment environment and remaining failures. Do not claim you ran tests unless you actually did.
5. When planning, prioritize data/financial integrity and tenant/privacy defects, then broken journeys, operational recovery and usability/performance according to release scope.
6. Evaluate against CargoWise and other enterprise products through named workflows and demonstrated capabilities, not unsupported claims of parity or superiority. Obtain current primary-source product information before making current feature comparisons.
7. Keep an explicit closure ledger: finding → affected scope → change → verification → residual risk → owner/date.

## 11. Repository evidence map

These are repository-relative references for an agent with checkout access; Claude Web needs the files attached separately to read their full contents.

- `docs/audits/NEXUSHR_RELEASE_READINESS_2026-10-27.md` — recent remediation, tests and last-known platform failures.
- `docs/audits/NEXUSHR_KPI_TIMESHEET_REVIEW_2026-10-27.md` — superseded original findings.
- `docs/production-readiness/APP_COMPLETENESS_2026-10-10.md` — historical per-app maturity review.
- `docs/CLOUD_PRODUCTION_READINESS_AUDIT_2026-10-19.md` — sensitive-document release findings.
- `docs/STUDIO_PRODUCTION_REVIEW_2026-10-12.md` — workflow safety/delivery capabilities and limits.
- `docs/HUDUFREIGHT_IMPLEMENTATION_2026-10-20.md` — freight implementation and verification checkpoint.
- `docs/ESIGN_CLAUDE_CODE_REVIEW_2026-10-17.md` — remediation trail; read after historical recheck findings.
- `deploy/contabo/README.md` — actual setup and recovery procedure.
- `CLAUDE.md`, `AGENTS.md`, `.claude/memory/` — engineering rules and historical context; memory claims are not substitutes for release evidence.

## 12. Record to complete at release

Until these fields are filled with actual evidence, retain the current “not fully certified” status:

| Release acceptance field | Current value |
| --- | --- |
| Accepted release scope and exclusions | Not recorded here |
| Released commit/tag | Not established |
| Production URL / deployment date | Not established |
| Supported modes, commodities, jurisdictions and providers | Must be explicitly accepted |
| Full regression and end-to-end results | Broad last-known failures remain; targeted results above |
| Accountant / HR / legal / security acceptance | Not established by this file |
| Sustained capacity, latency and memory envelope | Not established |
| Provider delivery and settlement evidence | Not established |
| Backup restore and recovery objectives | Host exercise pending |
| Monitoring, on-call and incident owner | Must be assigned and tested |
| Final business and operational approval | Pending |

**Permissible wording today:** “Hudumika has substantial implemented cross-app workflows, recent verified NexusHR integrity improvements and prepared Contabo deployment automation. Whole-platform acceptance and several provider/operational checks remain.”

**Wording only after the gates pass:** “Hudumika release [tag/SHA] is accepted for production for [defined scope], on [environment], within [measured operating envelope], with [documented limitations] and the attached verification and recovery evidence.”
