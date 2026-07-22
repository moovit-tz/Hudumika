import { withTenant } from '../db/client.js';
import type { TrackingEvent } from '../routes/tracker.routes.js';

const DAY_MS = 86_400_000;
const ARRIVED_STATUS_CODES = new Set(['DELIVERED', 'ARRIVED']);

function parseEvents(raw: string | null | undefined): TrackingEvent[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Transit days for one snapshot: earliest event timestamp to latest. */
function transitDaysFor(events: TrackingEvent[]): number | null {
  if (events.length < 2) return null;
  const times = events.map(e => new Date(e.timestamp).getTime()).filter(t => !Number.isNaN(t));
  if (times.length < 2) return null;
  const span = Math.max(...times) - Math.min(...times);
  return Math.round(span / DAY_MS);
}

export const cargoAnalyticsService = {
  // ── Dashboard summary (KPI row) ─────────────────────────────────────────
  async getSummary(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const snapshots = await trx.selectFrom('tracking_snapshots')
        .where('tenant_id', '=', tenantId)
        .select(['status_code', 'eta', 'eta_initial'])
        .execute();
      const containers = await trx.selectFrom('container_tracking')
        .where('tenant_id', '=', tenantId)
        .select(['status'])
        .execute();

      const delayedShipments = snapshots.filter(s =>
        s.eta && s.eta_initial && new Date(s.eta).getTime() > new Date(s.eta_initial).getTime()
      ).length;
      const atPod = snapshots.filter(s => s.status_code && ARRIVED_STATUS_CODES.has(s.status_code)).length;

      return {
        shipments: snapshots.length,
        containers: containers.length,
        delayed_shipments: delayedShipments,
        shipments_at_pod: atPod,
      };
    });
  },

  // ── Carrier reliability (on-time %, avg deviation, avg transit) ────────
  async getCarrierAnalysis(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('tracking_snapshots')
        .where('tenant_id', '=', tenantId)
        .select(['carrier', 'eta', 'eta_initial', 'events'])
        .execute();

      const byCarrier: Record<string, {
        shipments: number;
        withDeviationData: number;
        onTime: number;
        deviationDaysSum: number;
        transitDaysSum: number;
        transitSampleCount: number;
      }> = {};

      for (const row of rows) {
        const carrier = row.carrier || 'Unknown';
        if (!byCarrier[carrier]) {
          byCarrier[carrier] = { shipments: 0, withDeviationData: 0, onTime: 0, deviationDaysSum: 0, transitDaysSum: 0, transitSampleCount: 0 };
        }
        const bucket = byCarrier[carrier];
        bucket.shipments++;

        if (row.eta && row.eta_initial) {
          bucket.withDeviationData++;
          const deviationDays = Math.round((new Date(row.eta).getTime() - new Date(row.eta_initial).getTime()) / DAY_MS);
          bucket.deviationDaysSum += deviationDays;
          if (deviationDays <= 0) bucket.onTime++;
        }

        const transit = transitDaysFor(parseEvents(row.events));
        if (transit !== null) {
          bucket.transitDaysSum += transit;
          bucket.transitSampleCount++;
        }
      }

      return Object.entries(byCarrier).map(([carrier, b]) => ({
        carrier,
        shipments: b.shipments,
        on_time_pct: b.withDeviationData > 0 ? Math.round((b.onTime / b.withDeviationData) * 100) : null,
        avg_deviation_days: b.withDeviationData > 0 ? Math.round((b.deviationDaysSum / b.withDeviationData) * 10) / 10 : null,
        avg_transit_days: b.transitSampleCount > 0 ? Math.round((b.transitDaysSum / b.transitSampleCount) * 10) / 10 : null,
      })).sort((a, b) => b.shipments - a.shipments);
    });
  },

  // ── Lane performance (origin → destination) ─────────────────────────────
  async getLaneAnalysis(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('tracking_snapshots')
        .where('tenant_id', '=', tenantId)
        .select(['origin_name', 'origin_code', 'dest_name', 'dest_code', 'eta', 'eta_initial', 'events'])
        .execute();

      const byLane: Record<string, {
        origin: string; destination: string;
        shipments: number;
        deviationDaysSum: number; withDeviationData: number;
        transitDaysSum: number; transitSampleCount: number;
      }> = {};

      for (const row of rows) {
        if (!row.origin_code && !row.origin_name) continue;
        const origin = row.origin_name || row.origin_code || 'Unknown';
        const destination = row.dest_name || row.dest_code || 'Unknown';
        const key = `${row.origin_code || origin}__${row.dest_code || destination}`;
        if (!byLane[key]) byLane[key] = { origin, destination, shipments: 0, deviationDaysSum: 0, withDeviationData: 0, transitDaysSum: 0, transitSampleCount: 0 };
        const bucket = byLane[key];
        bucket.shipments++;

        if (row.eta && row.eta_initial) {
          bucket.withDeviationData++;
          bucket.deviationDaysSum += Math.round((new Date(row.eta).getTime() - new Date(row.eta_initial).getTime()) / DAY_MS);
        }
        const transit = transitDaysFor(parseEvents(row.events));
        if (transit !== null) {
          bucket.transitDaysSum += transit;
          bucket.transitSampleCount++;
        }
      }

      return Object.values(byLane).map(b => ({
        lane: `${b.origin} → ${b.destination}`,
        shipments: b.shipments,
        avg_delay_days: b.withDeviationData > 0 ? Math.round((b.deviationDaysSum / b.withDeviationData) * 10) / 10 : null,
        avg_transit_days: b.transitSampleCount > 0 ? Math.round((b.transitDaysSum / b.transitSampleCount) * 10) / 10 : null,
      })).sort((a, b) => b.shipments - a.shipments).slice(0, 20);
    });
  },

  // ── Regional performance (country parsed from UN/LOCODE prefix) ────────
  async getRegionalAnalysis(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('tracking_snapshots')
        .where('tenant_id', '=', tenantId)
        .select(['dest_code', 'eta', 'eta_initial'])
        .execute();

      const byCountry: Record<string, { shipments: number; deviationDaysSum: number; withDeviationData: number }> = {};
      for (const row of rows) {
        const country = row.dest_code && row.dest_code.length >= 2 ? row.dest_code.slice(0, 2).toUpperCase() : 'Unknown';
        if (!byCountry[country]) byCountry[country] = { shipments: 0, deviationDaysSum: 0, withDeviationData: 0 };
        const bucket = byCountry[country];
        bucket.shipments++;
        if (row.eta && row.eta_initial) {
          bucket.withDeviationData++;
          bucket.deviationDaysSum += Math.round((new Date(row.eta).getTime() - new Date(row.eta_initial).getTime()) / DAY_MS);
        }
      }

      return Object.entries(byCountry).map(([country, b]) => ({
        country,
        shipments: b.shipments,
        avg_delay_days: b.withDeviationData > 0 ? Math.round((b.deviationDaysSum / b.withDeviationData) * 10) / 10 : null,
      })).sort((a, b) => b.shipments - a.shipments);
    });
  },

  // ── Demurrage cost trend (month-over-month, on top of the existing summary) ─
  async getDemurrageTrend(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const containers = await trx.selectFrom('container_tracking')
        .where('tenant_id', '=', tenantId)
        .select(['discharge_date', 'demurrage_cost', 'demurrage_days'])
        .execute();

      const byMonth: Record<string, { cost: number; days: number; count: number }> = {};
      for (const c of containers) {
        if (!c.discharge_date) continue;
        const d = new Date(c.discharge_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonth[key]) byMonth[key] = { cost: 0, days: 0, count: 0 };
        byMonth[key].cost += Number(c.demurrage_cost) || 0;
        byMonth[key].days += Number(c.demurrage_days) || 0;
        byMonth[key].count++;
      }

      return Object.entries(byMonth)
        .map(([month, b]) => ({ month, cost: Math.round(b.cost * 100) / 100, avg_days: b.count > 0 ? Math.round((b.days / b.count) * 10) / 10 : 0, containers: b.count }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-12);
    });
  },
};
