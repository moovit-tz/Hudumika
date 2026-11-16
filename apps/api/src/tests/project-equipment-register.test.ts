// Projects equipment register (migration 913) and the access-control gaps it
// closed: fleet writes and cost rates were open to every staff user, and
// portfolio/program writes had no role check at all (and 500'd on edit).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';
import { sendEquipmentReminders } from '../services/project-equipment.service.js';

type Who = { userId: string; token: string };
const E = '/v1/project-equipment';
const P = '/v1/project-os';
const day = (offset: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

async function grantProjects(tenantId: string) {
  await dbPlatform.insertInto('tenant_settings' as any).values({ tenant_id: tenantId, settings: JSON.stringify({ 'enabled-apps': { projects: true } }) } as any)
    .onConflict((oc: any) => oc.column('tenant_id').doUpdateSet({ settings: sql`jsonb_set(coalesce(tenant_settings.settings, '{}'::jsonb), '{enabled-apps,projects}', 'true'::jsonb, true)` } as any)).execute();
}

describe('Projects equipment register and access control', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant, B: TestTenant;
  let pm: Who, member: Who, viewer: Who, outsider: Who, custodian: Who, finance: Who, delegate: Who;
  let projA: string, projA2: string;
  const call = (who: Who | TestTenant, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: authHeaders(who.token), ...(payload === undefined ? {} : { payload: payload as any }) });

  beforeAll(async () => {
    app = await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    await grantProjects(A.tenantId); await grantProjects(B.tenantId);
    [pm, member, viewer, outsider, custodian, finance, delegate] = await Promise.all([
      A.addUser('MANAGER'), A.addUser('JUNIOR'), A.addUser('JUNIOR'), A.addUser('JUNIOR'), A.addUser('JUNIOR'), A.addUser('FINANCE'), A.addUser('JUNIOR'),
    ]);
    projA = randomUUID(); projA2 = randomUUID();
    await withTenant(A.tenantId, async (trx: any) => {
      await trx.insertInto('projects').values([{ id: projA, tenant_id: A.tenantId, name: 'Bagamoyo road', owner_id: pm.userId },
        { id: projA2, tenant_id: A.tenantId, name: 'Kibaha bridge', owner_id: pm.userId }]).execute();
      await trx.insertInto('project_members').values([
        { id: randomUUID(), tenant_id: A.tenantId, project_id: projA, user_id: member.userId, role: 'member' },
        { id: randomUUID(), tenant_id: A.tenantId, project_id: projA, user_id: viewer.userId, role: 'viewer' }]).execute();
      // A delegated, non-admin equipment manager through an Ondi custom role.
      const role = await trx.insertInto('ondi_org_roles').values({ tenant_id: A.tenantId, name: `Plant yard ${randomUUID().slice(0, 4)}`, permissions: JSON.stringify(['projects.equipment.manage', 'projects.portfolios.manage']) }).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('ondi_org_role_members').values({ tenant_id: A.tenantId, role_id: role.id, user_id: delegate.userId }).execute();
    });
  }, 180_000);
  afterAll(async () => { await A?.cleanup(); await B?.cleanup(); }, 240_000);

  const newAsset = async (overrides: Record<string, unknown> = {}, who: Who | TestTenant = A) => {
    const r = await call(who, 'POST', `${E}/assets`, { resource_type: 'heavy_machinery', name: 'Excavator 20t', code: `EX-${randomUUID().slice(0, 8)}`,
      manufacturer: 'CAT', make_model: '320', serial_number: 'CAT0320X1', ownership: 'OWNED', home_site: 'Mikocheni yard', custodian_id: custodian.userId,
      capacity_value: 20, capacity_unit: 't', meter_unit: 'HOURS', meter_reading: 1200, inspection_interval_days: 90, service_interval_meter: 250,
      cost_rate: 450000, rate_unit: 'DAY', currency: 'TZS', ...overrides });
    expect(r.statusCode, r.body).toBe(201);
    return r.json();
  };

  it('restricts register writes and cost rates; delegated equipment managers can run it', async () => {
    const payload = { resource_type: 'tool', name: 'Breaker', code: `BR-${randomUUID().slice(0, 6)}` };
    expect((await call(member, 'POST', `${E}/assets`, payload)).statusCode).toBe(403);
    expect((await call(member, 'POST', `${P}/resources`, payload)).statusCode).toBe(403); // legacy fleet route was open
    expect((await call(delegate, 'POST', `${E}/assets`, payload)).statusCode).toBe(201);
    const asset = await newAsset();
    const asMember = (await call(member, 'GET', `${E}/assets/${asset.id}`)).json().asset;
    expect(asMember.cost_rate).toBeUndefined();
    expect(asMember.name).toBe('Excavator 20t');
    expect((await call(finance, 'GET', `${E}/assets/${asset.id}`)).json().asset.cost_rate).toBe(450000);
    const legacy = (await call(member, 'GET', `${P}/resources`)).json().find((r: any) => r.id === asset.id);
    expect(legacy.cost_rate).toBeUndefined();
    expect(legacy.cost_rate_daily).toBeUndefined();
    const csvMember = (await call(member, 'GET', `${E}/assets/export`)).body;
    expect(csvMember.split('\r\n')[0]).not.toContain('cost_rate');
    expect((await call(A, 'GET', `${E}/assets/export`)).body.split('\r\n')[0]).toContain('cost_rate');
    expect((await call(member, 'PATCH', `${E}/assets/${asset.id}`, { name: 'Renamed' })).statusCode).toBe(403);
    // Cross-tenant: invisible by id, and B's references can't be smuggled in.
    expect((await call(B, 'GET', `${E}/assets/${asset.id}`)).statusCode).toBe(404);
    expect((await call(B, 'PATCH', `${E}/assets/${asset.id}`, { name: 'Taken' })).statusCode).toBe(404);
    expect((await call(A, 'PATCH', `${E}/assets/${asset.id}`, { custodian_id: B.userId })).statusCode).toBe(404);
    expect((await call(B, 'GET', `${E}/assets`)).json().data.some((r: any) => r.id === asset.id)).toBe(false);
  });

  it('gates portfolio and program writes, and edits map onto the real columns', async () => {
    const body = { name: 'Roads', code: `RD${randomUUID().slice(0, 5)}` };
    expect((await call(member, 'POST', `${P}/portfolios`, body)).statusCode).toBe(403);
    expect((await call(member, 'POST', `${P}/programs`, body)).statusCode).toBe(403);
    const created = await call(delegate, 'POST', `${P}/portfolios`, body);
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await call(member, 'PATCH', `${P}/portfolios/${id}`, { name: 'Hijack' })).statusCode).toBe(403);
    const edited = await call(A, 'PATCH', `${P}/portfolios/${id}`, { owner_id: pm.userId, allocated_budget: 5000, status: 'on_hold' });
    expect(edited.statusCode, edited.body).toBe(200); // was a 500: no owner_id/allocated_budget columns
    expect(edited.json()).toMatchObject({ manager_id: pm.userId, status: 'ON_HOLD' });
    expect((await call(pm, 'PATCH', `${P}/portfolios/${id}`, { description: 'Owned by its manager' })).statusCode).toBe(200);
    expect((await call(pm, 'DELETE' as any, `${P}/portfolios/${id}`)).statusCode).toBe(403);
    expect((await call(A, 'PATCH', `${P}/portfolios/${id}`, { owner_id: B.userId })).statusCode).toBe(404);
    const prog = await call(A, 'POST', `${P}/programs`, { name: 'Trunk roads', code: `TR${randomUUID().slice(0, 5)}`, portfolio_id: id });
    const progEdit = await call(A, 'PATCH', `${P}/programs/${prog.json().id}`, { program_manager_id: pm.userId, status: 'planning' });
    expect(progEdit.statusCode, progEdit.body).toBe(200);
    expect(progEdit.json()).toMatchObject({ manager_id: pm.userId, status: 'PLANNING' });
  });

  it('limits project creation and portfolio budgets to administrators and managers', async () => {
    const T = '/v1/tasks/projects';
    expect((await call(member, 'POST', T, { id: randomUUID(), name: 'Staff project' })).statusCode).toBe(403);
    expect((await call(finance, 'POST', T, { id: randomUUID(), name: 'Finance project' })).statusCode).toBe(403);
    expect((await call(member, 'POST', `${T}/${projA}/copy`)).statusCode).toBe(403); // a member can see it, but not duplicate it
    const byManager = await call(pm, 'POST', T, { id: randomUUID(), name: 'Manager project' });
    expect(byManager.statusCode, byManager.body).toBe(201);
    expect((await call(A, 'POST', T, { id: randomUUID(), name: 'Admin project' })).statusCode).toBe(201);
    expect((await call(pm, 'POST', `${T}/${projA}/copy`)).statusCode).toBe(201);

    const port = (await call(A, 'POST', `${P}/portfolios`, { name: 'Bridges', code: `BG${randomUUID().slice(0, 5)}`, allocated_budget: 9_000_000 })).json();
    const prog = (await call(A, 'POST', `${P}/programs`, { name: 'Coastal bridges', code: `CB${randomUUID().slice(0, 5)}`, portfolio_id: port.id, budget: 2_500_000 })).json();
    const seen = async (who: Who | TestTenant) => ({
      port: (await call(who, 'GET', `${P}/portfolios`)).json().find((r: any) => r.id === port.id),
      prog: (await call(who, 'GET', `${P}/programs`)).json().find((r: any) => r.id === prog.id),
    });
    const staff = await seen(member);
    expect(staff.port.name).toBe('Bridges');
    expect(staff.port.allocated_budget).toBeNull();
    expect(staff.port.target_budget).toBeNull();
    expect(staff.port.total_contract_value).toBeNull();
    expect(staff.prog.budget).toBeNull();
    expect((await seen(finance)).port.allocated_budget).toBeNull();
    for (const who of [A, pm, delegate]) {
      const s = await seen(who);
      expect(s.port.allocated_budget).toBe(9_000_000);
      expect(s.prog.budget).toBe(2_500_000);
    }
  });

  it('runs request → reserve → issue → return with history, meters and inspection', async () => {
    const asset = await newAsset({ name: 'Grader 140M', resource_type: 'heavy_machinery' });
    const req = { resource_id: asset.id, start_date: day(0), end_date: day(10), request_key: `rk-${randomUUID()}` };
    expect((await call(viewer, 'POST', `${E}/projects/${projA}/requests`, req)).statusCode).toBe(403);
    expect((await call(outsider, 'POST', `${E}/projects/${projA}/requests`, req)).statusCode).toBe(404);
    expect((await call(B, 'POST', `${E}/projects/${projA}/requests`, req)).statusCode).toBe(404);
    const requested = await call(member, 'POST', `${E}/projects/${projA}/requests`, req);
    expect(requested.statusCode, requested.body).toBe(201);
    expect(requested.json().status).toBe('requested');
    // A retried submit returns the same booking instead of a second one.
    const retry = await call(member, 'POST', `${E}/projects/${projA}/requests`, req);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(requested.json().id);
    const alloc = requested.json().id;
    // The custodian was told about the request.
    const told: any[] = await withTenant(A.tenantId, (trx: any) => trx.selectFrom('notifications').select('id').where('tenant_id', '=', A.tenantId).where('user_id', '=', custodian.userId).where('entity_id', '=', alloc).execute());
    expect(told.length).toBe(1);
    expect((await call(member, 'POST', `${E}/allocations/${alloc}/reserve`)).statusCode).toBe(403);
    expect((await call(B, 'POST', `${E}/allocations/${alloc}/reserve`)).statusCode).toBe(404);
    expect((await call(custodian, 'POST', `${E}/allocations/${alloc}/reserve`)).json().status).toBe('confirmed');
    expect((await call(custodian, 'POST', `${E}/allocations/${alloc}/issue`, { condition: 'GOOD', meter: 1100 })).statusCode).toBe(400); // meter went backwards
    const issued = await call(custodian, 'POST', `${E}/allocations/${alloc}/issue`, { condition: 'GOOD', meter: 1210, handed_to: member.userId, location: 'Bagamoyo km 12' });
    expect(issued.statusCode, issued.body).toBe(200);
    let detail = (await call(A, 'GET', `${E}/assets/${asset.id}`)).json();
    expect(detail.asset).toMatchObject({ status: 'allocated', current_location: 'Bagamoyo km 12', meter_reading: 1210 });
    expect((await call(custodian, 'POST', `${E}/allocations/${alloc}/issue`, { condition: 'GOOD' })).statusCode).toBe(409); // already out
    const returned = await call(custodian, 'POST', `${E}/allocations/${alloc}/return`, { condition: 'GOOD', meter: 1290, inspection: { result: 'PASS' } });
    expect(returned.statusCode, returned.body).toBe(200);
    detail = (await call(A, 'GET', `${E}/assets/${asset.id}`)).json();
    expect(detail.asset).toMatchObject({ status: 'available', current_location: 'Mikocheni yard', meter_reading: 1290 });
    expect(detail.asset.eligibility.ok).toBe(true);
    expect(detail.asset.next_inspection_due).toBe(day(90));
    expect(detail.events.map((e: any) => e.event_type)).toEqual(expect.arrayContaining(['REGISTERED', 'REQUESTED', 'RESERVED', 'ISSUED', 'INSPECTED', 'RETURNED']));
    expect(detail.events.find((e: any) => e.event_type === 'ISSUED')).toMatchObject({ actor_id: custodian.userId, from_location: 'Mikocheni yard', to_location: 'Bagamoyo km 12' });
    expect(detail.readings.map((r: any) => r.source)).toEqual(['RETURN', 'ISSUE', 'MANUAL']);
    // History is evidence: it can't be rewritten, even by the app role.
    await expect(withTenant(A.tenantId, (trx: any) => trx.updateTable('project_equipment_events').set({ event_type: 'FORGED' }).where('resource_id', '=', asset.id).execute())).rejects.toThrow(/append-only/);
    expect((await withTenant<any[]>(B.tenantId, (trx: any) => trx.selectFrom('project_equipment_events').select('id').where('resource_id', '=', asset.id).execute())).length).toBe(0);
  });

  it('serialises concurrent bookings and shows conflicts at selection time', async () => {
    const asset = await newAsset({ name: 'Roller BW 211', resource_type: 'heavy_machinery' });
    const book = (key: string) => call(member, 'POST', `${E}/projects/${projA}/requests`, { resource_id: asset.id, start_date: day(20), end_date: day(25), request_key: key });
    const both = await Promise.all([book(`a-${randomUUID()}`), book(`b-${randomUUID()}`)]);
    expect(both.map(r => r.statusCode).sort()).toEqual([201, 409]);
    const check = (await call(member, 'GET', `${E}/assets/${asset.id}/availability?start=${day(22)}&end=${day(30)}`)).json();
    expect(check).toMatchObject({ ok: false, fits: false });
    expect(check.conflicts[0]).toMatchObject({ project_name: 'Bagamoyo road', status: 'requested' });
    expect((await call(member, 'GET', `${E}/assets/${asset.id}/availability?start=${day(26)}&end=${day(30)}`)).json().ok).toBe(true);
    // An unrelated user sees that it's taken, not whose project took it.
    const otherView = (await call(outsider, 'GET', `${E}/assets/${asset.id}/availability?start=${day(22)}&end=${day(23)}`)).json();
    expect(otherView.conflicts[0].project_name).toBe('Another project');
  });

  it('blocks assets with expired certificates, failed inspections or ended rentals, with reasons', async () => {
    const crane = await newAsset({ name: 'Mobile crane 50t', resource_type: 'heavy_machinery' });
    expect((await call(A, 'POST', `${E}/assets/${crane.id}/certificates`, { certificate_type: 'Load test certificate', issued_on: day(-400), expires_on: day(5) })).statusCode).toBe(201);
    const blocked = await call(pm, 'POST', `${E}/projects/${projA}/requests`, { resource_id: crane.id, start_date: day(1), end_date: day(10) });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().message).toMatch(/Load test certificate expires on/);
    expect((await call(pm, 'POST', `${E}/projects/${projA}/requests`, { resource_id: crane.id, start_date: day(1), end_date: day(4) })).statusCode).toBe(201);

    const van = await newAsset({ name: 'Hiace van', resource_type: 'vehicle', meter_unit: 'KM', meter_reading: 54000, registration_number: 'T 123 ABC' });
    expect((await call(member, 'POST', `${E}/assets/${van.id}/inspections`, { inspection_type: 'PERIODIC', result: 'FAIL', defects: 'x' })).statusCode).toBe(403);
    expect((await call(custodian, 'POST', `${E}/assets/${van.id}/inspections`, { inspection_type: 'PERIODIC', result: 'FAIL' })).statusCode).toBe(400);
    expect((await call(custodian, 'POST', `${E}/assets/${van.id}/inspections`, { inspection_type: 'PERIODIC', result: 'FAIL', defects: 'Brake pads worn' })).statusCode).toBe(201);
    const unavailable = (await call(member, 'GET', `${E}/assets?availability=unavailable&q=Hiace`)).json().data;
    expect(unavailable[0].eligibility.reasons[0]).toMatch(/Brake pads worn/);
    // Repair clears it.
    const repair = await call(custodian, 'POST', `${E}/assets/${van.id}/maintenance`, { kind: 'REPAIR', description: 'Replace brake pads', start_now: true });
    expect(repair.statusCode, repair.body).toBe(201);
    expect((await call(A, 'GET', `${E}/assets/${van.id}`)).json().asset.status).toBe('maintenance');
    expect((await call(custodian, 'POST', `${E}/maintenance/${repair.json().id}/complete`, { downtime_hours: 6, cost: 90000 })).statusCode).toBe(403); // custodian can't see costs
    expect((await call(custodian, 'POST', `${E}/maintenance/${repair.json().id}/complete`, { downtime_hours: 6 })).statusCode).toBe(200);
    expect((await call(custodian, 'POST', `${E}/assets/${van.id}/inspections`, { inspection_type: 'PERIODIC', result: 'PASS' })).statusCode).toBe(201);
    expect((await call(A, 'GET', `${E}/assets/${van.id}`)).json().asset).toMatchObject({ status: 'available', eligibility: { ok: true } });

    const hired = await newAsset({ name: 'Hired dozer D6', ownership: 'RENTED', rental_start: day(-30), rental_end: day(7), rental_reference: 'HIRE-778' });
    const late = await call(pm, 'POST', `${E}/projects/${projA}/requests`, { resource_id: hired.id, start_date: day(1), end_date: day(14) });
    expect(late.statusCode).toBe(409);
    expect(late.json().message).toMatch(/Rental ends on/);
  });

  it('reassigns site to site, reports overdue returns, and reminds once', async () => {
    const tool = await newAsset({ name: 'Concrete vibrator', resource_type: 'tool', meter_unit: null, meter_reading: null, code: `TL-${randomUUID().slice(0, 6)}` });
    const r = await call(A, 'POST', `${E}/projects/${projA}/requests`, { resource_id: tool.id, start_date: day(-5), end_date: day(-1) });
    expect(r.json().status).toBe('confirmed'); // an equipment manager books directly
    expect((await call(A, 'POST', `${E}/allocations/${r.json().id}/issue`, { condition: 'GOOD' })).statusCode).toBe(200);
    const overdue = (await call(pm, 'GET', `${E}/allocations?view=overdue`)).json().data;
    expect(overdue.some((a: any) => a.id === r.json().id && a.overdue)).toBe(true);
    expect((await call(outsider, 'GET', `${E}/allocations?view=overdue`)).json().data.some((a: any) => a.id === r.json().id)).toBe(false);
    const moved = await call(custodian, 'POST', `${E}/allocations/${r.json().id}/reassign`, { project_id: projA2, end_date: day(6) });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json()).toMatchObject({ project_id: projA2, status: 'issued' });
    expect((await call(custodian, 'POST', `${E}/allocations/${r.json().id}/reassign`, { project_id: randomUUID(), end_date: day(6) })).statusCode).toBe(409);
    const first = await withTenant(A.tenantId, trx => sendEquipmentReminders(trx as any, A.tenantId));
    const second = await withTenant(A.tenantId, trx => sendEquipmentReminders(trx as any, A.tenantId));
    expect(second).toBe(0);
    expect(first).toBeGreaterThanOrEqual(0);
  });

  it('imports with row errors and duplicate handling', async () => {
    const code = `IMP-${randomUUID().slice(0, 6)}`;
    const rows = [
      { Code: code, Name: 'Generator 60kVA', 'Resource type': 'Equipment', Ownership: 'leased', 'Capacity value': '60', 'Capacity unit': 'kVA', 'Meter unit': 'hours', 'Meter reading': '3,400' },
      { code: `${code}-2`, name: '', resource_type: 'tool' },
      { code, name: 'Duplicate in file', resource_type: 'tool' },
      { code: `${code}-3`, name: 'Bad rental', resource_type: 'vehicle', rental_start: '2026-05-01', rental_end: '2026-04-01' },
    ];
    expect((await call(member, 'POST', `${E}/assets/import`, { rows })).statusCode).toBe(403);
    const dry = (await call(delegate, 'POST', `${E}/assets/import`, { rows })).json();
    expect(dry.summary).toEqual({ create: 1, update: 0, skip: 0, error: 3 });
    expect(dry.results[1].errors[0]).toMatch(/^name/);
    expect(dry.results[2].errors[0]).toMatch(/more than once/);
    expect((await call(delegate, 'POST', `${E}/assets/import`, { rows, dry_run: false })).statusCode).toBe(400);
    const ok = await call(delegate, 'POST', `${E}/assets/import`, { rows: [rows[0]], dry_run: false });
    expect(ok.json().summary.create).toBe(1);
    const again = (await call(delegate, 'POST', `${E}/assets/import`, { rows: [{ ...rows[0], Name: 'Generator 60kVA (Cummins)' }], dry_run: false, on_duplicate: 'update' })).json();
    expect(again.summary.update).toBe(1);
    const list = (await call(A, 'GET', `${E}/assets?q=${code}`)).json();
    expect(list.total).toBe(1);
    expect(list.data[0]).toMatchObject({ name: 'Generator 60kVA (Cummins)', ownership: 'LEASED', meter_unit: 'HOURS', meter_reading: 3400, capacity_unit: 'kVA' });
  });
});
