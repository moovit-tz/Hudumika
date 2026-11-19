/**
 * Staff authorization for the platform administration APIs that predate the
 * staff console (/v1/superadmin/*, package and add-on catalogue writes).
 *
 * Those endpoints read and change data across every customer without any
 * per-customer filter, so a staff member may use one only when they hold the
 * mapped permission AND platform-wide scope (every customer and product, no
 * exclusions). Staff with a narrower scope use the console's own scoped
 * sections instead. Anything not mapped below stays SuperAdmin-only.
 *
 * Two ways through:
 *  1. A real (not impersonated) SUPER_ADMIN account — the bootstrap and
 *     emergency path; behaviour of /admin is unchanged for these accounts.
 *  2. Active staff whose live grants satisfy the rule (re-read every request).
 *
 * Mutations made through path 2 are written to staff_audit_log with the
 * route, target id and HTTP outcome.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { StaffPermission } from '@hudumika/types';
import { STAFF_PERMISSIONS } from '@hudumika/types';
import { loadStaffContext, staffAudit, type StaffContext } from './staff-access.service.js';

export type PlatformAdminRule = { perm: StaffPermission } | 'superadmin';

/** read = GET/HEAD, write = everything else. Paths are relative to /v1/superadmin. */
const SUPERADMIN_RULES: { re: RegExp; read: PlatformAdminRule; write: PlatformAdminRule }[] = [
  { re: /^\/dashboard-stats$/, read: { perm: 'overview.platform' }, write: 'superadmin' },
  { re: /^\/(analytics|trade-wizard)\//, read: { perm: 'overview.platform' }, write: 'superadmin' },
  { re: /^\/tenants\/[^/]+\/finance$/, read: { perm: 'billing.view' }, write: 'superadmin' },
  { re: /^\/tenants\/[^/]+\/(apps|addons)$/, read: { perm: 'customers.view' }, write: { perm: 'billing.change' } },
  { re: /^\/tenants\/[^/]+\/(service-config|implementations|support-time)(\/|$)/, read: { perm: 'customers.view' }, write: { perm: 'customers.manage' } },
  { re: /^\/tenants\/[^/]+\/feature-flags(\/|$)/, read: { perm: 'customers.view' }, write: 'superadmin' },
  // A customer's own customer list is a business record, not relationship metadata.
  { re: /^\/tenants\/[^/]+\/(customers|resync-cloud-links)$/, read: 'superadmin', write: 'superadmin' },
  { re: /^\/tenants\/[^/]+$/, read: { perm: 'customers.view' }, write: { perm: 'customers.manage' } },
  { re: /^\/tenants$/, read: { perm: 'customers.view' }, write: 'superadmin' },
  { re: /^\/transactions$/, read: { perm: 'billing.view' }, write: 'superadmin' },
  { re: /^\/packages\//, read: { perm: 'billing.view' }, write: { perm: 'billing.change' } },
  { re: /^\/(provider-rates|support-cost-config)(\/|$)/, read: { perm: 'billing.view' }, write: { perm: 'billing.change' } },
  { re: /^\/commercial-products(\/|$)/, read: { perm: 'billing.view' }, write: 'superadmin' },
  { re: /^\/referrals(\/|$)/, read: { perm: 'billing.view' }, write: { perm: 'billing.change' } },
  { re: /^\/activity$/, read: { perm: 'audit.view' }, write: 'superadmin' },
  { re: /^\/domains(\/|$)/, read: { perm: 'products.view' }, write: { perm: 'products.manage' } },
  { re: /^\/app-status(\/|$)/, read: { perm: 'monitoring.view' }, write: { perm: 'maintenance.manage' } },
  { re: /^\/(jobs|server-info)$/, read: { perm: 'monitoring.view' }, write: 'superadmin' },
  // Uploaded registration documents are sensitive content: reviewers only.
  { re: /^\/kyb\/[^/]+\/document$/, read: { perm: 'customers.manage' }, write: 'superadmin' },
  { re: /^\/kyb(-queue|\/)/, read: { perm: 'customers.view' }, write: { perm: 'customers.manage' } },
  { re: /^\/announcements(\/|$)/, read: { perm: 'customers.view' }, write: { perm: 'customers.manage' } },
  { re: /^\/devices$/, read: { perm: 'security.view' }, write: 'superadmin' },
];

export function superadminRuleFor(method: string, routeUrl: string): PlatformAdminRule {
  const rel = routeUrl.replace(/^\/v1\/superadmin/, '').replace(/\/$/, '') || '/';
  const isRead = method === 'GET' || method === 'HEAD';
  const hit = SUPERADMIN_RULES.find(r => r.re.test(rel));
  if (!hit) return 'superadmin';
  return isRead ? hit.read : hit.write;
}

export function hasPlatformWideScope(ctx: StaffContext): boolean {
  const s = ctx.scope;
  return s.allCustomers && s.allProducts && s.excludedCustomerIds.length === 0 && s.excludedProductIds.length === 0;
}

/** Pure decision, exported for tests. */
export function staffMeetsRule(ctx: StaffContext, rule: PlatformAdminRule): { ok: true } | { ok: false; reason: string; code: string } {
  if (rule === 'superadmin') return ctx.isSuperAdmin ? { ok: true } : { ok: false, reason: 'This tool is limited to the SuperAdmin role.', code: 'superadmin_only' };
  if (ctx.isSuperAdmin) return { ok: true };
  if (!ctx.permissions.has(rule.perm)) return { ok: false, reason: `This needs the “${STAFF_PERMISSIONS[rule.perm]}” permission.`, code: 'permission' };
  if (!hasPlatformWideScope(ctx)) return { ok: false, reason: 'This tool covers every customer, so it needs platform-wide scope. Use the console’s Customers and Cases sections for your assigned customers.', code: 'scope' };
  return { ok: true };
}

declare module 'fastify' {
  interface FastifyRequest { platformAdminVia?: 'superadmin_account' | 'staff' }
}

/** preHandler factory. `resolve` picks the rule for this request. */
export function requirePlatformAdmin(resolve: (req: FastifyRequest) => PlatformAdminRule) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as { sub?: string; role?: string; impersonated_by?: string } | undefined;
    if (!user?.sub) return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    if (user.role === 'SUPER_ADMIN' && !user.impersonated_by) { request.platformAdminVia = 'superadmin_account'; return; }
    if (user.impersonated_by) return reply.status(403).send({ error: 'Platform administration requires your own staff sign-in.', code: 'not_staff' });
    const ctx = await loadStaffContext(user.sub, request.ip);
    if (!ctx) return reply.status(403).send({ error: 'Forbidden: platform administration access required.', code: 'not_staff' });
    const verdict = staffMeetsRule(ctx, resolve(request));
    if (!verdict.ok) return reply.status(403).send({ error: verdict.reason, code: verdict.code });
    request.staff = ctx;
    request.platformAdminVia = 'staff';
  };
}

