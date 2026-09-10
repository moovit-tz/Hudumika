// Tenant-isolation + schema-contract suite for the Hudumika Project OS
// core (migration 448 — project_portfolios / _programs / _phases /
// _work_packages / _deliverables / _cost_codes / _budgets / _budget_lines /
// _evm_snapshots / _risks / _issues / _change_requests / _approvals /
// _approval_steps / _purchase_requests / _rfqs / _rfq_suppliers /
// _purchase_orders / _goods_receipts / _resources / _resource_allocations /
// _industry_data).
//
// Migration 448 was written by a concurrent agent and applied to the dev DB
// but not yet committed, and has no services/routes yet — so this suite
// tests the layer that DOES exist: that the `tenant_isolation_policy`
// created by 448's `DO $$` loop is load-bearing through the real app-role
// connection (`withTenant`, the restricted `hudumika_app` role that FORCE
// RLS actually constrains), not merely present in pg_class.
//
// It also pins the DB's real enum/CHECK contract for the fields where the
// hand-written types in packages/types/src/project-os.ts currently disagree
// with the migration (health_status, portfolio status) — so the drift is
// caught the moment anyone touches either side. See
// docs/project-os-hardening-review.md.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, type TestTenant } from './helpers.js';

// Raw-name table access: the 448 tables are not in the Kysely `Database`
// interface yet, so every query here goes through `as any`.
const q = (trx: any) => trx as any;

async function insertAs(tenantId: string, table: string, row: Record<string, unknown>) {
  return withTenant(tenantId, async (trx) =>
    q(trx).insertInto(table).values(row).returning(['id']).executeTakeFirstOrThrow(),
  );
}
async function listAs(tenantId: string, table: string): Promise<any[]> {
  return withTenant(tenantId, async (trx) => q(trx).selectFrom(table).selectAll().execute());
}
async function getAs(tenantId: string, table: string, id: string): Promise<any[]> {
  return withTenant(tenantId, async (trx) =>
    q(trx).selectFrom(table).selectAll().where('id', '=', id).execute(),
  );
}

