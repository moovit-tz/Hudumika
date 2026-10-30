/**
 * Phase F: Canonical permit engine integrity tests.
 * Covers requirement definitions (platform-scoped), fee definitions,
 * lifecycle cycles (tenant-scoped), evidence, jurisdiction packs,
 * applicability resolution, version supersession, and tenant isolation.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { PermitEngineService } from '../services/permit-engine.service.js';
import { OrgModelService } from '../services/org-model.service.js';
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

// ── F01: Requirement definition CRUD ──────────────────────────────────────

describe('F01: requirement definitions', () => {
  it('creates and retrieves a requirement definition', async () => {
    const def = await PermitEngineService.createRequirementDef({
      code: `TEST-REQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      jurisdiction: 'TZ',
      name: 'Test Business License',
      description: 'A test requirement',
      legal_instrument: 'Business Licensing Act 1972',
      industry_key: 'logistics',
      frequency: 'annual',
      mandatory: true,
      agency_code: 'BRELA',
    });

    expect(def.id).toBeTruthy();
    expect(def.code).toContain('TEST-REQ-');
    expect(def.jurisdiction).toBe('TZ');
    expect(def.frequency).toBe('annual');
    expect(def.review_state).toBe('draft');
    expect(def.version).toBe(1);

    const fetched = await PermitEngineService.getRequirementDef(def.id);
    expect(fetched).toBeTruthy();
    expect(fetched!.name).toBe('Test Business License');
  });

  it('lists definitions filtered by jurisdiction and industry', async () => {
    const code = `FILTER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await PermitEngineService.createRequirementDef({
      code, jurisdiction: 'TZ', name: 'Filtered Req',
      industry_key: 'mining', agency_code: 'NEMC',
    });

    const allTZ = await PermitEngineService.listRequirementDefs({ jurisdiction: 'TZ' });
    expect(allTZ.some(d => d.code === code)).toBe(true);

    const mining = await PermitEngineService.listRequirementDefs({
      jurisdiction: 'TZ', industry_key: 'mining',
    });
    expect(mining.some(d => d.code === code)).toBe(true);

    const energy = await PermitEngineService.listRequirementDefs({
      jurisdiction: 'TZ', industry_key: 'energy',
    });
    expect(energy.some(d => d.code === code)).toBe(false);
  });
});

// ── F02: Versioned supersession ───────────────────────────────────────────

describe('F02: requirement version supersession', () => {
  it('supersedes a definition, incrementing version and marking old as superseded', async () => {
    const v1 = await PermitEngineService.createRequirementDef({
      code: `SUPER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      jurisdiction: 'TZ',
      name: 'Original Requirement',
      frequency: 'annual',
    });
    expect(v1.version).toBe(1);

    const v2 = await PermitEngineService.supersedeDef(v1.id, {
      name: 'Updated Requirement',
      frequency: 'semi_annual',
    });
    expect(v2.version).toBe(2);
    expect(v2.name).toBe('Updated Requirement');
    expect(v2.frequency).toBe('semi_annual');
    expect(v2.code).toBe(v1.code);

    const oldVersion = await PermitEngineService.getRequirementDef(v1.id);
    expect(oldVersion!.review_state).toBe('superseded');
  });
});

// ── F03: Fee definitions ──────────────────────────────────────────────────

describe('F03: fee definitions', () => {
  it('creates and lists fee definitions for a requirement', async () => {
    const def = await PermitEngineService.createRequirementDef({
      code: `FEE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      jurisdiction: 'TZ',
      name: 'Fee Test Requirement',
    });

    const appFee = await PermitEngineService.addFeeDef(def.id, {
      fee_type: 'application',
      name: 'Application Fee',
      amount: 50000,
      currency: 'TZS',
    });
    expect(appFee.amount).toBe(50000);
    expect(appFee.currency).toBe('TZS');

    const latePenalty = await PermitEngineService.addFeeDef(def.id, {
      fee_type: 'late_penalty',
      name: 'Late Filing Penalty',
      formula: 'principal * 0.02 * days_late',
      formula_inputs: { principal: 'number', days_late: 'number' },
      grace_days: 30,
      cap_amount: 500000,
    });
    expect(latePenalty.formula).toBeTruthy();
    expect(latePenalty.grace_days).toBe(30);
    expect(latePenalty.cap_amount).toBe(500000);

    const fees = await PermitEngineService.listFeeDefs(def.id);
    expect(fees.length).toBe(2);
  });
});

// ── F04: Lifecycle cycle CRUD + tenant isolation ──────────────────────────

describe('F04: lifecycle cycles', () => {
  it('creates and lists cycles within a tenant', async () => {
    const cycle = await PermitEngineService.createCycle(
      tenantA.tenantId, tenantA.userId,
      { cycle_type: 'application', jurisdiction: 'TZ', agency_code: 'TRA' },
    );

    expect(cycle.id).toBeTruthy();
    expect(cycle.cycle_type).toBe('application');
    expect(cycle.status).toBe('draft');
    expect(cycle.jurisdiction).toBe('TZ');

    const list = await PermitEngineService.listCycles(tenantA.tenantId);
    expect(list.some(c => c.id === cycle.id)).toBe(true);
  });

  it('rejects cross-tenant cycle reads', async () => {
    const cycle = await PermitEngineService.createCycle(
      tenantA.tenantId, tenantA.userId,
      { cycle_type: 'renewal', agency_code: 'BRELA' },
    );

    const fromB = await PermitEngineService.getCycle(tenantB.tenantId, cycle.id);
    expect(fromB).toBeNull();
  });

  it('links cycle to entity and site', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Cycle Entity Ltd',
    });
    const site = await OrgModelService.createSite(tenantA.tenantId, tenantA.userId, {
      name: 'Cycle Site', entity_id: entity.id,
    });

    const cycle = await PermitEngineService.createCycle(
      tenantA.tenantId, tenantA.userId,
      { cycle_type: 'application', entity_id: entity.id, site_id: site.id },
    );
    expect(cycle.entity_id).toBe(entity.id);
    expect(cycle.site_id).toBe(site.id);
  });

  it('rejects cycle creation referencing a cross-tenant entity', async () => {
    const foreignEntity = await OrgModelService.createEntity(
      tenantB.tenantId, tenantB.userId,
      { legal_name: 'Foreign Cycle Entity' },
    );
    await expect(
      PermitEngineService.createCycle(
        tenantA.tenantId, tenantA.userId,
        { cycle_type: 'application', entity_id: foreignEntity.id },
      ),
    ).rejects.toThrow('Entity not found');
  });
});

// ── F05: Lifecycle status transitions ─────────────────────────────────────

describe('F05: lifecycle status transitions', () => {
  it('advances a cycle through the lifecycle', async () => {
    const cycle = await PermitEngineService.createCycle(
      tenantA.tenantId, tenantA.userId,
      { cycle_type: 'application', agency_code: 'TRA', budget_estimate: 100000 },
    );
    expect(cycle.status).toBe('draft');
    expect(cycle.budget_estimate).toBe(100000);

    await PermitEngineService.updateCycle(
      tenantA.tenantId, cycle.id, { status: 'pending_review' },
    );

    const submitted = await PermitEngineService.updateCycle(
      tenantA.tenantId, cycle.id,
      { status: 'submitted', submission_ref: 'TRA-2026-001', submission_date: '2026-10-29' },
    );
    expect(submitted.status).toBe('submitted');
    expect(submitted.submission_ref).toBe('TRA-2026-001');

    await PermitEngineService.updateCycle(
      tenantA.tenantId, cycle.id, { status: 'under_authority_review' },
    );

    await PermitEngineService.addEvidence(tenantA.tenantId, cycle.id, tenantA.userId, {
      evidence_type: 'document',
      file_name: 'tra-approval.pdf',
      file_url: 'https://example.com/tra-approval.pdf',
      description: 'TRA approval letter',
    });

    const approved = await PermitEngineService.updateCycle(
      tenantA.tenantId, cycle.id,
      { status: 'approved', authority_ref: 'AUTH-789' },
    );
    expect(approved.status).toBe('approved');

    const issued = await PermitEngineService.updateCycle(
      tenantA.tenantId, cycle.id,
      {
        status: 'issued',
        outcome_date: '2026-11-15',
        outcome_notes: 'Approved with conditions',
        actual_cost: 120000,
      },
    );
    expect(issued.status).toBe('issued');
    expect(issued.authority_ref).toBe('AUTH-789');
    expect(issued.actual_cost).toBe(120000);
  });

  it('merges metadata rather than replacing it', async () => {
    const cycle = await PermitEngineService.createCycle(
      tenantA.tenantId, tenantA.userId,
      { cycle_type: 'renewal' },
    );

    await PermitEngineService.updateCycle(tenantA.tenantId, cycle.id, {
      metadata: { inspector: 'Jane' },
    });
    const updated1 = await PermitEngineService.getCycle(tenantA.tenantId, cycle.id);
    expect(updated1!.metadata.inspector).toBe('Jane');

    await PermitEngineService.updateCycle(tenantA.tenantId, cycle.id, {
      metadata: { region: 'Dar es Salaam' },
    });
    const updated2 = await PermitEngineService.getCycle(tenantA.tenantId, cycle.id);
    expect(updated2!.metadata.inspector).toBe('Jane');
    expect(updated2!.metadata.region).toBe('Dar es Salaam');
  });
});

// ── F06: Lifecycle evidence ───────────────────────────────────────────────

describe('F06: lifecycle evidence', () => {
  it('attaches and lists evidence for a cycle', async () => {
    const cycle = await PermitEngineService.createCycle(
      tenantA.tenantId, tenantA.userId,
      { cycle_type: 'application' },
    );

    const ev1 = await PermitEngineService.addEvidence(
      tenantA.tenantId, cycle.id, tenantA.userId,
      { file_name: 'business_license_scan.pdf', evidence_type: 'certificate' },
    );
    expect(ev1.file_name).toBe('business_license_scan.pdf');
    expect(ev1.evidence_type).toBe('certificate');

    await PermitEngineService.addEvidence(
      tenantA.tenantId, cycle.id, tenantA.userId,
      { file_name: 'payment_receipt.pdf', evidence_type: 'receipt', description: 'TRA fee payment' },
    );

    const evidence = await PermitEngineService.listEvidence(tenantA.tenantId, cycle.id);
    expect(evidence.length).toBe(2);
    expect(evidence[1].description).toBe('TRA fee payment');
  });

  it('rejects evidence for a cross-tenant cycle', async () => {
    const cycle = await PermitEngineService.createCycle(
      tenantA.tenantId, tenantA.userId,
      { cycle_type: 'application' },
    );

    await expect(
      PermitEngineService.addEvidence(
        tenantB.tenantId, cycle.id, tenantB.userId,
        { file_name: 'hack.pdf' },
      ),
    ).rejects.toThrow();
  });
});

// ── F07: Jurisdiction packs ───────────────────────────────────────────────

describe('F07: jurisdiction packs', () => {
  it('lists jurisdiction packs including the seeded TZ pack', async () => {
    const packs = await PermitEngineService.listJurisdictionPacks();
    expect(packs.length).toBeGreaterThanOrEqual(1);
    const tz = packs.find(p => p.jurisdiction === 'TZ');
    expect(tz).toBeTruthy();
    expect(tz!.country_code).toBe('TZ');
    expect(tz!.coverage_level).toBe('partial');
  });

  it('retrieves a single jurisdiction pack', async () => {
    const tz = await PermitEngineService.getJurisdictionPack('TZ');
    expect(tz).toBeTruthy();
    expect(tz!.name).toBe('Tanzania (Mainland)');
    expect(tz!.missing_areas).toContain('mining');
  });
});

// ── F08: Applicability resolution ─────────────────────────────────────────

describe('F08: applicability resolution', () => {
  it('resolves published requirements for a jurisdiction + industry', async () => {
    const code = `RESOLVE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const def = await PermitEngineService.createRequirementDef({
      code,
      jurisdiction: 'TZ',
      name: 'Resolvable Requirement',
      industry_key: 'logistics',
      holder_type: 'entity',
    });

    // Promote to published
    await dbPlatform.updateTable('comply_requirement_definitions')
      .set({ review_state: 'published' })
      .where('id', '=', def.id).execute();

    const results = await PermitEngineService.resolveApplicableRequirements({
      jurisdiction: 'TZ', industry_key: 'logistics',
    });
    expect(results.some(r => r.code === code)).toBe(true);

    // Should not appear for a different industry
    const other = await PermitEngineService.resolveApplicableRequirements({
      jurisdiction: 'TZ', industry_key: 'healthcare',
    });
    expect(other.some(r => r.code === code)).toBe(false);
  });

  it('excludes expired definitions from resolution', async () => {
    const code = `EXPIRED-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const def = await PermitEngineService.createRequirementDef({
      code,
      jurisdiction: 'TZ',
      name: 'Expired Req',
      effective_to: '2020-01-01',
    });

    await dbPlatform.updateTable('comply_requirement_definitions')
      .set({ review_state: 'published' })
      .where('id', '=', def.id).execute();

    const results = await PermitEngineService.resolveApplicableRequirements({
      jurisdiction: 'TZ',
    });
    expect(results.some(r => r.code === code)).toBe(false);
  });
});

// ── F09: HTTP route access control ────────────────────────────────────────

describe('F09: route access control', () => {
  it('JUNIOR user cannot create requirement definitions', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/permit-engine/requirements',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: { code: 'NO-ACCESS', name: 'Should Fail' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('JUNIOR user cannot create lifecycle cycles', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/permit-engine/cycles',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: { cycle_type: 'application' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('authenticated user can read requirement definitions', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/permit-engine/requirements',
      headers: { authorization: `Bearer ${tenantA.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('authenticated user can read jurisdiction packs', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/permit-engine/jurisdictions',
      headers: { authorization: `Bearer ${tenantA.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});
