import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import {
  PROVIDERS, type Provider, listIntegrations, testConnection,
  createExternalIssue, notifySlack, latestBuild,
} from '../services/lens-integration.service.js';
import { preflight } from '../services/lens-preflight.service.js';

/**
 * Lens — the internal developer record.
 *
 * Platform data, not tenant data. Every other route file in here filters by
 * `tenant_id` because CLAUDE.md requires it; these do not, deliberately. A bug
 * in FinOps is a fact about the software, not about one customer's workspace,
 * so access is by role instead. See migration 191 for the full reasoning — and
 * do not "fix" this by adding a tenant filter.
 *
 * Because it is platform-scoped it uses `dbPlatform` (the narrow, audited
 * BYPASSRLS connection — see db/migrations/241_rls_restricted_roles.sql)
 * rather than `withTenant()`, which exists to bind RLS to a tenant that these
 * rows have no concept of.
 */

type Kind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK' | 'EPIC';
type Status = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX';
type Severity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
type Confidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';

const KINDS: Kind[] = ['BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK', 'EPIC'];
const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'WONTFIX'];
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
const CONFIDENCES: Confidence[] = ['CONFIRMED', 'SUSPECTED', 'UNVERIFIED'];
const CLOSED: Status[] = ['DONE', 'WONTFIX'];

function validate(body: any, partial: boolean): string | null {
  if ((!partial || body.kind !== undefined) && !KINDS.includes(body.kind)) {
    return `kind must be one of ${KINDS.join(', ')}`;
  }
  if ((!partial || body.title !== undefined) && !String(body.title ?? '').trim()) {
    return 'title is required';
  }
  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    return `status must be one of ${STATUSES.join(', ')}`;
  }
  if (body.severity !== undefined && !SEVERITIES.includes(body.severity)) {
    return `severity must be one of ${SEVERITIES.join(', ')}`;
  }
  if (body.confidence !== undefined && !CONFIDENCES.includes(body.confidence)) {
    return `confidence must be one of ${CONFIDENCES.join(', ')}`;
  }
  // The same rule the DB enforces, with a message someone can act on: an item
  // closed without saying how is the one you find a year later and cannot use.
  if (CLOSED.includes(body.status) && !String(body.resolution ?? '').trim()) {
    return 'A resolution is required to close an item — how was it settled?';
  }
  return null;
}

const asJson = (v: unknown, fallback: unknown[]) =>
  JSON.stringify(Array.isArray(v) ? v : fallback);

// Real values — migration 194_lens_planning.sql's CHECK constraint.
const LENS_CYCLE_STATUSES = ['PLANNING', 'ACTIVE', 'CLOSED'] as const;
const cycleCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: z.enum(LENS_CYCLE_STATUSES).optional(),
});
const cyclePatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: z.enum(LENS_CYCLE_STATUSES).optional(),
});

