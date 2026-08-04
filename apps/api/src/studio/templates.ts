import type { AppId } from './triggers.js';

/**
 * Starter blueprints.
 *
 * Every template is assembled from ids that exist in the trigger and action
 * registries — `npm run check:triggers` fails the build if one drifts. That
 * matters more here than anywhere else in Studio: a template gallery is the
 * first thing a new user touches, and a template that quietly cannot run is
 * how migration 155's 21 dead workflows happened in the first place.
 *
 * Placeholders are written as {{…}} references where the value comes from the
 * event, and left blank where a human must choose (a recipient, a threshold).
 * `needs` lists those so the gallery can say what still has to be filled in
 * rather than presenting a template as ready to switch on.
 */

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  app: AppId;
  icon: string;
  color: string;
  triggerEvent: string;
  /** Inputs the author must supply before this can be activated. */
  needs: string[];
  nodes: any[];
  edges: any[];
}

const edge = (a: string, b: string) => ({ id: `e-${a}-${b}`, source: a, target: b });

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'sla-breach-ticket',
    name: 'SLA breach raises a support ticket',
    description: 'A clearance case passes its SLA deadline — open a HIGH priority ticket for the customer, skipping if one is already open.',
    app: 'bliss', icon: 'life-buoy', color: '#7c3aed',
    triggerEvent: 'shipment.sla_breach',
    needs: [],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'SLA breached', eventOrAction: 'shipment.sla_breach', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'condition', title: 'Shipment has a customer', position: { x: 80, y: 190 }, config: { field: 'shipment.customerId', operator: 'is_not_empty' } },
      { id: 'n3', type: 'action', title: 'Raise support ticket', eventOrAction: 'support.create_ticket', position: { x: 80, y: 340 }, config: { input: {
        customerId: '{{shipment.customerId}}',
        subject: '[Auto] SLA breach on shipment {{shipment.refNumber}}',
        description: 'Shipment {{shipment.refNumber}} exceeded its SLA deadline at stage "{{shipment.stage}}" ({{payload.hoursExceeded}} hours over).',
        priority: 'HIGH', category: 'Clearance Operations', tags: ['clearos', 'sla-breach'],
        dedupeOnOpenSubjectLike: '%{{shipment.refNumber}}%SLA%',
      } } },
    ],
    edges: [edge('n1', 'n2'), edge('n2', 'n3')],
  },
  {
    id: 'demurrage-alert',
    name: 'Demurrage risk alerts the assigned officer',
    description: 'Container free time is running out — notify the assigned officer in the CargoTracker inbox, which a ClearOS-tagged notification never reaches.',
    app: 'cargotracker', icon: 'alert-triangle', color: '#4f46e5',
    triggerEvent: 'shipment.demurrage_risk',
    needs: [],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Demurrage risk', eventOrAction: 'shipment.demurrage_risk', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'condition', title: 'Case has an assignee', position: { x: 80, y: 190 }, config: { field: 'shipment.assignedTo', operator: 'is_not_empty' } },
      { id: 'n3', type: 'action', title: 'Notify in CargoTracker', eventOrAction: 'notification.send_in_app', position: { x: 80, y: 340 }, config: { input: {
        userId: '{{shipment.assignedTo}}', app: 'cargotracker', type: 'security',
        title: 'Demurrage risk',
        message: "Shipment {{shipment.refNumber}}'s container free time ends {{shipment.freeTimeEndLabel}}.",
        link: '/cargotracker/demurrage', entityType: 'shipment', entityId: '{{entityId}}', entityLabel: '{{shipment.refNumber}}',
      } } },
    ],
    edges: [edge('n1', 'n2'), edge('n2', 'n3')],
  },
  {
    id: 'case-opened-hr',
    name: 'Case assignment shows up in HR',
    description: "Records a new clearance case against the assigned officer so their real workload is visible in NexusHR.",
    app: 'nexushr', icon: 'user-check', color: '#0d9488',
    triggerEvent: 'shipment.case_opened',
    needs: [],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Case opened', eventOrAction: 'shipment.case_opened', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'condition', title: 'Case has an assignee', position: { x: 80, y: 190 }, config: { field: 'shipment.assignedTo', operator: 'is_not_empty' } },
      { id: 'n3', type: 'action', title: 'Log HR activity', eventOrAction: 'hr.log_activity', position: { x: 80, y: 340 }, config: { input: {
        userId: '{{shipment.assignedTo}}', action: 'Assigned to shipment case {{shipment.refNumber}}', module: 'ClearOS',
      } } },
    ],
    edges: [edge('n1', 'n2'), edge('n2', 'n3')],
  },
  {
    id: 'declaration-duty-expense',
    name: 'Released declaration books the customs duty',
    description: 'Records the duty as an expense against the shipment — only from a real recorded TRA assessment, never an estimate.',
    app: 'finops', icon: 'file-text', color: '#0284c7',
    triggerEvent: 'declaration.released',
    needs: [],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Declaration released', eventOrAction: 'declaration.released', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'condition', title: 'A real TRA amount exists', position: { x: 80, y: 190 }, config: { field: 'declaration.dutyAmountTzs', operator: 'greater_than', value: 0 } },
      { id: 'n3', type: 'action', title: 'Record duty expense', eventOrAction: 'finance.record_expense', position: { x: 80, y: 340 }, config: { input: {
        shipmentId: '{{declaration.shipmentId}}', category: 'DUTY',
        label: 'Customs duty — declaration {{declaration.ref}}{{declaration.billSuffix}}',
        amountTzs: '{{declaration.dutyAmountTzs}}', onlyIfNoneInCategory: true,
      } } },
    ],
    edges: [edge('n1', 'n2'), edge('n2', 'n3')],
  },
  {
    id: 'stage-trip-dispatchers',
    name: 'Stage change notifies linked trip dispatchers',
    description: 'When a clearance stage advances, notify the dispatcher of every fleet trip hauling that shipment. Repeats per linked trip.',
    app: 'tracking', icon: 'truck', color: '#0891b2',
    triggerEvent: 'shipment.stage_advanced',
    needs: [],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Stage advanced', eventOrAction: 'shipment.stage_advanced', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'forEach', title: 'For each linked trip', position: { x: 80, y: 190 }, config: { over: 'trips', as: 'trip' } },
      { id: 'n3', type: 'action', title: 'Notify dispatcher', eventOrAction: 'notification.send_in_app', position: { x: 80, y: 340 }, config: { input: {
        userId: '{{trip.dispatcherId}}', app: 'tracking', type: 'info',
        title: 'Linked shipment stage updated',
        message: 'Shipment stage for your trip\'s cargo advanced to "{{payload.stage}}".',
        link: '/tracking/trips/{{trip.id}}', entityType: 'trip', entityId: '{{trip.id}}', entityLabel: '{{trip.id}}',
      } } },
    ],
    edges: [edge('n1', 'n2'), edge('n2', 'n3')],
  },
  {
    id: 'release-bonded-lots',
    name: 'Released declaration releases bonded lots',
    description: "Cargo that cleared customs should not sit under bond. Moves every linked lot to duty-paid through SEAL's append-only ledger.",
    app: 'seal', icon: 'package-check', color: '#0f766e',
    triggerEvent: 'declaration.released',
    needs: [],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Declaration released', eventOrAction: 'declaration.released', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'forEach', title: 'For each suspended lot', position: { x: 80, y: 190 }, config: { over: 'suspendedLots', as: 'lot' } },
      { id: 'n3', type: 'action', title: 'Release lot', eventOrAction: 'seal.release_lot', position: { x: 80, y: 340 }, config: { input: {
        lotId: '{{lot.id}}', toCustomsStatus: 'FOREIGN_DUTY_PAID', reasonCode: 'DECLARATION_RELEASED', reference: '{{entityId}}',
      } } },
    ],
    edges: [edge('n1', 'n2'), edge('n2', 'n3')],
  },
  {
    id: 'case-opened-notify-officer',
    name: 'Tell the officer a case landed on them',
    description: 'An in-app notification to whoever the new clearance case was assigned to.',
    app: 'clearos', icon: 'bell', color: '#ea580c',
    triggerEvent: 'shipment.case_opened',
    needs: [],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Case opened', eventOrAction: 'shipment.case_opened', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'condition', title: 'Case has an assignee', position: { x: 80, y: 190 }, config: { field: 'shipment.assignedTo', operator: 'is_not_empty' } },
      { id: 'n3', type: 'action', title: 'Notify the officer', eventOrAction: 'notification.send_in_app', position: { x: 80, y: 340 }, config: { input: {
        userId: '{{shipment.assignedTo}}', app: 'clearos', type: 'info',
        title: 'New clearance case assigned to you',
        message: '{{shipment.refNumber}} — {{shipment.goodsDesc}}',
        link: '/clearos/clearance/{{entityId}}', entityType: 'shipment', entityId: '{{entityId}}', entityLabel: '{{shipment.refNumber}}',
      } } },
    ],
    edges: [edge('n1', 'n2'), edge('n2', 'n3')],
  },
  // ── Journey: declaration → warehouse → haulage → tracking → billing ──────
  // Each step is its own workflow rather than one long chain, because each
  // fires on a different real event. Chaining them is what makes the journey:
  // the warehouse receipt this creates a task for is the same consignment the
  // declaration released.
  {
    id: 'journey-cleared-to-warehouse',
    name: 'Journey 1 · Cleared cargo is expected at the warehouse',
    description: 'Declaration released — tell the warehouse team to expect the consignment and book it in.',
    app: 'seal', icon: 'package', color: '#0f766e',
    triggerEvent: 'declaration.released',
    needs: ['Warehouse contact (userId) on the task step'],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Declaration released', eventOrAction: 'declaration.released', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'condition', title: 'It belongs to a shipment', position: { x: 80, y: 190 }, config: { field: 'declaration.shipmentId', operator: 'is_not_empty' } },
      { id: 'n3', type: 'action', title: 'Task the warehouse team', eventOrAction: 'tasks.create_task', position: { x: 80, y: 340 }, config: { input: {
        userId: '', title: 'Book in cleared cargo — declaration {{declaration.ref}}',
        notes: 'Customs released this consignment. Receive it into a compartment and set its customs status.', starred: true,
      } } },
    ],
    edges: [edge('n1', 'n2'), edge('n2', 'n3')],
  },
  {
    id: 'journey-warehoused-to-billing',
    name: 'Journey 2 · Warehoused cargo starts accruing storage',
    description: 'Cargo booked into a compartment — flag it to finance so storage billing starts from day one.',
    app: 'finops', icon: 'dollar-sign', color: '#0284c7',
    triggerEvent: 'seal.lot_received',
    needs: ['Finance contact (userId) on the task step'],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Cargo received', eventOrAction: 'seal.lot_received', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'action', title: 'Task finance to start storage billing', eventOrAction: 'tasks.create_task', position: { x: 80, y: 190 }, config: { input: {
        userId: '', title: 'Start storage billing — {{payload.description}}',
        notes: 'Lot received under {{payload.customsStatus}} (entry {{payload.entryReference}}). Confirm the storage rate and billing start date.',
      } } },
    ],
    edges: [edge('n1', 'n2')],
  },
  {
    id: 'journey-dispatch-to-haulage',
    name: 'Journey 3 · Dispatched goods need a truck',
    description: 'A fulfilment order left the gate — make sure a haulage trip exists and the dispatcher knows.',
    app: 'tracking', icon: 'truck', color: '#0891b2',
    triggerEvent: 'seal.order_dispatched',
    needs: ['Dispatcher (userId) on the notification step'],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Goods dispatched', eventOrAction: 'seal.order_dispatched', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'action', title: 'Alert the dispatcher', eventOrAction: 'notification.send_in_app', position: { x: 80, y: 190 }, config: { input: {
        userId: '', app: 'tracking', type: 'warning',
        title: 'Dispatched order needs haulage',
        message: 'Order {{payload.reference}} left the warehouse. Confirm the trip and vehicle.',
        link: '/tracking/trips', entityType: 'seal_fulfillment_order', entityId: '{{entityId}}', entityLabel: '{{payload.reference}}',
      } } },
    ],
    edges: [edge('n1', 'n2')],
  },
  {
    id: 'journey-trip-to-tracking',
    name: 'Journey 4 · A booked trip is put on watch',
    description: 'A haulage trip was created against a clearance case — tell the clearing officer it is on the road.',
    app: 'clearos', icon: 'map', color: '#ea580c',
    triggerEvent: 'trip.created',
    needs: ['Clearing officer (userId) on the notification step'],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Trip booked', eventOrAction: 'trip.created', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'condition', title: 'It is carrying a clearance case', position: { x: 80, y: 190 }, config: { field: 'payload.jobType', operator: 'equals', value: 'CLEARANCE_LINKED' } },
      { id: 'n3', type: 'action', title: 'Tell the clearing officer', eventOrAction: 'notification.send_in_app', position: { x: 80, y: 340 }, config: { input: {
        userId: '', app: 'clearos', type: 'info',
        title: 'Cargo is on the road',
        message: 'A trip from {{payload.origin}} to {{payload.destination}} is carrying your consignment.',
        link: '/tracking/trips/{{entityId}}', entityType: 'trip', entityId: '{{entityId}}', entityLabel: '{{entityId}}',
      } } },
    ],
    edges: [edge('n1', 'n2'), edge('n2', 'n3')],
  },
  {
    id: 'journey-payment-closes-the-file',
    name: 'Journey 5 · Payment closes the consignment file',
    description: 'Money landed against an invoice — notify the owner so the job can be closed out.',
    app: 'finops', icon: 'check-circle', color: '#0284c7',
    triggerEvent: 'invoice.payment_recorded',
    needs: ['Finance contact (userId) on the notification step'],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Payment received', eventOrAction: 'invoice.payment_recorded', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'action', title: 'Notify finance', eventOrAction: 'notification.send_in_app', position: { x: 80, y: 190 }, config: { input: {
        userId: '', app: 'finops', type: 'success',
        title: 'Payment received',
        message: 'A payment of {{payload.amount}} was recorded ({{payload.method}}).',
        link: '/finance/invoices', entityType: 'invoice', entityId: '{{entityId}}',
      } } },
    ],
    edges: [edge('n1', 'n2')],
  },

  // ── Journey: compliance check → renewal → payment → storage ──────────────
  {
    id: 'journey-renewal-opened',
    name: 'Journey 6 · Licence renewal opens a task',
    description: 'A certificate is nearing expiry and a renewal cycle started — put it on someone\'s list before it lapses.',
    app: 'complyos', icon: 'shield-check', color: '#059669',
    triggerEvent: 'comply.renewal_started',
    needs: ['Compliance officer (userId) on the task step'],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Renewal opened', eventOrAction: 'comply.renewal_started', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'action', title: 'Task the compliance officer', eventOrAction: 'tasks.create_task', position: { x: 80, y: 190 }, config: { input: {
        userId: '', title: 'Renew licence before {{payload.expiryDate}}',
        notes: 'An automatic renewal cycle was opened (renewal {{payload.renewalId}}). Gather documents, submit and pay the agency fee.',
        starred: true,
      } } },
    ],
    edges: [edge('n1', 'n2')],
  },
  {
    id: 'journey-renewal-fee-expense',
    name: 'Journey 7 · Renewal raises the fee for finance',
    description: 'Opens a finance task to pay the agency fee for a licence renewal, so a permit never lapses over an unpaid invoice.',
    app: 'finops', icon: 'credit-card', color: '#0284c7',
    triggerEvent: 'comply.renewal_started',
    needs: ['Finance contact (userId) on the task step'],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Renewal opened', eventOrAction: 'comply.renewal_started', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'action', title: 'Task finance to pay the fee', eventOrAction: 'tasks.create_task', position: { x: 80, y: 190 }, config: { input: {
        userId: '', title: 'Pay renewal fee — expires {{payload.expiryDate}}',
        notes: 'Renewal {{payload.renewalId}} is open. Confirm the agency fee and settle it before the expiry date.',
      } } },
    ],
    edges: [edge('n1', 'n2')],
  },

  {
    id: 'daily-digest',
    name: 'Daily reminder to a named person',
    description: 'A scheduled nudge. Pick who receives it before switching this on.',
    app: 'studio', icon: 'clock', color: '#4361ee',
    triggerEvent: 'schedule.daily',
    needs: ['Recipient (userId) on the notification step'],
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Every day', eventOrAction: 'schedule.daily', position: { x: 80, y: 40 }, config: {} },
      { id: 'n2', type: 'action', title: 'Send the reminder', eventOrAction: 'notification.send_in_app', position: { x: 80, y: 190 }, config: { input: {
        userId: '', app: 'clearos', type: 'info', title: 'Daily check', message: 'Review today’s open clearance cases.', link: '/clearos/ops',
      } } },
    ],
    edges: [edge('n1', 'n2')],
  },
];

export const TEMPLATES_BY_ID = new Map(TEMPLATES.map(t => [t.id, t]));
