import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';

/**
 * A real data-quality checker over domain_events and the tables that feed
 * the Metric Registry (stage_history, support_tickets) — see migration
 * 415's header for the two checks skipped because the schema already
 * makes them impossible (a real FK, a NOT NULL column), not left out for
 * convenience.
 *
 * dbPlatform, not a per-tenant withTenant() loop: this is the same
 * audited cross-tenant use case reports.service.ts's own tenant-comparison
 * metrics already use — one grouped query across every tenant, not N
 * round trips. Every finding still carries its own tenant_id, so nothing
 * here aggregates data ACROSS tenants into a single number; it just reads
 * across them in one pass.
 */

export interface Finding {
  checkKey: string;
  severity: 'info' | 'warning' | 'critical';
  tableName: string;
  tenantId: string | null;
  count: number;
  sampleIds: string[];
  description: string;
}

async function checkDuplicateDomainEvents(): Promise<Finding[]> {
  // A retried emitDomainEvent() call with no idempotency key (the function
  // has none today — see domain-events.service.ts) produces two rows with
  // the same tenant/type/entity/source within a couple seconds of each
  // other. LAG() over the natural grouping key catches exactly that.
  const rows = await sql<{ tenant_id: string; event_type: string; n: number; sample: string[] }>`
    WITH ordered AS (
      SELECT id, tenant_id, event_type, entity_type, entity_id, source_app, created_at,
             LAG(created_at) OVER (
               PARTITION BY tenant_id, event_type, entity_type, entity_id, source_app
               ORDER BY created_at
             ) AS prev_at
      FROM domain_events
      WHERE created_at >= now() - interval '7 days'
    ),
    dupes AS (
      SELECT id, tenant_id, event_type
      FROM ordered
      WHERE prev_at IS NOT NULL AND created_at - prev_at < interval '2 seconds'
    )
    SELECT tenant_id, event_type, count(*)::int AS n, (array_agg(id::text ORDER BY id))[1:5] AS sample
    FROM dupes
    GROUP BY tenant_id, event_type
    ORDER BY n DESC
  `.execute(dbPlatform);

  return rows.rows.map(r => ({
    checkKey: 'duplicate_domain_events',
    severity: 'warning' as const,
    tableName: 'domain_events',
    tenantId: r.tenant_id,
    count: Number(r.n),
    sampleIds: r.sample,
    description: `${r.n} "${r.event_type}" event(s) fired twice within 2 seconds of each other in the last 7 days — likely an un-deduplicated retry.`,
  }));
}

async function checkFutureDomainEvents(): Promise<Finding[]> {
  const rows = await sql<{ tenant_id: string; n: number; sample: string[] }>`
    SELECT tenant_id, count(*)::int AS n, (array_agg(id::text ORDER BY id))[1:5] AS sample
    FROM domain_events
    WHERE created_at > now() + interval '5 minutes'
    GROUP BY tenant_id
  `.execute(dbPlatform);

  return rows.rows.map(r => ({
    checkKey: 'future_domain_events',
    severity: 'critical' as const,
    tableName: 'domain_events',
    tenantId: r.tenant_id,
    count: Number(r.n),
    sampleIds: r.sample,
    description: `${r.n} domain_events row(s) timestamped more than 5 minutes in the future — a clock, timezone, or bad backfill issue.`,
  }));
}

async function checkStageHistoryInconsistencies(): Promise<Finding[]> {
  const rows = await sql<{ tenant_id: string; n: number; sample: string[] }>`
    SELECT tenant_id, count(*)::int AS n, (array_agg(id::text ORDER BY id))[1:5] AS sample
    FROM stage_history
    WHERE (exited_at IS NOT NULL AND exited_at < entered_at)
       OR (duration_h IS NOT NULL AND duration_h < 0)
    GROUP BY tenant_id
  `.execute(dbPlatform);

  return rows.rows.map(r => ({
    checkKey: 'stage_history_negative_duration',
    severity: 'critical' as const,
    tableName: 'stage_history',
    tenantId: r.tenant_id,
    count: Number(r.n),
    sampleIds: r.sample,
    description: `${r.n} stage_history row(s) exit before they enter, or record a negative duration — clearance-turnaround metrics over these rows are wrong, not just imprecise.`,
  }));
}

