import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import type { ZentraAuditEvent, ZentraAuditEventInput, ZentraOutcome } from '@hudumika/types';
import { evaluateZentraRiskRulesForEvent } from './zentra-risk.service.js';

const SENSITIVE_KEY_REGEX = /(password|token|secret|api_key|credential|auth_header|private_key|pin|cvv)/i;

/**
 * Sanitize metadata to guarantee no credentials, secrets or unredacted passwords are recorded.
 */
export function sanitizeSafeMetadata(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const clean: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(input)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      clean[key] = '[REDACTED]';
      continue;
    }
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      clean[key] = sanitizeSafeMetadata(val as Record<string, unknown>);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

export interface EmitEventOptions {
  tenant_id: string;
  app_id: string;
  event_name: string;
  actor_id: string;
  actor_role?: string;
  actor_name?: string;
  actor_ip?: string;
  actor_user_agent?: string;
  resource_type: string;
  resource_id: string;
  action: string;
  outcome?: ZentraOutcome;
  correlation_id?: string;
  schema_version?: string;
  safe_summary?: string;
  safe_metadata?: Record<string, unknown>;
  idempotency_key?: string;
  useOutbox?: boolean;
}

/**
 * Emit an audit event.
 * If useOutbox is true, queues the event in the transactional outbox table for asynchronous decoupled processing.
 * Otherwise, records directly in zentra_audit_events and synchronously evaluates risk rules.
 */
export async function emitZentraAuditEvent(options: EmitEventOptions): Promise<string> {
  const {
    tenant_id,
    app_id,
    event_name,
    actor_id,
    actor_role,
    actor_name,
    actor_ip,
    actor_user_agent,
    resource_type,
    resource_id,
    action,
    outcome = 'success',
    correlation_id,
    schema_version = 'v1',
    safe_summary,
    safe_metadata = {},
    idempotency_key,
    useOutbox = false,
  } = options;

  const sanitizedMetadata = sanitizeSafeMetadata(safe_metadata);

  if (useOutbox) {
    const row = await withTenant(tenant_id, trx =>
      trx.insertInto('zentra_event_outbox')
        .values({
          tenant_id,
          app_id,
          event_name,
          payload: JSON.stringify({
            tenant_id,
            app_id,
            event_name,
            actor_id,
            actor_role,
            actor_name,
            actor_ip,
            actor_user_agent,
            resource_type,
            resource_id,
            action,
            outcome,
            correlation_id,
            schema_version,
            safe_summary,
            safe_metadata: sanitizedMetadata,
          }),
          status: 'pending',
          idempotency_key: idempotency_key ?? null,
        })
        .onConflict(oc => oc.column('idempotency_key').doNothing())
        .returning('id')
        .executeTakeFirst()
    );
    return row?.id ?? 'idempotent-duplicate';
  }

  // Direct commit to immutable audit trail
  const inserted = await withTenant(tenant_id, trx =>
    trx.insertInto('zentra_audit_events')
      .values({
        tenant_id,
        app_id,
        event_name,
        actor_id,
        actor_role: actor_role ?? null,
        actor_name: actor_name ?? null,
        actor_ip: actor_ip ?? null,
        actor_user_agent: actor_user_agent ?? null,
        resource_type,
        resource_id,
        action,
        outcome,
        correlation_id: correlation_id ?? null,
        schema_version,
        safe_summary: safe_summary ?? null,
        safe_metadata: JSON.stringify(sanitizedMetadata),
      })
      .returningAll()
      .executeTakeFirstOrThrow()
  );

  // Evaluate risk rules against the committed audit event asynchronously
  void evaluateZentraRiskRulesForEvent(inserted).catch(() => {});

  return inserted.id;
}

