import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { getIndustryWork, IndustryWorkError } from './finance-industry-work.service.js';
import { InventoryService } from './inventory.service.js';

export async function allocateStock(tenantId: string, actorId: string, workId: string, input: { item_id: string; location_id: string; batch: string; quantity: number }) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (!['retail', 'wholesale', 'warehousing', 'manufacturing', 'printing'].includes(work.industry) || work.status !== 'active') throw new IndustryWorkError('Allocation requires an active goods or warehouse job.');
    const item = await trx.selectFrom('inventory_items').select(['id', 'active', 'is_batch_tracked']).where('tenant_id', '=', tenantId).where('id', '=', input.item_id).forUpdate().executeTakeFirst();
    const location = await trx.selectFrom('inventory_locations').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.location_id).executeTakeFirst();
    if (!item?.active || !location) throw new IndustryWorkError('Choose an active item and location in this workspace.', 400);
    if (item.is_batch_tracked && !input.batch) throw new IndustryWorkError('This item requires a batch.', 400);
    const stock = await trx.selectFrom('inventory_stock_levels').select('qty_on_hand').where('tenant_id', '=', tenantId).where('item_id', '=', input.item_id).where('location_id', '=', input.location_id).where('batch_no', '=', input.batch).executeTakeFirst();
    const reserved = await trx.selectFrom('finance_stock_allocations').select(eb => eb.fn.sum<number>(sql<number>`quantity - dispatched_quantity`).as('qty'))
      .where('tenant_id', '=', tenantId).where('item_id', '=', input.item_id).where('location_id', '=', input.location_id).where('batch', '=', input.batch).where('released', '=', false).executeTakeFirst();
    if (Number(stock?.qty_on_hand ?? 0) - Number(reserved?.qty ?? 0) < input.quantity) throw new IndustryWorkError('Insufficient unreserved stock.');
    return trx.insertInto('finance_stock_allocations').values({ ...input, tenant_id: tenantId, work_id: workId, created_by: actorId }).returningAll().executeTakeFirstOrThrow();
  });
}
export async function dispatchAllocation(tenantId: string, actorId: string, workId: string, allocationId: string, quantity: number) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.status !== 'active') throw new IndustryWorkError('Dispatch requires active work.');
    const allocation = await trx.selectFrom('finance_stock_allocations').selectAll().where('tenant_id', '=', tenantId).where('work_id', '=', workId).where('id', '=', allocationId).forUpdate().executeTakeFirst();
    if (!allocation || allocation.released) throw new IndustryWorkError('Allocation not found.', 404);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(allocation.quantity) - Number(allocation.dispatched_quantity)) throw new IndustryWorkError('Dispatch must fit the remaining allocated quantity.', 400);
    const item = await trx.selectFrom('inventory_items').select('base_uom').where('tenant_id', '=', tenantId).where('id', '=', allocation.item_id).forUpdate().executeTakeFirstOrThrow();
    const updated = await trx.updateTable('finance_stock_allocations').set({ dispatched_quantity: Number(allocation.dispatched_quantity) + quantity })
      .where('tenant_id', '=', tenantId).where('id', '=', allocationId).returningAll().executeTakeFirstOrThrow();
    await InventoryService.recordMovement(trx, tenantId, { actorId, movementType: 'issue', itemId: allocation.item_id, fromLocationId: allocation.location_id,
      enteredQty: quantity, enteredUom: item.base_uom, batchNo: allocation.batch, reference: work.reference, workId });
    return updated;
  });
}

export async function releaseAllocation(tenantId: string, workId: string, allocationId: string) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (work.status !== 'active') throw new IndustryWorkError('Release requires active work.');
    const allocation = await trx.selectFrom('finance_stock_allocations').selectAll().where('tenant_id', '=', tenantId).where('work_id', '=', workId).where('id', '=', allocationId).forUpdate().executeTakeFirst();
    if (!allocation || allocation.released) throw new IndustryWorkError('Allocation not found or already released.', 409);
    await trx.selectFrom('inventory_items').select('id').where('tenant_id', '=', tenantId).where('id', '=', allocation.item_id).forUpdate().executeTakeFirstOrThrow();
    // Release only the unshipped reservation; dispatched stock and its COGS remain posted.
    return trx.updateTable('finance_stock_allocations').set({ released: true }).where('tenant_id', '=', tenantId).where('id', '=', allocationId).returningAll().executeTakeFirstOrThrow();
  });
}
