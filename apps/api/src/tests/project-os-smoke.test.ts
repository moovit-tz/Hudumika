// Create-one-of-everything smoke suite for the `/v1/project-os` API —
// the executable form of docs/project-os-hardening-review.md § Round 2.
//
// Unrepaired schema/approval paths remain explicit expected failures.
// Portfolios, programs and project membership now use ordinary assertions;
// convert the remaining cases as their contracts are reconciled.
//
// The plain `it()` cases are safety invariants that must hold whether or
// not the happy path works — cross-tenant isolation, member-scoped
// authorization, and "no fabricated metrics".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { ProjectGovernanceService } from '../services/project-governance.service.js';
import { withTenant, dbPlatform } from '../db/client.js';
import { seedProjectContractExamples, contractExamples } from '../scripts/seed-project-contract-examples.mjs';

const P = '/v1/project-os';

/** Grant the `projects` entitlement to a fresh test tenant via the
 *  per-tenant manual override the entitlement middleware reads first
 *  (tenant_settings['enabled-apps'][key]). */
async function grantProjects(tenantId: string) {
  const existing = await dbPlatform
    .selectFrom('tenant_settings' as any)
    .select('tenant_id' as any)
    .where('tenant_id' as any, '=', tenantId)
    .executeTakeFirst();
  const settings = { 'enabled-apps': { projects: true } };
  if (existing) {
    await dbPlatform
      .updateTable('tenant_settings' as any)
      .set({ settings: sql`jsonb_set(coalesce(settings, '{}'::jsonb), '{enabled-apps,projects}', 'true'::jsonb, true)` } as any)
      .where('tenant_id' as any, '=', tenantId)
      .execute();
  } else {
    await dbPlatform
      .insertInto('tenant_settings' as any)
      .values({ tenant_id: tenantId, settings: JSON.stringify(settings) } as any)
      .execute();
  }
}

/** Insert a row straight into the REAL (migration 448) schema, bypassing
 *  the broken create endpoints, so the PATCH/decision routes have
 *  something to act on. */
async function mkReal(tenantId: string, table: string, row: Record<string, unknown>) {
  return withTenant(tenantId, async (trx) =>
    (trx as any).insertInto(table).values(row).returning(['id']).executeTakeFirstOrThrow(),
  );
}