export interface ZentraAuditQueryFilters {
  app_id?: string;
  actor_id?: string;
  event_name?: string;
  resource_type?: string;
  resource_id?: string;
  outcome?: ZentraOutcome;
  search?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

/**
 * Retrieve audit events for a tenant with strict scoping and search filtering.
 */
export async function getZentraAuditEvents(
  tenantId: string,
  filters: ZentraAuditQueryFilters = {}
): Promise<{ events: ZentraAuditEvent[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  return withTenant(tenantId, async trx => {
    let query = trx.selectFrom('zentra_audit_events')
      .selectAll()
      .where('tenant_id', '=', tenantId);

    if (filters.app_id) {
      query = query.where('app_id', '=', filters.app_id);
    }
    if (filters.actor_id) {
      query = query.where('actor_id', '=', filters.actor_id);
    }
    if (filters.event_name) {
      query = query.where('event_name', '=', filters.event_name);
    }
    if (filters.resource_type) {
      query = query.where('resource_type', '=', filters.resource_type);
    }
    if (filters.resource_id) {
      query = query.where('resource_id', '=', filters.resource_id);
    }
    if (filters.outcome) {
      query = query.where('outcome', '=', filters.outcome);
    }
    if (filters.start_date) {
      query = query.where('created_at', '>=', new Date(filters.start_date));
    }
    if (filters.end_date) {
      query = query.where('created_at', '<=', new Date(filters.end_date));
    }
    if (filters.search) {
      const q = `%${filters.search.toLowerCase()}%`;
      query = query.where(eb =>
        eb.or([
          eb('event_name', 'ilike', q),
          eb('resource_type', 'ilike', q),
          eb('resource_id', 'ilike', q),
          eb('actor_name', 'ilike', q),
          eb('safe_summary', 'ilike', q),
        ])
      );
    }

    const [rows, countRow] = await Promise.all([
      query.orderBy('created_at', 'desc').limit(limit).offset(offset).execute(),
      trx.selectFrom('zentra_audit_events')
        .select(trx.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst(),
    ]);

    const events: ZentraAuditEvent[] = rows.map(r => ({
      id: r.id,
      tenant_id: r.tenant_id,
      app_id: r.app_id,
      event_name: r.event_name,
      actor_id: r.actor_id,
      actor_role: r.actor_role,
      actor_name: r.actor_name,
      actor_ip: r.actor_ip,
      actor_user_agent: r.actor_user_agent,
      resource_type: r.resource_type,
      resource_id: r.resource_id,
      action: r.action,
      outcome: r.outcome,
      correlation_id: r.correlation_id,
      schema_version: r.schema_version,
      safe_summary: r.safe_summary,
      safe_metadata: typeof r.safe_metadata === 'string' ? JSON.parse(r.safe_metadata) : (r.safe_metadata || {}),
      created_at: r.created_at,
    }));

    return {
      events,
      total: Number(countRow?.count ?? rows.length),
    };
  });
}

/** How long a requested cut to the retention period waits before it applies. */
export const RETENTION_DECREASE_DELAY_DAYS = 30;

/**
 * Enforce the retention period for one tenant. Never deletes:
 *  - anything while a legal hold is on;
 *  - an event linked as evidence to any case (open or closed) or to a
 *    signal that is still open;
 *  - anything newer than the retention period. A shorter period someone
 *    asked for only counts once its 30-day wait has passed, so whoever
 *    changes it can't erase recent evidence the same day.
 * The audit log refuses DELETE unless zentra.allow_purge is set for the
 * transaction (migration 767), so this is the only way events are removed.
 */
export async function enforceZentraRetention(tenantId: string): Promise<number> {
  return withTenant(tenantId, async trx => {
    let settings = await trx.selectFrom('zentra_settings')
      .select(['retention_days', 'legal_hold', 'retention_pending_days', 'retention_pending_at'])
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    // No settings row: the workspace never opened Zentra's settings — use the defaults.
    if (!settings) settings = { retention_days: 365, legal_hold: false, retention_pending_days: null, retention_pending_at: null };
    if (settings.retention_pending_days && settings.retention_pending_at && new Date(settings.retention_pending_at) <= new Date()) {
      await trx.updateTable('zentra_settings')
        .set({ retention_days: settings.retention_pending_days, retention_pending_days: null, retention_pending_at: null, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).execute();
      settings = { ...settings, retention_days: settings.retention_pending_days, retention_pending_days: null, retention_pending_at: null };
    }
    if (settings.legal_hold) return 0;

    const days = settings.retention_days ?? 365;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await sql`SELECT set_config('zentra.allow_purge', 'on', true)`.execute(trx);
    const result = await sql`
      DELETE FROM zentra_audit_events e
      WHERE e.tenant_id = ${tenantId} AND e.created_at < ${cutoff}
        AND NOT EXISTS (SELECT 1 FROM zentra_investigation_cases c
                        WHERE c.tenant_id = e.tenant_id AND c.evidence_event_ids ? e.id::text)
        AND NOT EXISTS (SELECT 1 FROM zentra_risk_signals s
                        WHERE s.tenant_id = e.tenant_id AND s.status IN ('NEW', 'TRIAGED', 'CASE_OPEN')
                          AND s.evidence_event_ids ? e.id::text)`.execute(trx);
    await sql`SELECT set_config('zentra.allow_purge', 'off', true)`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  });
}

/** Daily: apply every tenant's retention period (scheduled in jobs/index.ts). */
export async function runZentraRetentionJob(): Promise<void> {
  // Every workspace holding events older than the shortest allowed period.
  const tenants = await dbPlatform.selectFrom('zentra_audit_events').select('tenant_id').distinct()
    .where('created_at', '<', new Date(Date.now() - 30 * 86_400_000)).execute();
  for (const t of tenants) {
    await enforceZentraRetention(t.tenant_id).catch(err => console.warn(`[Zentra retention] ${t.tenant_id}: ${err?.message}`));
  }
}

