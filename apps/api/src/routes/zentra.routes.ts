import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { requireEntitlement } from '../middleware/entitlement.js';
import { clearZentraPolicyCache, departmentsFor } from '../services/zentra-enforce.service.js';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { withTenant, dbPlatform } from '../db/client.js';
import {
  emitZentraAuditEvent,
  getZentraAuditEvents,
  enforceZentraRetention,
  RETENTION_DECREASE_DELAY_DAYS,
} from '../services/zentra-event.service.js';
import {
  getZentraRiskSignals,
  triageZentraSignal,
  ensureDefaultZentraRules,
  listZentraRiskRules,
  updateZentraRiskRule,
} from '../services/zentra-risk.service.js';
import {
  createZentraCase,
  getZentraCases,
  getZentraCaseById,
  updateZentraCase,
  addZentraCaseNote,
  addZentraCaseEvidence,
  resolveZentraCase,
} from '../services/zentra-cases.service.js';
import {
  evaluateZentraRecordAuth,
  loadCanonicalResource,
  CANONICAL_RESOURCE_TYPES,
} from '../services/zentra-auth.service.js';
import {
  processZentraOutboxBatch,
} from '../services/zentra-outbox.service.js';
import {
  getZentraPlatformOverview,
  getZentraTenantDrilldown,
  revealZentraSensitiveEvidence,
  getZentraTenantTelemetryHealth,
  assertPlatformSuperAdmin,
} from '../services/zentra-oversight.service.js';
import type { ZentraSeverity, ZentraSignalStatus, ZentraCaseStatus, ZentraResolutionOutcome } from '@hudumika/types';
import { ALL_APP_IDS } from '@hudumika/types';
import { requireRole } from '../middleware/rbac.js';

/**
 * Who may do what in Zentra. It is a security console: reading it shows who
 * did what across the workspace, so it is not open to every signed-in user.
 *   view        — overview, activity, signals, cases, policies, settings
 *   investigate — triage signals, open/work/close cases
 *   administer  — policies, settings, risk rules, retention purge
 * Platform oversight (/platform/*) and the outbox trigger need the platform
 * SuperAdmin's own (non-impersonated) session.
 */
const VIEW = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const INVESTIGATE = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const ADMINISTER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;
const canView = requireRole(...VIEW);
const canInvestigate = requireRole(...INVESTIGATE);
const canAdminister = requireRole(...ADMINISTER);
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SIGNAL_STATUSES = ['NEW', 'TRIAGED', 'CASE_OPEN', 'RESOLVED', 'FALSE_POSITIVE'];
const CASE_STATUSES = ['OPEN', 'INVESTIGATING', 'REMEDIATION', 'CLOSED'];
const OUTCOMES = ['remediated', 'policy_updated', 'false_positive', 'no_action_needed', 'escalated'];
type ZentraOutcomeFilter = 'success' | 'denied' | 'failure' | undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ZENTRA_CHANGE_EVENTS: Record<string, string> = {
  'PATCH /risk/signals/:id': 'zentra.signal_triaged',
  'POST /cases': 'zentra.case_opened',
  'PATCH /cases/:id': 'zentra.case_updated',
  'POST /cases/:id/notes': 'zentra.case_note_added',
  'POST /cases/:id/evidence': 'zentra.case_evidence_added',
  'POST /cases/:id/resolve': 'zentra.case_resolved',
  'POST /policies': 'zentra.policy_created',
  'DELETE /policies/:id': 'zentra.policy_deleted',
  'PATCH /rules/:code': 'zentra.rule_changed',
  'PATCH /settings': 'zentra.settings_changed',
  'POST /auth/check': 'zentra.access_simulated',
};
const AUDITED_BODY_KEYS = ['status', 'severity', 'enabled', 'retention_days', 'dormant_threshold_hours', 'legal_hold',
  'telemetry_monitoring_enabled', 'alert_min_severity', 'resolution_outcome', 'effect', 'resource_type', 'action',
  'subject_type', 'subject_id', 'name', 'as_role', 'assigned_to_user_id'];

