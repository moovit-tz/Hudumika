# ComplyOS — global enterprise readiness blueprint

Prepared 29 October 2026. Scope: a platform serving approximately 100 large pharmaceutical/technology corporate groups, each with international entities, offices/sites, products and delegated teams. This is a proposed target and gap assessment, not a claim of current capacity or regulatory certification.

Read with `COMPLYOS_PLATFORM_ENGINE_AND_AGENT_MODEL.md` and `audits/COMPLYOS_PERMIT_CONTROL_REVIEW_2026-10-29.md`. Current findings below refer to that dated review, not a new full technical audit.

**Platform-wide extension:** `HUDUMIKA_MULTI_INDUSTRY_AND_ACCESS_BLUEPRINT.md` defines mixed-industry tenants, industry capabilities in every app, platform-superadmin visibility and tenant/delegated administration. ComplyOS is the shared permit/requirement engine within that broader model.

## Decision

The current ComplyOS foundation needs a material expansion into enterprise regulatory operations. Increasing server size, adding company rows or importing a larger permit catalogue will not close the main gaps. Global coverage requires governed legal content, a richer entity/product model, evidence-based workflow, enterprise isolation, reliable integrations and an operational service organization.

First decide the release boundary: enterprise permit/obligation management, or a much broader pharmaceutical regulatory information management (RIM) product. Those scopes are not interchangeable. A credible initial product can centrally track operational permits and link to a customer's specialist RIM/eQMS systems rather than replacing all of them.

## 1. Corporate structure and canonical identity

Target hierarchy:

`customer group → legal entity → jurisdiction → site/office/facility → activity/asset/product → applicable requirement → permit/registration → lifecycle case/evidence`

Not every relationship is a simple tree: products can have multiple manufacturers/sites and country-specific authorizations; one permit can cover several sites or activities. Model those explicit relations rather than duplicating records.

- Stable IDs, aliases and external master-data mappings; legal holder distinct from uploader, operating site and service provider.
- Group/regional/entity/site ownership, controlled consolidation and acquisition/divestiture history.
- Effective-dated organizational changes, mergers and permit transfers with authority evidence. Workspace reassignment cannot imply a legal transfer.
- Multiple legal entities inside a customer group without treating an unrelated customer tenant as a subsidiary.
- One canonical permit/version history with references from all Hudumika apps and supported external systems.

Current gap: customer links and one tenant compliance profile do not provide this structure. The review reproduced a foreign-tenant customer reference being accepted on update; fix isolation before extending group/delegated access.

## 2. Regulatory content operations

Support explicit, reviewed jurisdiction/sector packs rather than claiming all countries by default:

- National, subnational, municipal and sector authority scope; applicability predicates for activity, product, ownership, workforce, facilities and other relevant facts.
- Legal source, instrument/version, effective interval, supersession, reviewer/approval and verification date.
- Dated fee, renewal, penalty, grace, exemption, prerequisite and document rules with explainable calculations.
- Licensed feeds or actual official sources where available, human review of changes, impact assessment and implementation tasks.
- Track which entities/products/permits are affected by a change; retain the rule snapshot used for an earlier decision.
- Explicit unsupported, stale, ambiguous and under-review states. No AI-generated rule becomes authoritative without review.

Current gap: the inspected local database contained 19 TZ obligation rules and a 284-entry catalogue without the required per-record legal version/provenance model. A scan asking for Kenya silently returned TZ results. This is not global coverage.

ServiceNow's [Policy and Compliance Management documentation](https://www.servicenow.com/docs/r/governance-risk-compliance/policy-and-compliance-management/policy-compliance.html) describes mapping authoritative sources to controls/risks and defined control owners/tests. Its [Regulatory Change Management documentation](https://www.servicenow.com/docs/r/governance-risk-compliance/regulatory-change-management-service-portal/reg-change-mgmt-landing-page.html) describes assessing upcoming changes and implementing responses. These illustrate capabilities to evaluate, not a claim that ComplyOS has them.

## 3. Sector modules: pharmaceutical versus technology

### Pharmaceutical target, if included in the accepted scope

- Country-specific product registrations/marketing authorizations and their holder, validity, conditions and commitments.
- Structured products, substances where relevant, dosage forms, strengths, packaging, manufacturing sites and country variants.
- Registration/renewal/variation/change-event relationships and global-to-local impact assessment.
- Authority correspondence, requests/questions, submission history, due commitments and verifiable outcomes.
- Dossier/evidence versioning and integration with the customer's approved submission, quality and document systems.
- Explicit interfaces for product/manufacturing/label changes; route relevant impact to responsible regulatory teams.
- Map applicable terminology/identifiers where required; do not claim worldwide standard conformance from generic product IDs.

