# Enterprise ComplyOS progress recheck — 29 October 2026

**Subsequent fixes rechecked:** see [the follow-up review](ENTERPRISE_COMPLYOS_FOLLOWUP_RECHECK_2026-10-29.md). Findings below describe the earlier snapshot; several specific cases have since been fixed, while partial and newly exposed gaps remain.

## Verdict

Substantial backend groundwork has been added, and the ten targeted integration suites pass. The requested enterprise platform is **not complete or ready for production**. The implementation register's “10 phases complete” wording describes backend milestones too broadly: the UI, cross-app execution, real industry functionality, scope enforcement, integrations and operational acceptance are unfinished, and additional probes reproduced critical defects.

Baseline: local commit `5abc4206`, `master` eight commits ahead of origin. Most enterprise source/migrations/tests are uncommitted. Existing unrelated billing/CSS work was preserved. This review changed no product code and did not deploy or run authority/payment operations.

## Fresh verification

- Database confirmed migrations **641–650 applied** locally.
- Ran all ten new integrity suites: **10 files / 221 tests passed**, exit 0, approximately 119 seconds. This is not a full-platform regression pass or a business-acceptance certificate.
- Ran additional real authenticated API/database probes with disposable tenants. Evidence: `ENTERPRISE_RUNTIME_RECHECK_2026-10-29.json`.
- Re-ran original ComplyOS diagnostic/browser checks. Evidence: `COMPLYOS_PROGRESS_RECHECK_EVIDENCE_2026-10-29.json`, screenshots `complyos-progress-*.png`.
- Five existing ComplyOS pages rendered at 1440/390 px: dashboard, vault, workflows, catalogue and obligation scan. Ten snapshots, no observed JavaScript page errors or page-wide overflow. New enterprise UIs do not exist, so this is not browser acceptance for the new phases.
- Disposable probe tenants were removed. The existing enterprise metrics test suite also computes/upserts platform metric snapshots in the local development database; do not describe that suite as having exclusively tenant-local effects.
- No fresh full typecheck, production build, all-app regression, real provider, sustained-load or recovery certification is claimed by this review.

Targeted suite results:

| Suite | Passed |
| --- | ---: |
| ComplyOS integrity | 13 |
| Organizational model | 18 |
| Administrator hierarchy | 11 |
| Permit engine | 20 |
| Permit checks/capture | 20 |
| Industry workflows | 21 |
| Launch planner | 21 |
| Consultant delegation | 32 |
| Marketplace | 30 |
| Enterprise metrics | 35 |
| **Total** | **221** |

The implementation register reports different totals for several suites and 235+ overall. Use actual runner output for this checkout; passing tests cannot close requirements those tests do not exercise.

## What is built versus what remains

| Area | Built and observed | Still pending |
| --- | --- | --- |
| Existing ComplyOS fixes | Same-expiry edit no longer completes renewal; foreign-customer certificate patch rejected; unsupported KE scan rejected; missing renewal approval returns 404; empty health score is unknown rather than 100 | Full evidence-backed issuance, obligation coverage, durable reminders and authority execution |
| Organization/industries | Entity/site/assignment/industry schemas, services, routes and tests | Integrated multi-industry onboarding and app behavior, effective scope enforcement and production backfill |
| Admin hierarchy | Assignment/audit helpers and org APIs | Consistent use across reads/writes/reports/jobs, correct owner role gates, actor attribution and per-field scope |
| Canonical permit engine | Versioned requirement/fee structures, lifecycle cycles/evidence and jurisdiction-pack records | Safe state machine, foreign-reference checks, actual source/legal review, robust renewal execution and reconciliation with legacy flows |
| Cross-app capture/checks | Candidate/check APIs, classification/register functions, app coverage/configuration records | Real intake event hooks, extraction/scanning authorization, backfill, source-link UI and consumer enforcement across apps |
| Industry workflows | Definitions, matrix, generic instances and transaction records | Actual sector-specific business execution and cross-app financial/stock/regulatory effects; a generic step ledger is not a manufacturing or pharma module |
| Launch planner | Case/site/product/plan-item CRUD, readiness calculation and snapshots | User-facing planner, requirement-driven automatic plan assembly, real dependencies/critical path, assigned execution and evidence-based readiness |
| Consultant model | Portfolio, mandate, staff, engagement and audit services/routes with tests | Owner/provider UI, correct actor/owner role behavior, real delegated access to permit/document actions and revocation propagation |
| Marketplace | Listing/enquiry/quote/assignment/milestone/dispute schemas and services | Usable two-party workflows, verified live providers, mandate integration in real actions, settlement/recovery and production governance |
| Enterprise metrics/jobs | Snapshot/resource-limit/job/bulk-operation tables and APIs | Accurate measures, real worker integration, live enforcement, dashboards, load/placement/recovery/support acceptance |

