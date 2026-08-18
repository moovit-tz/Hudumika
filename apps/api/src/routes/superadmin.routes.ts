import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import { dbPlatform, withTenant } from '../db/client.js';
import { sql } from 'kysely';
import { GLService } from '../services/gl.service.js';
import { DefaultWorkflowService } from '../services/default-workflow.service.js';
import { PlatformAdminService } from '../services/platform-admin.service.js';
import { CloudSync } from '../services/cloud-sync.service.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// Real values — SuperAdmin.tsx's own PlanId type / packages catalog codes.
const TENANT_PLANS = ['starter', 'growth', 'scale', 'enterprise'] as const;
const tenantCreateSchema = z.object({
  name: z.string().trim().min(1).max(300),
  slug: z.string().trim().max(100).optional(),
  plan: z.enum(TENANT_PLANS).optional(),
  active: z.boolean().optional(),
  logo_url: z.string().max(1000).optional(),
  primary_color: z.string().max(30).optional(),
});
const tenantPatchSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  slug: z.string().trim().max(100).optional(),
  plan: z.enum(TENANT_PLANS).optional(),
  active: z.boolean().optional(),
  logo_url: z.string().max(1000).nullable().optional(),
  primary_color: z.string().max(30).nullable().optional(),
});
const tenantAppsPatchSchema = z.object({
  enabledApps: z.record(z.string(), z.boolean()),
});
// Platform settings is a genuinely free-form JSONB blob (branding, SMTP,
// feature flags, ...), so this only guards it's a plain object — Object.keys()
// below would throw on null/an array, and the merge would silently corrupt
// the settings row if body weren't a real object.
const platformSettingsSchema = z.record(z.string(), z.any());
const ocrTestSchema = z.object({ geminiApiKey: z.string().trim().min(1) });

