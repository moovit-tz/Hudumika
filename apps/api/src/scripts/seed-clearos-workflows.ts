/**
 * Seeds real, working ClearOS workflows (via the actual workflows/
 * workflow_steps tables — same shape POST /v1/workflows produces) into a
 * handful of tenants that already have real customers, plus a few sample
 * shipments driven through those workflows with the real transition engine
 * (WorkflowService.transitionStage) so the entry conditions, step
 * progression, and auto-comms are genuinely exercised, not faked.
 *
 * Idempotent: re-running skips a workflow that already exists (by
 * tenant_id + name) and skips creating a sample shipment ref_number that
 * already exists.
 *
 * Usage: npx tsx src/scripts/seed-clearos-workflows.ts
 */
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { ShipmentService } from '../services/shipment.service.js';
import { WorkflowService } from '../services/workflow.service.js';
import type { FieldCondition, AutoComm } from '@hudumika/types';

interface StepDef {
  key: string;
  name: string;
  description: string;
  order: number;
  isStart: boolean;
  isTerminal: boolean;
  next: string[]; // step keys
  entryConditions: FieldCondition[];
  autoComms: AutoComm[];
  slaHours: number;
  color: string;
}

interface WorkflowDef {
  name: string;
  description: string;
  freightModes: string[];
  consignmentTypes: string[];
  steps: StepDef[];
}

let condSeq = 0;
let commSeq = 0;
const cond = (field: string, operator: FieldCondition['operator'], label: string, value?: string): FieldCondition =>
  ({ id: `cond-${++condSeq}`, field, operator, label, value });
const comm = (channel: AutoComm['channel'], recipient: AutoComm['recipient'], subject: string, template: string, delayMinutes = 0): AutoComm =>
  ({ id: `comm-${++commSeq}`, channel, recipient, subject, template, delayMinutes, customEmail: '' });

const SEA_IMPORT: WorkflowDef = {
  name: 'Sea Import — Standard',
  description: 'Full cycle for sea freight imports: booking through customs clearance and delivery.',
  freightModes: ['sea'],
  consignmentTypes: ['import'],
  steps: [
    {
      key: 'booking', name: 'Booking Received', description: 'Shipment booking confirmed by shipper', order: 0,
      isStart: true, isTerminal: false, next: ['docs'], slaHours: 24, color: '#0d9488',
      entryConditions: [],
      autoComms: [comm('email', 'customer', 'Booking Confirmed — {{ref}}', 'Hi {{customer_name}}, your shipment {{ref}} ({{vessel}}) has been booked and is now being processed.')],
    },
    {
      key: 'docs', name: 'Documents Verified', description: 'Bill of lading, invoice, and packing list verified', order: 1,
      isStart: false, isTerminal: false, next: ['assess'], slaHours: 48, color: '#2563eb',
      entryConditions: [
        cond('bl_number', 'required', 'Bill of Lading number recorded'),
        cond('document:INVOICE', 'required', 'Commercial invoice verified'),
        cond('document:PACKING_LIST', 'required', 'Packing list verified'),
      ],
      autoComms: [],
    },
    {
      key: 'assess', name: 'Customs Assessment', description: 'HS code classified, duty and taxes assessed', order: 2,
      isStart: false, isTerminal: false, next: ['duty'], slaHours: 72, color: '#d97706',
      entryConditions: [cond('hs_code', 'required', 'HS code classified')],
      autoComms: [comm('email', 'customer', 'Assessment Ready — {{ref}}', 'Customs has assessed duties for {{ref}}. Please arrange payment to proceed.')],
    },
    {
      key: 'duty', name: 'Duty Paid', description: 'Customs duties and taxes paid', order: 3,
      isStart: false, isTerminal: false, next: ['delivered'], slaHours: 24, color: '#7c3aed',
      entryConditions: [cond('document:DUTY_RECEIPT', 'required', 'Duty payment receipt verified')],
      autoComms: [],
    },
    {
      key: 'delivered', name: 'Cleared & Delivered', description: 'Goods released by customs and delivered to consignee', order: 4,
      isStart: false, isTerminal: true, next: [], slaHours: 0, color: '#16a34a',
      entryConditions: [cond('document:DELIVERY_NOTE', 'required', 'Signed delivery note verified')],
      autoComms: [comm('email', 'customer', 'Delivered — {{ref}}', 'Your shipment {{ref}} has been successfully delivered. Thank you for choosing us.')],
    },
  ],
};

