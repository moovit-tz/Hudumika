# Build Hudumika's enterprise industry platform and ComplyOS engine

Use this as the implementation prompt for Claude Code in `D:\Apps\Hudumika`.

---

You are the implementation engineer for Hudumika. Build the capabilities below in the existing repository, with working database models, services, APIs, jobs, permissions, UI and meaningful tests. Start by inspecting the current state, then implement. Do not stop at a proposal, scaffold, architecture diagram or list of recommendations.

The goal is an enterprise multi-industry platform whose apps adapt to a tenant's business lines and whose ComplyOS engine governs permit/certification requirements and lifecycle across apps, countries, subsidiaries, products and sites. Include consultant tenants and, after the engine/delegation foundation is accepted, a real compliance-services marketplace.

Do not claim Fortune-500 readiness, complete worldwide legal knowledge, supported capacity, provider connectivity or statutory certification without evidence. Implement the broad platform architecture and accepted workflows, while clearly recording jurisdiction/provider/professional-review dependencies. Keep unsupported functionality unavailable or explicitly unknown; do not simulate production success.

## A. Read and inspect before editing

Read these files in order:

1. `CLAUDE.md` and `AGENTS.md`, plus applicable directory instructions.
2. `docs/HUDUMIKA_MULTI_INDUSTRY_AND_ACCESS_BLUEPRINT.md`.
3. `docs/COMPLYOS_PLATFORM_ENGINE_AND_AGENT_MODEL.md`.
4. `docs/COMPLYOS_GLOBAL_ENTERPRISE_READINESS_BLUEPRINT.md`.
5. `docs/audits/COMPLYOS_PERMIT_CONTROL_REVIEW_2026-10-29.md` and its JSON/browser evidence.
   Also read `docs/COMPLYOS_RENEWAL_FINANCE_BUILD_BRIEF.md`: renewal budgeting, future funding and traceable Finance-backed spend are explicit user requirements, not satisfied by manual budget/actual fields.
6. Relevant current architecture, authentication/authorization, industry, app-registry, domain-event, workflow, billing and production-readiness sources. Older audit conclusions are evidence to reproduce, not unquestionable current facts.

Run `git status` and inspect recent changes. Other sessions may be editing billing, database types, CSS and migrations. Preserve their work. Determine the next available migration identity from the actual checkout/database; do not assume a number from this prompt remains unused. Do not modify applied migrations or broadly stage/commit somebody else's changes. Commit only when authorized, staging owned paths explicitly.

Search existing patterns before adding any framework, table abstraction, component, integration client or dependency. Reuse:

- npm workspaces, shared `packages/types`, Fastify/Kysely/PostgreSQL and the existing migration runner.
- React 19, Router 7, Vite, Tailwind 4, `apps/web/src/components/ui`, `PageHeader`, `PageLayout`, branding and localization conventions.
- Existing `apiFetch` and real cookie/CSRF authentication; flag stale bearer/localStorage documentation rather than reintroducing that convention.
- Existing industry/business-line models, Finance industry/domain services, product industry attributes, entitlement/configuration mechanisms and field policies.
- Existing Ondi identity, `SUPER_ADMIN` / `TENANT_ADMIN`, org permissions, tenant context/RLS, audit and controlled platform access.
- Existing Cloud upload/scanning, Sign, Tasks, Calendar, Finance, notifications, durable events/outbox/queues, provider credentials and metering.

Do not import new UI work from the near-dead `packages/ui` or replace `apiFetch` with the unused generated API client.

## B. Deliverables and execution discipline

Create and maintain a durable implementation register under `docs/implementation/enterprise-complyos/` containing:

- Requirements and acceptance IDs mapped to existing implementation, gaps, changed paths, migrations and tests.
- App × industry × workflow × role/scope coverage matrix; jurisdiction/provider coverage and unavailable functions.
- Decisions/blockers ledger, data migration/backfill/reconciliation plan and per-phase verification results.
- Current runnable milestone and exact next work, so another session can continue without reconstructing the history.

Use small complete vertical slices: data → invariant/service → API/jobs → UI → permissions → regression/browser evidence. Keep the application runnable and backward compatible between slices. Continue through all phases; a phase is not complete merely because its files exist.

Make routine reversible engineering decisions yourself. Ask only for genuinely missing policy, credentials, external authorization or business/legal decisions that affect correctness. Keep independent work moving while such decisions are pending. Use unpublished configuration/explicit unsupported states instead of inventing legal rules or commercial terms.

