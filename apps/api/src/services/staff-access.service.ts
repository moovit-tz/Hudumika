/**
 * Staff console authorization.
 *
 * Effective access = active staff identity ∩ permission ∩ product scope ∩
 * customer scope ∩ resource restriction ∩ session policy. Everything is read
 * from the database on every request (no caching), so revoking a role,
 * removing a team membership or letting a grant expire takes effect on the
 * next call.
 *
 * Combination rules:
 *  - Permissions: union of the permissions of every active role grant and
 *    every active 'allow' override, minus every active 'deny' override. A
 *    deny always wins.
 *  - Product scope: all products if any active role is broad_scope, an
 *    'all_products' grant exists, or a team the person belongs to covers all
 *    products; otherwise the union of direct product grants and team
 *    products. A 'deny' product grant removes that product in every case.
 *  - Customer scope: the same, plus customers the person owns or backs up.
 *    A 'deny' customer grant removes that customer in every case.
 *  - Workspace roles (users.role) are never consulted. A tenant ADMIN is not
 *    staff unless separately granted.
 *
 * Only this service and the staff routes query staff tables, always through
 * dbPlatform with bounded, explicitly filtered queries.
 */
import { sql } from 'kysely';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  ALL_APP_IDS, ALL_STAFF_PERMISSIONS, STAFF_HOMES, STAFF_PERMISSIONS, STAFF_ROLE_TEMPLATES,
  resolveStaffHome, staffHas, staffSections,
  type StaffHomeId, type StaffPermission, type StaffScope,
} from '@hudumika/types';
import { dbPlatform } from '../db/client.js';

export interface StaffContext {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  tenantId: string;
  roles: { id: string; key: string; name: string; defaultHome: string; broadScope: boolean; expiresAt: Date | null }[];
  permissions: Set<StaffPermission>;
  scope: StaffScope;
  teams: { id: string; name: string; kind: string; memberRole: string }[];
  preferredHome: StaffHomeId | null;
  isSuperAdmin: boolean;
  ip: string;
}

export class StaffAccessError extends Error {
  constructor(public status: 401 | 403 | 404 | 409 | 400, message: string, public code = 'forbidden') { super(message); }
}

/** Live grant: started, not expired, not revoked. */
const live = (alias: string) => sql<boolean>`(${sql.ref(`${alias}.starts_at`)} <= now() AND (${sql.ref(`${alias}.expires_at`)} IS NULL OR ${sql.ref(`${alias}.expires_at`)} > now()) AND ${sql.ref(`${alias}.revoked_at`)} IS NULL)`;

let templatesSynced = false;
/** Insert any missing role template; keep SuperAdmin holding every permission. Never overwrites an edited role. */
export async function ensureStaffRoleTemplates(): Promise<void> {
  if (templatesSynced) return;
  for (const t of STAFF_ROLE_TEMPLATES) {
    await dbPlatform.insertInto('staff_roles').values({
      key: t.key, name: t.name, description: t.description, permissions: t.permissions as string[],
      default_home: t.defaultHome, broad_scope: t.broadScope, is_template: true,
    }).onConflict(oc => oc.column('key').doNothing()).execute();
  }
  await dbPlatform.updateTable('staff_roles').set({ permissions: ALL_STAFF_PERMISSIONS as string[], broad_scope: true })
    .where('key', '=', 'superadmin').execute();
  templatesSynced = true;
}

/** Load the caller's staff context, or null if they are not active staff. */
/**
 * /admin now redirects into the console, so a SUPER_ADMIN account that has
 * never been staff (created after migration 919's one-time bootstrap) gets the
 * SuperAdmin staff role on first visit, exactly as 919 did. Only when no
 * staff_members row exists at all: a suspended or revoked staff record is a
 * deliberate decision and is never re-granted here.
 */
async function bootstrapSuperAdminAccount(userId: string): Promise<boolean> {
  const u = await dbPlatform.selectFrom('users').select(['id', 'role', 'active']).where('id', '=', userId).executeTakeFirst();
  if (!u || u.role !== 'SUPER_ADMIN' || u.active === false) return false;
  const role = await dbPlatform.selectFrom('staff_roles').select('id').where('key', '=', 'superadmin').executeTakeFirst();
  if (!role) return false;
  const created = await dbPlatform.transaction().execute(async trx => {
    const m = await trx.insertInto('staff_members').values({ user_id: userId, status: 'active', title: 'SuperAdmin (account bootstrap)' } as any)
      .onConflict(oc => oc.column('user_id').doNothing()).returning('user_id').executeTakeFirst();
    if (!m) return false;
    await trx.insertInto('staff_role_grants').values({ user_id: userId, role_id: role.id, reason: 'Bootstrapped from users.role = SUPER_ADMIN on first console visit' } as any).execute();
    return true;
  });
  if (created) await staffAudit({ userId }, { action: 'staff.bootstrap_superadmin', targetType: 'staff_member', targetId: userId, outcome: 'ok' });
  return created;
}

