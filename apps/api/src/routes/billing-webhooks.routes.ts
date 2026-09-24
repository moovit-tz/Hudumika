import type { FastifyInstance } from 'fastify';
import { dbPlatform } from '../db/client.js';
import { PaymentGateway } from '../integrations/payment-gateway.js';
import { settleInvoiceFromGateway } from '../services/subscription-billing.service.js';

/**
 * Inbound payment-gateway webhooks (public — no session; authenticated by the
 * gateway's shared-secret header). Registered under /v1/webhooks/billing.
 *
 *  - Signature first: a delivery without the right `verif-hash` is refused
 *    before anything is read or stored.
 *  - Idempotent: every delivery is recorded by the gateway's own event id
 *    (billing_webhook_events, unique per gateway+event); a redelivery is
 *    acknowledged and ignored, so retries can never double-settle.
 *  - Never trusts the body: a charge is settled only after asking the
 *    gateway directly for that transaction and checking status, currency and
 *    amount against OUR invoice (settleInvoiceFromGateway).
 *  - Cross-tenant lookup: the invoice is found by the tx_ref we issued, which
 *    is why this uses dbPlatform (a webhook arrives before we know the
 *    tenant); the settlement itself then runs inside that tenant's context.
 */
export async function billingWebhookRoutes(fastify: FastifyInstance) {
  fastify.post('/flutterwave', async (request, reply) => {
    if (!PaymentGateway.verifyWebhookSignature(request.headers['verif-hash'])) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }
    const body = (request.body ?? {}) as any;
    const data = body.data ?? {};
    const eventType = String(body.event ?? body['event.type'] ?? 'unknown');
    // A stable id for dedup: the gateway's transaction id + the event kind (a
    // transaction legitimately produces more than one kind of event).
    const eventId = data.id != null ? `${eventType}:${data.id}` : null;
    if (!eventId) return reply.status(400).send({ error: 'Malformed event' });

    const inserted = await dbPlatform.insertInto('billing_webhook_events')
      .values({ gateway: 'flutterwave', event_id: eventId, event_type: eventType, payload: JSON.stringify(body) as any })
      .onConflict(oc => oc.columns(['gateway', 'event_id']).doNothing())
      .returning('id').executeTakeFirst();
    if (!inserted) return { received: true, duplicate: true };

    let outcome = 'ignored';
    try {
      if (eventType === 'charge.completed' && data.tx_ref) {
        const invoice = await dbPlatform.selectFrom('subscription_invoices').select(['id', 'tenant_id'])
          .where('gateway_ref', '=', String(data.tx_ref)).executeTakeFirst();
        if (!invoice) {
          outcome = 'unknown_reference';
        } else {
          const verification = await PaymentGateway.verifyById(data.id);
          outcome = await settleInvoiceFromGateway(invoice.tenant_id, invoice.id, 'flutterwave', verification);
        }
      }
    } catch (err: any) {
      outcome = 'error';
      request.log.error({ err: err.message }, 'billing webhook processing failed');
      // Let the gateway retry: drop the dedup row so the redelivery is processed, not skipped.
      await dbPlatform.deleteFrom('billing_webhook_events').where('id', '=', inserted.id).execute();
      return reply.status(500).send({ error: 'Processing failed' });
    }
    await dbPlatform.updateTable('billing_webhook_events').set({ outcome }).where('id', '=', inserted.id).execute();
    return { received: true, outcome };
  });
}
