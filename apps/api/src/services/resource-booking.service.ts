import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';

export async function createBookableResource(
  trx: Transaction<Database>, tenantId: string,
  input: { name: string; resourceType?: string | null; description?: string | null; capacity?: number; actorId: string },
) {
  return trx.insertInto('bookable_resources').values({
    tenant_id: tenantId, name: input.name, resource_type: input.resourceType ?? null,
    description: input.description ?? null, capacity: input.capacity ?? 1, created_by: input.actorId,
  }).returningAll().executeTakeFirstOrThrow();
}

/**
 * Books `qty` units of a resource for a time window, refusing it outright
 * if doing so would exceed the resource's own capacity at any point in
 * that window. Locks the resource row itself (`.forUpdate()`) BEFORE
 * computing the overlap sum — the same "lock the actual contended
 * resource, not just a parent record" discipline already proven for
 * property units (`createLease`) and hospitality rooms
 * (`createReservation`) earlier in this backlog: two concurrent bookings
 * for the same resource and overlapping times must serialize through
 * this lock, or both could read the same pre-booking overlap sum and
 * together overbook it past capacity.
 */
export async function bookResource(
  trx: Transaction<Database>, tenantId: string,
  input: { resourceId: string; customerId?: string | null; bookedBy: string; startsAt: Date; endsAt: Date; qty?: number; note?: string | null },
) {
  if (input.endsAt <= input.startsAt) {
    throw Object.assign(new Error('End time must be after the start time.'), { statusCode: 422 });
  }
  const qty = input.qty ?? 1;

  const resource = await trx.selectFrom('bookable_resources').selectAll()
    .where('tenant_id', '=', tenantId).where('id', '=', input.resourceId).forUpdate().executeTakeFirst();
  if (!resource) throw Object.assign(new Error('Resource not found.'), { statusCode: 404 });
  if (!resource.active) throw Object.assign(new Error('This resource is not currently bookable.'), { statusCode: 422 });
  if (qty > resource.capacity) {
    throw Object.assign(new Error(`This resource only has a capacity of ${resource.capacity}.`), { statusCode: 422 });
  }

  const overlap = await trx.selectFrom('resource_bookings')
    .select(sql<string>`coalesce(sum(qty), 0)`.as('booked'))
    .where('tenant_id', '=', tenantId).where('resource_id', '=', input.resourceId).where('status', '=', 'confirmed')
    .where('starts_at', '<', input.endsAt).where('ends_at', '>', input.startsAt)
    .executeTakeFirst();
  const alreadyBooked = Number(overlap?.booked ?? 0);
  if (alreadyBooked + qty > resource.capacity) {
    throw Object.assign(new Error(`Only ${resource.capacity - alreadyBooked} of ${resource.capacity} ${resource.name} unit(s) are free for that time.`), { statusCode: 409 });
  }

  return trx.insertInto('resource_bookings').values({
    tenant_id: tenantId, resource_id: input.resourceId, customer_id: input.customerId ?? null, booked_by: input.bookedBy,
    starts_at: input.startsAt, ends_at: input.endsAt, qty, note: input.note ?? null,
  }).returningAll().executeTakeFirstOrThrow();
}

export async function cancelBooking(
  trx: Transaction<Database>, tenantId: string, bookingId: string, actorId: string, reason: string,
) {
  const booking = await trx.selectFrom('resource_bookings').selectAll()
    .where('tenant_id', '=', tenantId).where('id', '=', bookingId).forUpdate().executeTakeFirst();
  if (!booking) throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
  if (booking.status !== 'confirmed') throw Object.assign(new Error('This booking is already cancelled.'), { statusCode: 409 });
  return trx.updateTable('resource_bookings').set({
    status: 'cancelled', cancelled_by: actorId, cancelled_at: new Date(), cancel_reason: reason,
  }).where('tenant_id', '=', tenantId).where('id', '=', bookingId).returningAll().executeTakeFirstOrThrow();
}
