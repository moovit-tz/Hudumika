import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../db/client.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

// Phase 3 follow-through: cross-system identity linkage. Tuma (last-mile
// courier) and ClearOS (customs clearance) are sold together as one bundle
// (677_industry_solution_catalogue.sql's 'logistics-tzs' package) but had
// zero identity linkage between them — a parcel handed off as the last-mile
// leg of a cleared shipment had no way to reference it. This proves the
// real, narrow fix: an optional, app-validated shipment_case_id on
// tuma_parcels (no DB FK possible — shipment_cases is partitioned with a
// composite PK), surfaced back on list/detail as a live-resolved
// linked_shipment so the UI can deep-link without a second manual lookup.
describe('Tuma parcel ↔ ClearOS shipment linkage — disposable tenant', () => {
  let owner: TestTenant;
  let customerId: string;
  let shipmentId: string;
  let officeA: string;
  let officeB: string;

  async function call(method: 'GET' | 'POST', path: string, payload?: object) {
    return (await getApp()).inject({ method, url: `/v1/tuma${path}`, headers: authHeaders(owner.token), ...(payload ? { payload } : {}) });
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    await withTenant(owner.tenantId, trx => trx.insertInto('tenant_settings').values({
      tenant_id: owner.tenantId,
      settings: JSON.stringify({ 'enabled-apps': { tuma: true } }),
    }).execute());

    await withTenant(owner.tenantId, async trx => {
      customerId = (await trx.insertInto('customers').values({
        tenant_id: owner.tenantId, name: 'Tuma Link Test Customer',
      }).returning('id').executeTakeFirstOrThrow()).id;

      shipmentId = (await trx.insertInto('shipment_cases').values({
        tenant_id: owner.tenantId, ref_number: `TUMALINK-${Date.now()}`, customer_id: customerId,
        type: 'SEA_FCL', goods_desc: 'Test goods', containers: '[]',
        vessel: 'Test vessel', origin_port: 'Dar es Salaam', dest_port: 'Mwanza',
      }).returning('id').executeTakeFirstOrThrow()).id;

      officeA = (await trx.insertInto('tuma_booking_offices').values({
        tenant_id: owner.tenantId, name: 'Origin Office',
      }).returning('id').executeTakeFirstOrThrow()).id;
      officeB = (await trx.insertInto('tuma_booking_offices').values({
        tenant_id: owner.tenantId, name: 'Dest Office',
      }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);

  afterAll(async () => {
    await withTenant(owner.tenantId, async trx => {
      await trx.deleteFrom('tuma_parcel_tracking').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('tuma_parcels').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('tuma_booking_offices').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('shipment_cases').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('customers').where('tenant_id', '=', owner.tenantId).execute();
    });
    await owner.cleanup();
  }, 120000);

  it('links a parcel to a real shipment, refuses a bogus one, and surfaces the live link on list/detail', async () => {
    const createLinked = await call('POST', '/parcels', {
      sender_name: 'Sender', sender_phone: '+255700000001',
      recipient_name: 'Recipient', recipient_phone: '+255700000002',
      origin_office_id: officeA, dest_office_id: officeB,
      shipment_case_id: shipmentId,
    });
    expect(createLinked.statusCode, createLinked.body).toBe(201);
    const linkedParcel = createLinked.json();

    const createBogus = await call('POST', '/parcels', {
      sender_name: 'Sender', sender_phone: '+255700000001',
      recipient_name: 'Recipient', recipient_phone: '+255700000002',
      origin_office_id: officeA, dest_office_id: officeB,
      shipment_case_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(createBogus.statusCode).toBe(422);

    const createPlain = await call('POST', '/parcels', {
      sender_name: 'Sender2', sender_phone: '+255700000003',
      recipient_name: 'Recipient2', recipient_phone: '+255700000004',
      origin_office_id: officeA, dest_office_id: officeB,
    });
    expect(createPlain.statusCode).toBe(201);
    const plainParcel = createPlain.json();

    const detail = await call('GET', `/parcels/${linkedParcel.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().linked_shipment).toEqual({ id: shipmentId, ref_number: expect.stringContaining('TUMALINK-'), stage: 'DOCS_RECEIVED' });

    const list = await call('GET', '/parcels');
    expect(list.statusCode).toBe(200);
    const listJson = list.json();
    const linkedRow = listJson.rows.find((r: any) => r.id === linkedParcel.id);
    const plainRow = listJson.rows.find((r: any) => r.id === plainParcel.id);
    expect(linkedRow.linked_shipment?.id).toBe(shipmentId);
    expect(plainRow.linked_shipment).toBeNull();
  });
});
