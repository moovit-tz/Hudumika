import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import {
  createDepotEquipment, listDepotEquipment, updateDepotEquipmentStatus,
  recordInterchange, listInterchangeReceipts, getInterchangeReceipt, renderEirPdf,
} from '../services/depot.service.js';
import { withTenant } from '../db/client.js';
import { CloudSync } from '../services/cloud-sync.service.js';

const equipmentSchema = z.object({
  equipmentNumber: z.string().trim().min(1),
  equipmentType: z.enum(['CONTAINER_20FT', 'CONTAINER_40FT', 'CONTAINER_40HC', 'CHASSIS', 'GENSET', 'OTHER']),
  condition: z.enum(['GOOD', 'DAMAGED', 'UNDER_REPAIR']).optional(),
  location: z.string().trim().optional(),
  ownerCarrier: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const interchangeSchema = z.object({
  subjectType: z.enum(['depot_equipment', 'container_tracking', 'seal_container', 'adhoc']).default('adhoc'),
  subjectId: z.string().uuid().nullable().optional(),
  releaseDocumentId: z.string().uuid().nullable().optional(),
  equipmentNumber: z.string().trim().min(1),
  direction: z.enum(['GATE_IN', 'GATE_OUT']),
  partyName: z.string().trim().min(1),
  conditionAtInterchange: z.enum(['GOOD', 'DAMAGED']).optional(),
  damageNotes: z.string().trim().optional(),
  sealNumber: z.string().trim().optional(),
  driverName: z.string().trim().optional(),
  vehicleReg: z.string().trim().optional(),
  signatureName: z.string().trim().optional(),
});

type EirCloudLink =
  | { kind: 'shipment'; shipmentId: string; customerId: string | null; blRef: string }
  | { kind: 'seal_container'; containerId: string };

/** Resolves an interchange receipt back to whichever real Customers ▸ … Cloud
 *  folder it belongs in — release_document_id first (a release order already
 *  carries both subject_id and customer_id directly), then subject_type/
 *  subject_id (container_tracking has a direct shipment_id; seal_container
 *  goes through syncSealDoc's own Customers ▸ owner ▸ SEAL ▸ container
 *  structure instead). depot_equipment/adhoc have no shipment or customer to
 *  resolve to — returns null, same as every other CloudSync caller does when
 *  there's no real entity to hang a folder off of. */
async function resolveEirCloudLink(
  tenantId: string,
  receipt: { release_document_id: string | null; subject_type: string; subject_id: string | null },
): Promise<EirCloudLink | null> {
  if (receipt.release_document_id) {
    const doc = await withTenant(tenantId, trx =>
      trx.selectFrom('delivery_documents').select(['subject_type', 'subject_id', 'customer_id'])
        .where('id', '=', receipt.release_document_id!).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (doc?.subject_type === 'shipment' && doc.subject_id) {
      const blRef = await resolveShipmentBlRef(tenantId, doc.subject_id);
      if (blRef) return { kind: 'shipment', shipmentId: doc.subject_id, customerId: doc.customer_id, blRef };
    }
  }

  if (receipt.subject_type === 'container_tracking' && receipt.subject_id) {
    const ct = await withTenant(tenantId, trx =>
      trx.selectFrom('container_tracking').select(['shipment_id'])
        .where('id', '=', receipt.subject_id!).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (ct?.shipment_id) {
      const shipment = await withTenant(tenantId, trx =>
        trx.selectFrom('shipment_cases').select(['customer_id'])
          .where('id', '=', ct.shipment_id).where('tenant_id', '=', tenantId).executeTakeFirst()
      );
      const blRef = await resolveShipmentBlRef(tenantId, ct.shipment_id);
      if (blRef) return { kind: 'shipment', shipmentId: ct.shipment_id, customerId: shipment?.customer_id ?? null, blRef };
    }
  }

  if (receipt.subject_type === 'seal_container' && receipt.subject_id) {
    return { kind: 'seal_container', containerId: receipt.subject_id };
  }

  return null;
}

async function resolveShipmentBlRef(tenantId: string, shipmentId: string): Promise<string | null> {
  const shipment = await withTenant(tenantId, trx =>
    trx.selectFrom('shipment_cases').select(['bl_number', 'awb_number', 'ref_number'])
      .where('id', '=', shipmentId).where('tenant_id', '=', tenantId).executeTakeFirst()
  );
  const ref = (shipment?.bl_number || shipment?.awb_number || shipment?.ref_number || '').trim();
  return ref || null;
}

export async function depotRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // Container/equipment depot management moved to live in HuduFreight
  // (gate movements are a fleet/trucking act — Interchange Receipts already
  // carry driver/vehicle fields) — see TrackingShell.tsx. ClearOS's own
  // pages reach this API directly when they need to (e.g. a shipment's
  // linked release document), same cross-app pattern as freight-booking.
  fastify.addHook('preHandler', requireEntitlement('tracking'));

  fastify.get('/equipment', async (request: any, reply) => {
    const { status } = request.query as { status?: string };
    try {
      return await listDepotEquipment(request.user.tenant_id, status);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/equipment', async (request: any, reply) => {
    const input = equipmentSchema.parse(request.body);
    try {
      return reply.status(201).send(await createDepotEquipment(request.user.tenant_id, request.user.sub, input));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/equipment/:id/status', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const { status } = z.object({ status: z.enum(['AVAILABLE', 'ALLOCATED', 'OUT', 'MAINTENANCE']) }).parse(request.body);
    try {
      return await updateDepotEquipmentStatus(request.user.tenant_id, id, status);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/interchange-receipts', async (request: any, reply) => {
    const { equipment_number, release_document_id } = request.query as { equipment_number?: string; release_document_id?: string };
    try {
      return await listInterchangeReceipts(request.user.tenant_id, equipment_number, release_document_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/interchange-receipts/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const row = await getInterchangeReceipt(request.user.tenant_id, id);
    if (!row) return reply.status(404).send({ error: 'Interchange receipt not found' });
    return row;
  });

  fastify.post('/interchange-receipts', async (request: any, reply) => {
    const input = interchangeSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    try {
      const receipt = await recordInterchange(tenantId, request.user.sub, { ...input, subjectId: input.subjectId ?? null });

      // File a real copy of the gate pass where the rest of a shipment's
      // paperwork lives — this used to only ever render fresh on GET
      // /:id/pdf with nowhere it was ever actually saved. An interchange
      // receipt is soft-linked (subject_type/subject_id, plus an optional
      // release_document_id), so the real shipment/customer it belongs to
      // has to be resolved the same way the receipt itself was linked —
      // only synced when that resolves to something real, same "no folder
      // without a real entity" rule CloudSync applies everywhere else.
      resolveEirCloudLink(tenantId, receipt).then(async (link) => {
        if (!link) return;
        const pdf = await renderEirPdf(tenantId, receipt.id);
        if (link.kind === 'shipment') {
          await CloudSync.syncShipmentDoc(tenantId, {
            customerId: link.customerId, shipmentId: link.shipmentId, blRef: link.blRef,
            filename: `${receipt.reference_number}.pdf`, buffer: pdf, mime: 'application/pdf',
          });
        } else {
          await CloudSync.syncSealDoc(tenantId, {
            sealType: 'container', sealId: link.containerId,
            filename: `${receipt.reference_number}.pdf`, buffer: pdf, mime: 'application/pdf',
          });
        }
      }).catch(err => console.error('[Cloud] EIR mirror failed:', err.message));

      return reply.status(201).send(receipt);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/interchange-receipts/:id/pdf', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const pdf = await renderEirPdf(request.user.tenant_id, id);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="eir-${id}.pdf"`);
      return reply.send(pdf);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}
