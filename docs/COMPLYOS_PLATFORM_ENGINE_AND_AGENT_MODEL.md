# ComplyOS — platform permit engine, consultant workspaces and marketplace

Requirements extension recorded 29 October 2026. Read with `docs/audits/COMPLYOS_PERMIT_CONTROL_REVIEW_2026-10-29.md`. This document defines the requested target; it does not claim these capabilities are implemented.

## Product mandate

ComplyOS is Hudumika's canonical permit, licence and certification lifecycle engine. Every app should be able to submit authorized candidate evidence, request checks, link an existing permit and initiate a controlled lifecycle action. Consultant businesses can operate their own tenant workspaces to manage client portfolios. A later marketplace connects clients to verified providers for scoped renewal/compliance engagements.

The engine manages applicability, evidence, validity, reminders, renewals, suspension/revocation/termination history and operational impact. It must distinguish a client's cancellation request from an authority's confirmed revocation, and an ended consultant engagement from a terminated permit.

“Every app” is a platform integration contract, not a claim that all existing uploads/providers already implement it. The certificate register and integrity defects in the review must be hardened first.

## 1. Capture permits from any Hudumika app

### Required user journey

1. A user uploads, imports, attaches or receives a document in a supported workflow—such as HR, fleet, warehouse, clearance, product, company registration, project, email, support or Cloud.
2. The source transaction emits a durable document/evidence-candidate event containing a source reference and authorized scope. The original record remains usable if classification is delayed or fails.
3. Existing upload authorization/scanning runs before extraction. The engine checks document type using structured metadata and optional extraction. Document contents are untrusted data, never instructions for the agent or workflow engine.
4. A candidate record displays extracted permit number/type, holder, issuer, jurisdiction, issue/expiry dates, document provenance and confidence. Unreadable/unknown fields remain unknown; a missing expiry is not perpetual validity.
5. The user is offered **Add to ComplyOS**, **Link existing permit**, **Add renewed version**, **Not a permit**, or **Needs review**. Authorized configurable auto-registration can create a pending-verification record; it must not imply official validation or broaden access.
6. Confirmation records the appropriate holder/entity/site/asset/product, owner, jurisdiction and tracking policy. It creates or links one canonical permit and returns its reference to the originating app.
7. The source app displays a live authorized status, next action and link back to ComplyOS. Renewed evidence updates the same permit's history rather than silently creating an unrelated licence.

Do not treat every uploaded certificate as a business permit. Professional qualifications, inspection reports, insurance, product approvals and training certificates have different verification and lifecycle rules.

### Capture and duplicate rules

- Candidate state: detected → needs review → linked/registered/rejected/failed. Keep this separate from the legal validity state.
- Retain tenant, source app/entity/attachment/version, uploader, ingestion time, document hash, extraction/version, holder/issuer claims, confidence and review decision.
- Deduplicate first by source event/attachment/version, then suggest matches using authorized holder, issuer, jurisdiction, normalized number and permit type. A file hash alone is insufficient.
- New validity periods or replacement documents usually become versions/renewal outcomes of an existing permit; do not merge unrelated holders sharing similar numbers.
- Backfill existing records through bounded, resumable, tenant-scoped scans with dry-run reports and review queues. Never run a global import that silently exposes sensitive HR/client attachments.
- Source deletion/retention changes follow explicit evidence policy; retain tombstone/audit references where required without bypassing authorized erasure or retaining arbitrary copies forever.
- OCR/provider spending follows configured consent, credentials, budget and metering. Classification must not trigger unapproved paid calls.

## 2. Shared permit engine contract

Extend the existing ComplyOS services/routes/events. Concrete endpoint and event names must be chosen after inspecting repository conventions; the operations below are proposed capabilities, not existing APIs.

| Operation | Expected behavior |
| --- | --- |
| Discover/register candidate | Idempotently ingest authorized evidence; return candidate ID and review state |
| Link permit | Validate tenant/holder/source ownership and create a traceable source link |
| Check requirement/permit | Return validity, applicability, evidence assurance, scope, as-of time, rules version and reasons; allow unknown/not-assessed |
| Plan/prepare renewal | Create one renewal cycle with prerequisites, owner, deadline, rate/rule snapshot and budget consent |
| Submit/track renewal | Execute an actual supported channel or create an explicit manual handoff; retain receipts and uncertain outcomes |
| Confirm outcome | Verify issuer artefact/result and authorize a versioned state transition |
| Request termination/surrender | Check authority/process/permissions; collect required evidence and distinguish requested from confirmed |
| Record suspension/revocation | Record issuer decision, effective date, reason, source and resulting operational restrictions |
| Read history | Permission-filtered ordered history of versions, applications, renewals, decisions, payments, inspections and delegated work |
| Explain readiness | Derive outstanding requirements and business impact for a defined operation, not a global unqualified “compliant” badge |

