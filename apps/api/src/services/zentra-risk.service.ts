import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import { alertZentraSignals, type AlertableSignal } from './zentra-alerts.service.js';
import type { ZentraRiskSignal, ZentraSeverity, ZentraSignalStatus } from '@hudumika/types';

export interface AuditEventRow {
  id: string;
  tenant_id: string;
  app_id: string;
  event_name: string;
  actor_id: string;
  actor_role: string | null;
  actor_name: string | null;
  resource_type: string;
  resource_id: string;
  action: string;
  outcome: string;
  safe_summary: string | null;
  safe_metadata: unknown;
  created_at: Date;
}

/**
 * Standard default risk rules seeded when a tenant initializes Zentra
 */
export const DEFAULT_RISK_RULES = [
  {
    code: 'RULE_REPEATED_ACCESS_DENIED',
    name: 'Repeated Authorization Denials',
    description: 'Multiple access denial events detected from the same user within a short time window.',
    category: 'access_control' as const,
    severity: 'HIGH' as const,
    parameters: { threshold: 3, window_minutes: 15 },
  },
  {
    code: 'RULE_UNUSUAL_BULK_EXPORT',
    name: 'Unusual Bulk Data Export',
    description: 'Bulk download or export of sensitive organizational records.',
    category: 'data_exfiltration' as const,
    severity: 'HIGH' as const,
    parameters: { count_threshold: 50 },
  },
  {
    code: 'RULE_PRIVILEGE_ELEVATION_SENSITIVE_ACCESS',
    name: 'Privilege Elevation with Rapid Sensitive Access',
    description: 'Actor role elevated or modified followed quickly by access to restricted financial or compliance records.',
    category: 'privilege' as const,
    severity: 'CRITICAL' as const,
    parameters: { window_hours: 1 },
  },
  {
    code: 'RULE_HIGH_VALUE_FINANCE_APPROVAL',
    name: 'High-Value Financial Approval',
    description: 'Financial approval or payment release exceeding organizational risk thresholds.',
    category: 'financial' as const,
    severity: 'MEDIUM' as const,
    parameters: { amount_threshold: 10000 },
  },
  {
    code: 'RULE_TELEMETRY_GAP',
    name: 'Telemetry Ingestion Gap',
    description: 'Monitored Hudumika business application has not emitted audit telemetry within the expected threshold.',
    category: 'telemetry' as const,
    severity: 'MEDIUM' as const,
    parameters: { dormant_hours: 48 },
  },
];

/**
 * Ensure default rules are seeded for a tenant.
 */
/** Role changes as the apps emit them (HR, Ondi) plus the generic names. */
const ROLE_CHANGE_EVENTS = ['role.changed', 'user.role_changed', 'hr.staff_role_changed'];
/** Resource types whose access soon after a role change is worth a look. */
const SENSITIVE_RESOURCES = new Set([
  'declaration', 'invoice', 'bill', 'salary', 'payroll', 'payroll_run', 'payslip', 'employee',
  'expense', 'expense_report', 'petti_withdrawal', 'customer_pii',
]);

export async function ensureDefaultZentraRules(tenantId: string): Promise<void> {
  await withTenant(tenantId, async trx => {
    for (const rule of DEFAULT_RISK_RULES) {
      await trx.insertInto('zentra_risk_rules')
        .values({
          tenant_id: tenantId,
          code: rule.code,
          name: rule.name,
          description: rule.description,
          category: rule.category,
          severity: rule.severity,
          parameters: JSON.stringify(rule.parameters),
          enabled: true,
        })
        .onConflict(oc => oc.columns(['tenant_id', 'code']).doNothing())
        .execute();
    }
  });
}

type RuleRow = { id: string; code: string; severity: ZentraSeverity; enabled: boolean; parameters: Record<string, any> };
const SEVERITY_ORDER: ZentraSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const raise = (s: ZentraSeverity, steps = 1): ZentraSeverity => SEVERITY_ORDER[Math.min(SEVERITY_ORDER.indexOf(s) + steps, 3)];

