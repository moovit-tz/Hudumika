import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';
import { isTaxCodeUserError, resolveTaxCode } from '../services/tax-code.service.js';
import { invoiceGrandTotal, invoiceNetAndTax } from './invoices.routes.js';

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

  fastify.get('/', async (request) => {
    const user = request.user;
    const { customer_id, original_invoice_id } = request.query as { customer_id?: string; original_invoice_id?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('credit_notes').selectAll().where('tenant_id', '=', user.tenant_id);
      if (customer_id) q = q.where('customer_id', '=', customer_id);
      if (original_invoice_id) q = q.where('original_invoice_id', '=', original_invoice_id);
      const rows = await q.orderBy('created_at', 'desc').execute();

      // Same "batch-fetch lines, attach to each row" shape as GET /v1/invoices
      // — the frontend needs each credit note's total (its line items) for
      // the customer statement's running balance.
      const ids = rows.map(r => r.id);
      const lines = ids.length > 0
        ? await trx.selectFrom('credit_note_lines').selectAll().where('credit_note_id', 'in', ids).orderBy('sort_order', 'asc').execute()
        : [];
      const linesByNote = new Map<string, typeof lines>();
      for (const l of lines) {
        const arr = linesByNote.get(l.credit_note_id) ?? [];
        arr.push(l);
        linesByNote.set(l.credit_note_id, arr);
      }
      return rows.map(r => ({ ...r, items: linesByNote.get(r.id) ?? [] }));
    });
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
    return withTenant(user.tenant_id, async (trx) => {
      if (body.original_invoice_id) {
        const inv = await trx.selectFrom('sales_invoices').select('id').where('id', '=', body.original_invoice_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!inv) return reply.status(400).send({ error: 'The linked invoice was not found.' });
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

      const currency = body.currency || 'TZS';
      const exchangeRate = body.exchange_rate ?? 1;
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

      // Same year-scoped sequential shape as GLService.post()'s own entry
      // numbering — credit notes don't share invoice_sequences (a closed
      // DocType union that doesn't include this document type), so this
      // is a real, tenant-scoped count, not a timestamp.
      const year = new Date().getFullYear();
      const countResult = await trx.selectFrom('credit_notes').select(trx.fn.count('id').as('n'))
        .where('tenant_id', '=', user.tenant_id).where('credit_note_number', 'like', `CN-${year}-%`).executeTakeFirst();
      const seq = String(Number(countResult?.n ?? 0) + 1).padStart(4, '0');
      const creditNoteNumber = `CN-${year}-${seq}`;

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
        await GLService.post(user.tenant_id, {
          entryDate: cn.credit_date ?? new Date().toISOString().slice(0, 10),
          description: `Credit note: ${cn.credit_note_number}`,
          reference: cn.credit_note_number,
          sourceModule: 'AR',
          sourceId: cn.id,
          createdBy: user.sub,
          lines: [
            { accountCode: '4000', debit: net, credit: 0, description: 'Revenue reversed' },
            ...(tax > 0 ? [{ accountCode: '2200', debit: tax, credit: 0, description: 'VAT output reversed' }] : []),
            { accountCode: '1100', debit: 0, credit: grandTotal, description: 'Accounts receivable reduced' },
          ],
        });
      }

      if (body.original_invoice_id) {
        await trx.insertInto('invoice_activity_log').values({
          tenant_id: user.tenant_id, invoice_id: body.original_invoice_id, actor_id: user.sub, actor_name: user.name || user.email,
          action: 'credit_note_issued', detail: `Credit note ${cn.credit_note_number} issued for ${grandTotal} ${currency}${body.reason ? `: ${body.reason}` : ''}`,
        }).execute();
      }

      return reply.status(201).send(cn);
    });
  });

  fastify.post('/:id/void', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const cn = await trx.selectFrom('credit_notes').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!cn) return reply.status(404).send({ error: 'Credit note not found' });
      if (cn.status === 'VOID') return reply.status(409).send({ error: 'This credit note is already void.' });

      await GLService.reverseBySource(user.tenant_id, 'AR', cn.id, user.sub, `Credit note voided: ${reason}`);
      await trx.updateTable('credit_notes').set({ status: 'VOID', notes: `${cn.notes ? cn.notes + ' | ' : ''}Voided: ${reason}`, updated_at: new Date() }).where('id', '=', id).execute();

      return { success: true };
    });
  });
}
