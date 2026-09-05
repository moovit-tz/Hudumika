import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import { dbPlatform, withTenant } from '../db/client.js';
import { sql } from 'kysely';
import { GLService } from '../services/gl.service.js';
import { DefaultWorkflowService } from '../services/default-workflow.service.js';
import { PlatformAdminService } from '../services/platform-admin.service.js';
import { CloudSync } from '../services/cloud-sync.service.js';
import { buildSmtpTransporter } from '../integrations/email.js';
import { encryptSecret, decryptSecret, MASKED_VALUE } from '../services/onsite-secrets.service.js';
import { JOB_REGISTRY, isJobSchedulingConnected } from '../jobs/index.js';
import { invalidatePlatformSettingsCache } from '../lib/platform-settings.js';
import { env } from '../config/env.js';
import os from 'node:os';

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
const tenantAddonsPatchSchema = z.object({
  addonGrants: z.record(z.string(), z.boolean()),
});
// Platform settings is a genuinely free-form JSONB blob (branding, SMTP,
// feature flags, ...), so this only guards it's a plain object — Object.keys()
// below would throw on null/an array, and the merge would silently corrupt
// the settings row if body weren't a real object.
const platformSettingsSchema = z.record(z.string(), z.any());
const ocrTestSchema = z.object({ geminiApiKey: z.string().trim().min(1) });
const smtpTestSchema = z.object({
  host: z.string().trim().min(1),
  port: z.union([z.string(), z.number()]).optional(),
  user: z.string().trim().min(1),
  pass: z.string().min(1),
  tls: z.boolean().optional(),
  from: z.string().max(320).optional(),
});

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

    // Four CSS-variable references, not four unrelated hardcoded hues — a
    // graduated set of the app's own single brand accent (--teal and its
    // tint/shade tokens) plus one neutral, rather than a rainbow of cyan/
    // teal/blue/purple with no connection to the platform's real palette.
    // These resolve live in the browser (inline SVG), so the donut still
    // follows whatever accent a SuperAdmin preset sets for this app.
    const PLAN_META: Record<string, { label: string; color: string }> = {
      starter: { label: 'Starter', color: 'var(--ink3)' },
      growth: { label: 'Growth', color: 'var(--teal-m)' },
      scale: { label: 'Scale', color: 'var(--teal-d)' },
      enterprise: { label: 'Enterprise', color: 'var(--teal)' },
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

    // Rollup cards for the two domain "Insights" layers moved out of this
    // shell so far (Decompose SuperAdmin, M1/M3) — a real number here that
    // links through to where the detail actually lives now (/lens,
    // /nexushr/platform-devices), rather than SuperAdmin re-querying each
    // domain's tables in full the way this file used to for Devices/Issues
    // directly. Deliberately not a generalized plugin registry yet — the
    // reports.service.ts METRICS array already covers attendance_devices
    // (has tenant_id, groups cleanly); lens_items has none by design
    // (platform-scoped, not tenant data), so it can't share that shape and
    // gets its own small direct count instead of a forced-fit abstraction.
    const [deviceCounts, lensCounts] = await Promise.all([
      dbPlatform.selectFrom('attendance_devices')
        .select(['status', ({ fn }) => fn.countAll<number>().as('n')])
        .groupBy('status').execute(),
      dbPlatform.selectFrom('lens_items')
        .select(['severity', ({ fn }) => fn.countAll<number>().as('n')])
        .where('status', 'in', ['OPEN', 'IN_PROGRESS', 'BLOCKED'])
        .groupBy('severity').execute(),
    ]);
    const deviceByStatus = Object.fromEntries(deviceCounts.map(r => [r.status, Number(r.n)]));
    const lensBySeverity = Object.fromEntries(lensCounts.map(r => [r.severity, Number(r.n)]));

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
      platformInsights: {
        devices: {
          total: deviceCounts.reduce((s, r) => s + Number(r.n), 0),
          online: deviceByStatus.online ?? 0,
          offline: deviceByStatus.offline ?? 0,
          error: deviceByStatus.error ?? 0,
        },
        lens: {
          openTotal: lensCounts.reduce((s, r) => s + Number(r.n), 0),
          critical: lensBySeverity.CRITICAL ?? 0,
        },
      },
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

    // One grouped count instead of one query per tenant — this used to fire
    // a full extra round-trip per row, so the page got slower with every
    // tenant Hudumika signs up rather than staying flat.
    const counts = await dbPlatform.selectFrom('users')
      .select(['tenant_id', dbPlatform.fn.count('id').as('count')])
      .groupBy('tenant_id')
      .execute();
    const countByTenant = new Map(counts.map(c => [c.tenant_id, Number(c.count)]));

    return list.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      active: t.active,
      logo_url: t.logo_url,
      primary_color: t.primary_color,
      created_at: t.created_at,
      users: countByTenant.get(t.id) ?? 0,
      founder_personal_email_domain: t.founder_personal_email_domain,
    }));
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

    let prunedOverrides: string[] = [];
    if (before && body.plan !== undefined && body.plan !== before.plan) {
      // checkEntitlement() (middleware/entitlement.ts) treats an explicit
      // `enabled-apps[x] = true` override as a hard pass, checked BEFORE it
      // ever looks at the tenant's plan — so an override left over from a
      // bigger plan (Settings.tsx's own "Enable All Modules" writes one per
      // app the CURRENT plan grants) survived a downgrade forever, keeping
      // the tenant on features their new, smaller plan no longer includes.
      // A `false` override (an app the tenant deliberately turned off) is
      // never touched here — it can't grant anything beyond plan, so there's
      // nothing to prune. This does mean a SuperAdmin's own one-off
      // cross-plan grant (the Apps tab on this same screen) is pruned too
      // on any plan change — the safer default: an exception surviving a
      // plan change silently is exactly the bug this closes, so it must be
      // re-granted deliberately afterward rather than assumed to persist.
      const newPlanFeatures = await dbPlatform.selectFrom('package_features')
        .select('feature_key').where('package_code', '=', result.plan).execute();
      const allowedKeys = new Set(newPlanFeatures.map(f => f.feature_key));

      const settingsRow = await dbPlatform.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', id).executeTakeFirst();
      const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
      const enabledApps: Record<string, boolean> = settings['enabled-apps'] || {};
      const nextEnabledApps: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(enabledApps)) {
        if (value === true && !allowedKeys.has(key)) { prunedOverrides.push(key); continue; }
        nextEnabledApps[key] = value;
      }
      if (prunedOverrides.length > 0) {
        await sql`UPDATE tenant_settings SET settings = jsonb_set(settings, '{enabled-apps}', ${JSON.stringify(nextEnabledApps)}::jsonb), updated_at = NOW() WHERE tenant_id = ${id}`.execute(dbPlatform);
      }
    }

    // Described by what actually changed, so the log reads as a history rather
    // than as a row of identical "Updated company" entries.
    const changed = Object.keys(updates).filter(k => k !== 'updated_at');
    let action = 'Updated company';
    let category: 'company' | 'billing' = 'company';
    if (before && body.plan !== undefined && body.plan !== before.plan) {
      action = `Changed plan from ${before.plan} to ${body.plan}`
        + (prunedOverrides.length ? ` (removed ${prunedOverrides.length} app override(s) no longer in plan: ${prunedOverrides.join(', ')})` : '');
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
  fastify.delete('/tenants/:id', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
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

  // 5c-2. GET /v1/superadmin/tenants/:id/addons — which add-ons (376_package_addons.sql)
  // this tenant currently holds. Mirrors 5b's GET .../apps exactly.
  fastify.get('/tenants/:id/addons', async (request) => {
    const { id } = request.params as { id: string };
    const rows = await dbPlatform.selectFrom('tenant_addons')
      .select('addon_code')
      .where('tenant_id', '=', id)
      .where('status', '=', 'active')
      .execute();
    const addonGrants: Record<string, boolean> = {};
    for (const r of rows) addonGrants[r.addon_code] = true;
    return { addonGrants };
  });

  // 5c-3. PATCH /v1/superadmin/tenants/:id/addons — grant/revoke specific
  // add-ons for this tenant. A SuperAdmin action, so it upserts tenant_addons
  // directly via dbPlatform rather than the tenant self-service purchase/cancel
  // endpoints in addons.routes.ts — same relationship 5c's apps endpoint has to
  // a hypothetical tenant-facing module toggle.
  fastify.patch('/tenants/:id/addons', async (request) => {
    const { id } = request.params as { id: string };
    const { addonGrants } = tenantAddonsPatchSchema.parse(request.body);

    for (const [addonCode, grant] of Object.entries(addonGrants)) {
      if (grant) {
        const existing = await dbPlatform.selectFrom('tenant_addons').select('id')
          .where('tenant_id', '=', id).where('addon_code', '=', addonCode).executeTakeFirst();
        if (existing) {
          await dbPlatform.updateTable('tenant_addons')
            .set({ status: 'active', cancelled_at: null, updated_at: new Date() })
            .where('id', '=', existing.id).execute();
        } else {
          await dbPlatform.insertInto('tenant_addons')
            .values({ tenant_id: id, addon_code: addonCode, status: 'active' }).execute();
        }
      } else {
        await dbPlatform.updateTable('tenant_addons')
          .set({ status: 'cancelled', cancelled_at: new Date(), updated_at: new Date() })
          .where('tenant_id', '=', id).where('addon_code', '=', addonCode).execute();
      }
    }

    const tenant = await dbPlatform.selectFrom('tenants').select('name').where('id', '=', id).executeTakeFirst();
    const on = Object.entries(addonGrants).filter(([, v]) => v).map(([k]) => k);
    await PlatformAdminService.recordActivity({
      ...actor(request), category: 'system',
      action: `Set add-ons to ${on.length ? on.join(', ') : 'none'}`,
      targetType: 'tenant', targetId: id, targetName: tenant?.name ?? null, tenantId: id,
      metadata: { addonGrants },
    });

    const rows = await dbPlatform.selectFrom('tenant_addons').select('addon_code')
      .where('tenant_id', '=', id).where('status', '=', 'active').execute();
    const result: Record<string, boolean> = {};
    for (const r of rows) result[r.addon_code] = true;
    return { addonGrants: result };
  });

  // 5c-4. GET /v1/superadmin/devices — cross-tenant, read-only Device
  // Management oversight (379_attendance_devices.sql). Platform-owner
  // "monitor, troubleshoot, audit" over HR data, not manage it — matches the
  // same view/support-only stance this file already takes toward tenant
  // leave/attendance, never a write action on another tenant's devices.
  fastify.get('/devices', async () => {
    const rows = await dbPlatform.selectFrom('attendance_devices as d')
      .innerJoin('tenants as t', 't.id', 'd.tenant_id')
      .select([
        'd.id', 'd.name', 'd.provider', 'd.serial_number', 'd.status', 'd.location',
        'd.last_heartbeat_at', 'd.last_sync_at', 'd.created_at',
        't.id as tenant_id', 't.name as tenant_name',
      ])
      .orderBy('d.created_at', 'desc')
      .execute();

    const eventCounts = await dbPlatform.selectFrom('attendance_device_events')
      .select(['device_id', ({ fn }) => fn.countAll<number>().as('count')])
      .groupBy('device_id')
      .execute();
    const countByDevice = new Map(eventCounts.map(c => [c.device_id, Number(c.count)]));

    return { data: rows.map(r => ({ ...r, event_count: countByDevice.get(r.id) ?? 0 })) };
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
    // The SMTP password is encrypted at rest — never send the ciphertext to
    // the browser. A masked sentinel round-trips through POST /settings as
    // "leave this unchanged" (see below), matching settings.routes.ts's own
    // SECRET_FIELDS_BY_KEY convention for tenant-level secrets.
    if (settings.smtp?.pass) settings.smtp = { ...settings.smtp, pass: MASKED_VALUE };
    return { settings };
  });

  // 7. POST /v1/superadmin/settings
  fastify.post('/settings', async (request, reply) => {
    const body = platformSettingsSchema.parse(request.body);
    const existing = await dbPlatform.selectFrom('tenant_settings')
      .select(['id', 'settings'])
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const existingSettings = existing ? (typeof existing.settings === 'string' ? JSON.parse(existing.settings) : existing.settings) : {};

    // A still-masked password means "unchanged" — keep the real encrypted
    // value already stored (the top-level `||` merge below replaces the
    // whole `smtp` key, so this has to be restored explicitly rather than
    // just dropped). A genuinely new password is encrypted once, here.
    if (body.smtp && typeof body.smtp === 'object') {
      if (body.smtp.pass === MASKED_VALUE) body.smtp = { ...body.smtp, pass: existingSettings?.smtp?.pass };
      else if (body.smtp.pass) body.smtp = { ...body.smtp, pass: encryptSecret(body.smtp.pass) };
    }

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

    invalidatePlatformSettingsCache();

    const row = await dbPlatform.selectFrom('tenant_settings')
      .selectAll()
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : body;
    if (settings.smtp?.pass) settings.smtp = { ...settings.smtp, pass: MASKED_VALUE };

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

  // 8. POST /v1/superadmin/smtp-test — verify SMTP and send a real test
  // message, same buildSmtpTransporter + verify() + send pattern
  // settings.routes.ts's own real POST /v1/settings/email/test already
  // uses for tenant-level SMTP, mirrored here for the platform-level config.
  fastify.post('/smtp-test', async (request, reply) => {
    const user = request.user;
    const body = smtpTestSchema.parse(request.body);
    if (body.pass === MASKED_VALUE) {
      return reply.status(400).send({ error: 'Re-enter the password to test — the saved value is masked here for display, not sent back to the browser.' });
    }
    if (!user.email) return reply.status(400).send({ error: 'Your account has no email address to send the test message to.' });

    const fromMatch = /^(.*?)\s*<(.+)>$/.exec(body.from || '');
    const fromName = fromMatch ? fromMatch[1].replace(/^"|"$/g, '') : 'Hudumika Platform';
    const fromEmail = fromMatch ? fromMatch[2] : body.user;
    const enc = body.tls ? 'tls' : undefined;
    const smtpPort = Number(body.port) || 587;
    const transport = buildSmtpTransporter({ host: body.host, port: body.port, user: body.user, pass: body.pass, enc });

    try {
      await transport.verify();
      await transport.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: user.email,
        subject: 'Hudumika — Platform SMTP Connection Verified',
        html: `<div style="font-family:system-ui,sans-serif;padding:32px;max-width:480px;border:1px solid #e5e7eb;border-radius:12px">
          <h2 style="color:#0b7264;margin:0 0 12px;font-size:20px">SMTP Connection Verified ✓</h2>
          <p style="color:#374151;line-height:1.6">The platform's outgoing email settings are working correctly.<br>Outgoing mail server: <strong>${body.host}:${smtpPort}</strong></p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">Sent from Hudumika at ${new Date().toLocaleString()}</p>
        </div>`,
      });
      return { success: true, message: 'SMTP test connection successful — check your inbox.' };
    } catch (e: any) {
      const msg: string = e.message || '';
      let friendly = msg;
      if (msg.includes('ECONNREFUSED')) friendly = `Connection refused on ${body.host}:${smtpPort}. Check host and port.`;
      else if (msg.includes('ETIMEDOUT') || msg.includes('ESOCKET')) friendly = `Connection timed out to ${body.host}. Check hostname and firewall.`;
      else if (msg.includes('ENOTFOUND')) friendly = `Host not found: "${body.host}". Check the SMTP hostname.`;
      else if (msg.includes('535') || msg.includes('EAUTH') || msg.includes('Invalid login') || msg.includes('Username and Password'))
        friendly = `Authentication failed. For Gmail/Yahoo use an App Password — not your account password.`;
      else if (msg.includes('530') || msg.includes('Must issue a STARTTLS'))
        friendly = `Server requires TLS. Enable TLS above.`;
      fastify.log.error('Platform SMTP test failed: %s', msg);
      return reply.status(400).send({ error: friendly });
    }
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

  // 8c. GET /v1/superadmin/jobs — the real registered background-job
  // schedule, read straight from jobs/index.js's own repeat configs rather
  // than a hardcoded table of invented names/last-run times.
  fastify.get('/jobs', async (request, reply) => {
    return { connected: isJobSchedulingConnected(), jobs: JOB_REGISTRY };
  });

  // 8d. GET /v1/superadmin/server-info — real, live runtime/infra stats.
  // Deliberately omits anything not genuinely obtainable (active connection
  // count, disk free space, a licence string) rather than inventing a number.
  fastify.get('/server-info', async (request, reply) => {
    let dbVersion = 'unavailable';
    try {
      const row = await sql<{ version: string }>`SELECT version()`.execute(dbPlatform);
      dbVersion = row.rows[0]?.version?.split(',')[0] ?? 'unavailable';
    } catch { /* left as 'unavailable' */ }

    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const uptimeSeconds = Math.floor(process.uptime());
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    return {
      nodeVersion: process.version,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      environment: env.APP_ENV,
      database: dbVersion,
      jobScheduling: isJobSchedulingConnected() ? 'BullMQ (Redis) connected' : 'Interval fallback (Redis unavailable)',
      appUptime: `${days}d ${hours}h ${minutes}m`,
      heapUsedMb: Math.round(mem.heapUsed / 1048576),
      heapTotalMb: Math.round(mem.heapTotal / 1048576),
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model ?? 'unknown',
      totalMemoryMb: Math.round(os.totalmem() / 1048576),
      freeMemoryMb: Math.round(os.freemem() / 1048576),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
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

  // 13. GET /v1/superadmin/packages/:code/quotas — per-app monthly item caps for a package.
  // Absent app_id = unlimited for that app under this tier (package_app_quotas, migration 280).
  fastify.get<{ Params: { code: string } }>('/packages/:code/quotas', async (request, reply) => {
    const { code } = request.params;
    const rows = await dbPlatform.selectFrom('package_app_quotas')
      .select(['app_id', 'monthly_limit']).where('package_code', '=', code).execute();
    return { packageCode: code, quotas: Object.fromEntries(rows.map(r => [r.app_id, r.monthly_limit])) };
  });

  // 14. PATCH /v1/superadmin/packages/:code/quotas — replace the full per-app quota set for a
  // package. quotas: { [appId]: monthlyLimit | null } — null/absent removes the row (unlimited).
  fastify.patch<{ Params: { code: string }; Body: { quotas: Record<string, number | null> } }>(
    '/packages/:code/quotas',
    async (request, reply) => {
      const { code } = request.params;
      const { quotas } = request.body;
      const entries = Object.entries(quotas || {}).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] >= 0);

      await dbPlatform.transaction().execute(async (trx) => {
        await trx.deleteFrom('package_app_quotas').where('package_code', '=', code).execute();
        if (entries.length > 0) {
          await trx.insertInto('package_app_quotas')
            .values(entries.map(([app_id, monthly_limit]) => ({ package_code: code, app_id, monthly_limit })))
            .execute();
        }
      });

      await PlatformAdminService.recordActivity({
        ...actor(request), category: 'billing',
        action: `Set ${code} plan per-app quotas (${entries.length})`,
        targetType: 'package', targetId: null, targetName: code, tenantId: null,
        metadata: { quotas: Object.fromEntries(entries) },
      });
      return { packageCode: code, quotas: Object.fromEntries(entries) };
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
