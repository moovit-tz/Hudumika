import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';

const criteriaSchema = z.object({
  from: z.string().trim().max(255).optional(),
  to: z.string().trim().max(255).optional(),
  subject: z.string().trim().max(255).optional(),
  hasWords: z.string().trim().max(500).optional(),
  doesntHave: z.string().trim().max(500).optional(),
  hasAttachment: z.boolean().optional(),
  sizeCmp: z.enum(['gt', 'lt']).optional(),
  sizeMb: z.number().optional(),
});
const actionsSchema = z.object({
  skipInbox: z.boolean().optional(),
  archive: z.boolean().optional(),
  star: z.boolean().optional(),
  markRead: z.boolean().optional(),
  delete: z.boolean().optional(),
  label: z.string().trim().max(100).optional(),
});
const createSchema = z.object({
  criteria: criteriaSchema,
  actions: actionsSchema,
  // Apply retroactively to every already-stored message this criteria set
  // matches, in addition to going forward — matches Gmail's own "Also apply
  // filter to N matching conversations" checkbox.
  applyToExisting: z.boolean().optional(),
});

export async function emailFiltersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('email'));
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('email_filters').selectAll().where('user_id', '=', user.sub).orderBy('created_at', 'desc').execute());
  });

  fastify.post('/', async (request: any) => {
    const user = request.user;
    const b = createSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('email_filters').values({
        tenant_id: user.tenant_id,
        user_id: user.sub,
        criteria: JSON.stringify(b.criteria),
        actions: JSON.stringify(b.actions),
      }).returningAll().executeTakeFirstOrThrow();

      let appliedCount = 0;
      if (b.applyToExisting) {
        // Same predicates as GET /v1/emails's advanced-search branch — "also
        // apply to existing" matches exactly what Search would have shown.
        let q = trx.selectFrom('email_messages').select('id').where('user_id', '=', user.sub);
        const { from, to, subject, hasAttachment, hasWords, doesntHave } = b.criteria;
        if (from) q = q.where(sql<boolean>`(from_name ILIKE ${'%' + from + '%'} OR from_email ILIKE ${'%' + from + '%'})`);
        if (to) q = q.where(sql<boolean>`(to_addresses::text ILIKE ${'%' + to + '%'} OR cc_addresses::text ILIKE ${'%' + to + '%'})`);
        if (subject) q = q.where('subject', 'ilike', `%${subject}%`);
        if (hasAttachment) q = q.where('has_attachment', '=', true);
        if (hasWords) q = q.where(sql<boolean>`search_vector @@ plainto_tsquery('english', ${hasWords})`);
        if (doesntHave) q = q.where(sql<boolean>`NOT (search_vector @@ plainto_tsquery('english', ${doesntHave}))`);

        const matches = await q.execute();
        const ids = matches.map(r => r.id);

        if (ids.length) {
          const patch: Record<string, unknown> = {};
          if (b.actions.archive || b.actions.skipInbox) patch.folder = 'archive';
          if (b.actions.star) patch.starred = true;
          if (b.actions.markRead) patch.read = true;
          if (b.actions.delete) patch.folder = 'trash';
          if (Object.keys(patch).length) {
            await trx.updateTable('email_messages').set(patch).where('id', 'in', ids).execute();
          }
          if (b.actions.label) {
            const existing = await trx.selectFrom('email_messages').select(['id', 'labels']).where('id', 'in', ids).execute();
            for (const m of existing) {
              const labels = Array.isArray(m.labels) ? m.labels : [];
              if (!labels.includes(b.actions.label)) {
                await trx.updateTable('email_messages').set({ labels: JSON.stringify([...labels, b.actions.label]) }).where('id', '=', m.id).execute();
              }
            }
          }
          appliedCount = ids.length;
        }
      }

      return { ...row, appliedCount };
    });
  });

  fastify.delete('/:id', async (request: any, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const result = await trx.deleteFrom('email_filters')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) return reply.status(404).send({ error: 'Filter not found.' });
      return { success: true };
    });
  });
}
