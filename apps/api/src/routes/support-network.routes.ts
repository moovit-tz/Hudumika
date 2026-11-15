/**
 * /v1/support/network — set up and run Bliss support across centres, zones
 * and product lines. See support-network.service.ts for the model, the
 * visibility rules (supportScope) and the router (routeTicket).
 *
 * Who may change what:
 *   - workspace admins (and MANAGERs): everything;
 *   - a zone manager: centres, queues and agents inside their zones, and
 *     sub-zones beneath them;
 *   - everyone else: read-only, and only the centres they belong to.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { env } from '../config/env.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import {
  supportScope, zoneWithDescendants, isCentreOpen, routeTicket, type SupportScope,
} from '../services/support-network.service.js';

const uuid = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hoursSchema = z.partialRecord(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), z.tuple([hhmm, hhmm])).nullable();
const tags = z.array(z.string().trim().min(1).max(40)).max(30);
const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'NORMAL', 'LOW'] as const;

const zoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).nullable().optional(),
  kind: z.enum(['country', 'region', 'zone', 'area']).optional(),
  parent_id: uuid.nullable().optional(),
  center_lat: z.number().min(-90).max(90).nullable().optional(),
  center_lng: z.number().min(-180).max(180).nullable().optional(),
  radius_km: z.number().positive().max(20000).nullable().optional(),
  boundary: z.any().nullable().optional(),
  timezone: z.string().max(60).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
const centreSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(40).nullable().optional(),
  zone_id: uuid.nullable().optional(),
  site_type: z.enum(['contact_centre', 'hub', 'office', 'warehouse', 'retail', 'port', 'other']).optional(),
  address: z.string().max(400).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  region: z.string().max(120).nullable().optional(),
  country_code: z.string().length(2).optional(),
  timezone: z.string().max(60).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  opening_hours: hoursSchema.optional(),
  support_enabled: z.boolean().optional(),
  status: z.enum(['active', 'inactive', 'under_construction', 'closed']).optional(),
});
const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  source_apps: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
  sla_hours: z.partialRecord(z.enum(PRIORITIES), z.number().positive().max(24 * 90)).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  form_fields: z.array(z.object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Field keys are lower-case letters, digits and _'),
    label: z.string().trim().min(1).max(80),
    type: z.enum(['text', 'number', 'date', 'select', 'textarea']),
    options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    required: z.boolean().optional(),
  })).max(30).refine(f => new Set(f.map(x => x.key)).size === f.length, 'Two fields share a key.').optional(),
});
const queueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().max(40).optional(),
  site_id: uuid.nullable().optional(),
  product_id: uuid.nullable().optional(),
  skills: tags.optional(),
  languages: tags.optional(),
  overflow: z.enum(['none', 'zone', 'network']).optional(),
  member_ids: z.array(uuid).max(500).optional(),
});
const membershipSchema = z.object({
  user_id: uuid,
  site_id: uuid.nullable().optional(),
  zone_id: uuid.nullable().optional(),
  role: z.enum(['agent', 'lead', 'centre_manager', 'zone_manager']).default('agent'),
  skills: tags.optional(),
  languages: tags.optional(),
  max_open: z.number().int().min(1).max(500).optional(),
});

function pgError(reply: FastifyReply, err: any) {
  if (err?.code === '23505') return reply.status(409).send({ error: 'That code is already used in this workspace.' });
  if (err?.code === '23514') return reply.status(400).send({ error: 'A centre membership needs a centre; a zone manager needs a zone.' });
  if (err?.code === '23503') return reply.status(400).send({ error: 'A linked centre, zone, product or person no longer exists.' });
  throw err;
}

export async function supportNetworkRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('bliss'));
  fastify.addHook('preHandler', async (req, reply) => {
    if (req.user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
  });

  /** A write is allowed for network admins anywhere; for a zone manager only
   *  inside their zones. `zoneId`/`siteId` is what the write touches. */
  async function canEdit(trx: any, tenantId: string, scope: SupportScope, target: { zoneId?: string | null; siteId?: string | null; global?: boolean }) {
    if (scope.all || (scope.canManageNetwork && !scope.managedZoneIds.length)) return true;
    if (!scope.canManageNetwork || target.global) return false;
    if (target.siteId) return scope.siteIds.includes(target.siteId);
    if (target.zoneId) return scope.managedZoneIds.includes(target.zoneId);
    return false;
  }

  // ── Everything the Network screens need, in one read ──────────────────
  fastify.get('/', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const [zones, centres, products, queues, members, memberships, people] = await Promise.all([
        trx.selectFrom('geo_zones').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('name').execute(),
        trx.selectFrom('tenant_sites')
          .select(['id', 'name', 'code', 'zone_id', 'site_type', 'address', 'city', 'region', 'country_code', 'timezone',
            'latitude', 'longitude', 'opening_hours', 'support_enabled', 'status'])
          .where('tenant_id', '=', user.tenant_id).orderBy('name').execute(),
        trx.selectFrom('support_products').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('name').execute(),
        trx.selectFrom('support_groups').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('name').execute(),
        trx.selectFrom('support_group_members').select(['group_id', 'user_id']).where('tenant_id', '=', user.tenant_id).execute(),
        trx.selectFrom('support_agent_memberships as m').innerJoin('users as u', 'u.id', 'm.user_id')
          .select(['m.id', 'm.user_id', 'u.name as user_name', 'u.email as user_email', 'm.site_id', 'm.zone_id', 'm.role',
            'm.skills', 'm.languages', 'm.max_open'])
          .where('m.tenant_id', '=', user.tenant_id).orderBy('u.name').execute(),
        trx.selectFrom('users').select(['id', 'name', 'email', 'role'])
          .where('tenant_id', '=', user.tenant_id).where('role', '!=', 'CUSTOMER' as any).where('active', '=', true)
          .orderBy('name').execute(),
      ]);
      const visible = (siteId: string | null) => scope.all || (siteId != null && scope.siteIds.includes(siteId));
      return {
        scope: { all: scope.all, site_ids: scope.siteIds, managed_zone_ids: scope.managedZoneIds, can_manage: scope.canManageNetwork },
        zones,
        centres: centres
          .filter(c => scope.all || scope.siteIds.includes(c.id))
          .map(c => ({ ...c, open_now: c.support_enabled ? isCentreOpen(c as any) : null })),
        products,
        queues: queues.filter(q => scope.all || !q.site_id || visible(q.site_id))
          .map(q => ({ ...q, member_ids: members.filter(m => m.group_id === q.id).map(m => m.user_id) })),
        memberships: memberships.filter(m => scope.all || (m.site_id ? visible(m.site_id) : scope.managedZoneIds.includes(m.zone_id!))),
        people: scope.canManageNetwork ? people : [],
      };
    });
  });

  // ── Live control view: one row per centre ─────────────────────────────
  fastify.get('/overview', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      let centres = await trx.selectFrom('tenant_sites')
        .select(['id', 'name', 'zone_id', 'city', 'country_code', 'timezone', 'opening_hours', 'latitude', 'longitude'])
        .where('tenant_id', '=', user.tenant_id).where('support_enabled', '=', true).orderBy('name').execute();
      if (!scope.all) centres = centres.filter(c => scope.siteIds.includes(c.id));
      const ids = centres.map(c => c.id);
      const now = new Date();
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);

      const ticketStats = ids.length ? await sql<{
        site_id: string; open: number; unassigned: number; breached: number; urgent: number;
        oldest_open: Date | null; created_7d: number; resolved_7d: number; first_reply_h: number | null; csat: number | null;
      }>`
        SELECT site_id,
          count(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS'))::int AS open,
          count(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS') AND assigned_to IS NULL)::int AS unassigned,
          count(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS') AND sla_deadline < ${now})::int AS breached,
          count(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS') AND priority = 'URGENT')::int AS urgent,
          min(created_at) FILTER (WHERE status IN ('OPEN','IN_PROGRESS')) AS oldest_open,
          count(*) FILTER (WHERE created_at >= ${weekAgo})::int AS created_7d,
          count(*) FILTER (WHERE resolved_at >= ${weekAgo})::int AS resolved_7d,
          round(avg(first_reply_time_seconds) FILTER (WHERE created_at >= ${weekAgo}) / 3600.0, 1)::float AS first_reply_h,
          round(avg(csat_score) FILTER (WHERE created_at >= ${weekAgo}), 1)::float AS csat
        FROM support_tickets
        WHERE tenant_id = ${user.tenant_id} AND site_id = ANY(${ids}::uuid[])
        GROUP BY site_id`.execute(trx) : { rows: [] };

      const agentRows = ids.length ? await trx.selectFrom('support_agent_memberships as m')
        .leftJoin('user_presence as p', 'p.user_id', 'm.user_id')
        .select(['m.site_id', 'm.user_id', 'p.last_active_at'])
        .where('m.tenant_id', '=', user.tenant_id).where('m.site_id', 'in', ids).execute() : [];
      const agentIds = [...new Set(agentRows.map(a => a.user_id))];
      const clocked = agentIds.length ? await trx.selectFrom('hr_clock_sessions').select('user_id')
        .where('tenant_id', '=', user.tenant_id).where('user_id', 'in', agentIds)
        .where('status', 'in', ['ACTIVE', 'ON_BREAK']).execute() : [];
      const clockedSet = new Set(clocked.map(c => c.user_id));

      const unplaced = await trx.selectFrom('support_tickets').select(sql<number>`count(*)::int`.as('n'))
        .where('tenant_id', '=', user.tenant_id).where('site_id', 'is', null)
        .where('status', 'in', ['OPEN', 'IN_PROGRESS']).executeTakeFirst();

      const dayAgo = new Date(Date.now() - 86_400_000);
      const callRows = ids.length ? await trx.selectFrom('support_calls')
        .select(['site_id', sql<number>`count(*)::int`.as('calls'), sql<number>`(count(*) FILTER (WHERE status IN ('missed','voicemail','after_hours')))::int`.as('unanswered')])
        .where('tenant_id', '=', user.tenant_id).where('site_id', 'in', ids).where('started_at', '>=', dayAgo)
        .groupBy('site_id').execute() : [];
      const callMap = new Map(callRows.map(r => [r.site_id as string, r]));
      const stat = new Map(ticketStats.rows.map(r => [r.site_id, r]));
      return {
        unplaced_open: scope.includeUnplaced ? Number(unplaced?.n ?? 0) : null,
        centres: centres.map(c => {
          const s = stat.get(c.id);
          const agents = agentRows.filter(a => a.site_id === c.id);
          const online = agents.filter(a => a.last_active_at && now.getTime() - new Date(a.last_active_at).getTime() < 3 * 60_000);
          return {
            id: c.id, name: c.name, zone_id: c.zone_id, city: c.city, country_code: c.country_code,
            latitude: c.latitude, longitude: c.longitude,
            open_now: isCentreOpen(c as any, now),
            open: s?.open ?? 0, unassigned: s?.unassigned ?? 0, breached: s?.breached ?? 0, urgent: s?.urgent ?? 0,
            oldest_open: s?.oldest_open ?? null, created_7d: s?.created_7d ?? 0, resolved_7d: s?.resolved_7d ?? 0,
            first_reply_hours: s?.first_reply_h ?? null, csat: s?.csat ?? null,
            agents: agents.length, agents_online: online.length,
            agents_on_shift: agents.filter(a => clockedSet.has(a.user_id)).length,
            calls_24h: Number(callMap.get(c.id)?.calls ?? 0),
            unanswered_calls_24h: Number(callMap.get(c.id)?.unanswered ?? 0),
          };
        }),
      };
    });
  });

  // ── Zones ─────────────────────────────────────────────────────────────
  fastify.post('/zones', async (req, reply) => {
    const user = req.user; const b = zoneSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { zoneId: b.parent_id ?? null, global: !b.parent_id })))
        return reply.status(403).send({ error: 'You can only add zones inside the zones you manage.' });
      try {
        return reply.status(201).send(await trx.insertInto('geo_zones')
          .values({ ...b, tenant_id: user.tenant_id, boundary: b.boundary ? JSON.stringify(b.boundary) : null } as any)
          .returningAll().executeTakeFirstOrThrow());
      } catch (e) { return pgError(reply, e); }
    });
  });

  fastify.patch('/zones/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    const b = zoneSchema.partial().parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { zoneId: id }))) return reply.status(403).send({ error: 'You do not manage this zone.' });
      if (b.parent_id) {
        // A zone cannot be moved under itself or one of its own descendants.
        const below = await zoneWithDescendants(trx, user.tenant_id, [id]);
        if (below.includes(b.parent_id)) return reply.status(400).send({ error: 'A zone cannot sit inside itself.' });
      }
      try {
        const row = await trx.updateTable('geo_zones')
          .set({ ...b, ...(b.boundary !== undefined ? { boundary: b.boundary ? JSON.stringify(b.boundary) : null } : {}), updated_at: new Date() } as any)
          .where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirst();
        return row ?? reply.status(404).send({ error: 'Zone not found' });
      } catch (e) { return pgError(reply, e); }
    });
  });

  fastify.delete('/zones/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { zoneId: id }))) return reply.status(403).send({ error: 'You do not manage this zone.' });
      const r = await trx.deleteFrom('geo_zones').where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      return Number(r.numDeletedRows) ? { ok: true } : reply.status(404).send({ error: 'Zone not found' });
    });
  });

  // ── Centres (tenant_sites with support) ───────────────────────────────
  fastify.post('/centres', async (req, reply) => {
    const user = req.user; const b = centreSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { zoneId: b.zone_id ?? null, global: !b.zone_id })))
        return reply.status(403).send({ error: 'You can only add centres inside the zones you manage.' });
      try {
        const row = await trx.insertInto('tenant_sites').values({
          ...b, tenant_id: user.tenant_id, site_type: b.site_type ?? 'contact_centre',
          support_enabled: b.support_enabled ?? true, created_by: user.sub,
          opening_hours: b.opening_hours ? JSON.stringify(b.opening_hours) : null,
        } as any).returningAll().executeTakeFirstOrThrow();
        return reply.status(201).send(row);
      } catch (e) { return pgError(reply, e); }
    });
  });

  fastify.patch('/centres/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    const b = centreSchema.partial().parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { siteId: id }))) return reply.status(403).send({ error: 'You do not manage this centre.' });
      if (b.zone_id && !scope.all && scope.managedZoneIds.length && !scope.managedZoneIds.includes(b.zone_id))
        return reply.status(403).send({ error: 'You can only move a centre into a zone you manage.' });
      try {
        const row = await trx.updateTable('tenant_sites')
          .set({ ...b, ...(b.opening_hours !== undefined ? { opening_hours: b.opening_hours ? JSON.stringify(b.opening_hours) : null } : {}), updated_at: new Date() } as any)
          .where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirst();
        return row ?? reply.status(404).send({ error: 'Centre not found' });
      } catch (e) { return pgError(reply, e); }
    });
  });

  // ── Products ──────────────────────────────────────────────────────────
  fastify.post('/products', async (req, reply) => {
    const user = req.user; const b = productSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { global: true }))) return reply.status(403).send({ error: 'Only a workspace admin can add product lines.' });
      try {
        return reply.status(201).send(await trx.insertInto('support_products')
          .values({ ...b, tenant_id: user.tenant_id, sla_hours: JSON.stringify(b.sla_hours ?? {}), form_fields: JSON.stringify(b.form_fields ?? []) } as any)
          .returningAll().executeTakeFirstOrThrow());
      } catch (e) { return pgError(reply, e); }
    });
  });

  fastify.patch('/products/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    const b = productSchema.partial().parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { global: true }))) return reply.status(403).send({ error: 'Only a workspace admin can change product lines.' });
      try {
        const row = await trx.updateTable('support_products')
          .set({ ...b, ...(b.sla_hours ? { sla_hours: JSON.stringify(b.sla_hours) } : {}), ...(b.form_fields ? { form_fields: JSON.stringify(b.form_fields) } : {}), updated_at: new Date() } as any)
          .where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirst();
        return row ?? reply.status(404).send({ error: 'Product not found' });
      } catch (e) { return pgError(reply, e); }
    });
  });

  fastify.delete('/products/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { global: true }))) return reply.status(403).send({ error: 'Only a workspace admin can remove product lines.' });
      const r = await trx.deleteFrom('support_products').where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      return Number(r.numDeletedRows) ? { ok: true } : reply.status(404).send({ error: 'Product not found' });
    });
  });

  // ── Queues (support_groups) ───────────────────────────────────────────
  async function setMembers(trx: any, tenantId: string, groupId: string, ids: string[]) {
    await trx.deleteFrom('support_group_members').where('tenant_id', '=', tenantId).where('group_id', '=', groupId).execute();
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const valid = await trx.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('id', 'in', unique).execute();
    if (valid.length) {
      await trx.insertInto('support_group_members')
        .values(valid.map((u: { id: string }) => ({ tenant_id: tenantId, group_id: groupId, user_id: u.id }))).execute();
    }
  }

  fastify.post('/queues', async (req, reply) => {
    const user = req.user; const b = queueSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { siteId: b.site_id ?? null, global: !b.site_id })))
        return reply.status(403).send({ error: 'You can only add queues to centres you manage.' });
      const { member_ids, ...rest } = b;
      try {
        const row = await trx.insertInto('support_groups')
          .values({ ...rest, tenant_id: user.tenant_id, color: rest.color ?? 'var(--teal)' } as any)
          .returningAll().executeTakeFirstOrThrow();
        if (member_ids) await setMembers(trx, user.tenant_id, row.id, member_ids);
        return reply.status(201).send({ ...row, member_ids: member_ids ?? [] });
      } catch (e) { return pgError(reply, e); }
    });
  });

  fastify.patch('/queues/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    const b = queueSchema.partial().parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const q = await trx.selectFrom('support_groups').select(['site_id']).where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!q) return reply.status(404).send({ error: 'Queue not found' });
      if (!(await canEdit(trx, user.tenant_id, scope, { siteId: q.site_id, global: !q.site_id }))) return reply.status(403).send({ error: 'You do not manage this queue.' });
      const { member_ids, ...rest } = b;
      try {
        if (Object.keys(rest).length) {
          await trx.updateTable('support_groups').set(rest as any).where('tenant_id', '=', user.tenant_id).where('id', '=', id).execute();
        }
        if (member_ids) await setMembers(trx, user.tenant_id, id, member_ids);
        return { ok: true };
      } catch (e) { return pgError(reply, e); }
    });
  });

  fastify.delete('/queues/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const q = await trx.selectFrom('support_groups').select(['site_id']).where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!q) return reply.status(404).send({ error: 'Queue not found' });
      if (!(await canEdit(trx, user.tenant_id, scope, { siteId: q.site_id, global: !q.site_id }))) return reply.status(403).send({ error: 'You do not manage this queue.' });
      await trx.updateTable('support_tickets').set({ group_id: null }).where('tenant_id', '=', user.tenant_id).where('group_id', '=', id).execute();
      await trx.deleteFrom('support_groups').where('tenant_id', '=', user.tenant_id).where('id', '=', id).execute();
      return { ok: true };
    });
  });

  // ── Agent memberships ─────────────────────────────────────────────────
  fastify.post('/memberships', async (req, reply) => {
    const user = req.user; const b = membershipSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const target = b.zone_id ? { zoneId: b.zone_id } : { siteId: b.site_id ?? null };
      if (!(await canEdit(trx, user.tenant_id, scope, target))) return reply.status(403).send({ error: 'You can only add people to centres or zones you manage.' });
      const person = await trx.selectFrom('users').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', b.user_id).executeTakeFirst();
      if (!person) return reply.status(400).send({ error: 'That person is not in this workspace.' });
      try {
        return reply.status(201).send(await trx.insertInto('support_agent_memberships').values({
          tenant_id: user.tenant_id, user_id: b.user_id, site_id: b.zone_id ? null : b.site_id ?? null, zone_id: b.zone_id ?? null,
          role: b.zone_id ? 'zone_manager' : (b.role === 'zone_manager' ? 'agent' : b.role),
          skills: b.skills ?? [], languages: b.languages ?? [], max_open: b.max_open ?? 15,
        } as any).returningAll().executeTakeFirstOrThrow());
      } catch (e: any) {
        if (e?.code === '23505') return reply.status(409).send({ error: 'This person is already in that centre or zone.' });
        return pgError(reply, e);
      }
    });
  });

  fastify.patch('/memberships/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    const b = membershipSchema.pick({ role: true, skills: true, languages: true, max_open: true }).partial().parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const m = await trx.selectFrom('support_agent_memberships').select(['site_id', 'zone_id']).where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!m) return reply.status(404).send({ error: 'Membership not found' });
      if (!(await canEdit(trx, user.tenant_id, scope, m.zone_id ? { zoneId: m.zone_id } : { siteId: m.site_id }))) return reply.status(403).send({ error: 'You do not manage this centre.' });
      // The role of a zone membership is always zone_manager, and a centre
      // membership can never become one.
      const role = m.zone_id ? undefined : (b.role === 'zone_manager' ? undefined : b.role);
      await trx.updateTable('support_agent_memberships')
        .set({ ...b, role, updated_at: new Date() } as any)
        .where('tenant_id', '=', user.tenant_id).where('id', '=', id).execute();
      return { ok: true };
    });
  });

  fastify.delete('/memberships/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const m = await trx.selectFrom('support_agent_memberships').select(['site_id', 'zone_id']).where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!m) return reply.status(404).send({ error: 'Membership not found' });
      if (!(await canEdit(trx, user.tenant_id, scope, m.zone_id ? { zoneId: m.zone_id } : { siteId: m.site_id }))) return reply.status(403).send({ error: 'You do not manage this centre.' });
      await trx.deleteFrom('support_agent_memberships').where('tenant_id', '=', user.tenant_id).where('id', '=', id).execute();
      return { ok: true };
    });
  });

  // ── Move a ticket to another centre (and re-route it there) ───────────
  fastify.post('/tickets/:id/transfer', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    const b = z.object({ site_id: uuid, product_id: uuid.nullable().optional(), note: z.string().max(500).optional() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const t = await trx.selectFrom('support_tickets').select(['id', 'site_id', 'assigned_to', 'priority', 'category', 'source_app', 'product_id', 'ref_number'])
        .where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      // Moving work needs a say over where it is now (or to be holding it).
      if (!t || (!scope.all && t.assigned_to !== user.sub && !(t.site_id ? scope.siteIds.includes(t.site_id) : scope.includeUnplaced)))
        return reply.status(404).send({ error: 'Ticket not found' });
      const dest = await trx.selectFrom('tenant_sites').select(['id', 'name'])
        .where('tenant_id', '=', user.tenant_id).where('id', '=', b.site_id).where('support_enabled', '=', true).executeTakeFirst();
      if (!dest) return reply.status(400).send({ error: 'That centre does not take support work.' });
      const route = await routeTicket(trx, user.tenant_id, {
        siteId: dest.id, productId: b.product_id === undefined ? t.product_id : b.product_id,
        sourceApp: t.source_app, priority: t.priority as any, category: t.category,
      });
      const reason = `Transferred to ${dest.name} by ${user.name ?? 'a supervisor'}${b.note ? ` — ${b.note}` : ''}` + (route ? ` · ${route.reason}` : '');
      await trx.updateTable('support_tickets').set({
        site_id: dest.id, zone_id: route?.zoneId ?? null, product_id: route?.productId ?? null,
        group_id: route?.groupId ?? null, assigned_to: route?.assignedTo ?? null,
        routed_reason: reason, updated_at: new Date(),
      } as any).where('tenant_id', '=', user.tenant_id).where('id', '=', id).execute();
      await trx.insertInto('support_messages').values({
        tenant_id: user.tenant_id, ticket_id: id, author_id: user.sub, author_name: user.name ?? 'Supervisor',
        author_type: 'AGENT', channel: 'SYSTEM', direction: 'OUTBOUND', content: reason,
      } as any).execute().catch(() => { /* the move stands even if the note fails */ });
      return { ok: true, site_id: dest.id, assigned_to: route?.assignedTo ?? null, reason };
    });
  });

  // ── Lines: phone and WhatsApp numbers per centre ──────────────────────
  const lineSchema = z.object({
    kind: z.enum(['voice', 'whatsapp']),
    name: z.string().trim().min(1).max(120),
    phone_number: z.string().trim(),
    carrier: z.enum(['vodacom', 'yas', 'airtel', 'halotel', 'ttcl', 'zantel', 'other']).optional(),
    provider: z.enum(['africastalking', 'sip', 'meta']).optional(),
    external_id: z.string().trim().max(80).nullable().optional(),
    site_id: uuid.nullable().optional(),
    product_id: uuid.nullable().optional(),
    greeting: z.string().max(600).nullable().optional(),
    greeting_audio_url: z.string().url().max(500).nullable().optional(),
    menu: z.array(z.object({
      digit: z.string().regex(/^[0-9]$/, 'Each option is one key, 0–9'),
      label: z.string().trim().min(1).max(60),
      action: z.enum(['route', 'voicemail']),
      product_id: uuid.nullable().optional(),
      site_id: uuid.nullable().optional(),
    })).max(10).refine(m => new Set(m.map(o => o.digit)).size === m.length, 'Two options use the same key.').optional(),
    after_hours: z.enum(['voicemail', 'overflow']).optional(),
    ring_agents: z.boolean().optional(),
    status: z.enum(['active', 'inactive']).optional(),
  });

  /** Display/clean a number: local Tanzanian formats become +255…. */
  const e164 = (raw: string) => {
    let d = raw.replace(/[^\d+]/g, '');
    if (d.startsWith('00')) d = `+${d.slice(2)}`;
    else if (d.startsWith('0')) d = `+255${d.slice(1)}`;
    else if (!d.startsWith('+') && d.length === 9) d = `+255${d}`;
    else if (!d.startsWith('+')) d = `+${d}`;
    return /^\+[1-9]\d{6,14}$/.test(d) ? d : null;
  };
  const webhookUrl = (l: { kind: string; provider: string; webhook_token: string }) =>
    l.kind === 'voice' && l.provider === 'africastalking'
      ? `${env.API_BASE_URL}/v1/webhooks/voice/africastalking/${l.webhook_token}`
      : l.kind === 'whatsapp' ? `${env.API_BASE_URL}/v1/webhooks/whatsapp` : null;

  fastify.get('/lines', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const lines = await trx.selectFrom('support_lines').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('name').execute();
      const since = new Date(Date.now() - 86_400_000);
      const calls = await trx.selectFrom('support_calls')
        .select(['line_id', 'status', sql<number>`count(*)::int`.as('n')])
        .where('tenant_id', '=', user.tenant_id).where('started_at', '>=', since)
        .groupBy(['line_id', 'status']).execute();
      return lines
        .filter(l => scope.all || (l.site_id && scope.siteIds.includes(l.site_id)))
        .map(l => {
          const mine = calls.filter(c => c.line_id === l.id);
          return {
            ...l,
            // The token is a credential: only people who can manage the line see it.
            webhook_token: undefined,
            webhook_url: scope.canManageNetwork ? webhookUrl(l) : null,
            calls_24h: mine.reduce((a, c) => a + Number(c.n), 0),
            missed_24h: mine.filter(c => c.status === 'missed').reduce((a, c) => a + Number(c.n), 0),
          };
        });
    });
  });

  async function checkLine(trx: any, tenantId: string, b: Partial<z.infer<typeof lineSchema>>) {
    if (b.phone_number !== undefined) {
      const n = e164(b.phone_number);
      if (!n) return { error: 'Enter the number in full, e.g. +255 754 000 000 or 0754 000 000.' };
      b.phone_number = n;
    }
    const ids = [b.site_id, ...(b.menu ?? []).map(o => o.site_id)].filter(Boolean) as string[];
    if (ids.length) {
      const ok = await trx.selectFrom('tenant_sites').select('id').where('tenant_id', '=', tenantId).where('id', 'in', ids).execute();
      if (ok.length !== new Set(ids).size) return { error: 'A chosen centre does not exist.' };
    }
    const pids = [b.product_id, ...(b.menu ?? []).map(o => o.product_id)].filter(Boolean) as string[];
    if (pids.length) {
      const ok = await trx.selectFrom('support_products').select('id').where('tenant_id', '=', tenantId).where('id', 'in', pids).execute();
      if (ok.length !== new Set(pids).size) return { error: 'A chosen product does not exist.' };
    }
    if (b.kind === 'whatsapp' && !b.external_id) return { error: "A WhatsApp line needs its Meta phone number ID (WhatsApp Manager → Phone numbers)." };
    return null;
  }

  fastify.post('/lines', async (req, reply) => {
    const user = req.user; const b = lineSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      if (!(await canEdit(trx, user.tenant_id, scope, { siteId: b.site_id ?? null, global: !b.site_id })))
        return reply.status(403).send({ error: 'You can only add lines to centres you manage.' });
      const bad = await checkLine(trx, user.tenant_id, b);
      if (bad) return reply.status(400).send(bad);
      try {
        const row = await trx.insertInto('support_lines').values({
          ...b, tenant_id: user.tenant_id, provider: b.provider ?? (b.kind === 'whatsapp' ? 'meta' : 'africastalking'),
          menu: JSON.stringify(b.menu ?? []),
        } as any).returningAll().executeTakeFirstOrThrow();
        return reply.status(201).send({ ...row, webhook_token: undefined, webhook_url: webhookUrl(row) });
      } catch (e: any) {
        if (e?.code === '23505') return reply.status(409).send({ error: 'That number is already set up as a line (here or in another workspace).' });
        return pgError(reply, e);
      }
    });
  });

  fastify.patch('/lines/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    const b = lineSchema.partial().parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const cur = await trx.selectFrom('support_lines').select(['site_id', 'kind', 'external_id']).where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!cur) return reply.status(404).send({ error: 'Line not found' });
      if (!(await canEdit(trx, user.tenant_id, scope, { siteId: cur.site_id, global: !cur.site_id }))) return reply.status(403).send({ error: 'You do not manage this line.' });
      const bad = await checkLine(trx, user.tenant_id, { ...b, kind: b.kind ?? cur.kind, external_id: b.external_id === undefined ? cur.external_id : b.external_id });
      if (bad) return reply.status(400).send(bad);
      try {
        const row = await trx.updateTable('support_lines')
          .set({ ...b, ...(b.menu ? { menu: JSON.stringify(b.menu) } : {}), updated_at: new Date() } as any)
          .where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
        return { ...row, webhook_token: undefined, webhook_url: webhookUrl(row) };
      } catch (e: any) {
        if (e?.code === '23505') return reply.status(409).send({ error: 'That number is already set up as a line (here or in another workspace).' });
        return pgError(reply, e);
      }
    });
  });

  fastify.delete('/lines/:id', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const cur = await trx.selectFrom('support_lines').select(['site_id']).where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!cur) return reply.status(404).send({ error: 'Line not found' });
      if (!(await canEdit(trx, user.tenant_id, scope, { siteId: cur.site_id, global: !cur.site_id }))) return reply.status(403).send({ error: 'You do not manage this line.' });
      await trx.deleteFrom('support_lines').where('tenant_id', '=', user.tenant_id).where('id', '=', id).execute();
      return { ok: true };
    });
  });

  /** A new callback URL for a voice line, e.g. if the old one leaked. */
  fastify.post('/lines/:id/rotate-token', async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      const cur = await trx.selectFrom('support_lines').select(['site_id']).where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!cur) return reply.status(404).send({ error: 'Line not found' });
      if (!(await canEdit(trx, user.tenant_id, scope, { siteId: cur.site_id, global: !cur.site_id }))) return reply.status(403).send({ error: 'You do not manage this line.' });
      const row = await trx.updateTable('support_lines').set({ webhook_token: sql`encode(gen_random_bytes(18), 'hex')`, updated_at: new Date() } as any)
        .where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      return { webhook_url: webhookUrl(row) };
    });
  });

  // ── Recent calls ──────────────────────────────────────────────────────
  fastify.get('/calls', async (req) => {
    const user = req.user;
    const q = req.query as { site_id?: string; limit?: string };
    return withTenant(user.tenant_id, async (trx) => {
      const scope = await supportScope(trx, user);
      let query = trx.selectFrom('support_calls as c')
        .leftJoin('support_lines as l', 'l.id', 'c.line_id')
        .leftJoin('tenant_sites as s', 's.id', 'c.site_id')
        .leftJoin('support_products as p', 'p.id', 'c.product_id')
        .leftJoin('users as u', 'u.id', 'c.agent_id')
        .leftJoin('support_tickets as t', 't.id', 'c.ticket_id')
        .select(['c.id', 'c.caller_number', 'c.status', 'c.digits', 'c.started_at', 'c.ended_at', 'c.duration_seconds',
          'c.recording_url', 'c.ticket_id', 't.ref_number as ticket_ref', 'c.site_id', 's.name as site_name',
          'p.name as product_name', 'u.name as agent_name', 'l.name as line_name', 'l.phone_number as line_number'])
        .where('c.tenant_id', '=', user.tenant_id);
      if (q.site_id) query = query.where('c.site_id', '=', q.site_id);
      if (!scope.all) query = query.where('c.site_id', 'in', scope.siteIds.length ? scope.siteIds : ['00000000-0000-0000-0000-000000000000']);
      return query.orderBy('c.started_at', 'desc').limit(Math.min(Number(q.limit) || 50, 200)).execute();
    });
  });
}
