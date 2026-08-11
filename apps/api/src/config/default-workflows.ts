/**
 * Canonical platform default workflows — one per freight mode the platform
 * ships out-of-the-box: Sea Import, Air Import, Road Import, Sea Transit.
 *
 * These are seeded into EVERY tenant (backfilled for existing tenants by
 * scripts/seed-default-workflows.ts, and installed at tenant creation by
 * DefaultWorkflowService.seedForTenant) as real `workflows`/`workflow_steps`
 * rows flagged `is_system = true` and stamped with a stable `template_key`.
 *
 * A tenant may delete a default once it has built its own (the normal workflow
 * DELETE applies — it only blocks while active shipments still sit on it), and
 * a tenant's own custom workflow always out-ranks a system default when a new
 * shipment resolves its workflow (see resolveWorkflowForNewShipment). The
 * platform superadmin can extend this registry; new entries flow to tenants on
 * the next seed pass without disturbing anything a tenant already edited.
 *
 * Every check the operator sees on the shipment — "Bill of Lading recorded",
 * "Commercial invoice verified", "Duty receipt verified" — is an `entryCondition`
 * on the step it gates, so switching a shipment onto one of these workflows
 * re-derives exactly the warnings that workflow requires, nothing hand-coded in
 * the page. `document:<TYPE>` conditions require that case_document to be
 * VERIFIED; a bare column condition (e.g. `bl_number` required) checks the
 * shipment row. The chain runs the full commercial cycle: clearance → release →
 * (container deposit return & refund, where the mode has one) → invoicing →
 * payment collection → closure.
 */
import type { FieldCondition, AutoComm } from '@hudumika/types';

export interface DefaultStepDef {
  key: string;
  name: string;
  description: string;
  isStart?: boolean;
  isTerminal?: boolean;
  next: string[]; // step keys within this workflow
  conditions?: Array<{ field: string; operator: FieldCondition['operator']; label: string; value?: string }>;
  comms?: Array<{ channel: AutoComm['channel']; recipient: AutoComm['recipient']; subject?: string; template: string; delayMinutes?: number }>;
  slaHours: number;
  color: string;
}

export interface DefaultWorkflowDef {
  templateKey: string;
  name: string;
  description: string;
  freightModes: string[];      // matched against FREIGHT_MODE_MAP output: sea|air|road|rail
  consignmentTypes: string[];  // import | export | transit
  steps: DefaultStepDef[];
}

// Palette reused across the step ladders — teal→blue→amber→violet→green, the
// same visual progression the hand-seeded sea/air workflows already use.
const C = {
  start: '#0d9488', docs: '#2563eb', decl: '#0891b2', assess: '#d97706',
  pay: '#7c3aed', release: '#4f46e5', port: '#db2777', deliver: '#0ea5e9',
  deposit: '#ca8a04', invoice: '#9333ea', collect: '#16a34a', done: '#15803d',
};

