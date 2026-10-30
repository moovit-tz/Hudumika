import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dbPlatform, withTenant } from '../db/client.js';
import { computeAttendance } from '../services/attendance.service.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('NexusHR timesheet and KPI regression scenarios', () => {
  let tenant: TestTenant;
  let employee: { userId: string; token: string };
  let manager: { userId: string; token: string };
  const evidence: Record<string, any> = {};
  beforeAll(async () => {
    tenant = await createTestTenant();
    employee = await tenant.addUser('JUNIOR');
    manager = await tenant.addUser('MANAGER');
  }, 120000);
  afterAll(async () => {
    const dir = resolve(process.cwd(), '../../docs/audits');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'nexushr-timesheet-kpi-evidence.json'), JSON.stringify(evidence, null, 2));
    await tenant?.cleanup();
  }, 120000);
  async function request(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: any, token = employee.token) {
    const app = await getApp();
    return app.inject({ method, url: `/v1/hr${url}`, headers: authHeaders(token), ...(payload === undefined ? {} : { payload }) });
  }
  const manual = (date: string, clock_in: string, clock_out: string, break_minutes = 0) => request('POST', '/clock-in/manual', { date, clock_in, clock_out, break_minutes });

  it('records split shifts, duplicate overlap, overnight work and excessive breaks', async () => {
    const a = await manual('2026-10-05', '09:00', '12:00');
    const b = await manual('2026-10-05', '13:00', '17:00');
    expect(a.statusCode).toBe(200); expect(b.statusCode).toBe(200);
    const before = await request('GET', '/clock-in/weekly?from=2026-10-05&to=2026-10-05');
    expect(before.json().workedMinutesTotal).toBe(420);
    const duplicate = await manual('2026-10-05', '09:00', '12:00');
    const after = await request('GET', '/clock-in/weekly?from=2026-10-05&to=2026-10-05');
    evidence.overlap = { status: duplicate.statusCode, before: before.json().workedMinutesTotal, after: after.json().workedMinutesTotal };
    expect(duplicate.statusCode).toBe(409);
    expect(after.json().workedMinutesTotal).toBe(420);
    const night = await manual('2026-10-06', '22:00', '06:00', 60);
    evidence.overnight = { status: night.statusCode, session: night.json().session };
    expect(night.statusCode).toBe(200);
    expect(night.json().session.worked_minutes).toBe(420);
    const breaks = await manual('2026-10-07', '09:00', '10:00', 120);
    evidence.excessBreak = { status: breaks.statusCode, session: breaks.json().session };
    expect(breaks.statusCode).toBe(400);
    const future = await manual('2099-01-01', '09:00', '17:00');
    expect(future.statusCode).toBe(400);
    evidence.future = { status: future.statusCode, session: future.json().session };
  });

  it('checks approval permissions and whether approved source records are locked', async () => {
    await manual('2026-10-12', '09:00', '17:00', 60);
    const submitted = await request('POST', '/clock-in/timesheet/submit', { period_start: '2026-10-12', period_end: '2026-10-12' });
    expect(submitted.statusCode).toBe(200);
    const id = submitted.json().approval.id;
    const approved = await request('PATCH', `/clock-in/timesheet/approvals/${id}`, { action: 'approve' }, manager.token);
    evidence.unrelatedManagerApproval = { status: approved.statusCode };
    expect(approved.statusCode).toBe(403);
    const adminApproval = await request('PATCH', `/clock-in/timesheet/approvals/${id}`, { action: 'approve' }, tenant.token);
    expect(adminApproval.statusCode).toBe(200);
    const added = await manual('2026-10-12', '18:00', '19:00');
    const week = await request('GET', '/clock-in/weekly?from=2026-10-12&to=2026-10-12');
    const status = await request('GET', '/clock-in/timesheet/status?period_start=2026-10-12');
    evidence.afterApproval = { additionStatus: added.statusCode, liveMinutes: week.json().workedMinutesTotal, approvalResponse: status.json() };
    expect(added.statusCode).toBe(409);
    expect(week.json().workedMinutesTotal).toBe(420);
    expect(status.json().approval.total_worked_minutes).toBe(420);
    const reReview = await request('PATCH', `/clock-in/timesheet/approvals/${id}`, { action: 'reject' }, tenant.token);
    expect(reReview.statusCode).toBe(409);
    evidence.reReview = { status: reReview.statusCode, body: reReview.json() };
    const reverse = await request('POST', '/clock-in/timesheet/submit', { period_start: '2026-10-20', period_end: '2026-10-01' });
    expect(reverse.statusCode).toBe(400);
    evidence.reversedPeriod = { status: reverse.statusCode, body: reverse.json() };
    const peer = await tenant.addUser('JUNIOR');
    const denied = await request('GET', `/clock-in/weekly?user_id=${employee.userId}`, undefined, peer.token);
    expect(denied.statusCode).toBe(403);
    evidence.peerReadStatus = denied.statusCode;
  });

  it('verifies concurrent clock-in and the header attendance bridge', async () => {
    const responses = await Promise.all(Array.from({ length: 3 }, () => request('POST', '/clock-in/start', {})));
    expect(responses.filter(r => r.statusCode === 200)).toHaveLength(1);
    evidence.concurrentStart = responses.map(r => r.statusCode);
    const header = await request('GET', '/time/today');
    evidence.headerAfterClockIn = header.json();
    const stopped = await request('POST', '/clock-in/stop', {});
    evidence.clockOut = { status: stopped.statusCode, body: stopped.json() };
    const headerAfter = await request('GET', '/time/today');
    evidence.headerAfterClockOut = headerAfter.json();
  });

  it('compares KPI definitions with active staff, late attendance and approved leave', async () => {
    const customer = await tenant.addUser('CUSTOMER');
    const inactive = await tenant.addUser('JUNIOR');
    await dbPlatform.updateTable('users').set({ active: false }).where('tenant_id', '=', tenant.tenantId).where('id', '=', inactive.userId).execute();
    const today = new Date().toISOString().slice(0, 10);
    await withTenant(tenant.tenantId, async trx => {
      const row = await trx.selectFrom('hr_attendance').select('id').where('tenant_id', '=', tenant.tenantId).where('user_id', '=', employee.userId).where('date', '=', today).executeTakeFirst();
      if (row) await trx.updateTable('hr_attendance').set({ status: 'LATE' }).where('id', '=', row.id).where('tenant_id', '=', tenant.tenantId).execute();
    });
    const kpi = await request('GET', '/tools-overview', undefined, tenant.token);
    expect(kpi.statusCode).toBe(200);
    expect(kpi.json().hr.total_staff).toBe(5);
    expect(kpi.json().hr.active_staff).toBe(4);
    expect(kpi.json().hr.today_present).toBe(1);
    evidence.kpi = { status: kpi.statusCode, fixture: { internalAccounts: 5, activeInternalAccounts: 4, customerAccounts: 1, inactiveInternalAccounts: 1, lateAttendee: employee.userId }, body: kpi.json() };
    const weekly = await request('GET', '/clock-in/weekly?from=2026-10-01&to=2026-10-31');
    expect(weekly.json().plannedDays).toBe(22);
    expect(weekly.json().plannedHours).toBe(176);
    evidence.plannedMonth = { plannedDays: weekly.json().plannedDays, plannedHours: weekly.json().plannedHours };
    expect(customer.userId).toBeTruthy();
  });

  it('records whether ClearOS manual time appears on the HR timesheet', async () => {
    await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', tenant.tenantId).execute();
    const customer = await dbPlatform.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'HR integration audit customer' } as any).returning('id').executeTakeFirstOrThrow();
    const shipment = await withTenant(tenant.tenantId, trx => trx.insertInto('shipment_cases').values({ tenant_id: tenant.tenantId, customer_id: customer.id, ref_number: 'HR-TIME-AUDIT', type: 'SEA_FCL', goods_desc: 'Synthetic', containers: '[]', vessel: 'Synthetic', origin_port: 'Synthetic', dest_port: 'Synthetic' }).returning('id').executeTakeFirstOrThrow());
    const app = await getApp();
    const r = await app.inject({ method: 'POST', url: `/v1/shipments/${shipment.id}/time-entries`, headers: authHeaders(employee.token), payload: { user_id: employee.userId, member: 'Test employee', hours: 2, log_date: '2026-10-15' } });
    const hr = await request('GET', '/clock-in/weekly?from=2026-10-15&to=2026-10-15');
    expect(r.statusCode).toBe(200);
    expect(r.json().user_id).toBe(employee.userId);
    evidence.shipmentTime = { status: r.statusCode, shipmentHours: r.json().hours, hrWorkedMinutes: hr.json().workedMinutesTotal };
    await withTenant(tenant.tenantId, trx => trx.updateTable('shipment_cases').set({ stage: 'CLOSED' }).where('id', '=', shipment.id).where('tenant_id', '=', tenant.tenantId).execute());
    const ops = await request('GET', '/ops-summary', undefined, tenant.token);
    expect(ops.json().active_shipments).toBe(0);
    evidence.closedShipmentKpi = { status: ops.statusCode, expectedActive: 0, body: ops.json() };
  });

  it('checks foreign task references in header time recording', async () => {
    const foreign = await createTestTenant();
    try {
      const app = await getApp();
      const task = await app.inject({ method: 'POST', url: '/v1/hr/tasks', headers: authHeaders(foreign.token), payload: { name: 'Foreign tenant audit task' } });
      expect([200, 201]).toContain(task.statusCode);
      const r = await request('POST', '/time/start', { task_id: task.json().id, task_name: 'Foreign reference audit' });
      expect(r.statusCode).toBe(400);
      evidence.foreignTask = { status: r.statusCode, acceptedForeignId: r.json().task_id === task.json().id };
    } finally { await foreign.cleanup(); }
  });

  it('checks concurrent header starts and malformed/reversed weekly ranges', async () => {
    const person = await tenant.addUser('JUNIOR');
    const starts = await Promise.all(Array.from({ length: 3 }, () => request('POST', '/time/start', { task_name: 'Concurrent header audit' }, person.token)));
    const rows = await withTenant(tenant.tenantId, trx => trx.selectFrom('hr_time_entries').select(['id', 'ended_at']).where('tenant_id', '=', tenant.tenantId).where('user_id', '=', person.userId).execute());
    expect(starts.every(r => r.statusCode === 200)).toBe(true);
    expect(rows.filter(r => !r.ended_at)).toHaveLength(1);
    evidence.concurrentHeaderStart = { statuses: starts.map(r => r.statusCode), openEntries: rows.filter(r => !r.ended_at).length };
    const reversed = await request('GET', '/clock-in/weekly?from=2026-10-20&to=2026-10-01');
    const malformed = await request('GET', '/clock-in/weekly?from=not-a-date&to=2026-10-20');
    expect(reversed.statusCode).toBe(400);
    expect(malformed.statusCode).toBe(400);
    evidence.weeklyRanges = { reversed: reversed.statusCode, malformed: malformed.statusCode };
  });

  it('checks pure shift arithmetic for day, night, late and incomplete punches', () => {
    const day = { startTime: '09:00', endTime: '17:00', breakMinutes: 60, graceMinutes: 10 };
    const night = { startTime: '22:00', endTime: '06:00', breakMinutes: 60, graceMinutes: 10 };
    expect(computeAttendance('09:00', '17:00', day).workedMinutes).toBe(420);
    expect(computeAttendance('22:00', '06:00', night).workedMinutes).toBe(420);
    expect(computeAttendance('09:20', '17:00', day).status).toBe('LATE');
    expect(computeAttendance('09:00', null, day).status).toBe('INCOMPLETE');
    evidence.pureAttendance = { day: 'pass', night: 'pass', late: 'pass', incomplete: 'pass' };
  });
});
