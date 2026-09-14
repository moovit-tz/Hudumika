import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import crypto from 'node:crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import { decryptSecret } from '../services/onsite-secrets.service.js';
import { normalizeSubjectForThread } from '../routes/email.routes.js';
import { MinioIntegration } from '../integrations/minio.js';

interface EnabledAccount {
  tenantId: string;
  userId: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  encryption: 'ssl' | 'tls' | 'none';
  markAsRead: boolean;
  spamBlocklist: string[];
}

async function loadEnabledAccounts(): Promise<EnabledAccount[]> {
  const rows = await dbPlatform.selectFrom('user_email_accounts')
    .select(['tenant_id', 'user_id', 'imap_host', 'imap_port', 'imap_user', 'imap_pass', 'imap_encryption', 'imap_mark_as_read', 'spam_blocklist'])
    .where('imap_enabled', '=', true).execute();
  const out: EnabledAccount[] = [];
  for (const r of rows) {
    if (!r.imap_host || !r.imap_user || !r.imap_pass) continue;
    out.push({
      tenantId: r.tenant_id, userId: r.user_id,
      host: r.imap_host, port: r.imap_port, user: r.imap_user, pass: r.imap_pass,
      encryption: r.imap_encryption, markAsRead: r.imap_mark_as_read,
      spamBlocklist: Array.isArray(r.spam_blocklist) ? r.spam_blocklist : [],
    });
  }
  return out;
}

/**
 * Real inbound mail for Email (apps/web EmailApp.tsx). Same shape as
 * imap-ticket-ingest.job.ts, one deliberate difference: that job polls one
 * shared tenant-wide support mailbox and fans messages out to whichever
 * customer they came from; this one polls each individual staff member's
 * own personal IMAP mailbox (user_email_accounts, opted in per user under
 * Email ▸ Settings ▸ Connect your mailbox) and inserts into that one
 * person's own inbox — matching how email_messages is already scoped
 * (user_id, not just tenant_id).
 *
 * Spam classification here is a plain rule-based check against the user's
 * own spam_blocklist (sender address / domain / subject keyword) plus one
 * basic heuristic (ALL-CAPS subject with 3+ exclamation marks) — not a
 * trained classifier, and nothing downstream should be misread as claiming
 * one.
 */
export async function runImapEmailIngestJob(): Promise<void> {
  const accounts = await loadEnabledAccounts();
  if (accounts.length === 0) return;

  let fetched = 0, spamRouted = 0, failed = 0;

  for (const account of accounts) {
    try {
      const result = await ingestForAccount(account);
      fetched += result.fetched;
      spamRouted += result.spamRouted;
      await dbPlatform.updateTable('user_email_accounts')
        .set({ last_synced_at: new Date(), last_sync_error: null })
        .where('tenant_id', '=', account.tenantId).where('user_id', '=', account.userId).execute();
    } catch (err: any) {
      failed++;
      console.error(`❌ IMAP email ingest failed for user ${account.userId}:`, err.message);
      await dbPlatform.updateTable('user_email_accounts')
        .set({ last_sync_error: err.message?.slice(0, 500) ?? 'Unknown IMAP error' })
        .where('tenant_id', '=', account.tenantId).where('user_id', '=', account.userId).execute()
        .catch(() => {});
    }
  }

  if (fetched || failed) {
    console.log(`📥 IMAP email ingest — fetched: ${fetched}, spam: ${spamRouted}, accounts failed: ${failed}`);
  }
}

function looksLikeSpam(fromEmail: string, subject: string, blocklist: string[]): boolean {
  const from = fromEmail.toLowerCase();
  const domain = from.split('@')[1] || '';
  for (const entry of blocklist) {
    const e = entry.toLowerCase().trim();
    if (!e) continue;
    if (from === e || domain === e) return true;
    if (subject.toLowerCase().includes(e)) return true;
  }
  // A minimal, honest heuristic — not a classifier: a shouty, exclamation-
  // heavy subject is a real (if crude) spam signal many simple filters use.
  const exclaim = (subject.match(/!/g) || []).length;
  const isShouty = subject.length > 6 && subject === subject.toUpperCase() && /[A-Z]/.test(subject);
  return exclaim >= 3 || (isShouty && exclaim >= 1);
}

async function ingestForAccount(account: EnabledAccount): Promise<{ fetched: number; spamRouted: number }> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.encryption !== 'none',
    auth: { user: account.user, pass: decryptSecret(account.pass) },
    logger: false,
  });

  let fetched = 0, spamRouted = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const msg of client.fetch({ seen: false }, { source: true, uid: true })) {
        try {
          const wentToSpam = await processMessage(account, msg.source as Buffer);
          fetched++;
          if (wentToSpam) spamRouted++;
        } catch (err: any) {
          console.error(`❌ IMAP email ingest — failed to process one message for user ${account.userId}:`, err.message);
        }
        if (account.markAsRead) {
          await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true }).catch(() => {});
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    client.close();
    throw err;
  }

  return { fetched, spamRouted };
}