Never weaken assertions, silently skip failures, hide missing data as zero, create inactive buttons as completed features or use fabricated provider responses in production. Mocks belong only in identified tests/demo fixtures.

## C. Phase 1 — repair the existing ComplyOS foundation

Reproduce each relevant October 29 finding against the current checkout, then fix it with regression tests:

1. An unchanged/null/corrected expiry must not mark a renewal issued. Separate record correction from evidence-backed renewal outcome. Require authorized state transitions, issuer evidence/reference, new validity version and audit reason where appropriate.
2. Validate customer/entity/permit/document references on create, update, import, bulk, delegation and worker paths using explicit tenant/scope checks. Fix the reproduced foreign-customer certificate update and inspect sibling application paths.
3. Replace misleading “100% compliant” calculations with obligation/evidence coverage and unknown states. Missing expiry must not automatically mean perpetual. Define legal-date/timezone semantics and distinguish missing, exempt, verified non-expiring, expired and revoked.
4. Distinguish prepared/manual handoff/internal reference from authority submission/acknowledgement. Do not mark a manual adapter's generated tracking ID as proof of an actual government submission.
5. Replace sent-before-delivered reminder behavior with durable delivery/claim/retry outcomes, escalation and operational visibility. Add overdue/missed-window recovery and configurable lead times.
6. Protect renewal cycles and state mutations against duplicate/concurrent workers and requests with database-backed invariants. Return not-found/conflict for no-op or invalid approvals rather than unconditional success.
7. Stop silently substituting Tanzania for another jurisdiction. Validate supported scope explicitly and preserve unsupported/uncertain status.
8. Inspect existing agency sync, demo OCR/import and legal directory behavior for false success/verification claims. Preserve honest demo/manual labels and prevent illustrative records entering production assurance states.

Do not run global reminder jobs against real tenants just to test them. Refactor selection/execution for isolated fixture testing if necessary. No real applications, messages or payments without the appropriate authorization/test environment.

Exit: negative security/state tests, concurrency/retry/rollback tests, correct dashboard/register semantics and desktop/mobile verification for fixed flows.

## D. Phase 2 — organizational scope and multi-industry core

Extend the shared model for:

`customer group/workspace → legal entities → business lines/industries → sites/departments → assets/products/activities → operational records`

Support multiple simultaneous industries within a tenant, entity or site where relevant. Primary industry is an onboarding convenience, not the only possible operating context. Products, permits and work can require explicit many-to-many relationships. Preserve canonical IDs, aliases, external mappings and effective history for reorganizations/acquisitions/divestitures.

Build a shared governed industry/capability registry using existing mechanisms. It must identify implementation/acceptance state, app ownership, dependencies, validated fields, document types, terminology, workflows, permission keys, metrics, integrations, jurisdiction mappings and schema/template versions.

Support the existing industry catalogue plus the user's requested pharmaceutical, medical/healthcare, manufacturing, trading/distribution, mining, fintech/financial services and technology contexts. Resolve aliases/sub-industries explicitly rather than inventing incompatible keys in different apps. Maintain an expandable registry for additional industries.

Changing industry configuration must not erase old records, rewrite posted transactions, reset permissions or silently reclassify every business line. Govern extra attributes; keep critical financial/regulatory invariants typed and server-enforced, not arbitrary JSON.

Exit: one tenant can operate pharmaceutical manufacturing, medical-device trading and healthcare services with distinct entity/site/workflow contexts and correct consolidated/scoped views.

## E. Phase 3 — administrator hierarchy and consistent visibility

Implement the requested hierarchy using existing identities:

- **Hudumika Superadmin — `SUPER_ADMIN`:** full authorized platform administration, global/per-tenant metrics and controlled tenant-data/operations access. Use explicit operator context, narrow platform services and actor/tenant audit trails. Support/impersonation must preserve the real operator identity.
- **Tenant Superadmin / Workspace Owner — `TENANT_ADMIN`:** full administration and tenant-wide visibility for their account, entities, sites, industries, users, app configuration, subscribed capabilities, records, billing and metrics. This role never acquires unrelated-tenant or platform privileges.
- **Delegated entity/site/department/app administrators and managers:** assigned actions and organizational scope, without accidental global visibility.
- **Staff, specialists, auditors, customers and consultants:** assigned record/field/action access and active grants only.

