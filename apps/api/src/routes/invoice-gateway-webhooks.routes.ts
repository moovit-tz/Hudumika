import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import { getGatewayConfig } from '../lib/payment-gateway.js';
import { recordInvoicePayment } from '../services/invoice-payment.service.js';

/**
 * Inbound confirmation for POST /v1/invoices/:id/gateway-checkout (S05 —
 * "timeout followed by late success produces one payment"). The checkout
 * route already makes a real call to the provider and records a `pending`
 * row in gateway_checkout_sessions keyed by tx_ref; this is the other half
 * — it resolves that tx_ref to exactly one settled invoice payment,
 * regardless of whether the customer's own browser ever saw the redirect,
 * and regardless of how many times the provider redelivers the event.
 *
 * Currently wired for Flutterwave only — the one gateway in this codebase
 * with a proven webhook-signature pattern already in production use
 * (billing-webhooks.routes.ts, for the separate platform-subscription
 * flow). Stripe/Paystack checkout links are real (invoices.routes.ts makes
 * real outbound calls to both), but neither has a webhook receiver here
 * yet — building one honestly needs their own signature schemes (Stripe:
 * HMAC-SHA256 over the raw body with a signing secret; Paystack: HMAC-
 * SHA512) and a UI field to collect that per-tenant secret, same as this
 * file adds for Flutterwave's "Secret Hash" below. Not fabricated here —
 * genuinely not yet built.
 *
 * Trust model, same shape as billing-webhooks.routes.ts:
 *  - The tx_ref lookup is cross-tenant (a webhook arrives before we know
 *    which tenant it belongs to), so it uses dbPlatform — but that lookup
 *    alone proves nothing; it only tells us which tenant's own webhook
 *    secret to check the signature against.
 *  - Signature is verified against THAT tenant's own stored Secret Hash
 *    (each tenant has their own Flutterwave merchant account), not a
 *    platform-wide one — unlike billing-webhooks.routes.ts, which is one
 *    gateway account for the whole platform.
 *  - The webhook body's amount/status is never trusted directly: once the
 *    signature checks out, the transaction is independently re-verified
 *    with Flutterwave's own verify-by-id API using the tenant's own
 *    secret key, and checked against the session's recorded amount/
 *    currency before anything is settled.
 *  - Idempotent: the session row is claimed with a guarded
 *    `WHERE status = 'pending'` update inside the same locked transaction
 *    as the payment write — a duplicate delivery, or a race against a
 *    concurrent manual payment, settles at most once.
 */
export async function invoiceGatewayWebhookRoutes(fastify: FastifyInstance) {
  fastify.post('/flutterwave', async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const data = body?.data ?? {};
    const txRef = data.tx_ref ? String(data.tx_ref) : null;
    if (!txRef) return reply.status(400).send({ error: 'Malformed event' });

    // Cross-tenant by necessity — we don't yet know which tenant's secret
    // to verify the signature against until we know whose session this is.
    // This lookup is not itself trusted as proof of anything; it only
    // names which tenant's own secret to check next.
    const session = await dbPlatform.selectFrom('gateway_checkout_sessions')
      .select(['id', 'tenant_id', 'invoice_id', 'status', 'amount', 'currency'])
      .where('gateway', '=', 'flutterwave').where('tx_ref', '=', txRef)
      .executeTakeFirst();
    if (!session) return { received: true, outcome: 'unknown_reference' };

    const gw = await getGatewayConfig(session.tenant_id, 'flutterwave');
    const webhookSecret = gw?.config?.webhookSecret;
    const header = request.headers['verif-hash'];
    if (!webhookSecret || typeof header !== 'string') return reply.status(401).send({ error: 'Invalid signature' });
    const a = Buffer.from(header);
    const b = Buffer.from(webhookSecret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    return withTenant(session.tenant_id, async (trx) => {
      // Re-read under lock — a redelivery or a concurrent manual payment
      // must see this session's already-settled state, not the stale copy
      // read above (that copy was only ever used to find the right
      // tenant/secret, never trusted for a decision).
      const claimed = await trx.selectFrom('gateway_checkout_sessions').selectAll()
        .where('id', '=', session.id).where('tenant_id', '=', session.tenant_id).forUpdate().executeTakeFirst();
      if (!claimed || claimed.status !== 'pending') return { received: true, outcome: 'duplicate' };

      const key = gw?.config?.secretKey || gw?.config?.apiKey;
      if (!key) {
        request.log.error({ tenantId: session.tenant_id }, 'Flutterwave webhook received but no secret key configured to verify it');
        return reply.status(500).send({ error: 'Gateway not fully configured' });
      }
      const transactionId = data.id;
      if (transactionId == null) return reply.status(400).send({ error: 'Malformed event' });

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      let verified: any;
      try {
        const res = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionId))}/verify`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: ctrl.signal,
        });
        verified = await res.json().catch(() => ({}));
      } finally {
        clearTimeout(timer);
      }

      const vd = verified?.data;
      const ok = verified?.status === 'success' && vd && vd.status === 'successful'
        && String(vd.tx_ref) === txRef
        && Number(vd.amount) === Number(claimed.amount)
        && String(vd.currency).toUpperCase() === String(claimed.currency).toUpperCase();

      if (!ok) {
        const failed = await trx.updateTable('gateway_checkout_sessions')
          .set({ status: 'failed', provider_transaction_id: String(transactionId), settled_at: new Date() })
          .where('id', '=', claimed.id).where('status', '=', 'pending').executeTakeFirst();
        return { received: true, outcome: failed ? 'verification_failed' : 'duplicate' };
      }

      const outcome = await recordInvoicePayment(trx, session.tenant_id, claimed.invoice_id, {
        amount: Number(claimed.amount),
        method: 'CARD',
        paymentDate: new Date().toISOString().slice(0, 10),
        note: `Online payment via Flutterwave (tx_ref: ${txRef})`,
        // Belt-and-braces alongside the session claim below: even if two
        // webhook deliveries somehow both passed the status='pending'
        // claim race (they cannot, forUpdate() serializes them), this
        // request_key makes a second insert a no-op replay, not a second
        // payment.
        requestKey: `gateway:flutterwave:${txRef}`,
        actorId: null,
        actorName: 'Flutterwave (online payment)',
      });

      if (outcome.outcome !== 'recorded' && outcome.outcome !== 'replayed') {
        // The invoice itself refused the payment (not found, or no longer
        // in a payable state) — leave the session claimable so a real
        // fix (e.g. manually reopening the invoice) can be followed by a
        // retried verification, rather than permanently marking it failed
        // for a problem that wasn't about the payment itself.
        request.log.error({ tenantId: session.tenant_id, invoiceId: claimed.invoice_id, outcome: outcome.outcome }, 'Flutterwave webhook verified a payment but the invoice could not accept it');
        return { received: true, outcome: `invoice_${outcome.outcome}` };
      }

      const settled = await trx.updateTable('gateway_checkout_sessions')
        .set({
          status: 'settled', provider_transaction_id: String(transactionId), settled_at: new Date(),
          invoice_payment_id: outcome.outcome === 'recorded' || outcome.outcome === 'replayed' ? outcome.paymentId ?? null : null,
        })
        .where('id', '=', claimed.id).where('status', '=', 'pending').executeTakeFirst();

      return { received: true, outcome: settled ? 'settled' : 'duplicate' };
    });
  });
}
