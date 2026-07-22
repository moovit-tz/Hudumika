import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';

/**
 * Route preHandler hook restricting access to tenants that have the given
 * app enabled. Must run after fastify.authenticate (needs request.user).
 * Apps default to enabled — a tenant only loses access once a SuperAdmin
 * explicitly sets enabled-apps[appId] = false via PATCH /v1/superadmin/tenants/:id/apps.
 */
export function requireAppEnabled(appId: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }
    // SuperAdmins administer every app regardless of a tenant's enabled-apps config.
    if (user.role === 'SUPER_ADMIN') return;

    const row = await db.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const enabledApps = settings['enabled-apps'] as Record<string, boolean> | undefined;

    if (enabledApps && enabledApps[appId] === false) {
      return reply.status(403).send({ error: `This app is not enabled for your organization.` });
    }
  };
}
