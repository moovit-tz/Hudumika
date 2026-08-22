// ─── Sign app — shared notification & audit helpers ───────────────────────────
// Extracted out of sign.routes.ts so the scheduled jobs (sign-reminder.job.ts,
// sign-expiry.job.ts) and the completion-time PDF/anchor pipeline can reuse
// the exact same email-building and event-logging logic the routes use —
// one code path for "what does a signing invite/reminder email say" and
// "how does an event get logged", not a second copy that could drift.

import type { Kysely, Transaction } from 'kysely';
import { type Database } from '../db/client.js';
import { MailService } from './mail.service.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { SmsIntegration } from '../integrations/sms.js';
import { NotificationService } from './notification.service.js';
import { resolvePublicBaseUrl } from '../routes/landed-cost-share.routes.js';

export type Db = Kysely<Database> | Transaction<Database>;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

export async function logEvent(
  db: Db,
  envelopeId: string,
  tid: string,
  eventType: string,
  opts: {
    recipientId?: string;
    actorName?: string;
    actorEmail?: string;
    ipAddress?: string;
    userAgent?: string;
    note?: string;
  } = {}
) {
  await db.insertInto('sign_events').values({
    envelope_id: envelopeId,
    tenant_id: tid,
    event_type: eventType,
    recipient_id: opts.recipientId ?? null,
    actor_name: opts.actorName ?? null,
    actor_email: opts.actorEmail ?? null,
    ip_address: opts.ipAddress ?? null,
    user_agent: opts.userAgent ?? null,
    note: opts.note ?? null,
  }).execute();
}

/** Generate stamp HTML overlay (SVG badge) injected client-side into the document preview.
 *  Server marks stamp_applied=true and records stamped_at; the actual visual is rendered
 *  in the browser's PDF canvas overlay. This returns the stamp metadata the client uses. */
export function buildStampPayload(envelope: { verification_code: string | null; completed_at: Date | null; title: string }, signers: Array<{ name: string; email: string; signed_at: Date | null }>) {
  const { url: baseUrl } = resolvePublicBaseUrl();
  const code = envelope.verification_code ?? '';
  return {
    verification_code: envelope.verification_code ?? 'HSGN-UNKNOWN',
    completed_at: envelope.completed_at?.toISOString() ?? new Date().toISOString(),
    title: envelope.title,
    signers: signers.map(s => ({ name: s.name, email: s.email, signed_at: s.signed_at?.toISOString() ?? null })),
    verify_url: baseUrl ? `${baseUrl}/sign/verify/${code}` : `/sign/verify/${code}`,
  };
}

export async function getEnvelopeWithRelations(db: Db, id: string, tid: string) {
  const envelope = await db
    .selectFrom('sign_envelopes')
    .selectAll()
    .where('id', '=', id)
    .where('tenant_id', '=', tid)
    .executeTakeFirst();

  if (!envelope) return null;

  const recipients = await db
    .selectFrom('sign_recipients')
    .selectAll()
    .where('envelope_id', '=', id)
    .orderBy('sign_order', 'asc')
    .execute();

  const fields = await db
    .selectFrom('sign_fields')
    .selectAll()
    .where('envelope_id', '=', id)
    .execute();

  const events = await db
    .selectFrom('sign_events')
    .selectAll()
    .where('envelope_id', '=', id)
    .orderBy('created_at', 'asc')
    .execute();

  return { ...envelope, recipients, fields, events };
}

/** Which recipients should be notified right now, given the envelope's order
 *  mode. Sequential → only the earliest-order not-yet-signed recipient (the
 *  next one in line is notified automatically once the current one signs —
 *  see /public/:token/sign); parallel → everyone still pending/viewed. */
export function recipientsToNotify<R extends { status: string; sign_order: number }>(recipients: R[], orderMode: string): R[] {
  const pending = recipients.filter(r => r.status === 'pending' || r.status === 'viewed').sort((a, b) => a.sign_order - b.sign_order);
  if (!pending.length) return [];
  return orderMode === 'sequential' ? [pending[0]] : pending;
}

