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
 */
export const ORG_PERMISSIONS = {
  KYC_REVIEW: 'kyc.review',
} as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[keyof typeof ORG_PERMISSIONS];

export async function hasOrgPermission(tenantId: string, userId: string, permission: OrgPermission): Promise<boolean> {
  return withTenant(tenantId, async (trx) => {
    const rows = await trx.selectFrom('ondi_org_role_members as m')
      .innerJoin('ondi_org_roles as r', 'r.id', 'm.role_id')
      .select('r.permissions')
      .where('m.user_id', '=', userId)
      .execute();
    return rows.some((row) => {
      const perms = Array.isArray(row.permissions) ? row.permissions : (() => { try { return JSON.parse(row.permissions ?? '[]'); } catch { return []; } })();
      return perms.includes(permission);
    });
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
