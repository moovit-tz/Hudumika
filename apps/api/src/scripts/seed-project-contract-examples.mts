import { randomUUID } from 'node:crypto';
import { withTenant, dbPlatform, db } from '../db/client.js';
import { getNextDocNumber } from '../lib/doc-numbering.js';

const commonTerms = `
GENERAL TERMS
1. Status and formation. This is a fictional, unsigned training draft. It creates no commitment, authority to start work, purchase obligation or payment entitlement. For operational use, replace the example parties, verify their legal identities and authority, review all schedules and obtain both authorised signatures. The effective date is the last signature date; the stated programme is an example baseline only.
2. Administration. Each party appoints a project manager and a commercial representative before commencement. A weekly progress meeting records decisions, actions, risks, milestones and costs. Only the commercial representatives may approve a variation in writing. A project-app task, message, verbal instruction or draft approval is not a signed contract amendment.
3. Client dependencies. The client supplies agreed site or system access, accurate reference information and timely decisions. The provider identifies missing inputs promptly, records their effect and proposes mitigation. Dates change only through an agreed written variation; neither party silently absorbs an unapproved scope expansion.
4. Change control. Every proposal states the original baseline, requested change, reason, deliverables, price, tax treatment, schedule, dependencies and revised acceptance tests. Work on the change starts only after both authorised representatives sign. Safety-critical work may be paused pending a decision. Unchanged obligations continue where practicable.
5. Invoicing. An invoice identifies the contract reference, accepted milestone, supporting evidence, currency and applicable tax treatment. The client raises a reasoned dispute within ten business days and pays undisputed amounts within thirty calendar days of a valid invoice. The parties reconcile disputed amounts promptly. Example prices exclude taxes; actual taxes, withholding and invoice requirements must be confirmed before signature. No tax rate is assumed here.
6. Confidentiality. Each party protects non-public commercial, technical and personal information with reasonable safeguards, restricts access to personnel who need it and uses it only for this engagement. Exceptions cover information already public, independently developed or lawfully obtained without restriction. Legally compelled disclosure is limited to what is required, with prior notice where permitted. These obligations continue for three years after termination; trade secrets remain protected while confidential.
7. Personal information and security. Use only the minimum necessary data, approved systems and named access rights. No production personal data is needed for these examples. Before operational processing, agree the parties' responsibilities, approved locations, retention and incident procedures in a separate data schedule. Notify the other party of a suspected material security incident without undue delay, preserve evidence, contain it and cooperate in remediation.
8. Personnel and subcontracting. The provider supplies competent personnel, supervises its work and remains responsible for approved subcontractors. Material subcontracting needs prior written consent. Neither party promises employment to the other's personnel. Safety, safeguarding and access requirements apply to everyone performing the work.
9. Intellectual property. Each party retains pre-existing methods, tools, templates and know-how. On payment of the relevant undisputed milestone, the client owns specifically commissioned final deliverables identified in the scope. The provider grants a perpetual non-exclusive licence to embedded background materials needed to use those deliverables. Third-party materials remain subject to disclosed licences. The provider must identify licence restrictions before acceptance.
10. Quality and remedies. The provider corrects failures to meet the agreed acceptance criteria at its cost within the remedy period in the specific schedule. The client supplies evidence of the failure and reasonable access. New requirements, client alterations and misuse are handled separately. Acceptance does not waive an expressly agreed warranty for latent defects.
11. Insurance and responsibility. Before signature, record required cover, limits, evidence and renewal dates in the insurance schedule; none is represented as already in force. Each party is responsible for loss caused by its breach or negligence. The example aggregate liability cap is the contract fee; exclude fraud, deliberate misconduct and liabilities that cannot lawfully be limited. The parties must have the cap and exclusions reviewed for their actual transaction. Neither party claims indirect business losses except where expressly agreed and legally recoverable.
12. Suspension and termination. Either party gives written notice describing a material breach and allows twenty business days to remedy it unless urgent protection is needed. Unremedied material breach permits termination. The client may terminate for convenience on thirty calendar days' notice, paying for accepted work and evidenced unavoidable commitments previously authorised, without anticipated profit on unperformed work. The provider promptly hands over paid deliverables, returns access credentials and supports an agreed transition.
13. Events beyond reasonable control. The affected party promptly notifies the other, provides evidence, mitigates and updates the expected impact. Payment for work already accepted remains due. If the event prevents material performance for sixty consecutive days, either party may terminate by written notice and settle accepted work and agreed commitments.
14. Disputes and notices. Project managers first attempt resolution within ten business days, followed by commercial representatives for another ten. Before signature, the parties must complete the governing-law, court or arbitration, seat and rules fields in the execution schedule; these examples do not assert jurisdiction or legal enforceability. Notices use the verified addresses recorded in that schedule, with acknowledgement or proof of receipt. Operational messages do not replace formal notices.
15. Entire agreement and priority. The signed agreement and signed schedules form the entire engagement. Mandatory law prevails; then signed amendments, these specific commercial schedules, the general terms and the approved technical attachments. An invalid term is reviewed without invalidating the remaining agreement where permitted. Assignment requires written consent except as expressly agreed. No waiver arises merely from delay.
16. Execution schedule. Client legal name/address/registration: NOT VERIFIED — fictional example. Provider legal name/address/registration: NOT VERIFIED — fictional example. Governing law and dispute forum: TO BE AGREED BEFORE SIGNATURE. Notice addresses and authorised representatives: TO BE VERIFIED. Insurance limits and data-processing schedule: TO BE COMPLETED BEFORE SIGNATURE. Client signature/name/title/date: UNSIGNED. Provider signature/name/title/date: UNSIGNED.
`;

