import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

/**
 * Announcements for the header pill.
 *
 * These are the one read path in this codebase that must NOT be written as a
 * plain `.where('tenant_id', '=', user.tenant_id)`. A platform-wide
 * announcement has tenant_id NULL, and NULL never equals anything, so the
 * usual filter would hide exactly the rows that are meant for everybody. The
 * correct predicate is "mine or everyone's", spelled out below — and because
 * that is a genuine exception to the rule the rest of the app follows, it gets
 * said out loud rather than left for the next person to rediscover.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export async function announcementRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * GET /v1/announcements/active — what this user should see right now.
   * Live means: switched on, started, not yet ended, and not dismissed by
   * this particular person.
   */
  fastify.get('/active', async (request) => {
    const user = request.user;
    const now = new Date();
    const rows = await db.selectFrom('announcements')
      .select(['id', 'title', 'body', 'link', 'badge', 'starts_at', 'ends_at'])
      // "for my workspace, or for the whole platform" — see the note above.
      .where(eb => eb.or([
        eb('tenant_id', 'is', null),
        eb('tenant_id', '=', user.tenant_id),
      ]))
      .where('active', '=', true)
      .where('starts_at', '<=', now)
      .where(eb => eb.or([eb('ends_at', 'is', null), eb('ends_at', '>', now)]))
      // Dismissal is per person, so it cannot be a column on the announcement.
      .where(eb => eb.not(eb.exists(
        eb.selectFrom('announcement_dismissals')
          .select('announcement_id')
          .whereRef('announcement_dismissals.announcement_id', '=', 'announcements.id')
          .where('announcement_dismissals.user_id', '=', user.sub),
      )))
      .orderBy('starts_at', 'desc')
      .limit(5)
      .execute();
    return { data: rows };
  });

  /** Dismissed by this user only — everyone else still sees it. */
  fastify.post('/:id/dismiss', async (request: any, reply) => {
    const user = request.user;
    if (!isUuid(request.params.id)) return reply.status(404).send({ error: 'Not found' });
    await db.insertInto('announcement_dismissals')
      .values({ announcement_id: request.params.id, user_id: user.sub })
      // Dismissing twice is not an error; the primary key already says so.
      .onConflict(oc => oc.columns(['announcement_id', 'user_id']).doNothing())
      .execute();
    return reply.status(204).send();
  });
}

/**
 * A workspace posting a notice to its own staff.
 *
 * Announcements rendered for tenant users from the start, but authoring was
 * mounted only under /v1/superadmin — so a tenant administrator could not tell
 * their own organisation anything. The table has always carried a tenant_id
 * (null meaning platform-wide), so the capability was there; the surface was
 * not.
 *
 * Everything here is pinned to the caller's own tenant. tenant_id is never read
 * from the body: a workspace can address its own people and nobody else's, and
 * the platform-wide null is reachable only from the SuperAdmin surface below.
 */
export async function tenantAnnouncementRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'));

  fastify.get('/', async (request) => {
    const user = request.user;
    const rows = await db.selectFrom('announcements')
      .select(['id', 'title', 'body', 'link', 'badge', 'starts_at', 'ends_at', 'active', 'created_at'])
      .where('tenant_id', '=', user.tenant_id)
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute();

    const counts = await db.selectFrom('announcement_dismissals as d')
      .innerJoin('announcements as a', 'a.id', 'd.announcement_id')
      .select(['d.announcement_id'])
      .select(eb => eb.fn.countAll<string>().as('n'))
      .where('a.tenant_id', '=', user.tenant_id)
      .groupBy('d.announcement_id')
      .execute();
    const byId = new Map(counts.map(c => [c.announcement_id, Number(c.n)]));
    return { data: rows.map(r => ({ ...r, dismissed_count: byId.get(r.id) ?? 0 })) };
  });

  fastify.post('/', async (request, reply) => {
    const user = request.user;
    const b = (request.body ?? {}) as Record<string, any>;
    const title = String(b.title ?? '').trim();
    if (!title) return reply.status(400).send({ error: 'An announcement needs a title.' });

    const row = await db.insertInto('announcements').values({
      // The caller's own tenant, always. Never b.tenant_id — that is how a
      // workspace would post to somebody else's staff.
      tenant_id: user.tenant_id,
      title,
      body: String(b.body ?? '').trim() || null,
      link: String(b.link ?? '').trim() || null,
      badge: (String(b.badge ?? '').trim() || 'NOTICE').slice(0, 24).toUpperCase(),
      starts_at: b.starts_at ? new Date(b.starts_at) : new Date(),
      ends_at: b.ends_at ? new Date(b.ends_at) : null,
      active: b.active !== false,
      created_by: user.sub,
    } as any).returningAll().executeTakeFirstOrThrow();

    return reply.status(201).send(row);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    const b = (request.body ?? {}) as Record<string, any>;
    const patch: Record<string, any> = {};
    if (b.title !== undefined) patch.title = String(b.title).trim();
    if (b.body !== undefined) patch.body = String(b.body).trim() || null;
    if (b.link !== undefined) patch.link = String(b.link).trim() || null;
    if (b.active !== undefined) patch.active = !!b.active;
    if (b.ends_at !== undefined) patch.ends_at = b.ends_at ? new Date(b.ends_at) : null;
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'Nothing to change.' });

    const updated = await db.updateTable('announcements')
      .set(patch)
      .where('id', '=', request.params.id)
      .where('tenant_id', '=', user.tenant_id)
      .returningAll()
      .executeTakeFirst();
    if (!updated) return reply.status(404).send({ error: 'That announcement is not in this workspace.' });
    return updated;
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    const gone = await db.deleteFrom('announcements')
      .where('id', '=', request.params.id)
      .where('tenant_id', '=', user.tenant_id)
      .returning('id')
      .executeTakeFirst();
    if (!gone) return reply.status(404).send({ error: 'That announcement is not in this workspace.' });
    return reply.status(204).send();
  });
}

