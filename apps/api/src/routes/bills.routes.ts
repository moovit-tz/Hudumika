import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, withTenant } from '../db/client.js';

const BILL_STATUS = ['DRAFT', 'POSTED', 'PAID', 'PARTIAL', 'VOID'] as const;
const recurringBillSchema = z.object({
  name: z.string().max(200).optional(),
  supplier_id: z.string().optional(),
  supplier_name: z.string().max(300).optional(),
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']).optional(),
  currency: z.string().max(10).optional(),
  amount: z.number().min(0).optional(),
  tax_code_id: z.string().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  category: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  payment_terms: z.string().max(200).optional(),
  next_due: z.string().optional(),
  end_date: z.string().optional(),
  state: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).optional(),
  bills_generated: z.number().int().min(0).optional(),
  total_spend: z.number().min(0).optional(),
});
const billLineSchema = z.object({
  description: z.string().max(500).optional(),
  account_id: z.string().optional(),
  quantity: z.number().optional(),
  unit_cost: z.number().optional(),
  amount: z.number().optional(),
  tax_code_id: z.string().optional(),
}).passthrough(); // buildBillLines does its own detailed validation on each line — this just guards the shape isn't a non-object/non-array.
const billCreateSchema = z.object({
  items: z.array(billLineSchema).optional(),
  bill_number: z.string().max(100).optional(),
  supplier_id: z.string().optional(),
  supplier_name: z.string().max(300).optional(),
  shipment_ref: z.string().max(100).optional(),
  po_number: z.string().max(100).optional(),
  bill_date: z.string().optional(),
  due_date: z.string().optional(),
  status: z.enum(BILL_STATUS).optional(),
  currency: z.string().max(10).optional(),
  recurring_id: z.string().uuid().optional(),
  notes: z.string().max(5000).optional(),
});
import { requireRole } from '../middleware/rbac.js';
import { GLService } from '../services/gl.service.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import { AccountingIntegrationService } from '../services/accounting-integration.service.js';
import { TRAService } from '../services/tra.service.js';
import { isTaxCodeUserError, resolveLineTax, resolveTaxCode, splitInputTax } from '../services/tax-code.service.js';
import {
  DocumentPosted, assertPeriodOpen, isPeriodError, reverseDocumentJournals, tenantJurisdiction,
} from '../services/vat-period.service.js';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/**
 * Bill lines, with each line's tax split into what can be claimed and what
 * cannot.
 *
 * This is the whole purchase-side point. Input tax is only recoverable if the
 * treatment says so: a blocked purchase is charged tax you pay and never get
 * back. The split decides where the money goes in the ledger, so getting it
 * wrong is not a display bug — it is a wrong claim.
 *
 * A line with no tax code counts as NOT recoverable, deliberately. An
 * unrecorded treatment must not produce a claim nobody made.
 *
 * Resolved before any write, for the same reason as the invoice routes: a
 * reply returned from inside `withTenant` still commits the transaction.
 */
async function buildBillLines(
  trx: Transaction<Database>,
  tenantId: string,
  billId: string,
  items: any[],
): Promise<
  | { ok: false; error: string }
  | { ok: true; lines: any[]; subtotal: number; tax: number; recoverable: number;
      nonRecoverable: number; byAccount: Map<string, number> }
> {
  const codeIds = [...new Set(items.map(it => it?.tax_code_id).filter(Boolean))] as string[];
  const codes = new Map<string, { id: string; rate: number; input_tax_recoverable: boolean }>();
  for (const cid of codeIds) {
    try {
      const c = await resolveTaxCode(trx, tenantId, cid, 'PURCHASE');
      codes.set(cid, { id: c.id, rate: Number(c.rate), input_tax_recoverable: c.input_tax_recoverable });
    } catch (e) {
      if (isTaxCodeUserError(e)) return { ok: false as const, error: e.message };
      throw e;
    }
  }

  let subtotal = 0, tax = 0, recoverable = 0, nonRecoverable = 0;
  // Cost is accumulated per expense account, so a bill mixing freight and
  // insurance no longer lands entirely under port charges.
  const byAccount = new Map<string, number>();
  const lines = items.map((it: any, i: number) => {
    const code = it.tax_code_id ? codes.get(it.tax_code_id) : undefined;
    // A code, when given, decides the rate — the two can never disagree.
    const rate = code ? code.rate : (Number(it.tax_rate) || 0);
    const net = (Number(it.qty) || 1) * (Number(it.unit_price) || 0);
    const lineTax = net * (rate / 100);
    const split = splitInputTax(lineTax, code);

    subtotal += net;
    tax += lineTax;
    recoverable += split.recoverable;
    nonRecoverable += split.nonRecoverable;

    // Non-recoverable tax is part of the cost of *this* line, so it follows the
    // line's own account rather than being dumped on a default one.
    const acct = accountForCategory(it.category);
    byAccount.set(acct, (byAccount.get(acct) ?? 0) + net + split.nonRecoverable);

    return {
      bill_id: billId,
      description: it.description || '',
      category: it.category || 'OTHER',
      qty: Number(it.qty) || 1,
      unit_price: Number(it.unit_price) || 0,
      tax_rate: rate,
      tax_code_id: code ? code.id : null,
      sort_order: i,
    };
  });
  return { ok: true as const, lines, subtotal, tax, recoverable, nonRecoverable, byAccount };
}