export const contractExamples = [
  {
    industry: 'construction', project: '[Sample] Community Health Centre Construction', customer: '[Example] Community Health Facilities Client',
    subject: '[Example Draft] Community Health Centre — Design and Construction Agreement', value: 850000000,
    type: 'Design and Construction',
    specific: `EXAMPLE DRAFT — DESIGN AND CONSTRUCTION AGREEMENT
Client: Community Health Facilities Client (fictional).
Provider: Example Civil Works Contractor (fictional).
Project: Community Health Centre Construction, Dodoma, Tanzania.
Example programme: 2 November 2026 to 30 June 2027. Defects period: twelve months from documented practical completion. Example lump sum: TZS 850,000,000 excluding taxes, subject to signed scope and quantities.

SCHEDULE A — SCOPE AND DELIVERABLES
A1. Carry out site survey, geotechnical review, coordinated architectural/structural/utilities design and a priced bill of quantities. Obtain the client's written design acceptance; identify required permits and the responsible applicant before mobilisation.
A2. Construct the agreed single-storey clinic shell, foundations, roof, internal partitions and finishes; install electrical, plumbing, drainage and water-storage systems to the approved drawings and specifications. Provide accessibility routes and fire-safety provisions specified by the approved design.
A3. Test and commission all installed systems; deliver as-built drawings, equipment manuals, test certificates, warranties, asset register, maintenance schedule and staff orientation. Record outstanding minor items in a dated snag list.
A4. Exclusions: land purchase, medical equipment, clinical licensing, off-site road works, utility-provider connection charges and operating staff. Site dimensions, room schedule, equipment capacities and quantities are confirmed in the signed design/BOQ attachment; the example contains no inferred quantities.

SCHEDULE B — PROGRAMME, ACCEPTANCE AND PAYMENTS
B1. Survey, design and approved BOQ by 18 December 2026: TZS 170,000,000 (20%). Evidence: coordinated drawings, survey report, permit responsibility register and signed design review.
B2. Structure and utilities by 30 April 2027: TZS 552,500,000 (65%). Evidence: independent inspection records, material tests, concealed-work approvals and measured progress certified by the named client representative.
B3. Commissioning and handover by 30 June 2027: TZS 127,500,000 (15%). Evidence: commissioning results, handover pack, training record and practical-completion certificate. Total milestones equal TZS 850,000,000.
B4. Retain 5% from each certified payment, totalling TZS 42,500,000. Release half at practical completion and half after the twelve-month defects period and closure of notified defects. Retention is withheld from the milestone sums, not an additional fee.
B5. The client inspects each submitted milestone within ten business days and either accepts in writing or issues a specific nonconformity list. No automatic acceptance by silence. Critical safety, structural or commissioning failures prevent practical completion. Minor snag items require a dated closure plan.

SCHEDULE C — SITE CONTROLS AND DEFECTS
C1. Submit a site safety plan, induction and incident-reporting process before mobilisation. Maintain daily site records, safe access, waste controls and material traceability. Stop unsafe work immediately and inform the client. Client access does not transfer construction supervision to the client.
C2. Client provides lawful site access, a named site representative and verified boundary information. Unexpected ground conditions are recorded and reviewed through change control before affected works continue.
C3. Notify delay risks within five business days of discovery with impact and mitigation. Extensions require evidenced entitlement and written agreement. No liquidated damages are imposed in this example; any such rate/cap must be expressly negotiated.
C4. Remedy critical defects immediately, other notified defects within twenty business days or an agreed technically justified plan. The twelve-month defects period does not represent statutory protection or replace mandatory rights. Insurance schedule must address construction works, public liability and professional design exposure before signature.
`,
  },
  {
    industry: 'it_software', project: '[Sample] Customer Portal Delivery', customer: '[Example] Customer Portal Client',
    subject: '[Example Draft] Customer Portal — Software Delivery and Support Agreement', value: 160000000,
    type: 'Software Delivery',
    specific: `EXAMPLE DRAFT — SOFTWARE DELIVERY AND SUPPORT AGREEMENT
Client: Customer Portal Client (fictional).
Provider: Example Software Delivery Company (fictional).
Project: Customer Portal Delivery, Dar es Salaam, Tanzania.
Example delivery programme: 2 November 2026 to 30 June 2027. Included stabilisation: ninety calendar days after accepted rollout. Example fixed fee: TZS 160,000,000 excluding taxes.

SCHEDULE A — SCOPE AND DELIVERABLES
A1. Conduct user interviews and document prioritised journeys, accessibility requirements, role permissions, data flows, architecture, acceptance tests and a release plan. Establish an approved backlog before build.
A2. Deliver a responsive portal with sign-in, role-based access, profile management, service-request submission, status tracking and an administrator queue. Only verified, documented existing APIs are in scope. Specify interface ownership, error handling and test fixtures in the signed interface schedule.
A3. Provide source repository, build/deployment instructions, configuration inventory, dependency/licence inventory, automated test results, security-review findings, user/admin guides, backup/restore runbook and training. Deploy to client-approved environments and perform a monitored rollout with rollback criteria.
A4. Exclusions: payment processing, government integrations, native mobile applications, unconfirmed third-party APIs, historical data cleansing and recurring hosting/licence fees. Adding any requires a signed variation. No integration is represented as already available.

SCHEDULE B — MILESTONES AND ACCEPTANCE
B1. Approved research, requirements and architecture by 18 December 2026: TZS 32,000,000 (20%). Evidence: approved backlog, role matrix, interface schedule and test plan.
B2. Feature-complete test deployment by 30 April 2027: TZS 104,000,000 (65%). Evidence: demonstrated agreed journeys, passing agreed functional tests, access-control tests and dependency inventory.
B3. User acceptance and monitored rollout by 30 June 2027: TZS 24,000,000 (15%). Evidence: signed UAT record, resolved critical/high security findings, completed training and verified backup/restore and rollback exercise. Total milestones equal TZS 160,000,000.
B4. Client reviews within ten business days. Rejections identify reproducible deviations from agreed tests. Provider remedies and resubmits within ten business days or an agreed plan. Acceptance is explicit, never inferred from silence or payment alone. No go-live while critical defects or unresolved high security risks remain without documented client acceptance of the particular risk.

SCHEDULE C — SUPPORT, SECURITY AND HANDOVER
C1. Ninety-day stabilisation covers defects against the accepted scope; new features and third-party service outages are excluded. Support hours: Monday–Friday, 09:00–17:00 Africa/Dar_es_Salaam, excluding agreed holidays. Record an actual support contact before signature.
C2. During support hours, acknowledge Severity 1 (service unusable or critical security exposure) within two hours, Severity 2 (major workflow blocked) within four hours and Severity 3 (minor issue) within one business day. Provide a Severity 1 workaround target of one business day. These are response/workaround targets, not a guaranteed resolution or hosting-availability promise; after-hours cover needs a separate agreement.
C3. Use least-privilege access, encrypted transport, approved secret storage and audit logging for privileged actions. Do not commit credentials or copy production personal data into development. Notify suspected material incidents under the general terms. Client owns production account access and approves deployment windows.
C4. Transfer commissioned source on payment of the relevant accepted milestone; disclose open-source and proprietary components and their licences. Provider background tools remain provider-owned with the usage licence in the general terms. Deliver all administrative access and revoke provider access at handover unless continued support is separately approved.
`,
  },
  {
    industry: 'professional_services', project: '[Sample] Finance Process Advisory Engagement', customer: '[Example] Finance Advisory Client',
    subject: '[Example Draft] Finance Process — Advisory Services Agreement', value: 75000000,
    type: 'Professional Services',
    specific: `EXAMPLE DRAFT — PROFESSIONAL ADVISORY SERVICES AGREEMENT
Client: Finance Advisory Client (fictional).
Provider: Example Process Advisory Firm (fictional).
Project: Finance Process Advisory Engagement, Dar es Salaam, Tanzania.
Example programme: 2 November 2026 to 30 June 2027. Example fixed fee: TZS 75,000,000 excluding taxes. This is process advisory work, not an audit opinion, tax filing, legal advice or assurance engagement.

SCHEDULE A — SERVICES AND OUTPUTS
A1. Interview process owners and review client-provided samples covering invoicing, collections, purchasing, expense approval and monthly management reporting. Produce an as-is process map, responsibility matrix and prioritised control-gap report identifying evidence limitations.
A2. Design future-state workflows, approval matrices, reconciliations, close checklist and management-reporting templates. Run two facilitated design workshops and document client decisions. Provide implementation recommendations with owners, effort estimates and dependencies.
A3. Deliver four training sessions of up to three hours each, attendance records, editable templates, a final action register and an engagement close-out report. Facilitate one management handover workshop and record unresolved items.
A4. Exclusions: statutory audit, forensic investigation, regulatory certification, tax computation/returns, bookkeeping execution, software implementation and assurance that fraud or every control weakness will be detected. Recommendations depend on the completeness of records and stakeholder availability.

SCHEDULE B — FEES, PROGRAMME AND ACCEPTANCE
B1. Assessment and control-gap report by 18 December 2026: TZS 15,000,000 (20%). Evidence: interview register, process maps, sampled-record index and documented limitations.
B2. Redesigned workflows and reporting templates by 30 April 2027: TZS 48,750,000 (65%). Evidence: workshop records, versioned procedures, approval matrix and management feedback dispositions.
B3. Training and close-out by 30 June 2027: TZS 11,250,000 (15%). Evidence: training pack/attendance, editable final files, action register and handover record. Total milestones equal TZS 75,000,000.
B4. Each milestone includes one consolidated client review and one revision addressing deviations from the approved scope. Client reviews within ten business days; provider responds within ten business days. Additional review cycles for changed requirements require a variation. Acceptance is written and relates to deliverable completeness, not a guarantee of future financial performance.
B5. Fees include the stated workshops, training and routine local delivery costs. Exceptional travel or third-party expenses require advance written approval with a cap and receipts; no automatic expense entitlement. No success fee or cost-saving guarantee is included.

SCHEDULE C — CLIENT DUTIES AND PROFESSIONAL LIMITS
C1. Client appoints an executive sponsor and finance process owners, supplies requested accurate records within five business days and makes decisions on proposed controls. Mask personal and commercially sensitive data where possible; agree secure transfer and retention before access.
C2. Provider applies reasonable professional care, identifies conflicts and documents unsupported assumptions. Client remains responsible for accounting decisions, legal compliance, staffing and implementation. Reports are for the named client's internal use; third parties may not rely on them without a separate written agreement.
C3. Provider corrects substantiated errors in final deliverables notified within sixty calendar days of acceptance, within ten business days or an agreed plan. This does not cover changes in source records, new legislation or later client decisions.
C4. At close-out, return client originals, provide editable commissioned outputs and remove working copies within thirty calendar days, except records whose retention is required or separately agreed. Record retention purposes, access and deletion date. Optional implementation support needs a new signed scope and fee.
`,
  },
];

