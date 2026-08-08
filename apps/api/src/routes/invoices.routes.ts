import { requireAnyEntitlement } from '../middleware/entitlement.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { sql, type SqlBool } from 'kysely';
import { GLService } from '../services/gl.service.js';
import { AccountingIntegrationService } from '../services/accounting-integration.service.js';
import { TRAService } from '../services/tra.service.js';
import { getNextDocNumber } from '../lib/doc-numbering.js';
import { toDateParam } from '../utils/dates.js';
import { isTaxCodeUserError, resolveTaxCode } from '../services/tax-code.service.js';
import {
  DocumentPosted, assertPeriodOpen, isPeriodError, reverseDocumentJournals, tenantJurisdiction,
} from '../services/vat-period.service.js';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/**
 * An invoice's grand total, expressed in the invoice's own currency.
 *
 * Every line is converted on its own currency against the invoice's, which is
 * the only thing that actually determines whether conversion is needed. This
 * used to be decided by `line_group`: anything tagged 'shipping' was treated
 * as foreign and multiplied by exchange_rate, anything else was assumed to be
 * base currency. That held only because a freight invoice happens to bill its
 * ocean leg under that label, and it is wrong twice over —
 *
 *   * it couples the finance core to a freight-specific grouping, so any other
 *     industry billing in a second currency is mis-totalled by construction;
 *   * there are already 4 USD lines sitting in the 'other' group. They total
 *     correctly today only because both their invoices carry exchange_rate 1.
 *     On a 2650 invoice the same line would be understated 2650-fold.
 *
 * Lines legitimately differ in currency from their invoice — a USD ocean
 * freight line on a TZS invoice is the normal shape of the document — so the
 * line currency stays. What changed is that it is now what gets read.
 */
export function invoiceGrandTotal(
  lines: { qty: unknown; rate: unknown; tax_pct: unknown; currency?: string | null }[],
  invoiceCurrency: string,
  exchangeRate: number,
): number {
  const base = (invoiceCurrency || 'TZS').toUpperCase();
  return lines.reduce((sum, l) => {
    const gross = Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100);
    // A line with no currency recorded is in the invoice's currency; that is
    // what the column's default has always meant.
    const cur = (l.currency || base).toUpperCase();
    return sum + (cur === base ? gross : gross * exchangeRate);
  }, 0);
}

/** The same conversion as invoiceGrandTotal, split into its net and tax parts. */
export function invoiceNetAndTax(
  lines: { qty: unknown; rate: unknown; tax_pct: unknown; currency?: string | null }[],
  invoiceCurrency: string,
  exchangeRate: number,
): { net: number; tax: number } {
  const base = (invoiceCurrency || 'TZS').toUpperCase();
  return lines.reduce((acc, l) => {
    const cur = (l.currency || base).toUpperCase();
    const fx = cur === base ? 1 : exchangeRate;
    const net = Number(l.qty) * Number(l.rate) * fx;
    acc.net += net;
    acc.tax += net * (Number(l.tax_pct) / 100);
    return acc;
  }, { net: 0, tax: 0 });
}

/**
 * The journal for an issued invoice.
 *
 * Tax charged to a customer is collected on the authority's behalf: a liability,
 * not revenue. Both posting sites used to credit the *gross* total to revenue
 * and post nothing to VAT at all — so revenue was overstated by exactly the tax,
 * the output-tax liability was never recorded, and account 2200 stayed empty
 * no matter how much VAT had been charged. Found by running a return end to end
 * and reading the entry it produced.
 */
function invoiceJournalLines(grandTotal: number, { net, tax }: { net: number; tax: number }) {
  return [
    { accountCode: '1100', debit: grandTotal, credit: 0, description: 'Accounts Receivable' },
    { accountCode: '4000', debit: 0, credit: net, description: 'Freight Revenue' },
    ...(tax > 0
      ? [{ accountCode: '2200', debit: 0, credit: tax, description: 'VAT output tax' }]
      : []),
  ];
}

