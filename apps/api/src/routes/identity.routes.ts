/**
 * One place every app asks who somebody is.
 *
 * Identity was duplicated rather than shared. The signed-in user was written to
 * localStorage at login and never refreshed, so a picture set after that login
 * — or changed by an administrator, or set on a colleague — did not appear in
 * any app until the person signed out and back in. NexusHR looked right only
 * because it fetches staff rows itself; ClearOS, SEAL, CRM and the rest read
 * the stale copy and drew initials.
 *
 * Pictures are stored as base64 data URIs, one of them 548KB. Embedding that in
 * every JSON payload that mentions a person is why a staff list weighs several
 * megabytes. So the blob is served from its own endpoint, with an ETag, and the
 * records here carry `has_avatar` and a URL instead. The browser fetches each
 * picture once and gets a 304 forever after, which is what an avatar should
 * cost.
 *
 * Everything is tenant-scoped explicitly. A directory that leaks across tenants
 * would be the worst possible thing to get wrong here.
 */
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { withTenant } from '../db/client.js';

/** Stable colour for a name, so initials look the same in every app. */
const AVATAR_COLORS = ['#e8461a', '#0891b2', '#7c3aed', '#059669', '#d97706', '#9333ea', '#db2777', '#0284c7'];

export function avatarColor(name: string): string {
  const n = name || '?';
  let sum = 0;
  for (let i = 0; i < n.length; i++) sum += n.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
}

/** Decode a `data:` URI into something that can be sent as an image. */
function decodeDataUri(uri: string): { mime: string; buf: Buffer } | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(uri ?? '');
  if (!m) return null;
  try { return { mime: m[1], buf: Buffer.from(m[2], 'base64') }; } catch { return null; }
}

export async function identityRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * The signed-in user, from the database rather than from a cached copy.
   *
   * The client calls this on load. Without it, `hudumika_user` in localStorage
   * is the only source of identity and it is as old as the session.
   */
  fastify.get('/me', async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('users')
        .select(['id', 'tenant_id', 'email', 'name', 'role', 'phone', 'avatar_url',
                 'profile', 'location_id', 'active', 'created_at', 'updated_at'])
        .where('id', '=', user.sub).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'This account no longer exists' });

      const tenant = await trx.selectFrom('tenants')
        .select(['id', 'name', 'slug', 'country', 'logo_url', 'primary_color'])
        .where('id', '=', user.tenant_id).executeTakeFirst();

      return {
        id: row.id, tenant_id: row.tenant_id, email: row.email, name: row.name,
        role: row.role, phone: row.phone ?? undefined,
        // The URL, not the blob. Callers that want the picture fetch it once.
        has_avatar: !!row.avatar_url,
        avatar_url: row.avatar_url ? `/v1/identity/people/${row.id}/avatar` : undefined,
        initials: initials(row.name), avatar_color: avatarColor(row.name),
        profile: typeof row.profile === 'string' ? safeJson(row.profile) : (row.profile ?? undefined),
        location_id: row.location_id ?? undefined,
        active: row.active,
        tenant: tenant ? {
          id: tenant.id, name: tenant.name, slug: tenant.slug,
          country: tenant.country ?? null, logo_url: tenant.logo_url ?? null,
          primary_color: tenant.primary_color ?? null,
        } : undefined,
        created_at: row.created_at, updated_at: row.updated_at,
      };
    });
  });

  /**
   * People, for any app that shows one: an assignee, an approver, a commenter.
   *
   * `ids` fetches a specific set; `q` searches. Either way the shape is the
   * same, so an app never has to know which table a person came from or build
   * its own initials-and-colour scheme — that inconsistency is why the same
   * person appeared in three different colours in three different apps.
   */
  fastify.get('/people', async (req) => {
    const user = req.user;
    const q = req.query as any;
    const ids = String(q.ids ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const search = String(q.q ?? '').trim();
    const limit = Math.min(Number(q.limit) || 50, 200);

    return withTenant(user.tenant_id, async (trx) => {
      let qb = trx.selectFrom('users')
        .select(['id', 'name', 'email', 'role', 'phone', 'avatar_url', 'active'])
        .where('tenant_id', '=', user.tenant_id);

      if (ids.length > 0) qb = qb.where('id', 'in', ids);
      else if (search) {
        qb = qb.where((eb: any) => eb.or([
          eb('name', 'ilike', `%${search}%`),
          eb('email', 'ilike', `%${search}%`),
        ]));
      }

      const rows = await qb.orderBy('name').limit(limit).execute();
      return rows.map(r => ({
        id: r.id, name: r.name, email: r.email, role: r.role, phone: r.phone ?? undefined,
        active: r.active,
        has_avatar: !!r.avatar_url,
        avatar_url: r.avatar_url ? `/v1/identity/people/${r.id}/avatar` : undefined,
        initials: initials(r.name), avatar_color: avatarColor(r.name),
      }));
    });
  });

  /**
   * The picture itself.
   *
   * Served rather than embedded, with an ETag so it travels once. A 548KB data
   * URI repeated across a staff list is the difference between a page that
   * loads and one that does not.
   */
  fastify.get('/people/:id/avatar', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('users').select(['avatar_url', 'name'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      // 404 rather than a placeholder: the caller already knows how to draw
      // initials, and a served placeholder would hide a missing picture.
      if (!row?.avatar_url) return reply.status(404).send({ error: 'No picture set' });

      const decoded = decodeDataUri(row.avatar_url);
      if (!decoded) return reply.status(422).send({ error: 'The stored picture is not a readable image' });

      const etag = `"${crypto.createHash('sha1').update(decoded.buf).digest('hex').slice(0, 24)}"`;
      if (req.headers['if-none-match'] === etag) return reply.status(304).send();

      return reply
        .header('Content-Type', decoded.mime)
        .header('Cache-Control', 'private, max-age=3600, must-revalidate')
        .header('ETag', etag)
        .send(decoded.buf);
    });
  });

  /**
   * Companies, in the same shape as people.
   *
   * `customers` carried avatar_color and avatar_initials columns; nothing else
   * carried anything, so a company rendered differently depending on which app
   * was showing it. Colour and initials are derived here from the name instead,
   * which makes them agree everywhere and keeps them correct when a company is
   * renamed — a stored initial does not follow a rename.
   *
   * There is one table behind this. GET /v1/customers/partners selects every
   * row of `customers` unfiltered, so "Chain Partners" and "Customers" in the
   * CRM are currently the same records; `kind` is accepted and reported so that
   * callers are already correct once the two are genuinely separated.
   */
  fastify.get('/companies', async (req) => {
    const user = req.user;
    const q = req.query as any;
    const ids = String(q.ids ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const search = String(q.q ?? '').trim();
    const limit = Math.min(Number(q.limit) || 50, 200);

    return withTenant(user.tenant_id, async (trx) => {
      let qb = trx.selectFrom('customers')
        .select(['id', 'name', 'email', 'phone', 'logo_url'])
        .where('tenant_id', '=', user.tenant_id);
      if (ids.length) qb = qb.where('id', 'in', ids);
      else if (search) qb = qb.where('name', 'ilike', `%${search}%`);

      const rows = await qb.orderBy('name').limit(limit).execute();
      return rows.map(r => ({
        id: r.id, kind: 'customer', name: r.name,
        email: r.email ?? undefined, phone: r.phone ?? undefined,
        logo_url: r.logo_url ?? undefined,
        initials: initials(r.name), avatar_color: avatarColor(r.name),
      }));
    });
  });
}

function safeJson(s: string): Record<string, any> | undefined {
  try { return JSON.parse(s) ?? undefined; } catch { return undefined; }
}
