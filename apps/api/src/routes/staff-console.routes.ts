/**
 * Staff console API — /v1/staff/*
 *
 * Every route: authenticate → requireStaffMember (fresh staff context) →
 * a permission check → scope filters applied in SQL for lists/counts/search
 * and per-record for detail and mutations. Customer ids, app ids and
 * permissions from the browser are inputs to check, never trusted.
 *
 * Platform-wide reads go through dbPlatform with explicit bounds (limits,
 * time windows) and only the columns each view needs.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import {
  ALL_APP_IDS, staffTools, ALL_STAFF_PERMISSIONS, STAFF_HOMES, STAFF_PERMISSIONS, STAFF_ROLE_TEMPLATES,
  type StaffHomeId, type StaffMe,
} from '@hudumika/types';
import { dbPlatform } from '../db/client.js';
import {
  StaffAccessError, activeSuperAdminCount, assertCan, assertCanGrant, assertCustomer, can, canCase, canCustomer, canProduct,
  caseScopeSql, customerScopeSql, homeFor, productsInScope, requireStaffMember, staffAudit, staffErrorReply, type StaffContext,
} from '../services/staff-access.service.js';
import { assignmentHistory } from '../services/staff-cases.service.js';
import { tenantHasEntitlement } from '../middleware/entitlement.js';
import { appIdForPath } from '../services/zentra-telemetry.service.js';
import { currentAccessSession } from './staff-cases.routes.js';
import { hasPlatformWideScope } from '../services/platform-admin-access.js';

const uuid = z.string().uuid();
const APP_IDS = new Set<string>(ALL_APP_IDS.filter(a => a !== 'lens'));
const appId = z.string().refine(a => APP_IDS.has(a), 'Unknown product');
const isoDate = z.string().datetime({ offset: true });
const OPEN = ['OPEN', 'IN_PROGRESS'] as const;

const S = (r: FastifyRequest) => r.staff as StaffContext;

/** Wraps a handler so StaffAccessError becomes a clean JSON reply. */
function h<T extends FastifyRequest>(fn: (req: T, reply: any) => Promise<unknown>) {
  return async (req: T, reply: any) => { try { return await fn(req, reply); } catch (e) { return staffErrorReply(reply, e); } };
}

/**
 * GET /v1/staff-entry — does the signed-in user have an active staff record?
 * One indexed lookup, used only to show the "Admin Console" link in the app
 * header. It grants nothing: the console itself re-checks grants via /me. An
 * impersonated session is never staff. A SUPER_ADMIN account counts (it is
 * bootstrapped on its first console visit).
 */
export async function staffEntryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.get('/', async req => {
    const u = (req as any).user as { sub?: string; role?: string; impersonated_by?: string };
    if (!u?.sub || u.impersonated_by) return { staff: false };
    if (u.role === 'SUPER_ADMIN') return { staff: true };
    const m = await dbPlatform.selectFrom('staff_members').select('status').where('user_id', '=', u.sub).executeTakeFirst();
    return { staff: m?.status === 'active' };
  });
}