/** Exported so it's directly testable against a synthetic RFC822 buffer, without a live IMAP mailbox. */
export async function processMessage(account: EnabledAccount, source: Buffer): Promise<boolean> {
  const parsed = await simpleParser(source);
  const fromAddr = parsed.from?.value?.[0];
  const fromEmail = fromAddr?.address?.toLowerCase().trim() || 'unknown@unknown';
  const fromName = fromAddr?.name || fromEmail;
  const subject = parsed.subject || '(no subject)';
  const content = parsed.text || (typeof parsed.html === 'string' ? sanitizeHtml(parsed.html, { allowedTags: [], allowedAttributes: {} }).trim() : '') || '';
  const toAddrs = (parsed.to && 'value' in parsed.to ? parsed.to.value : []).map(a => ({ name: a.name || a.address || '', email: a.address || '' }));

  const isSpam = looksLikeSpam(fromEmail, subject, account.spamBlocklist);

  // Real inbound attachments — mailparser hands back the actual bytes;
  // stored via the same MinioIntegration path outbound compose attachments
  // use, so a received attachment is downloadable through GET /:id/attachment
  // exactly like one this mailbox sent, not just flagged with a paperclip
  // icon and nothing behind it.
  const attachments: { storageKey: string; filename: string; size: number }[] = [];
  for (const att of parsed.attachments ?? []) {
    try {
      const up = await MinioIntegration.uploadEmailAttachment(account.tenantId, account.userId, att.filename || 'attachment', att.content);
      attachments.push({ storageKey: up.storageKey, filename: att.filename || 'attachment', size: up.size });
    } catch (err: any) {
      console.error(`❌ IMAP email ingest — failed to store an attachment for user ${account.userId}:`, err.message);
    }
  }

  // Real RFC 5322 threading — mailparser exposes messageId/references/
  // inReplyTo on every parsed message. A match against any message_id this
  // mailbox has ever sent or received (via either header) is preferred;
  // subject-normalization (normalizeSubjectForThread strips Re:/Fwd:
  // prefixes) is only the fallback for mail with no header this mailbox can
  // match — e.g. the first message from a sender who's never emailed this
  // mailbox before, or mail sent before migration 461 added message_id.
  const messageId: string | null = parsed.messageId || null;
  const rawReferences = parsed.references;
  const referenceIds = (Array.isArray(rawReferences) ? rawReferences : rawReferences ? [rawReferences] : [])
    .concat(parsed.inReplyTo ? [parsed.inReplyTo] : [])
    .filter((v, i, arr) => v && arr.indexOf(v) === i);

  return withTenant(account.tenantId, async (trx) => {
    let threadId: string | null = null;
    if (referenceIds.length) {
      const match = await trx.selectFrom('email_messages').select(['thread_id'])
        .where('user_id', '=', account.userId)
        .where('message_id', 'in', referenceIds)
        .executeTakeFirst();
      threadId = match?.thread_id ?? null;
    }
    if (!threadId) {
      const normalized = normalizeSubjectForThread(subject);
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const candidates = await trx.selectFrom('email_messages')
        .select(['thread_id', 'subject'])
        .where('user_id', '=', account.userId)
        .where('created_at', '>=', cutoff)
        .where('from_email', '=', fromEmail)
        .orderBy('created_at', 'desc')
        .execute();
      const match = candidates.find(c => normalizeSubjectForThread(c.subject) === normalized);
      threadId = match?.thread_id ?? null;
    }

    const id = crypto.randomUUID();
    await trx.insertInto('email_messages').values({
      id,
      tenant_id: account.tenantId,
      user_id: account.userId,
      folder: isSpam ? 'spam' : 'inbox',
      from_name: fromName,
      from_email: fromEmail,
      to_addresses: JSON.stringify(toAddrs),
      cc_addresses: JSON.stringify([]),
      subject,
      body: content,
      snippet: content.slice(0, 120),
      read: false,
      starred: false,
      labels: JSON.stringify([]),
      has_attachment: attachments.length > 0,
      attachments: JSON.stringify(attachments),
      message_id: messageId,
      in_reply_to_message_id: parsed.inReplyTo || null,
      references_ids: JSON.stringify(referenceIds),
      thread_id: threadId ?? id,
      created_at: parsed.date ?? new Date(),
    }).execute();
    return isSpam;
  });
}
