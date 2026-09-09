// ─── Sign app — shared notification & audit helpers ───────────────────────────
// Extracted out of sign.routes.ts so the scheduled jobs (sign-reminder.job.ts,
// sign-expiry.job.ts) and the completion-time PDF/anchor pipeline can reuse
// the exact same email-building and event-logging logic the routes use —
// one code path for "what does a signing invite/reminder email say" and
// "how does an event get logged", not a second copy that could drift.

import crypto from 'crypto';
import type { Kysely, Transaction } from 'kysely';
import { type Database } from '../db/client.js';
import { MailService } from './mail.service.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { SmsIntegration } from '../integrations/sms.js';
import { NotificationService } from './notification.service.js';
import { resolvePublicBaseUrl } from '../routes/landed-cost-share.routes.js';
import QRCode from 'qrcode';

export type Db = Kysely<Database> | Transaction<Database>;

/**
 * Auto-creates a real task for an envelope's creator (METRICS_AND_SIGN_PLAN.md
 * §5 Phase S6 — Tasks). Same "look up or create a dedicated auto-list, then
 * insert" shape calls.routes.ts's own POST /meetings/:id/create-tasks
 * already established for "Meeting Follow-ups" — "Sign Follow-ups" here —
 * not a second task-creation code path. Links back to the envelope via
 * tasks' own real subject_type/subject_id polymorphic column (migration
 * 311), not just a free-text mention, though the note also carries a
 * human-readable reference since no UI resolves subject_type into a link
 * yet.
 *
 * Idempotent by construction at both real call sites — sign-expiry.job.ts
 * only ever revisits an envelope while status='sent' (its own header
 * explains why), and the decline handler is the one place a recipient's
 * decline is recorded — so this never needs its own dedup check; it fires
 * exactly once per real event.
 */
