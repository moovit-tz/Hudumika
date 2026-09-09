import { withTenant, dbPlatform } from '../db/client.js';
import { getMetricDefinition, computeMetricValue } from './metrics-registry.service.js';

export interface KpiTargetWithStatus {
  id: string;
  metric_key: string;
  metric_name: string;
  app: string;
  domain: string;
  unit: string;
  format: string;
  target_value: number;
  target_direction: 'above' | 'below';
  warning_threshold: number | null;
  period: string;
  notes: string | null;
  current_value: number;
  status: 'ON_TARGET' | 'AT_RISK' | 'OFF_TARGET';
  progress_pct: number;
  as_of: string;
}

export async function listKpiTargets(tenantId: string): Promise<KpiTargetWithStatus[]> {
  return withTenant(tenantId, async (trx) => {
    const targets = await trx.selectFrom('metric_kpi_targets')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .execute();

    const results: KpiTargetWithStatus[] = [];

    for (const t of targets) {
      const def = await getMetricDefinition(t.metric_key);
      const days = t.period === 'daily' ? 1 : t.period === 'weekly' ? 7 : t.period === 'quarterly' ? 90 : 30;

      let currentValue = 0;
      let asOf = new Date().toISOString();
      try {
        const val = await computeMetricValue(t.metric_key, tenantId, days);
        currentValue = val.value;
        asOf = val.asOf;
      } catch {
        currentValue = 0;
      }

      let status: 'ON_TARGET' | 'AT_RISK' | 'OFF_TARGET' = 'OFF_TARGET';
      let progressPct = 0;

      const targetVal = Number(t.target_value);
      const warnVal = t.warning_threshold != null ? Number(t.warning_threshold) : null;

      if (t.target_direction === 'above') {
        progressPct = targetVal > 0 ? Number(((currentValue / targetVal) * 100).toFixed(1)) : 100;
        if (currentValue >= targetVal) {
          status = 'ON_TARGET';
        } else if (warnVal != null && currentValue >= warnVal) {
          status = 'AT_RISK';
        } else if (targetVal > 0 && currentValue >= targetVal * 0.85) {
          status = 'AT_RISK';
        } else {
          status = 'OFF_TARGET';
        }
      } else {
        progressPct = targetVal > 0 ? Number(((targetVal / Math.max(currentValue, 0.0001)) * 100).toFixed(1)) : 100;
        if (currentValue <= targetVal) {
          status = 'ON_TARGET';
        } else if (warnVal != null && currentValue <= warnVal) {
          status = 'AT_RISK';
        } else if (targetVal > 0 && currentValue <= targetVal * 1.15) {
          status = 'AT_RISK';
        } else {
          status = 'OFF_TARGET';
        }
      }

      results.push({
        id: t.id,
        metric_key: t.metric_key,
        metric_name: def?.name ?? t.metric_key,
        app: def?.app ?? 'platform',
        domain: def?.domain ?? 'operational',
        unit: def?.unit ?? '',
        format: def?.format ?? 'number',
        target_value: targetVal,
        target_direction: t.target_direction as 'above' | 'below',
        warning_threshold: warnVal,
        period: t.period ?? 'monthly',
        notes: t.notes,
        current_value: currentValue,
        status,
        progress_pct: Math.min(Math.max(progressPct, 0), 200),
        as_of: asOf,
      });
    }

    return results;
  });
}

export async function createOrUpdateKpiTarget(
  tenantId: string,
  userId: string,
  data: {
    metricKey: string;
    targetValue: number;
    targetDirection: 'above' | 'below';
    warningThreshold?: number | null;
    period?: string;
    notes?: string | null;
  }
) {
  return withTenant(tenantId, async (trx) => {
    const existing = await trx.selectFrom('metric_kpi_targets')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('metric_key', '=', data.metricKey)
      .executeTakeFirst();

    if (existing) {
      const [updated] = await trx.updateTable('metric_kpi_targets')
        .set({
          target_value: data.targetValue,
          target_direction: data.targetDirection,
          warning_threshold: data.warningThreshold ?? null,
          period: data.period ?? 'monthly',
          notes: data.notes ?? null,
          updated_at: new Date(),
        })
        .where('id', '=', existing.id)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .execute();
      return updated;
    }

    const [created] = await trx.insertInto('metric_kpi_targets')
      .values({
        tenant_id: tenantId,
        metric_key: data.metricKey,
        target_value: data.targetValue,
        target_direction: data.targetDirection,
        warning_threshold: data.warningThreshold ?? null,
        period: data.period ?? 'monthly',
        notes: data.notes ?? null,
        created_by: userId,
      })
      .returningAll()
      .execute();

    return created;
  });
}

export async function deleteKpiTarget(tenantId: string, id: string) {
  return withTenant(tenantId, async (trx) => {
    await trx.deleteFrom('metric_kpi_targets')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
  });
}
