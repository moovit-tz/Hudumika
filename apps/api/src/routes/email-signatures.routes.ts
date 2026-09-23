import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';
import { sanitizeContent, CMSService } from '../services/cms.service.js';
import { env } from '../config/env.js';

const saveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  bodyHtml: z.string().max(20_000).optional().default(''),
});

/**
 * Multiple named, rich-content signatures per user (email_signatures,
 * migration 493) — replaces user_email_accounts.signature's single plain
 * string. Each user can mark one signature as the default for new
 * messages and one (possibly the same one) as the default for
 * replies/forwards, matching Gmail's own two-dropdown model.
 */
export async function emailSignaturesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('email'));
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('email_signatures').selectAll()
        .where('user_id', '=', user.sub)
        .orderBy('created_at', 'asc')
        .execute());
  });

  fastify.post('/', async (request: any) => {
    const user = request.user;
    const b = saveSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      // A user's very first signature becomes both defaults automatically —
      // otherwise nothing would ever get appended until they explicitly set
      // one, which would look like the feature silently doing nothing.
      const existingCount = await trx.selectFrom('email_signatures')
        .select(({ fn }) => fn.countAll().as('n')).where('user_id', '=', user.sub).executeTakeFirst();
      const isFirst = Number(existingCount?.n ?? 0) === 0;
      const row = await trx.insertInto('email_signatures').values({
        tenant_id: user.tenant_id,
        user_id: user.sub,
        name: b.name,
        body_html: sanitizeContent(b.bodyHtml ?? ''),
        is_default_new: isFirst,
        is_default_reply: isFirst,
      }).returningAll().executeTakeFirstOrThrow();
      return row;
    });
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const user = request.user;
    const b = saveSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('email_signatures').select('id')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Signature not found.' });
      const row = await trx.updateTable('email_signatures').set({
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.bodyHtml !== undefined ? { body_html: sanitizeContent(b.bodyHtml) } : {}),
        updated_at: new Date(),
      }).where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow();
      return row;
    });
  });

  fastify.delete('/:id', async (request: any, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const result = await trx.deleteFrom('email_signatures')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) return reply.status(404).send({ error: 'Signature not found.' });
      return { success: true };
    });
  });

  // POST /images — image insert for the signature rich-text editor. A
  // signature's HTML is emailed to recipients who have no Hudumika session,
  // so the image needs a genuinely public URL — reused here from CMS
  // media's existing storage + public-serve pipeline (CMSService.uploadMedia
  // / GET /v1/cms/public/media/:id) rather than building a second one.
  // Calling the service directly (not the /v1/cms/media HTTP route) means
  // this stays gated on the `email` entitlement above, not `cms`.
  fastify.post('/images', async (request: any, reply) => {
    const user = request.user;
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded.' });
    if (!data.mimetype.startsWith('image/')) {
      return reply.status(400).send({ error: 'Only image files are supported.' });
    }
    const buffer = await data.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Images are limited to 5MB.' });
    }
    const media = await CMSService.uploadMedia(user.tenant_id, user.sub, data.filename || 'signature-image', data.mimetype, buffer);
    // Absolute, not relative — this URL is embedded in outbound mail and
    // has to resolve for a recipient with no Hudumika session and no
    // concept of "this app's own origin" the way a browser page would.
    return { url: `${env.API_BASE_URL}/v1/cms/public/media/${media.id}` };
  });

  // POST /:id/set-default {context: 'new'|'reply'} — clears the flag on any
  // sibling row first so exactly one signature ever holds each default,
  // same "only one default" pattern used elsewhere in this codebase.
  fastify.post('/:id/set-default', async (request: any, reply) => {
    const user = request.user;
    const { context } = z.object({ context: z.enum(['new', 'reply']) }).parse(request.body);
    const column = context === 'new' ? 'is_default_new' : 'is_default_reply';
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('email_signatures').select('id')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Signature not found.' });
      await trx.updateTable('email_signatures').set({ [column]: false } as any).where('user_id', '=', user.sub).execute();
      await trx.updateTable('email_signatures').set({ [column]: true, updated_at: new Date() } as any)
        .where('id', '=', request.params.id).execute();
      return { success: true };
    });
  });
}