/**
 * Which expense account a bill line belongs in.
 *
 * Every bill used to debit `5000 Port & Customs Charges` regardless of what was
 * bought — so insurance, professional fees, utilities and warehouse costs all
 * landed under port charges and the P&L misattributed everything that was not
 * freight. The category was already being collected on every line and simply
 * never read.
 *
 * Codes are the ones gl.service.ts's STANDARD_COA actually seeds; anything
 * without a natural home stays on 5000 rather than posting to an account that
 * does not exist.
 */
const CATEGORY_ACCOUNT: Record<string, string> = {
  FREIGHT:      '5001',  // Freight Costs
  CUSTOMS:      '5000',  // Port & Customs Charges
  PORT:         '5000',
  TRANSPORT:    '5002',  // Transport Costs
  WAREHOUSE:    '5003',  // Storage & Demurrage
  UTILITIES:    '5102',  // Utilities
  PROFESSIONAL: '5100',  // Salaries & Wages is the closest seeded account
  INSURANCE:    '5000',
  OTHER:        '5000',
};

function accountForCategory(category: string | null | undefined): string {
  return CATEGORY_ACCOUNT[String(category ?? '').toUpperCase()] ?? '5000';
}

/**
 * The journal for a posted bill.
 *
 * Recoverable input tax goes to `1150 VAT Input (Recoverable)` — an asset,
 * because it is money the revenue authority owes you. Non-recoverable input tax
 * is not an asset and never becomes one, so it is added to the cost of what was
 * bought.
 *
 * Before migration 181 both went as a debit to `2200 VAT Payable`, the output
 * tax liability. That netted the two halves of the return into a single balance
 * (so neither could be reported), and it reclaimed blocked tax by construction,
 * understating what was owed.
 */
function billJournalLines(args: {
  byAccount: Map<string, number>; recoverable: number; nonRecoverable: number; total: number;
}) {
  const { byAccount, recoverable, nonRecoverable, total } = args;
  return [
    ...[...byAccount.entries()]
      .filter(([, amount]) => amount !== 0)
      .map(([accountCode, amount]) => ({
        accountCode, debit: amount, credit: 0,
        description: nonRecoverable > 0 ? 'Purchase (incl. non-recoverable tax)' : 'Purchase',
      })),
    ...(recoverable > 0
      ? [{ accountCode: '1150', debit: recoverable, credit: 0, description: 'VAT input tax (recoverable)' }]
      : []),
    { accountCode: '2000', debit: 0, credit: total, description: 'Accounts Payable' },
  ];
}

