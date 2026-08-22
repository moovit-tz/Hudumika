// ─── eSign routes ─────────────────────────────────────────────────────────────
// Prefix: /v1/sign
//
// Multi-tenancy: sign_* tables carry FORCE ROW LEVEL SECURITY (migration 270)
// — every authenticated route below runs inside withTenant(tenantId, ...) so
// the app.tenant_id session variable RLS keys off is actually set, on top of
// the explicit .where('tenant_id', ...) clauses that were already here. The
// public signing endpoints (/v1/sign/public/*) are unauthenticated and look
// up envelopes only via the opaque recipient token or verification code —
// never a tenant id, which would let anyone enumerate a tenant's documents —
// so they use dbPlatform (BYPASSRLS, the same narrow, audited connection
// landed-cost-share.routes.ts's own public token lookups use) instead of
// withTenant(), which would have no tenant to scope to at that point.
//
// Notifications: sending or reminding a recipient emails them their real
// signing link via MailService — "Copy Link" in the UI is a manual fallback,
// not the only way a signer ever finds out. In sequential order mode, only
// the current signer in line is ever notified; the next recipient is emailed
// automatically once the current one signs (see /public/:token/sign).
//
// Stamping: when all recipients have signed, the server applies a visual stamp
// to each page of the document (drawn as SVG-in-HTML canvas instructions) and
// marks stamp_applied = true. The stamp carries:
//   - verification_code (HSGN-XXXXXX-XXXXXX)
//   - Signer names + timestamps
//   - QR-code URL pointing to /sign/verify/:code
//
// Verification: GET /v1/sign/public/verify/:code  (no auth)
//   Anyone can look up a code and get back envelope metadata + signer list.
//   Each lookup is recorded in sign_verifications for auditability.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import type { SignTemplate } from '@hudumika/types';
import { requireEntitlement } from '../middleware/entitlement.js';
import { SmsIntegration } from '../integrations/sms.js';
import { MinioIntegration } from '../integrations/minio.js';
import { buildSignedPdf } from '../services/sign-pdf.service.js';
import {
  logEvent, buildStampPayload, getEnvelopeWithRelations, recipientsToNotify, notifyRecipients,
} from '../services/sign-notify.service.js';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Same plain-sha256 approach hashApiKey (middleware/auth.ts) uses — a
 *  6-digit OTP is short-lived (10 min) and this route is the only place
 *  that ever checks it, so a slow KDF (bcrypt/argon2) buys nothing a TTL
 *  doesn't already provide. */
const OTP_TTL_MS = 10 * 60 * 1000;
function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function tenantId(req: FastifyRequest): string {
  return (req.user as { tenant_id: string }).tenant_id;
}

function userId(req: FastifyRequest): string {
  return (req.user as { sub: string }).sub;
}

function userName(req: FastifyRequest): string {
  return (req.user as { name?: string }).name ?? 'Unknown';
}

function userEmail(req: FastifyRequest): string {
  return (req.user as { email?: string }).email ?? '';
}

// ── authenticated routes ──────────────────────────────────────────────────────

