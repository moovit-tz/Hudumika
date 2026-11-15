import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { encryptSecret, decryptSecret } from '../services/onsite-secrets.service.js';
import { PULSE_ROLES, PULSE_PUBLISH_ROLES } from './pulse.routes.js';
import { PulseSegments } from '../services/pulse-segments.service.js';
import * as Ads from '../integrations/pulse-ads.js';

type Acc = { id: string; tenant_id: string; network: 'google' | 'meta'; external_id: string; access_token: string; refresh_token: string | null; token_expires_at: Date | null };

async function tokenFor(a: Acc): Promise<string> {
  const soon = a.token_expires_at && new Date(a.token_expires_at).getTime() < Date.now() + 5 * 60_000;
  if (!soon) return decryptSecret(a.access_token);
  if (!a.refresh_token) throw new Ads.AdsError('The connection has expired. Reconnect it.', true);
  const t = await Ads.adsRefresh(a.network, decryptSecret(a.refresh_token));
  await withTenant(a.tenant_id, (trx) => trx.updateTable('pulse_ad_accounts').set({ access_token: encryptSecret(t.access_token), token_expires_at: t.expires_at, status: 'connected', last_error: null })
    .where('id', '=', a.id).execute());
  return t.access_token;
}

async function markFailure(a: Acc, e: any) {
  const expired = e instanceof Ads.AdsError && e.expired;
  await withTenant(a.tenant_id, (trx) => trx.updateTable('pulse_ad_accounts').set({ last_error: String(e?.message ?? e).slice(0, 500), ...(expired ? { status: 'expired' as const } : {}) })
    .where('id', '=', a.id).execute());
}

/** Pulls campaigns and the last 30 days of numbers for one account. */
export async function syncAdAccount(a: Acc) {
  const token = await tokenFor(a);
  const { campaigns, days } = await Ads.adsSync(a.network, a.external_id, token);
  await withTenant(a.tenant_id, async (trx) => {
    const ids = new Map<string, string>();
    for (const c of campaigns) {
      const vals = { name: c.name.slice(0, 300), status: c.status, daily_budget: c.daily_budget != null ? String(c.daily_budget) : null, budget_ref: c.budget_ref ?? null, objective: c.objective ?? null, synced_at: new Date() };
      const row = await trx.insertInto('pulse_ad_campaigns').values({ tenant_id: a.tenant_id, account_id: a.id, external_id: c.external_id, ...vals })
        .onConflict((oc) => oc.columns(['account_id', 'external_id']).doUpdateSet(vals)).returning('id').executeTakeFirstOrThrow();
      ids.set(c.external_id, row.id);
    }
    for (const d of days) {
      const cid = ids.get(d.campaign_external_id);
      if (!cid) continue;
      const vals = { impressions: String(d.impressions), clicks: String(d.clicks), spend: String(d.spend), conversions: String(d.conversions) };
      await trx.insertInto('pulse_ad_metrics_daily').values({ tenant_id: a.tenant_id, campaign_id: cid, day: d.day, ...vals })
        .onConflict((oc) => oc.columns(['campaign_id', 'day']).doUpdateSet(vals)).execute();
    }
    await trx.updateTable('pulse_ad_accounts').set({ synced_at: new Date(), last_error: null }).where('id', '=', a.id).execute();
  });
  return { campaigns: campaigns.length, days: days.length };
}

/** Every 6 hours: refresh numbers for every connected ad account. */
export async function runPulseAdsJob() {
  const accounts = await dbPlatform.selectFrom('pulse_ad_accounts').select(['id', 'tenant_id', 'network', 'external_id', 'access_token', 'refresh_token', 'token_expires_at'])
    .where('status', '=', 'connected').where((eb) => eb.or([eb('synced_at', 'is', null), eb('synced_at', '<', new Date(Date.now() - 6 * 3600_000))])).limit(50).execute();
  for (const a of accounts) { try { await syncAdAccount(a as Acc); } catch (e: any) { await markFailure(a as Acc, e).catch(() => {}); } }
}

