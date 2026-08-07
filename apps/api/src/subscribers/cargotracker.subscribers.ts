import { registerSubscriber } from '../services/domain-events.service.js';
import { isSupersededByStudio } from '../studio/supersession.js';
import { withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

// DEMURRAGE_RISK already fires an in-app/WhatsApp/email notification tagged
// `app: 'clearos'` via NOTIFICATION_MATRIX. cargotracker was split out into
// its own standalone, independently-entitled app (067_demurrage_cargotracker_
// entitlements.sql) with its own nav and its own notification inbox — a
// ClearOS-tagged notification never surfaces there. This subscriber sends
// the same real risk to the same recipient, tagged for cargotracker's own
// inbox, so a user working only inside cargotracker still sees it.
registerSubscriber('shipment.demurrage_risk', async (tenantId, event) => {
  const shipmentId = event.entityId;
  if (!shipmentId) return;
  // Stood down when this tenant has activated the Studio workflow that
  // replaces this handler (migration 165) — otherwise both would run.
  if (await isSupersededByStudio(tenantId, 'cargotracker.demurrage_risk')) return;

  await withTenant(tenantId, async (trx) => {
    const shipment = await trx.selectFrom('shipment_cases')
      .select(['id', 'ref_number', 'assigned_to', 'free_time_end'])
      .where('id', '=', shipmentId).where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!shipment?.assigned_to) return;

    await NotificationService.createNotification({
      tenantId, userId: shipment.assigned_to, app: 'cargotracker', type: 'security',
      title: 'Demurrage risk',
      message: `Shipment ${shipment.ref_number}'s container free time ends ${shipment.free_time_end ? new Date(shipment.free_time_end).toLocaleDateString() : 'soon'}.`,
      link: `/cargotracker/demurrage`,
      entityType: 'shipment', entityId: shipmentId, entityLabel: shipment.ref_number,
    }).catch(err => console.error('[CargotrackerSubscriber] notify failed:', err.message));
  });
});
