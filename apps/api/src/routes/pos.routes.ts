import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import type { Transaction } from 'kysely';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import { requireFinanceCapability } from '../middleware/finance-capability.js';
import { requireRole } from '../middleware/rbac.js';
import { checkAppUsageLimit, getAppUsageSummary } from '../lib/usage.js';
import { InventoryService, InvalidMovement, UnknownUom } from '../services/inventory.service.js';
import { GLService } from '../services/gl.service.js';
import { emitDomainEventStandalone } from '../services/domain-events.service.js';
import { getEffectiveSiteScope } from '../lib/org-rbac.js';

const POS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;
const POS_MANAGER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']);
const paymentMethod = z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK', 'OTHER']);
const openShiftSchema = z.object({ opening_float: z.number().min(0).default(0), notes: z.string().max(1000).optional(), site_id: z.string().uuid().nullable().optional() });
const closeShiftSchema = z.object({ closing_cash: z.number().min(0), notes: z.string().max(1000).optional() });
const cashMovementSchema = z.object({ direction:z.enum(['IN','OUT']), amount:z.number().positive().max(1_000_000_000), reason:z.string().trim().min(3).max(500) });
// Omitting `lines` keeps the original whole-sale refund behavior
// (voids the entire journal entry, flips the sale to REFUNDED) exactly as
// before. Providing `lines` switches to an item-level, partial-quantity
// return — the original sale stays COMPLETED unless every line ends up
// fully returned.
const returnLineSchema = z.object({
  sale_line_id: z.string().uuid(),
  qty: z.number().positive(),
  disposition: z.enum(['restock', 'damaged']).default('restock'),
});
const refundSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  restock_location_id: z.string().uuid().nullable().optional(),
  lines: z.array(returnLineSchema).min(1).max(100).optional(),
});
const voidSchema = z.object({ reason: z.string().trim().min(3).max(1000), restock_location_id: z.string().uuid().nullable().optional() });
const heldCartItemSchema = z.object({ product_id: z.string().min(1).max(50), qty: z.number().positive().max(1_000_000), discount: z.number().min(0).default(0) });
const holdCartSchema = z.object({
  label: z.string().trim().min(1).max(160), customer_id: z.string().uuid().nullable().optional(),
  inventory_location_id: z.string().uuid().nullable().optional(), currency: z.string().trim().min(3).max(10).default('TZS'),
  items: z.array(heldCartItemSchema).min(1).max(200),
});
const promotionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  product_id: z.string().min(1).max(50).nullable().optional(),
  category: z.string().trim().min(1).max(100).nullable().optional(),
  discount_type: z.enum(['percent', 'amount']),
  discount_value: z.number().positive(),
  site_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().nullable().optional(),
}).refine(v => (v.product_id != null) !== (v.category != null), {
  message: 'Scope a promotion to exactly one of product_id or category, not both and not neither.',
}).refine(v => v.discount_type !== 'percent' || v.discount_value <= 100, {
  message: 'A percentage discount cannot exceed 100.',
});
const siteProductPriceSchema = z.object({
  site_id: z.string().uuid(),
  product_id: z.string().min(1).max(50),
  price: z.number().min(0),
  currency: z.string().trim().min(3).max(10),
});
const checkoutSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  inventory_location_id: z.string().uuid().nullable().optional(),
  currency: z.string().trim().min(3).max(10).default('TZS'),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(z.object({
    product_id: z.string().min(1).max(50),
    qty: z.number().positive().max(1_000_000),
    discount: z.number().min(0).default(0),
  })).min(1).max(200),
  payments: z.array(z.object({ method: paymentMethod, amount: z.number().positive(), reference: z.string().max(160).optional() })).min(1).max(10),
});

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const iso = (value: Date | string | null) => value == null ? null : new Date(value).toISOString();
const tenderAccounts = { CASH:'1001', CARD:'1020', MOBILE_MONEY:'1021', BANK:'1010', OTHER:'1022' } as const;

interface PromotionRow {
  product_id: string | null; category: string | null;
  discount_type: 'percent' | 'amount'; discount_value: number; site_id: string | null;
}

/** Picks the single best-applying promotion for a line, among whichever
 *  of the fetched candidates actually match this product/category and
 *  site. Precedence (most to least specific): an outlet-scoped promotion
 *  beats a tenant-wide one; a product-specific promotion beats a
 *  category-wide one. Within a tie, the one giving the larger discount on
 *  this line wins — never a smaller one a customer wouldn't expect. */
function resolvePromotion(promotions: PromotionRow[], product: { id: string; category: string | null }, siteId: string | null, gross: number): PromotionRow | null {
  const candidates = promotions.filter(p =>
    (p.product_id === product.id || (product.category != null && p.category === product.category)) &&
    (p.site_id === null || p.site_id === siteId)
  );
  if (!candidates.length) return null;
  const specificity = (p: PromotionRow) => (p.site_id !== null ? 2 : 0) + (p.product_id !== null ? 1 : 0);
  const discountAmount = (p: PromotionRow) => p.discount_type === 'percent' ? gross * Number(p.discount_value) / 100 : Math.min(Number(p.discount_value), gross);
  const topScore = Math.max(...candidates.map(specificity));
  const tied = candidates.filter(p => specificity(p) === topScore);
  return tied.reduce((best, p) => discountAmount(p) > discountAmount(best) ? p : best, tied[0]!);
}

async function requirePosTransactionAllowance(request:FastifyRequest, reply:FastifyReply) {
  const user = request.user!;
  request.meteredAppId = 'finance.pos';
  if (user.role === 'SUPER_ADMIN') return;
  const tenant = await withTenant(user.tenant_id, trx => trx.selectFrom('tenants').select('plan')
    .where('id', '=', user.tenant_id).executeTakeFirst());
  if (!tenant) return reply.status(403).send({ error:'Tenant not found.' });
  const gate = await checkAppUsageLimit(user.tenant_id, tenant.plan, 'finance.pos');
  if (gate.exceeded) return reply.status(402).send({
    error:'APP_USAGE_LIMIT_EXCEEDED', message:gate.message, used:gate.used, limit:gate.limit, app:'finance.pos',
  });
}

async function postSaleJournal(tenantId:string, actorId:string, sale:{ id:string; sale_number:string; grand_total:number; tax_total:number; change_due:number; currency:string }, payments:Array<{ method:keyof typeof tenderAccounts; amount:number }>, transaction?: Transaction<Database>) {
  let remainingChange = Number(sale.change_due);
  const tenderTotals = new Map<keyof typeof tenderAccounts, number>();
  for (const payment of payments) {
    let netAmount = Number(payment.amount);
    if (payment.method === 'CASH' && remainingChange > 0) {
      const appliedChange = Math.min(netAmount, remainingChange);
      netAmount = money(netAmount - appliedChange);
      remainingChange = money(remainingChange - appliedChange);
    }
    tenderTotals.set(payment.method, money((tenderTotals.get(payment.method) ?? 0) + netAmount));
  }
  return GLService.post(tenantId, {
    entryDate:new Date().toISOString().slice(0,10), description:`POS sale ${sale.sale_number}`, reference:sale.sale_number,
    sourceModule:'AR', sourceId:sale.id, createdBy:actorId,
    lines:[
      ...[...tenderTotals.entries()].filter(([,amount])=>amount>0).map(([method,amount])=>({ accountCode:tenderAccounts[method], debit:amount, credit:0, description:`POS ${method.toLowerCase().replace('_',' ')} receipts`, currency:sale.currency })),
      { accountCode:'4500', debit:0, credit:Number(sale.grand_total)-Number(sale.tax_total), description:'POS revenue', currency:sale.currency },
      ...(Number(sale.tax_total)>0?[{ accountCode:'2200', debit:0, credit:Number(sale.tax_total), description:'Output tax', currency:sale.currency }]:[]),
    ],
  }, transaction);
}

/**
 * Item-level, partial-quantity return (S07 / Retail's own backlog item —
 * the prior refund path could only void an entire sale). Each requested
 * line is checked against what's *actually still returnable* — the
 * line's own qty minus the sum of every prior pos_sale_line_returns row
 * against it, computed fresh under lock, never a cached counter that
 * could drift from this same table. The refund amount is proportioned
 * from that line's own already-resolved tax_rate/discount (never a
 * reinvented rate), and the cash goes back across the same tender mix the
 * customer originally paid with, in the same proportion as the portion
 * being refunded — not assumed to be cash. `disposition: 'damaged'` skips
 * the inventory movement entirely: a controlled choice, not a silent
 * default back into sellable stock.
 */
