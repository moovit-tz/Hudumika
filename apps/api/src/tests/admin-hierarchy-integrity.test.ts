/**
 * Phase E: Administrator hierarchy, scoped permissions, org assignments
 * and platform operator audit integrity tests.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { withTenant, dbPlatform } from '../db/client.js';
import { OrgModelService } from '../services/org-model.service.js';
import { AdminHierarchyService } from '../services/admin-hierarchy.service.js';
import {
  hasScopedPermission, logPlatformAction,
  getUserEntityIds, getUserSiteIds,
} from '../lib/org-rbac.js';
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

// ── E01: User-org assignment CRUD + tenant isolation ────────────────────────

describe('E01: user-org assignments', () => {
  it('assigns a user to an entity and lists them', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Assignment Test Ltd',
    });
    const assignment = await AdminHierarchyService.assignUser(
      tenantA.tenantId, tenantA.userId,
      { user_id: tenantA.userId, entity_id: entity.id, is_primary: true },
    );
    expect(assignment.entity_id).toBe(entity.id);
    expect(assignment.is_primary).toBe(true);

    const list = await AdminHierarchyService.listUserAssignments(tenantA.tenantId, tenantA.userId);
    expect(list.some(a => a.id === assignment.id)).toBe(true);
  });

  it('assigns a user to a site', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Site Assignment Parent',
    });
    const site = await OrgModelService.createSite(tenantA.tenantId, tenantA.userId, {
      name: 'Assignment Site', entity_id: entity.id,
    });
    const assignment = await AdminHierarchyService.assignUser(
      tenantA.tenantId, tenantA.userId,
      { user_id: tenantA.userId, site_id: site.id, entity_id: entity.id },
    );
    expect(assignment.site_id).toBe(site.id);
  });

  it('rejects assignment referencing a cross-tenant entity', async () => {
    const foreignEntity = await OrgModelService.createEntity(tenantB.tenantId, tenantB.userId, {
      legal_name: 'Foreign Assignment Entity',
    });
    await expect(
      AdminHierarchyService.assignUser(
        tenantA.tenantId, tenantA.userId,
        { user_id: tenantA.userId, entity_id: foreignEntity.id },
      ),
    ).rejects.toThrow();
  });

  it('removes an assignment', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Removal Test Ltd',
    });
    const assignment = await AdminHierarchyService.assignUser(
      tenantA.tenantId, tenantA.userId,
      { user_id: tenantA.userId, entity_id: entity.id },
    );
    await AdminHierarchyService.removeAssignment(tenantA.tenantId, assignment.id);

    const list = await AdminHierarchyService.listUserAssignments(tenantA.tenantId, tenantA.userId);
    expect(list.find(a => a.id === assignment.id)).toBeUndefined();
  });
});

// ── E02: Scoped permission check ────────────────────────────────────────────

describe('E02: scoped permission enforcement', () => {
  it('grants with entity scope only apply to that entity', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Scope Test Entity',
    });
    const staffUser = await tenantA.addUser('JUNIOR');

    await withTenant(tenantA.tenantId, async trx => {
      const role = await trx.insertInto('ondi_org_roles').values({
        tenant_id: tenantA.tenantId,
        name: `scoped-role-${Date.now()}`,
        permissions: JSON.stringify(['org_model.view']),
        created_by: tenantA.userId,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('ondi_org_role_members').values({
        tenant_id: tenantA.tenantId,
        role_id: role.id,
        user_id: staffUser.userId,
        granted_by: tenantA.userId,
        scope_entity_id: entity.id,
      }).execute();
    });

    const inScope = await hasScopedPermission(
      tenantA.tenantId, staffUser.userId, 'org_model.view',
      { entityId: entity.id },
    );
    expect(inScope).toBe(true);

    const outOfScope = await hasScopedPermission(
      tenantA.tenantId, staffUser.userId, 'org_model.view',
      { entityId: '00000000-0000-0000-0000-000000000001' },
    );
    expect(outOfScope).toBe(false);
  });

  it('unscoped grants apply to any entity/site', async () => {
    const staffUser = await tenantA.addUser('JUNIOR');

    await withTenant(tenantA.tenantId, async trx => {
      const role = await trx.insertInto('ondi_org_roles').values({
        tenant_id: tenantA.tenantId,
        name: `unscoped-role-${Date.now()}`,
        permissions: JSON.stringify(['org_model.manage']),
        created_by: tenantA.userId,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('ondi_org_role_members').values({
        tenant_id: tenantA.tenantId,
        role_id: role.id,
        user_id: staffUser.userId,
        granted_by: tenantA.userId,
      }).execute();
    });

    const anyEntity = await hasScopedPermission(
      tenantA.tenantId, staffUser.userId, 'org_model.manage',
      { entityId: '00000000-0000-0000-0000-000000000099' },
    );
    expect(anyEntity).toBe(true);
  });
});

// ── E03: getUserEntityIds / getUserSiteIds ──────────────────────────────────

describe('E03: user entity/site lookup', () => {
  it('returns entity IDs for assigned user', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Lookup Test Entity',
    });
    const staffUser = await tenantA.addUser('JUNIOR');
    await AdminHierarchyService.assignUser(
      tenantA.tenantId, tenantA.userId,
      { user_id: staffUser.userId, entity_id: entity.id },
    );

    const entityIds = await getUserEntityIds(tenantA.tenantId, staffUser.userId);
    expect(entityIds).toContain(entity.id);
  });

  it('returns site IDs for assigned user', async () => {
    const entity = await OrgModelService.createEntity(tenantA.tenantId, tenantA.userId, {
      legal_name: 'Site Lookup Parent',
    });
    const site = await OrgModelService.createSite(tenantA.tenantId, tenantA.userId, {
      name: 'Lookup Test Site', entity_id: entity.id,
    });
    const staffUser = await tenantA.addUser('JUNIOR');
    await AdminHierarchyService.assignUser(
      tenantA.tenantId, tenantA.userId,
      { user_id: staffUser.userId, entity_id: entity.id, site_id: site.id },
    );

    const siteIds = await getUserSiteIds(tenantA.tenantId, staffUser.userId);
    expect(siteIds).toContain(site.id);
  });
});

// ── E04: Platform operator audit trail ──────────────────────────────────────

describe('E04: platform operator audit', () => {
  it('logs and retrieves a platform action', async () => {
    await logPlatformAction(tenantA.userId, tenantA.tenantId, 'test_action', {
      reason: 'Integration test',
      resourceType: 'tenant',
      resourceId: tenantA.tenantId,
      metadata: { test: true },
    });

    const entries = await AdminHierarchyService.listPlatformAudit({
      affectedTenantId: tenantA.tenantId,
    });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const found = entries.find(e => e.action === 'test_action');
    expect(found).toBeTruthy();
    expect(found!.reason).toBe('Integration test');
  });
});

// ── E05: Tenant-to-platform escalation denial ───────────────────────────────

describe('E05: escalation denial', () => {
  it('TENANT_ADMIN cannot access platform audit', async () => {
    const { getApp } = await import('./helpers.js');
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/audit',
      headers: { authorization: `Bearer ${tenantA.token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('JUNIOR user cannot create entities (requires ADMIN role)', async () => {
    const staffUser = await tenantA.addUser('JUNIOR');
    const { getApp } = await import('./helpers.js');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/org-model/entities',
      headers: { authorization: `Bearer ${staffUser.token}` },
      payload: { legal_name: 'Should Fail' },
    });
    expect(res.statusCode).toBe(403);
  });
});
