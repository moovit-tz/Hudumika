import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import { env } from '../config/env.js';
import { NotificationService } from '../services/notification.service.js';

// These two are public webhooks fed by third-party services (GPSWOX, Meta's
// WhatsApp Cloud API) whose payload shape is theirs to evolve, not ours to
// pin down — a strict schema would risk rejecting a legitimate payload we
// don't fully control. This only guards against a `null`/array/non-object
// body, which would otherwise throw on the very first `payload.foo` access
// below (a JSON POST body of literally `null` is valid JSON) and 500 an
// endpoint the internet can hit unauthenticated.
const webhookPayloadSchema = z.record(z.string(), z.any());

/** Verifies Meta's X-Hub-Signature-256 HMAC over the exact raw request bytes
 *  — must run before JSON.parse touches the body, since re-serializing would
 *  not byte-for-byte match what Meta actually signed. Returns true (allow)
 *  when META_APP_SECRET isn't configured yet, since there's nothing to check
 *  a signature against; once a real secret is set this starts enforcing. */
function verifyMetaSignature(rawBody: Buffer, header: string | undefined): boolean {
  if (!env.META_APP_SECRET) return true;
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex');
  const provided = header.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const FLEET_MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

/** Fans a fleet alert out to every fleet-manager-role user in the tenant — same pattern as fleetCompliance.routes.ts's notifyFleetManagers(). */
async function notifyFleetManagers(tenantId: string, title: string, message: string, link: string) {
  const managers = await withTenant(tenantId, (trx) =>
    trx.selectFrom('users').select('id')
      .where('tenant_id', '=', tenantId)
      .where('role', 'in', [...FLEET_MGMT_ROLES])
      .execute()
  );
  await Promise.all(managers.map((m) =>
    NotificationService.createNotification({
      tenantId, userId: m.id, app: 'tracking', type: 'fleet_alert', title, message, link,
    })
  ));
}

export async function webhookRoutes(fastify: FastifyInstance) {
  // Scoped to this plugin only (Fastify encapsulation) — stashes the raw
  // bytes on the request before parsing, since verifyMetaSignature needs the
  // exact wire bytes Meta signed, not a reserialized copy of the parsed JSON.
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as any).rawBody = body;
    if (!body.length) return done(null, {});
    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  /**
   * POST /v1/webhooks/gpswox
   * Webhook endpoint for GPSWOX to push live tracking and alerts
   */
  fastify.post('/gpswox', async (request, reply) => {
    try {
      // GPSWOX has no request-signing scheme of its own — a shared secret
      // sent back as ?token= is the simplest proof this came from the
      // configured GPSWOX account, not an internet client that guessed a
      // real vehicle IMEI. Skipped (open) until a real secret is configured.
      if (env.GPSWOX_WEBHOOK_SECRET) {
        const token = (request.query as any)?.token;
        if (token !== env.GPSWOX_WEBHOOK_SECRET) {
          return reply.status(401).send({ error: 'Invalid webhook token' });
        }
      }

      const payload = webhookPayloadSchema.parse(request.body ?? {});
      console.log('📥 GPSWOX Webhook Received:', payload);

      // Extract device ID (IMEI)
      const imei = payload.device_imei || payload.imei;
      
      if (!imei) {
        return reply.status(400).send({ error: 'Missing device IMEI in payload' });
      }

      // Find the corresponding vehicle — pre-tenant: GPSWOX identifies a
      // device by IMEI alone, so the tenant isn't known until this resolves.
      const vehicle = await dbPlatform.selectFrom('vehicles')
        .select(['id', 'tenant_id', 'name'])
        .where('device_id', '=', imei)
        .where('status', '=', 'ACTIVE')
        .executeTakeFirst();

      if (!vehicle) {
        return reply.status(404).send({ error: 'Vehicle not found for this device' });
      }

      await withTenant(vehicle.tenant_id, async (trx) => {
        // If it's a position update
        if (payload.latitude && payload.longitude) {
          let ignition = 'OFF';
          let battery_pct = 100;

          // GPSWOX sends sensors in a params/sensors object depending on webhook type
          if (payload.params) {
            if (payload.params.ignition !== undefined) ignition = payload.params.ignition ? 'ON' : 'OFF';
            if (payload.params.battery !== undefined) battery_pct = parseFloat(payload.params.battery);
          }

          await trx.insertInto('vehicle_positions').values({
            tenant_id: vehicle.tenant_id,
            vehicle_id: vehicle.id,
            latitude: payload.latitude,
            longitude: payload.longitude,
            speed: payload.speed || 0,
            heading: payload.course || 0,
            battery_pct,
            ignition,
            recorded_at: payload.time ? new Date(payload.time) : new Date(),
          }).execute();
        }

        // Check for alerts (e.g. geofence)
        if (payload.alert_name) {
          const alertType = payload.alert_name.toLowerCase();
          
          const link = `/tracking/vehicles/${vehicle.id}`;
          if (alertType.includes('geofence')) {
            await notifyFleetManagers(vehicle.tenant_id, 'Geofence Alert', `${vehicle.name} has ${payload.alert_name}`, link);
          } else if (alertType.includes('deviation') || alertType.includes('overspeed')) {
            await notifyFleetManagers(vehicle.tenant_id, 'Security / Compliance Alert', `${vehicle.name} triggered: ${payload.alert_name}`, link);
          }
        }
      });

      return { ok: true };
    } catch (error: any) {
      console.error('Error processing GPSWOX webhook:', error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
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
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    if (!verifyMetaSignature((request as any).rawBody, signature)) {
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }

    const payload = webhookPayloadSchema.parse(request.body ?? {});

    // Parse message details
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const val = change?.value;
    const msg = val?.messages?.[0];

    if (msg && msg.type === 'text') {
      const fromPhone = msg.from; // e.g. "255712345678"
      const textBody = msg.text?.body;

      console.log(`📥 Webhook Inbound Message: From +${fromPhone} -> "${textBody}"`);

      // 1. Resolve Customer by matching WA phone formats — pre-tenant: an
      // inbound WhatsApp message identifies a phone number, not a tenant.
      const customer = await dbPlatform
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
        const activeTicket = await withTenant(customer.tenant_id, async (trx) => {
          // 2. Find their most recently updated active Support Ticket
          let activeTicket = await trx
            .selectFrom('support_tickets')
            .selectAll()
            .where('customer_id', '=', customer.id)
            .where('status', 'in', ['OPEN', 'IN_PROGRESS'])
            .orderBy('updated_at', 'desc')
            .executeTakeFirst();

          if (!activeTicket) {
            // Auto-create ticket if none exists
            const ref_number = `SUP-WA-${Math.floor(1000 + Math.random() * 9000)}`;
            activeTicket = await trx
              .insertInto('support_tickets')
              .values({
                tenant_id: customer.tenant_id,
                customer_id: customer.id,
                ref_number,
                subject: 'Inbound WhatsApp Message',
                channel: 'WHATSAPP',
                status: 'OPEN',
                priority: 'NORMAL',
                category: 'General Inquiry',
                tags: JSON.stringify([]),
              })
              .returningAll()
              .executeTakeFirstOrThrow();
          }

          // Append incoming message record to support_messages
          await trx
            .insertInto('support_messages')
            .values({
              tenant_id: customer.tenant_id,
              ticket_id: activeTicket.id,
              author_id: customer.id,
              author_name: customer.contact_name || customer.name,
              author_type: 'CUSTOMER',
              channel: 'WHATSAPP',
              direction: 'INBOUND',
              content: textBody,
            })
            .execute();

          // Bump ticket update date
          await trx
            .updateTable('support_tickets')
            .set({ updated_at: new Date() })
            .where('id', '=', activeTicket.id)
            .execute();

          return activeTicket;
        });

        // 3. Broadcast real-time WebSocket event to connected ops boards
        fastify.websocketServer?.clients.forEach((client: any) => {
          client.send(
            JSON.stringify({
              type: 'support.message_received',
              ticketId: activeTicket.id,
              message: textBody,
            })
          );
        });
      }
    }

    return { success: true };
  });
}
