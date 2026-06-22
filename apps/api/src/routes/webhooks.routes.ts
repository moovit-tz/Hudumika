import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { env } from '../config/env.js';

export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/webhooks/whatsapp
   * Challenge verification for setting up Meta WhatsApp Cloud API integrations.
   */
  fastify.get('/whatsapp', async (request, reply) => {
    const query = request.query as any;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
      console.log('✅ WhatsApp Webhook handshake verification SUCCESS!');
      return challenge;
    }

    console.warn('⚠️ WhatsApp Webhook verification FAILED. Token mismatch.');
    return reply.status(403).send({ error: 'Verification token mismatch' });
  });

  /**
   * POST /v1/webhooks/whatsapp
   * Inbound WhatsApp message receiver. Finds customer, resolves case, logs message.
   */
  fastify.post('/whatsapp', async (request, reply) => {
    const payload = request.body as any;
    
    // Parse message details
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const val = change?.value;
    const msg = val?.messages?.[0];

    if (msg && msg.type === 'text') {
      const fromPhone = msg.from; // e.g. "255712345678"
      const textBody = msg.text?.body;

      console.log(`📥 Webhook Inbound Message: From +${fromPhone} -> "${textBody}"`);

      // 1. Resolve Customer by matching WA phone formats
      const customer = await db
        .selectFrom('customers')
        .selectAll()
        .where((eb) =>
          eb.or([
            eb('phone_wa', '=', `+${fromPhone}`),
            eb('phone_wa', '=', fromPhone),
            eb('phone_wa', '=', `+${fromPhone.replace(/^255/, '0')}`),
          ])
        )
        .executeTakeFirst();

      if (customer) {
        // 2. Find their most recently updated active shipment case
        const activeCase = await db
          .selectFrom('shipment_cases')
          .selectAll()
          .where('customer_id', '=', customer.id)
          .where('stage', 'not in', ['CLOSED'])
          .orderBy('updated_at', 'desc')
          .executeTakeFirst();

        if (activeCase) {
          await withTenant(customer.tenant_id, async (trx) => {
            // Append incoming message record
            await trx
              .insertInto('case_messages')
              .values({
                tenant_id: customer.tenant_id,
                shipment_id: activeCase.id,
                author_id: customer.id,
                author_name: customer.contact_name || customer.name,
                author_type: 'CUSTOMER',
                channel: 'WHATSAPP',
                direction: 'INBOUND',
                content: textBody,
                created_at: new Date(),
              })
              .execute();

            // Bump shipment case update date
            await trx
              .updateTable('shipment_cases')
              .set({ updated_at: new Date() })
              .where('id', '=', activeCase.id)
              .execute();
          });

          // 3. Broadcast real-time WebSocket event to connected ops boards
          fastify.websocketServer?.clients.forEach((client: any) => {
            client.send(
              JSON.stringify({
                type: 'case.update_posted',
                caseId: activeCase.id,
                message: textBody,
              })
            );
          });
        }
      }
    }

    return { success: true };
  });
}
