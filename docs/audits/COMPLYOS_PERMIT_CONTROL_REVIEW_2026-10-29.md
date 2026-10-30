# ComplyOS review — centralized permit control and renewal automation

Reviewed 29 October 2026, Africa/Dar_es_Salaam. Target: `http://localhost:5173/complyos`. Review baseline commit `5abc4206`; unrelated commercial-plan/CSS changes were already in the working tree and were preserved.

## Verdict

**Additional user requirements:** ComplyOS must also ingest/link authorized permit evidence from every Hudumika app, serve shared lifecycle/check operations, support consultant businesses as tenants with scoped client access, and later support marketplace renewal engagements with permission-filtered history. The detailed target is in [the platform engine and consultant model](../COMPLYOS_PLATFORM_ENGINE_AND_AGENT_MODEL.md). These are requirements, not verified implemented features.

ComplyOS has a useful certificate register, application tracker, catalogue, calendar, obligation rules and renewal-review queue. It is **not yet an end-to-end automatic renewal system or an authoritative multi-jurisdiction permit control platform**.

Today, auto-renewal means opening a review workflow near expiry. It does not establish successful authority submission, payment, inspection, issuance or operational permission. The current data and state transitions can also report compliance or issuance without the evidence needed to support those conclusions.

The product direction should be a central **permit lifecycle and business-launch control system**: identify applicable obligations, maintain evidence-backed permit instances, plan and budget renewals, execute supported steps, escalate exceptions, and restrict affected operations when an approved policy requires it. Authority decisions remain external facts to verify, not statuses to infer from an edited date.

## Scope and method

- Read the ComplyOS shell, pages/hooks/shared types, routes, service, agency adapters, renewal/reminder jobs and relevant migrations; checked current database reference-data counts/indexes.
- Exercised real local API/database paths using two disposable tenants. Checked ordinary-user denial, cross-tenant record visibility/reference updates, workflow starts, same-date editing, jurisdiction scanning, manual submission and catalogue retrieval.
- Browser: an isolated disposable authenticated profile, 1440 px and 390 px, for dashboard, vault, workflows, licence catalogue and obligation scan. All ten snapshots rendered with no observed JavaScript page errors and no page-wide horizontal overflow. This does not establish accessibility or all-control acceptance.
- The user's existing browser workspace was locked; it was not unlocked or changed. Screenshots contain synthetic review data.
- Existing integration test: `freight-operations.test.ts -t 'reads linked ComplyOS metadata'` passed **1 test; 12 skipped**. It verifies live linked permit metadata and rejection of revoked fleet dispatch. It is not an entire ComplyOS test-suite pass.
- No live authority applications, payments, provider OCR calls, legal-firm instructions or notifications were sent. Global renewal/reminder jobs were reviewed in source rather than run against real tenants.
- Product code was not changed. Evidence: `COMPLYOS_REVIEW_EVIDENCE_2026-10-29.json` and `complyos-review-*.png` beside this report. Both disposable tenants were cleaned up.

## Fit against the requested product

| Requested capability | Current implementation | Missing to meet the requirement |
| --- | --- | --- |
| All company permits in one place | Vault, CRM customer links, documents, dates, status, export and calendar | Explicit legal entity/branch/site/asset/product scope, jurisdiction, canonical permit identity and completeness reconciliation |
| Expiry and continuity control | Expiry status, 90/30-day reminders, non-renewal risk text | Jurisdiction-specific deadlines/windows, unknown validity, owners/delegates, escalation/acknowledgement, delivery recovery and operational impact policies |
| Automatic renewals | Daily scan opens `pending_review`; a management action changes it to `approved` | Reliable preparation/submission/payment/inspection/status polling/issuance/verification, supported authority contracts and human/manual handoffs |
| Renewal costs | Catalogue principal/subsidiary fees and application metadata | Dated renewal-specific rates, taxes/levies/service fees, currency, formula inputs, payment evidence, approved budget and estimate-versus-assessment distinction |
| Penalties | Free-text non-renewal risk | Versioned jurisdiction-specific penalty rules, grace periods, assessment basis, caps, waivers/appeals and official assessment evidence |
| Requirements and launch guidance | Sector scan, generic checklists, agency directory/turnaround and legal marketplace | Validated applicability rules and evidence per entity/activity/product/location; prerequisite graph, owners/stakeholders, documents, inspections, costs and timeline |
| Multiple countries/jurisdictions | A jurisdiction column exists in reference/profile schema | Scan is fixed to TZ; one profile per workspace; no reviewed multi-country/subnational coverage or permit-level legal scope |
| Single source of truth | Shared certificate IDs and at least one working fleet integration | Verified lifecycle, change history, provenance, conflict/reconciliation policy and consistent links from every affected app |

