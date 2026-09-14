import type { FastifyInstance } from 'fastify';
import { dbPlatform, withTenant } from '../db/client.js';

// A 1x1 transparent GIF — the smallest real image a mail client's image
// loader will actually fetch (some clients skip a 0-byte or non-image
// response rather than request it, which would silently break the whole
// feature).
const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

/**
 * GET /v1/email/receipt/:id — the read-receipt tracking pixel embedded in
 * an outbound message's HTML when the sender checked "Request read
 * receipt" (email.routes.ts POST /send). Deliberately public/unauthenticated
 * — the recipient's mail client fetches this with no Hudumika session,
 * same trust model as any external tracking pixel. The id in the URL is
 * the message's own UUID (unguessable, not sequential), which is the only
 * thing standing in for a dedicated token here — acceptable for what this
 * is (a soft, best-effort signal never treated as proof of delivery
 * anywhere else in the codebase), not something carrying real authorization.
 *
 * Always returns the pixel even on a miss/error — an image tag failing
 * loudly is worse than a receipt silently not registering.
 */
export async function emailReceiptRoutes(fastify: FastifyInstance) {
  fastify.get('/receipt/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.header('Content-Type', 'image/gif');
    reply.header('Cache-Control', 'no-store');

    try {
      const msg = await dbPlatform.selectFrom('email_messages')
        .select(['id', 'tenant_id', 'read_receipt_requested', 'read_receipt_confirmed_at'])
        .where('id', '=', id).executeTakeFirst();

      if (msg?.read_receipt_requested && !msg.read_receipt_confirmed_at) {
        await withTenant(msg.tenant_id, (trx) =>
          trx.updateTable('email_messages').set({ read_receipt_confirmed_at: new Date() })
            .where('id', '=', id).execute());
      }
    } catch {
      // A recipient's mail client is waiting on this image regardless —
      // never let a lookup/update failure turn into a broken pixel.
    }

    return reply.send(TRANSPARENT_GIF);
  });
}
