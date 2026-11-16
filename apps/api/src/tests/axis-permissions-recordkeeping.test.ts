// Axis permissions and recordkeeping (part 4 of the readiness work).
//
// 1. A role matrix over the real HTTP routes: employee, peer, line manager,
//    other manager, HR, payroll/finance and a support-type role (SALES — the
//    platform has no dedicated support role), for details, pay, documents,
//    payslips, payroll runs, timesheet exports, HR cases, lists and Studio
//    run history. Plus another workspace's HR for tenant isolation.
// 2. Time corrections (migration 912): changing recorded attendance needs a
//    reason and keeps the original; re-saving is not a correction; a period
//    payroll already approved can only be corrected by HR and then needs an
//    independent payroll review; correction rows can't be edited or deleted.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

type Who = { userId: string; token: string };

describe('Axis permissions and recordkeeping', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant, B: TestTenant;
  let staff: Who, peer: Who, line: Who, otherMgr: Who, hr: Who, finance: Who, support: Who;
  let docId: string, caseId: string, workflowId: string;
  const inject = (token: string, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: authHeaders(token), ...(payload === undefined ? {} : { payload: payload as any }) });

  beforeAll(async () => {
    app = await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    // The scale plan carries Axis; Studio is checked separately below.
    for (const t of [A, B]) await dbPlatform.updateTable('tenants').set({ plan: 'scale' } as any).where('id', '=', t.tenantId).execute();
    [staff, peer, line, otherMgr, hr, finance, support] = await Promise.all([
      A.addUser('JUNIOR'), A.addUser('JUNIOR'), A.addUser('MANAGER'), A.addUser('MANAGER'), A.addUser('ADMIN'), A.addUser('FINANCE'), A.addUser('SALES'),
    ]);
    // Reporting line through the job history (projects onto the org chart).
    expect((await inject(A.token, 'POST', `/v1/hr/workers/${staff.userId}/start-job`, { start_date: '2026-01-05', manager_id: line.userId })).statusCode).toBe(200);
    await withTenant(A.tenantId, async (trx) => {
      await trx.updateTable('users').set({ basic_salary: '2500000', national_id: '19900101-00001-00001-11', bank_account_no: '0150000000000' } as any)
        .where('tenant_id', '=', A.tenantId).where('id', '=', staff.userId).execute();
      docId = (await trx.insertInto('hr_documents').values({ tenant_id: A.tenantId, user_id: staff.userId, name: 'Contract.pdf', type: 'CONTRACT', storage_key: `tests/${A.tenantId}/missing.pdf` } as any).returning('id').executeTakeFirstOrThrow()).id;
      caseId = (await trx.insertInto('hr_cases').values({ tenant_id: A.tenantId, employee_id: staff.userId, case_type: 'grievance', title: 'Confidential grievance', opened_by: hr.userId } as any).returning('id').executeTakeFirstOrThrow()).id;
      workflowId = (await trx.insertInto('workflow_studio_apps').values({ tenant_id: A.tenantId, name: 'Case alert', trigger_event: 'hr.case_opened', description: null, last_run_at: null, created_by: A.userId } as any).returning('id').executeTakeFirstOrThrow()).id;
      await trx.insertInto('workflow_studio_runs').values({ tenant_id: A.tenantId, workflow_id: workflowId, status: 'SUCCESS',
        payload: JSON.stringify({ employee_id: staff.userId, title: 'Confidential grievance' }),
        step_results: JSON.stringify([{ node_id: 'n1', node_type: 'action', title: 'Email HR', status: 'success', output: { to: 'hr@example.invalid', detail: 'Sent' } }]) } as any).execute();
    });
  }, 180_000);
  afterAll(async () => { await A?.cleanup(); await B?.cleanup(); }, 240_000);

  it('enforces the role matrix on details, pay, documents, payslips, runs, exports and cases', async () => {
    const s = staff.userId;
    const matrix: Array<[string, Who | string, 'GET', string, number]> = [
      // Pay: only the person and payroll roles.
      ['self pay', staff, 'GET', `/v1/hr/staff/${s}/compensation`, 200],
      ['peer pay', peer, 'GET', `/v1/hr/staff/${s}/compensation`, 403],
      ['line manager pay', line, 'GET', `/v1/hr/staff/${s}/compensation`, 403],
      ['support pay', support, 'GET', `/v1/hr/staff/${s}/compensation`, 403],
      ['finance pay', finance, 'GET', `/v1/hr/staff/${s}/compensation`, 200],
      ['HR pay', hr, 'GET', `/v1/hr/staff/${s}/compensation`, 200],
      ['self payslips', staff, 'GET', `/v1/payroll/employees/${s}/payslips`, 200],
      ['line manager payslips', line, 'GET', `/v1/payroll/employees/${s}/payslips`, 403],
      ['support payslips', support, 'GET', `/v1/payroll/employees/${s}/payslips`, 403],
      ['finance payslips', finance, 'GET', `/v1/payroll/employees/${s}/payslips`, 200],
      ['employee payroll runs', staff, 'GET', '/v1/payroll/runs', 403],
      ['manager payroll runs', line, 'GET', '/v1/payroll/runs', 403],
      ['finance payroll runs', finance, 'GET', '/v1/payroll/runs', 200],
      // Personnel file: confidential, the person and HR only.
      ['self documents', staff, 'GET', `/v1/hr/staff/${s}/documents`, 200],
      ['line manager documents', line, 'GET', `/v1/hr/staff/${s}/documents`, 403],
      ['finance documents', finance, 'GET', `/v1/hr/staff/${s}/documents`, 403],
      ['HR documents', hr, 'GET', `/v1/hr/staff/${s}/documents`, 200],
      ['peer document download', peer, 'GET', `/v1/hr/documents/${docId}/download`, 403],
      ['line manager document download', line, 'GET', `/v1/hr/documents/${docId}/download`, 403],
      // Profile: no relationship, no record.
      ['peer profile', peer, 'GET', `/v1/hr/staff/${s}`, 403],
      ['support profile', support, 'GET', `/v1/hr/staff/${s}`, 403],
      ['line manager profile', line, 'GET', `/v1/hr/staff/${s}`, 200],
      // Time: reporting line or HR.
      ['peer timesheet export', peer, 'GET', `/v1/hr/clock-in/timesheet/export?user_id=${s}`, 403],
      ['other manager timesheet export', otherMgr, 'GET', `/v1/hr/clock-in/timesheet/export?user_id=${s}`, 403],
      ['line manager timesheet export', line, 'GET', `/v1/hr/clock-in/timesheet/export?user_id=${s}`, 200],
      // Cases: HR only, never the line manager or the subject.
      ['line manager cases', line, 'GET', '/v1/hr/cases', 403],
      ['subject cases', staff, 'GET', `/v1/hr/cases/${caseId}`, 403],
      ['HR cases', hr, 'GET', '/v1/hr/cases', 200],
      // Another workspace's HR can't reach these ids.
      ['other workspace profile', B.token, 'GET', `/v1/hr/staff/${s}`, 404],
      ['other workspace pay', B.token, 'GET', `/v1/hr/staff/${s}/compensation`, 404],
      ['other workspace document', B.token, 'GET', `/v1/hr/documents/${docId}/download`, 404],
      ['other workspace case', B.token, 'GET', `/v1/hr/cases/${caseId}`, 404],
    ];
    const wrong: string[] = [];
    for (const [label, who, method, url, expected] of matrix) {
      const r = await inject(typeof who === 'string' ? who : who.token, method, url);
      if (r.statusCode !== expected) wrong.push(`${label}: expected ${expected}, got ${r.statusCode} ${r.body.slice(0, 120)}`);
    }
    expect(wrong).toEqual([]);
  });

  it('redacts fields by relationship: manager sees no pay, a stranger manager no identity numbers, lists carry neither', async () => {
    const lineView = (await inject(line.token, 'GET', `/v1/hr/staff/${staff.userId}`)).json();
    const record = lineView.data ?? lineView;
    expect(record.basic_salary).toBeUndefined();
    expect(record.bank_account_no).toBeUndefined();
    const other = await inject(otherMgr.token, 'GET', `/v1/hr/staff/${staff.userId}`);
    if (other.statusCode === 200) {
      const o = other.json().data ?? other.json();
      expect(o.basic_salary).toBeUndefined();
      expect(o.national_id).toBeUndefined();
    } else expect(other.statusCode).toBe(403);
    const hrView = (await inject(hr.token, 'GET', `/v1/hr/staff/${staff.userId}`)).json();
    expect(String((hrView.data ?? hrView).basic_salary)).toMatch(/^2500000/);
    const list = (await inject(support.token, 'GET', '/v1/hr/staff')).json();
    const rows: any[] = Array.isArray(list) ? list : list.data;
    const row = rows.find((r) => r.id === staff.userId);
    expect(row).toBeTruthy();
    for (const k of ['basic_salary', 'national_id', 'bank_account_no', 'tax_id']) expect(row[k]).toBeUndefined();
  });

  it('shows Studio run payloads only to administrators', async () => {
    const asStaff = await inject(staff.token, 'GET', `/v1/workflow-studio/apps/${workflowId}/runs`);
    if (asStaff.statusCode === 403) return; // the plan doesn't carry Studio: nothing is exposed
    expect(asStaff.statusCode).toBe(200);
    const run = asStaff.json().data[0];
    expect(run.payload).toBeNull();
    expect(JSON.stringify(run)).not.toContain('Confidential grievance');
    expect(JSON.stringify(run)).not.toContain('hr@example.invalid');
    const asAdmin = (await inject(A.token, 'GET', `/v1/workflow-studio/apps/${workflowId}/runs`)).json().data[0];
    expect(asAdmin.payload.title).toBe('Confidential grievance');
  });

  describe('time corrections', () => {
    const corrections = () => withTenant(A.tenantId, (trx) => trx.selectFrom('hr_time_corrections').selectAll()
      .where('tenant_id', '=', A.tenantId).orderBy('corrected_at').execute());
    const mark = (who: Who, date: string, extra: Record<string, unknown> = {}) =>
      inject(who.token, 'POST', '/v1/hr/attendance', { user_id: staff.userId, date, status: 'PRESENT', clock_in: '08:00', clock_out: '17:00', ...extra });

    it('needs a reason to change a recorded day, keeps the original, and ignores a re-save', async () => {
      expect((await mark(hr, '2026-09-15')).statusCode).toBe(200);
      expect((await mark(line, '2026-09-15', { status: 'LATE' })).statusCode).toBe(400);
      const ok = await mark(line, '2026-09-15', { status: 'LATE', clock_in: '09:10', correction_reason: 'Signed register shows a late arrival' });
      expect(ok.statusCode, ok.body).toBe(200);
      const rows = await corrections();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: staff.userId, record_type: 'ATTENDANCE', corrected_by: line.userId, review_status: 'NOT_NEEDED', payroll_run_id: null });
      expect((rows[0].before_values as any).status).toBe('PRESENT');
      expect(String((rows[0].before_values as any).clock_in)).toMatch(/^08:00/);
      expect((rows[0].after_values as any).status).toBe('LATE');
      // Re-saving the same values is not a correction and needs no reason.
      expect((await mark(line, '2026-09-15', { status: 'LATE', clock_in: '09:10' })).statusCode).toBe(200);
      expect(await corrections()).toHaveLength(1);
      // A peer can't correct someone else's time at all.
      expect((await mark(peer, '2026-09-15', { status: 'ABSENT', correction_reason: 'Trying to change a colleague' })).statusCode).toBe(403);
    });

    it('sends corrections to an approved payroll period to HR, and on to an independent payroll review', async () => {
      expect((await mark(hr, '2026-10-06')).statusCode).toBe(200);
      const run = await withTenant(A.tenantId, (trx) => trx.insertInto('payroll_runs').values({
        tenant_id: A.tenantId, name: 'October 2026', period_year: 2026, period_month: 10,
        period_start: '2026-10-01', period_end: '2026-10-31', status: 'APPROVED', approved_by: finance.userId, approved_at: new Date(), created_by: finance.userId, calculated_at: new Date(),
      } as any).returning('id').executeTakeFirstOrThrow());
      const reason = 'Was off sick, register corrected by HR';
      expect((await mark(line, '2026-10-06', { status: 'ABSENT', correction_reason: reason })).statusCode).toBe(403);
      expect((await inject(line.token, 'POST', '/v1/hr/attendance/bulk', { user_ids: [staff.userId], from_date: '2026-10-06', to_date: '2026-10-07', status: 'ABSENT', correction_reason: reason })).statusCode).toBe(403);
      const byHr = await mark(hr, '2026-10-06', { status: 'ABSENT', clock_in: null, clock_out: null, correction_reason: reason });
      expect(byHr.statusCode, byHr.body).toBe(200);
      const pending = (await corrections()).find((c) => c.review_status === 'PENDING')!;
      expect(pending).toMatchObject({ payroll_run_id: run.id, payroll_run_status: 'APPROVED', corrected_by: hr.userId });
      const told = await withTenant(A.tenantId, (trx) => trx.selectFrom('notifications').select('user_id')
        .where('tenant_id', '=', A.tenantId).where('entity_id', '=', pending.id).execute());
      expect(told.map((n) => n.user_id)).toContain(finance.userId);
      expect(told.map((n) => n.user_id)).not.toContain(hr.userId);
      // Review: never the person who made it, never a manager, and an
      // adjustment has to say what it is.
      const review = (who: Who | string, body: unknown) => inject(typeof who === 'string' ? who : who.token, 'POST', `/v1/hr/time-corrections/${pending.id}/review`, body);
      expect((await review(hr, { outcome: 'NO_PAY_CHANGE' })).statusCode).toBe(403);
      expect((await review(line, { outcome: 'NO_PAY_CHANGE' })).statusCode).toBe(403);
      expect((await review(finance, { outcome: 'ADJUST_NEXT_RUN' })).statusCode).toBe(400);
      const done = await review(finance, { outcome: 'ADJUST_NEXT_RUN', note: 'Deduct one day of unpaid sick leave in November' });
      expect(done.statusCode, done.body).toBe(200);
      expect(done.json().data).toMatchObject({ review_status: 'REVIEWED', review_outcome: 'ADJUST_NEXT_RUN', reviewed_by: finance.userId });
      expect((await review(A.token, { outcome: 'NO_PAY_CHANGE' })).statusCode).toBe(409);
      // The run itself was not touched.
      const after = await withTenant(A.tenantId, (trx) => trx.selectFrom('payroll_runs').select('status').where('id', '=', run.id).executeTakeFirstOrThrow());
      expect(after.status).toBe('APPROVED');
    });

    it('keeps correction rows permanent and shows each person only their own', async () => {
      const [first] = await corrections();
      await expect(withTenant(A.tenantId, (trx) => sql`UPDATE hr_time_corrections SET reason = 'rewritten afterwards' WHERE id = ${first.id}`.execute(trx))).rejects.toThrow(/permanent/);
      await expect(withTenant(A.tenantId, (trx) => sql`DELETE FROM hr_time_corrections WHERE id = ${first.id}`.execute(trx))).rejects.toThrow(/permanent/);
      const mine = (await inject(staff.token, 'GET', '/v1/hr/time-corrections')).json();
      expect(mine.data.length).toBe(2);
      expect(mine.can_review).toBe(false);
      expect((await inject(peer.token, 'GET', `/v1/hr/time-corrections?user_id=${staff.userId}`)).json().data).toHaveLength(0);
      expect((await inject(finance.token, 'GET', '/v1/hr/time-corrections?status=REVIEWED')).json().data).toHaveLength(1);
      expect((await inject(B.token, 'GET', '/v1/hr/time-corrections')).json().data).toHaveLength(0);
    });
  });
});
