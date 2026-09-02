import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@hudumika/types';
import { withTenant } from '../db/client.js';

/**
 * Ondi M5's custom-roles permission catalog — small and code-defined, not
 * admin-extensible. This is deliberately narrow: only permissions that
 * actually gate something real belong here. Adding a permission that
 * nothing checks would repeat the exact mistake org_permissions.routes.ts
 * already made — a role/permission editor writing to a table nothing
 * reads (found while researching this milestone; left alone, not fixed,
 * since rewiring ~100 existing route files' auth checks is a different,
 * much larger, unrelated project).
 *
 * Deliberately still excluded: anything that lets a holder create/delete
 * custom roles or grant/revoke role membership (POST/DELETE
 * /org/roles*, in oneid.routes.ts). Gating those with a custom-role
 * permission would let a non-admin holder mint a new role carrying any
 * permission — including that same one — and grant it to themselves or
 * anyone else, a straightforward self-escalation path. Role
 * administration stays ADMIN/TENANT_ADMIN-only; every permission below
 * only ever narrows what an *already-defined, admin-created* role can do.
 */
export const ORG_PERMISSIONS = {
  KYC_REVIEW: 'kyc.review',
  ACCESS_REQUESTS_REVIEW: 'access_requests.review',
  API_KEYS_MANAGE: 'api_keys.manage',
  ORG_CHART_MANAGE: 'org_chart.manage',
  SSO_PROVIDERS_MANAGE: 'sso_providers.manage',
  ACCESS_REVIEWS_MANAGE: 'access_reviews.manage',
  ORG_TRUST_VIEW: 'org_trust.view',
  AUTOMATION_MANAGE: 'automation.manage',
  COMPLIANCE_REVIEW: 'compliance.review',
  POLICIES_MANAGE: 'policies.manage',
  ASSETS_MANAGE: 'assets.manage',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  VISITORS_MANAGE: 'visitors.manage',
  GROUPS_MANAGE: 'groups.manage',
  COMPLY_MANAGE: 'comply.manage',
} as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[keyof typeof ORG_PERMISSIONS];

export async function hasOrgPermission(tenantId: string, userId: string, permission: OrgPermission): Promise<boolean> {
  return withTenant(tenantId, async (trx) => {
    const rows = await trx.selectFrom('ondi_org_role_members as m')
      .innerJoin('ondi_org_roles as r', 'r.id', 'm.role_id')
      .select('r.permissions')
      .where('m.user_id', '=', userId)
      // A time-bound grant (migration 364) stops counting once past its
      // expiry — no cleanup job needed, this check is the enforcement.
      .where(eb => eb.or([eb('m.expires_at', 'is', null), eb('m.expires_at', '>', new Date())]))
      .execute();
    return rows.some((row) => {
      const perms = Array.isArray(row.permissions) ? row.permissions : (() => { try { return JSON.parse(row.permissions ?? '[]'); } catch { return []; } })();
      return perms.includes(permission);
    });
  });
}

export async function getUserOrgPermissions(tenantId: string, userId: string): Promise<string[]> {
  return withTenant(tenantId, async (trx) => {
    const rows = await trx.selectFrom('ondi_org_role_members as m')
      .innerJoin('ondi_org_roles as r', 'r.id', 'm.role_id')
      .select('r.permissions')
      .where('m.user_id', '=', userId)
      .where(eb => eb.or([eb('m.expires_at', 'is', null), eb('m.expires_at', '>', new Date())]))
      .execute();
    const allPerms = new Set<string>();
    for (const row of rows) {
      const perms = Array.isArray(row.permissions) ? row.permissions : (() => { try { return JSON.parse(row.permissions ?? '[]'); } catch { return []; } })();
      for (const p of perms) {
        allPerms.add(p);
      }
    }
    return Array.from(allPerms);
  });
}

/** Same shape as middleware/rbac.ts's requireRole(), but also lets in
 *  anyone holding a custom role granted `permission` — additive, never a
 *  replacement for the coarse role check it's combined with. */
export function requireRoleOrOrgPermission(permission: OrgPermission, ...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    if (allowedRoles.includes(user.role)) return;
    if (await hasOrgPermission(user.tenant_id, user.sub, permission)) return;
    return reply.status(403).send({ error: `Forbidden: requires one of [${allowedRoles.join(', ')}] or the "${permission}" permission.` });
  };
}
