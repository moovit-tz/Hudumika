import { z } from 'zod';

/**
 * The catalogue of events a Studio workflow can be triggered by.
 *
 * This replaces the hardcoded 8-item array that `/v1/workflow-studio/integrations`
 * used to return. That array described integrations that sounded plausible but
 * had no relationship to anything the platform emits — which is how three
 * seeded workflows shipped bound to `shipment.created`, `shipment.arrived` and
 * `penalty.high_risk`, none of which exist (see migration 157).
 *
 * The rule that stops that recurring: **a DOMAIN_EVENT trigger may only appear
 * here if a real `emitDomainEvent` call site emits it.** `npm run check:triggers`
 * (scripts/check-triggers.ts) greps the emitters and fails when the two disagree.
 */

export type AppId =
  | 'clearos' | 'finops' | 'nexushr' | 'bliss' | 'complyos' | 'crm'
  | 'tracking' | 'cargotracker' | 'seal' | 'inventory' | 'studio' | 'ondi'
  | 'cloud' | 'onsite' | 'tasks' | 'workspace';

export type TriggerKind = 'DOMAIN_EVENT' | 'SCHEDULE' | 'MANUAL';

export interface TriggerDef {
  /** For DOMAIN_EVENT this must equal the `type` passed to emitDomainEvent. */
  id: string;
  kind: TriggerKind;
  app: AppId;
  label: string;
  description: string;
  /** The entity the event is about — drives Studio's entity-scoped run view. */
  entityType: string | null;
  /** Validates the payload the emitter actually sends. */
  payloadSchema: z.ZodTypeAny;
  /** Real field names and representative values, for the UI field picker and dry runs. */
  samplePayload: Record<string, unknown>;
}

/**
 * Payload shapes below are taken from the emitting call sites, not invented:
 * shipment.service.ts:141/170/614/624 and declaration.service.ts:170.
 * `.passthrough()` because an emitter may add fields before this file catches up —
 * an unexpected extra field must never drop an event on the floor.
 */