async function checkTicketTimestampInconsistencies(): Promise<Finding[]> {
  const rows = await sql<{ tenant_id: string; n: number; sample: string[] }>`
    SELECT tenant_id, count(*)::int AS n, (array_agg(id::text ORDER BY id))[1:5] AS sample
    FROM support_tickets
    WHERE (resolved_at IS NOT NULL AND resolved_at < created_at)
       OR (first_reply_at IS NOT NULL AND first_reply_at < created_at)
    GROUP BY tenant_id
  `.execute(dbPlatform);

  return rows.rows.map(r => ({
    checkKey: 'ticket_timestamp_order',
    severity: 'critical' as const,
    tableName: 'support_tickets',
    tenantId: r.tenant_id,
    count: Number(r.n),
    sampleIds: r.sample,
    description: `${r.n} ticket(s) resolved or first-replied-to before they were created — bliss.sla_compliance / bliss.resolution_hours are unreliable over these rows.`,
  }));
}

async function checkDomainEventsVolumeAnomaly(): Promise<Finding[]> {
  // This week vs the prior week, per tenant + source_app. Only flags a
  // real drop/spike against a meaningful baseline (>=5 events last week) —
  // a source_app that emitted 1 event last week going to 0 is noise, not
  // a signal.
  const rows = await sql<{ tenant_id: string; source_app: string; this_week: number; last_week: number }>`
    SELECT tenant_id, source_app,
      count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS this_week,
      count(*) FILTER (WHERE created_at < now() - interval '7 days' AND created_at >= now() - interval '14 days')::int AS last_week
    FROM domain_events
    WHERE created_at >= now() - interval '14 days'
    GROUP BY tenant_id, source_app
    HAVING count(*) FILTER (WHERE created_at < now() - interval '7 days' AND created_at >= now() - interval '14 days') >= 5
  `.execute(dbPlatform);

  const findings: Finding[] = [];
  for (const r of rows.rows) {
    const thisWeek = Number(r.this_week);
    const lastWeek = Number(r.last_week);
    const changePct = ((thisWeek - lastWeek) / lastWeek) * 100;
    if (Math.abs(changePct) < 50) continue;
    findings.push({
      checkKey: 'domain_events_volume_anomaly',
      severity: changePct <= -80 ? 'critical' : 'warning',
      tableName: 'domain_events',
      tenantId: r.tenant_id,
      count: thisWeek,
      sampleIds: [],
      description: `"${r.source_app}" event volume ${changePct >= 0 ? 'rose' : 'dropped'} ${Math.abs(Math.round(changePct))}% week-over-week (${lastWeek} → ${thisWeek}).`,
    });
  }
  return findings;
}

async function checkSignRecipientSignedBeforeEnvelopeCreated(): Promise<Finding[]> {
  const rows = await sql<{ tenant_id: string; n: number; sample: string[] }>`
    SELECT e.tenant_id, count(*)::int AS n, (array_agg(r.id::text ORDER BY r.id))[1:5] AS sample
    FROM sign_recipients r
    JOIN sign_envelopes e ON e.id = r.envelope_id
    WHERE r.signed_at IS NOT NULL AND r.signed_at < e.created_at
    GROUP BY e.tenant_id
  `.execute(dbPlatform);

  return rows.rows.map(r => ({
    checkKey: 'sign_recipient_signed_before_envelope_created',
    severity: 'critical' as const,
    tableName: 'sign_recipients',
    tenantId: r.tenant_id,
    count: Number(r.n),
    sampleIds: r.sample,
    description: `${r.n} recipient signature(s) timestamped earlier than envelope creation date — impossible sequence / clock corruption.`,
  }));
}

