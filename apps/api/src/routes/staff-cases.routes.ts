/**
 * Staff console — cases, incidents and controlled customer access.
 *
 * Cases are platform_support_tickets (the queue workspaces already file to
 * Hudumika). Three records are kept apart on purpose:
 *  - the case: customer communication and the customer outcome;
 *  - the Lens item: engineering investigation and fix (linked via lens_links,
 *    provider 'hudumika_issue' — the same link SuperAdmin's "Send to Lens" makes);
 *  - the Lens release: deployment and verification.
 * A done Lens item never resolves or closes a case, and a resolved case
 * still needs an operator to confirm the customer outcome.
 *
 * Access sessions: an operator who needs a customer's workspace records opens
 * an explicit session (customer, product, actions, purpose, expiry, basis).
 * Every record read or change through it is checked against the live session
 * AND the operator's current grants, and is logged. The operator's own
 * identity is used throughout — nothing here mints a customer token.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { ALL_APP_IDS, type StaffAccessSessionView } from '@hudumika/types';
import { dbPlatform, withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import {
  StaffAccessError, assertCan, can, canCase, canCustomer, canProduct, caseScopeSql, loadStaffContext, productsInScope,
  requireStaffMember, staffAudit, staffErrorReply, type StaffContext,
} from '../services/staff-access.service.js';
import { assignmentHistory, caseEvent, claimCase, routeCase, slaState } from '../services/staff-cases.service.js';

const uuid = z.string().uuid();
const APP_IDS = new Set<string>(ALL_APP_IDS.filter(a => a !== 'lens'));
const appId = z.string().refine(a => APP_IDS.has(a), 'Unknown product');
const OPEN = ['OPEN', 'IN_PROGRESS'] as const;
const S = (r: FastifyRequest) => r.staff as StaffContext;
function h<T extends FastifyRequest>(fn: (req: T, reply: any) => Promise<unknown>) {
  return async (req: T, reply: any) => { try { return await fn(req, reply); } catch (e) { return staffErrorReply(reply, e); } };
}

/** Sensitive actions require the actor to have two-factor sign-in, unless explicitly turned off for development. */
async function assertStepUp(ctx: StaffContext, what: string) {
  const required = (process.env.STAFF_SENSITIVE_REQUIRES_MFA ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true';
  if (!required) return;
  const t = await dbPlatform.selectFrom('user_totp').select('id').where('user_id', '=', ctx.userId).where('enabled', '=', true).executeTakeFirst();
  if (!t) throw new StaffAccessError(403, `${what} needs two-factor sign-in on your account. Turn it on under Profile ▸ Security.`, 'step_up_required');
}

async function loadCase(ctx: StaffContext, id: string) {
  const t = await dbPlatform.selectFrom('platform_support_tickets').selectAll().where('id', '=', id).executeTakeFirst();
  // Out of scope looks exactly like missing.
  if (!t || !canCase(ctx, t)) throw new StaffAccessError(404, 'Case not found.');
  return t;
}

// ── Access sessions ───────────────────────────────────────────────────────
function viewSession(s: any, tenantName: string): StaffAccessSessionView {
  return { id: s.id, tenantId: s.tenant_id, tenantName, appId: s.app_id, actions: s.actions, purpose: s.purpose, caseId: s.case_id, basis: s.basis, status: s.status,
    startsAt: s.starts_at ? new Date(s.starts_at).toISOString() : null, expiresAt: new Date(s.expires_at).toISOString() };
}

/** Marks past-expiry sessions expired, then returns the caller's live session (pending or active), if any. */
export async function currentAccessSession(ctx: StaffContext): Promise<StaffAccessSessionView | null> {
  await dbPlatform.updateTable('staff_access_sessions').set({ status: 'expired', ended_at: new Date(), end_reason: 'Expired' })
    .where('staff_user_id', '=', ctx.userId).where('status', 'in', ['active', 'pending_approval']).where('expires_at', '<=', new Date()).execute();
  const s = await dbPlatform.selectFrom('staff_access_sessions as s').innerJoin('tenants as t', 't.id', 's.tenant_id').selectAll('s').select('t.name as tenant_name')
    .where('s.staff_user_id', '=', ctx.userId).where('s.status', 'in', ['active', 'pending_approval']).executeTakeFirst();
  if (!s) return null;
  // Assignment removed since the session began → it ends now.
  if (!can(ctx, 'access.request') || !canCustomer(ctx, s.tenant_id) || (s.app_id && !canProduct(ctx, s.app_id))) {
    await dbPlatform.updateTable('staff_access_sessions').set({ status: 'revoked', ended_at: new Date(), end_reason: 'Staff access or assignment removed' }).where('id', '=', s.id).execute();
    await staffAudit(ctx, { action: 'access.session_auto_revoked', targetType: 'access_session', targetId: s.id, tenantId: s.tenant_id, outcome: 'ok' });
    return null;
  }
  return viewSession(s, (s as any).tenant_name);
}

/**
 * The single gate for reading or changing a customer's workspace records:
 * live, active, unexpired session owned by the caller, for this customer, with
 * this action and (if set) this product — re-checked against current grants.
 * Every attempt is logged on the session, allowed or not.
 */
async function useSession(ctx: StaffContext, sessionId: string, action: 'read' | 'configure', resource: string, app: string | null) {
  const live = await currentAccessSession(ctx);
  const deny = async (why: string) => {
    if (live) await dbPlatform.insertInto('staff_access_session_events').values({ session_id: live.id, action, resource, outcome: 'denied', detail: JSON.stringify({ why }) as any }).execute();
    await staffAudit(ctx, { action: `access.${action}`, targetType: 'access_session', targetId: sessionId, tenantId: live?.tenantId ?? null, appId: app, outcome: 'denied', detail: { resource, why } });
    throw new StaffAccessError(403, why, 'access_session');
  };
  if (!live || live.id !== sessionId) return deny('No active access session. Open one first.');
  if (live.status !== 'active') return deny('This access session is waiting for approval.');
  if (!live.actions.includes(action)) return deny(`This session does not allow “${action}”.`);
  if (live.appId && app && live.appId !== app) return deny(`This session is limited to ${live.appId}.`);
  await dbPlatform.insertInto('staff_access_session_events').values({ session_id: live.id, action, resource, outcome: 'ok', detail: JSON.stringify({ app }) as any }).execute();
  return live;
}

export async function staffCaseRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireStaffMember);

  // ── Case queues ─────────────────────────────────────────────────────────
  const caseQuery = (ctx: StaffContext, q: Record<string, string | undefined>) => {
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    let sel = dbPlatform.selectFrom('platform_support_tickets as t').innerJoin('tenants as c', 'c.id', 't.tenant_id')
      .leftJoin('users as o', 'o.id', 't.owner_user_id').leftJoin('staff_teams as st', 'st.id', 't.team_id')
      .select(['t.id', 't.ref_number', 't.subject', 't.tenant_id', 'c.name as customer_name', 'c.logo_url as customer_logo_url', 't.app', 't.category', 't.kind', 't.status', 't.priority', 't.severity', 't.escalated',
        't.owner_user_id', 'o.name as owner_name', 'o.avatar_url as owner_avatar_url', 't.team_id', 'st.name as team_name', 't.first_response_due_at', 't.first_response_at', 't.resolution_due_at',
        't.sla_paused_at', 't.waiting_on', 't.customer_outcome', 't.resolved_at', 't.due_at', 't.version', 't.created_at', 't.updated_at', 't.incident_id'])
      .where(caseScopeSql(ctx, 't.tenant_id', 't.app'));
    const queue = q.queue ?? 'all';
    const open = (s: typeof sel) => s.where('t.status', 'in', [...OPEN]);
    if (queue === 'open') sel = open(sel);
    else if (queue === 'mine') sel = open(sel).where('t.owner_user_id', '=', ctx.userId);
    else if (queue === 'team') { const ids = ctx.teams.map(t => t.id); sel = ids.length ? open(sel).where('t.team_id', 'in', ids) : sel.where(sql<boolean>`false`); }
    else if (queue === 'unassigned') sel = open(sel).where('t.owner_user_id', 'is', null);
    else if (queue === 'onboarding') sel = open(sel).where('t.category', '=', 'onboarding');
    else if (queue === 'escalated') sel = open(sel).where('t.escalated', '=', true);
    else if (queue === 'overdue') sel = open(sel).where('t.sla_paused_at', 'is', null).where(sql<boolean>`((t.first_response_at IS NULL AND t.first_response_due_at < now()) OR t.resolution_due_at < now())`);
    else if (queue === 'awaiting_outcome') sel = sel.where('t.status', 'in', ['RESOLVED', 'CLOSED']).where('t.customer_outcome', '=', 'pending');
    else if (queue === 'incidents') sel = open(sel).where('t.incident_id', 'is not', null);
    if (q.team_id && uuid.safeParse(q.team_id).success) sel = sel.where('t.team_id', '=', q.team_id);
    if (q.app && APP_IDS.has(q.app)) sel = sel.where('t.app', '=', q.app);
    if (q.kind === 'bug' || q.kind === 'general') sel = sel.where('t.kind', '=', q.kind);
    if (q.tenant_id && uuid.safeParse(q.tenant_id).success) sel = sel.where('t.tenant_id', '=', q.tenant_id);
    if (q.status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(q.status)) sel = sel.where('t.status', '=', q.status as any);
    if (q.q?.trim()) { const like = `%${q.q.trim().replace(/[\\%_]/g, '\\$&')}%`; sel = sel.where(eb => eb.or([eb('t.subject', 'ilike', like), eb('t.ref_number', 'ilike', like), eb('c.name', 'ilike', like)])); }
    return { sel: sel.orderBy('t.escalated', 'desc').orderBy(sql`CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END`).orderBy('t.created_at'), limit };
  };

  fastify.get('/cases', h(async req => {
    const ctx = S(req);
    const q = req.query as Record<string, string>;
    if ((q.queue ?? 'all') === 'mine') assertCan(ctx, 'work.own', 'cases.view'); else assertCan(ctx, 'cases.view');
    const { sel, limit } = caseQuery(ctx, q);
    const rows = await sel.limit(limit + 1).execute();
    return { items: rows.slice(0, limit).map(r => ({ ...r, sla: slaState(r as any) })), hasMore: rows.length > limit };
  }));

  fastify.get('/cases/export', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'cases.export');
    const { sel } = caseQuery(ctx, req.query as any);
    const rows = await sel.limit(5000).execute();
    await staffAudit(ctx, { action: 'cases.export', targetType: 'case_list', detail: { rows: rows.length, filters: req.query as any } });
    const esc = (v: unknown) => `"${String(v instanceof Date ? v.toISOString() : v ?? '').replace(/"/g, '""')}"`;
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="cases.csv"');
    return ['ref,customer,product,status,priority,severity,owner,team,created_at,first_response_due_at,first_response_at,resolution_due_at,customer_outcome',
      ...rows.map(r => [r.ref_number, r.customer_name, r.app, r.status, r.priority, r.severity, r.owner_name, r.team_name, r.created_at, r.first_response_due_at, r.first_response_at, r.resolution_due_at, r.customer_outcome].map(esc).join(','))].join('\n');
  }));

  fastify.get('/cases/:id', h(async req => {
    const ctx = S(req); assertCan(ctx, 'cases.view', 'work.own');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    if (!can(ctx, 'cases.view') && t.owner_user_id !== ctx.userId) throw new StaffAccessError(404, 'Case not found.');
    const [customer, owner, team, messages, events, history, lens, incident, attachments, record] = await Promise.all([
      dbPlatform.selectFrom('tenants').select(['id', 'name', 'logo_url', 'plan']).where('id', '=', t.tenant_id).executeTakeFirst(),
      t.owner_user_id ? dbPlatform.selectFrom('users').select(['id', 'name', 'avatar_url']).where('id', '=', t.owner_user_id).executeTakeFirst() : null,
      t.team_id ? dbPlatform.selectFrom('staff_teams').select(['id', 'name']).where('id', '=', t.team_id).executeTakeFirst() : null,
      dbPlatform.selectFrom('platform_support_messages as m').leftJoin('users as u', 'u.id', 'm.author_id')
        .select(['m.id', 'm.author_id', 'm.author_name', 'u.avatar_url as author_avatar_url', 'm.is_platform_staff', 'm.content', 'm.visibility', 'm.created_at'])
        .where('m.ticket_id', '=', t.id)
        // Internal notes need their own permission; customer-visible replies are always shown.
        .$if(!can(ctx, 'cases.internal_notes'), q => q.where('m.visibility', '=', 'customer'))
        .orderBy('m.created_at').limit(500).execute(),
      dbPlatform.selectFrom('platform_case_events as e').leftJoin('users as u', 'u.id', 'e.actor_user_id').select(['e.id', 'e.event', 'e.detail', 'e.created_at', 'u.name as actor_name']).where('e.ticket_id', '=', t.id).orderBy('e.created_at').limit(500).execute(),
      dbPlatform.selectFrom('staff_assignment_history').selectAll().where('subject_type', '=', 'case').where('subject_id', '=', t.id).orderBy('created_at').limit(200).execute(),
      can(ctx, 'lens.view') ? dbPlatform.selectFrom('lens_links as l').innerJoin('lens_items as i', 'i.id', 'l.item_id')
        .select(['i.id', 'i.ref', 'i.title', 'i.kind', 'i.status', 'i.severity', 'i.verification_status', 'i.release_id', 'i.assignee_name'])
        .where('l.provider', '=', 'hudumika_issue').where('l.external_id', '=', t.id).execute() : null,
      t.incident_id ? dbPlatform.selectFrom('platform_incidents').select(['id', 'ref', 'title', 'status', 'severity', 'app_id']).where('id', '=', t.incident_id).executeTakeFirst() : null,
      dbPlatform.selectFrom('platform_support_attachments').select(['id', 'filename', 'mime_type', 'size_bytes', 'created_at']).where('ticket_id', '=', t.id).orderBy('created_at').execute(),
      // The calculation the reporter attached, read inside the customer's own tenant.
      t.record_id ? withTenant(t.tenant_id, trx => trx.selectFrom('landed_cost_records').select(['id', 'description', 'hs_code', 'total_tzs', 'created_at'])
        .where('id', '=', t.record_id!).where('tenant_id', '=', t.tenant_id).executeTakeFirst()) : null,
    ]);
    // Only the page facts the reporter chose to send — never the raw blob.
    const raw = (typeof t.context === 'string' ? (() => { try { return JSON.parse(t.context as any); } catch { return null; } })() : t.context) as Record<string, unknown> | null;
    const reportedFrom = raw ? Object.fromEntries((['area', 'route', 'viewport', 'user_agent', 'reported_at'] as const).filter(k => typeof raw[k] === 'string').map(k => [k, raw[k] as string])) : null;
    return {
      case: { ...t, context: undefined, sla: slaState(t as any) }, customer, owner, team, messages, events, history, attachments, record: record ?? null, reportedFrom,
      // Engineering state is shown beside the case, never instead of the customer outcome.
      lens: lens ?? { restricted: true }, incident,
      allowed: { claim: can(ctx, 'cases.claim') && !t.owner_user_id, assign: can(ctx, 'cases.assign'), update: can(ctx, 'cases.update'), notes: can(ctx, 'cases.internal_notes'),
        reply: can(ctx, 'cases.reply'), verify: can(ctx, 'cases.verify_outcome'), link: can(ctx, 'lens.link') },
    };
  }));

  /** Attachment bytes for a case the caller can see. */
  fastify.get('/cases/:id/attachments/:attId', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'cases.view', 'work.own');
    const p = req.params as any;
    const t = await loadCase(ctx, uuid.parse(p.id));
    if (!can(ctx, 'cases.view') && t.owner_user_id !== ctx.userId) throw new StaffAccessError(404, 'Case not found.');
    const att = await dbPlatform.selectFrom('platform_support_attachments').selectAll().where('id', '=', uuid.parse(p.attId)).where('ticket_id', '=', t.id).executeTakeFirst();
    if (!att) return reply.status(404).send({ error: 'Attachment not found.' });
    const buf = await MinioIntegration.readFile(att.storage_key);
    if (!buf) return reply.status(404).send({ error: 'Attachment content is no longer on disk.' });
    reply.header('Content-Type', att.mime_type || 'application/octet-stream');
    reply.header('Content-Disposition', `inline; filename="${att.filename.replace(/["\r\n]/g, '')}"`);
    return reply.send(buf);
  }));

  /** Atomic: of two operators claiming the same case at once, exactly one wins. */
  fastify.post('/cases/:id/claim', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'cases.claim');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const b = z.object({ version: z.number().int().optional() }).parse(req.body ?? {});
    const won = await claimCase(t.id, ctx.userId, b.version);
    if (!won) return reply.status(409).send({ error: 'Someone else already took this case, or it changed. Refresh to see who.', code: 'claim_conflict' });
    await caseEvent(t.id, 'claimed', ctx.userId);
    await assignmentHistory({ subjectType: 'case', subjectId: t.id, action: 'claimed', actor: ctx.userId, fromUser: null, toUser: ctx.userId, toTeam: won.team_id });
    return won;
  }));

  fastify.post('/cases/:id/assign', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'cases.assign');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const b = z.object({ owner_user_id: uuid.nullable().optional(), team_id: uuid.nullable().optional(), version: z.number().int(), reason: z.string().trim().min(3).max(500), handoff_note: z.string().max(5000).optional() }).parse(req.body);
    if (b.owner_user_id) {
      // The new owner must be able to see the case with their own grants.
      const target = await loadStaffContext(b.owner_user_id);
      if (!target) return reply.status(400).send({ error: 'The new owner is not active staff.' });
      if (!canCase(target, t) || !(target.permissions.has('cases.view') || target.permissions.has('work.own'))) return reply.status(400).send({ error: 'That person has no access to this customer or product. Assign them first.' });
    }
    if (b.team_id && !(await dbPlatform.selectFrom('staff_teams').select('id').where('id', '=', b.team_id).where('active', '=', true).executeTakeFirst())) return reply.status(400).send({ error: 'Unknown team.' });
    const set: Record<string, unknown> = { updated_at: new Date(), version: sql`version + 1` };
    if (b.owner_user_id !== undefined) set.owner_user_id = b.owner_user_id;
    if (b.team_id !== undefined) set.team_id = b.team_id;
    const row = await dbPlatform.updateTable('platform_support_tickets').set(set as any).where('id', '=', t.id).where('version', '=', b.version).returning(['id', 'owner_user_id', 'team_id', 'version']).executeTakeFirst();
    if (!row) return reply.status(409).send({ error: 'The case changed since you opened it. Refresh and try again.', code: 'version_conflict' });
    if (b.handoff_note) await dbPlatform.insertInto('platform_support_messages').values({ ticket_id: t.id, tenant_id: t.tenant_id, author_id: ctx.userId, author_name: ctx.name, is_platform_staff: true, content: `Handoff: ${b.handoff_note}`, visibility: 'internal' }).execute();
    await caseEvent(t.id, 'assigned', ctx.userId, { owner_user_id: row.owner_user_id, team_id: row.team_id, reason: b.reason });
    await assignmentHistory({ subjectType: 'case', subjectId: t.id, action: b.owner_user_id === undefined ? 'team_changed' : t.owner_user_id ? 'reassigned' : 'assigned', actor: ctx.userId,
      fromUser: t.owner_user_id, toUser: row.owner_user_id, fromTeam: t.team_id, toTeam: row.team_id, reason: b.reason });
    return row;
  }));

  fastify.patch('/cases/:id', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'cases.update');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const b = z.object({ version: z.number().int(), status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
      severity: z.enum(['S1', 'S2', 'S3', 'S4']).optional(), due_at: z.string().datetime({ offset: true }).nullable().optional(), waiting_on: z.enum(['customer', 'engineering', 'third_party']).nullable().optional(),
      escalated: z.boolean().optional(), resolution: z.string().max(5000).optional() }).parse(req.body);
    const now = new Date();
    const set: Record<string, unknown> = { updated_at: now, version: sql`version + 1` };
    for (const k of ['status', 'priority', 'severity', 'escalated', 'resolution'] as const) if (b[k] !== undefined) set[k] = b[k];
    if (b.due_at !== undefined) set.due_at = b.due_at ? new Date(b.due_at) : null;
    if (b.status && ['RESOLVED', 'CLOSED'].includes(b.status) && !t.resolved_at) set.resolved_at = now;
    if (b.status && OPEN.includes(b.status as any) && t.resolved_at) { set.resolved_at = null; set.customer_outcome = 'pending'; set.outcome_verified_at = null; set.outcome_verified_by = null; }
    // Pausing applies only while waiting on the customer.
    if (b.waiting_on !== undefined) {
      set.waiting_on = b.waiting_on;
      const pausing = b.waiting_on === 'customer';
      if (pausing && !t.sla_paused_at) set.sla_paused_at = now;
      if (!pausing && t.sla_paused_at) {
        const paused = Math.round((now.getTime() - new Date(t.sla_paused_at).getTime()) / 1000);
        set.sla_paused_at = null;
        set.sla_paused_seconds = (t.sla_paused_seconds ?? 0) + paused;
        if (t.resolution_due_at) set.resolution_due_at = new Date(new Date(t.resolution_due_at).getTime() + paused * 1000);
      }
    }
    const row = await dbPlatform.updateTable('platform_support_tickets').set(set as any).where('id', '=', t.id).where('version', '=', b.version).returningAll().executeTakeFirst();
    if (!row) return reply.status(409).send({ error: 'The case changed since you opened it. Refresh and try again.', code: 'version_conflict' });
    await caseEvent(t.id, 'updated', ctx.userId, b as any);
    return { ...row, sla: slaState(row as any) };
  }));

  fastify.post('/cases/:id/notes', h(async req => {
    const ctx = S(req); assertCan(ctx, 'cases.internal_notes');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const b = z.object({ content: z.string().trim().min(1).max(10000) }).parse(req.body);
    const m = await dbPlatform.insertInto('platform_support_messages').values({ ticket_id: t.id, tenant_id: t.tenant_id, author_id: ctx.userId, author_name: ctx.name, is_platform_staff: true, content: b.content, visibility: 'internal' }).returningAll().executeTakeFirstOrThrow();
    await caseEvent(t.id, 'internal_note', ctx.userId);
    return m;
  }));

  /** Customer-visible reply. The first one records the first-response milestone. */
  fastify.post('/cases/:id/reply', h(async req => {
    const ctx = S(req); assertCan(ctx, 'cases.reply');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const b = z.object({ content: z.string().trim().min(1).max(10000) }).parse(req.body);
    const m = await dbPlatform.insertInto('platform_support_messages').values({ ticket_id: t.id, tenant_id: t.tenant_id, author_id: ctx.userId, author_name: ctx.name, is_platform_staff: true, content: b.content, visibility: 'customer' }).returningAll().executeTakeFirstOrThrow();
    if (!t.first_response_at) await dbPlatform.updateTable('platform_support_tickets').set({ first_response_at: m.created_at }).where('id', '=', t.id).where('first_response_at', 'is', null).execute();
    await dbPlatform.updateTable('platform_support_tickets').set({ updated_at: new Date(), status: t.status === 'OPEN' ? 'IN_PROGRESS' : t.status }).where('id', '=', t.id).execute();
    await caseEvent(t.id, t.first_response_at ? 'replied' : 'first_response', ctx.userId);
    return m;
  }));

  /** The customer outcome is recorded by a person — never inferred from a Lens fix or a status change. */
  fastify.post('/cases/:id/outcome', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'cases.verify_outcome');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const b = z.object({ outcome: z.enum(['confirmed', 'not_resolved']), note: z.string().trim().min(3).max(2000) }).parse(req.body);
    if (b.outcome === 'confirmed' && !['RESOLVED', 'CLOSED'].includes(t.status)) return reply.status(409).send({ error: 'Resolve the case before confirming the customer outcome.' });
    const set: Record<string, unknown> = { customer_outcome: b.outcome, outcome_verified_by: ctx.userId, outcome_verified_at: new Date(), updated_at: new Date(), version: sql`version + 1` };
    if (b.outcome === 'not_resolved') { set.status = 'IN_PROGRESS'; set.resolved_at = null; }
    await dbPlatform.updateTable('platform_support_tickets').set(set as any).where('id', '=', t.id).execute();
    await dbPlatform.insertInto('platform_support_messages').values({ ticket_id: t.id, tenant_id: t.tenant_id, author_id: ctx.userId, author_name: ctx.name, is_platform_staff: true, content: `Customer outcome ${b.outcome === 'confirmed' ? 'confirmed' : 'not resolved'}: ${b.note}`, visibility: 'internal' }).execute();
    await caseEvent(t.id, `outcome_${b.outcome}`, ctx.userId, { note_length: b.note.length });
    return { outcome: b.outcome };
  }));

  fastify.post('/cases/:id/lens', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'lens.link');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const b = z.object({ lens_item_id: uuid }).parse(req.body);
    const item = await dbPlatform.selectFrom('lens_items').select(['id', 'ref']).where('id', '=', b.lens_item_id).executeTakeFirst();
    if (!item) return reply.status(404).send({ error: 'Lens item not found.' });
    await dbPlatform.insertInto('lens_links').values({ item_id: item.id, provider: 'hudumika_issue', kind: 'issue', external_id: t.id, url: `/console/cases/${t.id}`, title: t.subject, external_status: null, synced_at: new Date() })
      .onConflict(oc => oc.columns(['item_id', 'provider', 'external_id']).doNothing()).execute();
    await caseEvent(t.id, 'lens_linked', ctx.userId, { lens_ref: item.ref });
    return { linked: item.ref };
  }));

  // Raise a new Lens bug from a case (ported from SuperAdmin ▸ Issues "Send to
  // Lens"). Idempotent: an already-linked case returns its existing item.
  // The Lens item carries no customer message content — only the subject and
  // routing metadata — so restricted customer evidence stays on the case.
  fastify.post('/cases/:id/lens/new', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'lens.link');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const existing = await dbPlatform.selectFrom('lens_links').innerJoin('lens_items', 'lens_items.id', 'lens_links.item_id')
      .select(['lens_items.ref']).where('lens_links.provider', '=', 'hudumika_issue').where('lens_links.external_id', '=', t.id).executeTakeFirst();
    if (existing) return { linked: existing.ref, already_linked: true };
    const meta = await dbPlatform.selectFrom('platform_support_tickets as x').leftJoin('tenants as tn', 'tn.id', 'x.tenant_id')
      .select(['x.ref_number', 'x.category', 'x.app', 'x.priority', 'tn.name as tenant_name']).where('x.id', '=', t.id).executeTakeFirstOrThrow();
    const SEVERITY: Record<string, 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'> = { URGENT: 'CRITICAL', HIGH: 'HIGH', NORMAL: 'NORMAL', LOW: 'LOW' };
    const slug = String(meta.app ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const area = slug ? await dbPlatform.selectFrom('lens_areas').select('id').where('id', '=', slug).executeTakeFirst() : undefined;
    const next = await dbPlatform.selectNoFrom(eb => eb.fn<number>('nextval', [eb.val('lens_item_ref_seq')]).as('n')).executeTakeFirstOrThrow();
    const item = await dbPlatform.insertInto('lens_items').values({
      ref: `LENS-${next.n}`, kind: 'BUG', title: t.subject,
      body: [`Reported by ${meta.tenant_name ?? 'a customer'}.`, meta.category ? `Category: ${meta.category}` : null, meta.app ? `App: ${meta.app}` : null, `Case: ${meta.ref_number}`].filter(Boolean).join('\n'),
      area_id: area?.id ?? 'admin', severity: SEVERITY[String(meta.priority)] ?? 'NORMAL', confidence: 'CONFIRMED', created_by: ctx.userId,
    }).returningAll().executeTakeFirstOrThrow();
    await dbPlatform.insertInto('lens_events').values({ item_id: item.id, kind: 'created', detail: `Raised from case ${meta.ref_number}`, actor_id: ctx.userId, actor_name: ctx.name }).execute();
    await dbPlatform.insertInto('lens_links').values({ item_id: item.id, provider: 'hudumika_issue', kind: 'issue', external_id: t.id, url: `/console/cases/${t.id}`, title: t.subject, external_status: null, synced_at: new Date() })
      .onConflict(oc => oc.columns(['item_id', 'provider', 'external_id']).doNothing()).execute();
    await caseEvent(t.id, 'lens_linked', ctx.userId, { lens_ref: item.ref, created: true });
    await staffAudit(ctx, { action: 'case.lens_created', targetType: 'case', targetId: t.id, tenantId: t.tenant_id, detail: { lens_ref: item.ref } });
    reply.status(201);
    return { linked: item.ref, already_linked: false };
  }));

  fastify.post('/cases/:id/incident', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'incidents.manage');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const b = z.object({ incident_id: uuid.nullable() }).parse(req.body);
    if (b.incident_id) {
      const inc = await dbPlatform.selectFrom('platform_incidents').select(['id', 'app_id']).where('id', '=', b.incident_id).executeTakeFirst();
      if (!inc || !canProduct(ctx, inc.app_id)) return reply.status(404).send({ error: 'Incident not found.' });
      await dbPlatform.insertInto('platform_incident_customers').values({ incident_id: inc.id, tenant_id: t.tenant_id }).onConflict(oc => oc.columns(['incident_id', 'tenant_id']).doNothing()).execute();
    }
    await dbPlatform.updateTable('platform_support_tickets').set({ incident_id: b.incident_id, updated_at: new Date() }).where('id', '=', t.id).execute();
    await caseEvent(t.id, b.incident_id ? 'incident_linked' : 'incident_unlinked', ctx.userId, { incident_id: b.incident_id });
    return { incident_id: b.incident_id };
  }));

  /** Explain (and optionally apply) routing for an existing case. */
  fastify.post('/cases/:id/route', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'cases.assign');
    const t = await loadCase(ctx, uuid.parse((req.params as any).id));
    const b = z.object({ apply: z.boolean().default(false), version: z.number().int().optional() }).parse(req.body ?? {});
    const r = await routeCase(t);
    if (!b.apply) return r;
    if (b.version === undefined) return reply.status(400).send({ error: 'version is required to apply routing.' });
    const row = await dbPlatform.updateTable('platform_support_tickets').set({ team_id: r.teamId, owner_user_id: r.ownerId, routing_reason: r.reason, updated_at: new Date(), version: sql`version + 1` as any })
      .where('id', '=', t.id).where('version', '=', b.version).returning('id').executeTakeFirst();
    if (!row) return reply.status(409).send({ error: 'The case changed since you opened it.', code: 'version_conflict' });
    await caseEvent(t.id, 'rerouted', ctx.userId, r);
    await assignmentHistory({ subjectType: 'case', subjectId: t.id, action: 'rerouted', actor: ctx.userId, fromUser: t.owner_user_id, toUser: r.ownerId, fromTeam: t.team_id, toTeam: r.teamId, reason: r.reason });
    return r;
  }));

  // ── Incidents ───────────────────────────────────────────────────────────
  fastify.get('/incidents', h(async req => {
    const ctx = S(req); assertCan(ctx, 'incidents.view');
    const products = productsInScope(ctx);
    if (!products.length) return { items: [] };
    const rows = await dbPlatform.selectFrom('platform_incidents as i').leftJoin('users as o', 'o.id', 'i.owner_user_id')
      .select(['i.id', 'i.ref', 'i.app_id', 'i.title', 'i.severity', 'i.status', 'i.started_at', 'i.resolved_at', 'i.lens_item_id', 'i.public_summary', 'i.public_summary_approved_at', 'o.name as owner_name',
        sql<number>`(SELECT count(*)::int FROM platform_incident_customers c WHERE c.incident_id = i.id)`.as('customers'),
        sql<number>`(SELECT count(*)::int FROM platform_support_tickets x WHERE x.incident_id = i.id AND x.status IN ('OPEN','IN_PROGRESS'))`.as('open_cases')])
      .where('i.app_id', 'in', products).orderBy('i.started_at', 'desc').limit(100).execute();
    return { items: rows };
  }));

  fastify.post('/incidents', h(async req => {
    const ctx = S(req); assertCan(ctx, 'incidents.manage');
    const b = z.object({ app_id: appId, title: z.string().trim().min(3).max(300), severity: z.enum(['S1', 'S2', 'S3', 'S4']).default('S2'), lens_item_id: uuid.optional() }).parse(req.body);
    if (!canProduct(ctx, b.app_id)) throw new StaffAccessError(403, 'That product is not in your scope.', 'scope');
    const n = await dbPlatform.selectFrom('platform_incidents').select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow();
    const row = await dbPlatform.insertInto('platform_incidents').values({ ref: `INC-${String(n.n + 1).padStart(4, '0')}-${Date.now().toString(36).slice(-4)}`, app_id: b.app_id, title: b.title, severity: b.severity,
      lens_item_id: b.lens_item_id ?? null, owner_user_id: ctx.userId, created_by: ctx.userId }).returningAll().executeTakeFirstOrThrow();
    await assignmentHistory({ subjectType: 'incident', subjectId: row.id, action: 'declared', actor: ctx.userId, toUser: ctx.userId });
    await staffAudit(ctx, { action: 'incident.declared', targetType: 'incident', targetId: row.id, appId: b.app_id, detail: { severity: b.severity } });
    return row;
  }));

  fastify.patch('/incidents/:id', h(async req => {
    const ctx = S(req); assertCan(ctx, 'incidents.manage');
    const id = uuid.parse((req.params as any).id);
    const inc = await dbPlatform.selectFrom('platform_incidents').selectAll().where('id', '=', id).executeTakeFirst();
    if (!inc || !canProduct(ctx, inc.app_id)) throw new StaffAccessError(404, 'Incident not found.');
    const b = z.object({ status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']).optional(), severity: z.enum(['S1', 'S2', 'S3', 'S4']).optional(), title: z.string().trim().min(3).max(300).optional(),
      public_summary: z.string().max(2000).nullable().optional(), lens_item_id: uuid.nullable().optional() }).parse(req.body);
    const set: Record<string, unknown> = { ...b, updated_at: new Date() };
    // Editing the customer-facing summary withdraws its approval.
    if (b.public_summary !== undefined) { set.public_summary_approved_by = null; set.public_summary_approved_at = null; }
    if (b.status === 'resolved' && !inc.resolved_at) set.resolved_at = new Date();
    if (b.status && b.status !== 'resolved') set.resolved_at = null;
    const row = await dbPlatform.updateTable('platform_incidents').set(set as any).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    // Resolving an incident closes nothing for customers: their cases still need an outcome.
    const openCases = await dbPlatform.selectFrom('platform_support_tickets').select(sql<number>`count(*)::int`.as('n')).where('incident_id', '=', id).where('status', 'in', [...OPEN]).executeTakeFirstOrThrow();
    await staffAudit(ctx, { action: 'incident.updated', targetType: 'incident', targetId: id, appId: inc.app_id, detail: b });
    return { ...row, linkedOpenCases: openCases.n };
  }));

  fastify.post('/incidents/:id/approve-summary', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'incidents.manage');
    const id = uuid.parse((req.params as any).id);
    const inc = await dbPlatform.selectFrom('platform_incidents').selectAll().where('id', '=', id).executeTakeFirst();
    if (!inc || !canProduct(ctx, inc.app_id)) throw new StaffAccessError(404, 'Incident not found.');
    if (!inc.public_summary?.trim()) return reply.status(400).send({ error: 'Write a customer-facing summary first.' });
    await dbPlatform.updateTable('platform_incidents').set({ public_summary_approved_by: ctx.userId, public_summary_approved_at: new Date() }).where('id', '=', id).execute();
    await staffAudit(ctx, { action: 'incident.summary_approved', targetType: 'incident', targetId: id, appId: inc.app_id });
    return { approved: true };
  }));

  fastify.post('/incidents/:id/customers', h(async req => {
    const ctx = S(req); assertCan(ctx, 'incidents.manage');
    const id = uuid.parse((req.params as any).id);
    const inc = await dbPlatform.selectFrom('platform_incidents').select(['id', 'app_id']).where('id', '=', id).executeTakeFirst();
    if (!inc || !canProduct(ctx, inc.app_id)) throw new StaffAccessError(404, 'Incident not found.');
    const b = z.object({ tenant_ids: z.array(uuid).min(1).max(500) }).parse(req.body);
    if (b.tenant_ids.some(t => !canCustomer(ctx, t))) throw new StaffAccessError(403, 'One or more customers are outside your scope.', 'scope');
    await dbPlatform.insertInto('platform_incident_customers').values(b.tenant_ids.map(tenant_id => ({ incident_id: id, tenant_id }))).onConflict(oc => oc.columns(['incident_id', 'tenant_id']).doNothing()).execute();
    return { added: b.tenant_ids.length };
  }));

  // ── Access sessions ─────────────────────────────────────────────────────
  fastify.get('/access-sessions', h(async req => {
    const ctx = S(req);
    const all = can(ctx, 'access.oversee') && (req.query as any).all === '1';
    const rows = await dbPlatform.selectFrom('staff_access_sessions as s').innerJoin('tenants as t', 't.id', 's.tenant_id').innerJoin('users as u', 'u.id', 's.staff_user_id')
      .selectAll('s').select(['t.name as tenant_name', 'u.name as staff_name', 'u.avatar_url as staff_avatar_url'])
      .$if(!all, q => q.where('s.staff_user_id', '=', ctx.userId)).orderBy('s.created_at', 'desc').limit(100).execute();
    return { items: rows, current: await currentAccessSession(ctx) };
  }));

  fastify.post('/access-sessions', h(async (req, reply) => {
    const ctx = S(req); assertCan(ctx, 'access.request');
    const b = z.object({ tenant_id: uuid, app_id: appId.nullable().optional(), actions: z.array(z.enum(['read', 'configure'])).min(1).max(2),
      purpose: z.string().trim().min(5).max(1000), case_id: uuid.optional(), minutes: z.number().int().min(5).max(480).default(30) }).parse(req.body);
    if (!canCustomer(ctx, b.tenant_id)) throw new StaffAccessError(404, 'Customer not found.', 'scope');
    if (b.app_id && !canProduct(ctx, b.app_id)) throw new StaffAccessError(403, 'That product is not in your scope.', 'scope');
    await assertStepUp(ctx, 'Opening a customer access session');
    if (b.case_id) {
      const c = await dbPlatform.selectFrom('platform_support_tickets').select(['tenant_id']).where('id', '=', b.case_id).executeTakeFirst();
      if (!c || c.tenant_id !== b.tenant_id) return reply.status(400).send({ error: 'That case is not this customer’s.' });
    }
    const account = await dbPlatform.selectFrom('staff_customer_accounts').select(['standing_authorization', 'max_session_minutes']).where('tenant_id', '=', b.tenant_id).executeTakeFirst();
    const max = account?.max_session_minutes ?? 60;
    if (b.minutes > max) return reply.status(400).send({ error: `This customer allows sessions of at most ${max} minutes.` });
    if (await currentAccessSession(ctx)) return reply.status(409).send({ error: 'End your current access session first.', code: 'session_open' });
    const standing = !!account?.standing_authorization;
    const now = new Date();
    const row = await dbPlatform.insertInto('staff_access_sessions').values({
      staff_user_id: ctx.userId, tenant_id: b.tenant_id, app_id: b.app_id ?? null, actions: b.actions, purpose: b.purpose, case_id: b.case_id ?? null,
      basis: standing ? 'standing_authorization' : 'customer_approval', status: standing ? 'active' : 'pending_approval', requested_minutes: b.minutes,
      starts_at: standing ? now : null,
      // Pending requests lapse after 24 hours if the customer does not answer.
      expires_at: standing ? new Date(now.getTime() + b.minutes * 60000) : new Date(now.getTime() + 24 * 3600000),
      approved_at: standing ? now : null,
    }).returningAll().executeTakeFirstOrThrow();
    await staffAudit(ctx, { action: 'access.session_requested', targetType: 'access_session', targetId: row.id, tenantId: b.tenant_id, appId: b.app_id ?? null, purpose: b.purpose, detail: { actions: b.actions, minutes: b.minutes, basis: row.basis } });
    await dbPlatform.insertInto('platform_operator_audit').values({ operator_id: ctx.userId, affected_tenant_id: b.tenant_id, action: `staff_access_${row.status}`, resource_type: 'access_session', resource_id: row.id, reason: b.purpose, metadata: JSON.stringify({ actions: b.actions, app_id: b.app_id ?? null }) as any }).execute();
    return row;
  }));

  fastify.post('/access-sessions/:id/end', h(async req => {
    const ctx = S(req);
    const id = uuid.parse((req.params as any).id);
    const row = await dbPlatform.updateTable('staff_access_sessions').set({ status: 'ended', ended_at: new Date(), ended_by: ctx.userId, end_reason: 'Ended by staff member' })
      .where('id', '=', id).where('staff_user_id', '=', ctx.userId).where('status', 'in', ['active', 'pending_approval']).returning(['id', 'tenant_id']).executeTakeFirst();
    if (!row) throw new StaffAccessError(404, 'No open session with that id.');
    await staffAudit(ctx, { action: 'access.session_ended', targetType: 'access_session', targetId: id, tenantId: row.tenant_id });
    return { ended: true };
  }));

  fastify.post('/access-sessions/:id/revoke', h(async req => {
    const ctx = S(req); assertCan(ctx, 'access.oversee');
    const id = uuid.parse((req.params as any).id);
    const b = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const row = await dbPlatform.updateTable('staff_access_sessions').set({ status: 'revoked', ended_at: new Date(), ended_by: ctx.userId, end_reason: b.reason })
      .where('id', '=', id).where('status', 'in', ['active', 'pending_approval']).returning(['id', 'tenant_id', 'staff_user_id']).executeTakeFirst();
    if (!row) throw new StaffAccessError(404, 'No open session with that id.');
    await staffAudit(ctx, { action: 'access.session_revoked', targetType: 'access_session', targetId: id, tenantId: row.tenant_id, purpose: b.reason, detail: { staff_user_id: row.staff_user_id } });
    return { revoked: true };
  }));

  /** Workspace records, read through an active session: the customer's workspace users (no credentials). */
  fastify.get('/access-sessions/:id/records/users', h(async req => {
    const ctx = S(req);
    const s = await useSession(ctx, uuid.parse((req.params as any).id), 'read', 'workspace_users', null);
    return withTenant(s.tenantId, trx => trx.selectFrom('users').select(['id', 'name', 'email', 'role', 'active', 'last_login_at', 'avatar_url'])
      .where('tenant_id', '=', s.tenantId).orderBy('name').limit(500).execute());
  }));

  /** Product configuration for the session's customer: which apps the workspace has switched on or off. */
  fastify.get('/access-sessions/:id/records/apps', h(async req => {
    const ctx = S(req);
    const s = await useSession(ctx, uuid.parse((req.params as any).id), 'read', 'enabled_apps', null);
    const row = await withTenant(s.tenantId, trx => trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', s.tenantId).executeTakeFirst());
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const enabled = (settings?.['enabled-apps'] ?? {}) as Record<string, boolean>;
    return Object.fromEntries(Object.entries(enabled).filter(([k]) => !s.appId || k === s.appId));
  }));

  fastify.put('/access-sessions/:id/records/apps/:app', h(async req => {
    const ctx = S(req);
    const app = appId.parse((req.params as any).app);
    const s = await useSession(ctx, uuid.parse((req.params as any).id), 'configure', `enabled_apps.${app}`, app);
    const b = z.object({ enabled: z.boolean() }).parse(req.body);
    await withTenant(s.tenantId, async trx => {
      const cur = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', s.tenantId).executeTakeFirst();
      const settings = cur ? (typeof cur.settings === 'string' ? JSON.parse(cur.settings) : cur.settings) ?? {} : {};
      settings['enabled-apps'] = { ...(settings['enabled-apps'] ?? {}), [app]: b.enabled };
      if (cur) await trx.updateTable('tenant_settings').set({ settings: JSON.stringify(settings) as any }).where('tenant_id', '=', s.tenantId).execute();
      else await trx.insertInto('tenant_settings').values({ tenant_id: s.tenantId, settings: JSON.stringify(settings) as any }).execute();
    });
    await staffAudit(ctx, { action: 'access.configure', targetType: 'enabled_app', targetId: app, tenantId: s.tenantId, appId: app, purpose: s.purpose, detail: { enabled: b.enabled, session_id: s.id } });
    await dbPlatform.insertInto('platform_operator_audit').values({ operator_id: ctx.userId, affected_tenant_id: s.tenantId, action: 'staff_access_configure', resource_type: 'enabled_app', resource_id: app, reason: s.purpose, metadata: JSON.stringify({ enabled: b.enabled, session_id: s.id }) as any }).execute();
    return { app, enabled: b.enabled };
  }));
}