export async function pulseAdsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('pulse'));
  fastify.addHook('preHandler', requireRole(...PULSE_ROLES));

  const loadAcc = (tenantId: string, id: string) => withTenant(tenantId, (trx) => trx.selectFrom('pulse_ad_accounts')
    .select(['id', 'tenant_id', 'network', 'external_id', 'access_token', 'refresh_token', 'token_expires_at', 'status', 'name', 'currency'])
    .where('tenant_id', '=', tenantId).where('id', '=', id).where('status', '<>', 'disconnected').executeTakeFirst());

  fastify.get('/ads', async (request) => {
    const { tenant_id } = request.user;
    const q = request.query as { days?: string };
    const days = [7, 30].includes(Number(q.days)) ? Number(q.days) : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    return withTenant(tenant_id, async (trx) => {
      const accounts = await trx.selectFrom('pulse_ad_accounts').select(['id', 'network', 'name', 'currency', 'status', 'last_error', 'synced_at'])
        .where('tenant_id', '=', tenant_id).where('status', '<>', 'disconnected').orderBy('network').execute();
      const campaigns = await trx.selectFrom('pulse_ad_campaigns as c').innerJoin('pulse_ad_accounts as a', 'a.id', 'c.account_id')
        .leftJoin('pulse_ad_metrics_daily as m', (j) => j.onRef('m.campaign_id', '=', 'c.id').on('m.day', '>=', since))
        .select(['c.id', 'c.name', 'c.status', 'c.daily_budget', 'c.budget_ref', 'c.objective', 'c.account_id', 'a.network', 'a.currency', 'a.name as account_name',
          sql<string>`coalesce(sum(m.impressions), 0)`.as('impressions'), sql<string>`coalesce(sum(m.clicks), 0)`.as('clicks'),
          sql<string>`coalesce(sum(m.spend), 0)`.as('spend'), sql<string>`coalesce(sum(m.conversions), 0)`.as('conversions'),
          // Pulse's own count: leads and won deals whose last touch was a form sent from a link tagged with this campaign's name.
          sql<string>`(SELECT count(*) FROM pulse_conversions v JOIN pulse_touchpoints t ON t.id = v.last_touch_id WHERE v.tenant_id = c.tenant_id AND v.kind = 'lead' AND v.occurred_at >= ${since}::date AND lower(t.utm_campaign) = lower(c.name))`.as('pulse_leads'),
          sql<string>`(SELECT coalesce(sum(v.value), 0) FROM pulse_conversions v JOIN pulse_touchpoints t ON t.id = v.last_touch_id WHERE v.tenant_id = c.tenant_id AND v.kind = 'deal_won' AND v.occurred_at >= ${since}::date AND lower(t.utm_campaign) = lower(c.name))`.as('pulse_won')])
        .where('c.tenant_id', '=', tenant_id).where('a.status', '<>', 'disconnected')
        .groupBy(['c.id', 'a.network', 'a.currency', 'a.name']).orderBy(sql`coalesce(sum(m.spend), 0)`, 'desc').execute();
      const audiences = await trx.selectFrom('pulse_ad_audiences as d').leftJoin('pulse_segments as s', 's.id', 'd.segment_id')
        .select(['d.id', 'd.account_id', 'd.name', 'd.uploaded', 'd.status', 'd.last_error', 'd.synced_at', 's.name as segment_name'])
        .where('d.tenant_id', '=', tenant_id).orderBy('d.created_at', 'desc').execute();
      return {
        data: {
          available: Ads.adsAvailable(), days, accounts, audiences,
          campaigns: campaigns.map((c) => ({ ...c, daily_budget: c.daily_budget != null ? Number(c.daily_budget) : null, impressions: Number(c.impressions), clicks: Number(c.clicks), spend: Number(c.spend), conversions: Number(c.conversions), pulse_leads: Number(c.pulse_leads), pulse_won: Number(c.pulse_won), budget_ref: undefined, can_budget: c.network === 'meta' || !!c.budget_ref })),
        },
      };
    });
  });

  fastify.post('/ads/connect/:network', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { network } = request.params as { network: string };
    if (network !== 'google' && network !== 'meta') return reply.status(404).send({ error: 'Unknown platform' });
    try { return { data: { url: Ads.adsAuthUrl(network, Ads.makeState(tenant_id, sub, `ads-${network}`)) } }; }
    catch (e: any) { return reply.status(409).send({ error: e.message }); }
  });

  fastify.post('/ads/callback/:network', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { network } = request.params as { network: string };
    const b = z.object({ code: z.string().min(1).max(2000), state: z.string().min(1).max(1000) }).safeParse(request.body);
    if (!b.success || (network !== 'google' && network !== 'meta')) return reply.status(400).send({ error: 'The connection came back incomplete. Try again.' });
    if (!Ads.readState(b.data.state, tenant_id, sub, `ads-${network}`)) return reply.status(400).send({ error: 'This connection link expired or was started by someone else. Start again.' });
    try {
      const found = await Ads.adsConnect(network, b.data.code);
      const saved = await withTenant(tenant_id, async (trx) => {
        const rows = [];
        for (const a of found) {
          const vals = { name: a.name.slice(0, 200), currency: a.currency, access_token: encryptSecret(a.access_token), refresh_token: a.refresh_token ? encryptSecret(a.refresh_token) : null, token_expires_at: a.expires_at ?? null, status: 'connected' as const, last_error: null, connected_by: sub, updated_at: new Date() };
          rows.push(await trx.insertInto('pulse_ad_accounts').values({ tenant_id, network, external_id: a.external_id, ...vals })
            .onConflict((oc) => oc.columns(['tenant_id', 'network', 'external_id']).doUpdateSet(vals)).returningAll().executeTakeFirstOrThrow());
        }
        return rows;
      });
      for (const a of saved) await syncAdAccount(a as Acc).catch((e) => markFailure(a as Acc, e));
      return { data: { connected: saved.map((a) => a.name) } };
    } catch (e: any) { return reply.status(502).send({ error: e.message }); }
  });

  fastify.post('/ads/accounts/:id/sync', async (request, reply) => {
    const a = await loadAcc(request.user.tenant_id, (request.params as any).id);
    if (!a) return reply.status(404).send({ error: 'Account not found' });
    try { return { data: await syncAdAccount(a as Acc) }; }
    catch (e: any) { await markFailure(a as Acc, e); return reply.status(502).send({ error: e.message }); }
  });

  fastify.delete('/ads/accounts/:id', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id } = request.user;
    const r = await withTenant(tenant_id, (trx) => trx.updateTable('pulse_ad_accounts').set({ status: 'disconnected', access_token: '', refresh_token: null, updated_at: new Date() })
      .where('tenant_id', '=', tenant_id).where('id', '=', (request.params as any).id).executeTakeFirst());
    if (!r.numUpdatedRows) return reply.status(404).send({ error: 'Account not found' });
    return { success: true };
  });

  const campaignAction = z.discriminatedUnion('action', [
    z.object({ action: z.literal('pause') }), z.object({ action: z.literal('resume') }),
    z.object({ action: z.literal('budget'), amount: z.number().positive().max(1e10) }),
  ]);
  fastify.post('/ads/campaigns/:id', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id } = request.user;
    const parsed = campaignAction.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Choose what to change' });
    const c = await withTenant(tenant_id, (trx) => trx.selectFrom('pulse_ad_campaigns').selectAll().where('tenant_id', '=', tenant_id).where('id', '=', (request.params as any).id).executeTakeFirst());
    if (!c) return reply.status(404).send({ error: 'Campaign not found' });
    const a = await loadAcc(tenant_id, c.account_id);
    if (!a || a.status !== 'connected') return reply.status(409).send({ error: 'Reconnect this ad account first' });
    try {
      const token = await tokenFor(a as Acc);
      if (parsed.data.action === 'budget') {
        await Ads.adsSetBudget(a.network, a.external_id, c.external_id, c.budget_ref, token, parsed.data.amount);
        await withTenant(tenant_id, (trx) => trx.updateTable('pulse_ad_campaigns').set({ daily_budget: String(parsed.data.action === 'budget' ? parsed.data.amount : 0) }).where('id', '=', c.id).execute());
      } else {
        const status = await Ads.adsSetStatus(a.network, a.external_id, c.external_id, token, parsed.data.action === 'resume');
        await withTenant(tenant_id, (trx) => trx.updateTable('pulse_ad_campaigns').set({ status }).where('id', '=', c.id).execute());
      }
      return { success: true };
    } catch (e: any) { await markFailure(a as Acc, e); return reply.status(502).send({ error: e.message }); }
  });

  // Push a Pulse audience to an ad account as a matched audience — only people
  // who opted in to marketing, hashed before they leave Hudumika.
  fastify.post('/ads/audiences', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const b = z.object({ account_id: z.string().uuid(), segment_id: z.string().uuid() }).safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Choose an ad account and an audience' });
    const a = await loadAcc(tenant_id, b.data.account_id);
    if (!a || a.status !== 'connected') return reply.status(409).send({ error: 'Reconnect this ad account first' });
    const prep = await withTenant(tenant_id, async (trx) => {
      const seg = await trx.selectFrom('pulse_segments').selectAll().where('tenant_id', '=', tenant_id).where('id', '=', b.data.segment_id).executeTakeFirst();
      if (!seg) return null;
      const members = await PulseSegments.members(trx, tenant_id, { source: seg.source, match_type: seg.match_type as any, rules: typeof seg.rules === 'string' ? JSON.parse(seg.rules) : seg.rules }, { limit: 100_000 });
      const emails = members.map((m) => m.email?.trim().toLowerCase()).filter((e): e is string => !!e);
      const opted = emails.length ? new Set((await trx.selectFrom('pulse_consents').select('address').where('tenant_id', '=', tenant_id)
        .where('channel', '=', 'email').where('status', '=', 'subscribed').where('address', 'in', emails).execute()).map((r) => r.address)) : new Set<string>();
      const people = members.filter((m) => m.email && opted.has(m.email.trim().toLowerCase())).map((m) => ({ email: m.email, phone: m.phone }));
      const existing = await trx.selectFrom('pulse_ad_audiences').selectAll().where('tenant_id', '=', tenant_id).where('account_id', '=', a.id).where('segment_id', '=', seg.id).executeTakeFirst();
      return { seg, people, total: members.length, existing };
    });
    if (!prep) return reply.status(404).send({ error: 'Audience not found' });
    if (prep.people.length < 100) {
      return reply.status(400).send({ error: `Only ${prep.people.length} of ${prep.total} people in this audience opted in to marketing. Ad platforms need at least 100 to match an audience, and Pulse only shares people who opted in.` });
    }
    const name = `Pulse: ${prep.seg.name}`.slice(0, 200);
    try {
      const token = await tokenFor(a as Acc);
      const extId = await Ads.adsPushAudience(a.network, a.external_id, token, name, prep.existing?.external_id ?? null, prep.people);
      const row = await withTenant(tenant_id, (trx) => trx.insertInto('pulse_ad_audiences').values({
        tenant_id, account_id: a.id, segment_id: prep.seg.id, external_id: extId, name, uploaded: prep.people.length, status: 'synced', synced_at: new Date(), created_by: sub,
      }).onConflict((oc) => oc.columns(['account_id', 'segment_id']).doUpdateSet({ external_id: extId, uploaded: prep.people.length, status: 'synced', last_error: null, synced_at: new Date() }))
        .returningAll().executeTakeFirstOrThrow());
      return { data: row };
    } catch (e: any) {
      await withTenant(tenant_id, (trx) => trx.insertInto('pulse_ad_audiences').values({ tenant_id, account_id: a.id, segment_id: prep.seg.id, name, status: 'failed', last_error: String(e?.message ?? e).slice(0, 500), created_by: sub })
        .onConflict((oc) => oc.columns(['account_id', 'segment_id']).doUpdateSet({ status: 'failed', last_error: String(e?.message ?? e).slice(0, 500) })).execute()).catch(() => {});
      return reply.status(502).send({ error: e.message });
    }
  });
}
