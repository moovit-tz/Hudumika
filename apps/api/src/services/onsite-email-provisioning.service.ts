/**
 * Email provisioning — wires Onsite mailbox creation to the platform's
 * Email app.
 *
 * When provider is 'platform' and type is 'mailbox', creating a mailbox in
 * Onsite creates (or updates) a user_email_account record pre-filled with
 * IMAP/SMTP host/port settings for the platform's mail infrastructure.
 *
 * IMPORTANT: this does NOT create a real mailbox on any mail server, does
 * not generate credentials, and does not provision hosting.  The account
 * is created with imap_enabled = false so the IMAP ingestion worker won't
 * attempt to connect until real credentials are added manually (or via a
 * future provider-API integration).  The record is a placeholder that
 * saves the user from hand-typing host/port later.
 *
 * When provider is 'google' or 'microsoft', the mailbox is informational
 * only — the actual inbox lives in Workspace/365.
 */
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

interface MailboxProvisionInput {
  tenantId: string;
  mailboxId: string;
  fullAddress: string;
  displayName: string | null;
  type: string;
  provider: string;
  linkedUserId: string | null;
}

interface ProvisionResult {
  provisioned: boolean;
  accountId: string | null;
  /** When false, explains why the account isn't yet functional. */
  pendingReason?: string;
}

const PLATFORM_IMAP_HOST = process.env.MAIL_IMAP_HOST ?? '';
const PLATFORM_IMAP_PORT = Number(process.env.MAIL_IMAP_PORT ?? 993);
const PLATFORM_SMTP_HOST = process.env.MAIL_SMTP_HOST ?? '';
const PLATFORM_SMTP_PORT = Number(process.env.MAIL_SMTP_PORT ?? 465);

export async function provisionMailbox(
  trx: Transaction<Database>,
  input: MailboxProvisionInput,
): Promise<ProvisionResult> {
  if (input.type !== 'mailbox' || !input.linkedUserId) {
    return { provisioned: false, accountId: null };
  }

  if (input.provider !== 'platform') {
    return { provisioned: false, accountId: null };
  }

  if (!PLATFORM_IMAP_HOST || !PLATFORM_SMTP_HOST) {
    return { provisioned: false, accountId: null, pendingReason: 'Configure workspace mail providers, then provision this mailbox on the Mail setup page.' };
  }

  const existing = await trx.selectFrom('user_email_accounts')
    .select('id')
    .where('tenant_id', '=', input.tenantId)
    .where('user_id', '=', input.linkedUserId)
    .executeTakeFirst();

  if (existing) {
    return {
      provisioned: false,
      accountId: existing.id,
      pendingReason: 'This user already has an email account. Connect the new mailbox in Email settings without replacing the existing connection.',
    };
  }

  const created = await trx.insertInto('user_email_accounts')
    .values({
      tenant_id: input.tenantId,
      user_id: input.linkedUserId,
      imap_enabled: false,
      imap_host: PLATFORM_IMAP_HOST,
      imap_port: PLATFORM_IMAP_PORT,
      imap_user: input.fullAddress,
      imap_encryption: 'ssl',
      smtp_host: PLATFORM_SMTP_HOST,
      smtp_port: PLATFORM_SMTP_PORT,
      smtp_user: input.fullAddress,
      smtp_encryption: 'ssl',
      send_protocol: 'platform',
      from_email: input.fullAddress,
      from_name: input.displayName,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return {
    provisioned: true,
    accountId: created.id,
    pendingReason: 'Mailbox credentials must be configured before send/receive is active',
  };
}

export async function deprovisionMailbox(
  trx: Transaction<Database>,
  tenantId: string,
  linkedUserId: string,
  fullAddress: string,
): Promise<void> {
  const account = await trx.selectFrom('user_email_accounts')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', linkedUserId)
    .where('from_email', '=', fullAddress)
    .executeTakeFirst();

  if (account) {
    await trx.updateTable('user_email_accounts')
      .set({
        imap_enabled: false,
        send_protocol: 'platform',
        updated_at: new Date(),
      })
      .where('id', '=', account.id)
      .where('tenant_id', '=', tenantId)
      .execute();
  }
}
