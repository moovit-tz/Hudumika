import { z } from 'zod';
import { validateTrackerReferences } from './tracker-integrity.js';
import { withTenant } from '../db/client.js';

const validDate = z.string().refine(v => /^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v.slice(0,10), 'Invalid date');
const freeDaysSchema = z.number().int().min(0).max(3650);
const tiersSchema = z.array(z.object({ from_day: z.number().int().min(1), to_day: z.number().int().min(1), daily_rate: z.number().finite().min(0) })).min(1).max(100).superRefine((tiers, ctx) => {
  let next = 1;
  for (const tier of [...tiers].sort((a,b) => a.from_day-b.from_day)) {
    if (tier.from_day !== next || tier.to_day < tier.from_day) ctx.addIssue({ code: 'custom', message: 'Tiers must cover consecutive days starting at 1 without gaps or overlaps' });
    next = tier.to_day + 1;
  }
});
function validateInput(data: any) {
  if ('free_days' in data) freeDaysSchema.parse(data.free_days);
  for (const k of ['discharge_date','return_date','effective_from']) if (data[k] != null) validDate.parse(data[k]);
  if (data.currency !== undefined) z.string().regex(/^[A-Z]{3}$/).parse(data.currency);
  if ('rate_tiers' in data) tiersSchema.parse(data.rate_tiers);
}
interface RateTier {
  from_day: number;
  to_day: number;
  daily_rate: number;
}

/**
 * Calculate demurrage cost using progressive rate tiers.
 */
export function calculateDemurrageCost(demurrageDays: number, rateTiers: RateTier[]): number {
  const validated = tiersSchema.parse(rateTiers);
  if (demurrageDays <= 0) return 0;
  
  let cost = 0;
  let remainingDays = demurrageDays;
  
  // Sort tiers by from_day ascending
  const sorted = [...validated].sort((a, b) => a.from_day - b.from_day);
  
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
export function daysBetween(start: Date, end: Date): number {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) throw Object.assign(new Error('End date must be on or after discharge date'), { statusCode: 400 });
  // Tariffs use UTC calendar dates; partial elapsed days are not extra chargeable days.
  return Math.floor((Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate()) - Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate())) / 86400000);
}

