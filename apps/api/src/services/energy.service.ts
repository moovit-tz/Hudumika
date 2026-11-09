// Energy & Utilities (industry-readiness backlog item 26), all three
// modules per the business's own scope decision: utility billing, fuel
// retail, EV charging — deliberately separate table groups, never a
// forced-generic "meter" that papers over three different real business
// models. The backlog's own P0 across all three: "measured quantities and
// financial reconciliation under retry/correction" — the one thing every
// sub-module here is actually tested against.
import type { Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { getIndustryWork, IndustryWorkError } from './finance-industry-work.service.js';

type Trx = Transaction<Database>;

// ═════════════════════════════════════════════════════════════
// UTILITY BILLING
// ═════════════════════════════════════════════════════════════

export async function createMeter(tenantId: string, workId: string, input: {
  meter_number: string; service_point?: string; meter_type: 'electricity' | 'water' | 'gas';
}) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'energy') throw new IndustryWorkError('Meters require an energy industry work.');
    return trx.insertInto('energy_meters').values({
      tenant_id: tenantId, work_id: workId, meter_number: input.meter_number,
      service_point: input.service_point ?? null, meter_type: input.meter_type,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function createTariff(tenantId: string, input: {
  meter_type: 'electricity' | 'water' | 'gas' | 'ev'; name: string; rate_per_unit: number;
  effective_from: string; effective_to?: string;
}) {
  return withTenant(tenantId, trx => trx.insertInto('energy_tariffs').values({
    tenant_id: tenantId, meter_type: input.meter_type, name: input.name, rate_per_unit: input.rate_per_unit,
    effective_from: input.effective_from, effective_to: input.effective_to ?? null,
  }).returningAll().executeTakeFirstOrThrow());
}

async function activeTariffFor(trx: Trx, tenantId: string, meterType: string, asOfDate: string) {
  const tariff = await trx.selectFrom('energy_tariffs').selectAll()
    .where('tenant_id', '=', tenantId).where('meter_type', '=', meterType as any)
    .where('effective_from', '<=', asOfDate)
    .where(eb => eb.or([eb('effective_to', 'is', null), eb('effective_to', '>=', asOfDate)]))
    .orderBy('effective_from', 'desc').executeTakeFirst();
  if (!tariff) throw new IndustryWorkError(`No tariff is configured for ${meterType} covering ${asOfDate}.`, 409);
  return tariff;
}

async function previousReadingValue(trx: Trx, tenantId: string, meterId: string, beforeDate: string, excludeId?: string) {
  let q = trx.selectFrom('energy_readings').select('reading_value')
    .where('tenant_id', '=', tenantId).where('meter_id', '=', meterId).where('status', '=', 'active')
    .where('reading_date', '<', beforeDate);
  if (excludeId) q = q.where('id', '!=', excludeId);
  const prev = await q.orderBy('reading_date', 'desc').executeTakeFirst();
  return prev ? Number(prev.reading_value) : 0;
}

export async function recordMeterReading(tenantId: string, actorId: string, meterId: string, input: { reading_date: string; reading_value: number }) {
  return withTenant(tenantId, async trx => {
    const meter = await trx.selectFrom('energy_meters').selectAll().where('tenant_id', '=', tenantId).where('id', '=', meterId).forUpdate().executeTakeFirst();
    if (!meter) throw new IndustryWorkError('Meter not found.', 404);
    const previous = await previousReadingValue(trx, tenantId, meterId, input.reading_date);
    if (input.reading_value < previous) throw new IndustryWorkError(`Reading ${input.reading_value} is less than the previous reading of ${previous}.`, 400);
    const consumption = Math.round((input.reading_value - previous) * 10000) / 10000;
    return trx.insertInto('energy_readings').values({
      tenant_id: tenantId, meter_id: meterId, reading_date: input.reading_date,
      reading_value: input.reading_value, consumption, recorded_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function billReading(tenantId: string, readingId: string) {
  return withTenant(tenantId, async trx => {
    const reading = await trx.selectFrom('energy_readings').selectAll().where('tenant_id', '=', tenantId).where('id', '=', readingId).forUpdate().executeTakeFirst();
    if (!reading) throw new IndustryWorkError('Reading not found.', 404);
    if (reading.status !== 'active') throw new IndustryWorkError('A superseded reading cannot be billed.', 409);
    if (reading.billed) throw new IndustryWorkError('This reading has already been billed.', 409);
    const meter = await trx.selectFrom('energy_meters').select('meter_type').where('tenant_id', '=', tenantId).where('id', '=', reading.meter_id).executeTakeFirstOrThrow();
    const tariff = await activeTariffFor(trx, tenantId, meter.meter_type, reading.reading_date);
    const amount = Math.round(Number(reading.consumption) * Number(tariff.rate_per_unit) * 100) / 100;
    const charge = await trx.insertInto('energy_charges').values({
      tenant_id: tenantId, reading_id: readingId, tariff_id: tariff.id, amount,
    }).returningAll().executeTakeFirstOrThrow();
    await trx.updateTable('energy_readings').set({ billed: true }).where('tenant_id', '=', tenantId).where('id', '=', readingId).execute();
    return charge;
  });
}

/**
 * Corrects a reading already recorded (and possibly already billed). The
 * P0 this whole function exists for: "measured quantities and financial
 * reconciliation under retry/correction" — the old reading is never
 * edited in place (it's marked `corrected`, kept for the audit chain);
 * any charge already raised against it is voided, never left to
 * double-count alongside whatever gets billed against the correction.
 */
export async function correctMeterReading(tenantId: string, actorId: string, readingId: string, input: { reading_value: number; reason: string }) {
  return withTenant(tenantId, async trx => {
    const old = await trx.selectFrom('energy_readings').selectAll().where('tenant_id', '=', tenantId).where('id', '=', readingId).forUpdate().executeTakeFirst();
    if (!old) throw new IndustryWorkError('Reading not found.', 404);
    if (old.status !== 'active') throw new IndustryWorkError('This reading has already been superseded by a correction.', 409);

    if (old.billed) {
      await trx.updateTable('energy_charges').set({
        status: 'voided', voided_at: new Date(), voided_by: actorId, void_reason: input.reason,
      }).where('tenant_id', '=', tenantId).where('reading_id', '=', readingId).where('status', '!=', 'voided').execute();
    }
    await trx.updateTable('energy_readings').set({ status: 'corrected' }).where('tenant_id', '=', tenantId).where('id', '=', readingId).execute();

    const previous = await previousReadingValue(trx, tenantId, old.meter_id, old.reading_date, old.id);
    if (input.reading_value < previous) throw new IndustryWorkError(`Corrected reading ${input.reading_value} is less than the previous reading of ${previous}.`, 400);
    const consumption = Math.round((input.reading_value - previous) * 10000) / 10000;
    return trx.insertInto('energy_readings').values({
      tenant_id: tenantId, meter_id: old.meter_id, reading_date: old.reading_date, reading_value: input.reading_value,
      consumption, is_correction: true, corrects_reading_id: old.id, recorded_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

// ═════════════════════════════════════════════════════════════
// FUEL RETAIL
// ═════════════════════════════════════════════════════════════

export async function createTank(tenantId: string, workId: string, input: { tank_number: string; fuel_type: 'petrol' | 'diesel' | 'kerosene'; capacity_litres: number }) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'energy') throw new IndustryWorkError('Tanks require an energy industry work.');
    return trx.insertInto('fuel_tanks').values({
      tenant_id: tenantId, work_id: workId, tank_number: input.tank_number,
      fuel_type: input.fuel_type, capacity_litres: input.capacity_litres,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function createNozzle(tenantId: string, tankId: string, nozzleNumber: string) {
  return withTenant(tenantId, async trx => {
    const tank = await trx.selectFrom('fuel_tanks').select('id').where('tenant_id', '=', tenantId).where('id', '=', tankId).executeTakeFirst();
    if (!tank) throw new IndustryWorkError('Tank not found.', 404);
    return trx.insertInto('fuel_nozzles').values({ tenant_id: tenantId, tank_id: tankId, nozzle_number: nozzleNumber }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function receiveFuelDelivery(tenantId: string, actorId: string, tankId: string, input: { delivered_litres: number; supplier_reference?: string }) {
  return withTenant(tenantId, async trx => {
    const tank = await trx.selectFrom('fuel_tanks').selectAll().where('tenant_id', '=', tenantId).where('id', '=', tankId).forUpdate().executeTakeFirst();
    if (!tank) throw new IndustryWorkError('Tank not found.', 404);
    const newVolume = Number(tank.current_volume_litres) + input.delivered_litres;
    if (newVolume > Number(tank.capacity_litres)) {
      throw new IndustryWorkError(`This delivery would overfill the tank (${newVolume}L against a ${tank.capacity_litres}L capacity).`, 409);
    }
    await trx.updateTable('fuel_tanks').set({ current_volume_litres: newVolume, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', tankId).execute();
    return trx.insertInto('fuel_deliveries').values({
      tenant_id: tenantId, tank_id: tankId, delivered_litres: input.delivered_litres,
      supplier_reference: input.supplier_reference ?? null, recorded_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function openFuelShift(tenantId: string, actorId: string, workId: string, nozzleId: string, openingTotalizer: number) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'energy') throw new IndustryWorkError('Fuel shifts require an energy industry work.');
    const nozzle = await trx.selectFrom('fuel_nozzles').select('id').where('tenant_id', '=', tenantId).where('id', '=', nozzleId).forUpdate().executeTakeFirst();
    if (!nozzle) throw new IndustryWorkError('Nozzle not found.', 404);
    const openShift = await trx.selectFrom('fuel_shifts').select('id').where('tenant_id', '=', tenantId).where('nozzle_id', '=', nozzleId).where('status', '=', 'open').executeTakeFirst();
    if (openShift) throw new IndustryWorkError('This nozzle already has an open shift.', 409);
    return trx.insertInto('fuel_shifts').values({
      tenant_id: tenantId, work_id: workId, nozzle_id: nozzleId, opened_by: actorId, opening_totalizer: openingTotalizer,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

/**
 * Closes a shift and reconciles it against the tank's own recorded
 * volume — the backlog's own "variance if included". `litres_dispensed`
 * comes from the nozzle's own totalizer (a real meter reading, not an
 * estimate); if the tank's recorded volume can't actually supply that
 * much, the shortfall is recorded as a real, attributable variance to
 * investigate, not silently absorbed by letting the tank go negative.
 */
export async function closeFuelShift(tenantId: string, actorId: string, shiftId: string, closingTotalizer: number) {
  return withTenant(tenantId, async trx => {
    const shift = await trx.selectFrom('fuel_shifts').selectAll().where('tenant_id', '=', tenantId).where('id', '=', shiftId).forUpdate().executeTakeFirst();
    if (!shift) throw new IndustryWorkError('Shift not found.', 404);
    if (shift.status !== 'open') throw new IndustryWorkError('This shift is already closed.', 409);
    if (closingTotalizer < Number(shift.opening_totalizer)) throw new IndustryWorkError('Closing totalizer cannot be less than the opening totalizer.', 400);
    const litresDispensed = Math.round((closingTotalizer - Number(shift.opening_totalizer)) * 100) / 100;

    const nozzle = await trx.selectFrom('fuel_nozzles').select('tank_id').where('tenant_id', '=', tenantId).where('id', '=', shift.nozzle_id).executeTakeFirstOrThrow();
    const tank = await trx.selectFrom('fuel_tanks').selectAll().where('tenant_id', '=', tenantId).where('id', '=', nozzle.tank_id).forUpdate().executeTakeFirstOrThrow();
    const projectedVolume = Number(tank.current_volume_litres) - litresDispensed;
    const variance = projectedVolume < 0 ? Math.round(Math.abs(projectedVolume) * 100) / 100 : 0;
    await trx.updateTable('fuel_tanks').set({ current_volume_litres: Math.max(0, projectedVolume), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', tank.id).execute();

    return trx.updateTable('fuel_shifts').set({
      closing_totalizer: closingTotalizer, litres_dispensed: litresDispensed, tank_variance_litres: variance,
      status: 'closed', closed_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('id', '=', shiftId).returningAll().executeTakeFirstOrThrow();
  });
}

// ═════════════════════════════════════════════════════════════
// EV CHARGING
// ═════════════════════════════════════════════════════════════

export async function createConnector(tenantId: string, workId: string, connectorNumber: string) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.industry !== 'energy') throw new IndustryWorkError('Connectors require an energy industry work.');
    return trx.insertInto('ev_connectors').values({ tenant_id: tenantId, work_id: workId, connector_number: connectorNumber }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function startEvSession(tenantId: string, actorId: string, connectorId: string) {
  return withTenant(tenantId, async trx => {
    const connector = await trx.selectFrom('ev_connectors').selectAll().where('tenant_id', '=', tenantId).where('id', '=', connectorId).forUpdate().executeTakeFirst();
    if (!connector) throw new IndustryWorkError('Connector not found.', 404);
    if (connector.status !== 'available') throw new IndustryWorkError(`Connector is ${connector.status}, not available.`, 409);
    await trx.updateTable('ev_connectors').set({ status: 'charging', updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', connectorId).execute();
    return trx.insertInto('ev_sessions').values({ tenant_id: tenantId, connector_id: connectorId, started_by: actorId }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function endEvSession(tenantId: string, sessionId: string, energyKwh: number) {
  return withTenant(tenantId, async trx => {
    const session = await trx.selectFrom('ev_sessions').selectAll().where('tenant_id', '=', tenantId).where('id', '=', sessionId).forUpdate().executeTakeFirst();
    if (!session) throw new IndustryWorkError('Session not found.', 404);
    if (session.status !== 'active') throw new IndustryWorkError('This session is not active.', 409);
    const tariff = await activeTariffFor(trx, tenantId, 'ev', new Date().toISOString().slice(0, 10));
    const amount = Math.round(energyKwh * Number(tariff.rate_per_unit) * 100) / 100;
    await trx.updateTable('ev_connectors').set({ status: 'available', updated_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', session.connector_id).execute();
    return trx.updateTable('ev_sessions').set({
      ended_at: new Date(), energy_kwh: energyKwh, tariff_id: tariff.id, amount, status: 'completed',
    }).where('tenant_id', '=', tenantId).where('id', '=', sessionId).returningAll().executeTakeFirstOrThrow();
  });
}

export async function settleEvSession(tenantId: string, sessionId: string) {
  return withTenant(tenantId, async trx => {
    const session = await trx.selectFrom('ev_sessions').select(['id', 'status']).where('tenant_id', '=', tenantId).where('id', '=', sessionId).forUpdate().executeTakeFirst();
    if (!session) throw new IndustryWorkError('Session not found.', 404);
    if (session.status !== 'completed') throw new IndustryWorkError('Only a completed session can be settled.', 409);
    return trx.updateTable('ev_sessions').set({ status: 'settled' }).where('tenant_id', '=', tenantId).where('id', '=', sessionId).returningAll().executeTakeFirstOrThrow();
  });
}
