import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@hudumika/types';

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
