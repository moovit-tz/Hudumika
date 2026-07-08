import { requireAppEnabled } from '../middleware/appGate.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { sql, type SqlBool } from 'kysely';
import { GLService } from '../services/gl.service.js';
import { AccountingIntegrationService } from '../services/accounting-integration.service.js';
import { TRAService } from '../services/tra.service.js';

export async function invoiceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAppEnabled('finops'));

  // GET /v1/invoices/stats
  fastify.get('/stats', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('sales_invoices').selectAll().where('tenant_id', '=', user.tenant_id).execute();
      const total_invoices = rows.length;
      const status_counts: Record<string, number> = {};
      let total_received = 0;
      for (const r of rows) {
        const s = r.status as string;
        status_counts[s] = (status_counts[s] || 0) + 1;
        total_received += Number(r.received) || 0;
      }
      return { total_invoices, total_received, status_counts };
    });
  });

  // GET /v1/invoices
  fastify.get('/', async (request) => {
    const user = request.user;
    const { status, search } = request.query as { status?: string; search?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('sales_invoices').selectAll().where('tenant_id', '=', user.tenant_id);
      if (status) q = q.where('status', '=', status);
      const rows = await q.orderBy('created_at', 'desc').execute();
      if (search) {
        const s = search.toLowerCase();
        return rows.filter(r => (r.client_name || '').toLowerCase().includes(s) || (r.invoice_number || '').toLowerCase().includes(s));
      }
      return rows;
    });
  });

  // GET /v1/invoices/report
  fastify.get('/report', async (request) => {
    const user = request.user as any;
    const { report_type, date_from, date_to, customer_id, status } = request.query as {
      report_type?: string;
      date_from?: string;
      date_to?: string;
      customer_id?: string;
      status?: string;
    };

    return withTenant(user.tenant_id, async (trx) => {
      const type = report_type || 'receivables';
      let data: any[] = [];

      if (type === 'receivables') {
        let q = trx
          .selectFrom('sales_invoices')
          .select([
            'invoice_number',
            'client_name',
            'bill_date as issue_date',
            'due_date',
            'status',
            'received as paid_amount',
          ])
          .where('tenant_id', '=', user.tenant_id);
        if (date_from) q = q.where('bill_date', '>=', new Date(date_from));
        if (date_to) q = q.where('bill_date', '<=', new Date(date_to));
        if (status) q = q.where('status', '=', status);
        if (customer_id) q = q.where('customer_id', '=', customer_id);
        const rows = await q.orderBy('bill_date', 'desc').execute();

        // For each invoice, compute total_amount from lines
        const invoiceNumbers = rows.map((r: any) => (r as any).invoice_number).filter(Boolean);
        // Get all invoice ids in one query
        let invRows: any[] = [];
        if (invoiceNumbers.length > 0) {
          invRows = await trx
            .selectFrom('sales_invoices')
            .select(['id', 'invoice_number', 'exchange_rate'])
            .where('tenant_id', '=', user.tenant_id)
            .execute();
        }
        const invMap: Record<string, any> = {};
        for (const inv of invRows) invMap[inv.invoice_number] = inv;

        data = await Promise.all(rows.map(async (r: any) => {
          const inv = invMap[r.invoice_number];
          let total_amount = 0;
          if (inv) {
            const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', inv.id).execute();
            const exRate = Number(inv.exchange_rate) || 1;
            const clearingLines = lines.filter((l: any) => l.line_group === 'clearing' || l.line_group === 'other');
            const shippingLines = lines.filter((l: any) => l.line_group === 'shipping');
            total_amount = clearingLines.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0)
              + shippingLines.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0) * exRate;
          }
          const paid_amount = Number(r.paid_amount) || 0;
          return {
            invoice_number: r.invoice_number,
            client_name: r.client_name,
            issue_date: r.issue_date,
            due_date: r.due_date,
            total_amount,
            paid_amount,
            balance: total_amount - paid_amount,
            status: r.status,
          };
        }));

      } else if (type === 'payables') {
        let q = trx
          .selectFrom('supplier_bills')
          .select([
            'bill_number',
            'supplier_name as vendor_name',
            'bill_date',
            'due_date',
            'total',
            'paid_amount',
            'status',
          ])
          .where('tenant_id', '=', user.tenant_id);
        if (date_from) q = q.where('bill_date', '>=', new Date(date_from));
        if (date_to) q = q.where('bill_date', '<=', new Date(date_to));
        if (status) q = q.where('status', '=', status);
        const rows = await q.orderBy('bill_date', 'desc').execute();
        data = rows.map((r: any) => ({
          bill_number: r.bill_number,
          vendor_name: r.vendor_name,
          bill_date: r.bill_date,
          due_date: r.due_date,
          total_amount: Number(r.total) || 0,
          paid_amount: Number(r.paid_amount) || 0,
          balance: (Number(r.total) || 0) - (Number(r.paid_amount) || 0),
          status: r.status,
        }));

      } else if (type === 'revenue') {
        // SUM of invoice_payments grouped by month, last 12 months
        const rows = await trx
          .selectFrom('invoice_payments')
          .innerJoin('sales_invoices', 'sales_invoices.id', 'invoice_payments.invoice_id')
          .select([
            trx.fn.sum('invoice_payments.amount').as('amount'),
            sql<string>`TO_CHAR(invoice_payments.payment_date, 'YYYY-MM')`.as('month'),
          ])
          .where('sales_invoices.tenant_id', '=', user.tenant_id)
          .where(sql<SqlBool>`invoice_payments.payment_date >= NOW() - INTERVAL '12 months'`)
          .groupBy(sql`TO_CHAR(invoice_payments.payment_date, 'YYYY-MM')`)
          .orderBy(sql`TO_CHAR(invoice_payments.payment_date, 'YYYY-MM')`, 'asc')
          .execute();
        data = rows.map((r: any) => ({
          month: r.month,
          amount: Number(r.amount) || 0,
        }));

      } else if (type === 'expenses') {
        // SUM from supplier_bills (PAID) grouped by month, last 12 months
        const rows = await trx
          .selectFrom('supplier_bills')
          .select([
            trx.fn.sum('total').as('amount'),
            sql<string>`TO_CHAR(bill_date, 'YYYY-MM')`.as('month'),
          ])
          .where('tenant_id', '=', user.tenant_id)
          .where('status', '=', 'PAID')
          .where(sql<SqlBool>`bill_date >= NOW() - INTERVAL '12 months'`)
          .groupBy(sql`TO_CHAR(bill_date, 'YYYY-MM')`)
          .orderBy(sql`TO_CHAR(bill_date, 'YYYY-MM')`, 'asc')
          .execute();
        data = rows.map((r: any) => ({
          month: r.month,
          amount: Number(r.amount) || 0,
        }));

      } else if (type === 'summary') {
        // Receivables summary
        const recRows = await trx.selectFrom('sales_invoices').select(['status', 'received']).where('tenant_id', '=', user.tenant_id).execute();
        const recTotal = recRows.length;
        const recPaid = recRows.reduce((s: number, r: any) => s + (Number(r.received) || 0), 0);
        const recUnpaid = recRows.filter((r: any) => r.status === 'Unpaid').length;
        const recPartial = recRows.filter((r: any) => r.status === 'Partial').length;

        // Payables summary
        const payRows = await trx.selectFrom('supplier_bills').select(['status', 'total', 'paid_amount']).where('tenant_id', '=', user.tenant_id).execute();
        const payTotal = payRows.length;
        const payPaid = payRows.reduce((s: number, r: any) => s + (Number(r.paid_amount) || 0), 0);
        const payOutstanding = payRows.reduce((s: number, r: any) => s + Math.max(0, (Number(r.total) || 0) - (Number(r.paid_amount) || 0)), 0);

        // Revenue (last 12 months)
        const revRows = await trx
          .selectFrom('invoice_payments')
          .innerJoin('sales_invoices', 'sales_invoices.id', 'invoice_payments.invoice_id')
          .select([trx.fn.sum('invoice_payments.amount').as('total')])
          .where('sales_invoices.tenant_id', '=', user.tenant_id)
          .where(sql<SqlBool>`invoice_payments.payment_date >= NOW() - INTERVAL '12 months'`)
          .executeTakeFirst();
        const revenueTotal = Number((revRows as any)?.total) || 0;

        // Expenses (last 12 months)
        const expRows = await trx
          .selectFrom('supplier_bills')
          .select([trx.fn.sum('total').as('total')])
          .where('tenant_id', '=', user.tenant_id)
          .where('status', '=', 'PAID')
          .where(sql<SqlBool>`bill_date >= NOW() - INTERVAL '12 months'`)
          .executeTakeFirst();
        const expensesTotal = Number((expRows as any)?.total) || 0;

        data = [
          { label: 'Receivables', count: recTotal, paid: recPaid, unpaid: recUnpaid, partial: recPartial },
          { label: 'Payables', count: payTotal, paid: payPaid, outstanding: payOutstanding },
          { label: 'Revenue (12m)', total: revenueTotal },
          { label: 'Expenses (12m)', total: expensesTotal },
        ];
      }

      return {
        report_type: type,
        date_from: date_from || null,
        date_to: date_to || null,
        data,
        generated_at: new Date().toISOString(),
      };
    });
  });

  // GET /v1/invoices/:id
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const inv = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!inv) return reply.status(404).send({ error: 'Invoice not found' });
      const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', id).orderBy('sort_order', 'asc').execute();
      const payments = await trx.selectFrom('invoice_payments').selectAll().where('invoice_id', '=', id).orderBy('created_at', 'desc').execute();
      return { ...inv, items: lines, payments };
    });
  });

  // POST /v1/invoices
  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const [inv] = await trx.insertInto('sales_invoices').values({
        tenant_id: user.tenant_id,
        invoice_number: body.invoice_number || `INV-${Date.now()}`,
        shipment_ref: body.shipment_ref || null,
        customer_id: body.customer_id || null,
        client_name: body.client_name || null,
        client_address: JSON.stringify(body.client_address || []),
        bl_number: body.bl_number || null,
        origin: body.origin || null,
        destination: body.destination || null,
        mode: body.mode || 'SEA',
        bill_date: body.bill_date || null,
        due_date: body.due_date || null,
        sale_agent: body.sale_agent || null,
        payment_terms: body.payment_terms || null,
        exchange_rate: body.exchange_rate || 1,
        status: body.status || 'Draft',
        received: 0,
        version: 1,
        ref_code: body.ref_code || null,
        notes: body.notes || null,
        created_by: user.sub,
      }).returningAll().execute();

      let grandTotal = 0;
      if (Array.isArray(body.items) && body.items.length > 0) {
        const itemsToInsert = body.items.map((it: any, i: number) => ({
          invoice_id: inv.id,
          name: it.name,
          unit: it.unit || 'PER BIL',
          rate: it.rate || 0,
          qty: it.qty || 1,
          tax_pct: it.tax_pct || 0,
          line_group: it.line_group || 'other',
          currency: it.currency || 'TZS',
          sort_order: i,
        }));
        await trx.insertInto('sales_invoice_lines').values(itemsToInsert).execute();

        const clearingLines = itemsToInsert.filter((l: any) => l.line_group === 'clearing' || l.line_group === 'other');
        const shippingLines = itemsToInsert.filter((l: any) => l.line_group === 'shipping');
        const exRate = Number(inv.exchange_rate) || 1;
        grandTotal = clearingLines.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0)
          + shippingLines.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0) * exRate;
      }

      if (inv.status !== 'Draft' && grandTotal > 0) {
        await GLService.post(user.tenant_id, {
          entryDate: inv.bill_date ? new Date(inv.bill_date).toISOString() : new Date().toISOString(),
          description: `Sales invoice: ${inv.invoice_number}`,
          reference: inv.invoice_number,
          sourceModule: 'AR',
          sourceId: inv.id,
          createdBy: user.sub,
          lines: [
            { accountCode: '1100', debit: grandTotal, credit: 0, description: 'Accounts Receivable' },
            { accountCode: '4000', debit: 0, credit: grandTotal, description: 'Freight Revenue' },
          ],
        });
      }

      // Trigger accounting integration sync in background
      if (inv.status !== 'Draft') {
        AccountingIntegrationService.syncInvoice(user.tenant_id, inv.id).catch(console.error);
      }

      return reply.status(201).send(inv);
    });
  });

  // PATCH /v1/invoices/:id
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('sales_invoices').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Invoice not found' });
      const updates: any = { updated_at: new Date() };
      const fields = ['invoice_number', 'customer_id', 'client_name', 'client_address', 'shipment_ref', 'bl_number', 'origin', 'destination', 'mode', 'bill_date', 'due_date', 'sale_agent', 'payment_terms', 'exchange_rate', 'status', 'notes', 'ref_code', 'version'];
      for (const f of fields) {
        if (body[f] !== undefined) updates[f] = f === 'client_address' ? JSON.stringify(body[f]) : body[f];
      }
      await trx.updateTable('sales_invoices').set(updates).where('id', '=', id).execute();
      
      let lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', id).execute();
      if (Array.isArray(body.items)) {
        await trx.deleteFrom('sales_invoice_lines').where('invoice_id', '=', id).execute();
        if (body.items.length > 0) {
          const itemsToInsert = body.items.map((it: any, i: number) => ({
            invoice_id: id,
            name: it.name,
            unit: it.unit || 'PER BIL',
            rate: it.rate || 0,
            qty: it.qty || 1,
            tax_pct: it.tax_pct || 0,
            line_group: it.line_group || 'other',
            currency: it.currency || 'TZS',
            sort_order: i,
          }));
          await trx.insertInto('sales_invoice_lines').values(itemsToInsert).execute();
          lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', id).execute();
        } else {
          lines = [];
        }
      }
      const inv = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

      if (inv.status !== 'Draft') {
        const alreadyPosted = await trx
          .selectFrom('journal_entries')
          .select('id')
          .where('tenant_id', '=', user.tenant_id)
          .where('source_module', '=', 'AR')
          .where('source_id', '=', id)
          .where('description', 'like', 'Sales invoice%')
          .executeTakeFirst();

        if (!alreadyPosted) {
          const exRate = Number(inv.exchange_rate) || 1;
          const clearingLines = lines.filter(l => l.line_group === 'clearing' || l.line_group === 'other');
          const shippingLines = lines.filter(l => l.line_group === 'shipping');
          const grandTotal = clearingLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0)
            + shippingLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0) * exRate;

          if (grandTotal > 0) {
            await GLService.post(user.tenant_id, {
              entryDate: inv.bill_date ? new Date(inv.bill_date).toISOString() : new Date().toISOString(),
              description: `Sales invoice: ${inv.invoice_number}`,
              reference: inv.invoice_number,
              sourceModule: 'AR',
              sourceId: inv.id,
              createdBy: user.sub,
              lines: [
                { accountCode: '1100', debit: grandTotal, credit: 0, description: 'Accounts Receivable' },
                { accountCode: '4000', debit: 0, credit: grandTotal, description: 'Freight Revenue' },
              ],
            });
          }
        }
      }

      // Trigger accounting integration sync in background
      if (inv.status !== 'Draft') {
        AccountingIntegrationService.syncInvoice(user.tenant_id, inv.id).catch(console.error);
      }

      return inv;
    });
  });

  // DELETE /v1/invoices/:id
  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('sales_invoices').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Invoice not found' });
      await trx.deleteFrom('sales_invoices').where('id', '=', id).execute();
      return { success: true };
    });
  });

  // POST /v1/invoices/:id/payment
  fastify.post('/:id/payment', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { amount, method, payment_date, note } = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const inv = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!inv) return reply.status(404).send({ error: 'Invoice not found' });
      await trx.insertInto('invoice_payments').values({
        tenant_id: user.tenant_id,
        invoice_id: id,
        amount: Number(amount),
        method: method || null,
        payment_date: payment_date || null,
        note: note || null,
        created_by: user.sub,
      }).execute();
      const payments = await trx.selectFrom('invoice_payments').select('amount').where('invoice_id', '=', id).execute();
      const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
      // Get lines to compute grand total
      const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', id).execute();
      const clearingLines = lines.filter(l => l.line_group === 'clearing' || l.line_group === 'other');
      const shippingLines = lines.filter(l => l.line_group === 'shipping');
      const exRate = Number(inv.exchange_rate) || 2650;
      const grandTotal = clearingLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0)
        + shippingLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0) * exRate;
      let newStatus: string;
      if (totalPaid <= 0) newStatus = 'Unpaid';
      else if (totalPaid >= grandTotal) newStatus = 'Paid';
      else newStatus = 'Partial';
      await trx.updateTable('sales_invoices').set({ received: totalPaid, status: newStatus, updated_at: new Date() }).where('id', '=', id).execute();

      // Post payment to GL
      await GLService.post(user.tenant_id, {
        entryDate: payment_date ? new Date(payment_date).toISOString() : new Date().toISOString(),
        description: `Payment received: ${inv.invoice_number}`,
        reference: inv.invoice_number,
        sourceModule: 'AR',
        sourceId: inv.id,
        createdBy: user.sub,
        lines: [
          { accountCode: '1010', debit: Number(amount), credit: 0, description: 'Cash received' },
          { accountCode: '1100', debit: 0, credit: Number(amount), description: `Clear AR: ${inv.invoice_number}` },
        ],
      });

      // Trigger accounting integration payment sync in background
      AccountingIntegrationService.syncPayment(user.tenant_id, id, 'INVOICE').catch(console.error);

      return { success: true, received: totalPaid, status: newStatus };
    });
  });

  // ── POST /v1/invoices/:id/submit-to-tra ──────────────────────────────────────
  // Submit invoice to TRA EFDMS and receive a receipt verification number + QR code.
  fastify.post('/:id/submit-to-tra', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as { id: string };

    // Ensure invoice belongs to tenant and is not Draft
    const inv = await db
      .selectFrom('sales_invoices')
      .select(['id', 'status', 'tra_status', 'tra_rctvnum', 'tra_ack_code', 'tra_qr_url'])
      .where('id', '=', id)
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst();

    if (!inv) return reply.status(404).send({ error: 'Invoice not found' });
    if (inv.status === 'Draft') return reply.status(400).send({ error: 'Cannot submit Draft invoices to TRA. Change status first.' });

    const result = await TRAService.submitInvoice(user.tenant_id, id);

    if (!result.success) {
      return reply.status(400).send({
        error: result.error,
        ackCode: result.ackCode,
        ackMsg: result.ackMsg,
      });
    }

    return {
      success: true,
      rctNum: result.rctNum,
      rctvNum: result.rctvNum,
      qrUrl: result.qrUrl,
      verifyUrl: result.qrUrl,
    };
  });

  // ── GET /v1/invoices/:id/tra-receipt ─────────────────────────────────────────
  // Get TRA receipt details for an invoice including QR code data URL.
  fastify.get('/:id/tra-receipt', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as { id: string };

    const inv = await db
      .selectFrom('sales_invoices')
      .select([
        'id', 'invoice_number', 'client_name', 'bill_date',
        'tra_status', 'tra_rctnum', 'tra_rctvnum', 'tra_dc', 'tra_znum',
        'tra_submitted_at', 'tra_ack_code', 'tra_ack_msg', 'tra_qr_url',
      ])
      .where('id', '=', id)
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst();

    if (!inv) return reply.status(404).send({ error: 'Invoice not found' });

    let qrDataUrl: string | null = null;
    if (inv.tra_rctvnum) {
      const config = await TRAService.getConfig(user.tenant_id);
      const env = (config?.environment || 'production') as 'test' | 'production';
      qrDataUrl = await TRAService.generateQRCodeDataUrl(inv.tra_rctvnum, env).catch(() => null);
    }

    return {
      ...inv,
      qrDataUrl,
      isSubmitted: inv.tra_status === 'submitted' && inv.tra_ack_code === 0,
    };
  });
}

