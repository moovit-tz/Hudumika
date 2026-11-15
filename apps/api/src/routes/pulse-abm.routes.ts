import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { PULSE_ROLES } from './pulse.routes.js';
import { accountPeople, rescoreTenant } from '../services/pulse-abm.service.js';

export async function pulseAbmRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('pulse'));
  fastify.addHook('preHandler', requireRole(...PULSE_ROLES));

  fastify.get('/accounts', async (request) => {
    const { tenant_id } = request.user;
    return withTenant(tenant_id, async (trx) => {
      const rows = await trx.selectFrom('pulse_target_accounts as t').innerJoin('customers as c', 'c.id', 't.customer_id').leftJoin('users as u', 'u.id', 't.owner_id')
        .select(['t.id', 't.customer_id', 't.tier', 't.owner_id', 't.score', 't.score_detail', 't.scored_at', 't.hot_since', 't.notes',
          'c.name', 'c.logo_url', 'c.city', 'c.country', 'u.name as owner_name', 'u.avatar_url as owner_avatar'])
        .where('t.tenant_id', '=', tenant_id).orderBy('t.score', 'desc').orderBy('c.name').execute();
      return { data: rows.map((r) => ({ ...r, score_detail: typeof r.score_detail === 'string' ? JSON.parse(r.score_detail) : r.score_detail, hot: !!r.hot_since })) };
    });
  });

  // Companies that could be added, for the picker.
  fastify.get('/accounts/candidates', async (request) => {
    const { tenant_id } = request.user;
    const q = String((request.query as any).q ?? '').trim().slice(0, 100);
    return withTenant(tenant_id, async (trx) => {
      let query = trx.selectFrom('customers as c').select(['c.id', 'c.name', 'c.logo_url', 'c.city'])
        .where('c.tenant_id', '=', tenant_id).where('c.deleted_at', 'is', null)
        .where(sql<boolean>`NOT EXISTS (SELECT 1 FROM pulse_target_accounts t WHERE t.customer_id = c.id)`);
      if (q) query = query.where('c.name', 'ilike', `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`);
      return { data: await query.orderBy('c.name').limit(30).execute() };
    });
  });

  const addBody = z.object({ customer_ids: z.array(z.string().uuid()).min(1).max(100), tier: z.number().int().min(1).max(3).default(2), owner_id: z.string().uuid().nullish() });
  fastify.post('/accounts', async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const b = addBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Choose at least one company' });
    const added = await withTenant(tenant_id, async (trx) => {
      const valid = await trx.selectFrom('customers').select('id').where('tenant_id', '=', tenant_id).where('id', 'in', b.data.customer_ids).execute();
      if (b.data.owner_id) {
        const u = await trx.selectFrom('users').select('id').where('tenant_id', '=', tenant_id).where('id', '=', b.data.owner_id).executeTakeFirst();
        if (!u) return null;
      }
      let n = 0;
      for (const c of valid) {
        const r = await trx.insertInto('pulse_target_accounts').values({ tenant_id, customer_id: c.id, tier: b.data.tier, owner_id: b.data.owner_id ?? sub, created_by: sub })
          .onConflict((oc) => oc.columns(['tenant_id', 'customer_id']).doNothing()).executeTakeFirst();
        n += Number(r.numInsertedOrUpdatedRows ?? 0);
      }
      return n;
    });
    if (added === null) return reply.status(400).send({ error: 'That owner isn’t in this workspace' });
    await rescoreTenant(tenant_id).catch(() => {});
    return reply.status(201).send({ data: { added } });
  });

  const patchBody = z.object({ tier: z.number().int().min(1).max(3).optional(), owner_id: z.string().uuid().nullable().optional(), notes: z.string().max(2000).nullable().optional() });
  fastify.patch('/accounts/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const b = patchBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid change' });
    return withTenant(tenant_id, async (trx) => {
      if (b.data.owner_id) {
        const u = await trx.selectFrom('users').select('id').where('tenant_id', '=', tenant_id).where('id', '=', b.data.owner_id).executeTakeFirst();
        if (!u) return reply.status(400).send({ error: 'That owner isn’t in this workspace' });
      }
      const row = await trx.updateTable('pulse_target_accounts').set(b.data).where('tenant_id', '=', tenant_id).where('id', '=', (request.params as any).id).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Account not found' });
      return { data: row };
    });
  });

  fastify.delete('/accounts/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const r = await withTenant(tenant_id, (trx) => trx.deleteFrom('pulse_target_accounts').where('tenant_id', '=', tenant_id).where('id', '=', (request.params as any).id).executeTakeFirst());
    if (!r.numDeletedRows) return reply.status(404).send({ error: 'Account not found' });
    return { success: true };
  });

  fastify.get('/accounts/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    return withTenant(tenant_id, async (trx) => {
      const t = await trx.selectFrom('pulse_target_accounts as t').innerJoin('customers as c', 'c.id', 't.customer_id').leftJoin('users as u', 'u.id', 't.owner_id')
        .select(['t.id', 't.customer_id', 't.tier', 't.owner_id', 't.score', 't.score_detail', 't.scored_at', 't.hot_since', 't.notes', 'c.name', 'c.logo_url', 'c.city', 'c.country', 'u.name as owner_name', 'u.avatar_url as owner_avatar'])
        .where('t.tenant_id', '=', tenant_id).where('t.id', '=', (request.params as any).id).executeTakeFirst();
      if (!t) return reply.status(404).send({ error: 'Account not found' });
      const people = await accountPeople(trx, tenant_id, t.customer_id);
      const emails = people?.emails ?? [];
      const activity = emails.length ? await trx.selectFrom('pulse_sends as s').innerJoin('pulse_campaigns as p', 'p.id', 's.campaign_id')
        .select(['s.id', 's.recipient_name', 's.address', 's.sent_at', 's.opened_at', 's.clicked_at', 'p.id as campaign_id', 'p.name as campaign_name', 'p.journey_id'])
        .where('s.tenant_id', '=', tenant_id).where('s.address', 'in', emails).where('s.status', '=', 'sent')
        .orderBy('s.sent_at', 'desc').limit(40).execute() : [];
      const leadIds = people?.leads.map((l) => l.id) ?? [];
      const deals = await trx.selectFrom('deals').select(['id', 'name', 'stage', 'value'])
        .where('tenant_id', '=', tenant_id)
        .where((eb) => eb.or([eb('customer_id', '=', t.customer_id), ...(leadIds.length ? [eb('lead_id', 'in', leadIds)] : [])]))
        .orderBy('created_at', 'desc').limit(20).execute().catch(() => []);
      return {
        data: {
          ...t, score_detail: typeof t.score_detail === 'string' ? JSON.parse(t.score_detail) : t.score_detail, hot: !!t.hot_since,
          contacts: people?.contacts ?? [], leads: people?.leads ?? [], activity, deals,
        },
      };
    });
  });

  fastify.post('/accounts/rescore', async (request) => {
    await rescoreTenant(request.user.tenant_id);
    return { success: true };
  });
}