export async function loadStaffContext(userId: string, ip = ''): Promise<StaffContext | null> {
  await ensureStaffRoleTemplates();
  const member = await dbPlatform.selectFrom('staff_members as m').innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['m.user_id', 'm.status', 'm.preferred_home', 'u.name', 'u.email', 'u.avatar_url', 'u.active', 'u.tenant_id'])
    .where('m.user_id', '=', userId).executeTakeFirst();
  if (!member) return (await bootstrapSuperAdminAccount(userId)) ? loadStaffContext(userId, ip) : null;
  if (member.status !== 'active' || member.active === false) return null;
  const tenant = await dbPlatform.selectFrom('tenants').select(['active']).where('id', '=', member.tenant_id).executeTakeFirst();
  if (!tenant || tenant.active === false) return null;

  const [roles, overrides, scopes, teams] = await Promise.all([
    dbPlatform.selectFrom('staff_role_grants as g').innerJoin('staff_roles as r', 'r.id', 'g.role_id')
      .select(['r.id', 'r.key', 'r.name', 'r.permissions', 'r.default_home', 'r.broad_scope', 'g.expires_at', 'g.granted_at'])
      .where('g.user_id', '=', userId).where(live('g')).orderBy('g.granted_at', 'asc').execute(),
    dbPlatform.selectFrom('staff_permission_overrides as o').select(['o.permission', 'o.effect'])
      .where('o.user_id', '=', userId).where(live('o')).execute(),
    dbPlatform.selectFrom('staff_scope_grants as s').select(['s.scope_type', 's.app_id', 's.tenant_id', 's.effect'])
      .where('s.user_id', '=', userId).where(live('s')).execute(),
    dbPlatform.selectFrom('staff_team_members as tm').innerJoin('staff_teams as t', 't.id', 'tm.team_id')
      .select(['t.id', 't.name', 't.kind', 't.all_products', 't.all_customers', 'tm.member_role'])
      .where('tm.user_id', '=', userId).where('tm.removed_at', 'is', null).where('t.active', '=', true)
      .where(sql<boolean>`tm.starts_at <= now() AND (tm.expires_at IS NULL OR tm.expires_at > now())`).execute(),
  ]);

  const valid = new Set<string>(ALL_STAFF_PERMISSIONS);
  const perms = new Set<StaffPermission>();
  for (const r of roles) for (const p of (r.permissions ?? [])) if (valid.has(p)) perms.add(p as StaffPermission);
  for (const o of overrides) if (o.effect === 'allow' && valid.has(o.permission)) perms.add(o.permission as StaffPermission);
  for (const o of overrides) if (o.effect === 'deny') perms.delete(o.permission as StaffPermission);

  const teamIds = teams.map(t => t.id);
  const [teamProducts, teamCustomers, owned] = await Promise.all([
    teamIds.length ? dbPlatform.selectFrom('staff_team_products').select('app_id').where('team_id', 'in', teamIds).execute() : [],
    teamIds.length ? dbPlatform.selectFrom('staff_team_customers').select('tenant_id').where('team_id', 'in', teamIds).execute() : [],
    dbPlatform.selectFrom('staff_customer_accounts').select('tenant_id')
      .where(eb => eb.or([eb('owner_user_id', '=', userId), eb('backup_owner_user_id', '=', userId)])).execute(),
  ]);
  const broad = roles.some(r => r.broad_scope);
  const scope: StaffScope = {
    allProducts: broad || scopes.some(s => s.scope_type === 'all_products') || teams.some(t => t.all_products),
    allCustomers: broad || scopes.some(s => s.scope_type === 'all_customers') || teams.some(t => t.all_customers),
    productIds: [...new Set([...scopes.filter(s => s.scope_type === 'product' && s.effect === 'allow').map(s => s.app_id!), ...teamProducts.map(t => t.app_id)])],
    customerIds: [...new Set([...scopes.filter(s => s.scope_type === 'customer' && s.effect === 'allow').map(s => s.tenant_id!), ...teamCustomers.map(t => t.tenant_id), ...owned.map(o => o.tenant_id)])],
    excludedProductIds: scopes.filter(s => s.scope_type === 'product' && s.effect === 'deny').map(s => s.app_id!),
    excludedCustomerIds: scopes.filter(s => s.scope_type === 'customer' && s.effect === 'deny').map(s => s.tenant_id!),
  };
  scope.productIds = scope.productIds.filter(p => !scope.excludedProductIds.includes(p));
  scope.customerIds = scope.customerIds.filter(c => !scope.excludedCustomerIds.includes(c));

  return {
    userId, name: member.name, email: member.email ?? '', avatarUrl: member.avatar_url ?? null, tenantId: member.tenant_id,
    roles: roles.map(r => ({ id: r.id, key: r.key, name: r.name, defaultHome: r.default_home, broadScope: r.broad_scope, expiresAt: r.expires_at })),
    permissions: perms, scope, teams: teams.map(t => ({ id: t.id, name: t.name, kind: t.kind, memberRole: t.member_role })),
    preferredHome: (member.preferred_home as StaffHomeId | null) ?? null,
    isSuperAdmin: roles.some(r => r.key === 'superadmin'), ip,
  };
}