Map legacy `ADMIN` deliberately and preserve appropriate existing behavior; do not create a second conflicting `SUPER_ADMIN` role for tenant owners. Extend org permissions/field policies instead of maintaining an unrelated permission system.

Enforce capability availability, entitlement, applicable industry/context, action permission, entity/site/record scope, field/document restrictions and active delegation consistently. Protect direct APIs, reports, counts, search, download links, exports, websockets, caches, jobs, imports and AI tools—not just navigation/buttons. Permission revocation must invalidate relevant caches and queued actions must recheck authority before side effects.

Explicit tenant filters and `withTenant` remain mandatory. Consultants must never gain generic `dbPlatform` access. Full administrative ability does not mean exposing plaintext secrets, fabricating issuer/payment evidence or bypassing business-state invariants.

Exit: adversarial role/scope matrix tests, tenant-to-platform escalation denial, field/export/search tests, revocation and mixed-role/mixed-industry browser journeys. Demonstrate both requested full-administration levels without granting ordinary users broader access.

## F. Phase 4 — canonical permit and regulatory requirement engine

Extend current ComplyOS entities rather than creating an unrelated replacement app. Implement:

- Legal holder, owning workspace, entity/site/product/asset/activity scope, jurisdiction/authority, canonical permit number/identity and cross-app links.
- Evidence-backed validity types/states, document/verification versions, issuer references, history/corrections and explicit assurance level/as-of freshness.
- Versioned requirement definitions with applicability predicates, source/legal instrument, effective interval, reviewer and review state, dependencies, exemptions and required evidence.
- Dated fee/penalty/renewal definitions with currency, formula inputs, grace/caps where supported, and separation of estimate, official assessment and settled cost.
- A renewal/application/cancellation/surrender lifecycle with one cycle identity, owners/delegates, prerequisites, deadlines, approvals, budget, submissions/receipts and confirmed outcomes.
- Durable notifications and execution, retry/dead-letter/operator recovery, deadline/timezone/calendar behavior, uncertain provider outcomes and reconciliation.
- Full evidence/history access filtered by user and grant. Archiving, unlinking, ending an engagement and authority revocation are different actions.

Jurisdiction packs must reject unsupported coverage, explain applicable requirements and retain the version used in a case. Source authoritative material and obtain qualified review for legal conclusions. Do not let AI-written guesses become authoritative rules.

Build the architecture for international/subnational coverage and implement reviewed packs supported by available source material. Record missing review/provider coverage explicitly while continuing engine work. Do not claim comprehensive worldwide legal knowledge.

Exit: source/version-aware applicability and fee fixtures, record-correction versus issuance tests, lifecycle/concurrency/recovery tests and multi-entity/jurisdiction cases with explicit uncertainty.

## G. Phase 5 — permit capture and checks across every Hudumika app

Inventory every app's attachment/import/document intake and copied permit fields, including legacy screens and jobs. Maintain a per-app coverage register.

Implement a shared contract for:

`authorized source upload/import → scan/classify candidate → review/deduplicate → register/link permit or renewed version → source link → live/versioned check → lifecycle/history updates`

Required user actions: Add to ComplyOS, Link existing permit, Add renewed version, Not a permit and Needs review. Configured automatic registration may create pending-verification records, never assert legal validity without evidence.

- Reuse Cloud authorization/scanning and durable source events/outbox. Documents are untrusted data, not instructions.
- Capture source app/record/attachment/version, holder/issuer/jurisdiction claims, provenance, confidence and reviewer.
- Deduplicate by source identity and scoped permit identity; preserve renewed versions. Do not merge unrelated holders or copy sensitive HR/client documents into unrestricted search.
- Backfill old records with dry runs, bounded checkpoints, review queues, idempotency and reconciliation.
- Shared checks return scope, status, reasons, assurance, rules version and freshness. Unknown/stale/unavailable must not default to valid.
- Propagate updates to consumers without echo loops; validate owner scope and handle out-of-order events.
- Define explicit operational impact policy: block, require review or warn for a given activity and state. Do not arbitrarily disable the entire business when one document is missing.
- OCR/provider spending must use approved credentials, metering and budgets; no unapproved paid extraction.

Start with a complete integration, then extend to all in-scope apps, including ClearOS, fleet/Tracking, CargoTracker, SEAL/inventory, NexusHR, CRM, Projects/Tasks, Cloud, Email/Bliss, Finance and other registered intake paths. An app with no applicable intake/check path needs an evidenced not-applicable decision, not invented functionality.