const AIR_IMPORT: WorkflowDef = {
  name: 'Air Import — Express',
  description: 'Expedited workflow for air freight imports with tight SLA targets.',
  freightModes: ['air'],
  consignmentTypes: ['import'],
  steps: [
    {
      key: 'awb', name: 'AWB Received', description: 'Air Waybill confirmed', order: 0,
      isStart: true, isTerminal: false, next: ['prealert'], slaHours: 4, color: '#0d9488',
      entryConditions: [cond('awb_number', 'required', 'Air Waybill number recorded')],
      autoComms: [comm('email', 'customer', 'AWB Received — {{ref}}', 'Hi {{customer_name}}, we have received the AWB for {{ref}} and customs pre-alert is in progress.')],
    },
    {
      key: 'prealert', name: 'Customs Pre-Alert', description: 'Pre-alert submitted to customs ahead of arrival', order: 1,
      isStart: false, isTerminal: false, next: ['cleared'], slaHours: 8, color: '#2563eb',
      entryConditions: [cond('document:INVOICE', 'required', 'Commercial invoice verified')],
      autoComms: [],
    },
    {
      key: 'cleared', name: 'Cleared', description: 'Customs clearance obtained', order: 2,
      isStart: false, isTerminal: false, next: ['delivered'], slaHours: 12, color: '#059669',
      entryConditions: [cond('document:RELEASE_ORDER', 'required', 'Release order verified')],
      autoComms: [comm('whatsapp', 'customer', '', 'Your shipment {{ref}} has cleared customs and will be delivered shortly.')],
    },
    {
      key: 'delivered', name: 'Delivered', description: 'Goods delivered to consignee', order: 3,
      isStart: false, isTerminal: true, next: [], slaHours: 0, color: '#16a34a',
      entryConditions: [cond('document:DELIVERY_NOTE', 'required', 'Delivery note verified')],
      autoComms: [],
    },
  ],
};

interface TenantTarget { tenantId: string; staffUserId: string; customerIds: string[]; }

const TARGETS: TenantTarget[] = [
  { // Aleka Group
    tenantId: '7f937908-ace7-4651-abfb-706aff042c28',
    staffUserId: '7c04052c-2019-4380-9655-edc0a62903cf',
    customerIds: ['28bac9e4-e8e9-4414-afa5-bbd5fd2cec77', '4eb2d62a-6207-4034-9f88-2792337b36fa', '607e172d-6bcd-4b93-b1d5-52ae443ce930'],
  },
  { // Moovit Mobility Limited
    tenantId: '15b7d313-5ab9-47d1-b9b3-eaa90cd90bdf',
    staffUserId: 'f7c30a8f-b30f-47a1-9fe7-3b0340eb34d7',
    customerIds: ['43dd9942-8408-46d2-a47a-4dbff3360ad5', 'e581a1cf-0701-44f9-8e39-9e042a9f771d', 'c3edac6b-a095-41fb-8c06-15ae24e328dc'],
  },
  { // Vihilox Logistics
    tenantId: 'd4389cf1-4cca-465a-8607-467019d22a14',
    staffUserId: '5e2c6a88-c036-4b82-abbc-8f46771c6b33',
    customerIds: ['bedf5db7-58c0-4e6a-9202-6ac6c08ee3eb', 'c9404196-6b65-4f7b-96f4-f88b2b840d22', 'f92efab5-1981-4f49-a6c9-97ceb8732a6e'],
  },
];

