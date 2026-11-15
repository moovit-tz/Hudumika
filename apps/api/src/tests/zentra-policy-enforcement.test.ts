// Zentra access policies enforced inside the apps (zentra-enforce.service.ts):
// a deny hides records from lists and blocks opening them, an allow is an
// exception to a deny, policies never widen what the app already allows, and
// a workspace with no policies is untouched.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

describe('Zentra policies enforced in apps', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant;
  let senior: { userId: string; token: string };
  let mine: string, theirs: string;

  const get = (token: string, url: string) => app.inject({ method: 'GET', url, headers: authHeaders(token) });
  const listIds = async (token: string) => {
    const r = await get(token, '/v1/customers');
    expect(r.statusCode).toBe(200);
    const body = r.json();
    const rows = Array.isArray(body) ? body : (body.data ?? body.items ?? []);
    return rows.map((c: any) => c.id) as string[];
  };
  const addPolicy = (p: Record<string, unknown>) => app.inject({
    method: 'POST', url: '/v1/zentra/policies', headers: authHeaders(A.token),
    payload: { resource_type: 'customer', action: 'read', subject_type: 'role', subject_id: 'SENIOR', condition_type: 'always', ...p } as any,
  });

  beforeAll(async () => {
    app = await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', A.tenantId).execute();
    senior = await A.addUser('SENIOR');
    const ins = (name: string, officer: string | null) => withTenant(A.tenantId, trx => trx.insertInto('customers')
      .values({ tenant_id: A.tenantId, name, assigned_officer_id: officer } as any).returning('id').executeTakeFirstOrThrow());
    mine = (await ins('Assigned to senior', senior.userId)).id;
    theirs = (await ins('Someone else\'s', null)).id;
  }, 60_000);

  afterAll(async () => { await A?.cleanup(); }, 240_000);

  it('changes nothing while the workspace has no policies', async () => {
    const ids = await listIds(senior.token);
    expect(ids).toEqual(expect.arrayContaining([mine, theirs]));
    expect((await get(senior.token, `/v1/customers/${theirs}`)).statusCode).toBe(200);
  });

  it('a deny hides records from the list and blocks opening them', async () => {
    const r = await addPolicy({ name: 'Seniors: no customers', effect: 'deny' });
    expect(r.statusCode).toBeLessThan(300);
    expect(await listIds(senior.token)).toHaveLength(0);
    const d = await get(senior.token, `/v1/customers/${theirs}`);
    expect(d.statusCode).toBe(403);
    expect(d.json().code).toBe('ZENTRA_POLICY_DENIED');
    // Admins are not the policy's subject.
    expect(await listIds(A.token)).toEqual(expect.arrayContaining([mine, theirs]));
  });

  it('an allow is an exception to the deny', async () => {
    const r = await addPolicy({ name: 'Seniors: their own customers', effect: 'allow', condition_type: 'assigned_only' });
    expect(r.statusCode).toBeLessThan(300);
    const ids = await listIds(senior.token);
    expect(ids).toEqual([mine]);
    expect((await get(senior.token, `/v1/customers/${mine}`)).statusCode).toBe(200);
    expect((await get(senior.token, `/v1/customers/${theirs}`)).statusCode).toBe(403);
  });

  it('the simulator agrees with the apps', async () => {
    const check = (id: string) => app.inject({
      method: 'POST', url: '/v1/zentra/auth/check', headers: authHeaders(A.token),
      payload: { action: 'read', resource_type: 'customer', resource_id: id, as_user_id: senior.userId, as_role: 'SENIOR' } as any,
    });
    const a = await check(mine), b = await check(theirs);
    expect(a.json().allowed).toBe(true);
    expect(b.json().allowed).toBe(false);
  });

  it('removing the deny restores access', async () => {
    const policies = (await get(A.token, '/v1/zentra/policies')).json();
    const list = Array.isArray(policies) ? policies : policies.policies;
    const deny = list.find((p: any) => p.effect === 'deny');
    const del = await app.inject({ method: 'DELETE', url: `/v1/zentra/policies/${deny.id}`, headers: authHeaders(A.token) });
    expect(del.statusCode).toBeLessThan(300);
    expect(await listIds(senior.token)).toEqual(expect.arrayContaining([mine, theirs]));
  });

  const clearPolicies = async () => {
    const res = (await get(A.token, '/v1/zentra/policies')).json();
    for (const p of (Array.isArray(res) ? res : res.policies)) {
      await app.inject({ method: 'DELETE', url: `/v1/zentra/policies/${p.id}`, headers: authHeaders(A.token) });
    }
  };

  it('hides denied records from global search', async () => {
    await clearPolicies();
    const search = async () => {
      const r = await get(senior.token, '/v1/search?q=' + encodeURIComponent("Someone else"));
      expect(r.statusCode).toBe(200);
      return ((r.json().data?.customers ?? []) as any[]).map(c => c.id);
    };
    expect(await search()).toContain(theirs);
    await addPolicy({ name: 'Seniors: no customers', effect: 'deny' });
    expect(await search()).not.toContain(theirs);
    await clearPolicies();
  });

  it('applies department ("team") conditions and department subjects', async () => {
    const dept = await withTenant(A.tenantId, trx => trx.insertInto('hr_departments')
      .values({ tenant_id: A.tenantId, name: 'Clearing desk' } as any).returning('id').executeTakeFirstOrThrow());
    const peer = await A.addUser('SENIOR');
    await dbPlatform.updateTable('users').set({ department_id: dept.id } as any).where('id', 'in', [senior.userId, peer.userId]).execute();
    const peers = await withTenant(A.tenantId, trx => trx.insertInto('customers')
      .values({ tenant_id: A.tenantId, name: 'Peer customer', assigned_officer_id: peer.userId } as any).returning('id').executeTakeFirstOrThrow());

    // Deny all, except records assigned within their own department.
    await addPolicy({ name: 'Seniors: no customers', effect: 'deny' });
    await addPolicy({ name: 'Seniors: department customers', effect: 'allow', condition_type: 'team_only' });
    // The department cache holds for 30 s; this suite moved users between departments just now.
    await sleep(31_000);
    const ids = await listIds(senior.token);
    expect(ids).toEqual(expect.arrayContaining([mine, peers.id]));
    expect(ids).not.toContain(theirs);
    await clearPolicies();

    // A department as the policy's subject.
    await addPolicy({ name: 'Clearing desk: no customers', effect: 'deny', subject_type: 'team', subject_id: dept.id });
    expect(await listIds(senior.token)).toHaveLength(0);
    expect(await listIds(A.token)).toEqual(expect.arrayContaining([mine, theirs])); // admin is not in the department
    await clearPolicies();
  }, 60_000);

  it('limits employee records, e.g. salaries, to the person themself', async () => {
    const other = await A.addUser('SENIOR');
    await addPolicy({ name: 'Seniors: no staff records', effect: 'deny', resource_type: 'employee' });
    await addPolicy({ name: 'Seniors: their own record', effect: 'allow', resource_type: 'employee', condition_type: 'owner_only' });
    const r = await get(senior.token, '/v1/hr/staff');
    expect(r.statusCode).toBe(200);
    const ids = (r.json() as any[]).map(u => u.id);
    expect(ids).toEqual([senior.userId]);
    const d = await get(senior.token, `/v1/hr/staff/${other.userId}`);
    expect(d.statusCode).toBe(403);
    await clearPolicies();
  });

  it('blocks exports a policy denies', async () => {
    const manager = await A.addUser('MANAGER');
    expect((await get(manager.token, '/v1/contacts/export.csv')).statusCode).toBe(200);
    await addPolicy({ name: 'Managers: no contact exports', effect: 'deny', resource_type: 'contact', action: 'export', subject_id: 'MANAGER' });
    const r = await get(manager.token, '/v1/contacts/export.csv');
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe('ZENTRA_POLICY_DENIED');
    await clearPolicies();
    expect((await get(manager.token, '/v1/contacts/export.csv')).statusCode).toBe(200);
  });
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
