// Axis worker records and job history (migration 911). Regression coverage
// for the lifecycle: no-login workers can't get a session by any route; a
// transfer keeps the old job; main jobs never overlap, even under concurrent
// requests; offboarding ends jobs and cancels future ones; rehire adds a new
// job instead of reopening the old; corrections keep the original row; a
// manager's request needs someone else in HR; ids from another tenant are
// refused; and one tenant never sees another's history.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

describe('Axis worker lifecycle', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant, B: TestTenant;
  let hr2: { userId: string; token: string }, manager: { userId: string; token: string }, staff: { userId: string; token: string };
  let deptOps: string, deptSales: string, foreignDept: string;
  const call = (token: string, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url: `/v1/hr${url}`, headers: authHeaders(token), payload: payload as any });
  const history = async (userId: string) => withTenant(A.tenantId, (trx) => trx.selectFrom('hr_assignments').selectAll()
    .where('tenant_id', '=', A.tenantId).where('user_id', '=', userId).orderBy('start_date').orderBy('created_at').execute());
  const d = (s: unknown) => (s instanceof Date ? s.toISOString().slice(0, 10) : String(s).slice(0, 10));

  beforeAll(async () => {
    app = await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    hr2 = await A.addUser('ADMIN');
    manager = await A.addUser('MANAGER');
    staff = await A.addUser('JUNIOR');
    const mk = (t: TestTenant, name: string) => withTenant(t.tenantId, (trx) => trx.insertInto('hr_departments').values({ tenant_id: t.tenantId, name } as any).returning('id').executeTakeFirstOrThrow());
    deptOps = (await mk(A, 'Operations')).id;
    deptSales = (await mk(A, 'Sales')).id;
    foreignDept = (await mk(B, 'Elsewhere')).id;
    // The staff member's current job, reporting to the manager.
    const r = await call(A.token, 'POST', `/workers/${staff.userId}/start-job`, { start_date: '2026-01-05', department_id: deptOps, manager_id: manager.userId });
    expect(r.statusCode).toBe(200);
  }, 120_000);
  afterAll(async () => { await A?.cleanup(); await B?.cleanup(); }, 240_000);

  let casualId: string;
  it('adds a worker with no sign-in, and no sign-in route will give them a session', async () => {
    const r = await call(A.token, 'POST', '/workers', { name: 'Juma Mfanyakazi', phone: '+255700000111', start_date: '2026-02-01', worker_type: 'CASUAL', department_id: deptOps });
    expect(r.statusCode).toBe(201);
    casualId = r.json().data.user.id;
    const u = await withTenant(A.tenantId, (trx) => trx.selectFrom('users').select(['can_login', 'email', 'department_id', 'active']).where('id', '=', casualId).executeTakeFirstOrThrow());
    expect(u).toMatchObject({ can_login: false, email: null, department_id: deptOps, active: true });
    const { recordLogin } = await import('../routes/auth.routes.js');
    await expect(recordLogin(A.tenantId, casualId, 'SUCCESS', '127.0.0.1', 'test')).rejects.toThrow(/sign-in access/);
    const devices = await withTenant(A.tenantId, (trx) => trx.selectFrom('hr_devices').select('id').where('user_id', '=', casualId).execute());
    expect(devices).toHaveLength(0);
  });

  it('turning sign-in off ends the person’s open sessions', async () => {
    const extra = await A.addUser('JUNIOR');
    const { recordLogin } = await import('../routes/auth.routes.js');
    expect(await recordLogin(A.tenantId, extra.userId, 'SUCCESS', '127.0.0.1', 'test-ua')).toBeTruthy();
    expect((await call(A.token, 'POST', `/workers/${extra.userId}/sign-in`, { can_login: false })).statusCode).toBe(200);
    const open = await withTenant(A.tenantId, (trx) => trx.selectFrom('hr_devices').select('id').where('user_id', '=', extra.userId).where('revoked_at', 'is', null).execute());
    expect(open).toHaveLength(0);
  });

  it('a transfer keeps the old job and starts a new one the next day', async () => {
    const r = await call(A.token, 'POST', `/workers/${staff.userId}/move`, { effective_date: '2026-06-01', reason: 'TRANSFER', department_id: deptSales });
    expect(r.statusCode).toBe(200);
    const h = await history(staff.userId);
    expect(h.map((a) => [d(a.start_date), a.end_date ? d(a.end_date) : null, a.start_reason, a.end_reason, a.department_id])).toEqual([
      ['2026-01-05', '2026-05-31', 'HIRE', 'TRANSFER', deptOps],
      ['2026-06-01', null, 'TRANSFER', null, deptSales],
    ]);
    expect(h[1].manager_id).toBe(manager.userId); // carried over
    const u = await withTenant(A.tenantId, (trx) => trx.selectFrom('users').select('department_id').where('id', '=', staff.userId).executeTakeFirstOrThrow());
    expect(u.department_id).toBe(deptSales); // projected
  });

  it('refuses ids from another workspace and overlapping main jobs, even when two requests race', async () => {
    expect((await call(A.token, 'POST', `/workers/${staff.userId}/move`, { effective_date: '2026-07-01', reason: 'TRANSFER', department_id: foreignDept })).statusCode).toBe(400);
    const both = await Promise.all([1, 2].map(() => call(A.token, 'POST', `/workers/${staff.userId}/start-job`, { start_date: '2026-08-01', department_id: deptOps })));
    expect(both.every((r) => r.statusCode === 409)).toBe(true);
    const open = (await history(staff.userId)).filter((a) => a.is_primary && a.status === 'ACTIVE' && !a.end_date);
    expect(open).toHaveLength(1);
  });

  it('a manager’s request waits for someone else in HR', async () => {
    const r = await call(manager.token, 'POST', `/workers/${staff.userId}/move`, { effective_date: '2026-09-01', reason: 'PROMOTION', job_title: 'Senior sales officer' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.status).toBe('PENDING');
    const pendingId = r.json().data.id;
    expect((await history(staff.userId)).filter((a) => a.status === 'ACTIVE' && !a.end_date)[0].job_title).toBeNull(); // nothing applied yet
    expect((await call(manager.token, 'POST', `/assignments/${pendingId}/decision`, { decision: 'approve' })).statusCode).toBe(403);
    const ok = await call(hr2.token, 'POST', `/assignments/${pendingId}/decision`, { decision: 'approve' });
    expect(ok.statusCode).toBe(200);
    const h = await history(staff.userId);
    expect(h.filter((a) => a.status === 'ACTIVE').map((a) => [d(a.start_date), a.end_date ? d(a.end_date) : null, a.start_reason])).toEqual([
      ['2026-01-05', '2026-05-31', 'HIRE'], ['2026-06-01', '2026-08-31', 'TRANSFER'], ['2026-09-01', null, 'PROMOTION'],
    ]);
    // A manager can't move someone outside their team.
    const other = await A.addUser('JUNIOR');
    await call(A.token, 'POST', `/workers/${other.userId}/start-job`, { start_date: '2026-01-05' });
    expect((await call(manager.token, 'POST', `/workers/${other.userId}/move`, { effective_date: '2026-09-01', reason: 'TRANSFER' })).statusCode).toBe(403);
  });

  it('a correction keeps the original row, voided with the reason', async () => {
    const cur = (await history(staff.userId)).find((a) => a.status === 'ACTIVE' && !a.end_date)!;
    const r = await call(A.token, 'POST', `/assignments/${cur.id}/correct`, { job_title: 'Senior sales officer II', reason: 'Title was entered wrongly' });
    expect(r.statusCode).toBe(200);
    const old = await withTenant(A.tenantId, (trx) => trx.selectFrom('hr_assignments').selectAll().where('id', '=', cur.id).executeTakeFirstOrThrow());
    expect(old).toMatchObject({ status: 'VOIDED', job_title: 'Senior sales officer' });
    expect(old.void_reason).toMatch(/Title was entered wrongly/);
    expect(r.json().data).toMatchObject({ corrects_id: cur.id, job_title: 'Senior sales officer II', start_reason: 'PROMOTION' });
    const log = await withTenant(A.tenantId, (trx) => trx.selectFrom('hr_activity_log').select('action').where('tenant_id', '=', A.tenantId).where('action', '=', 'lifecycle.corrected').execute());
    expect(log).toHaveLength(1);
  });

  it('offboarding ends running jobs, cancels future ones and removes access; rehire adds a new job', async () => {
    const extra = await call(A.token, 'POST', `/workers/${staff.userId}/extra-assignment`, { start_date: '2026-03-01', department_id: deptOps, fte: 0.2 });
    expect(extra.statusCode).toBe(200);
    const off = await call(A.token, 'POST', `/workers/${staff.userId}/offboard`, { last_day: '2026-10-31', reason: 'RESIGNATION' });
    expect(off.statusCode).toBe(200);
    expect(off.json().data).toMatchObject({ ended: 2, access_removed: true });
    const u = await withTenant(A.tenantId, (trx) => trx.selectFrom('users').select('active').where('id', '=', staff.userId).executeTakeFirstOrThrow());
    expect(u.active).toBe(false);
    const ended = (await history(staff.userId)).filter((a) => a.status === 'ACTIVE' && d(a.end_date) === '2026-10-31');
    expect(ended.every((a) => a.end_reason === 'RESIGNATION')).toBe(true);
    const before = (await history(staff.userId)).length;
    const back = await call(A.token, 'POST', `/workers/${staff.userId}/start-job`, { start_date: '2026-11-03', department_id: deptOps });
    expect(back.statusCode).toBe(200);
    expect(back.json().data.start_reason).toBe('REHIRE');
    const after = await history(staff.userId);
    expect(after.length).toBe(before + 1); // nothing reopened or overwritten
    expect(after.filter((a) => a.status === 'ACTIVE' && a.end_date === null)).toHaveLength(1);
  });

  it('keeps history inside its workspace and away from other staff', async () => {
    expect((await call(B.token, 'GET', `/workers/${staff.userId}/assignments`)).statusCode).toBe(200);
    expect((await call(B.token, 'GET', `/workers/${staff.userId}/assignments`)).json().data).toHaveLength(0);
    const peer = await A.addUser('JUNIOR');
    expect((await call(peer.token, 'GET', `/workers/${staff.userId}/assignments`)).statusCode).toBe(403);
    expect((await call(staff.token, 'GET', `/workers/${staff.userId}/assignments`)).statusCode).toBe(200);
    const leaked = await withTenant(B.tenantId, (trx) => trx.selectFrom('hr_assignments').select('id').where('user_id', '=', staff.userId).execute());
    expect(leaked).toHaveLength(0);
  });
});