export const demurrageService = {
  async refreshCharges(tenantId: string) {
    await withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('container_tracking').selectAll().where('tenant_id','=',tenantId).where('status','=','ACTIVE').forUpdate().execute();
      const posted = await trx.selectFrom('journal_entries').select('source_id').where('tenant_id','=',tenantId).where('source_module','=','EXPENSE').where('status','<>','VOIDED').execute();
      const frozen = new Set(posted.map(r => r.source_id));
      for (const row of rows) {
        if (!row.discharge_date || new Date(row.discharge_date) > new Date() || frozen.has(row.id)) continue;
        const total = daysBetween(new Date(row.discharge_date), new Date());
        const days = Math.max(0,total-row.free_days);
        const tariff = row.tariff_snapshot ?? (row.carrier_name ? await trx.selectFrom('demurrage_tariffs').selectAll().where('tenant_id','=',tenantId).where('carrier_name','=',row.carrier_name).where('container_size','=',row.container_size).where('active','=',true).where('effective_from','<=',new Date(row.discharge_date).toISOString().slice(0,10)).orderBy('effective_from','desc').orderBy('created_at','desc').executeTakeFirst() : null);
        if (!tariff) {
          await trx.updateTable('container_tracking').set({total_days:total,demurrage_days:days,updated_at:new Date()}).where('tenant_id','=',tenantId).where('id','=',row.id).execute();
          continue;
        }
        const tiers = tiersSchema.parse(typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers);
        await trx.updateTable('container_tracking').set({ total_days: total, demurrage_days: days, demurrage_cost: calculateDemurrageCost(days,tiers), demurrage_currency: String(tariff.currency), tariff_snapshot: { id: tariff.id, currency: tariff.currency, rate_tiers: tiers, effective_from: tariff.effective_from }, updated_at: new Date() }).where('tenant_id','=',tenantId).where('id','=',row.id).execute();
      }
    });
  },
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
      z.object({ carrier_name: z.string().trim().min(1).max(200), container_size: z.string().trim().min(1).max(30), free_days: freeDaysSchema, rate_tiers: tiersSchema }).parse(data);
      validateInput(data);
      await validateTrackerReferences(trx, tenantId, data);
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
      validateInput(data);
      await validateTrackerReferences(trx, tenantId, data);
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
    await this.refreshCharges(tenantId);
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
      validateInput(data);
      await validateTrackerReferences(trx, tenantId, data);
      z.object({ shipment_id: z.string().uuid(), container_number: z.string().min(1).max(30), container_size: z.string().min(1).max(30) }).parse(data);
      const now = new Date();
      let totalDays = 0;
      let demurrageDays = 0;
      let demurrageCost = 0;
      const freeDays = data.free_days ?? 7;
      let currency = 'USD';
      let tariffSnapshot: Record<string, unknown> | null = null;
      let tariffFound = false;

      if (data.discharge_date) {
        totalDays = daysBetween(new Date(data.discharge_date), now);
        demurrageDays = Math.max(0, totalDays - freeDays);
        
        // Try to find matching tariff
        if (data.carrier_name) {
          const tariff = await trx
            .selectFrom('demurrage_tariffs')
            .where('tenant_id', '=', tenantId)
            .where('carrier_name', '=', data.carrier_name)
            .where('container_size', '=', data.container_size)
            .where('active', '=', true)
            .where('effective_from', '<=', new Date(data.discharge_date!).toISOString().slice(0,10))
            .orderBy('effective_from','desc').orderBy('created_at','desc')
            .selectAll()
            .executeTakeFirst();
          
          if (tariff) {
            const tiers = (typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers) as RateTier[];
            demurrageCost = calculateDemurrageCost(demurrageDays, tiers);
            currency = tariff.currency; tariffFound = true;
            tariffSnapshot = { id: tariff.id, currency: tariff.currency, rate_tiers: tiers, effective_from: tariff.effective_from };
          }
        }
      }

      if (demurrageDays > 0 && !tariffFound) throw Object.assign(new Error('No applicable tariff; configure a tariff effective on the discharge date before recording charges'), { statusCode: 400 });
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
          demurrage_currency: currency,
          tariff_snapshot: tariffSnapshot,
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
      const posted = await trx.selectFrom('journal_entries').select('id').where('tenant_id','=',tenantId).where('source_module','=','EXPENSE').where('source_id','=',containerId).where('status','<>','VOIDED').executeTakeFirst();
      if (posted) throw Object.assign(new Error('Charge already posted; void the journal before changing it'), { statusCode: 409 });

      const container = await trx
        .selectFrom('container_tracking')
        .where('id', '=', containerId)
        .where('tenant_id', '=', tenantId)
        .selectAll().forUpdate()
        .executeTakeFirstOrThrow();

      if (!container.discharge_date) {
        throw new Error('Container has no discharge date set');
      }

      validDate.parse(returnDate);
      const returnDt = new Date(returnDate);
      const totalDays = daysBetween(new Date(container.discharge_date), returnDt);
      const demurrageDays = Math.max(0, totalDays - container.free_days);

      // Calculate final demurrage cost
      let demurrageCost = 0;
      let currency = container.demurrage_currency;
      let tariffFound = false;
      if (container.carrier_name) {
        const tariff = container.tariff_snapshot ?? await trx
          .selectFrom('demurrage_tariffs')
          .where('tenant_id', '=', tenantId)
          .where('carrier_name', '=', container.carrier_name)
          .where('container_size', '=', container.container_size)
          .where('active', '=', true)
            .where('effective_from', '<=', new Date(container.discharge_date!).toISOString().slice(0,10))
            .orderBy('effective_from','desc').orderBy('created_at','desc')
          .selectAll()
          .executeTakeFirst();

        if (tariff) {
          const tiers = tiersSchema.parse(typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers);
          demurrageCost = calculateDemurrageCost(demurrageDays, tiers);
          currency = String(tariff.currency); tariffFound = true;
        }
      }

      if (demurrageDays > 0 && !tariffFound) throw Object.assign(new Error('No applicable tariff for this charge'), { statusCode: 400 });
      return trx
        .updateTable('container_tracking')
        .set({
          return_date: returnDt,
          total_days: totalDays,
          demurrage_days: demurrageDays,
          demurrage_cost: demurrageCost,
          demurrage_currency: currency,
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
    // HUD-0057: the columns cost-posting.service.ts has always read (whose
    // debit account and recharge-eligibility depend on liable_party, and
    // whose WAIVED status skips posting entirely) but nothing could ever
    // write — see this function's own liability guard below.
    liable_party?: 'CUSTOMER' | 'COMPANY';
    liability_reason?: string | null;
    status?: 'ACTIVE' | 'COMPLETED' | 'WAIVED';
  }) {
    return withTenant(tenantId, async (trx) => {
      validateInput(data);
      await validateTrackerReferences(trx, tenantId, data);
      const existing = await trx
        .selectFrom('container_tracking')
        .where('id', '=', containerId)
        .where('tenant_id', '=', tenantId)
        .selectAll().forUpdate()
        .executeTakeFirstOrThrow();

      if ('liable_party' in data && data.liable_party !== 'CUSTOMER' && data.liable_party !== 'COMPANY') {
        throw Object.assign(new Error(`liable_party must be "CUSTOMER" or "COMPANY", got "${data.liable_party}".`), { statusCode: 400 });
      }
      if ('status' in data && !['ACTIVE', 'COMPLETED', 'WAIVED'].includes(data.status as string)) {
        throw Object.assign(new Error(`status must be one of ACTIVE, COMPLETED, WAIVED, got "${data.status}".`), { statusCode: 400 });
      }
      // Once a charge has actually been posted to the GL (cost-posting.
      // service.ts's own idempotency check), the liability call has already
      // been booked into a real journal entry — changing it here afterward
      // would desync the container's own record from what was actually
      // debited, the same "financial immutability once posted" rule this
      // arc already applies to invoices/bills (void-and-repost, never a
      // silent retroactive edit). Not blocked before posting: this is
      // exactly the normal "decide liability, then post" workflow.
      if (Object.keys(data).length > 0) {
        const posted = await trx.selectFrom('journal_entries').select('id')
          .where('tenant_id', '=', tenantId).where('source_module', '=', 'EXPENSE')
          .where('source_id', '=', containerId).where('status', '<>', 'VOIDED')
          .executeTakeFirst();
        if (posted) {
          throw Object.assign(new Error('This charge has already been posted to the ledger — liability and waiver can no longer be changed here. Void the journal entry first if it was posted in error.'), { statusCode: 400 });
        }
      }

      if (existing.status !== 'ACTIVE' && Object.keys(data).some(k => !['notes','liable_party','liability_reason'].includes(k))) throw Object.assign(new Error('Settled charges cannot be recalculated here'), { statusCode: 409 });
      const patch: Record<string, any> = { updated_at: new Date() };
      if ('liable_party' in data) patch.liable_party = data.liable_party;
      if ('liability_reason' in data) patch.liability_reason = data.liability_reason ?? null;
      if ('status' in data) patch.status = data.status;
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
        if (carrier) {
          const tariff = (!('carrier_name' in data) && !('container_size' in data) && !('discharge_date' in data) ? existing.tariff_snapshot : null) ?? await trx
            .selectFrom('demurrage_tariffs')
            .where('tenant_id', '=', tenantId)
            .where('carrier_name', '=', carrier)
            .where('container_size', '=', size)
            .where('active', '=', true)
            .where('effective_from', '<=', new Date(dischargeDate!).toISOString().slice(0,10))
            .orderBy('effective_from','desc').orderBy('created_at','desc')
            .selectAll()
            .executeTakeFirst();
          if (tariff) {
            const tiers = (typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers) as RateTier[];
            demurrageCost = calculateDemurrageCost(demurrageDays, tiers);
            patch.demurrage_currency = String(tariff.currency);
            patch.tariff_snapshot = { id: tariff.id, currency: tariff.currency, rate_tiers: tiers, effective_from: tariff.effective_from };
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
      const posted = await trx.selectFrom('journal_entries').select('id').where('tenant_id','=',tenantId).where('source_module','=','EXPENSE').where('source_id','=',containerId).where('status','<>','VOIDED').executeTakeFirst();
      if (posted) throw Object.assign(new Error('Charge already posted; void the journal before changing it'), { statusCode: 409 });

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
      validateInput(data);
      await validateTrackerReferences(trx, tenantId, data);
      z.object({ carrier_name: z.string().min(1).max(200), container_size: z.string().min(1).max(30), discharge_date: validDate, free_days: freeDaysSchema }).parse(data);
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
            .where('effective_from', '<=', new Date(data.discharge_date).toISOString().slice(0,10))
            .orderBy('effective_from','desc').orderBy('created_at','desc')
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
    await this.refreshCharges(tenantId);
    return withTenant(tenantId, async (trx) => {
      const containers = await trx
        .selectFrom('container_tracking')
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .execute();

      const active = containers.filter(c => c.status === 'ACTIVE');
      const completed = containers.filter(c => c.status === 'COMPLETED');
      const currencies = [...new Set(containers.map(c => c.demurrage_currency))];
      const totalCost = containers.reduce((sum, c) => sum + Number(c.demurrage_cost), 0);
      const activeCost = active.reduce((sum, c) => sum + Number(c.demurrage_cost), 0);

      // Carrier breakdown
      const byCarrier: Record<string, { count: number; cost: number }> = {};
      for (const c of containers) {
        const carrier = `${c.carrier_name || 'Unknown'} (${c.demurrage_currency})`;
        if (!byCarrier[carrier]) byCarrier[carrier] = { count: 0, cost: 0 };
        byCarrier[carrier].count++;
        byCarrier[carrier].cost += Number(c.demurrage_cost);
      }

      return {
        unpriced_containers: containers.filter(c=>c.status==='ACTIVE' && c.demurrage_days>0 && !c.tariff_snapshot).length,
        total_containers: containers.length,
        active_containers: active.length,
        completed_containers: completed.length,
        total_demurrage_cost: currencies.length <= 1 ? totalCost : null,
        currency: currencies.length === 1 ? currencies[0] : null,
        by_currency: Object.fromEntries(currencies.map(currency => [currency, containers.filter(c => c.demurrage_currency === currency).reduce((n,c) => n + Number(c.demurrage_cost),0)])),
        active_demurrage_cost: currencies.length <= 1 ? activeCost : null,
        by_carrier: byCarrier,
      };
    });
  },
};