## Original findings rechecked

The same diagnostic cases now produce:

- Unchanged expiry: renewal remains **pending_review**. Confirmed improvement.
- Foreign customer certificate update: **400**, reference not persisted. Confirmed improvement; error text is still generic.
- KE obligation scan: **400** with explicit supported scope TZ. Confirmed truthful boundary; Kenya support remains unimplemented.
- Empty dashboard: `health_score = -1`, rather than false 100. Confirmed improvement; full obligation/evidence completeness scoring is not established.
- Unknown renewal approval: **404**, rather than unconditional success. Confirmed improvement.
- Reminder ordering: source now delivers before marking sent. This improves in-app failure handling, but is not a durable, per-channel retry/claim/outbox solution. WhatsApp/email errors remain swallowed; no global reminder job was executed in the review.

## Broken / release-blocking behavior

### R01 — High: new lifecycle allows draft → issued without evidence

**Reproduced via authenticated API.** A valid draft lifecycle cycle was patched directly to `status: issued`; response **200**. Its authority reference, submission reference, outcome date and evidence were absent; the evidence endpoint returned an empty array.

`PermitEngineService.updateCycle` writes the requested status without an allowed-transition/evidence policy. The older same-date bug was narrowed, but the new lifecycle reintroduces the same broader false-assurance problem.

Required: an evidence-backed, authorized transition service, issuer/validity reconciliation, actor/reason history and negative tests for skipping approvals/submission/outcomes. Legacy and new lifecycle models must agree.

Sources: `apps/api/src/services/permit-engine.service.ts:236`, `apps/api/src/routes/permit-engine.routes.ts`.

### R02 — High: expired permit is reported valid by the new check engine

**Reproduced.** A disposable certificate with stored `status: active` and expiry `2020-01-01` returned **valid** from `PermitCheckService.performCheck`. The existing `/v1/comply/certificates` endpoint correctly returned **expired** for the same record.

The new check service trusts stored status instead of deriving current validity/assurance; holder/entity/site/jurisdiction inputs are not used to establish applicability. Requirement-code matching also uses agency code rather than a full versioned requirement relationship.

Required: one canonical check/resolution path with clock-aware validity, explicit perpetual/unknown handling, holder/site/product/jurisdiction match, verification freshness and rule versions. Consumer safety must not depend on which endpoint it calls.

Source: `apps/api/src/services/permit-check.service.ts:188`.

### R03 — High: lifecycle cycle can link a foreign tenant certificate

**Reproduced at the service/database boundary.** `createCycle` accepted tenant B's certificate ID while writing a cycle for tenant A; the foreign reference was persisted. Entity/site ownership checks exist, but certificate ownership is not checked there. The ordinary API calls the same service.

Required: validate certificate, holder/owner/delegate, evidence file and other changed references in the authorized context; test all create/update/import paths. Fixing only the legacy certificate-customer patch did not close the new reference surface.

Source: `PermitEngineService.createCycle`, approximately line 200.

### R04 — High: tenant owners are denied new administrator functions

**Reproduced via authenticated API.** `TENANT_ADMIN` received **403** creating a consultant portfolio and computing tenant metrics. An `ADMIN` in the same fixture could compute metrics.

Delegation, marketplace and enterprise-metric guards use `['SUPER_ADMIN','ADMIN','MANAGER']`, omitting `TENANT_ADMIN`. This contradicts the requested tenant-superadmin hierarchy and unnecessarily elevates generic managers.

Required: a consistent tested administrator/permission policy, with explicit delegated scope rather than ad hoc role arrays. Verify actual owner happy paths, not only JUNIOR denial.

Sources: `consultant-delegation.routes.ts:4`, `marketplace.routes.ts:4`, `enterprise-metrics.routes.ts:4`.

### R05 — High: new routes bypass existing entitlement/role boundaries

**Reproduced.** With a `starter-tzs` fixture plan, the legacy ComplyOS certificate route returned **403 PLAN_UPGRADE_REQUIRED**, while `/v1/permit-capture` returned **200** and the candidates. A JUNIOR also read candidate metadata—including the qualification review fixture—through the new list route.

The new plugins generally require authentication but do not consistently apply ComplyOS entitlement, management permission or organization/document scope. These observations establish broader candidate metadata access, not actual download of a private file.

Required: enforce the accepted capability, role/action, record/field/document and active delegation policy on every new route, export/check and worker path. Source-app user access must be deliberate and scoped, not a blanket authenticated-user exception.