const SEA_IMPORT: DefaultWorkflowDef = {
  templateKey: 'sys-sea-import',
  name: 'Sea Import',
  description: 'Full sea freight import cycle — booking through customs clearance, container deposit return, invoicing and payment collection.',
  freightModes: ['sea'],
  consignmentTypes: ['import'],
  steps: [
    { key: 'booking', name: 'Booking Received', description: 'Shipment booking confirmed by shipper.', isStart: true, next: ['docs'], slaHours: 24, color: C.start,
      comms: [{ channel: 'email', recipient: 'customer', subject: 'Booking confirmed — {{ref}}', template: 'Hi {{customer_name}}, your shipment {{ref}} ({{vessel}}) has been booked and is now being processed.' }] },
    { key: 'docs', name: 'Documents Verified', description: 'Bill of lading, commercial invoice and packing list received and verified.', next: ['declaration'], slaHours: 48, color: C.docs,
      conditions: [
        { field: 'bl_number', operator: 'required', label: 'Bill of Lading number recorded' },
        { field: 'document:INVOICE', operator: 'required', label: 'Commercial invoice verified' },
        { field: 'document:PACKING_LIST', operator: 'required', label: 'Packing list verified' },
      ] },
    { key: 'declaration', name: 'Declaration Lodged', description: 'TANSAD lodged in TANCIS; entry submitted to customs.', next: ['assess'], slaHours: 48, color: C.decl,
      conditions: [{ field: 'document:CUSTOMS_ENTRY', operator: 'required', label: 'Customs entry (TANSAD) verified' }] },
    { key: 'assess', name: 'Customs Assessment', description: 'HS code classified; pre-assessment issued and duty/taxes computed.', next: ['duty'], slaHours: 72, color: C.assess,
      conditions: [
        { field: 'hs_code', operator: 'required', label: 'HS code classified' },
        { field: 'document:PRE_ASSESSMENT', operator: 'required', label: 'Pre-assessment notice verified' },
      ],
      comms: [{ channel: 'email', recipient: 'customer', subject: 'Assessment ready — {{ref}}', template: 'Customs has assessed duties for {{ref}}. Please arrange payment to proceed.' }] },
    { key: 'duty', name: 'Duty & Taxes Paid', description: 'Control number settled via TISS; duty receipt on file.', next: ['release'], slaHours: 24, color: C.pay,
      conditions: [
        { field: 'document:PAYMENT_NOTE', operator: 'required', label: 'Payment note / control number verified' },
        { field: 'document:TISS_PAYMENT_INVOICE', operator: 'required', label: 'TISS payment invoice verified' },
        { field: 'document:DUTY_RECEIPT', operator: 'required', label: 'Duty payment receipt verified' },
      ] },
    { key: 'release', name: 'Customs Release', description: 'Final assessment passed; customs release order obtained.', next: ['port'], slaHours: 24, color: C.release,
      conditions: [
        { field: 'document:FINAL_ASSESSMENT', operator: 'required', label: 'Final assessment notice verified' },
        { field: 'document:RELEASE_ORDER', operator: 'required', label: 'Customs release order verified' },
      ] },
    { key: 'port', name: 'Port Charges & Container Deposit', description: 'Wharfage/port charges settled and container deposit paid to the line.', next: ['deliver'], slaHours: 24, color: C.port,
      conditions: [{ field: 'document:CONTAINER_DEPOSIT', operator: 'required', label: 'Container deposit receipt verified' }] },
    { key: 'deliver', name: 'Delivery & Devanning', description: 'Goods released from port and delivered to the consignee.', next: ['deposit'], slaHours: 48, color: C.deliver,
      conditions: [{ field: 'document:DELIVERY_NOTE', operator: 'required', label: 'Signed delivery note verified' }] },
    { key: 'deposit', name: 'Container Return & Deposit Refund', description: 'Empty container returned to the line and the deposit refunded.', next: ['invoice'], slaHours: 72, color: C.deposit,
      conditions: [{ field: 'document:CONTAINER_RETURN', operator: 'required', label: 'Empty return note / deposit refund verified' }] },
    { key: 'invoice', name: 'Invoicing', description: 'Clearing & freight invoice issued to the customer.', next: ['collect'], slaHours: 24, color: C.invoice,
      conditions: [{ field: 'document:CLIENT_INVOICE', operator: 'required', label: 'Customer invoice issued & verified' }],
      comms: [{ channel: 'email', recipient: 'customer', subject: 'Invoice for {{ref}}', template: 'Your invoice for shipment {{ref}} is ready. Please arrange settlement at your earliest convenience.' }] },
    { key: 'collect', name: 'Payment Collection', description: 'Customer payment received and receipted.', next: ['closed'], slaHours: 72, color: C.collect,
      conditions: [{ field: 'document:PAYMENT_RECEIPT', operator: 'required', label: 'Customer payment receipt verified' }] },
    { key: 'closed', name: 'Closed', description: 'File complete — cleared, delivered, invoiced and paid.', isTerminal: true, next: [], slaHours: 0, color: C.done,
      comms: [{ channel: 'email', recipient: 'customer', subject: 'File closed — {{ref}}', template: 'Shipment {{ref}} is fully cleared, delivered and settled. Thank you for choosing us.' }] },
  ],
};

