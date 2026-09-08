import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { INTERNAL_ROLES, type UserRole } from '@hudumika/types';

/**
 * Backs Escalations.tsx (Bliss) — previously a page that stored every
 * escalation entirely in the calling browser's localStorage, so a junior
 * officer's escalation was invisible to anyone but themself on their own
 * machine. See migration 406.
 *
 * Migration 412 widened this from CASE-only to also cover a Team CHAT
 * message escalated to a higher-level role — same PENDING/IN_PROGRESS/
 * RESOLVED workflow, same role gating, one subject_type discriminator
 * instead of a second parallel table/route file. Escalating from Chat.tsx
 * itself posts here with subjectType: 'CHAT'.
 */

const RESOLVE_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR'];
// JUNIOR/OFFICER only ever see their own escalations — matching the page's
// existing framing ("Your escalated cases") — enforced here, not just by
// the frontend hiding the rest.
const OWN_ONLY_ROLES: UserRole[] = ['JUNIOR', 'OFFICER'];

// subjectType is optional on the CASE shape — every existing caller (the
// case-escalation modal) never sent it at all, implicitly always a case —
// so a plain z.union (tried in order) rather than discriminatedUnion (which
// requires the literal on every branch) is what lets an old, unchanged
// request body keep matching.
const chatSchema = z.object({
  subjectType: z.literal('CHAT'),
  channelId: z.string().uuid(),
  channelName: z.string().trim().min(1).max(255),
  messageId: z.string().uuid().optional(),
  messageSnippet: z.string().max(2000).optional(),
  reason: z.string().trim().min(1).max(200),
  note: z.string().max(5000).optional(),
});
const caseSchema = z.object({
  subjectType: z.literal('CASE').optional(),
  caseId: z.string().uuid().optional(),
  caseRef: z.string().trim().min(1).max(100),
  goodsDesc: z.string().max(2000).optional(),
  reason: z.string().trim().min(1).max(200),
  note: z.string().max(5000).optional(),
});
const createSchema = z.union([chatSchema, caseSchema]);

export default async function escalationsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('bliss'));
  fastify.addHook('preHandler', requireRole(...INTERNAL_ROLES));

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('case_escalations').selectAll().where('tenant_id', '=', user.tenant_id);
      if (OWN_ONLY_ROLES.includes(user.role)) {
        q = q.where('escalated_by', '=', user.sub);
      }
      return q.orderBy('escalated_at', 'desc').execute();
    });
  });

  fastify.post<{ Body: z.infer<typeof createSchema> }>('/', async (request, reply) => {
    const user = request.user;
    const body = createSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid escalation' });
    const d = body.data;

    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('case_escalations').values(
        d.subjectType === 'CHAT'
          ? {
              tenant_id: user.tenant_id, subject_type: 'CHAT',
              channel_id: d.channelId, channel_name: d.channelName,
              message_id: d.messageId ?? null, message_snippet: d.messageSnippet ?? null,
              reason: d.reason, note: d.note ?? null,
              escalated_by: user.sub, escalated_by_name: user.name, status: 'PENDING',
            }
          : {
              tenant_id: user.tenant_id, subject_type: 'CASE',
              case_id: d.caseId ?? null, case_ref: d.caseRef, goods_desc: d.goodsDesc ?? null,
              reason: d.reason, note: d.note ?? null,
              escalated_by: user.sub, escalated_by_name: user.name, status: 'PENDING',
            }
      ).returningAll().executeTakeFirstOrThrow();

      // Fan out one notification per resolver-tier user in this tenant, the
      // same "one row per recipient" shape chat.routes.ts already uses for
      // an ordinary message — this used to fire zero notifications for any
      // escalation, case or chat, so a senior only ever found out about one
      // by manually opening this page. escalated_by is excluded even on the
      // rare case they're themselves in RESOLVE_ROLES (e.g. a SENIOR
      // escalating a case to another SENIOR) — no point notifying yourself
      // of your own action.
      const resolvers = await trx.selectFrom('users').select('id')
        .where('tenant_id', '=', user.tenant_id).where('role', 'in', RESOLVE_ROLES)
        .where('active', '=', true).where('id', '!=', user.sub).execute();
      if (resolvers.length > 0) {
        const title = d.subjectType === 'CHAT'
          ? `Message escalated in #${d.channelName}`
          : `Case escalated: ${d.caseRef}`;
        const link = d.subjectType === 'CHAT'
          ? `/bliss/inbox?view=team&channel=${d.channelId}`
          : `/escalations`;
        await trx.insertInto('notifications').values(
          resolvers.map((r) => ({
            tenant_id: user.tenant_id, user_id: r.id, app: 'bliss', type: 'escalation',
            title, message: `${d.reason} — by ${user.name}`, link, metadata: '{}',
            entity_type: 'case_escalation', entity_id: row.id, entity_label: d.subjectType === 'CHAT' ? d.channelName : d.caseRef,
            shipment_id: null, customer_id: null, trigger_type: null,
            channel: null, recipient: null, content: null,
          } as any))
        ).execute();
      }

      reply.status(201);
      return row;
    });
  });

  // Advances PENDING -> IN_PROGRESS -> RESOLVED one step, matching the
  // single "Accept & Work" / "Mark Resolved" button the frontend already
  // has — there's no separate "set to any status" control to back.
  fastify.patch<{ Params: { id: string } }>('/:id/advance', { preHandler: [requireRole(...RESOLVE_ROLES)] }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const esc = await trx.selectFrom('case_escalations').selectAll()
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!esc) return reply.status(404).send({ error: 'Escalation not found' });
      if (esc.status === 'RESOLVED') return reply.status(409).send({ error: 'Already resolved' });

      const nextStatus = esc.status === 'PENDING' ? 'IN_PROGRESS' : 'RESOLVED';
      const updated = await trx.updateTable('case_escalations').set({
        status: nextStatus,
        ...(nextStatus === 'RESOLVED' ? { resolved_at: new Date(), resolved_by: user.sub } : {}),
        updated_at: new Date(),
      }).where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
      return updated;
    });
  });
}
