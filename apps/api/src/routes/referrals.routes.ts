import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { resolvePublicBaseUrl } from './landed-cost-share.routes.js';

/**
 * AgencyHost M8 — a tenant's own referral link and the commissions it has
 * earned. Not gated to Onsite specifically — any tenant can refer another;
 * agencies are simply the tenants most likely to actually do it.
 */
export async function referralsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'));

  fastify.get('/my-link', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenant = await dbPlatform.selectFrom('tenants').select('slug')
      .where('id', '=', request.user.tenant_id).executeTakeFirst();
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const { url: base, trusted, reason } = resolvePublicBaseUrl();
    return reply.send({
      referral_code: tenant.slug,
      url: trusted ? `${base}/signup?ref=${tenant.slug}` : null,
      // The frontend shows the raw code either way — a tenant can always
      // hand out "?ref=<code>" even when the platform doesn't yet know its
      // own public domain to build a clickable link from.
      reason: trusted ? null : reason,
    });
  });

  fastify.get('/commissions', async (request: FastifyRequest, reply: FastifyReply) => {
    const rows = await dbPlatform.selectFrom('referral_commissions as rc')
      .leftJoin('tenants as t', 't.id', 'rc.referred_tenant_id')
      .select([
        'rc.id', 'rc.amount', 'rc.currency', 'rc.rate', 'rc.status',
        'rc.flagged_reason', 'rc.created_at', 'rc.decided_at', 'rc.paid_at',
        'rc.payout_method', 'rc.payout_note',
        't.name as referred_tenant_name',
      ])
      .where('rc.referring_tenant_id', '=', request.user.tenant_id)
      .orderBy('rc.created_at', 'desc')
      .execute();
    return reply.send(rows);
  });
}