/**
 * Authoring, mounted separately under /v1/superadmin so the whole surface is
 * gated on SUPER_ADMIN in one place rather than per-handler.
 */
export async function superAdminAnnouncementRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  fastify.get('/', async () => {
    const rows = await db.selectFrom('announcements')
      .leftJoin('tenants', 'tenants.id', 'announcements.tenant_id')
      .select([
        'announcements.id', 'announcements.title', 'announcements.body', 'announcements.link',
        'announcements.badge', 'announcements.starts_at', 'announcements.ends_at',
        'announcements.active', 'announcements.tenant_id', 'announcements.created_at',
        'tenants.name as tenant_name',
      ])
      .orderBy('announcements.created_at', 'desc')
      .limit(100)
      .execute();
    // How many people have already dismissed each one — the only real signal
    // of whether an announcement has been seen.
    const counts = await db.selectFrom('announcement_dismissals')
      .select(['announcement_id'])
      .select(eb => eb.fn.countAll<string>().as('n'))
      .groupBy('announcement_id')
      .execute();
    const byId = new Map(counts.map(c => [c.announcement_id, Number(c.n)]));
    return { data: rows.map(r => ({ ...r, dismissed_count: byId.get(r.id) ?? 0 })) };
  });

  fastify.post('/', async (request: any, reply) => {
    const b = request.body ?? {};
    const title = String(b.title ?? '').trim();
    if (!title) return reply.status(400).send({ error: 'title is required' });
    if (b.tenant_id && !isUuid(b.tenant_id)) return reply.status(400).send({ error: 'tenant_id must be a uuid' });
    const row = await db.insertInto('announcements').values({
      // Absent or explicitly null means platform-wide, which is the common case.
      tenant_id: b.tenant_id || null,
      title,
      body: b.body?.trim() || null,
      link: b.link?.trim() || null,
      badge: (b.badge?.trim() || 'NEW').slice(0, 24).toUpperCase(),
      starts_at: b.starts_at ? new Date(b.starts_at) : new Date(),
      ends_at: b.ends_at ? new Date(b.ends_at) : null,
      active: b.active !== false,
      created_by: request.user.sub,
    }).returningAll().executeTakeFirstOrThrow();
    return reply.status(201).send(row);
  });

  fastify.patch('/:id', async (request: any, reply) => {
    if (!isUuid(request.params.id)) return reply.status(404).send({ error: 'Not found' });
    const b = request.body ?? {};
    const patch: Record<string, any> = { updated_at: new Date() };
    if (b.title !== undefined) patch.title = String(b.title).trim();
    if (b.body !== undefined) patch.body = b.body?.trim() || null;
    if (b.link !== undefined) patch.link = b.link?.trim() || null;
    if (b.badge !== undefined) patch.badge = String(b.badge).slice(0, 24).toUpperCase();
    if (b.starts_at !== undefined) patch.starts_at = new Date(b.starts_at);
    if (b.ends_at !== undefined) patch.ends_at = b.ends_at ? new Date(b.ends_at) : null;
    if (b.active !== undefined) patch.active = !!b.active;
    const row = await db.updateTable('announcements').set(patch)
      .where('id', '=', request.params.id).returningAll().executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Not found' });
    return row;
  });

  fastify.delete('/:id', async (request: any, reply) => {
    if (!isUuid(request.params.id)) return reply.status(404).send({ error: 'Not found' });
    const res = await db.deleteFrom('announcements').where('id', '=', request.params.id).executeTakeFirst();
    if (!Number(res.numDeletedRows)) return reply.status(404).send({ error: 'Not found' });
    return reply.status(204).send();
  });
}
