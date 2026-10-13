import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ImapFlow } from 'imapflow';
import dns from 'node:dns/promises';
import { withTenant } from '../db/client.js';
import { synchronizeMailbox, queueRemotePatch } from '../services/email-sync.service.js';
import { mailDnsRecordsSchema, verifyMailDns } from '../services/onsite-email.service.js';
import { createProviderMailbox, type MailProviderConfig } from '../services/mail-provider.service.js';
import { saveWorkspaceMailProvider, resolveWorkspaceMailProvider } from '../services/workspace-mail-provider.service.js';
import { reconcileEmailHistory } from '../services/email-reconciliation.service.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

describe('Email provider and synchronization boundaries', { timeout: 60000 }, () => {
  let tenant: TestTenant, other: TestTenant, accountId: string;
  beforeAll(async () => {
    tenant = await createTestTenant(); other = await createTestTenant();
    accountId = (await withTenant(tenant.tenantId, trx => trx.insertInto('user_email_accounts')
      .values({ tenant_id: tenant.tenantId, user_id: tenant.userId }).returning('id').executeTakeFirstOrThrow())).id;
  }, 60000);
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => { await tenant?.cleanup(); await other?.cleanup(); }, 60000);

  it('backfills read mail, tracks flags and moves, then reflects remote deletions without duplicate imports', async () => {
    const liveCheck = await withTenant(tenant.tenantId, trx => trx.insertInto('email_live_checks')
      .values({ tenant_id: tenant.tenantId, user_id: tenant.userId, account_id: accountId }).returningAll().executeTakeFirstOrThrow());
    const entries: Record<string, { uid: number; flags: Set<string>; envelope: { messageId: string } }[]> = {
      INBOX: [{ uid: 1, flags: new Set(['\\Seen']), envelope: { messageId: '<sync@test>' } }], Sent: [],
    };
    let selected = 'INBOX', stores = 0;
    const client = {
      mailbox: { uidValidity: 1n, exists: 1 },
      list: async () => [{ path: 'INBOX', flags: new Set() }, { path: 'Sent', specialUse: '\\Sent', flags: new Set() }],
      getMailboxLock: async (path: string) => { selected = path; client.mailbox.exists = entries[path].length; return { release() {} }; },
      fetchAll: async () => entries[selected],
      fetchOne: async () => ({ source: Buffer.from('message') }),
      messageFlagsAdd: vi.fn(async () => true), messageFlagsRemove: vi.fn(async () => true),
    };
    const account = { id: accountId, tenantId: tenant.tenantId, userId: tenant.userId, initial: true, markAsRead: false };
    const store: Parameters<typeof synchronizeMailbox>[2] = async (_source, options) => {
      stores++;
      expect(options.automate).toBe(false);
      await withTenant(tenant.tenantId, async trx => {
        const id = randomUUID();
        await trx.insertInto('email_messages').values({ id, tenant_id: tenant.tenantId, user_id: tenant.userId, thread_id: id,
          message_id: '<sync@test>', subject: `Sync ${liveCheck.token}`, folder: options.folder, read: options.read, starred: options.starred }).execute();
        await options.onStored(trx, id);
      });
      return false;
    };
    await synchronizeMailbox(client as unknown as ImapFlow, account, store);
    await synchronizeMailbox(client as unknown as ImapFlow, account, store);
    expect(stores).toBe(1);
    entries.INBOX = [];
    entries.Sent = [{ uid: 9, flags: new Set(['\\Seen', '\\Flagged']), envelope: { messageId: '<sync@test>' } }];
    await synchronizeMailbox(client as unknown as ImapFlow, account, store);
    const moved = await withTenant(tenant.tenantId, trx => trx.selectFrom('email_messages').selectAll()
      .where('tenant_id', '=', tenant.tenantId).where('message_id', '=', '<sync@test>').executeTakeFirstOrThrow());
    expect(moved.folder).toBe('sent'); expect(moved.starred).toBe(true); expect(stores).toBe(1);
    await withTenant(tenant.tenantId, trx => trx.updateTable('email_live_checks').set({ status: 'sent', received_at: null })
      .where('tenant_id', '=', tenant.tenantId).where('id', '=', liveCheck.id).execute());
    await synchronizeMailbox(client as unknown as ImapFlow, account, store);
    expect((await withTenant(tenant.tenantId, trx => trx.selectFrom('email_live_checks').select('status')
      .where('tenant_id', '=', tenant.tenantId).where('id', '=', liveCheck.id).executeTakeFirstOrThrow())).status).toBe('sent');
    await withTenant(tenant.tenantId, trx => queueRemotePatch(trx, tenant.tenantId, tenant.userId, [moved.id], { read: false }));
    await synchronizeMailbox(client as unknown as ImapFlow, account, store);
    expect(client.messageFlagsRemove).toHaveBeenCalledWith(9, ['\\Seen'], { uid: true });
    entries.Sent = [];
    await synchronizeMailbox(client as unknown as ImapFlow, account, store);
    const deleted = await withTenant(tenant.tenantId, trx => trx.selectFrom('email_messages').select('folder')
      .where('tenant_id', '=', tenant.tenantId).where('id', '=', moved.id).executeTakeFirstOrThrow());
    expect(deleted.folder).toBe('trash');
  });

  it('stops a stale mailbox worker before it can persist an inventory', async () => {
    const client = { list: async () => [{ path: 'INBOX', flags: new Set() }], mailbox: { uidValidity: 1n, exists: 0 },
      getMailboxLock: async () => ({ release() {} }) };
    await expect(synchronizeMailbox(client as unknown as ImapFlow,
      { id: accountId, tenantId: tenant.tenantId, userId: tenant.userId, initial: false, markAsRead: false, claimToken: randomUUID() },
      async () => false)).rejects.toThrow('ownership changed');
  });

  it('compares complete provider DNS values and joins chunks within each TXT record', async () => {
    vi.spyOn(dns, 'resolveMx').mockResolvedValue([{ priority: 10, exchange: 'mail.provider.test.' }]);
    vi.spyOn(dns, 'resolveTxt').mockImplementation(async name => name.startsWith('selector.') ? [['v=DKIM1; p=', 'YWJj']] :
      name.startsWith('_dmarc.') ? [['v=DMARC1; p=reject']] : [['v=spf1 include:provider.test -all']]);
    const records = mailDnsRecordsSchema.parse([
      { name: '@', type: 'MX', value: 'mail.provider.test', priority: 10, purpose: 'mx' },
      { name: '@', type: 'TXT', value: 'v=spf1 include:provider.test -all', purpose: 'spf' },
      { name: 'selector._domainkey', type: 'TXT', value: 'v=DKIM1; p=YWJj', purpose: 'dkim' },
      { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=reject', purpose: 'dmarc' },
    ]);
    const result = await verifyMailDns('example.test', records);
    expect(result.checks.every(check => check.matched)).toBe(true);
    expect(result.dkim.selector).toBe('selector');
    const wrong = await verifyMailDns('example.test', [{ ...records[0], value: 'wrong.test' }]);
    expect(wrong.mx.found).toBe(false);
    expect((await verifyMailDns('example.test', [])).spf.found).toBe(false);
  });

  it('stores provider credentials only in their owning workspace and never returns secrets', async () => {
    const config: MailProviderConfig = { kind: 'cpanel', baseUrl: 'https://provider.test:2083', username: 'owner', apiToken: 'private-token', imapHost: 'mail.provider.test', smtpHost: 'mail.provider.test' };
    await saveWorkspaceMailProvider(tenant.tenantId, config);
    expect(await resolveWorkspaceMailProvider(other.tenantId, 'cpanel')).toBeNull();
    expect(await resolveWorkspaceMailProvider(tenant.tenantId, 'platform')).toEqual(config);
    const response = await (await getApp()).inject({ method: 'GET', url: '/v1/settings/mail-providers', headers: authHeaders(tenant.token) });
    expect(response.statusCode).toBe(200); expect(response.body).not.toContain('private-token');
    const junior = await tenant.addUser('JUNIOR');
    expect((await (await getApp()).inject({ method: 'GET', url: '/v1/settings/mail-providers', headers: authHeaders(junior.token) })).statusCode).toBe(403);
  });

  it('creates a Microsoft identity and assigns the specified Exchange license without claiming mailbox activation', async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') });
      return new Response(JSON.stringify(String(url).endsWith('/token') ? { access_token: 'admin-token' } :
        String(url).includes('/domains/') ? { isVerified: true } : String(url).endsWith('/users') ? { id: 'created-user' } : {}), { status: 200 });
    }));
    const config: MailProviderConfig = { kind: 'microsoft', directoryTenantId: randomUUID(), clientId: randomUUID(), clientSecret: 'secret', licenseSkuId: randomUUID(), usageLocation: 'TZ' };
    const created = vi.fn(async () => {});
    const result = await createProviderMailbox(config, { address: 'staff@example.test', name: 'Staff Member', password: 'long-private-password', quotaMb: null }, created);
    expect(created).toHaveBeenCalledWith('created-user'); expect(result.mailboxReady).toBe(false);
    expect(calls.some(call => call.url.endsWith('/assignLicense') && call.body.includes(config.licenseSkuId))).toBe(true);
  });

  it('reconciles historical logs idempotently without resending or inventing provider evidence', async () => {
    await withTenant(tenant.tenantId, async trx => {
      const outbox = await trx.insertInto('email_outbox').values({ tenant_id: tenant.tenantId, to_address: 'recipient@example.test', subject: 'History', body_html: 'hello', source_app: 'email', status: 'sent' }).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('comm_delivery_log').values({ tenant_id: tenant.tenantId, event_key: 'security.email.verify', recipient_email: 'recipient@example.test', recipient_type: 'TO', channel: 'EMAIL', locale: 'en', subject: 'History', status: 'queued', outbox_id: outbox.id }).execute();
    });
    const preview = await reconcileEmailHistory(tenant.tenantId);
    expect(preview.repaired).toBe(1); expect(preview.unverified).toBe(1);
    expect((await reconcileEmailHistory(other.tenantId, true)).repaired).toBe(0);
    expect((await reconcileEmailHistory(tenant.tenantId, true)).repaired).toBe(1);
    expect((await reconcileEmailHistory(tenant.tenantId, true)).repaired).toBe(0);
  });
});