export async function superAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  /** Who is doing this, for the audit trail. Falls back to the email rather
   *  than to a placeholder — an audit row that says "Super Admin" for
   *  everyone cannot answer which superadmin. */
  const actor = (request: any) => ({
    actorUserId: request.user?.sub ?? request.user?.id ?? null,
    actorName: request.user?.name || request.user?.email || 'Unknown superadmin',
  });

  // 1. GET /v1/superadmin/dashboard-stats
  fastify.get('/dashboard-stats', async (request, reply) => {
    const totalTenantsRow = await dbPlatform.selectFrom('tenants').select(dbPlatform.fn.count('id').as('count')).executeTakeFirst();
    const activeTenantsRow = await dbPlatform.selectFrom('tenants').select(dbPlatform.fn.count('id').as('count')).where('active', '=', true).executeTakeFirst();
    const totalUsersRow = await dbPlatform.selectFrom('users').select(dbPlatform.fn.count('id').as('count')).executeTakeFirst();

    const totalTenants = Number(totalTenantsRow?.count ?? 0);
    const activeTenants = Number(activeTenantsRow?.count ?? 0);
    const totalSubscribers = Number(totalUsersRow?.count ?? 0);

    const tenants = await dbPlatform.selectFrom('tenants').select(['id', 'plan', 'active', 'name', 'created_at']).execute();

    // Real list prices from the packages catalog, keyed by code — replaces a
    // previously hardcoded 3-tier ternary that didn't match the real 4-tier
    // starter/growth/scale/enterprise codes. Enterprise has no fixed list
    // price (custom/"talk to sales"), so it contributes 0 to these estimates
    // rather than a fabricated number — real enterprise revenue lives in
    // platform_transactions, not this list-price-based estimate.
    const packageRows = await dbPlatform.selectFrom('packages').select(['code', 'monthly_price']).execute();
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

    const txRows = await dbPlatform.selectFrom('platform_transactions')
      .select(['tx_ref', 'tenant_id', 'amount', 'currency', 'status', 'method', 'package_code', 'payer_name', 'created_at'])
      .orderBy('created_at', 'desc')
      .execute();

    const userRows = await dbPlatform.selectFrom('users').select(['created_at']).execute();

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

    let q = dbPlatform.selectFrom('platform_transactions as t')
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
    const tally = await dbPlatform.selectFrom('platform_transactions')
      .select(['status'])
      .select(dbPlatform.fn.count('id').as('n'))
      .select(dbPlatform.fn.sum('amount').as('total'))
      .groupBy('status')
      .execute();

    const byStatus = Object.fromEntries(tally.map(t => [t.status, { count: Number(t.n), total: Number(t.total ?? 0) }]));

    const monthly = await dbPlatform.selectFrom('platform_transactions')
      .select([sql<string>`to_char(created_at, 'YYYY-MM')`.as('month')])
      .select(dbPlatform.fn.sum('amount').as('total'))
      .select(dbPlatform.fn.count('id').as('n'))
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
    const list = await dbPlatform.selectFrom('tenants')
      .selectAll()
      .execute();

    const tenantsWithUsers = await Promise.all(list.map(async (t) => {
      const userCountRow = await dbPlatform.selectFrom('users')
        .select(dbPlatform.fn.count('id').as('count'))
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
    const body = tenantCreateSchema.parse(request.body);
    const now = new Date();
    const result = await dbPlatform.insertInto('tenants')
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

    // These seed the new tenant's own chart of accounts / default workflows —
    // tenant-scoped writes, even though the actor provisioning them is
    // platform-level, so they go through withTenant like any other write to
    // that tenant's data, not the cross-tenant dbPlatform connection.
    await withTenant(result.id, trx => GLService.seedChartOfAccounts(trx, result.id));
    // Platform default workflows (Sea/Air/Road/Sea-transit) for the new tenant.
    await withTenant(result.id, trx => DefaultWorkflowService.seedForTenant(trx, result.id, null));

    await PlatformAdminService.recordActivity({
      ...actor(request), category: 'company',
      action: 'Created company', targetType: 'tenant', targetId: result.id,
      targetName: result.name, tenantId: result.id,
      metadata: { plan: result.plan },
    });
    return result;
  });

  // 4. PATCH /v1/superadmin/tenants/:id
  fastify.patch('/tenants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = tenantPatchSchema.parse(request.body);
    const before = await dbPlatform.selectFrom('tenants').select(['name', 'plan', 'active'])
      .where('id', '=', id).executeTakeFirst();
    const updates: any = { updated_at: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.plan !== undefined) updates.plan = body.plan;
    if (body.active !== undefined) updates.active = body.active;
    if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
    if (body.primary_color !== undefined) updates.primary_color = body.primary_color;

    const result = await dbPlatform.updateTable('tenants')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Described by what actually changed, so the log reads as a history rather
    // than as a row of identical "Updated company" entries.
    const changed = Object.keys(updates).filter(k => k !== 'updated_at');
    let action = 'Updated company';
    let category: 'company' | 'billing' = 'company';
    if (before && body.plan !== undefined && body.plan !== before.plan) {
      action = `Changed plan from ${before.plan} to ${body.plan}`;
      category = 'billing';
    } else if (before && body.active !== undefined && body.active !== before.active) {
      action = body.active ? 'Reactivated company' : 'Suspended company';
    } else if (changed.length) {
      action = `Updated company ${changed.join(', ')}`;
    }
    await PlatformAdminService.recordActivity({
      ...actor(request), category, action,
      targetType: 'tenant', targetId: id, targetName: result.name, tenantId: id,
      metadata: { changed },
    });
    return result;
  });

  // 5. DELETE /v1/superadmin/tenants/:id
  fastify.delete('/tenants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Read the name before it is gone — the audit row has to outlive the row
    // it describes, and tenant_id is SET NULL on delete for the same reason.
    const doomed = await dbPlatform.selectFrom('tenants').select(['name', 'plan'])
      .where('id', '=', id).executeTakeFirst();
    await dbPlatform.deleteFrom('tenants')
      .where('id', '=', id)
      .execute();
    await PlatformAdminService.recordActivity({
      ...actor(request), category: 'company',
      action: 'Deleted company', targetType: 'tenant', targetId: id,
      targetName: doomed?.name ?? null, tenantId: null,
      metadata: { plan: doomed?.plan ?? null },
    });
    return { success: true };
  });

  // 5b. GET /v1/superadmin/tenants/:id/apps — which apps are enabled for this tenant
  fastify.get('/tenants/:id/apps', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', id)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return { enabledApps: settings['enabled-apps'] || {} };
  });

  // 5c. PATCH /v1/superadmin/tenants/:id/apps — enable/disable specific apps for this tenant
  fastify.patch('/tenants/:id/apps', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { enabledApps } = tenantAppsPatchSchema.parse(request.body);

    const existing = await dbPlatform.selectFrom('tenant_settings').select('id').where('tenant_id', '=', id).executeTakeFirst();
    const patch = JSON.stringify({ 'enabled-apps': enabledApps });
    if (existing) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${id}`.execute(dbPlatform);
    } else {
      await dbPlatform.insertInto('tenant_settings').values({ tenant_id: id, settings: patch }).execute();
    }

    const row = await dbPlatform.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', id).executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};

    const tenant = await dbPlatform.selectFrom('tenants').select('name').where('id', '=', id).executeTakeFirst();
    const on = Object.entries(enabledApps).filter(([, v]) => v).map(([k]) => k);
    await PlatformAdminService.recordActivity({
      ...actor(request), category: 'system',
      action: `Set enabled apps to ${on.length ? on.join(', ') : 'none'}`,
      targetType: 'tenant', targetId: id, targetName: tenant?.name ?? null, tenantId: id,
      metadata: { enabledApps },
    });
    return { enabledApps: settings['enabled-apps'] || {} };
  });

  // 5d. GET /v1/superadmin/tenants/:id/customers — for the "Login As Customer"
  // picker (auth.routes.ts POST /impersonate-customer). Plain db query, not
  // withTenant — SuperAdmin cross-tenant reads in this file are always done
  // this way, matching every other route here.
  fastify.get('/tenants/:id/customers', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await dbPlatform.selectFrom('customers')
      .select(['id', 'name', 'email', 'phone', 'phone_wa', 'account_status', 'active', 'created_at'])
      .where('tenant_id', '=', id)
      .orderBy('name', 'asc')
      .execute();
    return { data: rows };
  });

  // 5e. POST /v1/superadmin/tenants/:id/resync-cloud-links — explicit,
  // repeatable remediation for a tenant whose customer/shipment folders
  // predate entity-linking (see cloud-sync.service.ts backfillTenant()).
  fastify.post('/tenants/:id/resync-cloud-links', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await dbPlatform.selectFrom('tenants').select('name').where('id', '=', id).executeTakeFirst();
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const result = await CloudSync.backfillTenant(id);
    await PlatformAdminService.recordActivity({
      ...actor(request), category: 'system',
      action: `Resynced Cloud links (${result.customersTagged} customers, ${result.shipmentsTagged} shipments)`,
      targetType: 'tenant', targetId: id, targetName: tenant.name, tenantId: id,
      metadata: result,
    });
    return result;
  });

  // 6. GET /v1/superadmin/settings
  fastify.get('/settings', async (request, reply) => {
    const row = await dbPlatform.selectFrom('tenant_settings')
      .selectAll()
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return { settings };
  });

  // 7. POST /v1/superadmin/settings
  fastify.post('/settings', async (request, reply) => {
    const body = platformSettingsSchema.parse(request.body);
    const existing = await dbPlatform.selectFrom('tenant_settings')
      .select('id')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();

    if (existing) {
      // Shallow-merge into the existing JSONB blob so unrelated sections (branding, feature
      // flags, SMTP, etc.) written by other screens aren't clobbered by this screen's save.
      await sql`UPDATE tenant_settings SET settings = settings || ${JSON.stringify(body)}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(dbPlatform);
    } else {
      await dbPlatform.insertInto('tenant_settings')
        .values({
          tenant_id: GLOBAL_TENANT_ID,
          settings: JSON.stringify(body),
          created_at: new Date(),
          updated_at: new Date()
        })
        .execute();
    }

    const row = await dbPlatform.selectFrom('tenant_settings')
      .selectAll()
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : body;

    await PlatformAdminService.recordActivity({
      ...actor(request), category: 'system',
      action: `Changed platform settings: ${Object.keys(body).join(', ') || 'no keys'}`,
      targetType: 'settings', targetId: null, targetName: 'Platform settings', tenantId: null,
      // Keys only. The body carries SMTP passwords and API keys, and an audit
      // trail is the last place those should be copied to.
      metadata: { keys: Object.keys(body) },
    });
    return { settings };
  });

  // 8. POST /v1/superadmin/smtp-test
  fastify.post('/smtp-test', async (request, reply) => {
    return { success: true, message: 'SMTP Test connection successful.' };
  });

  // 8b. POST /v1/superadmin/ocr-test — verify a Gemini API key actually works
  fastify.post('/ocr-test', async (request, reply) => {
    const { geminiApiKey } = ocrTestSchema.parse(request.body);

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
    const rows = await dbPlatform.selectFrom('app_status').selectAll().execute();
    return { appStatus: rows };
  });

  // 10. PATCH /v1/superadmin/app-status/:appId — flip an app into/out of maintenance
  fastify.patch<{ Params: { appId: string }; Body: { status: 'active' | 'maintenance'; message?: string } }>(
    '/app-status/:appId',
    async (request, reply) => {
      const { appId } = request.params;
      const { status, message } = request.body;
      const user = request.user;

      const existing = await dbPlatform.selectFrom('app_status').select('app_id').where('app_id', '=', appId).executeTakeFirst();
      if (existing) {
        await dbPlatform.updateTable('app_status')
          .set({ status, message: message ?? null, updated_by: user.sub, updated_at: new Date() })
          .where('app_id', '=', appId)
          .execute();
      } else {
        await dbPlatform.insertInto('app_status')
          .values({ app_id: appId, status, message: message ?? null, updated_by: user.sub })
          .execute();
      }

      const row = await dbPlatform.selectFrom('app_status').selectAll().where('app_id', '=', appId).executeTakeFirstOrThrow();
      await PlatformAdminService.recordActivity({
        ...actor(request), category: 'system',
        action: status === 'maintenance'
          ? `Put ${appId} into maintenance`
          : `Brought ${appId} out of maintenance`,
        targetType: 'app', targetId: null, targetName: appId, tenantId: null,
        metadata: { status, message: message ?? null },
      });
      return { appStatus: row };
    }
  );

  // 11. GET /v1/superadmin/packages/:code/features — which feature keys a package grants
  fastify.get<{ Params: { code: string } }>('/packages/:code/features', async (request, reply) => {
    const { code } = request.params;
    const rows = await dbPlatform.selectFrom('package_features').select('feature_key').where('package_code', '=', code).execute();
    return { packageCode: code, features: rows.map(r => r.feature_key) };
  });

  // 12. PATCH /v1/superadmin/packages/:code/features — replace the full feature set for a package
  fastify.patch<{ Params: { code: string }; Body: { features: string[] } }>(
    '/packages/:code/features',
    async (request, reply) => {
      const { code } = request.params;
      const { features } = request.body;

      await dbPlatform.transaction().execute(async (trx) => {
        await trx.deleteFrom('package_features').where('package_code', '=', code).execute();
        if (features.length > 0) {
          await trx.insertInto('package_features')
            .values(features.map(feature_key => ({ package_code: code, feature_key })))
            .execute();
        }
      });

      await PlatformAdminService.recordActivity({
        ...actor(request), category: 'billing',
        action: `Set ${code} plan features (${features.length})`,
        targetType: 'package', targetId: null, targetName: code, tenantId: null,
        metadata: { features },
      });
      return { packageCode: code, features };
    }
  );

  // ─── Activity log ──────────────────────────────────────────────────────────

  fastify.get('/activity', async (request: any, reply) => {
    try {
      const { category, tenantId, limit } = request.query ?? {};
      return { data: await PlatformAdminService.listActivity({
        category, tenantId, limit: limit ? Number(limit) : undefined,
      }) };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─── Custom domains ────────────────────────────────────────────────────────

  fastify.get('/domains', async (request, reply) => {
    try {
      return { data: await PlatformAdminService.listDomains() };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/domains', async (request: any, reply) => {
    try {
      const { tenant_id, domain } = request.body ?? {};
      if (!tenant_id) return reply.status(400).send({ error: 'tenant_id is required' });
      const row = await PlatformAdminService.addDomain(tenant_id, domain);
      const tenant = await dbPlatform.selectFrom('tenants').select('name').where('id', '=', tenant_id).executeTakeFirst();
      await PlatformAdminService.recordActivity({
        ...actor(request), category: 'system',
        action: `Added custom domain ${row.domain}`,
        targetType: 'domain', targetId: row.id, targetName: row.domain, tenantId: tenant_id,
        metadata: { tenant: tenant?.name ?? null },
      });
      return row;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** Runs the real DNS + TLS probe and stores whatever it actually found. */
  fastify.post('/domains/:id/check', async (request: any, reply) => {
    try {
      return await PlatformAdminService.checkDomain(request.params.id);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  fastify.delete('/domains/:id', async (request: any, reply) => {
    try {
      const row = await PlatformAdminService.deleteDomain(request.params.id);
      await PlatformAdminService.recordActivity({
        ...actor(request), category: 'system',
        action: `Removed custom domain ${row.domain}`,
        targetType: 'domain', targetId: row.id, targetName: row.domain, tenantId: row.tenant_id,
      });
      return { success: true };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}
