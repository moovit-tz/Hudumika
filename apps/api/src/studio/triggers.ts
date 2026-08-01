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
  | 'clearos' | 'finops' | 'onepi' | 'bliss' | 'complyos' | 'crm'
  | 'tracking' | 'cargotracker' | 'seal' | 'inventory' | 'studio';

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
];

export const TRIGGERS_BY_ID = new Map(TRIGGERS.map(t => [t.id, t]));

/** Event-backed triggers only — the set the consistency check validates. */
export const DOMAIN_EVENT_TRIGGER_IDS = TRIGGERS
  .filter(t => t.kind === 'DOMAIN_EVENT')
  .map(t => t.id);
