import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { sql } from 'kysely';
import { requireRole } from '../middleware/rbac.js';
import { db } from '../db/client.js';
import { EmailIntegration } from '../integrations/email.js';
import { ALLOWED_TABLES } from '../services/queryBuilderSchema.js';
import { runVisualQuery, runRawQuery, type VisualQueryParams } from '../services/queryBuilder.service.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// In-memory, single-use, 5-minute TTL — mirrors auth.routes.ts's customer
// OTP_STORE shape, but this gates a real platform privilege (enabling raw
// SQL access), so there's deliberately no dev-mode bypass code path here.
const RAW_SQL_OTP_STORE = new Map<string, { code: string; expiresAt: number }>();

async function readSettings(): Promise<Record<string, any>> {
  const row = await db.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID)
    .executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  return settings['query-builder'] || {};
}

async function writeSettings(patch: Record<string, any>): Promise<Record<string, any>> {
  const row = await db.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID)
    .executeTakeFirst();
  const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  const existingQb = existing['query-builder'] || {};
  const merged = { ...existingQb, ...patch };
  const patchJson = JSON.stringify({ 'query-builder': merged });

  const exists = await db.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
  if (exists) {
    await sql`UPDATE tenant_settings SET settings = settings || ${patchJson}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(db);
  } else {
    await db.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patchJson }).execute();
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
    await EmailIntegration.sendEmail({
      to: actor.email,
      subject: 'Hudumika — code to enable raw SQL mode',
      bodyHtml: `<p>Your code to enable raw SQL access in the Query Builder is:</p><h2>${code}</h2><p>This code expires in 5 minutes. If you didn't request this, you can ignore it — raw SQL mode stays off.</p>`,
    });
    return { success: true };
  });

  fastify.post('/raw-sql/verify-otp', async (request, reply) => {
    const actor = request.user;
    const { code } = request.body as { code: string };
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
    const body = request.body as VisualQueryParams;
    if (!body.table || !Array.isArray(body.columns)) {
      return reply.status(400).send({ error: 'table and columns are required' });
    }

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

    await db.insertInto('query_builder_runs').values({
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
    const { sql: sqlText } = request.body as { sql: string };
    if (!sqlText?.trim()) return reply.status(400).send({ error: 'sql is required' });

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

    await db.insertInto('query_builder_runs').values({
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
    return db.selectFrom('query_builder_runs')
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
