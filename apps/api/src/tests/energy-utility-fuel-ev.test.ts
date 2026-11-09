// Energy & Utilities (industry-readiness backlog item 26), all three
// modules per the business's own scope decision. The shared P0 across
// all three: "measured quantities and financial reconciliation under
// retry/correction" — exercised for real against a disposable tenant.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../db/client.js';
import { createIndustryWork } from '../services/finance-industry-work.service.js';
import {
  createMeter, createTariff, recordMeterReading, billReading, correctMeterReading,
  createTank, createNozzle, receiveFuelDelivery, openFuelShift, closeFuelShift,
  createConnector, startEvSession, endEvSession, settleEvSession,
} from '../services/energy.service.js';
import { createTestTenant, type TestTenant } from './helpers.js';

describe('Energy & Utilities — utility billing, fuel retail, EV charging', () => {
  let tenant: TestTenant;
  let customerId: string;

  beforeAll(async () => {
    tenant = await createTestTenant();
    await withTenant(tenant.tenantId, async trx => {
      customerId = (await trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Energy Test Client' }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);

  afterAll(async () => {
    await withTenant(tenant.tenantId, async trx => {
      await trx.deleteFrom('ev_sessions').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('ev_connectors').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('fuel_shifts').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('fuel_deliveries').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('fuel_nozzles').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('fuel_tanks').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('energy_charges').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('energy_readings').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('energy_tariffs').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('energy_meters').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_industry_work').where('tenant_id', '=', tenant.tenantId).execute();
    });
    await tenant.cleanup();
  }, 120000);

  async function activeWork(name: string) {
    const work = await createIndustryWork(tenant.tenantId, tenant.userId, {
      industry: 'energy', name, customer_id: customerId, currency: 'TZS', budget: 0, specifications: {},
    });
    await withTenant(tenant.tenantId, trx => trx.updateTable('finance_industry_work').set({ status: 'active' }).where('id', '=', work.id).execute());
    return work;
  }

  it('bills a meter reading, then corrects it and reconciles the charge (void old, bill new)', async () => {
    const work = await activeWork('Utility Billing');
    await createTariff(tenant.tenantId, { meter_type: 'electricity', name: 'Residential Tier 1', rate_per_unit: 350, effective_from: '2026-01-01' });
    const meter = await createMeter(tenant.tenantId, work.id, { meter_number: 'MTR-001', meter_type: 'electricity' });

    const reading1 = await recordMeterReading(tenant.tenantId, tenant.userId, meter.id, { reading_date: '2026-11-01', reading_value: 1000 });
    expect(Number(reading1.consumption)).toBe(1000); // first reading, no prior

    // A reading lower than the previous one is refused (meters don't go backwards).
    await expect(recordMeterReading(tenant.tenantId, tenant.userId, meter.id, { reading_date: '2026-12-01', reading_value: 900 }))
      .rejects.toThrow('is less than the previous reading');

    const reading2 = await recordMeterReading(tenant.tenantId, tenant.userId, meter.id, { reading_date: '2026-12-01', reading_value: 1250 });
    expect(Number(reading2.consumption)).toBe(250);

    const charge = await billReading(tenant.tenantId, reading2.id);
    expect(Number(charge.amount)).toBe(250 * 350);
    await expect(billReading(tenant.tenantId, reading2.id)).rejects.toThrow('already been billed');

    // P0: correction reconciliation — the old charge must be voided, not
    // left standing alongside whatever the corrected reading bills for.
    const corrected = await correctMeterReading(tenant.tenantId, tenant.userId, reading2.id, { reading_value: 1300, reason: 'Meter was misread in the field.' });
    expect(Number(corrected.consumption)).toBe(300);
    expect(corrected.is_correction).toBe(true);

    const oldChargeAfter = await withTenant(tenant.tenantId, trx => trx.selectFrom('energy_charges').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', charge.id).executeTakeFirstOrThrow());
    expect(oldChargeAfter.status).toBe('voided');

    const newCharge = await billReading(tenant.tenantId, corrected.id);
    expect(Number(newCharge.amount)).toBe(300 * 350);

    // Billing the now-superseded original reading again must be refused.
    await expect(billReading(tenant.tenantId, reading2.id)).rejects.toThrow('superseded reading cannot be billed');
  });

  it('receives fuel deliveries, reconciles a shift against real tank volume, and flags a real variance when the tank cannot supply what the nozzle claims', async () => {
    const work = await activeWork('Fuel Retail');
    const tank = await createTank(tenant.tenantId, work.id, { tank_number: 'TANK-1', fuel_type: 'diesel', capacity_litres: 10000 });
    await expect(receiveFuelDelivery(tenant.tenantId, tenant.userId, tank.id, { delivered_litres: 11000 })).rejects.toThrow('overfill');
    await receiveFuelDelivery(tenant.tenantId, tenant.userId, tank.id, { delivered_litres: 5000, supplier_reference: 'PO-TANKER-01' });

    const nozzle = await createNozzle(tenant.tenantId, tank.id, 'N1');
    const shift = await openFuelShift(tenant.tenantId, tenant.userId, work.id, nozzle.id, 1000);
    await expect(openFuelShift(tenant.tenantId, tenant.userId, work.id, nozzle.id, 1000)).rejects.toThrow('already has an open shift');

    // Dispense 2000L (totalizer 1000 -> 3000), well within the tank's 5000L — no variance.
    const closed = await closeFuelShift(tenant.tenantId, tenant.userId, shift.id, 3000);
    expect(Number(closed.litres_dispensed)).toBe(2000);
    expect(Number(closed.tank_variance_litres)).toBe(0);
    const tankAfter = await withTenant(tenant.tenantId, trx => trx.selectFrom('fuel_tanks').select('current_volume_litres').where('tenant_id', '=', tenant.tenantId).where('id', '=', tank.id).executeTakeFirstOrThrow());
    expect(Number(tankAfter.current_volume_litres)).toBe(3000);

    // A second shift claiming 4000L dispensed, but the tank only has 3000L
    // left — a real, attributable variance, not silently absorbed by
    // letting the tank go negative.
    const shift2 = await openFuelShift(tenant.tenantId, tenant.userId, work.id, nozzle.id, 3000);
    const closed2 = await closeFuelShift(tenant.tenantId, tenant.userId, shift2.id, 7000);
    expect(Number(closed2.litres_dispensed)).toBe(4000);
    expect(Number(closed2.tank_variance_litres)).toBe(1000);
    const tankAfter2 = await withTenant(tenant.tenantId, trx => trx.selectFrom('fuel_tanks').select('current_volume_litres').where('tenant_id', '=', tenant.tenantId).where('id', '=', tank.id).executeTakeFirstOrThrow());
    expect(Number(tankAfter2.current_volume_litres)).toBe(0);
  });

  it('runs an EV charging session end to end: start, end with real tariff pricing, and settle', async () => {
    const work = await activeWork('EV Charging');
    await createTariff(tenant.tenantId, { meter_type: 'ev', name: 'DC Fast Charge', rate_per_unit: 500, effective_from: '2026-01-01' });
    const connector = await createConnector(tenant.tenantId, work.id, 'CONN-01');

    const session = await startEvSession(tenant.tenantId, tenant.userId, connector.id);
    expect(session.status).toBe('active');
    const connectorAfterStart = await withTenant(tenant.tenantId, trx => trx.selectFrom('ev_connectors').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', connector.id).executeTakeFirstOrThrow());
    expect(connectorAfterStart.status).toBe('charging');

    // A second session on the same connector while it's charging is refused.
    await expect(startEvSession(tenant.tenantId, tenant.userId, connector.id)).rejects.toThrow('not available');

    const ended = await endEvSession(tenant.tenantId, session.id, 40);
    expect(ended.status).toBe('completed');
    expect(Number(ended.amount)).toBe(40 * 500);
    const connectorAfterEnd = await withTenant(tenant.tenantId, trx => trx.selectFrom('ev_connectors').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', connector.id).executeTakeFirstOrThrow());
    expect(connectorAfterEnd.status).toBe('available');

    const settled = await settleEvSession(tenant.tenantId, session.id);
    expect(settled.status).toBe('settled');
    await expect(settleEvSession(tenant.tenantId, session.id)).rejects.toThrow('Only a completed session can be settled');

    // The connector is free again — a new session can start.
    const session2 = await startEvSession(tenant.tenantId, tenant.userId, connector.id);
    expect(session2.status).toBe('active');
  });
});
