import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, dbPlatform, type PulseNetwork } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { encryptSecret, decryptSecret } from '../services/onsite-secrets.service.js';
import { PULSE_ROLES, PULSE_PUBLISH_ROLES } from './pulse.routes.js';
import * as Social from '../integrations/pulse-social.js';

const httpsUrl = z.string().trim().url().max(2000).refine((u) => u.startsWith('https://'), 'Use an https:// link');
const postBody = z.object({
  body: z.string().max(63206),
  link_url: httpsUrl.nullish().or(z.literal('')),
  image_url: httpsUrl.nullish().or(z.literal('')),
  account_ids: z.array(z.string().uuid()).max(20),
  overrides: z.record(z.string().uuid(), z.string().max(63206)).optional(),
});

/** Why a post can't go to an account, if it can't. */
function targetProblem(network: PulseNetwork, text: string, imageUrl: string | null): string | null {
  if (!text.trim() && network !== 'instagram') return 'Write something to post';
  if (text.length > Social.LIMITS[network]) return `Too long for ${network === 'x' ? 'X' : network} (${text.length}/${Social.LIMITS[network]})`;
  if (network === 'instagram' && !imageUrl) return 'Instagram needs an image';
  return null;
}

async function tokenFor(tenantId: string, acc: { id: string; network: PulseNetwork; access_token: string; refresh_token: string | null; token_expires_at: Date | null }): Promise<string> {
  const soon = acc.token_expires_at && new Date(acc.token_expires_at).getTime() < Date.now() + 5 * 60_000;
  if (!soon) return decryptSecret(acc.access_token);
  if (!acc.refresh_token) throw new Social.SocialError('The connection has expired. Reconnect it.', true);
  const t = await Social.refresh(acc.network, decryptSecret(acc.refresh_token));
  await withTenant(tenantId, (trx) => trx.updateTable('pulse_social_accounts').set({
    access_token: encryptSecret(t.access_token), refresh_token: t.refresh_token ? encryptSecret(t.refresh_token) : acc.refresh_token,
    token_expires_at: t.expires_at, status: 'connected', last_error: null, updated_at: new Date(),
  }).where('tenant_id', '=', tenantId).where('id', '=', acc.id).execute());
  return t.access_token;
}

