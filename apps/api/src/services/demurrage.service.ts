import { db, withTenant } from '../db/client.js';

interface RateTier {
  from_day: number;
  to_day: number;
  daily_rate: number;
}

/**
 * Calculate demurrage cost using progressive rate tiers.
 */
function calculateDemurrageCost(demurrageDays: number, rateTiers: RateTier[]): number {
  if (demurrageDays <= 0 || rateTiers.length === 0) return 0;
  
  let cost = 0;
  let remainingDays = demurrageDays;
  
  // Sort tiers by from_day ascending
  const sorted = [...rateTiers].sort((a, b) => a.from_day - b.from_day);
  
  for (const tier of sorted) {
    if (remainingDays <= 0) break;
    const tierRange = tier.to_day - tier.from_day + 1;
    const daysInTier = Math.min(remainingDays, tierRange);
    cost += daysInTier * tier.daily_rate;
    remainingDays -= daysInTier;
  }
  
  // If there are remaining days beyond the last tier, use the last tier's rate
  if (remainingDays > 0 && sorted.length > 0) {
    cost += remainingDays * sorted[sorted.length - 1].daily_rate;
  }
  
  return Math.round(cost * 100) / 100;
}

/**
 * Calculate the number of days between two dates.
 */
function daysBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export const demurrageService = {
  // ── Tariff CRUD ──

  async listTariffs(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return trx
        .selectFrom('demurrage_tariffs')
        .where('tenant_id', '=', tenantId)
        .orderBy('carrier_name')
        .orderBy('container_size')
        .selectAll()
        .execute();
    });
  },

  async createTariff(tenantId: string, data: {
    carrier_name: string;
    container_size: string;
    free_days: number;
    rate_tiers: RateTier[];
    currency?: string;
    effective_from?: string;
  }) {
    return withTenant(tenantId, async (trx) => {
      return trx
        .insertInto('demurrage_tariffs')
        .values({
          tenant_id: tenantId,
          carrier_name: data.carrier_name,
          container_size: data.container_size,
          free_days: data.free_days,
          rate_tiers: JSON.stringify(data.rate_tiers),
          currency: data.currency || 'USD',
          effective_from: data.effective_from ? new Date(data.effective_from) : new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async updateTariff(tenantId: string, tariffId: string, data: Partial<{
    carrier_name: string;
    container_size: string;
    free_days: number;
    rate_tiers: RateTier[];
    currency: string;
    active: boolean;
  }>) {
    return withTenant(tenantId, async (trx) => {
      const updateData: any = { updated_at: new Date() };
      if (data.carrier_name) updateData.carrier_name = data.carrier_name;
      if (data.container_size) updateData.container_size = data.container_size;
      if (data.free_days !== undefined) updateData.free_days = data.free_days;
      if (data.rate_tiers) updateData.rate_tiers = JSON.stringify(data.rate_tiers);
      if (data.currency) updateData.currency = data.currency;
      if (data.active !== undefined) updateData.active = data.active;

      return trx
        .updateTable('demurrage_tariffs')
        .set(updateData)
        .where('id', '=', tariffId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  // ── Container Tracking CRUD ──

  async listContainers(tenantId: string, filters?: {
    shipment_id?: string;
    status?: string;
    container_numbers?: string[];
  }) {
    return withTenant(tenantId, async (trx) => {
      let query = trx
        .selectFrom('container_tracking')
        .where('container_tracking.tenant_id', '=', tenantId);

      if (filters?.shipment_id) {
        query = query.where('shipment_id', '=', filters.shipment_id);
      }
      if (filters?.status) {
        query = query.where('status', '=', filters.status);
      }
      if (filters?.container_numbers && filters.container_numbers.length > 0) {
        query = query.where('container_number', 'in', filters.container_numbers);
      }

      return query.orderBy('created_at', 'desc').selectAll().execute();
    });
  },

  async addContainer(tenantId: string, data: {
    shipment_id: string;
    container_number: string;
    container_size: string;
    seal_number?: string;
    carrier_name?: string;
    discharge_date?: string;
    free_days?: number;
  }) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();
      let totalDays = 0;
      let demurrageDays = 0;
      let demurrageCost = 0;
      const freeDays = data.free_days || 7;

      if (data.discharge_date) {
        totalDays = daysBetween(new Date(data.discharge_date), now);
        demurrageDays = Math.max(0, totalDays - freeDays);
        
        // Try to find matching tariff
        if (demurrageDays > 0 && data.carrier_name) {
          const tariff = await trx
            .selectFrom('demurrage_tariffs')
            .where('tenant_id', '=', tenantId)
            .where('carrier_name', '=', data.carrier_name)
            .where('container_size', '=', data.container_size)
            .where('active', '=', true)
            .selectAll()
            .executeTakeFirst();
          
          if (tariff) {
            const tiers = (typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers) as RateTier[];
            demurrageCost = calculateDemurrageCost(demurrageDays, tiers);
          }
        }
      }

      return trx
        .insertInto('container_tracking')
        .values({
          tenant_id: tenantId,
          shipment_id: data.shipment_id,
          container_number: data.container_number,
          container_size: data.container_size,
          seal_number: data.seal_number || null,
          carrier_name: data.carrier_name || null,
          discharge_date: data.discharge_date ? new Date(data.discharge_date) : null,
          free_days: freeDays,
          total_days: totalDays,
          demurrage_days: demurrageDays,
          demurrage_cost: demurrageCost,
          demurrage_currency: 'USD',
          status: 'ACTIVE',
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async markReturned(tenantId: string, containerId: string, returnDate: string) {
    return withTenant(tenantId, async (trx) => {
      const container = await trx
        .selectFrom('container_tracking')
        .where('id', '=', containerId)
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .executeTakeFirstOrThrow();

      if (!container.discharge_date) {
        throw new Error('Container has no discharge date set');
      }

      const returnDt = new Date(returnDate);
      const totalDays = daysBetween(new Date(container.discharge_date), returnDt);
      const demurrageDays = Math.max(0, totalDays - container.free_days);

      // Calculate final demurrage cost
      let demurrageCost = 0;
      if (demurrageDays > 0 && container.carrier_name) {
        const tariff = await trx
          .selectFrom('demurrage_tariffs')
          .where('tenant_id', '=', tenantId)
          .where('carrier_name', '=', container.carrier_name)
          .where('container_size', '=', container.container_size)
          .where('active', '=', true)
          .selectAll()
          .executeTakeFirst();

        if (tariff) {
          const tiers = (typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers) as RateTier[];
          demurrageCost = calculateDemurrageCost(demurrageDays, tiers);
        }
      }

      return trx
        .updateTable('container_tracking')
        .set({
          return_date: returnDt,
          total_days: totalDays,
          demurrage_days: demurrageDays,
          demurrage_cost: demurrageCost,
          status: 'COMPLETED',
          updated_at: new Date(),
        })
        .where('id', '=', containerId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async updateContainer(tenantId: string, containerId: string, data: {
    container_number?: string;
    container_size?: string;
    seal_number?: string | null;
    carrier_name?: string | null;
    shipment_id?: string | null;
    discharge_date?: string | null;
    free_days?: number;
  }) {
    return withTenant(tenantId, async (trx) => {
      const existing = await trx
        .selectFrom('container_tracking')
        .where('id', '=', containerId)
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .executeTakeFirstOrThrow();

      const patch: Record<string, any> = { updated_at: new Date() };
      for (const k of ['container_number', 'container_size', 'seal_number', 'carrier_name', 'shipment_id'] as const) {
        if (k in data) patch[k] = (data as any)[k] ?? null;
      }
      if ('free_days' in data) patch.free_days = data.free_days ?? 7;
      if ('discharge_date' in data) patch.discharge_date = data.discharge_date ? new Date(data.discharge_date) : null;

      // Recompute running days/cost from the edited values for containers
      // still on the clock (COMPLETED ones keep their final settled figures).
      const dischargeDate = 'discharge_date' in data
        ? (data.discharge_date ? new Date(data.discharge_date) : null)
        : existing.discharge_date;
      const freeDays = ('free_days' in data ? data.free_days : existing.free_days) ?? 7;
      const carrier = 'carrier_name' in data ? data.carrier_name : existing.carrier_name;
      const size = ('container_size' in data ? data.container_size : existing.container_size)!;

      if (existing.status === 'ACTIVE' && dischargeDate) {
        const totalDays = daysBetween(new Date(dischargeDate), new Date());
        const demurrageDays = Math.max(0, totalDays - freeDays);
        let demurrageCost = 0;
        if (demurrageDays > 0 && carrier) {
          const tariff = await trx
            .selectFrom('demurrage_tariffs')
            .where('tenant_id', '=', tenantId)
            .where('carrier_name', '=', carrier)
            .where('container_size', '=', size)
            .where('active', '=', true)
            .selectAll()
            .executeTakeFirst();
          if (tariff) {
            const tiers = (typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers) as RateTier[];
            demurrageCost = calculateDemurrageCost(demurrageDays, tiers);
          }
        }
        patch.total_days = totalDays;
        patch.demurrage_days = demurrageDays;
        patch.demurrage_cost = demurrageCost;
      }

      return trx
        .updateTable('container_tracking')
        .set(patch)
        .where('id', '=', containerId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async deleteContainer(tenantId: string, containerId: string) {
    return withTenant(tenantId, async (trx) => {
      await trx
        .deleteFrom('container_tracking')
        .where('id', '=', containerId)
        .where('tenant_id', '=', tenantId)
        .execute();
      return { ok: true };
    });
  },

  async deleteTariff(tenantId: string, tariffId: string) {
    return withTenant(tenantId, async (trx) => {
      await trx
        .deleteFrom('demurrage_tariffs')
        .where('id', '=', tariffId)
        .where('tenant_id', '=', tenantId)
        .execute();
      return { ok: true };
    });
  },

  // ── Quick Calculator (no DB write) ──

  async quickCalculate(tenantId: string, data: {
    carrier_name: string;
    container_size: string;
    discharge_date: string;
    return_date?: string;
    free_days: number;
  }) {
    return withTenant(tenantId, async (trx) => {
      const endDate = data.return_date ? new Date(data.return_date) : new Date();
      const totalDays = daysBetween(new Date(data.discharge_date), endDate);
      const demurrageDays = Math.max(0, totalDays - data.free_days);

      let demurrageCost = 0;
      let tariffFound = false;

      const tariff = await trx
        .selectFrom('demurrage_tariffs')
        .where('tenant_id', '=', tenantId)
        .where('carrier_name', '=', data.carrier_name)
        .where('container_size', '=', data.container_size)
        .where('active', '=', true)
        .selectAll()
        .executeTakeFirst();

      if (tariff) {
        tariffFound = true;
        const tiers = (typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers) as RateTier[];
        demurrageCost = calculateDemurrageCost(demurrageDays, tiers);
      }

      return {
        total_days: totalDays,
        free_days: data.free_days,
        demurrage_days: demurrageDays,
        demurrage_cost: demurrageCost,
        currency: tariff?.currency || 'USD',
        tariff_found: tariffFound,
      };
    });
  },

  // ── Summary Stats ──

  async getSummary(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const containers = await trx
        .selectFrom('container_tracking')
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .execute();

      const active = containers.filter(c => c.status === 'ACTIVE');
      const completed = containers.filter(c => c.status === 'COMPLETED');
      const totalCost = containers.reduce((sum, c) => sum + Number(c.demurrage_cost), 0);
      const activeCost = active.reduce((sum, c) => sum + Number(c.demurrage_cost), 0);

      // Carrier breakdown
      const byCarrier: Record<string, { count: number; cost: number }> = {};
      for (const c of containers) {
        const carrier = c.carrier_name || 'Unknown';
        if (!byCarrier[carrier]) byCarrier[carrier] = { count: 0, cost: 0 };
        byCarrier[carrier].count++;
        byCarrier[carrier].cost += Number(c.demurrage_cost);
      }

      return {
        total_containers: containers.length,
        active_containers: active.length,
        completed_containers: completed.length,
        total_demurrage_cost: totalCost,
        active_demurrage_cost: activeCost,
        by_carrier: byCarrier,
      };
    });
  },
};
