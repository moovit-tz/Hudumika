import { sql, type Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { getIndustryWork, IndustryWorkError } from './finance-industry-work.service.js';
import { InventoryService } from './inventory.service.js';
import { GLService } from './gl.service.js';
import type { IndustryProductionRecipeInput } from '@hudumika/types';

export type ProductionInput = IndustryProductionRecipeInput;
async function validateReferences(trx: Transaction<Database>, tenantId: string, input: ProductionInput) {
  const itemIds = [...new Set([input.output_item_id, ...input.materials.map(line => line.item_id)])];
  const items = await trx.selectFrom('inventory_items').select(['id', 'active', 'base_uom', 'is_batch_tracked']).where('tenant_id', '=', tenantId).where('id', 'in', itemIds).execute();
  if (items.length !== itemIds.length || items.some(item => !item.active)) throw new IndustryWorkError('Every production item must be active in this workspace.', 400);
  if (input.materials.some(line => line.item_id === input.output_item_id)) throw new IndustryWorkError('Output cannot also be an input material.', 400);
  const locations = [...new Set([input.source_location_id, input.target_location_id])];
  const found = await trx.selectFrom('inventory_locations').select('id').where('tenant_id', '=', tenantId).where('id', 'in', locations).execute();
  if (found.length !== locations.length) throw new IndustryWorkError('Choose locations in this workspace.', 400);
  const output = items.find(item => item.id === input.output_item_id)!;
  if (output.is_batch_tracked && !input.output_batch) throw new IndustryWorkError('The output item requires a batch.', 400);
  for (const line of input.materials) {
    const item = items.find(item => item.id === line.item_id)!;
    if (item.is_batch_tracked && !line.batch) throw new IndustryWorkError('A tracked material requires a batch.', 400);
    await InventoryService.toBaseQty(trx, tenantId, item.id, item.base_uom, line.quantity, line.unit);
  }
}
export async function createProduction(tenantId: string, actorId: string, workId: string, input: ProductionInput) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (!['manufacturing', 'printing'].includes(work.industry) || !['draft', 'active'].includes(work.status)) throw new IndustryWorkError('Production requires an open manufacturing or printing job.');
    await validateReferences(trx, tenantId, input);
    const { materials, ...order } = input;
    const production = await trx.insertInto('finance_production_orders').values({ ...order, tenant_id: tenantId, work_id: workId, created_by: actorId, actual_quantity: null, released_at: null, completed_at: null }).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto('finance_production_materials').values(materials.map(line => ({ ...line, tenant_id: tenantId, production_id: production.id }))).execute();
    return production;
  });
}
export async function saveProductionRecipe(tenantId: string, actorId: string, name: string, input: ProductionInput) {
  return withTenant(tenantId, async trx => {
    await validateReferences(trx, tenantId, input);
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe:${tenantId}:${name}`}, 0))`.execute(trx);
    const latest = await trx.selectFrom('finance_production_recipes').select('version').where('tenant_id', '=', tenantId).where('name', '=', name).orderBy('version', 'desc').executeTakeFirst();
    return trx.insertInto('finance_production_recipes').values({ tenant_id: tenantId, name, version: (latest?.version ?? 0) + 1, recipe: JSON.stringify(input), created_by: actorId }).returningAll().executeTakeFirstOrThrow();
  });
}
export async function progressProduction(tenantId: string, actorId: string, workId: string, productionId: string, operation: 'release' | 'complete', actualQuantity?: number) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.status !== 'active') throw new IndustryWorkError('Activate the job before running production.');
    const production = await trx.selectFrom('finance_production_orders').selectAll().where('tenant_id', '=', tenantId).where('work_id', '=', workId).where('id', '=', productionId).forUpdate().executeTakeFirst();
    if (!production) throw new IndustryWorkError('Production not found.', 404);
    const materials = await trx.selectFrom('finance_production_materials').selectAll().where('tenant_id', '=', tenantId).where('production_id', '=', productionId).orderBy('item_id').execute();
    // The shared stock ledger remains the only writer; sorted locks avoid deadlocks between recipes.
    const itemIds = [...new Set([production.output_item_id, ...materials.map(line => line.item_id)])].sort();
    await trx.selectFrom('inventory_items').select('id').where('tenant_id', '=', tenantId).where('id', 'in', itemIds).orderBy('id').forUpdate().execute();
    if (operation === 'release') {
      if (production.status !== 'draft') throw new IndustryWorkError('Only draft production can be released.');
      let materialCost = 0;
      for (const line of materials) {
        const movement = await InventoryService.recordMovement(trx, tenantId, { actorId, movementType: 'issue', itemId: line.item_id, fromLocationId: production.source_location_id,
          enteredQty: Number(line.quantity), enteredUom: line.unit, batchNo: line.batch, reference: work.reference, productionId, workId });
        materialCost += Number(movement.total_cost ?? 0);
      }
      if (Number(production.conversion_cost) > 0) await GLService.post(tenantId, {
        entryDate: new Date().toISOString().slice(0, 10), description: `Production conversion costs: ${work.reference}`, sourceModule: 'EXPENSE', sourceId: productionId, createdBy: actorId,
        lines: [{ accountCode: '1310', debit: Number(production.conversion_cost), credit: 0, dimensions: { production_id: productionId, work_id: workId } },
          { accountCode: '2100', debit: 0, credit: Number(production.conversion_cost), dimensions: { production_id: productionId, work_id: workId } }],
      }, trx);
      return trx.updateTable('finance_production_orders').set({ status: 'released', material_cost: materialCost, released_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', productionId).returningAll().executeTakeFirstOrThrow();
    }
    if (production.status !== 'released') throw new IndustryWorkError('Only released production can be completed.');
    if (!actualQuantity || !Number.isFinite(actualQuantity) || actualQuantity <= 0) throw new IndustryWorkError('Enter the actual positive output quantity.', 400);
    const output = await trx.selectFrom('inventory_items').select('base_uom').where('tenant_id', '=', tenantId).where('id', '=', production.output_item_id).executeTakeFirstOrThrow();
    await InventoryService.recordMovement(trx, tenantId, { actorId, movementType: 'receipt', itemId: production.output_item_id, toLocationId: production.target_location_id,
      enteredQty: actualQuantity, enteredUom: output.base_uom, batchNo: production.output_batch, unitCost: (Number(production.material_cost) + Number(production.conversion_cost)) / actualQuantity, reference: work.reference, productionId, workId });
    return trx.updateTable('finance_production_orders').set({ status: 'completed', actual_quantity: actualQuantity, completed_at: new Date() }).where('tenant_id', '=', tenantId).where('id', '=', productionId).returningAll().executeTakeFirstOrThrow();
  });
}
