import { withTenant, dbPlatform } from '../db/client.js';

export type SupportCategory = 'included' | 'paid_support' | 'implementation' | 'sales_assistance' | 'escalation';

export const SupportTimeService = {
  async record(tenantId: string, entry: {
    category: SupportCategory;
    duration_minutes: number;
    summary: string;
    agent_user_id?: string;
    agent_name?: string;
    ticket_ref?: string;
    engagement_id?: string;
  }): Promise<{ id: string }> {
    const costConfig = await dbPlatform.selectFrom('support_cost_config')
      .select('loaded_cost_per_hour')
      .where('category', '=', entry.category)
      .executeTakeFirst();

    return withTenant(tenantId, async trx => {
      const row = await trx.insertInto('support_time_entries').values({
        tenant_id: tenantId,
        category: entry.category,
        duration_minutes: entry.duration_minutes,
        summary: entry.summary,
        agent_user_id: entry.agent_user_id ?? null,
        agent_name: entry.agent_name ?? null,
        loaded_cost_per_hour: costConfig?.loaded_cost_per_hour ?? null,
        ticket_ref: entry.ticket_ref ?? null,
        engagement_id: entry.engagement_id ?? null,
      }).returning('id').executeTakeFirstOrThrow();
      return { id: row.id };
    });
  },

  async getSummary(tenantId: string, periodStart?: Date, periodEnd?: Date): Promise<{
    byCategory: Array<{ category: string; totalMinutes: number; totalCost: number; entryCount: number }>;
    totalMinutes: number;
    totalCost: number;
  }> {
    return withTenant(tenantId, async trx => {
      let query = trx.selectFrom('support_time_entries')
        .select(({ fn }) => [
          'category',
          fn.sum<number>('duration_minutes').as('total_minutes'),
          fn.count<number>('id').as('entry_count'),
        ])
        .where('tenant_id', '=', tenantId)
        .groupBy('category');

      if (periodStart) query = query.where('recorded_at', '>=', periodStart);
      if (periodEnd) query = query.where('recorded_at', '<=', periodEnd);

      const rows = await query.execute();

      const costConfigs = await dbPlatform.selectFrom('support_cost_config')
        .select(['category', 'loaded_cost_per_hour'])
        .execute();
      const costMap = new Map(costConfigs.map(c => [c.category, Number(c.loaded_cost_per_hour)]));

      const byCategory = rows.map(r => {
        const mins = Number(r.total_minutes);
        const costPerHour = costMap.get(r.category) ?? 0;
        return {
          category: r.category,
          totalMinutes: mins,
          totalCost: Math.round((mins / 60) * costPerHour),
          entryCount: Number(r.entry_count),
        };
      });

      return {
        byCategory,
        totalMinutes: byCategory.reduce((sum, c) => sum + c.totalMinutes, 0),
        totalCost: byCategory.reduce((sum, c) => sum + c.totalCost, 0),
      };
    });
  },

  async getEntries(tenantId: string, opts?: { limit?: number; offset?: number; category?: string }) {
    return withTenant(tenantId, async trx => {
      let query = trx.selectFrom('support_time_entries')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('recorded_at', 'desc');
      if (opts?.category) query = query.where('category', '=', opts.category);
      if (opts?.limit) query = query.limit(opts.limit);
      if (opts?.offset) query = query.offset(opts.offset);
      return query.execute();
    });
  },

  async getCostConfig(): Promise<Array<{ category: string; loaded_cost_per_hour: number; currency: string; description: string | null }>> {
    const rows = await dbPlatform.selectFrom('support_cost_config')
      .select(['category', 'loaded_cost_per_hour', 'currency', 'description'])
      .orderBy('category', 'asc')
      .execute();
    return rows.map(r => ({ ...r, loaded_cost_per_hour: Number(r.loaded_cost_per_hour) }));
  },

  async updateCostConfig(category: string, costPerHour: number): Promise<void> {
    await dbPlatform.updateTable('support_cost_config')
      .set({ loaded_cost_per_hour: costPerHour, updated_at: new Date() })
      .where('category', '=', category)
      .execute();
  },
};
