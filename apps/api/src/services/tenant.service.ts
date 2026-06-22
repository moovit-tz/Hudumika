import { withTenant } from '../db/client.js';

export interface CreateCompanyDto {
  name: string;
  slug: string;
  plan: string;
  billing_address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
}

export interface UpdateCompanyDto {
  name?: string;
  slug?: string;
  plan?: string;
  billing_address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
}

export class TenantService {
  static async list(tenantId: string, filters?: { name?: string }) {
    return withTenant(tenantId, async (trx) => {
      let query = trx.selectFrom('tenant_companies').selectAll();
      if (filters?.name) {
        query = query.where('name', 'ilike', `%${filters.name}%`);
      }
      return query.execute();
    });
  }

  static async get(tenantId: string, companyId: string) {
    return withTenant(tenantId, async (trx) => {
      return trx
        .selectFrom('tenant_companies')
        .selectAll()
        .where('id', '=', companyId)
        .executeTakeFirstOrThrow();
    });
  }

  static async create(tenantId: string, data: CreateCompanyDto) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();
      const result = await trx
        .insertInto('tenant_companies')
        .values({
          tenant_id: tenantId,
          ...data,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return result;
    });
  }

  static async update(tenantId: string, companyId: string, data: UpdateCompanyDto) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();
      const result = await trx
        .updateTable('tenant_companies')
        .set({ ...data, updated_at: now })
        .where('id', '=', companyId)
        .returningAll()
        .executeTakeFirstOrThrow();
      return result;
    });
  }

  static async delete(tenantId: string, companyId: string) {
    return withTenant(tenantId, async (trx) => {
      await trx
        .deleteFrom('tenant_companies')
        .where('id', '=', companyId)
        .execute();
      return { success: true };
    });
  }
}