## Current evidence-backed capabilities

- The local catalogue has **284 licence options across 37 categories**, with principal/subsidiary fees, currencies, notes and checklists. This is a catalogue size, not proof of complete or current legal coverage.
- The local obligation rules table has **19 rules, all `jurisdiction = TZ`**.
- Manager/admin or explicit `comply.manage` permission gates protect the core routes. A disposable JUNIOR request to certificates returned **403**.
- A second tenant's certificate list did not expose the first tenant's certificate in the review.
- Certificate creation checks customer ownership; the update path does not consistently preserve that check (finding C03).
- Browser pages render at the tested desktop/mobile widths. Catalogue/application UI explicitly describes its checklist as a general starting checklist, not an official per-licence requirements list. Preserve that truthful qualification until legal-content acceptance exists.
- Fleet dispatch can read a linked canonical ComplyOS certificate and reject revocation. Broader operational coverage must be traced individually, not inferred from that one integration.

## Findings requiring action

### C01 — High: editing an unchanged expiry date falsely completes renewal

**Reproduced.** A pending review renewal became `issued` after `PATCH /v1/comply/certificates/:id` resent exactly the existing expiry date (`2030-12-31`). The result had `completed_at` set, with `approved_at` and `submitted_at` still null. No payment, authority submission or new permit evidence occurred.

Cause: `ComplyService.updateCertificate` marks active renewals issued whenever `input.expiry_date !== undefined`, without checking a genuine date change, renewal evidence or allowed state transition. Changing the date to null/another date follows the same completion branch.

**Required:** separate a record correction from renewal issuance. Completion must require an explicit authorized, audited transition with new document/version or confirmed authority result, issuer reference, validity interval and provenance. Store the prior version; editing metadata must not imply issuance.

Source: `apps/api/src/services/comply.service.ts`, approximately lines 972–1030.

### C02 — High: auto-renewal stops at a review queue

**Source-confirmed.** The daily job selects auto-renew certificates expiring within 30 days, creates a `comply_renewals` row and notifies managers. Approval only updates the row to `approved`. There is no traced renewal worker that then reliably submits, pays, monitors and archives a newly issued permit.

The scan excludes certificates expiring today/already expired (`expiry_date > today`). Recovery after a missed window therefore needs an overdue branch, not reliance on this future-only query. A fixed 30-day window also cannot represent every authority's lead time or prerequisite process.

**Required:** explicitly label the existing feature “automatically prepare renewal review.” Build a configurable lifecycle with supported automation levels, lead times, legal deadlines, owners, budget consent, recovery and escalation. Represent portal/manual/legal-agent steps honestly.

Sources: `apps/api/src/jobs/comply-renewal.job.ts`; `ComplyService.approveRenewal`.

### C03 — High: certificate update accepts a foreign-tenant customer reference

**Reproduced.** Updating tenant A's certificate with tenant B's valid customer ID returned **200**, and a database read confirmed that foreign ID was persisted. The probe then cleared the reference and cleaned up both tenants.

This demonstrates cross-tenant reference contamination; it is not by itself proof of full customer-data disclosure. Creation already validates customer ownership; updates need the same boundary. Application customer updates should be audited for the same pattern.

**Required:** validate every changed customer/entity/document/catalogue reference against its authorized scope in the same tenant transaction; add cross-tenant mutation regressions.