export async function seedProjectContractExamples(tenantId: string, ownerId: string) {
  return withTenant(tenantId, async trx => {
    const owner = await trx.selectFrom('users').select(['id', 'role']).where('tenant_id', '=', tenantId).where('id', '=', ownerId).executeTakeFirstOrThrow();
    if (!['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'].includes(owner.role)) throw new Error('Example owner must be a workspace administrator');
    await trx.selectFrom('tenants').select('id').where('id', '=', tenantId).forUpdate().executeTakeFirstOrThrow();
    const results = [];
    for (const example of contractExamples) {
      const project = await trx.selectFrom('projects').select('id').where('tenant_id', '=', tenantId).where('name', '=', example.project).where('industry', '=', example.industry).executeTakeFirstOrThrow();
      const existing = await trx.selectFrom('contracts').select('id').where('tenant_id', '=', tenantId).where('subject', '=', example.subject).executeTakeFirst();
      if (existing) { results.push({ id: existing.id, created: false }); continue; }
      let customer = await trx.selectFrom('customers').select('id').where('tenant_id', '=', tenantId).where('name', '=', example.customer).executeTakeFirst();
      if (!customer) customer = await trx.insertInto('customers').values({ tenant_id: tenantId, name: example.customer,
        notes: 'Fictional counterparty for a sample contract; no verified identity or delivery contact.', email: null, phone: null,
      }).returning('id').executeTakeFirstOrThrow();
      const row = await trx.insertInto('contracts').values({ id: randomUUID(), tenant_id: tenantId,
        ref: await getNextDocNumber(trx, tenantId, 'contract'), customer_id: customer.id, project_id: project.id,
        subject: example.subject, value: String(example.value), currency: 'TZS', type: example.type,
        start_date: '2026-11-02', end_date: '2027-06-30', status: 'draft', owner_id: ownerId,
        description: 'EXAMPLE ONLY — fictional parties and planning terms. Unsigned draft; no commitment or expenditure. Tags: sample-contract, example-draft, ' + example.industry,
        content: example.specific + commonTerms, sign_envelope_id: null,
      }).returning('id').executeTakeFirstOrThrow();
      results.push({ id: row.id, created: true });
    }
    return results;
  });
}

if (process.argv[1]?.endsWith('seed-project-contract-examples.mts')) {
  const [tenantId, ownerId] = process.argv.slice(2);
  if (!tenantId || !ownerId) throw new Error('Usage: tsx src/scripts/seed-project-contract-examples.mts <tenant-id> <owner-user-id>');
  try { console.log(JSON.stringify(await seedProjectContractExamples(tenantId, ownerId))); }
  finally { await dbPlatform.destroy(); await db.destroy(); }
}