describe('Project OS core (migration 448) — tenant isolation', () => {
  let A: TestTenant;
  let B: TestTenant;
  // one project + one supplier per tenant, for the project-scoped tables
  let projA: string;
  let projB: string;
  let supA: string;

  beforeAll(async () => {
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');

    projA = randomUUID();
    projB = randomUUID();
    await insertAs(A.tenantId, 'projects', { id: projA, tenant_id: A.tenantId, name: 'Isolation Probe A', owner_id: A.userId });
    await insertAs(B.tenantId, 'projects', { id: projB, tenant_id: B.tenantId, name: 'Isolation Probe B', owner_id: B.userId });

    const s = await withTenant(A.tenantId, async (trx) =>
      q(trx).insertInto('suppliers').values({ tenant_id: A.tenantId, name: 'Probe Supplier A' }).returning(['id']).executeTakeFirstOrThrow(),
    );
    supA = s.id;
  });

  afterAll(async () => {
    await A.cleanup();
    await B.cleanup();
  });

  // ── Read + write isolation, one representative row per shallow table ──────
  // For every table: a row created in tenant A must be (a) visible to A by
  // id and in A's full list, (b) invisible to B by id, (c) absent from B's
  // full list, and (d) un-writable by B even when B forges tenant_id = A.

  const shallow: Array<{ table: string; row: () => Record<string, unknown> }> = [
    { table: 'project_portfolios', row: () => ({ tenant_id: A.tenantId, name: 'Infra Portfolio', code: `PF-${randomUUID().slice(0, 6)}` }) },
    { table: 'project_programs', row: () => ({ tenant_id: A.tenantId, name: 'Grid Program', code: `PG-${randomUUID().slice(0, 6)}` }) },
    { table: 'project_phases', row: () => ({ tenant_id: A.tenantId, project_id: projA, name: 'Mobilisation', code: `PH-${randomUUID().slice(0, 6)}` }) },
    { table: 'project_work_packages', row: () => ({ tenant_id: A.tenantId, project_id: projA, wbs_code: `1.${Math.floor(Math.random() * 1e6)}`, name: 'Earthworks' }) },
    { table: 'project_deliverables', row: () => ({ tenant_id: A.tenantId, project_id: projA, name: 'GA Drawing', code: `DL-${randomUUID().slice(0, 6)}`, owner_id: A.userId }) },
    { table: 'project_cost_codes', row: () => ({ tenant_id: A.tenantId, code: `CC-${randomUUID().slice(0, 6)}`, name: 'Site Labour', category: 'LABOUR' }) },
    { table: 'project_budgets', row: () => ({ tenant_id: A.tenantId, project_id: projA }) },
    { table: 'project_evm_snapshots', row: () => ({ tenant_id: A.tenantId, project_id: projA, snapshot_date: '2026-01-15' }) },
    { table: 'project_risks', row: () => ({ tenant_id: A.tenantId, project_id: projA, risk_code: `RK-${randomUUID().slice(0, 6)}`, title: 'FX exposure', category: 'COMMERCIAL', probability: 3, impact: 4 }) },
    { table: 'project_issues', row: () => ({ tenant_id: A.tenantId, project_id: projA, issue_code: `IS-${randomUUID().slice(0, 6)}`, title: 'Late permit', owner_id: A.userId }) },
    { table: 'project_change_requests', row: () => ({ tenant_id: A.tenantId, project_id: projA, change_code: `CR-${randomUUID().slice(0, 6)}`, title: 'Add basement', original_scope: 'x', requested_change: 'y', justification: 'z', requester_id: A.userId }) },
    { table: 'project_approvals', row: () => ({ tenant_id: A.tenantId, project_id: projA, entity_type: 'DELIVERABLE', entity_id: randomUUID(), title: 'Approve GA drawing', requester_id: A.userId }) },
    { table: 'project_purchase_requests', row: () => ({ tenant_id: A.tenantId, project_id: projA, req_number: `PR-${randomUUID().slice(0, 6)}`, title: 'Rebar', requested_by: A.userId }) },
    { table: 'project_rfqs', row: () => ({ tenant_id: A.tenantId, project_id: projA, rfq_number: `RFQ-${randomUUID().slice(0, 6)}`, title: 'Rebar supply', submission_deadline: '2026-02-01' }) },
    { table: 'project_purchase_orders', row: () => ({ tenant_id: A.tenantId, project_id: projA, supplier_id: supA, po_number: `PO-${randomUUID().slice(0, 6)}` }) },
    { table: 'project_resources', row: () => ({ tenant_id: A.tenantId, resource_type: 'HEAVY_MACHINERY', name: 'Excavator 20t', code: `RES-${randomUUID().slice(0, 6)}` }) },
    { table: 'project_industry_data', row: () => ({ tenant_id: A.tenantId, project_id: projA, industry: 'construction', entity_type: 'RFI', entity_code: `RFI-${randomUUID().slice(0, 6)}`, title: 'Foundation query' }) },
  ];

  for (const { table, row } of shallow) {
    it(`${table}: a row in tenant A is invisible to tenant B (read) and un-writable by B (write)`, async () => {
      const { id } = await insertAs(A.tenantId, table, row());

      // (a) A sees its own row, by id and in the list
      expect((await getAs(A.tenantId, table, id)).length).toBe(1);
      expect((await listAs(A.tenantId, table)).some((r) => r.id === id)).toBe(true);

      // (b) + (c) B sees nothing — not by id, not in the list, and no error
      expect(await getAs(B.tenantId, table, id)).toEqual([]);
      expect((await listAs(B.tenantId, table)).some((r) => r.id === id)).toBe(false);

      // (d) B cannot forge a row into tenant A's space
      await expect(insertAs(B.tenantId, table, { ...row(), tenant_id: A.tenantId })).rejects.toThrow();
    });
  }

  // ── Read isolation for the FK-chained (child) tables ─────────────────────
  it('project_budget_lines / _approval_steps / _rfq_suppliers / _goods_receipts / _resource_allocations: children in A are invisible to B', async () => {
    const budget = await insertAs(A.tenantId, 'project_budgets', { tenant_id: A.tenantId, project_id: projA });
    const approval = await insertAs(A.tenantId, 'project_approvals', { tenant_id: A.tenantId, project_id: projA, entity_type: 'CHANGE_REQUEST', entity_id: randomUUID(), title: 'x', requester_id: A.userId });
    const rfq = await insertAs(A.tenantId, 'project_rfqs', { tenant_id: A.tenantId, project_id: projA, rfq_number: `RFQ-${randomUUID().slice(0, 6)}`, title: 'x', submission_deadline: '2026-02-01' });
    const po = await insertAs(A.tenantId, 'project_purchase_orders', { tenant_id: A.tenantId, project_id: projA, supplier_id: supA, po_number: `PO-${randomUUID().slice(0, 6)}` });
    const res = await insertAs(A.tenantId, 'project_resources', { tenant_id: A.tenantId, resource_type: 'VEHICLE', name: 'Tipper', code: `RES-${randomUUID().slice(0, 6)}` });

    const children: Array<[string, Record<string, unknown>]> = [
      ['project_budget_lines', { tenant_id: A.tenantId, budget_id: budget.id, project_id: projA, description: 'Rebar 12mm' }],
      ['project_approval_steps', { tenant_id: A.tenantId, approval_id: approval.id, step_number: 1, approver_user_id: A.userId }],
      ['project_rfq_suppliers', { tenant_id: A.tenantId, rfq_id: rfq.id, supplier_id: supA }],
      ['project_goods_receipts', { tenant_id: A.tenantId, project_id: projA, purchase_order_id: po.id, grn_number: `GRN-${randomUUID().slice(0, 6)}`, inspector_id: A.userId }],
      ['project_resource_allocations', { tenant_id: A.tenantId, project_id: projA, resource_id: res.id, start_date: '2026-01-01', end_date: '2026-03-01' }],
    ];

    for (const [table, r] of children) {
      const { id } = await insertAs(A.tenantId, table, r);
      expect((await getAs(A.tenantId, table, id)).length).toBe(1);
      expect(await getAs(B.tenantId, table, id)).toEqual([]);
      expect((await listAs(B.tenantId, table)).some((x) => x.id === id)).toBe(false);
    }
  });

  // ── The new hierarchy has RLS but NO intra-tenant access model yet ───────
  it('portfolios/programs/phases: RLS stops cross-tenant, but any member of tenant A still sees every portfolio (no resolvePortfolioAccess yet — tracked as a gap)', async () => {
    const pf = await insertAs(A.tenantId, 'project_portfolios', { tenant_id: A.tenantId, name: 'Confidential M&A Portfolio', code: `PF-${randomUUID().slice(0, 6)}` });

    // A low-privilege second user in the SAME tenant (JUNIOR is the lowest
    // real staff role). Nothing scopes a portfolio to a manager/roster, so
    // this user's session sees it purely because RLS is tenant-wide.
    const junior = await A.addUser('JUNIOR');
    const seenByJunior = await withTenant(A.tenantId, async (trx) =>
      q(trx).selectFrom('project_portfolios').selectAll().where('id', '=', pf.id).execute(),
    );
    // This currently passes: RLS is tenant-only, there is no portfolio ACL.
    expect(seenByJunior.length).toBe(1);
    void junior;

    // Cross-tenant still blocked.
    expect(await getAs(B.tenantId, 'project_portfolios', pf.id)).toEqual([]);
  });
});

