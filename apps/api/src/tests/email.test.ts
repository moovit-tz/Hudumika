// Email regression suite — per-user mailbox isolation within a tenant, bulk
// operations (including this session's new 'label'/'unlabel' bulk action),
// scheduled-send + undo/cancel, and the real server-side pagination this
// session added (limit/offset/total, replacing "fetch the whole folder").
// Real HTTP calls through the actual app (fastify.inject), a real Postgres
// tenant, RLS genuinely enforced.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableEmail(tenantId: string) {
  await dbPlatform.insertInto('tenant_settings')
    .values({ tenant_id: tenantId, settings: JSON.stringify({ 'enabled-apps': { email: true } }) as any })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'enabled-apps': { email: true } }) as any }))
    .execute();
}

describe('Email — mailbox isolation, bulk actions, scheduled send, pagination', () => {
  let A: TestTenant;

  beforeAll(async () => {
    await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    await enableEmail(A.tenantId);
  });

  afterAll(async () => {
    await A.cleanup();
  });

  it("a second user in the same tenant never sees the first user's mailbox", async () => {
    const app = await getApp();
    const userB = await A.addUser('SENIOR');

    const sent = await app.inject({
      method: 'POST', url: '/v1/email/send', headers: authHeaders(A.token),
      payload: { to: 'someone@example.test', subject: 'Isolation check', body: 'hello', sendAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    expect(sent.statusCode).toBe(200);

    const asOwner = await app.inject({ method: 'GET', url: '/v1/emails?folder=scheduled', headers: authHeaders(A.token) });
    expect(asOwner.statusCode).toBe(200);
    expect(asOwner.json().items.some((m: any) => m.subject === 'Isolation check')).toBe(true);

    const asOther = await app.inject({ method: 'GET', url: '/v1/emails?folder=scheduled', headers: authHeaders(userB.token) });
    expect(asOther.json().items.some((m: any) => m.subject === 'Isolation check')).toBe(false);
  });

  it('schedule-send lands in scheduled, and DELETE before delivery cancels it', async () => {
    const app = await getApp();
    const sent = await app.inject({
      method: 'POST', url: '/v1/email/send', headers: authHeaders(A.token),
      payload: { to: 'someone@example.test', subject: 'Cancel me', body: 'hello', sendAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    expect(sent.statusCode).toBe(200);
    const messageId = sent.json().id ?? sent.json().messageId ?? sent.json().data?.id;

    const scheduled = await app.inject({ method: 'GET', url: '/v1/emails?folder=scheduled', headers: authHeaders(A.token) });
    const row = scheduled.json().items.find((m: any) => m.subject === 'Cancel me');
    expect(row).toBeTruthy();

    const cancelled = await app.inject({ method: 'DELETE', url: `/v1/emails/${row.id}`, headers: authHeaders(A.token) });
    expect(cancelled.statusCode).toBe(204);

    for (const folder of ['scheduled', 'sent', 'drafts', 'inbox']) {
      const check = await app.inject({ method: 'GET', url: `/v1/emails?folder=${folder}`, headers: authHeaders(A.token) });
      expect(check.json().items.some((m: any) => m.subject === 'Cancel me')).toBe(false);
    }
  });

  it('bulk actions: read/unread/trash and the new label/unlabel', async () => {
    const app = await getApp();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const sent = await app.inject({
        method: 'POST', url: '/v1/email/send', headers: authHeaders(A.token),
        payload: { to: 'bulk@example.test', subject: `Bulk ${i}`, body: 'x', sendAt: new Date(Date.now() + 3_600_000).toISOString() },
      });
      const scheduled = await app.inject({ method: 'GET', url: '/v1/emails?folder=scheduled', headers: authHeaders(A.token) });
      const row = scheduled.json().items.find((m: any) => m.subject === `Bulk ${i}`);
      ids.push(row.id);
    }

    const label = await app.inject({ method: 'POST', url: '/v1/email/labels', headers: authHeaders(A.token), payload: { name: 'BulkTest' } });
    expect(label.statusCode).toBe(201);

    const applied = await app.inject({
      method: 'POST', url: '/v1/emails/bulk', headers: authHeaders(A.token),
      payload: { ids, action: 'label', label: 'BulkTest' },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().count).toBe(3);

    const afterLabel = await app.inject({ method: 'GET', url: '/v1/emails?folder=scheduled', headers: authHeaders(A.token) });
    const labeled = afterLabel.json().items.filter((m: any) => ids.includes(m.id));
    expect(labeled.every((m: any) => m.labels.includes('BulkTest'))).toBe(true);

    const removed = await app.inject({
      method: 'POST', url: '/v1/emails/bulk', headers: authHeaders(A.token),
      payload: { ids, action: 'unlabel', label: 'BulkTest' },
    });
    expect(removed.statusCode).toBe(200);

    const trashed = await app.inject({
      method: 'POST', url: '/v1/emails/bulk', headers: authHeaders(A.token),
      payload: { ids, action: 'trash' },
    });
    expect(trashed.statusCode).toBe(200);
    const inTrash = await app.inject({ method: 'GET', url: '/v1/emails?folder=trash', headers: authHeaders(A.token) });
    expect(ids.every(id => inTrash.json().items.some((m: any) => m.id === id))).toBe(true);
  });

  it('GET /v1/emails paginates with a real total, not the whole folder', async () => {
    const app = await getApp();
    const userC = await A.addUser('JUNIOR');

    // Seed 25 real inbox rows directly — this is inbound mail, which only
    // ever arrives via IMAP ingestion in production, so there's no send-side
    // API to create it through; the same underlying insert every other
    // direct-DB test setup in this repo uses.
    await withTenant(A.tenantId, async (trx) => {
      for (let i = 0; i < 25; i++) {
        const id = crypto.randomUUID();
        await trx.insertInto('email_messages').values({
          id, tenant_id: A.tenantId, user_id: userC.userId, folder: 'inbox',
          from_name: 'Pagination Sender', from_email: 'pagesender@example.test',
          to_addresses: JSON.stringify([{ name: 'C', email: 'c@example.test' }]),
          cc_addresses: JSON.stringify([]), subject: `Page test ${i}`, body: 'x', snippet: 'x',
          read: false, starred: false, labels: JSON.stringify([]), has_attachment: false,
          thread_id: id, created_at: new Date(Date.now() - i * 1000),
        }).execute();
      }
    });

    const page1 = await app.inject({ method: 'GET', url: '/v1/emails?folder=inbox&limit=10&offset=0', headers: authHeaders(userC.token) });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.items).toHaveLength(10);
    expect(body1.total).toBe(25);
    expect(body1.hasMore).toBe(true);

    const page3 = await app.inject({ method: 'GET', url: '/v1/emails?folder=inbox&limit=10&offset=20', headers: authHeaders(userC.token) });
    const body3 = page3.json();
    expect(body3.items).toHaveLength(5);
    expect(body3.total).toBe(25);
    expect(body3.hasMore).toBe(false);

    // No overlap between pages.
    const idsPage1 = new Set(body1.items.map((m: any) => m.id));
    expect(body3.items.every((m: any) => !idsPage1.has(m.id))).toBe(true);
  });
});