export async function lensRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  // GET /v1/lens/areas
  fastify.get('/areas', async () =>
    dbPlatform.selectFrom('lens_areas').selectAll().orderBy('sort_order', 'asc').execute());

  // GET /v1/lens/items?status=&kind=&area=&confidence=&q=
  fastify.get('/items', async (request) => {
    const { status, kind, area, confidence, q, include_closed } = request.query as Record<string, string>;

    let query = dbPlatform.selectFrom('lens_items as i')
      .leftJoin('lens_areas as a', 'a.id', 'i.area_id')
      .select([
        'i.id', 'i.ref', 'i.kind', 'i.title', 'i.body', 'i.area_id', 'i.status',
        'i.severity', 'i.confidence', 'i.evidence', 'i.waiting_on', 'i.refs',
        'i.tags', 'i.resolution', 'i.resolved_at', 'i.created_at', 'i.updated_at',
        'a.name as area_name',
      ]);

    // Query strings are unvalidated input; anything outside the allowed set is
    // ignored rather than passed through to the database.
    if (STATUSES.includes(status as Status)) query = query.where('i.status', '=', status as Status);
    if (KINDS.includes(kind as Kind)) query = query.where('i.kind', '=', kind as Kind);
    if (area) query = query.where('i.area_id', '=', area);
    if (CONFIDENCES.includes(confidence as Confidence)) {
      query = query.where('i.confidence', '=', confidence as Confidence);
    }
    // Closed items are hidden by default — a board that shows everything ever
    // finished stops being a board.
    if (!status && include_closed !== '1') query = query.where('i.status', 'not in', CLOSED);

    let rows = await query.orderBy('i.created_at', 'desc').execute();

    if (q) {
      const s = q.toLowerCase();
      rows = rows.filter(r =>
        r.title.toLowerCase().includes(s) ||
        (r.body ?? '').toLowerCase().includes(s) ||
        (r.evidence ?? '').toLowerCase().includes(s) ||
        r.ref.toLowerCase().includes(s));
    }
    return rows;
  });

  // GET /v1/lens/stats — what the board is actually made of.
  fastify.get('/stats', async () => {
    const rows = await dbPlatform.selectFrom('lens_items')
      .select(['status', 'kind', 'severity', 'confidence']).execute();
    const open = rows.filter(r => !CLOSED.includes(r.status));
    const count = (k: 'status' | 'kind' | 'severity' | 'confidence') =>
      open.reduce<Record<string, number>>((m, r) => {
        const v = String(r[k]);
        m[v] = (m[v] ?? 0) + 1;
        return m;
      }, {});
    return {
      total: rows.length,
      open: open.length,
      by_status: count('status'),
      by_kind: count('kind'),
      by_severity: count('severity'),
      by_confidence: count('confidence'),
      // The number worth watching: open items nobody has actually reproduced.
      unproven: open.filter(r => r.confidence !== 'CONFIRMED').length,
    };
  });

  // GET /v1/lens/items/:ref
  fastify.get('/items/:ref', async (request, reply) => {
    const { ref } = request.params as { ref: string };
    const item = await dbPlatform.selectFrom('lens_items').selectAll()
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });
    const events = await dbPlatform.selectFrom('lens_events').selectAll()
      .where('item_id', '=', item.id).orderBy('created_at', 'desc').execute();
    return { ...item, events };
  });

  // POST /v1/lens/items
  fastify.post('/items', async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    const err = validate(body, false);
    if (err) return reply.status(400).send({ error: err });

    const next = await dbPlatform.selectNoFrom(
      eb => eb.fn<number>('nextval', [eb.val('lens_item_ref_seq')]).as('n')).executeTakeFirstOrThrow();

    const item = await dbPlatform.insertInto('lens_items').values({
      ref: `LENS-${next.n}`,
      kind: body.kind,
      title: String(body.title).trim(),
      body: body.body ?? null,
      area_id: body.area_id ?? null,
      status: body.status ?? 'OPEN',
      severity: body.severity ?? 'NORMAL',
      // Defaults to SUSPECTED, not CONFIRMED. Something is a reading of the code
      // until somebody has run it, and starting from the confident end is how
      // unverified findings get treated as facts.
      confidence: body.confidence ?? 'SUSPECTED',
      evidence: body.evidence ?? null,
      waiting_on: body.waiting_on ?? null,
      parent_id: body.parent_id ?? null,
      cycle_id: body.cycle_id ?? null,
      refs: asJson(body.refs, []) as any,
      tags: asJson(body.tags, []) as any,
      created_by: user.sub ?? null,
      resolution: body.resolution ?? null,
      resolved_at: CLOSED.includes(body.status) ? new Date() : null,
    }).returningAll().executeTakeFirstOrThrow();

    await dbPlatform.insertInto('lens_events').values({
      item_id: item.id, kind: 'created',
      detail: `${item.kind} opened at ${item.confidence.toLowerCase()} confidence`,
      actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
    }).execute();

    return reply.status(201).send(item);
  });

  // PATCH /v1/lens/items/:ref
  fastify.patch('/items/:ref', async (request, reply) => {
    const user = request.user;
    const { ref } = request.params as { ref: string };
    const body = request.body as any;

    const existing = await dbPlatform.selectFrom('lens_items').selectAll()
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!existing) return reply.status(404).send({ error: 'Item not found' });

    // Validate the resulting row, not the patch — closing an item in the same
    // request that supplies no resolution has to fail.
    const merged = { ...existing, ...body };
    const err = validate(merged, false);
    if (err) return reply.status(400).send({ error: err });

    const updates: any = { updated_at: new Date() };
    for (const f of ['kind', 'title', 'body', 'area_id', 'status', 'severity',
                     'confidence', 'evidence', 'waiting_on', 'resolution',
                     'parent_id', 'cycle_id']) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.refs !== undefined) updates.refs = asJson(body.refs, []);
    if (body.tags !== undefined) updates.tags = asJson(body.tags, []);
    if (body.status !== undefined) {
      updates.resolved_at = CLOSED.includes(body.status) ? (existing.resolved_at ?? new Date()) : null;
    }

    const item = await dbPlatform.updateTable('lens_items').set(updates)
      .where('ref', '=', ref.toUpperCase()).returningAll().executeTakeFirstOrThrow();

    // What changed, kept rather than overwritten — the trail is how you see
    // that something was believed, then disproved, then reopened.
    const changes: string[] = [];
    if (body.status !== undefined && body.status !== existing.status) {
      changes.push(`status ${existing.status} → ${body.status}`);
    }
    if (body.confidence !== undefined && body.confidence !== existing.confidence) {
      changes.push(`confidence ${existing.confidence} → ${body.confidence}`);
    }
    if (body.severity !== undefined && body.severity !== existing.severity) {
      changes.push(`severity ${existing.severity} → ${body.severity}`);
    }
    if (changes.length > 0) {
      await dbPlatform.insertInto('lens_events').values({
        item_id: item.id, kind: 'updated', detail: changes.join(', '),
        actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
      }).execute();
    }
    return item;
  });

  // POST /v1/lens/items/:ref/notes — an observation, kept forever.
  fastify.post('/items/:ref/notes', async (request, reply) => {
    const user = request.user;
    const { ref } = request.params as { ref: string };
    const { note } = (request.body ?? {}) as { note?: string };
    if (!String(note ?? '').trim()) return reply.status(400).send({ error: 'note is required' });

    const item = await dbPlatform.selectFrom('lens_items').select('id')
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });

    const ev = await dbPlatform.insertInto('lens_events').values({
      item_id: item.id, kind: 'note', detail: String(note).trim(),
      actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return reply.status(201).send(ev);
  });

  // -- Board ----------------------------------------------------------------

  // GET /v1/lens/board - columns with their items, for the kanban view.
  fastify.get('/board', async (request) => {
    const { area, kind } = request.query as Record<string, string>;

    const columns = await dbPlatform.selectFrom('lens_columns').selectAll()
      .orderBy('sort_order', 'asc').execute();

    let q = dbPlatform.selectFrom('lens_items as i')
      .leftJoin('lens_areas as a', 'a.id', 'i.area_id')
      .select(['i.id', 'i.ref', 'i.kind', 'i.title', 'i.status', 'i.severity',
               'i.confidence', 'i.waiting_on', 'i.area_id', 'a.name as area_name',
               'i.updated_at'])
      // WONTFIX has no column: it is closed, and a board showing abandoned work
      // beside live work stops meaning anything. It stays in the list view.
      .where('i.status', '!=', 'WONTFIX');
    if (area) q = q.where('i.area_id', '=', area);
    if (KINDS.includes(kind as Kind)) q = q.where('i.kind', '=', kind as Kind);
    const items = await q.orderBy('i.updated_at', 'desc').execute();

    const links = await dbPlatform.selectFrom('lens_links')
      .select(['item_id', 'provider', 'kind', 'external_id', 'url', 'external_status'])
      .execute();
    const byItem = new Map<string, typeof links>();
    for (const l of links) byItem.set(l.item_id, [...(byItem.get(l.item_id) ?? []), l]);

    return columns.map(c => {
      const inColumn = items.filter(i => i.status === c.status)
        .map(i => ({ ...i, links: byItem.get(i.id) ?? [] }));
      return {
        ...c,
        items: inColumn,
        count: inColumn.length,
        // Reported, never enforced - a WIP limit is a prompt to a person.
        over_wip: c.wip_limit != null && inColumn.length > c.wip_limit,
      };
    });
  });

  // -- Links ------------------------------------------------------------------

  // POST /v1/lens/items/:ref/links - attach something that already exists.
  // Needs no integration: pasting a URL is useful on its own.
  fastify.post('/items/:ref/links', async (request, reply) => {
    const user = request.user;
    const { ref } = request.params as { ref: string };
    const b = (request.body ?? {}) as any;
    if (!PROVIDERS.includes(b.provider)) {
      return reply.status(400).send({ error: `provider must be one of ${PROVIDERS.join(', ')}` });
    }
    if (!String(b.external_id ?? '').trim()) {
      return reply.status(400).send({ error: 'external_id is required' });
    }
    const item = await dbPlatform.selectFrom('lens_items').select('id')
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });

    const link = await dbPlatform.insertInto('lens_links').values({
      item_id: item.id,
      provider: b.provider,
      kind: b.kind || 'issue',
      external_id: String(b.external_id).trim(),
      url: b.url ?? null,
      title: b.title ?? null,
      external_status: b.external_status ?? null,
      synced_at: new Date(),
    }).onConflict(oc => oc.columns(['item_id', 'provider', 'external_id']).doNothing())
      .returningAll().executeTakeFirst();

    await dbPlatform.insertInto('lens_events').values({
      item_id: item.id, kind: 'linked',
      detail: `${b.provider} ${b.kind || 'issue'} ${b.external_id}`,
      actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
    }).execute();

    return reply.status(201).send(link ?? { note: 'That link already exists on this item.' });
  });

  // POST /v1/lens/items/:ref/push - open it in an external tracker.
  fastify.post('/items/:ref/push', async (request, reply) => {
    const user = request.user;
    const { ref } = request.params as { ref: string };
    const { provider } = (request.body ?? {}) as { provider?: string };
    if (!['github', 'jira', 'linear'].includes(String(provider))) {
      return reply.status(400).send({ error: 'provider must be github, jira or linear' });
    }
    const item = await dbPlatform.selectFrom('lens_items').selectAll()
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });

    const r = await createExternalIssue(provider as 'github' | 'jira' | 'linear', item);
    // The provider's own words, unedited. A paraphrased failure is a lost one.
    if (!r.ok) return reply.status(502).send({ error: r.detail, provider_status: r.status });

    await dbPlatform.insertInto('lens_links').values({
      item_id: item.id, provider: provider as any, kind: 'issue',
      external_id: r.external_id!, url: r.url ?? null,
      title: item.title, synced_at: new Date(),
    }).onConflict(oc => oc.columns(['item_id', 'provider', 'external_id']).doNothing()).execute();

    await dbPlatform.insertInto('lens_events').values({
      item_id: item.id, kind: 'pushed',
      detail: `Opened in ${provider} as ${r.external_id}`,
      actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
    }).execute();

    return { external_id: r.external_id, url: r.url };
  });

  // -- Integrations -----------------------------------------------------------

  // GET /v1/lens/integrations - never includes a credential.
  fastify.get('/integrations', async () => listIntegrations());

  // PUT /v1/lens/integrations/:provider
  fastify.put('/integrations/:provider', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!PROVIDERS.includes(provider as Provider)) {
      return reply.status(400).send({ error: 'Unknown provider' });
    }
    const b = (request.body ?? {}) as any;
    const values: any = { provider, config: JSON.stringify(b.config ?? {}), updated_at: new Date() };
    // An absent credential leaves the stored one alone, so saving a config
    // change does not silently wipe the token.
    if (typeof b.credential === 'string' && b.credential.trim()) values.credential = b.credential.trim();
    if (typeof b.webhook_secret === 'string') values.webhook_secret = b.webhook_secret.trim() || null;

    await dbPlatform.insertInto('lens_integrations').values({ ...values, status: 'disconnected' })
      .onConflict(oc => oc.column('provider').doUpdateSet(values)).execute();

    // Say immediately whether it works, rather than letting the first real use
    // be the thing that finds out.
    const test = await testConnection(provider as Provider);
    return { provider, tested: true, ok: test.ok, detail: test.detail, status: test.status };
  });

  // POST /v1/lens/integrations/:provider/preflight
  //
  // The check that matters. A token that authenticates is not a token that
  // works: the PAT with no repo scope, the Slack bot never invited to the
  // channel, the mistyped Jira project key all pass a plain auth test and fail
  // on first real use. This runs the checks in the order they can fail and
  // stops at the first, with a specific remedy.
  fastify.post('/integrations/:provider/preflight', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!PROVIDERS.includes(provider as Provider)) {
      return reply.status(400).send({ error: 'Unknown provider' });
    }
    return preflight(provider as Provider);
  });

  // POST /v1/lens/integrations/:provider/test
  fastify.post('/integrations/:provider/test', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!PROVIDERS.includes(provider as Provider)) {
      return reply.status(400).send({ error: 'Unknown provider' });
    }
    const r = await testConnection(provider as Provider);
    return { ok: r.ok, status: r.status, detail: r.detail };
  });

  // POST /v1/lens/items/:ref/notify - announce it in Slack.
  fastify.post('/items/:ref/notify', async (request, reply) => {
    const { ref } = request.params as { ref: string };
    const { event } = (request.body ?? {}) as { event?: string };
    const item = await dbPlatform.selectFrom('lens_items').selectAll()
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });
    const r = await notifySlack(item, event || 'updated');
    if (!r.ok) return reply.status(502).send({ error: r.detail, provider_status: r.status });
    return { ok: true };
  });

  // GET /v1/lens/ci - the latest build, for the board header.
  fastify.get('/ci', async () => {
    const r = await latestBuild();
    if (!r.ok) return { ok: false, detail: r.detail };
    const p = r.data?.items?.[0];
    return p ? {
      ok: true, number: p.number, state: p.state,
      created_at: p.created_at, vcs: p.vcs?.revision?.slice(0, 8) ?? null,
    } : { ok: true, empty: true };
  });

  // GET /v1/lens/cycles
  fastify.get('/cycles', async () => {
    const rows = await dbPlatform.selectFrom('lens_cycles').selectAll().orderBy('created_at', 'desc').execute();
    return rows;
  });

  // POST /v1/lens/cycles
  fastify.post('/cycles', async (request, reply) => {
    const user = request.user;
    const body = cycleCreateSchema.parse(request.body);
    const cycle = await dbPlatform.insertInto('lens_cycles').values({
      name: body.name,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      status: body.status ?? 'PLANNING',
      created_by: user.sub ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return reply.status(201).send(cycle);
  });

  // PATCH /v1/lens/cycles/:id
  fastify.patch('/cycles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = cyclePatchSchema.parse(request.body) as Record<string, unknown>;
    const updates: any = { updated_at: new Date() };
    for (const f of ['name', 'start_date', 'end_date', 'status']) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    
    if (Object.keys(updates).length === 1) return reply.send({ ok: true }); // only updated_at
    
    const cycle = await dbPlatform.updateTable('lens_cycles').set(updates)
      .where('id', '=', id).returningAll().executeTakeFirst();
    if (!cycle) return reply.status(404).send({ error: 'Cycle not found' });
    return reply.send(cycle);
  });

  // There is no DELETE. An item that turned out to be wrong is closed as
  // WONTFIX with a resolution saying so — that is information. Deleting it
  // leaves the next person to rediscover the same non-problem.
}
