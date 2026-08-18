import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import { dbPlatform } from '../db/client.js';
import { METRICS, runMetric, type MetricFilters } from '../services/reports.service.js';

// filters is a genuinely dynamic, per-metric shape (see MetricFilters) —
// shape-guarded as a record, not enumerated field-by-field.
const runReportSchema = z.object({
  app_id: z.string().max(50),
  metric_key: z.string().trim().min(1),
  filters: z.record(z.string(), z.any()).optional(),
  report_definition_id: z.string().optional(),
});
const definitionCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  app_id: z.string().max(50),
  metric_key: z.string().trim().min(1),
  filters: z.record(z.string(), z.any()).optional(),
});

export async function superAdminReportsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  // GET /v1/superadmin/reports/metrics — the registry, so the frontend rail
  // builds itself instead of hardcoding the app/metric list twice.
  fastify.get('/metrics', async () => METRICS);

  // POST /v1/superadmin/reports/run — executes a metric, records the run.
  fastify.post('/run', async (request, reply) => {
    const actor = request.user;
    const body = runReportSchema.parse(request.body);

    const started = Date.now();
    let rows: Awaited<ReturnType<typeof runMetric>> = [];
    let status = 'succeeded';
    let error: string | null = null;
    try {
      rows = await runMetric(body.metric_key, body.filters || {});
    } catch (err: any) {
      status = 'failed';
      error = err?.message || 'Query failed';
    }
    const duration_ms = Date.now() - started;

    const run = await dbPlatform.insertInto('report_runs').values({
      report_definition_id: body.report_definition_id || null,
      app_id: body.app_id,
      metric_key: body.metric_key,
      filters: JSON.stringify(body.filters || {}) as any,
      status,
      row_count: rows.length,
      duration_ms,
      run_by: actor.sub,
      error,
    }).returningAll().executeTakeFirstOrThrow();

    if (status === 'failed') return reply.status(500).send({ error, run_id: run.id });
    return { rows, run_id: run.id };
  });

  // GET /v1/superadmin/reports/runs — run history (Query Observability style)
  fastify.get('/runs', async (request) => {
    const { limit = '50' } = request.query as { limit?: string };
    return dbPlatform.selectFrom('report_runs')
      .leftJoin('report_definitions', 'report_definitions.id', 'report_runs.report_definition_id')
      .leftJoin('users', 'users.id', 'report_runs.run_by')
      .select([
        'report_runs.id', 'report_runs.app_id', 'report_runs.metric_key', 'report_runs.filters',
        'report_runs.status', 'report_runs.row_count', 'report_runs.duration_ms', 'report_runs.started_at',
        'report_runs.error',
        'report_definitions.name as report_name',
        'users.name as run_by_name',
      ])
      .orderBy('report_runs.started_at', 'desc')
      .limit(parseInt(limit, 10) || 50)
      .execute();
  });

  // ── Saved report definitions ──────────────────────────────────────────
  fastify.get('/definitions', async () => {
    return dbPlatform.selectFrom('report_definitions').selectAll().orderBy('created_at', 'desc').execute();
  });

  fastify.post('/definitions', async (request, reply) => {
    const actor = request.user;
    const body = definitionCreateSchema.parse(request.body);
    const def = await dbPlatform.insertInto('report_definitions').values({
      name: body.name,
      app_id: body.app_id,
      metric_key: body.metric_key,
      filters: JSON.stringify(body.filters || {}) as any,
      created_by: actor.sub,
    }).returningAll().executeTakeFirstOrThrow();
    return def;
  });

  fastify.delete('/definitions/:id', async (request) => {
    const { id } = request.params as { id: string };
    await dbPlatform.deleteFrom('report_definitions').where('id', '=', id).execute();
    return { success: true };
  });
}
