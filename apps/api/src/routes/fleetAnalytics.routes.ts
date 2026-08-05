import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { toDateParam } from '../utils/dates.js';

const HEALTH_BUCKETS = [
  { min: 80, max: 100, label: 'Excellent' },
  { min: 60, max: 79, label: 'Good' },
  { min: 40, max: 59, label: 'Fair' },
  { min: 20, max: 39, label: 'Poor' },
  { min: 0, max: 19, label: 'Critical' },
];

function bucketFor(score: number) {
  return HEALTH_BUCKETS.find(b => score >= b.min && score <= b.max)?.label ?? 'Critical';
}

export async function fleetAnalyticsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));

  // ── Analytics (Enterprise) ──────────────────────────────────

  fastify.get('/analytics', { preHandler: requireEntitlement('tracking.analytics') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const vehicles = await trx.selectFrom('vehicles').selectAll()
        .where('tenant_id', '=', user.tenant_id).execute();

      const now = new Date();
      const horizon30 = new Date(now.getTime() + 30 * 86_400_000);

      // Real, deterministic health score per vehicle: start at 100, deduct
      // for overdue maintenance, expired documents, unacknowledged critical
      // alerts, and a stale (>2h) or missing GPS fix.
      const scores: { vehicle_id: string; name: string; score: number }[] = [];
      for (const v of vehicles) {
        let score = 100;

        const overdueMaint = await trx.selectFrom('maintenance_records')
          .select(({ fn }) => [fn.count<number>('id').as('count')])
          .where('vehicle_id', '=', v.id)
          .where('next_due_date', 'is not', null)
          .where('next_due_date', '<', toDateParam(now))
          .executeTakeFirst();
        score -= Number(overdueMaint?.count ?? 0) * 15;

        const expiredDocs = await trx.selectFrom('vehicle_documents')
          .select(({ fn }) => [fn.count<number>('id').as('count')])
          .where('vehicle_id', '=', v.id)
          .where('expiry_date', 'is not', null)
          .where('expiry_date', '<', toDateParam(now))
          .executeTakeFirst();
        score -= Number(expiredDocs?.count ?? 0) * 10;

        const criticalAlerts = await trx.selectFrom('fleet_alerts')
          .select(({ fn }) => [fn.count<number>('id').as('count')])
          .where('vehicle_id', '=', v.id)
          .where('severity', '=', 'CRITICAL')
          .where('acknowledged', '=', false)
          .executeTakeFirst();
        score -= Number(criticalAlerts?.count ?? 0) * 20;

        const lastPos = await trx.selectFrom('vehicle_positions').select('recorded_at')
          .where('vehicle_id', '=', v.id).orderBy('recorded_at', 'desc').executeTakeFirst();
        if (!lastPos || now.getTime() - new Date(lastPos.recorded_at).getTime() > 2 * 3_600_000) {
          score -= 10;
        }

        score = Math.max(0, Math.min(100, score));
        scores.push({ vehicle_id: v.id, name: v.name, score });
      }

      const breakdown: Record<string, number> = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, Critical: 0 };
      for (const s of scores) breakdown[bucketFor(s.score)]++;
      const fleetHealthScore = scores.length
        ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
        : 100;

      // Cost breakdown (fuel vs maintenance) over the last 90 days.
      const since90 = new Date(now.getTime() - 90 * 86_400_000);
      const fuelCosts = await trx.selectFrom('fuel_logs')
        .select(({ fn }) => [fn.sum<number>('cost').as('total')])
        .where('tenant_id', '=', user.tenant_id).where('logged_at', '>=', since90)
        .executeTakeFirst();
      const maintenanceCosts = await trx.selectFrom('maintenance_records')
        .select(({ fn }) => [fn.sum<number>('cost').as('total')])
        .where('tenant_id', '=', user.tenant_id).where('service_date', '>=', toDateParam(since90))
        .executeTakeFirst();

      // Fuel consumption by month (last 6 months).
      const fuelLogs = await trx.selectFrom('fuel_logs').select(['cost', 'liters', 'logged_at'])
        .where('tenant_id', '=', user.tenant_id)
        .where('logged_at', '>=', new Date(now.getTime() - 180 * 86_400_000))
        .execute();
      const fuelByMonth = new Map<string, { cost: number; liters: number }>();
      for (const f of fuelLogs) {
        const d = new Date(f.logged_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const cur = fuelByMonth.get(key) ?? { cost: 0, liters: 0 };
        cur.cost += Number(f.cost ?? 0);
        cur.liters += Number(f.liters ?? 0);
        fuelByMonth.set(key, cur);
      }

      // On-time trip completion trend (last 6 months, by scheduled_end vs actual_end).
      const trips = await trx.selectFrom('trips')
        .select(['status', 'scheduled_end', 'actual_end', 'created_at'])
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'COMPLETED')
        .where('created_at', '>=', new Date(now.getTime() - 180 * 86_400_000))
        .execute();
      let onTime = 0, late = 0;
      for (const t of trips) {
        if (t.scheduled_end && t.actual_end) {
          if (new Date(t.actual_end) <= new Date(t.scheduled_end)) onTime++; else late++;
        }
      }
      const onTimePct = (onTime + late) > 0 ? Math.round((onTime / (onTime + late)) * 100) : null;

      // ── Vehicle status breakdown (image3's "Vehicle Status" widget) ──
      const allVehicles = await trx.selectFrom('vehicles').select(['status', 'ownership'])
        .where('tenant_id', '=', user.tenant_id).execute();
      const vehicleStatusBreakdown = { active: 0, out_of_service: 0, rented: 0 };
      for (const v of allVehicles) {
        if (v.ownership === 'RENTED') vehicleStatusBreakdown.rented++;
        else if (v.status === 'ACTIVE') vehicleStatusBreakdown.active++;
        else vehicleStatusBreakdown.out_of_service++;
      }

      // ── Maintenance (service) cost by month + combined total cost by month ──
      const maintenanceRows = await trx.selectFrom('maintenance_records').select(['cost', 'service_date'])
        .where('tenant_id', '=', user.tenant_id)
        .where('service_date', '>=', toDateParam(new Date(now.getTime() - 180 * 86_400_000)))
        .execute();
      const serviceByMonth = new Map<string, number>();
      for (const m of maintenanceRows) {
        const d = new Date(m.service_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        serviceByMonth.set(key, (serviceByMonth.get(key) ?? 0) + Number(m.cost ?? 0));
      }
      const allMonths = new Set([...fuelByMonth.keys(), ...serviceByMonth.keys()]);
      const totalCostByMonth = [...allMonths].sort((a, b) => a.localeCompare(b)).map(month => ({
        month, fuel: fuelByMonth.get(month)?.cost ?? 0, service: serviceByMonth.get(month) ?? 0,
        total: (fuelByMonth.get(month)?.cost ?? 0) + (serviceByMonth.get(month) ?? 0),
      }));

      // ── Cost per km by month (total cost / distance driven that month) ──
      const distanceTrips = await trx.selectFrom('trips').select(['distance_km', 'actual_end'])
        .where('tenant_id', '=', user.tenant_id).where('status', '=', 'COMPLETED')
        .where('actual_end', 'is not', null)
        .where('actual_end', '>=', new Date(now.getTime() - 180 * 86_400_000))
        .execute();
      const distanceByMonth = new Map<string, number>();
      for (const t of distanceTrips) {
        if (!t.distance_km) continue;
        const d = new Date(t.actual_end!);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        distanceByMonth.set(key, (distanceByMonth.get(key) ?? 0) + Number(t.distance_km));
      }
      const costPerKmByMonth = totalCostByMonth
        .filter(c => (distanceByMonth.get(c.month) ?? 0) > 0)
        .map(c => ({ month: c.month, cost_per_km: Math.round((c.total / distanceByMonth.get(c.month)!) * 100) / 100 }));

      // ── Latest meter readings across the fleet ──
      const meterReadingRows = await trx.selectFrom('vehicle_meter_readings')
        .innerJoin('vehicles', 'vehicles.id', 'vehicle_meter_readings.vehicle_id')
        .select(['vehicle_meter_readings.reading_km', 'vehicle_meter_readings.recorded_at', 'vehicle_meter_readings.source', 'vehicles.name as vehicle_name'])
        .where('vehicle_meter_readings.tenant_id', '=', user.tenant_id)
        .orderBy('vehicle_meter_readings.recorded_at', 'desc').limit(20).execute();
      const latestMeterReadings = meterReadingRows.map(r => ({ ...r, reading_km: Number(r.reading_km) }));

      // ── Issues summary (status/severity breakdown, avg resolution time, overdue) ──
      const allIssues = await trx.selectFrom('vehicle_issues')
        .select(['status', 'severity', 'created_at', 'resolved_at', 'due_date'])
        .where('tenant_id', '=', user.tenant_id).execute();
      const issuesByStatus = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0 } as Record<string, number>;
      const issuesBySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<string, number>;
      let resolvedCount = 0, totalResolutionHours = 0, overdueIssues = 0;
      for (const i of allIssues) {
        issuesByStatus[i.status] = (issuesByStatus[i.status] ?? 0) + 1;
        issuesBySeverity[i.severity] = (issuesBySeverity[i.severity] ?? 0) + 1;
        if (i.resolved_at) {
          resolvedCount++;
          totalResolutionHours += (new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / 3_600_000;
        }
        if (i.status !== 'RESOLVED' && i.due_date && new Date(i.due_date) < now) overdueIssues++;
      }
      const issuesSummary = {
        total: allIssues.length,
        by_status: issuesByStatus,
        by_severity: issuesBySeverity,
        avg_resolution_hours: resolvedCount > 0 ? Math.round((totalResolutionHours / resolvedCount) * 10) / 10 : null,
        overdue: overdueIssues,
      };

      // ── On-time service compliance: was each service done before the
      // previous service's next_due_date for that vehicle+service_type? ──
      const allMaintenance = await trx.selectFrom('maintenance_records')
        .select(['vehicle_id', 'service_type', 'service_date', 'next_due_date'])
        .where('tenant_id', '=', user.tenant_id).orderBy('service_date', 'asc').execute();
      const byVehicleType = new Map<string, typeof allMaintenance>();
      for (const m of allMaintenance) {
        const key = `${m.vehicle_id}::${m.service_type}`;
        if (!byVehicleType.has(key)) byVehicleType.set(key, []);
        byVehicleType.get(key)!.push(m);
      }
      let onTimeAll = 0, lateAll = 0, onTime30 = 0, late30 = 0;
      const since30d = new Date(now.getTime() - 30 * 86_400_000);
      for (const records of byVehicleType.values()) {
        for (let i = 1; i < records.length; i++) {
          const prevDue = records[i - 1].next_due_date;
          if (!prevDue) continue;
          const wasOnTime = new Date(records[i].service_date) <= new Date(prevDue);
          if (wasOnTime) onTimeAll++; else lateAll++;
          if (new Date(records[i].service_date) >= since30d) { if (wasOnTime) onTime30++; else late30++; }
        }
      }
      const onTimeServiceCompliance = {
        all_time_pct: (onTimeAll + lateAll) > 0 ? Math.round((onTimeAll / (onTimeAll + lateAll)) * 100) : null,
        last_30d_pct: (onTime30 + late30) > 0 ? Math.round((onTime30 / (onTime30 + late30)) * 100) : null,
      };

      // ── Overdue service (latest record per vehicle+service_type whose
      // next_due_date has passed) + active work orders (SCHEDULED status) ──
      let overdueServiceCount = 0;
      for (const records of byVehicleType.values()) {
        const latest = records[records.length - 1];
        if (latest.next_due_date && new Date(latest.next_due_date) < now) overdueServiceCount++;
      }
      const scheduledWorkOrders = await trx.selectFrom('maintenance_records')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('tenant_id', '=', user.tenant_id).where('status', '=', 'SCHEDULED')
        .executeTakeFirst();

      return {
        fleet_health_score: fleetHealthScore,
        health_breakdown: breakdown,
        vehicle_scores: scores.sort((a, b) => a.score - b.score),
        cost_breakdown: {
          fuel: Number(fuelCosts?.total ?? 0),
          maintenance: Number(maintenanceCosts?.total ?? 0),
        },
        fuel_by_month: [...fuelByMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
          .map(([month, v]) => ({ month, ...v })),
        on_time_trip_pct: onTimePct,
        documents_expiring_30d: await trx.selectFrom('vehicle_documents')
          .select(({ fn }) => [fn.count<number>('id').as('count')])
          .where('tenant_id', '=', user.tenant_id)
          .where('expiry_date', 'is not', null).where('expiry_date', '<=', toDateParam(horizon30))
          .executeTakeFirst().then(r => Number(r?.count ?? 0)),
        vehicle_status_breakdown: vehicleStatusBreakdown,
        total_cost_by_month: totalCostByMonth,
        cost_per_km_by_month: costPerKmByMonth,
        latest_meter_readings: latestMeterReadings,
        on_time_service_compliance: onTimeServiceCompliance,
        overdue_service_count: overdueServiceCount,
        work_orders: {
          scheduled: Number(scheduledWorkOrders?.count ?? 0),
          overdue: overdueServiceCount,
        },
        issues_summary: issuesSummary,
      };
    });
  });

  // ── Reports (Advanced) ──────────────────────────────────────

  fastify.get('/reports/:type', { preHandler: requireEntitlement('tracking.reports') }, async (req, reply) => {
    const user = req.user;
    const { type } = req.params as { type: string };
    const { from, to } = req.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const toDate = to ? new Date(to) : new Date();

    return withTenant(user.tenant_id, async (trx) => {
      if (type === 'fleet-summary') {
        const vehicles = await trx.selectFrom('vehicles').selectAll()
          .where('tenant_id', '=', user.tenant_id).execute();
        const trips = await trx.selectFrom('trips').selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where('created_at', '>=', fromDate).where('created_at', '<=', toDate).execute();
        return { type, from: fromDate, to: toDate, vehicles, trips };
      }
      if (type === 'maintenance') {
        const records = await trx.selectFrom('maintenance_records').selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where('service_date', '>=', toDateParam(fromDate)).where('service_date', '<=', toDateParam(toDate))
          .orderBy('service_date', 'desc').execute();
        return { type, from: fromDate, to: toDate, records };
      }
      if (type === 'fuel') {
        const logs = await trx.selectFrom('fuel_logs').selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where('logged_at', '>=', fromDate).where('logged_at', '<=', toDate)
          .orderBy('logged_at', 'desc').execute();
        return { type, from: fromDate, to: toDate, logs };
      }
      if (type === 'trips') {
        const trips = await trx.selectFrom('trips').selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where('created_at', '>=', fromDate).where('created_at', '<=', toDate)
          .orderBy('created_at', 'desc').execute();
        return { type, from: fromDate, to: toDate, trips };
      }
      if (type === 'issues') {
        const issues = await trx.selectFrom('vehicle_issues as vi')
          .innerJoin('vehicles as v', 'v.id', 'vi.vehicle_id')
          .select([
            'vi.id', 'vi.title', 'vi.severity', 'vi.status', 'vi.source',
            'vi.created_at', 'vi.resolved_at', 'vi.due_date',
            'v.name as vehicle_name', 'v.plate_number as vehicle_plate',
          ])
          .where('vi.tenant_id', '=', user.tenant_id)
          .where('vi.created_at', '>=', fromDate).where('vi.created_at', '<=', toDate)
          .orderBy('vi.created_at', 'desc').execute();
        return { type, from: fromDate, to: toDate, issues };
      }
      return reply.status(400).send({ error: 'Unknown report type' });
    });
  });
}
