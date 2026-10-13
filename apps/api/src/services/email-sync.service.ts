import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { withTenant } from '../db/client.js';
import type { ImapFlow, ListResponse } from 'imapflow';
import { randomUUID } from 'node:crypto';

export type RemotePatch = { read?: boolean; starred?: boolean; folder?: string; delete?: boolean };

export function localMailboxFolder(mailbox: Pick<ListResponse, 'path' | 'specialUse'>): 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash' | 'archive' {
  const roles: Record<string, 'sent' | 'drafts' | 'spam' | 'trash' | 'archive'> = {
    '\\Sent': 'sent', '\\Drafts': 'drafts', '\\Junk': 'spam', '\\Trash': 'trash', '\\Archive': 'archive', '\\All': 'archive',
  };
  return mailbox.path.toUpperCase() === 'INBOX' ? 'inbox' : roles[mailbox.specialUse ?? ''] ?? 'archive';
}

export async function queueRemotePatch(trx: Transaction<Database>, tenantId: string, userId: string, ids: string[], patch: RemotePatch) {
  if (!Object.values(patch).some(value => value !== undefined)) return;
  const refs = await trx.selectFrom('email_remote_messages').select(['id', 'desired_patch'])
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('message_id', 'in', ids)
    .where('remote_deleted', '=', false).forUpdate().execute();
  for (const ref of refs) {
    await trx.updateTable('email_remote_messages').set({ desired_patch: JSON.stringify({ ...(ref.desired_patch ?? {}), ...patch }), operation_error: null })
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('id', '=', ref.id).execute();
  }
}

interface SyncAccount { id: string; tenantId: string; userId: string; markAsRead: boolean; initial: boolean; claimToken?: string; }
type StoreSource = (source: Buffer, options: { folder: ReturnType<typeof localMailboxFolder>; read: boolean; starred: boolean; automate: boolean; onStored: (trx: Transaction<Database>, id: string) => Promise<void> }) => Promise<boolean>;