/** A tenant's rules by code, with each rule's own parameters (defaults fill gaps). */
export async function loadZentraRules(tenantId: string): Promise<Map<string, RuleRow>> {
  await ensureDefaultZentraRules(tenantId);
  const rows = await withTenant(tenantId, trx => trx.selectFrom('zentra_risk_rules')
    .select(['id', 'code', 'severity', 'enabled', 'parameters']).where('tenant_id', '=', tenantId).execute());
  const map = new Map<string, RuleRow>();
  for (const r of rows) {
    const defaults = DEFAULT_RISK_RULES.find(d => d.code === r.code)?.parameters ?? {};
    const params = typeof r.parameters === 'string' ? JSON.parse(r.parameters) : (r.parameters ?? {});
    map.set(r.code, { id: r.id, code: r.code, severity: r.severity, enabled: r.enabled, parameters: { ...defaults, ...params } });
  }
  return map;
}

/**
 * Risk evaluation for one committed audit event. Every threshold, window and
 * severity comes from the tenant's own rule row (Zentra → Settings → Rules),
 * and a disabled rule never fires. The rule's severity is the base; a rule
 * may escalate one step when the observed value far exceeds its threshold.
 */
export async function evaluateZentraRiskRulesForEvent(event: AuditEventRow): Promise<void> {
  const tenantId = event.tenant_id;
  const rules = await loadZentraRules(tenantId);
  const on = (code: string) => { const r = rules.get(code); return r && r.enabled ? r : null; };
  const meta = typeof event.safe_metadata === 'string' ? JSON.parse(event.safe_metadata) : (event.safe_metadata || {});

  const raised: AlertableSignal[] = [];
  await withTenant(tenantId, async trx => {
    const signal = async (rule: RuleRow, v: { title: string; description: string; severity?: ZentraSeverity; evidence: string[]; summary: string }) => {
      const row = await trx.insertInto('zentra_risk_signals').values({
        tenant_id: tenantId, app_id: event.app_id, rule_id: rule.id, rule_code: rule.code,
        title: v.title, description: v.description, severity: v.severity ?? rule.severity, status: 'NEW',
        actor_id: event.actor_id, actor_name: event.actor_name, resource_type: event.resource_type, resource_id: event.resource_id,
        evidence_event_ids: JSON.stringify(v.evidence), evidence_summary: v.summary,
      } as any).returning(['id', 'title', 'description', 'severity', 'app_id', 'rule_code']).executeTakeFirstOrThrow();
      raised.push(row as AlertableSignal);
    };

    // 1. Repeated access denials
    const denials = on('RULE_REPEATED_ACCESS_DENIED');
    // 'unknown' / 'system' are not one person: counting them together would
    // turn unrelated failures (e.g. sign-ins for mistyped emails) into a signal.
    if (denials && (event.outcome === 'denied' || event.event_name === 'permission.denied') && !['unknown', 'system'].includes(event.actor_id)) {
      const threshold = Number(denials.parameters.threshold) || 3;
      const windowMin = Number(denials.parameters.window_minutes) || 15;
      const recent = await trx.selectFrom('zentra_audit_events')
        .select(['id', 'resource_type'])
        .where('tenant_id', '=', tenantId).where('actor_id', '=', event.actor_id).where('outcome', '=', 'denied')
        .where('created_at', '>=', new Date(Date.now() - windowMin * 60_000)).execute();
      if (recent.length >= threshold) {
        const open = await trx.selectFrom('zentra_risk_signals').select('id')
          .where('tenant_id', '=', tenantId).where('rule_code', '=', denials.code).where('actor_id', '=', event.actor_id)
          .where('status', 'in', ['NEW', 'TRIAGED', 'CASE_OPEN']).executeTakeFirst();
        if (!open) {
          await signal(denials, {
            title: `Repeated authorization denials (${recent.length} in ${windowMin} min)`,
            description: `${event.actor_name || event.actor_id} was denied access ${recent.length} times in ${windowMin} minutes.`,
            severity: recent.length >= threshold * 3 ? raise(denials.severity) : undefined,
            evidence: recent.map(d => d.id),
            summary: `Denied on: ${[...new Set(recent.map(d => d.resource_type))].join(', ')}`,
          });
        }
      }
    }

    // 2. Bulk export
    const bulk = on('RULE_UNUSUAL_BULK_EXPORT');
    if (bulk && (event.event_name === 'record.exported' || event.action === 'export')) {
      const count = Number(meta?.count ?? 0);
      const threshold = Number(bulk.parameters.count_threshold) || 50;
      if (count >= threshold || meta?.is_bulk === true) {
        await signal(bulk, {
          title: `Bulk export of ${event.resource_type} (${count || 'many'} records)`,
          description: `${event.actor_name || event.actor_id} exported ${count || 'a bulk set of'} records from ${event.app_id}.`,
          severity: count >= threshold * 4 ? raise(bulk.severity) : undefined,
          evidence: [event.id], summary: `Exported ${count || 'bulk'} (threshold ${threshold})`,
        });
      }
    }

    // 3. High-value financial approval
    const money = on('RULE_HIGH_VALUE_FINANCE_APPROVAL');
    // Matches what the apps actually emit: invoice/bill payment_recorded,
    // payroll.run_approved, expense.approved, expense_report.reimbursed,
    // petti.withdrawal_approved / _disbursed.
    if (money && /(^|[._])(approved|paid|payment_released|payment_recorded|disbursed|reimbursed)$/.test(event.event_name) && /payment|invoice|bill|payroll|expense|petti|wallet/.test(event.event_name + event.resource_type)) {
      const amount = Number(meta?.amount ?? meta?.total ?? 0);
      const threshold = Number(money.parameters.amount_threshold) || 10000;
      if (amount >= threshold) {
        await signal(money, {
          title: `High-value approval: ${amount.toLocaleString('en-US')} ${meta?.currency || ''}`.trim(),
          description: `${event.actor_name || event.actor_id} approved ${event.resource_type} above the ${threshold.toLocaleString('en-US')} review threshold.`,
          severity: amount >= threshold * 5 ? raise(money.severity) : undefined,
          evidence: [event.id], summary: `Amount ${amount} for ${event.resource_type}:${event.resource_id}`,
        });
      }
    }

    // 4. Sensitive access shortly after a role change
    const priv = on('RULE_PRIVILEGE_ELEVATION_SENSITIVE_ACCESS');
    if (priv && SENSITIVE_RESOURCES.has(event.resource_type) && !['unknown', 'system'].includes(event.actor_id)) {
      const hours = Number(priv.parameters.window_hours) || 1;
      const roleChange = await trx.selectFrom('zentra_audit_events').select(['id', 'created_at'])
        .where('tenant_id', '=', tenantId).where('event_name', 'in', ROLE_CHANGE_EVENTS)
        .where('resource_id', '=', event.actor_id)
        .where('created_at', '>=', new Date(Date.now() - hours * 3_600_000)).executeTakeFirst();
      const openPriv = roleChange && await trx.selectFrom('zentra_risk_signals').select('id')
        .where('tenant_id', '=', tenantId).where('rule_code', '=', priv.code).where('actor_id', '=', event.actor_id)
        .where('status', 'in', ['NEW', 'TRIAGED', 'CASE_OPEN']).executeTakeFirst();
      if (roleChange && !openPriv) {
        await signal(priv, {
          title: 'Sensitive access shortly after a role change',
          description: `${event.actor_name || event.actor_id} opened ${event.resource_type} within ${hours} h of their role changing.`,
          evidence: [roleChange.id, event.id],
          summary: `Role changed ${roleChange.created_at.toISOString()}, accessed ${event.resource_type} ${event.created_at.toISOString()}`,
        });
      }
    }
  });
  await alertZentraSignals(tenantId, raised);
}

