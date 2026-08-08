import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { TaxCodeNotFound, resolveLineTax } from '../services/tax-code.service.js';
import crypto from 'crypto';

const FIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;

export async function productRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // GET /v1/products
  fastify.get('/', async (request) => {
    const user = request.user;
    const { search, status } = request.query as { search?: string; status?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('products').selectAll().where('tenant_id', '=', user.tenant_id);
      if (status) q = q.where('status', '=', status);
      let rows = await q.orderBy('created_at', 'desc').execute();
      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(r =>
          r.name.toLowerCase().includes(s) ||
          r.code.toLowerCase().includes(s) ||
          (r.category || '').toLowerCase().includes(s)
        );
      }
      return rows;
    });
  });

  // GET /v1/products/:id
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('products').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Product not found' });
      return row;
    });
  });

  // POST /v1/products
  fastify.post('/', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    if (!body.name?.trim()) return reply.status(400).send({ error: 'name is required' });
    return withTenant(user.tenant_id, async (trx) => {
      // A tax code, when given, decides the rate — so the two can never
      // disagree on the same row.
      let tax: { tax_code_id: string | null; rate: number };
      try {
        tax = await resolveLineTax(trx, user.tenant_id,
          { tax_code_id: body.tax_code_id, tax_pct: body.tax_rate });
      } catch (e) {
        if (e instanceof TaxCodeNotFound) return reply.status(400).send({ error: e.message });
        throw e;
      }
      const row = await trx.insertInto('products').values({
        id: body.id || `PRD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        tenant_id: user.tenant_id,
        code: body.code || '',
        name: body.name.trim(),
        type: body.type || 'service',
        description: body.description || null,
        category: body.category || null,
        unit: body.unit || 'each',
        sale_price: body.sale_price || 0,
        purchase_price: body.purchase_price || 0,
        currency: body.currency || 'TZS',
        tax_rate: tax.rate,
        tax_code_id: tax.tax_code_id,
        status: body.status || 'active',
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  // PATCH /v1/products/:id
  fastify.patch('/:id', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('products').select(['id', 'tax_rate', 'tax_code_id'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Product not found' });
      const updates: any = { updated_at: new Date() };
      const fields = ['code', 'name', 'type', 'description', 'category', 'unit', 'sale_price', 'purchase_price', 'currency', 'status'];
      for (const f of fields) if (body[f] !== undefined) updates[f] = body[f];

      // tax_rate and tax_code_id move together or not at all — patching one
      // without the other is how they drift apart.
      if (body.tax_code_id !== undefined) {
        try {
          const tax = await resolveLineTax(trx, user.tenant_id, { tax_code_id: body.tax_code_id });
          updates.tax_rate = tax.tax_code_id ? tax.rate : (body.tax_rate ?? existing.tax_rate);
          updates.tax_code_id = tax.tax_code_id;
        } catch (e) {
          if (e instanceof TaxCodeNotFound) return reply.status(400).send({ error: e.message });
          throw e;
        }
      } else if (body.tax_rate !== undefined) {
        // A bare rate change from an older client. Keep the treatment only if
        // it still agrees with the new rate; a code that no longer matches its
        // own rate is the exact ambiguity this table exists to remove.
        const newRate = Number(body.tax_rate) || 0;
        updates.tax_rate = newRate;
        if (existing.tax_code_id && Number(existing.tax_rate) !== newRate) {
          updates.tax_code_id = null;
        }
      }
      const row = await trx.updateTable('products').set(updates).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      return row;
    });
  });

  // DELETE /v1/products/:id
  fastify.delete('/:id', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('products').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Product not found' });
      await trx.deleteFrom('products').where('id', '=', id).execute();
      return reply.status(204).send();
    });
  });
}