Exit: the same permit linked from several apps has one canonical history; revocation/renewal propagates correctly; duplicate/replayed/out-of-order events and private attachments pass tests.

## H. Phase 6 — industry-specific workflows throughout Hudumika

Implement actual special functions, not just renamed labels or new sidebar items. For each industry/app combination, record applicable workflows and demonstrate them through persisted transactions and cross-app results.

Examples to implement or integrate according to accepted scope:

- **Pharmaceutical:** product/country registration, holder/manufacturer/site relationships, batch/expiry traceability, registration/change/renewal work, authority correspondence and commitments; integrate specialist RIM/eQMS functions rather than pretending to replace unimplemented regulated systems.
- **Medical/healthcare:** facility/practitioner/equipment credentials, appropriate procurement/inventory/service billing, assignments and restricted sensitive information for the explicitly supported use. Do not claim a complete clinical EHR from administrative features.
- **Manufacturing:** BOM/routing, material planning, production/consumption/output, lots/quality holds, waste and cost reconciliation across inventory, purchasing and Finance.
- **Trading/distribution:** serial/batch/expiry, multi-location stock, purchasing/sales/returns, import/export/landed costs and relevant commodity/product evidence.
- **Mining:** concession/site/asset/equipment/contractor context, reviewed permit/inspection obligations and attributable project/operating cost workflows.
- **Fintech/financial services:** supported authorizations, due-diligence/review, financial reconciliation, controlled risk cases and audit evidence; use genuine supported regulated providers, not simulated banking activity.
- **Technology/telecom and other registered industries:** define applicable operational/product/service workflows and implement them with the same domain and acceptance discipline.

Connect shared apps: CRM handover, HR qualifications, Projects/Tasks/Calendar dependencies, Finance attribution, Cloud/Sign evidence, communications, Studio/AI actions and owner-approved analytics. Preserve posted financial and stock invariants across all packs. Industry selection never grants user access automatically.

Exit: app × industry coverage matrix has demonstrated complete journeys or explicit unsupported/excluded status. Unsupported entries remain open requirements; do not mark the whole platform complete from a few examples or catalogue names.

## I. Phase 7 — company/product launch planner

Implement structured intake for entity, industry/activity, products, sites, jurisdictions, ownership/workforce and other supported applicability facts.

Produce an explained readiness plan with applicable permits/registrations, legal sources, prerequisites, supporting documents, responsible stakeholders, inspections, estimated versus official costs, deadlines/process times, dependency/critical path, owner assignments and execution status.

Allow reviewed approvals, exemptions, changes and uncertainty. Create linked Tasks/Calendar/ComplyOS cases and authorized document requests. Recompute impact when activities/sites/products or legal requirements change while preserving old decision snapshots. Do not call a business launch-ready merely because an incomplete list contains no expired documents.

Exit: multi-site/multi-industry launch cases, unsupported jurisdiction, changed requirement, missing evidence, prerequisite failure and role-specific cost/readiness tests.

## J. Phase 8 — consultant businesses and client delegation

Legal/compliance consultants operate as actual tenants with normal entitled Hudumika business tools plus client portfolios, team assignments, permit queues/history, engagements and billing.

Support both clients with their own Hudumika workspace and externally managed clients with an approved representation basis. Keep legal holder, record custodian, customer CRM identity and provider identity distinct. Later client onboarding/custody transfer needs explicit authorization and duplicate reconciliation.

Implement scoped, time-limited, revocable mandates specifying owner/client/provider tenants, selected permits/entities, allowed actions, document/history scope, authorized staff, purpose and expiry. Enforce them on APIs, downloads, analytics, jobs and queued actions.

Separate view, prepare, upload, submit-on-behalf, spending request/approval, correction, verification and termination-request permissions. Hiring an agent must not grant unrestricted access to the client workspace, prior privileged advice or unrelated agent history.

Client staff/client portals are segregated; consultant employees assigned to one client cannot read another. Multiple agents cannot duplicate the same renewal/payment. Revocation/end-of-engagement removes access according to policy without erasing canonical permit history. Preserve true actor/on-behalf-of identity in audit.

Exit: owner/provider/client portal journeys plus negative cross-tenant, staff assignment, expiry/revocation, queued action, export and handover tests.

## K. Phase 9 — marketplace with real provider workspaces

Build on the proven delegation/engagement model. Do not equate the current global firm directory or status-labelled milestones with a working provider marketplace.

