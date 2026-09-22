// NexusHR staff-record access tiers. Found live: any user holding the MANAGER
// role received every employee's salary, national ID and bank details, because
// GET /v1/hr/staff/:id only checked the role — and MANAGER on this platform is
// an operations role, not "line manager of everyone". Access is now tiered by
// a real reporting line (org_chart_nodes.parent_id), and what a tier may not
// see is absent from the response, not merely hidden by the UI.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function placeOnChart(tenantId: string, userId: string, label: string, parentId: string | null): Promise<string> {
  const row = await dbPlatform.insertInto('org_chart_nodes')
    .values({ tenant_id: tenantId, user_id: userId, label, parent_id: parentId, position_x: 0, position_y: 0 })
    .returning('id').executeTakeFirstOrThrow();
  return row.id;
}

describe('NexusHR — staff record access tiers (manager = a real reporting line)', () => {
  let T: TestTenant;
  let employee: { userId: string; token: string };
  let directManager: { userId: string; token: string };
  let skipLevel: { userId: string; token: string };
  let unrelatedManager: { userId: string; token: string };
  let peer: { userId: string; token: string };

  beforeAll(async () => {
    const app = await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    employee = await T.addUser('JUNIOR');
    directManager = await T.addUser('MANAGER');
    skipLevel = await T.addUser('MANAGER');
    unrelatedManager = await T.addUser('MANAGER');
    peer = await T.addUser('SALES');

    // skipLevel -> directManager -> employee
    const top = await placeOnChart(T.tenantId, skipLevel.userId, 'Director', null);
    const mid = await placeOnChart(T.tenantId, directManager.userId, 'Team lead', top);
    await placeOnChart(T.tenantId, employee.userId, 'Analyst', mid);

    // Give the employee real pay + identity data (an admin may set pay).
    const set = await app.inject({
      method: 'PATCH', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(T.token),
      payload: { national_id: 'NIDA-123456', tax_id: 'TIN-777', basic_salary: 2500000, pay_currency: 'TZS', bank_name: 'CRDB', bank_account_no: '0150123456789' },
    });
    expect(set.statusCode).toBe(200);
  });

  afterAll(async () => { await T.cleanup(); });

  const PAY = ['basic_salary', 'pay_currency', 'pay_method', 'bank_name', 'bank_branch', 'bank_account_no', 'bank_account_name', 'mobile_money_provider', 'mobile_money_number'];
  const IDENT = ['national_id', 'tax_id', 'social_security_no', 'health_insurance_no', 'pension_fund', 'tax_residency'];

  it('the employee sees their own full record, pay included', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(employee.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().record_access).toBe('full');
    expect(res.json().basic_salary).toBeDefined();
    expect(res.json().bank_account_no).toBe('0150123456789');
  });

  it('an admin sees the full record', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(T.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().record_access).toBe('full');
    expect(res.json().national_id).toBe('NIDA-123456');
    expect(res.json().basic_salary).toBeDefined();
  });

  it("a direct manager sees identity details but NOT pay — the same split the PATCH route already enforces", async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(directManager.token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.record_access).toBe('team');
    expect(body.national_id).toBe('NIDA-123456');
    for (const k of PAY) expect(body[k], `pay field ${k} must be absent`).toBeUndefined();
  });

  it('a skip-level manager (a manager of the manager) counts as being in the reporting line', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(skipLevel.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().record_access).toBe('team');
  });

  it('an unrelated MANAGER gets the directory view only — no pay and no identity numbers in the response', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(unrelatedManager.token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.record_access).toBe('directory');
    expect(body.name).toBeDefined();
    for (const k of [...PAY, ...IDENT]) expect(body[k], `${k} must be absent`).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('NIDA-123456');
    expect(JSON.stringify(body)).not.toContain('0150123456789');
  });

  it('a manager is not in the reporting line of someone ABOVE them (the chain only runs upward)', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/hr/staff/${skipLevel.userId}`, headers: authHeaders(directManager.token) });
    expect(res.json().record_access).toBe('directory');
  });

  it('a non-manager peer is refused outright (403)', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(peer.token) });
    expect(res.statusCode).toBe(403);
  });

  it("sub-resources need a real relationship: the direct manager may open them, an unrelated manager may not", async () => {
    const app = await getApp();
    const ok = await app.inject({ method: 'GET', url: `/v1/hr/staff/${employee.userId}/activity`, headers: authHeaders(directManager.token) });
    expect(ok.statusCode).toBe(200);
    const denied = await app.inject({ method: 'GET', url: `/v1/hr/staff/${employee.userId}/activity`, headers: authHeaders(unrelatedManager.token) });
    expect(denied.statusCode).toBe(403);
  });

  it('writes follow the same rule: an unrelated manager cannot overwrite identity numbers, a direct manager can, and pay stays admin-only', async () => {
    const app = await getApp();
    const unrelated = await app.inject({ method: 'PATCH', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(unrelatedManager.token), payload: { national_id: 'HIJACKED' } });
    expect(unrelated.statusCode).toBe(403);

    const direct = await app.inject({ method: 'PATCH', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(directManager.token), payload: { tax_id: 'TIN-888' } });
    expect(direct.statusCode).toBe(200);

    const directPay = await app.inject({ method: 'PATCH', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(directManager.token), payload: { basic_salary: 9999999 } });
    expect(directPay.statusCode).toBe(403);

    // The rejected write really didn't land.
    const admin = await app.inject({ method: 'GET', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(T.token) });
    expect(admin.json().national_id).toBe('NIDA-123456');
    expect(admin.json().tax_id).toBe('TIN-888');
  });

  it("a write's response is a read too: re-saving a phone number must not echo back pay or identity numbers to a manager", async () => {
    const app = await getApp();
    const unrelated = await app.inject({ method: 'PATCH', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(unrelatedManager.token), payload: { phone: '+255700000001' } });
    expect(unrelated.statusCode).toBe(200);
    for (const k of [...PAY, ...IDENT]) expect(unrelated.json()[k], `${k} must not be echoed to an unrelated manager`).toBeUndefined();
    expect(JSON.stringify(unrelated.json())).not.toContain('0150123456789');

    const direct = await app.inject({ method: 'PATCH', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(directManager.token), payload: { phone: '+255700000002' } });
    expect(direct.statusCode).toBe(200);
    for (const k of PAY) expect(direct.json()[k], `pay field ${k} must not be echoed to a direct manager`).toBeUndefined();
    expect(direct.json().national_id).toBe('NIDA-123456');

    const admin = await app.inject({ method: 'PATCH', url: `/v1/hr/staff/${employee.userId}`, headers: authHeaders(T.token), payload: { phone: '+255700000003' } });
    expect(admin.json().bank_account_no).toBe('0150123456789');
  });

  it('a person not placed on the org chart has no manager — fails closed to directory view, and a parent_id cycle cannot hang the lookup', async () => {
    const app = await getApp();
    const orphan = await T.addUser('JUNIOR');
    const notPlaced = await app.inject({ method: 'GET', url: `/v1/hr/staff/${orphan.userId}`, headers: authHeaders(directManager.token) });
    expect(notPlaced.json().record_access).toBe('directory');

    // Corrupt chart: two nodes each other's parent, target sits inside the loop.
    const a = await placeOnChart(T.tenantId, orphan.userId, 'Loop A', null);
    const other = await T.addUser('JUNIOR');
    const b = await placeOnChart(T.tenantId, other.userId, 'Loop B', a);
    await dbPlatform.updateTable('org_chart_nodes').set({ parent_id: b }).where('id', '=', a).execute();
    const started = Date.now();
    const looped = await app.inject({ method: 'GET', url: `/v1/hr/staff/${orphan.userId}`, headers: authHeaders(unrelatedManager.token) });
    expect(looped.statusCode).toBe(200);
    expect(looped.json().record_access).toBe('directory');
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
