import { withTenant, dbPlatform } from '../db/client.js';
import type { UserOrgAssignment, PlatformOperatorAuditEntry } from '@hudumika/types';

function toISO(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export const AdminHierarchyService = {
  // ── User org assignments ──────────────────────────────────────────────────

  async listUserAssignments(tenantId: string, userId?: string): Promise<UserOrgAssignment[]> {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('user_org_assignments').selectAll()
        .where('tenant_id', '=', tenantId);
      if (userId) q = q.where('user_id', '=', userId);
      const rows = await q.orderBy('created_at', 'desc').execute();
      return rows.map(r => ({ ...r, created_at: toISO(r.created_at) }));
    });
  },

  async assignUser(
    tenantId: string, assignedBy: string,
    input: { user_id: string; entity_id?: string; site_id?: string; is_primary?: boolean },
  ): Promise<UserOrgAssignment> {
    return withTenant(tenantId, async trx => {
      if (input.entity_id) {
        await trx.selectFrom('tenant_entities').select('id')
          .where('tenant_id', '=', tenantId).where('id', '=', input.entity_id)
          .executeTakeFirstOrThrow();
      }
      if (input.site_id) {
        await trx.selectFrom('tenant_sites').select('id')
          .where('tenant_id', '=', tenantId).where('id', '=', input.site_id)
          .executeTakeFirstOrThrow();
      }
      const r = await trx.insertInto('user_org_assignments').values({
        tenant_id: tenantId,
        user_id: input.user_id,
        entity_id: input.entity_id ?? null,
        site_id: input.site_id ?? null,
        is_primary: input.is_primary ?? false,
        assigned_by: assignedBy,
      }).returningAll().executeTakeFirstOrThrow();
      return { ...r, created_at: toISO(r.created_at) };
    });
  },

  async removeAssignment(tenantId: string, assignmentId: string): Promise<void> {
    await withTenant(tenantId, async trx => {
      const result = await trx.deleteFrom('user_org_assignments')
        .where('tenant_id', '=', tenantId).where('id', '=', assignmentId)
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new Error('Assignment not found.');
      }
    });
  },

  // ── Platform operator audit (SUPER_ADMIN only) ────────────────────────────

  async listPlatformAudit(
    opts: { affectedTenantId?: string; operatorId?: string; limit?: number },
  ): Promise<PlatformOperatorAuditEntry[]> {
    let q = dbPlatform.selectFrom('platform_operator_audit').selectAll()
      .orderBy('created_at', 'desc');
    if (opts.affectedTenantId) q = q.where('affected_tenant_id', '=', opts.affectedTenantId);
    if (opts.operatorId) q = q.where('operator_id', '=', opts.operatorId);
    const rows = await q.limit(opts.limit ?? 100).execute();
    return rows.map(r => ({
      ...r,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      created_at: toISO(r.created_at),
    }));
  },
};
