import { z } from 'zod';
import { FINANCE_INDUSTRY_KEYS, financeCatalogProfile, type FinanceIndustryKey } from '@hudumika/types';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export const catalogIndustrySchema = z.enum(FINANCE_INDUSTRY_KEYS).nullable().optional();
export const catalogAttributesSchema = z.record(z.string().max(60), z.string().trim().max(250)).refine(value => Object.keys(value).length <= 12, 'Too many industry fields.');
export async function validateCatalogIndustry(trx: Transaction<Database>, tenantId: string, industry: FinanceIndustryKey | null | undefined, attributes?: Record<string, string>, previousIndustry?: string | null) {
  if (industry && industry !== previousIndustry) {
    const configuration = await trx.selectFrom('tenant_finance_profiles').select('industries').where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!Array.isArray(configuration?.industries) || !configuration.industries.includes(industry)) throw Object.assign(new Error('Select this industry in Finance settings before using it.'), { statusCode: 422 });
  }
  if (attributes) {
    const allowed = new Set(financeCatalogProfile(industry).fields.map(field => field.key));
    if (Object.keys(attributes).some(key => !allowed.has(key))) throw Object.assign(new Error('Industry details contain fields that do not belong to the selected industry.'), { statusCode: 422 });
  }
}