export async function signRoutes(fastify: FastifyInstance) {
  // All authenticated routes require a valid JWT and a tenant plan that includes Sign.
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('sign'));

  // ── List envelopes (inbox + sent) ──────────────────────────────────────────
  fastify.get('/envelopes', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const query = req.query as Record<string, string>;
    const status = query.status;
    const view = query.view; // 'inbox' | 'sent' | 'completed' | 'voided' | 'declined' | 'drafts'

    return withTenant(tid, async (trx) => {
      let q = trx.selectFrom('sign_envelopes').selectAll().where('tenant_id', '=', tid);

      // Drafts are a personal work-in-progress, same as Sent — scoped to
      // whoever's actually writing them, not shared tenant-wide like a
      // completed/voided/declined record would be.
      if (view === 'sent' || view === 'drafts') q = q.where('created_by', '=', uid);
      if (view === 'inbox') {
        // Envelopes where the current user is a recipient who hasn't signed yet
        const myEnvelopes = await trx
          .selectFrom('sign_recipients')
          .select('envelope_id')
          .where('tenant_id', '=', tid)
          .where('email', '=', userEmail(req))
          .where('status', 'in', ['pending', 'viewed'])
          .execute();
        const ids = myEnvelopes.map(r => r.envelope_id);
        q = q.where('id', 'in', ids.length ? ids : ['__none__']);
      }
      if (status) q = q.where('status', '=', status as any);

      const envelopes = await q.orderBy('updated_at', 'desc').limit(100).execute();

      // Attach recipient counts
      const ids = envelopes.map(e => e.id);
      const recipients = ids.length ? await trx
        .selectFrom('sign_recipients')
        .select(['envelope_id', 'status', 'name'])
        .where('envelope_id', 'in', ids)
        .execute() : [];

      const byEnvelope = new Map<string, typeof recipients>();
      for (const r of recipients) {
        const arr = byEnvelope.get(r.envelope_id) ?? [];
        arr.push(r);
        byEnvelope.set(r.envelope_id, arr);
      }

      return reply.send(envelopes.map(e => ({ ...e, recipients: byEnvelope.get(e.id) ?? [] })));
    });
  });

  // ── Create envelope ────────────────────────────────────────────────────────
  fastify.post('/envelopes', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const body = req.body as {
      title: string;
      message?: string;
      file_id?: string;
      file_name?: string;
      document_data?: string;
      order_mode?: string;
      expires_at?: string;
      require_otp?: boolean;
      recipients: Array<{ name: string; email: string; phone?: string; role_label?: string; sign_order?: number }>;
      fields?: Array<{ recipient_index: number; field_type: string; page: number; x: number; y: number; width: number; height: number; required?: boolean; placeholder?: string }>;
    };

    if (!body.title?.trim()) return reply.status(400).send({ error: 'Title is required' });
    if (!body.recipients?.length) return reply.status(400).send({ error: 'At least one recipient is required' });
    if (body.require_otp && body.recipients.some(r => !r.phone?.trim())) {
      return reply.status(400).send({ error: 'Every recipient needs a phone number when SMS verification is required' });
    }

    return withTenant(tid, async (trx) => {
      // Insert envelope
      const [envelope] = await trx.insertInto('sign_envelopes').values({
        tenant_id: tid,
        created_by: uid,
        title: body.title.trim(),
        message: body.message ?? null,
        file_id: body.file_id ?? null,
        file_name: body.file_name ?? null,
        document_data: body.document_data ?? null,
        order_mode: body.order_mode ?? 'sequential',
        require_otp: body.require_otp ?? false,
        expires_at: body.expires_at ? new Date(body.expires_at) : null,
      }).returningAll().execute();

      // Insert recipients
      const recipientRows = await trx.insertInto('sign_recipients').values(
        body.recipients.map((r, i) => ({
          envelope_id: envelope.id,
          tenant_id: tid,
          name: r.name,
          email: r.email,
          phone: r.phone?.trim() || null,
          role_label: r.role_label ?? null,
          sign_order: r.sign_order ?? i + 1,
        }))
      ).returningAll().execute();

      // Insert fields if provided
      if (body.fields?.length) {
        await trx.insertInto('sign_fields').values(
          body.fields.map(f => ({
            envelope_id: envelope.id,
            tenant_id: tid,
            recipient_id: recipientRows[f.recipient_index]?.id ?? recipientRows[0].id,
            field_type: f.field_type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            required: f.required ?? true,
            placeholder: f.placeholder ?? null,
          }))
        ).execute();
      }

      await logEvent(trx, envelope.id, tid, 'created', { actorName: userName(req), actorEmail: userEmail(req) });

      return reply.status(201).send({ ...envelope, recipients: recipientRows });
    });
  });

  // ── Get envelope detail ────────────────────────────────────────────────────
  fastify.get('/envelopes/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const data = await getEnvelopeWithRelations(trx, req.params.id, tid);
      if (!data) return reply.status(404).send({ error: 'Envelope not found' });
      return reply.send(data);
    });
  });

  // ── Download the final stamped PDF ─────────────────────────────────────────
  fastify.get('/envelopes/:id/download', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const envelope = await trx.selectFrom('sign_envelopes').select(['title', 'stamped_file_url'])
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'Envelope not found' });
      if (!envelope.stamped_file_url) return reply.status(404).send({ error: 'This document has not been signed yet' });
      const buf = MinioIntegration.readFile(envelope.stamped_file_url);
      if (!buf) return reply.status(404).send({ error: 'Signed document file not found' });
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${envelope.title.replace(/["\r\n]/g, '')} — signed.pdf"`);
      return reply.send(buf);
    });
  });

  // ── Update envelope (draft edits) ──────────────────────────────────────────
  fastify.put('/envelopes/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    const body = req.body as Partial<{
      title: string; message: string; order_mode: string; expires_at: string;
      file_name: string; document_data: string; file_id: string; require_otp: boolean;
      recipients: Array<{ id?: string; name: string; email: string; phone?: string; role_label?: string; sign_order?: number }>;
      fields: Array<{ recipient_index: number; field_type: string; page: number; x: number; y: number; width: number; height: number; required?: boolean; placeholder?: string }>;
    }>;

    return withTenant(tid, async (trx) => {
      const envelope = await trx.selectFrom('sign_envelopes').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'Envelope not found' });
      if (envelope.status !== 'draft') return reply.status(409).send({ error: 'Only draft envelopes can be edited' });

      const requireOtp = body.require_otp ?? envelope.require_otp;
      const finalRecipients = body.recipients ?? await trx.selectFrom('sign_recipients').select(['phone']).where('envelope_id', '=', req.params.id).execute();
      if (requireOtp && finalRecipients.some(r => !r.phone?.trim())) {
        return reply.status(400).send({ error: 'Every recipient needs a phone number when SMS verification is required' });
      }

      await trx.updateTable('sign_envelopes').set({
        title: body.title ?? envelope.title,
        message: body.message ?? envelope.message,
        order_mode: body.order_mode ?? envelope.order_mode,
        require_otp: requireOtp,
        expires_at: body.expires_at ? new Date(body.expires_at) : envelope.expires_at,
        file_name: body.file_name ?? envelope.file_name,
        document_data: body.document_data ?? envelope.document_data,
        file_id: body.file_id ?? envelope.file_id,
      }).where('id', '=', req.params.id).execute();

      // Recipients as they stand right now — used below to resolve each
      // field's recipient_index if body.fields arrives without a fresh
      // body.recipients alongside it (the one real caller always sends both
      // together, but this endpoint's own Partial<> signature promises a
      // real partial update, so a fields-only caller still resolves
      // correctly against whoever is already on the envelope).
      let recipientRows = await trx.selectFrom('sign_recipients').selectAll()
        .where('envelope_id', '=', req.params.id).orderBy('sign_order', 'asc').execute();

      // Replace recipients if provided — capturing the freshly-inserted
      // rows' real ids is the fix: the previous version deleted+reinserted
      // recipients without ever capturing their new ids, so a field placed
      // on an existing draft had no valid recipient_id to send back — the
      // client sent an empty string, which the NOT NULL uuid column
      // rejected outright on every save of an already-created draft.
      if (body.recipients) {
        await trx.deleteFrom('sign_recipients').where('envelope_id', '=', req.params.id).execute();
        recipientRows = await trx.insertInto('sign_recipients').values(
          body.recipients.map((r, i) => ({
            envelope_id: req.params.id,
            tenant_id: tid,
            name: r.name,
            email: r.email,
            phone: r.phone?.trim() || null,
            role_label: r.role_label ?? null,
            sign_order: r.sign_order ?? i + 1,
          }))
        ).returningAll().execute();
      }

      // Replace fields if provided — resolves recipient_index -> the real
      // recipient id, the same way POST /envelopes already does, instead of
      // trusting a recipient_id the client can't actually know in advance.
      if (body.fields) {
        await trx.deleteFrom('sign_fields').where('envelope_id', '=', req.params.id).execute();
        if (body.fields.length) {
          await trx.insertInto('sign_fields').values(
            body.fields.map(f => ({
              envelope_id: req.params.id,
              tenant_id: tid,
              recipient_id: recipientRows[f.recipient_index]?.id ?? recipientRows[0]?.id,
              field_type: f.field_type,
              page: f.page, x: f.x, y: f.y, width: f.width, height: f.height,
              required: f.required ?? true,
              placeholder: f.placeholder ?? null,
            }))
          ).execute();
        }
      }

      await logEvent(trx, req.params.id, tid, 'updated', { actorName: userName(req), actorEmail: userEmail(req) });
      const updated = await getEnvelopeWithRelations(trx, req.params.id, tid);
      return reply.send(updated);
    });
  });

  // ── Send envelope ──────────────────────────────────────────────────────────
  fastify.post('/envelopes/:id/send', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const envelope = await trx.selectFrom('sign_envelopes').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'Envelope not found' });
      if (envelope.status !== 'draft') return reply.status(409).send({ error: 'Envelope has already been sent' });

      const recipients = await trx.selectFrom('sign_recipients').selectAll()
        .where('envelope_id', '=', req.params.id).orderBy('sign_order', 'asc').execute();
      if (!recipients.length) return reply.status(400).send({ error: 'No recipients on this envelope' });

      await trx.updateTable('sign_envelopes').set({ status: 'sent', sent_at: new Date() })
        .where('id', '=', req.params.id).execute();

      await logEvent(trx, req.params.id, tid, 'sent', {
        actorName: userName(req), actorEmail: userEmail(req),
        note: `Sent to ${recipients.length} recipient(s)`,
      });

      // Real signing-link emails — "Copy Link" in the UI is a manual
      // fallback, not the only way a recipient ever learns they have a
      // document to sign. Sequential mode only notifies whoever is
      // currently first in line; the rest are emailed as their turn comes
      // (see /public/:token/sign's own notifyRecipients call below).
      await notifyRecipients(tid, envelope, recipientsToNotify(recipients, envelope.order_mode), 'invite');

      // Each recipient gets a unique signing link via their token
      const data = await getEnvelopeWithRelations(trx, req.params.id, tid);
      return reply.send({
        ...data,
        signing_links: (data?.recipients ?? []).map(r => ({
          recipient_id: r.id,
          name: r.name,
          email: r.email,
          signing_url: `/sign/public/${r.token}`,
        })),
      });
    });
  });

  // ── Remind recipients ──────────────────────────────────────────────────────
  fastify.post('/envelopes/:id/remind', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const envelope = await trx.selectFrom('sign_envelopes').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'Envelope not found' });
      if (envelope.status !== 'sent') return reply.status(409).send({ error: 'Only sent envelopes can be reminded' });

      const recipients = await trx.selectFrom('sign_recipients').selectAll()
        .where('envelope_id', '=', req.params.id).orderBy('sign_order', 'asc').execute();
      const toNotify = recipientsToNotify(recipients, envelope.order_mode);
      if (!toNotify.length) return reply.status(400).send({ error: 'No pending signers to remind' });

      await notifyRecipients(tid, envelope, toNotify, 'reminder');
      await logEvent(trx, req.params.id, tid, 'reminded', {
        actorName: userName(req), actorEmail: userEmail(req),
        note: `Reminded ${toNotify.map(r => r.name).join(', ')}`,
      });
      return reply.send({ ok: true, reminded: toNotify.map(r => ({ name: r.name, email: r.email })) });
    });
  });

  // ── Void envelope ──────────────────────────────────────────────────────────
  fastify.delete('/envelopes/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    const body = req.body as { reason?: string } | undefined;
    return withTenant(tid, async (trx) => {
      const envelope = await trx.selectFrom('sign_envelopes').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'Envelope not found' });

      if (envelope.status === 'completed') {
        return reply.status(409).send({ error: 'Completed envelopes cannot be voided' });
      }

      await trx.updateTable('sign_envelopes').set({
        status: 'voided', voided_at: new Date(), void_reason: body?.reason ?? null,
      }).where('id', '=', req.params.id).execute();

      await logEvent(trx, req.params.id, tid, 'voided', {
        actorName: userName(req), actorEmail: userEmail(req), note: body?.reason ?? undefined,
      });
      return reply.send({ ok: true });
    });
  });

  // ── Templates ──────────────────────────────────────────────────────────────
  fastify.get('/templates', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const templates = await trx.selectFrom('sign_templates').selectAll()
        .where('tenant_id', '=', tid)
        .orderBy('created_at', 'desc')
        .execute();
      return reply.send(templates);
    });
  });

  fastify.get('/templates/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const tmpl = await trx.selectFrom('sign_templates').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!tmpl) return reply.status(404).send({ error: 'Template not found' });
      return reply.send(tmpl);
    });
  });

  fastify.post('/templates', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const body = req.body as Partial<SignTemplate>;
    return withTenant(tid, async (trx) => {
      const [tmpl] = await trx.insertInto('sign_templates').values({
        tenant_id: tid,
        created_by: userId(req),
        name: body.name ?? 'Untitled Template',
        description: body.description ?? null,
        fields: JSON.stringify(body.fields ?? []),
        recipients: JSON.stringify(body.recipients ?? []),
        file_id: body.file_id ?? null,
        file_name: body.file_name ?? null,
      }).returningAll().execute();
      return reply.status(201).send(tmpl);
    });
  });

  fastify.delete('/templates/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      await trx.deleteFrom('sign_templates')
        .where('id', '=', req.params.id)
        .where('tenant_id', '=', tid)
        .execute();
      return reply.send({ ok: true });
    });
  });

  // ── Bulk send: one template, many recipients, one independent envelope
  // per recipient — DocuSign's real bulk-send shape (a list mapped onto a
  // template), distinct from a single envelope's own multiple recipients
  // (that's sequential/parallel routing, already real). Each row becomes
  // the sole signer (sign_order 1) of its own envelope; a template with
  // more than one recipient in its own definition only really describes a
  // single-signer document for this purpose, matching the realistic
  // bulk-send use case (a single form sent to many different people).
  fastify.post('/templates/:id/bulk-send', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const body = req.body as { recipients: Array<{ name: string; email: string; phone?: string; role_label?: string }> };
    if (!body.recipients?.length) return reply.status(400).send({ error: 'At least one recipient is required' });

    return withTenant(tid, async (trx) => {
      const tmpl = await trx.selectFrom('sign_templates').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!tmpl) return reply.status(404).send({ error: 'Template not found' });

      const templateFields = (tmpl.fields ?? []) as Array<{ field_type: string; page: number; x: number; y: number; width: number; height: number; required?: boolean; placeholder?: string | null }>;

      const results: Array<{ email: string; ok: boolean; envelope_id?: string; error?: string }> = [];

      for (const row of body.recipients) {
        try {
          if (!row.name?.trim() || !row.email?.trim()) throw new Error('Name and email are required');

          const [envelope] = await trx.insertInto('sign_envelopes').values({
            tenant_id: tid, created_by: uid, title: tmpl.name,
            file_id: tmpl.file_id, file_name: tmpl.file_name,
            order_mode: 'sequential',
          }).returningAll().execute();

          const [recipientRow] = await trx.insertInto('sign_recipients').values({
            envelope_id: envelope.id, tenant_id: tid, name: row.name.trim(), email: row.email.trim(),
            phone: row.phone?.trim() || null, role_label: row.role_label ?? null, sign_order: 1,
          }).returningAll().execute();

          if (templateFields.length) {
            await trx.insertInto('sign_fields').values(
              templateFields.map(f => ({
                envelope_id: envelope.id, tenant_id: tid, recipient_id: recipientRow.id,
                field_type: f.field_type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height,
                required: f.required ?? true, placeholder: f.placeholder ?? null,
              }))
            ).execute();
          }

          await logEvent(trx, envelope.id, tid, 'created', {
            actorName: userName(req), actorEmail: userEmail(req), note: `Bulk sent from template "${tmpl.name}"`,
          });
          await trx.updateTable('sign_envelopes').set({ status: 'sent', sent_at: new Date() }).where('id', '=', envelope.id).execute();
          await logEvent(trx, envelope.id, tid, 'sent', { actorName: userName(req), actorEmail: userEmail(req), note: 'Sent to 1 recipient(s)' });
          await notifyRecipients(tid, { title: tmpl.name, message: null }, [recipientRow], 'invite');

          results.push({ email: row.email, ok: true, envelope_id: envelope.id });
        } catch (err) {
          results.push({ email: row.email, ok: false, error: err instanceof Error ? err.message : 'Failed to send' });
        }
      }

      return reply.send({ results, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
    });
  });
}

// ── Public signing routes (no auth) ──────────────────────────────────────────

export async function signPublicRoutes(fastify: FastifyInstance) {

  // ── Get signing data by token ──────────────────────────────────────────────
  fastify.get('/public/:token', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const recipient = await dbPlatform.selectFrom('sign_recipients').selectAll()
      .where('token', '=', req.params.token).executeTakeFirst();
    if (!recipient) return reply.status(404).send({ error: 'Signing link not found or expired' });

    const envelope = await dbPlatform.selectFrom('sign_envelopes').selectAll()
      .where('id', '=', recipient.envelope_id).executeTakeFirst();
    if (!envelope) return reply.status(404).send({ error: 'Document not found' });
    if (envelope.status === 'voided') return reply.status(410).send({ error: 'This document has been voided' });
    if (envelope.status === 'expired' || (envelope.status === 'sent' && envelope.expires_at && envelope.expires_at < new Date())) {
      return reply.status(410).send({ error: 'This document has expired and can no longer be signed' });
    }
    if (envelope.status === 'completed') return reply.status(200).send({ already_completed: true, envelope });

    const fields = await dbPlatform.selectFrom('sign_fields').selectAll()
      .where('envelope_id', '=', envelope.id)
      .where('recipient_id', '=', recipient.id)
      .execute();

    // Mark as viewed if first time
    if (!recipient.viewed_at) {
      await dbPlatform.updateTable('sign_recipients').set({ status: 'viewed', viewed_at: new Date() })
        .where('id', '=', recipient.id).execute();
      await logEvent(dbPlatform, envelope.id, envelope.tenant_id, 'viewed', {
        recipientId: recipient.id,
        actorName: recipient.name, actorEmail: recipient.email,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
    }

    // Tenant branding for this specific document — the same two plain,
    // already-public-safe columns mail-template.service.ts/email-envelope.ts
    // already read for unauthenticated/system contexts (no JSONB blob, no
    // preset lookup). An external signer sees the tenant who sent them the
    // document, not a generic Hudumika blue, the same way the rest of the
    // platform carries per-tenant branding everywhere else.
    const tenant = await dbPlatform.selectFrom('tenants').select(['logo_url', 'primary_color'])
      .where('id', '=', envelope.tenant_id).executeTakeFirst();

    // Return only safe public fields — phone is masked (last 4 digits only)
    // so the OTP gate can say where a code was sent without handing an
    // unauthenticated caller the recipient's full phone number.
    return reply.send({
      envelope: {
        id: envelope.id, title: envelope.title, message: envelope.message,
        document_data: envelope.document_data, file_name: envelope.file_name,
        status: envelope.status, order_mode: envelope.order_mode,
        expires_at: envelope.expires_at,
        verification_code: envelope.verification_code,
        require_otp: envelope.require_otp,
      },
      recipient: {
        id: recipient.id, name: recipient.name, email: recipient.email,
        role_label: recipient.role_label, status: recipient.status,
        phone_masked: recipient.phone ? recipient.phone.replace(/.(?=.{4})/g, '•') : null,
        otp_verified: !!recipient.otp_verified_at,
      },
      tenant: {
        logo_url: tenant?.logo_url ?? null,
        primary_color: tenant?.primary_color ?? null,
      },
      fields,
    });
  });

  // ── Request an SMS one-time-passcode ───────────────────────────────────────
  fastify.post('/public/:token/request-otp', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const recipient = await dbPlatform.selectFrom('sign_recipients').selectAll()
      .where('token', '=', req.params.token).executeTakeFirst();
    if (!recipient) return reply.status(404).send({ error: 'Signing link not found' });
    if (!recipient.phone) return reply.status(400).send({ error: 'No phone number on file for this signer — contact the sender' });

    const envelope = await dbPlatform.selectFrom('sign_envelopes').selectAll()
      .where('id', '=', recipient.envelope_id).executeTakeFirst();
    if (!envelope) return reply.status(404).send({ error: 'Document not found' });
    if (!envelope.require_otp) return reply.status(400).send({ error: 'This document does not require SMS verification' });
    if (envelope.status !== 'sent') return reply.status(409).send({ error: 'Document is not available for signing' });

    // Send before persisting the hash — a code nobody actually received
    // (SMS not configured, provider error) shouldn't sit in the database
    // looking like a real pending verification.
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const result = await SmsIntegration.sendSms(envelope.tenant_id, recipient.phone, `Your Hudumika Sign verification code is ${code}. It expires in 10 minutes.`);
    // Honest failure, matching SmsIntegration's own convention — a tenant
    // with no SMS provider configured cannot silently skip the security
    // check this route exists to enforce.
    if (!result.success) {
      return reply.status(502).send({ error: result.error || 'Could not send a verification code — SMS is not configured for this tenant' });
    }

    await dbPlatform.updateTable('sign_recipients').set({
      otp_code_hash: hashOtp(code),
      otp_expires_at: new Date(Date.now() + OTP_TTL_MS),
    }).where('id', '=', recipient.id).execute();

    return reply.send({ ok: true, sent_to: recipient.phone.replace(/.(?=.{4})/g, '•') });
  });

  // ── Verify an SMS one-time-passcode ─────────────────────────────────────────
  fastify.post('/public/:token/verify-otp', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const body = req.body as { code?: string };
    const recipient = await dbPlatform.selectFrom('sign_recipients').selectAll()
      .where('token', '=', req.params.token).executeTakeFirst();
    if (!recipient) return reply.status(404).send({ error: 'Signing link not found' });
    if (!recipient.otp_code_hash || !recipient.otp_expires_at) {
      return reply.status(400).send({ error: 'No verification code was requested — request a new one' });
    }
    if (recipient.otp_expires_at < new Date()) {
      return reply.status(410).send({ error: 'Verification code expired — request a new one' });
    }
    if (hashOtp((body.code ?? '').trim()) !== recipient.otp_code_hash) {
      return reply.status(401).send({ error: 'Incorrect code' });
    }

    await dbPlatform.updateTable('sign_recipients').set({
      otp_verified_at: new Date(), otp_code_hash: null, otp_expires_at: null,
    }).where('id', '=', recipient.id).execute();

    return reply.send({ ok: true });
  });

  // ── Submit signature ───────────────────────────────────────────────────────
  fastify.post('/public/:token/sign', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const body = req.body as {
      signature_data: string; // base64 PNG of drawn/typed signature
      fields: Array<{ field_id: string; value: string }>;
    };

    const recipient = await dbPlatform.selectFrom('sign_recipients').selectAll()
      .where('token', '=', req.params.token).executeTakeFirst();
    if (!recipient) return reply.status(404).send({ error: 'Signing link not found' });
    if (recipient.status === 'signed') return reply.status(409).send({ error: 'Already signed' });
    if (recipient.status === 'declined') return reply.status(409).send({ error: 'You have declined this document' });

    const envelope = await dbPlatform.selectFrom('sign_envelopes').selectAll()
      .where('id', '=', recipient.envelope_id).executeTakeFirst();
    if (!envelope || envelope.status !== 'sent') {
      return reply.status(409).send({ error: 'Document is not available for signing' });
    }
    // The scheduled sweep (sign-expiry.job.ts) is what normally flips an
    // overdue envelope to 'expired', but that job may not have run yet in
    // the minutes right after expires_at passes — this is the hard
    // guarantee nobody can sign a document past its own stated deadline.
    if (envelope.expires_at && envelope.expires_at < new Date()) {
      return reply.status(409).send({ error: 'This document has expired and can no longer be signed' });
    }
    if (envelope.require_otp && !recipient.otp_verified_at) {
      return reply.status(403).send({ error: 'SMS verification is required before signing this document' });
    }

    // Check sequential order — only the right-order recipient can sign now
    if (envelope.order_mode === 'sequential') {
      const prevUnsigned = await dbPlatform.selectFrom('sign_recipients').selectAll()
        .where('envelope_id', '=', envelope.id)
        .where('sign_order', '<', recipient.sign_order)
        .where('status', '!=', 'signed')
        .executeTakeFirst();
      if (prevUnsigned) {
        return reply.status(409).send({ error: `${prevUnsigned.name} must sign first` });
      }
    }

    // Save signature + field values
    await dbPlatform.updateTable('sign_recipients').set({
      status: 'signed',
      signature_data: body.signature_data,
      signed_at: new Date(),
      signed_ip: req.ip,
      signed_user_agent: req.headers['user-agent'] ?? null,
    }).where('id', '=', recipient.id).execute();

    // Update field values
    for (const f of (body.fields ?? [])) {
      await dbPlatform.updateTable('sign_fields').set({ value: f.value })
        .where('id', '=', f.field_id)
        .where('recipient_id', '=', recipient.id)
        .execute();
    }

    await logEvent(dbPlatform, envelope.id, envelope.tenant_id, 'signed', {
      recipientId: recipient.id,
      actorName: recipient.name, actorEmail: recipient.email,
      ipAddress: req.ip, userAgent: req.headers['user-agent'],
    });

    // Check if all recipients have now signed — if so, complete + stamp
    const allRecipients = await dbPlatform.selectFrom('sign_recipients').selectAll()
      .where('envelope_id', '=', envelope.id).orderBy('sign_order', 'asc').execute();
    const allSigned = allRecipients.every(r => r.status === 'signed' || r.id === recipient.id);

    let stampPayload = null;
    if (allSigned) {
      const now = new Date();
      await dbPlatform.updateTable('sign_envelopes').set({
        status: 'completed',
        completed_at: now,
        stamp_applied: true,
        stamped_at: now,
      }).where('id', '=', envelope.id).execute();

      await logEvent(dbPlatform, envelope.id, envelope.tenant_id, 'completed', { note: 'All recipients signed' });
      await logEvent(dbPlatform, envelope.id, envelope.tenant_id, 'stamped', { note: 'Auto-stamped on completion' });

      let updatedEnvelope = await dbPlatform.selectFrom('sign_envelopes').selectAll()
        .where('id', '=', envelope.id).executeTakeFirst();
      if (updatedEnvelope) {
        stampPayload = buildStampPayload(updatedEnvelope, allRecipients.map(r =>
          r.id === recipient.id ? { ...r, signed_at: now } : r
        ));

        // Real audit-trail-baked PDF, built and stored synchronously — this
        // is fast and entirely local (pdf-lib + disk), so it's safe to do
        // inline. The Bitcoin anchor is NOT submitted here: stampHash() is a
        // real network call to the public OpenTimestamps calendar servers,
        // and blocking the signer's own completion response on an external
        // network round-trip would be a real regression to their
        // experience regardless of whether that call is slow or fast.
        // sign-anchor-stamp.job.ts submits it shortly afterward, the same
        // "the real business action just marks the work as ready, a
        // scheduled job does the actual external call" split
        // declaration-ledger-anchor.job.ts / seal-ledger-anchor.job.ts
        // already established for their own daily stamp pass. Best-effort
        // either way — a failure here must never undo a completion the
        // signer has already seen confirmed, so it's logged, not thrown.
        try {
          const allEvents = await dbPlatform.selectFrom('sign_events').selectAll()
            .where('envelope_id', '=', envelope.id).orderBy('created_at', 'asc').execute();
          const pdfBuffer = await buildSignedPdf(updatedEnvelope, allRecipients, await dbPlatform.selectFrom('sign_fields').selectAll().where('envelope_id', '=', envelope.id).execute(), allEvents);
          const { storageKey } = await MinioIntegration.uploadSignedDocument(envelope.tenant_id, envelope.id, pdfBuffer);
          const anchorHash = createHash('sha256').update(pdfBuffer).digest('hex');

          await dbPlatform.updateTable('sign_envelopes').set({
            stamped_file_url: storageKey,
            anchor_hash: anchorHash,
          }).where('id', '=', envelope.id).execute();
          await logEvent(dbPlatform, envelope.id, envelope.tenant_id, 'verified', { note: 'Signed PDF generated — Bitcoin anchor submission queued' });

          updatedEnvelope = { ...updatedEnvelope, stamped_file_url: storageKey };
        } catch (err) {
          console.error(`[Sign] Failed to build the signed PDF for envelope ${envelope.id}:`, (err as Error).message);
        }
      }
    } else if (envelope.order_mode === 'sequential') {
      // This signer's turn is done — automatically email whoever is now
      // first in line, rather than leaving them to notice via "Copy Link".
      await notifyRecipients(envelope.tenant_id, envelope, recipientsToNotify(allRecipients, envelope.order_mode), 'invite');
    }

    return reply.send({ ok: true, completed: allSigned, stamp: stampPayload });
  });

  // ── Decline signing ────────────────────────────────────────────────────────
  fastify.post('/public/:token/decline', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const body = req.body as { reason?: string };
    const recipient = await dbPlatform.selectFrom('sign_recipients').selectAll()
      .where('token', '=', req.params.token).executeTakeFirst();
    if (!recipient) return reply.status(404).send({ error: 'Signing link not found' });

    const envelope = await dbPlatform.selectFrom('sign_envelopes').selectAll()
      .where('id', '=', recipient.envelope_id).executeTakeFirst();
    if (!envelope) return reply.status(404).send({ error: 'Document not found' });

    await dbPlatform.updateTable('sign_recipients').set({
      status: 'declined', declined_at: new Date(), decline_reason: body.reason ?? null,
    }).where('id', '=', recipient.id).execute();

    // Void the envelope since one person declined
    await dbPlatform.updateTable('sign_envelopes').set({
      status: 'declined', voided_at: new Date(), void_reason: `${recipient.name} declined: ${body.reason ?? 'No reason given'}`,
    }).where('id', '=', envelope.id).execute();

    await logEvent(dbPlatform, envelope.id, envelope.tenant_id, 'declined', {
      recipientId: recipient.id,
      actorName: recipient.name, actorEmail: recipient.email,
      ipAddress: req.ip, note: body.reason ?? undefined,
    });

    return reply.send({ ok: true });
  });

  // ── Download the signer's own signed copy (public — no auth, token-gated) ─
  fastify.get('/public/:token/download', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const recipient = await dbPlatform.selectFrom('sign_recipients').selectAll()
      .where('token', '=', req.params.token).executeTakeFirst();
    if (!recipient) return reply.status(404).send({ error: 'Signing link not found' });

    const envelope = await dbPlatform.selectFrom('sign_envelopes').select(['title', 'status', 'stamped_file_url'])
      .where('id', '=', recipient.envelope_id).executeTakeFirst();
    if (!envelope) return reply.status(404).send({ error: 'Document not found' });
    if (envelope.status !== 'completed' || !envelope.stamped_file_url) {
      return reply.status(404).send({ error: 'This document has not been completed yet' });
    }
    const buf = MinioIntegration.readFile(envelope.stamped_file_url);
    if (!buf) return reply.status(404).send({ error: 'Signed document file not found' });
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${envelope.title.replace(/["\r\n]/g, '')} — signed.pdf"`);
    return reply.send(buf);
  });

  // ── Verify by code (public — no auth) ─────────────────────────────────────
  fastify.get('/public/verify/:code', async (req: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
    const code = req.params.code.toUpperCase();

    const envelope = await dbPlatform.selectFrom('sign_envelopes').selectAll()
      .where('verification_code', '=', code).executeTakeFirst();

    // Log every lookup regardless of result — envelope_id/tenant_id are
    // nullable specifically for this "not found" case (migration 270); the
    // previous version plugged in a well-known zero-uuid that violated
    // envelope_id's foreign key on every not-found lookup, so this never
    // actually logged anything until now.
    await dbPlatform.insertInto('sign_verifications').values({
      envelope_id: envelope?.id ?? null,
      tenant_id: envelope?.tenant_id ?? null,
      verification_code: code,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] ?? null,
      result: envelope ? 'valid' : 'not_found',
    }).execute().catch(() => {}); // don't fail the request if logging fails

    if (!envelope) {
      return reply.status(404).send({ error: 'Verification code not found', code });
    }

    const recipients = await dbPlatform.selectFrom('sign_recipients').selectAll()
      .where('envelope_id', '=', envelope.id).orderBy('sign_order', 'asc').execute();

    return reply.send({
      valid: true,
      verification_code: envelope.verification_code,
      title: envelope.title,
      status: envelope.status,
      completed_at: envelope.completed_at,
      stamp_applied: envelope.stamp_applied,
      has_signed_pdf: !!envelope.stamped_file_url,
      anchor_status: envelope.anchor_status,
      anchor_block_height: envelope.anchor_block_height,
      anchor_block_time: envelope.anchor_block_time,
      signers: recipients.map(r => ({
        name: r.name,
        email: r.email,
        role_label: r.role_label,
        status: r.status,
        signed_at: r.signed_at,
      })),
    });
  });

  // ── Download the signed PDF via its public verification code ──────────────
  fastify.get('/public/verify/:code/download', async (req: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
    const envelope = await dbPlatform.selectFrom('sign_envelopes').select(['title', 'stamped_file_url'])
      .where('verification_code', '=', req.params.code.toUpperCase()).executeTakeFirst();
    if (!envelope || !envelope.stamped_file_url) return reply.status(404).send({ error: 'Signed document not available' });
    const buf = MinioIntegration.readFile(envelope.stamped_file_url);
    if (!buf) return reply.status(404).send({ error: 'Signed document file not found' });
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${envelope.title.replace(/["\r\n]/g, '')} — signed.pdf"`);
    return reply.send(buf);
  });
}
