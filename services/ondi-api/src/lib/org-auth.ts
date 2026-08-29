import { FastifyInstance } from 'fastify';
import { JWT_SECRET, JWT_ISSUER } from './env.js';

/** Verifies the Bearer JWT and returns the caller's userId, or null (having already replied) on failure. */
export async function extractUserId(req: any, reply: any): Promise<string | null> {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'missing_token' }) && null;
  try {
    const jwt = await import('jsonwebtoken');
    const payload: any = jwt.default.verify(
      authHeader.slice(7),
      JWT_SECRET,
      { issuer: JWT_ISSUER },
    );
    return payload.sub as string;
  } catch {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
}

/**
 * A single permission grant — either org-wide (scopeGroupId null, the
 * default and every pre-existing UserRole/GroupRole row today) or delegated
 * to a specific group (e.g. "manage_team, but only within the Sales
 * group"). A caller's effective access is the union of every grant they
 * hold, each independently scoped — see hasPermission.
 */
export interface OrgGrant {
  permission: string;
  scopeGroupId: string | null;
}

export interface OrgMembership {
  userId: string;
  organizationId: string;
  roleId: string;
  roleName: string;
  grants: OrgGrant[];
}

/**
 * Returns the caller's effective membership for an org, or null if they
 * aren't a direct member. Grants are the union of their direct role
 * (scoped per their own UserRole.scopeGroupId) plus every Role attached (via
 * GroupRole) to any Group they belong to in this org, each scoped per that
 * GroupRole's own scopeGroupId — group membership only ever adds grants, it
 * can't grant org membership itself (a user must still have a direct
 * UserRole).
 */
export async function requireMember(app: FastifyInstance, userId: string, organizationId: string): Promise<OrgMembership | null> {
  const direct = await app.prisma.userRole.findFirst({
    where: { userId, organizationId },
    include: { role: true },
  });
  if (!direct) return null;

  const memberGroups = await app.prisma.groupMember.findMany({
    where: { userId, group: { organizationId } },
    select: { groupId: true },
  });
  const memberGroupIds = memberGroups.map(g => g.groupId);

  const groupRoles = memberGroupIds.length
    ? await app.prisma.groupRole.findMany({
        where: { groupId: { in: memberGroupIds } },
        include: { role: true },
      })
    : [];

  const grants: OrgGrant[] = [
    ...direct.role.permissions.map(permission => ({ permission, scopeGroupId: direct.scopeGroupId })),
    ...groupRoles.flatMap(gr => gr.role.permissions.map(permission => ({ permission, scopeGroupId: gr.scopeGroupId }))),
  ];

  return {
    userId,
    organizationId,
    roleId: direct.role.id,
    roleName: direct.role.name,
    grants,
  };
}

/**
 * The org RBAC vocabulary. `org:*` (Owner's default) grants everything,
 * including permissions added here in the future — Admin's grant is an
 * explicit enumerated list instead, so a new permission doesn't silently
 * apply to Admins until someone deliberately adds it to their role.
 */
export type OrgPermission =
  | 'org:*'
  | 'org:view'
  | 'org:manage_team'
  | 'org:manage_kyb'
  | 'org:manage_directors'
  | 'org:manage_security'
  | 'org:manage_compliance'
  | 'org:manage_visitors'
  | 'org:manage_access_reviews'
  | 'org:manage_access'
  | 'org:manage_integrations'
  | 'org:manage_policies'
  | 'org:manage_automation'
  | 'org:manage_roles';

/** Runtime-checkable mirror of OrgPermission — used to validate custom-role permission input, since a TS union can't be checked at runtime. */
export const ALL_ORG_PERMISSIONS: OrgPermission[] = [
  'org:*', 'org:view', 'org:manage_team', 'org:manage_kyb', 'org:manage_directors',
  'org:manage_security', 'org:manage_compliance', 'org:manage_visitors', 'org:manage_access_reviews',
  'org:manage_access', 'org:manage_integrations', 'org:manage_policies', 'org:manage_automation', 'org:manage_roles',
];

/**
 * True if any of the caller's grants cover `permission` for this action.
 * An unscoped grant (scopeGroupId null) always matches. A scoped grant only
 * matches if the caller passed `targetGroupIds` (the group(s) the acted-upon
 * resource actually belongs to) and the grant's scope is among them —
 * called with no targetGroupIds, a scoped grant never matches. That's a
 * deliberate fail-closed default: most of this codebase's permissions
 * (manage_kyb, manage_security, manage_compliance, ...) are whole-org
 * settings with no per-resource concept to check a scope against, so a
 * scoped grant of one of those permissions is real but simply unusable
 * until/unless a route is written that supplies a resource for it —
 * quietly treating it as org-wide instead would be a privilege escalation.
 */
export function hasPermission(membership: { grants: OrgGrant[] }, permission: OrgPermission, targetGroupIds?: string[]): boolean {
  return membership.grants.some(g => {
    if (g.permission !== 'org:*' && g.permission !== permission) return false;
    if (g.scopeGroupId === null) return true;
    return !!targetGroupIds?.includes(g.scopeGroupId);
  });
}

/**
 * Real permission gate — checks the caller's actual merged grant set, not
 * just a role-name allowlist. Pass `targetGroupIds` when the action has a
 * specific target resource whose group membership should be checked against
 * scoped grants (e.g. managing a specific member) — omit it for whole-org
 * actions with no such resource.
 */
export async function requirePermission(
  app: FastifyInstance, userId: string, organizationId: string, permission: OrgPermission, targetGroupIds?: string[],
): Promise<boolean> {
  const membership = await requireMember(app, userId, organizationId);
  return !!membership && hasPermission(membership, permission, targetGroupIds);
}

/**
 * The group IDs a given org member belongs to — the `targetGroupIds` a
 * member-management route should pass to requirePermission so a scoped
 * grant (e.g. "manage_team, but only within Sales") is actually checked
 * against who's being acted on, not ignored.
 */
export async function getMemberGroupIds(app: FastifyInstance, userId: string, organizationId: string): Promise<string[]> {
  const memberships = await app.prisma.groupMember.findMany({
    where: { userId, group: { organizationId } },
    select: { groupId: true },
  });
  return memberships.map(m => m.groupId);
}

/**
 * Enforces the org's OrgSecuritySettings (mfaRequired, ipAllowlist) for a member
 * action. Call immediately after requireMember/requirePermission on every org-scoped
 * route — on violation this sends the reply itself and returns false; the caller
 * must `return` immediately. sessionTimeoutMins is enforced separately, on token
 * refresh (routes/auth.ts `/token/refresh`), since it governs session lifetime
 * rather than per-request access.
 */
export async function assertOrgSecurityPolicy(
  app: FastifyInstance, req: any, reply: any, userId: string, organizationId: string,
): Promise<boolean> {
  const settings = await app.prisma.orgSecuritySettings.findUnique({ where: { organizationId } });
  if (!settings) return true;

  if (settings.ipAllowlist.length > 0) {
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const ip = forwarded || req.ip;
    if (!settings.ipAllowlist.includes(ip)) {
      reply.code(403).send({ error: 'ip_not_allowlisted' });
      return false;
    }
  }

  if (settings.mfaRequired) {
    const mfaCred = await app.prisma.credential.findFirst({
      where: { userId, type: 'MFA_APP', verified: true },
    });
    if (!mfaCred) {
      reply.code(403).send({ error: 'mfa_required' });
      return false;
    }
  }

  return true;
}
