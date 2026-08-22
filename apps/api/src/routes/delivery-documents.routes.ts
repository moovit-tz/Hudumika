import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import {
  createDeliveryDocument, listDeliveryDocuments, getDeliveryDocument, updateDeliveryDocument,
  issueDeliveryDocument, markDeliveryDocumentUsed, setDeliveryDocumentStatus, deleteDeliveryDocument,
  renderDeliveryDocumentPdf,
} from '../services/delivery-document.service.js';
import { CloudSync } from '../services/cloud-sync.service.js';
import { withTenant } from '../db/client.js';

const containerSchema = z.object({
  number: z.string().trim().min(1),
  size: z.enum(['20FT', '40FT', '40HC', 'OTHER']),
  seal_number: z.string().trim().optional(),
  weight_kg: z.number().positive().optional(),
});
const lineSchema = z.object({
  description: z.string().max(500).optional(),
  qty_ordered: z.number().optional(),
  qty_delivered: z.number().optional(),
  unit: z.string().max(50).optional(),
  condition: z.string().max(50).optional(),
  remarks: z.string().max(2000).optional(),
});

const createSchema = z.object({
  docType: z.enum(['RELEASE_ORDER', 'DELIVERY_ORDER', 'DELIVERY_NOTE']),
  subjectType: z.enum(['shipment', 'adhoc']).default('adhoc'),
  subjectId: z.string().uuid().nullable().optional(),
  invoiceId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().max(300).optional(),
  customerAddress: z.string().max(2000).optional(),
  contactPerson: z.string().max(200).optional(),
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().max(320).optional(),
  deliveryAddress: z.string().max(2000).optional(),
  city: z.string().max(100).optional(),
  containers: z.array(containerSchema).optional(),
  carrierName: z.string().max(200).optional(),
  vesselVoyage: z.string().max(200).optional(),
  driverName: z.string().max(200).optional(),
  vehicleNo: z.string().max(50).optional(),
  driverContact: z.string().max(50).optional(),
  releaseConditions: z.string().max(2000).optional(),
  discrepancyNotes: z.string().max(2000).optional(),
  validFrom: z.string().trim().optional(),
  validUntil: z.string().trim().optional(),
  deliveryDate: z.string().trim().optional(),
  lines: z.array(lineSchema).optional(),
});
const updateSchema = createSchema.omit({ docType: true }).partial().extend({
  status: z.string().optional(),
});
const statusSchema = z.object({ status: z.string() });

export async function deliveryDocumentsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // Reachable from both ClearOS (release/delivery orders originate from a
  // customs clearance case) and FinOps (delivery notes tie to an invoice) —
  // same standing rule as every other page mounted in two apps' nav this
  // session: gate on requireAnyEntitlement, not a single app's key.
  fastify.addHook('preHandler', requireAnyEntitlement(['clearos', 'finops']));

  fastify.get('/', async (request: any, reply) => {
    const { shipment_id, doc_type, status } = request.query as { shipment_id?: string; doc_type?: string; status?: string };
    try {
      return await listDeliveryDocuments(request.user.tenant_id, { subjectId: shipment_id, docType: doc_type as any, status });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const row = await getDeliveryDocument(request.user.tenant_id, id);
    if (!row) return reply.status(404).send({ error: 'Delivery document not found' });
    return row;
  });

  fastify.post('/', async (request: any, reply) => {
    const input = createSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await createDeliveryDocument(request.user.tenant_id, request.user.sub, { ...input, subjectId: input.subjectId ?? null })
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const input = updateSchema.parse(request.body);
    try {
      return await updateDeliveryDocument(request.user.tenant_id, id, input);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id/status', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const { status } = statusSchema.parse(request.body);
    try {
      return await setDeliveryDocumentStatus(request.user.tenant_id, id, status);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id/issue', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const doc = await issueDeliveryDocument(request.user.tenant_id, id, request.user.sub);

      // Mirror the real issued PDF into the shipment's own Cloud folder —
      // renderDeliveryDocumentPdf/GET /:id/pdf regenerated this on every
      // request with nowhere it ever actually landed; an issued release
      // order/delivery note is a real, final document from here on (status
      // only ever moves forward: draft -> issued -> used), so it's worth a
      // persisted copy, not just a live re-render. Only when there's a real
      // shipment to file it under — an 'adhoc' document has no BL/AWB folder
      // to put it in, same reasoning CloudSync itself already applies
      // everywhere else (no folder without a real entity behind it). A sync
      // failure must never fail the issuance it's riding on.
      if (doc.subject_type === 'shipment' && doc.subject_id) {
        try {
          const shipment = await withTenant(request.user.tenant_id, trx =>
            trx.selectFrom('shipment_cases').select(['bl_number', 'awb_number', 'ref_number'])
              .where('id', '=', doc.subject_id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst()
          );
          const blRef = (shipment?.bl_number || shipment?.awb_number || shipment?.ref_number || '').trim();
          if (blRef) {
            const pdf = await renderDeliveryDocumentPdf(request.user.tenant_id, id);
            await CloudSync.syncShipmentDoc(request.user.tenant_id, {
              customerId: doc.customer_id ?? null,
              shipmentId: doc.subject_id,
              blRef,
              filename: `${doc.doc_number}.pdf`,
              buffer: pdf,
              mime: 'application/pdf',
            });
          }
        } catch (err: any) {
          request.log.warn({ err: err.message, docId: id }, '[DeliveryDocuments] Cloud mirror failed — issuance still succeeded');
        }
      }

      return doc;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id/mark-used', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await markDeliveryDocumentUsed(request.user.tenant_id, id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await deleteDeliveryDocument(request.user.tenant_id, id);
    if (!deleted) return reply.status(404).send({ error: 'Delivery document not found' });
    return reply.status(204).send();
  });

  fastify.get('/:id/pdf', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const pdf = await renderDeliveryDocumentPdf(request.user.tenant_id, id);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="delivery-document-${id}.pdf"`);
      return reply.send(pdf);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}
