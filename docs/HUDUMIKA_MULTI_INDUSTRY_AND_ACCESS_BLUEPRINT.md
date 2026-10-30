# Hudumika — multi-industry platform and access model

User scope extension recorded 29 October 2026. This is a target design and implementation brief, not a statement that all capabilities below are implemented or accepted for production.

Read with `COMPLYOS_GLOBAL_ENTERPRISE_READINESS_BLUEPRINT.md` and `COMPLYOS_PLATFORM_ENGINE_AND_AGENT_MODEL.md`. Industry adaptation applies to the entire Hudumika platform; ComplyOS supplies the shared requirement/permit engine rather than owning all industry business logic.

## 1. Product mandate

Hudumika must support businesses in pharmaceutical, medical/healthcare, manufacturing, trading, mining, fintech and other industries. A tenant can operate in several industries at once, through multiple business lines, legal entities and sites across jurisdictions.

Each app must expose the relevant implemented industry capabilities, data fields, documents, workflows, reports, integrations and controls for the operation being performed. Access and visibility follow the user's administrative level, permissions and authorized organizational/data scope.

Selecting an industry does not establish that every sector-specific function or legal requirement exists. Maintain an explicit coverage register and unsupported states. “All industries” is an extensible product ambition with individually accepted industry/jurisdiction packs, not a claim of complete worldwide coverage today.

## 2. Multi-industry organizational model

`workspace/customer group → legal entities → business lines/industries → sites/departments → operational records`

Relationships may be many-to-many: one site can support multiple activities, and a product or work item can participate in several business lines. Keep a primary industry where useful for onboarding, but do not use it as the sole basis for every record's behavior.

Record the applicable entity, business line, industry/activity, site/jurisdiction and responsible owner on operational work where relevant. Use canonical references, not disconnected copies in Finance, HR, inventory and compliance.

Example: one tenant manufactures pharmaceuticals, distributes imported medical devices and operates clinics. Manufacturing production controls, trading stock/import workflows and clinical/facility administration must coexist. Employees see the authorized work relevant to their assignment; group administrators see consolidated results. Selecting “healthcare” must not erase manufacturing settings or misclassify every invoice as clinical activity.

Industry changes preserve historical records, templates and rule versions. They do not rewrite old transactions or automatically grant new user permissions.

## 3. Shared industry capability registry

Extend existing industry, entitlement, business-line and configuration mechanisms; do not create a separate private industry list in every app.

For each supported industry/sub-industry and app capability, register:

- Stable industry/capability IDs, dependencies, schema/configuration version and relevant business-line/activity scope.
- Actual implementation status: proposed, internal/pilot, accepted, unavailable or retired. An app's navigation is not implementation evidence.
- Configurable terminology, additional validated fields, document types, default views and templates.
- Domain workflows, validation/invariants, approver roles, permission keys and organizational scopes.
- Integration/provider requirements, automation triggers/actions, costs/usage quotas and failure behavior.
- ComplyOS requirement mappings by jurisdiction, with reviewed sources and effective versions.
- Reports/metric definitions, migration/backfill behavior, browser/API acceptance tests and evidence owner.

Special fields must be validated and searchable/reportable where needed. Do not put all regulated/financial logic into unrestricted JSON and call it an industry module. Keep transactional invariants in the appropriate domain service; use typed extension tables or governed attributes according to existing patterns.

UI configuration and backend capability enforcement must resolve from the same source. Workers, imports, exports, search and AI tools must use the same permission and industry rules as interactive pages.

## 4. Examples of required industry depth

These are discovery/acceptance targets, not current implementation claims or a legal checklist. Agree the supported scope of each pack before advertising it.

| Industry | Examples of specialized workflows/data | Cross-app connections |
| --- | --- | --- |
| Pharmaceutical | Product/country registration, batch/expiry traceability, controlled supplier/manufacturer evidence, production/change approvals, quality-system integration | ComplyOS, products/inventory, manufacturing, purchasing, Cloud/Sign, Finance, logistics |
| Medical/healthcare | Facility/practitioner/equipment credentials, service procurement/billing and permission-restricted sensitive records where explicitly in scope | NexusHR, ComplyOS, Finance, inventory, Cloud, Calendar; specialist clinical systems where needed |
| Manufacturing | BOM/routings, planning/material requirements, production orders, consumption/output, lots, quality holds, costing and waste | Inventory/SEAL, procurement, Finance, Projects/Tasks, NexusHR, ComplyOS |
| Trading/distribution | Multi-site stock, serial/batch/expiry, quotations/purchases/sales/returns, import/export and landed cost | CRM, POS, Finance, ClearOS, CargoTracker, SEAL, ComplyOS |
| Mining | Concession/site/asset records, operating/environmental obligations, inspection/action plans, contractors, equipment and project costs | ComplyOS, Projects, fleet, HR, Finance, documents |
| Fintech/financial services | Supported authorization scope, customer due diligence/review, transaction/reconciliation controls, risk cases and audit evidence | Ondi, ComplyOS, Finance, CRM, Cloud/Sign, supported regulated providers |
| Technology/telecom | Product/market approvals where applicable, service/project contracts, controlled assets, operating obligations and assurance evidence | ComplyOS, Projects, Finance, CRM, Onsite, support, documents |
| Construction/energy/agriculture/hospitality and others | Industry-defined operational records, cost units, inspections, certifications, assets and reporting | Accepted app-specific packs, common platform services and jurisdiction requirements |

