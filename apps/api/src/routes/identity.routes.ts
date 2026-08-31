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
import { getUserOrgPermissions } from '../lib/org-rbac.js';

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

/**
 * Every kind of thing that can have a picture.
 *
 * A picture is not a property of being a user account, but the schema treated
 * it as one: only `users` could have one set, and every other subject the
 * platform draws a face or a mark for — a CRM customer, a lead, a chain
 * partner, a contact, a HuduFreight driver, a supplier — rendered initials
 * with no way to change that.
 *
 * Rather than six near-identical endpoints, one registry. Adding a subject is
 * a row here, and the serve/set/clear routes below cover it immediately.
 *
 * Only these table and column names ever reach a query — they come from this
 * object, never from the request — so `:kind` cannot be used to point a write
 * at some other table. Every subject also carries an explicit tenant column,
 * because RLS does not protect these on its own.
 */
const SUBJECTS = {
  // The historical URL. `people` rather than `users` because that is what the
  // avatar endpoint has always been called and what clients already request.
  people:    { table: 'users',     image: 'avatar_url' },
  customers: { table: 'customers', image: 'logo_url'   },
  leads:     { table: 'leads',     image: 'avatar_url' },
  contacts:  { table: 'contacts',  image: 'avatar_url' },
  drivers:   { table: 'drivers',   image: 'avatar_url' },
  suppliers: { table: 'suppliers', image: 'avatar_url' },
  carriers:  { table: 'carriers',  image: 'logo_url'   },
  candidates: { table: 'hr_candidates', image: 'avatar_url' },
} as const;

type SubjectKind = keyof typeof SUBJECTS;

function subjectFor(kind: string): (typeof SUBJECTS)[SubjectKind] | null {
  return Object.prototype.hasOwnProperty.call(SUBJECTS, kind)
    ? SUBJECTS[kind as SubjectKind]
    : null;
}

/**
 * Roughly 1.5MB of base64, which is about a 1MB image.
 *
 * The client downscales to a 256px JPEG before sending — some 20KB — so
 * anything near this ceiling did not come from the app's own picker. The cap
 * exists because these are stored inline in a row, and one 548KB data URI in
 * `users` is already what made embedding pictures in list payloads untenable.
 */
