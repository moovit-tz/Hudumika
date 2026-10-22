import { renderCreditNotePdf } from '../services/finance-document-pdf.service.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';
import { isTaxCodeUserError, resolveTaxCode } from '../services/tax-code.service.js';
import { invoiceGrandTotal, invoiceNetAndTax } from './invoices.routes.js';
import { getNextDocNumber, getNextCustomerDocNumber } from '../lib/doc-numbering.js';

const lineSchema = z.object({
  name: z.string().max(300),
  unit: z.string().max(50).optional(),
  rate: z.number(),
  qty: z.number().positive().optional(),
  tax_pct: z.number().min(0).max(100).optional(),
  tax_code_id: z.string().uuid().optional(),
});
const createSchema = z.object({
  original_invoice_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  client_name: z.string().max(300).optional(),
  currency: z.string().max(10).optional(),
  exchange_rate: z.number().positive().optional(),
  credit_date: z.string().optional(),
  reason: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
  items: z.array(lineSchema).min(1),
});

async function recomputeInvoiceStatus(trx: any, tenantId: string, invoiceId: string) {
  const inv = await trx.selectFrom('sales_invoices')
    .select(['id', 'received', 'currency', 'exchange_rate'])
    .where('id', '=', invoiceId).where('tenant_id', '=', tenantId)
    .forUpdate().executeTakeFirst();
  if (!inv) return;

  const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', invoiceId).execute();
  const grandTotal = invoiceGrandTotal(lines, inv.currency, Number(inv.exchange_rate) || 1);
  const totalPaid = Number(inv.received) || 0;

  const creditResult = await sql<{ credited: string }>`
    SELECT coalesce(round(sum(cl.rate * cl.qty * (1 + coalesce(cl.tax_pct, 0) / 100)), 2), 0) credited
    FROM credit_note_lines cl JOIN credit_notes cn ON cn.id = cl.credit_note_id
    WHERE cn.original_invoice_id = ${invoiceId}::uuid AND cn.status = 'POSTED' AND cn.tenant_id = ${tenantId}
  `.execute(trx);
  const totalCredited = Number(creditResult.rows[0]?.credited) || 0;

  const effectiveTotal = Math.max(0, grandTotal - totalCredited);
  let newStatus: string;
  if (effectiveTotal <= 0 && totalCredited > 0) newStatus = 'Credited';
  else if (totalPaid <= 0) newStatus = 'Unpaid';
  else if (totalPaid >= effectiveTotal) newStatus = 'Paid';
  else newStatus = 'Partial';

  await trx.updateTable('sales_invoices')
    .set({ status: newStatus, updated_at: new Date() })
    .where('id', '=', invoiceId).where('tenant_id', '=', tenantId).execute();
}

/**
 * Credit notes — a new document (credit_notes/credit_note_lines), not a
 * sign-flip on sales_invoices. invoices.routes.ts's own INVOICE_STATUS enum
 * has carried an unused 'Credited' value with no route ever setting it, and
 * void there is whole-document-only with no partial-amount concept — so
 * there was nothing to build a partial reversal on top of.
 *
 * GL posting is invoiceJournalLines inverted: an invoice debits AR and
 * credits revenue/VAT; a credit note credits AR back down and debits
 * revenue/VAT back down, in the same proportion.
 */
