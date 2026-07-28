import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';

// Tenant-admin ↔ Hudumika platform support — distinct from support.routes.ts,
// which is the tenant's OWN customer-facing helpdesk (support_tickets, keyed
// off `customers`). This is for the tenant asking Hudumika itself for help
// (billing questions, technical issues), which Subscription.tsx's Support tab
// previously rendered as 4 hardcoded fake tickets with no submit path at all.
export default async function platformSupportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/tickets', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('platform_support_tickets').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute()
    );
  });

  fastify.post<{ Body: { subject: string; category?: string; priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'; message: string } }>(
    '/tickets',
    async (request, reply) => {
      const user = request.user;
      const b = request.body;
      if (!b.subject?.trim() || !b.message?.trim()) {
        reply.status(400);
        return { error: 'Subject and message are required' };
      }
      return withTenant(user.tenant_id, async (trx) => {
        const ticket = await trx.insertInto('platform_support_tickets').values({
          tenant_id: user.tenant_id,
          ref_number: `PS-${Math.floor(1000 + Math.random() * 9000)}`,
          created_by: user.sub,
          subject: b.subject.trim(),
          category: b.category || 'general',
          priority: b.priority || 'NORMAL',
          status: 'OPEN',
        }).returningAll().executeTakeFirstOrThrow();

        await trx.insertInto('platform_support_messages').values({
          ticket_id: ticket.id, tenant_id: user.tenant_id,
          author_id: user.sub, author_name: user.name,
          is_platform_staff: false, content: b.message.trim(),
        }).execute();

        reply.status(201);
        return ticket;
      });
    }
  );

  fastify.get<{ Params: { id: string } }>('/tickets/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx.selectFrom('platform_support_tickets').selectAll()
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!ticket) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }
      const messages = await trx.selectFrom('platform_support_messages').selectAll()
        .where('ticket_id', '=', ticket.id).orderBy('created_at', 'asc').execute();
      return { ...ticket, messages };
    });
  });

  fastify.post<{ Params: { id: string }; Body: { message: string } }>('/tickets/:id/reply', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx.selectFrom('platform_support_tickets').select('id')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!ticket) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }
      const message = await trx.insertInto('platform_support_messages').values({
        ticket_id: ticket.id, tenant_id: user.tenant_id,
        author_id: user.sub, author_name: user.name,
        is_platform_staff: false, content: request.body.message.trim(),
      }).returningAll().executeTakeFirstOrThrow();
      await trx.updateTable('platform_support_tickets').set({ updated_at: new Date() }).where('id', '=', ticket.id).execute();
      reply.status(201);
      return message;
    });
  });
}