Implement provider-tenant listings, service/jurisdiction coverage, credential/identity review, enquiries/redacted briefs, structured quotations, accepted scope/mandates, assignments, evidence/milestones, delivery acceptance, reassignment, cancellation and disputes. Gate dossier disclosure on authorization.

Replace or segregate illustrative firm names/ratings/reviews/prices and verification flags; a verified badge needs actual evidence and a review lifecycle. Distinguish authority fees, professional fees, platform charges and variable services. Integrate real Finance/payment states where supported; no fictional escrow, payouts or settlement. A consultant completion click or paid invoice cannot establish permit issuance.

Exit: two real-model disposable provider/client tenants complete a scoped renewal engagement and history handover; access, dispute and payment uncertainty tests pass. Actual provider credential and gateway acceptance remain explicit external release dependencies.

## L. Phase 10 — enterprise metrics, scale and service operations

Implement access-correct dashboards and evidence drill-down:

- Platform operator: tenant/app/industry adoption, confirmed subscription/usage economics, infrastructure/queue/provider health, support burden, jurisdiction/feature coverage and incidents.
- Tenant owner: consolidated and scoped entity/site/business-line financial/operational/compliance metrics, costs, upcoming renewal work and blockers.
- Other roles: permitted organizational/client scope and fields only.

Correct misleading commercial definitions before exposing them as enterprise facts. Active non-free plans are not necessarily paying customers. Contracted recurring amounts, settlements, cohorts, provider actuals and cost attribution must reconcile; show unavailable/estimate/immature states where appropriate.

Add bounded queries/search, indexes based on query plans, durable/batched jobs, bulk import/export, per-tenant resource limits, integration reconciliation and operator exception queues. Demonstrate deployment/migration compatibility, monitoring/alert delivery, backup plus file/key restore, failover/recovery and support runbooks.

Use a workload agreed from design partners. The blueprint's 100 groups / 5,000 entities / 100,000 sites / 2 million permits / 20 million history events is an illustrative test fixture, not promised current capacity. Specify concurrency, document volume, region placement, freshness, p95/p99 and recovery objectives. Measure tenant skew, burst reminders, long exports, provider outages and sustained memory behavior.

A single VPS deployment does not establish global availability or disaster recovery. Evolve the existing architecture from measured requirements; do not add Kubernetes/microservices purely as an enterprise label.

For regulated uses, produce requirements/risk/traceability/test/change/release/operating evidence and identify qualified review requirements. Never self-certify legal, pharmaceutical, privacy or security compliance from a green build.

## M. Verification requirements for all phases

- Follow repository-required typecheck after relevant TypeScript changes and actual browser checks for UI-visible work. Run the appropriate root checks/build for release milestones.
- Extend the existing real-database integration framework, using disposable tenants and correct JWT payload (`sub`, tenant, role). Test restricted RLS/application roles as well as privileged fixture setup.
- Test authorization denial, foreign-ID mutation, field/document/export/search leakage, stale tokens/caches and worker permission changes.
- Test concurrency, unique identities, rollback, process crash/restart, duplicate/out-of-order delivery and uncertain external outcomes.
- Exercise desktop/mobile/keyboard, empty/error/loading states, realistic long data and high-record-count views.
- Do not alter real customer records, activate real workflows, send messages, purchase services or perform payments merely to obtain test evidence. Use explicit sandbox adapters/fixtures; obtain the required authorization for real side effects.
- Report exact command results, totals/skips, environment and commit; distinguish source-confirmed, isolated-test, browser and provider/host acceptance.

## N. Final completion standard and reporting

At each milestone, report:

1. What now works end to end and which requirement IDs it closes.
2. Changed paths, migrations, backfills and compatibility implications.
3. Exact verification results and remaining failures, with evidence locations.
4. Jurisdiction/provider/legal/business decisions still pending, separated from code still missing.
5. The next executable milestone and updated implementation register/project memory.

Do not call all work complete until the agreed coverage matrix is satisfied and critical integrity/security defects are closed. Do not hide unimplemented industries/apps behind “future extension” while claiming universal support. If external dependencies prevent a supported live feature, make that boundary truthful in the product, document it and complete independent work.

Start now: inspect the actual checkout, create the implementation/coverage register, reproduce the high-impact ComplyOS findings and implement the first complete integrity slice with tests and UI verification. Continue through the remaining phases in dependency order. The deliverable is a functioning, evidence-backed platform—not a collection of documents or placeholder modules.
