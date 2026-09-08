import { dbPlatform, withTenant } from '../db/client.js';
import { computeMetricValue, getMetricDefinition } from './metrics-registry.service.js';
import { NotificationService } from './notification.service.js';

export interface AlertRuleInput {
  metricKey: string;
  name: string;
  comparator: 'below' | 'above';
  threshold: number;
  windowDays?: number;
  severity?: 'info' | 'warning' | 'critical';
  notifyRoles?: string[];
}

export async function listAlertRules(tenantId: string) {
  return withTenant(tenantId, trx =>
    trx.selectFrom('metric_alert_rules').selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .execute()
  );
}

export async function listAlertEvents(tenantId: string, limit = 50) {
  return withTenant(tenantId, trx =>
    trx.selectFrom('metric_alert_events').selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute()
  );
}

export async function createAlertRule(tenantId: string, userId: string, input: AlertRuleInput) {
  const def = await getMetricDefinition(input.metricKey);
  if (!def) throw new Error(`Unknown metric: ${input.metricKey}`);
  return withTenant(tenantId, trx =>
    trx.insertInto('metric_alert_rules').values({
      tenant_id: tenantId,
      metric_key: input.metricKey,
      name: input.name,
      comparator: input.comparator,
      threshold: input.threshold,
      window_days: input.windowDays ?? 30,
      severity: input.severity ?? 'warning',
      notify_roles: JSON.stringify(input.notifyRoles ?? ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER']) as any,
      created_by: userId,
    }).returningAll().executeTakeFirstOrThrow()
  );
}

export async function setAlertRuleEnabled(tenantId: string, id: string, enabled: boolean) {
  return withTenant(tenantId, trx =>
    trx.updateTable('metric_alert_rules')
      .set({ enabled, updated_at: new Date() })
      .where('id', '=', id).where('tenant_id', '=', tenantId)
      .returningAll().executeTakeFirstOrThrow()
  );
}

export async function deleteAlertRule(tenantId: string, id: string) {
  return withTenant(tenantId, trx =>
    trx.deleteFrom('metric_alert_rules').where('id', '=', id).where('tenant_id', '=', tenantId).execute()
  );
}

/**
 * Evaluates one rule against its metric's current value and, on a state
 * transition (ok -> breach, or breach -> ok), notifies the tenant's
 * configured roles via the real notification pipeline
 * (NotificationService.createNotification — the same insert every other
 * in-app notification in this codebase goes through) and logs an append-
 * only metric_alert_events row. Repeated polls while still breached do
 * NOT re-notify — same "state transition, not every tick" shape as this
 * codebase's other reminder jobs.
 */
export async function evaluateAlertRule(rule: {
  id: string; tenant_id: string; metric_key: string; name: string;
  comparator: string; threshold: number; window_days: number; severity: string;
  notify_roles: unknown; last_state: string;
}): Promise<{ fired: boolean; value: number } | null> {
  let value: number;
  try {
    const result = await computeMetricValue(rule.metric_key, rule.tenant_id, rule.window_days);
    value = result.value;
  } catch (err: any) {
    console.error(`[MetricAlerts] rule ${rule.id} (${rule.metric_key}) failed to compute:`, err.message);
    return null;
  }

  const breached = rule.comparator === 'below' ? value < rule.threshold : value > rule.threshold;
  const newState: 'ok' | 'breach' = breached ? 'breach' : 'ok';
  const transitioned = newState !== rule.last_state;

  await withTenant(rule.tenant_id, trx =>
    trx.updateTable('metric_alert_rules')
      .set({
        last_state: newState,
        last_evaluated_at: new Date(),
        ...(transitioned && breached ? { last_fired_at: new Date() } : {}),
      })
      .where('id', '=', rule.id)
      .execute()
  );

  if (!transitioned) return { fired: false, value };

  const roles: string[] = Array.isArray(rule.notify_roles) ? rule.notify_roles
    : (typeof rule.notify_roles === 'string' ? JSON.parse(rule.notify_roles) : []);

  const recipients = roles.length > 0
    ? await withTenant(rule.tenant_id, trx =>
        trx.selectFrom('users').select('id')
          .where('tenant_id', '=', rule.tenant_id)
          .where('role', 'in', roles as any)
          .where('active', '=', true)
          .execute()
      )
    : [];

  const eventType: 'breach' | 'recovery' = breached ? 'breach' : 'recovery';
  const title = breached
    ? `Alert: ${rule.name}`
    : `Recovered: ${rule.name}`;
  const message = breached
    ? `${rule.metric_key} is ${rule.comparator} ${rule.threshold} — currently ${value}.`
    : `${rule.metric_key} is back within range — currently ${value}.`;

  for (const r of recipients) {
    await NotificationService.createNotification({
      tenantId: rule.tenant_id,
      userId: r.id,
      app: 'hudubi',
      type: breached ? (rule.severity === 'critical' ? 'security' : 'task') : 'info',
      title,
      message,
      link: `/hudubi/metrics?app=${rule.metric_key.split('.')[0]}`,
      entityType: 'metric_alert_rule',
      entityId: rule.id,
      entityLabel: rule.name,
    });
  }

  await withTenant(rule.tenant_id, trx =>
    trx.insertInto('metric_alert_events').values({
      tenant_id: rule.tenant_id,
      rule_id: rule.id,
      metric_key: rule.metric_key,
      event_type: eventType,
      value,
      threshold: rule.threshold,
      severity: rule.severity,
      notified_user_ids: JSON.stringify(recipients.map(r => r.id)) as any,
    }).execute()
  );

  return { fired: true, value };
}

/** Sweeps every enabled rule across every tenant — dbPlatform for the
 *  cross-tenant listing (same shape support-rules.job.ts's own sweep
 *  already uses), evaluateAlertRule does the real work tenant-scoped. */
export async function evaluateAllAlertRules(): Promise<{ evaluated: number; fired: number }> {
  const rules = await dbPlatform.selectFrom('metric_alert_rules').selectAll()
    .where('enabled', '=', true)
    .execute();

  let fired = 0;
  for (const rule of rules) {
    const result = await evaluateAlertRule(rule as any);
    if (result?.fired) fired++;
  }
  return { evaluated: rules.length, fired };
}