async function upsertWorkflow(tenantId: string, staffUserId: string, def: WorkflowDef): Promise<Record<string, string>> {
  const existing = await db.selectFrom('workflows').select('id')
    .where('tenant_id', '=', tenantId).where('name', '=', def.name).where('deleted_at', 'is', null)
    .executeTakeFirst();

  if (existing) {
    const stepRows = await db.selectFrom('workflow_steps').select(['id', 'name']).where('workflow_id', '=', existing.id).execute();
    const byName = new Map(stepRows.map(r => [r.name, r.id]));
    const keyToId: Record<string, string> = {};
    for (const s of def.steps) keyToId[s.key] = byName.get(s.name)!;
    console.log(`  ↷ "${def.name}" already exists for tenant ${tenantId} — reusing.`);
    return keyToId;
  }

  const now = new Date();
  const wf = await db.insertInto('workflows').values({
    tenant_id: tenantId,
    name: def.name,
    description: def.description,
    is_active: true,
    is_default: false,
    triggers: JSON.stringify({
      freightModes: def.freightModes, consignmentTypes: def.consignmentTypes,
      customerIds: [], originCountries: [], destinationCountries: [], isDefault: false,
    }),
    created_by: staffUserId,
    created_at: now, updated_at: now,
  }).returningAll().executeTakeFirstOrThrow();

  const keyToId: Record<string, string> = {};
  for (const s of def.steps) keyToId[s.key] = crypto.randomUUID();

  for (const s of def.steps) {
    await db.insertInto('workflow_steps').values({
      id: keyToId[s.key],
      tenant_id: tenantId,
      workflow_id: wf.id,
      name: s.name,
      description: s.description,
      step_order: s.order,
      is_start: s.isStart,
      is_terminal: s.isTerminal,
      next_step_ids: JSON.stringify(s.next.map(k => keyToId[k])),
      entry_conditions: JSON.stringify(s.entryConditions),
      auto_comms: JSON.stringify(s.autoComms),
      sla_hours: s.slaHours,
      color: s.color,
      created_at: now, updated_at: now,
    }).execute();
  }

  console.log(`  ✓ Created workflow "${def.name}" (${wf.id}) with ${def.steps.length} steps for tenant ${tenantId}.`);
  return keyToId;
}

/** Marks a document type as VERIFIED for a shipment — inserts a row if one doesn't already exist (createCase only pre-populates BL/AWB/INVOICE/PACKING_LIST as REQUIRED). */
async function verifyDocument(tenantId: string, shipmentId: string, uploadedBy: string, type: string) {
  const existing = await db.selectFrom('case_documents').select('id')
    .where('tenant_id', '=', tenantId).where('shipment_id', '=', shipmentId).where('type', '=', type as any)
    .executeTakeFirst();
  if (existing) {
    await db.updateTable('case_documents').set({ status: 'VERIFIED', verified_at: new Date(), uploaded_by: uploadedBy }).where('id', '=', existing.id).execute();
  } else {
    await db.insertInto('case_documents').values({
      tenant_id: tenantId, shipment_id: shipmentId, type: type as any,
      filename: `${type}.pdf`, storage_key: `seed/${shipmentId}/${type}.pdf`,
      status: 'VERIFIED', uploaded_by: uploadedBy, verified_at: new Date(), created_at: new Date(),
    }).execute();
  }
}

async function seedShipment(
  tenantId: string, staffUserId: string, customerId: string, refSuffix: string,
  input: { type: 'SEA_FCL' | 'AIR'; vessel: string; origin: string; dest: string; goods: string; blOrAwb: 'bl_number' | 'awb_number'; docNo: string },
) {
  // Idempotency: skip if a shipment with this exact goods_desc (used as a
  // stable seed marker) already exists for this customer.
  const marker = `[seed:${refSuffix}] ${input.goods}`;
  const existing = await db.selectFrom('shipment_cases').select('id')
    .where('tenant_id', '=', tenantId).where('customer_id', '=', customerId).where('goods_desc', '=', marker)
    .executeTakeFirst();
  if (existing) return existing.id;

  const shipment = await ShipmentService.createCase(tenantId, {
    customer_id: customerId,
    type: input.type,
    goods_desc: marker,
    containers: [],
    vessel: input.vessel,
    origin_port: input.origin,
    dest_port: input.dest,
    assigned_to: staffUserId,
    consignment_type: 'import',
    ...(input.blOrAwb === 'bl_number' ? { bl_number: input.docNo } : { awb_number: input.docNo }),
  } as any);

  return shipment.id;
}

