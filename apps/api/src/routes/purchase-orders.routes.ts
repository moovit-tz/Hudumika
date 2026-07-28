import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { getNextDocNumber } from '../lib/doc-numbering.js';

export async function purchaseOrderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // GET /v1/purchase-orders
  fastify.get('/', async (request: any, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const pos = await trx
        .selectFrom('purchase_orders')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
      return { purchase_orders: pos };
    });
  });

  // POST /v1/purchase-orders
  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const user = request.user;
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const items = Array.isArray(body.lines) ? body.lines : [];
      let subtotal = 0;
      let tax_amount = 0;
      for (const it of items) {
        const lineSub = Number(it.qty || 1) * Number(it.unit_price || 0);
        const lineTax = lineSub * (Number(it.tax_rate || 0) / 100);
        subtotal += lineSub;
        tax_amount += lineTax;
      }
      const total = subtotal + tax_amount;
      const poNumber = body.po_number || await getNextDocNumber(trx, user.tenant_id, 'purchase_order');

      const po = await trx
        .insertInto('purchase_orders')
        .values({
          tenant_id: user.tenant_id,
          po_number: poNumber,
          supplier_id: body.supplier_id || null,
          supplier_name: body.supplier_name || null,
          status: body.status || 'DRAFT',
          order_date: body.order_date ? new Date(body.order_date) : null,
          expected_date: body.expected_date ? new Date(body.expected_date) : null,
          currency: body.currency || 'TZS',
          subtotal,
          tax_amount,
          total,
          notes: body.notes || null,
          warehouse_id: body.warehouse_id || null,
          warehouse_name: body.warehouse_name || null,
          payment_terms: body.payment_terms || null,
          created_by: user.sub,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (items.length > 0) {
        await trx
          .insertInto('purchase_order_lines')
          .values(
            items.map((it: any, i: number) => {
              const lineSub = Number(it.qty || 1) * Number(it.unit_price || 0);
              const lineTax = lineSub * (Number(it.tax_rate || 0) / 100);
              return {
                po_id: po.id,
                description: it.description || '',
                category: it.category || null,
                qty: Number(it.qty) || 1,
                unit_price: Number(it.unit_price) || 0,
                tax_rate: Number(it.tax_rate) || 0,
                tax_amount: lineTax,
                line_total: lineSub + lineTax,
                received_qty: Number(it.received_qty) || 0,
                sort_order: i,
              };
            })
          )
          .execute();
      }

      return reply.status(201).send(po);
    });
  });

  // GET /v1/purchase-orders/:id
  fastify.get('/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const po = await trx
        .selectFrom('purchase_orders')
        .selectAll()
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      
      if (!po) return reply.status(404).send({ error: 'Purchase order not found' });

      const lines = await trx
        .selectFrom('purchase_order_lines')
        .selectAll()
        .where('po_id', '=', id)
        .orderBy('sort_order', 'asc')
        .execute();

      return { ...po, lines };
    });
  });

  // PATCH /v1/purchase-orders/:id
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx
        .selectFrom('purchase_orders')
        .select('id')
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!existing) return reply.status(404).send({ error: 'Purchase order not found' });

      const updates: any = { updated_at: new Date() };
      const fields = ['po_number', 'supplier_id', 'supplier_name', 'status', 'order_date', 'expected_date', 'currency', 'notes', 'warehouse_id', 'warehouse_name', 'payment_terms'];
      for (const f of fields) {
        if (body[f] !== undefined) {
          updates[f] = (f === 'order_date' || f === 'expected_date') && body[f] ? new Date(body[f]) : body[f];
        }
      }

      if (Array.isArray(body.lines)) {
        const items = body.lines;
        let subtotal = 0;
        let tax_amount = 0;
        for (const it of items) {
          const lineSub = Number(it.qty || 1) * Number(it.unit_price || 0);
          const lineTax = lineSub * (Number(it.tax_rate || 0) / 100);
          subtotal += lineSub;
          tax_amount += lineTax;
        }
        updates.subtotal = subtotal;
        updates.tax_amount = tax_amount;
        updates.total = subtotal + tax_amount;

        await trx.deleteFrom('purchase_order_lines').where('po_id', '=', id).execute();
        if (items.length > 0) {
          await trx
            .insertInto('purchase_order_lines')
            .values(
              items.map((it: any, i: number) => {
                const lineSub = Number(it.qty || 1) * Number(it.unit_price || 0);
                const lineTax = lineSub * (Number(it.tax_rate || 0) / 100);
                return {
                  po_id: id,
                  description: it.description || '',
                  category: it.category || null,
                  qty: Number(it.qty) || 1,
                  unit_price: Number(it.unit_price) || 0,
                  tax_rate: Number(it.tax_rate) || 0,
                  tax_amount: lineTax,
                  line_total: lineSub + lineTax,
                  received_qty: Number(it.received_qty) || 0,
                  sort_order: i,
                };
              })
            )
            .execute();
        }
      }

      await trx.updateTable('purchase_orders').set(updates).where('id', '=', id).execute();
      const po = await trx.selectFrom('purchase_orders').selectAll().where('id', '=', id).executeTakeFirst();
      return po;
    });
  });

  // PATCH /v1/purchase-orders/:id/status
  fastify.patch('/:id/status', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx
        .updateTable('purchase_orders')
        .set({ status, updated_at: new Date() })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();
      return { success: true };
    });
  });

  // DELETE /v1/purchase-orders/:id
  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx
        .selectFrom('purchase_orders')
        .select('id')
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!existing) return reply.status(404).send({ error: 'Purchase order not found' });

      await trx.deleteFrom('purchase_orders').where('id', '=', id).execute();
      return { success: true };
    });
  });
}
