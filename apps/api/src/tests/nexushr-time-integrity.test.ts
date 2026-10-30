import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';
import { recordDevicePunches } from '../services/attendance-device.service.js';

describe('NexusHR time integrity acceptance', () => {
  let tenant: TestTenant;
  let person: { userId: string; token: string };
  beforeAll(async () => { tenant = await createTestTenant(); person = await tenant.addUser('JUNIOR'); }, 120000);
  afterAll(async () => { await tenant?.cleanup(); }, 120000);
  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: Record<string, unknown>, token = person.token) {
    const app = await getApp();
    return app.inject({ method, url: '/v1/hr' + path, headers: authHeaders(token), ...(payload === undefined ? {} : { payload }) });
  }
  const manual = (date: string, clock_in = '09:00', clock_out = '17:00', extra = {}) => call('POST', '/clock-in/manual', { date, clock_in, clock_out, break_minutes: 60, ...extra });

  it('serializes overlapping manual submissions and validates calendar/time bounds', async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, () => manual('2026-09-01')));
    expect(responses.filter(r => r.statusCode === 200)).toHaveLength(1);
    expect(responses.filter(r => r.statusCode === 409)).toHaveLength(5);
    for (const [date, start, end] of [['2026-02-30', '09:00', '17:00'], ['2026-09-02', '24:00', '17:00'], ['2026-09-02', '09:00', '09:00'], ['2026-09-02', '01:00', '23:00']]) {
      expect((await manual(date, start, end)).statusCode).toBe(400);
    }
  });

  it('checks overnight overlap across the date boundary', async () => {
    expect((await manual('2026-09-03', '22:00', '06:00')).statusCode).toBe(200);
    expect((await manual('2026-09-04', '05:00', '08:00')).statusCode).toBe(409);
    expect((await manual('2026-09-04', '06:00', '09:00')).statusCode).toBe(200);
  });

  it('requires resubmission after source changes and prevents overlapping approval windows', async () => {
    await manual('2026-09-07');
    const submitted = await call('POST', '/clock-in/timesheet/submit', { period_start: '2026-09-07', period_end: '2026-09-07' });
    expect(submitted.statusCode).toBe(200);
    const id = submitted.json().approval.id;
    expect((await manual('2026-09-07', '18:00', '20:00')).statusCode).toBe(200);
    expect((await call('PATCH', `/clock-in/timesheet/approvals/${id}`, { action: 'approve' }, tenant.token)).statusCode).toBe(409);
    expect((await call('POST', '/clock-in/timesheet/submit', { period_start: '2026-09-06', period_end: '2026-09-08' })).statusCode).toBe(409);
    expect((await call('PATCH', `/clock-in/timesheet/approvals/${id}`, { action: 'reject', note: 'Please resubmit updated hours.' }, tenant.token)).statusCode).toBe(200);
    const resubmitted = await call('POST', '/clock-in/timesheet/submit', { period_start: '2026-09-07', period_end: '2026-09-07' });
    expect(resubmitted.json().approval.total_worked_minutes).toBe(480);
    expect((await call('PATCH', `/clock-in/timesheet/approvals/${id}`, { action: 'approve' }, tenant.token)).statusCode).toBe(200);
  });

  it('provides an audited correction and administrator reopening workflow', async () => {
    const inserted = await manual('2026-09-09');
    const id = inserted.json().session.id;
    const submitted = await call('POST', '/clock-in/timesheet/submit', { period_start: '2026-09-09', period_end: '2026-09-09' });
    const approvalId = submitted.json().approval.id;
    expect((await call('PATCH', `/clock-in/timesheet/approvals/${approvalId}`, { action: 'approve' }, tenant.token)).statusCode).toBe(200);
    const update = { session_id: id, correction_reason: 'Corrected from the signed attendance register.' };
    expect((await manual('2026-09-09', '09:00', '16:00', update)).statusCode).toBe(409);
    expect((await call('POST', `/clock-in/timesheet/approvals/${approvalId}/reopen`, { reason: 'Employee supplied a corrected attendance record.' })).statusCode).toBe(403);
    expect((await call('POST', `/clock-in/timesheet/approvals/${approvalId}/reopen`, { reason: 'Employee supplied a corrected attendance record.' }, tenant.token)).statusCode).toBe(200);
    const corrected = await manual('2026-09-09', '09:00', '16:00', update);
    expect(corrected.statusCode, corrected.body).toBe(200);
    expect(corrected.json().session.worked_minutes).toBe(360);
    const logs = await withTenant(tenant.tenantId, trx => trx.selectFrom('hr_activity_log').select('action').where('tenant_id', '=', tenant.tenantId).execute());
    expect(logs.some(l => l.action.includes('timesheet.reopened'))).toBe(true);
    expect(logs.some(l => l.action.includes('attendance.corrected'))).toBe(true);
  });

  it('derives planned time from holidays, dated night shifts and leave', async () => {
    await withTenant(tenant.tenantId, async trx => {
      const shift = await trx.insertInto('hr_shifts').values({ tenant_id: tenant.tenantId, name: 'Four-hour shift', start_time: '09:00', end_time: '13:00', break_minutes: 0, is_default: true }).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('hr_holidays').values({ tenant_id: tenant.tenantId, name: 'Company closure', date: '2026-08-04', is_working_day: false }).execute();
      const night = await trx.insertInto('hr_shifts').values({ tenant_id: tenant.tenantId, name: 'Night duty', start_time: '22:00', end_time: '06:00', break_minutes: 60 }).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('hr_shift_assignments').values({ tenant_id: tenant.tenantId, user_id: person.userId, date: '2026-08-08', shift_id: night.id }).execute();
      await trx.insertInto('hr_leaves').values({ tenant_id: tenant.tenantId, user_id: person.userId, type: 'ANNUAL', from_date: '2026-08-05', to_date: '2026-08-05', days: 1, reason: null, status: 'APPROVED', approved_by: tenant.userId, approved_at: new Date(), leave_type_id: null, full_pay_days: null, reduced_pay_days: null }).execute();
      expect(shift.id).toBeTruthy();
    });
    const week = await call('GET', '/clock-in/weekly?from=2026-08-03&to=2026-08-09');
    expect(week.statusCode).toBe(200);
    expect(week.json().plannedDays).toBe(4);
    expect(week.json().plannedHours).toBe(19);
  });

  it('blocks submission of unknown work and permits HR to correct it', async () => {
    const id = await withTenant(tenant.tenantId, async trx => {
      const s = await trx.insertInto('hr_clock_sessions').values({ tenant_id: tenant.tenantId, user_id: person.userId, date: '2026-08-10', clock_in_at: new Date('2026-08-10T09:00:00'), clock_out_at: new Date('2026-08-11T09:00:00'), status: 'COMPLETED', worked_minutes: null, source: 'WEB' }).returning('id').executeTakeFirstOrThrow();
      return s.id;
    });
    const report = await call('GET', '/clock-in/weekly?from=2026-08-10&to=2026-08-10');
    expect(report.json().unknownSessionCount).toBe(1);
    expect((await call('POST', '/clock-in/timesheet/submit', { period_start: '2026-08-10', period_end: '2026-08-10' })).statusCode).toBe(409);
    const corrected = await call('POST', '/clock-in/manual', { date: '2026-08-10', user_id: person.userId, session_id: id, clock_in: '09:00', clock_out: '17:00', break_minutes: 60, correction_reason: 'Verified clock-out with employee and supervisor.' }, tenant.token);
    expect(corrected.statusCode, corrected.body).toBe(200);
    expect((await call('POST', '/clock-in/timesheet/submit', { period_start: '2026-08-10', period_end: '2026-08-10' })).statusCode).toBe(200);
  });

  it('shows separate allocation ledgers and enforces bounded reconciliation ranges', async () => {
    const r = await call('GET', '/clock-in/reconciliation?from=2026-09-01&to=2026-09-30');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().attendance_minutes).toBeGreaterThan(0);
    expect(r.json().shipment_minutes).toBe(0);
    expect((await call('GET', '/clock-in/reconciliation?from=2020-01-01&to=2026-09-30')).statusCode).toBe(400);
  });

  it('refuses a fabricated project reference and protects attendance export scope', async () => {
    expect((await call('POST', '/time/start', { project_id: randomUUID() })).statusCode).toBe(400);
    const unrelated = await tenant.addUser('MANAGER');
    expect((await call('GET', `/clock-in/timesheet/export?user_id=${person.userId}`, undefined, unrelated.token)).statusCode).toBe(403);
    expect((await call('GET', '/clock-in/timesheet/export?from=2026-09-30&to=2026-09-01')).statusCode).toBe(400);
  });

  it('pairs overnight device punches across separate batches and deduplicates retries after approval', async () => {
    const employee = await tenant.addUser('JUNIOR');
    const device = await withTenant(tenant.tenantId, async trx => {
      const row = await trx.insertInto('attendance_devices').values({ tenant_id: tenant.tenantId, name: 'Night test', serial_number: randomUUID(), push_token: randomUUID(), created_by: tenant.userId }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('attendance_device_enrollments').values({ tenant_id: tenant.tenantId, device_id: row.id, user_id: employee.userId, external_pin: '42', created_by: tenant.userId }).execute();
      return row;
    });
    const input = { externalPin: '42', punchedAt: new Date('2026-07-03T22:00:00'), rawStatus: '0' };
    const output = { externalPin: '42', punchedAt: new Date('2026-07-04T06:00:00'), rawStatus: '1' };
    await recordDevicePunches(tenant.tenantId, device.id, [input]);
    await recordDevicePunches(tenant.tenantId, device.id, [output]);
    const week = await call('GET', '/clock-in/weekly?from=2026-07-03&to=2026-07-04', undefined, employee.token);
    expect(week.json().sessions).toHaveLength(1);
    expect(week.json().workedMinutesTotal).toBe(480);
    const submission = await call('POST', '/clock-in/timesheet/submit', { period_start: '2026-07-03', period_end: '2026-07-04' }, employee.token);
    expect(submission.statusCode, submission.body).toBe(200);
    expect((await call('PATCH', `/clock-in/timesheet/approvals/${submission.json().approval.id}`, { action: 'approve' }, tenant.token)).statusCode).toBe(200);
    await recordDevicePunches(tenant.tenantId, device.id, [input, output]);
    const repeated = await call('GET', '/clock-in/weekly?from=2026-07-03&to=2026-07-04', undefined, employee.token);
    expect(repeated.json().sessions).toHaveLength(1);
    expect(repeated.json().workedMinutesTotal).toBe(480);
  });

  it('closes a stale live session as unknown instead of manufacturing hours', async () => {
    const employee = await tenant.addUser('JUNIOR');
    const start = new Date(Date.now() - 13 * 3600000);
    const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    await withTenant(tenant.tenantId, trx => trx.insertInto('hr_clock_sessions').values({ tenant_id: tenant.tenantId, user_id: employee.userId, date, clock_in_at: start, status: 'ACTIVE', source: 'WEB' }).execute());
    const stop = await call('POST', '/clock-in/stop', {}, employee.token);
    expect(stop.statusCode, stop.body).toBe(200);
    expect(stop.json().session.worked_minutes).toBeNull();
    expect(stop.json().summary.needs_review).toBe(true);
    const weekly = await call('GET', `/clock-in/weekly?from=${date}&to=${date}`, undefined, employee.token);
    expect(weekly.json().unknownSessionCount).toBe(1);
    expect(weekly.json().attendance[0].status).toBe('INCOMPLETE');
  });

  it('scopes bulk attendance to owned employees and neutralizes CSV formulas', async () => {
    const foreign = await createTestTenant();
    try {
      expect((await call('POST', '/attendance', { user_id: foreign.userId, date: '2026-07-01' }, tenant.token)).statusCode).toBe(400);
      expect((await call('POST', '/attendance/bulk', { user_ids: [foreign.userId], from_date: '2026-07-01', to_date: '2026-07-02' }, tenant.token)).statusCode).toBe(400);
      expect((await call('POST', '/attendance/bulk', { user_ids: [person.userId], from_date: '2026-07-02', to_date: '2026-07-01' }, tenant.token)).statusCode).toBe(400);
      const entry = await manual('2026-07-01', '09:00', '17:00', { project_name: '=1+1' });
      expect(entry.statusCode).toBe(200);
      const csv = await call('GET', '/clock-in/timesheet/export?from=2026-07-01&to=2026-07-01');
      expect(csv.statusCode).toBe(200);
      expect(csv.body).toContain('"\'=1+1"');
    } finally { await foreign.cleanup(); }
  });
});
