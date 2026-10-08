import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { FINANCE_INDUSTRY_KEYS } from '@hudumika/types';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { assertWorkTransition, createIndustryWork, getIndustryWork, IndustryWorkError } from '../services/finance-industry-work.service.js';
import { createProduction, progressProduction, saveProductionRecipe } from '../services/finance-production.service.js';
import { requireFinanceCapability } from '../middleware/finance-capability.js';
import { InvalidMovement, UnknownUom } from '../services/inventory.service.js';
import { allocateStock, dispatchAllocation, releaseAllocation } from '../services/finance-stock-allocation.service.js';
import { accrueWorkCost, allocatePostedWorkCost, getWorkPostedResults, listWorkCostSources } from '../services/finance-work-accounting.service.js';
import { GLService } from '../services/gl.service.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a valid date.');
const createSchema = z.object({ industry: z.enum(FINANCE_INDUSTRY_KEYS), name: z.string().trim().min(1).max(160),
  customer_id: z.string().uuid(), currency: z.enum(['TZS', 'USD', 'EUR', 'GBP', 'KES', 'UGX']).default('TZS'),
  budget: z.number().finite().min(0).max(1e12).default(0), due_date: day.optional(),
  specifications: z.record(z.string().max(80), z.string().max(1000)).refine(value => Object.keys(value).length <= 20, 'At most 20 job specifications.').default({}),
});
const lineSchema = z.object({ kind: z.enum(['service', 'time', 'material', 'expense', 'milestone']),
  description: z.string().trim().min(1).max(500), quantity: z.number().finite().positive().max(1e9),
  unit: z.string().trim().min(1).max(50), rate: z.number().finite().min(0).max(1e12),
  cost_rate: z.number().finite().min(0).max(1e12), billable: z.boolean().default(true), work_date: day,
});
const paramsSchema = z.object({ id: z.string().uuid() });
const writers = requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE');
const productionGates = [writers, requireFinanceCapability('finance.inventory'), requireFinanceCapability('finance.accounting.advanced')];
const productionSchema = z.object({ output_item_id: z.string().uuid(), source_location_id: z.string().uuid(), target_location_id: z.string().uuid(),
  planned_quantity: z.number().finite().positive().max(1e9), output_batch: z.string().trim().max(100).default(''), conversion_cost: z.number().finite().min(0).max(1e12).default(0),
  materials: z.array(z.object({ item_id: z.string().uuid(), quantity: z.number().finite().positive().max(1e9), unit: z.string().trim().min(1).max(50), batch: z.string().trim().max(100).default('') })).min(1).max(200),
});
export async function financeIndustryWorkRoutes(server: FastifyInstance) {
  server.addHook('preHandler', server.authenticate);
  server.addHook('preHandler', requireEntitlement('finops'));
  server.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'));
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.status(400).send({ error: 'Invalid work data.', message: error.issues.map(issue => issue.message).join(' ') });
    if (error instanceof IndustryWorkError) return reply.status(error.statusCode).send({ error: error.message });
    if (error instanceof InvalidMovement || error instanceof UnknownUom) return reply.status(422).send({ error: error.message });
    const status = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    server.log.error(error); return reply.status(status).send({ error: status < 500 && error instanceof Error ? error.message : 'Unable to process industry work.' });
  });
  server.get('/', async request => {
    const query = z.object({ industry: z.enum(FINANCE_INDUSTRY_KEYS), status: z.enum(['draft', 'active', 'completed', 'cancelled']).optional(),
      search: z.string().max(160).default(''), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(request.query);
    return withTenant(request.user.tenant_id, async trx => {
      let base = trx.selectFrom('finance_industry_work as w').innerJoin('customers as c', 'c.id', 'w.customer_id')
        .where('w.tenant_id', '=', request.user.tenant_id).where('c.tenant_id', '=', request.user.tenant_id).where('w.industry', '=', query.industry);
      if (query.status) base = base.where('w.status', '=', query.status);
      if (query.search) base = base.where('w.name', 'ilike', `%${query.search.replace(/[\\%_]/g, '\\$&')}%`);
      const total = await base.select(eb => eb.fn.countAll().as('count')).executeTakeFirstOrThrow();
      const items = await base.selectAll('w').select('c.name as customer_name').orderBy('w.created_at', 'desc').limit(query.limit).offset((query.page - 1) * query.limit).execute();
      return { items, total: Number(total.count), page: query.page, limit: query.limit };
    });
  });
  server.post('/', { preHandler: writers }, async (request, reply) => reply.status(201).send(await createIndustryWork(request.user.tenant_id, request.user.sub, createSchema.parse(request.body))));
  server.get('/recipes', { preHandler: productionGates }, async request => {
    const { search } = z.object({ search: z.string().max(120).default('') }).parse(request.query);
    return withTenant(request.user.tenant_id, trx => trx.selectFrom('finance_production_recipes').selectAll().where('tenant_id', '=', request.user.tenant_id)
      .where('name', 'ilike', `%${search.replace(/[\\%_]/g, '\\$&')}%`).orderBy('created_at', 'desc').limit(100).execute());
  });
  server.post('/recipes', { preHandler: productionGates }, async (request, reply) => {
    const { name, recipe } = z.object({ name: z.string().trim().min(1).max(120), recipe: productionSchema }).parse(request.body);
    return reply.status(201).send(await saveProductionRecipe(request.user.tenant_id, request.user.sub, name, recipe));
  });
  server.get('/stock-options', { preHandler: requireFinanceCapability('finance.inventory') }, async request => withTenant(request.user.tenant_id, async trx => ({
    items: await trx.selectFrom('inventory_items').select(['id', 'name', 'sku', 'base_uom', 'is_batch_tracked']).where('tenant_id', '=', request.user.tenant_id).where('active', '=', true).orderBy('name').execute(),
    locations: await trx.selectFrom('inventory_locations').select(['id', 'name', 'code']).where('tenant_id', '=', request.user.tenant_id).orderBy('name').execute(),
  })));
  server.post('/:id/production', { preHandler: productionGates }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    return reply.status(201).send(await createProduction(request.user.tenant_id, request.user.sub, id, productionSchema.parse(request.body)));
  });
  server.post('/:id/production/:productionId/:operation', { preHandler: productionGates }, async request => {
    const { id, productionId, operation } = paramsSchema.extend({ productionId: z.string().uuid(), operation: z.enum(['release', 'complete']) }).parse(request.params);
    const { actual_quantity } = z.object({ actual_quantity: z.number().finite().positive().max(1e9).optional() }).parse(request.body ?? {});
    return progressProduction(request.user.tenant_id, request.user.sub, id, productionId, operation, actual_quantity);
  });
  server.post('/:id/allocations', { preHandler: [writers, requireFinanceCapability('finance.inventory')] }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const body = z.object({ item_id: z.string().uuid(), location_id: z.string().uuid(), batch: z.string().trim().max(100).default(''), quantity: z.number().finite().positive().max(1e9) }).parse(request.body);
    return reply.status(201).send(await allocateStock(request.user.tenant_id, request.user.sub, id, body));
  });
  server.post('/:id/allocations/:allocationId/dispatch', { preHandler: [writers, requireFinanceCapability('finance.inventory')] }, async request => {
    const { id, allocationId } = paramsSchema.extend({ allocationId: z.string().uuid() }).parse(request.params);
    const { quantity } = z.object({ quantity: z.number().finite().positive().max(1e9) }).parse(request.body);
    return dispatchAllocation(request.user.tenant_id, request.user.sub, id, allocationId, quantity);
  });
  server.post('/:id/allocations/:allocationId/release', { preHandler: [writers, requireFinanceCapability('finance.inventory')] }, async request => {
    const { id, allocationId } = paramsSchema.extend({ allocationId: z.string().uuid() }).parse(request.params);
    return releaseAllocation(request.user.tenant_id, id, allocationId);
  });
  server.post('/:id/lines/:lineId/accrue-cost', { preHandler: [writers, requireFinanceCapability('finance.accounting.advanced')] }, async request => {
    const { id, lineId } = paramsSchema.extend({ lineId: z.string().uuid() }).parse(request.params);
    return accrueWorkCost(request.user.tenant_id, request.user.sub, id, lineId);
  });
  server.get('/:id', async request => {
    const { id } = paramsSchema.parse(request.params);
    return withTenant(request.user.tenant_id, async trx => {
      const work = await getIndustryWork(trx, request.user.tenant_id, id);
      const lines = await trx.selectFrom('finance_industry_work_lines').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).orderBy('created_at').execute();
      const production = await trx.selectFrom('finance_production_orders').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).orderBy('created_at').execute();
      const allocations = await trx.selectFrom('finance_stock_allocations as a').innerJoin('inventory_items as i', 'i.id', 'a.item_id').selectAll('a').select(['i.name as item_name', 'i.base_uom as unit']).where('a.tenant_id', '=', request.user.tenant_id).where('i.tenant_id', '=', request.user.tenant_id).where('a.work_id', '=', id).orderBy('a.created_at').execute();
      const posted = await getWorkPostedResults(trx, request.user.tenant_id, id);
      return { ...work, ...posted, lines, production, allocations, estimated_revenue: lines.filter(line => line.billable).reduce((sum, line) => sum + Number(line.quantity) * Number(line.rate), 0),
        estimated_cost: lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.cost_rate), 0) };
    });
  });
  server.get('/:id/costs', { preHandler: requireFinanceCapability('finance.accounting.advanced') }, async request => {
    const { id } = paramsSchema.parse(request.params);
    const query = z.object({ search: z.string().max(160).default(''), page: z.coerce.number().int().min(1).max(100000).default(1) }).parse(request.query);
    return withTenant(request.user.tenant_id, async trx => {
      await getIndustryWork(trx, request.user.tenant_id, id);
      const sources = await listWorkCostSources(trx, request.user.tenant_id, query.search, query.page);
      const allocations = await trx.selectFrom('finance_work_cost_allocations').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).orderBy('created_at', 'desc').limit(100).execute();
      return { ...sources, allocations };
    });
  });
  server.post('/:id/costs', { preHandler: [writers, requireFinanceCapability('finance.accounting.advanced')] }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const body = z.object({ source_journal_line_id: z.string().uuid(), amount: z.number().finite().positive().max(1e12), reason: z.string().trim().min(1).max(500) }).parse(request.body);
    return reply.status(201).send(await allocatePostedWorkCost(request.user.tenant_id, request.user.sub, id, body.source_journal_line_id, body.amount, body.reason));
  });
  server.post('/:id/costs/:allocationId/reverse', { preHandler: [writers, requireFinanceCapability('finance.accounting.advanced')] }, async request => {
    const { id, allocationId } = paramsSchema.extend({ allocationId: z.string().uuid() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${`gl:${request.user.tenant_id}`}, 0))`.execute(trx);
      const allocation = await trx.selectFrom('finance_work_cost_allocations').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).where('id', '=', allocationId).where('reversed_at', 'is', null).executeTakeFirst();
      if (!allocation) throw new IndustryWorkError('Active allocation not found.', 404);
      return { journal_id: await GLService.voidEntry(request.user.tenant_id, allocation.allocation_journal_id, request.user.sub, reason, trx) };
    });
  });
  server.patch('/:id/status', { preHandler: writers }, async request => {
    const { id } = paramsSchema.parse(request.params);
    const { status } = z.object({ status: z.enum(['active', 'completed', 'cancelled']) }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const work = await getIndustryWork(trx, request.user.tenant_id, id, true);
      const invoiced = await trx.selectFrom('finance_industry_work_lines').select('id').where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).where('invoice_id', 'is not', null).executeTakeFirst();
      assertWorkTransition(work.status, status, Boolean(invoiced));
      const unfinishedProduction = await trx.selectFrom('finance_production_orders').select('id').where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).where('status', '!=', 'completed').executeTakeFirst();
      if (unfinishedProduction && ['completed', 'cancelled'].includes(status)) throw new IndustryWorkError('Finish the production orders before closing this job.');
      if (status === 'cancelled') await trx.updateTable('finance_stock_allocations').set({ released: true }).where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).execute();
      if (status === 'completed') {
        const pending = await trx.selectFrom('finance_stock_allocations').select('id').where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).where('released', '=', false).whereRef('quantity', '>', 'dispatched_quantity').executeTakeFirst();
        if (pending) throw new IndustryWorkError('Dispatch or release reserved stock before completing this work.');
      }
      if (status === 'completed') {
        const unapproved = await trx.selectFrom('finance_industry_work_lines').select('id').where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).where('approved', '=', false).executeTakeFirst();
        if (unapproved) throw new IndustryWorkError('Approve all work lines before completing the job.');
      }
      return trx.updateTable('finance_industry_work').set({ status, updated_at: new Date() }).where('tenant_id', '=', request.user.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });
  server.post('/:id/lines', { preHandler: writers }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params); const body = lineSchema.parse(request.body);
    return reply.status(201).send(await withTenant(request.user.tenant_id, async trx => {
      const work = await getIndustryWork(trx, request.user.tenant_id, id, true);
      if (!['draft', 'active'].includes(work.status)) throw new IndustryWorkError('Only draft or active work accepts new lines.');
      return trx.insertInto('finance_industry_work_lines').values({ ...body, tenant_id: request.user.tenant_id, work_id: id, created_by: request.user.sub, invoice_id: null, approved_by: null, approved_at: null }).returningAll().executeTakeFirstOrThrow();
    }));
  });
  server.patch('/:id/lines/:lineId', { preHandler: writers }, async request => {
    const { id, lineId } = paramsSchema.extend({ lineId: z.string().uuid() }).parse(request.params);
    const body = lineSchema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const work = await getIndustryWork(trx, request.user.tenant_id, id, true);
      if (!['draft', 'active'].includes(work.status)) throw new IndustryWorkError('Only open work accepts line corrections.');
      const updated = await trx.updateTable('finance_industry_work_lines').set(body).where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id)
        .where('id', '=', lineId).where('approved', '=', false).where('invoice_id', 'is', null).where('cost_journal_id', 'is', null).returningAll().executeTakeFirst();
      if (!updated) throw new IndustryWorkError('Only unapproved, unbilled and unposted lines can be edited.');
      return updated;
    });
  });
  server.post('/:id/lines/:lineId/approve', { preHandler: writers }, async request => {
    const { id, lineId } = paramsSchema.extend({ lineId: z.string().uuid() }).parse(request.params);
    return withTenant(request.user.tenant_id, async trx => {
      const work = await getIndustryWork(trx, request.user.tenant_id, id, true);
      if (!['draft', 'active'].includes(work.status)) throw new IndustryWorkError('This work no longer accepts approvals.');
      const result = await trx.updateTable('finance_industry_work_lines').set({ approved: true, approved_by: request.user.sub, approved_at: new Date() })
        .where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).where('id', '=', lineId).where('approved', '=', false).where('invoice_id', 'is', null).returningAll().executeTakeFirst();
      if (!result) throw new IndustryWorkError('Line not found or already approved/billed.', 409);
      return result;
    });
  });
}