Source: `ComplyService.updateCertificate`, `updateApplication`.

### C04 — High: country selection is ignored by obligation scanning

**Reproduced.** A manufacturing scan requesting `country: KE` and `jurisdiction: KE` returned a **TZ** profile and created 12 Tanzanian obligations. The extra country fields are accepted by the route's catch-all schema but ignored by the service.

The scan only filters rules by jurisdiction TZ and sector. Employee band, ownership and sub-sector are stored but are not applicability predicates. One profile per tenant cannot independently model multiple legal entities/sites with different activities and jurisdictions. Re-scans append missing codes rather than proving an existing obligation remains applicable.

**Required:** validate supported jurisdictions; reject unsupported coverage explicitly. Introduce entity/site/activity/product scope and versioned rule predicates. Explain why a requirement applies and what evidence is missing. Do not silently substitute another country's rules.

Sources: `ComplyService.scanObligations`, `095_comply_profiles_obligation_rules.sql`, obligation-scan route/page.

### C05 — High: “submitted” can mean only an internal manual reference

**Reproduced.** A BRELA application transitioned to `submitted` with a generated `BRELA-MANUAL-...` reference. The adapter logged a manual-submission placeholder; no authority transmission occurred.

BRELA/NSSF/WCF/generic adapters largely provide manual/portal placeholders. TRA has configurable HTTP scaffolding, but this review did not establish a real contracted provider interface or live acceptance. A configured URL/key alone is not proof of a working authority integration.

**Required:** distinguish prepared, awaiting manual submission, submission evidence attached, authority acknowledged and issued. Keep internal tracking IDs separate from authority receipt/reference IDs. Require receipts/evidence for manual submissions; provider adapters need documented contracts and acceptance.

Sources: `ComplyService.updateApplication`; `apps/api/src/integrations/comply-agencies.ts`.

### C06 — High: reminder state can suppress retry after failed delivery

**Source-confirmed; global jobs were not executed.** The reminder job writes a 90/30-day sent timestamp before manager notifications are delivered. Notification failures are caught; WhatsApp/email errors are swallowed. A later run sees the sent marker and skips that stage. Both stages may fire together on a late first scan. The job reports a sent count even when delivery fails.

The renewal creation check is SELECT-then-INSERT without a unique active-renewal-per-certificate constraint. The single concurrent-start probe returned one success and one rejection; it did **not** reproduce a duplicate. Strong multi-worker idempotency is still not established by that observation or the schema.

**Required:** durable reminder/outbox records, atomic claims, per-channel outcomes and retries, escalation/acknowledgement, overdue catch-up and observable dead letters. Add a database-enforced renewal-cycle identity and multi-worker tests. Jobs also need deliberate active-tenant/entitlement and batching policies.

Sources: `comply-renewal.job.ts`; database indexes on `comply_renewals` inspected during review.

### C07 — High: missing information is presented as compliance/perpetual validity

**Partly reproduced, partly source-confirmed.** The empty-workspace dashboard returned `health_score: 100`. With one recorded active certificate and 12 newly generated obligations, the browser still displayed **100% Compliant — 1 of 1 required certifications active**. The score derives from recorded certificate dates, not the actual applicable obligation universe.

Vault `expiryLabel` converts a null expiry to **Perpetual**; the service treats it as active. No separate evidence of perpetual validity is required. Unknown expiry and a verified non-expiring registration are different facts.

**Required:** show “assessment incomplete/unknown” until coverage and evidence are sufficient. Score satisfied applicable obligations, distinguish missing/uncertain/not-applicable/exempt states and show coverage confidence. Use explicit validity types: fixed-term, perpetual-confirmed, unknown. Define expiry-day/timezone semantics by jurisdiction; the present UI/service boundary can disagree on “expires today.”

Sources: `ComplyService.getDashboardStats`, `certStatus`; `ComplyVault.tsx`.

### C08 — High product gap: fees, penalties and requirements lack authoritative versioning

