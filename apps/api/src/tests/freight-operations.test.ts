import { FLEET_PARTNER_CATEGORIES } from '@hudumika/types';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { dbPlatform } from '../db/client.js';
import { runFleetReminderSweep } from '../jobs/task-reminder.job.js';

describe('Freight operational persistence and isolation', () => {
  let owner: TestTenant, other: TestTenant;
  let vehicleId: string, foreignVehicle: string;
  const plan = { name: 'Measured load', origin: 'Dar es Salaam', destination: 'Dodoma', container_length_cm: 600, container_width_cm: 240, container_height_cm: 240, max_weight_kg: 10000 };
  const cargo = { label: 'Measured pallet', length_cm: 100, width_cm: 100, height_cm: 100, weight_kg: 400, quantity: 2 };
  async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object, tenant?: TestTenant) {
    return (await getApp()).inject({ method, url: `/v1/${path}`, headers: authHeaders((tenant || owner).token), ...(payload ? { payload } : {}) });
  }
  beforeAll(async () => {
    owner = await createTestTenant(); other = await createTestTenant();
    for (const tenant of [owner, other]) {
      await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { tracking: true, 'tracking.cargo-loading': true, 'tracking.warehouse': true, seal: true, complyos: true } }) as any }).onConflict(c => c.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'enabled-apps': { tracking: true, 'tracking.cargo-loading': true, 'tracking.warehouse': true, seal: true, complyos: true } }) as any })).execute();
    }
    const own = await call('POST', 'tracking/vehicles', { name: 'Test fleet asset', device_id: randomUUID(), type: 'TRUCK' });
    expect(own.statusCode, own.body).toBeLessThan(300); vehicleId = own.json().id;
    const foreign = await call('POST', 'tracking/vehicles', { name: 'Other tenant asset', device_id: randomUUID(), type: 'TRUCK' }, other);
    expect(foreign.statusCode, foreign.body).toBeLessThan(300); foreignVehicle = foreign.json().id;
  }, 90000);
  afterAll(async () => { if (owner) await owner.cleanup(); if (other) await other.cleanup(); }, 90000);

  it('persists every partner category and multiple services with tenant isolation', async () => {
    for (const category of FLEET_PARTNER_CATEGORIES) {
      const result = await call('POST', 'tracking/vendors', { name: `Test ${category.label}`, vendor_type: category.type, service_capabilities: ['PARTS_SUPPLIER', 'TYRE_SERVICES', 'TYRE_SERVICES'], active: false });
      expect(result.statusCode, result.body).toBeLessThan(300);
      const row = result.json();
      expect(row.active).toBe(false);
      expect(row.service_capabilities).toEqual(['PARTS_SUPPLIER', 'TYRE_SERVICES']);
      expect((await call('GET', `tracking/vendors/${row.id}`, undefined, other)).statusCode).toBe(404);
      expect((await call('PATCH', `tracking/vendors/${row.id}`, { service_capabilities: [] }, other)).statusCode).toBe(404);
      const patched = await call('PATCH', `tracking/vendors/${row.id}`, { service_capabilities: ['RECOVERY'], active: true });
      expect(patched.json().service_capabilities).toEqual(['RECOVERY']);
      expect((await call('GET', `tracking/vendors/${row.id}`)).json().vendor.service_capabilities).toEqual(['RECOVERY']);
    }
    expect((await call('POST', 'tracking/vendors', { name: 'Invalid', vendor_type: 'MADE_UP' })).statusCode).toBe(400);
    expect((await call('POST', 'tracking/vendors', { name: 'Invalid', service_capabilities: ['MADE_UP'] })).statusCode).toBe(400);
  }, 90000);

  it('rejects invalid measurements and foreign vehicle links', async () => {
    expect((await call('POST', 'tracking/manifests', { ...plan, max_weight_kg: -1 })).statusCode).toBe(400);
    expect((await call('POST', 'tracking/manifests', { ...plan, vehicle_id: foreignVehicle })).statusCode).toBe(404);
  });
  it('persists measured cargo, locks approved plans, and dispatches exactly one real trip', async () => {
    const created = await call('POST', 'tracking/manifests', plan);
    expect(created.statusCode, created.body).toBeLessThan(300); const id = created.json().id;
    expect((await call('POST', `tracking/manifests/${id}/items`, cargo, other)).statusCode).toBe(404);
    expect((await call('POST', `tracking/manifests/${id}/items`, cargo)).statusCode).toBeLessThan(300);
    expect((await call('PATCH', `tracking/manifests/${id}/status`, { status: 'APPROVED' })).statusCode).toBe(409);
    const packed = await call('POST', `tracking/manifests/${id}/pack`, {});
    expect(packed.statusCode, packed.body).toBe(200); expect(packed.json().items[0].placements).toHaveLength(2);
    expect((await call('PATCH', `tracking/manifests/${id}/status`, { status: 'APPROVED' })).statusCode).toBe(200);
    expect((await call('POST', `tracking/manifests/${id}/items`, cargo)).statusCode).toBe(409);
    expect((await call('POST', `tracking/manifests/${id}/pack`, {})).statusCode).toBe(409);
    expect((await call('DELETE', `tracking/manifests/${id}`)).statusCode).toBe(409);
    expect((await call('POST', `tracking/manifests/${id}/dispatch`, { vehicle_id: foreignVehicle })).statusCode).toBe(404);
    const dispatched = await call('POST', `tracking/manifests/${id}/dispatch`, { vehicle_id: vehicleId });
    expect(dispatched.statusCode, dispatched.body).toBe(200); expect(dispatched.json().trip_id).toBeTruthy();
    const trip = await dbPlatform.selectFrom('trips').selectAll().where('id', '=', dispatched.json().trip_id).where('tenant_id', '=', owner.tenantId).executeTakeFirstOrThrow();
    expect(trip.status).toBe('IN_PROGRESS'); expect(Number(trip.cargo_weight_kg)).toBe(800);
    expect((await call('POST', `tracking/manifests/${id}/dispatch`, { vehicle_id: vehicleId })).statusCode).toBe(409);
  });
  it('invalidates packing after changing dimensions', async () => {
    const id = (await call('POST', 'tracking/manifests', plan)).json().id;
    await call('POST', `tracking/manifests/${id}/items`, cargo); await call('POST', `tracking/manifests/${id}/pack`, {});
    await call('PATCH', `tracking/manifests/${id}`, { container_length_cm: 50 });
    expect((await call('PATCH', `tracking/manifests/${id}/status`, { status: 'APPROVED' })).statusCode).toBe(409);
  });
  it('rejects foreign references and unknown reminder states', async () => {
    expect((await call('POST', 'tracking/documents', { vehicle_id: foreignVehicle, doc_type: 'INSURANCE' })).statusCode).toBe(404);
    expect((await call('POST', 'tracking/reminders', { title: 'Inspect tyres', due_date: '2026-11-01', vehicle_id: foreignVehicle })).statusCode).toBe(404);
    const reminder = await call('POST', 'tracking/reminders', { title: 'Inspect tyres', due_date: '2026-11-01', vehicle_id: vehicleId });
    expect(reminder.statusCode, reminder.body).toBeLessThan(300);
    expect((await call('PATCH', `tracking/reminders/${reminder.json().id}`, { status: 'INVENTED' })).statusCode).toBe(400);
    const linked = await call('GET', 'tasks/linked'); expect(linked.statusCode, linked.body).toBe(200);
    expect(linked.json().data.some((t: any) => t.id === `freight:${reminder.json().id}`)).toBe(true);
  });
  it('records stock adjustments atomically and prevents negative stock', async () => {
    const part = await call('POST', 'tracking/parts', { part_name: 'Brake pad', quantity: 10 });
    expect(part.statusCode, part.body).toBeLessThan(300); const id = part.json().id;
    expect((await call('POST', `tracking/parts/${id}/movements`, { quantity_delta: -11, reason: 'Issue' })).statusCode).toBe(409);
    const movement = await call('POST', `tracking/parts/${id}/movements`, { quantity_delta: -3, reason: 'Work order 123' });
    expect(movement.statusCode, movement.body).toBeLessThan(300); expect(movement.json().balance_after).toBe(7);
    expect((await call('PATCH', `tracking/parts/${id}`, { quantity: 99 })).statusCode).toBe(409);
    expect((await call('POST', `tracking/parts/${id}/movements`, { quantity_delta: 5, reason: 'Invalid tenant' }, other)).statusCode).toBe(404);
    expect((await call('DELETE', `tracking/parts/${id}`)).statusCode).toBe(409);
    await call('POST', `tracking/parts/${id}/movements`, { quantity_delta: -7, reason: 'Final issue' });
    expect((await call('DELETE', `tracking/parts/${id}`)).statusCode).toBe(200);
    const history = await call('GET', `tracking/parts/${id}/movements`); expect(history.json()).toHaveLength(3);
  });
  it('rejects forged SEAL and release-document references', async () => {
    const receipt = await call('POST', 'depot/interchange-receipts', { subjectType: 'seal_container', subjectId: randomUUID(), equipmentNumber: 'TEST1234567', direction: 'GATE_IN', partyName: 'Test carrier' });
    expect(receipt.statusCode, receipt.body).toBe(400);
    expect((await call('POST', 'tracking/warehouse/locations', { code: 'TEST', name: 'Linked storage', seal_compartment_id: randomUUID() })).statusCode).toBe(404);
  });
  it('delivers a due reminder once, with durable delivery evidence', async () => {
    const reminder = await call('POST', 'tracking/reminders', { title: 'Due test inspection', due_date: '2020-01-01' });
    const id = reminder.json().id;
    await Promise.all([runFleetReminderSweep(owner.tenantId), runFleetReminderSweep(owner.tenantId)]);
    await runFleetReminderSweep(owner.tenantId);
    const notifications = await dbPlatform.selectFrom('notifications').select('id').where('tenant_id', '=', owner.tenantId).where('entity_id', '=', id).execute();
    expect(notifications).toHaveLength(1);
    const stored = await dbPlatform.selectFrom('fleet_reminders').select('notified_at').where('id', '=', id).where('tenant_id', '=', owner.tenantId).executeTakeFirstOrThrow();
    expect(stored.notified_at).not.toBeNull();
  });
  it('reads linked ComplyOS metadata from its live source and rejects revoked dispatch', async () => {
    const certificate = await dbPlatform.insertInto('comply_certificates').values({ tenant_id: owner.tenantId, name: 'Fleet permit', cert_number: 'TEST-PERMIT', agency_code: 'TEST', agency_name: 'Test issuer', expiry_date: '2030-01-01', status: 'active' } as any).returningAll().executeTakeFirstOrThrow();
    const doc = await call('POST', 'tracking/documents', { vehicle_id: vehicleId, doc_type: 'PERMIT', comply_certificate_id: certificate.id });
    expect(doc.statusCode, doc.body).toBeLessThan(300);
    await dbPlatform.updateTable('comply_certificates').set({ status: 'revoked', cert_number: 'TEST-PERMIT-UPDATED' }).where('id', '=', certificate.id).where('tenant_id', '=', owner.tenantId).execute();
    const documents = await call('GET', 'tracking/documents');
    const linked = documents.json().find((d: any) => d.id === doc.json().id);
    expect(linked.doc_number).toBe('TEST-PERMIT-UPDATED'); expect(linked.source_status).toBe('revoked');
    const anotherVehicle = await call('POST', 'tracking/vehicles', { name: 'Permit test vehicle', device_id: randomUUID(), type: 'TRUCK' });
    await call('POST', 'tracking/documents', { vehicle_id: anotherVehicle.json().id, comply_certificate_id: certificate.id });
    const trip = await call('POST', 'tracking/trips', { vehicle_id: anotherVehicle.json().id, origin: 'A', destination: 'B' });
    expect(trip.statusCode, trip.body).toBe(400); expect(trip.body).toContain('revoked');
  });
  it('rejects invented shipment measurements without partially inserting cargo', async () => {
    const customer = await dbPlatform.insertInto('customers').values({tenant_id:owner.tenantId,name:'Test import customer'} as any).returning('id').executeTakeFirstOrThrow();
    const shipment = await dbPlatform.insertInto('shipment_cases').values({ customer_id:customer.id,goods_desc:'Test cargo',vessel:'Test vessel',origin_port:'Dar es Salaam',dest_port:'Dodoma',tenant_id: owner.tenantId, ref_number: `TEST-${randomUUID()}`, type: 'IMPORT', containers: JSON.stringify([{ container_number: 'TEST1234567', size: '20FT' }]) } as any).returningAll().executeTakeFirstOrThrow();
    const id = (await call('POST', 'tracking/manifests', plan)).json().id;
    const imported = await call('POST', `tracking/manifests/${id}/import-shipment`, { shipment_id: shipment.id });
    expect(imported.statusCode, imported.body).toBe(422);
    expect((await call('GET', `tracking/manifests/${id}/items`)).json()).toEqual([]);
  });
  it('enforces dock appointment transitions', async () => {
    const appointment = await call('POST', 'tracking/warehouse/dock-appointments', { dock_number: 'TEST', appointment_type: 'INBOUND', vehicle_id: vehicleId, scheduled_at: '2026-12-01T10:00:00Z' });
    expect(appointment.statusCode, appointment.body).toBeLessThan(300); const id = appointment.json().id;
    expect((await call('PATCH', `tracking/warehouse/dock-appointments/${id}/complete`, {})).statusCode).toBe(409);
    expect((await call('PATCH', `tracking/warehouse/dock-appointments/${id}/check-in`, {})).statusCode).toBe(200);
    expect((await call('PATCH', `tracking/warehouse/dock-appointments/${id}/complete`, {})).statusCode).toBe(200);
    expect((await call('PATCH', `tracking/warehouse/dock-appointments/${id}/cancel`, {})).statusCode).toBe(409);
  });
  it('returns the latest bounded history in chronological order and keeps unknown speed null', async () => {
    const start = Date.UTC(2026, 0, 1);
    await dbPlatform.insertInto('vehicle_positions').values(Array.from({ length: 2001 }, (_, i) => ({ tenant_id: owner.tenantId, vehicle_id: vehicleId, latitude: -6.8, longitude: 39.2, speed: i === 2000 ? null : 10, recorded_at: new Date(start + i * 1000) } as any))).execute();
    const history = await call('GET', `tracking/vehicles/${vehicleId}/history`);
    const rows = history.json(); expect(rows).toHaveLength(2000);
    expect(Date.parse(rows[0].recorded_at)).toBe(start + 1000);
    expect(Date.parse(rows[1999].recorded_at)).toBe(start + 2000000); expect(rows[1999].speed).toBeNull();
    expect((await call('GET', `tracking/vehicles/${vehicleId}/history?from=invalid`)).statusCode).toBe(400);
  });
});