Do not imply that a medical pack is a complete EHR, a fintech pack is a licensed banking platform, or a pharmaceutical pack replaces clinical/pharmacovigilance/eQMS systems. Implement or integrate the explicitly accepted workflows and identify exclusions.

## 5. How every app adapts

| Platform domain | Industry-adaptation contract |
| --- | --- |
| Onboarding/workspace | Multiple industries/business lines/entities/sites; explain accepted capabilities and configuration choices |
| CRM/Contacts | Industry customer/supplier/partner types, qualification requirements and structured handover to operational work |
| Finance/POS/Petti | Domain-specific billing/cost attribution, units, pricing/taxes where reviewed, approval/reconciliation rules; financial integrity remains shared |
| Inventory/SEAL/manufacturing | Appropriate traceability, serial/batch/expiry, location, production and quality states; no unsupported feature merely enabled by a menu |
| ClearOS/CargoTracker/fleet | Commodity/industry evidence, handling and permit checks with the correct holder/asset/product/jurisdiction |
| NexusHR | Role qualifications, required training/certifications, assignments, expiry and access appropriate to sensitive staff records |
| Projects/Tasks/Calendar | Industry templates, dependency/inspection/renewal tasks, ownership, scheduling and attributable time/cost |
| ComplyOS | Explain and govern applicable industry/jurisdiction obligations, permit evidence/lifecycle and operational impact |
| Cloud/Sign/Notes | Industry document types, authority/source references, review/signature/retention rules and access-controlled histories |
| Bliss/Email/SMS | Industry case/routing/templates and authorized notifications; private evidence remains permission-filtered |
| Studio/AI/Developer | Registered industry actions/events and typed contracts; permission checks, bounded automation, metering and auditable outcomes |
| HuduBI/reporting | Industry metric definitions, business-line/entity consolidation and row/field-safe drill-down |
| CMS/Store/Onsite and administration | Relevant supported industry templates/extensions/integrations, governance and lifecycle—not separate authorization behavior |

An app can mark a capability not applicable or unavailable. It must not invent a specialized business function to fill a matrix cell.

## 6. Administrative hierarchy requested by the user

### Hudumika platform superadmin — `SUPER_ADMIN`

Full authorized platform administration across tenants: tenant accounts, aggregate/per-tenant metrics, industries, app/capability availability, plans, billing/usage, integrations, support/operations and tenant-data administration through explicit operator tools.

Provide a clearly identified platform context and selected tenant scope. Cross-tenant data actions use the existing narrow audited platform path; ordinary tenant routes must not accept arbitrary tenant IDs as a bypass. Record actor, affected tenant, action, time and outcome; privileged data changes also require a reason and appropriate audit detail. Impersonation/delegated support must preserve the true platform actor.

Platform-wide visibility does not mean storing plaintext passwords/provider keys in dashboards or marking unverified financial/authority actions successful. Secret values remain protected; authorized operators can manage/rotate/revoke them through controlled flows.

### Tenant superadmin / workspace owner — existing `TENANT_ADMIN`

Full administration of their own tenant account, authorized entities/business lines/sites, users, roles, app configuration, subscribed capability settings, industry configuration, integrations, billing, records and tenant-wide metrics.

Use “Tenant Superadmin” or “Workspace Owner” as a display label if desired. Do not introduce a conflicting `SUPER_ADMIN` token for tenant owners. The existing `ADMIN` role must be mapped deliberately where legacy tenants use it; do not silently broaden or remove its access.

A tenant administrator cannot view unrelated tenants, platform operating margins or another consultant's private client records, change their subscription entitlement unilaterally, or grant platform privileges. Full administration does not remove required business evidence or allow fabricated settlement/issuance states.

### Delegated administration and operational roles