Sources: new route plugins, especially `permit-check.routes.ts`.

### R06 — High audit gap: authenticated actor is silently lost

**Reproduced.** Real owner API requests created an entity, launch case, lifecycle cycle and capture candidate whose `created_by`/`captured_by` was **null**. The JWT correctly carried `sub`.

New routes read `request.user.id`, which is not part of the actual JWT payload. Tests often call services directly with the fixture user's real ID, masking the route-level problem.

Required: use the verified `request.user.sub` consistently, retain on-behalf-of operator identity, validate required actor fields and add API-level creation/audit tests.

Sources: `org-model.routes.ts:124`, `launch-planner.routes.ts:45`, `permit-check.routes.ts:59`, plus other new route mutations.

### R07 — High reporting gap: metrics contain hardcoded zeros

**Reproduced.** After two fixture entities existed, tenant snapshot `entity_count` was **0**. The service initializes entity/site/permit/cost/renewal/blocker measures to zero; platform snapshots similarly initialize MRR, permits, paid subscriptions, providers and queue depth to zero rather than measuring them.

Tests assert the real user count and numeric field types, not reconciliation of the other measures. These snapshots must not be displayed as accurate enterprise metrics.

Required: implement authoritative queries with defined scope/period/currency and coverage/freshness; represent unimplemented/unknown metrics explicitly instead of zero. Reconcile tests against populated fixtures and existing Finance/billing/operational sources.

Source: `apps/api/src/services/enterprise-metrics.service.ts:4`.

## Major unfinished capabilities

### Cross-app implementation is not complete

The actual coverage table reports **1 implemented, 11 planned, 8 not applicable**. The single implemented label is ComplyOS; source search did not find the new capture/check service connected to upload/event/job paths across the other apps. Creating a candidate API and a coverage row is not universal intake or enforcement.

Shared candidate capture currently accepts metadata supplied by the caller. It is not demonstrated as an authorized Cloud attachment ingestion/scanning/classification pipeline with durable replay/backfill and source verification.

### Access metadata is not platform-wide enforcement

Org assignments and access-check helpers exist, but the new data scopes are not consistently consumed by actual app queries, field filtering, analytics, exports, document access or worker actions. The consultant check is reachable as a check endpoint; the inspected permit/document paths do not yet use it to execute owner-scoped delegated work.

### Industry metadata is not finished sector execution

The checked database contained zero `industry_app_capabilities` rows, 38 industry/app matrix rows and ten generic workflow definitions. These are metadata counts, not industry acceptance. Instance/transaction APIs record arbitrary generic steps; they do not themselves perform production consumption, GL posting, product registration or sector-specific cross-app workflows.

### Legal content remains narrow and unverified

The only jurisdiction pack is **TZ, partial, no reviewer/date, requirement_count 0**. There are requirement/fee definition rows and draft/published states, but row count or a `published` flag is not qualified legal review. Applicability resolution requires further effective-date, exemption and contextual predicate validation.

Real government submission/payment/status contracts, validated rates/penalties, multinational legal coverage, independent assurance and actual authority renewal remain pending.

### New user journeys and enterprise operations are not delivered

No corresponding new web pages/hooks/route consumers were found for organization management, permit capture/checks, launch planning, mandates, industry workflows or enterprise metrics. The implementation register itself says no new UI was created. Existing ComplyOS pages still use the legacy APIs.

Real consultant/provider workspaces, verified marketplace participants, payment settlement, exception handling, migration/backfill, workload validation, data placement, alerting, recovery and support acceptance remain open. Durable job tables alone do not demonstrate a worker running the promised processes.

## Recommended next work

1. Fix R01–R07 with negative and API-level regressions. Preserve the passing suites, but extend them to test the missing invariants rather than only CRUD/service shapes.
2. Reconcile old/new permit and renewal state models into one authoritative lifecycle/check path. Close foreign-reference and role/entitlement bypasses before granting broader access.
3. Deliver one complete user-facing vertical slice: upload → authorized candidate → verified/linkable permit → reasoned operational check → reviewed renewal → evidenced outcome/history.
4. Connect organization/industry scopes and consultant grants to real actions; implement the needed UI and app adapters.
5. Add actual industry business execution and metrics reconciliation; review legal packs and supported providers.
6. Perform fresh typecheck/build, full regression, browser/accessibility, provider/host/recovery and sustained enterprise workload acceptance for a named release.

Update the implementation register to distinguish **schema/service implemented**, **API verified**, **UI integrated**, **cross-app working**, **provider accepted** and **enterprise release accepted**. Do not label all ten phases complete until their user-facing and operational acceptance criteria are satisfied.
