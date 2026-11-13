import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { resolveCustomerId } from '../services/customer-identity.service.js';

/**
 * The customers row a CUSTOMER login acts for. These filters used `user.sub`,
 * the login's own id, which is never a customers id — so a customer's
 * notifications always came back empty.
 *
 * An unresolvable link yields an id that matches nothing, deliberately: the
 * failure mode of a customer seeing none of their own notifications is
 * recoverable, and the one where they see everybody's is not.
 */
const NOTHING = '00000000-0000-0000-0000-000000000000';
const customerScope = async (u: any) => (await resolveCustomerId(u)) ?? NOTHING;
const NOTIFICATION_SEND_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER']);
const isSafeInternalLink = (value: string | undefined) => !value || (/^\/(?!\/)/.test(value) && !/[\u0000-\u001f]/.test(value));
import { withTenant } from '../db/client.js';
import { notifyUser } from '../lib/ws-broadcast.js';

/** How far back the header bar looks. It is a nudge about what is current;
 *  the bell is where older unread items are worked through. */
const TICKER_WINDOW_DAYS = 14;
const TICKER_MAX = 5;

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
    const { limit: limitRaw, offset: offsetRaw, unread_only, type } = request.query as { limit?: string; offset?: string; unread_only?: string; type?: string };
    const limit = Math.min(parseInt(limitRaw ?? '50', 10) || 50, 200);
    const offset = Math.max(parseInt(offsetRaw ?? '0', 10) || 0, 0);

    return withTenant(user.tenant_id, async (trx) => {
      // Only surface in-app-relevant rows: legacy direct inserts use channel=null,
      // matrix-driven inserts (NotificationService.triggerNotification) set channel='IN_APP'
      // for the bell row and leave WHATSAPP/EMAIL rows as delivery-log-only (no title/link).
      const inAppFilter = (eb: any) => eb.or([eb('channel', 'is', null), eb('channel', '=', 'IN_APP')]);

      let q = trx
        .selectFrom('notifications')
        .where('tenant_id', '=', user.tenant_id)
        .selectAll()
        .where('title', 'is not', null) // Only in-app notifications have a title
        .where(inAppFilter);

      let countQ = trx
        .selectFrom('notifications')
        .where('tenant_id', '=', user.tenant_id)
        .select(trx.fn.count('id').as('cnt'))
        .where('read', '=', false)
        .where('title', 'is not', null)
        .where(inAppFilter);

      let totalQ = trx
        .selectFrom('notifications')
        .where('tenant_id', '=', user.tenant_id)
        .select(trx.fn.count('id').as('cnt'))
        .where('title', 'is not', null)
        .where(inAppFilter);

      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', await customerScope(user));
        countQ = countQ.where('customer_id', '=', await customerScope(user));
        totalQ = totalQ.where('customer_id', '=', await customerScope(user));
      } else {
        // Muted apps are filtered on the way out, not skipped on the way in:
        // unmuting brings the history back.
        const muted = trx.selectFrom('notification_mutes').select('app')
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub);
        q = q.where('user_id', '=', user.sub).where('app', 'not in', muted);
        countQ = countQ.where('user_id', '=', user.sub).where('app', 'not in', muted);
        totalQ = totalQ.where('user_id', '=', user.sub).where('app', 'not in', muted);
      }

      if (unread_only === 'true') q = q.where('read', '=', false);

      // BlissNotifications.tsx's category tabs (Tasks/Support/Security/Chat)
      // used to fetch the same unfiltered "all" page as every other tab and
      // filter it client-side — meaning anything of that type outside
      // whatever 30 rows happened to be on screen simply never appeared, no
      // matter how many actually existed. unread_count/total_count stay
      // scoped to "type" too, so the tab's own counts and pagination agree
      // with what it actually shows instead of reporting the platform-wide
      // total under a category label.
      if (type) {
        q = q.where('type', '=', type);
        countQ = countQ.where('type', '=', type);
        totalQ = totalQ.where('type', '=', type);
      }

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
        .where('tenant_id', '=', user.tenant_id)
        .select(trx.fn.count('id').as('cnt'))
        .where('read', '=', false)
        .where('title', 'is not', null)
        .where((eb) => eb.or([eb('channel', 'is', null), eb('channel', '=', 'IN_APP')]));

      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', await customerScope(user));
      } else {
        q = q.where('user_id', '=', user.sub).where('app', 'not in',
          trx.selectFrom('notification_mutes').select('app')
            .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub));
      }

      const result = await q.executeTakeFirst();
      return { count: Number(result?.cnt ?? 0) };
    });
  });

  /**
   * GET /v1/notifications/ticker
   * What the header bar should announce: unread, still current, not muted,
   * one row per thing.
   *
   * The header used to take the newest 50 notifications, read or not, and
   * keep the unread ones — so anything unread but older than the 50th row
   * could never appear. One account had 29 unread and was shown 1. This asks
   * for unread rows directly.
   */
  fastify.get('/ticker', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const since = new Date(Date.now() - TICKER_WINDOW_DAYS * 86_400_000);
      let q = trx.selectFrom('notifications')
        .select(['id', 'app', 'type', 'title', 'message', 'link', 'shipment_id', 'entity_type', 'entity_id', 'entity_label', 'created_at'])
        .where('tenant_id', '=', user.tenant_id)
        .where('read', '=', false)
        .where('title', 'is not', null)
        .where((eb) => eb.or([eb('channel', 'is', null), eb('channel', '=', 'IN_APP')]))
        .where('created_at', '>=', since)
        .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', new Date())]));
      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', await customerScope(user));
      } else {
        q = q.where('user_id', '=', user.sub).where('app', 'not in',
          trx.selectFrom('notification_mutes').select('app')
            .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub));
      }
      // Read more than we show, then keep one per subject: several rows can be
      // about the same shipment or event, and rotating the same sentence is
      // not five pieces of news.
      const rows = await q.orderBy('created_at', 'desc').limit(60).execute();
      const seen = new Set<string>();
      const items = rows.filter((n) => {
        const key = `${n.title}|${n.shipment_id ?? n.entity_id ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, TICKER_MAX);
      return { items };
    });
  });

  /**
   * GET /v1/notifications/mutes — the apps this person has muted, and the
   * apps that have ever notified them (so the settings list offers real
   * choices rather than every app on the platform).
   */
  fastify.get('/mutes', async (request, reply) => {
    const user = request.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for this account type.' });
    return withTenant(user.tenant_id, async (trx) => {
      const muted = await trx.selectFrom('notification_mutes').select('app')
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute();
      const seen = await trx.selectFrom('notifications').select('app').distinct()
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
        .where('title', 'is not', null).execute();
      const mutedApps = muted.map(m => m.app);
      return { muted: mutedApps, apps: [...new Set([...seen.map(s => s.app), ...mutedApps])].sort() };
    });
  });

  /** PUT /v1/notifications/mutes — replace this person's muted-app list. */
  fastify.put('/mutes', async (request, reply) => {
    const user = request.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for this account type.' });
    const { apps } = z.object({ apps: z.array(z.string().trim().min(1).max(50).regex(/^[a-z0-9_-]+$/)).max(60) }).parse(request.body);
    const wanted = [...new Set(apps)];
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('notification_mutes')
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute();
      if (wanted.length) {
        await trx.insertInto('notification_mutes')
          .values(wanted.map(app => ({ tenant_id: user.tenant_id, user_id: user.sub, app }))).execute();
      }
      return { muted: wanted };
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
        .where('tenant_id', '=', user.tenant_id)
        .set({ read: true, read_at: new Date() })
        .where('read', '=', false);

      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', await customerScope(user));
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
        .where('tenant_id', '=', user.tenant_id)
        .set({ read: true, read_at: new Date() })
        .where('id', '=', id);

      if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', await customerScope(user));
      } else {
        q = q.where('user_id', '=', user.sub);
      }

      const result = await q.executeTakeFirst();
      if (!Number(result.numUpdatedRows)) return reply.status(404).send({ error: 'Notification not found.' });
      return { success: true };
    });
  });

  /**
   * POST /v1/notifications
   * Create an in-app notification for another user in the caller's own tenant.
   * Body: { user_id, type?, title, message?, link?, metadata? }
   *
   * tenant_id is never taken from the body — any authenticated user (no role
   * gate on this route) could set it to an arbitrary tenant and inject a
   * spoofed notification (attacker-chosen title/message/link) into a
   * completely different tenant's user's feed. It is always the caller's own
   * tenant now; the real caller (CreateShipmentPage.tsx) never sent one.
   */
  fastify.post('/', async (request, reply) => {
    const user = request.user;
    const body = z.object({
      user_id: z.string().uuid(),
      app: z.string().max(50).optional(),
      type: z.string().max(50).optional(),
      title: z.string().trim().min(1).max(300),
      message: z.string().max(2000).optional(),
      link: z.string().max(500).optional(),
      metadata: z.record(z.string(), z.any()).optional(),
      entity_type: z.string().max(50).optional(),
      entity_id: z.string().max(100).optional(),
      entity_label: z.string().max(200).optional(),
    }).parse(request.body);

    if (body.user_id !== user.sub && !NOTIFICATION_SEND_ROLES.has(user.role)) {
      return reply.status(403).send({ error: 'You may only create notifications for yourself.' });
    }
    if (!isSafeInternalLink(body.link)) {
      return reply.status(400).send({ error: 'Notification links must be relative application paths.' });
    }

    const tenant_id = user.tenant_id;

    return withTenant(tenant_id, async (trx) => {
      const recipient = await trx.selectFrom('users')
        .select('id')
        .where('id', '=', body.user_id)
        .where('tenant_id', '=', tenant_id)
        .where('active', '=', true)
        .executeTakeFirst();
      if (!recipient) return reply.status(404).send({ error: 'Notification recipient was not found in this workspace.' });
      const [row] = await trx
        .insertInto('notifications')
        .values({
          tenant_id,
          user_id: body.user_id,
          app: body.app ?? 'workspace',
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
      notifyUser(tenant_id, body.user_id);

      return { notification: row };
    });
  });
}
