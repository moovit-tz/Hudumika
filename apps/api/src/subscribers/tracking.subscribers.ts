import { registerSubscriber } from '../services/domain-events.service.js';
import { isSupersededByStudio } from '../studio/supersession.js';
import { withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

// A fleet trip can be soft-linked to the ClearOS shipment it's hauling
// (trips.shipment_id / job_type='CLEARANCE_LINKED', see
// 066_trips_shipment_link.sql). When that shipment's clearance stage
// advances, notify whoever dispatched the trip — there's no user-facing
// concept of "the driver's own inbox" in this codebase (drivers aren't
// `users` rows), so `trips.created_by` (the dispatcher) is the real,
// addressable recipient.
registerSubscriber('shipment.stage_advanced', async (tenantId, event) => {
  const shipmentId = event.entityId;
  if (!shipmentId) return;
  // Stood down when this tenant has activated the Studio workflow that
  // replaces this handler (migration 165) — otherwise both would run.
  if (await isSupersededByStudio(tenantId, 'tracking.stage_advanced')) return;

  await withTenant(tenantId, async (trx) => {
    const trips = await trx.selectFrom('trips')
      .select(['id', 'created_by'])
      .where('shipment_id', '=', shipmentId)
      .where('job_type', '=', 'CLEARANCE_LINKED')
      .execute();

    for (const trip of trips) {
      if (!trip.created_by) continue;
      await NotificationService.createNotification({
        tenantId, userId: trip.created_by, app: 'tracking', type: 'info',
        title: 'Linked shipment stage updated',
        message: `Shipment stage for your trip's cargo advanced to "${event.payload.stage}".`,
        link: `/tracking/trips/${trip.id}`,
        entityType: 'trip', entityId: trip.id, entityLabel: trip.id,
      }).catch(err => console.error(`[TrackingSubscriber] notify failed for trip ${trip.id}:`, err.message));
    }
  });
});
