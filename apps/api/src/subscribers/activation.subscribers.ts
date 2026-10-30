import { registerSubscriber } from '../services/domain-events.service.js';
import { ActivationService } from '../services/activation.service.js';

registerSubscriber('shipment.case_opened', async (tenantId, event) => {
  await ActivationService.complete(tenantId, 'first_shipment', event.actorId ?? undefined, { shipmentId: event.entityId });
});

registerSubscriber('declaration.released', async (tenantId, event) => {
  await ActivationService.complete(tenantId, 'first_declaration', event.actorId ?? undefined, { declarationId: event.entityId });
});

registerSubscriber('invoice.finalised', async (tenantId, event) => {
  await ActivationService.complete(tenantId, 'first_invoice', event.actorId ?? undefined, { invoiceId: event.entityId });
});

registerSubscriber('deal.created', async (tenantId, event) => {
  await ActivationService.complete(tenantId, 'first_customer', event.actorId ?? undefined, { dealId: event.entityId });
});

registerSubscriber('lead.created', async (tenantId, event) => {
  await ActivationService.complete(tenantId, 'first_customer', event.actorId ?? undefined, { leadId: event.entityId });
});

registerSubscriber('user.joined', async (tenantId, event) => {
  await ActivationService.complete(tenantId, 'invite_team', event.actorId ?? undefined, { userId: event.payload?.userId });
});
