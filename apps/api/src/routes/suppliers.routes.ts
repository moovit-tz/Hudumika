import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

// Real values from FinanceVendors.tsx's own CATEGORIES/STATUSES/TERMS arrays.
const supplierSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  contact_name: z.string().max(200).optional(),
  email: z.string().email().max(320).optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  tax_id: z.string().max(50).optional(),
  category: z.enum(['port_services', 'customs', 'freight', 'warehouse', 'transport', 'consulting', 'utility', 'other']).optional(),
  currency: z.string().max(10).optional(),
  payment_terms: z.enum(['cod', 'net_15', 'net_30', 'net_60', 'net_90', 'prepaid']).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
  bank_name: z.string().max(200).optional(),
  bank_account: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
});

export async function supplierRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // GET /v1/suppliers — list, optionally filtered by ?search=
  fastify.get('/', async (request) => {
    const user = request.user;
    const { search } = request.query as { search?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('suppliers').selectAll().where('tenant_id', '=', user.tenant_id);
      if (search) {
        const s = `%${search}%`;
        q = q.where((eb) =>
          eb.or([
            eb('name', 'ilike', s),
            eb('contact_name', 'ilike', s),
            eb('email', 'ilike', s),
          ]),
        );
      }
      return q.orderBy('name', 'asc').execute();
    });
  });

  // GET /v1/suppliers/:id
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const supplier = await trx
        .selectFrom('suppliers')
        .selectAll()
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!supplier) return reply.status(404).send({ error: 'Supplier not found' });
      return supplier;
    });
  });

  // POST /v1/suppliers — create a new supplier. Only `name` is required so
  // this can be used both from the full Vendors page and as a quick "create
  // new" action from Bill/PO pickers.
  fastify.post(
    '/',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') },
    async (request, reply) => {
      const user = request.user;
      const body = supplierSchema.extend({ name: z.string().trim().min(1).max(300) }).parse(request.body);

      return withTenant(user.tenant_id, async (trx) => {
        const supplier = await trx
          .insertInto('suppliers')
          .values({
            tenant_id: user.tenant_id,
            name: body.name,
            contact_name: body.contact_name || null,
            email: body.email || null,
            phone: body.phone || null,
            address: body.address || null,
            city: body.city || null,
            country: body.country || 'Tanzania',
            tax_id: body.tax_id || null,
            category: body.category || 'other',
            currency: body.currency || 'TZS',
            payment_terms: body.payment_terms || 'net_30',
            status: body.status || 'active',
            bank_name: body.bank_name || null,
            bank_account: body.bank_account || null,
            notes: body.notes || null,
            created_by: user.sub,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        return reply.status(201).send(supplier);
      });
    },
  );

  // PATCH /v1/suppliers/:id
  fastify.patch(
    '/:id',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      const body = supplierSchema.parse(request.body);

      const allowed = [
        'name', 'contact_name', 'email', 'phone', 'address', 'city', 'country',
        'tax_id', 'category', 'currency', 'payment_terms', 'status', 'bank_name',
        'bank_account', 'notes',
      ] as const;
      const patch: Record<string, any> = { updated_at: new Date() };
      for (const key of allowed) {
        if (key in body) patch[key] = body[key];
      }

      return withTenant(user.tenant_id, async (trx) => {
        const updated = await trx
          .updateTable('suppliers')
          .set(patch)
          .where('id', '=', id)
          .where('tenant_id', '=', user.tenant_id)
          .returningAll()
          .executeTakeFirst();

        if (!updated) return reply.status(404).send({ error: 'Supplier not found' });
        return updated;
      });
    },
  );

  // DELETE /v1/suppliers/:id — soft delete (mirrors the customers convention)
  fastify.delete(
    '/:id',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      return withTenant(user.tenant_id, async (trx) => {
        const updated = await trx
          .updateTable('suppliers')
          .set({ status: 'inactive', updated_at: new Date() })
          .where('id', '=', id)
          .where('tenant_id', '=', user.tenant_id)
          .returningAll()
          .executeTakeFirst();
        if (!updated) return reply.status(404).send({ error: 'Supplier not found' });
        return { success: true };
      });
    },
  );
}
