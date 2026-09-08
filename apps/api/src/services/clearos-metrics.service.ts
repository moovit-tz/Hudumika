import { withTenant } from '../db/client.js';

/**
 * ClearOS metrics registered into the platform Metric Registry (migration
 * 413). Both read data that was already being captured for other reasons
 * — stage_history.duration_h (analytics.routes.ts's own /bottlenecks
 * endpoint already aggregates it per-stage, tenant-scoped) and
 * landed_cost_records.total_tzs (written by every landed-cost calculator
 * run since migration 036) — rather than inventing a new capture path.
 * Neither existed as a single scalar KPI before; both are new aggregate
 * *views* over already-real, already-tenant-scoped data.
 */

/** Average hours from a shipment case's creation to its CLOSED stage_history
 *  entry, for cases that closed within the window. Cases still open are
 *  correctly excluded — this measures completed turnaround, not an
 *  in-flight case's elapsed time so far. */
export async function computeClearanceTurnaroundHours(tenantId: string, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86400000);
  return withTenant(tenantId, async (trx) => {
    const rows = await trx
      .selectFrom('stage_history as sh')
      .innerJoin('shipment_cases as sc', 'sc.id', 'sh.shipment_id')
      .select(['sc.created_at as created_at', 'sh.entered_at as closed_at'])
      .where('sh.tenant_id', '=', tenantId)
      .where('sh.stage', '=', 'CLOSED')
      .where('sh.entered_at', '>=', cutoff)
      .execute();

    if (rows.length === 0) return 0;
    const totalHours = rows.reduce((sum, r) => {
      const created = new Date(r.created_at as any).getTime();
      const closed = new Date(r.closed_at as any).getTime();
      return sum + Math.max(0, (closed - created) / 3600000);
    }, 0);
    return Number((totalHours / rows.length).toFixed(1));
  });
}

/** Average total landed cost (TZS) across calculator runs saved in the
 *  window — landed_cost_records.total_tzs is the calculator's own real
 *  output, not re-derived here. */
export async function computeLandedCostAvgTzs(tenantId: string, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86400000);
  return withTenant(tenantId, async (trx) => {
    const row = await trx
      .selectFrom('landed_cost_records')
      .select((eb) => [eb.fn.avg('total_tzs').as('avg_v'), eb.fn.count('id').as('n')])
      .where('tenant_id', '=', tenantId)
      .where('created_at', '>=', cutoff)
      .executeTakeFirst();
    const n = Number(row?.n ?? 0);
    if (n === 0) return 0;
    return Number(Number(row?.avg_v ?? 0).toFixed(0));
  });
}
