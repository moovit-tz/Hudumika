import { dbPlatform } from '../db/client.js';
import { withTenant, type TenantDb } from '../db/client.js';

export class ConsultantDelegationService {

  // ── Portfolio management (provider-scoped) ──────────────────────

  static async createPortfolio(
    providerTenantId: string,
    userId: string,
    input: {
      client_tenant_id?: string;
      client_name: string;
      client_type?: string;
      contact_name?: string;
      contact_email?: string;
      contact_phone?: string;
      industry_key?: string;
      jurisdictions?: string[];
    },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      const row = await db.insertInto('provider_client_portfolios')
        .values({
          provider_tenant_id: providerTenantId,
          client_tenant_id: input.client_tenant_id ?? null,
          client_name: input.client_name,
          client_type: input.client_type ?? 'workspace',
          status: input.client_tenant_id ? 'active' : 'prospect',
          contact_name: input.contact_name ?? null,
          contact_email: input.contact_email ?? null,
          contact_phone: input.contact_phone ?? null,
          industry_key: input.industry_key ?? null,
          jurisdictions: input.jurisdictions ?? [],
          created_by: userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    });
  }

  static async listPortfolios(
    providerTenantId: string,
    filters?: { status?: string; client_type?: string },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      let q = db.selectFrom('provider_client_portfolios')
        .selectAll()
        .where('provider_tenant_id', '=', providerTenantId);
      if (filters?.status) q = q.where('status', '=', filters.status);
      if (filters?.client_type) q = q.where('client_type', '=', filters.client_type);
      return q.orderBy('created_at', 'desc').execute();
    });
  }

  static async getPortfolio(providerTenantId: string, id: string) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.selectFrom('provider_client_portfolios')
        .selectAll()
        .where('id', '=', id)
        .where('provider_tenant_id', '=', providerTenantId)
        .executeTakeFirst() ?? null;
    });
  }

  static async updatePortfolioStatus(
    providerTenantId: string,
    id: string,
    status: string,
    meta?: { termination_reason?: string },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      const vals: Record<string, unknown> = { status, updated_at: new Date() };
      if (status === 'terminated') {
        vals.terminated_at = new Date();
        if (meta?.termination_reason) vals.termination_reason = meta.termination_reason;
      }
      if (status === 'active') vals.onboarded_at = new Date();
      return db.updateTable('provider_client_portfolios')
        .set(vals as any)
        .where('id', '=', id)
        .where('provider_tenant_id', '=', providerTenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ── Mandate CRUD ────────────────────────────────────────────────

  static async createMandate(
    ownerTenantId: string,
    userId: string,
    input: {
      provider_tenant_id: string;
      mandate_code: string;
      title: string;
      purpose?: string;
      portfolio_id?: string;
      scope_entities?: string[];
      scope_permits?: string[];
      scope_apps?: string[];
      allowed_actions?: string[];
      document_scope?: string;
      history_scope?: string;
      effective_from?: string;
      effective_to?: string;
      auto_renew?: boolean;
    },
  ) {
    return withTenant(ownerTenantId, async (db: TenantDb) => {
      const row = await db.insertInto('delegation_mandates')
        .values({
          owner_tenant_id: ownerTenantId,
          provider_tenant_id: input.provider_tenant_id,
          portfolio_id: input.portfolio_id ?? null,
          mandate_code: input.mandate_code,
          title: input.title,
          purpose: input.purpose ?? null,
          scope_entities: input.scope_entities ?? [],
          scope_permits: input.scope_permits ?? [],
          scope_apps: input.scope_apps ?? [],
          allowed_actions: input.allowed_actions ?? [],
          document_scope: input.document_scope ?? 'mandate_only',
          history_scope: input.history_scope ?? 'mandate_period',
          effective_from: input.effective_from ?? new Date().toISOString().slice(0, 10),
          effective_to: input.effective_to ?? null,
          auto_renew: input.auto_renew ?? false,
          created_by: userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    });
  }

  static async listMandates(
    tenantId: string,
    side: 'owner' | 'provider',
    filters?: { status?: string },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const col = side === 'owner' ? 'owner_tenant_id' : 'provider_tenant_id';
      let q = db.selectFrom('delegation_mandates')
        .selectAll()
        .where(col, '=', tenantId);
      if (filters?.status) q = q.where('status', '=', filters.status);
      return q.orderBy('created_at', 'desc').execute();
    });
  }

  static async getMandate(tenantId: string, id: string) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const row = await db.selectFrom('delegation_mandates')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ?? null;
    });
  }

  static async activateMandate(
    ownerTenantId: string,
    mandateId: string,
    userId: string,
  ) {
    return withTenant(ownerTenantId, async (db: TenantDb) => {
      return db.updateTable('delegation_mandates')
        .set({
          status: 'active',
          authorized_by: userId,
          authorized_at: new Date(),
          updated_at: new Date(),
        } as any)
        .where('id', '=', mandateId)
        .where('owner_tenant_id', '=', ownerTenantId)
        .where('status', '=', 'pending')
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async revokeMandate(
    ownerTenantId: string,
    mandateId: string,
    userId: string,
    reason?: string,
  ) {
    return withTenant(ownerTenantId, async (db: TenantDb) => {
      return db.updateTable('delegation_mandates')
        .set({
          status: 'revoked',
          revoked_by: userId,
          revoked_at: new Date(),
          revocation_reason: reason ?? null,
          updated_at: new Date(),
        } as any)
        .where('id', '=', mandateId)
        .where('owner_tenant_id', '=', ownerTenantId)
        .where('status', 'in', ['active', 'pending', 'suspended'])
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async suspendMandate(ownerTenantId: string, mandateId: string) {
    return withTenant(ownerTenantId, async (db: TenantDb) => {
      return db.updateTable('delegation_mandates')
        .set({ status: 'suspended', updated_at: new Date() } as any)
        .where('id', '=', mandateId)
        .where('owner_tenant_id', '=', ownerTenantId)
        .where('status', '=', 'active')
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ── Staff assignments ───────────────────────────────────────────

  static async assignStaff(
    providerTenantId: string,
    mandateId: string,
    userId: string,
    input: {
      user_id: string;
      role_in_mandate?: string;
      granted_actions?: string[];
      granted_by?: string;
    },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      const row = await db.insertInto('mandate_staff_assignments')
        .values({
          mandate_id: mandateId,
          provider_tenant_id: providerTenantId,
          user_id: input.user_id,
          role_in_mandate: input.role_in_mandate ?? 'handler',
          granted_actions: input.granted_actions ?? [],
          granted_by: input.granted_by ?? userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    });
  }

  static async listStaff(providerTenantId: string, mandateId: string) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.selectFrom('mandate_staff_assignments')
        .selectAll()
        .where('mandate_id', '=', mandateId)
        .where('provider_tenant_id', '=', providerTenantId)
        .where('status', '=', 'active')
        .orderBy('granted_at', 'asc')
        .execute();
    });
  }

  static async removeStaff(
    providerTenantId: string,
    assignmentId: string,
    removedBy: string,
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.updateTable('mandate_staff_assignments')
        .set({
          status: 'removed',
          removed_at: new Date(),
          removed_by: removedBy,
        } as any)
        .where('id', '=', assignmentId)
        .where('provider_tenant_id', '=', providerTenantId)
        .where('status', '=', 'active')
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ── Mandate enforcement ─────────────────────────────────────────

  static async checkMandateAccess(
    providerTenantId: string,
    ownerTenantId: string,
    userId: string,
    action: string,
    opts?: { app_id?: string; entity_id?: string; permit_code?: string },
  ): Promise<{ allowed: boolean; mandate_id: string | null; reason: string }> {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      const mandates = await db.selectFrom('delegation_mandates')
        .selectAll()
        .where('owner_tenant_id', '=', ownerTenantId)
        .where('provider_tenant_id', '=', providerTenantId)
        .where('status', '=', 'active')
        .execute();

      if (mandates.length === 0) {
        return { allowed: false, mandate_id: null, reason: 'no_active_mandate' };
      }

      for (const m of mandates) {
        const now = new Date().toISOString().slice(0, 10);
        const from = typeof m.effective_from === 'string' ? m.effective_from : '';
        const to = m.effective_to as string | null;
        if (from > now) continue;
        if (to && to < now) continue;

        const allowed = m.allowed_actions as string[];
        if (allowed.length > 0 && !allowed.includes(action)) continue;

        const apps = m.scope_apps as string[];
        if (opts?.app_id && apps.length > 0 && !apps.includes(opts.app_id)) continue;

        const entities = m.scope_entities as string[];
        if (opts?.entity_id && entities.length > 0 && !entities.includes(opts.entity_id)) continue;

        const permits = m.scope_permits as string[];
        if (opts?.permit_code && permits.length > 0 && !permits.includes(opts.permit_code)) continue;

        const staff = await db.selectFrom('mandate_staff_assignments')
          .selectAll()
          .where('mandate_id', '=', m.id as string)
          .where('user_id', '=', userId)
          .where('status', '=', 'active')
          .executeTakeFirst();

        if (!staff) continue;

        const grantedActions = staff.granted_actions as string[];
        if (grantedActions.length > 0 && !grantedActions.includes(action)) continue;

        return { allowed: true, mandate_id: m.id as string, reason: 'granted' };
      }

      return { allowed: false, mandate_id: null, reason: 'no_matching_mandate_or_staff' };
    });
  }

  // ── Audit logging ───────────────────────────────────────────────

  static async logAction(
    mandateId: string,
    ownerTenantId: string,
    providerTenantId: string,
    actorUserId: string,
    input: {
      action_type: string;
      action_detail?: string;
      target_record_type?: string;
      target_record_id?: string;
      app_id?: string;
      ip_address?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.insertInto('delegation_audit_log')
        .values({
          mandate_id: mandateId,
          owner_tenant_id: ownerTenantId,
          provider_tenant_id: providerTenantId,
          actor_user_id: actorUserId,
          on_behalf_of_tenant: ownerTenantId,
          action_type: input.action_type,
          action_detail: input.action_detail ?? null,
          target_record_type: input.target_record_type ?? null,
          target_record_id: input.target_record_id ?? null,
          app_id: input.app_id ?? null,
          ip_address: input.ip_address ?? null,
          metadata: input.metadata ?? {},
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async listAuditLog(
    tenantId: string,
    filters?: { mandate_id?: string; actor_user_id?: string; limit?: number },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      let q = db.selectFrom('delegation_audit_log')
        .selectAll();
      if (filters?.mandate_id) q = q.where('mandate_id', '=', filters.mandate_id);
      if (filters?.actor_user_id) q = q.where('actor_user_id', '=', filters.actor_user_id);
      return q.orderBy('created_at', 'desc')
        .limit(filters?.limit ?? 100)
        .execute();
    });
  }

  // ── Engagements ─────────────────────────────────────────────────

  static async createEngagement(
    providerTenantId: string,
    userId: string,
    input: {
      portfolio_id: string;
      mandate_id?: string;
      title: string;
      engagement_type?: string;
      fee_amount?: number;
      fee_currency?: string;
      billing_type?: string;
      notes?: string;
    },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      const row = await db.insertInto('provider_engagements')
        .values({
          provider_tenant_id: providerTenantId,
          portfolio_id: input.portfolio_id,
          mandate_id: input.mandate_id ?? null,
          title: input.title,
          engagement_type: input.engagement_type ?? 'retainer',
          fee_amount: input.fee_amount ?? null,
          fee_currency: input.fee_currency ?? 'TZS',
          billing_type: input.billing_type ?? 'fixed',
          notes: input.notes ?? null,
          created_by: userId,
          started_at: new Date(),
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        ...row,
        fee_amount: row.fee_amount != null ? Number(row.fee_amount) : null,
      };
    });
  }

  static async listEngagements(
    providerTenantId: string,
    filters?: { portfolio_id?: string; status?: string },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      let q = db.selectFrom('provider_engagements')
        .selectAll()
        .where('provider_tenant_id', '=', providerTenantId);
      if (filters?.portfolio_id) q = q.where('portfolio_id', '=', filters.portfolio_id);
      if (filters?.status) q = q.where('status', '=', filters.status);
      return (await q.orderBy('created_at', 'desc').execute()).map((r: any) => ({
        ...r,
        fee_amount: r.fee_amount != null ? Number(r.fee_amount) : null,
      }));
    });
  }
}
