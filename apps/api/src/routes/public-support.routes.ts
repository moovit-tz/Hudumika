import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EmailIntegration } from '../integrations/email.js';

const SUPPORT_INBOX = 'support@hudumika.tz';

const CATEGORY_VALUES = [
  'Billing & Subscription', 'Account & Login', 'Shipment & Clearance', 'Finance & Invoicing',
  'ComplyOS & Compliance', 'Tracking & Fleet', 'CRM & Customers', 'HR & Payroll',
  'Technical / Bug Report', 'Feature Request', 'Data Export / Migration', 'Other',
] as const;

const ALLOWED_ATTACHMENT_MIME = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/(plain|csv)|application\/(vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.ms-excel|zip|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 30 * 1024 * 1024;

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  dataBase64: z.string(),
});

const ticketSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  company: z.string().trim().max(200).optional(),
  subject: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORY_VALUES),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  message: z.string().trim().min(20).max(8000),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

function generateRef(): string {
  const now = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HUB-${now}-${rand}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] || c);
}

/**
 * The public "Contact support" form at /support-ticket — reachable signed
 * out, so there is no tenant to file a real platform_support_tickets row
 * under (that table, and platform-support.routes.ts's authenticated
 * /tickets, are for a signed-in tenant admin asking Hudumika for help from
 * inside the app — a different case, with a real tenant_id to scope to).
 * This relays straight into a real inbox instead: no persistent storage for
 * the submission or its attachments — they're read into memory, attached to
 * one outgoing email, and discarded, so there's no tenant_id, no table, and
 * no admin-side triage UI to build for something with nothing to attach it to.
 * No auth hook in this file, deliberately — see platform-support.routes.ts,
 * which is authenticated for its whole plugin scope, for why this couldn't
 * just be one more route added there.
 */
export default async function publicSupportRoutes(fastify: FastifyInstance) {
  fastify.post('/ticket', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const parsed = ticketSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid submission.' });
    }
    const b = parsed.data;

    let totalBytes = 0;
    const attachments: { filename: string; content: Buffer }[] = [];
    for (const a of b.attachments ?? []) {
      if (!ALLOWED_ATTACHMENT_MIME.test(a.mimeType)) {
        return reply.status(415).send({ error: `"${a.filename}" isn't an accepted file type.` });
      }
      let buf: Buffer;
      try { buf = Buffer.from(a.dataBase64, 'base64'); } catch { return reply.status(400).send({ error: `Could not read "${a.filename}".` }); }
      if (buf.length > MAX_ATTACHMENT_BYTES) {
        return reply.status(413).send({ error: `"${a.filename}" is over the 10 MB per-file limit.` });
      }
      totalBytes += buf.length;
      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        return reply.status(413).send({ error: 'Attachments together are over the 30 MB limit.' });
      }
      attachments.push({ filename: a.filename, content: buf });
    }

    const ref = generateRef();
    const bodyHtml = `
      <p><strong>Ref:</strong> ${ref}</p>
      <p><strong>From:</strong> ${escapeHtml(b.name)} &lt;${escapeHtml(b.email)}&gt;${b.company ? ` — ${escapeHtml(b.company)}` : ''}</p>
      <p><strong>Category:</strong> ${escapeHtml(b.category)} &nbsp;&nbsp; <strong>Priority:</strong> ${escapeHtml(b.priority.toUpperCase())}</p>
      <p><strong>Subject:</strong> ${escapeHtml(b.subject)}</p>
      <hr />
      <p style="white-space:pre-wrap">${escapeHtml(b.message)}</p>
    `;

    const result = await EmailIntegration.sendEmail({
      to: SUPPORT_INBOX,
      subject: `[${ref}] ${b.subject}`,
      bodyHtml,
      attachments: attachments.length ? attachments : undefined,
    });

    if (!result.success) {
      return reply.status(502).send({ error: 'Could not send your message right now. Please try again, or email support@hudumika.tz directly.' });
    }

    // The success screen tells the submitter to expect a confirmation email
    // — that line is only honest if one actually goes out. Best-effort: a
    // failure here doesn't undo a ticket that already reached support, so it
    // doesn't fail the request, just skips silently (nothing useful to show
    // the submitter about their own inbox rejecting mail either way).
    void EmailIntegration.sendEmail({
      to: b.email,
      subject: `We received your message — ${ref}`,
      bodyHtml: `
        <p>Hi ${escapeHtml(b.name)},</p>
        <p>Thanks for reaching out to Hudumika Support. Your message has been received under reference <strong>${ref}</strong> — keep it handy if you follow up.</p>
        <p><strong>Subject:</strong> ${escapeHtml(b.subject)}</p>
        <p>We'll get back to you at this address based on the priority level you selected.</p>
      `,
    }).catch(() => {});

    reply.status(201);
    return { ref };
  });
}
