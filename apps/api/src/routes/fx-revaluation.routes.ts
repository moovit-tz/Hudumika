import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { computeAndPostFxRevaluation } from '../services/fx-revaluation.service.js';

const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;

/** Period-end FX revaluation (M7 of the corporate-tax build-out) — see
 * fx-revaluation.service.ts's own header for the exact scope and the
 * comparison-rate correctness rule this exists to satisfy. */
export async function fxRevaluationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async (request) => {
    const user = request.user;
    const { subject_id } = request.query as { subject_id?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('fx_revaluations').selectAll().where('tenant_id', '=', user.tenant_id);
      if (subject_id) q = q.where('subject_id', '=', subject_id);
      return q.orderBy('period_date', 'desc').execute();
    });
  });

  // POST /v1/fx-revaluations/run — revalues every open foreign-currency
  // invoice/bill as of the given date. Safe to call repeatedly, including
  // for the same date (an unchanged rate posts no new movement).
  fastify.post('/run', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { period_date } = z.object({ period_date: z.string() }).parse(request.body);
    try {
      return await computeAndPostFxRevaluation(user.tenant_id, period_date, user.sub);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
