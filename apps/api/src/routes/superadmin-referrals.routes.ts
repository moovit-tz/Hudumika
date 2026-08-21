import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { resolveDisbursementProvider, NO_DISBURSEMENT_PROVIDER_MESSAGE } from '../services/referral-payout.service.js';

/**
 * AgencyHost M8 — platform view of every referral commission, across every
 * tenant. Deliberately cross-tenant (dbPlatform, gated on SUPER_ADMIN at the
 * route level), same shape as superadmin-issues.routes.ts.
 */
export async function superAdminReferralsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { status?: string };
    let query = dbPlatform.selectFrom('referral_commissions as rc')
      .leftJoin('tenants as referring', 'referring.id', 'rc.referring_tenant_id')
      .leftJoin('tenants as referred', 'referred.id', 'rc.referred_tenant_id')
      .select([
        'rc.id', 'rc.amount', 'rc.currency', 'rc.rate', 'rc.status',
        'rc.flagged_reason', 'rc.source_payment_ref',
        'rc.created_at', 'rc.decided_at', 'rc.paid_at',
        'rc.payout_method', 'rc.payout_note',
        'referring.name as referring_tenant_name',
        'referred.name as referred_tenant_name',
      ])
      .orderBy('rc.created_at', 'desc');
    if (q.status && q.status !== 'all') query = query.where('rc.status', '=', q.status);
    const rows = await query.execute();
    return reply.send(rows);
  });

  fastify.patch<{ Params: { id: string }; Body: { status: 'approved' | 'rejected' } }>(
    '/:id/status',
    async (request, reply) => {
      const { status } = z.object({ status: z.enum(['approved', 'rejected']) }).parse(request.body);
      const updated = await dbPlatform.updateTable('referral_commissions')
        .set({ status, decided_at: new Date(), decided_by: request.user.sub })
        .where('id', '=', request.params.id)
        .where('status', 'in', ['pending', 'flagged'])
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Commission not found, or already decided.' });
      return reply.send(updated);
    },
  );

  /**
   * Automatic payout, if a real provider is ever connected — refuses
   * cleanly today, matching onsite.routes.ts's own deploy-refusal shape
   * for "no CI provider connected."
   */
  fastify.post<{ Params: { id: string } }>('/:id/payout', async (request, reply) => {
    const commission = await dbPlatform.selectFrom('referral_commissions').selectAll()
      .where('id', '=', request.params.id).where('status', '=', 'approved').executeTakeFirst();
    if (!commission) return reply.status(404).send({ error: 'Approved commission not found.' });

    const provider = await resolveDisbursementProvider(commission.referring_tenant_id);
    if (!provider) return reply.status(409).send({ error: NO_DISBURSEMENT_PROVIDER_MESSAGE });

    // Real once a provider exists — deliberately not implemented further
    // than the refusal above until one is connected.
    return reply.status(501).send({ error: 'Not implemented yet.' });
  });

  /**
   * Manual payout record — the same honest, free-text method/note pattern
   * invoice_payments already uses platform-wide for every other kind of
   * "we got paid, out-of-band" event in this codebase.
   */
  fastify.post<{ Params: { id: string }; Body: { method: string; note?: string } }>(
    '/:id/payout/manual',
    async (request, reply) => {
      const body = z.object({ method: z.string().trim().min(1).max(50), note: z.string().trim().max(2000).optional() }).parse(request.body);
      const updated = await dbPlatform.updateTable('referral_commissions')
        .set({ status: 'paid', paid_at: new Date(), payout_method: body.method, payout_note: body.note ?? null })
        .where('id', '=', request.params.id)
        .where('status', '=', 'approved')
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Approved commission not found.' });
      return reply.send(updated);
    },
  );
}
