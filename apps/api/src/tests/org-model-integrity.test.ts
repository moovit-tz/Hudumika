/**
 * Phase D: Organizational scope + multi-industry integrity tests.
 * Exercises the shared org model (entities, sites, industry assignments)
 * and the platform industry registry through real DB operations with
 * throwaway tenants, verifying tenant isolation and referential integrity.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { withTenant } from '../db/client.js';
import { OrgModelService } from '../services/org-model.service.js';
import { IndustryRegistryService } from '../services/industry-registry.service.js';
import { createTestTenant, type TestTenant } from './helpers.js';

let tenantA: TestTenant;
let tenantB: TestTenant;

beforeAll(async () => {
  tenantA = await createTestTenant('TENANT_ADMIN');
  tenantB = await createTestTenant('TENANT_ADMIN');
}, 120000);

afterAll(async () => {
  if (tenantA) await tenantA.cleanup();
  if (tenantB) await tenantB.cleanup();
}, 120000);

// ── D01: Multi-entity creation and tenant isolation ─────────────────────────

describe('D01: entity CRUD + tenant isolation', () => {
  it('creates an entity in tenant A and it is invisible to tenant B', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Acme Holdings Ltd',
      registration_no: 'TZ-12345',
      country_code: 'TZ',
      currency: 'TZS',
      entity_type: 'parent',
    });
    expect(entity.id).toBeTruthy();
    expect(entity.legal_name).toBe('Acme Holdings Ltd');
    expect(entity.tenant_id).toBe(tenantA.tenantId);

    const bEntities = await OrgModelService.listEntities(tenantB.tenantId);
    const leaked = bEntities.find(e => e.id === entity.id);
    expect(leaked).toBeUndefined();
  });

  it('creates a subsidiary under a parent entity', async () => {
    const parent = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Parent Corp',
      entity_type: 'parent',
    });
    const child = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Sub Unit',
      entity_type: 'subsidiary',
      parent_entity_id: parent.id,
    });
    expect(child.parent_entity_id).toBe(parent.id);
  });

  it('rejects self-referencing parent_entity_id on update', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Self-Ref Test',
    });
    await expect(
      OrgModelService.updateEntity(tenantA.tenantId, entity.id, { parent_entity_id: entity.id }),
    ).rejects.toThrow('cannot be its own parent');
  });
});

// ── D02: Site creation and entity linkage ───────────────────────────────────

describe('D02: sites + entity linkage', () => {
  it('creates a site linked to an entity', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Site Owner Ltd',
    });
    const site = await OrgModelService.createSite(tenantA.tenantId, tenantA.userId, {
      name: 'Dar es Salaam Office',
      code: 'DSM-01',
      site_type: 'office',
      entity_id: entity.id,
      city: 'Dar es Salaam',
      country_code: 'TZ',
      timezone: 'Africa/Dar_es_Salaam',
    });
    expect(site.entity_id).toBe(entity.id);
    expect(site.code).toBe('DSM-01');

    const sites = await OrgModelService.listSites(tenantA.tenantId, entity.id);
    expect(sites.length).toBeGreaterThanOrEqual(1);
    expect(sites.some(s => s.id === site.id)).toBe(true);
  });

  it('rejects site creation referencing a cross-tenant entity', async () => {
    const foreignEntity = await OrgModelService.createEntity(tenantB.tenantId, tenantB.userId, {
      legal_name: 'Foreign Entity',
    });
    await expect(
      OrgModelService.createSite(tenantA.tenantId, tenantA.userId, {
        name: 'Cross-Tenant Site',
        entity_id: foreignEntity.id,
      }),
    ).rejects.toThrow();
  });
});

// ── D03: Multi-industry assignment per entity ───────────────────────────────

describe('D03: entity-industry many-to-many', () => {
  it('assigns multiple industries to one entity', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Multi-Industry Corp',
    });

    const logistics = await OrgModelService.assignEntityIndustry(tenantA.tenantId, {
      entity_id: entity.id, industry_key: 'logistics', is_primary: true,
    });
    expect(logistics.is_primary).toBe(true);

    const manufacturing = await OrgModelService.assignEntityIndustry(tenantA.tenantId, {
      entity_id: entity.id, industry_key: 'manufacturing',
    });
    expect(manufacturing.is_primary).toBe(false);

    const industries = await OrgModelService.listEntityIndustries(tenantA.tenantId, entity.id);
    expect(industries.length).toBe(2);
    expect(industries.map(i => i.industry_key).sort()).toEqual(['logistics', 'manufacturing']);
  });

  it('removes an industry assignment without destroying the entity', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Remove-Industry Test',
    });
    await OrgModelService.assignEntityIndustry(tenantA.tenantId, {
      entity_id: entity.id, industry_key: 'healthcare',
    });
    await OrgModelService.assignEntityIndustry(tenantA.tenantId, {
      entity_id: entity.id, industry_key: 'retail',
    });

    await OrgModelService.removeEntityIndustry(tenantA.tenantId, entity.id, 'healthcare');

    const remaining = await OrgModelService.listEntityIndustries(tenantA.tenantId, entity.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0].industry_key).toBe('retail');

    const entityStillExists = await OrgModelService.getEntity(tenantA.tenantId, entity.id);
    expect(entityStillExists.id).toBe(entity.id);
  });
});

// ── D04: Site activities ────────────────────────────────────────────────────

describe('D04: site activities', () => {
  it('attaches industry-specific activities to a site', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Activity Test Ltd',
    });
    const site = await OrgModelService.createSite(tenantA.tenantId, tenantA.userId, {
      name: 'Factory Floor', site_type: 'factory', entity_id: entity.id,
    });

    const activity = await OrgModelService.addSiteActivity(tenantA.tenantId, {
      site_id: site.id,
      industry_key: 'manufacturing',
      activity_name: 'Assembly Line A',
      license_ref: 'MFG-2026-001',
    });
    expect(activity.license_ref).toBe('MFG-2026-001');

    const activities = await OrgModelService.listSiteActivities(tenantA.tenantId, site.id);
    expect(activities.length).toBe(1);
  });
});

// ── D05: Tenant-level industry activation/deactivation ──────────────────────

describe('D05: tenant industry activation', () => {
  it('activates, lists, and deactivates industries for a tenant', async () => {
    await OrgModelService.activateTenantIndustry(tenantA.tenantId, tenantA.userId, 'logistics', true);
    await OrgModelService.activateTenantIndustry(tenantA.tenantId, tenantA.userId, 'construction');

    const active = await OrgModelService.listTenantIndustries(tenantA.tenantId);
    const keys = active.filter(i => !i.deactivated_at).map(i => i.industry_key);
    expect(keys).toContain('logistics');
    expect(keys).toContain('construction');

    await OrgModelService.deactivateTenantIndustry(tenantA.tenantId, 'construction');

    const after = await OrgModelService.listTenantIndustries(tenantA.tenantId);
    const construction = after.find(i => i.industry_key === 'construction');
    expect(construction?.deactivated_at).toBeTruthy();
  });

  it('reactivation clears deactivated_at via upsert', async () => {
    await OrgModelService.activateTenantIndustry(tenantA.tenantId, tenantA.userId, 'mining');
    await OrgModelService.deactivateTenantIndustry(tenantA.tenantId, 'mining');
    const reactivated = await OrgModelService.activateTenantIndustry(tenantA.tenantId, tenantA.userId, 'mining');
    expect(reactivated.deactivated_at).toBeNull();
  });
});

// ── D06: Org summary aggregation ────────────────────────────────────────────

describe('D06: org summary', () => {
  it('returns entities, sites, industries, entity-industries, and site-activities', async () => {
    const summary = await OrgModelService.getOrgSummary(tenantA.tenantId);
    expect(summary).toHaveProperty('entities');
    expect(summary).toHaveProperty('sites');
    expect(summary).toHaveProperty('industries');
    expect(summary).toHaveProperty('entityIndustries');
    expect(summary).toHaveProperty('siteActivities');
    expect(Array.isArray(summary.entities)).toBe(true);
  });
});

// ── D07: Platform industry registry ─────────────────────────────────────────

describe('D07: industry registry (platform-scoped)', () => {
  it('lists industries from the seeded registry', async () => {
    const all = await IndustryRegistryService.listIndustries();
    expect(all.length).toBeGreaterThanOrEqual(24);
    const keys = all.map(i => i.key);
    expect(keys).toContain('logistics');
    expect(keys).toContain('healthcare');
    expect(keys).toContain('manufacturing');
  });

  it('resolves an alias to a canonical key', async () => {
    const resolved = await IndustryRegistryService.resolveKey('freight');
    expect(resolved).toBe('logistics');
  });

  it('resolves a canonical key to itself', async () => {
    const resolved = await IndustryRegistryService.resolveKey('logistics');
    expect(resolved).toBe('logistics');
  });

  it('returns null for an unknown alias', async () => {
    const resolved = await IndustryRegistryService.resolveKey('nonexistent_industry_xyz');
    expect(resolved).toBeNull();
  });

  it('filters by status', async () => {
    const accepted = await IndustryRegistryService.listIndustries({ status: 'accepted' });
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted.every(i => i.status === 'accepted')).toBe(true);
  });

  it('getActivatableIndustries returns accepted + pilot', async () => {
    const activatable = await IndustryRegistryService.getActivatableIndustries();
    expect(activatable.every(i => i.status === 'accepted' || i.status === 'pilot')).toBe(true);
  });
});

// ── D08: Cross-tenant isolation on entity-industry junction ─────────────────

describe('D08: cross-tenant isolation on junctions', () => {
  it('tenant B cannot remove tenant A entity-industry assignment', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Isolation Test Entity',
    });
    await OrgModelService.assignEntityIndustry(tenantA.tenantId, {
      entity_id: entity.id, industry_key: 'agriculture',
    });

    await expect(
      OrgModelService.removeEntityIndustry(tenantB.tenantId, entity.id, 'agriculture'),
    ).rejects.toThrow('not found');
  });
});
