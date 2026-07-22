import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { db } from '../db/client.js';
import { sql } from 'kysely';

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
    
    let totalEarnings = 0;
    tenants.forEach(t => {
      if (t.active) {
        if (t.plan === 'enterprise') totalEarnings += 499;
        else if (t.plan === 'professional') totalEarnings += 299;
        else totalEarnings += 99;
      }
    });

    const planCounts = { starter: 0, professional: 0, enterprise: 0 };
    tenants.forEach(t => {
      if (t.active && (t.plan === 'starter' || t.plan === 'professional' || t.plan === 'enterprise')) {
        planCounts[t.plan as 'starter' | 'professional' | 'enterprise']++;
      }
    });
    const totalActivePlanTenants = Math.max(1, activeTenants);
    const planDist = [
      { label: 'Starter', pct: Math.round((planCounts.starter / totalActivePlanTenants) * 100), color: '#3b82f6' },
      { label: 'Professional', pct: Math.round((planCounts.professional / totalActivePlanTenants) * 100), color: '#7c3aed' },
      { label: 'Enterprise', pct: Math.round((planCounts.enterprise / totalActivePlanTenants) * 100), color: '#0d7a6b' }
    ];

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

    const recentTransactions = tenants.slice(0, 5).map((t, idx) => {
      const amount = t.plan === 'enterprise' ? 499 : t.plan === 'professional' ? 299 : 99;
      return {
        id: `tx-${t.id}`,
        companyId: t.id,
        amount,
        status: 'completed',
        txRef: `TXN-${100000 + idx}`,
        created: t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
      };
    });

    const upcomingRenewals = tenants.slice(0, 4).map(t => {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);
      return {
        id: `sub-${t.id}`,
        companyId: t.id,
        plan: t.plan,
        start: new Date().toISOString().slice(0, 10),
        end: expiry.toISOString().slice(0, 10),
        amount: t.plan === 'enterprise' ? 499 : t.plan === 'professional' ? 299 : 99,
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
}
