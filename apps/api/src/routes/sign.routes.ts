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
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { MinioIntegration } from '../integrations/minio.js';
import { buildSignedPdf } from '../services/sign-pdf.service.js';
import { canApplyTenantStamp } from './sign-stamps.routes.js';
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

/** A safe Content-Disposition value for a filename built from free text
 *  (an envelope title, typed by a tenant, in any script). Node's raw HTTP
 *  header setter throws ERR_INVALID_CHAR — a real 500, confirmed live — on
 *  any header value byte past U+00FF, so an em dash, an accented name, or
 *  non-Latin script in the title crashed every download of that envelope.
 *  filename= carries an ASCII-sanitized fallback (required — that's what a
 *  browser uses when it doesn't parse filename*); filename* (RFC 5987)
 *  carries the real name for the current browsers that do. */
function safeContentDisposition(disposition: 'attachment' | 'inline', filename: string): string {
  const ascii = filename.replace(/["\r\n]/g, '').replace(/[^\x20-\x7E]/g, '_');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
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

function userRole(req: FastifyRequest): string {
  return (req.user as { role: string }).role;
}

// Same allow-list shape as sign-stamps.routes.ts's STAMP_SETTINGS_ADMIN_ROLES —
// whoever can already administer this tenant's eSign settings is who can
// also see every user's documents, not a separately-configured role list.
const DOCUMENT_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

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
    const view = query.view; // 'inbox' | 'sent' | 'completed' | 'voided' | 'declined' | 'drafts' | 'all'

    // 'all' is the admin-only, tenant-wide view — every envelope any user
    // created, not just this request's own. Every other `view` value below
    // scopes to the requesting user one way or another (created_by, or "I'm
    // a recipient"); this is deliberately the one exception, so it's gated
    // here rather than trusted from the query string.
    if (view === 'all' && !DOCUMENT_ADMIN_ROLES.includes(userRole(req))) {
      return reply.status(403).send({ error: 'Only a tenant admin can view every user’s documents.' });
    }

    return withTenant(tid, async (trx) => {
      let q = trx.selectFrom('sign_envelopes').selectAll().where('tenant_id', '=', tid);

      // Drafts are a personal work-in-progress, same as Sent — scoped to
      // whoever's actually writing them, not shared tenant-wide like a
      // completed/voided/declined record would be. 'all' matches neither
      // branch below, so it skips both — that's the whole point of the
      // admin view.
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
        const inboxIds = myEnvelopes.map(r => r.envelope_id);
        // 'id' is a real UUID column — a non-UUID sentinel like '__none__'
        // fails Postgres's own type validation before the IN comparison
        // ever runs (22P02), 500ing for the ordinary case of an inbox with
        // nothing pending, rather than just returning no rows.
        if (inboxIds.length === 0) return reply.send([]);
        q = q.where('id', 'in', inboxIds);
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

      // Owner name/email — only worth fetching for the admin 'all' view;
      // every other view is already scoped to "documents I own or I'm on,"
      // so the owner is always the viewer themselves and not worth a join.
      let ownerById = new Map<string, { name: string; email: string }>();
      if (view === 'all') {
        const creatorIds = [...new Set(envelopes.map(e => e.created_by))];
        const creators = creatorIds.length
          ? await trx.selectFrom('users').select(['id', 'name', 'email']).where('id', 'in', creatorIds).execute()
          : [];
        ownerById = new Map(creators.map(c => [c.id, { name: c.name, email: c.email }]));
      }

      return reply.send(envelopes.map(e => ({
        ...e,
        recipients: byEnvelope.get(e.id) ?? [],
        ...(view === 'all' ? { owner: ownerById.get(e.created_by) ?? null } : {}),
      })));
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
      recipients: Array<{ name: string; email: string; phone?: string; user_id?: string; role_label?: string; sign_order?: number; is_certifier?: boolean; certifier_title?: string; certifier_roll_number?: string; certifier_firm?: string }>;
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
          user_id: r.user_id ?? null,
          role_label: r.role_label ?? null,
          sign_order: r.sign_order ?? i + 1,
          is_certifier: r.is_certifier ?? false,
          certifier_title: r.certifier_title?.trim() || null,
          certifier_roll_number: r.certifier_roll_number?.trim() || null,
          certifier_firm: r.certifier_firm?.trim() || null,
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
      reply.header('Content-Disposition', safeContentDisposition('attachment', `${envelope.title} - signed.pdf`));
      return reply.send(buf);
    });
  });

  // ── Update envelope (draft edits) ──────────────────────────────────────────
  fastify.put('/envelopes/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    const body = req.body as Partial<{
      title: string; message: string; order_mode: string; expires_at: string;
      file_name: string; document_data: string; file_id: string; require_otp: boolean;
      recipients: Array<{ id?: string; name: string; email: string; phone?: string; user_id?: string; role_label?: string; sign_order?: number; is_certifier?: boolean; certifier_title?: string; certifier_roll_number?: string; certifier_firm?: string }>;
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
            user_id: r.user_id ?? null,
            role_label: r.role_label ?? null,
            sign_order: r.sign_order ?? i + 1,
            is_certifier: r.is_certifier ?? false,
            certifier_title: r.certifier_title?.trim() || null,
            certifier_roll_number: r.certifier_roll_number?.trim() || null,
            certifier_firm: r.certifier_firm?.trim() || null,
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

  // ── Rename envelope ─────────────────────────────────────────────────────────
  // Unlike PUT /envelopes/:id (draft-only — it touches recipients/fields on
  // a document that hasn't gone out yet), a title is just a label: renaming
  // "Agreement" to "Q3 Vendor Agreement" after it's sent, completed, voided
  // or declined changes nothing about the document that was actually signed,
  // so this is deliberately allowed at any status.
  fastify.patch('/envelopes/:id/title', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    const { title } = (req.body ?? {}) as { title?: string };
    if (!title?.trim()) return reply.status(400).send({ error: 'Title cannot be empty' });
    return withTenant(tid, async (trx) => {
      const envelope = await trx.selectFrom('sign_envelopes').select('id')
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'Envelope not found' });
      await trx.updateTable('sign_envelopes').set({ title: title.trim() }).where('id', '=', req.params.id).execute();
      // 'renamed' isn't a real sign_event_type — the enum (migration 267) is
      // a closed, fixed list and doesn't have it; found live (a 500, caught
      // before shipping) rather than assumed. 'updated' already covers "the
      // envelope's own metadata changed" for PUT's title/message/recipient/
      // field edits, so a rename reuses it — the note carries the specifics.
      await logEvent(trx, req.params.id, tid, 'updated', { actorName: userName(req), actorEmail: userEmail(req), note: `Renamed to "${title.trim()}"` });
      return { success: true, title: title.trim() };
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

  // ── Amend a completed envelope (version chain) ──────────────────────────────
  // A completed envelope's signed PDF is final — PUT already refuses any
  // status but draft, and this route doesn't touch the original at all. It
  // instead creates a fresh draft pre-filled with the same document,
  // recipients and fields, chained back via previous_version_id, so
  // correcting a signed document loses no paper, no error record and no
  // audit trail: the original stays exactly as signed, and the correction
  // is a genuinely new envelope that goes through its own real signing.
  fastify.post('/envelopes/:id/amend', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    return withTenant(tid, async (trx) => {
      const original = await trx.selectFrom('sign_envelopes').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!original) return reply.status(404).send({ error: 'Envelope not found' });
      if (original.status !== 'completed') {
        return reply.status(409).send({ error: 'Only a completed envelope can be amended — a document that hasn’t been signed yet can just be edited directly.' });
      }
      // The original's own status stays 'completed' forever — amending it
      // doesn't change that — so the frontend hiding its "Create amended
      // version" button once a next version exists is only a UI nicety, not
      // a real guard. Confirmed live: without this check, calling amend
      // twice created two separate "Version 2" drafts with the identical
      // version_number, both chained to the same original — the version
      // chain's whole meaning (one linear history) broke the moment two
      // siblings could claim the same version number.
      const existingNextVersion = await trx.selectFrom('sign_envelopes').select('id')
        .where('previous_version_id', '=', original.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (existingNextVersion) {
        return reply.status(409).send({ error: 'This document has already been amended — continue from its existing amended version instead.' });
      }

      const originalRecipients = await trx.selectFrom('sign_recipients').selectAll()
        .where('envelope_id', '=', original.id).orderBy('sign_order', 'asc').execute();
      const originalFields = await trx.selectFrom('sign_fields').selectAll()
        .where('envelope_id', '=', original.id).execute();

      const [amended] = await trx.insertInto('sign_envelopes').values({
        tenant_id: tid,
        created_by: uid,
        title: original.title,
        message: original.message,
        file_id: original.file_id,
        file_name: original.file_name,
        document_data: original.document_data,
        order_mode: original.order_mode,
        require_otp: original.require_otp,
        previous_version_id: original.id,
        version_number: original.version_number + 1,
      }).returningAll().execute();

      const newRecipients = originalRecipients.length
        ? await trx.insertInto('sign_recipients').values(
            originalRecipients.map(r => ({
              envelope_id: amended.id,
              tenant_id: tid,
              name: r.name,
              email: r.email,
              phone: r.phone,
              user_id: r.user_id,
              role_label: r.role_label,
              sign_order: r.sign_order,
              is_certifier: r.is_certifier,
              certifier_title: r.certifier_title,
              certifier_roll_number: r.certifier_roll_number,
              certifier_firm: r.certifier_firm,
            }))
          ).returningAll().execute()
        : [];

      if (originalFields.length) {
        const recipientIdMap = new Map(originalRecipients.map((r, i) => [r.id, newRecipients[i]?.id]));
        await trx.insertInto('sign_fields').values(
          originalFields
            .filter(f => recipientIdMap.get(f.recipient_id))
            .map(f => ({
              envelope_id: amended.id,
              tenant_id: tid,
              recipient_id: recipientIdMap.get(f.recipient_id)!,
              field_type: f.field_type,
              page: f.page, x: f.x, y: f.y, width: f.width, height: f.height,
              required: f.required, placeholder: f.placeholder,
            }))
        ).execute();
      }

      await logEvent(trx, amended.id, tid, 'created', {
        actorName: userName(req), actorEmail: userEmail(req),
        note: `Started as an amendment of "${original.title}" (Version ${original.version_number})`,
      });
      await logEvent(trx, original.id, tid, 'amended', {
        actorName: userName(req), actorEmail: userEmail(req),
        note: `Superseded by Version ${amended.version_number} — this signed document is unchanged and stays on file.`,
      });

      return reply.status(201).send({ ...amended, recipients: newRecipients });
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
          await notifyRecipients(tid, { id: envelope.id, title: tmpl.name, message: null }, [recipientRow], 'invite');

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

    // A recipient tagged to a real colleague (sign_recipients.user_id, M4's
    // "sign in person" tag) gets their own saved signature offered as a
    // one-click fill instead of a blank pad every time — the same
    // sign_stamps rows their NexusHR profile (StaffDetail.tsx's Signature
    // tab) already manages. Explicit tagging via the sender's staff picker
    // is one way to get user_id set, but a sender who just types a known
    // colleague's real work email (rather than remembering to use the
    // picker) shouldn't lose this — falls back to matching the recipient's
    // own email against a real platform user in this same tenant, so any
    // genuine Hudumika user gets their saved signature offered regardless
    // of how the sender happened to add them. An external recipient whose
    // email matches nobody keeps drawing fresh, same as before.
    let savedSignature: string | null = null;
    // The tenant's actual configured company stamp (Settings ▸ E-Sign) is
    // only ever handed to a resolved colleague whose role clears the same
    // canApplyTenantStamp gate that governs applying it everywhere else in
    // the app — an anonymous external signer assigned a stamp field (a
    // form-building mistake, not a real use case) never sees the real seal
    // image over this unauthenticated endpoint; the field still renders
    // (SignPublicPage's existing generic placeholder) so the document isn't
    // silently missing content.
    let tenantStampImage: string | null = null;
    let resolvedUserId = recipient.user_id;
    if (!resolvedUserId && recipient.email) {
      const matchedByEmail = await dbPlatform.selectFrom('users').select('id')
        .where('tenant_id', '=', envelope.tenant_id).where('email', '=', recipient.email)
        .executeTakeFirst();
      resolvedUserId = matchedByEmail?.id ?? null;
    }
    if (resolvedUserId) {
      const personal = await dbPlatform.selectFrom('sign_stamps').select('image_data')
        .where('tenant_id', '=', envelope.tenant_id).where('owner_type', '=', 'user')
        .where('owner_user_id', '=', resolvedUserId)
        .orderBy('created_at', 'desc').executeTakeFirst();
      savedSignature = personal?.image_data ?? null;

      if (fields.some(f => f.field_type === 'stamp')) {
        const taggedUser = await dbPlatform.selectFrom('users').select('role')
          .where('id', '=', resolvedUserId).executeTakeFirst();
        if (taggedUser && await canApplyTenantStamp(dbPlatform, envelope.tenant_id, taggedUser.role)) {
          const tenantStamp = await dbPlatform.selectFrom('sign_stamps').select('image_data')
            .where('tenant_id', '=', envelope.tenant_id).where('owner_type', '=', 'tenant').executeTakeFirst();
          tenantStampImage = tenantStamp?.image_data ?? null;
        }
      }
    }

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
        tenant_stamp_image: tenantStampImage,
      },
      recipient: {
        id: recipient.id, name: recipient.name, email: recipient.email,
        role_label: recipient.role_label, status: recipient.status,
        phone_masked: recipient.phone ? recipient.phone.replace(/.(?=.{4})/g, '•') : null,
        otp_verified: !!recipient.otp_verified_at,
        saved_signature: savedSignature,
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
    // The signer picks how they'd rather receive the code — some numbers
    // don't reliably get SMS, and a lot of Tanzanian mobile users check
    // WhatsApp far more often. Defaults to 'sms' so the existing frontend
    // (or any older cached client) that never sends this field keeps
    // working exactly as before.
    const { channel } = (req.body ?? {}) as { channel?: 'sms' | 'whatsapp' };
    const resolvedChannel = channel === 'whatsapp' ? 'whatsapp' : 'sms';

    const recipient = await dbPlatform.selectFrom('sign_recipients').selectAll()
      .where('token', '=', req.params.token).executeTakeFirst();
    if (!recipient) return reply.status(404).send({ error: 'Signing link not found' });
    if (!recipient.phone) return reply.status(400).send({ error: 'No phone number on file for this signer — contact the sender' });

    const envelope = await dbPlatform.selectFrom('sign_envelopes').selectAll()
      .where('id', '=', recipient.envelope_id).executeTakeFirst();
    if (!envelope) return reply.status(404).send({ error: 'Document not found' });
    if (!envelope.require_otp) return reply.status(400).send({ error: 'This document does not require OTP verification' });
    if (envelope.status !== 'sent') return reply.status(409).send({ error: 'Document is not available for signing' });

    // Send before persisting the hash — a code nobody actually received
    // (SMS/WhatsApp not configured, provider error) shouldn't sit in the
    // database looking like a real pending verification.
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const message = `Your Hudumika Sign verification code is ${code}. It expires in 10 minutes.`;
    const result = resolvedChannel === 'whatsapp'
      ? await WhatsAppIntegration.sendMessage(recipient.phone, message)
      : await SmsIntegration.sendSms(envelope.tenant_id, recipient.phone, message);
    // Honest failure, matching SmsIntegration's/WhatsAppIntegration's own
    // convention — a tenant with no provider configured for the chosen
    // channel cannot silently skip the security check this route exists
    // to enforce.
    if (!result.success) {
      return reply.status(502).send({ error: result.error || `Could not send a verification code via ${resolvedChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}` });
    }

    await dbPlatform.updateTable('sign_recipients').set({
      otp_code_hash: hashOtp(code),
      otp_expires_at: new Date(Date.now() + OTP_TTL_MS),
    }).where('id', '=', recipient.id).execute();

    return reply.send({ ok: true, sent_to: recipient.phone.replace(/.(?=.{4})/g, '•'), channel: resolvedChannel });
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
    reply.header('Content-Disposition', safeContentDisposition('attachment', `${envelope.title} - signed.pdf`));
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
      // Certified True Copy (migration 342) — the whole point of a public
      // verification page for a legally certified document is confirming
      // *who* certified it and their roll number, so this surfaces
      // separately from the plain signers list above rather than making a
      // verifier cross-reference role_label text to spot the certifier.
      certification: (() => {
        const certifier = recipients.find(r => r.is_certifier);
        if (!certifier) return null;
        return {
          name: certifier.name,
          title: certifier.certifier_title || 'Advocate',
          roll_number: certifier.certifier_roll_number,
          firm: certifier.certifier_firm,
          certified: certifier.status === 'signed',
          certified_at: certifier.signed_at,
        };
      })(),
    });
  });

  // ── Download the signed PDF via its public verification code ──────────────
  fastify.get('/public/verify/:code/download', async (req: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
    const envelope = await dbPlatform.selectFrom('sign_envelopes').selectAll()
      .where('verification_code', '=', req.params.code.toUpperCase()).executeTakeFirst();
    if (!envelope || !envelope.stamped_file_url) return reply.status(404).send({ error: 'Signed document not available' });
    let buf = MinioIntegration.readFile(envelope.stamped_file_url);
    if (!buf) {
      try {
        const recipients = await dbPlatform.selectFrom('sign_recipients').selectAll()
          .where('envelope_id', '=', envelope.id).orderBy('sign_order', 'asc').execute();
        const fields = await dbPlatform.selectFrom('sign_fields').selectAll()
          .where('envelope_id', '=', envelope.id).execute();
        const events = await dbPlatform.selectFrom('sign_events').selectAll()
          .where('envelope_id', '=', envelope.id).orderBy('created_at', 'asc').execute();
        
        buf = await buildSignedPdf(envelope, recipients, fields, events);
        await MinioIntegration.uploadSignedDocument(envelope.tenant_id, envelope.id, buf);
      } catch (err) {
        console.error(`[Sign] Failed to rebuild signed PDF for envelope ${envelope.id}:`, (err as Error).message);
        return reply.status(404).send({ error: 'Signed document file not found and regeneration failed' });
      }
    }
    reply.header('Content-Type', 'application/pdf');
    const safeFilename = envelope.title.replace(/[^a-zA-Z0-9.-]/g, '_');
    reply.header('Content-Disposition', `attachment; filename="${safeFilename}_signed.pdf"`);
    return reply.send(buf);
  });
}