// ── Scope predicates ─────────────────────────────────────────────────────
export function can(ctx: StaffContext, ...anyOf: StaffPermission[]): boolean { return anyOf.some(p => ctx.permissions.has(p)); }
export function canProduct(ctx: StaffContext, appId: string | null | undefined): boolean {
  if (!appId) return ctx.scope.allProducts; // unattributed records need broad product scope
  if (ctx.scope.excludedProductIds.includes(appId)) return false;
  return ctx.scope.allProducts || ctx.scope.productIds.includes(appId);
}
export function canCustomer(ctx: StaffContext, tenantId: string): boolean {
  if (ctx.scope.excludedCustomerIds.includes(tenantId)) return false;
  return ctx.scope.allCustomers || ctx.scope.customerIds.includes(tenantId);
}
/**
 * A case is in scope when its customer is in scope OR its product is in
 * scope (a product team handles every customer's cases for that product),
 * and neither is explicitly excluded.
 */
export function canCase(ctx: StaffContext, c: { tenant_id: string; app: string | null }): boolean {
  if (ctx.scope.excludedCustomerIds.includes(c.tenant_id)) return false;
  if (c.app && ctx.scope.excludedProductIds.includes(c.app)) return false;
  return canCustomer(ctx, c.tenant_id) || (!!c.app && canProduct(ctx, c.app));
}

/** SQL filter for a tenant id column, matching canCustomer. */
export function customerScopeSql(ctx: StaffContext, column: string) {
  const col = sql.ref(column);
  const ex = ctx.scope.excludedCustomerIds;
  const exSql = ex.length ? sql`${col} <> ALL(${sql.val(ex)}::uuid[])` : sql`true`;
  if (ctx.scope.allCustomers) return sql<boolean>`(${exSql})`;
  const ids = ctx.scope.customerIds;
  return ids.length ? sql<boolean>`(${col} = ANY(${sql.val(ids)}::uuid[]) AND ${exSql})` : sql<boolean>`false`;
}
/** SQL filter for cases (tenant + app columns), matching canCase. */
export function caseScopeSql(ctx: StaffContext, tenantCol: string, appCol: string) {
  const t = sql.ref(tenantCol), a = sql.ref(appCol);
  const exC = ctx.scope.excludedCustomerIds, exP = ctx.scope.excludedProductIds;
  const notExcluded = sql`(${exC.length ? sql`${t} <> ALL(${sql.val(exC)}::uuid[])` : sql`true`} AND ${exP.length ? sql`(${a} IS NULL OR ${a} <> ALL(${sql.val(exP)}::text[]))` : sql`true`})`;
  const custIn = ctx.scope.allCustomers ? sql`true` : ctx.scope.customerIds.length ? sql`${t} = ANY(${sql.val(ctx.scope.customerIds)}::uuid[])` : sql`false`;
  const prodIn = ctx.scope.allProducts ? sql`${a} IS NOT NULL` : ctx.scope.productIds.length ? sql`${a} = ANY(${sql.val(ctx.scope.productIds)}::text[])` : sql`false`;
  return sql<boolean>`((${custIn} OR ${prodIn}) AND ${notExcluded})`;
}
export function productsInScope(ctx: StaffContext): string[] {
  const all = ALL_APP_IDS.filter(a => a !== 'lens');
  return (ctx.scope.allProducts ? all : all.filter(a => ctx.scope.productIds.includes(a))).filter(a => !ctx.scope.excludedProductIds.includes(a));
}

export function assertCan(ctx: StaffContext, ...anyOf: StaffPermission[]) {
  if (!can(ctx, ...anyOf)) throw new StaffAccessError(403, `This needs the “${STAFF_PERMISSIONS[anyOf[0]]}” permission.`, 'permission');
}
export function assertCustomer(ctx: StaffContext, tenantId: string) {
  // 404, not 403: an out-of-scope customer is indistinguishable from a missing one.
  if (!canCustomer(ctx, tenantId)) throw new StaffAccessError(404, 'Customer not found.', 'scope');
}

