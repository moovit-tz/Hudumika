/**
 * Phase H: Industry-specific workflow engine integrity tests.
 * Covers workflow definitions, app×industry matrix, tenant workflow
 * instances, cross-app transactions, tenant isolation, and route ACL.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { IndustryWorkflowService } from '../services/industry-workflow.service.js';
import { createTestTenant, getApp, type TestTenant } from './helpers.js';

let tenantA: TestTenant;
let tenantB: TestTenant;

beforeAll(async () => {
  tenantA = await createTestTenant('ADMIN');
  tenantB = await createTestTenant('ADMIN');
}, 120000);

afterAll(async () => {
  if (tenantA) await tenantA.cleanup();
  if (tenantB) await tenantB.cleanup();
}, 120000);

// ── H01: Workflow definition CRUD ──────────────────────────────────────

describe('H01: workflow definition CRUD', () => {
  it('lists seeded logistics workflow definitions', async () => {
    const defs = await IndustryWorkflowService.listWorkflowDefs({
      industry_key: 'logistics', status: 'published',
    });
    expect(defs.length).toBeGreaterThanOrEqual(5);
    const codes = defs.map(d => d.workflow_code);
    expect(codes).toContain('customs_clearance');
    expect(codes).toContain('shipment_booking');
    expect(codes).toContain('fleet_dispatch');
    expect(codes).toContain('warehouse_receipt');
    expect(codes).toContain('permit_renewal');
  });

  it('creates a new workflow definition', async () => {
    const def = await IndustryWorkflowService.createWorkflowDef({
      industry_key: 'pharmaceutical',
      app_id: 'complyos',
      workflow_code: `gmp_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: 'GMP Audit',
      description: 'Good manufacturing practice audit workflow',
      category: 'quality',
      steps: [
        { code: 'schedule', name: 'Schedule Audit' },
        { code: 'conduct', name: 'Conduct Inspection' },
        { code: 'report', name: 'Generate Report' },
        { code: 'followup', name: 'Corrective Actions' },
      ],
      required_apps: ['complyos', 'projects'],
    });
    expect(def).toBeTruthy();
    expect(def!.industry_key).toBe('pharmaceutical');
    expect(def!.steps).toHaveLength(4);
    expect(def!.required_apps).toContain('complyos');
    expect(def!.status).toBe('draft');
  });

  it('retrieves a single workflow definition by id', async () => {
    const defs = await IndustryWorkflowService.listWorkflowDefs({
      industry_key: 'logistics', app_id: 'clearos',
    });
    const first = defs[0];
    const fetched = await IndustryWorkflowService.getWorkflowDef(first.id);
    expect(fetched).toBeTruthy();
    expect(fetched!.workflow_code).toBe(first.workflow_code);
  });

  it('filters by app_id', async () => {
    const defs = await IndustryWorkflowService.listWorkflowDefs({
      app_id: 'clearos',
    });
    expect(defs.length).toBeGreaterThanOrEqual(1);
    expect(defs.every(d => d.app_id === 'clearos')).toBe(true);
  });
});

// ── H02: Industry × app matrix ────────────────────────────────────────

describe('H02: industry × app matrix', () => {
  it('lists all seeded matrix entries', async () => {
    const entries = await IndustryWorkflowService.listMatrix();
    expect(entries.length).toBeGreaterThanOrEqual(30);
  });

  it('filters matrix by industry', async () => {
    const entries = await IndustryWorkflowService.listMatrix({
      industry_key: 'logistics',
    });
    expect(entries.length).toBeGreaterThanOrEqual(7);
    expect(entries.every(e => e.industry_key === 'logistics')).toBe(true);
  });

  it('retrieves a specific matrix entry', async () => {
    const entry = await IndustryWorkflowService.getMatrixEntry('logistics', 'clearos');
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe('implemented');
    expect(entry!.evidence_notes).toContain('customs');
  });

  it('updates a matrix entry (SUPER_ADMIN)', async () => {
    const updated = await IndustryWorkflowService.updateMatrixEntry(
      'pharmaceutical', 'seal', {
        status: 'demonstrated',
        evidence_notes: 'Batch tracking demo completed',
        last_verified: '2026-10-29',
      },
    );
    expect(updated.status).toBe('demonstrated');
    expect(updated.evidence_notes).toContain('demo');
  });
});

// ── H03: Tenant workflow instances ─────────────────────────────────────

describe('H03: tenant workflow instances', () => {
  let instanceId: string;

  it('creates a workflow instance for a tenant', async () => {
    const defs = await IndustryWorkflowService.listWorkflowDefs({
      industry_key: 'logistics', app_id: 'clearos', status: 'published',
    });
    const customsDef = defs.find(d => d.workflow_code === 'customs_clearance');
    expect(customsDef).toBeTruthy();

    const inst = await IndustryWorkflowService.createInstance(
      tenantA.tenantId, tenantA.userId, {
        workflow_def_id: customsDef!.id,
        industry_key: 'logistics',
        app_id: 'clearos',
        workflow_code: 'customs_clearance',
        name: 'Dar es Salaam Port Customs',
        config: { port: 'DSM', lane: 'green' },
      },
    );
    expect(inst.id).toBeTruthy();
    expect(inst.status).toBe('active');
    expect(inst.config).toEqual({ port: 'DSM', lane: 'green' });
    instanceId = inst.id;
  });

  it('lists instances filtered by industry', async () => {
    const instances = await IndustryWorkflowService.listInstances(tenantA.tenantId, {
      industry_key: 'logistics',
    });
    expect(instances.length).toBeGreaterThanOrEqual(1);
    expect(instances.every(i => i.industry_key === 'logistics')).toBe(true);
  });

  it('tenant B cannot see tenant A instances', async () => {
    const instances = await IndustryWorkflowService.listInstances(tenantB.tenantId, {
      industry_key: 'logistics',
    });
    const leaked = instances.find(i => i.id === instanceId);
    expect(leaked).toBeUndefined();
  });
});

// ── H04: Cross-app workflow transactions ───────────────────────────────

describe('H04: cross-app transactions', () => {
  let instanceId: string;
  let txnId: string;

  beforeAll(async () => {
    const inst = await IndustryWorkflowService.createInstance(
      tenantA.tenantId, tenantA.userId, {
        industry_key: 'logistics',
        app_id: 'clearos',
        workflow_code: 'customs_clearance',
        name: 'Transaction Test Workflow',
      },
    );
    instanceId = inst.id;
  });

  it('records a transaction step', async () => {
    const txn = await IndustryWorkflowService.recordTransaction(
      tenantA.tenantId, tenantA.userId, {
        workflow_instance_id: instanceId,
        step_code: 'declaration',
        step_name: 'Lodge Declaration',
        source_app: 'clearos',
        target_app: 'finops',
        status: 'pending',
        input_data: { tansad_number: 'TZ-2026-0001' },
      },
    );
    expect(txn.id).toBeTruthy();
    expect(txn.step_code).toBe('declaration');
    expect(txn.source_app).toBe('clearos');
    expect(txn.target_app).toBe('finops');
    expect(txn.status).toBe('pending');
    txnId = txn.id;
  });

  it('advances transaction status', async () => {
    const updated = await IndustryWorkflowService.updateTransactionStatus(
      tenantA.tenantId, txnId, 'in_progress',
    );
    expect(updated.status).toBe('in_progress');
    expect(updated.started_at).toBeTruthy();
  });

  it('completes transaction with output data', async () => {
    const completed = await IndustryWorkflowService.updateTransactionStatus(
      tenantA.tenantId, txnId, 'completed',
      { duty_amount: 1250000, currency: 'TZS' },
    );
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).toBeTruthy();
    expect(completed.output_data).toEqual({ duty_amount: 1250000, currency: 'TZS' });
  });

  it('lists transactions in order', async () => {
    await IndustryWorkflowService.recordTransaction(
      tenantA.tenantId, tenantA.userId, {
        workflow_instance_id: instanceId,
        step_code: 'assessment',
        step_name: 'Duty Assessment',
        source_app: 'clearos',
        status: 'completed',
      },
    );

    const txns = await IndustryWorkflowService.listTransactions(tenantA.tenantId, instanceId);
    expect(txns.length).toBeGreaterThanOrEqual(2);
    expect(txns[0].step_code).toBe('declaration');
    expect(txns[1].step_code).toBe('assessment');
  });

  it('tenant B cannot see tenant A transactions', async () => {
    const txns = await IndustryWorkflowService.listTransactions(tenantB.tenantId, instanceId);
    expect(txns).toHaveLength(0);
  });
});

// ── H05: Cross-instance transaction rejection ──────────────────────────

describe('H05: cross-tenant transaction rejection', () => {
  it('rejects transaction for another tenant instance', async () => {
    const inst = await IndustryWorkflowService.createInstance(
      tenantA.tenantId, tenantA.userId, {
        industry_key: 'logistics',
        app_id: 'clearos',
        workflow_code: 'customs_clearance',
        name: 'Isolation Test',
      },
    );

    await expect(
      IndustryWorkflowService.recordTransaction(
        tenantB.tenantId, tenantB.userId, {
          workflow_instance_id: inst.id,
          step_code: 'test',
          step_name: 'Test',
          source_app: 'clearos',
        },
      ),
    ).rejects.toThrow();
  });
});

// ── H06: HTTP route access control ─────────────────────────────────────

describe('H06: route access control', () => {
  it('any authenticated user can list workflow definitions', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/industry-workflows/definitions',
      headers: { authorization: `Bearer ${tenantA.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('JUNIOR cannot create workflow definitions', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/industry-workflows/definitions',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: {
        industry_key: 'test',
        app_id: 'test',
        workflow_code: 'test',
        name: 'test',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('JUNIOR cannot create workflow instances', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/industry-workflows/instances',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: {
        industry_key: 'logistics',
        app_id: 'clearos',
        workflow_code: 'customs_clearance',
        name: 'ACL test',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('non-SUPER_ADMIN cannot update matrix', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/industry-workflows/matrix/logistics/clearos',
      headers: { authorization: `Bearer ${tenantA.token}` },
      payload: { status: 'demonstrated' },
    });
    expect(res.statusCode).toBe(403);
  });
});