export const zentraRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', server.authenticate);
  // Plan gate (migration 768). /platform/* is SuperAdmin-only and not a
  // tenant feature; SuperAdmins bypass entitlements in any case.
  const zentraEntitled = requireEntitlement('zentra');
  server.addHook('preHandler', async (request, reply) => {
    if ((request.routeOptions?.url || '').includes('/zentra/platform/')) return;
    return zentraEntitled(request, reply);
  });

  // Who watches Zentra: every successful change made here is itself written
  // to the audit log (policies, rules, settings, cases, triage, simulations).
  // /events and /settings/purge write their own; /platform/* has its own
  // platform audit trail.
  server.addHook('onResponse', async (request, reply) => {
    if (request.method === 'GET' || reply.statusCode < 200 || reply.statusCode >= 300) return;
    const route = (request.routeOptions?.url || '').replace(/^.*\/zentra/, '');
    const name = ZENTRA_CHANGE_EVENTS[`${request.method} ${route}`];
    if (!name || !request.user?.tenant_id) return;
    if (name === 'zentra.policy_created' || name === 'zentra.policy_deleted') clearZentraPolicyCache(request.user.tenant_id);
    const params = (request.params ?? {}) as Record<string, string>;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const meta: Record<string, unknown> = {};
    for (const k of AUDITED_BODY_KEYS) {
      const v = body[k];
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') meta[k] = typeof v === 'string' ? v.slice(0, 120) : v;
    }
    if (body.parameters && typeof body.parameters === 'object') meta.parameters = JSON.stringify(body.parameters).slice(0, 200);
    await emitZentraAuditEvent({
      tenant_id: request.user.tenant_id, app_id: 'zentra', event_name: name,
      actor_id: request.user.sub, actor_role: request.user.role, actor_name: request.user.name, actor_ip: request.ip,
      actor_user_agent: String(request.headers['user-agent'] ?? '').slice(0, 300) || undefined,
      resource_type: name.split('.')[1].split('_')[0], resource_id: String(params.id ?? params.code ?? request.user.tenant_id),
      action: request.method.toLowerCase(), safe_summary: `${name.replace('zentra.', '').replace(/_/g, ' ')} in Zentra`,
      safe_metadata: meta as any,
    }).catch(err => request.log.warn({ err: err?.message }, 'Zentra could not audit its own change'));
  });

  // ── Overview ────────────────────────────────────────────────────────────────
  server.get('/overview', { preHandler: canView }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    await ensureDefaultZentraRules(tenantId);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [eventCountRow, signalsData, openCasesRow, outboxBacklogRow, recentEventsData, telemetryHealth, highRiskRow] =
      await Promise.all([
        withTenant(tenantId, trx =>
          trx.selectFrom('zentra_audit_events')
            .select(trx.fn.count<number>('id').as('count'))
            .where('tenant_id', '=', tenantId)
            .where('created_at', '>=', oneDayAgo)
            .executeTakeFirst()
        ),
        getZentraRiskSignals(tenantId, { limit: 10 }),
        withTenant(tenantId, trx =>
          trx.selectFrom('zentra_investigation_cases')
            .select(trx.fn.count<number>('id').as('count'))
            .where('tenant_id', '=', tenantId)
            .where('status', 'in', ['OPEN', 'INVESTIGATING', 'REMEDIATION'])
            .executeTakeFirst()
        ),
        withTenant(tenantId, trx =>
          trx.selectFrom('zentra_event_outbox')
            .select(trx.fn.count<number>('id').as('count'))
            .where('tenant_id', '=', tenantId)
            .where('status', 'in', ['pending', 'failed'])
            .executeTakeFirst()
        ),
        getZentraAuditEvents(tenantId, { limit: 10 }),
        getZentraTenantTelemetryHealth(tenantId),
        // Every open high/critical signal, not just those among the ten shown.
        withTenant(tenantId, trx =>
          trx.selectFrom('zentra_risk_signals')
            .select(trx.fn.count<number>('id').as('count'))
            .where('tenant_id', '=', tenantId)
            .where('severity', 'in', ['HIGH', 'CRITICAL'])
            .where('status', 'in', ['NEW', 'TRIAGED', 'CASE_OPEN'])
            .executeTakeFirst()
        ),
      ]);

    const highRiskCount = Number(highRiskRow?.count ?? 0);

    // Facts for the overview's badges, checked live rather than asserted.
    const posture = await withTenant(tenantId, async trx => {
      const rls = await sql<{ total: number; forced: number }>`
        SELECT count(*)::int AS total, count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity)::int AS forced
        FROM pg_class WHERE relkind = 'r' AND left(relname, 7) = 'zentra_' AND relname <> 'zentra_platform_audit'`.execute(trx);
      const appendOnly = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'zentra_audit_events_append_only' AND NOT tgisinternal`.execute(trx);
      const settings = await trx.selectFrom('zentra_settings').select(['legal_hold', 'retention_days']).where('tenant_id', '=', tenantId).executeTakeFirst();
      const policies = await trx.selectFrom('zentra_policies').select(trx.fn.count<number>('id').as('n')).where('tenant_id', '=', tenantId).where('enabled', '=', true).executeTakeFirst();
      return {
        rls_tables: Number(rls.rows[0]?.total ?? 0), rls_forced: Number(rls.rows[0]?.forced ?? 0),
        audit_log_append_only: Number(appendOnly.rows[0]?.n ?? 0) > 0,
        legal_hold: !!settings?.legal_hold, retention_days: settings?.retention_days ?? 365,
        active_policies: Number(policies?.n ?? 0),
      };
    });
    const rules = await listZentraRiskRules(tenantId);

    return {
      posture: { ...posture, rules_enabled: rules.filter((r: any) => r.enabled).length, rules_total: rules.length },
      total_events_24h: Number(eventCountRow?.count ?? 0),
      high_risk_signals_count: highRiskCount,
      open_cases_count: Number(openCasesRow?.count ?? 0),
      outbox_backlog_count: Number(outboxBacklogRow?.count ?? 0),
      recent_events: recentEventsData.events,
      recent_signals: signalsData.signals,
      app_health: telemetryHealth,
    };
  });

  // ── Activity Log ────────────────────────────────────────────────────────────
  server.get<{
    Querystring: {
      app_id?: string;
      actor_id?: string;
      event_name?: string;
      resource_type?: string;
      resource_id?: string;
      outcome?: 'success' | 'denied' | 'failure';
      search?: string;
      start_date?: string;
      end_date?: string;
      limit?: string;
      offset?: string;
    };
  }>('/activity', { preHandler: canView }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const q = request.query;
    const result = await getZentraAuditEvents(tenantId, {
      app_id: q.app_id,
      actor_id: q.actor_id,
      event_name: q.event_name,
      resource_type: q.resource_type,
      resource_id: q.resource_id,
      outcome: q.outcome,
      search: q.search,
      start_date: q.start_date,
      end_date: q.end_date,
      limit: q.limit ? parseInt(q.limit, 10) : 50,
      offset: q.offset ? parseInt(q.offset, 10) : 0,
    });

    return result;
  });

  // ── Exports for auditors ───────────────────────────────────────────────────
  // CSV of the audit log, same filters as /activity, newest first, capped at
  // 10,000 rows. The download itself is recorded (record.exported) by the
  // telemetry hook like any other export.
  server.get<{ Querystring: Record<string, string | undefined> }>('/activity/export.csv', { preHandler: canView }, async (request, reply) => {
    const tenantId = request.user.tenant_id;
    const q = request.query;
    const filters = {
      app_id: q.app_id, actor_id: q.actor_id, event_name: q.event_name, resource_type: q.resource_type,
      resource_id: q.resource_id, outcome: q.outcome as ZentraOutcomeFilter, search: q.search,
      start_date: q.start_date, end_date: q.end_date,
    };
    const rows: any[] = [];
    for (let offset = 0; offset < 10_000; offset += 200) {
      const page = await getZentraAuditEvents(tenantId, { ...filters, limit: 200, offset });
      rows.push(...page.events);
      if (page.events.length < 200) break;
    }
    const cell = (v: unknown) => {
      const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Neutralise spreadsheet formulas, then quote.
      const safe = /^[=+@-]/.test(t) ? `'${t}` : t;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const cols = ['created_at', 'app_id', 'event_name', 'outcome', 'actor_name', 'actor_id', 'actor_role', 'actor_ip',
      'resource_type', 'resource_id', 'action', 'safe_summary', 'safe_metadata', 'id'];
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join(String.fromCharCode(13, 10));
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="zentra-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    return reply.send(csv);
  });

  // Evidence pack for one case: the case, its full append-only history with
  // the hash chain, every linked evidence event, and a SHA-256 over the
  // whole pack so a recipient can tell if it was altered after download.
  server.get<{ Params: { id: string } }>('/cases/:id/evidence-pack', { preHandler: canInvestigate }, async (request, reply) => {
    if (!UUID.test(request.params.id)) return reply.status(400).send({ error: 'Invalid case id' });
    const tenantId = request.user.tenant_id;
    const found = await getZentraCaseById(tenantId, request.params.id);
    if (!found) return reply.status(404).send({ error: 'Case not found' });
    const history = await withTenant(tenantId, trx => trx.selectFrom('zentra_case_events').selectAll()
      .where('tenant_id', '=', tenantId).where('case_id', '=', request.params.id).orderBy('created_at', 'asc').execute());
    const pack = {
      generated_at: new Date().toISOString(),
      generated_by: { id: request.user.sub, name: request.user.name ?? null },
      case: found.case,
      history_chain_intact: found.chain_intact,
      history,
      evidence_events: found.evidence,
    };
    const body = JSON.stringify(pack, null, 2);
    const digest = createHash('sha256').update(body).digest('hex');
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="zentra-${(found.case as any).case_number || request.params.id}-evidence.json"`);
    reply.header('X-Content-SHA256', digest);
    return reply.send(JSON.stringify({ sha256_of_pack: digest, pack }, null, 2));
  });

  // ── Ingest Event ────────────────────────────────────────────────────────────
  server.post('/events', async (request: FastifyRequest<{
    Body: {
      app_id: string;
      event_name: string;
      resource_type: string;
      resource_id: string;
      action: string;
      outcome?: 'success' | 'denied' | 'failure';
      correlation_id?: string;
      safe_summary?: string;
      safe_metadata?: Record<string, unknown>;
      idempotency_key?: string;
      use_outbox?: boolean;
    };
  }>, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const b = request.body ?? ({} as any);
    if (!b.app_id || !b.event_name || !b.resource_type || !b.resource_id || !b.action) {
      return reply.status(400).send({ error: 'Missing required event fields (app_id, event_name, resource_type, resource_id, action)' });
    }
    // This endpoint is for events a browser reports (e.g. "exported a CSV").
    // Server-side app events reach Zentra through emitDomainEvent instead,
    // which users can't forge. So: a real app id, sane names, a known
    // outcome — and the event is labelled as client-reported.
    if (!(ALL_APP_IDS as string[]).includes(b.app_id)) return reply.status(400).send({ error: `Unknown app "${b.app_id}"` });
    const NAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){0,3}$/;
    if (!NAME.test(b.event_name) || b.event_name.length > 120) return reply.status(400).send({ error: 'event_name must look like "record.exported"' });
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(b.resource_type) || String(b.resource_id).length > 128 || !/^[a-z][a-z0-9_.]{0,63}$/.test(b.action)) {
      return reply.status(400).send({ error: 'resource_type/action must be short lower-case identifiers' });
    }
    if (b.outcome && !['success', 'denied', 'failure'].includes(b.outcome)) return reply.status(400).send({ error: 'outcome must be success, denied or failure' });
    if (b.safe_metadata && JSON.stringify(b.safe_metadata).length > 4000) return reply.status(400).send({ error: 'safe_metadata is too large' });

    const eventId = await emitZentraAuditEvent({
      tenant_id: tenantId,
      app_id: b.app_id,
      event_name: b.event_name,
      actor_id: request.user.sub,
      actor_role: request.user.role,
      actor_name: request.user.name,
      actor_ip: request.ip,
      resource_type: b.resource_type,
      resource_id: b.resource_id,
      action: b.action,
      outcome: b.outcome ?? 'success',
      correlation_id: b.correlation_id,
      safe_summary: b.safe_summary?.slice(0, 500),
      safe_metadata: { ...(b.safe_metadata ?? {}), source: 'client_reported' },
      idempotency_key: b.idempotency_key ? `client:${request.user.sub}:${String(b.idempotency_key).slice(0, 80)}` : undefined,
      useOutbox: b.use_outbox ?? false,
    });

    return { success: true, event_id: eventId };
  });

  // ── Risk Signals ───────────────────────────────────────────────────────────
  server.get<{
    Querystring: {
      severity?: ZentraSeverity;
      status?: ZentraSignalStatus;
      app_id?: string;
      limit?: string;
      offset?: string;
    };
  }>('/risk/signals', { preHandler: canView }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const q = request.query;
    return getZentraRiskSignals(tenantId, {
      severity: q.severity,
      status: q.status,
      app_id: q.app_id,
      limit: q.limit ? parseInt(q.limit, 10) : 50,
      offset: q.offset ? parseInt(q.offset, 10) : 0,
    });
  });

  server.patch<{
    Params: { id: string };
    Body: { status: ZentraSignalStatus; notes: string };
  }>('/risk/signals/:id', { preHandler: canInvestigate }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    if (!UUID.test(request.params.id)) return reply.status(404).send({ error: 'Signal not found' });
    if (!SIGNAL_STATUSES.includes(request.body?.status)) return reply.status(400).send({ error: `status must be one of ${SIGNAL_STATUSES.join(', ')}` });

    const updated = await triageZentraSignal(
      tenantId,
      request.params.id,
      request.body.status,
      request.body.notes || 'Status updated',
      request.user.name || request.user.sub
    );

    if (!updated) return reply.status(404).send({ error: 'Signal not found' });
    return updated;
  });

  // ── Investigation Cases ────────────────────────────────────────────────────
  server.get<{
    Querystring: {
      status?: ZentraCaseStatus;
      severity?: ZentraSeverity;
      assigned_to?: string;
      limit?: string;
      offset?: string;
    };
  }>('/cases', { preHandler: canView }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const q = request.query;
    return getZentraCases(tenantId, {
      status: q.status,
      severity: q.severity,
      assigned_to: q.assigned_to,
      limit: q.limit ? parseInt(q.limit, 10) : 50,
      offset: q.offset ? parseInt(q.offset, 10) : 0,
    });
  });

  server.post<{
    Body: {
      title: string;
      summary: string;
      severity: ZentraSeverity;
      lead_signal_id?: string;
      evidence_event_ids?: string[];
      assigned_to_user_id?: string;
      assigned_to_name?: string;
    };
  }>('/cases', { preHandler: canInvestigate }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const b = request.body ?? ({} as any);
    if (!b.title?.trim() || !b.severity) {
      return reply.status(400).send({ error: 'A case needs a title and a severity' });
    }
    if (!SEVERITIES.includes(b.severity)) return reply.status(400).send({ error: `severity must be one of ${SEVERITIES.join(', ')}` });

    const created = await createZentraCase(tenantId, {
      title: b.title.trim().slice(0, 255),
      // The summary is optional on the form; a case still needs one on record.
      summary: b.summary?.trim() || b.title.trim(),
      severity: b.severity,
      lead_signal_id: b.lead_signal_id,
      evidence_event_ids: b.evidence_event_ids,
      assigned_to_user_id: b.assigned_to_user_id,
      assigned_to_name: b.assigned_to_name,
      created_by: request.user.name || request.user.sub,
      created_by_id: request.user.sub,
    });

    return reply.status(201).send(created);
  });

  server.get<{
    Params: { id: string };
  }>('/cases/:id', { preHandler: canView }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const result = await getZentraCaseById(tenantId, request.params.id);
    if (!result) return reply.status(404).send({ error: 'Investigation case not found' });
    return result;
  });

  server.patch<{
    Params: { id: string };
    Body: {
      status?: ZentraCaseStatus;
      severity?: ZentraSeverity;
      assigned_to_user_id?: string | null;
      assigned_to_name?: string | null;
    };
  }>('/cases/:id', { preHandler: canInvestigate }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const b = request.body ?? {};
    if (b.status && !CASE_STATUSES.includes(b.status)) return reply.status(400).send({ error: `status must be one of ${CASE_STATUSES.join(', ')}` });
    if (b.severity && !SEVERITIES.includes(b.severity)) return reply.status(400).send({ error: `severity must be one of ${SEVERITIES.join(', ')}` });
    if (b.status === 'CLOSED') return reply.status(400).send({ error: 'Close a case with Resolve, which records the outcome.' });
    const updated = await updateZentraCase(tenantId, request.params.id, {
      status: b.status, severity: b.severity,
      assigned_to_user_id: b.assigned_to_user_id, assigned_to_name: b.assigned_to_name,
      actor_name: request.user.name || request.user.sub,
      actor_id: request.user.sub,
    });

    if (!updated) return reply.status(404).send({ error: 'Investigation case not found' });
    return updated;
  });

  server.post<{
    Params: { id: string };
    Body: { note: string };
  }>('/cases/:id/notes', { preHandler: canInvestigate }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    if (!request.body?.note?.trim()) {
      return reply.status(400).send({ error: 'Note text cannot be empty' });
    }
    if (request.body.note.length > 10_000) return reply.status(400).send({ error: 'Note is too long' });

    const updated = await addZentraCaseNote(
      tenantId,
      request.params.id,
      request.user.sub,
      request.user.name || 'Investigator',
      request.body.note.trim()
    );

    if (!updated) return reply.status(404).send({ error: 'Investigation case not found' });
    return updated;
  });

  // Link more audit events to a case (recorded on the case's history).
  server.post<{
    Params: { id: string };
    Body: { event_ids: string[]; note?: string };
  }>('/cases/:id/evidence', { preHandler: canInvestigate }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const ids = Array.isArray(request.body?.event_ids) ? request.body.event_ids.filter(i => UUID.test(i)).slice(0, 200) : [];
    if (!ids.length) return reply.status(400).send({ error: 'event_ids must list audit event ids' });
    const updated = await addZentraCaseEvidence(tenantId, request.params.id, ids, {
      id: request.user.sub, name: request.user.name || request.user.sub, note: request.body.note?.slice(0, 500),
    });
    if (!updated) return reply.status(404).send({ error: 'Investigation case not found' });
    return updated;
  });

  server.post<{
    Params: { id: string };
    Body: { resolution: string; resolution_outcome: ZentraResolutionOutcome };
  }>('/cases/:id/resolve', { preHandler: canInvestigate }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    if (!request.body?.resolution?.trim() || !request.body.resolution_outcome) {
      return reply.status(400).send({ error: 'Resolution and resolution outcome are required' });
    }
    if (!OUTCOMES.includes(request.body.resolution_outcome)) return reply.status(400).send({ error: `resolution_outcome must be one of ${OUTCOMES.join(', ')}` });

    const updated = await resolveZentraCase(tenantId, request.params.id, {
      resolution: request.body.resolution.trim(),
      resolution_outcome: request.body.resolution_outcome,
      closed_by: request.user.name || request.user.sub,
      closed_by_id: request.user.sub,
    });

    if (!updated) return reply.status(404).send({ error: 'Investigation case not found' });
    return updated;
  });

  // ── Record-Level Policy Evaluation ──────────────────────────────────────────
  server.post<{
    Body: {
      action: string;
      resource_type: string;
      resource_id: string;
      owner_id?: string;
      assigned_to_user_id?: string;
      team_id?: string;
      classification?: 'public' | 'internal' | 'confidential' | 'restricted';
      amount?: number;
    };
  }>('/auth/check', { preHandler: canView }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    // A what-if test of the policy rules. For record types Zentra can load,
    // the record's real owner/assignee/amount are used — never what the
    // caller claims — and `basis` says which happened. The result is a
    // simulation: it does not grant anything in the apps themselves.
    const b = request.body ?? ({} as any);
    if (!b.action || !b.resource_type || !b.resource_id) return reply.status(400).send({ error: 'action, resource_type and resource_id are required' });
    const canonical = await loadCanonicalResource(tenantId, b.resource_type, b.resource_id);
    if (!canonical && (CANONICAL_RESOURCE_TYPES as readonly string[]).includes(b.resource_type)) {
      return reply.status(404).send({ error: `No ${b.resource_type} with that id in this workspace.` });
    }
    // "Test as" another role is allowed for the simulation only.
    const asRole = (b as any).as_role && typeof (b as any).as_role === 'string' ? (b as any).as_role : request.user.role;
    const decision = await evaluateZentraRecordAuth(
      {
        id: (b as any).as_user_id && UUID.test((b as any).as_user_id) ? (b as any).as_user_id : request.user.sub,
        role: asRole,
        team_id: (await departmentsFor(tenantId)).get((b as any).as_user_id && UUID.test((b as any).as_user_id) ? (b as any).as_user_id : request.user.sub) ?? null,
        tenant_id: tenantId,
        name: request.user.name,
      },
      b.action,
      canonical
        ? { ...canonical, classification: b.classification }
        : {
          type: b.resource_type,
          id: b.resource_id,
          owner_id: b.owner_id,
          assigned_to_user_id: b.assigned_to_user_id,
          team_id: b.team_id,
          classification: b.classification,
          amount: b.amount,
        },
      {
        tenant_id: tenantId,
        app_id: 'zentra',
        ip: request.ip,
      }
    );

    return { ...decision, simulated: true, basis: canonical ? 'record' : 'supplied_fields', record: canonical };
  });

  // ── Policies Management ────────────────────────────────────────────────────
  server.get('/policies', { preHandler: canView }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const policies = await withTenant(tenantId, trx =>
      trx.selectFrom('zentra_policies')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .execute()
    );

    return policies.map(p => ({
      ...p,
      condition_value: typeof p.condition_value === 'string' ? JSON.parse(p.condition_value) : (p.condition_value || {}),
    }));
  });

  server.post<{
    Body: {
      name: string;
      description?: string;
      resource_type: string;
      action: string;
      subject_type: 'role' | 'user' | 'team' | 'service';
      subject_id: string;
      effect: 'allow' | 'deny';
      condition_type: 'always' | 'owner_only' | 'assigned_only' | 'team_only' | 'classification_le' | 'amount_lt';
      condition_value?: Record<string, unknown>;
      enabled?: boolean;
    };
  }>('/policies', { preHandler: canAdminister }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const b = request.body ?? ({} as any);
    if (!b.name?.trim() || !b.resource_type || !b.action || !b.subject_id) return reply.status(400).send({ error: 'name, resource_type, action and subject are required' });
    if (!['role', 'user', 'team', 'service'].includes(b.subject_type)) return reply.status(400).send({ error: 'subject_type must be role, user, team or service' });
    if (!['allow', 'deny'].includes(b.effect)) return reply.status(400).send({ error: 'effect must be allow or deny' });
    if (!['always', 'owner_only', 'assigned_only', 'team_only', 'classification_le', 'amount_lt'].includes(b.condition_type)) return reply.status(400).send({ error: 'Unknown condition' });
    const inserted = await withTenant(tenantId, trx =>
      trx.insertInto('zentra_policies')
        .values({
          tenant_id: tenantId,
          name: b.name,
          description: b.description ?? null,
          resource_type: b.resource_type,
          action: b.action,
          subject_type: b.subject_type,
          subject_id: b.subject_id,
          effect: b.effect,
          condition_type: b.condition_type,
          condition_value: JSON.stringify(b.condition_value ?? {}),
          enabled: b.enabled ?? true,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    );

    return reply.status(201).send({
      ...inserted,
      condition_value: typeof inserted.condition_value === 'string' ? JSON.parse(inserted.condition_value) : (inserted.condition_value || {}),
    });
  });

  server.delete<{
    Params: { id: string };
  }>('/policies/:id', { preHandler: canAdminister }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    await withTenant(tenantId, trx =>
      trx.deleteFrom('zentra_policies')
        .where('tenant_id', '=', tenantId)
        .where('id', '=', request.params.id)
        .execute()
    );

    return { success: true };
  });

  // ── Settings ───────────────────────────────────────────────────────────────
  server.get('/settings', { preHandler: canView }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const settings = await withTenant(tenantId, async trx => {
      let row = await trx.selectFrom('zentra_settings')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!row) {
        row = await trx.insertInto('zentra_settings')
          .values({
            tenant_id: tenantId,
            retention_days: 365,
            alert_min_severity: 'HIGH',
            telemetry_monitoring_enabled: true,
            dormant_threshold_hours: 48,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      return row;
    });

    return {
      ...settings,
      monitored_apps: typeof settings.monitored_apps === 'string' ? JSON.parse(settings.monitored_apps) : (settings.monitored_apps || []),
      // The Settings screen lists and edits these (see /rules).
      rules: await listZentraRiskRules(tenantId),
    };
  });

  // ── Risk rules ─────────────────────────────────────────────────────────────
  server.get('/rules', { preHandler: canView }, async (request) => listZentraRiskRules(request.user.tenant_id));

  server.patch<{
    Params: { code: string };
    Body: { enabled?: boolean; severity?: ZentraSeverity; parameters?: Record<string, unknown> };
  }>('/rules/:code', { preHandler: canAdminister }, async (request, reply: FastifyReply) => {
    const b = request.body ?? {};
    if (b.severity && !SEVERITIES.includes(b.severity)) return reply.status(400).send({ error: `severity must be one of ${SEVERITIES.join(', ')}` });
    if (b.enabled !== undefined && typeof b.enabled !== 'boolean') return reply.status(400).send({ error: 'enabled must be true or false' });
    const r = await updateZentraRiskRule(request.user.tenant_id, request.params.code, b);
    if (r.error) return reply.status(r.error === 'Unknown rule' ? 404 : 400).send({ error: r.error });
    return r.rule;
  });

  // ── Retention purge (deletes audit events older than the retention period) ──
  server.post('/settings/purge', { preHandler: canAdminister }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const result = await enforceZentraRetention(tenantId);
    await emitZentraAuditEvent({
      tenant_id: tenantId, app_id: 'zentra', event_name: 'retention.purged', actor_id: request.user.sub,
      actor_role: request.user.role, actor_name: request.user.name, actor_ip: request.ip,
      resource_type: 'audit_log', resource_id: tenantId, action: 'purge',
      safe_summary: 'Audit events older than the retention period were purged', safe_metadata: { result: result as any },
    }).catch(() => {});
    return { success: true, result };
  });

  server.patch<{
    Body: {
      retention_days?: number;
      alert_email?: string | null;
      alert_min_severity?: ZentraSeverity;
      telemetry_monitoring_enabled?: boolean;
      dormant_threshold_hours?: number;
      legal_hold?: boolean;
    };
  }>('/settings', { preHandler: canAdminister }, async (request, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const b = request.body ?? {};
    if (b.retention_days !== undefined && (!Number.isInteger(b.retention_days) || b.retention_days < 30 || b.retention_days > 3650)) return reply.status(400).send({ error: 'Retention must be 30–3650 days' });
    if (b.dormant_threshold_hours !== undefined && (!Number.isInteger(b.dormant_threshold_hours) || b.dormant_threshold_hours < 1 || b.dormant_threshold_hours > 720)) return reply.status(400).send({ error: 'Dormant threshold must be 1–720 hours' });
    if (b.alert_min_severity && !SEVERITIES.includes(b.alert_min_severity)) return reply.status(400).send({ error: `alert_min_severity must be one of ${SEVERITIES.join(', ')}` });
    if (b.legal_hold !== undefined && typeof b.legal_hold !== 'boolean') return reply.status(400).send({ error: 'legal_hold must be true or false' });
    if (b.alert_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.alert_email)) return reply.status(400).send({ error: 'alert_email must be an email address' });

    const updated = await withTenant(tenantId, async trx => {
      const current = await trx.selectFrom('zentra_settings').select(['retention_days']).where('tenant_id', '=', tenantId).executeTakeFirst();
      // Longer retention applies now. Shorter retention waits 30 days, so
      // whoever cuts it can't erase recent evidence straight away; the
      // daily purge applies it once the wait is over.
      const retention: Record<string, unknown> = {};
      if (b.retention_days !== undefined) {
        if (!current || b.retention_days >= current.retention_days) {
          Object.assign(retention, { retention_days: b.retention_days, retention_pending_days: null, retention_pending_at: null });
        } else {
          Object.assign(retention, {
            retention_pending_days: b.retention_days,
            retention_pending_at: new Date(Date.now() + RETENTION_DECREASE_DELAY_DAYS * 86_400_000),
          });
        }
      }
      return trx.updateTable('zentra_settings')
        .set({
          ...retention,
          ...(b.alert_email !== undefined ? { alert_email: b.alert_email || null } : {}),
          ...(b.alert_min_severity !== undefined ? { alert_min_severity: b.alert_min_severity } : {}),
          ...(b.telemetry_monitoring_enabled !== undefined ? { telemetry_monitoring_enabled: b.telemetry_monitoring_enabled } : {}),
          ...(b.dormant_threshold_hours !== undefined ? { dormant_threshold_hours: b.dormant_threshold_hours } : {}),
          ...(b.legal_hold !== undefined ? { legal_hold: b.legal_hold } : {}),
          updated_at: new Date(),
        })
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
    });
    if (!updated) return reply.status(404).send({ error: 'Open Zentra settings once before changing them' });
    return updated;
  });

  // ── Outbox Process (Runner trigger) ────────────────────────────────────────
  // The scheduler drains the outbox every minute (jobs/index.ts). This
  // manual trigger touches every tenant's queue, so only the platform
  // SuperAdmin's own session may call it.
  server.post('/platform/outbox/process', async (request: FastifyRequest, reply: FastifyReply) => {
    try { assertPlatformSuperAdmin(request.user); } catch (err: any) { return reply.status(403).send({ error: err.message }); }
    return processZentraOutboxBatch(50);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SuperAdmin Platform Oversight (Strictly Gated by Platform Role)
  // ═══════════════════════════════════════════════════════════════════════════

  server.get('/platform/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      assertPlatformSuperAdmin(request.user);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const data = await getZentraPlatformOverview(request.user, request.ip);
    return data;
  });

  server.get('/platform/tenant/:tenantId', async (request: FastifyRequest<{
    Params: { tenantId: string };
    Querystring: { reason: string };
  }>, reply: FastifyReply) => {
    try {
      assertPlatformSuperAdmin(request.user);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    if (!request.query.reason) {
      return reply.status(400).send({ error: 'Recorded reason is required for cross-tenant drilldown' });
    }

    try {
      const data = await getZentraTenantDrilldown(request.user, request.params.tenantId, request.query.reason, request.ip);
      return data;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  server.post('/platform/reveal-evidence', async (request: FastifyRequest<{
    Body: { tenant_id: string; event_id: string; reason: string };
  }>, reply: FastifyReply) => {
    try {
      assertPlatformSuperAdmin(request.user);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const b = request.body;
    if (!b.tenant_id || !b.event_id || !b.reason) {
      return reply.status(400).send({ error: 'tenant_id, event_id and reason are required' });
    }

    try {
      const revealed = await revealZentraSensitiveEvidence(request.user, b.tenant_id, b.event_id, b.reason, request.ip);
      return revealed;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  server.get('/platform/audit-trail', async (request: FastifyRequest<{
    Querystring: { limit?: string; offset?: string };
  }>, reply: FastifyReply) => {
    try {
      assertPlatformSuperAdmin(request.user);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
    const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

    const [rows, countRow] = await Promise.all([
      dbPlatform.selectFrom('zentra_platform_audit')
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
      dbPlatform.selectFrom('zentra_platform_audit')
        .select(dbPlatform.fn.count<number>('id').as('count'))
        .executeTakeFirst(),
    ]);

    return {
      audits: rows.map(r => ({
        ...r,
        metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
      })),
      total: Number(countRow?.count ?? rows.length),
    };
  });
};