export function signingEmailContent(envelope: { title: string; message: string | null }, recipientName: string, signingUrl: string, kind: 'invite' | 'reminder') {
  const subject = kind === 'invite'
    ? `${envelope.title} — signature requested`
    : `Reminder: "${envelope.title}" is waiting for your signature`;
  const intro = kind === 'invite'
    ? "You've been asked to review and sign a document"
    : 'This is a reminder — a document is still waiting for your signature';
  const bodyHtml = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p>${intro}: <strong>${escapeHtml(envelope.title)}</strong>.</p>
    ${envelope.message ? `<p>${escapeHtml(envelope.message)}</p>` : ''}
    <p><a href="${signingUrl}" style="display:inline-block;padding:10px 22px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Review &amp; Sign</a></p>
    <p style="color:#64748b;font-size:12px;">If the button doesn't work, copy this link into your browser: ${signingUrl}</p>
  `;
  return { subject, bodyHtml };
}

function signingWhatsAppText(envelope: { title: string }, recipientName: string, signingUrl: string, kind: 'invite' | 'reminder') {
  const intro = kind === 'invite'
    ? `Hi ${recipientName}, you've been asked to review and sign "${envelope.title}".`
    : `Hi ${recipientName}, reminder — "${envelope.title}" is still waiting for your signature.`;
  return `${intro}\nSign here: ${signingUrl}`;
}

function signingSmsText(envelope: { title: string }, recipientName: string, signingUrl: string, kind: 'invite' | 'reminder') {
  // Kept short and plain — no markdown, no line breaks — matching how the
  // rest of the platform's own SMS sends already read (SmsIntegration has
  // no rich-text concept, unlike WhatsApp/email).
  const intro = kind === 'invite'
    ? `${recipientName}, please review and sign "${envelope.title}".`
    : `${recipientName}, reminder — "${envelope.title}" still needs your signature.`;
  return `${intro} ${signingUrl}`;
}

/** Emails each given recipient their own real signing link, and also sends
 *  it over WhatsApp and SMS when a phone number is on file — the same
 *  dual-channel pattern shipment-report.service.ts already established,
 *  now a triple channel. When a recipient is tagged to a real internal
 *  platform user (sign_recipients.user_id, set via SignEditor's "Tag a
 *  person" picker), also fires a real in-app bell notification — the one
 *  channel that only makes sense for someone who actually has a Hudumika
 *  account, unlike email/SMS/WhatsApp which work for any external signer.
 *  Every channel is best-effort per recipient — a failed send on any one
 *  of them doesn't stop the others, the other recipients, or the request
 *  that triggered this (matches this codebase's standing pattern for a
 *  notification riding on a real business action, e.g. CloudSync). */
export async function notifyRecipients(
  tid: string,
  envelope: { id: string; title: string; message: string | null },
  recipients: Array<{ name: string; email: string; token: string; phone?: string | null; user_id?: string | null }>,
  kind: 'invite' | 'reminder',
) {
  const { url: baseUrl } = resolvePublicBaseUrl();
  for (const r of recipients) {
    const signingUrl = `${baseUrl}/sign/public/${r.token}`;
    const { subject, bodyHtml } = signingEmailContent(envelope, r.name, signingUrl, kind);
    await MailService.sendNow(tid, { to: r.email, subject, bodyHtml, sourceApp: 'sign' }).catch(err => {
      console.error(`[Sign] Failed to email ${kind} to ${r.email}:`, err.message);
    });

    if (r.phone) {
      await WhatsAppIntegration.sendMessage(r.phone, signingWhatsAppText(envelope, r.name, signingUrl, kind)).catch(err => {
        console.error(`[Sign] Failed to WhatsApp ${kind} to ${r.phone}:`, err.message);
      });
      await SmsIntegration.sendSms(tid, r.phone, signingSmsText(envelope, r.name, signingUrl, kind)).catch(err => {
        console.error(`[Sign] Failed to SMS ${kind} to ${r.phone}:`, err.message);
      });
    }

    if (r.user_id) {
      const title = kind === 'invite' ? `Signature requested: ${envelope.title}` : `Reminder: ${envelope.title} still needs your signature`;
      await NotificationService.createNotification({
        tenantId: tid, userId: r.user_id, app: 'sign', type: 'task',
        title, message: envelope.message ?? undefined, link: `/sign/public/${r.token}`,
        entityType: 'sign_envelope', entityId: envelope.id, entityLabel: envelope.title,
      }).catch(err => {
        console.error(`[Sign] Failed to create in-app notification for user ${r.user_id}:`, err.message);
      });
    }
  }
}
