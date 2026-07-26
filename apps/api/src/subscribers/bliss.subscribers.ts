import { registerSubscriber } from '../services/domain-events.service.js';
import { withTenant } from '../db/client.js';

const SLA_HOURS: Record<string, number> = { URGENT: 4, HIGH: 8, NORMAL: 24, LOW: 48 }; // mirrors support.routes.ts / seal-automation.routes.ts

// Auto-raises a Bliss support ticket the moment a shipment breaches its
// clearance SLA, instead of relying on a human to notice the risk_flags
// row and click "Raise Support Ticket" (the manual RaiseSealTicketButton
// path) themselves.
registerSubscriber('shipment.sla_breach', async (tenantId, event) => {
  const shipmentId = event.entityId;
  if (!shipmentId) return;

  await withTenant(tenantId, async (trx) => {
    const shipment = await trx.selectFrom('shipment_cases')
      .select(['id', 'ref_number', 'customer_id', 'stage'])
      .where('id', '=', shipmentId)
      .executeTakeFirst();
    if (!shipment) return;

    const existing = await trx.selectFrom('support_tickets')
      .select('id')
      .where('customer_id', '=', shipment.customer_id)
      .where('subject', 'like', `%${shipment.ref_number}%SLA%`)
      .where('status', '!=', 'CLOSED')
      .executeTakeFirst();
    if (existing) return; // don't spam a duplicate ticket for the same still-open breach

    await trx.insertInto('support_tickets').values({
      tenant_id: tenantId,
      customer_id: shipment.customer_id,
      ref_number: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
      subject: `[Auto] SLA breach on shipment ${shipment.ref_number}`,
      description: `Shipment ${shipment.ref_number} exceeded its SLA deadline at stage "${shipment.stage}" (${event.payload.hoursExceeded ?? '?'} hours over). Auto-raised by ClearOS.`,
      channel: 'SYSTEM', priority: 'HIGH', category: 'Clearance Operations', status: 'OPEN',
      tags: JSON.stringify(['clearos', 'sla-breach']),
      sla_deadline: new Date(Date.now() + SLA_HOURS.HIGH * 3600_000),
    }).execute();
  });
});
