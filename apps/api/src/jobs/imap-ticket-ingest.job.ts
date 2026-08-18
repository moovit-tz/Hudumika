import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import { dbPlatform, withTenant } from '../db/client.js';
import { decryptSecret } from '../services/onsite-secrets.service.js';
import { MailService } from '../services/mail.service.js';
import { createTicketRow } from '../routes/support.routes.js';
import type { TicketImapConfig } from '@hudumika/types';

// Matches the REAL support_tickets.ref_number format (support.routes.ts:
// `SUP-${4 random digits}`), not RISE's own `[#12345]` convention this
// feature was originally modeled on — the two just happen to look similar.
const TICKET_TAG_RE = /\[?#?(SUP-\d+)\]?/i;

interface EnabledTenant { tenantId: string; config: TicketImapConfig }

async function loadEnabledTenants(): Promise<EnabledTenant[]> {
  const rows = await dbPlatform.selectFrom('tenant_settings').select(['tenant_id', 'settings']).execute();
  const out: EnabledTenant[] = [];
  for (const row of rows) {
    const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    const config: TicketImapConfig | undefined = settings?.ticketImap;
    if (config?.enabled && config.host && config.user && config.pass) out.push({ tenantId: row.tenant_id, config });
  }
  return out;
}

/**
 * Daily-ops-frequency sweep: for every tenant with inbound ticket IMAP
 * enabled, connects to their mailbox, pulls unread messages, and either
 * appends them to an existing ticket (subject references a real SUP-####
 * this tenant owns) or opens a new one — reusing createTicketRow()
 * (support.routes.ts), the same insert + auto-assign + notification path a
 * human filing a ticket through the UI goes through, not a second copy.
 *
 * Deliberately does NOT auto-create a customer record for an unrecognized
 * sender — only mail from an address that already matches an existing
 * customers.email is converted into a ticket. An unmatched sender is
 * logged and skipped, not fabricated into a new "customer."
 */
export async function runImapTicketIngestJob(): Promise<void> {
  const tenants = await loadEnabledTenants();
  if (tenants.length === 0) return;

  let ticketsCreated = 0, messagesAppended = 0, skipped = 0;

  for (const { tenantId, config } of tenants) {
    try {
      await ingestForTenant(tenantId, config, (r) => {
        if (r === 'created') ticketsCreated++;
        else if (r === 'appended') messagesAppended++;
        else skipped++;
      });
    } catch (err: any) {
      console.error(`❌ IMAP ticket ingest failed for tenant ${tenantId}:`, err.message);
    }
  }

  if (ticketsCreated || messagesAppended || skipped) {
    console.log(`📥 IMAP ticket ingest — created: ${ticketsCreated}, appended: ${messagesAppended}, skipped: ${skipped}`);
  }
}

async function ingestForTenant(tenantId: string, config: TicketImapConfig, record: (r: 'created' | 'appended' | 'skipped') => void): Promise<void> {
  const client = new ImapFlow({
    host: config.host!,
    port: Number(config.port) || 993,
    secure: config.encryption !== 'none',
    auth: { user: config.user!, pass: decryptSecret(config.pass!) },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const msg of client.fetch({ seen: false }, { source: true, envelope: true, uid: true })) {
        try {
          await processMessage(tenantId, config, msg.source as Buffer, record);
        } catch (err: any) {
          console.error(`❌ IMAP ticket ingest — failed to process one message for tenant ${tenantId}:`, err.message);
          record('skipped');
        }
        if (config.markAsRead) {
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
}

/** Exported so it's directly testable against a synthetic RFC822 buffer, without a live IMAP mailbox. */
export async function processMessage(tenantId: string, config: TicketImapConfig, source: Buffer, record: (r: 'created' | 'appended' | 'skipped') => void): Promise<void> {
  const parsed = await simpleParser(source);
  const senderEmail = parsed.from?.value?.[0]?.address?.toLowerCase().trim();
  const subject = parsed.subject || '(no subject)';
  // support_messages.content is rendered as plain JSX text everywhere (React
  // auto-escapes it, so this was never an execution risk) — but an HTML-only
  // inbound email with no text part fell back to raw markup, which agents
  // saw as unreadable tag soup instead of a message. Strip tags down to text
  // for that fallback case rather than storing the source HTML verbatim.
  const content = parsed.text || (typeof parsed.html === 'string' ? sanitizeHtml(parsed.html, { allowedTags: [], allowedAttributes: {} }).trim() : '') || '';

  if (!senderEmail) { record('skipped'); return; }

  await withTenant(tenantId, async (trx) => {
    const customer = await trx.selectFrom('customers').select(['id', 'name', 'email'])
      .where('tenant_id', '=', tenantId).where('email', '=', senderEmail).executeTakeFirst();
    if (!customer) { record('skipped'); return; }

    const tagMatch = subject.match(TICKET_TAG_RE);
    const existingTicket = tagMatch
      ? await trx.selectFrom('support_tickets').select(['id', 'ref_number', 'customer_id', 'assigned_to'])
          .where('tenant_id', '=', tenantId).where('ref_number', '=', tagMatch[1].toUpperCase()).executeTakeFirst()
      : null;

    // Only append to a ticket this same customer actually owns — a subject
    // tag alone (guessable/forgeable) is never enough to attribute a
    // message to someone else's thread.
    if (existingTicket && existingTicket.customer_id === customer.id) {
      await trx.insertInto('support_messages').values({
        tenant_id: tenantId, ticket_id: existingTicket.id,
        channel: 'EMAIL', direction: 'INBOUND',
        author_id: customer.id, author_name: customer.name, author_type: 'CUSTOMER',
        content,
      }).execute();

      if (existingTicket.assigned_to) {
        await trx.insertInto('notifications').values({
          tenant_id: tenantId, user_id: existingTicket.assigned_to, app: 'bliss', type: 'support',
          title: `New email reply on ${existingTicket.ref_number}`, message: content.slice(0, 200),
          link: `/support/tickets/${existingTicket.id}`, metadata: '{}',
        } as any).execute();
      }

      record('appended');
      await MailService.enqueueTemplated(tenantId, 'support.ticket_ack', senderEmail, { ticketRef: existingTicket.ref_number }, 'imap-ingest').catch(() => {});
      return;
    }

    const ticket = await createTicketRow(trx, tenantId, {
      customerId: customer.id,
      subject,
      description: content,
      channel: 'EMAIL',
      priority: 'NORMAL',
      category: config.ticketType || 'general',
    });
    record('created');
    await MailService.enqueueTemplated(tenantId, 'support.ticket_ack', senderEmail, { ticketRef: ticket.ref_number }, 'imap-ingest').catch(() => {});
  });
}
