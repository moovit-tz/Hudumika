import { withTenant } from '../db/client.js';
import type {
  TenantEntity, CreateEntityInput, UpdateEntityInput,
  TenantSite, CreateSiteInput, UpdateSiteInput,
  EntityIndustry, AssignEntityIndustryInput,
  SiteActivity, AddSiteActivityInput,
  TenantIndustry, OrgModelSummary,
} from '@hudumika/types';

function toISO(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export const OrgModelService = {
  // ── Entities ──────────────────────────────────────────────────────────────

  async listEntities(tenantId: string): Promise<TenantEntity[]> {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('tenant_entities').selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('legal_name')
        .execute();
      return rows.map(r => ({
        ...r, metadata: (r.metadata ?? {}) as Record<string, unknown>,
        created_at: toISO(r.created_at), updated_at: toISO(r.updated_at),
      }));
    });
  },

  async getEntity(tenantId: string, entityId: string): Promise<TenantEntity> {
    return withTenant(tenantId, async trx => {
      const r = await trx.selectFrom('tenant_entities').selectAll()
        .where('tenant_id', '=', tenantId).where('id', '=', entityId)
        .executeTakeFirstOrThrow();
      return {
        ...r, metadata: (r.metadata ?? {}) as Record<string, unknown>,
        created_at: toISO(r.created_at), updated_at: toISO(r.updated_at),
      };
    });
  },

  async createEntity(tenantId: string, userId: string, input: CreateEntityInput): Promise<TenantEntity> {
    return withTenant(tenantId, async trx => {
      if (input.parent_entity_id) {
        await trx.selectFrom('tenant_entities').select('id')
          .where('tenant_id', '=', tenantId).where('id', '=', input.parent_entity_id)
          .executeTakeFirstOrThrow();
      }
      const r = await trx.insertInto('tenant_entities').values({
        tenant_id: tenantId,
        legal_name: input.legal_name,
        short_name: input.short_name ?? null,
        registration_no: input.registration_no ?? null,
        tax_id: input.tax_id ?? null,
        country_code: input.country_code ?? 'TZ',
        currency: input.currency ?? 'TZS',
        entity_type: (input.entity_type ?? 'subsidiary') as any,
        parent_entity_id: input.parent_entity_id ?? null,
        registered_address: input.registered_address ?? null,
        primary_industry: input.primary_industry ?? null,
        metadata: input.metadata ?? {},
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return {
        ...r, metadata: (r.metadata ?? {}) as Record<string, unknown>,
        created_at: toISO(r.created_at), updated_at: toISO(r.updated_at),
      };
    });
  },

  async updateEntity(tenantId: string, entityId: string, input: UpdateEntityInput): Promise<TenantEntity> {
    return withTenant(tenantId, async trx => {
      if (input.parent_entity_id !== undefined && input.parent_entity_id !== null) {
        if (input.parent_entity_id === entityId) {
          throw new Error('Entity cannot be its own parent.');
        }
        await trx.selectFrom('tenant_entities').select('id')
          .where('tenant_id', '=', tenantId).where('id', '=', input.parent_entity_id)
          .executeTakeFirstOrThrow();
      }
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (input.legal_name !== undefined) patch.legal_name = input.legal_name;
      if (input.short_name !== undefined) patch.short_name = input.short_name;
      if (input.registration_no !== undefined) patch.registration_no = input.registration_no;
      if (input.tax_id !== undefined) patch.tax_id = input.tax_id;
      if (input.country_code !== undefined) patch.country_code = input.country_code;
      if (input.currency !== undefined) patch.currency = input.currency;
      if (input.entity_type !== undefined) patch.entity_type = input.entity_type;
      if (input.parent_entity_id !== undefined) patch.parent_entity_id = input.parent_entity_id;
      if (input.status !== undefined) patch.status = input.status;
      if (input.registered_address !== undefined) patch.registered_address = input.registered_address;
      if (input.primary_industry !== undefined) patch.primary_industry = input.primary_industry;
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      const r = await trx.updateTable('tenant_entities').set(patch as any)
        .where('tenant_id', '=', tenantId).where('id', '=', entityId)
        .returningAll().executeTakeFirstOrThrow();
      return {
        ...r, metadata: (r.metadata ?? {}) as Record<string, unknown>,
        created_at: toISO(r.created_at), updated_at: toISO(r.updated_at),
      };
    });
  },

  // ── Sites ─────────────────────────────────────────────────────────────────

  async listSites(tenantId: string, entityId?: string): Promise<TenantSite[]> {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('tenant_sites').selectAll()
        .where('tenant_id', '=', tenantId);
      if (entityId) q = q.where('entity_id', '=', entityId);
      const rows = await q.orderBy('name').execute();
      return rows.map(r => ({
        ...r, metadata: (r.metadata ?? {}) as Record<string, unknown>,
        latitude: r.latitude != null ? Number(r.latitude) : null,
        longitude: r.longitude != null ? Number(r.longitude) : null,
        created_at: toISO(r.created_at), updated_at: toISO(r.updated_at),
      }));
    });
  },

  async createSite(tenantId: string, userId: string, input: CreateSiteInput): Promise<TenantSite> {
    return withTenant(tenantId, async trx => {
      if (input.entity_id) {
        await trx.selectFrom('tenant_entities').select('id')
          .where('tenant_id', '=', tenantId).where('id', '=', input.entity_id)
          .executeTakeFirstOrThrow();
      }
      const r = await trx.insertInto('tenant_sites').values({
        tenant_id: tenantId,
        entity_id: input.entity_id ?? null,
        name: input.name,
        code: input.code ?? null,
        site_type: (input.site_type ?? 'office') as any,
        address: input.address ?? null,
        city: input.city ?? null,
        region: input.region ?? null,
        country_code: input.country_code ?? 'TZ',
        timezone: input.timezone ?? 'Africa/Dar_es_Salaam',
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        metadata: input.metadata ?? {},
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return {
        ...r, metadata: (r.metadata ?? {}) as Record<string, unknown>,
        latitude: r.latitude != null ? Number(r.latitude) : null,
        longitude: r.longitude != null ? Number(r.longitude) : null,
        created_at: toISO(r.created_at), updated_at: toISO(r.updated_at),
      };
    });
  },

  async updateSite(tenantId: string, siteId: string, input: UpdateSiteInput): Promise<TenantSite> {
    return withTenant(tenantId, async trx => {
      if (input.entity_id !== undefined && input.entity_id !== null) {
        await trx.selectFrom('tenant_entities').select('id')
          .where('tenant_id', '=', tenantId).where('id', '=', input.entity_id)
          .executeTakeFirstOrThrow();
      }
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (input.entity_id !== undefined) patch.entity_id = input.entity_id;
      if (input.name !== undefined) patch.name = input.name;
      if (input.code !== undefined) patch.code = input.code;
      if (input.site_type !== undefined) patch.site_type = input.site_type;
      if (input.address !== undefined) patch.address = input.address;
      if (input.city !== undefined) patch.city = input.city;
      if (input.region !== undefined) patch.region = input.region;
      if (input.country_code !== undefined) patch.country_code = input.country_code;
      if (input.timezone !== undefined) patch.timezone = input.timezone;
      if (input.status !== undefined) patch.status = input.status;
      if (input.latitude !== undefined) patch.latitude = input.latitude;
      if (input.longitude !== undefined) patch.longitude = input.longitude;
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      const r = await trx.updateTable('tenant_sites').set(patch as any)
        .where('tenant_id', '=', tenantId).where('id', '=', siteId)
        .returningAll().executeTakeFirstOrThrow();
      return {
        ...r, metadata: (r.metadata ?? {}) as Record<string, unknown>,
        latitude: r.latitude != null ? Number(r.latitude) : null,
        longitude: r.longitude != null ? Number(r.longitude) : null,
        created_at: toISO(r.created_at), updated_at: toISO(r.updated_at),
      };
    });
  },

  // ── Entity ↔ Industry assignments ─────────────────────────────────────────

  async listEntityIndustries(tenantId: string, entityId: string): Promise<EntityIndustry[]> {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('entity_industries').selectAll()
        .where('tenant_id', '=', tenantId).where('entity_id', '=', entityId)
        .orderBy('is_primary', 'desc').orderBy('industry_key')
        .execute();
      return rows.map(r => ({
        ...r, created_at: toISO(r.created_at),
      }));
    });
  },

  async assignEntityIndustry(tenantId: string, input: AssignEntityIndustryInput): Promise<EntityIndustry> {
    return withTenant(tenantId, async trx => {
      await trx.selectFrom('tenant_entities').select('id')
        .where('tenant_id', '=', tenantId).where('id', '=', input.entity_id)
        .executeTakeFirstOrThrow();
      const r = await trx.insertInto('entity_industries').values({
        tenant_id: tenantId,
        entity_id: input.entity_id,
        industry_key: input.industry_key,
        is_primary: input.is_primary ?? false,
        effective_from: input.effective_from ?? new Date().toISOString().slice(0, 10),
      }).returningAll().executeTakeFirstOrThrow();
      return { ...r, created_at: toISO(r.created_at) };
    });
  },

  async removeEntityIndustry(tenantId: string, entityId: string, industryKey: string): Promise<void> {
    await withTenant(tenantId, async trx => {
      const result = await trx.deleteFrom('entity_industries')
        .where('tenant_id', '=', tenantId)
        .where('entity_id', '=', entityId)
        .where('industry_key', '=', industryKey)
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new Error('Entity-industry assignment not found.');
      }
    });
  },

  // ── Site ↔ Activity assignments ───────────────────────────────────────────

  async listSiteActivities(tenantId: string, siteId: string): Promise<SiteActivity[]> {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('site_activities').selectAll()
        .where('tenant_id', '=', tenantId).where('site_id', '=', siteId)
        .orderBy('industry_key').orderBy('activity_name')
        .execute();
      return rows.map(r => ({ ...r, created_at: toISO(r.created_at) }));
    });
  },

  async addSiteActivity(tenantId: string, input: AddSiteActivityInput): Promise<SiteActivity> {
    return withTenant(tenantId, async trx => {
      await trx.selectFrom('tenant_sites').select('id')
        .where('tenant_id', '=', tenantId).where('id', '=', input.site_id)
        .executeTakeFirstOrThrow();
      const r = await trx.insertInto('site_activities').values({
        tenant_id: tenantId,
        site_id: input.site_id,
        industry_key: input.industry_key,
        activity_name: input.activity_name,
        license_ref: input.license_ref ?? null,
      }).returningAll().executeTakeFirstOrThrow();
      return { ...r, created_at: toISO(r.created_at) };
    });
  },

  // ── Tenant-level industry activation ──────────────────────────────────────

  async listTenantIndustries(tenantId: string): Promise<TenantIndustry[]> {
    return withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('tenant_industries').selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('is_primary', 'desc').orderBy('industry_key')
        .execute();
      return rows.map(r => ({
        ...r,
        activated_at: toISO(r.activated_at),
        deactivated_at: r.deactivated_at ? toISO(r.deactivated_at) : null,
      }));
    });
  },

  async activateTenantIndustry(
    tenantId: string, userId: string, industryKey: string, isPrimary = false,
  ): Promise<TenantIndustry> {
    return withTenant(tenantId, async trx => {
      const r = await trx.insertInto('tenant_industries').values({
        tenant_id: tenantId,
        industry_key: industryKey,
        is_primary: isPrimary,
        activated_by: userId,
      }).onConflict(oc => oc.columns(['tenant_id', 'industry_key']).doUpdateSet({
        is_primary: isPrimary,
        deactivated_at: null,
        activated_by: userId,
        activated_at: new Date(),
      })).returningAll().executeTakeFirstOrThrow();
      return {
        ...r,
        activated_at: toISO(r.activated_at),
        deactivated_at: r.deactivated_at ? toISO(r.deactivated_at) : null,
      };
    });
  },

  async deactivateTenantIndustry(tenantId: string, industryKey: string): Promise<void> {
    await withTenant(tenantId, async trx => {
      const result = await trx.updateTable('tenant_industries')
        .set({ deactivated_at: new Date() })
        .where('tenant_id', '=', tenantId)
        .where('industry_key', '=', industryKey)
        .where('deactivated_at', 'is', null)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        throw new Error('Active industry not found for this tenant.');
      }
    });
  },

  // ── Full org model summary ────────────────────────────────────────────────

  async getOrgSummary(tenantId: string): Promise<OrgModelSummary> {
    const [entities, sites, industries] = await Promise.all([
      this.listEntities(tenantId),
      this.listSites(tenantId),
      this.listTenantIndustries(tenantId),
    ]);
    const entityIndustries = await withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('entity_industries').selectAll()
        .where('tenant_id', '=', tenantId).orderBy('entity_id').execute();
      return rows.map(r => ({ ...r, created_at: toISO(r.created_at) }));
    });
    const siteActivities = await withTenant(tenantId, async trx => {
      const rows = await trx.selectFrom('site_activities').selectAll()
        .where('tenant_id', '=', tenantId).orderBy('site_id').execute();
      return rows.map(r => ({ ...r, created_at: toISO(r.created_at) }));
    });
    return { entities, sites, industries, entityIndustries, siteActivities };
  },
};
