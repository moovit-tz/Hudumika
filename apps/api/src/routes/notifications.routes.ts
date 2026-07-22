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
    // Dropdown keeps its historical 50-row cap by default; the full-page
    // Notification Centre (apps/web/src/pages/BlissNotifications.tsx) passes
    // a real limit/offset to page through everything instead of only ever
    // seeing the 50 most recent — that mismatch was why the "Unread" tab
    // count could exceed what the dropdown actually showed.
    const { limit: limitRaw, offset: offsetRaw, unread_only } = request.query as { limit?: string; offset?: string; unread_only?: string };
    const limit = Math.min(parseInt(limitRaw ?? '50', 10) || 50, 200);
    const offset = Math.max(parseInt(offsetRaw ?? '0', 10) || 0, 0);

    return withTenant(user.tenant_id, async (trx) => {
      // Only surface in-app-relevant rows: legacy direct inserts use channel=null,
      // matrix-driven inserts (NotificationService.triggerNotification) set channel='IN_APP'
      // for the bell row and leave WHATSAPP/EMAIL rows as delivery-log-only (no title/link).
      const inAppFilter = (eb: any) => eb.or([eb('channel', 'is', null), eb('channel', '=', 'IN_APP')]);

      let q = trx
        .selectFrom('notifications')
        .selectAll()
        .where('title', 'is not', null) // Only in-app notifications have a title
        .where(inAppFilter);

      let countQ = trx
        .selectFrom('notifications')
        .select(trx.fn.count('id').as('cnt'))
        .where('read', '=', false)
        .where('title', 'is not', null)
        .where(inAppFilter);

      let totalQ = trx
        .selectFrom('notifications')
        .select(trx.fn.count('id').as('cnt'))
        .where('title', 'is not', null)
        .where(inAppFilter);

      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', user.sub);
        countQ = countQ.where('customer_id', '=', user.sub);
        totalQ = totalQ.where('customer_id', '=', user.sub);
      } else {
        q = q.where('user_id', '=', user.sub);
        countQ = countQ.where('user_id', '=', user.sub);
        totalQ = totalQ.where('user_id', '=', user.sub);
      }

      if (unread_only === 'true') q = q.where('read', '=', false);

      const list = await q.orderBy('created_at', 'desc').limit(limit).offset(offset).execute();
      const countResult = await countQ.executeTakeFirst();
      const totalResult = await totalQ.executeTakeFirst();
      const unread_count = Number(countResult?.cnt ?? 0);
      const total_count = Number(totalResult?.cnt ?? 0);

      return { notifications: list, unread_count, total_count };
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
        .where('title', 'is not', null)
        .where((eb) => eb.or([eb('channel', 'is', null), eb('channel', '=', 'IN_APP')]));

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
      app?: string;
      type?: string;
      title: string;
      message?: string;
      link?: string;
      metadata?: any;
      entity_type?: string;
      entity_id?: string;
      entity_label?: string;
    };

    const tenant_id = body.tenant_id ?? user.tenant_id;

    return withTenant(tenant_id, async (trx) => {
      const [row] = await trx
        .insertInto('notifications')
        .values({
          tenant_id,
          user_id: body.user_id,
          app: body.app ?? 'clearos',
          type: body.type ?? 'info',
          title: body.title,
          message: body.message ?? null,
          link: body.link ?? null,
          metadata: body.metadata ? JSON.stringify(body.metadata) : '{}',
          entity_type: body.entity_type ?? null,
          entity_id: body.entity_id ?? null,
          entity_label: body.entity_label ?? null,
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
