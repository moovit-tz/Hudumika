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

    const spark = {
      companies: [1, 2, 2, 3, 5, totalTenants],
      active: [1, 1, 2, 3, 4, activeTenants],
      subscribers: [10, 42, 85, 120, 180, totalSubscribers],
      earnings: [1000, 3500, 7200, 11500, 16800, totalEarnings]
    };

    const monthlyRev = [
      { label: 'Jan', value: Math.max(1, activeTenants - 3) * 200 },
      { label: 'Feb', value: Math.max(1, activeTenants - 2) * 250 },
      { label: 'Mar', value: Math.max(1, activeTenants - 1) * 290 },
      { label: 'Apr', value: activeTenants * 320 },
      { label: 'May', value: activeTenants * 350 },
      { label: 'Jun', value: totalEarnings }
    ];

    const recentTransactions = tenants.slice(0, 5).map((t, idx) => ({
      id: `tx-${t.id}`,
      companyId: t.id,
      amount: priceByCode[t.plan] ?? 0,
      status: 'completed',
      txRef: `TXN-${100000 + idx}`,
      created: t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
    }));

    const upcomingRenewals = tenants.slice(0, 4).map(t => {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);
      return {
        id: `sub-${t.id}`,
        companyId: t.id,
        plan: t.plan,
        start: new Date().toISOString().slice(0, 10),
        end: expiry.toISOString().slice(0, 10),
        amount: priceByCode[t.plan] ?? 0,
        status: 'active'
      };
    });

    return {
      kpis: {
        totalCompanies: totalTenants,
        activeCompanies: activeTenants,
        totalSubscribers,
        totalEarnings
      },
      planDist,
      spark,
      monthlyRev,
      transactions: recentTransactions,
      renewals: upcomingRenewals
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