Veeva's [RIM Registrations overview](https://regulatory.veevavault.help/en/gr/30692/) describes product/registration data, authority interactions, manufacturing/label changes and detailed packaging/dosage information. EMA's [SPOR overview](https://www.ema.europa.eu/en/human-regulatory-overview/research-development/data-medicines-iso-idmp-standards-overview/substance-product-organisation-referential-spor-master-data) explains substance/product/organisation/referential master data. These show why a PDF-plus-expiry model is insufficient for this broader use case.

Do not silently expand this into clinical trials, pharmacovigilance, batch release or a complete eQMS. Select supported workflows; integrate with specialist systems for the others.

### Technology target, based on each customer's activities

- Corporate, facility and operating permissions alongside applicable product conformity/type approvals and market-entry requirements.
- Telecom/radio, import/export or other sector permissions only where relevant and supported by reviewed rules.
- Country/product/site-specific obligations, attestations, assurance evidence and contractual commitments where included in scope.
- Distinguish government licences, private certifications, internal controls, contractual obligations and software subscriptions; they do not share one legal lifecycle.

These categories are a discovery checklist, not a claim every technology company needs every permission.

## 4. Enterprise workflow and assurance

- Configurable, versioned lifecycle definitions: preparation, approval, submission, receipt, review, inspection, payment, decision, appeal and verified issuance/suspension/termination.
- Segregation of duties; local/regional/global approval thresholds; substitutes/delegates, absence and escalation rules.
- Idempotent renewal cycles, durable timers/outbox delivery, deadline calendars, retry/dead-letter recovery and uncertain provider outcomes.
- Human evidence-backed manual steps where authority APIs are absent. No internal reference may imply authority acknowledgement.
- Exceptions, remediation plans, risk acceptance, attestations and control testing with accountable owners.
- Immutable or tamper-evident history appropriate to the intended use, corrections with reasons, evidence versions and audit exports.

Current gap: unchanged expiry input marked an unapproved renewal issued; reminders mark sent before delivery; automatic renewal currently stops at review. These defects are enterprise release blockers.

For FDA-regulated electronic records/signatures, assess the actual intended use and applicable predicate rules. The [FDA Part 11 scope guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/part-11-electronic-records-electronic-signatures-scope-and-application) makes that scope determination material. A signature widget or audit table alone does not establish compliance. Supply a documented validation/assurance package proportionate to use: requirements, risk assessment, traceability, executed tests, approved changes, release evidence and operating procedures, with qualified customer/legal/quality review.

## 5. Security and isolation

- Validate/extend the existing identity foundation for enterprise SSO, lifecycle provisioning/deprovisioning, MFA policies, session/revocation and emergency access; do not assume existing SSO code is already accepted for every corporate IdP.
- RBAC plus relevant attributes: customer group, entity, country/site, matter, product and assigned responsibility. Apply the boundary to search, analytics, exports, jobs and attachment download.
- Time-limited consultant mandates, client segregation, privileged/legally sensitive material restrictions and prompt access revocation.
- Service identities, scoped integration permissions, managed secret rotation, encryption/key operations and auditable administrative access.
- Independent security testing and remediation; tenant isolation and record sharing must be demonstrable under adversarial tests.
- No noisy-neighbour access or resource exhaustion; per-tenant quotas and isolated expensive jobs.

Groups, consultant portfolios and unrelated clients are distinct access models. Use controlled owner-scoped grants, not general cross-tenant database bypass. [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) provides a relevant zero-trust architecture reference; it is not a product certification.

## 6. International data and deployment controls

- Region placement, contractual processing locations, controlled support access and an approved cross-border data-flow map.
- Retention schedules, legal holds, deletion/export procedures and evidence custody defined by record type and applicable obligations.
- Regional failure handling that respects data-placement constraints rather than copying every dossier worldwide.
- Locales, Unicode/search, legal calendars/timezones and preserved source-language documents. Translation must retain provenance and review status.
- Authoritative local-currency amounts and FX assumptions; consolidate forecasts without replacing authority-assessed amounts.

These require scoped jurisdiction/customer review. Hosting a VPS in a chosen country alone does not prove compliance with all customer data obligations.

## 7. Integration ecosystem and migration

- Complete the cross-Hudumika intake/check/event contract and a per-app coverage register, including old uploads, imports and jobs.
- Enterprise ERP, master-data, identity, document, quality, regulatory and ticketing systems need tested supported connectors or a documented API/event contract.
- Schema/version compatibility, idempotency, durable delivery, quotas, reconciliation, conflict handling and operator-visible failures.
- Bulk data migration with mapping, validation, duplicate reconciliation, dry runs, counts/control totals and signed acceptance.
- Provider/authority integration requires an actual supported contract and credentials. No promise of universal automatic government renewal.

Offer integration alongside an incumbent RIM or enterprise platform when appropriate; do not require the customer to replace its whole validated estate to use ComplyOS.

## 8. Resilience and scale

A single Contabo VPS can support a pilot but does not demonstrate the high availability/disaster recovery required by the proposed global service. Choose infrastructure from the accepted workload, recovery and placement requirements, not from a particular vendor or a demand to add Kubernetes.

Required engineering includes bounded queries, database indexes/partition strategy as measured, object storage, durable queues, per-tenant work limits, scalable search, background bulk exports and independently recoverable workers. Use the existing modular architecture where it works; split services only when ownership/isolation/scaling requirements justify it.

**Illustrative initial benchmark, not actual customers or supported capacity:**

| Dimension | Proposed test fixture |
| --- | ---: |
| Separate customer groups | 100 |
| Legal entities total | 5,000 |
| Sites/offices total | 100,000 |
| Permit instances total | 2,000,000 |
| History events | 20,000,000 |

Replace these assumptions with design-partner workload data, including product-country registration volumes and document bytes. Agree concurrent users/jobs, peak imports/expiry cycles, p95/p99 budgets, freshness, recovery time/data-loss objectives and retention before claiming readiness. Test cold/warm paths, tenant skew, provider outages, burst reminders, long exports, regional latency, failover and sustained memory growth.

Use actual recovery drills: database plus files plus keys/configuration, reconciliation after partial restore and the ability to prove deadline processing caught up. A short API load test is not this evidence.

## 9. Customer-facing control surfaces

- Global dashboard with country/entity/product drill-down and explicit data-coverage confidence.
- Prioritized work queue: operating risk, due dates, prerequisites, assigned owner, budget and blocked action.
- Auditable multi-currency renewal forecast, assessment/payment reconciliation and upcoming commitments.
- Regulatory change impact view, exception/remediation board and inspection/audit evidence pack.
- Consultant portfolio/engagement views exposing only authorized client records/history.
- Search/bulk operations suitable for large estates, accessible keyboard/mobile use and no misleading “100% compliant” summaries from incomplete records.

## 10. Enterprise procurement and service organization

Enterprise readiness includes more than features:

- Defined service/support commitments, severity handling, escalation/on-call and accountable incident communications.
- Security/privacy questionnaire evidence, supplier assurance, independent assessments and relevant certifications/reports only when actually obtained.
- Contracted scope, data ownership/portability, termination/export and continuity arrangements; measured operational objectives.
- Controlled SDLC, change/release documentation, customer testing environments, compatibility policy and upgrade/rollback acceptance.
- Training, migration specialists, customer success and jurisdiction-content owners. Engineering cannot substitute for legal-content maintenance.

Marketplace launch is a later dependency, not a substitute for a dependable engine or an enterprise support service.

## Delivery sequence and exit evidence

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| 1 — trustworthy core | Fix observed integrity/isolation/notification defects; canonical permit state/history | Negative tests, concurrency/recovery evidence and truthful UI |
| 2 — multinational pilot | Corporate hierarchy, scoped permissions, limited reviewed jurisdiction packs and launch/renewal plans | Complete journeys across multiple entities/sites/jurisdictions, owner acceptance |
| 3 — sector depth | Selected pharmaceutical or technology workflows and genuine integrations | Specialist review, migration/contract tests, assurance evidence for intended use |
| 4 — enterprise operations | Placement, availability, bulk processing, monitoring, recovery and support | Stated workload/SLO and failover/restore/soak results; security procurement evidence |
| 5 — controlled expansion | Additional jurisdictions, providers, consultants and marketplace capabilities | Coverage/quality metrics, reproducible onboarding and customer acceptance |

Select a few design partners and a bounded set of jurisdictions and workflows before targeting 100 global corporations. Grow the content, integration and operating model from measured use. Do not promise complete worldwide legal coverage, automatic authority decisions or Fortune-500 readiness without release-specific evidence.