/** Fixed read/write rules — for single routes outside /v1/superadmin. */
export function platformAdminRule(read: PlatformAdminRule, write: PlatformAdminRule = read) {
  return requirePlatformAdmin(req => (req.method === 'GET' || req.method === 'HEAD' ? read : write));
}

/** Audits staff-path mutations on a plugin. Register once per plugin. */
export function auditPlatformAdminMutations(fastify: FastifyInstance) {
  fastify.addHook('onResponse', async (request, reply) => {
    if (request.platformAdminVia !== 'staff' || request.method === 'GET' || request.method === 'HEAD' || !request.staff) return;
    const params = (request.params ?? {}) as Record<string, string>;
    const url = request.routeOptions?.url ?? request.url;
    const tenantId = params.tenantId ?? (/\/tenants\/:id/.test(url) ? params.id : undefined);
    await staffAudit(request.staff, {
      action: `platform_admin.${request.method.toLowerCase()}`,
      targetType: url, targetId: params.id ?? params.code ?? params.tenantId ?? undefined,
      tenantId: tenantId && /^[0-9a-f-]{36}$/i.test(tenantId) ? tenantId : null,
      outcome: reply.statusCode < 400 ? 'ok' : reply.statusCode === 403 ? 'denied' : 'error',
      detail: { status: reply.statusCode, body: clip(request.body) as Record<string, unknown> | undefined },
    });
  });
}

/** Keeps audit rows small: long strings (file contents, HTML) are cut. Secrets are redacted by staffAudit. */
function clip(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.length > 200 ? `${v.slice(0, 200)}… (${v.length} chars)` : v;
  if (depth > 4 || v === null || typeof v !== 'object') return v;
  if (Buffer.isBuffer(v)) return `[${v.length} bytes]`;
  if (Array.isArray(v)) return v.slice(0, 50).map(x => clip(x, depth + 1));
  return Object.fromEntries(Object.entries(v as object).slice(0, 60).map(([k, x]) => [k, clip(x, depth + 1)]));
}

/** For /v1/superadmin/* plugins: the mapped staff rule + mutation audit. */
export function registerSuperadminGuard(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePlatformAdmin(req => superadminRuleFor(req.method, req.routeOptions?.url ?? req.url)));
  auditPlatformAdminMutations(fastify);
}