/**
 * Turn request items into invoice line rows, resolving each line's tax code.
 *
 * `tax_pct` is still what the line stores and what every total reads — nothing
 * about pricing changes here. What is added is the *treatment* beside it, so a
 * 0% line can finally say whether it is zero-rated, exempt, reverse-charge or
 * out of scope. Those four are indistinguishable as a percentage and are not
 * interchangeable on a return.
 *
 * When a code is supplied it decides the rate, so a line can never carry a code
 * and a rate that contradict each other. Codes are resolved against the
 * caller's own tenant — the FK guarantees the row exists, not that it is yours.
 *
 * Returns an `error` rather than throwing so the caller answers 400, not 500:
 * an unknown tax code is a bad request, not a server fault.
 *
 * **Call this before any write.** A handler that returns a reply from inside
 * `withTenant` returns normally, so the transaction *commits* — an early 400
 * after the header insert leaves an orphan invoice behind, and after the PATCH
 * line-delete it leaves an invoice with no lines at all. Both were observed.
 * Resolving first means the request either fails having touched nothing, or
 * proceeds knowing every code is valid.
 */
async function resolveItemTaxCodes(
  trx: Transaction<Database>,
  tenantId: string,
  items: any[],
): Promise<{ ok: false; error: string } | { ok: true; codes: Map<string, { id: string; rate: number }> }> {
  // One lookup per distinct code rather than one per line.
  const codeIds = [...new Set(items.map(it => it?.tax_code_id).filter(Boolean))] as string[];
  const codes = new Map<string, { id: string; rate: number }>();
  for (const cid of codeIds) {
    try {
      const c = await resolveTaxCode(trx, tenantId, cid, 'SALES');
      codes.set(cid, { id: c.id, rate: Number(c.rate) });
    } catch (e) {
      if (isTaxCodeUserError(e)) return { ok: false as const, error: e.message };
      throw e;
    }
  }
  return { ok: true as const, codes };
}

/** Pure mapping, once every code is known good. */
function buildInvoiceLines(
  invoiceId: string,
  items: any[],
  codes: Map<string, { id: string; rate: number }>,
) {
  return items.map((it: any, i: number) => {
    const code = it.tax_code_id ? codes.get(it.tax_code_id) : undefined;
    return {
      invoice_id: invoiceId,
      name: it.name,
      unit: it.unit || 'PER BIL',
      rate: it.rate || 0,
      qty: it.qty || 1,
      tax_pct: code ? code.rate : (it.tax_pct || 0),
      tax_code_id: code ? code.id : null,
      line_group: it.line_group || 'other',
      currency: it.currency || 'TZS',
      sort_order: i,
    };
  });
}