async function processItemLevelReturn(
  trx: Transaction<Database>, tenantId: string, actorId: string, saleId: string,
  sale: { id: string; sale_number: string; grand_total: string | number; currency: string; inventory_location_id: string | null; customer_id: string | null },
  requested: { sale_line_id: string; qty: number; disposition: 'restock' | 'damaged' }[],
  reason: string,
) {
  const lineIds = requested.map(r => r.sale_line_id);
  const saleLines = await trx.selectFrom('pos_sale_lines').selectAll()
    .where('tenant_id', '=', tenantId).where('sale_id', '=', saleId).where('id', 'in', lineIds)
    .forUpdate().execute();
  const byId = new Map(saleLines.map(l => [l.id, l]));
  for (const r of requested) {
    if (!byId.has(r.sale_line_id)) throw Object.assign(new Error('One of the requested lines does not belong to this sale.'), { statusCode: 422 });
  }

  const alreadyReturned = await trx.selectFrom('pos_sale_line_returns')
    .select(['sale_line_id', sql<string>`coalesce(sum(qty), 0)`.as('qty')])
    .where('tenant_id', '=', tenantId).where('sale_line_id', 'in', lineIds)
    .groupBy('sale_line_id').execute();
  const returnedByLine = new Map(alreadyReturned.map(r => [r.sale_line_id, Number(r.qty)]));

  const payments = await trx.selectFrom('pos_payments').select(['method', 'amount']).where('tenant_id', '=', tenantId).where('sale_id', '=', saleId).execute();
  const grandTotal = Number(sale.grand_total);

  let refundNetTotal = 0, refundTaxTotal = 0, refundTotal = 0;
  const lineResults: { sale_line_id: string; qty: number; refund_total: number; disposition: string }[] = [];
  const toInsert: { sale_line_id: string; qty: number; disposition: 'restock' | 'damaged'; refund_net: number; refund_tax: number; refund_total: number }[] = [];
  for (const r of requested) {
    const line = byId.get(r.sale_line_id)!;
    const alreadyQty = returnedByLine.get(r.sale_line_id) ?? 0;
    const remainingQty = Number(line.qty) - alreadyQty;
    if (r.qty > remainingQty + 1e-9) {
      throw Object.assign(new Error(`Only ${remainingQty} of "${line.product_name}" remain returnable on this sale.`), { statusCode: 422 });
    }
    const fraction = r.qty / Number(line.qty);
    const refundNet = money((Number(line.line_total) - Number(line.tax_amount)) * fraction);
    const refundTax = money(Number(line.tax_amount) * fraction);
    const refundLineTotal = money(refundNet + refundTax);
    refundNetTotal = money(refundNetTotal + refundNet);
    refundTaxTotal = money(refundTaxTotal + refundTax);
    refundTotal = money(refundTotal + refundLineTotal);
    lineResults.push({ sale_line_id: r.sale_line_id, qty: r.qty, refund_total: refundLineTotal, disposition: r.disposition });
    toInsert.push({ sale_line_id: r.sale_line_id, qty: r.qty, disposition: r.disposition, refund_net: refundNet, refund_tax: refundTax, refund_total: refundLineTotal });
  }
  if (refundTotal <= 0) throw Object.assign(new Error('Nothing to refund.'), { statusCode: 422 });
  if (refundTotal > grandTotal + 0.01) throw Object.assign(new Error('Refund exceeds the sale total.'), { statusCode: 422 });

  // Credit back across the same tender mix the customer paid with,
  // proportioned to how much of the sale this refund covers — a partial
  // return of a cash-and-card sale gives back cash and card in the same
  // ratio, not an assumed single method.
  const refundRatio = grandTotal > 0 ? refundTotal / grandTotal : 0;
  const tenderRefunds = new Map<keyof typeof tenderAccounts, number>();
  for (const p of payments) {
    const amt = money(Number(p.amount) * refundRatio);
    if (amt > 0) tenderRefunds.set(p.method as keyof typeof tenderAccounts, money((tenderRefunds.get(p.method as keyof typeof tenderAccounts) ?? 0) + amt));
  }
  // Rounding: make the tender credits tie out exactly to refundTotal, same
  // "last one absorbs the remainder" convention sale-creation already uses.
  const tenderEntries = [...tenderRefunds.entries()];
  const tenderSum = money(tenderEntries.reduce((s, [, a]) => s + a, 0));
  const remainder = money(refundTotal - tenderSum);
  if (remainder !== 0 && tenderEntries.length > 0) {
    const [lastMethod, lastAmt] = tenderEntries[tenderEntries.length - 1]!;
    tenderRefunds.set(lastMethod, money(lastAmt + remainder));
  }

  const reversalId = await GLService.post(tenantId, {
    entryDate: new Date().toISOString().slice(0, 10), description: `POS item return: ${sale.sale_number} — ${reason}`,
    reference: sale.sale_number, sourceModule: 'AR', sourceId: sale.id, createdBy: actorId,
    lines: [
      { accountCode: '4500', debit: refundNetTotal, credit: 0, description: 'POS revenue reversed (item return)', currency: sale.currency },
      ...(refundTaxTotal > 0 ? [{ accountCode: '2200', debit: refundTaxTotal, credit: 0, description: 'Output tax reversed (item return)', currency: sale.currency }] : []),
      ...[...tenderRefunds.entries()].filter(([, amt]) => amt > 0).map(([method, amt]) => ({
        accountCode: tenderAccounts[method], debit: 0, credit: amt, description: `POS ${method.toLowerCase().replace('_', ' ')} refunded`, currency: sale.currency,
      })),
    ],
  }, trx);

  let restockedAny = false;
  for (let i = 0; i < requested.length; i++) {
    const r = requested[i]!;
    const line = byId.get(r.sale_line_id)!;
    let movementId: string | null = null;
    if (r.disposition === 'restock') {
      const restockLocationId = sale.inventory_location_id;
      if (restockLocationId) {
        const item = await trx.selectFrom('inventory_items').select(['id', 'base_uom'])
          .where('tenant_id', '=', tenantId).where('product_id', '=', line.product_id).where('active', '=', true).executeTakeFirst();
        if (item) {
          const movement = await InventoryService.recordMovement(trx, tenantId, {
            actorId, movementType: 'return', itemId: item.id, toLocationId: restockLocationId,
            enteredQty: r.qty, enteredUom: item.base_uom, reasonCode: 'POS_ITEM_RETURN', reference: sale.sale_number,
          });
          movementId = movement.id;
          restockedAny = true;
        }
      }
    }
    await trx.insertInto('pos_sale_line_returns').values({
      tenant_id: tenantId, sale_id: saleId, sale_line_id: r.sale_line_id, qty: r.qty, disposition: r.disposition,
      refund_net: toInsert[i]!.refund_net, refund_tax: toInsert[i]!.refund_tax, refund_total: toInsert[i]!.refund_total,
      reason, journal_entry_id: reversalId, movement_id: movementId, created_by: actorId,
    }).execute();
  }

  // The sale as a whole only becomes REFUNDED once every one of its lines
  // has been fully returned — a partial return leaves it COMPLETED, since
  // most of it is still a genuine, standing sale.
  const allLines = await trx.selectFrom('pos_sale_lines').select(['id', 'qty']).where('tenant_id', '=', tenantId).where('sale_id', '=', saleId).execute();
  const allReturned = await trx.selectFrom('pos_sale_line_returns')
    .select(['sale_line_id', sql<string>`coalesce(sum(qty), 0)`.as('qty')])
    .where('tenant_id', '=', tenantId).where('sale_id', '=', saleId).groupBy('sale_line_id').execute();
  const returnedMap = new Map(allReturned.map(r => [r.sale_line_id, Number(r.qty)]));
  const fullyRefunded = allLines.every(l => (returnedMap.get(l.id) ?? 0) >= Number(l.qty) - 1e-9);

  if (fullyRefunded) {
    await trx.updateTable('pos_sales').set({
      status: 'REFUNDED', refunded_at: new Date(), refunded_by: actorId, refund_reason: reason,
    }).where('tenant_id', '=', tenantId).where('id', '=', saleId).where('status', '=', 'COMPLETED').execute();
  }

  return { sale, reversalId, restockLocationId: null, itemLevel: true as const, refundTotal, fullyRefunded, restockedAny, lineResults };
}

