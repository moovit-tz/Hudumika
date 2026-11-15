import { createHash, randomUUID } from 'node:crypto';
import { renderPurchaseOrderPdf } from '../services/finance-document-pdf.service.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireFinanceCapability } from '../middleware/finance-capability.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { getNextDocNumber, getNextCustomerDocNumber } from '../lib/doc-numbering.js';
import { isTaxCodeUserError, resolveTaxCode } from '../services/tax-code.service.js';
import { InventoryService, InvalidMovement, UnknownUom } from '../services/inventory.service.js';
import { sql, type Transaction } from 'kysely';
import type { Database, TaxCodeKind } from '../db/client.js';
import { tenantHasEnabledFinanceCapability } from '../services/finance-capability.service.js';
import { NotificationService } from '../services/notification.service.js';
import { GLService } from '../services/gl.service.js';
import { assertPeriodOpenForJurisdictions, isPeriodError } from '../services/vat-period.service.js';
import { reportingCurrency } from '../services/tax-registration.service.js';
import { accountForBillCategory } from '../services/supplier-bill-accounts.js';

// Wire format is uppercase (PurchaseOrders.tsx's toApiStatus does
// POStatus.toUpperCase() before sending) even though the frontend's own
// display type is title-case ('Draft'|'Sent'|...).
const PO_STATUS = ['DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED'] as const;
type VatCreditTreatment = { code: string; kind: TaxCodeKind; jurisdiction: string; recoverable: boolean };

function supplierReturnBillLines(trx: Transaction<Database>, tenantId: string, billIds: string[]) {
  return trx.selectFrom('supplier_bill_lines as line')
    .innerJoin('supplier_bills as bill', 'bill.id', 'line.bill_id')
    .leftJoin('tax_codes as code', join => join
      .onRef('code.id', '=', 'line.tax_code_id').on('code.tenant_id', '=', tenantId))
    .where('bill.tenant_id', '=', tenantId).where('line.bill_id', 'in', billIds)
    .select([
      'line.id', 'line.bill_id', 'line.description', 'line.category', 'line.qty', 'line.unit_price', 'line.tax_rate',
      'line.tax_code_id', 'code.code', 'code.kind', 'code.jurisdiction', 'code.input_tax_recoverable',
    ])
    .orderBy('line.sort_order').orderBy('line.id').execute();
}

function creditAllocations(trx: Transaction<Database>, tenantId: string, billId: string, returnId: string) {
  return trx.selectFrom('supplier_return_credit_evidence as credit')
    .innerJoin('purchase_order_returns as other', join => join
      .onRef('other.id', '=', 'credit.return_id').onRef('other.tenant_id', '=', 'credit.tenant_id'))
    .where('credit.tenant_id', '=', tenantId).where('credit.bill_id', '=', billId)
    .where('credit.return_id', '!=', returnId).where('other.cancelled_at', 'is', null);
}

const cents = (value: number) => Math.round(value * 100);
type ReturnBillLine = Awaited<ReturnType<typeof supplierReturnBillLines>>[number];

function billExpenseTotals(lines: ReturnBillLine[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const net = Number(line.qty) * Number(line.unit_price);
    const expense = net + (line.input_tax_recoverable ? 0 : net * Number(line.tax_rate) / 100);
    const account = accountForBillCategory(line.category);
    totals.set(account, (totals.get(account) ?? 0) + expense);
  }
  return new Map([...totals].map(([account, amount]) => [account, cents(amount)] as const).filter(([, amount]) => amount !== 0));
}

async function validateReturnCreditLine(
  trx: Transaction<Database>, tenantId: string, billId: string, returnId: string,
  line: { id: string; qty: number; unit_price: number; tax_rate: number },
  net: number, tax: number,
) {
  const allocated = await creditAllocations(trx, tenantId, billId, returnId)
    .where('credit.bill_line_id', '=', line.id)
    .select(({ fn }) => [fn.sum<string>('credit.net_amount').as('net'), fn.sum<string>('credit.tax_amount').as('tax')])
    .executeTakeFirst();
  const lineNet = Number(line.qty) * Number(line.unit_price);
  return cents(net) + cents(Number(allocated?.net ?? 0)) <= cents(lineNet)
    && cents(tax) + cents(Number(allocated?.tax ?? 0)) <= cents(lineNet * Number(line.tax_rate) / 100);
}
const poLineSchema = z.object({
  description: z.string().max(500).optional(),
  category: z.string().max(100).optional(),
  qty: z.number().optional(),
  unit_price: z.number().optional(),
  tax_rate: z.number().optional(),
  tax_code_id: z.string().optional(),
  received_qty: z.number().optional(),
  item_id: z.string().uuid().optional().nullable(),
  item_uom: z.string().max(20).optional().nullable(),
}).passthrough(); // buildPoLines does its own per-line validation — this only guards the shape isn't a non-object.
const poCreateSchema = z.object({
  lines: z.array(poLineSchema).optional(),
  po_number: z.string().max(100).optional(),
  supplier_id: z.string().optional(),
  supplier_name: z.string().max(300).optional(),
  business_line_id: z.string().uuid().optional().nullable(),
  status: z.enum(PO_STATUS).optional(),
  order_date: z.string().optional(),
  expected_date: z.string().optional(),
  currency: z.string().max(10).optional(),
  notes: z.string().max(5000).optional(),
  warehouse_id: z.string().optional(),
  warehouse_name: z.string().max(200).optional(),
  payment_terms: z.string().max(200).optional(),
});

