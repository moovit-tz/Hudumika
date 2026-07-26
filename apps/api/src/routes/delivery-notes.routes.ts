import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

export async function deliveryNoteRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // GET /v1/delivery-notes
  fastify.get('/', async (request: any, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const dns = await trx
        .selectFrom('delivery_notes')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
      return { delivery_notes: dns };
    });
  });

  // POST /v1/delivery-notes
  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const user = request.user;
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const items = Array.isArray(body.lines) ? body.lines : [];

      const dn = await trx
        .insertInto('delivery_notes')
        .values({
          tenant_id: user.tenant_id,
          dn_number: body.dn_number || `DN-${Date.now()}`,
          invoice_id: body.invoice_id || null,
          customer_id: body.customer_id || null,
          customer_name: body.customer_name || null,
          delivery_date: body.delivery_date ? new Date(body.delivery_date) : null,
          status: body.status || 'DRAFT',
          notes: body.notes || null,
          created_by: user.sub,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (items.length > 0) {
        await trx
          .insertInto('delivery_note_lines')
          .values(
            items.map((it: any, i: number) => ({
              dn_id: dn.id,
              description: it.description || '',
              qty_ordered: Number(it.qty_ordered) || 0,
              qty_delivered: Number(it.qty_delivered) || 0,
              unit: it.unit || null,
              notes: it.notes || null,
              sort_order: i,
            }))
          )
          .execute();
      }

      return reply.status(201).send(dn);
    });
  });

  // GET /v1/delivery-notes/:id
  fastify.get('/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const dn = await trx
        .selectFrom('delivery_notes')
        .selectAll()
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      
      if (!dn) return reply.status(404).send({ error: 'Delivery note not found' });

      const lines = await trx
        .selectFrom('delivery_note_lines')
        .selectAll()
        .where('dn_id', '=', id)
        .orderBy('sort_order', 'asc')
        .execute();

      return { ...dn, lines };
    });
  });

  // PATCH /v1/delivery-notes/:id
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx
        .selectFrom('delivery_notes')
        .select('id')
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!existing) return reply.status(404).send({ error: 'Delivery note not found' });

      const updates: any = { updated_at: new Date() };
      const fields = ['dn_number', 'invoice_id', 'customer_id', 'customer_name', 'delivery_date', 'status', 'notes'];
      for (const f of fields) {
        if (body[f] !== undefined) {
          updates[f] = f === 'delivery_date' && body[f] ? new Date(body[f]) : body[f];
        }
      }

      if (Array.isArray(body.lines)) {
        const items = body.lines;
        await trx.deleteFrom('delivery_note_lines').where('dn_id', '=', id).execute();
        if (items.length > 0) {
          await trx
            .insertInto('delivery_note_lines')
            .values(
              items.map((it: any, i: number) => ({
                dn_id: id,
                description: it.description || '',
                qty_ordered: Number(it.qty_ordered) || 0,
                qty_delivered: Number(it.qty_delivered) || 0,
                unit: it.unit || null,
                notes: it.notes || null,
                sort_order: i,
              }))
            )
            .execute();
        }
      }

      await trx.updateTable('delivery_notes').set(updates).where('id', '=', id).execute();
      const dn = await trx.selectFrom('delivery_notes').selectAll().where('id', '=', id).executeTakeFirst();
      return dn;
    });
  });

  // PATCH /v1/delivery-notes/:id/status
  fastify.patch('/:id/status', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx
        .updateTable('delivery_notes')
        .set({ status, updated_at: new Date() })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();
      return { success: true };
    });
  });

  // DELETE /v1/delivery-notes/:id
  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx
        .selectFrom('delivery_notes')
        .select('id')
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!existing) return reply.status(404).send({ error: 'Delivery note not found' });

      await trx.deleteFrom('delivery_notes').where('id', '=', id).execute();
      return { success: true };
    });
  });
}