describe('Project OS API — create-one-of-everything smoke', () => {
  let A: TestTenant;
  let B: TestTenant;
  let projA: string;
  let projB: string;
  let supA: string;

  beforeAll(async () => {
    await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    await grantProjects(A.tenantId);
    await grantProjects(B.tenantId);

    projA = randomUUID();
    projB = randomUUID();
    await mkReal(A.tenantId, 'projects', { id: projA, tenant_id: A.tenantId, name: 'Smoke A', owner_id: A.userId });
    await mkReal(B.tenantId, 'projects', { id: projB, tenant_id: B.tenantId, name: 'Smoke B', owner_id: B.userId });
    supA = (await mkReal(A.tenantId, 'suppliers', { tenant_id: A.tenantId, name: 'Smoke Supplier A' })).id;
  });

  afterAll(async () => {
    await withTenant(A.tenantId, trx => trx.deleteFrom('contracts').where('tenant_id', '=', A.tenantId).execute());
    await withTenant(A.tenantId, trx => trx.deleteFrom('project_goods_receipts').where('tenant_id', '=', A.tenantId).execute());
    await withTenant(A.tenantId, trx => trx.deleteFrom('projects').where('tenant_id', '=', A.tenantId).execute());
    await A.cleanup();
    await withTenant(B.tenantId, trx => trx.deleteFrom('projects').where('tenant_id', '=', B.tenantId).execute());
    await B.cleanup();
  }, 60000);

  // ── Harness sanity — must be green today ─────────────────────────────────
  it('the `projects` entitlement grant works (portfolios list is reachable, not 403)', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/portfolios`, headers: authHeaders(A.token) });
    expect(res.statusCode).not.toBe(403);
  });

  // ── R2-1 · repaired foundations and remaining schema-contract failures ──

  it('POST /portfolios → 201 with an id', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/portfolios`, headers: authHeaders(A.token),
      payload: { name: 'Infra', code: `PF${Date.now() % 100000}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy();
  });

  it('GET /portfolios → 200 array', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/portfolios`, headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /programs → 201', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/programs`, headers: authHeaders(A.token),
      payload: { name: 'Grid', code: `PG${Date.now() % 100000}` },
    });
    expect(res.statusCode).toBe(201);
  });

  it('round-trips portfolio/program metadata and rejects foreign tenant references without writes', async () => {
    const app = await getApp();
    const create = await app.inject({ method: 'POST', url: `${P}/portfolios`, headers: authHeaders(A.token),
      payload: { name: 'Capital', code: `PF-${randomUUID().slice(0, 8)}`, owner_id: A.userId,
        allocated_budget: 12000, currency: 'KES', target_roi: 8, strategic_alignment: { goal: 'Growth' }, status: 'planning' } });
    expect(create.statusCode, create.body).toBe(201);
    const portfolio = create.json();
    expect(portfolio).toMatchObject({ owner_id: A.userId, allocated_budget: 12000, currency: 'KES', target_roi: 8, status: 'planning', spent_budget: null });
    const program = await app.inject({ method: 'POST', url: `${P}/programs`, headers: authHeaders(A.token),
      payload: { name: 'Delivery', code: `PG-${randomUUID().slice(0, 8)}`, portfolio_id: portfolio.id,
        program_manager_id: A.userId, budget: 4000, currency: 'KES', target_benefits: ['Growth'], status: 'completed' } });
    expect(program.statusCode, program.body).toBe(201);
    const list = await app.inject({ method: 'GET', url: `${P}/programs?portfolioId=${portfolio.id}`, headers: authHeaders(A.token) });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json()).toEqual([expect.objectContaining({ id: program.json().id, program_manager_id: A.userId,
      budget: 4000, currency: 'KES', target_benefits: ['Growth'], status: 'completed', portfolio_name: 'Capital' })]);
    const portfolioList = await app.inject({ method: 'GET', url: `${P}/portfolios`, headers: authHeaders(A.token) });
    expect(portfolioList.json()).toContainEqual(expect.objectContaining({ id: portfolio.id, target_roi: 8,
      strategic_alignment: { goal: 'Growth' }, owner_name: `Test TENANT_ADMIN` }));
    for (const [url, payload] of [
      [`${P}/portfolios`, { owner_id: B.userId }],
      [`${P}/programs`, { program_manager_id: B.userId }],
    ] as const) {
      const denied = await app.inject({ method: 'POST', url, headers: authHeaders(A.token),
        payload: { name: 'Foreign manager', code: `BAD-${randomUUID().slice(0, 8)}`, ...payload } });
      expect(denied.statusCode, denied.body).toBe(404);
    }
    const foreign = await app.inject({ method: 'POST', url: `${P}/programs`, headers: authHeaders(B.token),
      payload: { name: 'Foreign portfolio', code: 'FOREIGN', portfolio_id: portfolio.id } });
    expect(foreign.statusCode, foreign.body).toBe(404);
    const foreignList = await app.inject({ method: 'GET', url: `${P}/programs`, headers: authHeaders(B.token) });
    expect(foreignList.json()).toEqual([]);
    const counts = await withTenant(A.tenantId, (trx) => trx.selectFrom('project_programs').select('id')
      .where('tenant_id', '=', A.tenantId).where('name', '=', 'Foreign manager').execute());
    expect(counts).toEqual([]);
  });

  it('POST /projects/:id/phases → 201', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/phases`, headers: authHeaders(A.token),
      payload: { name: 'Mobilisation', code: 'PH1' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('phase scheduling and gate configuration survive create, list and review', async () => {
    const app = await getApp();
    const created = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/phases`,
      headers: authHeaders(A.token), payload: { name: 'Acceptance phase', sequence_order: 8,
        gate_review_date: '2026-11-01', gate_criteria: { evidence: 'Inspection report' }, notes: 'Review before handover' } });
    expect(created.statusCode).toBe(201);
    const phase = created.json();
    expect(phase.code).toMatch(/^PH-/);
    expect(phase).toMatchObject({ sequence_order: 8, status: 'not_started', gate_passed: false,
      gate_criteria: { evidence: 'Inspection report' }, notes: 'Review before handover' });
    const next = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/phases`, headers: authHeaders(A.token), payload: { name: 'Next phase' } });
    expect(next.statusCode).toBe(201);
    expect(next.json().sequence_order).toBe(9);
    const reviewed = await app.inject({ method: 'PATCH', url: `${P}/phases/${phase.id}/gate`, headers: authHeaders(A.token), payload: { passed: true } });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json()).toMatchObject({ status: 'completed', gate_passed: true, gate_criteria: phase.gate_criteria });
    const listed = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/phases`, headers: authHeaders(A.token) });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().find((row: any) => row.id === phase.id)).toMatchObject({ status: 'completed', gate_passed: true });
  });

  it('gate reviews reject foreign tenants and unassigned members without changing the phase', async () => {
    const app = await getApp();
    const created = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/phases`, headers: authHeaders(A.token), payload: { name: 'Protected gate' } });
    expect(created.statusCode).toBe(201);
    const phase = created.json();
    const outsider = await A.addUser('JUNIOR');
    for (const [token, status] of [[B.token, 404], [outsider.token, 403]] as const) {
      const response = await app.inject({ method: 'PATCH', url: `${P}/phases/${phase.id}/gate`, headers: authHeaders(token), payload: { passed: true } });
      expect(response.statusCode).toBe(status);
    }
    const contradictory = await app.inject({ method: 'PATCH', url: `${P}/phases/${phase.id}/gate`, headers: authHeaders(A.token), payload: { passed: false, status: 'completed' } });
    expect(contradictory.statusCode).toBe(400);
    const stored = await withTenant(A.tenantId, trx => trx.selectFrom('project_phases').select(['status', 'metadata']).where('tenant_id', '=', A.tenantId).where('id', '=', phase.id).executeTakeFirstOrThrow());
    expect(stored.status).toBe('PLANNED');
    expect(stored.metadata.gate_passed).toBe(false);
  });

  it('POST /projects/:id/work-packages → 201', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/work-packages`, headers: authHeaders(A.token),
      payload: { wbs_code: '1.1', name: 'Earthworks' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('work packages preserve budget and reject references outside their project or tenant', async () => {
    const app = await getApp();
    const phase = await mkReal(A.tenantId, 'project_phases', { tenant_id: A.tenantId, project_id: projA, name: 'WBS phase', code: 'WBS-PH' });
    const parent = await mkReal(A.tenantId, 'project_work_packages', { tenant_id: A.tenantId, project_id: projA, name: 'Parent', wbs_code: 'WBS-PARENT' });
    const payload = { wbs_code: 'WBS-CHILD', name: 'Foundation', phase_id: phase.id, parent_id: parent.id,
      lead_id: A.userId, planned_cost: 1200, progress_pct: 25, status: 'approved' };
    const created = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/work-packages`, headers: authHeaders(A.token), payload });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ parent_id: parent.id, lead_id: A.userId, planned_cost: 1200, earned_value: 300, status: 'approved' });
    const listed = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/work-packages`, headers: authHeaders(A.token) });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().find((row: any) => row.id === created.json().id)).toMatchObject({ phase_name: 'WBS phase', planned_cost: 1200, actual_cost: 0 });
    const otherProject = await mkReal(A.tenantId, 'projects', { id: randomUUID(), tenant_id: A.tenantId, name: 'Other project', owner_id: A.userId });
    const otherPhase = await mkReal(A.tenantId, 'project_phases', { tenant_id: A.tenantId, project_id: otherProject.id, name: 'Other', code: 'OTHER' });
    const otherPackage = await mkReal(A.tenantId, 'project_work_packages', { tenant_id: A.tenantId, project_id: otherProject.id, name: 'Other package', wbs_code: 'OTHER' });
    for (const overrides of [{ phase_id: otherPhase.id }, { parent_id: otherPackage.id }, { lead_id: B.userId }]) {
      const rejected = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/work-packages`, headers: authHeaders(A.token), payload: { ...payload, wbs_code: 'REJECTED', ...overrides } });
      expect(rejected.statusCode).toBe(404);
    }
    const rows = await withTenant(A.tenantId, trx => trx.selectFrom('project_work_packages').select('id').where('tenant_id', '=', A.tenantId).where('wbs_code', '=', 'REJECTED').execute());
    expect(rows).toEqual([]);
  });

  it('POST /projects/:id/deliverables → 201 with an id', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/deliverables`, headers: authHeaders(A.token),
      payload: { title: 'GA Drawing' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy();
  });

  it('deliverables round-trip and only project managers can review them', async () => {
    const app = await getApp();
    const headers = authHeaders(A.token);
    const created = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/deliverables`, headers,
      payload: { title: 'Acceptance drawing', description: 'For handover', acceptance_criteria: 'Signed inspection' } });
    expect(created.statusCode).toBe(201);
    const row = created.json();
    expect(row).toMatchObject({ title: 'Acceptance drawing', owner_id: A.userId, status: 'pending', description: 'For handover' });
    expect(row.code).toMatch(/^DL-/);
    const outsider = await A.addUser('JUNIOR');
    for (const [token, status] of [[B.token, 404], [outsider.token, 403]] as const) {
      const rejected = await app.inject({ method: 'PATCH', url: `${P}/deliverables/${row.id}/review`, headers: authHeaders(token), payload: { status: 'approved' } });
      expect(rejected.statusCode).toBe(status);
    }
    const approved = await app.inject({ method: 'PATCH', url: `${P}/deliverables/${row.id}/review`, headers, payload: { status: 'approved' } });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ status: 'approved', approved_by: A.userId, acceptance_criteria: 'Signed inspection' });
    expect(approved.json().approved_at).toBeTruthy();
    const rejected = await app.inject({ method: 'PATCH', url: `${P}/deliverables/${row.id}/review`, headers, payload: { status: 'rejected', rejection_reason: 'Missing inspection' } });
    expect(rejected.statusCode).toBe(200);
    const listed = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/deliverables`, headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().find((d: any) => d.id === row.id)).toMatchObject({ status: 'rejected', approved_by: null, approved_at: null, rejection_reason: 'Missing inspection' });
  });

  it('deliverables reject foreign owners, project links and unsupported signing without writes', async () => {
    const app = await getApp();
    const foreignPhase = await mkReal(B.tenantId, 'project_phases', { tenant_id: B.tenantId, project_id: projB, name: 'Foreign phase', code: 'DL-FOREIGN' });
    const foreignPackage = await mkReal(B.tenantId, 'project_work_packages', { tenant_id: B.tenantId, project_id: projB, name: 'Foreign package', wbs_code: 'DL-FOREIGN' });
    for (const payload of [{ owner_id: B.userId }, { phase_id: foreignPhase.id }, { work_package_id: foreignPackage.id }, { contract_id: randomUUID() }]) {
      const response = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/deliverables`, headers: authHeaders(A.token), payload: { title: 'Rejected reference', ...payload } });
      expect(response.statusCode).toBe(404);
    }
    const unavailable = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/deliverables`, headers: authHeaders(A.token), payload: { title: 'Rejected reference', sign_document_id: randomUUID() } });
    expect(unavailable.statusCode).toBe(501);
    const rows = await withTenant(A.tenantId, trx => trx.selectFrom('project_deliverables').select('id').where('tenant_id', '=', A.tenantId).where('name', '=', 'Rejected reference').execute());
    expect(rows).toEqual([]);
  });

  it('POST /projects/:id/risks → 201 (probability/impact are INTEGER 1-5, not strings; risk_code is NOT NULL)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/risks`, headers: authHeaders(A.token),
      payload: { title: 'FX exposure', probability: 'likely', impact: 'high' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /projects/:id/issues → 201 (owner_id + issue_code are NOT NULL; severity is UPPERCASE)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/issues`, headers: authHeaders(A.token),
      payload: { title: 'Late permit', severity: 'high' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('risk levels, score and mitigation settings survive create, list and status updates', async () => {
    const app = await getApp();
    const headers = authHeaders(A.token);
    const created = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/risks`, headers,
      payload: { title: 'Safety review', probability: 'moderate', impact: 'high', category: 'safety', strategy: 'avoid',
        mitigation_plan: 'Inspection', contingency_plan: 'Stop work', financial_exposure: 250, owner_id: A.userId, review_date: '2026-11-01' } });
    expect(created.statusCode).toBe(201);
    const risk = created.json();
    expect(risk).toMatchObject({ probability: 'moderate', impact: 'high', score: 12, category: 'safety', strategy: 'avoid', status: 'open' });
    const stored = await withTenant(A.tenantId, trx => trx.selectFrom('project_risks').selectAll().where('tenant_id', '=', A.tenantId).where('id', '=', risk.id).executeTakeFirstOrThrow());
    expect(stored).toMatchObject({ probability: 3, impact: 4, score: 12, category: 'SAFETY_HSE', status: 'IDENTIFIED' });
    const updated = await app.inject({ method: 'PATCH', url: `${P}/risks/${risk.id}/status`, headers, payload: { status: 'mitigated', mitigation_plan: 'Inspected' } });
    expect(updated.statusCode).toBe(200);
    const listed = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/risks`, headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().find((r: any) => r.id === risk.id)).toMatchObject({ status: 'mitigated', mitigation_plan: 'Inspected', strategy: 'avoid', review_date: '2026-11-01', financial_exposure: 250 });
  });

  it('legacy risk rows use their real numeric levels instead of stale default scores', async () => {
    const app = await getApp();
    const row = await mkReal(A.tenantId, 'project_risks', { tenant_id: A.tenantId, project_id: projA,
      risk_code: 'LEGACY-SCORE', title: 'Legacy scored risk', category: 'COMMERCIAL', probability: 5, impact: 5 });
    const listed = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/risks`, headers: authHeaders(A.token) });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()[0].id).toBe(row.id);
    expect(listed.json()[0]).toMatchObject({ score: 25, probability: 'almost_certain', impact: 'critical', strategy: null });
  });

  it('issues preserve assigned owner and impacts and record resolution', async () => {
    const app = await getApp();
    const headers = authHeaders(A.token);
    const created = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/issues`, headers,
      payload: { title: 'Inspection delay', severity: 'critical', impact_cost: 450, impact_schedule_days: 3, root_cause: 'Permit' } });
    expect(created.statusCode).toBe(201);
    const issue = created.json();
    expect(issue).toMatchObject({ severity: 'critical', status: 'open', assigned_to: A.userId, impact_cost: 450, impact_schedule_days: 3 });
    const resolved = await app.inject({ method: 'PATCH', url: `${P}/issues/${issue.id}/resolve`, headers, payload: { resolution: 'Permit issued' } });
    expect(resolved.statusCode).toBe(200);
    const listed = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/issues`, headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().find((r: any) => r.id === issue.id)).toMatchObject({ status: 'resolved', resolution: 'Permit issued', root_cause: 'Permit', impact_cost: 450 });
    expect(resolved.json().resolved_at).toBeTruthy();
  });

  it('risk and issue writes reject outsiders, viewers and foreign owners without changing records', async () => {
    const app = await getApp();
    const viewer = await A.addUser('JUNIOR');
    await mkReal(A.tenantId, 'project_members', { id: randomUUID(), tenant_id: A.tenantId, project_id: projA, user_id: viewer.userId, role: 'viewer' });
    const outsider = await A.addUser('JUNIOR');
    const risk = await mkReal(A.tenantId, 'project_risks', { tenant_id: A.tenantId, project_id: projA, risk_code: 'PROTECTED', title: 'Protected risk', category: 'COST', probability: 3, impact: 3 });
    const issue = await mkReal(A.tenantId, 'project_issues', { tenant_id: A.tenantId, project_id: projA, issue_code: 'PROTECTED', title: 'Protected issue', owner_id: A.userId });
    for (const [token, expected] of [[B.token, 404], [viewer.token, 403], [outsider.token, 403]] as const) {
      for (const [url, payload] of [[`${P}/risks/${risk.id}/status`, { status: 'closed' }], [`${P}/issues/${issue.id}/resolve`, { resolution: 'Unauthorized' }]] as const) {
        const response = await app.inject({ method: 'PATCH', url, headers: authHeaders(token), payload });
        expect(response.statusCode).toBe(expected);
      }
    }
    for (const [path, payload] of [['risks', { title: 'Foreign owner', probability: 'likely', impact: 'high', owner_id: B.userId }], ['issues', { title: 'Foreign owner', severity: 'high', assigned_to: B.userId }]] as const) {
      const response = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/${path}`, headers: authHeaders(A.token), payload });
      expect(response.statusCode).toBe(404);
    }
    const states = await withTenant(A.tenantId, async trx => ({
      risk: await trx.selectFrom('project_risks').select('status').where('tenant_id', '=', A.tenantId).where('id', '=', risk.id).executeTakeFirstOrThrow(),
      issue: await trx.selectFrom('project_issues').select('status').where('tenant_id', '=', A.tenantId).where('id', '=', issue.id).executeTakeFirstOrThrow(),
      risks: await trx.selectFrom('project_risks').select('id').where('tenant_id', '=', A.tenantId).where('title', '=', 'Foreign owner').execute(),
      issues: await trx.selectFrom('project_issues').select('id').where('tenant_id', '=', A.tenantId).where('title', '=', 'Foreign owner').execute(),
    }));
    expect(states).toMatchObject({ risk: { status: 'IDENTIFIED' }, issue: { status: 'OPEN' }, risks: [], issues: [] });
  });

  it('creates and lists scoped change-request drafts without fabricated approvals', async () => {
    const app = await getApp();
    const payload = { cr_number: `CR-${randomUUID().slice(0, 8)}`, title: 'Add basement', reason: 'Client request', original_scope: 'Ground floor', requested_change: 'Add basement', cost_impact: -100, schedule_impact_days: 3, client_approval_required: true };
    const response = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/change-requests`, headers: authHeaders(A.token), payload });
    expect(response.statusCode).toBe(201);
    const change = response.json();
    expect(change).toMatchObject({ ...payload, status: 'draft', requested_by: A.userId, client_approved_at: null });
    const list = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/change-requests`, headers: authHeaders(A.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toContainEqual(expect.objectContaining({ id: change.id, original_scope: payload.original_scope }));
    const duplicate = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/change-requests`, headers: authHeaders(A.token), payload });
    expect(duplicate.statusCode).toBe(409);
    const incomplete = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/change-requests`, headers: authHeaders(A.token), payload: { ...payload, original_scope: '' } });
    expect(incomplete.statusCode).toBe(400);
    const approvals = await withTenant(A.tenantId, trx => trx.selectFrom('project_approvals').select('id').where('tenant_id', '=', A.tenantId).where('entity_id', '=', change.id).execute());
    expect(approvals).toEqual([]);
  });

  it('edits drafts and submits one named workflow with immutable review content', async () => {
    const app = await getApp();
    const payload = { cr_number: `EDIT-${randomUUID().slice(0, 8)}`, title: 'Original draft', original_scope: 'Existing scope', requested_change: 'Extension', reason: 'Needed' };
    const created = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/change-requests`, headers: authHeaders(A.token), payload });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const url = `${P}/projects/${projA}/change-requests/${id}`;
    const edited = await app.inject({ method: 'PATCH', url, headers: authHeaders(A.token), payload: { ...payload, title: 'Revised draft', cost_impact: -50 } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ title: 'Revised draft', cost_impact: -50, status: 'draft' });
    const foreign = await app.inject({ method: 'POST', url: `${url}/submit`, headers: authHeaders(A.token), payload: { steps: [{ step_name: 'Review', assigned_user_id: B.userId }] } });
    expect(foreign.statusCode).toBe(404);
    const viewer = await A.addUser('TENANT_ADMIN');
    await mkReal(A.tenantId, 'project_members', { id: randomUUID(), tenant_id: A.tenantId, project_id: projA, user_id: viewer.userId, role: 'viewer' });
    const denied = await app.inject({ method: 'POST', url: `${url}/submit`, headers: authHeaders(A.token), payload: { steps: [{ step_name: 'Review', assigned_user_id: viewer.userId }] } });
    expect(denied.statusCode).toBe(403);
    const options = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/approval-approvers`, headers: authHeaders(A.token) });
    expect(options.statusCode).toBe(200);
    expect(options.json().some((person: any) => person.id === viewer.userId)).toBe(false);
    const submit = () => app.inject({ method: 'POST', url: `${url}/submit`, headers: authHeaders(A.token), payload: { steps: [{ step_name: 'Owner review', assigned_user_id: A.userId }] } });
    const responses = await Promise.all([submit(), submit()]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([201, 409]);
    const approval = responses.find(r => r.statusCode === 201)!.json();
    const lateEdit = await app.inject({ method: 'PATCH', url, headers: authHeaders(A.token), payload });
    expect(lateEdit.statusCode).toBe(409);
    const step = await withTenant(A.tenantId, trx => trx.selectFrom('project_approval_steps').select('id').where('tenant_id', '=', A.tenantId).where('approval_id', '=', approval.id).executeTakeFirstOrThrow());
    const decision = await app.inject({ method: 'POST', url: `${P}/approvals/${approval.id}/steps/${step.id}/decision`, headers: authHeaders(A.token), payload: { decision: 'approved' } });
    expect(decision.statusCode).toBe(200);
    expect((await submit()).statusCode).toBe(409);
    const stored = await withTenant(A.tenantId, trx => trx.selectFrom('project_change_requests').select(['status', 'title']).where('tenant_id', '=', A.tenantId).where('id', '=', id).executeTakeFirstOrThrow());
    expect(stored).toEqual({ status: 'APPROVED', title: 'Revised draft' });
  });

  it('GET /approvals → 200 (selects project_approvals.metadata + step_order/required_role that do not exist)', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/approvals`, headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /projects/:id/purchase-requests → 201 (req_number not pr_number; requested_by + title are NOT NULL)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/purchase-requests`, headers: authHeaders(A.token),
      payload: { pr_number: `PR${Date.now() % 100000}`, title: 'Rebar', estimated_cost: 5000 },
    });
    expect(res.statusCode).toBe(201);
  });

  it('persists requisition details and rejects foreign project packages and duplicate codes', async () => {
    const app = await getApp();
    const number = `PR-${randomUUID().slice(0, 8)}`;
    const payload = { pr_number: number, title: 'Safety equipment', estimated_cost: 123.45, required_date: '2026-12-01', justification: 'Protect crew', items: [{ name: 'Helmets', quantity: 5 }] };
    const create = () => app.inject({ method: 'POST', url: `${P}/projects/${projA}/purchase-requests`, headers: authHeaders(A.token), payload });
    const responses = await Promise.all([create(), create()]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([201, 409]);
    const row = responses.find(r => r.statusCode === 201)!.json();
    expect(row).toMatchObject({ ...payload, status: 'submitted', requested_by: A.userId, currency: 'TZS' });
    const list = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/purchase-requests`, headers: authHeaders(A.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toContainEqual(expect.objectContaining({ id: row.id, items: payload.items, estimated_cost: 123.45 }));
    const pack = await mkReal(B.tenantId, 'project_work_packages', { tenant_id: B.tenantId, project_id: projB, wbs_code: 'FOREIGN-PR', name: 'Foreign package' });
    const foreign = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/purchase-requests`, headers: authHeaders(A.token), payload: { ...payload, pr_number: 'FOREIGN-PR', work_package_id: pack.id } });
    expect(foreign.statusCode).toBe(404);
    const missing = await withTenant(A.tenantId, trx => trx.selectFrom('project_purchase_requests').select('id').where('tenant_id', '=', A.tenantId).where('req_number', '=', 'FOREIGN-PR').execute());
    expect(missing).toEqual([]);
  });

  it('creates and lists RFQs with real supplier references and an explicit deadline', async () => {
    const app = await getApp();
    const payload = { rfq_number: `RFQ-${randomUUID().slice(0, 8)}`, title: 'Rebar supply', scope_description: 'Grade and quantity specification', issue_date: '2026-10-10', closing_date: '2026-12-01', suppliers: [{ supplier_id: supA, quoted_amount: 0, technical_compliance_score: 80, commercial_score: 70 }] };
    const create = (body: any = payload) => app.inject({ method: 'POST', url: `${P}/projects/${projA}/rfqs`, headers: authHeaders(A.token), payload: body });
    const responses = await Promise.all([create(), create()]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([201, 409]);
    const rfq = responses.find(response => response.statusCode === 201)!.json();
    expect(rfq).toMatchObject({ title: payload.title, closing_date: payload.closing_date, status: 'issued', created_by: A.userId });
    const list = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/rfqs`, headers: authHeaders(A.token) });
    expect(list.statusCode).toBe(200);
    const loaded = list.json().find((row: any) => row.id === rfq.id);
    expect(loaded).toMatchObject({ scope_description: payload.scope_description, suppliers: [expect.objectContaining({ supplier_id: supA, supplier_name: 'Smoke Supplier A', quoted_amount: 0, technical_compliance_score: 80, commercial_score: 70, is_selected: false, bid_currency: 'TZS' })] });
    const supplierB = await mkReal(B.tenantId, 'suppliers', { tenant_id: B.tenantId, name: 'Foreign RFQ supplier' });
    expect((await create({ ...payload, rfq_number: 'FOREIGN-RFQ', suppliers: [{ supplier_id: supplierB.id }] })).statusCode).toBe(404);
    expect((await create({ ...payload, rfq_number: 'DUP-SUPPLIER', suppliers: [payload.suppliers[0], payload.suppliers[0]] })).statusCode).toBe(400);
    expect((await create({ ...payload, rfq_number: 'BAD-DATE', closing_date: '2026-01-01' })).statusCode).toBe(400);
    const foreignRequest = await mkReal(B.tenantId, 'project_purchase_requests', { tenant_id: B.tenantId, project_id: projB, req_number: 'FOREIGN-RFQ-PR', title: 'Foreign request', requested_by: B.userId });
    expect((await create({ ...payload, rfq_number: 'FOREIGN-PR-RFQ', purchase_request_id: foreignRequest.id })).statusCode).toBe(404);
    const rejected = await withTenant(A.tenantId, trx => trx.selectFrom('project_rfqs').select('id').where('tenant_id', '=', A.tenantId).where('rfq_number', 'in', ['FOREIGN-RFQ', 'DUP-SUPPLIER', 'BAD-DATE', 'FOREIGN-PR-RFQ']).execute());
    expect(rejected).toEqual([]);
  });

  it('seeds three complete unsigned project-linked contract examples idempotently', async () => {
    for (const example of contractExamples) await mkReal(A.tenantId, 'projects', { id: randomUUID(), tenant_id: A.tenantId, owner_id: A.userId, name: example.project, industry: example.industry });
    const first = await seedProjectContractExamples(A.tenantId, A.userId);
    expect(first).toHaveLength(3);
    expect(first.every(row => row.created)).toBe(true);
    const second = await seedProjectContractExamples(A.tenantId, A.userId);
    expect(second.map(row => row.id)).toEqual(first.map(row => row.id));
    expect(second.every(row => !row.created)).toBe(true);
    const app = await getApp();
    for (const item of first) {
      const res = await app.inject({ method: 'GET', url: `/v1/contracts/${item.id}`, headers: authHeaders(A.token) });
      expect(res.statusCode).toBe(200);
      const row = res.json().data;
      expect(row).toMatchObject({ status: 'draft', currency: 'TZS', sign_envelope_id: null, signed_at: null });
      expect(row.project_id).toBeTruthy();
      expect(row.content.length).toBeGreaterThan(9000);
      expect(row.content).toContain('UNSIGNED');
      expect(row.content).toContain('SCHEDULE B');
      expect((await app.inject({ method: 'GET', url: `/v1/contracts/${item.id}`, headers: authHeaders(B.token) })).statusCode).toBe(404);
    }
  });

  it('purchase orders persist drafts with real suppliers and reject foreign links and duplicates', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/purchase-orders`, headers: authHeaders(A.token),
      payload: { po_number: 'PO-VERIFIED', supplier_id: supA, total_amount: 12000, payment_terms: '30 days after acceptance', items: [{ description: 'Steel', quantity: 2 }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'draft', currency: 'TZS', total_amount: 12000 });
    const list = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/purchase-orders`, headers: authHeaders(A.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().find((row: any) => row.po_number === 'PO-VERIFIED')).toMatchObject({ supplier_id: supA, payment_terms: '30 days after acceptance', items: [{ description: 'Steel', quantity: 2 }] });
    const create = (payload: any) => app.inject({ method: 'POST', url: `${P}/projects/${projA}/purchase-orders`, headers: authHeaders(A.token), payload });
    expect((await create({ po_number: 'PO-VERIFIED', supplier_id: supA, total_amount: 1 })).statusCode).toBe(409);
    const supplierB = await mkReal(B.tenantId, 'suppliers', { tenant_id: B.tenantId, name: 'Foreign PO supplier' });
    expect((await create({ po_number: 'PO-FOREIGN', supplier_id: supplierB.id, total_amount: 1 })).statusCode).toBe(404);
    expect((await create({ po_number: 'PO-MISSING', total_amount: 1 })).statusCode).toBe(400);
    const foreignRequest = await mkReal(B.tenantId, 'project_purchase_requests', { tenant_id: B.tenantId, project_id: projB, req_number: 'PO-FOREIGN-REQ', title: 'Foreign', requested_by: B.userId });
    expect((await create({ po_number: 'PO-FOREIGN-REQ', supplier_id: supA, total_amount: 1, purchase_request_id: foreignRequest.id })).statusCode).toBe(404);
    const foreignRfq = await mkReal(B.tenantId, 'project_rfqs', { tenant_id: B.tenantId, project_id: projB, rfq_number: 'PO-FOREIGN-RFQ', title: 'Foreign', submission_deadline: '2027-01-01' });
    expect((await create({ po_number: 'PO-FOREIGN-RFQ', supplier_id: supA, total_amount: 1, rfq_id: foreignRfq.id })).statusCode).toBe(404);
    expect((await create({ po_number: 'PO-BAD-DATE', supplier_id: supA, total_amount: 1, issue_date: '2026-12-01', expected_delivery_date: '2026-11-01' })).statusCode).toBe(400);
    const duplicate = await Promise.all([create({ po_number: 'PO-CONCURRENT', supplier_id: supA, total_amount: 1 }), create({ po_number: 'PO-CONCURRENT', supplier_id: supA, total_amount: 1 })]);
    expect(duplicate.map(r => r.statusCode).sort()).toEqual([201, 409]);
  });

  it('goods receipts persist inspection evidence without completing orders and reject invalid links', async () => {
    const app = await getApp();
    const po = await mkReal(A.tenantId, 'project_purchase_orders', {
      tenant_id: A.tenantId, project_id: projA, supplier_id: supA, po_number: `PO-REAL-${Date.now() % 100000}`,
    });
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/goods-receipts`, headers: authHeaders(A.token),
      payload: { po_id: po.id, grn_number: 'GRN-VERIFIED', carrier_delivery_note_ref: 'DN-10', items_received: [{ description: 'Rebar', quantity: 12, unit: 'pieces' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'pending_inspection', received_by: A.userId, carrier_delivery_note_ref: 'DN-10', items_received: [{ description: 'Rebar', quantity: 12, unit: 'pieces' }] });
    const list = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/goods-receipts`, headers: authHeaders(A.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().find((row: any) => row.grn_number === 'GRN-VERIFIED')).toMatchObject({ po_id: po.id, supplier_name: 'Smoke Supplier A' });
    const create = (payload: any) => app.inject({ method: 'POST', url: `${P}/projects/${projA}/goods-receipts`, headers: authHeaders(A.token), payload: { po_id: po.id, items_received: [{ description: 'Rebar', quantity: 1, unit: 'pieces' }], ...payload } });
    expect((await create({ grn_number: 'GRN-VERIFIED' })).statusCode).toBe(409);
    expect((await create({ grn_number: 'GRN-EMPTY', items_received: [] })).statusCode).toBe(400);
    const foreignPo = await mkReal(B.tenantId, 'project_purchase_orders', { tenant_id: B.tenantId, project_id: projB, supplier_id: (await mkReal(B.tenantId, 'suppliers', { tenant_id: B.tenantId, name: 'Foreign receipt supplier' })).id, po_number: 'FOREIGN-GRN-PO' });
    expect((await create({ grn_number: 'GRN-FOREIGN', po_id: foreignPo.id })).statusCode).toBe(404);
    const draftPo = await mkReal(A.tenantId, 'project_purchase_orders', { tenant_id: A.tenantId, project_id: projA, supplier_id: supA, po_number: 'DRAFT-GRN-PO', status: 'DRAFT' });
    expect((await create({ grn_number: 'GRN-DRAFT', po_id: draftPo.id })).statusCode).toBe(409);
    for (const status of ['accepted', 'rejected', 'partially_accepted']) expect((await create({ grn_number: `GRN-${status}`, status })).json().status).toBe(status);
    const results = await Promise.all([create({ grn_number: 'GRN-CONCURRENT' }), create({ grn_number: 'GRN-CONCURRENT' })]);
    expect(results.map(row => row.statusCode).sort()).toEqual([201, 409]);
    const order = await withTenant(A.tenantId, trx => trx.selectFrom('project_purchase_orders').select('status').where('tenant_id', '=', A.tenantId).where('id', '=', po.id).executeTakeFirstOrThrow());
    expect(order.status).toBe('ISSUED');
  });

  it('resources persist canonical rates/specifications with scoped users and unique codes', async () => {
    const app = await getApp();
    const create = (overrides = {}) => app.inject({ method: 'POST', url: `${P}/resources`, headers: authHeaders(A.token), payload: {
      resource_type: 'heavy_machinery', name: 'Excavator 20t', code: 'RESOURCE-VERIFIED', make_model: 'CAT 320',
      cost_rate_hourly: 125, cost_rate_daily: 800, currency: 'TZS', capacity_rating: '20 tonnes', ...overrides,
    } });
    const result = await create();
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({ resource_type: 'heavy_machinery', status: 'available', make_model: 'CAT 320', cost_rate_hourly: 125, cost_rate_daily: 800, capacity_rating: '20 tonnes' });
    const listed = await app.inject({ method: 'GET', url: `${P}/resources?type=heavy_machinery`, headers: authHeaders(A.token) });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().some((row: any) => row.id === result.json().id)).toBe(true);
    expect((await create()).statusCode).toBe(409);
    expect((await create({ code: 'FOREIGN-PERSON', user_id: B.userId })).statusCode).toBe(404);
    const noCode = await create({ code: null });
    expect(noCode.statusCode).toBe(201);
    expect(noCode.json().code).toMatch(/^RES-/);
    const concurrent = await Promise.all([create({ code: 'CONCURRENT-RESOURCE' }), create({ code: 'CONCURRENT-RESOURCE' })]);
    expect(concurrent.map(row => row.statusCode).sort()).toEqual([201, 409]);
  });

  it('fleet edits and allocation release preserve history, guard active bookings and remain tenant scoped', async () => {
    const app = await getApp();
    const resource = await mkReal(A.tenantId, 'project_resources', { tenant_id: A.tenantId, resource_type: 'EQUIPMENT', name: 'Editable crane', code: 'EDIT-RELEASE-RESOURCE' });
    const patch = (payload: object, token = A.token) => app.inject({ method: 'PATCH', url: `${P}/resources/${resource.id}`, headers: authHeaders(token), payload });
    expect((await patch({ name: 'Revised crane', cost_rate_hourly: 250, capacity_rating: '20 tonnes' })).json()).toMatchObject({ name: 'Revised crane', cost_rate_hourly: 250, capacity_rating: '20 tonnes' });
    expect((await patch({ name: 'Foreign edit' }, B.token)).statusCode).toBe(404);
    const viewer = await A.addUser('JUNIOR');
    expect((await patch({ name: 'Unauthorized edit' }, viewer.token)).statusCode).toBe(403);
    const allocation = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/allocations`, headers: authHeaders(A.token), payload: { resource_id: resource.id, start_date: '2030-01-01', end_date: '2030-01-05' } });
    expect(allocation.statusCode).toBe(201);
    expect((await patch({ status: 'maintenance' })).statusCode).toBe(409);
    const release = (token: string) => app.inject({ method: 'POST', url: `${P}/projects/${projA}/allocations/${allocation.json().id}/release`, headers: authHeaders(token) });
    expect((await release(B.token)).statusCode).toBe(403);
    expect((await release(A.token)).json()).toMatchObject({ status: 'RELEASED' });
    expect((await patch({ status: 'maintenance' })).json()).toMatchObject({ status: 'maintenance' });
    const history = await withTenant(A.tenantId, trx => trx.selectFrom('project_resource_allocations').select('status').where('tenant_id', '=', A.tenantId).where('id', '=', allocation.json().id).executeTakeFirstOrThrow());
    expect(history.status).toBe('RELEASED');
  });

  it('allocations persist planning data and enforce date, relationship and concurrent capacity checks', async () => {
    const app = await getApp();
    const res = await mkReal(A.tenantId, 'project_resources', { tenant_id: A.tenantId, resource_type: 'VEHICLE', name: 'Tipper', code: 'ALLOCATION-VERIFIED' });
    const create = (overrides = {}) => app.inject({ method: 'POST', url: `${P}/projects/${projA}/allocations`, headers: authHeaders(A.token), payload: {
      resource_id: res.id, start_date: '2026-01-01', end_date: '2026-01-10', allocated_pct: 60, hours_planned: 24, notes: 'Site haulage', ...overrides,
    } });
    const result = await create();
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({ allocated_pct: 60, hours_planned: 24, hours_actual: 0, notes: 'Site haulage', allocated_cost: 0 });
    const listed = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/allocations`, headers: authHeaders(A.token) });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().find((row: any) => row.id === result.json().id)).toMatchObject({ resource_name: 'Tipper', start_date: '2026-01-01', end_date: '2026-01-10' });
    expect((await create()).statusCode).toBe(409);
    expect((await create({ start_date: '2026-02-02', end_date: '2026-02-01' })).statusCode).toBe(400);
    expect((await create({ start_date: 'invalid' })).statusCode).toBe(400);
    expect((await create({ operator_id: B.userId })).statusCode).toBe(404);
    expect((await create({ work_package_id: (await mkReal(B.tenantId, 'project_work_packages', { tenant_id: B.tenantId, project_id: projB, name: 'Foreign allocation package', wbs_code: 'FOREIGN-ALLOC-WP' })).id })).statusCode).toBe(404);
    const foreign = await mkReal(B.tenantId, 'project_resources', { tenant_id: B.tenantId, resource_type: 'VEHICLE', name: 'Foreign tipper', code: 'FOREIGN-ALLOCATION' });
    expect((await create({ resource_id: foreign.id })).statusCode).toBe(404);
    const concurrent = await Promise.all([create({ allocated_pct: 40 }), create({ allocated_pct: 40 })]);
    expect(concurrent.map(row => row.statusCode).sort()).toEqual([201, 409]);
    expect((await create({ start_date: '2026-02-01', end_date: '2026-02-10', allocated_pct: 100 })).statusCode).toBe(201);
    const unchanged = await withTenant(A.tenantId, trx => trx.selectFrom('project_resources').select('status').where('tenant_id', '=', A.tenantId).where('id', '=', res.id).executeTakeFirstOrThrow());
    expect(unchanged.status).toBe('AVAILABLE');
    const unavailable = await mkReal(A.tenantId, 'project_resources', { tenant_id: A.tenantId, resource_type: 'EQUIPMENT', name: 'Servicing crane', code: 'MAINTENANCE-RESOURCE', status: 'MAINTENANCE' });
    expect((await create({ resource_id: unavailable.id })).statusCode).toBe(409);
    const shared = await mkReal(A.tenantId, 'project_resources', { tenant_id: A.tenantId, resource_type: 'EQUIPMENT', name: 'Shared crane', code: 'SHARED-RESOURCE' });
    expect((await create({ resource_id: shared.id, allocated_pct: 60 })).statusCode).toBe(201);
    expect((await create({ resource_id: shared.id, start_date: '2026-01-20', end_date: '2026-01-30', allocated_pct: 60 })).statusCode).toBe(201);
    expect((await create({ resource_id: shared.id, start_date: '2026-01-01', end_date: '2026-01-30', allocated_pct: 40 })).statusCode).toBe(201);
  });

  it('industry records persist canonical data and restrict edits to project editors', async () => {
    const app = await getApp();
    const created = await app.inject({ method: 'POST', url: `${P}/projects/${projA}/industry-data`, headers: authHeaders(A.token), payload: { industry: 'general', data_type: 'REVIEW', record_data: { title: 'Site review', description: 'Saved review content', question: 'Foundation depth?' } } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ title: 'Site review', data_type: 'REVIEW', record_data: { question: 'Foundation depth?' } });
    const id = created.json().id;
    const list = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/industry-data?dataType=REVIEW`, headers: authHeaders(A.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((row: any) => row.id === id)).toBe(true);
    const edit = (token: string) => app.inject({ method: 'PUT', url: `${P}/industry-data/${id}`, headers: authHeaders(token), payload: { record_data: { title: 'Updated review', description: 'Updated content' } } });
    expect((await edit(B.token)).statusCode).toBe(404);
    const viewer = await A.addUser('JUNIOR');
    await mkReal(A.tenantId, 'project_members', { id: randomUUID(), tenant_id: A.tenantId, project_id: projA, user_id: viewer.userId, role: 'viewer' });
    expect((await edit(viewer.token)).statusCode).toBe(403);
    expect((await edit(A.token)).json()).toMatchObject({ title: 'Updated review', record_data: { description: 'Updated content' } });
  });

  it('project creation preserves enterprise planning values and rejects foreign customer links', async () => {
    const app = await getApp();
    const create = (overrides = {}) => app.inject({ method: 'POST', url: '/v1/tasks/projects', headers: authHeaders(A.token), payload: {
      id: randomUUID(), name: 'Verified project creation', industry: 'it_software', project_type: 'customer_delivery',
      baseline_budget: 120000, contract_value: 150000, currency: 'TZS', startDate: '2026-10-11', targetDate: '2027-02-01',
      location_address: 'Dar es Salaam', tags: ['full project', 'demo'], ...overrides,
    } });
    const result = await create();
    expect(result.statusCode).toBe(201);
    const row = await withTenant(A.tenantId, trx => trx.selectFrom('projects').selectAll().where('tenant_id', '=', A.tenantId).where('id', '=', result.json().data.id).executeTakeFirstOrThrow());
    expect(row.industry).toBe('it_software'); expect(Number(row.baseline_budget)).toBe(120000); expect(Number(row.contract_value)).toBe(150000);
    expect(row.location_address).toBe('Dar es Salaam'); expect(row.custom_fields).toMatchObject({ tags: ['full project', 'demo'] });
    expect((await create({ targetDate: '2026-01-01' })).statusCode).toBe(400);
    const foreign = await mkReal(B.tenantId, 'customers', { tenant_id: B.tenantId, name: 'Foreign project customer' });
    expect((await create({ customerId: foreign.id })).statusCode).toBe(404);
  });

  it('project detail edits persist planning fields and reject invalid dates and foreign links', async () => {
    const app = await getApp();
    const patch = (payload: object, token = A.token) => app.inject({ method: 'PATCH', url: `/v1/tasks/projects/${projA}`, headers: authHeaders(token), payload });
    const saved = await patch({ description: 'Edited scope', location_address: 'Demo site', tags: ['reviewed'], contract_value: 750000, startDate: '2026-10-11', targetDate: '2027-02-01' });
    expect(saved.statusCode).toBe(200);
    const stored = await withTenant(A.tenantId, trx => trx.selectFrom('projects').selectAll().where('tenant_id', '=', A.tenantId).where('id', '=', projA).executeTakeFirstOrThrow());
    expect(stored.description).toBe('Edited scope'); expect(stored.custom_fields).toMatchObject({ tags: ['reviewed'] }); expect(Number(stored.contract_value)).toBe(750000);
    expect((await patch({ targetDate: '2026-01-01' })).statusCode).toBe(400);
    const foreign = await mkReal(B.tenantId, 'customers', { tenant_id: B.tenantId, name: 'Foreign edit customer' });
    expect((await patch({ customerId: foreign.id })).statusCode).toBe(400);
    expect((await patch({ description: 'Foreign edit' }, B.token)).statusCode).toBe(404);
  });

  it('GET /projects/:id/detail → 200 with an evm block', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/detail`, headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().evm).toBeTruthy();
  });

  // ── R2-3 · no fabricated metric ─────────────────────────────────────────
  it('GET /command-center → 200 and portfolio_spi is computed, not the hardcoded 1.02', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/command-center`, headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    // project-os.service.ts:638 — `const portfolioSpi = totalEv > 0 ? 1.02 : 1.0;`
    // With no EV data in a fresh tenant a *computed* SPI is 1.0; 1.02 is the tell.
    expect(res.json().portfolio_spi).not.toBe(1.02);
  });

  it('approval decisions enforce assignment, sequence, parent linkage and concurrency', async () => {
    const app = await getApp();
    const approval = await mkReal(A.tenantId, 'project_approvals', { tenant_id: A.tenantId, project_id: projA, entity_type: 'DELIVERABLE', entity_id: randomUUID(), title: 'Sequential approval', requester_id: A.userId, total_steps: 2 });
    const first = await mkReal(A.tenantId, 'project_approval_steps', { tenant_id: A.tenantId, approval_id: approval.id, step_number: 1, approver_user_id: A.userId, metadata: { step_name: 'Technical review' } });
    const second = await mkReal(A.tenantId, 'project_approval_steps', { tenant_id: A.tenantId, approval_id: approval.id, step_number: 2, approver_user_id: A.userId });
    const other = await mkReal(A.tenantId, 'project_approvals', { tenant_id: A.tenantId, project_id: projA, entity_type: 'DELIVERABLE', entity_id: randomUUID(), title: 'Other approval', requester_id: A.userId });
    const otherStep = await mkReal(A.tenantId, 'project_approval_steps', { tenant_id: A.tenantId, approval_id: other.id, approver_user_id: A.userId });
    const decide = (stepId: string, token = A.token, decision = 'approved') => app.inject({ method: 'POST', url: `${P}/approvals/${approval.id}/steps/${stepId}/decision`, headers: authHeaders(token), payload: { decision } });
    expect((await decide(second.id)).statusCode).toBe(409);
    expect((await decide(otherStep.id)).statusCode).toBe(404);
    expect((await decide(first.id, B.token)).statusCode).toBe(404);
    const otherAdmin = await A.addUser('TENANT_ADMIN');
    expect((await decide(first.id, otherAdmin.token)).statusCode).toBe(403);
    const simultaneous = await Promise.all([decide(first.id), decide(first.id)]);
    expect(simultaneous.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const listing = await app.inject({ method: 'GET', url: `${P}/approvals?projectId=${projA}`, headers: authHeaders(A.token) });
    expect(listing.statusCode).toBe(200);
    const row = listing.json().find((r: any) => r.id === approval.id);
    expect(row).toMatchObject({ current_step: 2, status: 'pending' });
    expect(row.steps[0]).toMatchObject({ step_order: 1, step_name: 'Technical review', assigned_user_id: A.userId, status: 'approved', action_by: A.userId });
    expect((await decide(second.id, A.token, 'rejected')).statusCode).toBe(200);
    expect((await decide(second.id)).statusCode).toBe(409);
    const stored = await withTenant(A.tenantId, trx => trx.selectFrom('project_approvals').selectAll().where('tenant_id', '=', A.tenantId).where('id', '=', approval.id).executeTakeFirstOrThrow());
    expect(stored.status).toBe('REJECTED');
    expect(stored.completed_at).toBeTruthy();
  });

  it('approval inbox and decisions respect project membership including assigned viewers', async () => {
    const app = await getApp();
    const viewer = await A.addUser('JUNIOR');
    await mkReal(A.tenantId, 'project_members', { id: randomUUID(), tenant_id: A.tenantId, project_id: projA, user_id: viewer.userId, role: 'viewer' });
    const outsider = await A.addUser('JUNIOR');
    const approval = await mkReal(A.tenantId, 'project_approvals', { tenant_id: A.tenantId, project_id: projA, entity_type: 'DELIVERABLE', entity_id: randomUUID(), title: 'Private project approval', requester_id: A.userId });
    const step = await mkReal(A.tenantId, 'project_approval_steps', { tenant_id: A.tenantId, approval_id: approval.id, approver_user_id: viewer.userId });
    const hidden = await app.inject({ method: 'GET', url: `${P}/approvals`, headers: authHeaders(outsider.token) });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json()).toEqual([]);
    const filtered = await app.inject({ method: 'GET', url: `${P}/approvals?projectId=${projA}`, headers: authHeaders(outsider.token) });
    expect(filtered.statusCode).toBe(403);
    const visible = await app.inject({ method: 'GET', url: `${P}/approvals?projectId=${projA}`, headers: authHeaders(viewer.token) });
    expect(visible.statusCode).toBe(200);
    expect(visible.json().some((r: any) => r.id === approval.id)).toBe(true);
    const forbidden = await app.inject({ method: 'POST', url: `${P}/approvals/${approval.id}/steps/${step.id}/decision`, headers: authHeaders(viewer.token), payload: { decision: 'approved' } });
    expect(forbidden.statusCode).toBe(403);
    const stored = await withTenant(A.tenantId, trx => trx.selectFrom('project_approval_steps').select('status').where('tenant_id', '=', A.tenantId).where('id', '=', step.id).executeTakeFirstOrThrow());
    expect(stored.status).toBe('PENDING');
  });

  it('named workflow creation and final change-request approval commit together', async () => {
    const app = await getApp();
    const change = await mkReal(A.tenantId, 'project_change_requests', { tenant_id: A.tenantId, project_id: projA, change_code: 'NAMED-CR', title: 'Named approval', original_scope: 'Existing', requested_change: 'Extension', justification: 'Needed', requester_id: A.userId });
    const approval = await withTenant(A.tenantId, trx => ProjectGovernanceService.initiateApprovalWorkflow(trx, A.tenantId, projA, 'change_request', change.id, 'Approve change', A.userId, [{ step_order: 1, step_name: 'Owner review', assigned_user_id: A.userId }]));
    const step = await withTenant(A.tenantId, trx => trx.selectFrom('project_approval_steps').select('id').where('tenant_id', '=', A.tenantId).where('approval_id', '=', approval.id).executeTakeFirstOrThrow());
    const response = await app.inject({ method: 'POST', url: `${P}/approvals/${approval.id}/steps/${step.id}/decision`, headers: authHeaders(A.token), payload: { decision: 'approved' } });
    expect(response.statusCode).toBe(200);
    const stored = await withTenant(A.tenantId, trx => trx.selectFrom('project_change_requests').select(['status', 'approved_by']).where('tenant_id', '=', A.tenantId).where('id', '=', change.id).executeTakeFirstOrThrow());
    expect(stored).toMatchObject({ status: 'APPROVED', approved_by: A.userId });
    await expect(withTenant(A.tenantId, trx => ProjectGovernanceService.initiateApprovalWorkflow(trx, A.tenantId, projA, 'change_request', change.id, 'Invalid approver', A.userId, [{ step_order: 1, step_name: 'Foreign', assigned_user_id: B.userId }]))).rejects.toMatchObject({ statusCode: 404 });
    await expect(withTenant(A.tenantId, trx => ProjectGovernanceService.initiateApprovalWorkflow(trx, A.tenantId, projA, 'change_request', change.id, 'Unconfigured role', A.userId, [{ step_order: 1, step_name: 'Review', required_role: 'ENGINEER' }]))).rejects.toMatchObject({ statusCode: 503 });
  });

  // ── R2-2 · authorization — safety invariants, must hold today ────────────

  it('cross-tenant: tenant B never receives tenant A project rows from /projects/:id/risks', async () => {
    const app = await getApp();
    await mkReal(A.tenantId, 'project_risks', {
      tenant_id: A.tenantId, project_id: projA, risk_code: `RK-${Date.now() % 100000}`,
      title: 'A-only risk', category: 'COMMERCIAL', probability: 3, impact: 4,
    });
    const res = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/risks`, headers: authHeaders(B.token) });
    expect(res.statusCode).toBe(403);
  });

  it('a tenant member who is NOT on project_members is refused a project sub-resource (403)', async () => {
    const app = await getApp();
    const outsider = await A.addUser('JUNIOR');
    const res = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/risks`, headers: authHeaders(outsider.token) });
    expect(res.statusCode).toBe(403);
  });

  it('an approval step decision by a user who is not the assigned approver is refused (403)', async () => {
    const app = await getApp();
    const approval = await mkReal(A.tenantId, 'project_approvals', {
      tenant_id: A.tenantId, project_id: projA, entity_type: 'CHANGE_REQUEST',
      entity_id: randomUUID(), title: 'Approve CR', requester_id: A.userId,
    });
    const step = await mkReal(A.tenantId, 'project_approval_steps', {
      tenant_id: A.tenantId, approval_id: approval.id, step_number: 1, approver_user_id: A.userId,
    });
    const notTheApprover = await A.addUser('JUNIOR');
    const res = await app.inject({
      method: 'POST', url: `${P}/approvals/${approval.id}/steps/${step.id}/decision`,
      headers: authHeaders(notTheApprover.token), payload: { decision: 'approved' },
    });
    expect(res.statusCode).toBe(403);
  });
});