const AIR_IMPORT: DefaultWorkflowDef = {
  templateKey: 'sys-air-import',
  name: 'Air Import',
  description: 'Expedited air freight import — AWB through clearance, delivery, invoicing and payment collection.',
  freightModes: ['air'],
  consignmentTypes: ['import'],
  steps: [
    { key: 'awb', name: 'AWB Received', description: 'Air Waybill confirmed.', isStart: true, next: ['prealert'], slaHours: 4, color: C.start,
      conditions: [{ field: 'awb_number', operator: 'required', label: 'Air Waybill number recorded' }],
      comms: [{ channel: 'email', recipient: 'customer', subject: 'AWB received — {{ref}}', template: 'Hi {{customer_name}}, we have received the AWB for {{ref}} and customs pre-alert is in progress.' }] },
    { key: 'prealert', name: 'Pre-Alert & Documents Verified', description: 'Pre-alert filed; invoice and packing list verified.', next: ['declaration'], slaHours: 8, color: C.docs,
      conditions: [
        { field: 'document:INVOICE', operator: 'required', label: 'Commercial invoice verified' },
        { field: 'document:PACKING_LIST', operator: 'required', label: 'Packing list verified' },
      ] },
    { key: 'declaration', name: 'Declaration Lodged', description: 'Entry lodged with customs ahead of / on arrival.', next: ['assess'], slaHours: 8, color: C.decl,
      conditions: [{ field: 'document:CUSTOMS_ENTRY', operator: 'required', label: 'Customs entry verified' }] },
    { key: 'assess', name: 'Customs Assessment', description: 'HS code classified and duty assessed.', next: ['duty'], slaHours: 12, color: C.assess,
      conditions: [
        { field: 'hs_code', operator: 'required', label: 'HS code classified' },
        { field: 'document:PRE_ASSESSMENT', operator: 'required', label: 'Pre-assessment notice verified' },
      ] },
    { key: 'duty', name: 'Duty & Taxes Paid', description: 'Duty and taxes settled.', next: ['release'], slaHours: 8, color: C.pay,
      conditions: [
        { field: 'document:PAYMENT_NOTE', operator: 'required', label: 'Payment note / control number verified' },
        { field: 'document:DUTY_RECEIPT', operator: 'required', label: 'Duty payment receipt verified' },
      ] },
    { key: 'release', name: 'Customs Release', description: 'Release order obtained.', next: ['deliver'], slaHours: 12, color: C.release,
      conditions: [{ field: 'document:RELEASE_ORDER', operator: 'required', label: 'Release order verified' }],
      comms: [{ channel: 'whatsapp', recipient: 'customer', template: 'Your shipment {{ref}} has cleared customs and will be delivered shortly.' }] },
    { key: 'deliver', name: 'Delivery', description: 'Goods delivered to the consignee.', next: ['invoice'], slaHours: 24, color: C.deliver,
      conditions: [{ field: 'document:DELIVERY_NOTE', operator: 'required', label: 'Delivery note verified' }] },
    { key: 'invoice', name: 'Invoicing', description: 'Clearing invoice issued to the customer.', next: ['collect'], slaHours: 24, color: C.invoice,
      conditions: [{ field: 'document:CLIENT_INVOICE', operator: 'required', label: 'Customer invoice issued & verified' }],
      comms: [{ channel: 'email', recipient: 'customer', subject: 'Invoice for {{ref}}', template: 'Your invoice for shipment {{ref}} is ready.' }] },
    { key: 'collect', name: 'Payment Collection', description: 'Customer payment received and receipted.', next: ['closed'], slaHours: 72, color: C.collect,
      conditions: [{ field: 'document:PAYMENT_RECEIPT', operator: 'required', label: 'Customer payment receipt verified' }] },
    { key: 'closed', name: 'Closed', description: 'File complete — cleared, delivered, invoiced and paid.', isTerminal: true, next: [], slaHours: 0, color: C.done },
  ],
};

const ROAD_IMPORT: DefaultWorkflowDef = {
  templateKey: 'sys-road-import',
  name: 'Road Import',
  description: 'Road freight import via a land border — manifest through border clearance, delivery, invoicing and payment collection.',
  freightModes: ['road'],
  consignmentTypes: ['import'],
  steps: [
    { key: 'manifest', name: 'Manifest Received', description: 'Truck manifest / road consignment note received.', isStart: true, next: ['docs'], slaHours: 12, color: C.start },
    { key: 'docs', name: 'Documents Verified', description: 'Invoice and packing list verified.', next: ['declaration'], slaHours: 24, color: C.docs,
      conditions: [
        { field: 'document:INVOICE', operator: 'required', label: 'Commercial invoice verified' },
        { field: 'document:PACKING_LIST', operator: 'required', label: 'Packing list verified' },
      ] },
    { key: 'declaration', name: 'Border Declaration Lodged', description: 'Entry lodged at the border customs office.', next: ['assess'], slaHours: 24, color: C.decl,
      conditions: [{ field: 'document:CUSTOMS_ENTRY', operator: 'required', label: 'Customs entry verified' }] },
    { key: 'assess', name: 'Customs Assessment', description: 'HS code classified and duty assessed.', next: ['duty'], slaHours: 48, color: C.assess,
      conditions: [
        { field: 'hs_code', operator: 'required', label: 'HS code classified' },
        { field: 'document:PRE_ASSESSMENT', operator: 'required', label: 'Pre-assessment notice verified' },
      ] },
    { key: 'duty', name: 'Duty & Taxes Paid', description: 'Duty and taxes settled.', next: ['release'], slaHours: 24, color: C.pay,
      conditions: [
        { field: 'document:PAYMENT_NOTE', operator: 'required', label: 'Payment note / control number verified' },
        { field: 'document:DUTY_RECEIPT', operator: 'required', label: 'Duty payment receipt verified' },
      ] },
    { key: 'release', name: 'Border Release', description: 'Goods released at the border.', next: ['deliver'], slaHours: 24, color: C.release,
      conditions: [{ field: 'document:RELEASE_ORDER', operator: 'required', label: 'Release order verified' }] },
    { key: 'deliver', name: 'Transit & Delivery', description: 'Goods carried inland and delivered to the consignee.', next: ['invoice'], slaHours: 48, color: C.deliver,
      conditions: [{ field: 'document:DELIVERY_NOTE', operator: 'required', label: 'Delivery note verified' }] },
    { key: 'invoice', name: 'Invoicing', description: 'Clearing invoice issued to the customer.', next: ['collect'], slaHours: 24, color: C.invoice,
      conditions: [{ field: 'document:CLIENT_INVOICE', operator: 'required', label: 'Customer invoice issued & verified' }] },
    { key: 'collect', name: 'Payment Collection', description: 'Customer payment received and receipted.', next: ['closed'], slaHours: 72, color: C.collect,
      conditions: [{ field: 'document:PAYMENT_RECEIPT', operator: 'required', label: 'Customer payment receipt verified' }] },
    { key: 'closed', name: 'Closed', description: 'File complete — cleared, delivered, invoiced and paid.', isTerminal: true, next: [], slaHours: 0, color: C.done },
  ],
};

