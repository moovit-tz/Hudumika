import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

export async function billRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── Stats ─────────────────────────────────────────────────────────────────

  // GET /v1/bills/stats  (must be before /:id)
  fastify.get('/stats', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('supplier_bills').selectAll().where('tenant_id', '=', user.tenant_id).execute();
      const total_bills = rows.length;
      const status_counts: Record<string, number> = {};
      let total_paid = 0;
      let total_outstanding = 0;
      for (const r of rows) {
        const s = r.status as string;
        status_counts[s] = (status_counts[s] || 0) + 1;
        total_paid += Number(r.paid_amount) || 0;
        total_outstanding += Math.max(0, Number(r.total) - Number(r.paid_amount));
      }
      return { total_bills, total_paid, total_outstanding, status_counts };
    });
  });

  // ── Recurring Bills ───────────────────────────────────────────────────────

  // GET /v1/bills/recurring  (must be before /:id)
  fastify.get('/recurring', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('recurring_bills')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
    });
  });

  // POST /v1/bills/recurring
  fastify.post('/recurring', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const rec = await trx.insertInto('recurring_bills').values({
        tenant_id: user.tenant_id,
        name: body.name || null,
        supplier_id: body.supplier_id || null,
        supplier_name: body.supplier_name || null,
        frequency: body.frequency || 'MONTHLY',
        currency: body.currency || 'USD',
        amount: Number(body.amount) || 0,
        tax_rate: Number(body.tax_rate) || 0,
        category: body.category || 'OTHER',
        description: body.description || null,
        payment_terms: body.payment_terms || null,
        next_due: body.next_due || null,
        end_date: body.end_date || null,
        state: body.state || 'ACTIVE',
        bills_generated: 0,
        total_spend: 0,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(rec);
    });
  });

  // PATCH /v1/bills/recurring/:id
  fastify.patch('/recurring/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('recurring_bills').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Recurring bill not found' });
      const updates: any = { updated_at: new Date() };
      const fields = ['name', 'supplier_id', 'supplier_name', 'frequency', 'currency', 'amount', 'tax_rate', 'category', 'description', 'payment_terms', 'next_due', 'end_date', 'state'];
      for (const f of fields) {
        if (body[f] !== undefined) updates[f] = body[f];
      }
      const rec = await trx.updateTable('recurring_bills').set(updates).where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
      return rec;
    });
  });

  // DELETE /v1/bills/recurring/:id
  fastify.delete('/recurring/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('recurring_bills').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Recurring bill not found' });
      await trx.deleteFrom('recurring_bills').where('id', '=', id).execute();
      return { success: true };
    });
  });

  // ── Supplier Bills ────────────────────────────────────────────────────────

  // GET /v1/bills
  fastify.get('/', async (request) => {
    const user = request.user;
    const { status, search, supplier_id } = request.query as { status?: string; search?: string; supplier_id?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('supplier_bills').selectAll().where('tenant_id', '=', user.tenant_id);
      if (status) q = q.where('status', '=', status);
      if (supplier_id) q = q.where('supplier_id', '=', supplier_id);
      const rows = await q.orderBy('created_at', 'desc').execute();
      if (search) {
        const s = search.toLowerCase();
        return rows.filter(r =>
          (r.supplier_name || '').toLowerCase().includes(s) ||
          (r.bill_number || '').toLowerCase().includes(s)
        );
      }
      return rows;
    });
  });

  // POST /v1/bills
  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      // Compute totals from lines
      const items: any[] = Array.isArray(body.items) ? body.items : [];
      let subtotal = 0;
      let tax_amount = 0;
      for (const it of items) {
        const lineSubtotal = Number(it.qty || 1) * Number(it.unit_price || 0);
        const lineTax = lineSubtotal * (Number(it.tax_rate || 0) / 100);
        subtotal += lineSubtotal;
        tax_amount += lineTax;
      }
      const total = subtotal + tax_amount;

      const bill = await trx.insertInto('supplier_bills').values({
        tenant_id: user.tenant_id,
        bill_number: body.bill_number || `BILL-${Date.now()}`,
        supplier_id: body.supplier_id || null,
        supplier_name: body.supplier_name || null,
        shipment_ref: body.shipment_ref || null,
        po_number: body.po_number || null,
        bill_date: body.bill_date || null,
        due_date: body.due_date || null,
        status: body.status || 'DRAFT',
        currency: body.currency || 'USD',
        subtotal,
        tax_amount,
        total,
        paid_amount: 0,
        recurring_id: body.recurring_id || null,
        notes: body.notes || null,
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      if (items.length > 0) {
        await trx.insertInto('supplier_bill_lines').values(
          items.map((it: any, i: number) => ({
            bill_id: bill.id,
            description: it.description || '',
            category: it.category || 'OTHER',
            qty: Number(it.qty) || 1,
            unit_price: Number(it.unit_price) || 0,
            tax_rate: Number(it.tax_rate) || 0,
            sort_order: i,
          }))
        ).execute();
      }
      return reply.status(201).send(bill);
    });
  });

  // GET /v1/bills/:id  (after /stats and /recurring to avoid route conflict)
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const bill = await trx.selectFrom('supplier_bills').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!bill) return reply.status(404).send({ error: 'Bill not found' });
      const lines = await trx.selectFrom('supplier_bill_lines').selectAll().where('bill_id', '=', id).orderBy('sort_order', 'asc').execute();
      const payments = await trx.selectFrom('bill_payments').selectAll().where('bill_id', '=', id).orderBy('created_at', 'desc').execute();
      return { ...bill, items: lines, payments };
    });
  });

  // PATCH /v1/bills/:id
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('supplier_bills').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Bill not found' });

      const updates: any = { updated_at: new Date() };
      const fields = ['bill_number', 'supplier_id', 'supplier_name', 'shipment_ref', 'po_number', 'bill_date', 'due_date', 'status', 'currency', 'notes', 'recurring_id'];
      for (const f of fields) {
        if (body[f] !== undefined) updates[f] = body[f];
      }

      // Recompute totals if lines provided
      if (Array.isArray(body.items)) {
        const items: any[] = body.items;
        let subtotal = 0;
        let tax_amount = 0;
        for (const it of items) {
          const lineSubtotal = Number(it.qty || 1) * Number(it.unit_price || 0);
          const lineTax = lineSubtotal * (Number(it.tax_rate || 0) / 100);
          subtotal += lineSubtotal;
          tax_amount += lineTax;
        }
        updates.subtotal = subtotal;
        updates.tax_amount = tax_amount;
        updates.total = subtotal + tax_amount;

        await trx.deleteFrom('supplier_bill_lines').where('bill_id', '=', id).execute();
        if (items.length > 0) {
          await trx.insertInto('supplier_bill_lines').values(
            items.map((it: any, i: number) => ({
              bill_id: id,
              description: it.description || '',
              category: it.category || 'OTHER',
              qty: Number(it.qty) || 1,
              unit_price: Number(it.unit_price) || 0,
              tax_rate: Number(it.tax_rate) || 0,
              sort_order: i,
            }))
          ).execute();
        }
      }

      await trx.updateTable('supplier_bills').set(updates).where('id', '=', id).execute();
      const bill = await trx.selectFrom('supplier_bills').selectAll().where('id', '=', id).executeTakeFirst();
      return bill;
    });
  });

  // DELETE /v1/bills/:id
  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('supplier_bills').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Bill not found' });
      await trx.deleteFrom('supplier_bills').where('id', '=', id).execute();
      return { success: true };
    });
  });

  // POST /v1/bills/:id/payment
  fastify.post('/:id/payment', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { amount, currency, payment_date, method, reference, note } = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const bill = await trx.selectFrom('supplier_bills').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!bill) return reply.status(404).send({ error: 'Bill not found' });

      await trx.insertInto('bill_payments').values({
        tenant_id: user.tenant_id,
        bill_id: id,
        amount: Number(amount),
        currency: currency || bill.currency || 'USD',
        payment_date: payment_date || null,
        method: method || null,
        reference: reference || null,
        note: note || null,
        created_by: user.sub,
      }).execute();

      // Recalculate paid_amount from all payments
      const payments = await trx.selectFrom('bill_payments').select('amount').where('bill_id', '=', id).execute();
      const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
      const billTotal = Number(bill.total) || 0;

      let newStatus: string;
      if (totalPaid >= billTotal && billTotal > 0) newStatus = 'PAID';
      else if (totalPaid > 0) newStatus = 'PARTIAL';
      else newStatus = 'POSTED';

      await trx.updateTable('supplier_bills').set({ paid_amount: totalPaid, status: newStatus, updated_at: new Date() }).where('id', '=', id).execute();
      return { success: true, paid_amount: totalPaid, status: newStatus };
    });
  });
}
