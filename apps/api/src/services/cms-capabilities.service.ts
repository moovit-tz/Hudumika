import { withTenant } from '../db/client.js';
import type { CmsCapabilityArea, CmsRoleCapability, UpdateCmsRoleCapabilityInput } from '@hudumika/types';

export const CMS_CAPABILITY_AREAS: CmsCapabilityArea[] = ['pages', 'posts', 'comments', 'media', 'content', 'settings'];
/** Roles a tenant might actually want to restrict in the CMS — CUSTOMER is
 *  already refused outright before this ever runs, and SUPER_ADMIN/ORG/
 *  GUEST have no tenant-staff CMS access to begin with. */
export const CMS_CAPABILITY_ROLES = ['MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'] as const;

function toCapability(row: any): CmsRoleCapability {
  return {
    id: row.id, tenant_id: row.tenant_id, role: row.role, area: row.area,
    can_view: !!row.can_view, can_manage: !!row.can_manage, can_publish: !!row.can_publish,
    updated_by: row.updated_by,
    created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
  };
}

/**
 * §74 of the CMS master brief. Additive to the existing binary gate, not a
 * rewrite of it: `resolve()` returns full access for anything it has no
 * explicit row for, which is every tenant's real access today — narrowing
 * only happens once someone actually unchecks something in the new
 * Permissions page. ADMIN is never looked up here at all; every call site
 * checks `role === 'ADMIN'` first and skips this service entirely, the
 * same way SUPER_ADMIN already bypasses platform-wide checks elsewhere.
 */
export class CMSCapabilitiesService {
  static async list(tenantId: string): Promise<CmsRoleCapability[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_role_capabilities').selectAll()
        .where('tenant_id', '=', tenantId).execute();
      return rows.map(toCapability);
    });
  }

  /** Every real (role, area) row for this tenant, defaulted to full access
   *  wherever no row exists — the exact shape the Permissions page renders
   *  as one matrix, so it never has to reason about "no row" as a third
   *  state in its own UI. */
  static async listResolved(tenantId: string): Promise<CmsRoleCapability[]> {
    const rows = await this.list(tenantId);
    const byKey = new Map(rows.map(r => [`${r.role}:${r.area}`, r]));
    const now = new Date().toISOString();
    const out: CmsRoleCapability[] = [];
    for (const role of CMS_CAPABILITY_ROLES) {
      for (const area of CMS_CAPABILITY_AREAS) {
        const existing = byKey.get(`${role}:${area}`);
        out.push(existing ?? {
          id: '', tenant_id: tenantId, role, area,
          can_view: true, can_manage: true, can_publish: true,
          updated_by: null, created_at: now, updated_at: now,
        });
      }
    }
    return out;
  }

  static async set(tenantId: string, userId: string, role: string, area: CmsCapabilityArea, input: UpdateCmsRoleCapabilityInput): Promise<CmsRoleCapability> {
    return withTenant(tenantId, async (trx) => {
      const existing = await trx.selectFrom('cms_role_capabilities').selectAll()
        .where('tenant_id', '=', tenantId).where('role', '=', role).where('area', '=', area).executeTakeFirst();
      const values = {
        can_view: input.can_view ?? existing?.can_view ?? true,
        can_manage: input.can_manage ?? existing?.can_manage ?? true,
        can_publish: input.can_publish ?? existing?.can_publish ?? true,
      };
      const row = existing
        ? await trx.updateTable('cms_role_capabilities').set({ ...values, updated_by: userId, updated_at: new Date() })
            .where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
        : await trx.insertInto('cms_role_capabilities').values({ tenant_id: tenantId, role, area, ...values, updated_by: userId })
            .returningAll().executeTakeFirstOrThrow();
      return toCapability(row);
    });
  }

  /** Resets a role/area back to the unconfigured (full-access) default by
   *  removing its row entirely, rather than writing an explicit all-true
   *  row — keeps "never customized" and "customized back to full access"
   *  distinguishable in the data, for whatever that's worth to an auditor. */
  static async reset(tenantId: string, role: string, area: CmsCapabilityArea): Promise<void> {
    await withTenant(tenantId, trx => trx.deleteFrom('cms_role_capabilities')
      .where('tenant_id', '=', tenantId).where('role', '=', role).where('area', '=', area).execute());
  }

  /** The actual gate a route handler calls. ADMIN must never reach this —
   *  callers check `role === 'ADMIN'` first. Anything not in
   *  CMS_CAPABILITY_ROLES (there shouldn't be any, given CUSTOMER is
   *  already refused earlier and every other role either is ADMIN or is in
   *  the list) resolves to full access rather than an unexplained lockout. */
  static async can(tenantId: string, role: string, area: CmsCapabilityArea, action: 'view' | 'manage' | 'publish'): Promise<boolean> {
    if (!(CMS_CAPABILITY_ROLES as readonly string[]).includes(role)) return true;
    const row = await withTenant(tenantId, trx => trx.selectFrom('cms_role_capabilities').selectAll()
      .where('tenant_id', '=', tenantId).where('role', '=', role).where('area', '=', area).executeTakeFirst());
    if (!row) return true;
    if (action === 'view') return !!row.can_view;
    if (action === 'manage') return !!row.can_manage;
    return !!row.can_publish;
  }
}
