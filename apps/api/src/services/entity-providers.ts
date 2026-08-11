import { registerEntityProvider } from './workflow-engine.service.js';

/**
 * Built-in entity context providers — one per entity type that can run a
 * workflow through the generic engine. A provider reads that entity's own
 * fields (and documents, if it has any) so the SHARED entry-condition evaluator
 * can gate its steps. Adding a new app to the engine is exactly this: register
 * one provider; the engine, resolver and evaluator never change.
 *
 * `registerBuiltInEntityProviders()` is called once at boot from index.ts,
 * mirroring bootstrapSubscribers().
 */
export function registerBuiltInEntityProviders(): void {
  // ClearOS shipment — mirrors what transitionStage evaluates against, so a
  // shipment workflow behaves identically whether driven by the embedded engine
  // or this generic one.
  registerEntityProvider('shipment', async (trx, tenantId, entityId) => {
    const row = await trx.selectFrom('shipment_cases').selectAll()
      .where('id', '=', entityId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!row) return null;
    const documents = await trx.selectFrom('case_documents').select(['type', 'status'])
      .where('shipment_id', '=', entityId).where('tenant_id', '=', tenantId).execute();
    return { fields: row, documents };
  });

  // HuduFreight trip — its own row's fields (status, origin/destination, cargo,
  // schedule). No document set of its own today, so conditions are column-based.
  registerEntityProvider('trip', async (trx, tenantId, entityId) => {
    const row = await trx.selectFrom('trips').selectAll()
      .where('id', '=', entityId).where('tenant_id', '=', tenantId).executeTakeFirst();
    return row ? { fields: row, documents: [] } : null;
  });

  // SEAL lot — warehouse lot fields.
  registerEntityProvider('seal_lot', async (trx, tenantId, entityId) => {
    const row = await trx.selectFrom('seal_lots').selectAll()
      .where('id', '=', entityId).where('tenant_id', '=', tenantId).executeTakeFirst();
    return row ? { fields: row, documents: [] } : null;
  });
}