/**
 * RULE_TELEMETRY_GAP: an app this workspace actively used in the last 7 days
 * that has sent nothing for longer than the rule's dormant_hours. Run on a
 * schedule (jobs/index.ts), not per event — silence produces no events.
 * One open signal per app at a time.
 */
export async function evaluateZentraTelemetryGaps(): Promise<number> {
  const rows = await sql<{ tenant_id: string; app_id: string; last: Date }>`
    SELECT tenant_id, app_id, max(created_at) AS last FROM zentra_audit_events
    WHERE created_at >= now() - interval '7 days' AND app_id <> 'zentra'
    GROUP BY tenant_id, app_id`.execute(dbPlatform);
  const byTenant = new Map<string, { app_id: string; last: Date }[]>();
  for (const r of rows.rows) byTenant.set(r.tenant_id, [...(byTenant.get(r.tenant_id) ?? []), r]);
  let raised = 0;
  for (const [tenantId, apps] of byTenant) {
    const rule = (await loadZentraRules(tenantId)).get('RULE_TELEMETRY_GAP');
    if (!rule?.enabled) continue;
    const hours = Number(rule.parameters.dormant_hours) || 48;
    const silent = apps.filter(a => Date.now() - new Date(a.last).getTime() > hours * 3_600_000);
    if (!silent.length) continue;
    const gapRaised: AlertableSignal[] = [];
    raised += await withTenant(tenantId, async trx => {
      const settings = await trx.selectFrom('zentra_settings').select('telemetry_monitoring_enabled').where('tenant_id', '=', tenantId).executeTakeFirst();
      if (settings && settings.telemetry_monitoring_enabled === false) return 0;
      let n = 0;
      for (const a of silent) {
        const open = await trx.selectFrom('zentra_risk_signals').select('id')
          .where('tenant_id', '=', tenantId).where('rule_code', '=', rule.code).where('app_id', '=', a.app_id)
          .where('status', 'in', ['NEW', 'TRIAGED', 'CASE_OPEN']).executeTakeFirst();
        if (open) continue;
        const silentHours = Math.round((Date.now() - new Date(a.last).getTime()) / 3_600_000);
        const row = await trx.insertInto('zentra_risk_signals').values({
          tenant_id: tenantId, app_id: a.app_id, rule_id: rule.id, rule_code: rule.code,
          title: `${a.app_id} has gone silent (${silentHours} h)`,
          description: `${a.app_id} was in use this week but has sent no audit activity for ${silentHours} hours (threshold ${hours} h). Either nobody is using it, or its activity is no longer reaching Zentra.`,
          severity: silentHours >= hours * 3 ? raise(rule.severity) : rule.severity, status: 'NEW',
          actor_id: 'system', actor_name: 'Zentra', resource_type: 'app', resource_id: a.app_id,
          evidence_event_ids: JSON.stringify([]), evidence_summary: `Last event ${new Date(a.last).toISOString()}`,
        } as any).returning(['id', 'title', 'description', 'severity', 'app_id', 'rule_code']).executeTakeFirstOrThrow();
        gapRaised.push(row as AlertableSignal);
        n++;
      }
      return n;
    });
    await alertZentraSignals(tenantId, gapRaised);
  }
  return raised;
}