**Source/database-confirmed.** The certificate model has dates, metadata and risk text, but no typed jurisdiction, renewal quote/assessment, penalty schedule or evidence status. The catalogue has principal/subsidiary fees and generic checklists; its exposed record does not carry source URL, legal instrument/version, effective interval, reviewer or verified-at date.

Notes can express formulas, but that is not an executable, reviewed renewal-cost/penalty engine. A principal licence fee must not automatically be treated as the renewal fee for every date/entity/activity. General requirements are currently qualified honestly in the UI, but are insufficient for definitive launch advice.

**Required:** reviewed jurisdiction packs with official sources, effective dates, scope predicates, fees/formulas, penalty conditions, prerequisites, documents, actors and estimated/official timelines. Preserve the exact rule/rate version used in a case and distinguish estimated budget from authority-assessed amounts and settled payments.

### C09 — Medium: approval can report success for a nonexistent renewal

**Reproduced.** Approving a random valid UUID returned **200 `{ok:true}`**. The update matches pending rows but does not check the affected-row count.

**Required:** 404 for unavailable/foreign records, conflict for invalid state, and explicit evidence-backed transition results. Test stale/concurrent approvals.

### C10 — Operational/scale gap: no complete launch dependency and control model

**Source-supported gap against requested scope.** Current sector rules, generic checklists, agency turnaround text and legal engagements do not form a complete product/company launch plan with prerequisites, critical path, responsible stakeholders, budget, submission windows and verified completion gates.

Dashboard/register/job paths load entire certificate/application/reference collections rather than demonstrating bounded performance for large multinational estates. No sustained volume, memory, provider delivery, disaster recovery or independent legal-content acceptance was performed here.

**Required:** scoped dependency plans and owner/action queues, plus pagination/batching/indexes and a representative load/recovery acceptance matrix. Do not advertise global permit completeness from the current catalogue size.

## Official-source checks and content governance

These checks illustrate the need for current source-controlled rules; they do not validate the 284 catalogue fees or supply a complete legal opinion:

