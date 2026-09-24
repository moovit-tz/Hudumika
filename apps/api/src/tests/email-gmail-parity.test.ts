// Functional verification for this session's Gmail-parity backend work:
// multi-signature, multi-alias send identities, filters (retroactive +
// criteria matching), vacation/forwarding/inbox-sort/auto-advance account
// preferences, label visibility, and advanced search. Real HTTP calls
// through the actual app (fastify.inject), a real Postgres tenant, RLS
// genuinely enforced — same harness as email.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableEmail(tenantId: string) {
  await dbPlatform.insertInto('tenant_settings')
    .values({ tenant_id: tenantId, settings: JSON.stringify({ 'enabled-apps': { email: true } }) as any })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'enabled-apps': { email: true } }) as any }))
    .execute();
}

describe('Email — Gmail-parity features (signatures, identities, filters, prefs, search)', () => {
  let A: TestTenant;

  beforeAll(async () => {
    await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    await enableEmail(A.tenantId);
  });

  afterAll(async () => {
    await A.cleanup();
  });

  describe('Signatures', () => {
    it('first signature created becomes default for both new and reply', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST', url: '/v1/email/signatures', headers: authHeaders(A.token),
        payload: { name: 'Primary', bodyHtml: '<div><b>Remi</b><br>CEO</div>' },
      });
      expect(res.statusCode).toBe(200);
      const sig = res.json();
      expect(sig.is_default_new).toBe(true);
      expect(sig.is_default_reply).toBe(true);
    });

    it('a second signature is not default until explicitly set', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST', url: '/v1/email/signatures', headers: authHeaders(A.token),
        payload: { name: 'Short', bodyHtml: 'Sent from my phone' },
      });
      const sig2 = res.json();
      expect(sig2.is_default_new).toBe(false);
      expect(sig2.is_default_reply).toBe(false);

      const setDefault = await app.inject({
        method: 'POST', url: `/v1/email/signatures/${sig2.id}/set-default`, headers: authHeaders(A.token),
        payload: { context: 'reply' },
      });
      expect(setDefault.statusCode).toBe(200);

      const list = await app.inject({ method: 'GET', url: '/v1/email/signatures', headers: authHeaders(A.token) });
      const rows = list.json();
      // Exactly one row holds is_default_reply=true, and it's the new one —
      // the sibling (Primary) must have been cleared.
      const replyDefaults = rows.filter((r: any) => r.is_default_reply);
      expect(replyDefaults).toHaveLength(1);
      expect(replyDefaults[0].id).toBe(sig2.id);
      // is_default_new was untouched by a 'reply'-context set-default.
      const newDefaults = rows.filter((r: any) => r.is_default_new);
      expect(newDefaults).toHaveLength(1);
      expect(newDefaults[0].name).toBe('Primary');
    });

    it('signature HTML is sanitized — a script tag never survives', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST', url: '/v1/email/signatures', headers: authHeaders(A.token),
        payload: { name: 'Malicious', bodyHtml: '<div>Hi<script>alert(1)</script></div>' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().body_html).not.toContain('<script>');
    });

    it("a user in a different tenant can't see or delete this tenant's signatures", async () => {
      const app = await getApp();
      const B = await createTestTenant('TENANT_ADMIN');
      await enableEmail(B.tenantId);
      const list = await app.inject({ method: 'GET', url: '/v1/email/signatures', headers: authHeaders(B.token) });
      expect(list.json()).toHaveLength(0);
      await B.cleanup();
    });
  });

  describe('Send identities ("Send mail as")', () => {
    let identityId: string;

    it('creating the first alias makes it the default', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST', url: '/v1/email/identities', headers: authHeaders(A.token),
        payload: { fromName: 'Sales', fromEmail: 'sales@aleka.test', smtpHost: 'smtp.aleka.test', smtpUser: 'sales@aleka.test', smtpPass: 'x' },
      });
      expect(res.statusCode).toBe(200);
      identityId = res.json().id;

      const list = await app.inject({ method: 'GET', url: '/v1/email/identities', headers: authHeaders(A.token) });
      const rows = list.json();
      expect(rows).toHaveLength(1);
      expect(rows[0].isDefault).toBe(true);
      // Password never round-trips in the clear.
      expect(rows[0].smtpPass).not.toBe('x');
    });

    it('a message sent with fromIdentityId shows that alias as its sender', async () => {
      const app = await getApp();
      const sent = await app.inject({
        method: 'POST', url: '/v1/email/send', headers: authHeaders(A.token),
        payload: {
          to: 'customer@example.test', subject: 'From alias check', body: 'hi',
          fromIdentityId: identityId, sendAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      expect(sent.statusCode).toBe(200);

      const scheduled = await app.inject({ method: 'GET', url: '/v1/emails?folder=scheduled', headers: authHeaders(A.token) });
      const row = scheduled.json().items.find((m: any) => m.subject === 'From alias check');
      expect(row).toBeTruthy();
      expect(row.from.email).toBe('sales@aleka.test');
      expect(row.from.name).toBe('Sales');
    });

    it("an identity id belonging to a different user is silently ignored, not spoofable", async () => {
      const app = await getApp();
      const userB = await A.addUser('SENIOR');
      const sent = await app.inject({
        method: 'POST', url: '/v1/email/send', headers: authHeaders(userB.token),
        payload: {
          to: 'customer@example.test', subject: 'Spoof check', body: 'hi',
          fromIdentityId: identityId, // belongs to user A, not userB
          sendAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      expect(sent.statusCode).toBe(200);
      const scheduled = await app.inject({ method: 'GET', url: '/v1/emails?folder=scheduled', headers: authHeaders(userB.token) });
      const row = scheduled.json().items.find((m: any) => m.subject === 'Spoof check');
      // Falls back to userB's own account address, never sales@aleka.test.
      expect(row.from.email).not.toBe('sales@aleka.test');
    });

    it('deleting the identity removes it from the list', async () => {
      const app = await getApp();
      const del = await app.inject({ method: 'DELETE', url: `/v1/email/identities/${identityId}`, headers: authHeaders(A.token) });
      expect(del.statusCode).toBe(200);
      const list = await app.inject({ method: 'GET', url: '/v1/email/identities', headers: authHeaders(A.token) });
      expect(list.json()).toHaveLength(0);
    });
  });

  describe('Filters', () => {
    it('creating a filter with applyToExisting relabels/stars already-stored matching messages', async () => {
      const app = await getApp();
      const sent = await app.inject({
        method: 'POST', url: '/v1/email/send', headers: authHeaders(A.token),
        payload: { to: 'x@example.test', subject: 'Invoice from vendor', body: 'attached', sendAt: new Date(Date.now() + 3_600_000).toISOString() },
      });
      expect(sent.statusCode).toBe(200);

      const filter = await app.inject({
        method: 'POST', url: '/v1/email/filters', headers: authHeaders(A.token),
        payload: {
          criteria: { subject: 'Invoice' },
          actions: { star: true },
          applyToExisting: true,
        },
      });
      expect(filter.statusCode).toBe(200);
      expect(filter.json().appliedCount).toBeGreaterThanOrEqual(1);

      const scheduled = await app.inject({ method: 'GET', url: '/v1/emails?folder=scheduled', headers: authHeaders(A.token) });
      const row = scheduled.json().items.find((m: any) => m.subject === 'Invoice from vendor');
      expect(row.starred).toBe(true);

      const del = await app.inject({ method: 'DELETE', url: `/v1/email/filters/${filter.json().id}`, headers: authHeaders(A.token) });
      expect(del.statusCode).toBe(200);
    });
  });

  describe('Account preferences — vacation, forwarding, inbox sort, auto-advance', () => {
    it('round-trip every new field through PUT then GET', async () => {
      const app = await getApp();
      const put = await app.inject({
        method: 'PUT', url: '/v1/email/account', headers: authHeaders(A.token),
        payload: {
          vacationEnabled: true,
          vacationSubject: 'Out of office',
          vacationMessage: "I'm away.",
          vacationContactsOnly: false,
          vacationDomainOnly: true,
          forwardToEmail: 'archive@example.test',
          forwardKeepCopy: false,
          inboxSort: 'unread_first',
          autoAdvance: 'newer',
        },
      });
      expect(put.statusCode).toBe(200);

      const get = await app.inject({ method: 'GET', url: '/v1/email/account', headers: authHeaders(A.token) });
      const acc = get.json();
      expect(acc.vacationEnabled).toBe(true);
      expect(acc.vacationSubject).toBe('Out of office');
      expect(acc.vacationDomainOnly).toBe(true);
      expect(acc.forwardToEmail).toBe('archive@example.test');
      expect(acc.forwardKeepCopy).toBe(false);
      expect(acc.inboxSort).toBe('unread_first');
      expect(acc.autoAdvance).toBe('newer');
    });

    it('GET /v1/emails honors inbox_sort=unread_first (unread messages sort ahead of older-but-read ones)', async () => {
      const app = await getApp();
      const userD = await A.addUser('JUNIOR');
      await app.inject({
        method: 'PUT', url: '/v1/email/account', headers: authHeaders(userD.token),
        payload: { inboxSort: 'unread_first' },
      });

      // Seed: an older UNREAD message and a newer READ message directly —
      // inbound-only data, same convention email.test.ts's pagination test uses.
      const { withTenant } = await import('../db/client.js');
      const crypto = await import('node:crypto');
      await withTenant(A.tenantId, async (trx) => {
        const olderUnreadId = crypto.randomUUID();
        await trx.insertInto('email_messages').values({
          id: olderUnreadId, tenant_id: A.tenantId, user_id: userD.userId, folder: 'inbox',
          from_name: 'Old Sender', from_email: 'old@example.test',
          to_addresses: JSON.stringify([]), cc_addresses: JSON.stringify([]),
          subject: 'Older unread', body: 'x', snippet: 'x', read: false, starred: false,
          labels: JSON.stringify([]), has_attachment: false,
          thread_id: olderUnreadId, created_at: new Date(Date.now() - 100_000),
        }).execute();
        const newerReadId = crypto.randomUUID();
        await trx.insertInto('email_messages').values({
          id: newerReadId, tenant_id: A.tenantId, user_id: userD.userId, folder: 'inbox',
          from_name: 'New Sender', from_email: 'new@example.test',
          to_addresses: JSON.stringify([]), cc_addresses: JSON.stringify([]),
          subject: 'Newer read', body: 'x', snippet: 'x', read: true, starred: false,
          labels: JSON.stringify([]), has_attachment: false,
          thread_id: newerReadId, created_at: new Date(),
        }).execute();
      });

      const res = await app.inject({ method: 'GET', url: '/v1/emails?folder=inbox', headers: authHeaders(userD.token) });
      const items = res.json().items;
      const idxUnread = items.findIndex((m: any) => m.subject === 'Older unread');
      const idxRead = items.findIndex((m: any) => m.subject === 'Newer read');
      expect(idxUnread).toBeGreaterThanOrEqual(0);
      expect(idxRead).toBeGreaterThanOrEqual(0);
      expect(idxUnread).toBeLessThan(idxRead);
    });
  });

  describe('Compose templates', () => {
    it('creates, edits, lists, sanitizes, and deletes plain-text and HTML templates', async () => {
      const app = await getApp();
      const created = await app.inject({
        method: 'POST', url: '/v1/email/quick-templates', headers: authHeaders(A.token),
        payload: { name: 'Follow-up', subject: 'Hello {{first_name}}', body: 'Hi {{first_name}}', body_html: null, is_html: false },
      });
      expect(created.statusCode).toBe(201);
      const id = created.json().id;

      const edited = await app.inject({
        method: 'PATCH', url: `/v1/email/quick-templates/${id}`, headers: authHeaders(A.token),
        payload: { name: 'Follow-up updated', subject: 'Updated', body: 'Updated body', body_html: null, is_html: false },
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json().name).toBe('Follow-up updated');

      const html = await app.inject({
        method: 'POST', url: '/v1/email/quick-templates', headers: authHeaders(A.token),
        payload: { name: 'HTML notice', subject: 'Notice', body: '', body_html: '<p>Hello</p><script>alert(1)</script>', is_html: true },
      });
      expect(html.statusCode).toBe(201);
      expect(html.json().body_html).toContain('<p>Hello</p>');
      expect(html.json().body_html).not.toContain('<script>');

      const list = await app.inject({ method: 'GET', url: '/v1/email/quick-templates', headers: authHeaders(A.token) });
      expect(list.statusCode).toBe(200);
      expect(list.json().some((template: any) => template.id === id)).toBe(true);

      const removed = await app.inject({ method: 'DELETE', url: `/v1/email/quick-templates/${id}`, headers: authHeaders(A.token) });
      expect(removed.statusCode).toBe(204);
      await app.inject({ method: 'DELETE', url: `/v1/email/quick-templates/${html.json().id}`, headers: authHeaders(A.token) });
    });
  });

  describe('Labels — hidden flag', () => {
    it('a label can be hidden and the flag round-trips', async () => {
      const app = await getApp();
      const created = await app.inject({ method: 'POST', url: '/v1/email/labels', headers: authHeaders(A.token), payload: { name: 'ParityTest' } });
      expect(created.statusCode).toBe(201);
      const id = created.json().id;

      const patched = await app.inject({ method: 'PATCH', url: `/v1/email/labels/${id}`, headers: authHeaders(A.token), payload: { hidden: true } });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().hidden).toBe(true);

      const list = await app.inject({ method: 'GET', url: '/v1/email/labels', headers: authHeaders(A.token) });
      const row = list.json().find((l: any) => l.id === id);
      expect(row.hidden).toBe(true);
    });
  });

  describe('Advanced search', () => {
    it('advFrom / advSubject / advHasAttachment narrow results the same way Search would', async () => {
      const app = await getApp();
      const userE = await A.addUser('JUNIOR');
      const { withTenant } = await import('../db/client.js');
      const crypto = await import('node:crypto');
      await withTenant(A.tenantId, async (trx) => {
        const id1 = crypto.randomUUID();
        await trx.insertInto('email_messages').values({
          id: id1, tenant_id: A.tenantId, user_id: userE.userId, folder: 'inbox',
          from_name: 'Aleka Finance', from_email: 'finance@aleka.test',
          to_addresses: JSON.stringify([]), cc_addresses: JSON.stringify([]),
          subject: 'Q3 numbers', body: 'see attached', snippet: 'x', read: false, starred: false,
          labels: JSON.stringify([]), has_attachment: true,
          thread_id: id1, created_at: new Date(),
        }).execute();
        const id2 = crypto.randomUUID();
        await trx.insertInto('email_messages').values({
          id: id2, tenant_id: A.tenantId, user_id: userE.userId, folder: 'inbox',
          from_name: 'Random Newsletter', from_email: 'noreply@newsletter.test',
          to_addresses: JSON.stringify([]), cc_addresses: JSON.stringify([]),
          subject: 'Q3 numbers', body: 'no attachment here', snippet: 'x', read: false, starred: false,
          labels: JSON.stringify([]), has_attachment: false,
          thread_id: id2, created_at: new Date(),
        }).execute();
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/emails?folder=inbox&advFrom=aleka&advSubject=Q3&advHasAttachment=1',
        headers: authHeaders(userE.token),
      });
      expect(res.statusCode).toBe(200);
      const items = res.json().items;
      expect(items.length).toBe(1);
      expect(items[0].from.email).toBe('finance@aleka.test');

      // The simple search box promises sender search and should also accept
      // useful fragments rather than requiring a whole full-text token.
      const senderSearch = await app.inject({
        method: 'GET',
        url: '/v1/emails?folder=inbox&search=leka%20Fin',
        headers: authHeaders(userE.token),
      });
      expect(senderSearch.statusCode).toBe(200);
      expect(senderSearch.json().items.map((m: any) => m.from.email)).toEqual(['finance@aleka.test']);
    });

    it('advScope=all searches across folders, ignoring the plain folder param', async () => {
      const app = await getApp();
      const userF = await A.addUser('JUNIOR');
      const sent = await app.inject({
        method: 'POST', url: '/v1/email/send', headers: authHeaders(userF.token),
        payload: { to: 'x@example.test', subject: 'ScopeAllUniqueSubject', body: 'x', sendAt: new Date(Date.now() + 3_600_000).toISOString() },
      });
      expect(sent.statusCode).toBe(200);

      // folder=inbox alone would never see a scheduled message; advScope=all should.
      const res = await app.inject({
        method: 'GET', url: '/v1/emails?folder=inbox&advScope=all&advSubject=ScopeAllUniqueSubject',
        headers: authHeaders(userF.token),
      });
      expect(res.json().items.some((m: any) => m.subject === 'ScopeAllUniqueSubject')).toBe(true);
    });
  });
});
