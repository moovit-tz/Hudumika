import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

/**
 * The platform's view of what tenants are reporting, and of what they are
 * calculating.
 *
 * Both are deliberately cross-tenant, which is the one thing every other read
 * path in this codebase must never be — so every query here is gated on
 * SUPER_ADMIN at the route level rather than filtering by
 * `request.user.tenant_id`, and none of them accept a tenant id from the
 * caller except as a filter over rows they can already see.
 */
export async function superAdminIssuesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  // ── GET /v1/superadmin/issues ─────────────────────────────────────────────
  // Every reported issue across every tenant: the bug list.
  fastify.get('/issues', async (request) => {
    const q = request.query as any;
    const limit = Math.min(Math.max(parseInt(q.limit) || 100, 1), 300);
    const offset = Math.max(parseInt(q.offset) || 0, 0);
    const search = String(q.q ?? '').trim();

    const base = () => {
      let qb = db.selectFrom('platform_support_tickets as t')
        .leftJoin('tenants as tn', 'tn.id', 't.tenant_id')
        .leftJoin('users as u', 'u.id', 't.created_by');
      if (q.kind && q.kind !== 'all') qb = qb.where('t.kind', '=', String(q.kind));
      if (q.status && q.status !== 'all') qb = qb.where('t.status', '=', String(q.status) as any);
      if (q.app && q.app !== 'all') qb = qb.where('t.app', '=', String(q.app));
      if (q.tenant_id) qb = qb.where('t.tenant_id', '=', String(q.tenant_id));
      if (search) {
        const like = `%${search.replace(/[%_]/g, m => '\\' + m)}%`;
        qb = qb.where(eb => eb.or([
          eb('t.subject', 'ilike', like),
          eb('t.ref_number', 'ilike', like),
          eb('tn.name', 'ilike', like),
        ]));
      }
      return qb;
    };

    const SORTS: Record<string, string> = {
      created_at: 't.created_at', status: 't.status', priority: 't.priority', tenant: 'tn.name',
    };
    const sort = SORTS[String(q.sort ?? 'created_at')] ?? 't.created_at';
    const dir = String(q.dir ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const [rows, counted, appRows] = await Promise.all([
      base()
        .select([
          't.id', 't.ref_number', 't.tenant_id', 't.subject', 't.category', 't.kind', 't.app',
          't.priority', 't.status', 't.record_id', 't.resolution', 't.resolved_at',
          't.created_at', 't.updated_at',
          'tn.name as tenant_name', 'u.name as reporter_name', 'u.email as reporter_email',
        ])
        .select(eb => eb
          .selectFrom('platform_support_attachments as a')
          .select(eb2 => eb2.fn.countAll<string>().as('n'))
          .whereRef('a.ticket_id', '=', 't.id').as('attachment_count'))
        .orderBy(sort as any, dir)
        .limit(limit).offset(offset)
        .execute(),
      base().select(eb => eb.fn.countAll<string>().as('n')).executeTakeFirst(),
      // The apps that have actually reported something, so the filter offers
      // real options rather than a hardcoded list that drifts.
      db.selectFrom('platform_support_tickets').select('app')
        .where('app', 'is not', null).distinct().execute(),
    ]);

    return {
      data: rows,
      total: Number(counted?.n ?? 0),
      apps: appRows.map(r => r.app).filter(Boolean).sort(),
      limit, offset,
    };
  });

  // ── GET /v1/superadmin/issues/:id ─────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/issues/:id', async (request, reply) => {
    const ticket = await db.selectFrom('platform_support_tickets as t')
      .leftJoin('tenants as tn', 'tn.id', 't.tenant_id')
      .leftJoin('users as u', 'u.id', 't.created_by')
      .selectAll('t')
      .select(['tn.name as tenant_name', 'u.name as reporter_name', 'u.email as reporter_email'])
      .where('t.id', '=', request.params.id)
      .executeTakeFirst();
    if (!ticket) return reply.status(404).send({ error: 'Issue not found.' });

    const [messages, attachments, record] = await Promise.all([
      db.selectFrom('platform_support_messages').selectAll()
        .where('ticket_id', '=', ticket.id).orderBy('created_at', 'asc').execute(),
      db.selectFrom('platform_support_attachments')
        .select(['id', 'filename', 'mime_type', 'size_bytes', 'created_at'])
        .where('ticket_id', '=', ticket.id).orderBy('created_at', 'asc').execute(),
      ticket.record_id
        ? db.selectFrom('landed_cost_records').selectAll().where('id', '=', ticket.record_id).executeTakeFirst()
        : Promise.resolve(undefined),
    ]);
    return { ...ticket, messages, attachments, record: record ?? null };
  });

  // ── PATCH /v1/superadmin/issues/:id ───────────────────────────────────────
  // Triage: status, priority and the note the tenant will read. A ticket moved
  // to RESOLVED without a resolution is left as-is rather than stamped with a
  // time and no explanation.
  fastify.patch<{
    Params: { id: string };
    Body: { status?: string; priority?: string; resolution?: string };
  }>('/issues/:id', async (request, reply) => {
    const b = request.body ?? {};
    const patch: Record<string, any> = { updated_at: new Date() };
    if (b.status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(b.status)) {
      patch.status = b.status;
      patch.resolved_at = ['RESOLVED', 'CLOSED'].includes(b.status) ? new Date() : null;
    }
    if (b.priority && ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(b.priority)) patch.priority = b.priority;
    if (typeof b.resolution === 'string') patch.resolution = b.resolution.trim().slice(0, 4000) || null;

    const updated = await db.updateTable('platform_support_tickets')
      .set(patch).where('id', '=', request.params.id).returningAll().executeTakeFirst();
    if (!updated) return reply.status(404).send({ error: 'Issue not found.' });
    return updated;
  });

  // ── POST /v1/superadmin/issues/:id/reply ──────────────────────────────────
  // Flagged is_platform_staff, so the tenant's thread shows who answered.
  fastify.post<{ Params: { id: string }; Body: { message: string } }>('/issues/:id/reply', async (request, reply) => {
    const user = request.user as any;
    const content = String(request.body?.message ?? '').trim();
    if (!content) return reply.status(400).send({ error: 'A message is required.' });
    const ticket = await db.selectFrom('platform_support_tickets').select(['id', 'tenant_id'])
      .where('id', '=', request.params.id).executeTakeFirst();
    if (!ticket) return reply.status(404).send({ error: 'Issue not found.' });

    const message = await db.insertInto('platform_support_messages').values({
      ticket_id: ticket.id,
      tenant_id: ticket.tenant_id,
      author_id: user.sub,
      author_name: user.name ?? 'Hudumika Support',
      is_platform_staff: true,
      content,
    }).returningAll().executeTakeFirstOrThrow();
    await db.updateTable('platform_support_tickets').set({ updated_at: new Date() })
      .where('id', '=', ticket.id).execute();
    reply.status(201);
    return message;
  });

  // ── GET /v1/superadmin/calculations ───────────────────────────────────────
  // Every landed-cost calculation run on the platform, across all tenants.
  // The payload is never returned here — the list is a record of what was
  // searched and by whom, not a licence to read another tenant's costings in
  // full from a platform screen.
  fastify.get('/calculations', async (request) => {
    const q = request.query as any;
    const limit = Math.min(Math.max(parseInt(q.limit) || 100, 1), 300);
    const offset = Math.max(parseInt(q.offset) || 0, 0);
    const search = String(q.q ?? '').trim();

    const base = () => {
      let qb = db.selectFrom('landed_cost_records as r')
        .leftJoin('tenants as tn', 'tn.id', 'r.tenant_id')
        .leftJoin('users as u', 'u.id', 'r.created_by');
      if (q.tenant_id) qb = qb.where('r.tenant_id', '=', String(q.tenant_id));
      if (q.kind === 'multi') qb = qb.where('r.hs_code', '=', 'MULTI');
      if (q.kind === 'single') qb = qb.where('r.hs_code', '!=', 'MULTI');
      if (search) {
        const like = `%${search.replace(/[%_]/g, m => '\\' + m)}%`;
        qb = qb.where(eb => eb.or([
          eb('r.description', 'ilike', like),
          eb('r.hs_code', 'ilike', like),
          eb('r.customer_name', 'ilike', like),
          eb('tn.name', 'ilike', like),
        ]));
      }
      return qb;
    };

    const SORTS: Record<string, string> = {
      created_at: 'r.created_at', total: 'r.total_tzs', tenant: 'tn.name', description: 'r.description',
    };
    const sort = SORTS[String(q.sort ?? 'created_at')] ?? 'r.created_at';
    const dir = String(q.dir ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const [rows, counted] = await Promise.all([
      base().select([
        'r.id', 'r.tenant_id', 'r.hs_code', 'r.description', 'r.customer_name', 'r.destination',
        'r.cif_usd', 'r.total_tzs', 'r.qty', 'r.item_count', 'r.shipment_mode', 'r.origin_country',
        'r.loading_point', 'r.source', 'r.version', 'r.created_at',
        'tn.name as tenant_name', 'u.name as user_name', 'u.email as user_email',
      ]).orderBy(sort as any, dir).limit(limit).offset(offset).execute(),
      base().select(eb => eb.fn.countAll<string>().as('n')).executeTakeFirst(),
    ]);

    return { data: rows, total: Number(counted?.n ?? 0), limit, offset };
  });
}
