import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload, UserRole } from '@hudumika/types';

/**
 * Route preHandler hook to restrict access to specific user roles
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }

    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        error: `Forbidden: Access denied. Required one of [${allowedRoles.join(', ')}], user has role: ${user.role}`,
      });
    }
  };
}

/**
 * True for a real SUPER_ADMIN session, or one currently impersonating
 * someone else via /auth/impersonate or /auth/impersonate-customer — the
 * token's role/tenant_id belong to the impersonated identity, but
 * impersonated_by (see JWTPayload) still names the real actor. Deliberately
 * separate from requireRole('SUPER_ADMIN') (an exact-match check used
 * elsewhere for genuinely SUPER_ADMIN-only surfaces like tenant CRUD) —
 * this one is for actions that should still work while impersonating, like
 * permanently deleting a Cloud file so a SuperAdmin can use the tenant's own
 * Trash UI instead of a separate cross-tenant one.
 */
export function isPlatformSuperAdmin(user: JWTPayload | null | undefined): boolean {
  return !!user && (user.role === 'SUPER_ADMIN' || !!user.impersonated_by);
}

export function requirePlatformSuperAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isPlatformSuperAdmin(request.user)) {
      return reply.status(403).send({ error: 'Forbidden: only the platform SuperAdmin can do this.' });
    }
  };
}