Support entity/regional/site/department/app administrators, managers, specialists, staff, auditors, customers and consultants through the existing permission system plus explicit data scope. Allow tenant owners to delegate appropriate administration without granting tenant-wide visibility automatically.

Consultants remain separate tenants with limited client mandates, as defined in `COMPLYOS_PLATFORM_ENGINE_AND_AGENT_MODEL.md`. A customer portfolio relationship alone grants no cross-tenant access.

## 7. Visibility and authorization policy

For tenant users, effective access is the intersection of:

`implemented/accepted capability + tenant entitlement + tenant configuration + applicable industry/context + user action permission + entity/site/record scope + field/document policy + active delegation where relevant`

Platform operators use a separately authorized audited platform context; no one can turn an unimplemented capability into working software through a permission grant.

Enforce read/create/update/delete, approve, submit, terminate, pay, export and administer separately where the domain requires it. Include:

- Menus, pages, tabs, action buttons and search suggestions.
- API objects and fields, download/preview links, exports and analytics.
- Websocket/event subscriptions, caches, queues, scheduled jobs, imports and AI tool access.
- Immediate permission revocation behavior and bounded cache invalidation across processes.
- Multiple-industry/role membership without leaking one assignment's data into another context.

A hidden button is not authorization. An industry selection is not a role. Subscription entitlements are not proof of record ownership. No tenant role can promote itself to platform operator.

## 8. Metrics by administrative level

| Audience | Authorized reporting |
| --- | --- |
| Platform superadmin | Global/per-tenant adoption, subscription/usage/provider economics, industry mix, application health, storage/API/job use, support costs, incidents and compliance-engine coverage |
| Tenant superadmin | Own tenant consolidated and entity/business-line/site metrics, financial/operational activity, permissions, usage/cost, staffing and compliance readiness |
| Entity/site/department administrators | Scoped metrics and records, with drill-down restricted to their organizational remit |
| Specialists/managers/staff | Assigned operational measures, actions and records; sensitive fields governed separately |
| Consultants/auditors/customers | Only explicitly delegated/client-owned measures and evidence, within the active grant |

Metrics need an owner, formula, period/currency, authoritative source, freshness and coverage state. Do not label active plan rows as confirmed paying customers or missing data as zero. Tenant and platform dashboards must reconcile to the underlying records without exposing unauthorized detail.

## 9. Existing foundations versus pending target

Source inspection found:

- `finance_industry_work` and industry-domain services/types/tests.
- Existing Finance capability/business-line migrations and expanded industry keys including manufacturing, healthcare, pharmaceutical, mining, energy, telecom, insurance and lending.
- Product `industry_key`/governed attributes and expense-to-industry-work attribution.
- Platform `SUPER_ADMIN`, tenant `TENANT_ADMIN`, role/org-permission helpers and field-policy infrastructure.

These are reusable foundations. Their presence does not establish industry completeness, a consistent platform-wide registry, multi-industry behavior in every app or complete enforcement of the requested administrator visibility. Those require route/UI/worker coverage inspection and acceptance tests. Existing permissions are partly role-based and the documented custom-permission catalogue is deliberately narrow; do not assume every existing route already checks every custom permission.

## 10. Implementation sequence and proof

1. Inventory all supported industry keys, business-line records, capabilities, roles, field policies and real enforcement paths. Produce an app × industry × workflow × role coverage matrix with evidence and gaps.
2. Establish canonical multi-industry/entity/site context and the shared capability registry by extending existing models. Preserve prior records/permissions through reviewed migrations.
3. Define platform/tenant/delegated administrative scopes and implement backend enforcement/field filtering, then matching UI and scoped analytics. Test escalation and cross-tenant denial before expanding visibility.
4. Deliver complete industry journeys in a few selected industries/jurisdictions; reuse shared apps and typed domain services. Maintain explicit unsupported states.
5. Connect ComplyOS, document intake, workflow automation, industry reporting and supported providers; add remaining industry packs incrementally.
6. Verify enterprise scale, recovery, sector assurance and operational support for the accepted scope before advertising broad coverage.

Minimum tests: a mixed pharmaceutical/manufacturing/trading tenant; different entities/sites; platform root versus tenant root; delegated manager versus ordinary staff; customer/consultant grants; conflicting role memberships; revoked access; export/search/field denial; queued actions after scope change; direct API attempts to bypass hidden controls; industry changes preserving history; actual end-to-end specialized workflows and reconciled metrics.

## Delivery boundary

This document records an explicit platform-wide requirement. It does not implement new roles, change live permissions, broaden operator access or certify any industry pack. Track completion by accepted workflows and negative security tests, not the number of industry names shown in onboarding.