A check response must distinguish **valid**, **expiring**, **expired**, **suspended/revoked**, **not applicable**, **missing**, **pending verification** and **unknown**. It must also state whether it is a local-record check, a reviewer verification or an authority-confirmed result. An OCR extraction is not an issuer verification.

### Event delivery and operational checks

- Reuse durable domain-event/outbox infrastructure; one source transaction identity and an idempotent consumer identity per candidate/action.
- Publish minimal authorized references and state changes. Do not broadcast private documents or an entire permit dossier to every app.
- Consumers recheck permission/entitlement, use explicit tenant context, handle out-of-order delivery and reconcile after outages. Avoid event echo loops between upload and registration.
- Canonical state includes a version; consumers use version-aware updates and reconcile stale caches. Define a maximum acceptable freshness for each operational check.
- Blocking decisions require an explicit business/jurisdiction policy. When status is stale/unknown or the engine is unavailable, apply a named fail-closed, review-required or allowed-with-warning policy for that operation—never quietly default everything to valid.
- Separate legal revocation, local record correction, app unlinking, internal archive and engagement cancellation. None is a synonym for the others.

## 3. Canonical ownership and history

A permit has a legal holder and an owning data workspace. The source attachment, client CRM record, consultant engagement and marketplace listing are separate linked records. App location or document uploader alone does not establish legal ownership.

History should include original intake/source, reviewed fields, legal/rate versions, supporting-document versions, validity periods, reminders/delivery/acknowledgements, approvals, submissions, authority receipts/decisions, inspections, payments/refunds, corrections, disputes and delegation changes. Record who acted, on whose behalf, when and under which permission.

Corrections retain before/after evidence and reason. A replacement document cannot overwrite the old artefact without history. Financial postings remain governed by Finance. Changing custody between workspaces does not change the legal holder; any transfer requires a separately authorized, audited process.

## 4. Legal/compliance consultants as real tenants

### Consultant workspace

A consultant/agency subscribes as its own tenant and uses normal Hudumika CRM, Tasks, Calendar, Cloud, messaging and Finance capabilities where entitled. ComplyOS adds client portfolios, permit due queues, assignments/delegates, jurisdiction/industry coverage, engagement tracking and renewal workload views.

Support two clearly different client cases:

1. **Client already has a Hudumika workspace.** The client retains the canonical permit and grants scoped access to the consultant tenant.
2. **Client is managed externally.** The consultant records a segregated client/holder portfolio under an approved representation/data-handling basis. It is not an impersonated customer tenant. A later customer onboarding/linking process must reconcile duplicates and authorize custody/access explicitly.

Within a consultant tenant, staff assignment and client segregation still apply. An employee assigned to one client must not automatically receive all other clients' records. A client portal exposes only that client's permitted evidence/actions.

### Delegation/grant model

Each grant identifies owner workspace/client, consultant workspace, allowed permit IDs or explicit entity scope, actions, document/history scope, purpose/engagement, authorized staff, valid-from/expiry, approval authority and revocation state.

Actions are separable: view, propose correction, upload evidence, prepare, submit on behalf, request spending approval, approve spending, confirm verified outcome and request termination. The consultant must not approve their own client's spending or grant themselves broader access merely because they accepted a gig.

- Require affirmative client authorization, or a verified representation basis for externally managed clients; no silent discovery of other tenants' permits.
- Enforce grants on every request, document download/export, worker action and callback continuation—not only navigation.
- Preserve explicit tenant predicates and RLS. Use a narrow reviewed delegation access path that validates the grant and operates in the owner's authorized context; do not give consultant APIs general `dbPlatform` access.
- Expiry/revocation removes future access and handles queued/running actions explicitly. Do not let a cached role/token continue an expired mandate.
- Multiple agents may collaborate only through non-conflicting scopes. A single renewal-cycle identity prevents duplicate renewals/payments across apps and consultant workspaces.
- History is permission-filtered. Appointing a new agent does not automatically expose earlier privileged advice, internal communications, unrelated payments or other agents' client data. Preserve the appropriate owner-visible audit history.
- Ending access does not erase the permit or its legitimate audit trail; retention, export and legal-hold rules determine evidence handling.

## 5. Later marketplace

Implement after the engine and delegation model pass acceptance. The current global firm directory is not equivalent to real provider tenants or a verified marketplace.

### Client journey

