// Canonical parties — hardening of migration 504 (review findings):
// file links cascade, triggers keep customers/leads/files in sync, private
// contacts are hidden everywhere, and the Party API enforces entitlement,
// visibility, sharing, edit, archive and merge.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableApps(tenantId: string, apps: Record<string, boolean>) {
  const settings = JSON.stringify({ 'enabled-apps': apps }) as any;
  await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenantId, settings })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings })).execute();
}

describe('Canonical parties — hardening', () => {
  let T: TestTenant;
  let driveId: string;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { contacts: true, crm: true });
    driveId = (await dbPlatform.insertInto('cloud_drives').values({ tenant_id: T.tenantId, name: 'Business', type: 'business' } as any).returning('id').executeTakeFirstOrThrow()).id;
  });
  afterAll(async () => { await T.cleanup(); });

  describe('file links', () => {
    it('a linked file can be permanently deleted (link cascades), and every tagged file gets a link automatically', async () => {
      const entityId = randomUUID();
      const f = await dbPlatform.insertInto('cloud_files').values({
        tenant_id: T.tenantId, drive_id: driveId, name: 'a.pdf', type: 'pdf', size: 1, entity_type: 'contact', entity_id: entityId,
      } as any).returning('id').executeTakeFirstOrThrow();
      const links = () => dbPlatform.selectFrom('resource_file_links').select(['resource_type', 'resource_id']).where('file_id', '=', f.id).execute();
      expect(await links()).toEqual([{ resource_type: 'contact', resource_id: entityId }]);

      // Re-tagging moves the ATTACHMENT link rather than leaving a stale one.
      const other = randomUUID();
      await dbPlatform.updateTable('cloud_files').set({ entity_type: 'customer', entity_id: other } as any).where('id', '=', f.id).execute();
      expect(await links()).toEqual([{ resource_type: 'customer', resource_id: other }]);

      await withTenant(T.tenantId, (trx) => trx.deleteFrom('cloud_files').where('id', '=', f.id).where('tenant_id', '=', T.tenantId).execute());
      expect(await links()).toEqual([]);
    });
  });

  describe('customers and leads', () => {
    it('a new customer gets its organization party and channels from any writer, and renames stay in step', async () => {
      const c = await dbPlatform.insertInto('customers').values({ tenant_id: T.tenantId, name: 'Acme Freight', email: 'Ops@Acme.test', phone: '+255 700 111 222' } as any).returning(['id', 'party_id'] as any).executeTakeFirstOrThrow() as any;
      expect(c.party_id).toBe(c.id);
      const party = await dbPlatform.selectFrom('parties').select(['party_type', 'display_name']).where('id', '=', c.id).executeTakeFirstOrThrow();
      expect(party).toEqual({ party_type: 'ORGANIZATION', display_name: 'Acme Freight' });
      const ch = await dbPlatform.selectFrom('party_channels').select(['channel_type', 'normalized_value']).where('party_id', '=', c.id).orderBy('channel_type').execute();
      expect(ch).toEqual([{ channel_type: 'EMAIL', normalized_value: 'ops@acme.test' }, { channel_type: 'PHONE', normalized_value: '+255700111222' }]);

      await dbPlatform.updateTable('customers').set({ name: 'Acme Logistics' } as any).where('id', '=', c.id).execute();
      expect((await dbPlatform.selectFrom('parties').select('display_name').where('id', '=', c.id).executeTakeFirstOrThrow()).display_name).toBe('Acme Logistics');
      expect((await dbPlatform.selectFrom('party_organizations').select('legal_name').where('party_id', '=', c.id).executeTakeFirstOrThrow()).legal_name).toBe('Acme Logistics');

      const app = await getApp();
      const res = await app.inject({ method: 'GET', url: '/v1/parties?type=ORGANIZATION&q=Logistics', headers: authHeaders(T.token) });
      expect(res.json().data.map((p: any) => p.id)).toContain(c.id);
    });

    it('a new lead is linked to the matching customer and contact', async () => {
      const cust = await dbPlatform.insertInto('customers').values({ tenant_id: T.tenantId, name: 'Linked Co' } as any).returning('id').executeTakeFirstOrThrow();
      const app = await getApp();
      const contact = await app.inject({ method: 'POST', url: '/v1/contacts', headers: authHeaders(T.token), payload: { first_name: 'Lea', email: 'lea@linked.test' } });
      const lead = await dbPlatform.insertInto('leads').values({ tenant_id: T.tenantId, company: 'linked co', contact_name: 'Lea', contact_email: 'LEA@linked.test' } as any).returning(['organization_party_id', 'contact_party_id'] as any).executeTakeFirstOrThrow() as any;
      expect(lead.organization_party_id).toBe(cust.id);
      expect(lead.contact_party_id).toBe(contact.json().id);
    });
  });

  describe('visibility', () => {
    let owner: { userId: string; token: string };
    let colleague: { userId: string; token: string };
    let outsider: { userId: string; token: string };
    let privateId: string;

    beforeAll(async () => {
      owner = { userId: T.userId, token: T.token };
      colleague = await T.addUser('SALES');
      outsider = await T.addUser('SALES');
    });

    const ids = async (token: string, url = '/v1/contacts') => {
      const app = await getApp();
      const res = await app.inject({ method: 'GET', url, headers: authHeaders(token) });
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json();
      return (Array.isArray(body) ? body : body.data).map((c: any) => c.id) as string[];
    };

    it('a PRIVATE contact is hidden from every other user across Contacts and Parties, but not from its owner', async () => {
      const app = await getApp();
      const created = await app.inject({ method: 'POST', url: '/v1/contacts', headers: authHeaders(owner.token), payload: { first_name: 'Secret', last_name: 'Person', email: 'secret@x.test', visibility: 'PRIVATE' } });
      expect(created.statusCode, created.body).toBe(200);
      privateId = created.json().id;

      expect(await ids(owner.token)).toContain(privateId);
      expect(await ids(colleague.token)).not.toContain(privateId);
      expect(await ids(colleague.token, '/v1/parties?type=PERSON')).not.toContain(privateId);
      expect(await ids(owner.token, '/v1/parties?type=PERSON')).toContain(privateId);

      // Knowing the UUID grants nothing.
      const patch = await app.inject({ method: 'PATCH', url: `/v1/contacts/${privateId}`, headers: authHeaders(colleague.token), payload: { first_name: 'Hacked' } });
      expect(patch.statusCode).toBe(404);
      const rel = await app.inject({ method: 'GET', url: `/v1/contacts/${privateId}/relationship`, headers: authHeaders(colleague.token) });
      expect(rel.statusCode).toBe(404);
      const bulk = await app.inject({ method: 'POST', url: '/v1/contacts/bulk-delete', headers: authHeaders(colleague.token), payload: { ids: [privateId], status: 'TRASHED' } });
      expect(bulk.statusCode).toBe(404);
      const party = await app.inject({ method: 'GET', url: `/v1/parties/${privateId}`, headers: authHeaders(colleague.token) });
      expect(party.statusCode).toBe(404);
      const still = await dbPlatform.selectFrom('contacts').select('first_name').where('id', '=', privateId).executeTakeFirstOrThrow();
      expect(still.first_name).toBe('Secret');
    });

    it('only the owner or a manager can change visibility; sharing with a user opens it up', async () => {
      const app = await getApp();
      // The colleague cannot even reach it to change it.
      const denied = await app.inject({ method: 'PUT', url: `/v1/parties/${privateId}/shares`, headers: authHeaders(colleague.token), payload: { shares: [] } });
      expect(denied.statusCode).toBe(404);

      const share = await app.inject({ method: 'PUT', url: `/v1/parties/${privateId}/shares`, headers: authHeaders(owner.token), payload: { shares: [{ principal_type: 'USER', principal_id: colleague.userId, permission: 'VIEW' }] } });
      expect(share.statusCode, share.body).toBe(200);
      expect(await ids(colleague.token)).toContain(privateId);
      expect(await ids(outsider.token)).not.toContain(privateId);
      // View-only share: visible but not editable.
      const edit = await app.inject({ method: 'PATCH', url: `/v1/parties/${privateId}`, headers: authHeaders(colleague.token), payload: { first_name: 'Nope' } });
      expect(edit.statusCode).toBe(403);
      // A share to someone outside the workspace is rejected.
      const bad = await app.inject({ method: 'PUT', url: `/v1/parties/${privateId}/shares`, headers: authHeaders(owner.token), payload: { shares: [{ principal_type: 'USER', principal_id: randomUUID() }] } });
      expect(bad.statusCode).toBe(400);
    });

    it('TEAM visibility reaches teammates only', async () => {
      const app = await getApp();
      const team = await dbPlatform.insertInto('hr_teams').values({ tenant_id: T.tenantId, name: 'Sales' } as any).returning('id').executeTakeFirstOrThrow();
      await dbPlatform.insertInto('hr_team_members').values([{ team_id: team.id, user_id: owner.userId }, { team_id: team.id, user_id: colleague.userId }] as any).execute();
      const c = await app.inject({ method: 'POST', url: '/v1/contacts', headers: authHeaders(owner.token), payload: { first_name: 'Team', last_name: 'Only', visibility: 'TEAM' } });
      expect(await ids(colleague.token)).toContain(c.json().id);
      expect(await ids(outsider.token)).not.toContain(c.json().id);
    });

    it('the visibility field round-trips on the contact list, and an owner can widen it back to everyone', async () => {
      const app = await getApp();
      const list = await app.inject({ method: 'GET', url: '/v1/contacts', headers: authHeaders(owner.token) });
      expect(list.json().find((c: any) => c.id === privateId).visibility).toBe('EXPLICIT_SHARE');
      const widen = await app.inject({ method: 'PATCH', url: `/v1/contacts/${privateId}`, headers: authHeaders(owner.token), payload: { visibility: 'TENANT' } });
      expect(widen.statusCode, widen.body).toBe(200);
      expect(await ids(outsider.token)).toContain(privateId);
      // A non-owner, non-manager cannot narrow someone else's contact.
      const narrow = await app.inject({ method: 'PATCH', url: `/v1/contacts/${privateId}`, headers: authHeaders(outsider.token), payload: { visibility: 'PRIVATE' } });
      expect(narrow.statusCode).toBe(400);
      expect(await ids(owner.token)).toContain(privateId);
    });
  });

  describe('Party API', () => {
    it('is refused for a workspace with none of the apps that use parties', async () => {
      const app = await getApp();
      const N = await createTestTenant('TENANT_ADMIN');
      await enableApps(N.tenantId, { contacts: false, crm: false, finops: false, clearos: false });
      const res = await app.inject({ method: 'GET', url: '/v1/parties', headers: authHeaders(N.token) });
      expect([402, 403]).toContain(res.statusCode);
      await N.cleanup();
    });

    it('creating a person also creates its Contact, and a picker-created organization becomes a customer', async () => {
      const app = await getApp();
      const person = await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(T.token), payload: { type: 'PERSON', first_name: 'Pia', last_name: 'Picker', channels: [{ type: 'EMAIL', value: 'pia@pick.test', is_primary: true }] } });
      expect(person.statusCode, person.body).toBe(201);
      const contact = await dbPlatform.selectFrom('contacts').select(['first_name', 'email', 'party_id']).where('id', '=', person.json().id).executeTakeFirstOrThrow();
      expect(contact).toEqual({ first_name: 'Pia', email: 'pia@pick.test', party_id: person.json().id });

      const org = await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(T.token), payload: { type: 'ORGANIZATION', legal_name: 'Picker Holdings', trading_name: 'PickCo' } });
      expect(org.statusCode, org.body).toBe(201);
      const customer = await dbPlatform.selectFrom('customers').select(['name', 'party_id']).where('id', '=', org.json().id).executeTakeFirstOrThrow();
      expect(customer.name).toBe('Picker Holdings');
      const orgRow = await dbPlatform.selectFrom('party_organizations').select('trading_name').where('party_id', '=', org.json().id).executeTakeFirstOrThrow();
      expect(orgRow.trading_name).toBe('PickCo');

      const dup = await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(T.token), payload: { type: 'PERSON', first_name: 'Pia', channels: [{ type: 'EMAIL', value: 'PIA@pick.test' }] } });
      expect(dup.statusCode).toBe(409);
    });

    it('updates keep the compatibility records in step, and archive/restore moves the contact to Trash and back', async () => {
      const app = await getApp();
      const p = (await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(T.token), payload: { type: 'PERSON', first_name: 'Old', last_name: 'Name' } })).json();
      const upd = await app.inject({ method: 'PATCH', url: `/v1/parties/${p.id}`, headers: authHeaders(T.token), payload: { first_name: 'New', channels: [{ type: 'PHONE', value: '+255 711 000 111' }] } });
      expect(upd.statusCode, upd.body).toBe(200);
      expect(upd.json().display_name).toBe('New Name');
      expect((await dbPlatform.selectFrom('contacts').select('first_name').where('id', '=', p.id).executeTakeFirstOrThrow()).first_name).toBe('New');

      await app.inject({ method: 'POST', url: `/v1/parties/${p.id}/archive`, headers: authHeaders(T.token), payload: {} });
      expect((await dbPlatform.selectFrom('contacts').select('status').where('id', '=', p.id).executeTakeFirstOrThrow()).status).toBe('TRASHED');
      const listed = await app.inject({ method: 'GET', url: '/v1/parties?q=New', headers: authHeaders(T.token) });
      expect(listed.json().data.map((x: any) => x.id)).not.toContain(p.id);
      await app.inject({ method: 'POST', url: `/v1/parties/${p.id}/restore`, headers: authHeaders(T.token), payload: {} });
      expect((await dbPlatform.selectFrom('contacts').select('status').where('id', '=', p.id).executeTakeFirstOrThrow()).status).toBe('ACTIVE');
    });

    it('merges duplicates transactionally: channels move, the duplicate becomes a tombstone, its contact is trashed', async () => {
      const app = await getApp();
      const mk = async (first: string, email: string) => (await app.inject({ method: 'POST', url: '/v1/parties?allow_duplicate=true', headers: authHeaders(T.token), payload: { type: 'PERSON', first_name: first, channels: [{ type: 'EMAIL', value: email }] } })).json();
      const primary = await mk('Prime', 'prime@m.test');
      const dupe = await mk('Dupe', 'dupe@m.test');

      const staff = await T.addUser('SALES');
      const denied = await app.inject({ method: 'POST', url: '/v1/parties/merge', headers: authHeaders(staff.token), payload: { primary_id: primary.id, duplicate_ids: [dupe.id] } });
      expect(denied.statusCode).toBe(403);

      const res = await app.inject({ method: 'POST', url: '/v1/parties/merge', headers: authHeaders(T.token), payload: { primary_id: primary.id, duplicate_ids: [dupe.id] } });
      expect(res.statusCode, res.body).toBe(200);
      const channels = await dbPlatform.selectFrom('party_channels').select('normalized_value').where('party_id', '=', primary.id).execute();
      expect(channels.map(c => c.normalized_value).sort()).toEqual(['dupe@m.test', 'prime@m.test']);
      const tomb = await dbPlatform.selectFrom('parties').select(['status', 'merged_into_id']).where('id', '=', dupe.id).executeTakeFirstOrThrow();
      expect(tomb).toEqual({ status: 'MERGED', merged_into_id: primary.id });
      expect((await dbPlatform.selectFrom('contacts').select('status').where('id', '=', dupe.id).executeTakeFirstOrThrow()).status).toBe('TRASHED');

      // A customer organization is never merged silently.
      const org = (await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(T.token), payload: { type: 'ORGANIZATION', legal_name: 'Org One' } })).json();
      const org2 = (await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(T.token), payload: { type: 'ORGANIZATION', legal_name: 'Org Two' } })).json();
      const blocked = await app.inject({ method: 'POST', url: '/v1/parties/merge', headers: authHeaders(T.token), payload: { primary_id: org.id, duplicate_ids: [org2.id] } });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error).toBe('IS_CUSTOMER');
    });

    it('search treats % and _ literally', async () => {
      const app = await getApp();
      await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(T.token), payload: { type: 'ORGANIZATION', legal_name: '50% Off Traders' } });
      await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(T.token), payload: { type: 'ORGANIZATION', legal_name: 'Plain Traders' } });
      const res = await app.inject({ method: 'GET', url: `/v1/parties?type=ORGANIZATION&q=${encodeURIComponent('%')}`, headers: authHeaders(T.token) });
      const names = res.json().data.map((p: any) => p.display_name);
      expect(names).toContain('50% Off Traders');
      expect(names).not.toContain('Plain Traders');
    });
  });
});
