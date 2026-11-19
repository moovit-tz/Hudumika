/**
 * Staff console — authorization, landing, scope, assignment, cases, Lens
 * separation, SLA and controlled customer access, through the real routes.
 *
 * One disposable "platform" tenant holds the staff accounts; three disposable
 * customer tenants file cases through the normal workspace endpoint. The only
 * direct database write that grants access is the initial SuperAdmin grant —
 * the same bootstrap migration 919 performs for existing SUPER_ADMIN users.
 * Every other grant goes through the API as that SuperAdmin.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { sql } from 'kysely';
import { consolePathForLegacyAdmin, resolveStaffHome, safeStaffReturnPath, STAFF_ROLE_TEMPLATES } from '@hudumika/types';
import { dbPlatform } from '../db/client.js';
import { addBusinessMinutes } from '../services/staff-cases.service.js';
import { ensureStaffRoleTemplates } from '../services/staff-access.service.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

type App = Awaited<ReturnType<typeof getApp>>;
let app: App;
let P: TestTenant; let C1: TestTenant; let C2: TestTenant; let C3: TestTenant;
const U: Record<string, { userId: string; token: string }> = {};
const ids: Record<string, string> = {};
const tag = crypto.randomUUID().slice(0, 6);
const teamIds: string[] = [];
const ruleIds: string[] = [];
const lensIds: string[] = [];
let createdFallback = false;

const get = (who: string, url: string) => app.inject({ method: 'GET', url, headers: authHeaders(U[who].token) });
const send = (who: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload: unknown = {}) =>
  app.inject({ method, url, headers: authHeaders(U[who].token), payload: payload as any });
const ok = <T = any>(r: { statusCode: number; body: string; json: () => any }, code = 200): T => { expect(r.statusCode, r.body).toBe(code); return r.json(); };

async function grant(who: string, role: string) {
  return ok(await send('sa', 'POST', `/v1/staff/staff/${U[who].userId}/roles`, { role_key: role, reason: 'test setup' }));
}
async function addStaff(who: string, role: string) {
  const u = await P.addUser('MANAGER');
  U[who] = u;
  const email = (await dbPlatform.selectFrom('users').select('email').where('id', '=', u.userId).executeTakeFirstOrThrow()).email;
  ok(await send('sa', 'POST', '/v1/staff/staff', { email }));
  if (role) await grant(who, role);
}
async function fileCase(t: TestTenant, appId: string, subject: string, priority = 'NORMAL', category = 'technical') {
  const r = await app.inject({ method: 'POST', url: '/v1/platform-support/tickets', headers: authHeaders(t.token), payload: { subject, message: `${subject} — details`, app: appId, priority, category } });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
}

describe('staff console', () => {
  beforeAll(async () => {
    app = await getApp();
    await ensureStaffRoleTemplates();
    [P, C1, C2, C3] = await Promise.all([createTestTenant('TENANT_ADMIN'), createTestTenant('ADMIN'), createTestTenant('ADMIN'), createTestTenant('ADMIN')]);
    // Bootstrap: one SuperAdmin, exactly as migration 919 does for existing SUPER_ADMIN users.
    const sa = await P.addUser('MANAGER'); U.sa = sa;
    await dbPlatform.insertInto('staff_members').values({ user_id: sa.userId }).execute();
    const saRole = await dbPlatform.selectFrom('staff_roles').select('id').where('key', '=', 'superadmin').executeTakeFirstOrThrow();
    await dbPlatform.insertInto('staff_role_grants').values({ user_id: sa.userId, role_id: saRole.id, reason: 'test bootstrap' }).execute();

    U.c1Admin = { userId: C1.userId, token: C1.token }; U.c2Admin = { userId: C2.userId, token: C2.token }; U.c3Admin = { userId: C3.userId, token: C3.token };
    U.c1Manager = await C1.addUser('MANAGER');
    for (const [who, role] of [['ops', 'operations_manager'], ['lead', 'product_ops_lead'], ['agent', 'operations_agent'], ['agent2', 'operations_agent'], ['csm', 'customer_success_manager'],
      ['security', 'security_admin'], ['billing', 'billing_admin'], ['engineer', 'platform_engineer'], ['auditor', 'auditor'], ['multi', 'operations_agent'], ['norole', '']] as const) await addStaff(who, role);
    await grant('multi', 'billing_admin');

    // A ClearOS product team (agent, agent2, multi), a FinOps team with nobody available, and CSM owns C1.
    const clear = ok(await send('sa', 'POST', '/v1/staff/teams', { name: `ClearOS ops ${tag}`, kind: 'product' })); teamIds.push(clear.id); ids.clearTeam = clear.id;
    ok(await send('sa', 'PUT', `/v1/staff/teams/${clear.id}/coverage`, { products: ['clearos'] }));
    for (const w of ['agent', 'agent2', 'multi', 'lead']) ok(await send('sa', 'POST', `/v1/staff/teams/${clear.id}/members`, { user_id: U[w].userId }));
    const fin = ok(await send('sa', 'POST', '/v1/staff/teams', { name: `FinOps ops ${tag}`, kind: 'product' }));
    teamIds.push(fin.id); ids.finTeam = fin.id;
    const rule = ok(await send('sa', 'POST', '/v1/staff/settings/routing-rules', { name: `finops ${tag}`, position: 1, app_id: 'finops', team_id: fin.id })); ruleIds.push(rule.id);
    ok(await send('sa', 'PUT', `/v1/staff/customers/${C1.tenantId}/ownership`, { owner_user_id: U.csm.userId, reason: 'test setup' }));

    ids.c1Clear = await fileCase(C1, 'clearos', `C1 container stuck ${tag}`, 'HIGH');
    ids.c1Fin = await fileCase(C1, 'finops', `C1 invoice wrong ${tag}`);
    ids.c2Clear = await fileCase(C2, 'clearos', `C2 declaration error ${tag}`);
    ids.c2Fin = await fileCase(C2, 'finops', `C2 payment missing ${tag}`, 'LOW', 'onboarding');
  }, 300_000);

  afterAll(async () => {
    if (ruleIds.length) await dbPlatform.deleteFrom('staff_routing_rules').where('id', 'in', ruleIds).execute();
    if (lensIds.length) { await dbPlatform.deleteFrom('lens_links').where('item_id', 'in', lensIds).execute(); await dbPlatform.deleteFrom('lens_items').where('id', 'in', lensIds).execute(); }
    for (const t of [P, C1, C2, C3]) if (t) {
      // Operator audit rows reference the staff user without ON DELETE CASCADE.
      await sql`DELETE FROM platform_operator_audit WHERE operator_id IN (SELECT id FROM users WHERE tenant_id = ${t.tenantId}) OR affected_tenant_id = ${t.tenantId}`.execute(dbPlatform);
      await sql`DELETE FROM platform_incidents WHERE created_by IN (SELECT id FROM users WHERE tenant_id = ${t.tenantId})`.execute(dbPlatform);
    }
    if (teamIds.length) await dbPlatform.deleteFrom('staff_teams').where('id', 'in', teamIds).execute();
    await Promise.all([P, C1, C2, C3].map(t => t?.cleanup()));
    for (const t of [P, C1, C2, C3]) if (t) expect(await dbPlatform.selectFrom('tenants').select('id').where('id', '=', t.tenantId).executeTakeFirst(), 'test tenant removed').toBeUndefined();
  }, 300_000);

  it('migration 919 bootstrapped existing SuperAdmins and gave existing cases SLA due times', async () => {
    const missing = await sql<{ n: number }>`SELECT count(*)::int AS n FROM users u WHERE u.role = 'SUPER_ADMIN' AND u.active IS NOT FALSE AND u.created_at < (SELECT applied_at FROM _migrations WHERE filename = '919_staff_console.sql')
      AND NOT EXISTS (SELECT 1 FROM staff_role_grants g JOIN staff_roles r ON r.id = g.role_id WHERE g.user_id = u.id AND r.key = 'superadmin')`.execute(dbPlatform);
    expect(missing.rows[0].n).toBe(0);
    const noDue = await sql<{ n: number }>`SELECT count(*)::int AS n FROM platform_support_tickets WHERE first_response_due_at IS NULL AND created_at < (SELECT applied_at FROM _migrations WHERE filename = '919_staff_console.sql')`.execute(dbPlatform);
    expect(noDue.rows[0].n).toBe(0);
    const roles = await dbPlatform.selectFrom('staff_roles').select('key').where('is_template', '=', true).execute();
    for (const t of STAFF_ROLE_TEMPLATES) expect(roles.map(r => r.key)).toContain(t.key);
  });

  it('workspace roles never open the console; existing SuperAdmin routes are unchanged', async () => {
    for (const who of ['c1Admin', 'c1Manager']) {
      expect((await get(who, '/v1/staff/me')).statusCode, who).toBe(403);
      expect((await get(who, '/v1/staff/customers')).statusCode, who).toBe(403);
      expect((await get(who, `/v1/staff/cases/${ids.c1Clear}`)).statusCode, who).toBe(403);
    }
    // A SUPER_ADMIN account keeps the platform APIs (the bootstrap/emergency path)…
    const legacy = await P.addUser('SUPER_ADMIN' as any); U.legacy = legacy;
    expect((await get('legacy', '/v1/superadmin/tenants')).statusCode).toBe(200);
    // …and, now that /admin redirects into the console, becomes SuperAdmin staff on first visit.
    const legacyMe = ok(await get('legacy', '/v1/staff/me'));
    expect(legacyMe.isSuperAdmin).toBe(true);
    expect(legacyMe.tools).toContain('signing-cert');
    // The SuperAdmin staff role reaches the former /admin APIs without the account flag.
    expect((await get('sa', '/v1/superadmin/tenants')).statusCode).toBe(200);
    // An impersonation token never acts as staff.
    const imp = app.jwt.sign({ sub: U.sa.userId, tenant_id: P.tenantId, role: 'MANAGER', email: 'x@x.invalid', name: 'x', typ: 'access', impersonated_by: U.legacy.userId } as any);
    expect((await app.inject({ method: 'GET', url: '/v1/staff/me', headers: { authorization: `Bearer ${imp}` } })).statusCode).toBe(403);
    await dbPlatform.deleteFrom('users').where('id', '=', legacy.userId).execute();
  });

  it('former /admin tools: permission plus platform-wide scope, mirrored in /me', async () => {
    // Billing admin (broad scope) reads billing tools but not platform configuration or customer business records.
    expect((await get('billing', '/v1/superadmin/transactions?limit=5')).statusCode).toBe(200);
    expect((await get('billing', `/v1/superadmin/tenants/${C1.tenantId}/finance`)).statusCode).toBe(200);
    const denied = await get('billing', '/v1/superadmin/settings');
    expect(denied.statusCode).toBe(403); expect(denied.json().code).toBe('superadmin_only');
    expect((await get('billing', `/v1/superadmin/tenants/${C1.tenantId}/customers`)).statusCode).toBe(403);
    const noPerm = await get('billing', '/v1/superadmin/domains');
    expect(noPerm.statusCode).toBe(403); expect(noPerm.json().code).toBe('permission');
    expect((await get('auditor', '/v1/superadmin/activity')).statusCode).toBe(200);
    // Scoped staff are refused the unfiltered cross-customer tools, even with the permission.
    const scoped = await get('ops', '/v1/superadmin/tenants');
    expect(scoped.statusCode).toBe(403); expect(scoped.json().code).toBe('scope');
    expect((await get('agent', '/v1/superadmin/dashboard-stats')).statusCode).toBe(403);
    // Workspace roles never reach them.
    for (const who of ['c1Admin', 'c1Manager']) expect((await get(who, '/v1/superadmin/tenants')).statusCode, who).toBe(403);
    // The header's console link shows for staff only, and grants nothing by itself.
    expect(ok(await get('billing', '/v1/staff-entry')).staff).toBe(true);
    expect(ok(await get('norole', '/v1/staff-entry')).staff).toBe(true);
    for (const who of ['c1Admin', 'c1Manager']) expect(ok(await get(who, '/v1/staff-entry')).staff, who).toBe(false);
    // /me lists exactly the tools the API allows.
    const bill = ok(await get('billing', '/v1/staff/me'));
    expect(bill.platformWide).toBe(true);
    expect(bill.tools.sort()).toEqual(['activity', 'announcements', 'companies', 'finance', 'kyb', 'packages', 'referrals', 'subscriptions', 'transactions'].sort());
    const ops = ok(await get('ops', '/v1/staff/me'));
    expect(ops.platformWide).toBe(false); expect(ops.tools).toEqual([]);
    expect(safeStaffReturnPath('/console/billing/transactions', bill.permissions, bill.tools)).toBe('/console/billing/transactions');
    expect(safeStaffReturnPath('/console/settings/signing-cert', bill.permissions, bill.tools)).toBeNull();
    // A staff-path mutation is audited (this one fails validation; the attempt is still recorded).
    const r = await send('billing', 'POST', '/v1/superadmin/provider-rates', {});
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    // Written in onResponse, i.e. after inject() resolves — wait for it.
    let row: { action: string; outcome: string } | undefined;
    for (let i = 0; i < 40 && !row; i++) {
      row = await dbPlatform.selectFrom('staff_audit_log').select(['action', 'outcome']).where('actor_user_id', '=', U.billing.userId).where('action', '=', 'platform_admin.post').executeTakeFirst();
      if (!row) await new Promise(r => setTimeout(r, 50));
    }
    expect(row?.outcome).toBe('error');
  });

  it('staff console work does not consume the staff member’s workspace plan quota', async () => {
    const used = async () => (await sql<{ n: number }>`SELECT coalesce(sum(count), 0)::int AS n FROM tenant_usage_counters WHERE tenant_id = ${P.tenantId}`.execute(dbPlatform)).rows[0].n;
    const before = await used();
    ok(await send('sa', 'POST', `/v1/staff/cases/${ids.c1Clear}/notes`, { content: 'Quota check: internal note from the console' }));
    await new Promise(r => setTimeout(r, 300)); // usage is counted in onResponse
    expect(await used()).toBe(before);
  });

  it('former /admin URLs redirect to their console pages', () => {
    expect(consolePathForLegacyAdmin('/admin/companies')).toBe('/console/customers/companies');
    expect(consolePathForLegacyAdmin('/admin/issues')).toBe('/console/cases');
    expect(consolePathForLegacyAdmin('/admin/design-system', '?section=apps')).toBe('/console/settings/design-system?section=apps');
    expect(consolePathForLegacyAdmin('/admin/branding')).toBe('/console/settings/design-system?section=identity');
    expect(consolePathForLegacyAdmin('/admin')).toBe('/console');
    expect(consolePathForLegacyAdmin('/admin/nope')).toBeNull();
  });

  it('each role lands on its documented home with matching sections', async () => {
    const expected: Record<string, [string, string[]]> = {
      sa: ['platform', ['overview', 'customers', 'products', 'teams', 'cases', 'security', 'billing', 'audit', 'settings']],
      ops: ['operations', ['overview', 'my-work', 'customers', 'cases', 'teams']], lead: ['product', ['products', 'cases']],
      agent: ['my_work', ['my-work', 'cases']], csm: ['my_customers', ['customers', 'my-work']], security: ['security', ['security', 'audit']],
      billing: ['billing', ['billing']], engineer: ['service_health', ['overview', 'cases']], auditor: ['audit', ['audit']],
    };
    for (const [who, [home, sections]] of Object.entries(expected)) {
      const me = ok(await get(who, '/v1/staff/me'));
      expect(me.home, who).toBe(home);
      for (const s of sections) expect(me.sections, `${who} sees ${s}`).toContain(s);
    }
    const agent = ok(await get('agent', '/v1/staff/me'));
    for (const s of ['security', 'billing', 'audit', 'settings']) expect(agent.sections).not.toContain(s);
    // Staff with no role: a member, but no sections and no home.
    const none = ok(await get('norole', '/v1/staff/me'));
    expect(none.sections).toEqual([]); expect(none.home).toBeNull();
    expect((await get('norole', '/v1/staff/cases')).statusCode).toBe(403);
  });

  it('multiple roles combine; a chosen home is kept while allowed and falls back when it is not', async () => {
    const me = ok(await get('multi', '/v1/staff/me'));
    expect(me.home).toBe('my_work'); // first role's default
    for (const s of ['my-work', 'cases', 'billing']) expect(me.sections).toContain(s);
    expect((await send('multi', 'PUT', '/v1/staff/me/home', { home: 'security' })).statusCode).toBe(400);
    ok(await send('multi', 'PUT', '/v1/staff/me/home', { home: 'billing' }));
    expect(ok(await get('multi', '/v1/staff/me')).home).toBe('billing');
    const grants = ok(await get('sa', '/v1/staff/staff')).items.find((s: any) => s.user_id === U.multi.userId).roles;
    ok(await send('sa', 'DELETE', `/v1/staff/staff/${U.multi.userId}/roles/${grants.find((g: any) => g.key === 'billing_admin').id}`));
    const after = ok(await get('multi', '/v1/staff/me'));
    expect(after.home).toBe('my_work');
    expect(after.sections).not.toContain('billing');
    expect((await get('multi', '/v1/staff/billing')).statusCode).toBe(403);
  });

  it('return destinations are internal and permitted only', () => {
    const agentPerms = STAFF_ROLE_TEMPLATES.find(t => t.key === 'operations_agent')!.permissions;
    expect(safeStaffReturnPath('/console/cases/abc?x=1', agentPerms)).toBe('/console/cases/abc?x=1');
    for (const bad of ['https://evil.example/console/cases', '//evil.example/console/cases', '/console/../admin', '/\\evil', '/console/billing', '/admin/settings', 'javascript:alert(1)'])
      expect(safeStaffReturnPath(bad, agentPerms), bad).toBeNull();
    expect(resolveStaffHome(agentPerms, ['billing', null])).toBe('my_work');
    expect(resolveStaffHome([], ['platform'])).toBeNull();
  });

  it('product and customer scope restrict lists, counts, search, records and exports', async () => {
    // Agent: ClearOS product team → ClearOS cases of every customer, nothing else.
    const agentCases = ok(await get('agent', '/v1/staff/cases?queue=all&limit=200')).items.map((c: any) => c.id);
    expect(agentCases).toEqual(expect.arrayContaining([ids.c1Clear, ids.c2Clear]));
    expect(agentCases).not.toContain(ids.c1Fin); expect(agentCases).not.toContain(ids.c2Fin);
    expect((await get('agent', `/v1/staff/cases/${ids.c2Fin}`)).statusCode).toBe(404);
    expect((await send('agent', 'PATCH', `/v1/staff/cases/${ids.c2Fin}`, { version: 1, status: 'RESOLVED' })).statusCode).toBe(404);
    expect(ok(await get('agent', `/v1/staff/cases?queue=all&q=${encodeURIComponent('payment missing ' + tag)}`)).items).toHaveLength(0);
    // No customer coverage → no customer relationship data, even for a customer whose ClearOS case they work.
    expect(ok(await get('agent', '/v1/staff/customers')).items).toHaveLength(0);
    expect((await get('agent', `/v1/staff/customers/${C1.tenantId}`)).statusCode).toBe(404);
    // CSM owns C1 → C1 and both its cases; not C2.
    const csmCustomers = ok(await get('csm', '/v1/staff/customers?limit=200')).items.map((c: any) => c.id);
    expect(csmCustomers).toEqual([C1.tenantId]);
    expect((await get('csm', `/v1/staff/customers/${C2.tenantId}`)).statusCode).toBe(404);
    const csmCases = ok(await get('csm', '/v1/staff/cases?queue=all&limit=200')).items.map((c: any) => c.id);
    expect(csmCases).toEqual(expect.arrayContaining([ids.c1Clear, ids.c1Fin]));
    expect(csmCases).not.toContain(ids.c2Clear);
    const ov = ok(await get('csm', '/v1/staff/overview'));
    expect(ov.customers.customers).toBe(1);
    // Exports are a separate permission and follow the same scope.
    expect((await get('csm', '/v1/staff/customers/export')).statusCode).toBe(403);
    const exp = await get('ops', '/v1/staff/cases/export?queue=all');
    expect(exp.statusCode).toBe(200);
    expect(exp.body).not.toContain(tag); // ops has no teams or customers yet
    // Sensitive areas need their own permissions.
    for (const url of ['/v1/staff/security', '/v1/staff/billing', '/v1/staff/audit', '/v1/staff/settings', '/v1/staff/staff']) expect((await get('agent', url)).statusCode, url).toBe(403);
    // The customer profile shows billing only to billing roles.
    expect(ok(await get('csm', `/v1/staff/customers/${C1.tenantId}`)).billing).toEqual({ restricted: true });
    expect(ok(await get('sa', `/v1/staff/customers/${C1.tenantId}`)).billing.restricted).toBe(false);
  });

  it('product → customers → cases and customer → cases reference the same records', async () => {
    const prod = ok(await get('sa', '/v1/staff/products/clearos'));
    const fromProduct = prod.cases.filter((c: any) => c.tenant_id === C1.tenantId).map((c: any) => c.id);
    expect(prod.affectedCustomers.map((c: any) => c.tenant_id)).toContain(C1.tenantId);
    const profile = ok(await get('sa', `/v1/staff/customers/${C1.tenantId}`));
    const fromCustomer = profile.cases.filter((c: any) => c.app === 'clearos').map((c: any) => c.id);
    expect(fromProduct.sort()).toEqual(fromCustomer.sort());
    // Entitlement, activation and health are separate fields.
    const clear = profile.products.find((p: any) => p.app === 'clearos');
    expect(clear).toHaveProperty('entitled'); expect(clear).toHaveProperty('activated'); expect(clear).toHaveProperty('health');
  });

  it('routing explains itself; claims are atomic; stale reassignment is refused', async () => {
    const c = ok(await get('sa', `/v1/staff/cases/${ids.c1Clear}`)).case;
    expect(c.team_id).toBe(ids.clearTeam);
    expect(c.routing_reason).toMatch(/covers clearos/);
    const f = ok(await get('sa', `/v1/staff/cases/${ids.c1Fin}`)).case;
    expect(f.team_id).toBe(ids.finTeam);
    expect(f.owner_user_id).toBeNull();
    expect(f.routing_reason).toMatch(/Rule “finops .*” matched.*No available team member/);
    // Two operators claim the same unowned case at once: exactly one wins.
    const c2 = ok(await get('sa', `/v1/staff/cases/${ids.c2Clear}`)).case;
    if (c2.owner_user_id) ok(await send('sa', 'POST', `/v1/staff/cases/${ids.c2Clear}/assign`, { owner_user_id: null, version: c2.version, reason: 'reset for claim test' }));
    const fresh = ok(await get('sa', `/v1/staff/cases/${ids.c2Clear}`)).case;
    const [a, b] = await Promise.all([send('agent', 'POST', `/v1/staff/cases/${ids.c2Clear}/claim`, { version: fresh.version }), send('agent2', 'POST', `/v1/staff/cases/${ids.c2Clear}/claim`, { version: fresh.version })]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const winner = a.statusCode === 200 ? U.agent.userId : U.agent2.userId;
    expect(ok(await get('sa', `/v1/staff/cases/${ids.c2Clear}`)).case.owner_user_id).toBe(winner);
    // Stale version: refused, nothing changes.
    expect((await send('ops', 'POST', `/v1/staff/cases/${ids.c2Clear}/assign`, { owner_user_id: null, version: fresh.version, reason: 'stale' })).statusCode).toBe(404); // ops lacks scope
    expect((await send('sa', 'POST', `/v1/staff/cases/${ids.c2Clear}/assign`, { owner_user_id: null, version: fresh.version, reason: 'stale' })).statusCode).toBe(409);
    // Cannot hand a case to someone who has no access to it.
    const cur = ok(await get('sa', `/v1/staff/cases/${ids.c2Fin}`)).case;
    expect((await send('sa', 'POST', `/v1/staff/cases/${ids.c2Fin}/assign`, { owner_user_id: U.agent.userId, version: cur.version, reason: 'wrong person' })).statusCode).toBe(400);
  });

  it('removing a team member or role takes effect at once, and open work is surfaced, not deleted', async () => {
    const c = ok(await get('sa', `/v1/staff/cases/${ids.c1Clear}`)).case;
    if (c.owner_user_id !== U.agent2.userId) ok(await send('sa', 'POST', `/v1/staff/cases/${ids.c1Clear}/assign`, { owner_user_id: U.agent2.userId, version: c.version, reason: 'set owner' }));
    const removed = ok(await send('sa', 'DELETE', `/v1/staff/teams/${ids.clearTeam}/members/${U.agent2.userId}`));
    expect(removed.openCasesNeedingReassignment.map((x: any) => x.id)).toContain(ids.c1Clear);
    // Next request: agent2 no longer sees ClearOS cases…
    expect(ok(await get('agent2', '/v1/staff/cases?queue=all&limit=200')).items.map((x: any) => x.id)).not.toContain(ids.c1Clear);
    expect((await get('agent2', `/v1/staff/cases/${ids.c1Clear}`)).statusCode).toBe(404);
    // …the case still exists, still owned, and shows up for reassignment.
    const stranded = ok(await get('sa', '/v1/staff/work/needs-reassignment')).items;
    expect(stranded.find((x: any) => x.id === ids.c1Clear)?.reason).toMatch(/left the case's team/);
    // A role that expired in the past grants nothing; a deny override beats a role.
    const role = await dbPlatform.selectFrom('staff_roles').select('id').where('key', '=', 'auditor').executeTakeFirstOrThrow();
    await dbPlatform.insertInto('staff_role_grants').values({ user_id: U.norole.userId, role_id: role.id, starts_at: new Date(Date.now() - 7200_000), expires_at: new Date(Date.now() - 3600_000), reason: 'expired' }).execute();
    expect(ok(await get('norole', '/v1/staff/me')).sections).toEqual([]);
    ok(await send('sa', 'POST', `/v1/staff/staff/${U.ops.userId}/overrides`, { permission: 'cases.export', effect: 'deny', reason: 'no exports' }));
    expect((await get('ops', '/v1/staff/cases/export')).statusCode).toBe(403);
    // Suspending a staff member ends everything.
    ok(await send('sa', 'PATCH', `/v1/staff/staff/${U.agent2.userId}`, { status: 'suspended' }));
    expect((await get('agent2', '/v1/staff/me')).statusCode).toBe(403);
  });

  it('no self-escalation, no granting what you do not hold', async () => {
    expect((await send('sa', 'POST', `/v1/staff/staff/${U.sa.userId}/roles`, { role_key: 'auditor', reason: 'self' })).json().code).toBe('self_escalation');
    expect((await send('ops', 'POST', `/v1/staff/staff/${U.agent.userId}/roles`, { role_key: 'auditor', reason: 'no manage permission' })).statusCode).toBe(403); // no staff.manage
    // Give ops staff.manage only: they still cannot grant a role with permissions they lack.
    ok(await send('sa', 'POST', `/v1/staff/staff/${U.ops.userId}/overrides`, { permission: 'staff.manage', effect: 'allow', reason: 'delegate' }));
    const esc = await send('ops', 'POST', `/v1/staff/staff/${U.agent.userId}/roles`, { role_key: 'billing_admin', reason: 'delegated grant' });
    expect(esc.statusCode).toBe(403); expect(esc.json().code).toBe('escalation');
    expect((await send('ops', 'POST', `/v1/staff/staff/${U.agent.userId}/scopes`, { scope_type: 'all_customers', reason: 'delegated grant' })).json().code).toBe('escalation');
    expect((await send('ops', 'POST', `/v1/staff/teams/${ids.clearTeam}/members`, { user_id: U.ops.userId })).json().code).toBe('self_escalation'); // joining a team grants its coverage
    expect((await send('ops', 'PATCH', '/v1/staff/roles/operations_manager', { permissions: ['staff.manage'] })).json().code).toMatch(/escalation|self_escalation/);
    expect((await send('sa', 'PATCH', '/v1/staff/roles/superadmin', { name: 'x' })).statusCode).toBe(403);
    // SuperAdmin cannot suspend themself.
    expect((await send('sa', 'PATCH', `/v1/staff/staff/${U.sa.userId}`, { status: 'suspended' })).json().code).toBe('self_escalation');
  });

  it('Lens issues and customer cases keep separate lifecycles and visibility', async () => {
    const item = await dbPlatform.insertInto('lens_items').values({ ref: `LENS-T${tag}`, kind: 'BUG', title: `Container stuck ${tag}` } as any).returning('id').executeTakeFirstOrThrow();
    lensIds.push(item.id);
    ok(await send('lead', 'POST', `/v1/staff/cases/${ids.c2Clear}/lens`, { lens_item_id: item.id }));
    await dbPlatform.updateTable('lens_items').set({ status: 'DONE', resolution: 'Fixed in release', verification_status: 'VERIFIED' } as any).where('id', '=', item.id).execute();
    const view = ok(await get('lead', `/v1/staff/cases/${ids.c2Clear}`));
    expect(view.lens[0]).toMatchObject({ status: 'DONE' });
    expect(['OPEN', 'IN_PROGRESS']).toContain(view.case.status); // engineering done ≠ case resolved
    expect(view.case.customer_outcome).toBe('pending');
    expect(ok(await get('csm', `/v1/staff/cases/${ids.c1Clear}`)).lens).toEqual({ restricted: true }); // CSM has no lens.view
    // Customer outcome needs a resolved case and an explicit confirmation.
    expect((await send('lead', 'POST', `/v1/staff/cases/${ids.c2Clear}/outcome`, { outcome: 'confirmed', note: 'customer said ok' })).statusCode).toBe(409);
    // Internal notes never reach the workspace; replies do, and set the first response.
    ok(await send('lead', 'POST', `/v1/staff/cases/${ids.c2Clear}/notes`, { content: `INTERNAL ${tag}` }));
    ok(await send('lead', 'POST', `/v1/staff/cases/${ids.c2Clear}/reply`, { content: `PUBLIC ${tag}` }));
    const ws = ok(await app.inject({ method: 'GET', url: `/v1/platform-support/tickets/${ids.c2Clear}`, headers: authHeaders(C2.token) }));
    const texts = ws.messages.map((m: any) => m.content).join('\n');
    expect(texts).toContain(`PUBLIC ${tag}`); expect(texts).not.toContain(`INTERNAL ${tag}`);
    for (const k of ['owner_user_id', 'team_id', 'routing_reason', 'version']) expect(ws).not.toHaveProperty(k);
    expect(ws.first_response_at).toBeTruthy();
    // Lens itself: read-only for lens.view staff, writes stay SuperAdmin-role only.
    expect((await get('engineer', '/v1/lens/items')).statusCode).toBe(200);
    expect((await get('csm', '/v1/lens/items')).statusCode).toBe(403);
    expect((await send('engineer', 'PATCH', `/v1/lens/items/${item.id}`, { title: 'x' })).statusCode).toBe(403);
  });

  it('SLA counts business hours and pauses only while waiting on the customer', async () => {
    const h = { timezone: 'Africa/Dar_es_Salaam', work_days: [1, 2, 3, 4, 5], start_minute: 480, end_minute: 1020, holidays: ['2026-12-28'] };
    // Friday 16:30 EAT + 60 business minutes → Monday 08:30 (30 min Friday + 30 min Monday).
    expect(addBusinessMinutes(new Date('2026-12-04T13:30:00Z'), 60, h).toISOString()).toBe('2026-12-07T05:30:00.000Z');
    // A holiday Monday is skipped.
    expect(addBusinessMinutes(new Date('2026-12-25T13:30:00Z'), 60, h).toISOString()).toBe('2026-12-29T05:30:00.000Z');
    const c = ok(await get('sa', `/v1/staff/cases/${ids.c1Fin}`)).case;
    const paused = ok(await send('sa', 'PATCH', `/v1/staff/cases/${ids.c1Fin}`, { version: c.version, waiting_on: 'customer' }));
    expect(paused.sla.paused).toBe(true);
    await dbPlatform.updateTable('platform_support_tickets').set({ sla_paused_at: new Date(Date.now() - 3600_000) }).where('id', '=', ids.c1Fin).execute();
    const before = new Date(paused.resolution_due_at).getTime();
    // The customer answers through the normal workspace route → clock resumes, due time moves ~1 h.
    ok(await app.inject({ method: 'POST', url: `/v1/platform-support/tickets/${ids.c1Fin}/reply`, headers: authHeaders(C1.token), payload: { message: 'here you go' } }), 201);
    const after = ok(await get('sa', `/v1/staff/cases/${ids.c1Fin}`)).case;
    expect(after.sla_paused_at).toBeNull(); expect(after.waiting_on).toBeNull();
    expect(new Date(after.resolution_due_at).getTime() - before).toBeGreaterThan(3500_000);
    expect(after.sla_paused_seconds).toBeGreaterThanOrEqual(3500);
  });

  it('controlled customer access: approval, attribution, scope, expiry and revocation', async () => {
    // Request → pending until the customer approves; nothing readable meanwhile.
    const s = ok(await send('csm', 'POST', '/v1/staff/access-sessions', { tenant_id: C1.tenantId, actions: ['read'], purpose: `Check user setup for case ${tag}`, case_id: ids.c1Fin, minutes: 15 }));
    expect(s.status).toBe('pending_approval'); expect(s.basis).toBe('customer_approval');
    expect((await get('csm', `/v1/staff/access-sessions/${s.id}/records/users`)).statusCode).toBe(403);
    expect((await send('csm', 'POST', '/v1/staff/access-sessions', { tenant_id: C1.tenantId, actions: ['read'], purpose: 'second one', minutes: 15 })).statusCode).toBe(409);
    // Another customer cannot approve it; an ordinary workspace user cannot either.
    expect((await send('c2Admin', 'POST', `/v1/platform-support/access-requests/${s.id}/approve`)).statusCode).toBe(404);
    expect((await send('c1Manager', 'POST', `/v1/platform-support/access-requests/${s.id}/approve`)).statusCode).toBe(403);
    ok(await send('c1Admin', 'POST', `/v1/platform-support/access-requests/${s.id}/approve`));
    const me = ok(await get('csm', '/v1/staff/me'));
    expect(me.activeAccessSession).toMatchObject({ id: s.id, status: 'active', tenantId: C1.tenantId });
    const users = ok(await get('csm', `/v1/staff/access-sessions/${s.id}/records/users`));
    expect(users.map((u: any) => u.id)).toContain(C1.userId);
    expect(users.map((u: any) => u.id)).not.toContain(C2.userId);
    expect(JSON.stringify(users)).not.toMatch(/password|hash/i);
    // Read-only session: configuration change refused, and the refusal is logged.
    expect((await send('csm', 'PUT', `/v1/staff/access-sessions/${s.id}/records/apps/clearos`, { enabled: false })).statusCode).toBe(403);
    const events = await dbPlatform.selectFrom('staff_access_session_events').select(['action', 'outcome']).where('session_id', '=', s.id).execute();
    expect(events).toEqual(expect.arrayContaining([{ action: 'read', outcome: 'ok' }, { action: 'configure', outcome: 'denied' }]));
    // Out-of-scope customer: cannot even request.
    expect((await send('csm', 'POST', '/v1/staff/access-sessions', { tenant_id: C2.tenantId, actions: ['read'], purpose: 'not mine', minutes: 15 })).statusCode).toBe(404);
    // Removing the ownership that justified the session ends it on the next request.
    ok(await send('sa', 'PUT', `/v1/staff/customers/${C1.tenantId}/ownership`, { owner_user_id: null, reason: 'reassigned away' }));
    expect(ok(await get('csm', '/v1/staff/me')).activeAccessSession).toBeNull();
    expect((await get('csm', `/v1/staff/access-sessions/${s.id}/records/users`)).statusCode).toBe(403);
    const row = await dbPlatform.selectFrom('staff_access_sessions').select(['status', 'end_reason']).where('id', '=', s.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status: 'revoked' });

    // Standing authorization: starts at once; expiry stops it; oversight can revoke.
    ok(await send('sa', 'PUT', `/v1/staff/customers/${C3.tenantId}/ownership`, { owner_user_id: U.csm.userId, standing_authorization: true, reason: 'managed service' }));
    const s2 = ok(await send('csm', 'POST', '/v1/staff/access-sessions', { tenant_id: C3.tenantId, actions: ['read', 'configure'], purpose: 'Managed service check', minutes: 10 }));
    expect(s2).toMatchObject({ status: 'active', basis: 'standing_authorization' });
    ok(await send('csm', 'PUT', `/v1/staff/access-sessions/${s2.id}/records/apps/clearos`, { enabled: true }));
    const audit = await dbPlatform.selectFrom('staff_audit_log').select(['actor_user_id', 'action', 'tenant_id', 'purpose']).where('target_id', '=', 'clearos').where('tenant_id', '=', C3.tenantId).executeTakeFirstOrThrow();
    expect(audit).toMatchObject({ actor_user_id: U.csm.userId, action: 'access.configure', purpose: 'Managed service check' }); // attributable to the staff member
    await dbPlatform.updateTable('staff_access_sessions').set({ expires_at: new Date(Date.now() - 1000) }).where('id', '=', s2.id).execute();
    expect((await get('csm', `/v1/staff/access-sessions/${s2.id}/records/apps`)).statusCode).toBe(403);
    expect((await dbPlatform.selectFrom('staff_access_sessions').select('status').where('id', '=', s2.id).executeTakeFirstOrThrow()).status).toBe('expired');
    const s3 = ok(await send('csm', 'POST', '/v1/staff/access-sessions', { tenant_id: C3.tenantId, actions: ['read'], purpose: 'Second managed check', minutes: 10 }));
    expect((await send('csm', 'POST', `/v1/staff/access-sessions/${s3.id}/revoke`, { reason: 'not my job' })).statusCode).toBe(403); // not oversight
    ok(await send('security', 'POST', `/v1/staff/access-sessions/${s3.id}/revoke`, { reason: 'security review' }));
    expect((await get('csm', `/v1/staff/access-sessions/${s3.id}/records/users`)).statusCode).toBe(403);
  });

  it('consequential actions are audited with actor, target and purpose, without secrets', async () => {
    const rows = await dbPlatform.selectFrom('staff_audit_log').select(['action', 'actor_user_id', 'detail']).where('actor_user_id', '=', U.sa.userId).orderBy('created_at').execute();
    const actions = rows.map(r => r.action);
    for (const a of ['staff.role_granted', 'staff.role_revoked', 'team.created', 'team.member_added', 'team.member_removed', 'customer.ownership_changed', 'staff.permission_deny']) expect(actions, a).toContain(a);
    expect(JSON.stringify(rows)).not.toMatch(/password_hash|"token"/);
    // The auditor reads; cannot change.
    expect((await get('auditor', '/v1/staff/audit')).statusCode).toBe(200);
    expect((await send('auditor', 'PATCH', `/v1/staff/cases/${ids.c1Fin}`, { version: 1, status: 'CLOSED' })).statusCode).toBe(403);
    expect((await get('auditor', '/v1/staff/audit/export')).statusCode).toBe(200);
    expect((await dbPlatform.selectFrom('staff_audit_log').select('id').where('action', '=', 'audit.export').where('actor_user_id', '=', U.auditor.userId).execute()).length).toBe(1);
  });
});
