import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';
import { CMSService } from '../services/cms.service.js';
import { env } from '../config/env.js';

const labelSchema = z.object({ name: z.string().trim().min(1).max(60), color: z.string().trim().max(20).optional(), hidden: z.boolean().optional() });
const templateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  subject: z.string().max(500).optional(),
  body: z.string().max(100_000).optional(),
  // Plain-text editors legitimately serialize this as null. Accepting null
  // here keeps the wire contract aligned with the nullable database column;
  // HTML mode is validated explicitly in the handlers below.
  body_html: z.string().max(500_000).nullable().optional(),
  is_html: z.boolean().optional(),
  category: z.string().trim().min(1).max(60).optional(),
  group_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});
const groupSchema = z.object({ name: z.string().trim().min(1).max(100) });

const MAX_HTML_BYTES = 500_000;

function decodeQuotedPrintableHtml(raw: string): string {
  const encodedEquals = raw.match(/=3D/gi)?.length ?? 0;
  const softBreaks = raw.match(/=\r?\n/g)?.length ?? 0;
  if (encodedEquals < 2 || softBreaks < 1) return raw;

  const unfolded = raw.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < unfolded.length;) {
    const encodedByte = unfolded.slice(i).match(/^=([0-9a-f]{2})/i);
    if (encodedByte) {
      bytes.push(Number.parseInt(encodedByte[1], 16));
      i += 3;
      continue;
    }
    const codePoint = String.fromCodePoint(unfolded.codePointAt(i)!);
    bytes.push(...Buffer.from(codePoint, 'utf8'));
    i += codePoint.length;
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Sanitize untrusted HTML for use as an email body.
 * Allows the full set of tags a legitimate HTML email would use while
 * stripping all script execution surfaces (scripts, event handlers,
 * javascript: URLs, data: URIs on non-image tags).
 */
export function sanitizeEmailHtml(raw: string): string {
  return sanitizeHtml(decodeQuotedPrintableHtml(raw), {
    allowedTags: [
      // Document structure (needed for full .html file imports)
      'html', 'head', 'body', 'meta', 'title',
      // Block / layout
      'div', 'section', 'article', 'header', 'footer', 'main',
      'p', 'blockquote', 'pre', 'hr', 'br', 'center',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      // Inline
      'span', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
      'small', 'sub', 'sup', 'abbr', 'cite', 'code',
      // Media
      'img', 'figure', 'figcaption',
      // Tables (common in email HTML)
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      // Legacy email-safe presentational
      'font',
    ],
    allowedAttributes: {
      '*': ['style', 'class', 'id', 'dir', 'lang', 'align', 'valign',
            'width', 'height', 'bgcolor', 'color', 'border',
            'cellpadding', 'cellspacing'],
      'a': ['href', 'name', 'target', 'rel', 'title'],
      'img': ['src', 'alt', 'title', 'width', 'height', 'style'],
      'td': ['colspan', 'rowspan', 'nowrap'],
      'th': ['colspan', 'rowspan', 'scope'],
      'meta': ['charset', 'name', 'content'],
      'table': ['summary'],
    },
    // Allow http/https/mailto on links; allow data URIs only on images
    // (embedded inline images are legitimate in HTML email templates).
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowedSchemesAppliedToAttributes: ['href', 'src', 'action'],
    disallowedTagsMode: 'discard',
    // Email designs retain inline styles, while <style> blocks are removed.
    // sanitize-html flags stored style tags as an inherent XSS surface; an
    // enterprise editor should not accept that risk merely for convenience.
    allowedStyles: {},
  });
}

/**
 * Per-user email_labels (replaces the hardcoded Finance/Shipments/HR/Urgent
 * set every mailbox used to be stuck with) and email_quick_templates
 * (canned-reply/quick-response snippets for the mailbox compose window —
 * see migration 461's comment on why this is deliberately a different
 * table from email_templates, the platform's own transactional-email copy).
 */
export async function emailMetaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('email'));
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // ── Labels ──────────────────────────────────────────────────────────────
  fastify.get('/labels', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('email_labels').selectAll().where('user_id', '=', user.sub).orderBy('name', 'asc').execute());
  });

  fastify.post('/labels', async (request: any, reply) => {
    const user = request.user;
    const b = labelSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('email_labels').select('id').where('user_id', '=', user.sub).where('name', '=', b.name).executeTakeFirst();
      if (existing) return reply.status(409).send({ error: 'A label with this name already exists.' });
      const row = await trx.insertInto('email_labels').values({
        tenant_id: user.tenant_id, user_id: user.sub, name: b.name, color: b.color ?? 'teal',
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return row;
    });
  });

  // PATCH /labels/:id — renaming a label relabels every message that
  // carries it, since labels live as a plain string array on
  // email_messages, not a foreign key.
  fastify.patch('/labels/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const b = labelSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const oldRow = await trx.selectFrom('email_labels').select('name').where('id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!oldRow) return reply.status(404).send({ error: 'Label not found' });

      const patch: Record<string, any> = {};
      if (b.name !== undefined) patch.name = b.name;
      if (b.color !== undefined) patch.color = b.color;
      if (b.hidden !== undefined) patch.hidden = b.hidden;
      if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'No updatable fields provided' });

      const row = await trx.updateTable('email_labels').set(patch).where('id', '=', id).where('user_id', '=', user.sub).returningAll().executeTakeFirst();
      if (b.name !== undefined && b.name !== oldRow.name) {
        const msgs = await trx.selectFrom('email_messages').select(['id', 'labels']).where('user_id', '=', user.sub).execute();
        for (const m of msgs) {
          const arr = Array.isArray(m.labels) ? m.labels : [];
          if (arr.includes(oldRow.name)) {
            await trx.updateTable('email_messages').set({ labels: JSON.stringify(arr.map((l: string) => l === oldRow.name ? b.name : l)) }).where('id', '=', m.id).execute();
          }
        }
      }
      return row;
    });
  });

  fastify.delete('/labels/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('email_labels').where('id', '=', id).where('user_id', '=', user.sub).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Label not found' });
      // Strip the deleted label off every message that carried it — same
      // "plain string array, not a foreign key" reasoning as the rename above.
      const msgs = await trx.selectFrom('email_messages').select(['id', 'labels']).where('user_id', '=', user.sub).execute();
      for (const m of msgs) {
        const arr = Array.isArray(m.labels) ? m.labels : [];
        if (arr.includes(row.name)) {
          await trx.updateTable('email_messages').set({ labels: JSON.stringify(arr.filter((l: string) => l !== row.name)) }).where('id', '=', m.id).execute();
        }
      }
      reply.status(204);
      return null;
    });
  });

  // Template groups are personal to this mailbox user.
  fastify.get('/template-groups', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) => trx.selectFrom('email_template_groups').selectAll()
      .where('tenant_id', '=', user.tenant_id).where('scope', '=', 'personal').where('user_id', '=', user.sub)
      .orderBy('sort_order').orderBy('name').execute());
  });

  fastify.post('/template-groups', async (request: any, reply) => {
    const user = request.user; const { name } = groupSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const last = await trx.selectFrom('email_template_groups').select('sort_order').where('tenant_id', '=', user.tenant_id).where('scope', '=', 'personal').where('user_id', '=', user.sub).orderBy('sort_order', 'desc').executeTakeFirst();
      const row = await trx.insertInto('email_template_groups').values({ tenant_id: user.tenant_id, user_id: user.sub, scope: 'personal', name, sort_order: (last?.sort_order ?? -1) + 1 }).returningAll().executeTakeFirstOrThrow();
      reply.status(201); return row;
    });
  });

  fastify.patch('/template-groups/:id', async (request: any, reply) => {
    const user = request.user; const { id } = request.params as { id: string }; const { name } = groupSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.updateTable('email_template_groups').set({ name, updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('scope', '=', 'personal').where('user_id', '=', user.sub).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Template group not found' }); return row;
    });
  });

  fastify.delete('/template-groups/:id', async (request: any, reply) => {
    const user = request.user; const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('email_template_groups').where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('scope', '=', 'personal').where('user_id', '=', user.sub).returning('id').executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Template group not found' }); return reply.status(204).send();
    });
  });

  fastify.put('/template-groups/order', async (request: any) => {
    const user = request.user; const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      for (const [sort_order, id] of ids.entries()) await trx.updateTable('email_template_groups').set({ sort_order, updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('scope', '=', 'personal').where('user_id', '=', user.sub).execute();
      return { ok: true };
    });
  });

  fastify.put('/quick-templates/order', async (request: any, reply) => {
    const user = request.user; const body = z.object({ group_id: z.string().uuid().nullable(), ids: z.array(z.string().uuid()) }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      if (body.group_id) {
        const group = await trx.selectFrom('email_template_groups').select('id').where('id', '=', body.group_id).where('tenant_id', '=', user.tenant_id).where('scope', '=', 'personal').where('user_id', '=', user.sub).executeTakeFirst();
        if (!group) return reply.status(400).send({ error: 'Invalid template group' });
      }
      for (const [sort_order, id] of body.ids.entries()) await trx.updateTable('email_quick_templates').set({ group_id: body.group_id, sort_order, updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute();
      return { ok: true };
    });
  });

  // ── Quick-reply / canned-response templates ─────────────────────────────
  fastify.get('/quick-templates', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('email_quick_templates').selectAll().where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).orderBy('sort_order').orderBy('name', 'asc').execute());
  });

  // POST /quick-templates/import-html — server-side sanitize an HTML file
  // submitted from the template editor's "Import .html file" button.
  // The client reads the file and sends raw HTML; this endpoint strips all
  // script / event-handler surfaces via sanitize-html and returns the safe
  // result so the editor can preview and store it.
  fastify.post('/quick-templates/import-html', async (request: any, reply) => {
    const body = request.body as { html?: unknown };
    if (typeof body.html !== 'string' || !body.html.trim()) {
      return reply.status(400).send({ error: 'html field is required and must be a non-empty string.' });
    }
    if (Buffer.byteLength(body.html, 'utf8') > MAX_HTML_BYTES) {
      return reply.status(400).send({ error: 'HTML file too large (max 500 KB).' });
    }
    return { html: sanitizeEmailHtml(body.html) };
  });

  fastify.post('/quick-templates', async (request: any, reply) => {
    const user = request.user;
    const b = templateSchema.parse(request.body);
    if (b.is_html && !b.body_html?.trim()) {
      return reply.status(400).send({ error: 'HTML templates require a non-empty body_html.' });
    }
    if (!b.is_html && !b.body?.trim()) {
      return reply.status(400).send({ error: 'Plain-text templates require a non-empty body.' });
    }
    const sanitizedHtml = b.is_html && b.body_html ? sanitizeEmailHtml(b.body_html) : null;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('email_quick_templates').values({
        tenant_id: user.tenant_id,
        user_id: user.sub,
        name: b.name,
        subject: b.subject ?? '',
        body: b.body ?? '',
        body_html: sanitizedHtml,
        is_html: b.is_html ?? false,
        category: b.category ?? 'General',
        group_id: b.group_id ?? null,
        sort_order: b.sort_order ?? 0,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return row;
    });
  });

  fastify.put('/quick-templates/categories/rename', async (request: any, reply) => {
    const user = request.user;
    const { current_name, name } = z.object({
      current_name: z.string().trim().min(1).max(60),
      name: z.string().trim().min(1).max(60),
    }).parse(request.body);
    if (current_name === name) return { updated: 0 };
    return withTenant(user.tenant_id, async (trx) => {
      const result = await trx.updateTable('email_quick_templates')
        .set({ category: name, updated_at: new Date() })
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('category', '=', current_name)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) return reply.status(404).send({ error: 'Personal category not found' });
      return { updated: Number(result.numUpdatedRows) };
    });
  });

  fastify.patch('/quick-templates/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const b = templateSchema.partial().parse(request.body);
    if (b.is_html === true && !b.body_html?.trim()) {
      return reply.status(400).send({ error: 'HTML templates require a non-empty body_html.' });
    }
    const patch: Record<string, any> = { updated_at: new Date() };
    if (b.name !== undefined) patch.name = b.name;
    if (b.subject !== undefined) patch.subject = b.subject;
    if (b.body !== undefined) patch.body = b.body;
    if (b.is_html !== undefined) patch.is_html = b.is_html;
    if (b.body_html !== undefined) {
      patch.body_html = b.is_html && b.body_html ? sanitizeEmailHtml(b.body_html) : null;
    }
    if (b.category !== undefined) patch.category = b.category;
    if (b.group_id !== undefined) patch.group_id = b.group_id;
    if (b.sort_order !== undefined) patch.sort_order = b.sort_order;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.updateTable('email_quick_templates').set(patch).where('id', '=', id).where('user_id', '=', user.sub).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Template not found' });
      return row;
    });
  });

  fastify.delete('/quick-templates/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('email_quick_templates').where('id', '=', id).where('user_id', '=', user.sub).returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Template not found' });
      reply.status(204);
      return null;
    });
  });

  // POST /template-images — image upload for the email block builder.
  // Uses the CMS media storage pipeline (same as email-signatures) but is
  // accessible to any authenticated user, not gated by the 'onesite' CMS
  // entitlement. Returns an absolute URL so email clients can fetch the image.
  fastify.post('/template-images', async (request: any, reply) => {
    const user = request.user;
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded.' });
    if (!data.mimetype.startsWith('image/')) {
      return reply.status(400).send({ error: 'Only image files are supported.' });
    }
    const buffer = await data.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      return reply.status(413).send({ error: 'Images are limited to 5 MB.' });
    }
    const media = await CMSService.uploadMedia(
      user.tenant_id, user.sub, data.filename || 'template-image', data.mimetype, buffer,
    );
    return { url: `${env.API_BASE_URL}/v1/cms/public/media/${media.id}` };
  });
}
