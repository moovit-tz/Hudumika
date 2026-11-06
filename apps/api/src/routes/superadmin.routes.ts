import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  freightBundleKey, freightDiscount, freightDraft, freightPreviewPeriod, freightUnitRate,
  getFreightPilotDraft, getFreightPricingVersions, getFreightUsagePreview, listFreightPilotDrafts, quoteFreightLine,
} from '../services/freight-usage-preview.service.js';
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
import { invalidatePlatformSettingsCache, maskAiForClient, mergeAiForSave, getPlatformProviderKey } from '../lib/platform-settings.js';
import { runProviderKeyTest } from '../lib/ai-key-test.js';
import { getPlatformAgentUsage } from '../lib/agent-usage.js';
import { getFinanceCapabilities, getFinanceConfiguration } from '../services/finance-capability.service.js';
import { AI_PROVIDERS, AI_PROVIDER_CONFIG } from '../lib/ai-providers.js';
import { env } from '../config/env.js';
import { CarImagesService } from '../services/carimages.service.js';
import { CommercialAnalyticsService } from '../services/commercial-analytics.service.js';
import os from 'node:os';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// Real values — SuperAdmin.tsx's own PlanId type / packages catalog codes.
// Phase 1 (mig 635): added TZS plan codes alongside legacy USD ones.
const TENANT_PLANS = ['starter', 'growth', 'scale', 'enterprise', 'starter-tzs', 'business-tzs', 'scale-tzs'] as const;
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
  billing_cycle: z.enum(['monthly', 'annual']).optional(),
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
  // HUD-0097 (addendum): `before` was fetched but never checked before the
  // update — a wrong/stale tenant id crashed instead of 404ing. A
  // multi-line-chain miss from the original sweep.
  fastify.patch('/tenants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = tenantPatchSchema.parse(request.body);
    const before = await dbPlatform.selectFrom('tenants').select(['name', 'plan', 'active'])
      .where('id', '=', id).executeTakeFirst();
    if (!before) return reply.status(404).send({ error: 'Tenant not found' });
    const updates: any = { updated_at: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.plan !== undefined) updates.plan = body.plan;
    if ((body as any).billing_cycle !== undefined) updates.billing_cycle = (body as any).billing_cycle;
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

    // Record plan change in the dedicated audit table (mig 635)
    if (before && body.plan !== undefined && body.plan !== before.plan) {
      await dbPlatform.insertInto('tenant_plan_changes' as any).values({
        tenant_id: id,
        from_plan: before.plan,
        to_plan: body.plan,
        from_cycle: (before as any).billing_cycle ?? 'monthly',
        to_cycle: (body as any).billing_cycle ?? (before as any).billing_cycle ?? 'monthly',
        reason: 'SuperAdmin plan change',
        initiated_by: (request.user as any)?.id ?? null,
      } as any).execute();
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

  // Finance packaging is resolved from the tenant's actual plan and explicit
  // activation rows. SuperAdmin needs this view before changing a package;
  // using the tenant-scoped services also keeps RLS and usage calculations
  // identical to what the tenant sees in Finance.
  fastify.get('/tenants/:id/finance', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await dbPlatform.selectFrom('tenants')
      .select(['id', 'name', 'plan', 'active'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const [capabilitySummary, configuration] = await Promise.all([
      // Deliberately resolve as the tenant, not with the SuperAdmin bypass:
      // this endpoint reports what the workspace can actually use.
      getFinanceCapabilities(id),
      getFinanceConfiguration(id),
    ]);
    return { tenant, capabilitySummary, configuration };
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
    // Same convention for the platform AI provider's key (agentic platform
    // milestone 0/2) — a SuperAdmin can enter one here as the fallback every
    // tenant without their own key uses (lib/platform-settings.ts's
    // resolveAiCredentials), but it never round-trips back to the browser.
    if (settings.ai) settings.ai = maskAiForClient(settings.ai);
    if (settings.carimages?.secret) settings.carimages = { ...settings.carimages, secret: MASKED_VALUE };
    return { settings };
  });

  /** GET /v1/superadmin/ai/usage?days=30 — which tenants are drawing on the shared AI key. */
  fastify.get('/ai/usage', async (request) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(request.query);
    return getPlatformAgentUsage(days);
  });

  // 7. POST /v1/superadmin/settings
  /**
   * POST /v1/superadmin/ai/test — the "Test" button on each AI provider card.
   * Body: { provider, model?, apiKey? }. A key typed into the card (not yet
   * saved) is tested as-is; a masked/empty one tests the STORED key for that
   * provider, which never leaves the server. Always 200 with { ok, ... } so the
   * screen can show the provider's own error (invalid key, no credits, model
   * not found); the key is scrubbed from any error text before it is returned.
   */
  fastify.post('/ai/test', async (request, reply) => {
    const body = z.object({
      provider: z.enum(AI_PROVIDERS),
      model: z.string().trim().max(120).optional(),
      apiKey: z.string().max(500).optional(),
    }).parse(request.body);
    const typed = body.apiKey && body.apiKey !== MASKED_VALUE ? body.apiKey : null;
    const apiKey = typed ?? await getPlatformProviderKey(body.provider);
    if (!apiKey) return reply.status(400).send({ error: `No key saved for ${AI_PROVIDER_CONFIG[body.provider].label} — paste one first.` });
    return runProviderKeyTest({ provider: body.provider, model: body.model, apiKey });
  });

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
    // Same round-trip-safe handling for the platform AI key — see the GET
    // handler above.
    // Per-provider keys: masked = unchanged, typed = encrypted, empty = removed
    // (mergeAiForSave, lib/platform-settings.ts).
    if (body.ai && typeof body.ai === 'object') body.ai = mergeAiForSave(body.ai, existingSettings?.ai);
    if (body.carimages && typeof body.carimages === 'object') {
      if (body.carimages.secret === MASKED_VALUE) body.carimages = { ...body.carimages, secret: existingSettings?.carimages?.secret };
      else if (body.carimages.secret) body.carimages = { ...body.carimages, secret: encryptSecret(body.carimages.secret) };
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
    if (settings.ai) settings.ai = maskAiForClient(settings.ai);
    if (settings.carimages?.secret) settings.carimages = { ...settings.carimages, secret: MASKED_VALUE };

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

  // 8c. POST /v1/superadmin/carimages/test — test CarImages API credentials
  fastify.post('/carimages/test', async (request, reply) => {
    const body = z.object({
      apiKey: z.string().max(200).optional(),
      secret: z.string().max(200).optional(),
    }).parse(request.body || {});

    try {
      const res = await CarImagesService.testConnection(
        body.apiKey !== MASKED_VALUE ? body.apiKey : undefined,
        body.secret !== MASKED_VALUE ? body.secret : undefined,
      );
      return res;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'CarImages connection failed' });
    }
  });

  // 8d. GET /v1/superadmin/carimages/makes — list all vehicle makes and logos
  fastify.get('/carimages/makes', async (request, reply) => {
    try {
      return await CarImagesService.getMakes();
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to fetch makes' });
    }
  });

  // 8e. POST /v1/superadmin/carimages/signed-url — get signed studio image URL
  fastify.post('/carimages/signed-url', async (request, reply) => {
    const body = z.object({
      make: z.string().min(1).max(100),
      model: z.string().min(1).max(100),
      year: z.union([z.number(), z.string()]).optional(),
      view: z.string().optional(),
      format: z.string().optional(),
    }).parse(request.body);

    try {
      return await CarImagesService.getSignedUrl(body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to generate signed URL' });
    }
  });

  // 8f. POST /v1/superadmin/carimages/signed-model-url — get signed 3D model URL
  fastify.post('/carimages/signed-model-url', async (request, reply) => {
    const body = z.object({
      make: z.string().min(1).max(100),
      model: z.string().min(1).max(100),
      year: z.union([z.number(), z.string()]).optional(),
    }).parse(request.body);

    try {
      return await CarImagesService.getSignedModelUrl(body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to generate signed 3D model URL' });
    }
  });

  // 8g. POST /v1/superadmin/carimages/sync-fleet — pull and enrich live fleet vehicles
  fastify.post('/carimages/sync-fleet', async (request, reply) => {
    const body = z.object({
      tenantId: z.string().uuid().optional(),
    }).parse(request.body || {});

    try {
      const result = await CarImagesService.syncFleetAssets(body.tenantId);
      await PlatformAdminService.recordActivity({
        ...actor(request), category: 'system',
        action: `Enriched ${result.updatedCount} fleet vehicles with realistic CarImages studio photos`,
        targetType: 'fleet', targetId: null, targetName: 'Fleet Assets Sync', tenantId: null,
      });
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Fleet sync failed' });
    }
  });

  // 8h. POST /v1/superadmin/carimages/create-sample-assets — seed realistic vehicles
  fastify.post('/carimages/create-sample-assets', async (request, reply) => {
    const body = z.object({
      tenantId: z.string().uuid().default('15b7d313-5ab9-47d1-b9b3-eaa90cd90bdf'),
    }).parse(request.body || {});

    try {
      const result = await CarImagesService.createRealisticFleetAssets(body.tenantId);
      await PlatformAdminService.recordActivity({
        ...actor(request), category: 'system',
        action: `Created/updated ${result.createdCount} realistic commercial fleet assets with CarImages data`,
        targetType: 'fleet', targetId: null, targetName: 'Realistic Fleet Assets', tenantId: null,
      });
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to create sample assets' });
    }
  });

  // 8i. POST /v1/superadmin/mapbox/test — verify Mapbox token
  fastify.post('/mapbox/test', async (request, reply) => {
    const body = z.object({
      accessToken: z.string().min(1).max(300),
    }).parse(request.body);

    try {
      const token = body.accessToken.trim();
      const res = await fetch(`https://api.mapbox.com/tokens/v2?access_token=${encodeURIComponent(token)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        return reply.status(400).send({ ok: false, error: `Mapbox API returned HTTP ${res.status}: ${err}` });
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, code: data.code || 'TokenValid', token: token.substring(0, 10) + '••••' };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err.message || 'Failed to connect to Mapbox' });
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

  // 10b. PATCH /v1/superadmin/app-status/:appId/beta — platform-wide "Beta"
  // label (migration 395), independent of the maintenance status above.
  // Reported to every tenant identically via GET /v1/entitlements'
  // betaApps, which is what Settings.tsx's Modules & Extensions grid reads
  // instead of the hardcoded MODULE_CATALOG constant this replaced.
  fastify.patch<{ Params: { appId: string }; Body: { is_beta: boolean } }>(
    '/app-status/:appId/beta',
    async (request, reply) => {
      const { appId } = request.params;
      const { is_beta } = request.body;
      const user = request.user;

      const existing = await dbPlatform.selectFrom('app_status').select('app_id').where('app_id', '=', appId).executeTakeFirst();
      if (existing) {
        await dbPlatform.updateTable('app_status')
          .set({ is_beta, updated_by: user.sub, updated_at: new Date() })
          .where('app_id', '=', appId)
          .execute();
      } else {
        await dbPlatform.insertInto('app_status')
          .values({ app_id: appId, status: 'active', is_beta, updated_by: user.sub })
          .execute();
      }

      const row = await dbPlatform.selectFrom('app_status').selectAll().where('app_id', '=', appId).executeTakeFirstOrThrow();
      await PlatformAdminService.recordActivity({
        ...actor(request), category: 'system',
        action: is_beta ? `Marked ${appId} as Beta` : `Cleared Beta label on ${appId}`,
        targetType: 'app', targetId: null, targetName: appId, tenantId: null,
        metadata: { is_beta },
      });
      return { appStatus: row };
    }
  );

  // 10c. GET/PATCH /v1/superadmin/commercial-products — the 7-state product
  // readiness lifecycle (migration 682), separate from app_status's
  // maintenance kill switch above. Marking a product past 'internal' is a
  // product decision this route only records — it does not itself wire the
  // product into entitlements/billing (see tenant_product_subscriptions).
  fastify.get('/commercial-products', async (request, reply) => {
    const rows = await dbPlatform.selectFrom('commercial_products').selectAll().orderBy('product_key').execute();
    return { commercialProducts: rows };
  });

  fastify.get('/commercial-products/freight-forwarder/draft', async () => {
    const draft = await dbPlatform.selectFrom('commercial_pricing_drafts')
      .select(['revision', 'configuration', 'updated_at', 'tested_revision'])
      .where('bundle_key', '=', freightBundleKey)
      .executeTakeFirst();
    return {
      revision: draft?.revision ?? 0,
      configuration: draft ? freightDraft.parse(JSON.parse(draft.configuration)) : null,
      updated_at: draft?.updated_at ?? null,
      tested: !!draft && draft.tested_revision === draft.revision,
    };
  });

  fastify.put('/commercial-products/freight-forwarder/draft', async (request, reply) => {
    const parsed = z.object({
      revision: z.number().int().min(0).max(2_147_483_646),
      configuration: freightDraft,
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Enter valid whole-number TZS rates and a discount from 0 to 100.' });
    }
    const { revision, configuration } = parsed.data;
    const values = {
      revision: revision + 1,
      configuration: JSON.stringify(configuration),
      updated_by: request.user.sub,
      updated_at: new Date(),
    };
    const updated = revision === 0
      ? await dbPlatform.insertInto('commercial_pricing_drafts')
        .values({ bundle_key: freightBundleKey, ...values })
        .onConflict(conflict => conflict.column('bundle_key').doNothing())
        .returning('revision')
        .executeTakeFirst()
      : await dbPlatform.updateTable('commercial_pricing_drafts')
        .set(values)
        .where('bundle_key', '=', freightBundleKey)
        .where('revision', '=', revision)
        .returning('revision')
        .executeTakeFirst();
    if (!updated) {
      return reply.status(409).send({ error: 'Another administrator saved this draft. Reload the saved draft before retrying.' });
    }
    return { revision: updated.revision, configuration, updated_at: values.updated_at, tested: false };
  });

  fastify.post('/commercial-products/freight-forwarder/preview', async (request, reply) => {
    const line = z.object({
      quantity: z.number().int().min(0).max(1_000_000),
      unit_price_tzs: freightUnitRate,
    });
    const parsed = z.object({
      discount_percent: freightDiscount,
      products: z.object({ clearos: line, hudufreight: line, cargotracker: line }),
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Enter whole-number quantities and TZS rates, and a discount from 0 to 100.' });
    }

    const lines = Object.entries(parsed.data.products).map(([key, line]) =>
      quoteFreightLine(key, line.quantity, line.unit_price_tzs, parsed.data.discount_percent));
    return { lines, total_tzs: lines.reduce((total, item) => total + item.total_tzs, 0) };
  });

  fastify.post('/commercial-products/freight-forwarder/tenant-preview', async (request, reply) => {
    const parsed = z.object({
      tenant_id: z.string().uuid(),
      revision: z.number().int().positive(),
      period: freightPreviewPeriod,
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Select a tenant, save the draft, and enter a UTC period of 1 to 366 days.' });
    }
    const { tenant_id, period, revision } = parsed.data;
    const tenant = await dbPlatform.selectFrom('tenants').select('id').where('id', '=', tenant_id).executeTakeFirst();
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found.' });

    const draft = await dbPlatform.selectFrom('commercial_pricing_drafts').select('configuration')
      .where('bundle_key', '=', freightBundleKey).where('revision', '=', revision).executeTakeFirst();
    if (!draft) return reply.status(409).send({ error: 'Reload the current saved pricing draft before testing.' });

    const configuration = freightDraft.parse(JSON.parse(draft.configuration));
    const usage = await getFreightUsagePreview(tenant_id, period);
    if (usage.data.some(line => line.quantity > 1_000_000)) {
      return reply.status(422).send({ error: 'Select a shorter period to preview this volume.' });
    }
    const lines = usage.data.map(({ product_key, quantity, unit }) => ({
      ...quoteFreightLine(product_key, quantity, configuration.rates[product_key], configuration.discount_percent),
      unit,
    }));
    await PlatformAdminService.recordActivity({
      ...actor(request), category: 'system', action: 'Previewed freight pricing for tenant',
      targetType: 'tenant', targetId: tenant_id, targetName: null, tenantId: tenant_id,
      metadata: { revision, ...period },
    });
    const marked = await dbPlatform.updateTable('commercial_pricing_drafts')
      .set({ tested_revision: revision })
      .where('bundle_key', '=', freightBundleKey).where('revision', '=', revision)
      .returning('revision').executeTakeFirst();
    if (!marked) return reply.status(409).send({ error: 'The draft changed during the test. Reload it and test again.' });
    return { tenant_id, revision, period, lines, total_tzs: lines.reduce((total, line) => total + line.total_tzs, 0) };
  });

  fastify.get('/commercial-products/freight-forwarder/versions', async () => ({
    data: await getFreightPricingVersions(true),
  }));

  fastify.post('/commercial-products/freight-forwarder/pilot-invitations', async (request, reply) => {
    const input = z.object({ tenant_id: z.string().uuid() }).safeParse(request.body);
    if (!input.success) return reply.status(400).send({ error: 'Select a workspace to invite.' });
    const { tenant_id } = input.data;
    const [rateCard] = await getFreightPricingVersions(false);
    if (!rateCard) return reply.status(409).send({ error: 'An effective rate card is required before inviting a workspace.' });
    const tenant = await dbPlatform.selectFrom('tenants').select('id')
      .where('id', '=', tenant_id).where('active', '=', true).executeTakeFirst();
    if (!tenant) return reply.status(404).send({ error: 'Active workspace not found.' });

    const invitation = await dbPlatform.insertInto('freight_usage_pilot')
      .values({ tenant_id, invited_by: request.user.sub })
      .onConflict(conflict => conflict.column('tenant_id').doNothing())
      .returning(['invited_at', 'accepted_at', 'starts_at'])
      .executeTakeFirst();
    const data = invitation ?? await dbPlatform.selectFrom('freight_usage_pilot')
      .select(['invited_at', 'accepted_at', 'starts_at']).where('tenant_id', '=', tenant_id).executeTakeFirstOrThrow();
    return reply.status(invitation ? 201 : 200).send({ data });
  });

  fastify.get('/commercial-products/freight-forwarder/pilot-drafts/:tenantId', async (request, reply) => {
    const params = z.object({ tenantId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Select a valid workspace.' });
    return { data: await listFreightPilotDrafts(params.data.tenantId) };
  });

  fastify.get('/commercial-products/freight-forwarder/pilot-drafts/:tenantId/:id', async (request, reply) => {
    const params = z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Select a valid workspace and draft.' });
    const { tenantId, id } = params.data;
    const draft = await getFreightPilotDraft(tenantId, id);
    if (!draft) return reply.status(404).send({ error: 'Pilot invoice draft not found.' });
    await PlatformAdminService.recordActivity({
      ...actor(request), category: 'billing', action: 'Opened freight pilot invoice draft',
      targetType: 'freight_pilot_invoice_draft', targetId: id, tenantId,
    });
    return draft;
  });

  fastify.post('/commercial-products/freight-forwarder/publish', async (request, reply) => {
    const parsed = z.object({ revision: z.number().int().positive(), effective_on: z.string().date() })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Enter a valid draft revision and effective date.' });
    const { revision, effective_on } = parsed.data;
    const today = new Date().toISOString().slice(0, 10);
    if (effective_on <= today) return reply.status(400).send({ error: 'Choose a future effective date in UTC.' });

    const result = await dbPlatform.transaction().execute(async trx => {
      const draft = await trx.selectFrom('commercial_pricing_drafts')
        .select(['revision', 'tested_revision', 'configuration'])
        .where('bundle_key', '=', freightBundleKey).forUpdate().executeTakeFirst();
      if (!draft || draft.revision !== revision || draft.tested_revision !== revision) {
        return { error: 'Reload and test the current saved draft before publishing.' };
      }
      const scheduled = await trx.selectFrom('commercial_pricing_versions').select('effective_on')
        .where('bundle_key', '=', freightBundleKey).where('effective_on', '>', today).executeTakeFirst();
      if (scheduled) return { error: 'A rate card is already scheduled. Wait until it takes effect before publishing another.' };
      const published = await trx.insertInto('commercial_pricing_versions')
        .values({ bundle_key: freightBundleKey, revision, effective_on, configuration: draft.configuration, published_by: request.user.sub })
        .onConflict(conflict => conflict.doNothing())
        .returning(['revision', 'effective_on']).executeTakeFirst();
      return published ? { published } : { error: 'This revision or effective date has already been published.' };
    });
    if (!result.published) return reply.status(409).send({ error: result.error });
    return reply.status(201).send(result.published);
  });

  fastify.patch<{ Params: { productKey: string }; Body: { readiness_state: string } }>(
    '/commercial-products/:productKey',
    async (request, reply) => {
      const { productKey } = request.params;
      const { readiness_state } = request.body;
      const user = request.user;
      const valid = ['internal', 'pilot', 'sellable', 'limited_availability', 'general_availability', 'suspended', 'retired'];
      if (!valid.includes(readiness_state)) {
        return reply.status(400).send({ error: `readiness_state must be one of: ${valid.join(', ')}` });
      }

      const existing = await dbPlatform.selectFrom('commercial_products').select('id').where('product_key', '=', productKey).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: `Unknown commercial product: ${productKey}` });

      await dbPlatform.updateTable('commercial_products')
        .set({ readiness_state: readiness_state as any, updated_at: new Date() })
        .where('product_key', '=', productKey)
        .execute();

      const row = await dbPlatform.selectFrom('commercial_products').selectAll().where('product_key', '=', productKey).executeTakeFirstOrThrow();
      await PlatformAdminService.recordActivity({
        ...actor(request), category: 'system',
        action: `Set ${productKey} readiness to ${readiness_state}`,
        targetType: 'commercial_product', targetId: null, targetName: productKey, tenantId: null,
        metadata: { readiness_state },
      });
      return { commercialProduct: row };
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

  // ─── Provider Rates (platform-wide ESB pricing) ──────────────────

  fastify.get('/provider-rates', async () => {
    return dbPlatform.selectFrom('provider_rates')
      .selectAll()
      .orderBy('service_kind', 'asc')
      .orderBy('provider', 'asc')
      .orderBy('effective_from', 'desc')
      .execute();
  });

  const providerRateSchema = z.object({
    service_kind: z.string().min(1).max(50),
    provider: z.string().min(1).max(100),
    rate_tzs: z.number().positive(),
    unit_label: z.string().min(1).max(50),
    supplier_rate: z.number().positive().nullable().optional(),
    supplier_currency: z.string().length(3).nullable().optional(),
    is_active: z.boolean().optional(),
    is_published: z.boolean().optional(),
    effective_from: z.string().optional(),
  });

  fastify.post('/provider-rates', async (request: any) => {
    const body = providerRateSchema.parse(request.body);
    return dbPlatform.insertInto('provider_rates').values({
      service_kind: body.service_kind,
      provider: body.provider,
      rate_tzs: body.rate_tzs,
      unit_label: body.unit_label,
      supplier_rate: body.supplier_rate ?? null,
      supplier_currency: body.supplier_currency ?? null,
      is_active: body.is_active ?? true,
      is_published: body.is_published ?? false,
      effective_from: body.effective_from ? new Date(body.effective_from) : new Date(),
    }).returningAll().executeTakeFirstOrThrow();
  });

  fastify.put('/provider-rates/:id', async (request: any) => {
    const { id } = request.params;
    const body = providerRateSchema.partial().parse(request.body);
    const updates: Record<string, any> = {};
    if (body.rate_tzs != null) updates.rate_tzs = body.rate_tzs;
    if (body.unit_label != null) updates.unit_label = body.unit_label;
    if (body.supplier_rate !== undefined) updates.supplier_rate = body.supplier_rate;
    if (body.supplier_currency !== undefined) updates.supplier_currency = body.supplier_currency;
    if (body.is_active != null) updates.is_active = body.is_active;
    if (body.is_published != null) updates.is_published = body.is_published;
    if (body.effective_from) updates.effective_from = new Date(body.effective_from);
    return dbPlatform.updateTable('provider_rates').set(updates)
      .where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  });

  // ─── Tenant Service Config (per-tenant ESB metering flags) ───────

  fastify.get('/tenants/:tenantId/service-config', async (request: any) => {
    const { tenantId } = request.params;
    return withTenant(tenantId, trx =>
      trx.selectFrom('tenant_service_config')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .execute()
    );
  });

  const serviceConfigSchema = z.object({
    service_kind: z.string().min(1).max(50),
    credential_owner: z.enum(['tenant', 'platform', 'hybrid']),
    esb_metered: z.boolean(),
    is_enabled: z.boolean().optional(),
    rate_override: z.number().positive().nullable().optional(),
  });

  fastify.put('/tenants/:tenantId/service-config/:serviceKind', async (request: any) => {
    const { tenantId, serviceKind } = request.params;
    const body = serviceConfigSchema.parse({ ...request.body, service_kind: serviceKind });
    return withTenant(tenantId, async trx => {
      const existing = await trx.selectFrom('tenant_service_config')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('service_kind', '=', serviceKind)
        .executeTakeFirst();
      if (existing) {
        return trx.updateTable('tenant_service_config').set({
          credential_owner: body.credential_owner,
          esb_metered: body.esb_metered,
          is_enabled: body.is_enabled ?? true,
          rate_override: body.rate_override ?? null,
          updated_at: new Date(),
        }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow();
      }
      return trx.insertInto('tenant_service_config').values({
        tenant_id: tenantId,
        service_kind: serviceKind,
        credential_owner: body.credential_owner,
        esb_metered: body.esb_metered,
        is_enabled: body.is_enabled ?? true,
        rate_override: body.rate_override ?? null,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  // ─── Implementation Engagements ──────────────────────────────────

  fastify.get('/tenants/:tenantId/implementations', async (request: any) => {
    const { tenantId } = request.params;
    return withTenant(tenantId, trx =>
      trx.selectFrom('implementation_engagements')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .execute()
    );
  });

  const implSchema = z.object({
    engagement_type: z.enum(['included_setup', 'paid_implementation', 'migration', 'training', 'custom_config']).default('included_setup'),
    scope_summary: z.string().max(2000).optional(),
    scope_details: z.record(z.string(), z.unknown()).optional(),
    deal_id: z.string().uuid().nullable().optional(),
    project_id: z.string().uuid().nullable().optional(),
    quoted_hours: z.number().min(0).nullable().optional(),
    quoted_amount: z.number().min(0).nullable().optional(),
    currency: z.string().length(3).default('TZS'),
  });

  fastify.post('/tenants/:tenantId/implementations', async (request: any) => {
    const { tenantId } = request.params;
    const body = implSchema.parse(request.body);
    return withTenant(tenantId, trx =>
      trx.insertInto('implementation_engagements').values({
        tenant_id: tenantId,
        engagement_type: body.engagement_type,
        scope_summary: body.scope_summary ?? null,
        scope_details: body.scope_details ?? {},
        deal_id: body.deal_id ?? null,
        project_id: body.project_id ?? null,
        quoted_hours: body.quoted_hours ?? null,
        quoted_amount: body.quoted_amount ?? null,
        currency: body.currency,
        created_by: request.user.sub,
      }).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.put('/tenants/:tenantId/implementations/:id', async (request: any) => {
    const { tenantId, id } = request.params;
    const body = z.object({
      status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).optional(),
      scope_summary: z.string().max(2000).optional(),
      actual_hours: z.number().min(0).optional(),
      consent_at: z.string().optional(),
      started_at: z.string().optional(),
      completed_at: z.string().optional(),
      invoice_id: z.string().uuid().nullable().optional(),
      notes: z.string().max(4000).optional(),
    }).parse(request.body);
    const updates: Record<string, any> = { updated_at: new Date() };
    if (body.status) updates.status = body.status;
    if (body.scope_summary !== undefined) updates.scope_summary = body.scope_summary;
    if (body.actual_hours !== undefined) updates.actual_hours = body.actual_hours;
    if (body.consent_at) { updates.consent_at = new Date(body.consent_at); updates.consent_by = request.user.sub; }
    if (body.started_at) updates.started_at = new Date(body.started_at);
    if (body.completed_at) { updates.completed_at = new Date(body.completed_at); updates.delivered_by = request.user.sub; }
    if (body.invoice_id !== undefined) updates.invoice_id = body.invoice_id;
    if (body.notes !== undefined) updates.notes = body.notes;
    return withTenant(tenantId, trx =>
      trx.updateTable('implementation_engagements').set(updates)
        .where('id', '=', id).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  // ─── Support Time ────────────────────────────────────────────────

  fastify.get('/tenants/:tenantId/support-time', async (request: any) => {
    const { SupportTimeService } = await import('../services/support-time.service.js');
    const { tenantId } = request.params;
    const query = request.query as { limit?: string; offset?: string; category?: string };
    return SupportTimeService.getEntries(tenantId, {
      limit: query.limit ? Number(query.limit) : 50,
      offset: query.offset ? Number(query.offset) : undefined,
      category: query.category,
    });
  });

  fastify.get('/tenants/:tenantId/support-time/summary', async (request: any) => {
    const { SupportTimeService } = await import('../services/support-time.service.js');
    return SupportTimeService.getSummary(request.params.tenantId);
  });

  fastify.post('/tenants/:tenantId/support-time', async (request: any) => {
    const { SupportTimeService } = await import('../services/support-time.service.js');
    const body = z.object({
      category: z.enum(['included', 'paid_support', 'implementation', 'sales_assistance', 'escalation']),
      duration_minutes: z.number().int().min(1),
      summary: z.string().min(1).max(2000),
      agent_name: z.string().max(200).optional(),
      ticket_ref: z.string().max(200).optional(),
      engagement_id: z.string().uuid().optional(),
    }).parse(request.body);
    return SupportTimeService.record(request.params.tenantId, {
      ...body,
      agent_user_id: request.user.sub,
    });
  });

  fastify.get('/support-cost-config', async () => {
    const { SupportTimeService } = await import('../services/support-time.service.js');
    return SupportTimeService.getCostConfig();
  });

  fastify.put('/support-cost-config/:category', async (request: any) => {
    const { SupportTimeService } = await import('../services/support-time.service.js');
    const { category } = request.params;
    const { loaded_cost_per_hour } = z.object({ loaded_cost_per_hour: z.number().min(0) }).parse(request.body);
    await SupportTimeService.updateCostConfig(category, loaded_cost_per_hour);
    return { success: true };
  });

  // ─── Feature Flags (SuperAdmin management) ───────────────────────

  fastify.get('/tenants/:tenantId/feature-flags', async (request: any) => {
    const { tenantId } = request.params;
    return withTenant(tenantId, trx =>
      trx.selectFrom('tenant_feature_flags').selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('flag_key', 'asc')
        .execute()
    );
  });

  fastify.put('/tenants/:tenantId/feature-flags/:flagKey', async (request: any) => {
    const { tenantId, flagKey } = request.params;
    const body = z.object({
      enabled: z.boolean(),
      config: z.record(z.string(), z.unknown()).optional(),
      reason: z.string().max(500).optional(),
      expires_at: z.string().nullable().optional(),
    }).parse(request.body);

    return withTenant(tenantId, async trx => {
      const existing = await trx.selectFrom('tenant_feature_flags')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('flag_key', '=', flagKey)
        .executeTakeFirst();

      if (existing) {
        return trx.updateTable('tenant_feature_flags').set({
          enabled: body.enabled,
          config: body.config ?? {},
          set_by: request.user.sub,
          reason: body.reason ?? null,
          expires_at: body.expires_at ? new Date(body.expires_at) : null,
          updated_at: new Date(),
        }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow();
      }
      return trx.insertInto('tenant_feature_flags').values({
        tenant_id: tenantId,
        flag_key: flagKey,
        enabled: body.enabled,
        config: body.config ?? {},
        set_by: request.user.sub,
        reason: body.reason ?? null,
        expires_at: body.expires_at ? new Date(body.expires_at) : null,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Commercial Analytics (Phase 5) ──────────────────────────────
  fastify.get('/analytics/overview', async () => {
    const [workspaces, mrr, esb, support, subscriptionMargin] = await Promise.all([
      CommercialAnalyticsService.getPayingWorkspaces(),
      CommercialAnalyticsService.getMrr(),
      CommercialAnalyticsService.getEsbMargin(),
      CommercialAnalyticsService.getSupportCostSummary(),
      CommercialAnalyticsService.getSubscriptionMargin(),
    ]);
    return { workspaces, mrr, esb, support, subscriptionMargin };
  });

  fastify.get('/analytics/retention', async (request: any) => {
    const windowDays = Number(request.query?.window_days) || 30;
    return CommercialAnalyticsService.getRetentionCohorts(windowDays);
  });

  fastify.get('/analytics/churn', async (request: any) => {
    const months = Number(request.query?.months) || 6;
    return CommercialAnalyticsService.getChurnUpgrades(months);
  });

  fastify.get('/analytics/revenue-timeline', async (request: any) => {
    const months = Number(request.query?.months) || 12;
    return CommercialAnalyticsService.getRevenueTimeline(months);
  });

  fastify.get('/analytics/active-checkpoints', async () => {
    return CommercialAnalyticsService.getActiveApps();
  });

  fastify.get('/analytics/provider-reliability', async () => {
    return CommercialAnalyticsService.getProviderReliability();
  });
}
