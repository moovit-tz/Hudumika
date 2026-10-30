import { dbPlatform } from '../db/client.js';
import type { IndustryRegistryEntry, IndustryAppCapability } from '@hudumika/types';

function toISO(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export const IndustryRegistryService = {
  async listIndustries(opts?: { status?: string; parentKey?: string }): Promise<IndustryRegistryEntry[]> {
    let q = dbPlatform.selectFrom('industry_registry').selectAll().orderBy('sort_order');
    if (opts?.status) q = q.where('status', '=', opts.status as any);
    if (opts?.parentKey !== undefined) {
      q = opts.parentKey === ''
        ? q.where('parent_key', 'is', null)
        : q.where('parent_key', '=', opts.parentKey);
    }
    const rows = await q.execute();
    return rows.map(r => ({
      ...r,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      app_capabilities: (r.app_capabilities ?? {}) as Record<string, unknown>,
      recommended_finance_caps: Array.isArray(r.recommended_finance_caps) ? r.recommended_finance_caps : [],
      jurisdiction_coverage: Array.isArray(r.jurisdiction_coverage) ? r.jurisdiction_coverage : [],
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    }));
  },

  async getIndustry(key: string): Promise<IndustryRegistryEntry | null> {
    const r = await dbPlatform.selectFrom('industry_registry').selectAll()
      .where('key', '=', key).executeTakeFirst();
    if (!r) return null;
    return {
      ...r,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      app_capabilities: (r.app_capabilities ?? {}) as Record<string, unknown>,
      recommended_finance_caps: Array.isArray(r.recommended_finance_caps) ? r.recommended_finance_caps : [],
      jurisdiction_coverage: Array.isArray(r.jurisdiction_coverage) ? r.jurisdiction_coverage : [],
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    };
  },

  async resolveKey(keyOrAlias: string): Promise<string | null> {
    const direct = await dbPlatform.selectFrom('industry_registry').select('key')
      .where('key', '=', keyOrAlias).executeTakeFirst();
    if (direct) return direct.key;
    const byAlias = await dbPlatform.selectFrom('industry_registry').select('key')
      .where('aliases', '@>', `{${keyOrAlias}}` as any)
      .executeTakeFirst();
    return byAlias?.key ?? null;
  },

  async listAppCapabilities(industryKey: string): Promise<IndustryAppCapability[]> {
    const rows = await dbPlatform.selectFrom('industry_app_capabilities').selectAll()
      .where('industry_key', '=', industryKey)
      .orderBy('app_id').orderBy('capability_key')
      .execute();
    return rows.map(r => ({
      ...r,
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    }));
  },

  async getAcceptedIndustries(): Promise<IndustryRegistryEntry[]> {
    return this.listIndustries({ status: 'accepted' });
  },

  async getActivatableIndustries(): Promise<IndustryRegistryEntry[]> {
    const rows = await dbPlatform.selectFrom('industry_registry').selectAll()
      .where('status', 'in', ['accepted', 'pilot'])
      .orderBy('sort_order').execute();
    return rows.map(r => ({
      ...r,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      app_capabilities: (r.app_capabilities ?? {}) as Record<string, unknown>,
      recommended_finance_caps: Array.isArray(r.recommended_finance_caps) ? r.recommended_finance_caps : [],
      jurisdiction_coverage: Array.isArray(r.jurisdiction_coverage) ? r.jurisdiction_coverage : [],
      created_at: toISO(r.created_at),
      updated_at: toISO(r.updated_at),
    }));
  },
};