export async function createSignFollowUpTask(
  db: Db,
  tenantId: string,
  userId: string,
  envelopeId: string,
  title: string,
  note: string,
): Promise<void> {
  try {
    let list = await db.selectFrom('task_lists').select('id')
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('name', '=', 'Sign Follow-ups')
      .executeTakeFirst();
    let listId = list?.id;
    if (!listId) {
      const created = await db.insertInto('task_lists').values({
        id: crypto.randomUUID(), tenant_id: tenantId, user_id: userId, name: 'Sign Follow-ups', color: '#0d9488',
      }).returningAll().executeTakeFirstOrThrow();
      listId = created.id;
    }

    const siblingCount = await db.selectFrom('tasks').select(({ fn }) => fn.countAll<number>().as('count'))
      .where('list_id', '=', listId).where('deleted_at', 'is', null).executeTakeFirst();

    await db.insertInto('tasks').values({
      id: crypto.randomUUID(), tenant_id: tenantId, user_id: userId, list_id: listId,
      title, notes: note, tags: JSON.stringify([]) as unknown as string[],
      status: 'none', priority: 'medium', sort_order: Number(siblingCount?.count ?? 0),
      subject_type: 'sign_envelope', subject_id: envelopeId,
    } as any).execute();
  } catch (err) {
    // Best-effort — a task-creation failure must never break the real
    // action (an envelope expiring, a recipient declining) it's reacting to.
    console.error(`[Sign] Failed to create a follow-up task for envelope ${envelopeId}:`, (err as Error).message);
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

/** Attaches `matched_user_id` to every recipient whose real `user_id` is
 *  null but whose email matches a real platform account in this tenant —
 *  display-only, never written back to sign_recipients. A recipient only
 *  gets a genuine `user_id` when the sender explicitly picked them via
 *  EntityPicker (SignEditor.tsx); most are typed in as plain name+email,
 *  including the common case of someone sending an envelope to their own
 *  team where the email happens to match a real colleague. Without this,
 *  PersonAvatar had no id to look up for any of them and always fell back
 *  to colored initials — correct behavior for a genuine external signer,
 *  wrong for "this typed email is literally a staff account."
 *  Deliberately separate from `user_id` itself: SignEditor.tsx reads
 *  `user_id` to decide whether a recipient was an explicit EntityPicker
 *  pick, and notification.service.ts's bell delivery keys off the same
 *  real column — overwriting it here would silently turn a freeform
 *  recipient into a "linked" one the moment their email happened to match,
 *  changing both of those without anyone asking for it. */
export async function attachMatchedUserIds<T extends { user_id: string | null; email: string }>(
  db: Db, tid: string, recipients: T[]
): Promise<(T & { matched_user_id: string | null })[]> {
  const unmatchedEmails = [...new Set(
    recipients.filter(r => !r.user_id && r.email).map(r => r.email.toLowerCase())
  )];
  if (unmatchedEmails.length === 0) {
    return recipients.map(r => ({ ...r, matched_user_id: null }));
  }
  const matches = await db.selectFrom('users').select(['id', 'email'])
    .where('tenant_id', '=', tid)
    .where(({ eb, fn }) => eb(fn('lower', ['email']), 'in', unmatchedEmails))
    .execute();
  const byEmail = new Map(matches.map(u => [u.email.toLowerCase(), u.id]));
  return recipients.map(r => ({
    ...r,
    matched_user_id: r.user_id ? null : (byEmail.get(r.email?.toLowerCase()) ?? null),
  }));
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
export async function buildStampPayload(envelope: { verification_code: string | null; completed_at: Date | null; title: string }, signers: Array<{ name: string; email: string; signed_at: Date | null }>) {
  const { url: baseUrl, trusted } = resolvePublicBaseUrl();
  const code = envelope.verification_code ?? '';
  const verify_url = baseUrl ? `${baseUrl}/sign/verify/${code}` : `/sign/verify/${code}`;

  // Same trusted-base-URL gate as landed-cost-share.routes.ts's own QR —
  // withheld (not broken) when the public URL isn't configured yet.
  let qr_data_uri: string | null = null;
  if (trusted && baseUrl && code) {
    try {
      qr_data_uri = await QRCode.toDataURL(verify_url, {
        errorCorrectionLevel: 'M', margin: 1, width: 240, color: { dark: '#0d1117', light: '#FFFFFF' },
      });
    } catch (err) {
      console.error('[Sign] QR generation failed for stamp payload:', (err as Error).message);
    }
  }

  return {
    verification_code: envelope.verification_code ?? 'HSGN-UNKNOWN',
    completed_at: envelope.completed_at?.toISOString() ?? new Date().toISOString(),
    title: envelope.title,
    signers: signers.map(s => ({ name: s.name, email: s.email, signed_at: s.signed_at?.toISOString() ?? null })),
    verify_url,
    qr_data_uri,
  };
}

export async function getEnvelopeWithRelations(db: Db, id: string, tid: string) {
  const envelope = await db
    .selectFrom('sign_envelopes')
    .leftJoin('users', 'users.id', 'sign_envelopes.created_by')
    .selectAll('sign_envelopes')
    .select(['users.name as created_by_name'])
    .where('sign_envelopes.id', '=', id)
    .where('sign_envelopes.tenant_id', '=', tid)
    .executeTakeFirst();

  if (!envelope) return null;

  const recipientRows = await db
    .selectFrom('sign_recipients')
    .selectAll()
    .where('envelope_id', '=', id)
    .orderBy('sign_order', 'asc')
    .execute();
  const recipients = await attachMatchedUserIds(db, tid, recipientRows);

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

  // Version chain (migration 342) — both directions, so the detail page
  // can show "Version 2 of X" and, on the original, "superseded by Version
  // 2" without the frontend making a second round trip for either.
  const previousVersion = envelope.previous_version_id
    ? await db.selectFrom('sign_envelopes').select(['id', 'title', 'version_number'])
        .where('id', '=', envelope.previous_version_id).where('tenant_id', '=', tid).executeTakeFirst()
    : null;
  const nextVersion = await db.selectFrom('sign_envelopes').select(['id', 'title', 'version_number', 'status'])
    .where('previous_version_id', '=', id).where('tenant_id', '=', tid).executeTakeFirst();

  return { ...envelope, recipients, fields, events, previous_version: previousVersion ?? null, next_version: nextVersion ?? null };
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