const MAX_AVATAR_CHARS = 1_500_000;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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

      /**
       * The workspace's own language and timezone.
       *
       * Settings has always had a Localization section and nothing ever read
       * it: language was chosen per browser in localStorage, so a Tanzanian
       * workspace could not make Kiswahili its default. This is the read that
       * was missing. It rides on /identity/me because every app already calls
       * it once on load, so no new round-trip is added to reach it.
       */
      const settingsRow = await trx.selectFrom('tenant_settings')
        .select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const tenantSettings = settingsRow
        ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
        : {};
      const loc = tenantSettings?.localization ?? {};

      const orgPermissions = await getUserOrgPermissions(user.tenant_id, user.sub);

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
          // Null rather than a guess when unset: the client falls back to the
          // browser, which is the behaviour every existing session already has.
          localization: {
            language: typeof loc.lang === 'string' && loc.lang ? loc.lang : null,
            timezone: typeof loc.tz === 'string' && loc.tz ? loc.tz : null,
            base_currency: typeof tenantSettings?.currencies?.base === 'string' && tenantSettings.currencies.base
              ? tenantSettings.currencies.base : null,
          },
          // The tenant-wide default for Basic/Advanced landing — a user's own
          // profile.landing_style (see UserProfileFields) always wins over this
          // when set; this is only the fallback. Settings > Landing Experience.
          landing_style: tenantSettings?.landingStyle?.mode === 'basic' ? 'basic' : 'advanced',
        } : undefined,
        created_at: row.created_at, updated_at: row.updated_at,
        // Session properties, not columns on `users` — sourced from the JWT
        // claims (req.user), not the re-fetched row. See SafeUser's doc
        // comment. Explicit `?? null` rather than omitting the key: the
        // client merges this response onto its cached user object
        // ({...prev, ...me}), and an *omitted* key doesn't unset a
        // previously-cached one — a real actor's session ending an
        // impersonation would keep reading as impersonated forever unless
        // this is stated, not implied.
        impersonated_by: user.impersonated_by ?? null,
        impersonated_by_name: user.impersonated_by_name ?? null,
        org_permissions: orgPermissions,
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
  fastify.get('/:kind/:id/avatar', async (req, reply) => {
    const user = req.user;
    const { kind, id } = req.params as { kind: string; id: string };
    const subject = subjectFor(kind);
    if (!subject) return reply.status(404).send({ error: `There is no picture for "${kind}"` });

    return withTenant(user.tenant_id, async (trx) => {
      const row = await (trx.selectFrom(subject.table as any) as any)
        .select([subject.image])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const stored: string | null = row?.[subject.image] ?? null;
      // 404 rather than a placeholder: the caller already knows how to draw
      // initials, and a served placeholder would hide a missing picture.
      if (!stored) return reply.status(404).send({ error: 'No picture set' });

      // A customer's logo_url (or a contact picked from the stock-photo
      // presets) predates this endpoint and may hold an ordinary http(s) URL
      // rather than a data URI — the column has one meaning, "the picture",
      // and both spellings satisfy it. Proxying the bytes rather than
      // `reply.redirect(stored)`: a plain <img src> follows a redirect fine,
      // but PersonAvatar/avatarObjectUrl reads this endpoint via an
      // authenticated fetch() so it can send the auth header a bare <img>
      // can't carry — and fetch() enforces CORS on the redirected response,
      // which most third-party image hosts (e.g. Unsplash) don't grant to an
      // arbitrary origin. Same-origin bytes sidestep that entirely.
      if (!stored.startsWith('data:')) {
        try {
          const upstream = await fetch(stored);
          if (!upstream.ok) return reply.status(502).send({ error: 'The stored picture could not be fetched' });
          const buf = Buffer.from(await upstream.arrayBuffer());
          return reply
            .header('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
            .header('Cache-Control', 'private, max-age=3600, must-revalidate')
            .send(buf);
        } catch {
          return reply.status(502).send({ error: 'The stored picture could not be fetched' });
        }
      }

      const decoded = decodeDataUri(stored);
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
   * Set the picture for any subject.
   *
   * All validation happens before the write. A `reply.status(4xx)` inside
   * withTenant returns *normally*, so the transaction commits — a rejected
   * request that had already written would keep the write.
   */
  fastify.put('/:kind/:id/avatar', async (req, reply) => {
    const user = req.user;
    const { kind, id } = req.params as { kind: string; id: string };
    const subject = subjectFor(kind);
    if (!subject) return reply.status(404).send({ error: `There is no picture for "${kind}"` });

    const { data_url } = (req.body ?? {}) as { data_url?: string };
    if (!data_url || typeof data_url !== 'string') {
      return reply.status(400).send({ error: 'data_url is required' });
    }
    if (data_url.length > MAX_AVATAR_CHARS) {
      return reply.status(413).send({
        error: `That picture is too large (${Math.round(data_url.length / 1024)}KB). Pictures are stored inline, so the limit is ${Math.round(MAX_AVATAR_CHARS / 1024)}KB.`,
      });
    }
    const decoded = decodeDataUri(data_url);
    if (!decoded) return reply.status(400).send({ error: 'data_url must be a base64 data URI' });
    // Without this, any MIME at all could be stored and later served back with
    // that Content-Type — including text/html, which the GET above would hand
    // to the browser to render on this origin.
    if (!ALLOWED_IMAGE_MIME.has(decoded.mime)) {
      return reply.status(400).send({ error: `${decoded.mime} is not an image format that can be stored` });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const updated = await (trx.updateTable(subject.table as any) as any)
        .set({ [subject.image]: data_url })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning('id').executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Not found in this workspace' });
      return { success: true, avatar_url: `/v1/identity/${kind}/${id}/avatar` };
    });
  });

  /** Remove a picture, returning the subject to initials. */
  fastify.delete('/:kind/:id/avatar', async (req, reply) => {
    const user = req.user;
    const { kind, id } = req.params as { kind: string; id: string };
    const subject = subjectFor(kind);
    if (!subject) return reply.status(404).send({ error: `There is no picture for "${kind}"` });

    return withTenant(user.tenant_id, async (trx) => {
      const updated = await (trx.updateTable(subject.table as any) as any)
        .set({ [subject.image]: null })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning('id').executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Not found in this workspace' });
      return { success: true };
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
        // The URL, not the blob — same rule as people above. Returning the
        // column directly would put a whole data URI in every row of a
        // 50-company list, which is the cost this endpoint exists to avoid.
        has_avatar: !!r.logo_url,
        logo_url: r.logo_url ? `/v1/identity/customers/${r.id}/avatar` : undefined,
        initials: initials(r.name), avatar_color: avatarColor(r.name),
      }));
    });
  });
}

function safeJson(s: string): Record<string, any> | undefined {
  try { return JSON.parse(s) ?? undefined; } catch { return undefined; }
}
