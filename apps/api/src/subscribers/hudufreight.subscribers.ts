import { registerSubscriber } from '../services/domain-events.service.js';
import { withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

// HuduFreight (the tracking/transport app, id `tracking`) is linked to ClearOS
// the moment a transport leg is added to a shipment's tasks. ClearOS emits
// `shipment.transport_task_added`; here that becomes a real "arrange a trip"
// alert in HuduFreight's own inbox, tagged for its app so it surfaces there and
// not only in ClearOS. It does NOT auto-create a trip — a trip needs a real
// vehicle assigned, which is the freight dispatcher's call, not something to
// invent — it puts the shipment in front of the person who makes that call.
registerSubscriber('shipment.transport_task_added', async (tenantId, event) => {
  const shipmentId = event.entityId;
  if (!shipmentId) return;

  await withTenant(tenantId, async (trx) => {
    const shipment = await trx.selectFrom('shipment_cases')
      .select(['id', 'ref_number', 'assigned_to', 'origin_port', 'dest_port'])
      .where('id', '=', shipmentId).where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!shipment?.assigned_to) return;

    await NotificationService.createNotification({
      tenantId, userId: shipment.assigned_to, app: 'tracking', type: 'info',
      title: 'Transport to arrange',
      message: `${event.payload.title ?? 'A transport task'} was added to shipment ${shipment.ref_number}${shipment.origin_port && shipment.dest_port ? ` (${shipment.origin_port} → ${shipment.dest_port})` : ''}. Assign a vehicle to create the trip.`,
      link: `/tracking`,
      entityType: 'shipment', entityId: shipmentId, entityLabel: shipment.ref_number ?? undefined,
    }).catch(err => console.error('[HuduFreightSubscriber] notify failed:', err.message));
  });
});