/** Publishes every pending target of one post. Each account succeeds or fails on its own. */
export async function publishPost(tenantId: string, postId: string) {
  const claimed = await withTenant(tenantId, async (trx) => {
    const r = await trx.updateTable('pulse_social_posts').set({ status: 'publishing', updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', postId).where('status', '=', 'scheduled').returningAll().executeTakeFirst();
    if (!r) return null;
    const targets = await trx.selectFrom('pulse_social_post_targets as t').innerJoin('pulse_social_accounts as a', 'a.id', 't.account_id')
      .select(['t.id', 't.body_override', 'a.id as account_id', 'a.network', 'a.external_id', 'a.access_token', 'a.refresh_token', 'a.token_expires_at', 'a.status as account_status'])
      .where('t.tenant_id', '=', tenantId).where('t.post_id', '=', postId).where('t.status', '=', 'pending').execute();
    return { post: r, targets };
  });
  if (!claimed) return;
  const { post, targets } = claimed;
  for (const t of targets) {
    const text = t.body_override ?? post.body;
    let result: { status: 'published' | 'failed'; external_post_id?: string; external_url?: string | null; error?: string };
    try {
      if (t.account_status !== 'connected') throw new Social.SocialError('This account is disconnected. Reconnect it and try again.');
      const problem = targetProblem(t.network, text, post.image_url);
      if (problem) throw new Social.SocialError(problem);
      const token = await tokenFor(tenantId, { id: t.account_id, network: t.network, access_token: t.access_token, refresh_token: t.refresh_token, token_expires_at: t.token_expires_at });
      const r = await Social.publish(t.network, t.external_id, token, { text, link: post.link_url, imageUrl: post.image_url });
      result = { status: 'published', external_post_id: r.id, external_url: r.url };
    } catch (e: any) {
      result = { status: 'failed', error: String(e?.message ?? e).slice(0, 500) };
      if (e instanceof Social.SocialError && e.expired) {
        await withTenant(tenantId, (trx) => trx.updateTable('pulse_social_accounts').set({ status: 'expired', last_error: result.error ?? null })
          .where('tenant_id', '=', tenantId).where('id', '=', t.account_id).execute());
      }
    }
    await withTenant(tenantId, (trx) => trx.updateTable('pulse_social_post_targets').set({
      status: result.status, external_post_id: result.external_post_id ?? null, external_url: result.external_url ?? null,
      error: result.error ?? null, published_at: result.status === 'published' ? new Date() : null,
    }).where('tenant_id', '=', tenantId).where('id', '=', t.id).execute());
  }
  await withTenant(tenantId, async (trx) => {
    const all = await trx.selectFrom('pulse_social_post_targets').select('status').where('tenant_id', '=', tenantId).where('post_id', '=', postId).execute();
    const ok = all.filter((x) => x.status === 'published').length;
    const status = ok === all.length ? 'published' : ok === 0 ? 'failed' : 'partly_published';
    await trx.updateTable('pulse_social_posts').set({ status, published_at: ok ? new Date() : null, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', postId).execute();
  });
}

/** Every minute: publish due posts; every run refresh a few posts' numbers (each at most every 6 hours, for 30 days). */
export async function runPulseSocialJob() {
  const due = await dbPlatform.selectFrom('pulse_social_posts').select(['id', 'tenant_id'])
    .where('status', '=', 'scheduled').where('scheduled_at', '<=', new Date()).limit(20).execute();
  for (const p of due) { try { await publishPost(p.tenant_id, p.id); } catch (e: any) { console.error('[Pulse social] publish', e?.message); } }
  const stale = await dbPlatform.selectFrom('pulse_social_post_targets as t').innerJoin('pulse_social_accounts as a', 'a.id', 't.account_id')
    .select(['t.id', 't.tenant_id', 't.external_post_id', 'a.id as account_id', 'a.network', 'a.access_token', 'a.refresh_token', 'a.token_expires_at'])
    .where('t.status', '=', 'published').where('t.external_post_id', 'is not', null).where('a.status', '=', 'connected')
    .where('t.published_at', '>=', new Date(Date.now() - 30 * 86400_000))
    .where((eb) => eb.or([eb('t.metrics_at', 'is', null), eb('t.metrics_at', '<', new Date(Date.now() - 6 * 3600_000))]))
    .limit(30).execute();
  for (const t of stale) {
    try {
      const token = await tokenFor(t.tenant_id, { id: t.account_id, network: t.network, access_token: t.access_token, refresh_token: t.refresh_token, token_expires_at: t.token_expires_at });
      const m = await Social.metrics(t.network, t.external_post_id!, token);
      await withTenant(t.tenant_id, (trx) => trx.updateTable('pulse_social_post_targets').set({ metrics: JSON.stringify(m), metrics_at: new Date() }).where('id', '=', t.id).execute());
    } catch (e: any) {
      await withTenant(t.tenant_id, (trx) => trx.updateTable('pulse_social_post_targets').set({ metrics_at: new Date() }).where('id', '=', t.id).execute()).catch(() => {});
    }
  }
}

export async function pulseSocialRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('pulse'));
  fastify.addHook('preHandler', requireRole(...PULSE_ROLES));

  fastify.get('/social/accounts', async (request) => {
    const { tenant_id } = request.user;
    const rows = await withTenant(tenant_id, (trx) => trx.selectFrom('pulse_social_accounts')
      .select(['id', 'network', 'name', 'handle', 'avatar_url', 'status', 'last_error', 'token_expires_at', 'created_at'])
      .where('tenant_id', '=', tenant_id).where('status', '<>', 'disconnected').orderBy('network').orderBy('name').execute());
    return { data: { available: Social.available(), accounts: rows } };
  });

  fastify.post('/social/connect/:provider', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { provider } = request.params as { provider: string };
    if (!['meta', 'linkedin', 'x'].includes(provider)) return reply.status(404).send({ error: 'Unknown network' });
    try {
      const state = Social.makeState(tenant_id, sub, provider);
      return { data: { url: Social.authUrl(provider as any, state) } };
    } catch (e: any) { return reply.status(409).send({ error: e.message }); }
  });

  fastify.post('/social/callback/:provider', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { provider } = request.params as { provider: string };
    const b = z.object({ code: z.string().min(1).max(2000), state: z.string().min(1).max(1000) }).safeParse(request.body);
    if (!b.success || !['meta', 'linkedin', 'x'].includes(provider)) return reply.status(400).send({ error: 'The connection came back incomplete. Try again.' });
    if (!Social.readState(b.data.state, tenant_id, sub, provider)) return reply.status(400).send({ error: 'This connection link expired or was started by someone else. Start again.' });
    try {
      const accounts = await Social.connect(provider as any, b.data.code, b.data.state);
      await withTenant(tenant_id, async (trx) => {
        for (const a of accounts) {
          const values = {
            name: a.name.slice(0, 200), handle: a.handle ?? null, avatar_url: a.avatar_url ?? null,
            access_token: encryptSecret(a.access_token), refresh_token: a.refresh_token ? encryptSecret(a.refresh_token) : null,
            token_expires_at: a.expires_at ?? null, status: 'connected' as const, last_error: null, connected_by: sub, updated_at: new Date(),
          };
          await trx.insertInto('pulse_social_accounts').values({ tenant_id, network: a.network, external_id: a.external_id, ...values })
            .onConflict((oc) => oc.columns(['tenant_id', 'network', 'external_id']).doUpdateSet(values)).execute();
        }
      });
      return { data: { connected: accounts.map((a) => ({ network: a.network, name: a.name })) } };
    } catch (e: any) { return reply.status(502).send({ error: e.message }); }
  });

  fastify.delete('/social/accounts/:id', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    return withTenant(tenant_id, async (trx) => {
      // Tokens are wiped, not kept: disconnecting means Pulse can no longer post as this account.
      const r = await trx.updateTable('pulse_social_accounts').set({ status: 'disconnected', access_token: '', refresh_token: null, updated_at: new Date() })
        .where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!r.numUpdatedRows) return reply.status(404).send({ error: 'Account not found' });
      return { success: true };
    });
  });

  fastify.get('/social/posts', async (request) => {
    const { tenant_id } = request.user;
    const q = request.query as { from?: string; to?: string };
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 31 * 86400_000);
    const to = q.to ? new Date(q.to) : new Date(Date.now() + 62 * 86400_000);
    return withTenant(tenant_id, async (trx) => {
      const posts = await trx.selectFrom('pulse_social_posts as p').leftJoin('users as u', 'u.id', 'p.created_by')
        .select(['p.id', 'p.status', 'p.body', 'p.link_url', 'p.image_url', 'p.scheduled_at', 'p.published_at', 'p.created_at', 'p.created_by', 'u.name as created_by_name', 'u.avatar_url as created_by_avatar'])
        .where('p.tenant_id', '=', tenant_id)
        .where((eb) => eb.or([eb('p.status', '=', 'draft'), eb.and([eb(eb.fn.coalesce('p.published_at', 'p.scheduled_at', 'p.created_at'), '>=', from), eb(eb.fn.coalesce('p.published_at', 'p.scheduled_at', 'p.created_at'), '<=', to)])]))
        .orderBy(eb => eb.fn.coalesce('p.published_at', 'p.scheduled_at', 'p.created_at'), 'desc').limit(300).execute();
      const targets = posts.length ? await trx.selectFrom('pulse_social_post_targets as t').innerJoin('pulse_social_accounts as a', 'a.id', 't.account_id')
        .select(['t.post_id', 't.account_id', 't.body_override', 't.status', 't.external_url', 't.error', 't.metrics', 'a.network', 'a.name', 'a.avatar_url'])
        .where('t.tenant_id', '=', tenant_id).where('t.post_id', 'in', posts.map((p) => p.id)).execute() : [];
      return { data: posts.map((p) => ({ ...p, targets: targets.filter((t) => t.post_id === p.id) })) };
    });
  });

  async function savePost(tenant_id: string, sub: string, id: string | null, d: z.infer<typeof postBody>) {
    return withTenant(tenant_id, async (trx) => {
      const accounts = d.account_ids.length ? await trx.selectFrom('pulse_social_accounts').select(['id']).where('tenant_id', '=', tenant_id)
        .where('id', 'in', d.account_ids).where('status', '<>', 'disconnected').execute() : [];
      if (accounts.length !== d.account_ids.length) throw Object.assign(new Error('One of the chosen accounts is no longer connected'), { statusCode: 400 });
      const fields = { body: d.body, link_url: d.link_url || null, image_url: d.image_url || null, updated_by: sub, updated_at: new Date() };
      let postId = id;
      if (postId) {
        const r = await trx.updateTable('pulse_social_posts').set(fields).where('tenant_id', '=', tenant_id).where('id', '=', postId).where('status', 'in', ['draft', 'scheduled', 'failed']).executeTakeFirst();
        if (!r.numUpdatedRows) throw Object.assign(new Error('Only drafts, scheduled or failed posts can be edited'), { statusCode: 409 });
        await trx.deleteFrom('pulse_social_post_targets').where('tenant_id', '=', tenant_id).where('post_id', '=', postId).where('status', '<>', 'published').execute();
      } else {
        postId = (await trx.insertInto('pulse_social_posts').values({ tenant_id, ...fields, created_by: sub }).returning('id').executeTakeFirstOrThrow()).id;
      }
      for (const aid of d.account_ids) {
        await trx.insertInto('pulse_social_post_targets').values({ tenant_id, post_id: postId!, account_id: aid, body_override: d.overrides?.[aid] ?? null })
          .onConflict((oc) => oc.columns(['post_id', 'account_id']).doNothing()).execute();
      }
      return trx.selectFrom('pulse_social_posts').selectAll().where('id', '=', postId!).executeTakeFirstOrThrow();
    });
  }

  fastify.post('/social/posts', async (request, reply) => {
    const parsed = postBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid post' });
    try { return reply.status(201).send({ data: await savePost(request.user.tenant_id, request.user.sub, null, parsed.data) }); }
    catch (e: any) { return reply.status(e.statusCode ?? 500).send({ error: e.message }); }
  });

  fastify.patch('/social/posts/:id', async (request, reply) => {
    const parsed = postBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid post' });
    try { return { data: await savePost(request.user.tenant_id, request.user.sub, (request.params as any).id, parsed.data) }; }
    catch (e: any) { return reply.status(e.statusCode ?? 500).send({ error: e.message }); }
  });

  fastify.post('/social/posts/:id/schedule', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    const b = z.object({ scheduled_at: z.string().datetime().nullish() }).safeParse(request.body ?? {});
    if (!b.success) return reply.status(400).send({ error: 'Pick a valid time' });
    const when = b.data.scheduled_at ? new Date(b.data.scheduled_at) : new Date();
    const res = await withTenant(tenant_id, async (trx) => {
      const p = await trx.selectFrom('pulse_social_posts').selectAll().where('tenant_id', '=', tenant_id).where('id', '=', id).executeTakeFirst();
      if (!p) return { status: 404, error: 'Post not found' };
      if (!['draft', 'failed', 'partly_published'].includes(p.status)) return { status: 409, error: 'This post is already scheduled or published' };
      const targets = await trx.selectFrom('pulse_social_post_targets as t').innerJoin('pulse_social_accounts as a', 'a.id', 't.account_id')
        .select(['t.id', 't.body_override', 't.status', 'a.network', 'a.name', 'a.status as account_status']).where('t.tenant_id', '=', tenant_id).where('t.post_id', '=', id).execute();
      const pending = targets.filter((t) => t.status !== 'published');
      if (!pending.length) return { status: 400, error: 'Choose at least one account to post to' };
      const problems = pending.map((t) => { const pr = t.account_status !== 'connected' ? 'reconnect this account first' : targetProblem(t.network, t.body_override ?? p.body, p.image_url); return pr ? `${t.name}: ${pr}` : null; }).filter(Boolean);
      if (problems.length) return { status: 400, error: problems.join('. ') };
      await trx.updateTable('pulse_social_post_targets').set({ status: 'pending', error: null }).where('tenant_id', '=', tenant_id).where('post_id', '=', id).where('status', '=', 'failed').execute();
      const row = await trx.updateTable('pulse_social_posts').set({ status: 'scheduled', scheduled_at: when, updated_by: sub, updated_at: new Date() })
        .where('tenant_id', '=', tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      return { status: 200, row };
    });
    if (res.status !== 200) return reply.status(res.status).send({ error: res.error });
    // "Post now" goes straight out rather than waiting for the next minute.
    if (when.getTime() <= Date.now() + 1000) { await publishPost(tenant_id, id); }
    const row = await withTenant(tenant_id, (trx) => trx.selectFrom('pulse_social_posts').selectAll().where('id', '=', id).executeTakeFirst());
    return { data: row };
  });

  fastify.post('/social/posts/:id/cancel', { preHandler: requireRole(...PULSE_PUBLISH_ROLES) }, async (request, reply) => {
    const { tenant_id, sub } = request.user;
    const { id } = request.params as { id: string };
    const row = await withTenant(tenant_id, (trx) => trx.updateTable('pulse_social_posts').set({ status: 'draft', scheduled_at: null, updated_by: sub, updated_at: new Date() })
      .where('tenant_id', '=', tenant_id).where('id', '=', id).where('status', '=', 'scheduled').returningAll().executeTakeFirst());
    if (!row) return reply.status(409).send({ error: 'Only a scheduled post can be unscheduled' });
    return { data: row };
  });

  fastify.delete('/social/posts/:id', async (request, reply) => {
    const { tenant_id } = request.user;
    const { id } = request.params as { id: string };
    const r = await withTenant(tenant_id, (trx) => trx.deleteFrom('pulse_social_posts').where('tenant_id', '=', tenant_id).where('id', '=', id)
      .where('status', 'in', ['draft', 'cancelled', 'failed']).executeTakeFirst());
    if (!r.numDeletedRows) return reply.status(409).send({ error: 'Published or scheduled posts can’t be deleted here' });
    return { success: true };
  });
}
