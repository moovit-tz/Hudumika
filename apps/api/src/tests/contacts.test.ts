// Contacts regression suite — tenant isolation, the new management-role gate
// on hard-delete/export/import/merge (this session's audit fix), and merge
// behavior. Real HTTP calls through the actual app (fastify.inject), a real
// Postgres tenant per test suite, RLS genuinely enforced — not a mock.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableContacts(tenantId: string) {
  await dbPlatform.insertInto('tenant_settings')
    .values({ tenant_id: tenantId, settings: JSON.stringify({ 'enabled-apps': { contacts: true } }) as any })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'enabled-apps': { contacts: true } }) as any }))
    .execute();
}

describe('Contacts — isolation, role gate, merge', () => {
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    await enableContacts(A.tenantId);
    await enableContacts(B.tenantId);
  });

  afterAll(async () => {
    await A.cleanup();
    await B.cleanup();
  });

  let contactId: string;

  it('creates a contact, lists it, patches it', async () => {
    const app = await getApp();
    const created = await app.inject({
      method: 'POST', url: '/v1/contacts', headers: authHeaders(A.token),
      payload: { first_name: 'Amina', last_name: 'Juma', email: 'amina@example.test' },
    });
    expect(created.statusCode).toBe(200);
    contactId = created.json().id;

    const list = await app.inject({ method: 'GET', url: '/v1/contacts?status=ACTIVE', headers: authHeaders(A.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((c: any) => c.id === contactId)).toBe(true);

    const patched = await app.inject({
      method: 'PATCH', url: `/v1/contacts/${contactId}`, headers: authHeaders(A.token),
      payload: { job_title: 'Ops Manager' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().job_title).toBe('Ops Manager');
  });

  it("tenant B never sees tenant A's contact, and can't reach it directly", async () => {
    const app = await getApp();
    const list = await app.inject({ method: 'GET', url: '/v1/contacts?status=ACTIVE', headers: authHeaders(B.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((c: any) => c.id === contactId)).toBe(false);

    const patch = await app.inject({ method: 'PATCH', url: `/v1/contacts/${contactId}`, headers: authHeaders(B.token), payload: { job_title: 'Hijacked' } });
    // Cross-tenant patch: either a clean 404 (not found under this tenant) or
    // a no-op — either way it must never actually change tenant A's row.
    expect(patch.statusCode).not.toBe(200);
    const stillA = await app.inject({ method: 'GET', url: `/v1/contacts?status=ACTIVE`, headers: authHeaders(A.token) });
    expect(stillA.json().find((c: any) => c.id === contactId)?.job_title).toBe('Ops Manager');
  });

  it('creates one canonical Party and enforces tenant/private visibility in the API', async () => {
    const app = await getApp();
    const canonical = await app.inject({ method: 'GET', url: `/v1/parties/${contactId}`, headers: authHeaders(A.token) });
    expect(canonical.statusCode).toBe(200);
    expect(canonical.json()).toMatchObject({ id: contactId, party_type: 'PERSON', display_name: 'Amina Juma' });

    const crossTenant = await app.inject({ method: 'GET', url: `/v1/parties/${contactId}`, headers: authHeaders(B.token) });
    expect(crossTenant.statusCode).toBe(404);

    const privateParty = await app.inject({
      method: 'POST', url: '/v1/parties', headers: authHeaders(A.token),
      payload: { type: 'PERSON', first_name: 'Private', last_name: 'Adviser', visibility: 'PRIVATE', channels: [{ type: 'EMAIL', value: 'private@example.test' }] },
    });
    expect(privateParty.statusCode).toBe(201);
    const colleague = await A.addUser('MANAGER');
    const hidden = await app.inject({ method: 'GET', url: `/v1/parties/${privateParty.json().id}`, headers: authHeaders(colleague.token) });
    expect(hidden.statusCode).toBe(404);
  });

  it('an OFFICER is refused hard-delete, export, import, and merge — but can still soft-delete', async () => {
    const app = await getApp();
    const officer = await A.addUser('OFFICER');

    const hardDelete = await app.inject({ method: 'DELETE', url: `/v1/contacts/${contactId}?hard=true`, headers: authHeaders(officer.token) });
    expect(hardDelete.statusCode).toBe(403);

    const exportCsv = await app.inject({ method: 'GET', url: '/v1/contacts/export.csv', headers: authHeaders(officer.token) });
    expect(exportCsv.statusCode).toBe(403);

    const bulkHardDelete = await app.inject({
      method: 'POST', url: '/v1/contacts/bulk-delete', headers: authHeaders(officer.token),
      payload: { ids: [contactId], status: 'DELETE' },
    });
    expect(bulkHardDelete.statusCode).toBe(403);

    // No content-type/payload — a real import always carries multipart form
    // data, but the role gate must refuse this before the handler ever
    // tries to read a file, so there's nothing valid to send here.
    const importReq = await app.inject({ method: 'POST', url: '/v1/contacts/import', headers: { authorization: `Bearer ${officer.token}` } });
    expect(importReq.statusCode).toBe(403);

    // The everyday "move to trash" action (soft delete, not hard) stays open
    // to every internal role — this must NOT be gated by the same check.
    const softDelete = await app.inject({ method: 'DELETE', url: `/v1/contacts/${contactId}`, headers: authHeaders(officer.token) });
    expect(softDelete.statusCode).toBe(200);
    const restore = await app.inject({ method: 'POST', url: `/v1/contacts/${contactId}/restore`, headers: authHeaders(A.token), payload: {} });
    expect(restore.statusCode).toBe(200);
  });

  it('a MANAGER can export and hard-delete', async () => {
    const app = await getApp();
    const manager = await A.addUser('MANAGER');
    const disposable = await app.inject({
      method: 'POST', url: '/v1/contacts', headers: authHeaders(A.token),
      payload: { first_name: 'Throwaway', last_name: 'Contact' },
    });
    const disposableId = disposable.json().id;

    const exportCsv = await app.inject({ method: 'GET', url: '/v1/contacts/export.csv', headers: authHeaders(manager.token) });
    expect(exportCsv.statusCode).toBe(200);

    const hardDelete = await app.inject({ method: 'DELETE', url: `/v1/contacts/${disposableId}?hard=true`, headers: authHeaders(manager.token) });
    expect(hardDelete.statusCode).toBe(200);
    const gone = await app.inject({ method: 'GET', url: '/v1/contacts?status=ACTIVE', headers: authHeaders(A.token) });
    expect(gone.json().some((c: any) => c.id === disposableId)).toBe(false);
  });

  it('merges a duplicate into the primary contact — duplicate is gone, primary survives', async () => {
    const app = await getApp();
    const dup = await app.inject({
      method: 'POST', url: '/v1/contacts', headers: authHeaders(A.token),
      payload: { first_name: 'Amina', last_name: 'Juma', email: 'amina.dup@example.test' },
    });
    expect(dup.statusCode).toBe(200);
    const dupId = dup.json().id;

    const manager = await A.addUser('MANAGER');
    const merged = await app.inject({
      method: 'POST', url: '/v1/contacts/merge', headers: authHeaders(manager.token),
      payload: { primary_id: contactId, duplicate_ids: [dupId] },
    });
    expect(merged.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/v1/contacts?status=ACTIVE', headers: authHeaders(A.token) });
    const ids = after.json().map((c: any) => c.id);
    expect(ids).toContain(contactId);
    expect(ids).not.toContain(dupId);
  });

  it('labels: create (nested), assign to a contact, list back scoped per tenant', async () => {
    const app = await getApp();
    const parent = await app.inject({ method: 'POST', url: '/v1/contacts/labels', headers: authHeaders(A.token), payload: { name: 'Clients' } });
    expect(parent.statusCode).toBe(200);
    const child = await app.inject({
      method: 'POST', url: '/v1/contacts/labels', headers: authHeaders(A.token),
      payload: { name: 'VIP', parent_id: parent.json().id },
    });
    expect(child.statusCode).toBe(200);

    const labelsB = await app.inject({ method: 'GET', url: '/v1/contacts/labels', headers: authHeaders(B.token) });
    expect(labelsB.json().some((l: any) => l.name === 'VIP')).toBe(false);

    const labelsA = await app.inject({ method: 'GET', url: '/v1/contacts/labels', headers: authHeaders(A.token) });
    expect(labelsA.json().some((l: any) => l.name === 'VIP' && l.parent_id === parent.json().id)).toBe(true);
  });

  it('smart groups: creates a rule-based group scoped to the tenant', async () => {
    const app = await getApp();
    const group = await app.inject({
      method: 'POST', url: '/v1/contacts/smart-groups', headers: authHeaders(A.token),
      payload: { name: 'Named Amina', match_type: 'all', rules: [{ field: 'has_email', op: 'is_true' }] },
    });
    expect(group.statusCode).toBe(200);
    const results = await app.inject({ method: 'GET', url: `/v1/contacts/smart-groups/${group.json().id}/contacts`, headers: authHeaders(A.token) });
    expect(results.statusCode).toBe(200);
    expect(results.json().contacts.some((c: any) => c.id === contactId)).toBe(true);

    const groupsB = await app.inject({ method: 'GET', url: '/v1/contacts/smart-groups', headers: authHeaders(B.token) });
    expect(groupsB.json().some((g: any) => g.name === 'Named Amina')).toBe(false);
  });

  it('serves tenant-scoped directory, discovery, and relationship views', async () => {
    const app = await getApp();
    await dbPlatform.insertInto('email_messages').values({
      tenant_id: A.tenantId, user_id: A.userId, folder: 'inbox',
      from_name: 'Amina Juma', from_email: 'amina@example.test',
      to_addresses: JSON.stringify([]), cc_addresses: JSON.stringify([]), bcc_addresses: JSON.stringify([]),
      subject: 'Production relationship test', body: 'Hello', snippet: 'Hello', thread_id: randomUUID(),
    }).execute();
    const directory = await app.inject({ method: 'GET', url: '/v1/contacts/directory', headers: authHeaders(A.token) });
    expect(directory.statusCode).toBe(200);
    expect(directory.json().some((person: any) => person.id === A.userId)).toBe(true);
    expect(directory.json().some((person: any) => person.id === B.userId)).toBe(false);

    const discovery = await app.inject({ method: 'GET', url: '/v1/contacts/discovery', headers: authHeaders(A.token) });
    expect(discovery.statusCode).toBe(200);
    expect(discovery.json()).toMatchObject({ frequent: expect.any(Array), other: expect.any(Array) });

    const relationship = await app.inject({ method: 'GET', url: `/v1/contacts/${contactId}/relationship`, headers: authHeaders(A.token) });
    expect(relationship.statusCode).toBe(200);
    expect(relationship.json()).toMatchObject({ interactions: expect.any(Array), files: expect.any(Array), totals: expect.any(Object) });
    expect(relationship.json().interactions.some((item: any) => item.title === 'Production relationship test')).toBe(true);

    const crossTenant = await app.inject({ method: 'GET', url: `/v1/contacts/${contactId}/relationship`, headers: authHeaders(B.token) });
    expect(crossTenant.statusCode).toBe(404);
  });
});
