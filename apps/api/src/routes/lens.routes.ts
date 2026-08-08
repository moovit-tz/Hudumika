import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

/**
 * Lens — the internal developer record.
 *
 * Platform data, not tenant data. Every other route file in here filters by
 * `tenant_id` because CLAUDE.md requires it; these do not, deliberately. A bug
 * in FinOps is a fact about the software, not about one customer's workspace,
 * so access is by role instead. See migration 191 for the full reasoning — and
 * do not "fix" this by adding a tenant filter.
 *
 * Because it is platform-scoped it uses `db` directly rather than
 * `withTenant()`, which exists to bind RLS to a tenant that these rows have no
 * concept of.
 */

type Kind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK';
type Status = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX';
type Severity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
type Confidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';

const KINDS: Kind[] = ['BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK'];
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

export async function lensRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  // GET /v1/lens/areas
  fastify.get('/areas', async () =>
    db.selectFrom('lens_areas').selectAll().orderBy('sort_order', 'asc').execute());

  // GET /v1/lens/items?status=&kind=&area=&confidence=&q=
  fastify.get('/items', async (request) => {
    const { status, kind, area, confidence, q, include_closed } = request.query as Record<string, string>;

    let query = db.selectFrom('lens_items as i')
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
    const rows = await db.selectFrom('lens_items')
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
    const item = await db.selectFrom('lens_items').selectAll()
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });
    const events = await db.selectFrom('lens_events').selectAll()
      .where('item_id', '=', item.id).orderBy('created_at', 'desc').execute();
    return { ...item, events };
  });

  // POST /v1/lens/items
  fastify.post('/items', async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    const err = validate(body, false);
    if (err) return reply.status(400).send({ error: err });

    const next = await db.selectNoFrom(
      eb => eb.fn<number>('nextval', [eb.val('lens_item_ref_seq')]).as('n')).executeTakeFirstOrThrow();

    const item = await db.insertInto('lens_items').values({
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
      refs: asJson(body.refs, []) as any,
      tags: asJson(body.tags, []) as any,
      created_by: user.sub ?? null,
      resolution: body.resolution ?? null,
      resolved_at: CLOSED.includes(body.status) ? new Date() : null,
    }).returningAll().executeTakeFirstOrThrow();

    await db.insertInto('lens_events').values({
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

    const existing = await db.selectFrom('lens_items').selectAll()
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!existing) return reply.status(404).send({ error: 'Item not found' });

    // Validate the resulting row, not the patch — closing an item in the same
    // request that supplies no resolution has to fail.
    const merged = { ...existing, ...body };
    const err = validate(merged, false);
    if (err) return reply.status(400).send({ error: err });

    const updates: any = { updated_at: new Date() };
    for (const f of ['kind', 'title', 'body', 'area_id', 'status', 'severity',
                     'confidence', 'evidence', 'waiting_on', 'resolution']) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.refs !== undefined) updates.refs = asJson(body.refs, []);
    if (body.tags !== undefined) updates.tags = asJson(body.tags, []);
    if (body.status !== undefined) {
      updates.resolved_at = CLOSED.includes(body.status) ? (existing.resolved_at ?? new Date()) : null;
    }

    const item = await db.updateTable('lens_items').set(updates)
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
      await db.insertInto('lens_events').values({
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

    const item = await db.selectFrom('lens_items').select('id')
      .where('ref', '=', ref.toUpperCase()).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Item not found' });

    const ev = await db.insertInto('lens_events').values({
      item_id: item.id, kind: 'note', detail: String(note).trim(),
      actor_id: user.sub ?? null, actor_name: user.name ?? user.email ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    return reply.status(201).send(ev);
  });

  // There is no DELETE. An item that turned out to be wrong is closed as
  // WONTFIX with a resolution saying so — that is information. Deleting it
  // leaves the next person to rediscover the same non-problem.
}
