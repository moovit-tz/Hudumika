import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { RenewalFinanceService } from '../services/renewal-finance.service.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const id = z.string().uuid();
const currency = z.string().regex(/^[A-Z]{3}$/);
const amount = z.number().finite().nonnegative().max(1e12);
const costSchema = z.object({
  cycle_id: id, cert_id: id.optional(), entity_id: id.optional(), site_id: id.optional(),
  category: z.enum(['authority_application','authority_renewal','inspection','late_penalty','agent_fee','translation','document','travel','platform_charge','other']),
  description: z.string().trim().min(1).max(1000),
  currency: currency.optional(), quantity: amount.positive().optional(), unit_price: amount, tax_amount: amount.optional(),
  payee_type: z.enum(['authority','agent','provider','other']).optional(), payee_name: z.string().max(300).optional(),
  source_type: z.enum(['fee_definition','authority_assessment','agent_quotation','manual_estimate','invoice','other']).optional(),
  source_ref: z.string().max(1000).optional(), assessment_date: z.string().date().optional(), due_date: z.string().date().optional(), notes: z.string().max(4000).optional(),
}).strict();
const budgetSchema = z.object({cycle_id: id, currency: currency.optional(), approved_amount: amount, reason: z.string().trim().min(1).max(2000), allocated_lines: z.array(z.unknown()).max(1000).optional()}).strict();
const allocationSchema = z.object({cycle_id: id, cost_line_id: id, allocation_type: z.enum(['bill','payment']),
  finance_record_type: z.enum(['supplier_bill','bill_payment']), finance_record_id: id, amount: amount.positive(),
  currency: currency.optional(), notes: z.string().max(2000).optional(),
}).strict();

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'Admin role required' });
    return;
  }
  done();
}

export async function renewalFinanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('complyos'));
  fastify.addHook('preValidation', async request => {
    const params = request.params as Record<string, unknown>;
    for (const value of Object.values(params ?? {})) id.parse(value);
    const q = request.query as Record<string, unknown>;
    if (q.currency !== undefined) currency.parse(q.currency);
    if (q.entity_id !== undefined) id.parse(q.entity_id);
    if (q.site_id !== undefined) id.parse(q.site_id);
  });
  fastify.get('/finance-records', {preHandler: requireAdmin}, async request => {
    const q = z.object({currency: currency.default('TZS'), search: z.string().max(100).default('')}).parse(request.query);
    return RenewalFinanceService.listFinanceRecords(request.user!.tenant_id, q.currency, q.search);
  });

  // ── Cost lines ───────────────────────────────────────────────────────

  fastify.get('/cycles/:cycleId/cost-lines', { preHandler: requireAdmin }, async (request) => {
    const { cycleId } = request.params as { cycleId: string };
    return RenewalFinanceService.listCostLines(request.user!.tenant_id, cycleId);
  });

  fastify.post('/cost-lines', { preHandler: requireAdmin }, async (request) => {
    const body = costSchema.parse(request.body);
    return RenewalFinanceService.createCostLine(request.user!.tenant_id, request.user!.sub, body);
  });

  fastify.patch('/cost-lines/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = costSchema.omit({cycle_id:true, cert_id:true, entity_id:true, site_id:true}).partial().parse(request.body);
    return RenewalFinanceService.updateCostLine(request.user!.tenant_id, request.user!.sub, id, body);
  });

  fastify.delete('/cost-lines/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await RenewalFinanceService.deleteCostLine(request.user!.tenant_id, request.user!.sub, id);
      return { ok: true };
    } catch (err: any) {
      if (err.message?.includes('existing finance allocations')) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // ── Budgets ──────────────────────────────────────────────────────────

  fastify.get('/cycles/:cycleId/budgets', { preHandler: requireAdmin }, async (request) => {
    const { cycleId } = request.params as { cycleId: string };
    return RenewalFinanceService.listBudgets(request.user!.tenant_id, cycleId);
  });

  fastify.post('/budgets', { preHandler: requireAdmin }, async (request) => {
    const body = budgetSchema.parse(request.body);
    return RenewalFinanceService.createBudget(request.user!.tenant_id, request.user!.sub, body);
  });

  fastify.post('/budgets/:id/approve', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({approved: z.boolean(), rejection_reason: z.string().max(2000).optional()}).strict().parse(request.body);
    try {
      return await RenewalFinanceService.approveBudget(request.user!.tenant_id, id, request.user!.sub, body);
    } catch (err: any) {
      if (err.message?.includes('not pending_approval') || err.message?.includes('cannot approve their own')) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // ── Allocations ──────────────────────────────────────────────────────

  fastify.get('/cycles/:cycleId/allocations', { preHandler: requireAdmin }, async (request) => {
    const { cycleId } = request.params as { cycleId: string };
    return RenewalFinanceService.listAllocations(request.user!.tenant_id, cycleId);
  });

  fastify.post('/allocations', { preHandler: requireAdmin }, async (request, reply) => {
    const body = allocationSchema.parse(request.body);
    try {
      return await RenewalFinanceService.createAllocation(request.user!.tenant_id, request.user!.sub, body);
    } catch (err: any) {
      if (err.message?.includes('Over-allocation')) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // ── Overview & register ──────────────────────────────────────────────

  fastify.get('/overview', { preHandler: requireAdmin }, async (request) => {
    const { currency } = request.query as { currency?: string };
    return RenewalFinanceService.getOverview(request.user!.tenant_id, currency);
  });

  fastify.get('/register', { preHandler: requireAdmin }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return RenewalFinanceService.getCycleRegister(request.user!.tenant_id, {
      currency: query.currency,
      entity_id: query.entity_id,
      site_id: query.site_id,
      jurisdiction: query.jurisdiction,
      agency_code: query.agency_code,
      status: query.status,
    });
  });

  // ── Forecasts ────────────────────────────────────────────────────────

  fastify.post('/forecasts/snapshot', { preHandler: requireAdmin }, async (request) => {
    const { currency } = request.body as { currency?: string };
    return RenewalFinanceService.saveForecastSnapshot(request.user!.tenant_id, currency);
  });

  fastify.get('/forecasts', { preHandler: requireAdmin }, async (request) => {
    const { currency } = request.query as { currency?: string };
    return RenewalFinanceService.listForecasts(request.user!.tenant_id, currency);
  });

  // ── Audit trail ──────────────────────────────────────────────────────

  fastify.get('/cycles/:cycleId/audit', { preHandler: requireAdmin }, async (request) => {
    const { cycleId } = request.params as { cycleId: string };
    return RenewalFinanceService.getAuditTrail(request.user!.tenant_id, cycleId);
  });
}