export async function billRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

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
  fastify.post('/recurring', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const body = recurringBillSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      // The treatment is validated here rather than when a bill is generated —
      // a template carrying a code from another workspace, or a sales-only code,
      // would otherwise fail silently every cycle.
      let recTax: { tax_code_id: string | null; rate: number };
      try {
        recTax = await resolveLineTax(trx, user.tenant_id,
          { tax_code_id: body.tax_code_id, tax_pct: body.tax_rate }, 0, 'PURCHASE');
      } catch (e) {
        if (isTaxCodeUserError(e)) return reply.status(400).send({ error: e.message });
        throw e;
      }
      const rec = await trx.insertInto('recurring_bills').values({
        tenant_id: user.tenant_id,
        name: body.name || null,
        supplier_id: body.supplier_id || null,
        supplier_name: body.supplier_name || null,
        frequency: body.frequency || 'MONTHLY',
        currency: body.currency || 'USD',
        amount: Number(body.amount) || 0,
        tax_rate: recTax.rate,
        tax_code_id: recTax.tax_code_id,
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
  fastify.patch('/recurring/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = recurringBillSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('recurring_bills').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Recurring bill not found' });
      const updates: any = { updated_at: new Date() };
      const fields = ['name', 'supplier_id', 'supplier_name', 'frequency', 'currency', 'amount', 'category', 'description', 'payment_terms', 'next_due', 'end_date', 'state', 'bills_generated', 'total_spend'];
      const b = body as Record<string, unknown>;
      for (const f of fields) {
        if (b[f] !== undefined) updates[f] = b[f];
      }
      // Rate and treatment move together, or they drift apart.
      if (body.tax_code_id !== undefined || body.tax_rate !== undefined) {
        try {
          const t = await resolveLineTax(trx, user.tenant_id,
            { tax_code_id: body.tax_code_id, tax_pct: body.tax_rate }, 0, 'PURCHASE');
          updates.tax_rate = t.rate;
          updates.tax_code_id = t.tax_code_id;
        } catch (e) {
          if (isTaxCodeUserError(e)) return reply.status(400).send({ error: e.message });
          throw e;
        }
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

  // GET /v1/bills/payments  (must be before /:id) — every bill payment for
  // the tenant; Bills.tsx filters this client-side per bill it's viewing.
  // Previously the frontend never called any endpoint for this at all — its
  // "payments" state was seeded once from a hardcoded MOCK_PAYMENTS array
  // and only ever grew via optimistic local pushes that vanished on reload.
  fastify.get('/payments', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('bill_payments')
        .innerJoin('supplier_bills', 'supplier_bills.id', 'bill_payments.bill_id')
        .select([
          'bill_payments.id', 'bill_payments.bill_id', 'bill_payments.amount', 'bill_payments.currency',
          'bill_payments.payment_date', 'bill_payments.method', 'bill_payments.reference', 'bill_payments.note',
          'bill_payments.created_at',
          'supplier_bills.bill_number', 'supplier_bills.supplier_name',
        ])
        .where('bill_payments.tenant_id', '=', user.tenant_id)
        .orderBy('bill_payments.created_at', 'desc')
        .execute();
    });
  });

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
  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const body = billCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const items: any[] = Array.isArray(body.items) ? body.items : [];
      // Resolved before the header insert — an early 400 from inside withTenant
      // commits the transaction, so validating later leaves an orphan bill.
      const built = await buildBillLines(trx, user.tenant_id, '', items);
      if (!built.ok) return reply.status(400).send({ error: built.error });
      const { subtotal, tax: tax_amount, recoverable, nonRecoverable } = built;
      const total = subtotal + tax_amount;

      const billNumber = body.bill_number || `BILL-${Date.now()}`;
      if (body.bill_number) {
        const clash = await trx.selectFrom('supplier_bills').select('id')
          .where('tenant_id', '=', user.tenant_id).where('bill_number', '=', billNumber)
          .executeTakeFirst();
        if (clash) {
          return reply.status(409).send({ error: `Bill number ${billNumber} is already in use.` });
        }
      }

      const bill = await trx.insertInto('supplier_bills').values({
        tenant_id: user.tenant_id,
        bill_number: billNumber,
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

      if (built.lines.length > 0) {
        await trx.insertInto('supplier_bill_lines')
          .values(built.lines.map(l => ({ ...l, bill_id: bill.id }))).execute();
      }

      if (bill.status === 'POSTED' && total > 0) {
        await GLService.post(user.tenant_id, {
          entryDate: bill.bill_date ? new Date(bill.bill_date).toISOString() : new Date().toISOString(),
          description: `Supplier bill: ${bill.bill_number}`,
          reference: bill.bill_number,
          sourceModule: 'AP',
          sourceId: bill.id,
          createdBy: user.sub,
          lines: billJournalLines({ byAccount: built.byAccount, recoverable, nonRecoverable, total }),
        });
      }

      // Trigger accounting integration sync in background
      if (bill.status === 'POSTED') {
        AccountingIntegrationService.syncBill(user.tenant_id, bill.id).catch(console.error);
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
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = billCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('supplier_bills').select(['id', 'bill_date'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Bill not found' });

      try {
        const juris = await tenantJurisdiction(trx, user.tenant_id);
        await assertPeriodOpen(trx, user.tenant_id, existing.bill_date, juris);
        if (body.bill_date) await assertPeriodOpen(trx, user.tenant_id, body.bill_date, juris);
      } catch (e) {
        if (isPeriodError(e)) return reply.status(409).send({ error: e.message });
        throw e;
      }

      const updates: any = { updated_at: new Date() };
      const fields = ['bill_number', 'supplier_id', 'supplier_name', 'shipment_ref', 'po_number', 'bill_date', 'due_date', 'status', 'currency', 'notes', 'recurring_id'];
      const b = body as Record<string, unknown>;
      for (const f of fields) {
        if (b[f] !== undefined) updates[f] = b[f];
      }

      // Resolved before the line delete below — the delete is a write, and a
      // 400 returned afterwards would still commit it, leaving the bill empty.
      const rebuilt = await buildBillLines(trx, user.tenant_id, id, Array.isArray(body.items) ? body.items : []);
      if (!rebuilt.ok) return reply.status(400).send({ error: rebuilt.error });

      if (Array.isArray(body.items)) {
        updates.subtotal = rebuilt.subtotal;
        updates.tax_amount = rebuilt.tax;
        updates.total = rebuilt.subtotal + rebuilt.tax;

        await trx.deleteFrom('supplier_bill_lines').where('bill_id', '=', id).execute();
        if (rebuilt.lines.length > 0) {
          await trx.insertInto('supplier_bill_lines').values(rebuilt.lines).execute();
        }
      }

      await trx.updateTable('supplier_bills').set(updates).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      const bill = await trx.selectFrom('supplier_bills').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow();

      if (bill.status === 'POSTED') {
        const alreadyPosted = await trx
          .selectFrom('journal_entries')
          .select('id')
          .where('tenant_id', '=', user.tenant_id)
          .where('source_module', '=', 'AP')
          .where('source_id', '=', id)
          .where('description', 'like', 'Supplier bill%')
          .executeTakeFirst();

        if (!alreadyPosted) {
          const totalVal = Number(bill.total) || 0;
          const subtotalVal = Number(bill.subtotal) || 0;

          // The split has to come from the lines as they now stand, not from
          // the header's single tax_amount — the header cannot say which part
          // of it is claimable. A PATCH that did not send items still posts,
          // so the stored lines are re-read rather than assumed.
          const stored = await trx
            .selectFrom('supplier_bill_lines as l')
            .leftJoin('tax_codes as tc', 'tc.id', 'l.tax_code_id')
            .select(['l.qty', 'l.unit_price', 'l.tax_rate', 'l.category', 'tc.input_tax_recoverable'])
            .where('l.bill_id', '=', id)
            .execute();

          let recoverable = 0, nonRecoverable = 0;
          const byAccount = new Map<string, number>();
          for (const l of stored) {
            const net = (Number(l.qty) || 1) * (Number(l.unit_price) || 0);
            const lineTax = net * ((Number(l.tax_rate) || 0) / 100);
            const s = splitInputTax(lineTax, l.input_tax_recoverable === null ? null : { input_tax_recoverable: l.input_tax_recoverable });
            recoverable += s.recoverable;
            nonRecoverable += s.nonRecoverable;
            const acct = accountForCategory(l.category);
            byAccount.set(acct, (byAccount.get(acct) ?? 0) + net + s.nonRecoverable);
          }

          if (totalVal > 0) {
            await GLService.post(user.tenant_id, {
              entryDate: bill.bill_date ? new Date(bill.bill_date).toISOString() : new Date().toISOString(),
              description: `Supplier bill: ${bill.bill_number}`,
              reference: bill.bill_number,
              sourceModule: 'AP',
              sourceId: bill.id,
              createdBy: user.sub,
              lines: billJournalLines({ byAccount, recoverable, nonRecoverable, total: totalVal }),
            });
          }
        }
      }

      // Trigger accounting integration sync in background
      if (bill.status === 'POSTED') {
        AccountingIntegrationService.syncBill(user.tenant_id, bill.id).catch(console.error);
      }

      return bill;
    });
  });

  // POST /v1/bills/:id/void
  fastify.post('/:id/void', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { reason } = (request.body ?? {}) as { reason?: string };
    if (!String(reason ?? '').trim()) {
      return reply.status(400).send({ error: 'A reason is required to void a posted bill.' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const bill = await trx.selectFrom('supplier_bills')
        .select(['id', 'status', 'bill_number', 'bill_date'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!bill) return reply.status(404).send({ error: 'Bill not found' });
      if (bill.status === 'VOID') return reply.status(409).send({ error: 'That bill is already void.' });

      try {
        await assertPeriodOpen(trx, user.tenant_id, bill.bill_date, await tenantJurisdiction(trx, user.tenant_id));
      } catch (e) {
        if (isPeriodError(e)) return reply.status(409).send({ error: e.message });
        throw e;
      }

      // Reversing the journal also reverses the input-tax claim: the 1150 debit
      // is credited back, so a voided bill stops contributing to what is
      // recoverable. That is the whole reason a void has to touch the ledger.
      const reversed = await reverseDocumentJournals(
        trx, user.tenant_id, 'AP', id, user.sub, String(reason).trim());

      await trx.updateTable('supplier_bills')
        .set({ status: 'VOID', updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      return { success: true, journals_reversed: reversed };
    });
  });

  // DELETE /v1/bills/:id
  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('supplier_bills')
        .select(['id', 'status', 'bill_number', 'bill_date'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Bill not found' });

      // Same rule as invoices: a posted bill has hit the ledger, and an input
      // tax claim may already have been made on it. Void, do not delete.
      if (existing.status !== 'DRAFT') {
        return reply.status(409).send({
          error: new DocumentPosted('Bill', existing.bill_number).message,
          void_endpoint: `/v1/bills/${id}/void`,
        });
      }
      try {
        await assertPeriodOpen(trx, user.tenant_id, existing.bill_date, await tenantJurisdiction(trx, user.tenant_id));
      } catch (e) {
        if (isPeriodError(e)) return reply.status(409).send({ error: e.message });
        throw e;
      }
      await trx.deleteFrom('supplier_bill_lines').where('bill_id', '=', id).execute();
      await trx.deleteFrom('supplier_bills').where('id', '=', id).execute();
      return { success: true };
    });
  });

  // POST /v1/bills/:id/payment
  fastify.post('/:id/payment', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { amount, currency, payment_date, method, reference, note } = z.object({
      amount: z.number().positive(),
      currency: z.string().max(10).optional(),
      payment_date: z.string().optional(),
      method: z.string().max(50).optional(),
      reference: z.string().max(200).optional(),
      note: z.string().max(2000).optional(),
    }).parse(request.body);
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

      // Money paid out to a supplier — the A/P counterpart of an invoice
      // payment, so cross-app subscribers see cash leaving, not just cash in.
      emitDomainEvent(trx, user.tenant_id, {
        type: 'bill.payment_recorded', sourceApp: 'finops', entityType: 'bill', entityId: id,
        payload: { amount: Number(amount), method: method || null, supplierId: (bill as any).supplier_id ?? null },
      }).catch(err => console.error('[Finance] bill payment_recorded emit failed:', err.message));

      // Recalculate paid_amount from all payments
      const payments = await trx.selectFrom('bill_payments').select('amount').where('bill_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
      const billTotal = Number(bill.total) || 0;

      let newStatus: string;
      if (totalPaid >= billTotal && billTotal > 0) newStatus = 'PAID';
      else if (totalPaid > 0) newStatus = 'PARTIAL';
      else newStatus = 'POSTED';

      await trx.updateTable('supplier_bills').set({ paid_amount: totalPaid, status: newStatus, updated_at: new Date() }).where('id', '=', id).execute();

      // Post payment to GL
      await GLService.post(user.tenant_id, {
        entryDate: payment_date ? new Date(payment_date).toISOString() : new Date().toISOString(),
        description: `Bill payment: ${bill.bill_number}`,
        reference: bill.bill_number,
        sourceModule: 'AP',
        sourceId: bill.id,
        createdBy: user.sub,
        lines: [
          { accountCode: '2000', debit: Number(amount), credit: 0, description: 'Clear AP' },
          { accountCode: '1010', debit: 0, credit: Number(amount), description: 'Cash paid' },
        ],
      });

      // Trigger accounting integration payment sync in background
      AccountingIntegrationService.syncPayment(user.tenant_id, id, 'BILL').catch(console.error);

      return { success: true, paid_amount: totalPaid, status: newStatus };
    });
  });

  // ── POST /v1/bills/:id/verify-efd ─────────────────────────────────────────
  // Verify a supplier EFD/VFD receipt number against the TRA portal.
  // Optionally saves the receipt number on the bill.
  fastify.post('/:id/verify-efd', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as { id: string };
    const { efd_receipt_number } = request.body as any;

    if (!efd_receipt_number) {
      return reply.status(400).send({ error: 'efd_receipt_number is required' });
    }

    // Verify with TRA
    const verifyResult = await TRAService.verifyEFDReceipt(efd_receipt_number);

    // Save to DB regardless of verification (user might want to track the receipt number)
    await db.updateTable('supplier_bills').set({
      efd_receipt_number,
      efd_verified: verifyResult.verified ?? false,
      efd_verified_at: verifyResult.verified ? new Date() : null,
      efd_verification_data: verifyResult.data ?? null,
      updated_at: new Date(),
    }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

    return {
      success: true,
      efd_receipt_number,
      verified: verifyResult.verified,
      verifyUrl: `https://verify.tra.go.tz/efdmsRctVerify/${efd_receipt_number}`,
      message: verifyResult.verified
        ? '✅ Receipt verified with TRA'
        : '⚠️ Receipt not found or could not be verified. Please check the number and try again.',
    };
  });
}