export async function posRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // 'finops' for every existing bundled tenant; 'finance.core' for a tenant
  // that subscribed to POS standalone (migration 709) without the finops
  // bundle at all — migration 529 already backfilled finance.core onto
  // every package that grants 'finops', so this widens, never narrows,
  // who passes.
  fastify.addHook('preHandler', requireAnyEntitlement(['finops', 'finance.core']));
  fastify.addHook('preHandler', requireRole(...POS_ROLES));
  fastify.addHook('preHandler', requireFinanceCapability('finance.pos', { preserveReadAccess: true }));

  fastify.get('/bootstrap', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async trx => {
      const [products, customers, locations, shift, sites] = await Promise.all([
        trx.selectFrom('products').select(['id', 'code', 'name', 'category', 'unit', 'type', 'sale_price', 'currency', 'tax_rate'])
          .where('tenant_id', '=', user.tenant_id).where('status', '=', 'active').orderBy('name').execute(),
        trx.selectFrom('customers').select(['id', 'name', 'email'])
          .where('tenant_id', '=', user.tenant_id).where('active', '=', true).where('deleted_at', 'is', null).orderBy('name').execute(),
        trx.selectFrom('inventory_locations as l').innerJoin('inventory_warehouses as w', 'w.id', 'l.warehouse_id')
          .select(['l.id', 'l.code', 'l.name', 'w.name as warehouse_name'])
          .where('l.tenant_id', '=', user.tenant_id).where('l.is_pickable', '=', true).where('w.active', '=', true).orderBy('w.name').orderBy('l.name').execute(),
        trx.selectFrom('pos_shifts').selectAll().where('tenant_id', '=', user.tenant_id)
          .where('opened_by', '=', user.sub).where('status', '=', 'OPEN').executeTakeFirst(),
        // Empty for every tenant that hasn't set up tenant_sites (migration
        // 641) — the UI only offers a site picker when opening a register
        // if this is non-empty, otherwise opening a register works exactly
        // as it always did.
        trx.selectFrom('tenant_sites').select(['id', 'code', 'name', 'site_type'])
          .where('tenant_id', '=', user.tenant_id).where('status', '=', 'active').orderBy('name').execute(),
      ]);
      let shiftSummary = null;
      if (shift) {
        const [sales, changeGiven, cashPayments, movements] = await Promise.all([
          trx.selectFrom('pos_sales').select([trx.fn.count('id').as('count'), trx.fn.sum('grand_total').as('total')])
            .where('tenant_id', '=', user.tenant_id).where('shift_id', '=', shift.id).where('status', '=', 'COMPLETED').executeTakeFirst(),
          // Change given out reduces the drawer the moment it's handed back,
          // same reasoning as the cash-received query below — not gated on
          // posting status.
          trx.selectFrom('pos_sales').select(sql<number>`COALESCE(SUM(change_due), 0)`.as('total'))
            .where('tenant_id', '=', user.tenant_id).where('shift_id', '=', shift.id).where('status', 'in', ['COMPLETED', 'POSTING_FAILED']).executeTakeFirst(),
          // Cash physically received by the cashier counts toward what's in
          // the drawer the moment it's taken — regardless of whether the GL
          // posting behind it has succeeded yet (POSTING_FAILED still means
          // a real sale with real cash in hand, just retryable accounting).
          trx.selectFrom('pos_payments as p').innerJoin('pos_sales as s', 's.id', 'p.sale_id')
            .select(sql<number>`COALESCE(SUM(p.amount), 0)`.as('total')).where('p.tenant_id', '=', user.tenant_id).where('s.shift_id', '=', shift.id)
            .where('s.status', 'in', ['COMPLETED', 'POSTING_FAILED']).where('p.method', '=', 'CASH').executeTakeFirst(),
          trx.selectFrom('pos_cash_movements').select([
            sql<number>`COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0)`.as('cash_in'),
            sql<number>`COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0)`.as('cash_out'),
          ]).where('tenant_id', '=', user.tenant_id).where('shift_id', '=', shift.id).executeTakeFirst(),
        ]);
        const cashIn = Number(movements?.cash_in ?? 0);
        const cashOut = Number(movements?.cash_out ?? 0);
        shiftSummary = {
          ...shift, opening_float: Number(shift.opening_float), opened_at: iso(shift.opened_at),
          sales_count: Number(sales?.count ?? 0), sales_total: Number(sales?.total ?? 0),
          cash_in:cashIn, cash_out:cashOut,
          expected_cash: money(Number(shift.opening_float) + Number(cashPayments?.total ?? 0) - Number(changeGiven?.total ?? 0) + cashIn - cashOut),
        };
      }
      return {
        products: products.map(p => ({ ...p, sale_price: Number(p.sale_price), tax_rate: Number(p.tax_rate) })),
        customers,
        locations,
        sites,
        shift: shiftSummary,
      };
    });
  });

  fastify.get('/availability', async (request, reply) => {
    const user = request.user;
    const { location_id } = z.object({ location_id:z.string().uuid() }).parse(request.query);
    return withTenant(user.tenant_id, async trx => {
      const location = await trx.selectFrom('inventory_locations').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', location_id).executeTakeFirst();
      if (!location) return reply.status(404).send({ error:'Inventory location not found.' });
      const rows = await trx.selectFrom('inventory_items as i')
        .leftJoin('inventory_stock_levels as sl', join => join.onRef('sl.item_id', '=', 'i.id').on('sl.location_id', '=', location_id).on('sl.tenant_id', '=', user.tenant_id))
        .select('i.product_id').select(sql<number>`COALESCE(SUM(sl.qty_on_hand), 0)`.as('qty'))
        .where('i.tenant_id', '=', user.tenant_id).where('i.active', '=', true).where('i.product_id', 'is not', null)
        .groupBy('i.product_id').execute();
      return Object.fromEntries(rows.map(row => [row.product_id!, Number(row.qty)]));
    });
  });

  fastify.get('/shifts', async (request) => {
    const user = request.user;
    const { limit } = z.object({ limit:z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query);
    return withTenant(user.tenant_id, async trx => {
      let query = trx.selectFrom('pos_shifts as sh').innerJoin('users as u', 'u.id', 'sh.opened_by')
        .leftJoin('pos_sales as s', join => join.onRef('s.shift_id', '=', 'sh.id').on('s.tenant_id', '=', user.tenant_id).on('s.status', '=', 'COMPLETED'))
        .select(['sh.id', 'sh.opened_by', 'u.name as opened_by_name', 'sh.closed_by', 'sh.status', 'sh.opening_float', 'sh.closing_cash', 'sh.expected_cash', 'sh.opened_at', 'sh.closed_at', 'sh.notes'])
        .select([sql<number>`COUNT(s.id)`.as('sales_count'), sql<number>`COALESCE(SUM(s.grand_total), 0)`.as('sales_total')])
        .where('sh.tenant_id', '=', user.tenant_id).where('u.tenant_id', '=', user.tenant_id)
        .groupBy(['sh.id', 'sh.opened_by', 'u.name', 'sh.closed_by', 'sh.status', 'sh.opening_float', 'sh.closing_cash', 'sh.expected_cash', 'sh.opened_at', 'sh.closed_at', 'sh.notes'])
        .orderBy('sh.opened_at', 'desc').limit(limit);
      if (!POS_MANAGER_ROLES.has(user.role)) query = query.where('sh.opened_by', '=', user.sub);
      const rows = await query.execute();
      return rows.map(row => ({
        ...row, opening_float:Number(row.opening_float), closing_cash:row.closing_cash==null?null:Number(row.closing_cash),
        expected_cash:row.expected_cash==null?null:Number(row.expected_cash), sales_count:Number(row.sales_count), sales_total:Number(row.sales_total??0),
        variance:row.closing_cash==null||row.expected_cash==null?null:money(Number(row.closing_cash)-Number(row.expected_cash)),
        opened_at:iso(row.opened_at), closed_at:iso(row.closed_at),
      }));
    });
  });

  fastify.get('/shifts/:id/movements', async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id:z.string().uuid() }).parse(request.params);
    return withTenant(user.tenant_id, async trx => {
      const shift = await trx.selectFrom('pos_shifts').select(['id','opened_by']).where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!shift) return reply.status(404).send({ error:'POS register not found.' });
      if (!POS_MANAGER_ROLES.has(user.role) && shift.opened_by !== user.sub) return reply.status(403).send({ error:'You can only view movements for your own register.' });
      const rows = await trx.selectFrom('pos_cash_movements as m').innerJoin('users as u', 'u.id', 'm.recorded_by')
        .select(['m.id','m.shift_id','m.direction','m.amount','m.reason','m.recorded_by','u.name as recorded_by_name','m.recorded_at'])
        .where('m.tenant_id', '=', user.tenant_id).where('u.tenant_id', '=', user.tenant_id).where('m.shift_id', '=', id)
        .orderBy('m.recorded_at', 'desc').execute();
      return rows.map(row => ({ ...row, amount:Number(row.amount), recorded_at:iso(row.recorded_at) }));
    });
  });

  fastify.post('/shifts/:id/movements', async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id:z.string().uuid() }).parse(request.params);
    const body = cashMovementSchema.parse(request.body);
    const row = await withTenant(user.tenant_id, async trx => {
      const shift = await trx.selectFrom('pos_shifts').select(['id','opened_by']).where('tenant_id', '=', user.tenant_id)
        .where('id', '=', id).where('status', '=', 'OPEN').executeTakeFirst();
      if (!shift) throw Object.assign(new Error('Open POS register not found.'), { statusCode:404 });
      if (!POS_MANAGER_ROLES.has(user.role) && shift.opened_by !== user.sub) throw Object.assign(new Error('You can only adjust your own register.'), { statusCode:403 });
      return trx.insertInto('pos_cash_movements').values({ tenant_id:user.tenant_id, shift_id:id, direction:body.direction, amount:body.amount, reason:body.reason, recorded_by:user.sub })
        .returningAll().executeTakeFirstOrThrow();
    });
    return reply.status(201).send({ ...row, amount:Number(row.amount), recorded_at:iso(row.recorded_at) });
  });

  fastify.get('/sales', async (request, reply) => {
    const user = request.user;
    const query = z.object({
      page:z.coerce.number().int().min(1).default(1), page_size:z.coerce.number().int().min(5).max(100).default(20),
      search:z.string().trim().max(160).optional(), status:z.enum(['COMPLETED','VOIDED','REFUNDED','POSTING_FAILED']).optional(),
      from:z.string().date().optional(), to:z.string().date().optional(), site_id:z.string().uuid().optional(),
    }).parse(request.query);
    // Outlet scoping (S03) — null means unrestricted (central role, or no
    // recorded assignment yet); a non-null array is the exact set of sites
    // this user may see. An explicitly requested site_id outside that set
    // is refused, not silently dropped.
    const siteScope = await getEffectiveSiteScope(user.tenant_id, user.sub, user.role);
    if (siteScope && query.site_id && !siteScope.includes(query.site_id)) {
      return reply.status(403).send({ error: 'You are not authorized to view sales for that outlet.' });
    }
    return withTenant(user.tenant_id, async trx => {
      let base = trx.selectFrom('pos_sales').where('tenant_id', '=', user.tenant_id);
      if (siteScope) base = base.where('site_id', 'in', siteScope);
      if (query.search) {
        const term = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
        base = base.where(eb => eb.or([eb('sale_number', 'ilike', term), eb('customer_name', 'ilike', term)]));
      }
      if (query.status) base = base.where('status', '=', query.status);
      if (query.site_id) base = base.where('site_id', '=', query.site_id);
      if (query.from) base = base.where('sold_at', '>=', new Date(`${query.from}T00:00:00.000Z`));
      if (query.to) {
        const toExclusive = new Date(`${query.to}T00:00:00.000Z`);
        toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
        base = base.where('sold_at', '<', toExclusive);
      }
      const [rows, count] = await Promise.all([
        base.selectAll().orderBy('sold_at', 'desc').limit(query.page_size).offset((query.page-1)*query.page_size).execute(),
        base.select(trx.fn.count('id').as('count')).executeTakeFirst(),
      ]);
      const items = rows.map(row => ({
        ...row,
        subtotal: Number(row.subtotal), discount_total: Number(row.discount_total), tax_total: Number(row.tax_total),
        grand_total: Number(row.grand_total), amount_paid: Number(row.amount_paid), change_due: Number(row.change_due), sold_at: iso(row.sold_at),
      }));
      return { items, total:Number(count?.count??0), page:query.page, page_size:query.page_size };
    });
  });

  // POS receipts stay out of sales_invoices so they do not create a second
  // receivable. The shared sales report combines this feed with invoices.
  fastify.get('/sales-report', async (request, reply) => {
    const user = request.user;
    const query = z.object({ from:z.string().date().optional(), to:z.string().date().optional(), site_id:z.string().uuid().optional() }).parse(request.query);
    // Outlet scoping (S03) — see /sales' own comment on getEffectiveSiteScope.
    const siteScope = await getEffectiveSiteScope(user.tenant_id, user.sub, user.role);
    if (siteScope && query.site_id && !siteScope.includes(query.site_id)) {
      return reply.status(403).send({ error: 'You are not authorized to view sales for that outlet.' });
    }
    return withTenant(user.tenant_id, async trx => {
      let rows = trx.selectFrom('pos_sales').select([
        'id', 'sale_number', 'customer_id', 'customer_name', 'currency',
        'grand_total', 'tax_total', 'discount_total', 'sold_at', 'status', 'site_id',
      ]).where('tenant_id', '=', user.tenant_id).where('status', '=', 'COMPLETED');
      if (siteScope) rows = rows.where('site_id', 'in', siteScope);
      if (query.from) rows = rows.where('sold_at', '>=', new Date(`${query.from}T00:00:00.000Z`));
      if (query.to) {
        const exclusive = new Date(`${query.to}T00:00:00.000Z`);
        exclusive.setUTCDate(exclusive.getUTCDate() + 1);
        rows = rows.where('sold_at', '<', exclusive);
      }
      if (query.site_id) rows = rows.where('site_id', '=', query.site_id);
      const result = await rows.orderBy('sold_at', 'desc').execute();
      return result.map(row => ({ ...row, grand_total:Number(row.grand_total), tax_total:Number(row.tax_total),
        discount_total:Number(row.discount_total), sold_at:iso(row.sold_at) }));
    });
  });

  fastify.get('/analytics', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async trx => {
      // Never add different currencies together (the platform's own
      // standing rule) — every aggregate below is scoped to the tenant's
      // reporting currency (tenant_settings.company.currency, the same
      // field every other finance route already reads this from). A
      // tenant with any product priced in a different currency still gets
      // real, non-silently-wrong numbers: those sales are counted
      // separately and surfaced via other_currency_sales rather than
      // summed into revenue as if they were the same money.
      const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
      const baseCurrency = String(settings?.company?.currency || 'TZS').toUpperCase();

      const [today, cost, cashiers, payments, sites, otherCurrency] = await Promise.all([
        trx.selectFrom('pos_sales').select([
          trx.fn.count('id').as('sales_count'), trx.fn.sum('grand_total').as('revenue'),
          trx.fn.sum('discount_total').as('discounts'), trx.fn.sum('tax_total').as('tax'),
        ]).where('tenant_id', '=', user.tenant_id).where('status', '=', 'COMPLETED').where('currency', '=', baseCurrency)
          .where('sold_at', '>=', sql<Date>`CURRENT_DATE`).executeTakeFirst(),
        trx.selectFrom('pos_sale_lines as l').innerJoin('pos_sales as s', 's.id', 'l.sale_id')
          .select(sql<number>`COALESCE(SUM(l.cost_total), 0)`.as('cost')).where('l.tenant_id', '=', user.tenant_id)
          .where('s.tenant_id', '=', user.tenant_id).where('s.status', '=', 'COMPLETED').where('s.currency', '=', baseCurrency)
          .where('s.sold_at', '>=', sql<Date>`CURRENT_DATE`).executeTakeFirst(),
        trx.selectFrom('pos_sales as s').innerJoin('users as u', 'u.id', 's.sold_by')
          .select(['s.sold_by as user_id', 'u.name']).select([sql<number>`COUNT(s.id)`.as('sales_count'), sql<number>`COALESCE(SUM(s.grand_total), 0)`.as('revenue')])
          .where('s.tenant_id', '=', user.tenant_id).where('u.tenant_id', '=', user.tenant_id).where('s.status', '=', 'COMPLETED').where('s.currency', '=', baseCurrency)
          .where('s.sold_at', '>=', sql<Date>`CURRENT_DATE`).groupBy(['s.sold_by', 'u.name']).orderBy(sql`SUM(s.grand_total)`, 'desc').execute(),
        trx.selectFrom('pos_payments as p').innerJoin('pos_sales as s', 's.id', 'p.sale_id')
          .select('p.method').select([sql<number>`COUNT(p.id)`.as('count'), sql<number>`COALESCE(SUM(p.amount), 0)`.as('amount')])
          .where('p.tenant_id', '=', user.tenant_id).where('s.tenant_id', '=', user.tenant_id).where('s.status', '=', 'COMPLETED').where('s.currency', '=', baseCurrency)
          .where('s.sold_at', '>=', sql<Date>`CURRENT_DATE`).groupBy('p.method').orderBy(sql`SUM(p.amount)`, 'desc').execute(),
        // Per-outlet breakdown — central office's view across sites. A sale
        // with no site_id (every single-outlet tenant, or a sale made
        // before this migration) groups under null, filtered out below
        // rather than shown as a fake "unknown outlet" row.
        trx.selectFrom('pos_sales as s').innerJoin('tenant_sites as ts', 'ts.id', 's.site_id')
          .select(['s.site_id', 'ts.name as site_name']).select([sql<number>`COUNT(s.id)`.as('sales_count'), sql<number>`COALESCE(SUM(s.grand_total), 0)`.as('revenue')])
          .where('s.tenant_id', '=', user.tenant_id).where('ts.tenant_id', '=', user.tenant_id).where('s.status', '=', 'COMPLETED').where('s.currency', '=', baseCurrency)
          .where('s.sold_at', '>=', sql<Date>`CURRENT_DATE`).groupBy(['s.site_id', 'ts.name']).orderBy(sql`SUM(s.grand_total)`, 'desc').execute(),
        trx.selectFrom('pos_sales').select(['currency']).select([sql<number>`COUNT(id)`.as('sales_count')])
          .where('tenant_id', '=', user.tenant_id).where('status', '=', 'COMPLETED').where('currency', '!=', baseCurrency)
          .where('sold_at', '>=', sql<Date>`CURRENT_DATE`).groupBy('currency').execute(),
      ]);
      const salesCount = Number(today?.sales_count ?? 0);
      const revenue = Number(today?.revenue ?? 0);
      const tax = Number(today?.tax ?? 0);
      const totalCost = Number(cost?.cost ?? 0);
      return {
        currency: baseCurrency,
        // Never silently folded into `today` above — a tenant selling in
        // more than one currency sees exactly what was excluded and why,
        // rather than a revenue figure that quietly mixed TZS and USD.
        other_currency_sales: otherCurrency.map(row => ({ currency: row.currency, sales_count: Number(row.sales_count) })),
        today: {
          sales_count: salesCount, revenue, discounts: Number(today?.discounts ?? 0), tax, cost: totalCost,
          margin: money(revenue - tax - totalCost), average_sale: salesCount ? money(revenue / salesCount) : 0,
        },
        cashiers: cashiers.map(row => ({ user_id: row.user_id, name: row.name, sales_count: Number(row.sales_count), revenue: Number(row.revenue), average_sale: money(Number(row.revenue) / Number(row.sales_count)) })),
        payments: payments.map(row => ({ method: row.method, amount: Number(row.amount), count: Number(row.count) })),
        sites: sites.map(row => ({ site_id: row.site_id, name: row.site_name, sales_count: Number(row.sales_count), revenue: Number(row.revenue), average_sale: money(Number(row.revenue) / Number(row.sales_count)) })),
      };
    });
  });

  fastify.get('/usage', async (request, reply) => {
    const user = request.user;
    const tenant = await withTenant(user.tenant_id, trx => trx.selectFrom('tenants').select('plan')
      .where('id', '=', user.tenant_id).executeTakeFirst());
    if (!tenant) return reply.status(403).send({ error:'Tenant not found.' });
    return getAppUsageSummary(user.tenant_id, tenant.plan, 'finance.pos');
  });

  fastify.get('/promotions', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('pos_promotions').selectAll()
      .where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').execute())
      .then(rows => rows.map(r => ({ ...r, discount_value: Number(r.discount_value), starts_at: iso(r.starts_at), ends_at: iso(r.ends_at), created_at: iso(r.created_at), updated_at: iso(r.updated_at) })));
  });

  fastify.post('/promotions', async (request, reply) => {
    const user = request.user;
    if (!POS_MANAGER_ROLES.has(user.role)) return reply.status(403).send({ error: 'Manager or Finance access is required to create a promotion.' });
    const body = promotionSchema.parse(request.body);
    try {
      const row = await withTenant(user.tenant_id, async trx => {
        if (body.product_id) {
          const product = await trx.selectFrom('products').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.product_id).executeTakeFirst();
          if (!product) throw Object.assign(new Error('That product does not belong to this workspace.'), { statusCode: 422 });
        }
        if (body.site_id) {
          const site = await trx.selectFrom('tenant_sites').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.site_id).executeTakeFirst();
          if (!site) throw Object.assign(new Error('That outlet does not belong to this workspace.'), { statusCode: 422 });
        }
        return trx.insertInto('pos_promotions').values({
          tenant_id: user.tenant_id, name: body.name, product_id: body.product_id ?? null, category: body.category ?? null,
          discount_type: body.discount_type, discount_value: body.discount_value, site_id: body.site_id ?? null,
          starts_at: body.starts_at ? new Date(body.starts_at) : new Date(), ends_at: body.ends_at ? new Date(body.ends_at) : null,
          created_by: user.sub,
        } as any).returningAll().executeTakeFirstOrThrow();
      });
      // "Rollout history" (the platform's own standing instruction to show
      // effective value, source, and history for a central/local config
      // change) reuses the existing cross-app domain_events log rather than
      // a new table — see GET /config-history below.
      await emitDomainEventStandalone(user.tenant_id, {
        type: 'pos.promotion_created', sourceApp: 'finops', entityType: 'pos_promotion', entityId: row.id, actorId: user.sub,
        payload: { name: row.name, product_id: row.product_id, category: row.category, discount_type: row.discount_type, discount_value: Number(row.discount_value), site_id: row.site_id },
      });
      return reply.status(201).send({ ...row, discount_value: Number(row.discount_value), starts_at: iso(row.starts_at), ends_at: iso(row.ends_at), created_at: iso(row.created_at), updated_at: iso(row.updated_at) });
    } catch (error: any) {
      if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  fastify.patch('/promotions/:id', async (request, reply) => {
    const user = request.user;
    if (!POS_MANAGER_ROLES.has(user.role)) return reply.status(403).send({ error: 'Manager or Finance access is required to change a promotion.' });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ active: z.boolean().optional(), ends_at: z.string().datetime().nullable().optional() }).parse(request.body);
    const row = await withTenant(user.tenant_id, trx => trx.updateTable('pos_promotions')
      .set({ ...(body.active !== undefined ? { active: body.active } : {}), ...(body.ends_at !== undefined ? { ends_at: body.ends_at ? new Date(body.ends_at) : null } : {}), updated_at: new Date() })
      .where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Promotion not found.' });
    await emitDomainEventStandalone(user.tenant_id, {
      type: 'pos.promotion_updated', sourceApp: 'finops', entityType: 'pos_promotion', entityId: id, actorId: user.sub,
      payload: { active: row.active, ends_at: iso(row.ends_at) },
    });
    return { ...row, discount_value: Number(row.discount_value), starts_at: iso(row.starts_at), ends_at: iso(row.ends_at), created_at: iso(row.created_at), updated_at: iso(row.updated_at) };
  });

  fastify.delete('/promotions/:id', async (request, reply) => {
    const user = request.user;
    if (!POS_MANAGER_ROLES.has(user.role)) return reply.status(403).send({ error: 'Manager or Finance access is required to delete a promotion.' });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const row = await withTenant(user.tenant_id, trx => trx.deleteFrom('pos_promotions')
      .where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Promotion not found.' });
    await emitDomainEventStandalone(user.tenant_id, {
      type: 'pos.promotion_deleted', sourceApp: 'finops', entityType: 'pos_promotion', entityId: id, actorId: user.sub,
      payload: { name: row.name },
    });
    return { success: true };
  });

  // Per-outlet price override (migration 714) — genuine multi-currency
  // checkout: an outlet in a different country sells the same catalog
  // item at its own price/currency instead of the product's one base
  // price. No override for a site means it sells at the base price,
  // exactly as every tenant already did before this existed.
  fastify.get('/site-prices', async (request) => {
    const user = request.user;
    const { site_id } = z.object({ site_id: z.string().uuid().optional() }).parse(request.query);
    return withTenant(user.tenant_id, async trx => {
      let q = trx.selectFrom('pos_site_product_prices').selectAll().where('tenant_id', '=', user.tenant_id);
      if (site_id) q = q.where('site_id', '=', site_id);
      const rows = await q.orderBy('created_at', 'desc').execute();
      return rows.map(r => ({ ...r, price: Number(r.price), created_at: iso(r.created_at), updated_at: iso(r.updated_at) }));
    });
  });

  fastify.post('/site-prices', async (request, reply) => {
    const user = request.user;
    if (!POS_MANAGER_ROLES.has(user.role)) return reply.status(403).send({ error: 'Manager or Finance access is required to set an outlet price override.' });
    const body = siteProductPriceSchema.parse(request.body);
    try {
      const row = await withTenant(user.tenant_id, async trx => {
        const site = await trx.selectFrom('tenant_sites').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.site_id).executeTakeFirst();
        if (!site) throw Object.assign(new Error('That outlet does not belong to this workspace.'), { statusCode: 422 });
        const product = await trx.selectFrom('products').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.product_id).executeTakeFirst();
        if (!product) throw Object.assign(new Error('That product does not belong to this workspace.'), { statusCode: 422 });
        return trx.insertInto('pos_site_product_prices').values({
          tenant_id: user.tenant_id, site_id: body.site_id, product_id: body.product_id,
          price: body.price, currency: body.currency.toUpperCase(), created_by: user.sub,
        } as any)
          .onConflict(oc => oc.columns(['tenant_id', 'site_id', 'product_id']).doUpdateSet({
            price: body.price, currency: body.currency.toUpperCase(), updated_at: new Date(),
          }))
          .returningAll().executeTakeFirstOrThrow();
      });
      await emitDomainEventStandalone(user.tenant_id, {
        type: 'pos.site_price_set', sourceApp: 'finops', entityType: 'pos_site_product_price', entityId: row.id, actorId: user.sub,
        payload: { site_id: row.site_id, product_id: row.product_id, price: Number(row.price), currency: row.currency },
      });
      return reply.status(201).send({ ...row, price: Number(row.price), created_at: iso(row.created_at), updated_at: iso(row.updated_at) });
    } catch (error: any) {
      if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  fastify.delete('/site-prices/:id', async (request, reply) => {
    const user = request.user;
    if (!POS_MANAGER_ROLES.has(user.role)) return reply.status(403).send({ error: 'Manager or Finance access is required to remove an outlet price override.' });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const row = await withTenant(user.tenant_id, trx => trx.deleteFrom('pos_site_product_prices')
      .where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Outlet price override not found.' });
    await emitDomainEventStandalone(user.tenant_id, {
      type: 'pos.site_price_removed', sourceApp: 'finops', entityType: 'pos_site_product_price', entityId: id, actorId: user.sub,
      payload: { site_id: row.site_id, product_id: row.product_id },
    });
    return { success: true };
  });

  // "Rollout history" — who changed a promotion or an outlet price
  // override, when, and to what — read from the existing cross-app
  // domain_events log (migration 129) rather than a new table.
  fastify.get('/config-history', async (request) => {
    const user = request.user;
    const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return withTenant(user.tenant_id, trx => trx.selectFrom('domain_events as e').leftJoin('users as u', 'u.id', 'e.actor_id')
      .select(['e.id', 'e.event_type', 'e.entity_type', 'e.entity_id', 'e.payload', 'e.created_at', 'u.name as actor_name'])
      .where('e.tenant_id', '=', user.tenant_id)
      .where('e.event_type', 'in', ['pos.promotion_created', 'pos.promotion_updated', 'pos.promotion_deleted', 'pos.site_price_set', 'pos.site_price_removed'])
      .orderBy('e.created_at', 'desc').limit(query.limit).execute())
      .then(rows => rows.map(r => ({ ...r, created_at: iso(r.created_at) })));
  });

  // "Show effective value, source" for a given product at a given outlet —
  // resolves exactly what checkout itself would resolve, without having to
  // ring up a real sale to find out.
  fastify.get('/effective-price', async (request, reply) => {
    const user = request.user;
    const query = z.object({ product_id: z.string().min(1).max(50), site_id: z.string().uuid().optional() }).parse(request.query);
    return withTenant(user.tenant_id, async trx => {
      const product = await trx.selectFrom('products').select(['id', 'name', 'sale_price', 'currency']).where('tenant_id', '=', user.tenant_id).where('id', '=', query.product_id).executeTakeFirst();
      if (!product) return reply.status(404).send({ error: 'Product not found.' });
      const override = query.site_id
        ? await trx.selectFrom('pos_site_product_prices').select(['price', 'currency', 'updated_at']).where('tenant_id', '=', user.tenant_id).where('site_id', '=', query.site_id).where('product_id', '=', query.product_id).executeTakeFirst()
        : undefined;
      return override
        ? { product_id: product.id, price: Number(override.price), currency: override.currency, source: 'site_override' as const, site_id: query.site_id, effective_since: iso(override.updated_at) }
        : { product_id: product.id, price: Number(product.sale_price), currency: product.currency, source: 'base_price' as const, site_id: query.site_id ?? null, effective_since: null };
    });
  });

  fastify.get('/holds', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async trx => {
      const rows = await trx.selectFrom('pos_held_carts as h').innerJoin('users as u', 'u.id', 'h.held_by')
        .leftJoin('customers as c', 'c.id', 'h.customer_id')
        .select(['h.id', 'h.label', 'h.customer_id', 'c.name as customer_name', 'h.inventory_location_id', 'h.currency', 'h.items', 'h.held_by', 'u.name as held_by_name', 'h.held_at'])
        .where('h.tenant_id', '=', user.tenant_id).where('u.tenant_id', '=', user.tenant_id)
        .where(eb => eb.or([eb('c.tenant_id', '=', user.tenant_id), eb('c.id', 'is', null)]))
        .orderBy('h.held_at', 'desc').execute();
      return rows.map(row => ({ ...row, items: z.array(heldCartItemSchema).parse(row.items), held_at: iso(row.held_at) }));
    });
  });

  fastify.post('/holds', async (request, reply) => {
    const user = request.user;
    const body = holdCartSchema.parse(request.body);
    const held = await withTenant(user.tenant_id, async trx => {
      const productIds = [...new Set(body.items.map(item => item.product_id))];
      const productCount = await trx.selectFrom('products').select(trx.fn.count('id').as('count')).where('tenant_id', '=', user.tenant_id)
        .where('id', 'in', productIds).where('status', '=', 'active').executeTakeFirst();
      if (Number(productCount?.count ?? 0) !== productIds.length) throw Object.assign(new Error('One or more products are unavailable.'), { statusCode: 422 });
      if (body.customer_id) {
        const customer = await trx.selectFrom('customers').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.customer_id).where('deleted_at', 'is', null).executeTakeFirst();
        if (!customer) throw Object.assign(new Error('Customer does not belong to this workspace.'), { statusCode: 422 });
      }
      if (body.inventory_location_id) {
        const location = await trx.selectFrom('inventory_locations').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.inventory_location_id).executeTakeFirst();
        if (!location) throw Object.assign(new Error('Inventory location does not belong to this workspace.'), { statusCode: 422 });
      }
      return trx.insertInto('pos_held_carts').values({
        tenant_id:user.tenant_id, label:body.label, customer_id:body.customer_id ?? null,
        // items is JSONB — Kysely/node-postgres don't auto-serialize a raw
        // JS array for it (it gets formatted as a Postgres text[] literal
        // instead, which then fails to parse as JSON on the way back out).
        inventory_location_id:body.inventory_location_id ?? null, currency:body.currency.toUpperCase(), items:JSON.stringify(body.items), held_by:user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();
    });
    return reply.status(201).send({ ...held, held_at:iso(held.held_at) });
  });

  fastify.delete('/holds/:id', async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id:z.string().uuid() }).parse(request.params);
    const held = await withTenant(user.tenant_id, trx => trx.deleteFrom('pos_held_carts').where('tenant_id', '=', user.tenant_id)
      .where('id', '=', id).returningAll().executeTakeFirst());
    if (!held) return reply.status(404).send({ error:'Held cart not found.' });
    return { ...held, items:z.array(heldCartItemSchema).parse(held.items), held_at:iso(held.held_at) };
  });

  fastify.get('/sales/:id', async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return withTenant(user.tenant_id, async trx => {
      const sale = await trx.selectFrom('pos_sales').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!sale) return reply.status(404).send({ error: 'POS sale not found' });
      const [lines, payments] = await Promise.all([
        trx.selectFrom('pos_sale_lines').selectAll().where('tenant_id', '=', user.tenant_id).where('sale_id', '=', id).orderBy('id').execute(),
        trx.selectFrom('pos_payments').selectAll().where('tenant_id', '=', user.tenant_id).where('sale_id', '=', id).orderBy('created_at').execute(),
      ]);
      return {
        ...sale, sold_at: iso(sale.sold_at), refunded_at: iso(sale.refunded_at), subtotal: Number(sale.subtotal), discount_total: Number(sale.discount_total), tax_total: Number(sale.tax_total),
        grand_total: Number(sale.grand_total), amount_paid: Number(sale.amount_paid), change_due: Number(sale.change_due),
        lines: lines.map(l => ({ ...l, qty: Number(l.qty), unit_price: Number(l.unit_price), discount: Number(l.discount), tax_rate: Number(l.tax_rate), tax_amount: Number(l.tax_amount), line_total: Number(l.line_total) })),
        payments: payments.map(p => ({ ...p, amount: Number(p.amount) })),
      };
    });
  });

  fastify.post('/shifts/open', async (request, reply) => {
    const user = request.user;
    const body = openShiftSchema.parse(request.body ?? {});
    try {
      const row = await withTenant(user.tenant_id, async trx => {
        // Optional — a tenant that never set up tenant_sites (migration 641)
        // keeps opening registers exactly as before. One that has can now
        // attribute the register to a real outlet; only checked for tenant
        // ownership here, not against user_org_assignments — a tighter
        // "only your assigned outlet" rule is real future work, not
        // invented here.
        if (body.site_id) {
          const site = await trx.selectFrom('tenant_sites').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.site_id).executeTakeFirst();
          if (!site) throw Object.assign(new Error('That outlet does not belong to this workspace.'), { statusCode: 422 });
        }
        return trx.insertInto('pos_shifts').values({
          tenant_id: user.tenant_id, opened_by: user.sub, opening_float: body.opening_float, notes: body.notes?.trim() || null,
          site_id: body.site_id ?? null,
        } as any).returningAll().executeTakeFirstOrThrow();
      });
      return reply.status(201).send({ ...row, opening_float: Number(row.opening_float), opened_at: iso(row.opened_at) });
    } catch (error: any) {
      if (error?.code === '23505') return reply.status(409).send({ error: 'You already have an open POS register.' });
      if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  fastify.post('/shifts/:id/close', async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = closeShiftSchema.parse(request.body);
    return withTenant(user.tenant_id, async trx => {
      const shift = await trx.selectFrom('pos_shifts').selectAll().where('tenant_id', '=', user.tenant_id)
        .where('id', '=', id).where('opened_by', '=', user.sub).where('status', '=', 'OPEN').executeTakeFirst();
      if (!shift) return reply.status(404).send({ error: 'Open POS register not found' });
      const [cash, cashChange, movements] = await Promise.all([
        // Same reasoning as /bootstrap: cash in hand (and change already
        // handed back) counts regardless of whether GL posting for that
        // sale has succeeded yet.
        trx.selectFrom('pos_payments as p').innerJoin('pos_sales as s', 's.id', 'p.sale_id')
          .select(sql<number>`COALESCE(SUM(p.amount), 0)`.as('total')).where('p.tenant_id', '=', user.tenant_id)
          .where('s.shift_id', '=', id).where('s.status', 'in', ['COMPLETED', 'POSTING_FAILED']).where('p.method', '=', 'CASH').executeTakeFirst(),
        trx.selectFrom('pos_sales').select(sql<number>`COALESCE(SUM(change_due), 0)`.as('total')).where('tenant_id', '=', user.tenant_id)
          .where('shift_id', '=', id).where('status', 'in', ['COMPLETED', 'POSTING_FAILED']).executeTakeFirst(),
        trx.selectFrom('pos_cash_movements').select(sql<number>`COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0)`.as('net'))
          .where('tenant_id', '=', user.tenant_id).where('shift_id', '=', id).executeTakeFirst(),
      ]);
      const expected = money(Number(shift.opening_float) + Number(cash?.total ?? 0) - Number(cashChange?.total ?? 0) + Number(movements?.net ?? 0));
      const row = await trx.updateTable('pos_shifts').set({
        status: 'CLOSED', closed_by: user.sub, closing_cash: body.closing_cash, expected_cash: expected, closed_at: new Date(),
        notes: body.notes?.trim() || shift.notes,
      }).where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      return { ...row, opening_float: Number(row.opening_float), closing_cash: Number(row.closing_cash), expected_cash: Number(row.expected_cash), opened_at: iso(row.opened_at), closed_at: iso(row.closed_at) };
    });
  });

  fastify.post('/sales', { preHandler: requirePosTransactionAllowance }, async (request, reply) => {
    const user = request.user;
    const body = checkoutSchema.parse(request.body);
    const idempotencyKey = (request.headers['idempotency-key'] as string | undefined)?.trim() || null;
    try {
      if (idempotencyKey) {
        const existing = await withTenant(user.tenant_id, trx => trx.selectFrom('pos_sales').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('idempotency_key', '=', idempotencyKey).executeTakeFirst());
        if (existing) {
          const payments = await withTenant(user.tenant_id, trx => trx.selectFrom('pos_payments').select(['method', 'amount', 'reference'])
            .where('tenant_id', '=', user.tenant_id).where('sale_id', '=', existing.id).execute());
          return reply.status(201).send({
            ...existing, payments: payments.map(p => ({ ...p, amount: Number(p.amount) })), sold_at: iso(existing.sold_at),
            subtotal: Number(existing.subtotal), discount_total: Number(existing.discount_total), tax_total: Number(existing.tax_total),
            grand_total: Number(existing.grand_total), amount_paid: Number(existing.amount_paid), change_due: Number(existing.change_due),
          });
        }
      }
      const sale = await withTenant(user.tenant_id, async trx => {
        const shift = await trx.selectFrom('pos_shifts').select(['id', 'site_id']).where('tenant_id', '=', user.tenant_id)
          .where('opened_by', '=', user.sub).where('status', '=', 'OPEN').executeTakeFirst();
        if (!shift) throw Object.assign(new Error('Open your POS register before checking out.'), { statusCode: 409 });

        const productIds = [...new Set(body.items.map(item => item.product_id))];
        const products = await trx.selectFrom('products').selectAll().where('tenant_id', '=', user.tenant_id)
          .where('id', 'in', productIds).where('status', '=', 'active').execute();
        if (products.length !== productIds.length) throw Object.assign(new Error('One or more products are unavailable.'), { statusCode: 422 });
        const byId = new Map(products.map(product => [product.id, product]));
        const currency = body.currency.toUpperCase();
        // An outlet in a different country can sell the same catalog item
        // at its own price and currency (migration 714) — a tenant with no
        // such override keeps every product at its one base price/currency,
        // exactly as before. Resolved once per line below, never silently
        // mixed: the currency check compares against the RESOLVED currency,
        // not necessarily the product's own base one.
        const siteOverrides = shift.site_id
          ? await trx.selectFrom('pos_site_product_prices').select(['product_id', 'price', 'currency'])
              .where('tenant_id', '=', user.tenant_id).where('site_id', '=', shift.site_id).where('product_id', 'in', productIds).execute()
          : [];
        const overrideByProduct = new Map(siteOverrides.map(o => [o.product_id, o]));
        const resolvedCurrency = (product: typeof products[number]) => (overrideByProduct.get(product.id)?.currency ?? product.currency).toUpperCase();
        const resolvedPrice = (product: typeof products[number]) => Number(overrideByProduct.get(product.id)?.price ?? product.sale_price);
        const mismatched = products.find(product => resolvedCurrency(product) !== currency);
        if (mismatched) throw Object.assign(new Error(`${mismatched.name} is priced in ${resolvedCurrency(mismatched)} at this outlet, not ${currency}. Convert the sale currency explicitly rather than mixing them.`), { statusCode: 422 });
        const needsLocation = products.some(product => product.track_inventory);
        if (needsLocation && !body.inventory_location_id) throw Object.assign(new Error('Select an inventory location before selling tracked stock.'), { statusCode: 422 });

        let customerName: string | null = null;
        if (body.customer_id) {
          const customer = await trx.selectFrom('customers').select('name').where('tenant_id', '=', user.tenant_id)
            .where('id', '=', body.customer_id).where('deleted_at', 'is', null).executeTakeFirst();
          if (!customer) throw Object.assign(new Error('Customer does not belong to this workspace.'), { statusCode: 422 });
          customerName = customer.name;
        }
        if (body.inventory_location_id) {
          const location = await trx.selectFrom('inventory_locations').select('id').where('tenant_id', '=', user.tenant_id)
            .where('id', '=', body.inventory_location_id).executeTakeFirst();
          if (!location) throw Object.assign(new Error('Inventory location does not belong to this workspace.'), { statusCode: 422 });
        }

        const inventoryItems = await trx.selectFrom('inventory_items').select(['id', 'product_id', 'base_uom', 'avg_cost'])
          .where('tenant_id', '=', user.tenant_id).where('product_id', 'in', productIds).where('active', '=', true).execute();
        const itemByProduct = new Map(inventoryItems.map(item => [item.product_id, item]));
        const categories = [...new Set(products.map(p => p.category).filter((c): c is string => c != null))];
        const now = new Date();
        const promotions = await trx.selectFrom('pos_promotions')
          .select(['product_id', 'category', 'discount_type', 'discount_value', 'site_id'])
          .where('tenant_id', '=', user.tenant_id).where('active', '=', true).where('starts_at', '<=', now)
          .where(eb => eb.or([eb('ends_at', 'is', null), eb('ends_at', '>', now)]))
          .where(eb => eb.or([
            eb('product_id', 'in', productIds.length ? productIds : ['__none__']),
            ...(categories.length ? [eb('category', 'in', categories)] : []),
          ]))
          .execute();
        const lines = body.items.map(input => {
          const product = byId.get(input.product_id)!;
          const unitPrice = resolvedPrice(product);
          const gross = money(unitPrice * input.qty);
          // A manual discount (cashier-typed) always wins — a promotion
          // never stacks on top of, or silently overrides, a discount the
          // cashier explicitly entered.
          const promo = input.discount === 0 ? resolvePromotion(promotions, product, shift.site_id, gross) : null;
          const effectiveDiscount = promo
            ? money(promo.discount_type === 'percent' ? gross * Number(promo.discount_value) / 100 : Math.min(Number(promo.discount_value), gross))
            : input.discount;
          if (effectiveDiscount > gross) throw Object.assign(new Error(`Discount exceeds the value of ${product.name}.`), { statusCode: 422 });
          const net = money(gross - effectiveDiscount);
          const tax = money(net * Number(product.tax_rate) / 100);
          const unitCost = Number(itemByProduct.get(product.id)?.avg_cost ?? 0);
          return { product, qty: input.qty, unitPrice, unitCost, costTotal: money(unitCost * input.qty), discount: effectiveDiscount, tax, total: money(net + tax) };
        });
        const subtotal = money(lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0));
        const discountTotal = money(lines.reduce((sum, line) => sum + line.discount, 0));
        const taxTotal = money(lines.reduce((sum, line) => sum + line.tax, 0));
        const grandTotal = money(subtotal - discountTotal + taxTotal);
        const amountPaid = money(body.payments.reduce((sum, payment) => sum + payment.amount, 0));
        if (amountPaid < grandTotal) throw Object.assign(new Error(`Payment is short by ${money(grandTotal - amountPaid)} ${body.currency}.`), { statusCode: 422 });
        const changeDue = money(amountPaid - grandTotal);
        const cashTendered = money(body.payments.filter(payment => payment.method === 'CASH').reduce((sum, payment) => sum + payment.amount, 0));
        if (changeDue > cashTendered) throw Object.assign(new Error('Change can only be issued from the cash portion of a payment.'), { statusCode: 422 });
        const saleNumber = `POS-${new Date().toISOString().replace(/\D/g, '').slice(2, 14)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
        const created = await trx.insertInto('pos_sales').values({
          tenant_id: user.tenant_id, shift_id: shift.id, sale_number: saleNumber, customer_id: body.customer_id ?? null, customer_name: customerName,
          currency: body.currency.toUpperCase(), subtotal, discount_total: discountTotal, tax_total: taxTotal, grand_total: grandTotal,
          amount_paid: amountPaid, change_due: changeDue, inventory_location_id: body.inventory_location_id ?? null,
          notes: body.notes?.trim() || null, sold_by: user.sub, journal_entry_id: null, idempotency_key: idempotencyKey,
          // Denormalized off the shift, not re-asked at checkout — a sale
          // belongs to whichever outlet its register was opened at.
          site_id: shift.site_id,
        } as any).returningAll().executeTakeFirstOrThrow();
        await trx.insertInto('pos_sale_lines').values(lines.map(line => ({
          tenant_id: user.tenant_id, sale_id: created.id, product_id: line.product.id, product_code: line.product.code,
          product_name: line.product.name, qty: line.qty, unit_price: line.unitPrice, discount: line.discount,
          unit_cost: line.unitCost, cost_total: line.costTotal, tax_rate: Number(line.product.tax_rate), tax_amount: line.tax, line_total: line.total,
        }))).execute();
        // Each tender is rounded to 2dp independently (a client can send a
        // sub-cent amount, e.g. a float-divided split), but their SUM must
        // tie out exactly to amount_paid — otherwise the stored payments
        // and the sale total silently disagree by a cent. The last tender
        // absorbs the rounding remainder rather than letting it vanish.
        const roundedPayments = body.payments.map(payment => ({ ...payment, amount: money(payment.amount) }));
        const roundedSum = money(roundedPayments.reduce((sum, payment) => sum + payment.amount, 0));
        const remainder = money(amountPaid - roundedSum);
        if (remainder !== 0) roundedPayments[roundedPayments.length - 1]!.amount = money(roundedPayments[roundedPayments.length - 1]!.amount + remainder);
        await trx.insertInto('pos_payments').values(roundedPayments.map(payment => ({
          tenant_id: user.tenant_id, sale_id: created.id, method: payment.method, amount: payment.amount, reference: payment.reference?.trim() || null,
        }))).execute();

        if (body.inventory_location_id) {
          for (const line of lines) {
            if (line.product.type !== 'product') continue;
            const item = itemByProduct.get(line.product.id);
            if (!item) continue;
            const stock = await trx.selectFrom('inventory_stock_levels').select(sql<number>`COALESCE(SUM(qty_on_hand), 0)`.as('qty'))
              .where('tenant_id', '=', user.tenant_id).where('item_id', '=', item.id).where('location_id', '=', body.inventory_location_id).executeTakeFirst();
            if (Number(stock?.qty ?? 0) < line.qty) throw Object.assign(new Error(`Insufficient stock for ${line.product.name}.`), { statusCode: 422 });
            await InventoryService.recordMovement(trx, user.tenant_id, {
              actorId: user.sub, movementType: 'issue', itemId: item.id, fromLocationId: body.inventory_location_id,
              enteredQty: line.qty, enteredUom: item.base_uom, reasonCode: 'POS_SALE', reference: saleNumber,
            });
          }
        }
        return { ...created, payments: roundedPayments, sold_at: iso(created.sold_at) };
      });

      try {
        const journalId = await postSaleJournal(user.tenant_id, user.sub, sale, sale.payments);
        await withTenant(user.tenant_id, trx => trx.updateTable('pos_sales').set({ journal_entry_id:journalId, posting_error:null, posting_attempts:1, last_posting_attempt_at:new Date() })
          .where('tenant_id', '=', user.tenant_id).where('id', '=', sale.id).execute());
        await emitDomainEventStandalone(user.tenant_id, {
          type:'pos.sale_completed', sourceApp:'finops', entityType:'pos_sale', entityId:sale.id, actorId:user.sub,
          payload:{ saleNumber:sale.sale_number, customerId:body.customer_id ?? null, total:sale.grand_total,
            currency:sale.currency, paymentMethods:[...new Set(body.payments.map(payment => payment.method))] },
        });
        return reply.status(201).send({ ...sale, journal_entry_id:journalId, posting_attempts:1 });
      } catch (postingError:any) {
        const message = postingError?.message || 'Accounting journal could not be posted.';
        await withTenant(user.tenant_id, trx => trx.updateTable('pos_sales').set({ status:'POSTING_FAILED', posting_error:message, posting_attempts:1, last_posting_attempt_at:new Date() })
          .where('tenant_id', '=', user.tenant_id).where('id', '=', sale.id).execute());
        return reply.status(202).send({ ...sale, status:'POSTING_FAILED', posting_error:message, posting_attempts:1 });
      }
    } catch (error: any) {
      if (error instanceof UnknownUom || error instanceof InvalidMovement || error?.statusCode) {
        return reply.status(error.statusCode ?? 422).send({ error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/sales/:id/retry-posting', async (request, reply) => {
    const user = request.user;
    if (!POS_MANAGER_ROLES.has(user.role)) return reply.status(403).send({ error:'Manager or Finance access is required to retry accounting.' });
    const { id } = z.object({ id:z.string().uuid() }).parse(request.params);
    try {
      const updated = await withTenant(user.tenant_id, async trx => {
        const sale = await trx.selectFrom('pos_sales').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).forUpdate().executeTakeFirst();
        if (!sale) throw Object.assign(new Error('POS sale not found.'), { statusCode:404 });
        if (sale.status !== 'POSTING_FAILED') throw Object.assign(new Error('Only a sale with failed accounting can be retried.'), { statusCode:409 });
        const payments = await trx.selectFrom('pos_payments').select(['method','amount']).where('tenant_id', '=', user.tenant_id).where('sale_id', '=', id).execute();
        const existing = await trx.selectFrom('journal_entries').select('id').where('tenant_id', '=', user.tenant_id)
          .where('source_module', '=', 'AR').where('source_id', '=', id).where('status', '=', 'POSTED').executeTakeFirst();
        const journalId = existing?.id ?? await postSaleJournal(user.tenant_id, user.sub, sale, payments.map(p => ({ ...p, amount: Number(p.amount) })), trx);
        return trx.updateTable('pos_sales').set({ status:'COMPLETED', journal_entry_id:journalId, posting_error:null,
          posting_attempts:sql`posting_attempts + 1`, last_posting_attempt_at:new Date() }).where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      });
      await emitDomainEventStandalone(user.tenant_id, {
        type:'pos.sale_completed', sourceApp:'finops', entityType:'pos_sale', entityId:id, actorId:user.sub,
        payload:{ saleNumber:updated.sale_number, customerId:updated.customer_id, total:Number(updated.grand_total),
          currency:updated.currency, recoveredPosting:true },
      });
      return { ...updated, subtotal:Number(updated.subtotal), discount_total:Number(updated.discount_total), tax_total:Number(updated.tax_total), grand_total:Number(updated.grand_total), amount_paid:Number(updated.amount_paid), change_due:Number(updated.change_due), sold_at:iso(updated.sold_at) };
    } catch (error:any) {
      if (error.statusCode === 404 || error.statusCode === 409) return reply.status(error.statusCode).send({ error: error.message });
      const message = error?.message || 'Accounting journal could not be posted.';
      await withTenant(user.tenant_id, trx => trx.updateTable('pos_sales').set({ posting_error:message, posting_attempts:sql`posting_attempts + 1`, last_posting_attempt_at:new Date() })
        .where('tenant_id', '=', user.tenant_id).where('id', '=', id).execute());
      return reply.status(422).send({ error:message });
    }
  });

  fastify.post('/sales/:id/refund', async (request, reply) => {
    const user = request.user;
    if (!POS_MANAGER_ROLES.has(user.role)) return reply.status(403).send({ error:'Manager or Finance access is required to refund a posted sale.' });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = refundSchema.parse(request.body);

    // Void the journal, return stock, and flip the sale to REFUNDED all in
    // ONE transaction — previously voidEntry ran as its own committed
    // transaction before a SEPARATE one attempted the stock return, so a
    // stock-return failure rolled back only the sale's status update while
    // the journal stayed voided: a refund that was financially reversed
    // but never actually returned the goods, with no way to retry either
    // half cleanly. GLService.voidEntry and InventoryService.recordMovement
    // both already accept an optional transaction for exactly this reason.
    try {
      const result = await withTenant(user.tenant_id, async trx => {
        const sale = await trx.selectFrom('pos_sales').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).forUpdate().executeTakeFirst();
        if (!sale) throw Object.assign(new Error('POS sale not found.'), { statusCode: 404 });
        if (sale.status !== 'COMPLETED') throw Object.assign(new Error('Only a completed sale can be refunded.'), { statusCode: 409 });
        if (!sale.journal_entry_id) throw Object.assign(new Error('This sale has no posted journal entry and cannot be refunded automatically.'), { statusCode: 409 });

        if (body.lines) {
          return await processItemLevelReturn(trx, user.tenant_id, user.sub, id, sale, body.lines, body.reason);
        }

        const lines = await trx.selectFrom('pos_sale_lines').select(['product_id', 'qty']).where('tenant_id', '=', user.tenant_id).where('sale_id', '=', id).execute();
        const restockLocationId = body.restock_location_id === undefined ? sale.inventory_location_id : body.restock_location_id;
        if (restockLocationId) {
          const location = await trx.selectFrom('inventory_locations').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', restockLocationId).executeTakeFirst();
          if (!location) throw Object.assign(new Error('Restock location does not belong to this workspace.'), { statusCode: 422 });
        }

        const reversalId = await GLService.voidEntry(user.tenant_id, sale.journal_entry_id!, user.sub, `POS refund: ${body.reason}`, trx);

        if (restockLocationId) {
          const productIds = lines.map(line => line.product_id);
          const items = productIds.length ? await trx.selectFrom('inventory_items').select(['id', 'product_id', 'base_uom'])
            .where('tenant_id', '=', user.tenant_id).where('product_id', 'in', productIds).where('active', '=', true).execute() : [];
          const byProduct = new Map(items.map(item => [item.product_id, item]));
          for (const line of lines) {
            const item = byProduct.get(line.product_id);
            if (!item) continue;
            await InventoryService.recordMovement(trx, user.tenant_id, {
              actorId: user.sub, movementType: 'return', itemId: item.id, toLocationId: restockLocationId,
              enteredQty: Number(line.qty), enteredUom: item.base_uom, reasonCode: 'POS_REFUND', reference: sale.sale_number,
            });
          }
        }
        await trx.updateTable('pos_sales').set({
          status: 'REFUNDED', refunded_at: new Date(), refunded_by: user.sub, refund_reason: body.reason,
          reversal_journal_entry_id: reversalId,
        }).where('tenant_id', '=', user.tenant_id).where('id', '=', id).where('status', '=', 'COMPLETED').executeTakeFirstOrThrow();

        return { sale, reversalId, restockLocationId, itemLevel: false as const };
      });
      await emitDomainEventStandalone(user.tenant_id, {
        type: result.itemLevel ? 'pos.sale_line_returned' : 'pos.sale_refunded', sourceApp:'finops', entityType:'pos_sale', entityId:id, actorId:user.sub,
        payload:{ saleNumber:result.sale.sale_number, customerId:result.sale.customer_id,
          total:Number(result.itemLevel ? result.refundTotal : result.sale.grand_total), currency:result.sale.currency, reason:body.reason,
          inventoryReturned: result.itemLevel ? result.restockedAny : !!result.restockLocationId },
      });
      return result.itemLevel
        ? { success: true, reversal_journal_entry_id: result.reversalId, refund_total: result.refundTotal, fully_refunded: result.fullyRefunded, lines: result.lineResults }
        : { success: true, reversal_journal_entry_id: result.reversalId };
    } catch (error: any) {
      if (error instanceof UnknownUom || error instanceof InvalidMovement || error?.statusCode) {
        return reply.status(error.statusCode ?? 422).send({ error: error.message });
      }
      throw error;
    }
  });

  // Void — a mis-rung sale corrected within the SAME still-open shift, as
  // distinct from a refund (the customer genuinely returning goods after
  // the fact, any time, even after the register closed). pos_sales.status
  // has allowed 'VOIDED' since migration 531 but nothing ever set it until
  // now (migration 712 added the matching voided_at/voided_by/void_reason
  // columns). Same atomic reversal shape as refund — GL void + stock
  // return + status flip, all in one transaction, for the same reason
  // refund's own comment explains.
  fastify.post('/sales/:id/void', async (request, reply) => {
    const user = request.user;
    if (!POS_MANAGER_ROLES.has(user.role)) return reply.status(403).send({ error:'Manager or Finance access is required to void a sale.' });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = voidSchema.parse(request.body);

    try {
      const result = await withTenant(user.tenant_id, async trx => {
        const sale = await trx.selectFrom('pos_sales').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).forUpdate().executeTakeFirst();
        if (!sale) throw Object.assign(new Error('POS sale not found.'), { statusCode: 404 });
        if (sale.status !== 'COMPLETED') throw Object.assign(new Error('Only a completed sale can be voided.'), { statusCode: 409 });
        const shift = await trx.selectFrom('pos_shifts').select('status').where('tenant_id', '=', user.tenant_id).where('id', '=', sale.shift_id).executeTakeFirst();
        if (shift?.status !== 'OPEN') throw Object.assign(new Error('This sale\'s register has already closed — use a refund instead of a void.'), { statusCode: 409 });
        if (!sale.journal_entry_id) throw Object.assign(new Error('This sale has no posted journal entry and cannot be voided automatically.'), { statusCode: 409 });
        const lines = await trx.selectFrom('pos_sale_lines').select(['product_id', 'qty']).where('tenant_id', '=', user.tenant_id).where('sale_id', '=', id).execute();
        const restockLocationId = body.restock_location_id === undefined ? sale.inventory_location_id : body.restock_location_id;
        if (restockLocationId) {
          const location = await trx.selectFrom('inventory_locations').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', restockLocationId).executeTakeFirst();
          if (!location) throw Object.assign(new Error('Restock location does not belong to this workspace.'), { statusCode: 422 });
        }

        const reversalId = await GLService.voidEntry(user.tenant_id, sale.journal_entry_id!, user.sub, `POS void: ${body.reason}`, trx);

        if (restockLocationId) {
          const productIds = lines.map(line => line.product_id);
          const items = productIds.length ? await trx.selectFrom('inventory_items').select(['id', 'product_id', 'base_uom'])
            .where('tenant_id', '=', user.tenant_id).where('product_id', 'in', productIds).where('active', '=', true).execute() : [];
          const byProduct = new Map(items.map(item => [item.product_id, item]));
          for (const line of lines) {
            const item = byProduct.get(line.product_id);
            if (!item) continue;
            await InventoryService.recordMovement(trx, user.tenant_id, {
              actorId: user.sub, movementType: 'return', itemId: item.id, toLocationId: restockLocationId,
              enteredQty: Number(line.qty), enteredUom: item.base_uom, reasonCode: 'POS_VOID', reference: sale.sale_number,
            });
          }
        }
        await trx.updateTable('pos_sales').set({
          status: 'VOIDED', voided_at: new Date(), voided_by: user.sub, void_reason: body.reason,
          reversal_journal_entry_id: reversalId,
        } as any).where('tenant_id', '=', user.tenant_id).where('id', '=', id).where('status', '=', 'COMPLETED').executeTakeFirstOrThrow();

        return { sale, reversalId, restockLocationId };
      });
      await emitDomainEventStandalone(user.tenant_id, {
        type:'pos.sale_voided', sourceApp:'finops', entityType:'pos_sale', entityId:id, actorId:user.sub,
        payload:{ saleNumber:result.sale.sale_number, customerId:result.sale.customer_id,
          total:Number(result.sale.grand_total), currency:result.sale.currency, reason:body.reason,
          inventoryReturned:!!result.restockLocationId },
      });
      return { success: true, reversal_journal_entry_id: result.reversalId };
    } catch (error: any) {
      if (error instanceof UnknownUom || error instanceof InvalidMovement || error?.statusCode) {
        return reply.status(error.statusCode ?? 422).send({ error: error.message });
      }
      throw error;
    }
  });
}
