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
import { createInspection, recordInspectionResult, releaseQualityHold, progressStage, recordWaste, recordTraceabilityLink, traceForward, traceBackward } from '../services/manufacturing-quality.service.js';
import { createPropertyUnit, listPropertyUnits, createLease, generateLeaseCharges, listLeaseCharges,
  addBoqItem, listBoqItems, createProgressCertificate,
  registerVehicle, listVehicles, createJobCard, progressJobCard,
  createPolicy, fileClaim, adjudicateClaim,
  createLoan, generateLoanSchedule, recordLoanRepayment,
  createRoom, listRooms, createReservation, checkInGuest, checkOutGuest, addFolioCharge,
  registerStudent, listStudents, createFeeStructure, enrollStudent } from '../services/industry-domains.service.js';

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
const productionGates = [writers, requireFinanceCapability('finance.manufacturing'), requireFinanceCapability('finance.inventory'), requireFinanceCapability('finance.accounting.advanced')];
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
    const stageSchema = z.object({ name: z.string().min(1).max(100), order: z.number().int().min(0), expected_duration_minutes: z.number().int().min(0).optional() });
    const { name, recipe, stages } = z.object({ name: z.string().trim().min(1).max(120), recipe: productionSchema, stages: z.array(stageSchema).max(50).default([]) }).parse(request.body);
    return reply.status(201).send(await saveProductionRecipe(request.user.tenant_id, request.user.sub, name, recipe, stages));
  });
  server.get('/stock-options', { preHandler: requireFinanceCapability('finance.inventory') }, async request => withTenant(request.user.tenant_id, async trx => ({
    items: await trx.selectFrom('inventory_items').select(['id', 'name', 'sku', 'base_uom', 'is_batch_tracked']).where('tenant_id', '=', request.user.tenant_id).where('active', '=', true).orderBy('name').execute(),
    locations: await trx.selectFrom('inventory_locations').select(['id', 'name', 'code']).where('tenant_id', '=', request.user.tenant_id).orderBy('name').execute(),
  })));
  server.post('/:id/production', { preHandler: productionGates }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const body = productionSchema.extend({ recipe_id: z.string().uuid().optional() }).parse(request.body);
    const { recipe_id, ...production } = body;
    return reply.status(201).send(await createProduction(request.user.tenant_id, request.user.sub, id, production, recipe_id));
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
      const domainData: Record<string, unknown> = {};
      if (work.industry === 'construction') {
        domainData.boq_items = await trx.selectFrom('finance_boq_items').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).orderBy('sort_order').execute();
        domainData.progress_certificates = await trx.selectFrom('finance_progress_certificates').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).orderBy('certificate_no', 'desc').execute();
      } else if (work.industry === 'automotive') {
        domainData.job_cards = await trx.selectFrom('finance_job_cards').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).orderBy('created_at', 'desc').execute();
      } else if (work.industry === 'insurance') {
        domainData.policies = await trx.selectFrom('finance_insurance_policies').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).execute();
      } else if (work.industry === 'lending') {
        domainData.loans = await trx.selectFrom('finance_loans').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).execute();
      } else if (work.industry === 'property') {
        domainData.leases = await trx.selectFrom('finance_leases').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).execute();
      } else if (work.industry === 'hospitality') {
        domainData.reservations = await trx.selectFrom('finance_reservations').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).orderBy('check_in').execute();
      } else if (work.industry === 'education') {
        domainData.enrollments = await trx.selectFrom('finance_student_enrollments').selectAll().where('tenant_id', '=', request.user.tenant_id).where('work_id', '=', id).execute();
      }
      return { ...work, ...posted, ...domainData, lines, production, allocations, estimated_revenue: lines.filter(line => line.billable).reduce((sum, line) => sum + Number(line.quantity) * Number(line.rate), 0),
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

  // ── Quality inspections ───────────────────────────────────────────────

  server.post('/:id/production/:prodId/inspections', { preHandler: productionGates }, async (request, reply) => {
    const { id, prodId } = paramsSchema.extend({ prodId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      inspection_type: z.enum(['incoming', 'in_process', 'final']),
      item_id: z.string().uuid(), location_id: z.string().uuid(),
      batch_no: z.string().max(100).default(''), quantity_inspected: z.number().positive(),
    }).parse(request.body);
    const result = await createInspection(request.user.tenant_id, request.user.sub, { ...body, production_id: prodId });
    return reply.status(201).send(result);
  });

  server.get('/:id/production/:prodId/inspections', async request => {
    const { id, prodId } = paramsSchema.extend({ prodId: z.string().uuid() }).parse(request.params);
    return withTenant(request.user.tenant_id, async trx =>
      trx.selectFrom('finance_quality_inspections').selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .where('production_id', '=', prodId)
        .orderBy('created_at', 'desc').execute()
    );
  });

  server.post('/:id/inspections/:inspId/result', { preHandler: productionGates }, async request => {
    const { inspId } = z.object({ id: z.string().uuid(), inspId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      quantity_passed: z.number().min(0), quantity_failed: z.number().min(0),
      disposition: z.enum(['use_as_is', 'rework', 'scrap', 'return_to_supplier', 'downgrade']).optional(),
    }).parse(request.body);
    return recordInspectionResult(request.user.tenant_id, request.user.sub, inspId, body);
  });

  server.post('/:id/inspections/:inspId/release', { preHandler: productionGates }, async request => {
    const { inspId } = z.object({ id: z.string().uuid(), inspId: z.string().uuid() }).parse(request.params);
    const { notes } = z.object({ notes: z.string().max(1000).default('') }).parse(request.body ?? {});
    return releaseQualityHold(request.user.tenant_id, request.user.sub, inspId, notes);
  });

  // ── Production stages ─────────────────────────────────────────────────

  server.get('/:id/production/:prodId/stages', async request => {
    const { prodId } = paramsSchema.extend({ prodId: z.string().uuid() }).parse(request.params);
    return withTenant(request.user.tenant_id, async trx =>
      trx.selectFrom('finance_production_stages').selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .where('production_id', '=', prodId)
        .orderBy('stage_order', 'asc').execute()
    );
  });

  server.post('/:id/stages/:stageId/:op', { preHandler: productionGates }, async request => {
    const { stageId, op } = z.object({ id: z.string().uuid(), stageId: z.string().uuid(), op: z.enum(['start', 'complete', 'skip']) }).parse(request.params);
    const body = z.object({ output_quantity: z.number().positive().optional(), notes: z.string().max(1000).optional() }).parse(request.body ?? {});
    return progressStage(request.user.tenant_id, request.user.sub, stageId, op, body);
  });

  // ── Waste / rework ────────────────────────────────────────────────────

  server.post('/:id/production/:prodId/waste', { preHandler: productionGates }, async (request, reply) => {
    const { id, prodId } = paramsSchema.extend({ prodId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      item_id: z.string().uuid(), waste_type: z.enum(['normal_loss', 'abnormal_loss', 'rework', 'scrap']),
      quantity: z.number().positive(), unit: z.string().min(1).max(50), reason: z.string().min(1).max(500),
      stage_id: z.string().uuid().optional(), is_recoverable: z.boolean().default(false),
      disposition: z.enum(['disposed', 'recycled', 'reworked', 'sold_as_scrap']).optional(),
    }).parse(request.body);
    const result = await recordWaste(request.user.tenant_id, request.user.sub, id, { ...body, production_id: prodId });
    return reply.status(201).send(result);
  });

  server.get('/:id/production/:prodId/waste', async request => {
    const { prodId } = paramsSchema.extend({ prodId: z.string().uuid() }).parse(request.params);
    return withTenant(request.user.tenant_id, async trx =>
      trx.selectFrom('finance_production_waste').selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .where('production_id', '=', prodId)
        .orderBy('recorded_at', 'desc').execute()
    );
  });

  // ── Batch traceability ────────────────────────────────────────────────

  server.post('/:id/production/:prodId/traceability', { preHandler: productionGates }, async (request, reply) => {
    const { prodId } = paramsSchema.extend({ prodId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      input_item_id: z.string().uuid(), input_batch_no: z.string().max(100).default(''),
      input_quantity: z.number().positive(), output_item_id: z.string().uuid(),
      output_batch_no: z.string().max(100).default(''),
    }).parse(request.body);
    const result = await recordTraceabilityLink(request.user.tenant_id, { ...body, production_id: prodId });
    return reply.status(201).send(result);
  });

  server.get('/traceability/forward', async request => {
    const { item_id, batch_no } = z.object({ item_id: z.string().uuid(), batch_no: z.string() }).parse(request.query);
    return traceForward(request.user.tenant_id, item_id, batch_no);
  });

  server.get('/traceability/backward', async request => {
    const { item_id, batch_no } = z.object({ item_id: z.string().uuid(), batch_no: z.string() }).parse(request.query);
    return traceBackward(request.user.tenant_id, item_id, batch_no);
  });

  // ═══════ PROPERTY / RENTALS ═══════
  server.post('/property/units', { preHandler: writers }, async (request, reply) => {
    const input = z.object({ name: z.string().trim().min(1).max(200), unit_type: z.enum(['residential','commercial','industrial','land','parking','storage']),
      address: z.string().max(500).optional(), area_sqm: z.number().positive().max(1e9).optional(),
      bedrooms: z.number().int().min(0).max(100).optional(), notes: z.string().max(2000).optional(),
    }).parse(request.body);
    return reply.status(201).send(await createPropertyUnit(request.user.tenant_id, input));
  });
  server.get('/property/units', async request => listPropertyUnits(request.user.tenant_id, (request.query as any).status));

  server.post('/:id/lease', { preHandler: writers }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const input = z.object({ unit_id: z.string().uuid(), tenant_name: z.string().trim().min(1).max(200),
      lease_start: day, lease_end: day.optional(), rent_amount: z.number().positive().max(1e12),
      rent_currency: z.string().max(3).optional(), billing_cycle: z.enum(['weekly','monthly','quarterly','annually']).optional(),
      deposit_amount: z.number().min(0).max(1e12).optional(), escalation_pct: z.number().min(0).max(100).optional(),
      escalation_freq: z.enum(['annually','biannually']).optional(),
    }).parse(request.body);
    return reply.status(201).send(await createLease(request.user.tenant_id, request.user.sub, id, input));
  });
  server.post('/:id/lease/:leaseId/charges', { preHandler: writers }, async (request, reply) => {
    const { id, leaseId } = z.object({ id: z.string().uuid(), leaseId: z.string().uuid() }).parse(request.params);
    const { period_start, period_end, due_date } = z.object({ period_start: day, period_end: day, due_date: day }).parse(request.body);
    return reply.status(201).send(await generateLeaseCharges(request.user.tenant_id, leaseId, period_start, period_end, due_date));
  });
  server.get('/:id/lease/:leaseId/charges', async request => {
    const { leaseId } = z.object({ id: z.string().uuid(), leaseId: z.string().uuid() }).parse(request.params);
    return listLeaseCharges(request.user.tenant_id, leaseId);
  });

  // ═══════ CONSTRUCTION ═══════
  server.post('/:id/boq', { preHandler: writers }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const input = z.object({ item_no: z.string().trim().min(1).max(50), description: z.string().trim().min(1).max(500),
      unit: z.string().max(20).optional(), quantity: z.number().positive().max(1e12),
      rate: z.number().min(0).max(1e12), retention_pct: z.number().min(0).max(100).optional(),
      sort_order: z.number().int().min(0).optional(),
    }).parse(request.body);
    return reply.status(201).send(await addBoqItem(request.user.tenant_id, id, input));
  });
  server.get('/:id/boq', async request => {
    const { id } = paramsSchema.parse(request.params);
    return listBoqItems(request.user.tenant_id, id);
  });
  server.post('/:id/progress-certificate', { preHandler: writers }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const input = z.object({ period_start: day, period_end: day,
      measurements: z.array(z.object({ boq_item_id: z.string().uuid(), qty_this_period: z.number().min(0).max(1e12) })).min(1).max(500),
    }).parse(request.body);
    return reply.status(201).send(await createProgressCertificate(request.user.tenant_id, request.user.sub, id, input));
  });

  // ═══════ AUTOMOTIVE / WORKSHOP ═══════
  server.post('/vehicles', { preHandler: writers }, async (request, reply) => {
    const input = z.object({ customer_id: z.string().uuid().optional(), registration: z.string().trim().min(1).max(20),
      make: z.string().max(100).optional(), model: z.string().max(100).optional(),
      year: z.number().int().min(1900).max(2100).optional(), vin: z.string().max(50).optional(),
      mileage: z.number().int().min(0).optional(), color: z.string().max(50).optional(),
      notes: z.string().max(2000).optional(),
    }).parse(request.body);
    return reply.status(201).send(await registerVehicle(request.user.tenant_id, input));
  });
  server.get('/vehicles', async request => listVehicles(request.user.tenant_id, (request.query as any).customer_id));

  server.post('/:id/job-card', { preHandler: writers }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const input = z.object({ vehicle_id: z.string().uuid(), mileage_in: z.number().int().min(0).optional(),
      reported_fault: z.string().trim().min(1).max(2000), bay_number: z.string().max(20).optional(),
      technician_id: z.string().uuid().optional(), estimated_hours: z.number().min(0).max(10000).optional(),
    }).parse(request.body);
    return reply.status(201).send(await createJobCard(request.user.tenant_id, request.user.sub, id, input));
  });
  server.post('/:id/job-card/:cardId/progress', { preHandler: writers }, async request => {
    const { cardId } = z.object({ id: z.string().uuid(), cardId: z.string().uuid() }).parse(request.params);
    const { status } = z.object({ status: z.string() }).parse(request.body);
    return progressJobCard(request.user.tenant_id, cardId, status);
  });

  // ═══════ INSURANCE ═══════
  server.post('/:id/policy', { preHandler: writers }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const input = z.object({ policy_number: z.string().trim().min(1).max(50),
      policy_type: z.enum(['life','health','motor','property','liability','marine','travel','other']),
      holder_name: z.string().trim().min(1).max(200), holder_contact: z.string().max(200).optional(),
      coverage_start: day, coverage_end: day, sum_insured: z.number().positive().max(1e15),
      premium_amount: z.number().positive().max(1e12),
      premium_frequency: z.enum(['monthly','quarterly','semi_annual','annual','single']).optional(),
      currency: z.string().max(3).optional(), deductible: z.number().min(0).max(1e12).optional(),
      underwriter_notes: z.string().max(5000).optional(),
    }).parse(request.body);
    return reply.status(201).send(await createPolicy(request.user.tenant_id, request.user.sub, id, input));
  });
  server.post('/:id/policy/:policyId/claim', { preHandler: writers }, async (request, reply) => {
    const { policyId } = z.object({ id: z.string().uuid(), policyId: z.string().uuid() }).parse(request.params);
    const input = z.object({ claim_number: z.string().trim().min(1).max(50), incident_date: day,
      description: z.string().trim().min(1).max(5000), claim_amount: z.number().positive().max(1e15),
    }).parse(request.body);
    return reply.status(201).send(await fileClaim(request.user.tenant_id, request.user.sub, policyId, input));
  });
  server.post('/:id/claims/:claimId/adjudicate', { preHandler: writers }, async request => {
    const { claimId } = z.object({ id: z.string().uuid(), claimId: z.string().uuid() }).parse(request.params);
    const { decision, approved_amount, reason } = z.object({
      decision: z.enum(['approved','denied']), approved_amount: z.number().positive().optional(),
      reason: z.string().max(2000).optional(),
    }).parse(request.body);
    return adjudicateClaim(request.user.tenant_id, request.user.sub, claimId, decision, approved_amount, reason);
  });

  // ═══════ LENDING / MICROFINANCE ═══════
  server.post('/:id/loan', { preHandler: writers }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const input = z.object({ loan_number: z.string().trim().min(1).max(50), product_name: z.string().trim().min(1).max(200),
      borrower_name: z.string().trim().min(1).max(200), principal: z.number().positive().max(1e15),
      interest_rate: z.number().min(0).max(100), interest_method: z.enum(['flat','reducing_balance','compound']).optional(),
      term_months: z.number().int().positive().max(600), currency: z.string().max(3).optional(),
      collateral_desc: z.string().max(2000).optional(), guarantor_name: z.string().max(200).optional(),
    }).parse(request.body);
    return reply.status(201).send(await createLoan(request.user.tenant_id, request.user.sub, id, input));
  });
  server.post('/:id/loan/:loanId/schedule', { preHandler: writers }, async (request, reply) => {
    const { loanId } = z.object({ id: z.string().uuid(), loanId: z.string().uuid() }).parse(request.params);
    return reply.status(201).send(await generateLoanSchedule(request.user.tenant_id, loanId));
  });
  server.post('/:id/loan/:loanId/repayment', { preHandler: writers }, async (request, reply) => {
    const { loanId } = z.object({ id: z.string().uuid(), loanId: z.string().uuid() }).parse(request.params);
    const input = z.object({ amount: z.number().positive().max(1e15),
      payment_date: day.optional(), payment_method: z.string().max(50).optional(),
      reference: z.string().max(100).optional(),
    }).parse(request.body);
    return reply.status(201).send(await recordLoanRepayment(request.user.tenant_id, request.user.sub, loanId, input));
  });

  // ═══════ HOSPITALITY / ACCOMMODATION ═══════
  server.post('/rooms', { preHandler: writers }, async (request, reply) => {
    const input = z.object({ room_number: z.string().trim().min(1).max(20),
      room_type: z.enum(['single','double','twin','suite','deluxe','family','dormitory','conference']),
      floor: z.string().max(10).optional(), capacity: z.number().int().positive().max(100).optional(),
      rate_per_night: z.number().min(0).max(1e12), currency: z.string().max(3).optional(),
      amenities: z.array(z.string().max(50)).max(20).optional(), notes: z.string().max(2000).optional(),
    }).parse(request.body);
    return reply.status(201).send(await createRoom(request.user.tenant_id, input));
  });
  server.get('/rooms', async request => listRooms(request.user.tenant_id, (request.query as any).status));

  server.post('/:id/reservation', { preHandler: writers }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const input = z.object({ room_id: z.string().uuid(), guest_name: z.string().trim().min(1).max(200),
      guest_contact: z.string().max(200).optional(), guest_count: z.number().int().positive().max(50).optional(),
      check_in: day, check_out: day, rate_per_night: z.number().min(0).max(1e12),
      deposit_amount: z.number().min(0).max(1e12).optional(),
    }).parse(request.body);
    return reply.status(201).send(await createReservation(request.user.tenant_id, request.user.sub, id, input));
  });
  server.post('/:id/reservation/:resId/check-in', { preHandler: writers }, async request => {
    const { resId } = z.object({ id: z.string().uuid(), resId: z.string().uuid() }).parse(request.params);
    return checkInGuest(request.user.tenant_id, resId);
  });
  server.post('/:id/reservation/:resId/check-out', { preHandler: writers }, async request => {
    const { resId } = z.object({ id: z.string().uuid(), resId: z.string().uuid() }).parse(request.params);
    return checkOutGuest(request.user.tenant_id, resId);
  });
  server.post('/:id/reservation/:resId/charge', { preHandler: writers }, async (request, reply) => {
    const { resId } = z.object({ id: z.string().uuid(), resId: z.string().uuid() }).parse(request.params);
    const input = z.object({ charge_type: z.enum(['room','minibar','restaurant','laundry','spa','parking','telephone','other']),
      description: z.string().trim().min(1).max(500), amount: z.number().positive().max(1e12), charge_date: day,
    }).parse(request.body);
    return reply.status(201).send(await addFolioCharge(request.user.tenant_id, resId, input));
  });

  // ═══════ EDUCATION ═══════
  server.post('/students', { preHandler: writers }, async (request, reply) => {
    const input = z.object({ student_number: z.string().trim().min(1).max(50),
      first_name: z.string().trim().min(1).max(100), last_name: z.string().trim().min(1).max(100),
      date_of_birth: day.optional(), gender: z.enum(['male','female','other']).optional(),
      guardian_name: z.string().max(200).optional(), guardian_phone: z.string().max(50).optional(),
      guardian_email: z.string().email().optional(), customer_id: z.string().uuid().optional(),
      enrollment_date: day.optional(), notes: z.string().max(2000).optional(),
    }).parse(request.body);
    return reply.status(201).send(await registerStudent(request.user.tenant_id, input));
  });
  server.get('/students', async request => listStudents(request.user.tenant_id, (request.query as any).status));

  server.post('/fee-structures', { preHandler: writers }, async (request, reply) => {
    const input = z.object({ name: z.string().trim().min(1).max(200),
      programme: z.string().trim().min(1).max(200), academic_year: z.string().trim().min(1).max(20),
      term: z.string().trim().min(1).max(50),
      tuition: z.number().min(0).max(1e12).optional(), boarding: z.number().min(0).max(1e12).optional(),
      transport: z.number().min(0).max(1e12).optional(), other_fees: z.number().min(0).max(1e12).optional(),
      currency: z.string().max(3).optional(), due_date: day.optional(),
    }).parse(request.body);
    return reply.status(201).send(await createFeeStructure(request.user.tenant_id, input));
  });

  server.post('/:id/enrollment', { preHandler: writers }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const input = z.object({ student_id: z.string().uuid(), fee_structure_id: z.string().uuid(),
      scholarship_pct: z.number().min(0).max(100).optional(),
    }).parse(request.body);
    return reply.status(201).send(await enrollStudent(request.user.tenant_id, request.user.sub, id, input));
  });
}
