import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { getNextDocNumber } from '../lib/doc-numbering.js';
import { isTaxCodeUserError, resolveTaxCode } from '../services/tax-code.service.js';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';


/**
 * Resolve a purchase order's tax codes and build its lines.
 *
 * A PO is a commitment, not yet a claim — it posts nothing to the ledger — but
 * it becomes a bill, and the treatment should not have to be re-entered there.
 * `purchase_order_lines.tax_code_id` has existed since migration 181 and was
 * simply never read.
 *
 * Same discipline as the bill routes: resolved before any write, because a
 * reply returned from inside `withTenant` still commits the transaction.
 */
async function buildPoLines(
  trx: Transaction<Database>,
  tenantId: string,
  poId: string,
  items: any[],
): Promise<
  | { ok: false; error: string }
  | { ok: true; lines: any[]; subtotal: number; tax: number }
> {
  const codeIds = [...new Set(items.map(it => it?.tax_code_id).filter(Boolean))] as string[];
  const codes = new Map<string, { id: string; rate: number }>();
  for (const cid of codeIds) {
    try {
      const c = await resolveTaxCode(trx, tenantId, cid, 'PURCHASE');
      codes.set(cid, { id: c.id, rate: Number(c.rate) });
    } catch (e) {
      if (isTaxCodeUserError(e)) return { ok: false as const, error: e.message };
      throw e;
    }
  }

  let subtotal = 0, tax = 0;
  const lines = items.map((it: any, i: number) => {
    const code = it.tax_code_id ? codes.get(it.tax_code_id) : undefined;
    // A code, when given, decides the rate — the two can never disagree.
    const rate = code ? code.rate : (Number(it.tax_rate) || 0);
    const lineSub = (Number(it.qty) || 1) * (Number(it.unit_price) || 0);
    const lineTax = lineSub * (rate / 100);
    subtotal += lineSub;
    tax += lineTax;
    return {
      po_id: poId,
      description: it.description || '',
      category: it.category || null,
      qty: Number(it.qty) || 1,
      unit_price: Number(it.unit_price) || 0,
      tax_rate: rate,
      tax_code_id: code ? code.id : null,
      tax_amount: lineTax,
      line_total: lineSub + lineTax,
      received_qty: Number(it.received_qty) || 0,
      sort_order: i,
    };
  });
  return { ok: true as const, lines, subtotal, tax };
}

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
      const built = await buildPoLines(trx, user.tenant_id, '', items);
      if (!built.ok) return reply.status(400).send({ error: built.error });
      const subtotal = built.subtotal;
      const tax_amount = built.tax;
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

      if (built.lines.length > 0) {
        await trx
          .insertInto('purchase_order_lines')
          .values(built.lines.map(l => ({ ...l, po_id: po.id })))
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

      // Resolved before the delete below — a 400 returned from inside
      // withTenant still commits, so validating afterwards would leave the
      // order with no lines at all.
      const rebuilt = await buildPoLines(trx, user.tenant_id, id, Array.isArray(body.lines) ? body.lines : []);
      if (!rebuilt.ok) return reply.status(400).send({ error: rebuilt.error });

      if (Array.isArray(body.lines)) {
        updates.subtotal = rebuilt.subtotal;
        updates.tax_amount = rebuilt.tax;
        updates.total = rebuilt.subtotal + rebuilt.tax;

        await trx.deleteFrom('purchase_order_lines').where('po_id', '=', id).execute();
        if (rebuilt.lines.length > 0) {
          await trx
            .insertInto('purchase_order_lines')
            .values(rebuilt.lines)
            .execute();
        }
      }

      await trx.updateTable('purchase_orders').set(updates).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      const po = await trx.selectFrom('purchase_orders').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
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
