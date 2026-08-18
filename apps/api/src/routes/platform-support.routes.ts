import type { FastifyInstance } from 'fastify';
import { dbPlatform, withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';

/** What an attachment may be. A bug report wants a screenshot, a PDF of the
 *  report or the invoice that broke — not an executable. */
const ALLOWED_ATTACHMENT_MIME = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|text\/(plain|csv)|application\/(vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.ms-excel))$/;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_TICKET = 6;

/**
 * A name to put on a message.
 *
 * platform_support_messages.author_name is NOT NULL, and `user.name` is only
 * present when the JWT carries that claim — a token minted without it made
 * every submission fail with a raw Postgres constraint error, which is what
 * the reporter saw instead of their report being filed.
 */
function authorName(user: { name?: string | null; email?: string | null }): string {
  return (user.name || user.email || "Workspace user").slice(0, 120);
}

// Tenant-admin ↔ Hudumika platform support — distinct from support.routes.ts,
// which is the tenant's OWN customer-facing helpdesk (support_tickets, keyed
// off `customers`). This is for the tenant asking Hudumika itself for help
// (billing questions, technical issues), which Subscription.tsx's Support tab
// previously rendered as 4 hardcoded fake tickets with no submit path at all.
export default async function platformSupportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/tickets', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('platform_support_tickets').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute()
    );
  });

  fastify.post<{
    Body: {
      subject: string; category?: string; priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'; message: string;
      /** 'bug' when raised by Report an issue; 'general' for the support tab. */
      kind?: string;
      /** Which app it came from, so the platform queue can be triaged. */
      app?: string;
      /** What the reporter was looking at — route, calculation summary,
       *  browser. Read by a person; never fed back into anything. */
      context?: Record<string, unknown>;
      /** The saved calculation the report is about, when there is one. */
      record_id?: string;
    }
  }>(
    '/tickets',
    async (request, reply) => {
      const user = request.user;
      const b = request.body;
      if (!b.subject?.trim() || !b.message?.trim()) {
        reply.status(400);
        return { error: 'Subject and message are required' };
      }
      return withTenant(user.tenant_id, async (trx) => {
        // Only a record this tenant actually owns. An id supplied by the
        // caller is not evidence of anything, and a bug report is a normal
        // way to smuggle one in and have the platform queue render it.
        let recordId: string | null = null;
        if (typeof b.record_id === 'string' && b.record_id) {
          const owned = await trx.selectFrom('landed_cost_records').select('id')
            .where('id', '=', b.record_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
          recordId = owned?.id ?? null;
        }
        const ticket = await trx.insertInto('platform_support_tickets').values({
          tenant_id: user.tenant_id,
          ref_number: `${b.kind === 'bug' ? 'BUG' : 'PS'}-${Math.floor(1000 + Math.random() * 9000)}`,
          created_by: user.sub,
          subject: b.subject.trim(),
          category: b.category || 'general',
          priority: b.priority || 'NORMAL',
          status: 'OPEN',
          kind: b.kind === 'bug' ? 'bug' : 'general',
          app: typeof b.app === 'string' ? b.app.slice(0, 40) : null,
          context: b.context && typeof b.context === 'object' ? JSON.stringify(b.context) : null,
          record_id: recordId,
        }).returningAll().executeTakeFirstOrThrow();

        await trx.insertInto('platform_support_messages').values({
          ticket_id: ticket.id, tenant_id: user.tenant_id,
          author_id: user.sub, author_name: authorName(user),
          is_platform_staff: false, content: b.message.trim(),
        }).execute();

        reply.status(201);
        return ticket;
      });
    }
  );

  fastify.get<{ Params: { id: string } }>('/tickets/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx.selectFrom('platform_support_tickets').selectAll()
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!ticket) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }
      const [messages, attachments] = await Promise.all([
        trx.selectFrom('platform_support_messages').selectAll()
          .where('ticket_id', '=', ticket.id).orderBy('created_at', 'asc').execute(),
        // storage_key deliberately not selected — it is a server-side path,
        // and the download endpoint below is the only way to reach the bytes.
        trx.selectFrom('platform_support_attachments')
          .select(['id', 'filename', 'mime_type', 'size_bytes', 'created_at'])
          .where('ticket_id', '=', ticket.id).orderBy('created_at', 'asc').execute(),
      ]);
      return { ...ticket, messages, attachments };
    });
  });

  // ── POST /v1/platform-support/tickets/:id/attachments ─────────────────────
  // A screenshot is usually the whole bug report, so this accepts one file per
  // call and the form posts them in sequence.
  fastify.post<{ Params: { id: string } }>('/tickets/:id/attachments', async (request, reply) => {
    const user = request.user;
    const data = await (request as any).file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded.' });

    const ticket = await withTenant(user.tenant_id, trx => trx.selectFrom('platform_support_tickets').select('id')
      .where('id', '=', request.params.id)
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst());
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found.' });

    const existing = await withTenant(user.tenant_id, trx => trx.selectFrom('platform_support_attachments')
      .select(eb => eb.fn.countAll<string>().as('n'))
      .where('ticket_id', '=', ticket.id).executeTakeFirst());
    if (Number(existing?.n ?? 0) >= MAX_ATTACHMENTS_PER_TICKET) {
      return reply.status(400).send({ error: `A report can carry at most ${MAX_ATTACHMENTS_PER_TICKET} attachments.` });
    }
    if (!ALLOWED_ATTACHMENT_MIME.test(data.mimetype || '')) {
      return reply.status(415).send({ error: `"${data.mimetype}" is not an accepted attachment. Send an image, a PDF, a CSV or a spreadsheet.` });
    }

    const buffer = await data.toBuffer();
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      return reply.status(413).send({ error: `That file is ${(buffer.length / 1048576).toFixed(1)} MB — the limit is ${MAX_ATTACHMENT_BYTES / 1048576} MB.` });
    }

    const row = await withTenant(user.tenant_id, trx => trx.insertInto('platform_support_attachments').values({
      ticket_id: ticket.id,
      tenant_id: user.tenant_id,
      filename: data.filename,
      mime_type: data.mimetype || null,
      size_bytes: buffer.length,
      storage_key: '',
      uploaded_by: user.sub ?? null,
    }).returning(['id']).executeTakeFirstOrThrow());

    const { storageKey } = await MinioIntegration.uploadSupportAttachment(user.tenant_id, row.id, data.filename, buffer);
    const saved = await withTenant(user.tenant_id, trx => trx.updateTable('platform_support_attachments')
      .set({ storage_key: storageKey })
      .where('id', '=', row.id)
      .returning(['id', 'filename', 'mime_type', 'size_bytes', 'created_at'])
      .executeTakeFirstOrThrow());
    reply.status(201);
    return saved;
  });

  // ── GET /v1/platform-support/attachments/:id ──────────────────────────────
  // Serves the bytes. Platform staff can read any tenant's; everyone else only
  // their own — the attachment's recorded tenant_id is what decides, never a
  // value from the request.
  fastify.get<{ Params: { id: string } }>('/attachments/:id', async (request, reply) => {
    const user = request.user as any;
    const isPlatformStaff = user.role === 'SUPER_ADMIN';
    // Platform staff can read any tenant's attachment — a genuine cross-tenant
    // read via dbPlatform; everyone else stays scoped to their own tenant.
    const att = isPlatformStaff
      ? await dbPlatform.selectFrom('platform_support_attachments').selectAll()
          .where('id', '=', request.params.id).executeTakeFirst()
      : await withTenant(user.tenant_id, trx => trx.selectFrom('platform_support_attachments').selectAll()
          .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    if (!att) return reply.status(404).send({ error: 'Attachment not found.' });

    const buf = MinioIntegration.readFile(att.storage_key);
    if (!buf) return reply.status(404).send({ error: 'Attachment content is no longer on disk.' });
    reply.header('Content-Type', att.mime_type || 'application/octet-stream');
    // `inline` so a screenshot opens rather than downloads; the filename is
    // quoted and stripped so it cannot break out of the header.
    reply.header('Content-Disposition', `inline; filename="${att.filename.replace(/["\r\n]/g, '')}"`);
    return reply.send(buf);
  });

  fastify.post<{ Params: { id: string }; Body: { message: string } }>('/tickets/:id/reply', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const ticket = await trx.selectFrom('platform_support_tickets').select('id')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!ticket) {
        reply.status(404);
        return { error: 'Ticket not found' };
      }
      const message = await trx.insertInto('platform_support_messages').values({
        ticket_id: ticket.id, tenant_id: user.tenant_id,
        author_id: user.sub, author_name: authorName(user),
        is_platform_staff: false, content: request.body.message.trim(),
      }).returningAll().executeTakeFirstOrThrow();
      await trx.updateTable('platform_support_tickets').set({ updated_at: new Date() }).where('id', '=', ticket.id).execute();
      reply.status(201);
      return message;
    });
  });
}