const SEA_TRANSIT: DefaultWorkflowDef = {
  templateKey: 'sys-sea-transit',
  name: 'Sea Transit',
  description: 'Bonded sea transit through the port to a neighbouring country — transit declaration, bond, seal & release, border acquittal, deposit refund and billing.',
  freightModes: ['sea'],
  consignmentTypes: ['transit'],
  steps: [
    { key: 'booking', name: 'BL Received', description: 'Bill of lading received for the transit consignment.', isStart: true, next: ['docs'], slaHours: 24, color: C.start,
      conditions: [{ field: 'bl_number', operator: 'required', label: 'Bill of Lading number recorded' }] },
    { key: 'docs', name: 'Documents Verified', description: 'Invoice and packing list verified.', next: ['transit'], slaHours: 48, color: C.docs,
      conditions: [
        { field: 'document:INVOICE', operator: 'required', label: 'Commercial invoice verified' },
        { field: 'document:PACKING_LIST', operator: 'required', label: 'Packing list verified' },
      ] },
    { key: 'transit', name: 'Transit Declaration Lodged', description: 'T1 / TANCIS transit entry lodged.', next: ['bond'], slaHours: 48, color: C.decl,
      conditions: [{ field: 'document:CUSTOMS_ENTRY', operator: 'required', label: 'Transit entry (T1) verified' }] },
    { key: 'bond', name: 'Bond / Guarantee Lodged', description: 'Transit bond or bank guarantee lodged with customs.', next: ['seal'], slaHours: 48, color: C.assess,
      conditions: [{ field: 'document:PERMIT', operator: 'required', label: 'Transit bond / guarantee verified' }] },
    { key: 'seal', name: 'Customs Seal & Release', description: 'Container sealed and released for transit.', next: ['exit'], slaHours: 24, color: C.release,
      conditions: [{ field: 'document:RELEASE_ORDER', operator: 'required', label: 'Transit release order verified' }] },
    { key: 'exit', name: 'Border Exit & Acquittal', description: 'Consignment exits the border; transit acquitted.', next: ['deposit'], slaHours: 72, color: C.deliver,
      conditions: [{ field: 'document:DELIVERY_NOTE', operator: 'required', label: 'Border exit / acquittal note verified' }] },
    { key: 'deposit', name: 'Container Deposit Refund', description: 'Empty container returned and the deposit refunded.', next: ['invoice'], slaHours: 72, color: C.deposit,
      conditions: [{ field: 'document:CONTAINER_RETURN', operator: 'required', label: 'Empty return note / deposit refund verified' }] },
    { key: 'invoice', name: 'Invoicing', description: 'Transit-handling invoice issued to the customer.', next: ['collect'], slaHours: 24, color: C.invoice,
      conditions: [{ field: 'document:CLIENT_INVOICE', operator: 'required', label: 'Customer invoice issued & verified' }] },
    { key: 'collect', name: 'Payment Collection', description: 'Customer payment received and receipted.', next: ['closed'], slaHours: 72, color: C.collect,
      conditions: [{ field: 'document:PAYMENT_RECEIPT', operator: 'required', label: 'Customer payment receipt verified' }] },
    { key: 'closed', name: 'Closed', description: 'Transit complete — acquitted, deposit refunded, invoiced and paid.', isTerminal: true, next: [], slaHours: 0, color: C.done },
  ],
};

export const DEFAULT_WORKFLOWS: DefaultWorkflowDef[] = [SEA_IMPORT, AIR_IMPORT, ROAD_IMPORT, SEA_TRANSIT];
