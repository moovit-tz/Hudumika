import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import {
  issueWarranty, voidWarranty, fileWarrantyClaim, reviewWarrantyClaim, resolveWarrantyClaim,
} from '../services/warranty.service.js';
import { InvalidMovement, UnknownUom } from '../services/inventory.service.js';

// Same roster as POS (issuing/filing is routine front-of-house work);
// review/resolve is the narrower manager/finance tier, since resolution
// moves real inventory or real cash.
const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;
const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'] as const;
const refundMethod = z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK', 'OTHER']);

export async function warrantyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAnyEntitlement(['finops', 'finance.core']));

  fastify.get('/', async (request) => {
    const user = request.user;
    const { customer_id } = z.object({ customer_id: z.string().uuid().optional() }).parse(request.query);
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('warranties').selectAll().where('tenant_id', '=', user.tenant_id);
      if (customer_id) q = q.where('customer_id', '=', customer_id);
      return q.orderBy('created_at', 'desc').execute();
    });
  });

  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return withTenant(user.tenant_id, async (trx) => {
      const warranty = await trx.selectFrom('warranties').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!warranty) return reply.status(404).send({ error: 'Warranty not found.' });
      const claims = await trx.selectFrom('warranty_claims').selectAll().where('tenant_id', '=', user.tenant_id).where('warranty_id', '=', id).orderBy('created_at', 'desc').execute();
      return { ...warranty, claims: claims.map(c => ({ ...c, refund_amount: c.refund_amount == null ? null : Number(c.refund_amount) })) };
    });
  });

  fastify.post('/', { preHandler: requireRole(...STAFF_ROLES) }, async (request) => {
    const user = request.user;
    const body = z.object({
      customer_id: z.string().uuid(),
      product_id: z.string().uuid().nullable().optional(),
      source_type: z.enum(['pos_sale', 'invoice', 'manual']).optional(),
      source_id: z.string().uuid().nullable().optional(),
      serial_number: z.string().trim().max(200).nullable().optional(),
      warranty_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      warranty_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      terms: z.string().trim().max(2000).nullable().optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, trx => issueWarranty(trx, user.tenant_id, {
      customerId: body.customer_id, productId: body.product_id, sourceType: body.source_type, sourceId: body.source_id,
      serialNumber: body.serial_number, warrantyStart: body.warranty_start, warrantyEnd: body.warranty_end,
      terms: body.terms, actorId: user.sub,
    }));
  });

  fastify.post('/:id/void', { preHandler: requireRole(...MANAGER_ROLES) }, async (request) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await withTenant(user.tenant_id, trx => voidWarranty(trx, user.tenant_id, id));
    return { success: true };
  });

  fastify.post('/:id/claims', { preHandler: requireRole(...STAFF_ROLES) }, async (request) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ description: z.string().trim().min(3).max(2000) }).parse(request.body);
    return withTenant(user.tenant_id, trx => fileWarrantyClaim(trx, user.tenant_id, { warrantyId: id, description: body.description, actorId: user.sub }));
  });

  fastify.post('/claims/:id/review', { preHandler: requireRole(...MANAGER_ROLES) }, async (request) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(2000).optional() }).parse(request.body);
    return withTenant(user.tenant_id, trx => reviewWarrantyClaim(trx, user.tenant_id, { claimId: id, decision: body.decision, note: body.note, actorId: user.sub }));
  });

  fastify.post('/claims/:id/resolve', { preHandler: requireRole(...MANAGER_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.discriminatedUnion('resolution_type', [
      z.object({ resolution_type: z.literal('repair'), location_id: z.string().uuid(), item_id: z.string().uuid(), qty: z.number().positive(), uom: z.string().min(1).max(20), note: z.string().trim().max(2000).optional() }),
      z.object({ resolution_type: z.literal('replace'), location_id: z.string().uuid(), item_id: z.string().uuid(), qty: z.number().positive(), uom: z.string().min(1).max(20), note: z.string().trim().max(2000).optional() }),
      z.object({ resolution_type: z.literal('refund'), amount: z.number().positive(), method: refundMethod, note: z.string().trim().max(2000).optional() }),
    ]).parse(request.body);

    try {
      const claim = await withTenant(user.tenant_id, trx => {
        if (body.resolution_type === 'refund') {
          return resolveWarrantyClaim(trx, user.tenant_id, id, user.sub, { resolutionType: 'refund', amount: body.amount, method: body.method, note: body.note });
        }
        return resolveWarrantyClaim(trx, user.tenant_id, id, user.sub, {
          resolutionType: body.resolution_type, locationId: body.location_id, itemId: body.item_id, qty: body.qty, uom: body.uom, note: body.note,
        });
      });
      return { ...claim, refund_amount: claim.refund_amount == null ? null : Number(claim.refund_amount) };
    } catch (error: any) {
      if (error instanceof UnknownUom || error instanceof InvalidMovement || error?.statusCode) {
        return reply.status(error.statusCode ?? 422).send({ error: error.message });
      }
      throw error;
    }
  });
}
