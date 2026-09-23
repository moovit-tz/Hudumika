import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';

const labelSchema = z.object({ name: z.string().trim().min(1).max(60), color: z.string().trim().max(20).optional(), hidden: z.boolean().optional() });
const templateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  subject: z.string().max(500).optional(),
  body: z.string().optional(),
});

/**
 * Per-user email_labels (replaces the hardcoded Finance/Shipments/HR/Urgent
 * set every mailbox used to be stuck with) and email_quick_templates
 * (canned-reply/quick-response snippets for the mailbox compose window —
 * see migration 461's comment on why this is deliberately a different
 * table from email_templates, the platform's own transactional-email copy).
 */
export async function emailMetaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('email'));
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // ── Labels ──────────────────────────────────────────────────────────────
  fastify.get('/labels', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('email_labels').selectAll().where('user_id', '=', user.sub).orderBy('name', 'asc').execute());
  });

  fastify.post('/labels', async (request: any, reply) => {
    const user = request.user;
    const b = labelSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('email_labels').select('id').where('user_id', '=', user.sub).where('name', '=', b.name).executeTakeFirst();
      if (existing) return reply.status(409).send({ error: 'A label with this name already exists.' });
      const row = await trx.insertInto('email_labels').values({
        tenant_id: user.tenant_id, user_id: user.sub, name: b.name, color: b.color ?? 'teal',
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return row;
    });
  });

  // PATCH /labels/:id — renaming a label relabels every message that
  // carries it, since labels live as a plain string array on
  // email_messages, not a foreign key.
  fastify.patch('/labels/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const b = labelSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const oldRow = await trx.selectFrom('email_labels').select('name').where('id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!oldRow) return reply.status(404).send({ error: 'Label not found' });

      const patch: Record<string, any> = {};
      if (b.name !== undefined) patch.name = b.name;
      if (b.color !== undefined) patch.color = b.color;
      if (b.hidden !== undefined) patch.hidden = b.hidden;
      if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'No updatable fields provided' });

      const row = await trx.updateTable('email_labels').set(patch).where('id', '=', id).where('user_id', '=', user.sub).returningAll().executeTakeFirst();
      if (b.name !== undefined && b.name !== oldRow.name) {
        const msgs = await trx.selectFrom('email_messages').select(['id', 'labels']).where('user_id', '=', user.sub).execute();
        for (const m of msgs) {
          const arr = Array.isArray(m.labels) ? m.labels : [];
          if (arr.includes(oldRow.name)) {
            await trx.updateTable('email_messages').set({ labels: JSON.stringify(arr.map((l: string) => l === oldRow.name ? b.name : l)) }).where('id', '=', m.id).execute();
          }
        }
      }
      return row;
    });
  });

  fastify.delete('/labels/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('email_labels').where('id', '=', id).where('user_id', '=', user.sub).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Label not found' });
      // Strip the deleted label off every message that carried it — same
      // "plain string array, not a foreign key" reasoning as the rename above.
      const msgs = await trx.selectFrom('email_messages').select(['id', 'labels']).where('user_id', '=', user.sub).execute();
      for (const m of msgs) {
        const arr = Array.isArray(m.labels) ? m.labels : [];
        if (arr.includes(row.name)) {
          await trx.updateTable('email_messages').set({ labels: JSON.stringify(arr.filter((l: string) => l !== row.name)) }).where('id', '=', m.id).execute();
        }
      }
      reply.status(204);
      return null;
    });
  });

  // ── Quick-reply / canned-response templates ─────────────────────────────
  fastify.get('/quick-templates', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('email_quick_templates').selectAll().where('user_id', '=', user.sub).orderBy('name', 'asc').execute());
  });

  fastify.post('/quick-templates', async (request: any, reply) => {
    const user = request.user;
    const b = templateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('email_quick_templates').values({
        tenant_id: user.tenant_id, user_id: user.sub, name: b.name, subject: b.subject ?? '', body: b.body ?? '',
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return row;
    });
  });

  fastify.patch('/quick-templates/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const b = templateSchema.partial().parse(request.body);
    const patch: Record<string, any> = { updated_at: new Date() };
    if (b.name !== undefined) patch.name = b.name;
    if (b.subject !== undefined) patch.subject = b.subject;
    if (b.body !== undefined) patch.body = b.body;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.updateTable('email_quick_templates').set(patch).where('id', '=', id).where('user_id', '=', user.sub).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Template not found' });
      return row;
    });
  });

  fastify.delete('/quick-templates/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('email_quick_templates').where('id', '=', id).where('user_id', '=', user.sub).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Template not found' });
      reply.status(204);
      return null;
    });
  });
}
