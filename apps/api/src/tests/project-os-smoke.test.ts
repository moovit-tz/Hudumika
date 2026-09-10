// Create-one-of-everything smoke suite for the `/v1/project-os` API —
// the executable form of docs/project-os-hardening-review.md § Round 2.
//
// STATUS TODAY: every `it.fails()` below drives a real request through the
// Fastify app and asserts the response it SHOULD give. They pass right now
// because the endpoint 500s (the routes/services/client.ts were authored
// against a schema that was never migrated — see the review). When the
// schema reconciliation lands, each `it.fails()` starts FAILING (the test
// now succeeds) — that is the signal to delete `.fails` and confirm green.
//
// The plain `it()` cases are safety invariants that must hold whether or
// not the happy path works — cross-tenant isolation, member-scoped
// authorization, and "no fabricated metrics".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { withTenant, dbPlatform } from '../db/client.js';

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
    await A.cleanup();
    await B.cleanup();
  });

  // ── Harness sanity — must be green today ─────────────────────────────────
  it('the `projects` entitlement grant works (portfolios list is reachable, not 403)', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/portfolios`, headers: authHeaders(A.token) });
    expect(res.statusCode).not.toBe(403);
  });

  // ── R2-1 · every create endpoint targets phantom columns → 500 today ─────

  it.fails('POST /portfolios → 201 with an id', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/portfolios`, headers: authHeaders(A.token),
      payload: { name: 'Infra', code: `PF${Date.now() % 100000}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy();
  });

  it.fails('GET /portfolios → 200 array (listPortfolios selects owner_id/target_roi that do not exist)', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/portfolios`, headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it.fails('POST /programs → 201', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/programs`, headers: authHeaders(A.token),
      payload: { name: 'Grid', code: `PG${Date.now() % 100000}` },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/phases → 201 (code is NOT NULL in the DB; sequence_order/gate_* do not exist)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/phases`, headers: authHeaders(A.token),
      payload: { name: 'Mobilisation', code: 'PH1' },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/work-packages → 201 (parent_id/lead_id/planned_cost/earned_value do not exist)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/work-packages`, headers: authHeaders(A.token),
      payload: { wbs_code: '1.1', name: 'Earthworks' },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/deliverables → 201 with an id (route calls the service without await → body is {})', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/deliverables`, headers: authHeaders(A.token),
      payload: { title: 'GA Drawing' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy(); // will be {} even if the insert were fixed
  });

  it.fails('POST /projects/:id/risks → 201 (probability/impact are INTEGER 1-5, not strings; risk_code is NOT NULL)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/risks`, headers: authHeaders(A.token),
      payload: { title: 'FX exposure', probability: 'likely', impact: 'high' },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/issues → 201 (owner_id + issue_code are NOT NULL; severity is UPPERCASE)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/issues`, headers: authHeaders(A.token),
      payload: { title: 'Late permit', severity: 'high' },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/change-requests → 201 (change_code/original_scope/requested_change/justification are NOT NULL; approval steps use step_number not step_order)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/change-requests`, headers: authHeaders(A.token),
      payload: { cr_number: `CR${Date.now() % 100000}`, title: 'Add basement', reason: 'Client request' },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('GET /approvals → 200 (selects project_approvals.metadata + step_order/required_role that do not exist)', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/approvals`, headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it.fails('POST /projects/:id/purchase-requests → 201 (req_number not pr_number; requested_by + title are NOT NULL)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/purchase-requests`, headers: authHeaders(A.token),
      payload: { pr_number: `PR${Date.now() % 100000}`, title: 'Rebar', estimated_cost: 5000 },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/rfqs → 201 (project_rfq_suppliers has supplier_id FK, no supplier_name)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/rfqs`, headers: authHeaders(A.token),
      payload: { rfq_number: `RFQ${Date.now() % 100000}`, title: 'Rebar supply', suppliers: [{ supplier_name: 'ACME Steel' }] },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/purchase-orders → 201 (supplier_id is NOT NULL FK; supplier_name/payment_terms/incoterms columns do not exist)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/purchase-orders`, headers: authHeaders(A.token),
      payload: { po_number: `PO${Date.now() % 100000}`, supplier_name: 'ACME Steel', total_amount: 12000 },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/goods-receipts → 201 (purchase_order_id not po_id; inspector_id NOT NULL; inspection_status UPPERCASE)', async () => {
    const app = await getApp();
    const po = await mkReal(A.tenantId, 'project_purchase_orders', {
      tenant_id: A.tenantId, project_id: projA, supplier_id: supA, po_number: `PO-REAL-${Date.now() % 100000}`,
    });
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/goods-receipts`, headers: authHeaders(A.token),
      payload: { po_id: po.id, grn_number: `GRN${Date.now() % 100000}` },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /resources → 201 (model_or_specs not make_model; cost_rate+rate_unit not cost_rate_hourly; resource_type UPPERCASE)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/resources`, headers: authHeaders(A.token),
      payload: { resource_type: 'heavy_machinery', name: 'Excavator 20t' },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/allocations → 201 (allocation_pct not allocated_pct; no hours_planned/operator_id)', async () => {
    const app = await getApp();
    const res = await mkReal(A.tenantId, 'project_resources', {
      tenant_id: A.tenantId, resource_type: 'VEHICLE', name: 'Tipper', code: `RES-${Date.now() % 100000}`,
    });
    const r = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/allocations`, headers: authHeaders(A.token),
      payload: { resource_id: res.id, start_date: '2026-01-01', end_date: '2026-03-01' },
    });
    expect(r.statusCode).toBe(201);
  });

  it.fails('POST /projects/:id/industry-data → 201 (entity_type/entity_code/title are NOT NULL; body has none)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `${P}/projects/${projA}/industry-data`, headers: authHeaders(A.token),
      payload: { industry: 'construction', data_type: 'RFI', record_data: { question: 'Foundation depth?' } },
    });
    expect(res.statusCode).toBe(201);
  });

  it.fails('GET /projects/:id/detail → 200 with an evm block (selects projects.baseline_budget/actual_cost/earned_value that do not exist)', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/detail`, headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().evm).toBeTruthy();
  });

  // ── R2-3 · no fabricated metric ─────────────────────────────────────────
  it.fails('GET /command-center → 200 and portfolio_spi is computed, not the hardcoded 1.02', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `${P}/command-center`, headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    // project-os.service.ts:638 — `const portfolioSpi = totalEv > 0 ? 1.02 : 1.0;`
    // With no EV data in a fresh tenant a *computed* SPI is 1.0; 1.02 is the tell.
    expect(res.json().portfolio_spi).not.toBe(1.02);
  });

  // ── R2-2 · authorization — safety invariants, must hold today ────────────

  it('cross-tenant: tenant B never receives tenant A project rows from /projects/:id/risks', async () => {
    const app = await getApp();
    await mkReal(A.tenantId, 'project_risks', {
      tenant_id: A.tenantId, project_id: projA, risk_code: `RK-${Date.now() % 100000}`,
      title: 'A-only risk', category: 'COMMERCIAL', probability: 3, impact: 4,
    });
    const res = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/risks`, headers: authHeaders(B.token) });
    // It may 500 (schema) or 403/404 (once scoped) — it must NEVER be a 200
    // carrying tenant A's rows.
    if (res.statusCode === 200) {
      expect(res.json()).toEqual([]);
    } else {
      expect([403, 404, 500]).toContain(res.statusCode);
    }
  });

  it.fails('a tenant member who is NOT on project_members is refused a project sub-resource (403)', async () => {
    const app = await getApp();
    const outsider = await A.addUser('JUNIOR');
    const res = await app.inject({ method: 'GET', url: `${P}/projects/${projA}/risks`, headers: authHeaders(outsider.token) });
    // Today: 500 (schema). After R2-1: 200 with data (the bug). After R2-2: 403.
    expect(res.statusCode).toBe(403);
  });

  it.fails('an approval step decision by a user who is not the assigned approver is refused (403)', async () => {
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