export async function invoiceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // 'seal' included so a warehouse manager without FinOps access can still
  // view/generate bonded-storage invoices (seal-billing.routes.ts) — the
  // per-route requireRole(...) checks below are the real access control on
  // who may actually create/send an invoice, not this app-level gate.
  fastify.addHook('preHandler', requireAnyEntitlement(['finops', 'seal']));

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
  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const { status, search, customer_id } = request.query as { status?: string; search?: string; customer_id?: string };
    // A CUSTOMER-role user's own record is customers.id === user.sub (same
    // convention used elsewhere, e.g. shipment ownership checks) — they may
    // only ever see their own invoices, never the whole tenant's.
    if (user.role === 'CUSTOMER' && customer_id && customer_id !== user.sub) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const scopedCustomerId = user.role === 'CUSTOMER' ? user.sub : customer_id;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('sales_invoices').selectAll().where('tenant_id', '=', user.tenant_id);
      if (status) q = q.where('status', '=', status);
      if (scopedCustomerId) q = q.where('customer_id', '=', scopedCustomerId);
      let rows = await q.orderBy('created_at', 'desc').execute();
      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(r => (r.client_name || '').toLowerCase().includes(s) || (r.invoice_number || '').toLowerCase().includes(s));
      }

      // The list view needs each invoice's grand total, which requires its
      // line items — batch-fetch all lines for the visible invoices in one
      // query instead of a per-row lookup.
      const ids = rows.map(r => r.id);
      const lines = ids.length > 0
        ? await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', 'in', ids).orderBy('sort_order', 'asc').execute()
        : [];
      const linesByInvoice = new Map<string, typeof lines>();
      for (const l of lines) {
        const arr = linesByInvoice.get(l.invoice_id) ?? [];
        arr.push(l);
        linesByInvoice.set(l.invoice_id, arr);
      }

      return rows.map(r => ({ ...r, items: linesByInvoice.get(r.id) ?? [] }));
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
        if (date_from) q = q.where('bill_date', '>=', toDateParam(new Date(date_from)));
        if (date_to) q = q.where('bill_date', '<=', toDateParam(new Date(date_to)));
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
            // currency, not just the rate: without it the totaller falls back
            // to the default and a USD invoice is totalled as shillings.
            .select(['id', 'invoice_number', 'exchange_rate', 'currency'])
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
            total_amount = invoiceGrandTotal(lines, inv.currency, Number(inv.exchange_rate) || 1);
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
        if (date_from) q = q.where('bill_date', '>=', toDateParam(new Date(date_from)));
        if (date_to) q = q.where('bill_date', '<=', toDateParam(new Date(date_to)));
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

      // Carbon segment — invoices don't carry an FK to shipment_cases, only a
      // text ref_number match (shipment_ref). Looked up live (not snapshotted
      // at invoice creation) so a shipment's CO2 recalculation is reflected.
      let shipment_carbon = null;
      if (inv.shipment_ref) {
        const ship = await trx.selectFrom('shipment_cases')
          .select(['co2_emissions_kg', 'carbon_credits_saved', 'co2_calc_details'])
          .where('ref_number', '=', inv.shipment_ref)
          .where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst();
        if (ship?.co2_emissions_kg != null) {
          const details = typeof ship.co2_calc_details === 'string' ? JSON.parse(ship.co2_calc_details) : ship.co2_calc_details;
          shipment_carbon = {
            co2_emissions_kg: Number(ship.co2_emissions_kg),
            carbon_credits_saved: Number(ship.carbon_credits_saved ?? 0),
            distance_km: details?.distance_km ?? null,
            mode: details?.mode ?? null,
          };
        }
      }

      return { ...inv, items: lines, payments, shipment_carbon };
    });
  });

  // POST /v1/invoices
  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      // Before the header is written — see resolveItemTaxCodes on why an early
      // return after a write commits the partial state.
      const resolved = await resolveItemTaxCodes(trx, user.tenant_id, body.items ?? []);
      if (!resolved.ok) return reply.status(400).send({ error: resolved.error });

      const invoiceNumber = body.invoice_number || await getNextDocNumber(trx, user.tenant_id, 'invoice');

      // Numbers are unique per workspace (migration 182). getNextDocNumber can
      // never collide, but a caller-supplied `invoice_number` can — and without
      // this it surfaced as a raw Postgres 23505 and a 500.
      if (body.invoice_number) {
        const clash = await trx.selectFrom('sales_invoices').select('id')
          .where('tenant_id', '=', user.tenant_id).where('invoice_number', '=', invoiceNumber)
          .executeTakeFirst();
        if (clash) {
          return reply.status(409).send({ error: `Invoice number ${invoiceNumber} is already in use.` });
        }
      }
      const [inv] = await trx.insertInto('sales_invoices').values({
        tenant_id: user.tenant_id,
        invoice_number: invoiceNumber,
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
      let netAndTax = { net: 0, tax: 0 };
      if (Array.isArray(body.items) && body.items.length > 0) {
        const itemsToInsert = buildInvoiceLines(inv.id, body.items, resolved.codes);
        await trx.insertInto('sales_invoice_lines').values(itemsToInsert).execute();

        const fx = Number(inv.exchange_rate) || 1;
        grandTotal = invoiceGrandTotal(itemsToInsert, inv.currency, fx);
        netAndTax = invoiceNetAndTax(itemsToInsert, inv.currency, fx);
      }

      if (inv.status !== 'Draft' && grandTotal > 0) {
        await GLService.post(user.tenant_id, {
          entryDate: inv.bill_date ? new Date(inv.bill_date).toISOString() : new Date().toISOString(),
          description: `Sales invoice: ${inv.invoice_number}`,
          reference: inv.invoice_number,
          sourceModule: 'AR',
          sourceId: inv.id,
          createdBy: user.sub,
          lines: invoiceJournalLines(grandTotal, netAndTax),
        });
      }

      // Trigger accounting integration sync in background
      if (inv.status !== 'Draft') {
        AccountingIntegrationService.syncInvoice(user.tenant_id, inv.id).catch(console.error);
      }

      await trx.insertInto('invoice_activity_log').values({
        tenant_id: user.tenant_id, invoice_id: inv.id, actor_id: user.sub, actor_name: user.name || user.email,
        action: 'created', detail: `Invoice ${inv.invoice_number} created as ${inv.status}`, created_at: new Date(),
      }).execute();

      return reply.status(201).send(inv);
    });
  });

  // PATCH /v1/invoices/:id
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('sales_invoices').select(['id', 'bill_date'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Invoice not found' });

      // A filed period is frozen. Both the stored date and the incoming one are
      // checked: an invoice must not be able to escape a closed period, nor
      // walk into one.
      try {
        const juris = await tenantJurisdiction(trx, user.tenant_id);
        await assertPeriodOpen(trx, user.tenant_id, existing.bill_date, juris);
        if (body.bill_date) await assertPeriodOpen(trx, user.tenant_id, body.bill_date, juris);
      } catch (e) {
        if (isPeriodError(e)) return reply.status(409).send({ error: e.message });
        throw e;
      }

      // Before the header update and, critically, before the line delete below:
      // a 400 returned from inside withTenant still commits, so failing later
      // would leave the invoice with its lines wiped.
      const resolved = await resolveItemTaxCodes(trx, user.tenant_id, body.items ?? []);
      if (!resolved.ok) return reply.status(400).send({ error: resolved.error });

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
          await trx.insertInto('sales_invoice_lines')
            .values(buildInvoiceLines(id, body.items, resolved.codes)).execute();
          lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', id).execute();
        } else {
          lines = [];
        }
      }
      const inv = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow();

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
          const grandTotal = invoiceGrandTotal(lines, inv.currency, Number(inv.exchange_rate) || 1);

          if (grandTotal > 0) {
            await GLService.post(user.tenant_id, {
              entryDate: inv.bill_date ? new Date(inv.bill_date).toISOString() : new Date().toISOString(),
              description: `Sales invoice: ${inv.invoice_number}`,
              reference: inv.invoice_number,
              sourceModule: 'AR',
              sourceId: inv.id,
              createdBy: user.sub,
              lines: invoiceJournalLines(
                grandTotal,
                invoiceNetAndTax(lines, inv.currency, Number(inv.exchange_rate) || 1),
              ),
            });
          }
        }
      }

      // Trigger accounting integration sync in background
      if (inv.status !== 'Draft') {
        AccountingIntegrationService.syncInvoice(user.tenant_id, inv.id).catch(console.error);
      }

      await trx.insertInto('invoice_activity_log').values({
        tenant_id: user.tenant_id, invoice_id: id, actor_id: user.sub, actor_name: user.name || user.email,
        action: 'updated', detail: `Invoice ${inv.invoice_number} updated`, created_at: new Date(),
      }).execute();

      return inv;
    });
  });

  // POST /v1/invoices/:id/void
  // The replacement for deleting something that has been posted. The invoice
  // stays, marked void; its journal entries are reversed by posting their mirror
  // image rather than being removed, so the ledger still shows what happened.
  fastify.post('/:id/void', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { reason } = (request.body ?? {}) as { reason?: string };
    if (!String(reason ?? '').trim()) {
      return reply.status(400).send({ error: 'A reason is required to void a posted invoice.' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const inv = await trx.selectFrom('sales_invoices')
        .select(['id', 'status', 'invoice_number', 'bill_date'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!inv) return reply.status(404).send({ error: 'Invoice not found' });
      if (inv.status === 'Void') return reply.status(409).send({ error: 'That invoice is already void.' });

      try {
        await assertPeriodOpen(trx, user.tenant_id, inv.bill_date, await tenantJurisdiction(trx, user.tenant_id));
      } catch (e) {
        if (isPeriodError(e)) return reply.status(409).send({ error: e.message });
        throw e;
      }

      const reversed = await reverseDocumentJournals(
        trx, user.tenant_id, 'AR', id, user.sub, String(reason).trim());

      await trx.updateTable('sales_invoices')
        .set({ status: 'Void', notes: null, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      await trx.insertInto('invoice_activity_log').values({
        tenant_id: user.tenant_id, invoice_id: id, actor_id: user.sub,
        action: 'voided', detail: `Voided: ${String(reason).trim()}`, created_at: new Date(),
      }).execute();

      return { success: true, journals_reversed: reversed };
    });
  });

  // DELETE /v1/invoices/:id
  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('sales_invoices')
        .select(['id', 'status', 'invoice_number', 'bill_date'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Invoice not found' });

      // A posted invoice has hit the ledger and may already have been filed.
      // Deleting it leaves the journal entry pointing at nothing — there is one
      // such orphan in this database from before this check existed. Void it
      // instead, which reverses the entry and keeps both halves on record.
      if (existing.status !== 'Draft') {
        return reply.status(409).send({
          error: new DocumentPosted('Invoice', existing.invoice_number).message,
          void_endpoint: `/v1/invoices/${id}/void`,
        });
      }
      try {
        await assertPeriodOpen(trx, user.tenant_id, existing.bill_date, await tenantJurisdiction(trx, user.tenant_id));
      } catch (e) {
        if (isPeriodError(e)) return reply.status(409).send({ error: e.message });
        throw e;
      }
      await trx.deleteFrom('sales_invoice_lines').where('invoice_id', '=', id).execute();
      await trx.deleteFrom('sales_invoices').where('id', '=', id).execute();
      return { success: true };
    });
  });

  // POST /v1/invoices/:id/payment
  fastify.post('/:id/payment', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
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
      // Money received against an invoice — the closing leg of a consignment's
      // journey, and the trigger downstream apps care about.
      emitDomainEvent(trx, user.tenant_id, {
        type: 'invoice.payment_recorded', sourceApp: 'finops', entityType: 'invoice', entityId: id,
        payload: { amount: Number(amount), method: method || null, customerId: (inv as any).customer_id ?? null },
      }).catch(err => console.error('[Finance] payment_recorded emit failed:', err.message));

      const payments = await trx.selectFrom('invoice_payments').select('amount').where('invoice_id', '=', id).execute();
      const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
      // Get lines to compute grand total
      const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', id).execute();
      // The old fallback here was `|| 2650` - a hardcoded TZS/USD rate
      // invented at the point of use. 1 is the only honest default: it means
      // "no conversion", not "guess".
      const grandTotal = invoiceGrandTotal(lines, inv.currency, Number(inv.exchange_rate) || 1);
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

      await trx.insertInto('invoice_activity_log').values({
        tenant_id: user.tenant_id, invoice_id: id, actor_id: user.sub, actor_name: user.name || user.email,
        action: 'payment_recorded', detail: `${method || 'Payment'} of ${Number(amount).toLocaleString()} recorded`, created_at: new Date(),
      }).execute();

      return { success: true, received: totalPaid, status: newStatus };
    });
  });

  // ── POST /v1/invoices/:id/submit-to-tra ──────────────────────────────────────
  // Submit invoice to TRA EFDMS and receive a receipt verification number + QR code.
  fastify.post('/:id/submit-to-tra', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
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

  const FIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;

  // ═══════════════════════════════════════════════════════════════
  // Notes
  // ═══════════════════════════════════════════════════════════════

  fastify.get('/:id/notes', async (request) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const notes = await trx.selectFrom('invoice_notes').selectAll()
        .where('invoice_id', '=', id).orderBy('created_at', 'desc').execute();
      return { data: notes };
    });
  });

  fastify.post('/:id/notes', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { content } = request.body as { content: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'content is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const note = await trx.insertInto('invoice_notes').values({
        tenant_id: user.tenant_id,
        invoice_id: id,
        author_id: user.sub,
        author_name: user.name || user.email,
        content: content.trim(),
        created_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('invoice_activity_log').values({
        tenant_id: user.tenant_id, invoice_id: id, actor_id: user.sub, actor_name: user.name || user.email,
        action: 'note_added', detail: content.trim().slice(0, 140), created_at: new Date(),
      }).execute();
      return note;
    });
  });

  fastify.delete('/:id/notes/:noteId', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { noteId } = request.params as { id: string; noteId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('invoice_notes').select('id').where('id', '=', noteId).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Note not found' });
      await trx.deleteFrom('invoice_notes').where('id', '=', noteId).execute();
      return reply.status(204).send();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Tasks
  // ═══════════════════════════════════════════════════════════════

  fastify.get('/:id/tasks', async (request) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const tasks = await trx.selectFrom('invoice_tasks').selectAll()
        .where('invoice_id', '=', id).orderBy('created_at', 'asc').execute();
      return { data: tasks };
    });
  });

  fastify.post('/:id/tasks', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { description, assignee, due_date } = request.body as any;
    if (!description?.trim()) return reply.status(400).send({ error: 'description is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const task = await trx.insertInto('invoice_tasks').values({
        tenant_id: user.tenant_id, invoice_id: id,
        description: description.trim(), assignee: assignee || null, due_date: due_date || null,
        done: false, created_by: user.name || user.sub, created_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('invoice_activity_log').values({
        tenant_id: user.tenant_id, invoice_id: id, actor_id: user.sub, actor_name: user.name || user.email,
        action: 'task_added', detail: description.trim().slice(0, 140), created_at: new Date(),
      }).execute();
      return task;
    });
  });

  fastify.patch('/:id/tasks/:taskId', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id, taskId } = request.params as { id: string; taskId: string };
    const body = request.body as any;
    const patch: Record<string, any> = {};
    for (const k of ['description', 'assignee', 'due_date', 'done']) {
      if (k in body) patch[k] = body[k];
    }
    return withTenant(user.tenant_id, async (trx) => {
      const t = await trx.updateTable('invoice_tasks').set(patch).where('id', '=', taskId).returningAll().executeTakeFirst();
      if (!t) return reply.status(404).send({ error: 'Task not found' });
      if ('done' in body) {
        await trx.insertInto('invoice_activity_log').values({
          tenant_id: user.tenant_id, invoice_id: id, actor_id: user.sub, actor_name: user.name || user.email,
          action: body.done ? 'task_completed' : 'task_reopened', detail: t.description.slice(0, 140), created_at: new Date(),
        }).execute();
      }
      return t;
    });
  });

  fastify.delete('/:id/tasks/:taskId', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { taskId } = request.params as { id: string; taskId: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('invoice_tasks').where('id', '=', taskId).execute();
      return reply.status(204).send();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Reminders
  // ═══════════════════════════════════════════════════════════════

  fastify.get('/:id/reminders', async (request) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const reminders = await trx.selectFrom('invoice_reminders').selectAll()
        .where('invoice_id', '=', id).orderBy('remind_date', 'asc').execute();
      return { data: reminders };
    });
  });

  fastify.post('/:id/reminders', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { remind_date, message } = request.body as any;
    if (!remind_date || !message?.trim()) return reply.status(400).send({ error: 'remind_date and message are required' });
    return withTenant(user.tenant_id, async (trx) => {
      const rem = await trx.insertInto('invoice_reminders').values({
        tenant_id: user.tenant_id, invoice_id: id,
        remind_date, message: message.trim(), done: false, created_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('invoice_activity_log').values({
        tenant_id: user.tenant_id, invoice_id: id, actor_id: user.sub, actor_name: user.name || user.email,
        action: 'reminder_set', detail: `${remind_date}: ${message.trim().slice(0, 120)}`, created_at: new Date(),
      }).execute();
      return rem;
    });
  });

  fastify.patch('/:id/reminders/:reminderId', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { reminderId } = request.params as { id: string; reminderId: string };
    const body = request.body as any;
    const patch: Record<string, any> = {};
    for (const k of ['remind_date', 'message', 'done']) {
      if (k in body) patch[k] = body[k];
    }
    return withTenant(user.tenant_id, async (trx) => {
      const r = await trx.updateTable('invoice_reminders').set(patch).where('id', '=', reminderId).returningAll().executeTakeFirst();
      if (!r) return reply.status(404).send({ error: 'Reminder not found' });
      return r;
    });
  });

  fastify.delete('/:id/reminders/:reminderId', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { reminderId } = request.params as { id: string; reminderId: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('invoice_reminders').where('id', '=', reminderId).execute();
      return reply.status(204).send();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Activity Log (read-only — populated automatically by other routes)
  // ═══════════════════════════════════════════════════════════════

  fastify.get('/:id/activity', async (request) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const log = await trx.selectFrom('invoice_activity_log').selectAll()
        .where('invoice_id', '=', id).orderBy('created_at', 'desc').execute();
      return { data: log };
    });
  });
}

