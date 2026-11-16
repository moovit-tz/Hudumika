import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { ALL_APP_IDS } from '@hudumika/types';
import { tenantHasEntitlement } from '../middleware/entitlement.js';
import type { JWTPayload } from '@hudumika/types';
import type {
  ZentraPlatformOverviewData,
  ZentraRiskSignal,
  ZentraAppTelemetryHealth,
  ZentraPlatformAudit,
  ZentraAuditEvent,
} from '@hudumika/types';

export interface PlatformAuditInput {
  actor_user_id?: string;
  actor_name: string;
  actor_email: string;
  action: string;
  target_tenant_id?: string;
  target_tenant_name?: string;
  target_resource_type?: string;
  target_resource_id?: string;
  reason?: string;
  ip_address?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record an immutable entry in the platform oversight audit log.
 */
export async function recordZentraPlatformAudit(input: PlatformAuditInput): Promise<string> {
  const row = await dbPlatform.insertInto('zentra_platform_audit')
    .values({
      actor_user_id: input.actor_user_id ?? null,
      actor_name: input.actor_name,
      actor_email: input.actor_email,
      action: input.action,
      target_tenant_id: input.target_tenant_id ?? null,
      target_tenant_name: input.target_tenant_name ?? null,
      target_resource_type: input.target_resource_type ?? null,
      target_resource_id: input.target_resource_id ?? null,
      reason: input.reason ?? null,
      ip_address: input.ip_address ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return row.id;
}

/**
 * Verify that the user is an authorized platform SuperAdmin.
 * Throws 403 otherwise.
 */
/**
 * Cross-tenant oversight needs the platform role itself, in a session that is
 * not impersonating anyone. An impersonation token carries the impersonated
 * user's role (and impersonated_by), so accepting impersonated_by here let
 * a support session act as platform oversight from inside a customer's
 * identity. SuperAdmin must use their own session for this.
 */
export function assertPlatformSuperAdmin(user: JWTPayload): void {
  if (user.role !== 'SUPER_ADMIN' || user.impersonated_by) {
    throw new Error('Forbidden: cross-tenant oversight needs the platform SuperAdmin\'s own session (not an impersonation session).');
  }
}

/**
 * SuperAdmin platform overview across all tenants and apps.
 */
export async function getZentraPlatformOverview(
  actor: JWTPayload,
  ip?: string
): Promise<ZentraPlatformOverviewData> {
  assertPlatformSuperAdmin(actor);

  // Record oversight audit entry
  await recordZentraPlatformAudit({
    actor_user_id: actor.sub,
    actor_name: actor.name || 'Platform Administrator',
    actor_email: actor.email,
    action: 'oversight.viewed',
    reason: 'Viewing cross-tenant trust & risk platform overview',
    ip_address: ip,
  });

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    eventCountRow,
    highRiskRow,
    openCasesRow,
    tenantsWithAnomaliesRow,
    recentSignals,
    recentPlatformAudits,
    telemetryHealth,
  ] = await Promise.all([
    // Total cross-tenant events in 24h
    dbPlatform.selectFrom('zentra_audit_events')
      .select(dbPlatform.fn.count<number>('id').as('count'))
      .where('created_at', '>=', oneDayAgo)
      .executeTakeFirst(),

    // Total high/critical signals
    dbPlatform.selectFrom('zentra_risk_signals')
      .select(dbPlatform.fn.count<number>('id').as('count'))
      .where('severity', 'in', ['HIGH', 'CRITICAL'])
      .where('status', 'in', ['NEW', 'TRIAGED', 'CASE_OPEN'])
      .executeTakeFirst(),

    // Open cases across all tenants
    dbPlatform.selectFrom('zentra_investigation_cases')
      .select(dbPlatform.fn.count<number>('id').as('count'))
      .where('status', 'in', ['OPEN', 'INVESTIGATING', 'REMEDIATION'])
      .executeTakeFirst(),

    // Distinct tenants with anomalies
    dbPlatform.selectFrom('zentra_risk_signals')
      .select(dbPlatform.fn.count<number>('tenant_id').distinct().as('count'))
      .where('status', 'in', ['NEW', 'TRIAGED', 'CASE_OPEN'])
      .executeTakeFirst(),

    // Prioritized risk signals with tenant name
    dbPlatform.selectFrom('zentra_risk_signals as s')
      .leftJoin('tenants as t', 't.id', 's.tenant_id')
      .select([
        's.id', 's.tenant_id', 's.app_id', 's.rule_code', 's.title', 's.description',
        's.severity', 's.status', 's.actor_id', 's.actor_name', 's.resource_type',
        's.resource_id', 's.evidence_event_ids', 's.evidence_summary', 's.created_at',
        's.updated_at', 't.name as tenant_name',
      ])
      .where('s.status', 'in', ['NEW', 'TRIAGED', 'CASE_OPEN'])
      .orderBy('s.severity', 'desc')
      .orderBy('s.created_at', 'desc')
      .limit(20)
      .execute(),

    // Recent platform oversight audits
    dbPlatform.selectFrom('zentra_platform_audit')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(15)
      .execute(),

    // Telemetry gaps
    getZentraPlatformTelemetryHealthInternal(),
  ]);

  const riskQueue: Array<ZentraRiskSignal & { tenant_name?: string }> = recentSignals.map(r => ({
    id: r.id,
    tenant_id: r.tenant_id,
    app_id: r.app_id,
    rule_code: r.rule_code,
    title: r.title,
    description: r.description,
    severity: r.severity as any,
    status: r.status as any,
    actor_id: r.actor_id,
    actor_name: r.actor_name,
    resource_type: r.resource_type,
    resource_id: r.resource_id,
    evidence_event_ids: typeof r.evidence_event_ids === 'string' ? JSON.parse(r.evidence_event_ids) : (r.evidence_event_ids || []),
    evidence_summary: r.evidence_summary,
    created_at: r.created_at,
    updated_at: r.updated_at,
    tenant_name: r.tenant_name || undefined,
  }));

  const platformAudits: ZentraPlatformAudit[] = recentPlatformAudits.map(r => ({
    id: r.id,
    actor_user_id: r.actor_user_id,
    actor_name: r.actor_name,
    actor_email: r.actor_email,
    action: r.action,
    target_tenant_id: r.target_tenant_id,
    target_tenant_name: r.target_tenant_name,
    target_resource_type: r.target_resource_type,
    target_resource_id: r.target_resource_id,
    reason: r.reason,
    ip_address: r.ip_address,
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
    created_at: r.created_at,
  }));

  return {
    cross_tenant_events_24h: Number(eventCountRow?.count ?? 0),
    cross_tenant_high_risk_signals: Number(highRiskRow?.count ?? 0),
    cross_tenant_open_cases: Number(openCasesRow?.count ?? 0),
    tenants_with_active_anomalies: Number(tenantsWithAnomaliesRow?.count ?? 0),
    risk_queue: riskQueue,
    telemetry_gaps: telemetryHealth,
    platform_audits_recent: platformAudits,
  };
}

/**
 * Tenant drill-down for authorized SuperAdmin with mandatory recorded justification.
 */
export async function getZentraTenantDrilldown(
  actor: JWTPayload,
  targetTenantId: string,
  reason: string,
  ip?: string
): Promise<{
  tenant: { id: string; name: string };
  events: { id: string; app_id: string; event_name: string; resource_type: string; action: string; outcome: string; created_at: Date }[];
  events_count: number;
  signals: ZentraRiskSignal[];
  cases: any[];
  telemetry: ZentraAppTelemetryHealth[];
}> {
  assertPlatformSuperAdmin(actor);
  if (!reason || reason.trim().length < 5) {
    throw new Error('Explicit reason (at least 5 characters) is required for cross-tenant drilldown');
  }

  // A malformed id is "not found", not a database error.
  const tenant = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetTenantId)
    ? await dbPlatform.selectFrom('tenants').select(['id', 'name']).where('id', '=', targetTenantId).executeTakeFirst()
    : undefined;

  if (!tenant) {
    throw new Error(`Target tenant '${targetTenantId}' not found`);
  }

  // Record drilldown in platform audit
  await recordZentraPlatformAudit({
    actor_user_id: actor.sub,
    actor_name: actor.name || 'Platform Administrator',
    actor_email: actor.email,
    action: 'oversight.drilldown',
    target_tenant_id: tenant.id,
    target_tenant_name: tenant.name,
    reason,
    ip_address: ip,
  });

  return withTenant(tenant.id, async trx => {
    const [eventsCountRow, signalsRows, casesRows, recentEvents] = await Promise.all([
      trx.selectFrom('zentra_audit_events')
        .select(trx.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenant.id)
        .executeTakeFirst(),

      trx.selectFrom('zentra_risk_signals')
        .selectAll()
        .where('tenant_id', '=', tenant.id)
        .orderBy('created_at', 'desc')
        .limit(20)
        .execute(),

      trx.selectFrom('zentra_investigation_cases')
        .selectAll()
        .where('tenant_id', '=', tenant.id)
        .orderBy('created_at', 'desc')
        .limit(20)
        .execute(),

      // Recent events, redacted: what happened and where, but not who or the
      // metadata. Seeing those is a separate, separately-audited reveal.
      trx.selectFrom('zentra_audit_events')
        .select(['id', 'app_id', 'event_name', 'resource_type', 'action', 'outcome', 'created_at'])
        .where('tenant_id', '=', tenant.id)
        .orderBy('created_at', 'desc')
        .limit(30)
        .execute(),
    ]);

    const telemetry = await getZentraTenantTelemetryHealth(tenant.id);

    return {
      tenant: { id: tenant.id, name: tenant.name },
      events: recentEvents,
      events_count: Number(eventsCountRow?.count ?? 0),
      signals: signalsRows.map(r => ({
        id: r.id,
        tenant_id: r.tenant_id,
        app_id: r.app_id,
        rule_code: r.rule_code,
        title: r.title,
        description: r.description,
        severity: r.severity as any,
        status: r.status as any,
        actor_id: r.actor_id,
        actor_name: r.actor_name,
        resource_type: r.resource_type,
        resource_id: r.resource_id,
        evidence_event_ids: typeof r.evidence_event_ids === 'string' ? JSON.parse(r.evidence_event_ids) : (r.evidence_event_ids || []),
        evidence_summary: r.evidence_summary,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      cases: casesRows,
      telemetry,
    };
  });
}

/**
 * Reveal sensitive evidence details for an event with recorded justification.
 */
export async function revealZentraSensitiveEvidence(
  actor: JWTPayload,
  targetTenantId: string,
  eventId: string,
  reason: string,
  ip?: string
): Promise<ZentraAuditEvent> {
  assertPlatformSuperAdmin(actor);
  if (!reason || reason.trim().length < 8) {
    throw new Error('A detailed justification (at least 8 characters) is required to reveal sensitive evidence');
  }

  const event = await withTenant(targetTenantId, trx =>
    trx.selectFrom('zentra_audit_events')
      .selectAll()
      .where('tenant_id', '=', targetTenantId)
      .where('id', '=', eventId)
      .executeTakeFirst()
  );

  if (!event) {
    throw new Error(`Audit event '${eventId}' not found in tenant '${targetTenantId}'`);
  }

  // Record reveal action in immutable platform audit
  await recordZentraPlatformAudit({
    actor_user_id: actor.sub,
    actor_name: actor.name || 'Platform Administrator',
    actor_email: actor.email,
    action: 'evidence.revealed',
    target_tenant_id: targetTenantId,
    target_resource_type: event.resource_type,
    target_resource_id: event.resource_id,
    reason,
    ip_address: ip,
    metadata: {
      event_id: event.id,
      event_name: event.event_name,
      revealed_at: new Date().toISOString(),
    },
  });

  return {
    id: event.id,
    tenant_id: event.tenant_id,
    app_id: event.app_id,
    event_name: event.event_name,
    actor_id: event.actor_id,
    actor_role: event.actor_role,
    actor_name: event.actor_name,
    actor_ip: event.actor_ip,
    actor_user_agent: event.actor_user_agent,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
    action: event.action,
    outcome: event.outcome,
    correlation_id: event.correlation_id,
    schema_version: event.schema_version,
    safe_summary: event.safe_summary,
    safe_metadata: typeof event.safe_metadata === 'string' ? JSON.parse(event.safe_metadata) : (event.safe_metadata || {}),
    created_at: event.created_at,
  };
}

/** Apps that do business work worth auditing — the shared registry minus shell/infrastructure entries. */
const NOT_MONITORED = new Set(['workspace', 'admin', 'developer', 'lens', 'zentra', 'store']);
const APP_NAMES: Record<string, string> = {
  clearos: 'ClearOS', finops: 'FinOps', complyos: 'ComplyOS', bliss: 'Bliss', nexushr: 'Axis', onesite: 'OneSite',
  onsite: 'Onsite', ondi: 'Ondi', tracking: 'HuduFreight', cloud: 'Drive', email: 'Email', crm: 'CRM', contacts: 'Contacts',
  calendar: 'Calendar', tasks: 'Tasks', notes: 'Notes', sign: 'Sign', sms: 'SMS', demurrage: 'Demurrage',
  cargotracker: 'CargoTracker', seal: 'SEAL', studio: 'Studio', hudubi: 'HuduBI', petti: 'Petti', pos: 'POS',
  projects: 'Projects', travel: 'Travel', tuma: 'Tuma', lexcore: 'LexCore', ngao: 'Ngao', gereji: 'Gereji',
};
export const MONITORED_APP_IDS = ALL_APP_IDS.filter(a => !NOT_MONITORED.has(a));
const appName = (id: string) => APP_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

/**
 * Telemetry health for one tenant: every app in the shared registry that this
 * tenant is entitled to, judged against the tenant's own dormant threshold
 * (Zentra → Settings). An app the tenant doesn't have is not a gap.
 */
export async function getZentraTenantTelemetryHealth(tenantId: string): Promise<ZentraAppTelemetryHealth[]> {
  const entitled = (await Promise.all(MONITORED_APP_IDS.map(async a => [a, await tenantHasEntitlement(tenantId, a).catch(() => false)] as const)))
    .filter(([, ok]) => ok).map(([a]) => a);
  if (!entitled.length) return [];
  return withTenant(tenantId, async trx => {
    const settings = await trx.selectFrom('zentra_settings').select('dormant_threshold_hours').where('tenant_id', '=', tenantId).executeTakeFirst();
    const dormantMs = (Number(settings?.dormant_threshold_hours) || 48) * 3_600_000;
    const rows = await trx.selectFrom('zentra_audit_events')
      .select(['app_id', sql<Date>`max(created_at)`.as('last'), sql<number>`count(*) FILTER (WHERE created_at >= now() - interval '24 hours')`.as('n24')])
      .where('tenant_id', '=', tenantId).where('app_id', 'in', entitled).groupBy('app_id').execute();
    const by = new Map(rows.map(r => [r.app_id, r]));
    const now = Date.now();
    return entitled.map(app_id => {
      const r = by.get(app_id);
      const last = r?.last ? new Date(r.last) : null;
      return {
        app_id, name: appName(app_id),
        last_event_at: last ? last.toISOString() : null,
        event_count_24h: Number(r?.n24 ?? 0),
        status: !last ? 'missing' : now - last.getTime() > dormantMs ? 'dormant' : 'healthy',
        lag_seconds: last ? Math.round((now - last.getTime()) / 1000) : undefined,
      } as ZentraAppTelemetryHealth;
    }).sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'healthy' ? 1 : -1));
  });
}

/**
 * Platform-wide telemetry, per app, counted per tenant: a tenant that used
 * an app in the last 7 days (it wrote domain events) but sent Zentra no
 * telemetry in the last 48 hours is a silent tenant. One busy tenant can no
 * longer make an app look healthy while another tenant's feed is dead.
 */
async function getZentraPlatformTelemetryHealthInternal(): Promise<(ZentraAppTelemetryHealth & { tenants_active: number; tenants_silent: number })[]> {
  const active = await sql<{ app: string; tenant_id: string }>`
    SELECT DISTINCT source_app AS app, tenant_id FROM domain_events
    WHERE created_at >= now() - interval '7 days' AND source_app = ANY(${MONITORED_APP_IDS}::text[])`.execute(dbPlatform);
  const reporting = await sql<{ app: string; tenant_id: string; last: Date; n24: number }>`
    SELECT app_id AS app, tenant_id, max(created_at) AS last,
           count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS n24
    FROM zentra_audit_events WHERE created_at >= now() - interval '7 days'
    GROUP BY app_id, tenant_id`.execute(dbPlatform);
  const fresh = new Map(reporting.rows.map(r => [`${r.app}|${r.tenant_id}`, r]));
  const cutoff = Date.now() - 48 * 3_600_000;
  return MONITORED_APP_IDS.map(app_id => {
    const tenants = active.rows.filter(r => r.app === app_id).map(r => r.tenant_id);
    const rep = reporting.rows.filter(r => r.app === app_id);
    const silent = tenants.filter(t => { const f = fresh.get(`${app_id}|${t}`); return !f || new Date(f.last).getTime() < cutoff; }).length;
    const last = rep.reduce<Date | null>((m, r) => (!m || new Date(r.last) > m ? new Date(r.last) : m), null);
    return {
      app_id, name: appName(app_id),
      last_event_at: last ? last.toISOString() : null,
      event_count_24h: rep.reduce((a, r) => a + Number(r.n24), 0),
      status: !tenants.length && !rep.length ? 'missing' : silent > 0 ? 'dormant' : 'healthy',
      tenants_active: tenants.length,
      tenants_silent: silent,
    } as ZentraAppTelemetryHealth & { tenants_active: number; tenants_silent: number };
  }).filter(a => a.tenants_active > 0 || a.event_count_24h > 0 || a.last_event_at);
}

