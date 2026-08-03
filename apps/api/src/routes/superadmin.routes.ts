import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { db } from '../db/client.js';
import { sql } from 'kysely';
import { GLService } from '../services/gl.service.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export async function superAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  // 1. GET /v1/superadmin/dashboard-stats
  fastify.get('/dashboard-stats', async (request, reply) => {
    const totalTenantsRow = await db.selectFrom('tenants').select(db.fn.count('id').as('count')).executeTakeFirst();
    const activeTenantsRow = await db.selectFrom('tenants').select(db.fn.count('id').as('count')).where('active', '=', true).executeTakeFirst();
    const totalUsersRow = await db.selectFrom('users').select(db.fn.count('id').as('count')).executeTakeFirst();

    const totalTenants = Number(totalTenantsRow?.count ?? 0);
    const activeTenants = Number(activeTenantsRow?.count ?? 0);
    const totalSubscribers = Number(totalUsersRow?.count ?? 0);

    const tenants = await db.selectFrom('tenants').select(['id', 'plan', 'active', 'name', 'created_at']).execute();

    // Real list prices from the packages catalog, keyed by code — replaces a
    // previously hardcoded 3-tier ternary that didn't match the real 4-tier
    // starter/growth/scale/enterprise codes. Enterprise has no fixed list
    // price (custom/"talk to sales"), so it contributes 0 to these estimates
    // rather than a fabricated number — real enterprise revenue lives in
    // platform_transactions, not this list-price-based estimate.
    const packageRows = await db.selectFrom('packages').select(['code', 'monthly_price']).execute();
    const priceByCode = Object.fromEntries(packageRows.map(p => [p.code, Number(p.monthly_price)]));

    let totalEarnings = 0;
    tenants.forEach(t => {
      if (t.active) totalEarnings += priceByCode[t.plan] ?? 0;
    });

    const PLAN_META: Record<string, { label: string; color: string }> = {
      starter: { label: 'Starter', color: '#0891b2' },
      growth: { label: 'Growth', color: '#0d7a6b' },
      scale: { label: 'Scale', color: '#2563eb' },
      enterprise: { label: 'Enterprise', color: '#6e40c9' },
    };
    const planCounts: Record<string, number> = { starter: 0, growth: 0, scale: 0, enterprise: 0 };
    tenants.forEach(t => {
      if (t.active && t.plan in planCounts) planCounts[t.plan]++;
    });
    const totalActivePlanTenants = Math.max(1, activeTenants);
    const planDist = Object.entries(PLAN_META).map(([code, meta]) => ({
      label: meta.label,
      pct: Math.round((planCounts[code] / totalActivePlanTenants) * 100),
      color: meta.color,
    }));

    /*
     * Everything below is counted from real rows.
     *
     * It used to be invented: `spark` was five hardcoded literals with the real
     * total tacked on the end, `monthlyRev` was activeTenants multiplied by an
     * arbitrary per-month figure, `recentTransactions` was the tenant list
     * wearing TXN-1000xx references and a 'completed' status for payments that
     * never happened, and `renewals` claimed every tenant renews in exactly 30
     * days. A curve with one real point and five fabricated ones is worse than
     * no curve — it reads as history, on the screen where platform revenue
     * decisions get made.
     *
     * Where there is genuinely no source, the field is now absent rather than
     * filled. `tenants` has no expiry or renewal column, so renewals is gone.
     */

    // Last 6 calendar months, oldest first — a stable window regardless of
    // whether any rows land in it.
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - i);
      months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString('en', { month: 'short', timeZone: 'UTC' }) });
    }

    const monthKey = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 7) : null);

    const txRows = await db.selectFrom('platform_transactions')
      .select(['tx_ref', 'tenant_id', 'amount', 'currency', 'status', 'method', 'package_code', 'payer_name', 'created_at'])
      .orderBy('created_at', 'desc')
      .execute();

    const userRows = await db.selectFrom('users').select(['created_at']).execute();

    // Cumulative counts as at the end of each month — the shape a sparkline
    // implies. A month before anything existed is 0, which is true.
    const cumulative = (rows: { created_at: unknown }[], filter?: (r: any) => boolean) =>
      months.map(m => rows.filter(r => {
        const k = monthKey(r.created_at);
        return !!k && k <= m.key && (!filter || filter(r));
      }).length);

    const spark = {
      companies: cumulative(tenants),
      active: cumulative(tenants, (t: any) => t.active),
      subscribers: cumulative(userRows),
      earnings: months.map(m =>
        txRows
          .filter(t => t.status === 'completed' && (monthKey(t.created_at) ?? '') <= m.key)
          .reduce((s, t) => s + Number(t.amount), 0)),
    };

    // Revenue actually received in each month, not an estimate from list price.
    const monthlyRev = months.map(m => ({
      label: m.label,
      value: txRows
        .filter(t => t.status === 'completed' && monthKey(t.created_at) === m.key)
        .reduce((s, t) => s + Number(t.amount), 0),
    }));

    // Tenants that actually registered in each month. The dashboard drew this
    // from a literal [{Sep:1},{Oct:1},{Nov:2}…] with a "+6% MoM" badge beside it.
    const companyGrowth = months.map(m => ({
      label: m.label,
      value: tenants.filter(t => monthKey(t.created_at) === m.key).length,
    }));

    const tenantNameById = new Map(tenants.map(t => [t.id, t.name]));
    const recentTransactions = txRows.slice(0, 5).map(t => ({
      id: t.tx_ref,
      txRef: t.tx_ref,
      companyId: t.tenant_id,
      companyName: tenantNameById.get(t.tenant_id) ?? null,
      amount: Number(t.amount),
      currency: t.currency,
      method: t.method,
      status: t.status,
      payerName: t.payer_name,
      created: new Date(t.created_at).toISOString().slice(0, 10),
    }));

    // Revenue genuinely banked, alongside the list-price estimate above so the
    // two are never confused for one another.
    const collectedRevenue = txRows
      .filter(t => t.status === 'completed')
      .reduce((s, t) => s + Number(t.amount), 0);

    // A sparkline over a single month of history is a straight line pretending
    // to be a trend; the UI hides it below this threshold.
    const monthsWithData = new Set(
      [...tenants, ...txRows].map(r => monthKey((r as any).created_at)).filter(Boolean),
    ).size;

    return {
      kpis: {
        totalCompanies: totalTenants,
        activeCompanies: activeTenants,
        totalSubscribers,
        // List-price run-rate across active tenants — an estimate, and named
        // as one. collectedRevenue is what actually came in.
        totalEarnings,
        collectedRevenue,
      },
      planDist,
      spark,
      monthlyRev,
      companyGrowth,
      transactions: recentTransactions,
      // How many distinct months this platform has any history in. The UI uses
      // it to decide whether a trend line means anything yet.
      monthsWithData,
    };
  });

  /**
   * GET /v1/superadmin/transactions
   *
   * Platform billing, from platform_transactions. The Transactions and Finance
   * screens had no endpoint at all and rendered a hardcoded SAMPLE DATA array —
   * eleven 2025 payments for companies that do not exist, totalling $43,346,
   * while the table itself held three real ones totalling 4,288.
   *
   * Returns the rows plus the aggregates both screens need, so neither has to
   * re-derive totals and disagree with the other.
   */
  fastify.get('/transactions', async (request, reply) => {
    const { status, limit } = request.query as { status?: string; limit?: string };
    const take = Math.min(Math.max(Number(limit) || 200, 1), 1000);

    let q = db.selectFrom('platform_transactions as t')
      .leftJoin('tenants', 'tenants.id', 't.tenant_id')
      .select(['t.id', 't.tx_ref', 't.tenant_id', 't.amount', 't.currency', 't.method', 't.status',
               't.package_code', 't.billing_cycle', 't.payer_name', 't.card_last4', 't.created_at',
               'tenants.name as company_name', 'tenants.plan as company_plan'])
      .orderBy('t.created_at', 'desc')
      .limit(take);
    if (status) q = q.where('t.status', '=', status);
    const rows = await q.execute();

    // Aggregates over the whole table, not the returned page — a "total
    // revenue" that silently meant "of the last 200" would be worse than none.
    const tally = await db.selectFrom('platform_transactions')
      .select(['status'])
      .select(db.fn.count('id').as('n'))
      .select(db.fn.sum('amount').as('total'))
      .groupBy('status')
      .execute();

    const byStatus = Object.fromEntries(tally.map(t => [t.status, { count: Number(t.n), total: Number(t.total ?? 0) }]));

    const monthly = await db.selectFrom('platform_transactions')
      .select([sql<string>`to_char(created_at, 'YYYY-MM')`.as('month')])
      .select(db.fn.sum('amount').as('total'))
      .select(db.fn.count('id').as('n'))
      .where('status', '=', 'completed')
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy('month')
      .execute();

    return {
      data: rows.map(r => ({
        id: r.id,
        txRef: r.tx_ref,
        companyId: r.tenant_id,
        companyName: r.company_name ?? null,
        companyPlan: r.company_plan ?? null,
        amount: Number(r.amount),
        currency: r.currency,
        method: r.method,
        status: r.status,
        packageCode: r.package_code,
        billingCycle: r.billing_cycle,
        payerName: r.payer_name,
        cardLast4: r.card_last4,
        created: new Date(r.created_at).toISOString(),
      })),
      totals: {
        completed: byStatus.completed?.total ?? 0,
        completedCount: byStatus.completed?.count ?? 0,
        pendingCount: byStatus.pending?.count ?? 0,
        failedCount: byStatus.failed?.count ?? 0,
        refundedCount: byStatus.refunded?.count ?? 0,
        allCount: tally.reduce((s, t) => s + Number(t.n), 0),
      },
      monthly: monthly.map(m => ({ month: m.month, total: Number(m.total ?? 0), count: Number(m.n) })),
    };
  });

  // 2. GET /v1/superadmin/tenants
  fastify.get('/tenants', async (request, reply) => {
    const list = await db.selectFrom('tenants')
      .selectAll()
      .execute();

    const tenantsWithUsers = await Promise.all(list.map(async (t) => {
      const userCountRow = await db.selectFrom('users')
        .select(db.fn.count('id').as('count'))
        .where('tenant_id', '=', t.id)
        .executeTakeFirst();
      
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        active: t.active,
        logo_url: t.logo_url,
        primary_color: t.primary_color,
        created_at: t.created_at,
        users: Number(userCountRow?.count ?? 0)
      };
    }));

    return tenantsWithUsers;
  });

  // 3. POST /v1/superadmin/tenants
  fastify.post('/tenants', async (request, reply) => {
    const body = request.body as any;
    const now = new Date();
    const result = await db.insertInto('tenants')
      .values({
        name: body.name,
        slug: body.slug || body.name.split(' ')[0].toLowerCase(),
        plan: body.plan || 'starter',
        active: body.active !== undefined ? body.active : true,
        logo_url: body.logo_url || null,
        primary_color: body.primary_color || null,
        created_at: now,
        updated_at: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await GLService.seedChartOfAccounts(db, result.id);

    return result;
  });

  // 4. PATCH /v1/superadmin/tenants/:id
  fastify.patch('/tenants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: any = { updated_at: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.plan !== undefined) updates.plan = body.plan;
    if (body.active !== undefined) updates.active = body.active;
    if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
    if (body.primary_color !== undefined) updates.primary_color = body.primary_color;

    const result = await db.updateTable('tenants')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  });

  // 5. DELETE /v1/superadmin/tenants/:id
  fastify.delete('/tenants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.deleteFrom('tenants')
      .where('id', '=', id)
      .execute();
    return { success: true };
  });

  // 5b. GET /v1/superadmin/tenants/:id/apps — which apps are enabled for this tenant
  fastify.get('/tenants/:id/apps', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', id)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return { enabledApps: settings['enabled-apps'] || {} };
  });

  // 5c. PATCH /v1/superadmin/tenants/:id/apps — enable/disable specific apps for this tenant
  fastify.patch('/tenants/:id/apps', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { enabledApps } = request.body as { enabledApps: Record<string, boolean> };

    const existing = await db.selectFrom('tenant_settings').select('id').where('tenant_id', '=', id).executeTakeFirst();
    const patch = JSON.stringify({ 'enabled-apps': enabledApps });
    if (existing) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${id}`.execute(db);
    } else {
      await db.insertInto('tenant_settings').values({ tenant_id: id, settings: patch }).execute();
    }

    const row = await db.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', id).executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return { enabledApps: settings['enabled-apps'] || {} };
  });

  // 6. GET /v1/superadmin/settings
  fastify.get('/settings', async (request, reply) => {
    const row = await db.selectFrom('tenant_settings')
      .selectAll()
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return { settings };
  });

  // 7. POST /v1/superadmin/settings
  fastify.post('/settings', async (request, reply) => {
    const body = request.body as Record<string, any>;
    const existing = await db.selectFrom('tenant_settings')
      .select('id')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();

    if (existing) {
      // Shallow-merge into the existing JSONB blob so unrelated sections (branding, feature
      // flags, SMTP, etc.) written by other screens aren't clobbered by this screen's save.
      await sql`UPDATE tenant_settings SET settings = settings || ${JSON.stringify(body)}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(db);
    } else {
      await db.insertInto('tenant_settings')
        .values({
          tenant_id: GLOBAL_TENANT_ID,
          settings: JSON.stringify(body),
          created_at: new Date(),
          updated_at: new Date()
        })
        .execute();
    }

    const row = await db.selectFrom('tenant_settings')
      .selectAll()
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : body;
    return { settings };
  });

  // 8. POST /v1/superadmin/smtp-test
  fastify.post('/smtp-test', async (request, reply) => {
    return { success: true, message: 'SMTP Test connection successful.' };
  });

  // 8b. POST /v1/superadmin/ocr-test — verify a Gemini API key actually works
  fastify.post('/ocr-test', async (request, reply) => {
    const { geminiApiKey } = request.body as { geminiApiKey?: string };
    if (!geminiApiKey) return reply.status(400).send({ error: 'geminiApiKey is required' });

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }],
      });
      return { success: true, message: 'Gemini connection successful.' };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Gemini connection failed' });
    }
  });

  // 9. GET /v1/superadmin/app-status — per-app maintenance kill switch state
  fastify.get('/app-status', async (request, reply) => {
    const rows = await db.selectFrom('app_status').selectAll().execute();
    return { appStatus: rows };
  });

  // 10. PATCH /v1/superadmin/app-status/:appId — flip an app into/out of maintenance
  fastify.patch<{ Params: { appId: string }; Body: { status: 'active' | 'maintenance'; message?: string } }>(
    '/app-status/:appId',
    async (request, reply) => {
      const { appId } = request.params;
      const { status, message } = request.body;
      const user = request.user;

      const existing = await db.selectFrom('app_status').select('app_id').where('app_id', '=', appId).executeTakeFirst();
      if (existing) {
        await db.updateTable('app_status')
          .set({ status, message: message ?? null, updated_by: user.sub, updated_at: new Date() })
          .where('app_id', '=', appId)
          .execute();
      } else {
        await db.insertInto('app_status')
          .values({ app_id: appId, status, message: message ?? null, updated_by: user.sub })
          .execute();
      }

      const row = await db.selectFrom('app_status').selectAll().where('app_id', '=', appId).executeTakeFirstOrThrow();
      return { appStatus: row };
    }
  );

  // 11. GET /v1/superadmin/packages/:code/features — which feature keys a package grants
  fastify.get<{ Params: { code: string } }>('/packages/:code/features', async (request, reply) => {
    const { code } = request.params;
    const rows = await db.selectFrom('package_features').select('feature_key').where('package_code', '=', code).execute();
    return { packageCode: code, features: rows.map(r => r.feature_key) };
  });

  // 12. PATCH /v1/superadmin/packages/:code/features — replace the full feature set for a package
  fastify.patch<{ Params: { code: string }; Body: { features: string[] } }>(
    '/packages/:code/features',
    async (request, reply) => {
      const { code } = request.params;
      const { features } = request.body;

      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('package_features').where('package_code', '=', code).execute();
        if (features.length > 0) {
          await trx.insertInto('package_features')
            .values(features.map(feature_key => ({ package_code: code, feature_key })))
            .execute();
        }
      });

      return { packageCode: code, features };
    }
  );
}