// ── Homes ────────────────────────────────────────────────────────────────
export function homeFor(ctx: StaffContext) {
  const perms = [...ctx.permissions];
  const preferred = [ctx.preferredHome, ...ctx.roles.map(r => r.defaultHome as StaffHomeId)];
  const home = resolveStaffHome(perms, preferred);
  const availableHomes = (Object.keys(STAFF_HOMES) as StaffHomeId[]).filter(h => staffHas(perms, STAFF_HOMES[h].anyOf));
  return { home, homePath: home ? STAFF_HOMES[home].path : null, availableHomes, sections: staffSections(perms).map(s => s.id) };
}

// ── Audit ────────────────────────────────────────────────────────────────
const REDACT = /password|secret|token|totp|backup_code|api_key|card|iban|account_number/i;
function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 50).map(x => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, REDACT.test(k) ? '[redacted]' : redact(x, depth + 1)]));
}
export async function staffAudit(ctx: { userId: string; ip?: string } | null, e: {
  action: string; targetType?: string; targetId?: string; tenantId?: string | null; appId?: string | null;
  purpose?: string | null; outcome?: 'ok' | 'denied' | 'error'; detail?: Record<string, unknown>;
}) {
  await dbPlatform.insertInto('staff_audit_log').values({
    actor_user_id: ctx?.userId ?? null, action: e.action, target_type: e.targetType ?? null, target_id: e.targetId ?? null,
    tenant_id: e.tenantId ?? null, app_id: e.appId ?? null, purpose: e.purpose ?? null, outcome: e.outcome ?? 'ok',
    detail: JSON.stringify(redact(e.detail ?? {})) as any, ip_address: ctx?.ip && /^[0-9a-f:.]+$/i.test(ctx.ip) ? ctx.ip : null,
  }).execute().catch(err => console.error('[staff] audit write failed:', err?.message));
}

// ── Fastify integration ──────────────────────────────────────────────────
declare module 'fastify' {
  interface FastifyRequest { staff?: StaffContext }
}

/** preHandler: the caller must be active staff (no particular permission). */
export async function requireStaffMember(request: FastifyRequest, reply: FastifyReply) {
  const sub = (request as any).user?.sub as string | undefined;
  // Impersonated sessions never act as staff: the real operator must sign in as themself.
  if (!sub || (request as any).user?.impersonated_by) return reply.status(403).send({ error: 'Staff console access requires your own staff sign-in.', code: 'not_staff' });
  const ctx = await loadStaffContext(sub, request.ip);
  if (!ctx) return reply.status(403).send({ error: 'You do not have staff console access.', code: 'not_staff' });
  request.staff = ctx;
}

export function staffErrorReply(reply: FastifyReply, err: unknown) {
  if (err instanceof StaffAccessError) return reply.status(err.status).send({ error: err.message, code: err.code });
  throw err;
}

// ── Grant management guards ──────────────────────────────────────────────
/** Users with a live, active SuperAdmin grant. */
export async function activeSuperAdminCount(excludingGrantId?: string): Promise<number> {
  let q = dbPlatform.selectFrom('staff_role_grants as g').innerJoin('staff_roles as r', 'r.id', 'g.role_id')
    .innerJoin('staff_members as m', 'm.user_id', 'g.user_id').innerJoin('users as u', 'u.id', 'g.user_id')
    .select(sql<number>`count(DISTINCT g.user_id)::int`.as('n'))
    .where('r.key', '=', 'superadmin').where(live('g')).where('m.status', '=', 'active').where('u.active', 'is not', false)
    // A SuperAdmin grant that expires is not a durable access path.
    .where('g.expires_at', 'is', null);
  if (excludingGrantId) q = q.where('g.id', '<>', excludingGrantId);
  return (await q.executeTakeFirstOrThrow()).n;
}

/**
 * No self-escalation: you cannot change your own grants, and you cannot grant
 * a role or permission that includes anything you do not hold yourself.
 */
export function assertCanGrant(ctx: StaffContext, targetUserId: string, permissions: string[], broad: boolean) {
  if (targetUserId === ctx.userId) throw new StaffAccessError(403, 'You cannot change your own staff access. Ask another administrator.', 'self_escalation');
  const missing = permissions.filter(p => !ctx.permissions.has(p as StaffPermission));
  if (missing.length) throw new StaffAccessError(403, `You cannot grant permissions you do not hold: ${missing.slice(0, 5).join(', ')}.`, 'escalation');
  if (broad && !(ctx.scope.allProducts && ctx.scope.allCustomers)) throw new StaffAccessError(403, 'Only staff with broad scope can grant broad scope.', 'escalation');
}
