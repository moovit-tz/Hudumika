// Follow-ups to party hardening: team/department shares can grant edit, VIEW
// shares cannot (also through the Contacts routes), suppliers are canonical
// organization parties, leads can link to an existing party, and migration
// numbering cannot silently collide again.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableApps(tenantId: string, apps: Record<string, boolean>) {
  const settings = JSON.stringify({ 'enabled-apps': apps }) as any;
  await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenantId, settings })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings })).execute();
}

describe('Party sharing, suppliers and lead links', () => {
  let T: TestTenant;
  let owner: { userId: string; token: string };
  let teammate: { userId: string; token: string };
  let outsider: { userId: string; token: string };
  let teamId: string;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { contacts: true, crm: true, finops: true });
    owner = { userId: T.userId, token: T.token };
    teammate = await T.addUser('SALES');
    outsider = await T.addUser('SALES');
    teamId = (await dbPlatform.insertInto('hr_teams').values({ tenant_id: T.tenantId, name: 'Deal Desk' } as any).returning('id').executeTakeFirstOrThrow()).id;
    await dbPlatform.insertInto('hr_team_members').values([{ team_id: teamId, user_id: owner.userId }, { team_id: teamId, user_id: teammate.userId }] as any).execute();
  });
  afterAll(async () => { await T.cleanup(); });

  const post = async (token: string, payload: any) => (await getApp()).inject({ method: 'POST', url: '/v1/contacts', headers: authHeaders(token), payload });

  describe('who can edit', () => {
    it('a team share with EDIT lets teammates edit a private contact; a VIEW share lets them read only, on both APIs', async () => {
      const app = await getApp();
      const c = (await post(owner.token, { first_name: 'Shared', last_name: 'Deal', visibility: 'PRIVATE' })).json();

      const list = async (token: string) => (await app.inject({ method: 'GET', url: '/v1/contacts', headers: authHeaders(token) })).json().map((x: any) => x.id);
      expect(await list(teammate.token)).not.toContain(c.id);

      // VIEW share to the team.
      await app.inject({ method: 'PUT', url: `/v1/parties/${c.id}/shares`, headers: authHeaders(owner.token), payload: { shares: [{ principal_type: 'TEAM', principal_id: teamId, permission: 'VIEW' }] } });
      expect(await list(teammate.token)).toContain(c.id);
      expect((await list(outsider.token))).not.toContain(c.id);
      const viewEditParties = await app.inject({ method: 'PATCH', url: `/v1/parties/${c.id}`, headers: authHeaders(teammate.token), payload: { first_name: 'X' } });
      expect(viewEditParties.statusCode).toBe(403);
      const viewEditContacts = await app.inject({ method: 'PATCH', url: `/v1/contacts/${c.id}`, headers: authHeaders(teammate.token), payload: { first_name: 'X' } });
      expect(viewEditContacts.statusCode).toBe(403);
      // Reading is still fine.
      const rel = await app.inject({ method: 'GET', url: `/v1/contacts/${c.id}/relationship`, headers: authHeaders(teammate.token) });
      expect(rel.statusCode).toBe(200);

      // EDIT share to the team.
      await app.inject({ method: 'PUT', url: `/v1/parties/${c.id}/shares`, headers: authHeaders(owner.token), payload: { shares: [{ principal_type: 'TEAM', principal_id: teamId, permission: 'EDIT' }] } });
      const ok1 = await app.inject({ method: 'PATCH', url: `/v1/parties/${c.id}`, headers: authHeaders(teammate.token), payload: { first_name: 'Edited' } });
      expect(ok1.statusCode, ok1.body).toBe(200);
      const ok2 = await app.inject({ method: 'PATCH', url: `/v1/contacts/${c.id}`, headers: authHeaders(teammate.token), payload: { last_name: 'ByTeam' } });
      expect(ok2.statusCode, ok2.body).toBe(200);
      const outsiderEdit = await app.inject({ method: 'PATCH', url: `/v1/contacts/${c.id}`, headers: authHeaders(outsider.token), payload: { last_name: 'Nope' } });
      expect(outsiderEdit.statusCode).toBe(404);
    });

    it('a TEAM-visibility contact is editable by teammates (not just its owner)', async () => {
      const app = await getApp();
      const c = (await post(owner.token, { first_name: 'Team', last_name: 'Owned', visibility: 'TEAM' })).json();
      const edit = await app.inject({ method: 'PATCH', url: `/v1/contacts/${c.id}`, headers: authHeaders(teammate.token), payload: { last_name: 'Touched' } });
      expect(edit.statusCode, edit.body).toBe(200);
      const denied = await app.inject({ method: 'PATCH', url: `/v1/contacts/${c.id}`, headers: authHeaders(outsider.token), payload: { last_name: 'Nope' } });
      expect(denied.statusCode).toBe(404);
    });

    it('lists people, teams and departments a share can name, for this workspace only', async () => {
      const app = await getApp();
      const res = await app.inject({ method: 'GET', url: '/v1/parties/principals?q=Deal', headers: authHeaders(owner.token) });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().teams.map((t: any) => t.id)).toContain(teamId);
      const all = await app.inject({ method: 'GET', url: '/v1/parties/principals', headers: authHeaders(owner.token) });
      expect(all.json().users.map((u: any) => u.id)).toEqual(expect.arrayContaining([owner.userId, teammate.userId]));
    });
  });

  describe('suppliers', () => {
    it('every supplier gets an organization party from any writer, and renames/status stay in step', async () => {
      const s = await dbPlatform.insertInto('suppliers').values({ tenant_id: T.tenantId, name: 'Bolt & Nut Ltd', email: 'Sales@Bolt.test', phone: '+255 22 111 000', tax_id: 'TIN-9' } as any).returning(['id', 'party_id'] as any).executeTakeFirstOrThrow() as any;
      expect(s.party_id).toBe(s.id);
      const party = await dbPlatform.selectFrom('parties').select(['party_type', 'display_name', 'status', 'source_system']).where('id', '=', s.id).executeTakeFirstOrThrow();
      expect(party).toEqual({ party_type: 'ORGANIZATION', display_name: 'Bolt & Nut Ltd', status: 'ACTIVE', source_system: 'SUPPLIERS' });
      const org = await dbPlatform.selectFrom('party_organizations').select(['legal_name', 'tax_identifier']).where('party_id', '=', s.id).executeTakeFirstOrThrow();
      expect(org).toEqual({ legal_name: 'Bolt & Nut Ltd', tax_identifier: 'TIN-9' });

      await dbPlatform.updateTable('suppliers').set({ name: 'Bolt & Nut Holdings', status: 'inactive' } as any).where('id', '=', s.id).execute();
      const after = await dbPlatform.selectFrom('parties').select(['display_name', 'status']).where('id', '=', s.id).executeTakeFirstOrThrow();
      expect(after).toEqual({ display_name: 'Bolt & Nut Holdings', status: 'INACTIVE' });
    });

    it('the organization picker labels customers and suppliers, and a supplier created through it is a real supplier', async () => {
      const app = await getApp();
      const created = await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(owner.token), payload: { type: 'ORGANIZATION', legal_name: 'Picked Vendor Co', role: 'supplier' } });
      expect(created.statusCode, created.body).toBe(201);
      const sup = await dbPlatform.selectFrom('suppliers').select(['name', 'party_id']).where('id', '=', created.json().id).executeTakeFirstOrThrow();
      expect(sup).toEqual({ name: 'Picked Vendor Co', party_id: created.json().id });
      const noCustomer = await dbPlatform.selectFrom('customers').select('id').where('id', '=', created.json().id).executeTakeFirst();
      expect(noCustomer).toBeUndefined();

      const cust = await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(owner.token), payload: { type: 'ORGANIZATION', legal_name: 'Picked Customer Co' } });
      const list = await app.inject({ method: 'GET', url: '/v1/parties?type=ORGANIZATION&q=Picked', headers: authHeaders(owner.token) });
      const byName = Object.fromEntries(list.json().data.map((p: any) => [p.display_name, p]));
      expect(byName['Picked Vendor Co']).toMatchObject({ is_supplier: true, is_customer: false });
      expect(byName['Picked Customer Co']).toMatchObject({ is_supplier: false, is_customer: true });

      // Renames through the party API reach the supplier; archiving deactivates it.
      await app.inject({ method: 'PATCH', url: `/v1/parties/${created.json().id}`, headers: authHeaders(owner.token), payload: { legal_name: 'Renamed Vendor Co' } });
      expect((await dbPlatform.selectFrom('suppliers').select('name').where('id', '=', created.json().id).executeTakeFirstOrThrow()).name).toBe('Renamed Vendor Co');
      await app.inject({ method: 'POST', url: `/v1/parties/${created.json().id}/archive`, headers: authHeaders(owner.token), payload: {} });
      expect((await dbPlatform.selectFrom('suppliers').select('status').where('id', '=', created.json().id).executeTakeFirstOrThrow()).status).toBe('inactive');

      // Merging a supplier is refused — bills and orders reference it.
      const other = (await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(owner.token), payload: { type: 'ORGANIZATION', legal_name: 'Second Vendor', role: 'supplier' } })).json();
      const merge = await app.inject({ method: 'POST', url: '/v1/parties/merge', headers: authHeaders(owner.token), payload: { primary_id: cust.json().id, duplicate_ids: [other.id] } });
      expect(merge.statusCode).toBe(409);
      expect(merge.json().error).toBe('IS_SUPPLIER');
    });
  });

  describe('leads link to existing parties', () => {
    it('a lead can be created against an existing organization and contact, and an unknown or hidden party is refused', async () => {
      const app = await getApp();
      const org = (await app.inject({ method: 'POST', url: '/v1/parties', headers: authHeaders(owner.token), payload: { type: 'ORGANIZATION', legal_name: 'Lead Target Ltd' } })).json();
      const person = (await post(owner.token, { first_name: 'Lena', last_name: 'Lead' })).json();
      const ok = await app.inject({ method: 'POST', url: '/v1/leads', headers: authHeaders(owner.token), payload: { company: 'Lead Target Ltd', contact_name: 'Lena Lead', organization_party_id: org.id, contact_party_id: person.id } });
      expect(ok.statusCode, ok.body).toBeLessThan(300);
      const row = await dbPlatform.selectFrom('leads').select(['organization_party_id', 'contact_party_id']).where('tenant_id', '=', T.tenantId).where('company', '=', 'Lead Target Ltd').executeTakeFirstOrThrow();
      expect(row).toEqual({ organization_party_id: org.id, contact_party_id: person.id });

      const unknown = await app.inject({ method: 'POST', url: '/v1/leads', headers: authHeaders(owner.token), payload: { company: 'X', contact_name: 'Y', organization_party_id: randomUUID() } });
      expect(unknown.statusCode).toBe(400);

      // A party the user cannot see is refused just like an unknown one.
      const secret = (await post(owner.token, { first_name: 'Hidden', last_name: 'One', visibility: 'PRIVATE' })).json();
      const hidden = await app.inject({ method: 'POST', url: '/v1/leads', headers: authHeaders(outsider.token), payload: { company: 'Z', contact_name: 'Q', contact_party_id: secret.id } });
      expect(hidden.statusCode).toBe(400);
    });
  });
});

