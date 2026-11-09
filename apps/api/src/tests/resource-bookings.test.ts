import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('Resource bookings — disposable tenant', () => {
  let owner: TestTenant; let junior: { userId: string; token: string };
  let customer: string;
  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object, token = owner.token) {
    return (await getApp()).inject({ method, url: `/v1/bookings${path}`, headers: authHeaders(token), ...(payload ? { payload } : {}) });
  }
  function iso(hoursFromNow: number): string {
    return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    junior = await owner.addUser('JUNIOR');
    await withTenant(owner.tenantId, async trx => {
      await trx.insertInto('tenant_settings').values({ tenant_id: owner.tenantId, settings: JSON.stringify({ 'enabled-apps': { finops: true }, company: { currency: 'TZS' } }) }).execute();
      await GLService.seedChartOfAccounts(trx, owner.tenantId);
    });
    customer = (await withTenant(owner.tenantId, trx => trx.insertInto('customers').values({ tenant_id: owner.tenantId, name: 'Booking customer' }).returning('id').executeTakeFirstOrThrow())).id;
  }, 120000);

  afterAll(async () => {
    await withTenant(owner.tenantId, async trx => {
      await trx.deleteFrom('resource_bookings').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('bookable_resources').where('tenant_id', '=', owner.tenantId).execute();
    });
    await owner.cleanup();
  }, 120000);

  it('requires manager access to register a resource, and refuses an end time before the start', async () => {
    expect((await call('POST', '/resources', { name: 'Drone' }, junior.token)).statusCode).toBe(403);
    const resource = await call('POST', '/resources', { name: 'Site camera', capacity: 1 });
    expect(resource.statusCode, resource.body).toBe(200);
    const backwards = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(5), ends_at: iso(1) });
    expect(backwards.statusCode).toBe(422);
  });

  it('books a single-capacity resource, refuses an overlapping double-booking, and allows a non-overlapping one', async () => {
    const resource = await call('POST', '/resources', { name: 'Conference room' });
    const first = await call('POST', '/bookings', { resource_id: resource.json().id, customer_id: customer, starts_at: iso(1), ends_at: iso(3), note: 'Client meeting' });
    expect(first.statusCode, first.body).toBe(200);

    const overlapping = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(2), ends_at: iso(4) });
    expect(overlapping.statusCode, overlapping.body).toBe(409);

    const nonOverlapping = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(3), ends_at: iso(5) });
    expect(nonOverlapping.statusCode, nonOverlapping.body).toBe(200);
  });

  it('a cancelled booking frees the slot, and cancelling twice is refused', async () => {
    const resource = await call('POST', '/resources', { name: 'Forklift' });
    const booking = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(10), ends_at: iso(12) });
    expect(booking.statusCode, booking.body).toBe(200);

    const stillBlocked = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(11), ends_at: iso(13) });
    expect(stillBlocked.statusCode).toBe(409);

    const cancel = await call('POST', `/bookings/${booking.json().id}/cancel`, { reason: 'Job postponed' });
    expect(cancel.statusCode, cancel.body).toBe(200);
    expect(cancel.json().status).toBe('cancelled');

    const nowFree = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(11), ends_at: iso(13) });
    expect(nowFree.statusCode, nowFree.body).toBe(200);

    expect((await call('POST', `/bookings/${booking.json().id}/cancel`, { reason: 'Again' })).statusCode).toBe(409);
  });

  it('honors multi-unit capacity — allows up to capacity overlapping bookings, refuses the one past it', async () => {
    const resource = await call('POST', '/resources', { name: 'Projector', capacity: 2 });
    const a = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(20), ends_at: iso(22), qty: 1 });
    expect(a.statusCode, a.body).toBe(200);
    const b = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(21), ends_at: iso(23), qty: 1 });
    expect(b.statusCode, b.body).toBe(200);
    const c = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(21), ends_at: iso(22), qty: 1 });
    expect(c.statusCode, c.body).toBe(409);
    expect(c.json().error).toMatch(/0 of 2/);
  });

  it('serializes two concurrent bookings for the same slot so only one succeeds', async () => {
    const resource = await call('POST', '/resources', { name: 'Shared tent' });
    const results = await Promise.allSettled([
      call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(50), ends_at: iso(52) }),
      call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(50), ends_at: iso(52) }),
    ]);
    const statuses = results.map(r => r.status === 'fulfilled' ? r.value.statusCode : 0).sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('refuses booking an inactive resource, and refuses exceeding capacity in a single request', async () => {
    const resource = await call('POST', '/resources', { name: 'Old scanner', capacity: 1 });
    await call('PATCH', `/resources/${resource.json().id}`, { active: false });
    const inactive = await call('POST', '/bookings', { resource_id: resource.json().id, starts_at: iso(30), ends_at: iso(31) });
    expect(inactive.statusCode).toBe(422);

    const resource2 = await call('POST', '/resources', { name: 'Single chair', capacity: 1 });
    const tooMany = await call('POST', '/bookings', { resource_id: resource2.json().id, starts_at: iso(40), ends_at: iso(41), qty: 2 });
    expect(tooMany.statusCode).toBe(422);
  });
});
