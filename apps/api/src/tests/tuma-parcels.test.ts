import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../db/client.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('Tuma parcels — disposable tenant', () => {
  let owner: TestTenant; let other: TestTenant;
  let originOffice: string; let destOffice: string; let vehicle: string;

  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object, token = owner.token) {
    return (await getApp()).inject({ method, url: `/v1/tuma${path}`, headers: authHeaders(token), ...(payload ? { payload } : {}) });
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    other = await createTestTenant();
    for (const t of [owner, other]) {
      await withTenant(t.tenantId, trx => trx.insertInto('tenant_settings').values({ tenant_id: t.tenantId, settings: JSON.stringify({ 'enabled-apps': { tuma: true } }) }).execute());
    }
    await withTenant(owner.tenantId, async trx => {
      originOffice = (await trx.insertInto('tuma_booking_offices').values({ tenant_id: owner.tenantId, name: 'Origin office' }).returning('id').executeTakeFirstOrThrow()).id;
      destOffice = (await trx.insertInto('tuma_booking_offices').values({ tenant_id: owner.tenantId, name: 'Destination office' }).returning('id').executeTakeFirstOrThrow()).id;
      vehicle = (await trx.insertInto('tuma_vehicles').values({ tenant_id: owner.tenantId, registration_number: 'T123ABC' }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);

  afterAll(async () => {
    await withTenant(owner.tenantId, async trx => {
      await trx.deleteFrom('tuma_parcel_tracking').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('tuma_parcels').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('tuma_vehicles').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('tuma_booking_offices').where('tenant_id', '=', owner.tenantId).execute();
    });
    await owner.cleanup(); await other.cleanup();
  }, 120000);

  function receiveBody(overrides = {}) {
    return {
      sender_name: 'Asha', sender_phone: '+255700000001', recipient_name: 'Juma', recipient_phone: '+255700000002',
      origin_office_id: originOffice, dest_office_id: destOffice, ...overrides,
    };
  }

  it('requires real authentication — not just an entitlement check on an empty user', async () => {
    const res = await (await getApp()).inject({ method: 'GET', url: '/v1/tuma/parcels' });
    expect(res.statusCode).toBe(401);
  });

  it('returns a real 404 with a clean error body for a missing parcel, not a 200 wrapping an error-shaped payload', async () => {
    const res = await call('GET', '/parcels/00000000-0000-0000-0000-000000000000');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Parcel not found' });
  });

  it('refuses an illegal state transition with a real 422, not a 200', async () => {
    const created = await call('POST', '/parcels', receiveBody());
    expect(created.statusCode, created.body).toBe(201);
    const illegal = await call('PATCH', `/parcels/${created.json().id}/deliver`, {});
    expect(illegal.statusCode).toBe(422);
    expect(illegal.json().error).toMatch(/Cannot deliver parcel in RECEIVED state/);
  });

  it('receives, dispatches, offloads and delivers a parcel through its real lifecycle, recording tracking at each step', async () => {
    const created = await call('POST', '/parcels', receiveBody());
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id;
    expect(created.json().status).toBe('RECEIVED');

    const dispatched = await call('PATCH', `/parcels/${id}/dispatch`, { vehicle_id: vehicle });
    expect(dispatched.statusCode, dispatched.body).toBe(200);
    expect(dispatched.json().status).toBe('DISPATCHED');

    const offloaded = await call('PATCH', `/parcels/${id}/offload`, {});
    expect(offloaded.statusCode, offloaded.body).toBe(200);
    expect(offloaded.json().status).toBe('OFFLOADED');

    const delivered = await call('PATCH', `/parcels/${id}/deliver`, {});
    expect(delivered.statusCode, delivered.body).toBe(200);
    expect(delivered.json().status).toBe('DELIVERED');

    const detail = await call('GET', `/parcels/${id}`);
    const statuses = detail.json().tracking.map((t: any) => t.status).sort();
    expect(statuses).toEqual(['DELIVERED', 'DISPATCHED', 'OFFLOADED', 'RECEIVED']);

    // Terminal state — no further transition is legal.
    expect((await call('PATCH', `/parcels/${id}/cancel`, { reason: 'Too late' })).statusCode).toBe(422);
  });

  it('cancels a parcel with a required reason, and refuses cancelling one already delivered', async () => {
    const created = await call('POST', '/parcels', receiveBody());
    const id = created.json().id;
    expect((await call('PATCH', `/parcels/${id}/cancel`, {})).statusCode).toBe(400);
    const cancelled = await call('PATCH', `/parcels/${id}/cancel`, { reason: 'Customer changed their mind' });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(cancelled.json().status).toBe('CANCELED');
    expect(cancelled.json().cancellation_reason).toBe('Customer changed their mind');
  });

  it('isolates parcels, offices and vehicles between tenants', async () => {
    const created = await call('POST', '/parcels', receiveBody());
    expect((await call('GET', `/parcels/${created.json().id}`, undefined, other.token)).statusCode).toBe(404);
    expect((await call('GET', '/parcels', undefined, other.token)).json().rows).toEqual([]);
    const crossTenant = await call('PATCH', `/parcels/${created.json().id}/dispatch`, { vehicle_id: vehicle }, other.token);
    expect(crossTenant.statusCode).toBe(404);
  });
});