- Tanzania's official [business licensing services notice](https://business.go.tz/starting-a-new-business) directs new, renewal and branch applications to BRELA BOS while distinguishing ongoing applications. Portal routing itself can change and needs versioned maintenance.
- The official [Business Licensing Act, revised 2023](https://www.brela.go.tz/uploads/documents/sw-1758107456-The%20Business%20Licensing%20Act.pdf) describes a fee schedule and mechanisms for amendment. A transcribed fee list needs its effective legal source and amendment review, not a timeless “official” badge.
- Kenya's official [investment procedures portal](https://eprocedures.investkenya.go.ke/menu/1) distinguishes business-type/county permit procedures and exposes steps, costs, timeframes and legal justifications. A country code alone is not sufficient jurisdiction modelling.

No current fee/penalty amount is certified by this review. A supported jurisdiction pack should have an accountable legal/compliance reviewer, source version, applicability explanation, last review, change alerts and an explicit unsupported/uncertain state.

## Recommended target architecture

Extend the existing ComplyOS domain rather than introducing a separate permit app.

| Record / service | Responsibility |
| --- | --- |
| Legal entity, branch/site, asset/product and operating activity | What business operation the obligation applies to; tenant-safe ownership |
| Jurisdiction and authority | Country/subnational/municipal/sector scope, portals, supported channels, calendars/timezones |
| Versioned requirement definition | Legal basis, applicability predicates, prerequisites, exemptions, required evidence, review/effective intervals |
| Fee/penalty schedule version | Charge type, currency, formula inputs, dates, grace/caps, estimate/assessment distinction |
| Permit instance (extend canonical certificate) | Holder/scope, issuing authority, validity type/interval, permit number, source/evidence, current verified state |
| Application / renewal case | State machine, cycle ID, selected rule/rate snapshot, owners, approvals, budget, deadlines, receipts and outcome |
| Document/evidence version | Immutable linkage to uploaded/issued artefact, verification and correction history; use existing Cloud/Sign facilities appropriately |
| Tasks / stakeholder graph | Internal owner/delegate, external agent/authority, dependencies, inspections and critical-path readiness |
| Durable operation / reminder outbox | Claims, retries, provider idempotency, delivery evidence, uncertain outcomes and manual recovery |
| Audit / reconciliation / impact policy | Who changed what and why; authoritative-source conflicts; explicit gates for affected business operations |

“Single source of truth” should mean one canonical permit identity and evidence trail that other apps reference. It should not mean overwriting an issuer's facts, treating every customer as the same legal entity, or silently copying a permit into multiple independent registers.

## Automation levels to expose to users

1. **Track and remind:** imported/entered record, validated dates, assigned owner, retryable alerts.
2. **Prepare:** applicability, documents/checks, draft forms, budget and approval tasks.
3. **Assisted submission:** official portal/manual/legal-agent handoff with receipt upload and follow-up ownership.
4. **Verified API submission:** only for an actual supported contracted authority/provider; record acknowledgement and reconcile retries.
5. **Confirmed renewal:** authority-issued artefact/result verified and attached, validity version advanced, dependent operations updated.

A prepared workflow cannot be labelled renewed. A submitted application cannot be labelled permitted unless the relevant rule explicitly grants that effect and the evidence establishes it. Support the manual path fully where automation is unavailable; never invent a government API.

## Implementation order

1. **Integrity and truthfulness:** fix foreign references, false issuance, unknown validity, dashboard claims, manual-versus-authority statuses and no-op success responses. Add regression tests for every reproduced case.
2. **Reliable lifecycle:** canonical renewal-cycle/state transitions, audit evidence, durable reminder delivery, overdue recovery, concurrency guards and operator exception queues.
3. **Scoped authority data:** multi-entity/site jurisdictions and reviewed versioned requirement/fee/penalty packs. Start with an explicitly defined Tanzania scope rather than claiming every country.
4. **Launch planner:** structured company/product/activity intake → explained applicable requirements → dependencies/documents/stakeholders → timeline/budget → approved execution plan and readiness gates.
5. **Supported integrations:** real submission/payment/status/document adapters; manual handoffs for the rest; operational impact links to Freight, SEAL, ClearOS, Finance, Tasks, Cloud and Bliss reviewed individually.
6. **Release acceptance:** relevant legal review, supported-jurisdiction/provider matrix, browser/accessibility, security, reliability, sustained scale and recovery evidence.

## Minimum acceptance scenarios

- A missing or unchanged expiry cannot certify renewal; null expiry is unknown unless perpetual status is verified.
- Foreign tenant customer/entity/document/permit IDs cannot be attached through create, update, import or bulk paths.
- One renewal cycle survives concurrent workers, repeated requests, retries, crashes and late callbacks without duplicate submission/payment.
- Reminder channel failure retries and escalates; notification flags reflect real outcomes; missed expiry windows are recovered.
- Supported entity/site/activity jurisdictions return correctly sourced requirements; unsupported coverage is explicit, never replaced with TZ.
- Cost/penalty outputs match approved dated fixtures including formula inputs/currency, grace/late cases and evidence of waivers where supported.
- Manual preparation cannot fabricate an authority receipt or issued state. Payments/inspections/authority rejection remain visible blockers.
- Requirement changes retain old case snapshots and identify affected entities. Exemptions/appeals/corrections are authorized and auditable.
- Cross-app operations use the canonical permit and apply explicit approved restrictions; a revoked/expired permit does not remain “valid” in copied metadata.
- Desktop/mobile/keyboard journeys remain usable with realistic long names, many sites/countries, missing evidence and slow/reconnecting services.
- Representative multinational record/job volumes and restore drills meet a stated operating envelope. No absolute guarantee of uninterrupted legal operating permission is made.

## Review outcome

Proceed as a focused hardening and capability expansion of ComplyOS, with a frozen initial jurisdiction/permit scope and reviewed content owners. The current foundation is useful, but presenting it as automatic renewal or complete international legal control would overstate what has been implemented and verified.
