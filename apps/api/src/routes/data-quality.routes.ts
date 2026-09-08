import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { runDataQualityChecks, getLatestFindings } from '../services/data-quality.service.js';

/** SUPER_ADMIN-only platform-ops surface — same gating shape as
 *  superadmin-reports.routes.ts. Data quality is an engineering concern
 *  about the platform's own event/metric pipeline, not tenant data a
 *  tenant admin manages, so this sits beside Reports/Query Builder/
 *  Intelligence in HuduBI's "PLATFORM · SUPER ADMIN" section rather than
 *  under the tenant-facing /v1/metrics prefix. */
export async function dataQualityRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  // GET /v1/superadmin/data-quality/findings — the latest run's results.
  fastify.get('/findings', async () => ({ data: await getLatestFindings() }));

  // POST /v1/superadmin/data-quality/run — runs every check now (the
  // scheduled job, data-quality.job.ts, does the same thing nightly).
  fastify.post('/run', async () => runDataQualityChecks());
}
