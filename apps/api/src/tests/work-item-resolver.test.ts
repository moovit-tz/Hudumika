import { describe, expect, it } from 'vitest';
import { resolveAdditionalWorkItem } from '../services/work-item-resolver.service.js';

function transaction(row: Record<string, unknown>) {
  const filters: Array<[string, unknown]> = [];
  const query: any = {
    select: () => query,
    where: (column: string, _op: string, value: unknown) => { filters.push([column, value]); return query; },
    executeTakeFirst: async () => row,
  };
  return { trx: { selectFrom: () => query }, filters };
}

const managers = ['MANAGER'];

describe('shared time work-item resolvers', () => {
  it('resolves only an assigned Tuma parcel inside the tenant', async () => {
    const { trx, filters } = transaction({ id: 'p1', parcel_number: 'TP-1', name: 'Parcel', status: 'DISPATCHED', created_by: 'u1', dispatcher_id: 'u2', offloader_id: null, deliverer_id: null });
    const resolved = await resolveAdditionalWorkItem(trx, 'tenant-a', 'u2', 'JUNIOR', 'tuma', 'parcel', 'p1', managers);
    expect(resolved).toMatchObject({ appId: 'tuma', type: 'parcel', id: 'p1', ref: 'TP-1', billable: false });
    expect(filters).toContainEqual(['tenant_id', 'tenant-a']);
  });

  it('rejects another employee’s parcel and closed Seal tasks', async () => {
    const parcel = transaction({ id: 'p1', parcel_number: 'TP-1', name: 'Parcel', status: 'RECEIVED', created_by: 'other', dispatcher_id: null, offloader_id: null, deliverer_id: null });
    await expect(resolveAdditionalWorkItem(parcel.trx, 'tenant-a', 'u1', 'JUNIOR', 'tuma', 'parcel', 'p1', managers)).rejects.toMatchObject({ statusCode: 403 });
    const seal = transaction({ id: 's1', title: 'Seal pallet', status: 'complete', assigned_to: 'u1', created_by: 'u1' });
    await expect(resolveAdditionalWorkItem(seal.trx, 'tenant-a', 'u1', 'JUNIOR', 'seal', 'task', 's1', managers)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('resolves creator-owned freight bookings and denies other creators', async () => {
    const booking = { id: 'f1', booking_number: 'F-1', cargo_desc: 'Electronics', status: 'CONFIRMED', created_by: 'u1' };
    const own = transaction(booking);
    expect(await resolveAdditionalWorkItem(own.trx, 'tenant-a', 'u1', 'JUNIOR', 'hudufreight', 'booking', 'f1', managers)).toMatchObject({ appId: 'hudufreight', ref: 'F-1', billable: false });
    const other = transaction(booking);
    await expect(resolveAdditionalWorkItem(other.trx, 'tenant-a', 'u2', 'JUNIOR', 'hudufreight', 'booking', 'f1', managers)).rejects.toMatchObject({ statusCode: 403 });
  });
});
