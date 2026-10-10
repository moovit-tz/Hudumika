import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireFinanceCapability } from '../middleware/finance-capability.js';
import { requireRole } from '../middleware/rbac.js';
import { checkAppUsageLimit, getAppUsageSummary } from '../lib/usage.js';
import { InventoryService, InvalidMovement, UnknownUom } from '../services/inventory.service.js';
import { GLService } from '../services/gl.service.js';
import { emitDomainEventStandalone } from '../services/domain-events.service.js';

const POS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;
const POS_MANAGER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']);
const paymentMethod = z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK', 'OTHER']);
const openShiftSchema = z.object({ opening_float: z.number().min(0).default(0), notes: z.string().max(1000).optional() });
const closeShiftSchema = z.object({ closing_cash: z.number().min(0), notes: z.string().max(1000).optional() });
const cashMovementSchema = z.object({ direction:z.enum(['IN','OUT']), amount:z.number().positive().max(1_000_000_000), reason:z.string().trim().min(3).max(500) });
const refundSchema = z.object({ reason: z.string().trim().min(3).max(1000), restock_location_id: z.string().uuid().nullable().optional() });
const heldCartItemSchema = z.object({ product_id: z.string().min(1).max(50), qty: z.number().positive().max(1_000_000), discount: z.number().min(0).default(0) });
const holdCartSchema = z.object({
  label: z.string().trim().min(1).max(160), customer_id: z.string().uuid().nullable().optional(),
  inventory_location_id: z.string().uuid().nullable().optional(), currency: z.string().trim().min(3).max(10).default('TZS'),
  items: z.array(heldCartItemSchema).min(1).max(200),
});
const checkoutSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  inventory_location_id: z.string().uuid().nullable().optional(),
  currency: z.string().trim().min(3).max(10).default('TZS'),
  notes: z.string().max(2000).optional(),
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

async function postSaleJournal(tenantId:string, actorId:string, sale:{ id:string; sale_number:string; grand_total:number; tax_total:number; change_due:number; currency:string }, payments:Array<{ method:keyof typeof tenderAccounts; amount:number }>) {
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
  });
}