async function isActiveTenantBusinessLine(trx: Transaction<Database>, tenantId: string, id: string): Promise<boolean> {
  const line = await trx.selectFrom('finance_business_lines').select('id')
    .where('tenant_id', '=', tenantId).where('id', '=', id).where('active', '=', true).executeTakeFirst();
  return Boolean(line);
}


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
  const itemIds = [...new Set(items.flatMap(item => item.item_id ? [String(item.item_id)] : []))];
  if (itemIds.length > 0) {
    const inventoryItems = await trx.selectFrom('inventory_items').select(['id', 'base_uom'])
      .where('tenant_id', '=', tenantId).where('id', 'in', itemIds).execute();
    const baseUnits = new Map(inventoryItems.map(item => [item.id, item.base_uom]));
    for (const line of items) {
      if (!line.item_id) continue;
      const baseUom = baseUnits.get(line.item_id);
      if (!baseUom) return { ok: false, error: 'A linked inventory item was not found.' };
      if (line.qty !== undefined && line.qty <= 0) {
        return { ok: false, error: 'Inventory line quantities must be greater than zero.' };
      }
      try {
        await InventoryService.toBaseQty(trx, tenantId, line.item_id, baseUom, 1, line.item_uom || 'each');
      } catch (error) {
        if (error instanceof UnknownUom) return { ok: false, error: error.message };
        throw error;
      }
    }
  }

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
      item_id: it.item_id ?? null,
      item_uom: it.item_uom ?? null,
    };
  });
  return { ok: true as const, lines, subtotal, tax };
}