/** The tenant's rules, for the Settings screen. */
export async function listZentraRiskRules(tenantId: string) {
  await ensureDefaultZentraRules(tenantId);
  const rows = await withTenant(tenantId, trx => trx.selectFrom('zentra_risk_rules').selectAll()
    .where('tenant_id', '=', tenantId).orderBy('category').orderBy('name').execute());
  return rows.map(r => ({ ...r, parameters: typeof r.parameters === 'string' ? JSON.parse(r.parameters) : (r.parameters ?? {}) }));
}

/** Turn a rule on/off, change its severity or its numbers. Only known parameter keys, as positive numbers. */
export async function updateZentraRiskRule(tenantId: string, code: string, patch: { enabled?: boolean; severity?: ZentraSeverity; parameters?: Record<string, unknown> }): Promise<{ error?: string; rule?: unknown }> {
  const def = DEFAULT_RISK_RULES.find(d => d.code === code);
  if (!def) return { error: 'Unknown rule' };
  let parameters: Record<string, number> | undefined;
  if (patch.parameters) {
    parameters = {};
    for (const key of Object.keys(def.parameters)) {
      const v = patch.parameters[key];
      if (v === undefined) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0 || n > 1e12) return { error: `${key} must be a positive number` };
      parameters[key] = n;
    }
  }
  await ensureDefaultZentraRules(tenantId);
  const row = await withTenant(tenantId, async trx => {
    const cur = await trx.selectFrom('zentra_risk_rules').select('parameters').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
    const curParams = typeof cur?.parameters === 'string' ? JSON.parse(cur.parameters) : (cur?.parameters ?? {});
    return trx.updateTable('zentra_risk_rules').set({
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.severity ? { severity: patch.severity } : {}),
      ...(parameters ? { parameters: JSON.stringify({ ...def.parameters, ...curParams, ...parameters }) } : {}),
      updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('code', '=', code).returningAll().executeTakeFirst();
  });
  return { rule: row };
}