export async function posRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));
  fastify.addHook('preHandler', requireRole(...POS_ROLES));
  fastify.addHook('preHandler', requireFinanceCapability('finance.pos', { preserveReadAccess: true }));

  fastify.get('/bootstrap', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async trx => {
      const [products, customers, locations, shift] = await Promise.all([
        trx.selectFrom('products').select(['id', 'code', 'name', 'category', 'unit', 'type', 'sale_price', 'currency', 'tax_rate'])
          .where('tenant_id', '=', user.tenant_id).where('status', '=', 'active').orderBy('name').execute(),
        trx.selectFrom('customers').select(['id', 'name', 'email'])
          .where('tenant_id', '=', user.tenant_id).where('active', '=', true).where('deleted_at', 'is', null).orderBy('name').execute(),
        trx.selectFrom('inventory_locations as l').innerJoin('inventory_warehouses as w', 'w.id', 'l.warehouse_id')
          .select(['l.id', 'l.code', 'l.name', 'w.name as warehouse_name'])
          .where('l.tenant_id', '=', user.tenant_id).where('l.is_pickable', '=', true).where('w.active', '=', true).orderBy('w.name').orderBy('l.name').execute(),
        trx.selectFrom('pos_shifts').selectAll().where('tenant_id', '=', user.tenant_id)
          .where('opened_by', '=', user.sub).where('status', '=', 'OPEN').executeTakeFirst(),
      ]);
      let shiftSummary = null;
      if (shift) {
        const [sales, cashPayments, movements] = await Promise.all([
          trx.selectFrom('pos_sales').select([trx.fn.count('id').as('count'), trx.fn.sum('grand_total').as('total'), trx.fn.sum('change_due').as('change')])
            .where('tenant_id', '=', user.tenant_id).where('shift_id', '=', shift.id).where('status', '=', 'COMPLETED').executeTakeFirst(),
          trx.selectFrom('pos_payments as p').innerJoin('pos_sales as s', 's.id', 'p.sale_id')
            .select(sql<number>`COALESCE(SUM(p.amount), 0)`.as('total')).where('p.tenant_id', '=', user.tenant_id).where('s.shift_id', '=', shift.id)
            .where('s.status', '=', 'COMPLETED').where('p.method', '=', 'CASH').executeTakeFirst(),
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
          expected_cash: money(Number(shift.opening_float) + Number(cashPayments?.total ?? 0) - Number(sales?.change ?? 0) + cashIn - cashOut),
        };
      }
      return {
        products: products.map(p => ({ ...p, sale_price: Number(p.sale_price), tax_rate: Number(p.tax_rate) })),
        customers,
        locations,
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

  fastify.get('/sales', async (request) => {
    const user = request.user;
    const query = z.object({
      page:z.coerce.number().int().min(1).default(1), page_size:z.coerce.number().int().min(5).max(100).default(20),
      search:z.string().trim().max(160).optional(), status:z.enum(['COMPLETED','VOIDED','REFUNDED','POSTING_FAILED']).optional(),
      from:z.string().date().optional(), to:z.string().date().optional(),
    }).parse(request.query);
    return withTenant(user.tenant_id, async trx => {
      let base = trx.selectFrom('pos_sales').where('tenant_id', '=', user.tenant_id);
      if (query.search) {
        const term = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
        base = base.where(eb => eb.or([eb('sale_number', 'ilike', term), eb('customer_name', 'ilike', term)]));
      }
      if (query.status) base = base.where('status', '=', query.status);
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
  fastify.get('/sales-report', async (request) => {
    const user = request.user;
    const query = z.object({ from:z.string().date().optional(), to:z.string().date().optional() }).parse(request.query);
    return withTenant(user.tenant_id, async trx => {
      let rows = trx.selectFrom('pos_sales').select([
        'id', 'sale_number', 'customer_id', 'customer_name', 'currency',
        'grand_total', 'tax_total', 'discount_total', 'sold_at', 'status',
      ]).where('tenant_id', '=', user.tenant_id).where('status', '=', 'COMPLETED');
      if (query.from) rows = rows.where('sold_at', '>=', new Date(`${query.from}T00:00:00.000Z`));
      if (query.to) {
        const exclusive = new Date(`${query.to}T00:00:00.000Z`);
        exclusive.setUTCDate(exclusive.getUTCDate() + 1);
        rows = rows.where('sold_at', '<', exclusive);
      }
      const result = await rows.orderBy('sold_at', 'desc').execute();
      return result.map(row => ({ ...row, grand_total:Number(row.grand_total), tax_total:Number(row.tax_total),
        discount_total:Number(row.discount_total), sold_at:iso(row.sold_at) }));
    });
  });

  fastify.get('/analytics', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async trx => {
      const [today, cost, cashiers, payments] = await Promise.all([
        trx.selectFrom('pos_sales').select([
          trx.fn.count('id').as('sales_count'), trx.fn.sum('grand_total').as('revenue'),
          trx.fn.sum('discount_total').as('discounts'), trx.fn.sum('tax_total').as('tax'),
        ]).where('tenant_id', '=', user.tenant_id).where('status', '=', 'COMPLETED')
          .where('sold_at', '>=', sql<Date>`CURRENT_DATE`).executeTakeFirst(),
        trx.selectFrom('pos_sale_lines as l').innerJoin('pos_sales as s', 's.id', 'l.sale_id')
          .select(sql<number>`COALESCE(SUM(l.cost_total), 0)`.as('cost')).where('l.tenant_id', '=', user.tenant_id)
          .where('s.tenant_id', '=', user.tenant_id).where('s.status', '=', 'COMPLETED')
          .where('s.sold_at', '>=', sql<Date>`CURRENT_DATE`).executeTakeFirst(),
        trx.selectFrom('pos_sales as s').innerJoin('users as u', 'u.id', 's.sold_by')
          .select(['s.sold_by as user_id', 'u.name']).select([sql<number>`COUNT(s.id)`.as('sales_count'), sql<number>`COALESCE(SUM(s.grand_total), 0)`.as('revenue')])
          .where('s.tenant_id', '=', user.tenant_id).where('u.tenant_id', '=', user.tenant_id).where('s.status', '=', 'COMPLETED')
          .where('s.sold_at', '>=', sql<Date>`CURRENT_DATE`).groupBy(['s.sold_by', 'u.name']).orderBy(sql`SUM(s.grand_total)`, 'desc').execute(),
        trx.selectFrom('pos_payments as p').innerJoin('pos_sales as s', 's.id', 'p.sale_id')
          .select('p.method').select([sql<number>`COUNT(p.id)`.as('count'), sql<number>`COALESCE(SUM(p.amount), 0)`.as('amount')])
          .where('p.tenant_id', '=', user.tenant_id).where('s.tenant_id', '=', user.tenant_id).where('s.status', '=', 'COMPLETED')
          .where('s.sold_at', '>=', sql<Date>`CURRENT_DATE`).groupBy('p.method').orderBy(sql`SUM(p.amount)`, 'desc').execute(),
      ]);
      const salesCount = Number(today?.sales_count ?? 0);
      const revenue = Number(today?.revenue ?? 0);
      const tax = Number(today?.tax ?? 0);
      const totalCost = Number(cost?.cost ?? 0);
      return {
        today: {
          sales_count: salesCount, revenue, discounts: Number(today?.discounts ?? 0), tax, cost: totalCost,
          margin: money(revenue - tax - totalCost), average_sale: salesCount ? money(revenue / salesCount) : 0,
        },
        cashiers: cashiers.map(row => ({ user_id: row.user_id, name: row.name, sales_count: Number(row.sales_count), revenue: Number(row.revenue), average_sale: money(Number(row.revenue) / Number(row.sales_count)) })),
        payments: payments.map(row => ({ method: row.method, amount: Number(row.amount), count: Number(row.count) })),
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
        inventory_location_id:body.inventory_location_id ?? null, currency:body.currency.toUpperCase(), items:body.items, held_by:user.sub,
      }).returningAll().executeTakeFirstOrThrow();
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
      const row = await withTenant(user.tenant_id, trx => trx.insertInto('pos_shifts').values({
        tenant_id: user.tenant_id, opened_by: user.sub, opening_float: body.opening_float, notes: body.notes?.trim() || null,
      }).returningAll().executeTakeFirstOrThrow());
      return reply.status(201).send({ ...row, opening_float: Number(row.opening_float), opened_at: iso(row.opened_at) });
    } catch (error: any) {
      if (error?.code === '23505') return reply.status(409).send({ error: 'You already have an open POS register.' });
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
        trx.selectFrom('pos_payments as p').innerJoin('pos_sales as s', 's.id', 'p.sale_id')
          .select(sql<number>`COALESCE(SUM(p.amount), 0)`.as('total')).where('p.tenant_id', '=', user.tenant_id)
          .where('s.shift_id', '=', id).where('s.status', '=', 'COMPLETED').where('p.method', '=', 'CASH').executeTakeFirst(),
        trx.selectFrom('pos_sales').select(sql<number>`COALESCE(SUM(change_due), 0)`.as('total')).where('tenant_id', '=', user.tenant_id)
          .where('shift_id', '=', id).where('status', '=', 'COMPLETED').executeTakeFirst(),
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
    try {
      const sale = await withTenant(user.tenant_id, async trx => {
        const shift = await trx.selectFrom('pos_shifts').select('id').where('tenant_id', '=', user.tenant_id)
          .where('opened_by', '=', user.sub).where('status', '=', 'OPEN').executeTakeFirst();
        if (!shift) throw Object.assign(new Error('Open your POS register before checking out.'), { statusCode: 409 });

        const productIds = [...new Set(body.items.map(item => item.product_id))];
        const products = await trx.selectFrom('products').selectAll().where('tenant_id', '=', user.tenant_id)
          .where('id', 'in', productIds).where('status', '=', 'active').execute();
        if (products.length !== productIds.length) throw Object.assign(new Error('One or more products are unavailable.'), { statusCode: 422 });
        const byId = new Map(products.map(product => [product.id, product]));

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
        const lines = body.items.map(input => {
          const product = byId.get(input.product_id)!;
          const gross = money(Number(product.sale_price) * input.qty);
          if (input.discount > gross) throw Object.assign(new Error(`Discount exceeds the value of ${product.name}.`), { statusCode: 422 });
          const net = money(gross - input.discount);
          const tax = money(net * Number(product.tax_rate) / 100);
          const unitCost = Number(itemByProduct.get(product.id)?.avg_cost ?? 0);
          return { product, qty: input.qty, unitPrice: Number(product.sale_price), unitCost, costTotal: money(unitCost * input.qty), discount: money(input.discount), tax, total: money(net + tax) };
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
          notes: body.notes?.trim() || null, sold_by: user.sub, journal_entry_id: null,
        }).returningAll().executeTakeFirstOrThrow();
        await trx.insertInto('pos_sale_lines').values(lines.map(line => ({
          tenant_id: user.tenant_id, sale_id: created.id, product_id: line.product.id, product_code: line.product.code,
          product_name: line.product.name, qty: line.qty, unit_price: line.unitPrice, discount: line.discount,
          unit_cost: line.unitCost, cost_total: line.costTotal, tax_rate: Number(line.product.tax_rate), tax_amount: line.tax, line_total: line.total,
        }))).execute();
        await trx.insertInto('pos_payments').values(body.payments.map(payment => ({
          tenant_id: user.tenant_id, sale_id: created.id, method: payment.method, amount: money(payment.amount), reference: payment.reference?.trim() || null,
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
        return { ...created, payments:body.payments.map(payment => ({ ...payment, amount:money(payment.amount) })), sold_at: iso(created.sold_at) };
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
    const snapshot = await withTenant(user.tenant_id, async trx => {
      const sale = await trx.selectFrom('pos_sales').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!sale) throw Object.assign(new Error('POS sale not found.'), { statusCode:404 });
      if (sale.status !== 'POSTING_FAILED') throw Object.assign(new Error('Only a sale with failed accounting can be retried.'), { statusCode:409 });
      const payments = await trx.selectFrom('pos_payments').select(['method','amount']).where('tenant_id', '=', user.tenant_id).where('sale_id', '=', id).execute();
      const existing = await trx.selectFrom('journal_entries').select('id').where('tenant_id', '=', user.tenant_id)
        .where('source_module', '=', 'AR').where('source_id', '=', id).where('status', '=', 'POSTED').executeTakeFirst();
      return { sale, payments:payments.map(payment=>({ ...payment, amount:Number(payment.amount) })), existingJournalId:existing?.id??null };
    });
    try {
      const journalId = snapshot.existingJournalId ?? await postSaleJournal(user.tenant_id, user.sub, snapshot.sale, snapshot.payments);
      const updated = await withTenant(user.tenant_id, trx => trx.updateTable('pos_sales').set({ status:'COMPLETED', journal_entry_id:journalId, posting_error:null,
        posting_attempts:sql`posting_attempts + 1`, last_posting_attempt_at:new Date() }).where('tenant_id', '=', user.tenant_id).where('id', '=', id).where('status', '=', 'POSTING_FAILED').returningAll().executeTakeFirstOrThrow());
      await emitDomainEventStandalone(user.tenant_id, {
        type:'pos.sale_completed', sourceApp:'finops', entityType:'pos_sale', entityId:id, actorId:user.sub,
        payload:{ saleNumber:updated.sale_number, customerId:updated.customer_id, total:Number(updated.grand_total),
          currency:updated.currency, recoveredPosting:true },
      });
      return { ...updated, subtotal:Number(updated.subtotal), discount_total:Number(updated.discount_total), tax_total:Number(updated.tax_total), grand_total:Number(updated.grand_total), amount_paid:Number(updated.amount_paid), change_due:Number(updated.change_due), sold_at:iso(updated.sold_at) };
    } catch (error:any) {
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

    const snapshot = await withTenant(user.tenant_id, async trx => {
      const sale = await trx.selectFrom('pos_sales').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!sale) throw Object.assign(new Error('POS sale not found.'), { statusCode: 404 });
      if (sale.status !== 'COMPLETED') throw Object.assign(new Error('Only a completed sale can be refunded.'), { statusCode: 409 });
      if (!sale.journal_entry_id) throw Object.assign(new Error('This sale has no posted journal entry and cannot be refunded automatically.'), { statusCode: 409 });
      const lines = await trx.selectFrom('pos_sale_lines').select(['product_id', 'qty']).where('tenant_id', '=', user.tenant_id).where('sale_id', '=', id).execute();
      const restockLocationId = body.restock_location_id === undefined ? sale.inventory_location_id : body.restock_location_id;
      if (restockLocationId) {
        const location = await trx.selectFrom('inventory_locations').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', restockLocationId).executeTakeFirst();
        if (!location) throw Object.assign(new Error('Restock location does not belong to this workspace.'), { statusCode: 422 });
      }
      return { sale, lines, restockLocationId };
    });

    try {
      const reversalId = await GLService.voidEntry(user.tenant_id, snapshot.sale.journal_entry_id!, user.sub, `POS refund: ${body.reason}`);
      await withTenant(user.tenant_id, async trx => {
        if (snapshot.restockLocationId) {
          const productIds = snapshot.lines.map(line => line.product_id);
          const items = productIds.length ? await trx.selectFrom('inventory_items').select(['id', 'product_id', 'base_uom'])
            .where('tenant_id', '=', user.tenant_id).where('product_id', 'in', productIds).where('active', '=', true).execute() : [];
          const byProduct = new Map(items.map(item => [item.product_id, item]));
          for (const line of snapshot.lines) {
            const item = byProduct.get(line.product_id);
            if (!item) continue;
            await InventoryService.recordMovement(trx, user.tenant_id, {
              actorId: user.sub, movementType: 'return', itemId: item.id, toLocationId: snapshot.restockLocationId,
              enteredQty: Number(line.qty), enteredUom: item.base_uom, reasonCode: 'POS_REFUND', reference: snapshot.sale.sale_number,
            });
          }
        }
        await trx.updateTable('pos_sales').set({
          status: 'REFUNDED', refunded_at: new Date(), refunded_by: user.sub, refund_reason: body.reason,
          reversal_journal_entry_id: reversalId,
        }).where('tenant_id', '=', user.tenant_id).where('id', '=', id).where('status', '=', 'COMPLETED').executeTakeFirstOrThrow();
      });
      await emitDomainEventStandalone(user.tenant_id, {
        type:'pos.sale_refunded', sourceApp:'finops', entityType:'pos_sale', entityId:id, actorId:user.sub,
        payload:{ saleNumber:snapshot.sale.sale_number, customerId:snapshot.sale.customer_id,
          total:Number(snapshot.sale.grand_total), currency:snapshot.sale.currency, reason:body.reason,
          inventoryReturned:!!snapshot.restockLocationId },
      });
      return { success: true, reversal_journal_entry_id: reversalId };
    } catch (error: any) {
      if (error instanceof UnknownUom || error instanceof InvalidMovement || error?.statusCode) {
        return reply.status(error.statusCode ?? 422).send({ error: error.message });
      }
      throw error;
    }
  });
}
