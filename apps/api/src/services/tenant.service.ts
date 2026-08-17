import { withTenant } from '../db/client.js';
import { pick } from '../lib/pick.js';

const COMPANY_FIELDS = ['name', 'slug', 'plan', 'billing_address', 'phone', 'email', 'logo_url', 'primary_color'] as const;

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
      let query = trx.selectFrom('tenant_companies').selectAll().where('tenant_id', '=', tenantId);
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
        .where('id', '=', companyId).where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();
    });
  }

  static async create(tenantId: string, data: CreateCompanyDto) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();
      // pick() runs after tenant_id is set, and only copies the named
      // company fields — a caller passing `{ tenant_id: '<other tenant>' }`
      // in the body (data is `request.body as any` at the route) used to
      // silently clobber tenant_id here, since object spread lets a later
      // key win; that created the row under whatever tenant_id was supplied,
      // not the caller's own.
      const result = await trx
        .insertInto('tenant_companies')
        .values({
          tenant_id: tenantId,
          ...pick(data, COMPANY_FIELDS),
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
        .set({ ...pick(data, COMPANY_FIELDS), updated_at: now })
        .where('id', '=', companyId).where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
      return result;
    });
  }

  static async delete(tenantId: string, companyId: string) {
    return withTenant(tenantId, async (trx) => {
      await trx
        .deleteFrom('tenant_companies')
        .where('id', '=', companyId).where('tenant_id', '=', tenantId)
        .execute();
      return { success: true };
    });
  }
}