Permit/renewal need → select a scoped dossier → discover eligible consultants → request quotations → compare scope, professional fees, authority fees, timeline and deliverables → accept terms/mandate → assign staff and deadlines → track work and evidence → verify outcome → settle under the agreed payment process → close/rate/dispute.

Listing or quoting must not expose the permit dossier automatically. Send a redacted brief; grant selected access only when authorized. A provider's service area or rating does not itself prove legal authority to represent a client in that jurisdiction.

### Provider journey

Real tenant onboarding → listing and jurisdiction/service scope → reviewed identity/professional credentials where required → enquiries/quotes → authorized engagements → client-specific tasks/history → submissions/evidence → invoices/payment tracking → completion/disputes.

### Marketplace integrity

- Replace/clearly segregate illustrative firms, ratings, reviews, prices and verification flags before public release. Source inspection found seeded illustrative directory data; do not advertise it as verified provider evidence.
- Bind listings to actual provider tenants/organizations and accountable verification records. “Verified” needs a stated check and expiry/review process.
- Separate authority fees, professional services, platform commissions and variable provider charges in quotations, invoices and reporting.
- Milestone labels such as paid/released are not proof of real settlement. Use actual configured payment/Finance integration; do not claim escrow or protected payouts without an approved supported arrangement.
- Support acceptance criteria, cancellation, reassignment, deadlines, refund/dispute policy and handover. Neither paid invoices nor a consultant completion click establishes legal permit issuance.
- Share history needed for the engagement through explicit grants. Keep a traceable record of actions taken on the client's behalf.

## 6. Current foundations and gaps

Observed in the October 29 review:

- Existing certificates/applications/obligations/engagements can link to tenant CRM customers.
- Fleet documents can reference a canonical ComplyOS certificate; the existing revoked-permit dispatch test passed.
- Existing ComplyOS provides a vault, catalogue, rules, renewal-review queue and reminder jobs; see the review for integrity defects and limits.
- `comply_legal_firms` is a global directory, not a provider-tenant relationship model. `comply_legal_engagements` links a workspace to a firm/application/customer; milestones/messages exist. This does not establish consent-based cross-tenant consulting or provider access.
- Migration 096 explicitly describes status-tracked milestones without real payment processing and illustrative directory seeds pending real sourcing.
- Universal intake/classification/linking, historical backfill, cross-app check contracts, scoped mandates, provider tenants and marketplace outcome/settlement acceptance remain proposed work unless independently verified later.

## 7. Delivery order

1. Fix the reproduced integrity/security/state issues in the permit-control review and establish canonical permit/evidence/history rules.
2. Define the intake/check/lifecycle contract and build one end-to-end app integration using existing durable infrastructure. Prove retry, permission and duplicate behavior before scaling to all apps.
3. Inventory every app's permit/document intake and current copied status fields; implement adapters and bounded backfill one app at a time, with a visible coverage matrix.
4. Add consultant tenancy/client portfolios and explicit delegation, with negative cross-tenant/access-revocation tests.
5. Add engagement execution, client/provider work queues, source-evidence history and handover.
6. Enable marketplace discovery/quotes only after real provider verification; then introduce supported commercial settlement, disputes and operating controls.

## 8. Acceptance scenarios

- The same permit attached in Fleet, Cloud and a clearance case becomes one canonical permit with three authorized source links; legitimate renewed versions preserve history.
- An unrelated HR qualification or unreadable upload is not automatically certified as an operating licence; sensitive attachments do not become globally visible.
- Out-of-order events, retries, interrupted backfill and duplicate imports do not duplicate permits, renewals or charges.
- Source apps receive a reasoned/versioned check result with explicit unknown/stale states and the correct holder/site/jurisdiction scope.
- Revocation/suspension/expiry updates affected apps according to their approved policy; archiving or ending an engagement does not revoke the legal permit.
- Consultant A cannot read Client B, infer another tenant's records from a permit number, approve ungranted spending or export restricted history.
- A client can revoke/expire a grant, reassign an engagement and keep its canonical permit/history. Queued jobs revalidate grants before side effects.
- Two consultants working the same renewal cannot submit/pay twice. Authority receipts and verified artefacts determine outcomes, not consultant assertions.
- Quotes distinguish government fees from professional/platform costs. Milestones reflect actual settlement evidence where payment integration exists.
- Fake directory entries and unverified professional claims cannot appear as verified marketplace listings.

## Completion measure

Maintain a per-app coverage register: source intake paths → candidate capture → reviewed registration/linking → live check → renewal/history propagation → operational restriction → retry/security tests. “Integrated with every app” is accepted only after all in-scope paths have evidence, including imports, background jobs and older document screens.
