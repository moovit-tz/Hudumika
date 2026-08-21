import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import {
  searchDgReference, createDgDeclaration, listDgDeclarations, getDgDeclaration,
  issueDgDeclaration, renderDgDeclarationPdf,
} from '../services/dangerous-goods.service.js';

const createSchema = z.object({
  subjectType: z.enum(['shipment', 'seal_lot', 'adhoc']).default('adhoc'),
  subjectId: z.string().uuid().nullable().optional(),
  transportMode: z.enum(['AIR', 'SEA', 'ROAD']),
  unNumber: z.string().trim().min(1),
  packagingType: z.string().trim().optional(),
  numberOfPackages: z.number().int().positive().optional(),
  netQuantity: z.number().positive().optional(),
  quantityUnit: z.string().trim().optional(),
  shipperName: z.string().trim().min(1),
  shipperAddress: z.string().trim().optional(),
  consigneeName: z.string().trim().min(1),
  consigneeAddress: z.string().trim().optional(),
  emergencyContact: z.string().trim().optional(),
  additionalHandlingInfo: z.string().trim().optional(),
});

export async function dangerousGoodsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  fastify.get('/reference', async (request: any, reply) => {
    const { q } = request.query as { q?: string };
    try {
      return await searchDgReference(q || '');
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/declarations', async (request: any, reply) => {
    const { subject_type, subject_id } = request.query as { subject_type?: string; subject_id?: string };
    try {
      return await listDgDeclarations(request.user.tenant_id, {
        subjectType: subject_type as any,
        subjectId: subject_id,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/declarations/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const row = await getDgDeclaration(request.user.tenant_id, id);
    if (!row) return reply.status(404).send({ error: 'Declaration not found' });
    return row;
  });

  fastify.post('/declarations', async (request: any, reply) => {
    const input = createSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await createDgDeclaration(request.user.tenant_id, request.user.sub, {
          ...input,
          subjectId: input.subjectId ?? null,
        })
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/declarations/:id/issue', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await issueDgDeclaration(request.user.tenant_id, id, request.user.sub);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/declarations/:id/pdf', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const pdf = await renderDgDeclarationPdf(request.user.tenant_id, id);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="dg-declaration-${id}.pdf"`);
      return reply.send(pdf);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}