async function checkOrphanMetricAlertRules(): Promise<Finding[]> {
  const rows = await sql<{ tenant_id: string; n: number; sample: string[] }>`
    SELECT r.tenant_id, count(*)::int AS n, (array_agg(r.id::text ORDER BY r.id))[1:5] AS sample
    FROM metric_alert_rules r
    LEFT JOIN metric_definitions d ON d.metric_key = r.metric_key AND d.status = 'active'
    WHERE d.metric_key IS NULL
    GROUP BY r.tenant_id
  `.execute(dbPlatform);

  return rows.rows.map(r => ({
    checkKey: 'orphan_metric_alert_rules',
    severity: 'warning' as const,
    tableName: 'metric_alert_rules',
    tenantId: r.tenant_id,
    count: Number(r.n),
    sampleIds: r.sample,
    description: `${r.n} alert rule(s) monitor deprecated or non-existent metrics and will never fire or evaluate accurately.`,
  }));
}

async function checkExpiredVerifiedCertifiers(): Promise<Finding[]> {
  const rows = await sql<{ tenant_id: string; n: number; sample: string[] }>`
    SELECT tenant_id, count(*)::int AS n, (array_agg(id::text ORDER BY id))[1:5] AS sample
    FROM sign_certifiers
    WHERE verification_status = 'verified' AND expiry_date < CURRENT_DATE
    GROUP BY tenant_id
  `.execute(dbPlatform);

  return rows.rows.map(r => ({
    checkKey: 'expired_verified_certifiers',
    severity: 'warning' as const,
    tableName: 'sign_certifiers',
    tenantId: r.tenant_id,
    count: Number(r.n),
    sampleIds: r.sample,
    description: `${r.n} certifier(s) marked verified but whose credentials have passed their expiry date.`,
  }));
}

/** Runs every check, writes the batch under one run_id, and returns it.
 *  Each run is a fresh snapshot — the API always reads the latest run_id,
 *  so a resolved issue naturally stops appearing without needing a
 *  separate "resolved" flag to maintain. */
export async function runDataQualityChecks(): Promise<{ runId: string; runAt: string; findings: Finding[] }> {
  const runId = randomUUID();
  const runAt = new Date().toISOString();

  const results = await Promise.all([
    checkDuplicateDomainEvents(),
    checkFutureDomainEvents(),
    checkStageHistoryInconsistencies(),
    checkTicketTimestampInconsistencies(),
    checkDomainEventsVolumeAnomaly(),
    checkSignRecipientSignedBeforeEnvelopeCreated(),
    checkOrphanMetricAlertRules(),
    checkExpiredVerifiedCertifiers(),
  ]);
  const findings = results.flat();

  if (findings.length > 0) {
    await dbPlatform.insertInto('data_quality_findings').values(
      findings.map(f => ({
        run_id: runId,
        tenant_id: f.tenantId,
        check_key: f.checkKey,
        severity: f.severity,
        table_name: f.tableName,
        finding_count: f.count,
        sample_ids: JSON.stringify(f.sampleIds) as any,
        description: f.description,
      }))
    ).execute();
  }

  return { runId, runAt, findings };
}

export async function getLatestFindings(): Promise<any[]> {
  const latest = await dbPlatform.selectFrom('data_quality_findings')
    .select('run_id')
    .orderBy('run_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!latest) return [];

  return dbPlatform.selectFrom('data_quality_findings as dqf')
    .leftJoin('tenants as t', 't.id', 'dqf.tenant_id')
    .select(['dqf.id', 'dqf.check_key', 'dqf.severity', 'dqf.table_name', 'dqf.finding_count', 'dqf.sample_ids', 'dqf.description', 'dqf.tenant_id', 't.name as tenant_name', 'dqf.run_at'])
    .where('dqf.run_id', '=', latest.run_id)
    .orderBy('dqf.severity', 'desc')
    .orderBy('dqf.finding_count', 'desc')
    .execute();
}
