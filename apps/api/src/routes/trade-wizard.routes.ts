import type { FastifyInstance } from 'fastify';
import { requireEntitlement } from '../middleware/entitlement.js';
import { tradeWizardService } from '../services/tradeWizard.service.js';
import { getTradeWizardUsageSummary } from '../lib/tradeWizardUsage.js';
import { db } from '../db/client.js';

export async function tradeWizardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  fastify.get('/procedures/search', async (request) => {
    const { q, kind } = request.query as { q?: string; kind?: string };
    const results = await tradeWizardService.searchProcedures(q ?? '', kind);
    // Fire-and-forget: don't let analytics logging slow down the search response.
    tradeWizardService.logSearch(request.user.tenant_id, request.user.sub, q ?? '', kind ?? null, results.length).catch(() => {});
    return results;
  });

  fastify.get('/procedures/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = await tradeWizardService.getProcedureDetail(id);
    if (!detail) return reply.status(404).send({ error: 'Procedure not found' });
    return detail;
  });

  fastify.post('/run', async (request, reply) => {
    const body = request.body as { procedure_id?: string; answers?: Record<string, string> };
    if (!body.procedure_id) return reply.status(400).send({ error: 'procedure_id is required' });
    const result = await tradeWizardService.runWizard(
      request.user.tenant_id, request.user.sub, request.user.role, body.procedure_id, body.answers ?? {}
    );
    if (!result.ok) {
      if (result.gate) return reply.status(429).send({ error: result.gate.message, code: 'QUOTA_EXCEEDED', usage: { used: result.gate.used, limit: result.gate.limit } });
      return reply.status(404).send({ error: result.error });
    }
    return result;
  });

  fastify.get('/usage', async (request) => {
    return getTradeWizardUsageSummary(request.user.tenant_id);
  });

  fastify.get('/consultation-product', async (request) => {
    return tradeWizardService.getOrCreateConsultationProduct(request.user.tenant_id);
  });

  // ── GET /v1/customs/trade-wizard/history ─────────────────────────────────────
  // This tenant's own recent completed wizard runs (not the cross-tenant
  // SuperAdmin analytics view) — powers the Compliance Overview tab.
  fastify.get('/history', async (request) => {
    return db.selectFrom('trade_wizard_runs')
      .innerJoin('trade_procedures', 'trade_procedures.id', 'trade_wizard_runs.procedure_id')
      .select([
        'trade_wizard_runs.id', 'trade_wizard_runs.created_at', 'trade_wizard_runs.procedure_id',
        'trade_procedures.name as procedure_name', 'trade_procedures.kind as procedure_kind',
      ])
      .where('trade_wizard_runs.tenant_id', '=', request.user.tenant_id)
      .orderBy('trade_wizard_runs.created_at', 'desc')
      .limit(20)
      .execute();
  });
}