export async function staffConsoleRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireStaffMember);

  // ── Me / landing ────────────────────────────────────────────────────────
  fastify.get('/me', h(async req => {
    const ctx = S(req);
    const home = homeFor(ctx);
    const session = await currentAccessSession(ctx);
    const me: StaffMe = {
      userId: ctx.userId, name: ctx.name, email: ctx.email, avatarUrl: ctx.avatarUrl,
      roles: ctx.roles.map(r => ({ key: r.key, name: r.name, expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null })),
      permissions: [...ctx.permissions].sort(), scope: ctx.scope, teams: ctx.teams.map(t => ({ id: t.id, name: t.name, kind: t.kind })),
      home: home.home, homePath: home.homePath, preferredHome: ctx.preferredHome, availableHomes: home.availableHomes,
      sections: home.sections, isSuperAdmin: ctx.isSuperAdmin,
      platformWide: hasPlatformWideScope(ctx),
      tools: staffTools([...ctx.permissions], ctx.isSuperAdmin, hasPlatformWideScope(ctx)).map(t => t.id),
      activeAccessSession: session,
    };
    return me;
  }));

  fastify.put('/me/home', h(async (req, reply) => {
    const ctx = S(req);
    const b = z.object({ home: z.string().nullable() }).parse(req.body);
    if (b.home !== null && !homeFor(ctx).availableHomes.includes(b.home as StaffHomeId)) return reply.status(400).send({ error: 'That home is not available with your access.' });
    await dbPlatform.updateTable('staff_members').set({ preferred_home: b.home, updated_at: new Date() }).where('user_id', '=', ctx.userId).execute();
    return { home: b.home };
  }));

  // ── Overview (counters scoped to the viewer) ───────────────────────────
  fastify.get('/overview', h(async req => {
    const ctx = S(req);
    assertCan(ctx, 'overview.platform', 'overview.operations', 'monitoring.view', 'security.view', 'billing.view');
    const out: Record<string, unknown> = { scope: ctx.scope };
    if (can(ctx, 'customers.view', 'overview.platform', 'overview.operations')) {
      const c = await dbPlatform.selectFrom('tenants').select([
        sql<number>`count(*)::int`.as('customers'), sql<number>`count(*) FILTER (WHERE active)::int`.as('active'),
      ]).where(customerScopeSql(ctx, 'tenants.id')).executeTakeFirstOrThrow();
      out.customers = c;
    }
    if (can(ctx, 'cases.view')) {
      const r = await dbPlatform.selectFrom('platform_support_tickets as t').select([
        sql<number>`count(*) FILTER (WHERE t.status IN ('OPEN','IN_PROGRESS'))::int`.as('open'),
        sql<number>`count(*) FILTER (WHERE t.status IN ('OPEN','IN_PROGRESS') AND t.owner_user_id IS NULL)::int`.as('unassigned'),
        sql<number>`count(*) FILTER (WHERE t.status IN ('OPEN','IN_PROGRESS') AND t.escalated)::int`.as('escalated'),
        sql<number>`count(*) FILTER (WHERE t.status IN ('OPEN','IN_PROGRESS') AND t.sla_paused_at IS NULL AND ((t.first_response_at IS NULL AND t.first_response_due_at < now()) OR t.resolution_due_at < now()))::int`.as('overdue'),
        sql<number>`count(*) FILTER (WHERE t.status IN ('OPEN','IN_PROGRESS') AND t.owner_user_id = ${ctx.userId})::int`.as('mine'),
        sql<number>`count(*) FILTER (WHERE t.status IN ('RESOLVED','CLOSED') AND t.customer_outcome = 'pending')::int`.as('awaiting_outcome'),
      ]).where(caseScopeSql(ctx, 't.tenant_id', 't.app')).executeTakeFirstOrThrow();
      out.cases = r;
    }
    if (can(ctx, 'incidents.view')) {
      const products = productsInScope(ctx);
      out.incidents = products.length ? await dbPlatform.selectFrom('platform_incidents').select(['id', 'ref', 'app_id', 'title', 'severity', 'status', 'started_at'])
        .where('status', '<>', 'resolved').where('app_id', 'in', products).orderBy('started_at', 'desc').limit(20).execute() : [];
    }
    if (can(ctx, 'overview.platform')) {
      const u = await dbPlatform.selectFrom('users').select(sql<number>`count(*)::int`.as('users')).where('active', 'is not', false).executeTakeFirstOrThrow();
      out.platform = { users: u.users, products: APP_IDS.size };
    }
    return out;
  }));

  // ── Customers ───────────────────────────────────────────────────────────
  const customerList = async (ctx: StaffContext, q: { q?: string; mine?: string; limit?: string; offset?: string; plan?: string }) => {
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const offset = Math.min(Math.max(Number(q.offset) || 0, 0), 100000);
    let sel = dbPlatform.selectFrom('tenants as t')
      .leftJoin('staff_customer_accounts as a', 'a.tenant_id', 't.id')
      .leftJoin('users as o', 'o.id', 'a.owner_user_id')
      .select(['t.id', 't.name', 't.slug', 't.plan', 't.active', 't.logo_url', 't.created_at', 'a.owner_user_id', 'o.name as owner_name', 'o.avatar_url as owner_avatar_url',
        sql<number>`(SELECT count(*)::int FROM platform_support_tickets x WHERE x.tenant_id = t.id AND x.status IN ('OPEN','IN_PROGRESS'))`.as('open_cases')])
      .where(customerScopeSql(ctx, 't.id'));
    if (q.q?.trim()) { const like = `%${q.q.trim().replace(/[\\%_]/g, '\\$&')}%`; sel = sel.where(eb => eb.or([eb('t.name', 'ilike', like), eb('t.slug', 'ilike', like)])); }
    if (q.mine === '1') sel = sel.where(eb => eb.or([eb('a.owner_user_id', '=', ctx.userId), eb('a.backup_owner_user_id', '=', ctx.userId)]));
    if (q.plan) sel = sel.where('t.plan', '=', q.plan as any);
    const rows = await sel.orderBy('t.name').limit(limit + 1).offset(offset).execute();
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  };

  fastify.get('/customers', h(async req => {
    const ctx = S(req); assertCan(ctx, 'customers.view');
    return customerList(ctx, req.query as any);
  }));

  fastify.get('/customers/export', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'customers.export');
    const all: any[] = [];
    for (let offset = 0; offset < 5000; offset += 200) {
      const page = await customerList(ctx, { ...(req.query as any), limit: '200', offset: String(offset) });
      all.push(...page.items); if (!page.hasMore) break;
    }
    await staffAudit(ctx, { action: 'customers.export', targetType: 'customer_list', detail: { rows: all.length, filters: req.query as any } });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['id,name,slug,plan,active,owner,open_cases', ...all.map(r => [r.id, r.name, r.slug, r.plan, r.active, r.owner_name, r.open_cases].map(esc).join(','))].join('\n');
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="customers.csv"');
    return csv;
  }));

  /** The customer operations profile. Relationship metadata needs customers.view;
   *  billing needs billing.view; workspace business records need an access session. */
  fastify.get('/customers/:id', h(async req => {
    const ctx = S(req); assertCan(ctx, 'customers.view');
    const id = uuid.parse((req.params as any).id); assertCustomer(ctx, id);
    const tenant = await dbPlatform.selectFrom('tenants').select(['id', 'name', 'slug', 'plan', 'active', 'logo_url', 'country', 'kyb_status', 'created_at']).where('id', '=', id).executeTakeFirst();
    if (!tenant) throw new StaffAccessError(404, 'Customer not found.');
    const [account, teams, contacts, appStatus, usage, checkpoints, failures, history, accessSessions] = await Promise.all([
      dbPlatform.selectFrom('staff_customer_accounts as a').leftJoin('users as o', 'o.id', 'a.owner_user_id').leftJoin('users as b', 'b.id', 'a.backup_owner_user_id')
        .select(['a.owner_user_id', 'o.name as owner_name', 'o.avatar_url as owner_avatar_url', 'a.backup_owner_user_id', 'b.name as backup_name', 'b.avatar_url as backup_avatar_url', 'a.standing_authorization', 'a.max_session_minutes', 'a.notes', 'a.updated_at'])
        .where('a.tenant_id', '=', id).executeTakeFirst(),
      dbPlatform.selectFrom('staff_team_customers as c').innerJoin('staff_teams as t', 't.id', 'c.team_id').select(['t.id', 't.name', 't.kind']).where('c.tenant_id', '=', id).execute(),
      dbPlatform.selectFrom('staff_customer_contacts').selectAll().where('tenant_id', '=', id).orderBy('escalation_order').orderBy('created_at').limit(50).execute(),
      dbPlatform.selectFrom('app_status').select(['app_id', 'status']).execute(),
      dbPlatform.selectFrom('tenant_app_usage_counters').select(['app_id', sql<number>`sum(count)::int`.as('total'), sql<string>`max(period)`.as('last_period')]).where('tenant_id', '=', id).groupBy('app_id').execute(),
      dbPlatform.selectFrom('tenant_activation_checkpoints').select(['checkpoint_key', 'completed_at']).where('tenant_id', '=', id).orderBy('completed_at').limit(100).execute(),
      dbPlatform.selectFrom('api_usage_events').select([sql<string>`split_part(path, '/', 3)`.as('seg'), sql<number>`count(*)::int`.as('requests'), sql<number>`count(*) FILTER (WHERE status_code >= 500)::int`.as('server_errors')])
        .where('tenant_id', '=', id).where('created_at', '>', sql<Date>`now() - interval '24 hours'`).groupBy(sql`split_part(path, '/', 3)`).limit(200).execute(),
      dbPlatform.selectFrom('staff_assignment_history').selectAll().where('subject_type', '=', 'customer').where('subject_id', '=', id).orderBy('created_at', 'desc').limit(50).execute(),
      dbPlatform.selectFrom('staff_access_sessions as s').innerJoin('users as u', 'u.id', 's.staff_user_id')
        .select(['s.id', 's.status', 's.purpose', 's.actions', 's.app_id', 's.basis', 's.starts_at', 's.expires_at', 's.ended_at', 'u.name as staff_name', 'u.avatar_url as staff_avatar_url'])
        .where('s.tenant_id', '=', id).orderBy('s.created_at', 'desc').limit(20).execute(),
    ]);
    const maintenance = new Set(appStatus.filter(a => a.status === 'maintenance').map(a => a.app_id));
    const usageBy = new Map(usage.map(u => [u.app_id, u]));
    const reqBy = new Map<string, { requests: number; server_errors: number }>();
    for (const f of failures) { const a = appIdForPath(`/v1/${f.seg}`); const cur = reqBy.get(a) ?? { requests: 0, server_errors: 0 }; reqBy.set(a, { requests: cur.requests + f.requests, server_errors: cur.server_errors + f.server_errors }); }
    // Entitlement, activation, readiness and observed health are reported
    // separately: being entitled says nothing about whether it is in use or healthy.
    const products = await Promise.all(productsInScope(ctx).map(async app => {
      const entitled = maintenance.has(app) ? null : await tenantHasEntitlement(id, app).catch(() => null);
      const u = usageBy.get(app); const r = reqBy.get(app);
      return {
        app, entitled, maintenance: maintenance.has(app),
        activated: !!u && u.total > 0, lastActivePeriod: u?.last_period ?? null,
        health: maintenance.has(app) ? 'maintenance' : !r ? 'unknown' : r.server_errors / Math.max(r.requests, 1) > 0.05 ? 'degraded' : 'healthy',
        requests24h: r?.requests ?? 0, serverErrors24h: r?.server_errors ?? 0,
      };
    }));
    const cases = await dbPlatform.selectFrom('platform_support_tickets as t').leftJoin('users as o', 'o.id', 't.owner_user_id')
      .select(['t.id', 't.ref_number', 't.subject', 't.app', 't.status', 't.priority', 't.severity', 't.owner_user_id', 'o.name as owner_name', 't.first_response_due_at', 't.first_response_at', 't.resolution_due_at', 't.sla_paused_at', 't.customer_outcome', 't.created_at'])
      .where('t.tenant_id', '=', id).where(caseScopeSql(ctx, 't.tenant_id', 't.app')).orderBy('t.created_at', 'desc').limit(50).execute();
    const onboardingOpen = await dbPlatform.selectFrom('platform_support_tickets').select(sql<number>`count(*)::int`.as('n'))
      .where('tenant_id', '=', id).where('category', '=', 'onboarding').where('status', 'in', [...OPEN]).executeTakeFirstOrThrow();
    const integrations = await Promise.all([
      dbPlatform.selectFrom('email_outbox').select([sql<number>`count(*) FILTER (WHERE status = 'failed')::int`.as('failed'), sql<number>`count(*) FILTER (WHERE status = 'pending')::int`.as('pending')]).where('tenant_id', '=', id).where('created_at', '>', sql<Date>`now() - interval '7 days'`).executeTakeFirstOrThrow(),
      dbPlatform.selectFrom('mcp_connections').select(sql<number>`count(*)::int`.as('n')).where('tenant_id', '=', id).where('status', '=', 'active').executeTakeFirstOrThrow(),
    ]);
    let billing: unknown = { restricted: true };
    if (can(ctx, 'billing.view')) {
      const [subs, invoices] = await Promise.all([
        dbPlatform.selectFrom('tenant_product_subscriptions').select(['id', 'commercial_product_id', 'package_code', 'status', 'started_at', 'cancel_at']).where('tenant_id', '=', id).limit(50).execute(),
        dbPlatform.selectFrom('subscription_invoices').select(['id', 'invoice_number', 'plan_code', 'currency', 'amount', 'period_start', 'period_end', 'due_date', 'status' as any]).where('tenant_id', '=', id).orderBy('period_start', 'desc').limit(12).execute(),
      ]);
      billing = { restricted: false, subscriptions: subs, invoices };
    }
    return {
      customer: tenant,
      ownership: account ?? null, teams, contacts,
      products, onboarding: { checkpoints, openOnboardingCases: onboardingOpen.n },
      cases, integrations: { email7d: integrations[0], activeMcpConnections: integrations[1].n },
      billing, history, accessSessions,
      // Owning a customer gives relationship metadata, not its business records.
      recordsAccess: 'Open an access session to see this customer’s workspace records.',
    };
  }));

  fastify.put('/customers/:id/ownership', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'customers.manage');
    const id = uuid.parse((req.params as any).id); assertCustomer(ctx, id);
    const b = z.object({
      owner_user_id: uuid.nullable().optional(), backup_owner_user_id: uuid.nullable().optional(),
      standing_authorization: z.boolean().optional(), max_session_minutes: z.number().int().min(5).max(480).optional(),
      notes: z.string().max(5000).optional(), reason: z.string().trim().min(3).max(500),
    }).parse(req.body);
    for (const u of [b.owner_user_id, b.backup_owner_user_id]) {
      if (u && !(await dbPlatform.selectFrom('staff_members').select('user_id').where('user_id', '=', u).where('status', '=', 'active').executeTakeFirst())) return reply.status(400).send({ error: 'Owners must be active staff members.' });
    }
    if (b.standing_authorization !== undefined && !can(ctx, 'access.approve')) return reply.status(403).send({ error: 'Changing standing authorization needs the access-approval permission.' });
    const prev = await dbPlatform.selectFrom('staff_customer_accounts').selectAll().where('tenant_id', '=', id).executeTakeFirst();
    const next = {
      owner_user_id: b.owner_user_id !== undefined ? b.owner_user_id : prev?.owner_user_id ?? null,
      backup_owner_user_id: b.backup_owner_user_id !== undefined ? b.backup_owner_user_id : prev?.backup_owner_user_id ?? null,
      standing_authorization: b.standing_authorization ?? prev?.standing_authorization ?? false,
      max_session_minutes: b.max_session_minutes ?? prev?.max_session_minutes ?? 60,
      notes: b.notes ?? prev?.notes ?? '',
    };
    if (next.owner_user_id && next.owner_user_id === next.backup_owner_user_id) return reply.status(400).send({ error: 'The backup owner must be a different person.' });
    await dbPlatform.insertInto('staff_customer_accounts').values({ tenant_id: id, ...next, updated_by: ctx.userId, updated_at: new Date() })
      .onConflict(oc => oc.column('tenant_id').doUpdateSet({ ...next, updated_by: ctx.userId, updated_at: new Date() })).execute();
    if ((prev?.owner_user_id ?? null) !== next.owner_user_id) await assignmentHistory({ subjectType: 'customer', subjectId: id, action: 'owner_changed', actor: ctx.userId, fromUser: prev?.owner_user_id ?? null, toUser: next.owner_user_id, reason: b.reason });
    if ((prev?.backup_owner_user_id ?? null) !== next.backup_owner_user_id) await assignmentHistory({ subjectType: 'customer', subjectId: id, action: 'backup_owner_changed', actor: ctx.userId, fromUser: prev?.backup_owner_user_id ?? null, toUser: next.backup_owner_user_id, reason: b.reason });
    await staffAudit(ctx, { action: 'customer.ownership_changed', targetType: 'customer', targetId: id, tenantId: id, purpose: b.reason, detail: { from: prev ?? null, to: next } });
    return next;
  }));

  fastify.post('/customers/:id/contacts', h(async req => {
    const ctx = S(req); assertCan(ctx, 'customers.manage');
    const id = uuid.parse((req.params as any).id); assertCustomer(ctx, id);
    const b = z.object({ name: z.string().trim().min(1).max(200), email: z.string().email().max(320).optional(), phone: z.string().max(50).optional(),
      contact_role: z.enum(['primary', 'billing', 'technical', 'executive', 'escalation']).default('primary'), escalation_order: z.number().int().min(1).max(20).optional() }).parse(req.body);
    const row = await dbPlatform.insertInto('staff_customer_contacts').values({ tenant_id: id, ...b, created_by: ctx.userId }).returningAll().executeTakeFirstOrThrow();
    await staffAudit(ctx, { action: 'customer.contact_added', targetType: 'customer', targetId: id, tenantId: id });
    return row;
  }));

  // ── Products ────────────────────────────────────────────────────────────
  fastify.get('/products', h(async req => {
    const ctx = S(req); assertCan(ctx, 'products.view');
    const products = productsInScope(ctx);
    if (!products.length) return { items: [] };
    const [cases, incidents, status, teams] = await Promise.all([
      dbPlatform.selectFrom('platform_support_tickets as t').select(['t.app', sql<number>`count(*)::int`.as('open')])
        .where('t.status', 'in', [...OPEN]).where('t.app', 'in', products).where(caseScopeSql(ctx, 't.tenant_id', 't.app')).groupBy('t.app').execute(),
      dbPlatform.selectFrom('platform_incidents').select(['app_id', sql<number>`count(*)::int`.as('n')]).where('status', '<>', 'resolved').where('app_id', 'in', products).groupBy('app_id').execute(),
      dbPlatform.selectFrom('app_status').select(['app_id', 'status', 'message']).where('app_id', 'in', products).execute(),
      dbPlatform.selectFrom('staff_team_products as p').innerJoin('staff_teams as t', 't.id', 'p.team_id').select(['p.app_id', 't.id', 't.name']).where('p.app_id', 'in', products).execute(),
    ]);
    const m = <T extends { [k: string]: any }>(rows: T[], k: string) => new Map(rows.map(r => [r[k], r]));
    const cBy = m(cases, 'app'), iBy = m(incidents, 'app_id'), sBy = m(status, 'app_id');
    return { items: products.map(app => ({ app, openCases: cBy.get(app)?.open ?? 0, activeIncidents: iBy.get(app)?.n ?? 0,
      status: sBy.get(app)?.status ?? 'active', statusMessage: sBy.get(app)?.message ?? null, teams: teams.filter(t => t.app_id === app).map(t => ({ id: t.id, name: t.name })) })) };
  }));

  /** Product → affected customers → cases: the same case rows as Customer → products → cases. */
  fastify.get('/products/:app', h(async req => {
    const ctx = S(req); assertCan(ctx, 'products.view');
    const app = appId.parse((req.params as any).app);
    if (!canProduct(ctx, app)) throw new StaffAccessError(404, 'Product not found.');
    const [cases, incidents, appStatus] = await Promise.all([
      dbPlatform.selectFrom('platform_support_tickets as t').innerJoin('tenants as c', 'c.id', 't.tenant_id').leftJoin('users as o', 'o.id', 't.owner_user_id')
        .select(['t.id', 't.ref_number', 't.subject', 't.tenant_id', 'c.name as customer_name', 't.status', 't.priority', 't.severity', 'o.name as owner_name', 't.customer_outcome', 't.created_at'])
        .where('t.app', '=', app).where(caseScopeSql(ctx, 't.tenant_id', 't.app')).orderBy('t.created_at', 'desc').limit(100).execute(),
      dbPlatform.selectFrom('platform_incidents').selectAll().where('app_id', '=', app).orderBy('started_at', 'desc').limit(20).execute(),
      dbPlatform.selectFrom('app_status').select(['status', 'message', 'updated_at']).where('app_id', '=', app).executeTakeFirst(),
    ]);
    const incidentIds = incidents.map(i => i.id);
    const incidentCustomers = incidentIds.length ? await dbPlatform.selectFrom('platform_incident_customers as ic').innerJoin('tenants as c', 'c.id', 'ic.tenant_id')
      .select(['ic.incident_id', 'ic.tenant_id', 'c.name']).where('ic.incident_id', 'in', incidentIds).where(customerScopeSql(ctx, 'ic.tenant_id')).execute() : [];
    const affected = new Map<string, { tenant_id: string; name: string; openCases: number; incidents: number }>();
    for (const c of cases) { const a = affected.get(c.tenant_id) ?? { tenant_id: c.tenant_id, name: c.customer_name, openCases: 0, incidents: 0 }; if (OPEN.includes(c.status as any)) a.openCases++; affected.set(c.tenant_id, a); }
    for (const ic of incidentCustomers) { const a = affected.get(ic.tenant_id) ?? { tenant_id: ic.tenant_id, name: ic.name, openCases: 0, incidents: 0 }; a.incidents++; affected.set(ic.tenant_id, a); }
    return { app, status: appStatus?.status ?? 'active', statusMessage: appStatus?.message ?? null, cases, incidents: incidents.map(i => ({ ...i, customers: incidentCustomers.filter(c => c.incident_id === i.id).map(c => ({ tenant_id: c.tenant_id, name: c.name })) })), affectedCustomers: [...affected.values()] };
  }));

  // ── Teams ───────────────────────────────────────────────────────────────
  fastify.get('/teams', h(async req => {
    const ctx = S(req); assertCan(ctx, 'teams.view', 'staff.view');
    const teams = await dbPlatform.selectFrom('staff_teams').selectAll().where('active', '=', true).orderBy('name').limit(200).execute();
    const ids = teams.map(t => t.id);
    if (!ids.length) return { items: [] };
    const [members, products, customers, open] = await Promise.all([
      dbPlatform.selectFrom('staff_team_members as tm').innerJoin('users as u', 'u.id', 'tm.user_id')
        .select(['tm.team_id', 'tm.user_id', 'tm.member_role', 'tm.expires_at', 'u.name', 'u.email', 'u.avatar_url']).where('tm.team_id', 'in', ids).where('tm.removed_at', 'is', null).execute(),
      dbPlatform.selectFrom('staff_team_products').selectAll().where('team_id', 'in', ids).execute(),
      dbPlatform.selectFrom('staff_team_customers as c').innerJoin('tenants as t', 't.id', 'c.tenant_id').select(['c.team_id', 'c.tenant_id', 't.name']).where('c.team_id', 'in', ids).where(customerScopeSql(ctx, 'c.tenant_id')).execute(),
      dbPlatform.selectFrom('platform_support_tickets').select(['team_id', sql<number>`count(*)::int`.as('n')]).where('team_id', 'in', ids).where('status', 'in', [...OPEN]).groupBy('team_id').execute(),
    ]);
    return { items: teams.map(t => ({ ...t, members: members.filter(m => m.team_id === t.id), products: products.filter(p => p.team_id === t.id).map(p => p.app_id),
      customers: customers.filter(c => c.team_id === t.id).map(c => ({ tenant_id: c.tenant_id, name: c.name })), openCases: open.find(o => o.team_id === t.id)?.n ?? 0 })) };
  }));

  fastify.post('/teams', h(async req => {
    const ctx = S(req); assertCan(ctx, 'teams.manage');
    const b = z.object({ name: z.string().trim().min(2).max(120), kind: z.enum(['product', 'portfolio', 'specialist']), description: z.string().max(1000).default(''),
      all_products: z.boolean().default(false), all_customers: z.boolean().default(false), is_fallback: z.boolean().default(false) }).parse(req.body);
    // Broad coverage is a grant of scope: only someone who holds it may give it.
    if ((b.all_products && !ctx.scope.allProducts) || (b.all_customers && !ctx.scope.allCustomers)) throw new StaffAccessError(403, 'Only staff with broad scope can create a broad-coverage team.', 'escalation');
    if (b.is_fallback) await dbPlatform.updateTable('staff_teams').set({ is_fallback: false }).where('is_fallback', '=', true).execute();
    const row = await dbPlatform.insertInto('staff_teams').values({ ...b, created_by: ctx.userId }).returningAll().executeTakeFirstOrThrow();
    await staffAudit(ctx, { action: 'team.created', targetType: 'team', targetId: row.id, detail: b });
    return row;
  }));

  fastify.patch('/teams/:id', h(async req => {
    const ctx = S(req); assertCan(ctx, 'teams.manage');
    const id = uuid.parse((req.params as any).id);
    const b = z.object({ name: z.string().trim().min(2).max(120).optional(), description: z.string().max(1000).optional(), all_products: z.boolean().optional(),
      all_customers: z.boolean().optional(), is_fallback: z.boolean().optional(), active: z.boolean().optional() }).parse(req.body);
    if ((b.all_products && !ctx.scope.allProducts) || (b.all_customers && !ctx.scope.allCustomers)) throw new StaffAccessError(403, 'Only staff with broad scope can grant broad coverage.', 'escalation');
    if (b.active === false) {
      const open = await dbPlatform.selectFrom('platform_support_tickets').select(sql<number>`count(*)::int`.as('n')).where('team_id', '=', id).where('status', 'in', [...OPEN]).executeTakeFirstOrThrow();
      if (open.n) throw new StaffAccessError(409, `This team still has ${open.n} open case(s). Reassign them first.`, 'open_work');
    }
    if (b.is_fallback) await dbPlatform.updateTable('staff_teams').set({ is_fallback: false }).where('is_fallback', '=', true).execute();
    const row = await dbPlatform.updateTable('staff_teams').set({ ...b, updated_at: new Date() }).where('id', '=', id).returningAll().executeTakeFirst();
    if (!row) throw new StaffAccessError(404, 'Team not found.');
    await staffAudit(ctx, { action: 'team.updated', targetType: 'team', targetId: id, detail: b });
    return row;
  }));

  fastify.post('/teams/:id/members', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'teams.manage');
    const id = uuid.parse((req.params as any).id);
    const b = z.object({ user_id: uuid, member_role: z.enum(['lead', 'member']).default('member'), expires_at: isoDate.optional(), reason: z.string().max(500).default('') }).parse(req.body);
    const staff = await dbPlatform.selectFrom('staff_members').select('user_id').where('user_id', '=', b.user_id).where('status', '=', 'active').executeTakeFirst();
    if (!staff) return reply.status(400).send({ error: 'Only active staff members can join a team.' });
    // Joining a team grants its coverage: you cannot add yourself.
    if (b.user_id === ctx.userId) throw new StaffAccessError(403, 'You cannot add yourself to a team. Ask another manager.', 'self_escalation');
    const row = await dbPlatform.insertInto('staff_team_members').values({ team_id: id, user_id: b.user_id, member_role: b.member_role, expires_at: b.expires_at ? new Date(b.expires_at) : null, added_by: ctx.userId })
      .onConflict(oc => oc.columns(['team_id', 'user_id']).where('removed_at', 'is', null).doUpdateSet({ member_role: b.member_role, expires_at: b.expires_at ? new Date(b.expires_at) : null })).returningAll().executeTakeFirstOrThrow();
    await assignmentHistory({ subjectType: 'team_member', subjectId: id, action: 'member_added', actor: ctx.userId, toUser: b.user_id, toTeam: id, reason: b.reason });
    await staffAudit(ctx, { action: 'team.member_added', targetType: 'team', targetId: id, detail: { user_id: b.user_id, role: b.member_role } });
    return row;
  }));

  /** Removing a member never deletes or silently reassigns their open work; it is surfaced for reassignment. */
  fastify.delete('/teams/:id/members/:userId', h(async req => {
    const ctx = S(req); assertCan(ctx, 'teams.manage');
    const id = uuid.parse((req.params as any).id); const userId = uuid.parse((req.params as any).userId);
    const row = await dbPlatform.updateTable('staff_team_members').set({ removed_at: new Date(), removed_by: ctx.userId })
      .where('team_id', '=', id).where('user_id', '=', userId).where('removed_at', 'is', null).returning('id').executeTakeFirst();
    if (!row) throw new StaffAccessError(404, 'Not a member of this team.');
    const open = await dbPlatform.selectFrom('platform_support_tickets').select(['id', 'ref_number']).where('team_id', '=', id).where('owner_user_id', '=', userId).where('status', 'in', [...OPEN]).limit(200).execute();
    await assignmentHistory({ subjectType: 'team_member', subjectId: id, action: 'member_removed', actor: ctx.userId, fromUser: userId, fromTeam: id, detail: { open_cases: open.length } });
    await staffAudit(ctx, { action: 'team.member_removed', targetType: 'team', targetId: id, detail: { user_id: userId, open_cases: open.length } });
    return { removed: true, openCasesNeedingReassignment: open };
  }));

  fastify.put('/teams/:id/coverage', h(async req => {
    const ctx = S(req); assertCan(ctx, 'teams.manage');
    const id = uuid.parse((req.params as any).id);
    const b = z.object({ products: z.array(appId).max(60).optional(), customers: z.array(uuid).max(2000).optional() }).parse(req.body);
    // You can only hand out coverage you have yourself.
    if (b.products?.some(p => !canProduct(ctx, p))) throw new StaffAccessError(403, 'You can only assign products in your own scope.', 'escalation');
    if (b.customers?.some(c => !canCustomer(ctx, c))) throw new StaffAccessError(403, 'You can only assign customers in your own scope.', 'escalation');
    if (b.customers?.length) {
      const found = await dbPlatform.selectFrom('tenants').select('id').where('id', 'in', b.customers).execute();
      if (found.length !== new Set(b.customers).size) throw new StaffAccessError(400, 'One or more customers do not exist.', 'invalid');
    }
    if (b.products) {
      await dbPlatform.deleteFrom('staff_team_products').where('team_id', '=', id).execute();
      if (b.products.length) await dbPlatform.insertInto('staff_team_products').values([...new Set(b.products)].map(app_id => ({ team_id: id, app_id }))).execute();
    }
    if (b.customers) {
      await dbPlatform.deleteFrom('staff_team_customers').where('team_id', '=', id).execute();
      if (b.customers.length) await dbPlatform.insertInto('staff_team_customers').values([...new Set(b.customers)].map(tenant_id => ({ team_id: id, tenant_id }))).execute();
    }
    await staffAudit(ctx, { action: 'team.coverage_changed', targetType: 'team', targetId: id, detail: { products: b.products, customers: b.customers?.length } });
    return { ok: true };
  }));

  // ── Staff, roles and grants ─────────────────────────────────────────────
  fastify.get('/staff', h(async req => {
    const ctx = S(req); assertCan(ctx, 'staff.view');
    const rows = await dbPlatform.selectFrom('staff_members as m').innerJoin('users as u', 'u.id', 'm.user_id').innerJoin('tenants as t', 't.id', 'u.tenant_id')
      .select(['m.user_id', 'm.status', 'm.title', 'm.available', 'm.max_open_cases', 'u.name', 'u.email', 'u.avatar_url', 'u.role as workspace_role', 't.name as workspace_name',
        sql<number>`(SELECT count(*)::int FROM platform_support_tickets x WHERE x.owner_user_id = m.user_id AND x.status IN ('OPEN','IN_PROGRESS'))`.as('open_cases')])
      .orderBy('u.name').limit(500).execute();
    const ids = rows.map(r => r.user_id);
    const [grants, overrides, scopes, teams] = ids.length ? await Promise.all([
      dbPlatform.selectFrom('staff_role_grants as g').innerJoin('staff_roles as r', 'r.id', 'g.role_id').select(['g.id', 'g.user_id', 'r.key', 'r.name', 'g.starts_at', 'g.expires_at', 'g.reason']).where('g.user_id', 'in', ids).where('g.revoked_at', 'is', null).execute(),
      dbPlatform.selectFrom('staff_permission_overrides').select(['id', 'user_id', 'permission', 'effect', 'expires_at', 'reason']).where('user_id', 'in', ids).where('revoked_at', 'is', null).execute(),
      dbPlatform.selectFrom('staff_scope_grants').select(['id', 'user_id', 'scope_type', 'app_id', 'tenant_id', 'effect', 'expires_at', 'reason']).where('user_id', 'in', ids).where('revoked_at', 'is', null).execute(),
      dbPlatform.selectFrom('staff_team_members as tm').innerJoin('staff_teams as t', 't.id', 'tm.team_id').select(['tm.user_id', 't.id', 't.name', 'tm.member_role']).where('tm.user_id', 'in', ids).where('tm.removed_at', 'is', null).execute(),
    ]) : [[], [], [], []];
    return { items: rows.map(r => ({ ...r, roles: grants.filter(g => g.user_id === r.user_id), overrides: overrides.filter(o => o.user_id === r.user_id),
      scopes: scopes.filter(s => s.user_id === r.user_id), teams: teams.filter(t => t.user_id === r.user_id) })) };
  }));

  fastify.get('/roles', h(async req => {
    const ctx = S(req); assertCan(ctx, 'staff.view');
    const roles = await dbPlatform.selectFrom('staff_roles').selectAll().orderBy('is_template', 'desc').orderBy('name').execute();
    return { roles, permissions: STAFF_PERMISSIONS, homes: Object.fromEntries(Object.entries(STAFF_HOMES).map(([k, v]) => [k, v.label])), templates: STAFF_ROLE_TEMPLATES.map(t => t.key) };
  }));

  /** Add an existing user as staff (no roles yet — a membership alone grants nothing). */
  fastify.post('/staff', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'staff.manage');
    const b = z.object({ email: z.string().email().max(320), title: z.string().max(200).optional() }).parse(req.body);
    const matches = await dbPlatform.selectFrom('users').select(['id', 'role', 'active']).where(sql`lower(email)`, '=', b.email.toLowerCase()).limit(3).execute();
    if (matches.length !== 1) return reply.status(400).send({ error: matches.length ? 'That email belongs to more than one account; staff need a single identity.' : 'No account with that email.' });
    const u = matches[0];
    if (u.active === false) return reply.status(400).send({ error: 'That account is deactivated.' });
    if (['CUSTOMER', 'ORG', 'GUEST'].includes(u.role)) return reply.status(400).send({ error: 'Customer and guest accounts cannot be staff.' });
    await dbPlatform.insertInto('staff_members').values({ user_id: u.id, title: b.title ?? null, created_by: ctx.userId }).onConflict(oc => oc.column('user_id').doUpdateSet({ status: 'active', updated_at: new Date() })).execute();
    await staffAudit(ctx, { action: 'staff.member_added', targetType: 'user', targetId: u.id });
    return { user_id: u.id };
  }));

  fastify.patch('/staff/:userId', h(async req => {
    const ctx = S(req); assertCan(ctx, 'staff.manage');
    const userId = uuid.parse((req.params as any).userId);
    const b = z.object({ status: z.enum(['active', 'suspended']).optional(), available: z.boolean().optional(), max_open_cases: z.number().int().min(1).max(500).optional(), title: z.string().max(200).optional() }).parse(req.body);
    if (b.status && userId === ctx.userId) throw new StaffAccessError(403, 'You cannot change your own staff status.', 'self_escalation');
    if (b.status === 'suspended') {
      const isSa = await dbPlatform.selectFrom('staff_role_grants as g').innerJoin('staff_roles as r', 'r.id', 'g.role_id').select('g.id').where('g.user_id', '=', userId).where('r.key', '=', 'superadmin').where('g.revoked_at', 'is', null).executeTakeFirst();
      if (isSa && (await activeSuperAdminCount()) <= 1) throw new StaffAccessError(409, 'This is the last active SuperAdmin. Grant SuperAdmin to someone else first.', 'last_superadmin');
    }
    const row = await dbPlatform.updateTable('staff_members').set({ ...b, updated_at: new Date() }).where('user_id', '=', userId).returningAll().executeTakeFirst();
    if (!row) throw new StaffAccessError(404, 'Staff member not found.');
    await staffAudit(ctx, { action: 'staff.member_updated', targetType: 'user', targetId: userId, detail: b });
    return row;
  }));

  fastify.post('/staff/:userId/roles', h(async req => {
    const ctx = S(req); assertCan(ctx, 'staff.manage');
    const userId = uuid.parse((req.params as any).userId);
    const b = z.object({ role_key: z.string().max(64), expires_at: isoDate.optional(), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const role = await dbPlatform.selectFrom('staff_roles').selectAll().where('key', '=', b.role_key).executeTakeFirst();
    if (!role) throw new StaffAccessError(404, 'Unknown role.');
    assertCanGrant(ctx, userId, role.permissions, role.broad_scope);
    const member = await dbPlatform.selectFrom('staff_members').select('user_id').where('user_id', '=', userId).executeTakeFirst();
    if (!member) throw new StaffAccessError(404, 'Add this person as staff first.');
    const row = await dbPlatform.insertInto('staff_role_grants').values({ user_id: userId, role_id: role.id, expires_at: b.expires_at ? new Date(b.expires_at) : null, reason: b.reason, granted_by: ctx.userId }).returningAll().executeTakeFirstOrThrow();
    await assignmentHistory({ subjectType: 'role_grant', subjectId: row.id, action: 'granted', actor: ctx.userId, toUser: userId, reason: b.reason, detail: { role: role.key, expires_at: b.expires_at ?? null } });
    await staffAudit(ctx, { action: 'staff.role_granted', targetType: 'user', targetId: userId, purpose: b.reason, detail: { role: role.key, expires_at: b.expires_at ?? null } });
    return row;
  }));

  fastify.delete('/staff/:userId/roles/:grantId', h(async req => {
    const ctx = S(req); assertCan(ctx, 'staff.manage');
    const userId = uuid.parse((req.params as any).userId); const grantId = uuid.parse((req.params as any).grantId);
    if (userId === ctx.userId) throw new StaffAccessError(403, 'You cannot change your own staff access.', 'self_escalation');
    const g = await dbPlatform.selectFrom('staff_role_grants as g').innerJoin('staff_roles as r', 'r.id', 'g.role_id').select(['g.id', 'r.key']).where('g.id', '=', grantId).where('g.user_id', '=', userId).where('g.revoked_at', 'is', null).executeTakeFirst();
    if (!g) throw new StaffAccessError(404, 'Grant not found.');
    if (g.key === 'superadmin' && (await activeSuperAdminCount(grantId)) < 1) throw new StaffAccessError(409, 'This is the last usable SuperAdmin access. Grant SuperAdmin to someone else first.', 'last_superadmin');
    await dbPlatform.updateTable('staff_role_grants').set({ revoked_at: new Date(), revoked_by: ctx.userId }).where('id', '=', grantId).execute();
    await assignmentHistory({ subjectType: 'role_grant', subjectId: grantId, action: 'revoked', actor: ctx.userId, fromUser: userId, detail: { role: g.key } });
    await staffAudit(ctx, { action: 'staff.role_revoked', targetType: 'user', targetId: userId, detail: { role: g.key } });
    return { revoked: true };
  }));

  fastify.post('/staff/:userId/overrides', h(async req => {
    const ctx = S(req); assertCan(ctx, 'staff.manage');
    const userId = uuid.parse((req.params as any).userId);
    const b = z.object({ permission: z.string().refine(p => (ALL_STAFF_PERMISSIONS as string[]).includes(p), 'Unknown permission'), effect: z.enum(['allow', 'deny']), expires_at: isoDate.optional(), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    // Denies are restrictions and may be placed by any staff manager on others; allows are grants.
    if (b.effect === 'allow') assertCanGrant(ctx, userId, [b.permission], false);
    else if (userId === ctx.userId) throw new StaffAccessError(403, 'You cannot change your own staff access.', 'self_escalation');
    const row = await dbPlatform.insertInto('staff_permission_overrides').values({ user_id: userId, permission: b.permission, effect: b.effect, expires_at: b.expires_at ? new Date(b.expires_at) : null, reason: b.reason, granted_by: ctx.userId }).returningAll().executeTakeFirstOrThrow();
    await staffAudit(ctx, { action: `staff.permission_${b.effect}`, targetType: 'user', targetId: userId, purpose: b.reason, detail: { permission: b.permission } });
    return row;
  }));

  fastify.post('/staff/:userId/scopes', h(async req => {
    const ctx = S(req); assertCan(ctx, 'staff.manage');
    const userId = uuid.parse((req.params as any).userId);
    const b = z.object({ scope_type: z.enum(['product', 'customer', 'all_products', 'all_customers']), app_id: appId.optional(), tenant_id: uuid.optional(),
      effect: z.enum(['allow', 'deny']).default('allow'), expires_at: isoDate.optional(), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    if (b.effect === 'allow') {
      if (userId === ctx.userId) throw new StaffAccessError(403, 'You cannot change your own staff access.', 'self_escalation');
      if (b.scope_type === 'all_products' && !ctx.scope.allProducts) throw new StaffAccessError(403, 'Only staff with every product in scope can grant it.', 'escalation');
      if (b.scope_type === 'all_customers' && !ctx.scope.allCustomers) throw new StaffAccessError(403, 'Only staff with every customer in scope can grant it.', 'escalation');
      if (b.scope_type === 'product' && !canProduct(ctx, b.app_id)) throw new StaffAccessError(403, 'You can only grant products in your own scope.', 'escalation');
      if (b.scope_type === 'customer' && (!b.tenant_id || !canCustomer(ctx, b.tenant_id))) throw new StaffAccessError(403, 'You can only grant customers in your own scope.', 'escalation');
    }
    const row = await dbPlatform.insertInto('staff_scope_grants').values({ user_id: userId, scope_type: b.scope_type, app_id: b.scope_type === 'product' ? b.app_id ?? null : null,
      tenant_id: b.scope_type === 'customer' ? b.tenant_id ?? null : null, effect: b.effect, expires_at: b.expires_at ? new Date(b.expires_at) : null, reason: b.reason, granted_by: ctx.userId }).returningAll().executeTakeFirstOrThrow();
    await assignmentHistory({ subjectType: 'scope_grant', subjectId: row.id, action: b.effect === 'allow' ? 'granted' : 'restricted', actor: ctx.userId, toUser: userId, reason: b.reason, detail: b });
    await staffAudit(ctx, { action: `staff.scope_${b.effect}`, targetType: 'user', targetId: userId, tenantId: b.tenant_id ?? null, appId: b.app_id ?? null, purpose: b.reason });
    return row;
  }));

  fastify.delete('/staff/:userId/:kind(overrides|scopes)/:grantId', h(async req => {
    const ctx = S(req); assertCan(ctx, 'staff.manage');
    const p = req.params as any; const userId = uuid.parse(p.userId); const grantId = uuid.parse(p.grantId);
    if (userId === ctx.userId) throw new StaffAccessError(403, 'You cannot change your own staff access.', 'self_escalation');
    const table = p.kind === 'overrides' ? 'staff_permission_overrides' : 'staff_scope_grants';
    const row = await dbPlatform.updateTable(table as 'staff_scope_grants').set({ revoked_at: new Date(), revoked_by: ctx.userId }).where('id', '=', grantId).where('user_id', '=', userId).where('revoked_at', 'is', null).returning('id').executeTakeFirst();
    if (!row) throw new StaffAccessError(404, 'Grant not found.');
    await staffAudit(ctx, { action: `staff.${p.kind === 'overrides' ? 'override' : 'scope'}_revoked`, targetType: 'user', targetId: userId, detail: { grant_id: grantId } });
    return { revoked: true };
  }));

  fastify.patch('/roles/:key', h(async req => {
    const ctx = S(req); assertCan(ctx, 'staff.manage');
    const key = z.string().max(64).parse((req.params as any).key);
    if (key === 'superadmin') throw new StaffAccessError(403, 'The SuperAdmin role always holds every permission.', 'protected');
    const b = z.object({ name: z.string().trim().min(2).max(120).optional(), description: z.string().max(1000).optional(),
      permissions: z.array(z.string().refine(p => (ALL_STAFF_PERMISSIONS as string[]).includes(p))).max(100).optional(),
      default_home: z.string().refine(h2 => h2 in STAFF_HOMES).optional() }).parse(req.body);
    // Editing a role changes everyone holding it; you may only put permissions you hold into it.
    if (b.permissions) { const missing = b.permissions.filter(p => !ctx.permissions.has(p as any)); if (missing.length) throw new StaffAccessError(403, `You cannot add permissions you do not hold: ${missing.join(', ')}.`, 'escalation'); }
    const holders = await dbPlatform.selectFrom('staff_role_grants as g').innerJoin('staff_roles as r', 'r.id', 'g.role_id').select('g.user_id').where('r.key', '=', key).where('g.revoked_at', 'is', null).where('g.user_id', '=', ctx.userId).executeTakeFirst();
    if (holders && b.permissions) throw new StaffAccessError(403, 'You cannot change the permissions of a role you hold.', 'self_escalation');
    const row = await dbPlatform.updateTable('staff_roles').set({ ...b, updated_at: new Date(), updated_by: ctx.userId }).where('key', '=', key).returningAll().executeTakeFirst();
    if (!row) throw new StaffAccessError(404, 'Unknown role.');
    await staffAudit(ctx, { action: 'staff.role_edited', targetType: 'role', targetId: key, detail: b });
    return row;
  }));

  // ── Reassignment surface ────────────────────────────────────────────────
  /** Open cases whose owner can no longer work them: suspended, deactivated, or no longer on the case's team. */
  fastify.get('/work/needs-reassignment', h(async req => {
    const ctx = S(req); assertCan(ctx, 'cases.assign');
    const rows = await sql<any>`
      SELECT t.id, t.ref_number, t.subject, t.tenant_id, c.name AS customer_name, t.app, t.team_id, st.name AS team_name, t.owner_user_id, u.name AS owner_name,
        CASE WHEN m.user_id IS NULL OR m.status <> 'active' THEN 'owner is not active staff'
             WHEN u.active IS FALSE THEN 'owner account deactivated'
             ELSE 'owner left the case''s team' END AS reason
      FROM platform_support_tickets t
      JOIN tenants c ON c.id = t.tenant_id
      LEFT JOIN users u ON u.id = t.owner_user_id
      LEFT JOIN staff_members m ON m.user_id = t.owner_user_id
      LEFT JOIN staff_teams st ON st.id = t.team_id
      WHERE t.status IN ('OPEN','IN_PROGRESS') AND t.owner_user_id IS NOT NULL
        AND ${caseScopeSql(ctx, 't.tenant_id', 't.app')}
        AND (m.user_id IS NULL OR m.status <> 'active' OR u.active IS FALSE
          OR (t.team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff_team_members tm WHERE tm.team_id = t.team_id AND tm.user_id = t.owner_user_id AND tm.removed_at IS NULL)))
      ORDER BY t.created_at LIMIT 200`.execute(dbPlatform);
    return { items: rows.rows };
  }));

  // ── Monitoring ──────────────────────────────────────────────────────────
  fastify.get('/monitoring', h(async req => {
    const ctx = S(req); assertCan(ctx, 'monitoring.view');
    const products = productsInScope(ctx);
    const [reqs, appStatus, email, zentra, studio, lensOut, durable, incidents, releases, config] = await Promise.all([
      dbPlatform.selectFrom('api_usage_events').select([
        sql<string>`split_part(path, '/', 3)`.as('seg'), sql<number>`count(*)::int`.as('requests'),
        sql<number>`count(*) FILTER (WHERE status_code >= 500)::int`.as('server_errors'), sql<number>`count(*) FILTER (WHERE status_code BETWEEN 400 AND 499)::int`.as('client_errors'),
        sql<number>`coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int`.as('p95_ms'), sql<Date>`max(created_at)`.as('last_seen'),
      ]).where('created_at', '>', sql<Date>`now() - interval '1 hour'`).groupBy(sql`split_part(path, '/', 3)`).limit(500).execute(),
      dbPlatform.selectFrom('app_status').select(['app_id', 'status', 'message', 'updated_at']).execute(),
      dbPlatform.selectFrom('email_outbox').select([sql<number>`count(*) FILTER (WHERE status = 'failed')::int`.as('failed'), sql<number>`count(*) FILTER (WHERE status IN ('pending','sending'))::int`.as('pending'), sql<Date>`min(created_at) FILTER (WHERE status = 'pending')`.as('oldest_pending')]).where('created_at', '>', sql<Date>`now() - interval '24 hours'`).executeTakeFirstOrThrow(),
      dbPlatform.selectFrom('zentra_event_outbox').select([sql<number>`count(*) FILTER (WHERE status = 'failed')::int`.as('failed'), sql<number>`count(*) FILTER (WHERE status = 'pending')::int`.as('pending')]).where('created_at', '>', sql<Date>`now() - interval '24 hours'`).executeTakeFirstOrThrow(),
      dbPlatform.selectFrom('studio_event_outbox').select([sql<number>`count(*) FILTER (WHERE status = 'failed')::int`.as('failed'), sql<number>`count(*) FILTER (WHERE status = 'pending')::int`.as('pending')]).where('created_at', '>', sql<Date>`now() - interval '24 hours'`).executeTakeFirst().catch(() => null),
      dbPlatform.selectFrom('lens_outbox_events').select([sql<number>`count(*) FILTER (WHERE status = 'failed')::int`.as('failed'), sql<number>`count(*) FILTER (WHERE status = 'pending')::int`.as('pending')]).where('created_at', '>', sql<Date>`now() - interval '24 hours'`).executeTakeFirst().catch(() => null),
      dbPlatform.selectFrom('durable_jobs').select(['job_type', sql<number>`count(*) FILTER (WHERE status = 'failed')::int`.as('failed'), sql<number>`count(*) FILTER (WHERE status IN ('pending','queued'))::int`.as('pending')]).where('scheduled_at', '>', sql<Date>`now() - interval '24 hours'`).groupBy('job_type').limit(100).execute(),
      dbPlatform.selectFrom('platform_incidents').select(['id', 'ref', 'app_id', 'title', 'severity', 'status', 'started_at', sql<number>`(SELECT count(*)::int FROM platform_incident_customers c WHERE c.incident_id = platform_incidents.id)`.as('customers')]).where('status', '<>', 'resolved').limit(50).execute(),
      dbPlatform.selectFrom('lens_releases').select(['id', 'version', 'title', 'status', 'released_at', 'commit_sha']).orderBy('released_at', 'desc').limit(10).execute(),
      dbPlatform.selectFrom('platform_activity_log').select(['id', 'action', 'actor_name', 'target_type', 'target_name', 'created_at']).where('category', '=', 'system').orderBy('created_at', 'desc').limit(20).execute(),
    ]);
    const statusBy = new Map(appStatus.map(a => [a.app_id, a]));
    const per = new Map<string, { requests: number; server_errors: number; client_errors: number; p95_ms: number; last_seen: Date | null }>();
    for (const r of reqs) {
      const a = appIdForPath(`/v1/${r.seg}`); const c = per.get(a) ?? { requests: 0, server_errors: 0, client_errors: 0, p95_ms: 0, last_seen: null };
      c.requests += r.requests; c.server_errors += r.server_errors; c.client_errors += r.client_errors; c.p95_ms = Math.max(c.p95_ms, r.p95_ms);
      c.last_seen = !c.last_seen || (r.last_seen && r.last_seen > c.last_seen) ? r.last_seen : c.last_seen; per.set(a, c);
    }
    const apps = products.map(app => {
      const s = statusBy.get(app); const m = per.get(app);
      // Maintenance is a declared state, not a measurement; health comes only from observed requests.
      const state = s?.status === 'maintenance' ? 'maintenance' : !m ? 'unknown' : m.server_errors / m.requests >= 0.25 ? 'unavailable' : m.server_errors / m.requests >= 0.02 ? 'degraded' : 'healthy';
      return { app, state, requests1h: m?.requests ?? 0, serverErrors1h: m?.server_errors ?? 0, clientErrors1h: m?.client_errors ?? 0, p95Ms: m?.p95_ms ?? null, lastRequestAt: m?.last_seen ?? null, declaredStatus: s?.status ?? 'active', statusMessage: s?.message ?? null };
    });
    return {
      apps,
      deliveries: { email: email, zentraEvents: zentra, studioEvents: studio, lensEvents: lensOut },
      jobs: { durable, scheduler: 'Per-job last run is not recorded anywhere (jobs/index.ts JOB_REGISTRY has schedules only), so scheduled-job health is unknown.' },
      incidents: incidents.filter(i => canProduct(ctx, i.app_id)),
      deployments: releases, configChanges: config,
      definitions: [
        { metric: 'App state', definition: 'healthy < 2% server errors; degraded 2–25%; unavailable ≥ 25%; unknown = no authenticated requests in the window; maintenance = declared in app_status (not measured).', source: 'api_usage_events + app_status', window: '1 hour', refresh: 'on load', coverage: 'Authenticated requests only (session or API key). Public pages, webhooks and unauthenticated failures are not recorded.' },
        { metric: 'p95 latency', definition: '95th percentile request duration, worst route segment of the app.', source: 'api_usage_events.duration_ms', window: '1 hour', refresh: 'on load', coverage: 'Same as App state.' },
        { metric: 'Deliveries', definition: 'Failed and pending outbox rows.', source: 'email_outbox, zentra_event_outbox, studio_event_outbox, lens_outbox_events', window: '24 hours', refresh: 'on load', coverage: 'SMS and WhatsApp delivery are not summarised here (sms_messages carries per-message status).' },
        { metric: 'Durable jobs', definition: 'Failed and pending durable jobs by type.', source: 'durable_jobs', window: '24 hours by scheduled_at', refresh: 'on load', coverage: 'BullMQ scheduled jobs keep no run history; their health is unknown.' },
        { metric: 'Deployments', definition: 'Most recent Lens releases.', source: 'lens_releases', window: 'last 10', refresh: 'on load', coverage: 'Only releases recorded in Lens; container deploys on the server are not reported back.' },
        { metric: 'Config changes', definition: 'Recent system-category platform activity.', source: 'platform_activity_log', window: 'last 20', refresh: 'on load', coverage: 'Only changes made through SuperAdmin endpoints that log activity.' },
      ],
    };
  }));

  // ── Security ────────────────────────────────────────────────────────────
  fastify.get('/security', h(async req => {
    const ctx = S(req); assertCan(ctx, 'security.view', 'access.oversee');
    const out: Record<string, unknown> = {};
    if (can(ctx, 'security.view')) {
      const [events, staffMfa, staffDevices] = await Promise.all([
        dbPlatform.selectFrom('ondi_auth_events as e').leftJoin('users as u', 'u.id', 'e.user_id')
          .select(['e.id', 'e.event_type', 'e.tenant_id', 'e.user_id', 'u.name as user_name', 'e.created_at'])
          .where('e.created_at', '>', sql<Date>`now() - interval '7 days'`).where(customerScopeSql(ctx, 'e.tenant_id')).orderBy('e.created_at', 'desc').limit(100).execute(),
        sql<{ user_id: string; name: string; mfa: boolean }>`SELECT m.user_id, u.name, EXISTS (SELECT 1 FROM user_totp t WHERE t.user_id = m.user_id AND t.enabled) AS mfa
          FROM staff_members m JOIN users u ON u.id = m.user_id WHERE m.status = 'active' ORDER BY u.name LIMIT 500`.execute(dbPlatform),
        dbPlatform.selectFrom('hr_devices as d').innerJoin('staff_members as m', 'm.user_id', 'd.user_id').innerJoin('users as u', 'u.id', 'd.user_id')
          .select(['d.id', 'd.user_id', 'u.name', 'd.device_label', 'd.last_used_at', 'd.created_at']).where('d.revoked_at', 'is', null).orderBy('d.last_used_at', 'desc').limit(200).execute(),
      ]);
      out.authEvents = events; out.staffMfa = staffMfa.rows; out.staffSessions = staffDevices;
    }
    if (can(ctx, 'access.oversee')) {
      out.accessSessions = await dbPlatform.selectFrom('staff_access_sessions as s').innerJoin('users as u', 'u.id', 's.staff_user_id').innerJoin('tenants as t', 't.id', 's.tenant_id')
        .select(['s.id', 's.status', 's.purpose', 's.actions', 's.app_id', 's.basis', 's.starts_at', 's.expires_at', 's.ended_at', 's.end_reason', 'u.name as staff_name', 'u.avatar_url as staff_avatar_url', 't.name as customer_name', 's.tenant_id'])
        .orderBy('s.created_at', 'desc').limit(100).execute();
    }
    return out;
  }));

  fastify.post('/security/sessions/:id/revoke', h(async req => {
    const ctx = S(req); assertCan(ctx, 'security.revoke');
    const id = uuid.parse((req.params as any).id);
    const b = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const row = await dbPlatform.selectFrom('hr_devices').select(['id', 'user_id', 'tenant_id']).where('id', '=', id).where('revoked_at', 'is', null).executeTakeFirst();
    // In scope: a session of a customer you cover, or of a staff member.
    const isStaff = row ? !!(await dbPlatform.selectFrom('staff_members').select('user_id').where('user_id', '=', row.user_id).executeTakeFirst()) : false;
    if (!row || (!canCustomer(ctx, row.tenant_id) && !isStaff)) throw new StaffAccessError(404, 'Session not found or already revoked.');
    await dbPlatform.updateTable('hr_devices').set({ revoked_at: new Date() }).where('id', '=', id).where('revoked_at', 'is', null).execute();
    await staffAudit(ctx, { action: 'security.session_revoked', targetType: 'session', targetId: id, tenantId: row.tenant_id, purpose: b.reason, detail: { user_id: row.user_id } });
    return { revoked: true };
  }));

  // ── Billing ─────────────────────────────────────────────────────────────
  fastify.get('/billing', h(async req => {
    const ctx = S(req); assertCan(ctx, 'billing.view');
    const [plans, invoices, subs] = await Promise.all([
      dbPlatform.selectFrom('tenants').select(['plan', sql<number>`count(*)::int`.as('customers')]).where(customerScopeSql(ctx, 'tenants.id')).groupBy('plan').execute(),
      dbPlatform.selectFrom('subscription_invoices as i').innerJoin('tenants as t', 't.id', 'i.tenant_id')
        .select(['i.id', 'i.invoice_number', 'i.tenant_id', 't.name as customer_name', 'i.plan_code', 'i.currency', 'i.amount', 'i.period_start', 'i.due_date', 'i.status' as any])
        .where(customerScopeSql(ctx, 'i.tenant_id')).orderBy('i.period_start', 'desc').limit(100).execute(),
      dbPlatform.selectFrom('tenant_product_subscriptions as s').innerJoin('tenants as t', 't.id', 's.tenant_id')
        .select(['s.status', sql<number>`count(*)::int`.as('n')]).where(customerScopeSql(ctx, 's.tenant_id')).groupBy('s.status').execute(),
    ]);
    return { plans, invoices, subscriptionsByStatus: subs, changeTools: can(ctx, 'billing.change') ? '/admin/subscriptions' : null };
  }));

  fastify.get('/billing/export', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'billing.export');
    const rows = await dbPlatform.selectFrom('subscription_invoices as i').innerJoin('tenants as t', 't.id', 'i.tenant_id')
      .select(['i.invoice_number', 't.name as customer_name', 'i.plan_code', 'i.currency', 'i.amount', 'i.period_start', 'i.period_end', 'i.due_date'])
      .where(customerScopeSql(ctx, 'i.tenant_id')).orderBy('i.period_start', 'desc').limit(10000).execute();
    await staffAudit(ctx, { action: 'billing.export', targetType: 'subscription_invoices', detail: { rows: rows.length } });
    const esc = (v: unknown) => `"${String(v instanceof Date ? v.toISOString() : v ?? '').replace(/"/g, '""')}"`;
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="subscription-invoices.csv"');
    return ['invoice_number,customer,plan,currency,amount,period_start,period_end,due_date', ...rows.map(r => Object.values(r).map(esc).join(','))].join('\n');
  }));

  // ── Audit ───────────────────────────────────────────────────────────────
  const auditQuery = (ctx: StaffContext, q: { actor?: string; action?: string; tenant?: string }) => {
    let sel = dbPlatform.selectFrom('staff_audit_log as a').leftJoin('users as u', 'u.id', 'a.actor_user_id')
      .select(['a.id', 'a.action', 'a.actor_user_id', 'u.name as actor_name', 'u.avatar_url as actor_avatar_url', 'a.target_type', 'a.target_id', 'a.tenant_id', 'a.app_id', 'a.purpose', 'a.outcome', 'a.detail', 'a.created_at'])
      // Platform-wide entries (no customer) need broad customer scope.
      .where(eb => eb.or([eb('a.tenant_id', 'is', null).and(sql<boolean>`${ctx.scope.allCustomers}`), customerScopeSql(ctx, 'a.tenant_id')]));
    if (q.actor && uuid.safeParse(q.actor).success) sel = sel.where('a.actor_user_id', '=', q.actor);
    if (q.tenant && uuid.safeParse(q.tenant).success) sel = sel.where('a.tenant_id', '=', q.tenant);
    if (q.action) sel = sel.where('a.action', 'like', `${q.action.replace(/[\\%_]/g, '\\$&')}%`);
    return sel;
  };
  fastify.get('/audit', h(async req => {
    const ctx = S(req); assertCan(ctx, 'audit.view');
    const q = z.object({
      action: z.string().optional(), actor: z.string().optional(), tenant: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      operatorLimit: z.coerce.number().int().min(1).max(100).default(100),
      offset: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
      operatorOffset: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
    }).parse(req.query);
    const staff = auditQuery(ctx, q);
    const operators = dbPlatform.selectFrom('platform_operator_audit as p').leftJoin('users as u', 'u.id', 'p.operator_id')
      .where(customerScopeSql(ctx, 'p.affected_tenant_id'));
    const [staffActions, operatorActions, staffCount, operatorCount] = await Promise.all([
      staff.orderBy('a.created_at', 'desc').orderBy('a.id', 'desc').offset(q.offset).limit(q.limit).execute(),
      operators.select(['p.id', 'p.action', 'p.operator_id', 'u.name as operator_name', 'p.affected_tenant_id', 'p.resource_type', 'p.reason', 'p.created_at'])
        .orderBy('p.created_at', 'desc').orderBy('p.id', 'desc').offset(q.operatorOffset).limit(q.operatorLimit).execute(),
      staff.clearSelect().select(eb => eb.fn.countAll().as('total')).executeTakeFirstOrThrow(),
      operators.select(eb => eb.fn.countAll().as('total')).executeTakeFirstOrThrow(),
    ]);
    return { staffActions, operatorActions, staffTotal: Number(staffCount.total), operatorTotal: Number(operatorCount.total) };
  }));
  fastify.get('/audit/export', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'audit.export');
    const rows = await auditQuery(ctx, req.query as { actor?: string; action?: string; tenant?: string })
      .orderBy('a.created_at', 'desc').orderBy('a.id', 'desc').limit(1000).execute();
    await staffAudit(ctx, { action: 'audit.export', targetType: 'staff_audit_log', detail: { rows: rows.length } });
    const esc = (v: unknown) => `"${String(v instanceof Date ? v.toISOString() : typeof v === 'object' && v ? JSON.stringify(v) : v ?? '').replace(/"/g, '""')}"`;
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="staff-audit.csv"');
    return ['created_at,actor,action,target_type,target_id,tenant_id,app_id,purpose,outcome,detail', ...rows.map(r => [r.created_at, r.actor_name, r.action, r.target_type, r.target_id, r.tenant_id, r.app_id, r.purpose, r.outcome, r.detail].map(esc).join(','))].join('\n');
  }));

  // ── Platform settings (operations) ──────────────────────────────────────
  fastify.get('/settings', h(async req => {
    const ctx = S(req); assertCan(ctx, 'settings.view');
    const [sla, hours, rules, appStatus, teams] = await Promise.all([
      dbPlatform.selectFrom('staff_sla_policies').selectAll().execute(),
      dbPlatform.selectFrom('staff_business_hours').selectAll().where('id', '=', 1).executeTakeFirst(),
      dbPlatform.selectFrom('staff_routing_rules as r').innerJoin('staff_teams as t', 't.id', 'r.team_id').select(['r.id', 'r.name', 'r.position', 'r.app_id', 'r.category', 'r.priority', 'r.tenant_id', 'r.team_id', 't.name as team_name', 'r.active']).orderBy('r.position').execute(),
      dbPlatform.selectFrom('app_status').select(['app_id', 'status', 'message', 'updated_at']).execute(),
      dbPlatform.selectFrom('staff_teams').select(['id', 'name']).where('active', '=', true).execute(),
    ]);
    return { sla, businessHours: hours, routingRules: rules, appStatus, teams };
  }));

  fastify.put('/settings/sla/:priority', h(async req => {
    const ctx = S(req); assertCan(ctx, 'settings.manage');
    const priority = z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']).parse((req.params as any).priority);
    const b = z.object({ first_response_minutes: z.number().int().min(5).max(100000), resolution_minutes: z.number().int().min(5).max(500000), business_hours_only: z.boolean() }).parse(req.body);
    await dbPlatform.updateTable('staff_sla_policies').set(b).where('priority', '=', priority).execute();
    await staffAudit(ctx, { action: 'settings.sla_changed', targetType: 'sla_policy', targetId: priority, detail: b });
    return { priority, ...b };
  }));

  fastify.put('/settings/business-hours', h(async req => {
    const ctx = S(req); assertCan(ctx, 'settings.manage');
    const b = z.object({ timezone: z.string().max(64).refine(tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Unknown time zone'),
      work_days: z.array(z.number().int().min(1).max(7)).min(1).max(7), start_minute: z.number().int().min(0).max(1439), end_minute: z.number().int().min(1).max(1440),
      holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100).default([]) }).refine(x => x.end_minute > x.start_minute, 'End must be after start').parse(req.body);
    await dbPlatform.updateTable('staff_business_hours').set({ ...b, holidays: b.holidays as any }).where('id', '=', 1).execute();
    await staffAudit(ctx, { action: 'settings.business_hours_changed', targetType: 'business_hours', detail: b });
    return b;
  }));

  fastify.post('/settings/routing-rules', h(async req => {
    const ctx = S(req); assertCan(ctx, 'settings.manage');
    const b = z.object({ name: z.string().trim().min(2).max(120), position: z.number().int().min(0).max(10000).default(100), app_id: appId.nullable().optional(),
      category: z.string().max(100).nullable().optional(), priority: z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']).nullable().optional(), tenant_id: uuid.nullable().optional(), team_id: uuid }).parse(req.body);
    const row = await dbPlatform.insertInto('staff_routing_rules').values({ ...b, created_by: ctx.userId }).returningAll().executeTakeFirstOrThrow();
    await staffAudit(ctx, { action: 'settings.routing_rule_added', targetType: 'routing_rule', targetId: row.id, detail: b });
    return row;
  }));

  fastify.delete('/settings/routing-rules/:id', h(async req => {
    const ctx = S(req); assertCan(ctx, 'settings.manage');
    const id = uuid.parse((req.params as any).id);
    await dbPlatform.updateTable('staff_routing_rules').set({ active: false }).where('id', '=', id).execute();
    await staffAudit(ctx, { action: 'settings.routing_rule_disabled', targetType: 'routing_rule', targetId: id });
    return { ok: true };
  }));

  /** Maintenance is declared per product; it is shown as maintenance, never inferred as health. */
  fastify.put('/settings/maintenance/:app', h(async req => {
    const ctx = S(req); assertCan(ctx, 'maintenance.manage');
    const app = appId.parse((req.params as any).app);
    if (!canProduct(ctx, app)) throw new StaffAccessError(404, 'Product not found.');
    const b = z.object({ maintenance: z.boolean(), message: z.string().max(500).optional(), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    // app_status allows only 'active' | 'maintenance'. A notice set elsewhere is kept unless a new one is sent.
    const status = b.maintenance ? 'maintenance' : 'active';
    await dbPlatform.insertInto('app_status').values({ app_id: app, status, message: b.message ?? null, updated_by: ctx.userId, updated_at: new Date() })
      .onConflict(oc => oc.column('app_id').doUpdateSet({ status, ...(b.message !== undefined ? { message: b.message || null } : {}), updated_by: ctx.userId, updated_at: new Date() })).execute();
    await staffAudit(ctx, { action: b.maintenance ? 'maintenance.started' : 'maintenance.ended', targetType: 'product', targetId: app, appId: app, purpose: b.reason });
    return { app, status };
  }));
}