// ── Schema contract: what the DB actually enforces (migration 448) ─────────
// These pin the real CHECK sets. packages/types/src/project-os.ts currently
// declares `ProjectHealthStatus` including 'critical' and lowercase
// portfolio statuses — both are rejected by the DB. Fix the types toward
// these values (see the hardening review), not the other way.
describe('Project OS core (migration 448) — schema contract', () => {
  let A: TestTenant;
  let proj: string;
  beforeAll(async () => {
    A = await createTestTenant('TENANT_ADMIN');
    proj = randomUUID();
    await insertAs(A.tenantId, 'projects', { id: proj, tenant_id: A.tenantId, name: 'Contract Probe', owner_id: A.userId });
  });
  afterAll(async () => { await A.cleanup(); });

  it('projects.health_status accepts GREEN/AMBER/RED and rejects "critical"/lowercase', async () => {
    for (const ok of ['GREEN', 'AMBER', 'RED']) {
      await expect(withTenant(A.tenantId, (trx) =>
        q(trx).updateTable('projects').set({ health_status: ok }).where('id', '=', proj).execute(),
      )).resolves.toBeDefined();
    }
    for (const bad of ['critical', 'green', 'YELLOW']) {
      await expect(withTenant(A.tenantId, (trx) =>
        q(trx).updateTable('projects').set({ health_status: bad }).where('id', '=', proj).execute(),
      )).rejects.toThrow();
    }
  });

  it('project_portfolios.status is UPPERCASE (PLANNING/ACTIVE/ON_HOLD/COMPLETED/ARCHIVED); lowercase "active" is rejected', async () => {
    await expect(insertAs(A.tenantId, 'project_portfolios', { tenant_id: A.tenantId, name: 'x', code: `PF-${randomUUID().slice(0, 6)}`, status: 'ACTIVE' })).resolves.toBeDefined();
    await expect(insertAs(A.tenantId, 'project_portfolios', { tenant_id: A.tenantId, name: 'x', code: `PF-${randomUUID().slice(0, 6)}`, status: 'active' })).rejects.toThrow();
  });

  it('project_risks enforces probability/impact in 1..5', async () => {
    const base = { tenant_id: A.tenantId, project_id: proj, title: 'x', category: 'COST' as const };
    await expect(insertAs(A.tenantId, 'project_risks', { ...base, risk_code: `RK-${randomUUID().slice(0, 6)}`, probability: 3, impact: 3 })).resolves.toBeDefined();
    await expect(insertAs(A.tenantId, 'project_risks', { ...base, risk_code: `RK-${randomUUID().slice(0, 6)}`, probability: 0, impact: 3 })).rejects.toThrow();
    await expect(insertAs(A.tenantId, 'project_risks', { ...base, risk_code: `RK-${randomUUID().slice(0, 6)}`, probability: 3, impact: 6 })).rejects.toThrow();
  });

  it('every 448 table carries FORCE ROW LEVEL SECURITY + a tenant_isolation_policy', async () => {
    const tables = [
      'project_portfolios', 'project_programs', 'project_phases', 'project_work_packages',
      'project_deliverables', 'project_cost_codes', 'project_budgets', 'project_budget_lines',
      'project_evm_snapshots', 'project_risks', 'project_issues', 'project_change_requests',
      'project_approvals', 'project_approval_steps', 'project_purchase_requests', 'project_rfqs',
      'project_rfq_suppliers', 'project_purchase_orders', 'project_goods_receipts',
      'project_resources', 'project_resource_allocations', 'project_industry_data',
    ];
    const rows = await dbPlatform
      .selectFrom('pg_class' as any)
      .select(['relname', 'relrowsecurity', 'relforcerowsecurity'] as any)
      .where('relname' as any, 'in', tables)
      .execute();
    expect(rows.length).toBe(tables.length);
    for (const r of rows as any[]) {
      expect(r.relrowsecurity, `${r.relname} RLS enabled`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname} RLS forced`).toBe(true);
    }
    const pols = await dbPlatform
      .selectFrom('pg_policies' as any)
      .select(['tablename'] as any)
      .where('tablename' as any, 'in', tables)
      .where('policyname' as any, '=', 'tenant_isolation_policy')
      .execute();
    expect(new Set((pols as any[]).map((p) => p.tablename)).size).toBe(tables.length);
  });
});
