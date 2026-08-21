import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import {
  createDepotEquipment, listDepotEquipment, updateDepotEquipmentStatus,
  recordInterchange, listInterchangeReceipts, getInterchangeReceipt, renderEirPdf,
} from '../services/depot.service.js';

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
    try {
      return reply.status(201).send(
        await recordInterchange(request.user.tenant_id, request.user.sub, { ...input, subjectId: input.subjectId ?? null })
      );
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