/**
 * Workspace side: the customer's administrators see and answer staff access
 * requests for their own workspace. Mounted under /v1/platform-support.
 */
export async function customerAccessApprovalRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (!['ADMIN', 'TENANT_ADMIN'].includes(request.user.role) || request.user.impersonated_by) return reply.status(403).send({ error: 'Only workspace administrators can answer staff access requests.' });
  });
  fastify.get('/access-requests', async (request: any) => {
    const tenantId = request.user.tenant_id;
    return dbPlatform.selectFrom('staff_access_sessions as s').innerJoin('users as u', 'u.id', 's.staff_user_id')
      .select(['s.id', 's.status', 's.purpose', 's.actions', 's.app_id', 's.requested_minutes', 's.basis', 's.starts_at', 's.expires_at', 's.created_at', 's.staff_user_id', 'u.name as staff_name', 'u.avatar_url as staff_avatar_url'])
      .where('s.tenant_id', '=', tenantId).orderBy('s.created_at', 'desc').limit(50).execute();
  });
  fastify.post('/access-requests/:id/:decision(approve|deny)', async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const id = uuid.safeParse(request.params.id);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    const approve = request.params.decision === 'approve';
    // One conditional UPDATE: only a request that is still pending and unexpired
    // changes, so of two competing decisions exactly one wins and the other gets
    // 409. The session clock is computed in the database from the same row.
    const decided = await dbPlatform.updateTable('staff_access_sessions').set(approve
      ? { status: 'active', approved_by: request.user.sub, approved_at: sql`now()`, starts_at: sql`now()`, expires_at: sql`now() + make_interval(mins => requested_minutes)` }
      : { status: 'denied', ended_at: sql`now()`, ended_by: request.user.sub, end_reason: 'Denied by the customer' })
      .where('id', '=', id.data).where('tenant_id', '=', tenantId).where('status', '=', 'pending_approval').where('expires_at', '>', sql<Date>`now()`)
      // The requester can never answer their own request, even as a workspace admin.
      .where('staff_user_id', '!=', request.user.sub)
      .returning(['id', 'staff_user_id', 'status', 'expires_at']).executeTakeFirst();
    if (!decided) {
      const existing = await dbPlatform.selectFrom('staff_access_sessions').select(['status', 'staff_user_id']).where('id', '=', id.data).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'No request with that id.' });
      if (existing.staff_user_id === request.user.sub) return reply.status(403).send({ error: 'You cannot answer your own access request.' });
      return reply.status(409).send({ error: existing.status === 'pending_approval' ? 'This request has lapsed.' : 'This request was already answered.', status: existing.status });
    }
    await staffAudit({ userId: request.user.sub, ip: request.ip }, { action: approve ? 'access.customer_approved' : 'access.customer_denied', targetType: 'access_session', targetId: decided.id, tenantId, detail: { staff_user_id: decided.staff_user_id } });
    return { status: decided.status, expiresAt: approve ? new Date(decided.expires_at).toISOString() : null };
  });
  /** The customer can stop an approved session before it expires. */
  fastify.post('/access-requests/:id/end', async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const id = uuid.safeParse(request.params.id);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    const ended = await dbPlatform.updateTable('staff_access_sessions')
      .set({ status: 'revoked', ended_at: sql`now()`, ended_by: request.user.sub, end_reason: 'Ended by the customer' })
      .where('id', '=', id.data).where('tenant_id', '=', tenantId).where('status', '=', 'active').where('expires_at', '>', sql<Date>`now()`)
      .returning(['id', 'staff_user_id']).executeTakeFirst();
    if (!ended) return reply.status(409).send({ error: 'This session is not active.' });
    await staffAudit({ userId: request.user.sub, ip: request.ip }, { action: 'access.customer_ended', targetType: 'access_session', targetId: ended.id, tenantId, detail: { staff_user_id: ended.staff_user_id } });
    return { status: 'revoked' };
  });
}
