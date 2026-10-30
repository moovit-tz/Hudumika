/**
 * Phase I: Company/product launch planner integrity tests.
 * Covers launch case CRUD, site/product intake, plan item resolution,
 * readiness computation, snapshots, tenant isolation, and route ACL.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { LaunchPlannerService } from '../services/launch-planner.service.js';
import { PermitEngineService } from '../services/permit-engine.service.js';
import { dbPlatform } from '../db/client.js';
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

// ── I01: Launch case CRUD ──────────────────────────────────────────────

describe('I01: launch case CRUD', () => {
  it('creates a launch case', async () => {
    const lc = await LaunchPlannerService.createCase(
      tenantA.tenantId, tenantA.userId, {
        title: 'Pharmaceutical Import Business',
        description: 'Launching pharma import in Dar es Salaam',
        industries: ['pharmaceutical', 'logistics'],
        jurisdictions: ['TZ'],
        target_date: '2027-03-01',
      },
    );
    expect(lc.id).toBeTruthy();
    expect(lc.status).toBe('intake');
    expect(lc.industries).toContain('pharmaceutical');
    expect(lc.jurisdictions).toContain('TZ');
    expect(lc.overall_readiness).toBe(0);
  });

  it('lists cases filtered by status', async () => {
    const cases = await LaunchPlannerService.listCases(tenantA.tenantId, {
      status: 'intake',
    });
    expect(cases.length).toBeGreaterThanOrEqual(1);
    expect(cases.every(c => c.status === 'intake')).toBe(true);
  });

  it('retrieves a single case', async () => {
    const cases = await LaunchPlannerService.listCases(tenantA.tenantId);
    const first = cases[0];
    const fetched = await LaunchPlannerService.getCase(tenantA.tenantId, first.id);
    expect(fetched).toBeTruthy();
    expect(fetched!.title).toBe(first.title);
  });

  it('updates case status', async () => {
    const cases = await LaunchPlannerService.listCases(tenantA.tenantId);
    const updated = await LaunchPlannerService.updateCaseStatus(
      tenantA.tenantId, cases[0].id, 'planning',
    );
    expect(updated.status).toBe('planning');
  });
});

// ── I02: Tenant isolation ──────────────────────────────────────────────

describe('I02: tenant isolation', () => {
  it('tenant B cannot see tenant A cases', async () => {
    const cases = await LaunchPlannerService.listCases(tenantB.tenantId);
    expect(cases).toHaveLength(0);
  });

  it('tenant B cannot get tenant A case by id', async () => {
    const aCases = await LaunchPlannerService.listCases(tenantA.tenantId);
    const fromB = await LaunchPlannerService.getCase(tenantB.tenantId, aCases[0].id);
    expect(fromB).toBeNull();
  });
});

// ── I03: Site intake ───────────────────────────────────────────────────

describe('I03: site intake', () => {
  let caseId: string;

  beforeAll(async () => {
    const lc = await LaunchPlannerService.createCase(
      tenantA.tenantId, tenantA.userId, {
        title: 'Site Intake Test', jurisdictions: ['TZ'],
      },
    );
    caseId = lc.id;
  });

  it('adds multiple sites to a case', async () => {
    const hq = await LaunchPlannerService.addSite(tenantA.tenantId, caseId, {
      site_name: 'Dar HQ', site_type: 'office', jurisdiction: 'TZ',
      address: 'Plot 123, Msasani',
    });
    expect(hq.site_name).toBe('Dar HQ');
    expect(hq.site_type).toBe('office');

    await LaunchPlannerService.addSite(tenantA.tenantId, caseId, {
      site_name: 'Arusha Warehouse', site_type: 'warehouse',
    });

    const sites = await LaunchPlannerService.listSites(tenantA.tenantId, caseId);
    expect(sites).toHaveLength(2);
  });
});

// ── I04: Product/activity intake ───────────────────────────────────────

describe('I04: product/activity intake', () => {
  let caseId: string;

  beforeAll(async () => {
    const lc = await LaunchPlannerService.createCase(
      tenantA.tenantId, tenantA.userId, {
        title: 'Product Intake Test', industries: ['pharmaceutical'],
      },
    );
    caseId = lc.id;
  });

  it('adds products with HS codes', async () => {
    const prod = await LaunchPlannerService.addProduct(tenantA.tenantId, caseId, {
      product_name: 'Paracetamol Tablets',
      product_type: 'import',
      hs_code: '3004.90.90',
      industry_key: 'pharmaceutical',
    });
    expect(prod.product_name).toBe('Paracetamol Tablets');
    expect(prod.hs_code).toBe('3004.90.90');

    await LaunchPlannerService.addProduct(tenantA.tenantId, caseId, {
      product_name: 'Cold Chain Logistics', product_type: 'service',
      industry_key: 'logistics',
    });

    const products = await LaunchPlannerService.listProducts(tenantA.tenantId, caseId);
    expect(products).toHaveLength(2);
  });
});

// ── I05: Plan items and readiness ──────────────────────────────────────

describe('I05: plan items and readiness', () => {
  let caseId: string;

  beforeAll(async () => {
    const lc = await LaunchPlannerService.createCase(
      tenantA.tenantId, tenantA.userId, {
        title: 'Readiness Test', jurisdictions: ['TZ'],
      },
    );
    caseId = lc.id;
  });

  it('adds plan items with cost and timeline', async () => {
    const item = await LaunchPlannerService.addPlanItem(tenantA.tenantId, caseId, {
      title: 'BRELA Company Registration',
      category: 'registration',
      authority: 'BRELA',
      legal_basis: 'Companies Act 2002',
      estimated_cost: 120000,
      currency: 'TZS',
      estimated_days: 14,
      priority: 90,
    });
    expect(item.title).toBe('BRELA Company Registration');
    expect(item.estimated_cost).toBe(120000);
    expect(item.status).toBe('pending');
  });

  it('computes readiness at 0% with all pending', async () => {
    const readiness = await LaunchPlannerService.computeReadiness(tenantA.tenantId, caseId);
    expect(readiness.score).toBe(0);
    expect(readiness.total).toBe(1);
    expect(readiness.pending).toBe(1);
  });

  it('completes an item and readiness rises to 100%', async () => {
    const items = await LaunchPlannerService.listPlanItems(tenantA.tenantId, caseId);
    await LaunchPlannerService.updatePlanItem(tenantA.tenantId, items[0].id, {
      status: 'completed', actual_cost: 115000,
    });

    const readiness = await LaunchPlannerService.computeReadiness(tenantA.tenantId, caseId);
    expect(readiness.score).toBe(100);
    expect(readiness.completed).toBe(1);
  });

  it('exemption counts as completed for readiness', async () => {
    await LaunchPlannerService.addPlanItem(tenantA.tenantId, caseId, {
      title: 'Environmental Permit', category: 'permit',
    });
    const items = await LaunchPlannerService.listPlanItems(tenantA.tenantId, caseId);
    const envItem = items.find(i => i.title === 'Environmental Permit');
    await LaunchPlannerService.updatePlanItem(tenantA.tenantId, envItem!.id, {
      status: 'exempted', exemption_reason: 'Office-only, no industrial activity',
    });

    const readiness = await LaunchPlannerService.computeReadiness(tenantA.tenantId, caseId);
    expect(readiness.score).toBe(100);
  });

  it('blocked item prevents 100% readiness', async () => {
    await LaunchPlannerService.addPlanItem(tenantA.tenantId, caseId, {
      title: 'Fire Safety Inspection', category: 'inspection',
    });
    const items = await LaunchPlannerService.listPlanItems(tenantA.tenantId, caseId);
    const fireItem = items.find(i => i.title === 'Fire Safety Inspection');
    await LaunchPlannerService.updatePlanItem(tenantA.tenantId, fireItem!.id, {
      status: 'blocked', evidence_notes: 'Building not yet ready',
    });

    const readiness = await LaunchPlannerService.computeReadiness(tenantA.tenantId, caseId);
    expect(readiness.score).toBeLessThan(100);
    expect(readiness.blocked).toBe(1);
  });
});

// ── I06: Snapshots ─────────────────────────────────────────────────────

describe('I06: decision snapshots', () => {
  let caseId: string;

  beforeAll(async () => {
    const lc = await LaunchPlannerService.createCase(
      tenantA.tenantId, tenantA.userId, { title: 'Snapshot Test' },
    );
    caseId = lc.id;
    await LaunchPlannerService.addPlanItem(tenantA.tenantId, caseId, {
      title: 'TIN Registration', category: 'registration',
    });
  });

  it('takes a snapshot preserving current state', async () => {
    const snap = await LaunchPlannerService.takeSnapshot(
      tenantA.tenantId, caseId, tenantA.userId,
      { label: 'Before approval' },
    );
    expect(snap.label).toBe('Before approval');
    expect(snap.item_count).toBe(1);
    expect(snap.completed_count).toBe(0);
    expect(snap.readiness_score).toBe(0);
    expect(Array.isArray(snap.snapshot_data)).toBe(true);
  });

  it('snapshot after completion reflects new state', async () => {
    const items = await LaunchPlannerService.listPlanItems(tenantA.tenantId, caseId);
    await LaunchPlannerService.updatePlanItem(tenantA.tenantId, items[0].id, {
      status: 'completed',
    });

    const snap = await LaunchPlannerService.takeSnapshot(
      tenantA.tenantId, caseId, tenantA.userId,
      { snapshot_type: 'approval', label: 'After completion' },
    );
    expect(snap.readiness_score).toBe(100);
    expect(snap.completed_count).toBe(1);
  });

  it('lists snapshots in reverse chronological order', async () => {
    const snaps = await LaunchPlannerService.listSnapshots(tenantA.tenantId, caseId);
    expect(snaps.length).toBeGreaterThanOrEqual(2);
    expect(snaps[0].label).toBe('After completion');
  });
});

// ── I07: Requirement resolution ────────────────────────────────────────

describe('I07: requirement resolution', () => {
  let caseId: string;

  beforeAll(async () => {
    const def = await PermitEngineService.createRequirementDef({
      code: `RESOLVE_TEST_${Date.now()}`,
      name: 'Test Business License',
      jurisdiction: 'TZ',
      agency_code: 'BRELA',
      legal_instrument: 'Business Licensing Act',
      description: 'General business license for TZ operations',
    });
    await dbPlatform.updateTable('comply_requirement_definitions')
      .set({ review_state: 'published' })
      .where('id', '=', def!.id).execute();

    const lc = await LaunchPlannerService.createCase(
      tenantA.tenantId, tenantA.userId, {
        title: 'Resolution Test', jurisdictions: ['TZ'], industries: ['logistics'],
      },
    );
    caseId = lc.id;
  });

  it('resolves published requirements into plan items', async () => {
    const result = await LaunchPlannerService.resolveRequirements(
      tenantA.tenantId, caseId, tenantA.userId,
    );
    expect(result.resolved).toBeGreaterThanOrEqual(1);
    expect(result.total_requirements).toBeGreaterThanOrEqual(1);

    const items = await LaunchPlannerService.listPlanItems(tenantA.tenantId, caseId);
    expect(items.length).toBeGreaterThanOrEqual(1);
    const resolved = items.find(i => i.requirement_def_id != null);
    expect(resolved).toBeTruthy();
  });

  it('does not duplicate on second resolve', async () => {
    const result = await LaunchPlannerService.resolveRequirements(
      tenantA.tenantId, caseId, tenantA.userId,
    );
    expect(result.resolved).toBe(0);
  });
});

// ── I08: HTTP route access control ─────────────────────────────────────

describe('I08: route access control', () => {
  it('any authenticated user can list launch cases', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/launch-planner',
      headers: { authorization: `Bearer ${tenantA.token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('JUNIOR cannot create a launch case', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/launch-planner',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: { title: 'Unauthorized case' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('JUNIOR can read plan items', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const cases = await LaunchPlannerService.listCases(tenantA.tenantId);
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/launch-planner/${cases[0].id}/items`,
      headers: { authorization: `Bearer ${junior.token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