/** Metadata is inventoried completely before missing messages are considered deleted. */
export async function synchronizeMailbox(client: ImapFlow, account: SyncAccount, store: StoreSource) {
  const withAccount = <T>(work: (trx: Transaction<Database>) => Promise<T>) => withTenant(account.tenantId, async trx => {
    if (account.claimToken) {
      const owner = await trx.selectFrom('user_email_accounts').select('id')
        .where('tenant_id', '=', account.tenantId).where('id', '=', account.id)
        .where('sync_claim_token', '=', account.claimToken).where('sync_claim_until', '>', new Date()).forUpdate().executeTakeFirst();
      if (!owner) throw new Error('Mailbox sync ownership changed; this worker stopped.');
    }
    return work(trx);
  });
  const token = randomUUID();
  const folders = (await client.list()).filter(folder => !folder.flags.has('\\Noselect'));
  if (!folders.length) throw new Error('Provider returned no selectable mailboxes; the existing inventory was preserved.');
  // Gmail's All Mail repeats messages from other folders; retain it as a fallback membership.
  folders.sort((a, b) => Number(a.specialUse !== '\\All') - Number(b.specialUse !== '\\All'));
  let imported = 0;
  let incomplete = false;
  for (const folder of folders) {
    const lock = await client.getMailboxLock(folder.path);
    try {
      if (!client.mailbox) throw new Error('Mailbox did not open');
      const validity = String(client.mailbox.uidValidity);
      const inventory = client.mailbox.exists ? await client.fetchAll('1:*', { uid: true, flags: true, envelope: true }) : [];
      const refs = await withAccount(trx => trx.selectFrom('email_remote_messages').selectAll()
        .where('tenant_id', '=', account.tenantId).where('account_id', '=', account.id).where('mailbox_path', '=', folder.path).execute());
      const refByUid = new Map(refs.filter(ref => ref.uid_validity === validity).map(ref => [Number(ref.uid), ref]));
      let sources = 0;
      for (const metadata of inventory) {
        let ref = refByUid.get(metadata.uid);
        if (ref?.desired_patch) {
          try {
            const patch: RemotePatch = ref.desired_patch;
            if (patch.read !== undefined) {
              if (patch.read) await client.messageFlagsAdd(metadata.uid, ['\\Seen'], { uid: true });
              else await client.messageFlagsRemove(metadata.uid, ['\\Seen'], { uid: true });
            }
            if (patch.starred !== undefined) {
              if (patch.starred) await client.messageFlagsAdd(metadata.uid, ['\\Flagged'], { uid: true });
              else await client.messageFlagsRemove(metadata.uid, ['\\Flagged'], { uid: true });
            }
            if (patch.delete) await client.messageDelete(metadata.uid, { uid: true });
            else if (patch.folder && patch.folder !== localMailboxFolder(folder)) {
              const target = folders.find(candidate => localMailboxFolder(candidate) === patch.folder && candidate.specialUse !== '\\All');
              if (!target) throw new Error(`Provider has no ${patch.folder} folder. Create it in your mail provider before retrying.`);
              await client.messageMove(metadata.uid, target.path, { uid: true });
              // The destination may already have been inventoried during this pass.
              incomplete = true;
            }
            await withAccount(trx => trx.updateTable('email_remote_messages')
              .set({ desired_patch: null, operation_error: null, seen_token: token,
                remote_deleted: !!patch.delete || !!(patch.folder && patch.folder !== localMailboxFolder(folder)) })
              .where('tenant_id', '=', account.tenantId).where('id', '=', ref!.id)
              .where('desired_patch', '=', JSON.stringify(patch)).execute());
            // Do not overwrite local intent using flags captured before the STORE/MOVE command.
            continue;
          } catch (error) {
            await withAccount(trx => trx.updateTable('email_remote_messages')
              .set({ operation_error: error instanceof Error ? error.message : 'Remote change failed', seen_token: token })
              .where('tenant_id', '=', account.tenantId).where('id', '=', ref!.id).execute());
            incomplete = true;
            continue;
          }
        }
        const seen = metadata.flags?.has('\\Seen') ?? false;
        const starred = metadata.flags?.has('\\Flagged') ?? false;
        const saveRef = async (trx: Transaction<Database>, messageId: string | null) => {
          if (account.claimToken) {
            const owner = await trx.selectFrom('user_email_accounts').select('id')
              .where('tenant_id', '=', account.tenantId).where('id', '=', account.id)
              .where('sync_claim_token', '=', account.claimToken).where('sync_claim_until', '>', new Date()).forUpdate().executeTakeFirst();
            if (!owner) throw new Error('Mailbox sync ownership changed; this worker stopped.');
          }
          const stale = messageId ? refs.find(candidate => candidate.uid_validity !== validity && candidate.message_id === messageId && candidate.desired_patch) : undefined;
          await trx.insertInto('email_remote_messages').values({
            tenant_id: account.tenantId, account_id: account.id, user_id: account.userId,
            mailbox_path: folder.path, uid_validity: validity, uid: metadata.uid,
            message_id: messageId, seen_token: token, remote_deleted: false, desired_patch: stale ? JSON.stringify(stale.desired_patch) : null,
          }).onConflict(oc => oc.columns(['account_id', 'mailbox_path', 'uid_validity', 'uid'])
            .doUpdateSet({ seen_token: token, remote_deleted: false })).execute();
          if (stale) await trx.updateTable('email_remote_messages').set({ desired_patch: null, remote_deleted: true })
            .where('tenant_id', '=', account.tenantId).where('id', '=', stale.id).execute();
        };
        let messageId = ref?.message_id ?? null;
        let newlyStored = false;
        if (!ref) {
          const headerId = metadata.envelope?.messageId;
          if (headerId) {
            const existing = await withAccount(trx => trx.selectFrom('email_messages').select('id')
              .where('tenant_id', '=', account.tenantId).where('user_id', '=', account.userId).where('message_id', '=', headerId).executeTakeFirst());
            messageId = existing?.id ?? null;
          }
          if (messageId) await withAccount(trx => saveRef(trx, messageId));
          else {
            if (sources >= 100) { incomplete = true; continue; }
            const source = await client.fetchOne(String(metadata.uid), { source: true }, { uid: true });
            if (!source || !source.source) { incomplete = true; continue; }
            sources++;
            let stored = false;
            await store(source.source, {
              folder: localMailboxFolder(folder), read: seen, starred,
              automate: !account.initial && localMailboxFolder(folder) === 'inbox' && !seen,
              onStored: async (trx, id) => { messageId = id; stored = true; newlyStored = true; await saveRef(trx, id); },
            });
            if (!stored) await withAccount(trx => saveRef(trx, null));
            imported++;
            if (account.markAsRead && localMailboxFolder(folder) === 'inbox') await client.messageFlagsAdd(metadata.uid, ['\\Seen'], { uid: true });
          }
        } else await withAccount(trx => saveRef(trx, messageId));
        if (messageId) {
          await withAccount(async trx => {
            // Pending local changes win until they have reached the provider.
            const pending = await trx.selectFrom('email_remote_messages').select('id')
              .where('tenant_id', '=', account.tenantId).where('message_id', '=', messageId).where('desired_patch', 'is not', null).executeTakeFirst();
            if (pending) return;
            if (!newlyStored) await trx.updateTable('email_messages').set({ folder: localMailboxFolder(folder), read: seen, starred })
              .where('tenant_id', '=', account.tenantId).where('user_id', '=', account.userId).where('id', '=', messageId).execute();
            const message = await trx.selectFrom('email_messages').select('subject')
              .where('tenant_id', '=', account.tenantId).where('user_id', '=', account.userId).where('id', '=', messageId).executeTakeFirst();
            if (message && localMailboxFolder(folder) === 'inbox') {
              const checks = await trx.selectFrom('email_live_checks as c')
                .innerJoin('email_outbox as o', join => join.onRef('o.id', '=', 'c.outbox_id').on('o.tenant_id', '=', account.tenantId))
                .select(['c.id', 'c.token'])
                .where('c.tenant_id', '=', account.tenantId).where('c.user_id', '=', account.userId).where('c.account_id', '=', account.id)
                .where('c.status', 'in', ['queued', 'sent']).where('o.status', '=', 'sent').where('o.message_id', 'is not', null).execute();
              for (const check of checks) if (message.subject.includes(check.token)) {
                await trx.updateTable('email_live_checks').set({ status: 'received', received_message_id: messageId, received_at: new Date() })
                  .where('tenant_id', '=', account.tenantId).where('id', '=', check.id).execute();
              }
            }
          });
        }
      }
    } finally { lock.release(); }
  }
  if (!incomplete) await withAccount(async trx => {
    await trx.updateTable('email_remote_messages').set({ remote_deleted: true })
      .where('tenant_id', '=', account.tenantId).where('account_id', '=', account.id).where('seen_token', '!=', token).execute();
    const missing = await trx.selectFrom('email_remote_messages').select('message_id')
      .where('tenant_id', '=', account.tenantId).where('account_id', '=', account.id).where('remote_deleted', '=', true)
      .where('message_id', 'is not', null).execute();
    for (const ref of missing) {
      const alive = await trx.selectFrom('email_remote_messages').select('id')
        .where('tenant_id', '=', account.tenantId).where('account_id', '=', account.id)
        .where('message_id', '=', ref.message_id).where('remote_deleted', '=', false).executeTakeFirst();
      if (!alive) await trx.updateTable('email_messages').set({ folder: 'trash' })
        .where('tenant_id', '=', account.tenantId).where('user_id', '=', account.userId).where('id', '=', ref.message_id!).execute();
    }
  });
  return { imported, incomplete };
}
