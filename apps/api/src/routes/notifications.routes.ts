import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';

export async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * GET /v1/notifications
   * List in-app notifications for the logged-in user.
   * Returns { notifications: [...], unread_count: N }
   */
  fastify.get('/', async (request, reply) => {
    const user = request.user;

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx
        .selectFrom('notifications')
        .selectAll()
        .where('title', 'is not', null); // Only in-app notifications have a title

      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', user.sub);
      } else {
        q = q.where('user_id', '=', user.sub);
      }

      const list = await q.orderBy('created_at', 'desc').limit(50).execute();

      const unread_count = list.filter((n) => !n.read).length;

      return { notifications: list, unread_count };
    });
  });

  /**
   * GET /v1/notifications/unread-count
   * Returns count of unread in-app notifications for badge icons
   */
  fastify.get('/unread-count', async (request, reply) => {
    const user = request.user;

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx
        .selectFrom('notifications')
        .select(trx.fn.count('id').as('cnt'))
        .where('read', '=', false)
        .where('title', 'is not', null);

      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', user.sub);
      } else {
        q = q.where('user_id', '=', user.sub);
      }

      const result = await q.executeTakeFirst();
      return { count: Number(result?.cnt ?? 0) };
    });
  });

  /**
   * PATCH /v1/notifications/read-all
   * Mark all notifications for the current user as read
   */
  fastify.patch('/read-all', async (request, reply) => {
    const user = request.user;

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx
        .updateTable('notifications')
        .set({ read: true, read_at: new Date() })
        .where('read', '=', false);

      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', user.sub);
      } else {
        q = q.where('user_id', '=', user.sub);
      }

      await q.execute();
      return { success: true };
    });
  });

  /**
   * PATCH /v1/notifications/:id/read
   * Mark a single notification as read
   */
  fastify.patch('/:id/read', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx
        .updateTable('notifications')
        .set({ read: true, read_at: new Date() })
        .where('id', '=', id);

      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', user.sub);
      } else {
        q = q.where('user_id', '=', user.sub);
      }

      await q.execute();
      return { success: true };
    });
  });

  /**
   * POST /v1/notifications
   * Create an in-app notification.
   * Body: { user_id, tenant_id?, type?, title, message?, link?, metadata? }
   * tenant_id defaults to the requesting user's tenant.
   */
  fastify.post('/', async (request, reply) => {
    const user = request.user;
    const body = request.body as {
      user_id: string;
      tenant_id?: string;
      type?: string;
      title: string;
      message?: string;
      link?: string;
      metadata?: any;
    };

    const tenant_id = body.tenant_id ?? user.tenant_id;

    return withTenant(tenant_id, async (trx) => {
      const [row] = await trx
        .insertInto('notifications')
        .values({
          tenant_id,
          user_id: body.user_id,
          type: body.type ?? 'info',
          title: body.title,
          message: body.message ?? null,
          link: body.link ?? null,
          metadata: body.metadata ? JSON.stringify(body.metadata) : '{}',
          // legacy fields — null for in-app notifications
          shipment_id: null,
          customer_id: null,
          trigger_type: null,
          channel: null,
          recipient: null,
          content: null,
        } as any)
        .returningAll()
        .execute();

      return { notification: row };
    });
  });
}
