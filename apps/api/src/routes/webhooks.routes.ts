import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import { env } from '../config/env.js';
import { NotificationService } from '../services/notification.service.js';
import { broadcastToTenant } from '../lib/ws-broadcast.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';

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

/** Meta's Cloud API delivers non-text messages (image/document/audio/video/
 *  location/contacts/sticker/reaction...) with no `text` field at all — this
 *  used to make the inbound handler's own `msg.type === 'text'` check
 *  silently drop them with no ticket, no message row, no trace anywhere.
 *  Downloading and storing the actual media (Meta's media API + Minio) is a
 *  real, separate scope item; this at minimum stops losing the message by
 *  recording a clearly-labelled placeholder an agent can act on ("call the
 *  customer back", "ask them to resend as text") until that's built. */
function describeInboundMessage(msg: any): string {
  switch (msg.type) {
    case 'text':
      return msg.text?.body || '';
    case 'image':
      return `[Image attachment${msg.image?.caption ? `: ${msg.image.caption}` : ''}] (media id ${msg.image?.id || 'unknown'} — not yet downloaded, WhatsApp media download is not implemented)`;
    case 'document':
      return `[Document attachment: ${msg.document?.filename || msg.document?.id || 'unknown'}] (not yet downloaded, WhatsApp media download is not implemented)`;
    case 'audio':
    case 'voice':
      return `[Voice/audio message] (media id ${msg.audio?.id || 'unknown'} — not yet downloaded, WhatsApp media download is not implemented)`;
    case 'video':
      return `[Video attachment${msg.video?.caption ? `: ${msg.video.caption}` : ''}] (not yet downloaded, WhatsApp media download is not implemented)`;
    case 'sticker':
      return '[Sticker] (not yet downloaded, WhatsApp media download is not implemented)';
    case 'location':
      return `[Shared location: ${msg.location?.latitude}, ${msg.location?.longitude}${msg.location?.name ? ` — ${msg.location.name}` : ''}]`;
    case 'contacts':
      return `[Shared contact card: ${msg.contacts?.[0]?.name?.formatted_name || 'unknown contact'}]`;
    case 'button':
      return msg.button?.text || '[Button reply]';
    case 'interactive':
      return msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interactive reply]';
    default:
      return `[Unsupported WhatsApp message type: ${msg.type}]`;
  }
}

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
   * Inbound WhatsApp message receiver. Finds/creates customer, resolves
   * case, logs message. Also carries Meta's delivery/read/failed receipts
   * for messages this platform sent (the `statuses` array) — a separate,
   * independent payload shape on the same endpoint.
   */
  fastify.post('/whatsapp', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    if (!verifyMetaSignature((request as any).rawBody, signature)) {
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }

    const payload = webhookPayloadSchema.parse(request.body ?? {});

    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const val = change?.value;
    const msg = val?.messages?.[0];
    const statuses: any[] = Array.isArray(val?.statuses) ? val.statuses : [];
    // The number a message arrived on, not the sender's own number — the
    // only reliable way to know which tenant's WhatsApp Business inbox was
    // actually messaged, since a brand-new sender has no customer row yet
    // to match a tenant through.
    const receivingPhoneNumberId = val?.metadata?.phone_number_id ? String(val.metadata.phone_number_id) : null;

    // ── Delivery/read/failed receipts for OUTBOUND sends ──────────────────
    // messaging.service.ts already stores Meta's message id as external_ref
    // on every WhatsApp send; this is the only place that ever reads it back.
    for (const status of statuses) {
      const metaId = status?.id;
      const state = status?.status; // 'sent' | 'delivered' | 'read' | 'failed'
      if (!metaId || !['sent', 'delivered', 'read', 'failed'].includes(state)) continue;
      await dbPlatform
        .updateTable('support_messages')
        .set({ delivery_status: state })
        .where('channel', '=', 'WHATSAPP')
        .where('external_ref', '=', metaId)
        .execute()
        .catch(() => {}); // best-effort — a receipt for a message this platform never sent (e.g. a different WABA sharing the app) has nothing to update
    }

    if (!msg) {
      // A status-only delivery has nothing else to do; either way Meta must
      // see 200 or it will keep retrying this payload indefinitely.
      return { success: true };
    }

    const fromPhone = String(msg.from || ''); // e.g. "255712345678"
    if (!fromPhone) return { success: true };

    // 1. Resolve which tenant actually received this message. The receiving
    // number is authoritative when a tenant has configured its own WhatsApp
    // Business number; matching the sender's own phone against `customers`
    // (below) only works once a customer row already exists, which is
    // exactly the case that doesn't hold on a first-ever contact.
    //
    // NOTE ON THE PLATFORM'S ACTUAL WHATSAPP ARCHITECTURE: every outbound
    // send site (messaging.service.ts, notification.service.ts, etc.) calls
    // WhatsAppIntegration.sendMessage() with no tenant-specific credentials,
    // so in this deployment every tenant currently sends through the one
    // platform-wide number (env.META_PHONE_NUMBER_ID) — no tenant has ever
    // actually set tenants.wa_phone_id or tenant_settings.integrations.
    // whatsapp.phone_number_id (checked both here, since that JSON path —
    // not the wa_phone_id column — is the one the codebase's own cleanup
    // script already treats as the real per-tenant config location; the
    // column is a scaffold nothing has ever written to). With a single
    // shared number, `phone_number_id` on the webhook is IDENTICAL for
    // every tenant and cannot by itself disambiguate which one a stranger's
    // first message belongs to — that is a genuine architectural gap (one
    // shared WhatsApp inbox can't attribute a brand-new contact to one of
    // several tenants), not something this handler can code around. This
    // lookup exists for the day a tenant configures a dedicated number —
    // until then it correctly finds nothing and falls through.
    let tenantId: string | null = null;
    if (receivingPhoneNumberId) {
      const tenantByColumn = await dbPlatform
        .selectFrom('tenants')
        .select(['id'])
        .where('wa_phone_id', '=', receivingPhoneNumberId)
        .executeTakeFirst();
      if (tenantByColumn) {
        tenantId = tenantByColumn.id;
      } else {
        const allSettings = await dbPlatform.selectFrom('tenant_settings').select(['tenant_id', 'settings']).execute();
        for (const row of allSettings) {
          const s: any = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
          const wa = s?.integrations?.whatsapp ?? s?.whatsapp ?? {};
          const configuredId = wa?.phone_number_id || wa?.phoneNumberId;
          if (configuredId && String(configuredId) === receivingPhoneNumberId) {
            tenantId = row.tenant_id;
            break;
          }
        }
      }
    }

    // 2. Resolve the customer by matching WA phone formats, scoped to the
    // resolved tenant when known (two tenants could otherwise share a
    // customer with the same phone number on different WABAs).
    let customer = await dbPlatform
      .selectFrom('customers')
      .selectAll()
      .$if(!!tenantId, (qb) => qb.where('tenant_id', '=', tenantId as string))
      .where((eb) =>
        eb.or([
          eb('phone_wa', '=', `+${fromPhone}`),
          eb('phone_wa', '=', fromPhone),
          eb('phone_wa', '=', `+${fromPhone.replace(/^255/, '0')}`),
        ])
      )
      .executeTakeFirst();

    if (!customer && tenantId) {
      // First-ever contact from this number. A support inbox that silently
      // drops the single most common real-world scenario — a new customer's
      // first message — is not a working inbox; auto-create a minimal
      // customer record in the tenant whose number was actually messaged.
      customer = await withTenant(tenantId, (trx) =>
        trx
          .insertInto('customers')
          .values({
            tenant_id: tenantId as string,
            name: val?.contacts?.[0]?.profile?.name || `+${fromPhone}`,
            phone_wa: `+${fromPhone}`,
            source: 'whatsapp',
          } as any)
          .returningAll()
          .executeTakeFirstOrThrow()
      );
    }

    if (!customer) {
      // Neither the receiving number nor the sender's phone resolved a
      // tenant — most likely a misconfigured/unregistered WABA number.
      // Nothing safe to attribute this message to.
      console.warn(`⚠️ WhatsApp webhook: no tenant resolved for inbound message from +${fromPhone} (phone_number_id=${receivingPhoneNumberId ?? 'none'})`);
      return { success: true };
    }

    console.log(`📥 Webhook Inbound Message: From +${fromPhone} -> tenant ${customer.tenant_id}`);

    const externalRef: string | null = msg.id || null;
    const contentBody = describeInboundMessage(msg);

    const activeTicket = await withTenant(customer.tenant_id, async (trx) => {
      let activeTicket = await trx
        .selectFrom('support_tickets')
        .selectAll()
        .where('customer_id', '=', customer!.id)
        .where('status', 'in', ['OPEN', 'IN_PROGRESS'])
        .orderBy('updated_at', 'desc')
        .executeTakeFirst();

      if (!activeTicket) {
        const ref_number = `SUP-WA-${Math.floor(1000 + Math.random() * 9000)}`;
        activeTicket = await trx
          .insertInto('support_tickets')
          .values({
            tenant_id: customer!.tenant_id,
            customer_id: customer!.id,
            ref_number,
            subject: msg.type === 'text' ? 'Inbound WhatsApp Message' : `Inbound WhatsApp ${msg.type}`,
            channel: 'WHATSAPP',
            status: 'OPEN',
            priority: 'NORMAL',
            category: 'General Inquiry',
            tags: JSON.stringify([]),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      // Meta redelivers webhooks at-least-once — the unique index from
      // migration 404 makes a redelivered message a real no-op (via
      // ON CONFLICT DO NOTHING, not a check-then-insert that a genuinely
      // concurrent redelivery could still race past) rather than a
      // duplicate row in someone's ticket.
      const inserted = await trx
        .insertInto('support_messages')
        .values({
          tenant_id: customer!.tenant_id,
          ticket_id: activeTicket.id,
          author_id: customer!.id,
          author_name: customer!.contact_name || customer!.name,
          author_type: 'CUSTOMER',
          channel: 'WHATSAPP',
          direction: 'INBOUND',
          content: contentBody,
          external_ref: externalRef,
        } as any)
        // Postgres can only infer a PARTIAL unique index as the ON CONFLICT
        // arbiter when the predicate is restated here verbatim — omitting
        // this .where() is what "no unique or exclusion constraint matching
        // the ON CONFLICT specification" means; migration 404's index is
        // partial (WHERE external_ref IS NOT NULL) precisely so it doesn't
        // also have to reject every pre-existing NULL-external_ref row.
        .$if(!!externalRef, (qb) => qb.onConflict((oc) => oc.columns(['channel', 'external_ref']).where('external_ref', 'is not', null).doNothing()))
        .returning('id')
        .executeTakeFirst();
      if (externalRef && !inserted) return null; // duplicate delivery of an already-recorded message

      await trx
        .updateTable('support_tickets')
        .set({ updated_at: new Date() })
        .where('id', '=', activeTicket.id)
        .execute();

      return activeTicket;
    });

    if (activeTicket) {
      broadcastToTenant(fastify, customer.tenant_id, {
        type: 'support.message_received',
        ticketId: activeTicket.id,
        message: contentBody,
      });

      // Real keyword-triggered auto-reply — reuses the same rules engine
      // (support_rules) auto-assignment/SLA-escalation already run on, just
      // a new `type`. Text messages only: matching "#STATUS" against
      // "[Image attachment...]" is never intentional. Best-effort — a
      // config problem here must not fail the webhook (Meta would retry
      // forever) or cost the customer their already-recorded message.
      if (msg.type === 'text') {
        try {
          const bodyUpper = contentBody.trim().toUpperCase();
          const rules = await withTenant(customer.tenant_id, trx =>
            trx.selectFrom('support_rules').select(['id', 'config'])
              .where('tenant_id', '=', customer!.tenant_id)
              .where('type', '=', 'whatsapp_keyword')
              .where('enabled', '=', true)
              .execute()
          );
          for (const rule of rules) {
            const cfg: any = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
            const keyword = String(cfg?.keyword || '').trim().toUpperCase();
            if (!keyword || !cfg?.replyText) continue;
            const isMatch = cfg.matchType === 'exact' ? bodyUpper === keyword
              : cfg.matchType === 'starts_with' ? bodyUpper.startsWith(keyword)
              : bodyUpper.includes(keyword);
            if (!isMatch) continue;

            const sendResult = await WhatsAppIntegration.sendMessage(fromPhone, cfg.replyText);
            await withTenant(customer!.tenant_id, trx => trx.insertInto('support_messages').values({
              tenant_id: customer!.tenant_id,
              ticket_id: activeTicket!.id,
              author_id: customer!.id,
              author_name: 'Auto-Reply Bot',
              author_type: 'SYSTEM',
              channel: 'WHATSAPP',
              direction: 'OUTBOUND',
              content: cfg.replyText,
              external_ref: sendResult.messageId || null,
            } as any).execute());
            broadcastToTenant(fastify, customer!.tenant_id, { type: 'support.message_received', ticketId: activeTicket!.id, message: cfg.replyText });
            break; // first matching rule wins — same "first enabled rule" convention applyAutoAssignRules already uses
          }
        } catch (err) {
          console.error('WhatsApp keyword auto-reply failed:', err);
        }
      }
    }

    return { success: true };
  });
}