export async function purchaseOrderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));
  fastify.addHook('preHandler', requireFinanceCapability('finance.procurement', { preserveReadAccess: true }));

  // GET /v1/purchase-orders
  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

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
    const body = poCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      // HUD-0077: mirrors bills.routes.ts's own supplier-blocked guard — a
      // blocked supplier previously had zero enforcement anywhere, including
      // here, so a fresh purchase order could still be opened against one
      // mid-dispute with no warning.
      if (body.supplier_id) {
        const supplier = await trx.selectFrom('suppliers').select(['status', 'name', 'notes'])
          .where('id', '=', body.supplier_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (supplier?.status === 'blocked') {
          return reply.status(400).send({
            error: `${supplier.name} is blocked and cannot be ordered from${supplier.notes ? ` (${supplier.notes})` : ''}. Reactivate the supplier first if this was a mistake.`,
          });
        }
      }
      const items = Array.isArray(body.lines) ? body.lines : [];
      if (body.business_line_id) {
        if (!(await tenantHasEnabledFinanceCapability(user.tenant_id, 'finance.accounting.advanced'))) {
          return reply.status(403).send({ error: 'Business-line tracking requires Advanced Accounting to be enabled.', code: 'CAPABILITY_READ_ONLY', capability: 'finance.accounting.advanced' });
        }
        if (!(await isActiveTenantBusinessLine(trx, user.tenant_id, body.business_line_id))) {
          return reply.status(400).send({ error: 'Business line not found or archived.' });
        }
      }
      const built = await buildPoLines(trx, user.tenant_id, '', items);
      if (!built.ok) return reply.status(400).send({ error: built.error });
      const subtotal = built.subtotal;
      const tax_amount = built.tax;
      const total = subtotal + tax_amount;
      const poNumber = body.po_number
        || (body.supplier_id ? await getNextCustomerDocNumber(trx, user.tenant_id, body.supplier_id, 'purchase_order', 'suppliers') : null)
        || await getNextDocNumber(trx, user.tenant_id, 'purchase_order');

      const po = await trx
        .insertInto('purchase_orders')
        .values({
          tenant_id: user.tenant_id,
          po_number: poNumber,
          supplier_id: body.supplier_id || null,
          supplier_name: body.supplier_name || null,
          business_line_id: body.business_line_id || null,
          status: body.status || 'DRAFT',
          order_date: body.order_date ? new Date(body.order_date) : null,
          expected_date: body.expected_date ? new Date(body.expected_date) : null,
          currency: body.currency || await (async () => {
            const ts = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
            const s = ts ? (typeof ts.settings === 'string' ? JSON.parse(ts.settings) : ts.settings) : {};
            return s?.company?.currency || 'TZS';
          })(),
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

  const STATS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR'] as const;
  fastify.get('/stats', { preHandler: requireRole(...STATS_ROLES) }, async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await sql`
        SELECT po.status,
               count(*)::text AS cnt,
               coalesce(sum(
                 (SELECT coalesce(sum(l.unit_price * l.quantity * (1 - coalesce(l.discount_pct,0)/100)), 0)
                  FROM purchase_order_lines l WHERE l.po_id = po.id)
               ), 0)::text AS total_value,
               coalesce(sum(po.balance_paid), 0)::text AS total_paid
        FROM purchase_orders po
        WHERE po.tenant_id = ${user.tenant_id}
        GROUP BY po.status
      `.execute(trx);
      let total = 0, draftCount = 0, receivedCount = 0, totalValue = 0, receivedValue = 0;
      let totalPaid = 0;
      const now = new Date();
      for (const r of rows.rows as any[]) {
        const cnt = Number(r.cnt);
        const val = Number(r.total_value);
        total += cnt;
        totalValue += val;
        totalPaid += Number(r.total_paid);
        if (r.status === 'DRAFT') draftCount += cnt;
        if (r.status === 'RECEIVED') { receivedCount += cnt; receivedValue += val; }
      }
      const outstandingBalance = totalValue - totalPaid;
      return {
        total, draftCount, receivedCount,
        totalValue, receivedValue,
        pendingValue: totalValue - receivedValue,
        outstandingBalance,
        fulfillmentRate: total ? Math.round((receivedCount / total) * 100) : 0,
      };
    });
  });

  // GET /v1/purchase-orders/:id
  fastify.get('/:id/pdf', async (request, reply) => {
    const parsed = z.string().uuid().safeParse((request.params as {id: string}).id);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid document ID.' });
    try {
      const pdf = await renderPurchaseOrderPdf(request.user.tenant_id, parsed.data);
      return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="document-${parsed.data}.pdf"`).send(pdf);
    } catch (error) {
      if (error instanceof Error && error.message.endsWith('not found')) return reply.status(404).send({ error: 'Document not found.' });
      throw error;
    }
  });

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
    const body = poCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx
        .selectFrom('purchase_orders')
        .select(['id', 'status', 'business_line_id'])
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .forUpdate()
        .executeTakeFirst();

      if (!existing) return reply.status(404).send({ error: 'Purchase order not found' });
      if (body.lines) {
        const received = await trx.selectFrom('purchase_order_lines').select('id')
          .where('po_id', '=', id).where('received_qty', '>', 0).executeTakeFirst();
        if (received) return reply.status(409).send({ error: 'Order lines cannot be replaced after receiving has started.' });
      }

      if (body.business_line_id !== undefined && body.business_line_id !== existing.business_line_id) {
        if (existing.status !== 'DRAFT') return reply.status(400).send({ error: 'The business line cannot be changed after a purchase order leaves Draft.' });
        if (body.business_line_id) {
          if (!(await tenantHasEnabledFinanceCapability(user.tenant_id, 'finance.accounting.advanced'))) {
            return reply.status(403).send({ error: 'Business-line tracking requires Advanced Accounting to be enabled.', code: 'CAPABILITY_READ_ONLY', capability: 'finance.accounting.advanced' });
          }
          if (!(await isActiveTenantBusinessLine(trx, user.tenant_id, body.business_line_id))) {
            return reply.status(400).send({ error: 'Business line not found or archived.' });
          }
        }
      }

      const updates: any = { updated_at: new Date() };
      const fields = ['po_number', 'supplier_id', 'supplier_name', 'business_line_id', 'status', 'order_date', 'expected_date', 'currency', 'notes', 'warehouse_id', 'warehouse_name', 'payment_terms'];
      const b = body as Record<string, unknown>;
      for (const f of fields) {
        if (b[f] !== undefined) {
          updates[f] = (f === 'order_date' || f === 'expected_date') && b[f] ? new Date(b[f] as string) : b[f];
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
    const { status } = z.object({ status: z.enum(PO_STATUS) }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const before = await trx.selectFrom('purchase_orders').select(['po_number', 'supplier_name', 'status', 'created_by'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      await trx
        .updateTable('purchase_orders')
        .set({ status, updated_at: new Date() })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();
      // The person who raised it hears when someone else sends, receives or
      // cancels it.
      if (before && before.status !== status && before.created_by && before.created_by !== user.sub && status !== 'DRAFT') {
        const verb = { SENT: 'was sent to the supplier', PARTIAL: 'was partly received', RECEIVED: 'was received in full', CANCELLED: 'was cancelled' }[status as 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'];
        await NotificationService.createNotificationInTrx(trx, {
          tenantId: user.tenant_id, userId: before.created_by, app: 'finops',
          type: status === 'CANCELLED' ? 'warning' : 'info',
          title: `Purchase order ${before.po_number} ${status === 'CANCELLED' ? 'cancelled' : 'updated'}`,
          message: `${before.po_number}${before.supplier_name ? ` (${before.supplier_name})` : ''} ${verb}.`,
          link: `/finance/purchase-orders/${id}`, entityType: 'purchase_order', entityId: id, entityLabel: before.po_number,
        });
      }
      return { success: true };
    });
  });

  fastify.get('/:id/receipts', async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return withTenant(tenantId, async trx => {
      const order = await trx.selectFrom('purchase_orders').select('id')
        .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
      if (!order) return reply.status(404).send({ error: 'Purchase order not found' });
      const rows = await trx.selectFrom('purchase_order_receipt_lines as line')
        .innerJoin('purchase_order_receipts as receipt', join => join
          .onRef('receipt.tenant_id', '=', 'line.tenant_id')
          .onRef('receipt.po_id', '=', 'line.po_id')
          .onRef('receipt.request_key', '=', 'line.request_key'))
        .leftJoin('inventory_movements as movement', join => join
          .onRef('movement.id', '=', 'line.movement_id')
          .onRef('movement.tenant_id', '=', 'line.tenant_id'))
        .select([
          'line.po_line_id', 'line.description', 'line.received_qty', 'line.movement_id',
          'receipt.created_at', 'movement.item_id', 'movement.to_location_id', 'movement.batch_no',
          'movement.expiry_date', 'movement.entered_uom', 'movement.qty_delta', 'movement.unit_cost',
        ])
        .where('line.tenant_id', '=', tenantId).where('line.po_id', '=', id)
        .orderBy('receipt.created_at', 'desc')
        .orderBy('line.po_line_id')
        .execute();
      const drafts = await trx.selectFrom('purchase_order_returns as draft')
        .leftJoin('supplier_return_credit_evidence as credit', join => join
          .onRef('credit.return_id', '=', 'draft.id').onRef('credit.tenant_id', '=', 'draft.tenant_id'))
        .leftJoin('supplier_bill_lines as bill_line', join => join
          .onRef('bill_line.id', '=', 'credit.bill_line_id').onRef('bill_line.bill_id', '=', 'credit.bill_id'))
        .select([
          'draft.id', 'draft.receipt_movement_id', 'draft.quantity', 'draft.reason', 'draft.posted_at', 'draft.stock_movement_id',
          'credit.bill_id', 'credit.bill_line_id', 'credit.supplier_reference', 'credit.credit_date', 'credit.net_amount', 'credit.tax_amount', 'credit.currency',
          'bill_line.description as bill_line_description',
        ])
        .where('draft.tenant_id', '=', tenantId).where('draft.po_id', '=', id)
        .where('draft.cancelled_at', 'is', null).orderBy('draft.created_at', 'desc').execute();
      const byMovement = new Map<string, typeof drafts>();
      for (const draft of drafts) {
        const existing = byMovement.get(draft.receipt_movement_id) ?? [];
        existing.push(draft);
        byMovement.set(draft.receipt_movement_id, existing);
      }
      return rows.map(row => ({ ...row, return_drafts: row.movement_id ? byMovement.get(row.movement_id) ?? [] : [] }));
    });
  });

  fastify.get('/:id/return-credit-bills', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return withTenant(tenantId, async trx => {
      const order = await trx.selectFrom('purchase_orders').select('id')
        .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
      if (!order) return reply.status(404).send({ error: 'Purchase order not found' });
      const bills = await trx.selectFrom('supplier_bills').select(['id', 'bill_number', 'currency', 'total'])
        .where('tenant_id', '=', tenantId).where('po_id', '=', id)
        .where('status', 'in', ['POSTED', 'PARTIAL', 'PAID'])
        .orderBy('bill_date', 'desc').orderBy('id').execute();
      if (!bills.length) return [];
      const lines = await supplierReturnBillLines(trx, tenantId, bills.map(bill => bill.id));
      const byBill = new Map<string, typeof lines>();
      for (const line of lines) {
        const existing = byBill.get(line.bill_id) ?? [];
        existing.push(line);
        byBill.set(line.bill_id, existing);
      }
      return bills.map(bill => {
        const billLines = byBill.get(bill.id) ?? [];
        return {
          ...bill,
          requires_bill_line: new Set(billLines.map(line => `${line.tax_code_id ?? ''}:${line.tax_rate}`)).size > 1
            || billExpenseTotals(billLines).size > 1,
          lines: billLines.map(line => ({
            id: line.id, description: line.description, category: line.category, tax_rate: line.tax_rate, tax_code: line.code,
          })),
        };
      });
    });
  });

  fastify.post('/:id/returns/:returnId/credit-evidence', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { id, returnId } = z.object({ id: z.string().uuid(), returnId: z.string().uuid() }).parse(request.params);
    const input = z.object({
      bill_id: z.string().uuid(),
      bill_line_id: z.string().uuid().nullable().optional(),
      supplier_reference: z.string().trim().min(1).max(100),
      credit_date: z.string().date(),
      net_amount: z.number().positive().max(9999999999999.99).multipleOf(0.01),
      tax_amount: z.number().nonnegative().max(9999999999999.99).multipleOf(0.01),
    }).parse(request.body);
    return withTenant(tenantId, async trx => {
      const order = await trx.selectFrom('purchase_orders').select(['id', 'status'])
        .where('tenant_id', '=', tenantId).where('id', '=', id).forUpdate().executeTakeFirst();
      if (!order) return reply.status(404).send({ error: 'Purchase order not found' });
      const draft = await trx.selectFrom('purchase_order_returns').select(['id', 'cancelled_at', 'posted_at'])
        .where('tenant_id', '=', tenantId).where('po_id', '=', id).where('id', '=', returnId).executeTakeFirst();
      if (!draft) return reply.status(404).send({ error: 'Return draft not found' });
      if (draft.cancelled_at || draft.posted_at || order.status === 'CANCELLED') {
        return reply.status(409).send({ error: 'Credit evidence can only be recorded on an active return draft.' });
      }
      const bill = await trx.selectFrom('supplier_bills').select(['id', 'currency', 'subtotal', 'tax_amount', 'total'])
        .where('tenant_id', '=', tenantId).where('id', '=', input.bill_id).where('po_id', '=', id)
        .where('status', 'in', ['POSTED', 'PARTIAL', 'PAID']).forUpdate().executeTakeFirst();
      if (!bill) return reply.status(400).send({ error: 'Select a posted supplier bill linked to this purchase order.' });
      if (input.bill_line_id) {
        const line = (await supplierReturnBillLines(trx, tenantId, [bill.id])).find(row => row.id === input.bill_line_id);
        if (!line) return reply.status(400).send({ error: 'Select a line from the linked supplier bill.' });
        if (!await validateReturnCreditLine(trx, tenantId, bill.id, returnId, line, input.net_amount, input.tax_amount)) {
          return reply.status(409).send({ error: 'Recorded return credits would exceed the selected bill line amounts.' });
        }
      }
      const allocated = await creditAllocations(trx, tenantId, bill.id, returnId)
        .select(({ fn }) => [fn.sum<string>('credit.net_amount').as('net'), fn.sum<string>('credit.tax_amount').as('tax')])
        .executeTakeFirst();
      const netCents = cents(input.net_amount) + cents(Number(allocated?.net ?? 0));
      const taxCents = cents(input.tax_amount) + cents(Number(allocated?.tax ?? 0));
      if (netCents > cents(Number(bill.subtotal)) || taxCents > cents(Number(bill.tax_amount))
        || netCents + taxCents > cents(Number(bill.total))) {
        return reply.status(409).send({ error: 'Recorded return credits would exceed the supplier bill amounts.' });
      }
      const values = { ...input, bill_line_id: input.bill_line_id ?? null, currency: bill.currency, recorded_by: request.user.sub };
      return trx.insertInto('supplier_return_credit_evidence')
        .values({ ...values, tenant_id: tenantId, return_id: returnId })
        .onConflict(conflict => conflict.column('return_id').doUpdateSet({ ...values, recorded_at: new Date() })
          .where('supplier_return_credit_evidence.tenant_id', '=', tenantId))
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.post('/:id/returns', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({
      id: z.string().uuid(), receipt_movement_id: z.string().regex(/^[1-9]\d{0,17}$/),
      quantity: z.number().positive().multipleOf(0.01), reason: z.string().trim().min(1).max(500),
    }).parse(request.body);
    return withTenant(tenantId, async trx => {
      const order = await trx.selectFrom('purchase_orders').select(['id', 'status'])
        .where('tenant_id', '=', tenantId).where('id', '=', id).forUpdate().executeTakeFirst();
      if (!order) return reply.status(404).send({ error: 'Purchase order not found' });
      const previous = await trx.selectFrom('purchase_order_returns').selectAll()
        .where('tenant_id', '=', tenantId).where('po_id', '=', id).where('id', '=', input.id).executeTakeFirst();
      if (previous) {
        if (previous.receipt_movement_id !== input.receipt_movement_id
          || Number(previous.quantity) !== input.quantity || previous.reason !== input.reason) {
          return reply.status(409).send({ error: 'This return draft ID was already used with different details.' });
        }
        return previous;
      }
      if (order.status === 'CANCELLED') return reply.status(409).send({ error: 'This purchase order is cancelled.' });
      const source = await trx.selectFrom('purchase_order_receipt_lines')
        .select('received_qty').where('tenant_id', '=', tenantId).where('po_id', '=', id)
        .where('movement_id', '=', input.receipt_movement_id).executeTakeFirst();
      if (!source) return reply.status(404).send({ error: 'Stock receipt line not found on this purchase order.' });
      const reserved = await trx.selectFrom('purchase_order_returns')
        .select(({ fn }) => fn.sum<number>('quantity').as('quantity'))
        .where('tenant_id', '=', tenantId).where('po_id', '=', id)
        .where('receipt_movement_id', '=', input.receipt_movement_id).where('cancelled_at', 'is', null)
        .executeTakeFirst();
      const available = Math.round((Number(source.received_qty) - Number(reserved?.quantity ?? 0)) * 100);
      if (Math.round(input.quantity * 100) > available) {
        return reply.status(409).send({ error: 'This quantity exceeds the receipt quantity remaining after other return drafts.' });
      }
      const draft = await trx.insertInto('purchase_order_returns').values({
        ...input, tenant_id: tenantId, po_id: id, created_by: request.user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(draft);
    });
  });

  fastify.post('/:id/returns/:returnId/cancel', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { id, returnId } = z.object({ id: z.string().uuid(), returnId: z.string().uuid() }).parse(request.params);
    return withTenant(tenantId, async trx => {
      const order = await trx.selectFrom('purchase_orders').select('id')
        .where('tenant_id', '=', tenantId).where('id', '=', id).forUpdate().executeTakeFirst();
      if (!order) return reply.status(404).send({ error: 'Purchase order not found' });
      const draft = await trx.updateTable('purchase_order_returns')
        .set({ cancelled_at: sql`coalesce(cancelled_at, now())` })
        .where('tenant_id', '=', tenantId).where('po_id', '=', id).where('id', '=', returnId)
        .where('posted_at', 'is', null)
        .returning('id').executeTakeFirst();
      if (!draft) return reply.status(409).send({ error: 'This return is unavailable or has already been posted.' });
      return { success: true };
    });
  });

  fastify.post('/:id/returns/:returnId/post', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { id, returnId } = z.object({ id: z.string().uuid(), returnId: z.string().uuid() }).parse(request.params);
    const { apply_credit } = z.object({ apply_credit: z.boolean().default(false) }).parse(request.body ?? {});
    return withTenant(tenantId, async trx => {
      const order = await trx.selectFrom('purchase_orders').select(['id', 'po_number', 'business_line_id', 'status'])
        .where('tenant_id', '=', tenantId).where('id', '=', id).forUpdate().executeTakeFirst();
      if (!order) return reply.status(404).send({ error: 'Purchase order not found' });
      const draft = await trx.selectFrom('purchase_order_returns').selectAll()
        .where('tenant_id', '=', tenantId).where('po_id', '=', id).where('id', '=', returnId).executeTakeFirst();
      if (!draft) return reply.status(404).send({ error: 'Return draft not found' });
      if (draft.posted_at) return draft;
      if (draft.cancelled_at || order.status === 'CANCELLED') {
        return reply.status(409).send({ error: 'This return or its purchase order has been cancelled.' });
      }
      const credit = await trx.selectFrom('supplier_return_credit_evidence').selectAll()
        .where('tenant_id', '=', tenantId).where('return_id', '=', returnId).executeTakeFirst();
      let creditPosting: {
        billId: string; originalJournalId: string; expenseCode: string;
        amount: number; credited: number; settled: boolean; businessLineId: string | null;
        net: number; tax: number;
        vat: VatCreditTreatment | null;
      } | undefined;
      if (apply_credit) {
        if (!credit) return reply.status(409).send({ error: 'Record the supplier credit before posting this billed return.' });
        const bill = await trx.selectFrom('supplier_bills').selectAll()
          .where('tenant_id', '=', tenantId).where('id', '=', credit.bill_id).where('po_id', '=', id)
          .where('status', 'in', ['POSTED', 'PARTIAL']).forUpdate().executeTakeFirst();
        if (!bill) return reply.status(409).send({ error: 'The linked bill must have an open payable balance.' });
        const creditDate = new Date(credit.credit_date).toISOString().slice(0, 10);
        if (bill.bill_date && creditDate < new Date(bill.bill_date).toISOString().slice(0, 10)) {
          return reply.status(409).send({ error: 'The credit date cannot precede the original supplier bill date.' });
        }
        if (bill.currency !== credit.currency || Number(bill.exchange_rate) !== 1
          || bill.currency.toUpperCase() !== await reportingCurrency(trx, tenantId)) {
          return reply.status(409).send({ error: 'Foreign-exchange supplier credits require reconciliation. Credit evidence has been retained.' });
        }
        const net = Number(credit.net_amount);
        const tax = Number(credit.tax_amount);
        const originalTax = Number(bill.tax_amount);
        const amount = (cents(net) + cents(tax)) / 100;
        const billLines = await supplierReturnBillLines(trx, tenantId, [bill.id]);
        const treatmentCount = new Set(billLines.map(line => `${line.tax_code_id ?? ''}:${line.tax_rate}`)).size;
        const expenseTotals = billExpenseTotals(billLines);
        const selectedLine = billLines.find(line => line.id === credit.bill_line_id);
        if ((treatmentCount > 1 || expenseTotals.size > 1 || credit.bill_line_id) && !selectedLine) {
          return reply.status(409).send({ error: 'Select the original supplier bill line before posting this credit.' });
        }
        if (selectedLine) {
          const previousUnallocated = await creditAllocations(trx, tenantId, bill.id, returnId)
            .where('credit.bill_line_id', 'is', null).where('other.posted_at', 'is not', null)
            .select('credit.return_id').executeTakeFirst();
          if (previousUnallocated) return reply.status(409).send({ error: 'An earlier posted credit has no bill-line allocation. Reconcile it before posting a line-specific credit.' });
          if (!await validateReturnCreditLine(trx, tenantId, bill.id, returnId, selectedLine, net, tax)) {
            return reply.status(409).send({ error: 'Recorded return credits would exceed the selected bill line amounts.' });
          }
        } else {
          const previousAllocated = await creditAllocations(trx, tenantId, bill.id, returnId)
            .where('credit.bill_line_id', 'is not', null).where('other.posted_at', 'is not', null)
            .select('credit.return_id').executeTakeFirst();
          if (previousAllocated) return reply.status(409).send({ error: 'Select a bill line because earlier credits on this bill were allocated by line.' });
        }
        let vat: VatCreditTreatment | null = null;
        const treatment = selectedLine ?? billLines[0];
        if (originalTax > 0 || tax > 0 || selectedLine?.tax_code_id) {
          if (!treatment?.code || !treatment.kind || !treatment.jurisdiction || treatment.input_tax_recoverable == null) {
            return reply.status(409).send({ error: 'The original supplier bill line has no complete VAT treatment.' });
          }
          if (cents(tax) !== cents(net * Number(treatment.tax_rate) / 100)) {
            return reply.status(409).send({ error: 'The credit tax does not match the VAT rate recorded on the original bill.' });
          }
          vat = {
            code: treatment.code, kind: treatment.kind, jurisdiction: treatment.jurisdiction.toUpperCase(),
            recoverable: treatment.input_tax_recoverable,
          };
          await trx.selectFrom('vat_periods').select('id').where('tenant_id', '=', tenantId)
            .where('jurisdiction', '=', vat.jurisdiction).where('period_start', '<=', creditDate)
            .where('period_end', '>=', creditDate).orderBy('id').forUpdate().execute();
          await assertPeriodOpenForJurisdictions(trx, tenantId, creditDate, [vat.jurisdiction]);
        }
        const credited = cents(Number(bill.credited_amount)) + cents(amount);
        const settledAmount = cents(Number(bill.paid_amount)) + credited;
        const billTotal = cents(Number(bill.total));
        if (settledAmount > billTotal) {
          return reply.status(409).send({ error: 'This credit exceeds the open payable. A supplier refund or unapplied credit is required.' });
        }
        const journal = await trx.selectFrom('journal_entries as entry')
          .innerJoin('journal_lines as line', 'line.journal_entry_id', 'entry.id')
          .innerJoin('chart_of_accounts as account', join => join
            .onRef('account.id', '=', 'line.account_id').onRef('account.tenant_id', '=', 'entry.tenant_id'))
          .where('entry.tenant_id', '=', tenantId).where('entry.source_module', '=', 'AP')
          .where('entry.source_id', '=', bill.id).where('entry.status', '=', 'POSTED')
          .where('entry.voided_at', 'is', null).where('entry.reverses_entry_id', 'is', null)
          .where('entry.id', 'in', trx.selectFrom('journal_lines as ap_line')
            .innerJoin('chart_of_accounts as ap_account', 'ap_account.id', 'ap_line.account_id')
            .select('ap_line.journal_entry_id').where('ap_account.tenant_id', '=', tenantId)
            .where('ap_account.code', '=', '2000').where('ap_line.credit', '>', 0))
          .select(['entry.id', 'account.code', 'account.type', 'line.debit', 'line.credit', 'line.currency', 'line.exchange_rate'])
          .execute();
        const originalRecoverableTax = treatmentCount <= 1
          ? (vat?.recoverable ? cents(originalTax) : 0)
          : cents(billLines.reduce((total, line) => total + (line.input_tax_recoverable
            ? Number(line.qty) * Number(line.unit_price) * Number(line.tax_rate) / 100 : 0), 0));
        const expenseTotal = billTotal - originalRecoverableTax;
        const expenses = journal.filter(line => line.type === 'EXPENSE' && Number(line.debit) > 0 && Number(line.credit) === 0);
        const payable = journal.find(line => line.code === '2000' && cents(Number(line.credit)) === billTotal && Number(line.debit) === 0);
        const inputVat = journal.find(line => line.code === '1150' && cents(Number(line.debit)) === originalRecoverableTax && Number(line.credit) === 0);
        if (journal.length !== expenses.length + (originalRecoverableTax > 0 ? 2 : 1)
          || !expenseTotal || expenses.reduce((total, line) => total + cents(Number(line.debit)), 0) !== expenseTotal
          || !payable || (originalRecoverableTax > 0 && !inputVat)
          || journal.some(line => line.id !== payable.id)
          || journal.some(line => line.currency !== bill.currency || Number(line.exchange_rate) !== 1)) {
          return reply.status(409).send({ error: 'The original bill journal does not match the required expense, payable and VAT treatment.' });
        }
        let expense = expenses[0];
        if (expenseTotals.size > 1 || expenses.length > 1) {
          if (!selectedLine) return reply.status(409).send({ error: 'Select the original supplier bill line before posting this credit.' });
          const unmatched = new Map(expenseTotals);
          for (const line of expenses) {
            if (unmatched.get(line.code) !== cents(Number(line.debit))) {
              return reply.status(409).send({ error: 'The bill line expense accounts do not match the original journal.' });
            }
            unmatched.delete(line.code);
          }
          const selectedExpense = expenses.find(line => line.code === accountForBillCategory(selectedLine.category));
          if (unmatched.size || !selectedExpense) return reply.status(409).send({ error: 'The bill line expense accounts do not match the original journal.' });
          expense = selectedExpense;
        }
        creditPosting = {
          billId: bill.id, originalJournalId: expense.id, expenseCode: expense.code, amount, credited: credited / 100,
          settled: settledAmount === billTotal, businessLineId: bill.business_line_id,
          net, tax, vat,
        };
      } else {
        if (credit) return reply.status(409).send({ error: 'This return has supplier credit evidence. Use Post return and credit.' });
        const bill = await trx.selectFrom('supplier_bills').select('id')
          .where('tenant_id', '=', tenantId).where('status', '!=', 'VOID')
          .where(eb => eb.or([eb('po_id', '=', id), eb('po_number', '=', order.po_number)]))
          .executeTakeFirst();
        if (bill) return reply.status(409).send({
          error: 'A supplier bill is already linked to this order. This return requires credit evidence.',
        });
      }
      const receipt = await trx.selectFrom('purchase_order_receipt_lines as line')
        .innerJoin('inventory_movements as movement', join => join
          .onRef('movement.id', '=', 'line.movement_id')
          .onRef('movement.tenant_id', '=', 'line.tenant_id'))
        .innerJoin('inventory_items as item', join => join
          .onRef('item.id', '=', 'movement.item_id').onRef('item.tenant_id', '=', 'line.tenant_id'))
        .where('line.tenant_id', '=', tenantId).where('line.po_id', '=', id)
        .where('line.movement_id', '=', draft.receipt_movement_id)
        .where('movement.movement_type', '=', 'receipt')
        .select([
          'line.received_qty', 'movement.item_id', 'movement.to_location_id', 'movement.batch_no',
          'movement.qty_delta', 'movement.total_cost', 'item.base_uom',
        ]).executeTakeFirst();
      if (!receipt?.to_location_id || receipt.total_cost == null) {
        return reply.status(409).send({ error: 'The original receipt location or cost is unavailable.' });
      }
      const prior = await trx.selectFrom('purchase_order_returns')
        .select(({ fn }) => fn.sum<number>('quantity').as('quantity'))
        .where('tenant_id', '=', tenantId).where('po_id', '=', id)
        .where('receipt_movement_id', '=', draft.receipt_movement_id)
        .where('posted_at', 'is not', null).executeTakeFirst();
      const before = Number(prior?.quantity ?? 0) / Number(receipt.received_qty);
      const after = (Number(prior?.quantity ?? 0) + Number(draft.quantity)) / Number(receipt.received_qty);
      if (after > 1.000000001) return reply.status(409).send({ error: 'This return exceeds the original receipt quantity.' });
      const baseQty = (Math.round(Number(receipt.qty_delta) * after * 10000) - Math.round(Number(receipt.qty_delta) * before * 10000)) / 10000;
      const cost = (Math.round(Number(receipt.total_cost) * after * 100) - Math.round(Number(receipt.total_cost) * before * 100)) / 100;
      if (baseQty <= 0) return reply.status(409).send({ error: 'The return quantity is below the inventory unit precision.' });
      const movement = await InventoryService.recordMovement(trx, tenantId, {
        actorId: request.user.sub, movementType: 'supplier_return', itemId: receipt.item_id,
        fromLocationId: receipt.to_location_id, batchNo: receipt.batch_no,
        enteredQty: baseQty, enteredUom: receipt.base_uom, unitCost: cost / baseQty,
        reasonCode: 'po_supplier_return', reference: returnId, businessLineId: order.business_line_id,
      });
      if (credit && creditPosting) {
        const { amount, expenseCode, billId, credited, settled, businessLineId, originalJournalId, net, tax, vat } = creditPosting;
        const dimensions = businessLineId ? { business_line_id: businessLineId } : undefined;
        const journalEntryId = await GLService.post(tenantId, {
          entryDate: new Date(credit.credit_date).toISOString().slice(0, 10),
          description: `Supplier return credit: ${credit.supplier_reference}`,
          reference: credit.supplier_reference, sourceModule: 'AP', sourceId: returnId, createdBy: request.user.sub,
          lines: [
            { accountCode: '2000', debit: amount, credit: 0, description: 'Supplier payable reduced', currency: credit.currency, dimensions },
            { accountCode: expenseCode, debit: 0, credit: vat?.recoverable ? net : amount, description: 'Original purchase expense reversed', currency: credit.currency, dimensions },
            ...(vat?.recoverable && tax > 0 ? [{ accountCode: '1150', debit: 0, credit: tax, description: 'Recoverable input VAT reversed', currency: credit.currency, dimensions }] : []),
          ],
        }, trx);
        const original = await trx.selectFrom('journal_entries').select('id')
          .where('tenant_id', '=', tenantId).where('id', '=', originalJournalId)
          .where('status', '=', 'POSTED').where('voided_at', 'is', null).executeTakeFirst();
        if (!original) throw new InvalidMovement('The original supplier bill journal was voided before the credit posted.');
        await trx.updateTable('supplier_return_credit_evidence').set({
          journal_entry_id: journalEntryId, vat_code: vat?.code ?? null, vat_kind: vat?.kind ?? null,
          vat_jurisdiction: vat?.jurisdiction ?? null, vat_recoverable: vat?.recoverable ?? null,
        })
          .where('tenant_id', '=', tenantId).where('return_id', '=', returnId).execute();
        await trx.updateTable('supplier_bills').set({ credited_amount: credited, status: settled ? 'PAID' : 'PARTIAL', updated_at: new Date() })
          .where('tenant_id', '=', tenantId).where('id', '=', billId).execute();
      }
      return trx.updateTable('purchase_order_returns')
        .set({ posted_at: new Date(), posted_by: request.user.sub, stock_movement_id: String(movement.id) })
        .where('tenant_id', '=', tenantId).where('po_id', '=', id).where('id', '=', returnId)
        .returningAll().executeTakeFirstOrThrow();
    }).catch((error: unknown) => {
      if (error instanceof InvalidMovement || error instanceof UnknownUom || isPeriodError(error)) {
        return reply.status(409).send({ error: error.message });
      }
      throw error;
    });
  });

  // POST /v1/purchase-orders/:id/receive
  // Confirm physical receipt of goods against a PO. For each submitted line:
  //   1. Updates purchase_order_lines.received_qty by the delta
  //   2. If the line has an item_id, posts an inventory movement
  //      (DR 1300 Inventory / CR 2050 GRNI) via InventoryService
  //   3. Re-derives PO status: fully-received → RECEIVED, partially → PARTIAL
  //
  // A line without item_id (services, freight, expenses) is tracked for
  // quantity only — no inventory movement is posted.
  fastify.post('/:id/receive', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { lines } = z.object({
      lines: z.array(z.object({
        line_id: z.string().uuid(),
        received_qty: z.number().positive().multipleOf(0.01),
        location_id: z.string().uuid().optional(),
        unit_cost: z.number().nonnegative().optional(),
        batch_no: z.string().trim().max(100).optional(),
        expiry_date: z.string().date().optional(),
      })).min(1),
    }).parse(request.body);
    if (new Set(lines.map(line => line.line_id)).size !== lines.length) {
      return reply.status(400).send({ error: 'Submit each purchase order line only once per receipt.' });
    }
    const key = request.headers['idempotency-key'];
    if (key !== undefined && (typeof key !== 'string' || !key.trim() || key.length > 128)) {
      return reply.status(400).send({ error: 'Invalid idempotency key.' });
    }
    const requestKey = typeof key === 'string' ? key.trim() : null;
    const requestHash = createHash('sha256').update(JSON.stringify(
      [...lines].sort((a, b) => a.line_id.localeCompare(b.line_id)),
    )).digest('hex');

    return withTenant(user.tenant_id, async (trx) => {
      const po = await trx
        .selectFrom('purchase_orders')
        .selectAll()
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .forUpdate()
        .executeTakeFirst();

      if (!po) return reply.status(404).send({ error: 'Purchase order not found' });
      if (requestKey) {
        const previous = await trx.selectFrom('purchase_order_receipts')
          .select(['request_hash', 'resulting_status', 'movements_posted'])
          .where('tenant_id', '=', user.tenant_id).where('po_id', '=', id)
          .where('request_key', '=', requestKey).executeTakeFirst();
        if (previous) {
          if (previous.request_hash !== requestHash) {
            return reply.status(409).send({ error: 'This receipt key was already used with different receipt details.' });
          }
          return { success: true, status: previous.resulting_status, movements_posted: previous.movements_posted };
        }
      }
      if (po.status === 'CANCELLED') return reply.status(400).send({ error: 'Cannot receive goods against a cancelled purchase order.' });

      const poLines = await trx
        .selectFrom('purchase_order_lines')
        .leftJoin('inventory_items', join => join
          .onRef('inventory_items.id', '=', 'purchase_order_lines.item_id')
          .on('inventory_items.tenant_id', '=', user.tenant_id))
        .selectAll('purchase_order_lines')
        .select('inventory_items.base_uom')
        .where('purchase_order_lines.po_id', '=', id)
        .execute();

      const lineMap = new Map(poLines.map(l => [l.id, l]));
      const errors: string[] = [];
      const movements: Array<{ lineId: string; itemId: string; qty: number; locationId: string; unitCost: number; uom: string; batchNo?: string; expiryDate?: string }> = [];

      for (const input of lines) {
        const line = lineMap.get(input.line_id);
        if (!line) { errors.push(`Line ${input.line_id} not found on this PO.`); continue; }

        const alreadyReceived = Number(line.received_qty);
        const ordered = Number(line.qty);
        const newTotal = alreadyReceived + input.received_qty;
        if (newTotal > ordered + 0.0001) {
          errors.push(`Line "${line.description}": receiving ${input.received_qty} would exceed ordered qty of ${ordered} (already received: ${alreadyReceived}).`);
          continue;
        }

        if (line.item_id) {
          if (!input.location_id) {
            errors.push(`Choose a receiving location for "${line.description}".`);
            continue;
          }
          if (!line.base_uom) {
            errors.push(`The inventory item for "${line.description}" was not found.`);
            continue;
          }
          const uom = line.item_uom || 'each';
          const factor = await InventoryService.toBaseQty(trx, user.tenant_id, line.item_id, line.base_uom, 1, uom);
          movements.push({
            lineId: line.id,
            itemId: line.item_id,
            qty: input.received_qty,
            locationId: input.location_id,
            unitCost: input.unit_cost ?? Number(line.unit_price) / factor,
            uom,
            batchNo: input.batch_no,
            expiryDate: input.expiry_date,
          });
        }
      }

      if (errors.length > 0) {
        return reply.status(400).send({ error: errors.join(' ') });
      }

      // Post inventory movements first — if any throw (unknown UOM,
      // missing item, etc.) the whole transaction rolls back before
      // received_qty is updated, keeping the PO and stock in sync.
      const movementIds = new Map<string, string>();
      for (const m of movements.sort((a, b) => a.itemId.localeCompare(b.itemId))) {
        const movement = await InventoryService.recordMovement(trx, user.tenant_id, {
          actorId: user.sub,
          actorType: 'user',
          movementType: 'receipt',
          itemId: m.itemId,
          toLocationId: m.locationId,
          enteredQty: m.qty,
          enteredUom: m.uom,
          unitCost: m.unitCost,
          batchNo: m.batchNo,
          expiryDate: m.expiryDate,
          reference: `PO-${po.po_number}`,
          reasonCode: 'po_receipt',
          businessLineId: po.business_line_id,
        });
        movementIds.set(m.lineId, String(movement.id));
      }

      // Update received_qty on each submitted line
      for (const input of lines) {
        const line = lineMap.get(input.line_id)!;
        await trx
          .updateTable('purchase_order_lines')
          .set({ received_qty: Number(line.received_qty) + input.received_qty })
          .where('id', '=', input.line_id)
          .where('po_id', '=', id)
          .execute();
      }

      // Re-derive PO status from updated line quantities
      const updatedLines = await trx
        .selectFrom('purchase_order_lines')
        .select(['qty', 'received_qty'])
        .where('po_id', '=', id)
        .execute();

      const allReceived = updatedLines.every(l => Number(l.received_qty) >= Number(l.qty) - 0.0001);
      const anyReceived = updatedLines.some(l => Number(l.received_qty) > 0);
      const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : po.status;

      await trx
        .updateTable('purchase_orders')
        .set({ status: newStatus, updated_at: new Date() })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();

      const receiptKey = requestKey ?? randomUUID();
      await trx.insertInto('purchase_order_receipts').values({
        tenant_id: user.tenant_id, po_id: id, request_key: receiptKey, request_hash: requestHash,
        resulting_status: newStatus, movements_posted: movements.length, created_by: user.sub,
      }).execute();
      await trx.insertInto('purchase_order_receipt_lines').values(lines.map(line => ({
        tenant_id: user.tenant_id, po_id: id, request_key: receiptKey, po_line_id: line.line_id,
        description: lineMap.get(line.line_id)!.description, received_qty: line.received_qty,
        movement_id: movementIds.get(line.line_id) ?? null,
      }))).execute();
      return { success: true, status: newStatus, movements_posted: movements.length };
    }).catch((error: unknown) => {
      if (error instanceof InvalidMovement || error instanceof UnknownUom) {
        return reply.status(400).send({ error: error.message });
      }
      throw error;
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

      await trx.deleteFrom('purchase_orders').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { success: true };
    });
  });
}
