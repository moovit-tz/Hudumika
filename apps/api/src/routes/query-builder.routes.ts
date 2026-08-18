import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { sql } from 'kysely';
import { requireRole } from '../middleware/rbac.js';
import { dbPlatform } from '../db/client.js';
import { MailService } from '../services/mail.service.js';
import { ALLOWED_TABLES } from '../services/queryBuilderSchema.js';
import { runVisualQuery, runRawQuery, type VisualQueryParams } from '../services/queryBuilder.service.js';

const otpVerifySchema = z.object({ code: z.string().trim().min(1) });
// Shape-guarded only — runVisualQuery's own findAllowedTable/isAllowedColumn
// check is the real authorization boundary (every identifier is checked
// against a hardcoded allowlist before reaching sql.ref/sql.table; filter
// values are always parameterized). This just ensures the JS types are what
// the service expects before it gets there.
const visualQuerySchema = z.object({
  table: z.string().min(1),
  columns: z.array(z.string()),
  filters: z.array(z.object({
    column: z.string(),
    operator: z.enum(['=', '!=', '>', '<', 'contains', 'is_null', 'is_not_null']),
    value: z.string().optional(),
  })).optional(),
  tenant_id: z.string().optional(),
  group_by: z.string().optional(),
  aggregate: z.object({ fn: z.enum(['count', 'sum']), column: z.string().optional() }).optional(),
  order_by: z.object({ column: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
  limit: z.number().int().positive().optional(),
});
const rawRunSchema = z.object({ sql: z.string().trim().min(1) });

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// In-memory, single-use, 5-minute TTL — mirrors auth.routes.ts's customer
// OTP_STORE shape, but this gates a real platform privilege (enabling raw
// SQL access), so there's deliberately no dev-mode bypass code path here.
const RAW_SQL_OTP_STORE = new Map<string, { code: string; expiresAt: number }>();

async function readSettings(): Promise<Record<string, any>> {
  const row = await dbPlatform.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID)
    .executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  return settings['query-builder'] || {};
}

async function writeSettings(patch: Record<string, any>): Promise<Record<string, any>> {
  const row = await dbPlatform.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID)
    .executeTakeFirst();
  const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  const existingQb = existing['query-builder'] || {};
  const merged = { ...existingQb, ...patch };
  const patchJson = JSON.stringify({ 'query-builder': merged });

  const exists = await dbPlatform.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
  if (exists) {
    await sql`UPDATE tenant_settings SET settings = settings || ${patchJson}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(dbPlatform);
  } else {
    await dbPlatform.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patchJson }).execute();
  }
  return merged;
}

export async function queryBuilderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  // GET /v1/superadmin/query-builder/schema — the allowlist, so the
  // frontend's table/column pickers stay in sync with the real boundary.
  fastify.get('/schema', async () => ALLOWED_TABLES);

  fastify.get('/settings', async () => {
    const settings = await readSettings();
    return { raw_sql_enabled: !!settings.raw_sql_enabled };
  });

  fastify.post('/raw-sql/request-otp', async (request) => {
    const actor = request.user;
    const code = String(crypto.randomInt(100000, 999999));
    RAW_SQL_OTP_STORE.set(actor.sub, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
    // tenantId was previously omitted here, so this always fell through to
    // the global system-default mailer regardless of the actor's own
    // tenant's SMTP config — fixed as part of routing this through the
    // shared template system. Sent synchronously (not the async outbox):
    // this is a 5-minute-expiry OTP, so a queue's ~60s poll latency eats a
    // real chunk of that window, and a durable retry is worthless once the
    // code is already stale — the user just requests a new one instead.
    await MailService.sendNowTemplated(actor.tenant_id, 'admin.raw_sql_otp', actor.email, { code }, 'query-builder');
    return { success: true };
  });

  fastify.post('/raw-sql/verify-otp', async (request, reply) => {
    const actor = request.user;
    const { code } = otpVerifySchema.parse(request.body);
    const record = RAW_SQL_OTP_STORE.get(actor.sub);
    if (!record || record.expiresAt < Date.now()) {
      return reply.status(400).send({ error: 'Code expired or not requested — request a new one' });
    }
    if (record.code !== code) {
      return reply.status(400).send({ error: 'Incorrect code' });
    }
    RAW_SQL_OTP_STORE.delete(actor.sub); // consume — single use
    const settings = await writeSettings({ raw_sql_enabled: true, raw_sql_enabled_by: actor.sub, raw_sql_enabled_at: new Date().toISOString() });
    return { raw_sql_enabled: !!settings.raw_sql_enabled };
  });

  fastify.post('/raw-sql/disable', async () => {
    // No OTP needed to turn off — only enabling is the risky direction.
    const settings = await writeSettings({ raw_sql_enabled: false });
    return { raw_sql_enabled: !!settings.raw_sql_enabled };
  });

  fastify.post('/run', async (request, reply) => {
    const actor = request.user;
    const body = visualQuerySchema.parse(request.body) as VisualQueryParams;

    const started = Date.now();
    let rows: any[] = [];
    let generated_sql = '';
    let status = 'succeeded';
    let error: string | null = null;
    try {
      const result = await runVisualQuery(body);
      rows = result.rows;
      generated_sql = result.generated_sql;
    } catch (err: any) {
      status = 'failed';
      error = err?.message || 'Query failed';
    }
    const duration_ms = Date.now() - started;

    await dbPlatform.insertInto('query_builder_runs').values({
      mode: 'visual',
      table_name: body.table,
      columns: JSON.stringify(body.columns) as any,
      filters: JSON.stringify({ filters: body.filters, tenant_id: body.tenant_id, group_by: body.group_by }) as any,
      raw_sql: null,
      status,
      row_count: rows.length,
      duration_ms,
      run_by: actor.sub,
      error,
    }).execute();

    if (status === 'failed') return reply.status(400).send({ error });
    return { rows, generated_sql };
  });

  fastify.post('/raw-run', async (request, reply) => {
    const actor = request.user;
    const settings = await readSettings();
    if (!settings.raw_sql_enabled) {
      return reply.status(403).send({ error: 'Raw SQL mode is disabled' });
    }
    const { sql: sqlText } = rawRunSchema.parse(request.body);

    const started = Date.now();
    let rows: any[] = [];
    let generated_sql = '';
    let status = 'succeeded';
    let error: string | null = null;
    try {
      const result = await runRawQuery(sqlText);
      rows = result.rows;
      generated_sql = result.generated_sql;
    } catch (err: any) {
      status = 'failed';
      error = err?.message || 'Query failed';
    }
    const duration_ms = Date.now() - started;

    await dbPlatform.insertInto('query_builder_runs').values({
      mode: 'raw',
      table_name: null,
      columns: null,
      filters: null,
      raw_sql: sqlText,
      status,
      row_count: rows.length,
      duration_ms,
      run_by: actor.sub,
      error,
    }).execute();

    if (status === 'failed') return reply.status(400).send({ error });
    return { rows, generated_sql };
  });

  fastify.get('/runs', async (request) => {
    const { limit = '50' } = request.query as { limit?: string };
    return dbPlatform.selectFrom('query_builder_runs')
      .leftJoin('users', 'users.id', 'query_builder_runs.run_by')
      .select([
        'query_builder_runs.id', 'query_builder_runs.mode', 'query_builder_runs.table_name',
        'query_builder_runs.status', 'query_builder_runs.row_count', 'query_builder_runs.duration_ms',
        'query_builder_runs.started_at', 'query_builder_runs.error',
        'users.name as run_by_name',
      ])
      .orderBy('query_builder_runs.started_at', 'desc')
      .limit(parseInt(limit, 10) || 50)
      .execute();
  });
}
