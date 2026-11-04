import { withTenant, dbPlatform } from '../db/client.js';

export type CheckpointKey =
  | 'first_shipment' | 'first_declaration' | 'first_invoice'
  | 'first_customer' | 'first_product' | 'first_sale'
  | 'first_purchase_order' | 'first_project' | 'first_client'
  | 'first_timesheet' | 'import_contacts' | 'import_products'
  | 'setup_payment_method' | 'invite_team';

export const ActivationService = {
  async complete(tenantId: string, key: CheckpointKey, userId?: string, context?: Record<string, any>): Promise<boolean> {
    return withTenant(tenantId, async trx => {
      const existing = await trx.selectFrom('tenant_activation_checkpoints')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('checkpoint_key', '=', key)
        .executeTakeFirst();
      if (existing) return false;

      await trx.insertInto('tenant_activation_checkpoints').values({
        tenant_id: tenantId,
        checkpoint_key: key,
        completed_by: userId ?? null,
        context: context ?? null,
      }).execute();
      return true;
    });
  },

  async getProgress(tenantId: string): Promise<{
    completed: string[];
    journey: { industry_key: string; label: string; checkpoint_keys: string[] } | null;
    percentage: number;
  }> {
    return withTenant(tenantId, async trx => {
      const [completedRows, tenant] = await Promise.all([
        trx.selectFrom('tenant_activation_checkpoints')
          .select('checkpoint_key')
          .where('tenant_id', '=', tenantId)
          .execute(),
        trx.selectFrom('tenants')
          .select('onboarding_journey')
          .where('id', '=', tenantId)
          .executeTakeFirst(),
      ]);

      const completed = completedRows.map(r => r.checkpoint_key);

      let journey: { industry_key: string; label: string; checkpoint_keys: string[] } | null = null;
      if (tenant?.onboarding_journey) {
        const j = await trx.selectFrom('onboarding_journeys')
          .select(['industry_key', 'label', 'checkpoint_keys'])
          .where('industry_key', '=', tenant.onboarding_journey)
          .executeTakeFirst();
        if (j) {
          const keys = Array.isArray(j.checkpoint_keys) ? j.checkpoint_keys as string[] : [];
          journey = { industry_key: j.industry_key, label: j.label, checkpoint_keys: keys };
        }
      }

      const totalKeys = journey?.checkpoint_keys ?? [];
      const percentage = totalKeys.length > 0
        ? Math.round((totalKeys.filter(k => completed.includes(k)).length / totalKeys.length) * 100)
        : 0;

      return { completed, journey, percentage };
    });
  },

  async listJourneys(): Promise<Array<{
    industry_key: string; label: string; description: string | null;
    featured_apps: string[]; checkpoint_keys: string[];
    recommended_package_code: string | null;
  }>> {
    const rows = await dbPlatform.selectFrom('onboarding_journeys')
      .leftJoin('industry_registry', 'industry_registry.key', 'onboarding_journeys.industry_key')
      .select([
        'onboarding_journeys.industry_key',
        'onboarding_journeys.label',
        'onboarding_journeys.description',
        'onboarding_journeys.featured_apps',
        'onboarding_journeys.checkpoint_keys',
        'industry_registry.default_package_code',
      ])
      .where('onboarding_journeys.is_active', '=', true)
      .orderBy('onboarding_journeys.sort_order', 'asc')
      .execute();
    return rows.map(r => ({
      industry_key: r.industry_key,
      label: r.label,
      description: r.description,
      featured_apps: Array.isArray(r.featured_apps) ? r.featured_apps as string[] : [],
      checkpoint_keys: Array.isArray(r.checkpoint_keys) ? r.checkpoint_keys as string[] : [],
      recommended_package_code: r.default_package_code ?? null,
    }));
  },
};