export const TRIGGERS: TriggerDef[] = [
  {
    id: 'shipment.case_opened',
    kind: 'DOMAIN_EVENT',
    app: 'clearos',
    label: 'Clearance case opened',
    description: 'A new shipment clearance case was created.',
    entityType: 'shipment',
    payloadSchema: z.object({
      refNumber: z.string(),
      customerId: z.string().nullable(),
      assignedTo: z.string().nullable(),
    }).passthrough(),
    samplePayload: { refNumber: 'CLR-2026-0142', customerId: null, assignedTo: null },
  },
  {
    id: 'shipment.stage_advanced',
    kind: 'DOMAIN_EVENT',
    app: 'clearos',
    label: 'Clearance stage advanced',
    description: 'A shipment moved to a new stage in its clearance workflow.',
    entityType: 'shipment',
    // No previousStage: the emitter sends only the stage moved to, plus the
    // transition note. Use {{shipment.stage}} for the current record.
    payloadSchema: z.object({
      stage: z.string(),
      note: z.string().nullable(),
    }).passthrough(),
    samplePayload: { stage: 'CUSTOMS_ASSESSMENT', note: null },
  },
  {
    id: 'shipment.sla_breach',
    kind: 'DOMAIN_EVENT',
    app: 'clearos',
    label: 'SLA breached',
    description: 'A shipment passed its stage SLA deadline.',
    entityType: 'shipment',
    payloadSchema: z.object({
      // A string, not a number: the emitter builds it with String(Math.round(…))
      // and falls back to '0'. Declaring it z.number() made the trigger node
      // reject every real event.
      hoursExceeded: z.string(),
      stage: z.string(),
    }).passthrough(),
    samplePayload: { hoursExceeded: '6', stage: 'CUSTOMS_ASSESSMENT' },
  },
  {
    id: 'shipment.demurrage_risk',
    kind: 'DOMAIN_EVENT',
    app: 'clearos',
    label: 'Demurrage risk detected',
    description: 'Container free time is running out on a shipment still in clearance.',
    entityType: 'shipment',
    // `hoursLeft` goes to the notification template, not to this event — the
    // event carries only freeTimeEnd and stage. Advertising hoursLeft here
    // would let an author write {{payload.hoursLeft}} and get nothing.
    payloadSchema: z.object({
      freeTimeEnd: z.string(),
      stage: z.string(),
    }).passthrough(),
    samplePayload: { freeTimeEnd: 'Mon Aug 04 2026 00:00:00 GMT+0300', stage: 'PORT_CLEARANCE' },
  },
  {
    id: 'declaration.released',
    kind: 'DOMAIN_EVENT',
    app: 'clearos',
    label: 'Declaration released',
    description: 'A customs declaration was released — duty settled, cargo cleared.',
    entityType: 'declaration',
    payloadSchema: z.object({
      shipmentId: z.string().nullable(),
      tancisRef: z.string().nullable(),
      tansadNumber: z.string().nullable(),
    }).passthrough(),
    samplePayload: { shipmentId: null, tancisRef: 'TZ-DEC-2026-8841', tansadNumber: null },
  },

  // ── Journey milestones ────────────────────────────────────────────────
  // Added so a consignment's whole path — cleared, warehoused, hauled,
  // dispatched, billed — is reachable from Studio instead of stopping at the
  // customs boundary. Each is emitted at a real mutation point.
  {
    id: 'seal.lot_received',
    kind: 'DOMAIN_EVENT',
    app: 'seal',
    label: 'Cargo received into the warehouse',
    description: 'A lot was booked into a bonded compartment — where storage, billing and dispatch all start.',
    entityType: 'seal_lot',
    payloadSchema: z.object({
      description: z.string(),
      customsStatus: z.string(),
      entryReference: z.string().nullable(),
    }).passthrough(),
    samplePayload: { description: 'Ceramic floor tiles', customsStatus: 'FOREIGN_DUTY_SUSPENDED', entryReference: null },
  },
  {
    id: 'seal.order_dispatched',
    kind: 'DOMAIN_EVENT',
    app: 'seal',
    label: 'Goods dispatched from the warehouse',
    description: 'A fulfilment order left the gate — the handover from warehousing to haulage.',
    entityType: 'seal_fulfillment_order',
    payloadSchema: z.object({
      reference: z.string().nullable(),
      vehicleId: z.string().nullable(),
      carrierNote: z.string().nullable(),
    }).passthrough(),
    samplePayload: { reference: 'FO-2026-0031', vehicleId: null, carrierNote: null },
  },
  {
    id: 'trip.created',
    kind: 'DOMAIN_EVENT',
    app: 'tracking',
    label: 'Haulage trip booked',
    description: 'A fleet trip was created. When it carries a clearance case it is linked to that shipment.',
    entityType: 'trip',
    payloadSchema: z.object({
      shipmentId: z.string().nullable(),
      origin: z.string().nullable(),
      destination: z.string().nullable(),
      jobType: z.string(),
    }).passthrough(),
    samplePayload: { shipmentId: null, origin: 'Dar es Salaam Port', destination: 'Mwanza', jobType: 'CLEARANCE_LINKED' },
  },
  {
    id: 'invoice.payment_recorded',
    kind: 'DOMAIN_EVENT',
    app: 'finops',
    label: 'Payment received on an invoice',
    description: 'Money landed against a sales invoice — the closing leg of a consignment.',
    entityType: 'invoice',
    payloadSchema: z.object({
      amount: z.number(),
      method: z.string().nullable(),
      customerId: z.string().nullable(),
    }).passthrough(),
    samplePayload: { amount: 2500000, method: 'BANK_TRANSFER', customerId: null },
  },
  {
    id: 'comply.renewal_started',
    kind: 'DOMAIN_EVENT',
    app: 'complyos',
    label: 'Licence renewal opened',
    description: 'A certificate is approaching expiry and an automatic renewal cycle has been created.',
    entityType: 'comply_certificate',
    payloadSchema: z.object({
      renewalId: z.string(),
      expiryDate: z.string().nullable(),
    }).passthrough(),
    samplePayload: { renewalId: '…', expiryDate: '2026-09-30' },
  },

  // Non-event triggers. These need no emitter, so they are exempt from the
  // check above — the scheduler and the Run button are their emitters.
  {
    id: 'schedule.daily',
    kind: 'SCHEDULE',
    app: 'studio',
    label: 'Every day',
    description: 'Runs once a day at a configured hour.',
    entityType: null,
    payloadSchema: z.object({ runAt: z.string() }).passthrough(),
    samplePayload: { runAt: '2026-08-01T03:00:00.000Z' },
  },
  {
    id: 'schedule.hourly',
    kind: 'SCHEDULE',
    app: 'studio',
    label: 'Every hour',
    description: 'Runs at the top of every hour.',
    entityType: null,
    payloadSchema: z.object({ runAt: z.string() }).passthrough(),
    samplePayload: { runAt: '2026-08-01T14:00:00.000Z' },
  },
  {
    id: 'manual.run',
    kind: 'MANUAL',
    app: 'studio',
    label: 'Run manually',
    description: 'Only runs when someone presses Run.',
    entityType: null,
    payloadSchema: z.object({}).passthrough(),
    samplePayload: {},
  },

  {
    // Emitted by shipments.routes.ts:1225 when a cost is booked against a
    // shipment. It was added for the estimate-vs-actual intelligence loop and
    // never registered here, so check:triggers has been failing on it — an
    // event nothing could subscribe to.
    id: 'shipment.cost_recorded',
    kind: 'DOMAIN_EVENT',
    app: 'finops',
    label: 'Cost recorded against a shipment',
    description: 'An expense line was booked to a consignment, under a charge head.',
    entityType: 'shipment',
    payloadSchema: z.object({
      expenseId: z.string(), chargeHead: z.string().nullable(), amountTzs: z.number(),
    }).passthrough(),
    samplePayload: { expenseId: '00000000-0000-0000-0000-000000000000', chargeHead: 'TRANSPORT', amountTzs: 450000 },
  },

  /*
   * NexusHR. Emitted from hr.routes.ts — leave POST/PATCH and the two
   * staff PATCH handlers. Before these, HR was reachable from other apps but
   * announced nothing, so no app could ever respond to something that happened
   * to a person: a clearing officer going on leave, or being deactivated while
   * still holding open consignments.
   */
  {
    id: 'hr.leave_requested',
    kind: 'DOMAIN_EVENT',
    app: 'nexushr',
    label: 'Leave requested',
    description: 'A staff member submitted a leave request. Fires before anyone has approved it.',
    entityType: 'leave',
    payloadSchema: z.object({
      userId: z.string(), leaveType: z.string(), fromDate: z.string(), toDate: z.string(), days: z.number(),
    }).passthrough(),
    samplePayload: { userId: '00000000-0000-0000-0000-000000000000', leaveType: 'Annual Leave', fromDate: '2026-09-01', toDate: '2026-09-05', days: 5 },
  },
  {
    id: 'hr.leave_approved',
    kind: 'DOMAIN_EVENT',
    app: 'nexushr',
    label: 'Leave approved',
    description: 'A leave request was approved — the person will actually be away.',
    entityType: 'leave',
    payloadSchema: z.object({
      userId: z.string(), leaveType: z.string(), fromDate: z.string(), toDate: z.string(),
      days: z.number(), decidedBy: z.string(),
    }).passthrough(),
    samplePayload: { userId: '00000000-0000-0000-0000-000000000000', leaveType: 'Annual Leave', fromDate: '2026-09-01', toDate: '2026-09-05', days: 5, decidedBy: '00000000-0000-0000-0000-000000000000' },
  },
  {
    id: 'hr.leave_rejected',
    kind: 'DOMAIN_EVENT',
    app: 'nexushr',
    label: 'Leave rejected',
    description: 'A leave request was turned down.',
    entityType: 'leave',
    payloadSchema: z.object({
      userId: z.string(), leaveType: z.string(), fromDate: z.string(), toDate: z.string(),
      days: z.number(), decidedBy: z.string(),
    }).passthrough(),
    samplePayload: { userId: '00000000-0000-0000-0000-000000000000', leaveType: 'Sick Leave', fromDate: '2026-09-01', toDate: '2026-09-02', days: 2, decidedBy: '00000000-0000-0000-0000-000000000000' },
  },
  {
    id: 'hr.staff_role_changed',
    kind: 'DOMAIN_EVENT',
    app: 'nexushr',
    label: 'Staff role changed',
    description: 'Someone\'s role changed, which changes what they can reach in every app.',
    entityType: 'user',
    payloadSchema: z.object({
      userId: z.string(), name: z.string().nullable(), email: z.string().nullable(),
      role: z.string(), changedBy: z.string(),
    }).passthrough(),
    samplePayload: { userId: '00000000-0000-0000-0000-000000000000', name: 'Jane Mwangi', email: 'jane@example.com', role: 'SENIOR', changedBy: '00000000-0000-0000-0000-000000000000' },
  },
  {
    id: 'hr.staff_deactivated',
    kind: 'DOMAIN_EVENT',
    app: 'nexushr',
    label: 'Staff deactivated',
    description: 'A staff member was deactivated — anything still assigned to them needs a new owner.',
    entityType: 'user',
    payloadSchema: z.object({
      userId: z.string(), name: z.string().nullable(), active: z.boolean(), changedBy: z.string(),
    }).passthrough(),
    samplePayload: { userId: '00000000-0000-0000-0000-000000000000', name: 'Jane Mwangi', active: false, changedBy: '00000000-0000-0000-0000-000000000000' },
  },
  {
    id: 'hr.staff_reactivated',
    kind: 'DOMAIN_EVENT',
    app: 'nexushr',
    label: 'Staff reactivated',
    description: 'A previously deactivated staff member was switched back on.',
    entityType: 'user',
    payloadSchema: z.object({
      userId: z.string(), name: z.string().nullable(), active: z.boolean(), changedBy: z.string(),
    }).passthrough(),
    samplePayload: { userId: '00000000-0000-0000-0000-000000000000', name: 'Jane Mwangi', active: true, changedBy: '00000000-0000-0000-0000-000000000000' },
  },
  {
    id: 'hr.holidays_synced',
    kind: 'DOMAIN_EVENT',
    app: 'nexushr',
    label: 'Holidays synced',
    description: 'Public holidays were updated for the tenant country.',
    entityType: 'hr_holidays',
    payloadSchema: z.object({
      countries: z.array(z.string()).optional(),
      years: z.array(z.number()).optional(),
      added: z.number().optional(),
      updated: z.number().optional(),
    }).passthrough(),
    samplePayload: { countries: ['TZ'], years: [2026], added: 12, updated: 2 },
  },
  /*
   * Bliss. Emitted from support.routes.ts (ticket_created inside
   * createTicketRow, reassigned/resolved inside PATCH /tickets/:id/status)
   * and support-rules.job.ts (sla_escalated, both the rule-driven pass and
   * the universal fallback for tenants with no configured rule). Studio
   * already had an action that creates a Bliss ticket
   * (studio/actions.ts:support.create_ticket) but nothing to react to
   * inside Bliss — these four close that loop, and are what
   * /studio/workflows?app=bliss is actually for now that the module's own
   * in-app automation UI (SupportSettings.tsx, BlissAutomations.tsx) has
   * been retired in Studio's favor.
   */
  {
    id: 'support.ticket_created',
    kind: 'DOMAIN_EVENT',
    app: 'bliss',
    label: 'Support ticket created',
    description: 'A new customer conversation was opened — via the inbox, the customer portal, WhatsApp, or inbound email.',
    entityType: 'support_ticket',
    payloadSchema: z.object({
      channel: z.string(), priority: z.string(), category: z.string(), assignedTo: z.string().nullable(),
    }).passthrough(),
    samplePayload: { channel: 'WHATSAPP', priority: 'HIGH', category: 'Demurrage Dispute', assignedTo: null },
  },
  {
    id: 'support.ticket_reassigned',
    kind: 'DOMAIN_EVENT',
    app: 'bliss',
    label: 'Ticket reassigned',
    description: 'A ticket was assigned or handed off to a different agent.',
    entityType: 'support_ticket',
    payloadSchema: z.object({
      assignedTo: z.string().nullable(), previousAssignedTo: z.string().nullable(),
    }).passthrough(),
    samplePayload: { assignedTo: '00000000-0000-0000-0000-000000000000', previousAssignedTo: null },
  },
  {
    id: 'support.ticket_resolved',
    kind: 'DOMAIN_EVENT',
    app: 'bliss',
    label: 'Ticket resolved',
    description: 'An agent marked a ticket resolved — the moment CSAT/NPS follow-up becomes relevant.',
    entityType: 'support_ticket',
    payloadSchema: z.object({
      priority: z.string(), category: z.string(), resolutionSeconds: z.number(),
    }).passthrough(),
    samplePayload: { priority: 'NORMAL', category: 'Document Issue', resolutionSeconds: 14400 },
  },
  {
    id: 'support.sla_escalated',
    kind: 'DOMAIN_EVENT',
    app: 'bliss',
    label: 'Ticket SLA escalated',
    description: 'A ticket crossed its SLA escalation point — a configured threshold if the tenant has one, otherwise the deadline itself.',
    entityType: 'support_ticket',
    payloadSchema: z.object({
      priority: z.string(), category: z.string(), elapsedPercent: z.number(),
    }).passthrough(),
    samplePayload: { priority: 'URGENT', category: 'Clearance Delay', elapsedPercent: 92 },
  },

  {
    id: 'ondi.oauth_client_registered',
    kind: 'DOMAIN_EVENT',
    app: 'ondi',
    label: 'OAuth client registered',
    description: 'An admin registered a new outbound OAuth/SSO client application (ondi.routes.ts POST /oauth-clients).',
    entityType: 'oauth_client',
    payloadSchema: z.object({
      clientId: z.string(), name: z.string(), firstParty: z.boolean(),
    }).passthrough(),
    samplePayload: { clientId: 'corp-helpdesk', name: 'Corporate Helpdesk', firstParty: false },
  },
  {
    id: 'ondi.oauth_consent_granted',
    kind: 'DOMAIN_EVENT',
    app: 'ondi',
    label: 'OAuth consent granted',
    description: 'A user authorized an app to sign in with Ondi, or pre-connected one of the platform\'s own first-party apps (ondi-oauth.routes.ts POST /authorize/approve, POST /consents/preauthorize).',
    entityType: 'oauth_consent',
    payloadSchema: z.object({
      clientId: z.string(), clientName: z.string(), scopes: z.array(z.string()),
    }).passthrough(),
    samplePayload: { clientId: 'corp-helpdesk', clientName: 'Corporate Helpdesk', scopes: ['openid', 'profile', 'email'] },
  },
  {
    id: 'ondi.oauth_consent_revoked',
    kind: 'DOMAIN_EVENT',
    app: 'ondi',
    label: 'OAuth consent revoked',
    description: 'A user revoked a previously-granted app\'s access to their Ondi identity (ondi-oauth.routes.ts DELETE /consents/:id).',
    entityType: 'oauth_consent',
    payloadSchema: z.object({
      clientId: z.string(), clientName: z.string(),
    }).passthrough(),
    samplePayload: { clientId: 'corp-helpdesk', clientName: 'Corporate Helpdesk' },
  },

  /*
   * The 33 entries below were found by running `npm run check:triggers`
   * against the real emitters — every one of them already fires in
   * production code (files.routes.ts, onsite.routes.ts, hr.routes.ts,
   * hr-cases.routes.ts, bills.routes.ts, tasks.routes.ts, fleetOps.routes.ts,
   * auth.routes.ts, settings.routes.ts, shipments.routes.ts,
   * workflow.service.ts, onsite-backups.routes.ts) but had no Studio trigger
   * to react to it. Payload shapes were read directly off each call site,
   * not guessed — the same discipline the file's own header describes.
   */

  // ── Cloud (Drive) ────────────────────────────────────────────────────
  {
    id: 'file.uploaded', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File uploaded', description: 'A new file was uploaded into Cloud.',
    entityType: 'document',
    payloadSchema: z.object({ name: z.string(), size: z.number(), type: z.string() }).passthrough(),
    samplePayload: { name: 'BL-8841.pdf', size: 204800, type: 'pdf' },
  },
  {
    id: 'file.renamed', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File renamed', description: 'A file or folder was renamed.',
    entityType: 'document',
    payloadSchema: z.object({ name: z.string() }).passthrough(),
    samplePayload: { name: 'BL-8841-final.pdf' },
  },
  {
    id: 'file.starred', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File starred/unstarred', description: 'A file was starred or unstarred.',
    entityType: 'document',
    payloadSchema: z.object({ name: z.string(), starred: z.boolean() }).passthrough(),
    samplePayload: { name: 'BL-8841.pdf', starred: true },
  },
  {
    id: 'file.moved', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File moved', description: 'A file or folder was moved to a different folder.',
    entityType: 'document',
    payloadSchema: z.object({ name: z.string(), to_parent_id: z.string().nullable() }).passthrough(),
    samplePayload: { name: 'BL-8841.pdf', to_parent_id: null },
  },
  {
    id: 'file.trashed', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File trashed', description: 'A file was moved to Trash.',
    entityType: 'document',
    payloadSchema: z.object({ name: z.string() }).passthrough(),
    samplePayload: { name: 'BL-8841.pdf' },
  },
  {
    id: 'file.restored', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File restored from Trash', description: 'A file was restored out of Trash.',
    entityType: 'document',
    payloadSchema: z.object({ name: z.string() }).passthrough(),
    samplePayload: { name: 'BL-8841.pdf' },
  },
  {
    id: 'file.permanently_deleted', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File permanently deleted', description: 'A file was permanently deleted — by a platform SuperAdmin, or by the customer who owns it.',
    entityType: 'document',
    payloadSchema: z.object({ name: z.string() }).passthrough(),
    samplePayload: { name: 'BL-8841.pdf' },
  },
  {
    id: 'file.shared', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File sharing changed', description: 'A file\'s sharing list was replaced.',
    entityType: 'document',
    payloadSchema: z.object({
      shared: z.array(z.object({ name: z.string(), role: z.string() })),
    }).passthrough(),
    samplePayload: { shared: [{ name: 'Grace Osei', role: 'Editor' }] },
  },
  {
    id: 'file.commented', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File commented', description: 'Someone posted a comment on a file.',
    entityType: 'document',
    payloadSchema: z.object({ comment_id: z.string() }).passthrough(),
    samplePayload: { comment_id: '00000000-0000-0000-0000-000000000000' },
  },
  {
    id: 'file.version_uploaded', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'New file version uploaded', description: 'A new content version was uploaded for an existing file.',
    entityType: 'document',
    payloadSchema: z.object({ name: z.string(), size: z.number() }).passthrough(),
    samplePayload: { name: 'BL-8841.pdf', size: 210000 },
  },
  {
    id: 'file.version_restored', kind: 'DOMAIN_EVENT', app: 'cloud',
    label: 'File version restored', description: 'A file\'s content was rolled back to a previous version.',
    entityType: 'document',
    payloadSchema: z.object({ name: z.string(), restored_version_id: z.string() }).passthrough(),
    samplePayload: { name: 'BL-8841.pdf', restored_version_id: '00000000-0000-0000-0000-000000000000' },
  },

  // ── Onsite (AgencyHost) ──────────────────────────────────────────────
  {
    id: 'onsite.domain.created', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Domain added', description: 'A domain was registered directly in Onsite.',
    entityType: 'onsite_domain',
    payloadSchema: z.object({ domain: z.string() }).passthrough(),
    samplePayload: { domain: 'client-shop.co.tz' },
  },
  {
    id: 'onsite.domain.updated', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Domain updated', description: 'A domain\'s settings were changed.',
    entityType: 'onsite_domain',
    payloadSchema: z.object({ domain: z.string(), fields: z.array(z.string()) }).passthrough(),
    samplePayload: { domain: 'client-shop.co.tz', fields: ['auto_renew'] },
  },
  {
    id: 'onsite.domain.deleted', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Domain removed', description: 'A domain was removed from Onsite.',
    entityType: 'onsite_domain',
    payloadSchema: z.object({ domain: z.string() }).passthrough(),
    samplePayload: { domain: 'client-shop.co.tz' },
  },
  {
    id: 'onsite.domain.requested', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Domain purchase requested', description: 'A staff member requested a domain found via Domain Search (no connected registrar yet, so this records a pending request).',
    entityType: 'onsite_domain',
    payloadSchema: z.object({ domain: z.string() }).passthrough(),
    samplePayload: { domain: 'client-shop.co.tz' },
  },
  {
    id: 'onsite.dns_record.created', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'DNS record added', description: 'A DNS record was added under a domain.',
    entityType: 'onsite_dns_record',
    payloadSchema: z.object({ domain_id: z.string(), name: z.string(), dns_type: z.string() }).passthrough(),
    samplePayload: { domain_id: '00000000-0000-0000-0000-000000000000', name: 'www', dns_type: 'A' },
  },
  {
    id: 'onsite.dns_record.deleted', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'DNS record deleted', description: 'A DNS record was deleted under a domain.',
    entityType: 'onsite_dns_record',
    payloadSchema: z.object({ name: z.string(), dns_type: z.string(), warned: z.string().nullable() }).passthrough(),
    samplePayload: { name: 'www', dns_type: 'A', warned: null },
  },
  {
    id: 'onsite.application.created', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Application registered', description: 'A new deployable application was registered in Onsite.',
    entityType: 'onsite_application',
    payloadSchema: z.object({ name: z.string(), runtime: z.string() }).passthrough(),
    samplePayload: { name: 'client-storefront', runtime: 'node' },
  },
  {
    id: 'onsite.deployment.triggered', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Deployment triggered', description: 'A deployment was triggered and accepted by the real CI provider.',
    entityType: 'onsite_deployment',
    payloadSchema: z.object({ application_id: z.string(), branch: z.string(), ci_provider: z.string() }).passthrough(),
    samplePayload: { application_id: '00000000-0000-0000-0000-000000000000', branch: 'main', ci_provider: 'github' },
  },
  {
    id: 'onsite.server.created', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Server added', description: 'A server was registered in Onsite.',
    entityType: 'onsite_server',
    payloadSchema: z.object({ name: z.string(), provider: z.string() }).passthrough(),
    samplePayload: { name: 'prod-web-01', provider: 'digitalocean' },
  },
  {
    id: 'onsite.server.deleted', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Server removed', description: 'A server was removed from Onsite.',
    entityType: 'onsite_server',
    payloadSchema: z.object({ name: z.string() }).passthrough(),
    samplePayload: { name: 'prod-web-01' },
  },
  {
    id: 'onsite.website.created', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Website added', description: 'A website was registered in Onsite.',
    entityType: 'onsite_website',
    payloadSchema: z.object({ name: z.string(), type: z.string() }).passthrough(),
    samplePayload: { name: 'client-shop', type: 'php' },
  },
  {
    id: 'onsite.website.deleted', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Website removed', description: 'A website was removed from Onsite.',
    entityType: 'onsite_website',
    payloadSchema: z.object({ name: z.string() }).passthrough(),
    samplePayload: { name: 'client-shop' },
  },
  {
    id: 'onsite.backup.created', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Config backup created', description: 'A staff member manually snapshotted the full tenant Onsite configuration.',
    entityType: 'onsite_backup',
    payloadSchema: z.object({ trigger: z.string(), size_bytes: z.number() }).passthrough(),
    samplePayload: { trigger: 'manual', size_bytes: 1048576 },
  },
  {
    id: 'onsite.backup.restored', kind: 'DOMAIN_EVENT', app: 'onsite',
    label: 'Config backup restored', description: 'A tenant\'s Onsite configuration was restored from a previous backup.',
    entityType: 'onsite_backup',
    // created_at is a JS Date at the emit call site, but emitDomainEvent
    // JSON.stringifies the payload before persisting — read back out of
    // domain_events (what Studio's runner sees) it's an ISO string.
    payloadSchema: z.object({ created_at: z.string() }).passthrough(),
    samplePayload: { created_at: '2026-08-01T03:00:00.000Z' },
  },

  // ── NexusHR ──────────────────────────────────────────────────────────
  {
    id: 'hr.case_opened', kind: 'DOMAIN_EVENT', app: 'nexushr',
    label: 'HR case opened', description: 'HR opened a new case for an employee.',
    entityType: 'hr_case',
    payloadSchema: z.object({ employee_id: z.string(), case_type: z.string(), title: z.string() }).passthrough(),
    samplePayload: { employee_id: '00000000-0000-0000-0000-000000000000', case_type: 'grievance', title: 'Overtime dispute' },
  },
  {
    id: 'hr.case_status_changed', kind: 'DOMAIN_EVENT', app: 'nexushr',
    label: 'HR case status changed', description: 'An HR case moved to a different status.',
    entityType: 'hr_case',
    payloadSchema: z.object({ employee_id: z.string(), status: z.string() }).passthrough(),
    samplePayload: { employee_id: '00000000-0000-0000-0000-000000000000', status: 'resolved' },
  },
  {
    id: 'hr.staff_invited', kind: 'DOMAIN_EVENT', app: 'nexushr',
    label: 'Staff invited', description: 'A person became a real staff account — either hired through the recruitment pipeline, or invited directly by an admin/manager.',
    entityType: 'user',
    // fromCandidateId is only sent on the hire-pipeline call site
    // (inviteHiredPerson()) — a direct POST /invitations never sends it, so
    // it must be optional or every direct invite fails validation.
    payloadSchema: z.object({ email: z.string(), role: z.string(), fromCandidateId: z.string().optional() }).passthrough(),
    samplePayload: { email: 'jane@example.com', role: 'JUNIOR', fromCandidateId: undefined },
  },
  {
    id: 'hr.requisition_approved', kind: 'DOMAIN_EVENT', app: 'nexushr',
    label: 'Staffing requisition approved', description: 'An approver signed off on a headcount requisition.',
    entityType: 'hr_requisition',
    payloadSchema: z.object({ title: z.string() }).passthrough(),
    samplePayload: { title: 'Senior Customs Officer' },
  },

  // ── FinOps ───────────────────────────────────────────────────────────
  {
    id: 'bill.payment_recorded', kind: 'DOMAIN_EVENT', app: 'finops',
    label: 'Bill payment recorded', description: 'A payment was recorded against a supplier bill.',
    entityType: 'bill',
    payloadSchema: z.object({ amount: z.number(), method: z.string().nullable(), supplierId: z.string().nullable() }).passthrough(),
    samplePayload: { amount: 1200000, method: 'BANK_TRANSFER', supplierId: null },
  },

  // ── Tasks ────────────────────────────────────────────────────────────
  {
    id: 'todo.completed', kind: 'DOMAIN_EVENT', app: 'tasks',
    label: 'Task completed', description: 'A task was marked complete.',
    entityType: 'task',
    payloadSchema: z.object({ title: z.string() }).passthrough(),
    samplePayload: { title: 'Follow up with customer on demurrage query' },
  },
  {
    id: 'todo.commented', kind: 'DOMAIN_EVENT', app: 'tasks',
    label: 'Task commented', description: 'Someone commented on a task.',
    entityType: 'task',
    payloadSchema: z.object({ preview: z.string() }).passthrough(),
    samplePayload: { preview: 'Waiting on the customer to confirm the delivery address.' },
  },

  // ── HuduFreight (fleet) ──────────────────────────────────────────────
  {
    id: 'trip.border_crossing_recorded', kind: 'DOMAIN_EVENT', app: 'tracking',
    label: 'Border crossing recorded', description: 'A fleet trip logged a border crossing.',
    entityType: 'trip',
    payloadSchema: z.object({ borderName: z.string(), countryFrom: z.string(), countryTo: z.string() }).passthrough(),
    samplePayload: { borderName: 'Namanga', countryFrom: 'Kenya', countryTo: 'Tanzania' },
  },

  // ── Ondi (identity) ──────────────────────────────────────────────────
  {
    id: 'user.joined', kind: 'DOMAIN_EVENT', app: 'ondi',
    label: 'User joined', description: 'An invited person completed signup and set their password — self-service, not something done to them by staff.',
    entityType: 'user',
    payloadSchema: z.object({ userId: z.string(), name: z.string(), email: z.string(), role: z.string() }).passthrough(),
    samplePayload: { userId: '00000000-0000-0000-0000-000000000000', name: 'Jane Mwangi', email: 'jane@example.com', role: 'JUNIOR' },
  },

  // ── Workspace (tenant settings) ──────────────────────────────────────
  {
    id: 'settings.changed', kind: 'DOMAIN_EVENT', app: 'workspace',
    label: 'Workspace settings changed', description: 'An admin changed tenant workspace settings. Only the changed keys are carried, never the values.',
    entityType: 'tenant_settings',
    payloadSchema: z.object({ keys: z.array(z.string()), replaced: z.array(z.string()) }).passthrough(),
    samplePayload: { keys: ['branding', 'notifications'], replaced: [] },
  },

  // ── ClearOS ──────────────────────────────────────────────────────────
  {
    id: 'shipment.transport_task_added', kind: 'DOMAIN_EVENT', app: 'clearos',
    label: 'Transport task added to shipment', description: 'A clearance task matching haulage/transport keywords was added to a shipment — a transport leg needs arranging.',
    entityType: 'shipment',
    payloadSchema: z.object({ taskId: z.string(), title: z.string(), serviceName: z.string().nullable() }).passthrough(),
    samplePayload: { taskId: '00000000-0000-0000-0000-000000000000', title: 'Arrange haulage to Mwanza', serviceName: 'Inland transport' },
  },
  {
    id: 'clearance.workflow_step_entered', kind: 'DOMAIN_EVENT', app: 'clearos',
    label: 'Clearance workflow step entered', description: 'A shipment\'s clearance workflow transitioned to a new step.',
    entityType: 'shipment',
    payloadSchema: z.object({
      stepId: z.string(), stepName: z.string(), role: z.string(), isTerminal: z.boolean(),
      customerId: z.string().nullable(), shipmentRef: z.string().nullable(), blNumber: z.string().nullable(), workflowKind: z.string(),
    }).passthrough(),
    samplePayload: { stepId: 'invoicing', stepName: 'Invoicing', role: 'invoicing', isTerminal: false, customerId: null, shipmentRef: 'CLR-2026-0142', blNumber: null, workflowKind: 'SEA_IMPORT' },
  },
];

export const TRIGGERS_BY_ID = new Map(TRIGGERS.map(t => [t.id, t]));

/** Event-backed triggers only — the set the consistency check validates. */
export const DOMAIN_EVENT_TRIGGER_IDS = TRIGGERS
  .filter(t => t.kind === 'DOMAIN_EVENT')
  .map(t => t.id);