describe('migration numbering', () => {
  it('no NEW migration reuses a number that is already taken (existing clashes are allow-listed)', () => {
    const dir = path.resolve(__dirname, '../db/migrations');
    const byNumber = new Map<string, string[]>();
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql'))) {
      const n = f.match(/^(\d+)_/)?.[1];
      if (!n) continue;
      byNumber.set(n, [...(byNumber.get(n) ?? []), f]);
    }
    const clashes = [...byNumber.entries()].filter(([, files]) => files.length > 1).map(([n]) => n).sort();
    // These clashes already exist and are applied in every environment; renaming an
    // applied migration would re-run it (the runner tracks by filename), so they are
    // recorded here instead. The runner orders by full filename, so clashes are safe —
    // but a NEW clash must be renumbered before merging.
    const KNOWN = ['034', '036', '037', '063', '065', '066', '068', '069', '100', '101', '276', '289', '290', '338', '352', '368', '369', '504'];
    const unexpected = clashes.filter(n => !KNOWN.includes(n));
    expect(unexpected, `Duplicate migration numbers: ${unexpected.join(', ')}`).toEqual([]);
  });
});

describe('Same company as customer and supplier, cross-app references, eSign link', () => {
  let T: TestTenant;
  let admin: { userId: string; token: string };
  let staff: { userId: string; token: string };

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { contacts: true, crm: true, finops: true, sign: true });
    admin = { userId: T.userId, token: T.token };
    staff = await T.addUser('SALES');
  });
  afterAll(async () => { await T.cleanup(); });

  const api = async (token: string, method: 'GET' | 'POST', url: string, payload?: any) =>
    (await getApp()).inject({ method, url, headers: authHeaders(token), ...(payload !== undefined ? { payload } : method === 'POST' ? { payload: {} } : {}) });

  it('suggests likely matches (never links automatically), and a manager confirms, undoes or dismisses each', async () => {
    const customer = await dbPlatform.insertInto('customers').values({ tenant_id: T.tenantId, name: 'Kilimanjaro Traders Ltd', email: 'accounts@kili.test' } as any).returning('id').executeTakeFirstOrThrow();
    const supplier = await dbPlatform.insertInto('suppliers').values({ tenant_id: T.tenantId, name: 'Kilimanjaro Traders Limited', phone: '+255 700 999 111' } as any).returning('id').executeTakeFirstOrThrow();
    // A same-tax-ID pair with different names.
    const c2 = await dbPlatform.insertInto('customers').values({ tenant_id: T.tenantId, name: 'Serengeti Holdings', tax_id: 'TIN-777' } as any).returning('id').executeTakeFirstOrThrow();
    const s2 = await dbPlatform.insertInto('suppliers').values({ tenant_id: T.tenantId, name: 'SH Logistics', tax_id: 'tin-777' } as any).returning('id').executeTakeFirstOrThrow();
    // A different company that merely shares a first word must NOT be suggested.
    await dbPlatform.insertInto('suppliers').values({ tenant_id: T.tenantId, name: 'Kilimanjaro Coffee Estate' } as any).execute();

    const sugg = (await api(admin.token, 'GET', '/v1/parties/link-suggestions')).json().data;
    const pairs = sugg.map((s: any) => [s.a.id, s.b.id].sort().join('|'));
    expect(pairs).toContain([customer.id, supplier.id].sort().join('|'));
    expect(pairs).toContain([c2.id, s2.id].sort().join('|'));
    expect(sugg.find((s: any) => [s.a.id, s.b.id].includes(c2.id)).reason).toBe('Same tax ID');
    expect(sugg.some((s: any) => s.a.name.includes('Coffee') || s.b.name.includes('Coffee'))).toBe(false);

    // Before linking: two separate rows in the picker.
    const before = (await api(admin.token, 'GET', '/v1/parties?type=ORGANIZATION&q=Kilimanjaro Traders')).json().data;
    expect(before.map((p: any) => p.id).sort()).toEqual([customer.id, supplier.id].sort());

    // Only a manager can confirm.
    const denied = await api(staff.token, 'POST', '/v1/parties/links', { a: customer.id, b: supplier.id });
    expect(denied.statusCode).toBe(403);

    const linked = await api(admin.token, 'POST', '/v1/parties/links', { a: customer.id, b: supplier.id });
    expect(linked.statusCode, linked.body).toBe(200);
    const after = (await api(admin.token, 'GET', '/v1/parties?type=ORGANIZATION&q=Kilimanjaro Traders')).json().data;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ is_customer: true, is_supplier: true });
    expect(after[0].same_as).toHaveLength(1);
    // No longer suggested.
    const sugg2 = (await api(admin.token, 'GET', '/v1/parties/link-suggestions')).json().data;
    expect(sugg2.some((s: any) => [s.a.id, s.b.id].includes(customer.id))).toBe(false);

    // Undo → two rows again, and it is suggested again.
    await api(admin.token, 'POST', '/v1/parties/links/remove', { a: supplier.id, b: customer.id });
    expect((await api(admin.token, 'GET', '/v1/parties?type=ORGANIZATION&q=Kilimanjaro Traders')).json().data).toHaveLength(2);

    // "Not the same" suppresses the suggestion permanently.
    const dismissed = await api(admin.token, 'POST', '/v1/parties/links/dismiss', { a: c2.id, b: s2.id });
    expect(dismissed.statusCode, dismissed.body).toBe(200);
    const sugg3 = (await api(admin.token, 'GET', '/v1/parties/link-suggestions')).json().data;
    expect(sugg3.some((s: any) => [s.a.id, s.b.id].includes(c2.id))).toBe(false);
    expect(sugg3.some((s: any) => [s.a.id, s.b.id].includes(customer.id))).toBe(true);
  });

  it('refuses to link a person to an organization, or a company to itself', async () => {
    const person = (await api(admin.token, 'POST', '/v1/parties', { type: 'PERSON', first_name: 'Solo' })).json();
    const org = (await api(admin.token, 'POST', '/v1/parties', { type: 'ORGANIZATION', legal_name: 'Org For Link' })).json();
    const bad = await api(admin.token, 'POST', '/v1/parties/links', { a: person.id, b: org.id });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('TYPE_MISMATCH');
    const same = await api(admin.token, 'POST', '/v1/parties/links', { a: org.id, b: org.id });
    expect(same.statusCode).toBe(400);
  });

  it('shows where a company is used across apps, counting both sides of a confirmed link', async () => {
    const customer = await dbPlatform.insertInto('customers').values({ tenant_id: T.tenantId, name: 'Refs Co' } as any).returning('id').executeTakeFirstOrThrow();
    const supplier = await dbPlatform.insertInto('suppliers').values({ tenant_id: T.tenantId, name: 'Refs Co Supplies' } as any).returning('id').executeTakeFirstOrThrow();
    await dbPlatform.insertInto('leads').values({ tenant_id: T.tenantId, company: 'Refs Co', contact_name: 'X', organization_party_id: customer.id } as any).execute();
    await dbPlatform.insertInto('supplier_bills').values({ tenant_id: T.tenantId, bill_number: 'B-REF-1', supplier_id: supplier.id, supplier_name: 'Refs Co Supplies', status: 'POSTED' } as any).execute();

    const alone = (await api(admin.token, 'GET', `/v1/parties/${customer.id}/references`)).json();
    expect(alone.references).toMatchObject({ customer_records: 1, supplier_records: 0, leads: 1, supplier_bills: 0 });

    await api(admin.token, 'POST', '/v1/parties/links', { a: customer.id, b: supplier.id });
    const both = (await api(admin.token, 'GET', `/v1/parties/${customer.id}/references`)).json();
    expect(both.same_as).toEqual([supplier.id]);
    expect(both.references).toMatchObject({ customer_records: 1, supplier_records: 1, leads: 1, supplier_bills: 1 });
  });

  it('an eSign recipient is linked to the known person only when exactly one workspace-wide contact has that email', async () => {
    const app = await getApp();
    const contact = (await app.inject({ method: 'POST', url: '/v1/contacts', headers: authHeaders(admin.token), payload: { first_name: 'Sam', last_name: 'Signer', email: 'sam@signer.test' } })).json();
    const env = await dbPlatform.insertInto('sign_envelopes').values({ tenant_id: T.tenantId, created_by: admin.userId, title: 'NDA' } as any).returning('id').executeTakeFirstOrThrow();
    const rec = async (email: string) => dbPlatform.insertInto('sign_recipients').values({ envelope_id: env.id, tenant_id: T.tenantId, name: 'Whoever', email } as any).returning(['party_id', 'name'] as any).executeTakeFirstOrThrow() as any;

    const known = await rec('SAM@signer.test');
    expect(known.party_id).toBe(contact.id);
    expect(known.name).toBe('Whoever'); // the recipient's own name is never overwritten — it is the legal snapshot
    expect((await rec('nobody@elsewhere.test')).party_id).toBeNull();

    // A private contact is never auto-linked by email.
    await app.inject({ method: 'POST', url: '/v1/contacts', headers: authHeaders(admin.token), payload: { first_name: 'Hidden', email: 'hidden@signer.test', visibility: 'PRIVATE' } });
    expect((await rec('hidden@signer.test')).party_id).toBeNull();

    // Two people with the same email: ambiguous, so not guessed.
    await app.inject({ method: 'POST', url: '/v1/contacts', headers: authHeaders(admin.token), payload: { first_name: 'Twin', last_name: 'A', email: 'twin@signer.test' } });
    await app.inject({ method: 'POST', url: '/v1/contacts', headers: authHeaders(admin.token), payload: { first_name: 'Twin', last_name: 'B', email: 'twin@signer.test' } });
    expect((await rec('twin@signer.test')).party_id).toBeNull();
  });
});