export async function creditNoteRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAnyEntitlement(['finops', 'seal']));

  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const parsed = z.object({
      customer_id: z.string().uuid().optional(),
      original_invoice_id: z.string().uuid().optional(),
      status: z.enum(['POSTED', 'VOID']).optional(),
      search: z.string().max(200).optional(),
      page: z.coerce.number().int().min(1).max(100000).optional(),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
    }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid credit note filters.' });
    const { customer_id, original_invoice_id, status, search, page, page_size } = parsed.data;

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('credit_notes').where('tenant_id', '=', user.tenant_id);
      if (customer_id) q = q.where('customer_id', '=', customer_id);
      if (original_invoice_id) q = q.where('original_invoice_id', '=', original_invoice_id);
      if (status) q = q.where('status', '=', status);
      if (search) {
        const pattern = `%${search.replace(/[\\%_]/g, c => `\\${c}`)}%`;
        q = q.where(eb => eb.or([eb('credit_note_number', 'ilike', pattern), eb('client_name', 'ilike', pattern), eb('reason', 'ilike', pattern)]));
      }

      const fetchLines = async (ids: string[]) => {
        if (!ids.length) return new Map<string, any[]>();
        const lines = await trx.selectFrom('credit_note_lines').selectAll().where('credit_note_id', 'in', ids).orderBy('sort_order', 'asc').execute();
        const m = new Map<string, typeof lines>();
        for (const l of lines) { const arr = m.get(l.credit_note_id) ?? []; arr.push(l); m.set(l.credit_note_id, arr); }
        return m;
      };

      if (page === undefined) {
        const rows = await q.selectAll().orderBy('created_at', 'desc').execute();
        const linesByNote = await fetchLines(rows.map(r => r.id));
        return rows.map(r => ({ ...r, items: linesByNote.get(r.id) ?? [] }));
      }

      const total = Number((await q.select(eb => eb.fn.countAll().as('count')).executeTakeFirstOrThrow()).count);
      const rows = await q.selectAll().orderBy('created_at', 'desc').orderBy('id', 'desc').limit(page_size).offset((page - 1) * page_size).execute();
      const linesByNote = await fetchLines(rows.map(r => r.id));
      return {
        items: rows.map(r => ({ ...r, items: linesByNote.get(r.id) ?? [] })),
        total, page, page_size, total_pages: Math.ceil(total / page_size),
      };
    });
  });

  const STATS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR'] as const;
  fastify.get('/stats', { preHandler: requireRole(...STATS_ROLES) }, async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await sql`
        SELECT cn.status, cn.currency,
               count(*)::text AS cnt,
               coalesce(sum(
                 (SELECT coalesce(sum(l.rate * l.qty * (1 + coalesce(l.tax_pct,0)/100)), 0)
                  FROM credit_note_lines l WHERE l.credit_note_id = cn.id)
               ), 0)::text AS total_amount,
               count(*) filter (where cn.original_invoice_id is not null)::text AS linked
        FROM credit_notes cn
        WHERE cn.tenant_id = ${user.tenant_id}
        GROUP BY cn.status, cn.currency
      `.execute(trx);
      const byStatus: Record<string, { count: number; amount: number }> = {};
      const creditedByCurrency: Record<string, number> = {};
      let total = 0, linkedCount = 0;
      for (const r of rows.rows as any[]) {
        const cnt = Number(r.cnt);
        const amt = Number(r.total_amount);
        const status = r.status as string;
        const ccy = (r.currency as string) || 'TZS';
        byStatus[status] = { count: (byStatus[status]?.count ?? 0) + cnt, amount: (byStatus[status]?.amount ?? 0) + amt };
        total += cnt;
        if (status === 'POSTED') creditedByCurrency[ccy] = (creditedByCurrency[ccy] ?? 0) + amt;
        linkedCount += Number(r.linked);
      }
      return {
        total,
        draftCount: byStatus['DRAFT']?.count ?? 0,
        postedCount: byStatus['POSTED']?.count ?? 0,
        voidCount: byStatus['VOID']?.count ?? 0,
        creditedByCurrency,
        totalCredited: Object.values(creditedByCurrency).reduce((s, v) => s + v, 0),
        linkedCount,
        voidRate: total ? Math.round(((byStatus['VOID']?.count ?? 0) / total) * 100) : 0,
      };
    });
  });

  fastify.get('/:id/pdf', async (request, reply) => {
    const parsed = z.string().uuid().safeParse((request.params as {id: string}).id);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid document ID.' });
    try {
      const pdf = await renderCreditNotePdf(request.user.tenant_id, parsed.data);
      return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="document-${parsed.data}.pdf"`).send(pdf);
    } catch (error) {
      if (error instanceof Error && error.message.endsWith('not found')) return reply.status(404).send({ error: 'Document not found.' });
      throw error;
    }
  });

  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const cn = await trx.selectFrom('credit_notes').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!cn) return reply.status(404).send({ error: 'Credit note not found' });
      const lines = await trx.selectFrom('credit_note_lines').selectAll().where('credit_note_id', '=', id).orderBy('sort_order').execute();
      return { ...cn, lines };
    });
  });

  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const body = createSchema.parse(request.body);
    const result = await withTenant(user.tenant_id, async (trx) => {
      let sourceInvoice: { id: string; customer_id: string | null; currency: string; exchange_rate: unknown; status: string } | undefined;
      if (body.original_invoice_id) {
        sourceInvoice = await trx.selectFrom('sales_invoices')
          .select(['id', 'customer_id', 'currency', 'exchange_rate', 'status'])
          .where('id', '=', body.original_invoice_id)
          .where('tenant_id', '=', user.tenant_id)
          .forUpdate()
          .executeTakeFirst();
        if (!sourceInvoice) return reply.status(400).send({ error: 'The linked invoice was not found.' });
        if (sourceInvoice.status === 'Draft' || sourceInvoice.status === 'Void')
          return reply.status(400).send({ error: `Cannot issue a credit note against a ${sourceInvoice.status.toLowerCase()} invoice.` });
        if (body.customer_id && sourceInvoice.customer_id && body.customer_id !== sourceInvoice.customer_id)
          return reply.status(400).send({ error: 'Credit note customer must match the source invoice customer.' });
      }

      const codeIds = [...new Set(body.items.map(it => it.tax_code_id).filter(Boolean))] as string[];
      const codes = new Map<string, number>();
      for (const cid of codeIds) {
        try {
          const c = await resolveTaxCode(trx, user.tenant_id, cid, 'SALES');
          codes.set(cid, Number(c.rate));
        } catch (e) {
          if (isTaxCodeUserError(e)) return reply.status(400).send({ error: e.message });
          throw e;
        }
      }

      let currency: string;
      if (body.currency) {
        currency = body.currency;
      } else if (sourceInvoice) {
        currency = sourceInvoice.currency;
      } else {
        const ts = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        const s = ts ? (typeof ts.settings === 'string' ? JSON.parse(ts.settings) : ts.settings) : {};
        currency = s?.company?.currency || 'TZS';
      }
      if (sourceInvoice && currency.toUpperCase() !== sourceInvoice.currency.toUpperCase())
        return reply.status(400).send({ error: `Credit note currency (${currency}) must match the source invoice currency (${sourceInvoice.currency}).` });

      // Linked credits must use the source invoice's rate so the GL credit
      // clears the exact reporting-currency AR the invoice debited.
      let exchangeRate: number;
      if (sourceInvoice) {
        const sourceRate = Number(sourceInvoice.exchange_rate) || 1;
        if (body.exchange_rate != null && Math.abs(body.exchange_rate - sourceRate) > 0.0001) {
          return reply.status(400).send({ error: `Linked credit notes must use the source invoice's exchange rate (${sourceRate}). A different rate would leave an unreconciled AR residual.` });
        }
        exchangeRate = sourceRate;
      } else {
        exchangeRate = body.exchange_rate ?? 1;
      }
      const lines = body.items.map((it, i) => ({
        name: it.name,
        unit: it.unit || 'PER BIL',
        rate: it.rate,
        qty: it.qty ?? 1,
        tax_pct: it.tax_code_id ? (codes.get(it.tax_code_id) ?? 0) : (it.tax_pct ?? 0),
        tax_code_id: it.tax_code_id || null,
        line_group: 'other',
        currency,
        sort_order: i,
      }));

      const grandTotal = invoiceGrandTotal(lines, currency, exchangeRate);
      const { net, tax } = invoiceNetAndTax(lines, currency, exchangeRate);

      // Enforce cumulative creditable limit: total of all non-void credit notes
      // against this invoice must not exceed the invoice's grand total.
      if (sourceInvoice) {
        const invLines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', sourceInvoice.id).execute();
        const invFx = Number(sourceInvoice.exchange_rate) || 1;
        const invTotal = invoiceGrandTotal(invLines, sourceInvoice.currency, invFx);

        const existingCredits = await trx.selectFrom('credit_notes as cn')
          .innerJoin('credit_note_lines as cl', 'cl.credit_note_id', 'cn.id')
          .select(({ fn }) => fn.sum(sql<number>`cl.rate * cl.qty * (1 + coalesce(cl.tax_pct, 0) / 100)`).as('credited'))
          .where('cn.original_invoice_id', '=', sourceInvoice.id)
          .where('cn.tenant_id', '=', user.tenant_id)
          .where('cn.status', '!=', 'VOID')
          .executeTakeFirst();
        const alreadyCredited = Number(existingCredits?.credited || 0);

        if (alreadyCredited + grandTotal > invTotal + 0.01) {
          return reply.status(400).send({
            error: `This credit note (${grandTotal} ${currency}) would exceed the invoice total (${invTotal} ${currency}). Already credited: ${Math.round(alreadyCredited * 100) / 100}.`,
          });
        }
      }

      const creditNoteNumber = (body.customer_id
          ? await getNextCustomerDocNumber(trx, user.tenant_id, body.customer_id, 'credit_note')
          : null)
        || await getNextDocNumber(trx, user.tenant_id, 'credit_note');

      const cn = await trx.insertInto('credit_notes').values({
        tenant_id: user.tenant_id,
        credit_note_number: creditNoteNumber,
        original_invoice_id: body.original_invoice_id || null,
        customer_id: body.customer_id || null,
        client_name: body.client_name || null,
        currency,
        exchange_rate: exchangeRate,
        credit_date: body.credit_date || new Date().toISOString().slice(0, 10),
        reason: body.reason || null,
        status: 'POSTED',
        notes: body.notes || null,
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('credit_note_lines').values(lines.map(l => ({ ...l, credit_note_id: cn.id }))).execute();

      if (grandTotal > 0) {
        const cnFxMeta = { currency, exchangeRate };
        const tsCn = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        const sCn = tsCn ? (typeof tsCn.settings === 'string' ? JSON.parse(tsCn.settings) : tsCn.settings) : {};
        const reportingCcyCn = (sCn?.company?.currency || 'TZS').toUpperCase();
        const needsCnConversion = currency.toUpperCase() !== reportingCcyCn && exchangeRate !== 1 && exchangeRate > 0;
        const glCnGrand = needsCnConversion ? Math.round(grandTotal * exchangeRate * 100) / 100 : grandTotal;
        const glCnNet   = needsCnConversion ? Math.round(net * exchangeRate * 100) / 100 : net;
        const glCnTax   = needsCnConversion ? Math.round(tax * exchangeRate * 100) / 100 : tax;

        await GLService.post(user.tenant_id, {
          entryDate: cn.credit_date ?? new Date().toISOString().slice(0, 10),
          description: `Credit note: ${cn.credit_note_number}`,
          reference: cn.credit_note_number,
          sourceModule: 'AR',
          sourceId: cn.id,
          createdBy: user.sub,
          lines: [
            { accountCode: '4000', debit: glCnNet, credit: 0, description: 'Revenue reversed', ...cnFxMeta },
            ...(glCnTax > 0 ? [{ accountCode: '2200', debit: glCnTax, credit: 0, description: 'VAT output reversed', ...cnFxMeta }] : []),
            { accountCode: '1100', debit: 0, credit: glCnGrand, description: 'Accounts receivable reduced', ...cnFxMeta },
          ],
        }, trx);
      }

      if (body.original_invoice_id) {
        await trx.insertInto('invoice_activity_log').values({
          tenant_id: user.tenant_id, invoice_id: body.original_invoice_id, actor_id: user.sub, actor_name: user.name || user.email,
          action: 'credit_note_issued', detail: `Credit note ${cn.credit_note_number} issued for ${grandTotal} ${currency}${body.reason ? `: ${body.reason}` : ''}`,
        }).execute();
        // Recompute source invoice status after credit
        await recomputeInvoiceStatus(trx, user.tenant_id, body.original_invoice_id);
      }

      return cn;
    });
    if (!reply.sent) return reply.status(201).send(result);
  });

  fastify.post('/:id/void', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(request.body);
    const result = await withTenant(user.tenant_id, async (trx) => {
      const cn = await trx.selectFrom('credit_notes').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!cn) return reply.status(404).send({ error: 'Credit note not found' });
      if (cn.status === 'VOID') return reply.status(409).send({ error: 'This credit note is already void.' });

      await GLService.reverseBySource(user.tenant_id, 'AR', cn.id, user.sub, `Credit note voided: ${reason}`, trx);
      await trx.updateTable('credit_notes').set({ status: 'VOID', notes: `${cn.notes ? cn.notes + ' | ' : ''}Voided: ${reason}`, updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      // Recompute source invoice status after void
      if (cn.original_invoice_id) {
        await recomputeInvoiceStatus(trx, user.tenant_id, cn.original_invoice_id);
      }

      return { success: true };
    });
    if (!reply.sent) return result;
  });
}