/**
 * Query risk signals for a tenant with filtering.
 */
export async function getZentraRiskSignals(
  tenantId: string,
  filters: { severity?: ZentraSeverity; status?: ZentraSignalStatus; app_id?: string; limit?: number; offset?: number } = {}
): Promise<{ signals: ZentraRiskSignal[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  return withTenant(tenantId, async trx => {
    let query = trx.selectFrom('zentra_risk_signals')
      .selectAll()
      .where('tenant_id', '=', tenantId);

    if (filters.severity) {
      query = query.where('severity', '=', filters.severity);
    }
    if (filters.status) {
      query = query.where('status', '=', filters.status);
    }
    if (filters.app_id) {
      query = query.where('app_id', '=', filters.app_id);
    }

    const [rows, countRow] = await Promise.all([
      query.orderBy('created_at', 'desc').limit(limit).offset(offset).execute(),
      // Count the same filtered set the page shows, not every signal.
      query.clearSelect().select(trx.fn.count<number>('id').as('count')).executeTakeFirst(),
    ]);

    const signals: ZentraRiskSignal[] = rows.map(r => ({
      id: r.id,
      tenant_id: r.tenant_id,
      app_id: r.app_id,
      rule_id: r.rule_id,
      rule_code: r.rule_code,
      title: r.title,
      description: r.description,
      severity: r.severity,
      status: r.status,
      actor_id: r.actor_id,
      actor_name: r.actor_name,
      resource_type: r.resource_type,
      resource_id: r.resource_id,
      evidence_event_ids: typeof r.evidence_event_ids === 'string' ? JSON.parse(r.evidence_event_ids) : (r.evidence_event_ids || []),
      evidence_summary: r.evidence_summary,
      resolution_notes: r.resolution_notes,
      resolved_by: r.resolved_by,
      resolved_at: r.resolved_at,
      case_id: r.case_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return { signals, total: Number(countRow?.count ?? rows.length) };
  });
}

/**
 * Triage or resolve a risk signal.
 */
export async function triageZentraSignal(
  tenantId: string,
  signalId: string,
  status: ZentraSignalStatus,
  resolutionNotes: string,
  resolvedBy: string
): Promise<ZentraRiskSignal | null> {
  return withTenant(tenantId, async trx => {
    const updated = await trx.updateTable('zentra_risk_signals')
      .set({
        status,
        resolution_notes: resolutionNotes,
        resolved_by: resolvedBy,
        resolved_at: new Date(),
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', signalId)
      .returningAll()
      .executeTakeFirst();

    if (!updated) return null;

    return {
      id: updated.id,
      tenant_id: updated.tenant_id,
      app_id: updated.app_id,
      rule_id: updated.rule_id,
      rule_code: updated.rule_code,
      title: updated.title,
      description: updated.description,
      severity: updated.severity,
      status: updated.status,
      actor_id: updated.actor_id,
      actor_name: updated.actor_name,
      resource_type: updated.resource_type,
      resource_id: updated.resource_id,
      evidence_event_ids: typeof updated.evidence_event_ids === 'string' ? JSON.parse(updated.evidence_event_ids) : (updated.evidence_event_ids || []),
      evidence_summary: updated.evidence_summary,
      resolution_notes: updated.resolution_notes,
      resolved_by: updated.resolved_by,
      resolved_at: updated.resolved_at,
      case_id: updated.case_id,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };
  });
}