async function main() {
  for (const target of TARGETS) {
    console.log(`\n=== Tenant ${target.tenantId} ===`);
    const seaSteps = await upsertWorkflow(target.tenantId, target.staffUserId, SEA_IMPORT);
    const airSteps = await upsertWorkflow(target.tenantId, target.staffUserId, AIR_IMPORT);

    // ── Sample sea-import shipments, spread across different steps ──
    const seaA = await seedShipment(target.tenantId, target.staffUserId, target.customerIds[0], 'sea-a', {
      type: 'SEA_FCL', vessel: 'MSC Aurora', origin: 'CNSHA', dest: 'TZDAR',
      goods: 'Industrial machinery parts', blOrAwb: 'bl_number', docNo: 'BL-SEED-001',
    });
    console.log(`  Sea shipment A (${seaA}) — left at "Booking Received".`);

    const seaB = await seedShipment(target.tenantId, target.staffUserId, target.customerIds[1] ?? target.customerIds[0], 'sea-b', {
      type: 'SEA_FCL', vessel: 'CMA CGM Titan', origin: 'AEJEA', dest: 'TZDAR',
      goods: 'Consumer electronics', blOrAwb: 'bl_number', docNo: 'BL-SEED-002',
    });
    if (seaB) {
      const s = await db.selectFrom('shipment_cases').select(['workflow_step_id']).where('id', '=', seaB).executeTakeFirst();
      if (s?.workflow_step_id === seaSteps.booking) {
        await verifyDocument(target.tenantId, seaB, target.staffUserId, 'INVOICE');
        await verifyDocument(target.tenantId, seaB, target.staffUserId, 'PACKING_LIST');
        await WorkflowService.transitionStage(target.tenantId, seaB, seaSteps.docs, target.staffUserId, 'Docs verified during seeding.');
        console.log(`  Sea shipment B (${seaB}) — advanced to "Documents Verified".`);
      }
    }

    const seaC = await seedShipment(target.tenantId, target.staffUserId, target.customerIds[2] ?? target.customerIds[0], 'sea-c', {
      type: 'SEA_FCL', vessel: 'Evergreen Ever Given', origin: 'SGSIN', dest: 'TZDAR',
      goods: 'Textile raw materials', blOrAwb: 'bl_number', docNo: 'BL-SEED-003',
    });
    if (seaC) {
      const s = await db.selectFrom('shipment_cases').select(['workflow_step_id']).where('id', '=', seaC).executeTakeFirst();
      if (s?.workflow_step_id === seaSteps.booking) {
        await verifyDocument(target.tenantId, seaC, target.staffUserId, 'INVOICE');
        await verifyDocument(target.tenantId, seaC, target.staffUserId, 'PACKING_LIST');
        await WorkflowService.transitionStage(target.tenantId, seaC, seaSteps.docs, target.staffUserId, 'Docs verified during seeding.');
        await db.updateTable('shipment_cases').set({ hs_code: '8471.30' }).where('id', '=', seaC).execute();
        await WorkflowService.transitionStage(target.tenantId, seaC, seaSteps.assess, target.staffUserId, 'HS code classified during seeding.');
        console.log(`  Sea shipment C (${seaC}) — advanced to "Customs Assessment".`);
      }
    }

    // ── Sample air-import shipments ──
    const airA = await seedShipment(target.tenantId, target.staffUserId, target.customerIds[0], 'air-a', {
      type: 'AIR', vessel: 'KQ Cargo 4102', origin: 'AEDXB', dest: 'TZDAR',
      goods: 'Medical diagnostic kits', blOrAwb: 'awb_number', docNo: 'AWB-SEED-001',
    });
    console.log(`  Air shipment A (${airA}) — left at "AWB Received".`);

    const airB = await seedShipment(target.tenantId, target.staffUserId, target.customerIds[1] ?? target.customerIds[0], 'air-b', {
      type: 'AIR', vessel: 'Ethiopian Cargo 302', origin: 'ETADD', dest: 'TZDAR',
      goods: 'Spare parts (urgent)', blOrAwb: 'awb_number', docNo: 'AWB-SEED-002',
    });
    if (airB) {
      const s = await db.selectFrom('shipment_cases').select(['workflow_step_id']).where('id', '=', airB).executeTakeFirst();
      if (s?.workflow_step_id === airSteps.awb) {
        await verifyDocument(target.tenantId, airB, target.staffUserId, 'INVOICE');
        await WorkflowService.transitionStage(target.tenantId, airB, airSteps.prealert, target.staffUserId, 'Invoice verified during seeding.');
        console.log(`  Air shipment B (${airB}) — advanced to "Customs Pre-Alert".`);
      }
    }
  }

  console.log('\nDone.');
  await db.destroy();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
