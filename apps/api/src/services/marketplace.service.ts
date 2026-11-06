import { withTenant, type TenantDb } from '../db/client.js';

export class MarketplaceService {

  // ── Provider listings ───────────────────────────────────────────

  static async createListing(
    providerTenantId: string,
    userId: string,
    input: {
      display_name: string;
      tagline?: string;
      description?: string;
      services?: string[];
      jurisdictions?: string[];
      industries?: string[];
      min_fee?: number;
      max_fee?: number;
      fee_currency?: string;
      contact_email?: string;
      contact_phone?: string;
      website_url?: string;
    },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      const row = await db.insertInto('marketplace_provider_listings')
        .values({
          provider_tenant_id: providerTenantId,
          display_name: input.display_name,
          tagline: input.tagline ?? null,
          description: input.description ?? null,
          services: input.services ?? [],
          jurisdictions: input.jurisdictions ?? [],
          industries: input.industries ?? [],
          min_fee: input.min_fee ?? null,
          max_fee: input.max_fee ?? null,
          fee_currency: input.fee_currency ?? 'TZS',
          contact_email: input.contact_email ?? null,
          contact_phone: input.contact_phone ?? null,
          website_url: input.website_url ?? null,
          created_by: userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        ...row,
        min_fee: row.min_fee != null ? Number(row.min_fee) : null,
        max_fee: row.max_fee != null ? Number(row.max_fee) : null,
        avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
      };
    });
  }

  static async listListings(
    tenantId: string,
    filters?: { status?: string; only_own?: boolean },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      let q = db.selectFrom('marketplace_provider_listings').selectAll();
      if (filters?.only_own) {
        q = q.where('provider_tenant_id', '=', tenantId);
      }
      if (filters?.status) q = q.where('status', '=', filters.status);
      return (await q.orderBy('created_at', 'desc').execute()).map((r: any) => ({
        ...r,
        min_fee: r.min_fee != null ? Number(r.min_fee) : null,
        max_fee: r.max_fee != null ? Number(r.max_fee) : null,
        avg_rating: r.avg_rating != null ? Number(r.avg_rating) : null,
      }));
    });
  }

  static async getListing(tenantId: string, id: string) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const row = await db.selectFrom('marketplace_provider_listings')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) return null;
      return {
        ...row,
        min_fee: row.min_fee != null ? Number(row.min_fee) : null,
        max_fee: row.max_fee != null ? Number(row.max_fee) : null,
        avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
      };
    });
  }

  static async updateListingStatus(
    providerTenantId: string,
    id: string,
    status: string,
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.updateTable('marketplace_provider_listings')
        .set({ status, updated_at: new Date() } as any)
        .where('id', '=', id)
        .where('provider_tenant_id', '=', providerTenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ── Enquiries ───────────────────────────────────────────────────

  static async createEnquiry(
    clientTenantId: string,
    userId: string,
    input: {
      provider_tenant_id: string;
      listing_id?: string;
      subject: string;
      brief?: string;
      services_requested?: string[];
      jurisdictions?: string[];
      urgency?: string;
      budget_min?: number;
      budget_max?: number;
      budget_currency?: string;
    },
  ) {
    return withTenant(clientTenantId, async (db: TenantDb) => {
      const row = await db.insertInto('marketplace_enquiries')
        .values({
          client_tenant_id: clientTenantId,
          provider_tenant_id: input.provider_tenant_id,
          listing_id: input.listing_id ?? null,
          subject: input.subject,
          brief: input.brief ?? null,
          services_requested: input.services_requested ?? [],
          jurisdictions: input.jurisdictions ?? [],
          urgency: input.urgency ?? 'normal',
          budget_min: input.budget_min ?? null,
          budget_max: input.budget_max ?? null,
          budget_currency: input.budget_currency ?? 'TZS',
          created_by: userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    });
  }

  static async listEnquiries(
    tenantId: string,
    side: 'client' | 'provider',
    filters?: { status?: string },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const col = side === 'client' ? 'client_tenant_id' : 'provider_tenant_id';
      let q = db.selectFrom('marketplace_enquiries')
        .selectAll()
        .where(col, '=', tenantId);
      if (filters?.status) q = q.where('status', '=', filters.status);
      return q.orderBy('created_at', 'desc').execute();
    });
  }

  static async updateEnquiryStatus(
    tenantId: string,
    id: string,
    status: string,
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const vals: Record<string, unknown> = { status, updated_at: new Date() };
      if (status === 'responded') vals.responded_at = new Date();
      return db.updateTable('marketplace_enquiries')
        .set(vals as any)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ── Quotations ──────────────────────────────────────────────────

  static async createQuotation(
    providerTenantId: string,
    userId: string,
    input: {
      client_tenant_id: string;
      enquiry_id?: string;
      quote_number: string;
      scope_description: string;
      line_items?: unknown[];
      authority_fees?: number;
      professional_fees?: number;
      platform_charges?: number;
      variable_services?: number;
      total_amount?: number;
      currency?: string;
      valid_until?: string;
    },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      const total = (input.authority_fees ?? 0) + (input.professional_fees ?? 0)
        + (input.platform_charges ?? 0) + (input.variable_services ?? 0);
      const row = await db.insertInto('marketplace_quotations')
        .values({
          provider_tenant_id: providerTenantId,
          client_tenant_id: input.client_tenant_id,
          enquiry_id: input.enquiry_id ?? null,
          quote_number: input.quote_number,
          scope_description: input.scope_description,
          line_items: JSON.stringify(input.line_items ?? []),
          authority_fees: input.authority_fees ?? 0,
          professional_fees: input.professional_fees ?? 0,
          platform_charges: input.platform_charges ?? 0,
          variable_services: input.variable_services ?? 0,
          total_amount: input.total_amount ?? total,
          currency: input.currency ?? 'TZS',
          valid_until: input.valid_until ?? null,
          created_by: userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        ...row,
        authority_fees: Number(row.authority_fees),
        professional_fees: Number(row.professional_fees),
        platform_charges: Number(row.platform_charges),
        variable_services: Number(row.variable_services),
        total_amount: Number(row.total_amount),
      };
    });
  }

  static async listQuotations(
    tenantId: string,
    side: 'client' | 'provider',
    filters?: { status?: string },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const col = side === 'client' ? 'client_tenant_id' : 'provider_tenant_id';
      let q = db.selectFrom('marketplace_quotations')
        .selectAll()
        .where(col, '=', tenantId);
      if (filters?.status) q = q.where('status', '=', filters.status);
      return (await q.orderBy('created_at', 'desc').execute()).map((r: any) => ({
        ...r,
        authority_fees: Number(r.authority_fees),
        professional_fees: Number(r.professional_fees),
        platform_charges: Number(r.platform_charges),
        variable_services: Number(r.variable_services),
        total_amount: Number(r.total_amount),
      }));
    });
  }

  static async acceptQuotation(
    clientTenantId: string,
    quotationId: string,
    userId: string,
  ) {
    return withTenant(clientTenantId, async (db: TenantDb) => {
      return db.updateTable('marketplace_quotations')
        .set({
          status: 'accepted',
          accepted_at: new Date(),
          accepted_by: userId,
          updated_at: new Date(),
        } as any)
        .where('id', '=', quotationId)
        .where('client_tenant_id', '=', clientTenantId)
        .where('status', '=', 'sent')
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async rejectQuotation(
    clientTenantId: string,
    quotationId: string,
    reason?: string,
  ) {
    return withTenant(clientTenantId, async (db: TenantDb) => {
      return db.updateTable('marketplace_quotations')
        .set({
          status: 'rejected',
          rejection_reason: reason ?? null,
          updated_at: new Date(),
        } as any)
        .where('id', '=', quotationId)
        .where('client_tenant_id', '=', clientTenantId)
        .where('status', '=', 'sent')
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async sendQuotation(providerTenantId: string, quotationId: string) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.updateTable('marketplace_quotations')
        .set({ status: 'sent', updated_at: new Date() } as any)
        .where('id', '=', quotationId)
        .where('provider_tenant_id', '=', providerTenantId)
        .where('status', '=', 'draft')
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ── Assignments ─────────────────────────────────────────────────

  static async createAssignment(
    providerTenantId: string,
    userId: string,
    input: {
      client_tenant_id: string;
      engagement_id?: string;
      mandate_id?: string;
      quotation_id?: string;
      title: string;
      description?: string;
      assigned_to?: string;
      priority?: string;
      due_date?: string;
    },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.insertInto('marketplace_assignments')
        .values({
          provider_tenant_id: providerTenantId,
          client_tenant_id: input.client_tenant_id,
          engagement_id: input.engagement_id ?? null,
          mandate_id: input.mandate_id ?? null,
          quotation_id: input.quotation_id ?? null,
          title: input.title,
          description: input.description ?? null,
          assigned_to: input.assigned_to ?? null,
          priority: input.priority ?? 'normal',
          due_date: input.due_date ?? null,
          started_at: new Date(),
          created_by: userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async listAssignments(
    tenantId: string,
    side: 'client' | 'provider',
    filters?: { status?: string },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const col = side === 'client' ? 'client_tenant_id' : 'provider_tenant_id';
      let q = db.selectFrom('marketplace_assignments')
        .selectAll()
        .where(col, '=', tenantId);
      if (filters?.status) q = q.where('status', '=', filters.status);
      return q.orderBy('created_at', 'desc').execute();
    });
  }

  static async updateAssignmentStatus(
    tenantId: string,
    id: string,
    status: string,
    meta?: { cancellation_reason?: string; reassigned_from?: string },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      const vals: Record<string, unknown> = { status, updated_at: new Date() };
      if (status === 'completed') vals.completed_at = new Date();
      if (status === 'cancelled' && meta?.cancellation_reason) {
        vals.cancellation_reason = meta.cancellation_reason;
      }
      if (status === 'reassigned' && meta?.reassigned_from) {
        vals.reassigned_from = meta.reassigned_from;
        vals.reassigned_at = new Date();
      }
      return db.updateTable('marketplace_assignments')
        .set(vals as any)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ── Milestones ──────────────────────────────────────────────────

  static async createMilestone(
    providerTenantId: string,
    userId: string,
    input: {
      assignment_id: string;
      title: string;
      description?: string;
      evidence_type?: string;
      evidence_url?: string;
      evidence_file_id?: string;
    },
  ) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.insertInto('marketplace_milestones')
        .values({
          assignment_id: input.assignment_id,
          provider_tenant_id: providerTenantId,
          title: input.title,
          description: input.description ?? null,
          evidence_type: input.evidence_type ?? 'document',
          evidence_url: input.evidence_url ?? null,
          evidence_file_id: input.evidence_file_id ?? null,
          created_by: userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async listMilestones(tenantId: string, assignmentId: string) {
    return withTenant(tenantId, async (db: TenantDb) => {
      return db.selectFrom('marketplace_milestones')
        .selectAll()
        .where('assignment_id', '=', assignmentId)
        .orderBy('created_at', 'asc')
        .execute();
    });
  }

  static async submitMilestone(providerTenantId: string, milestoneId: string) {
    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.updateTable('marketplace_milestones')
        .set({ status: 'submitted', submitted_at: new Date() } as any)
        .where('id', '=', milestoneId)
        .where('provider_tenant_id', '=', providerTenantId)
        .where('status', '=', 'pending')
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async reviewMilestone(
    clientTenantId: string,
    milestoneId: string,
    userId: string,
    accepted: boolean,
    notes?: string,
  ) {
    const providerTenantId = await withTenant(clientTenantId, async (db: TenantDb) => {
      const milestone = await db.selectFrom('marketplace_milestones')
        .select(['assignment_id'])
        .where('id', '=', milestoneId)
        .executeTakeFirst();
      if (!milestone) throw new Error('Milestone not found');
      const assignment = await db.selectFrom('marketplace_assignments')
        .select(['provider_tenant_id'])
        .where('id', '=', milestone.assignment_id)
        .where('client_tenant_id', '=', clientTenantId)
        .executeTakeFirst();
      if (!assignment) throw new Error('Assignment not found or access denied');
      return assignment.provider_tenant_id;
    });

    return withTenant(providerTenantId, async (db: TenantDb) => {
      return db.updateTable('marketplace_milestones')
        .set({
          status: accepted ? 'accepted' : 'rejected',
          reviewed_by: userId,
          reviewed_at: new Date(),
          review_notes: notes ?? null,
        } as any)
        .where('id', '=', milestoneId)
        .where('status', '=', 'submitted')
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ── Disputes ────────────────────────────────────────────────────

  static async createDispute(
    raisedByTenantId: string,
    userId: string,
    input: {
      assignment_id: string;
      against_tenant: string;
      reason: string;
      details?: string;
    },
  ) {
    return withTenant(raisedByTenantId, async (db: TenantDb) => {
      return db.insertInto('marketplace_disputes')
        .values({
          assignment_id: input.assignment_id,
          raised_by_tenant: raisedByTenantId,
          against_tenant: input.against_tenant,
          reason: input.reason,
          details: input.details ?? null,
          created_by: userId,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  static async listDisputes(
    tenantId: string,
    filters?: { status?: string },
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      let q = db.selectFrom('marketplace_disputes').selectAll();
      if (filters?.status) q = q.where('status', '=', filters.status);
      return q.orderBy('created_at', 'desc').execute();
    });
  }

  static async resolveDispute(
    tenantId: string,
    disputeId: string,
    userId: string,
    resolution: string,
  ) {
    return withTenant(tenantId, async (db: TenantDb) => {
      return db.updateTable('marketplace_disputes')
        .set({
          status: 'resolved',
          resolution,
          resolved_by: userId,
          resolved_at: new Date(),
          updated_at: new Date(),
        } as any)
        .where('id', '=', disputeId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }
}
