import { sql } from 'kysely';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { GLService } from './gl.service.js';

const COGS_ACCOUNT = '5010';
const INVENTORY_ASSET_ACCOUNT = '1300';

// Inventory Control's stock ledger — mirrors SealService.recordMovement's
// discipline (ledger insert + projection update, always in the same
// transaction) but deliberately without a hash chain, which is specific to
// SEAL's customs regulatory audit requirement. This is the *only* function
// allowed to write to inventory_stock_levels; the projection must never be
// mutated any other way.

export class UnknownUom extends Error {
  constructor(public uomCode: string) {
    super(`This item has no registered unit of measure "${uomCode}" — add a conversion factor for it first, or enter the quantity in its base unit.`);
    this.name = 'UnknownUom';
  }
}

export class InvalidMovement extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMovement';
  }
}

export interface RecordMovementInput {
  actorId: string | null;
  actorType?: 'user' | 'system' | 'api_client';
  movementType: 'receipt' | 'issue' | 'transfer' | 'adjust' | 'count_correction';
  itemId: string;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  enteredQty: number;
  enteredUom: string;
  batchNo?: string | null;
  expiryDate?: string | null;
  reasonCode?: string | null;
  reference?: string | null;
  /** Only meaningful on a 'receipt' — omit to leave the item's
   *  weighted-average cost unchanged (e.g. a transfer or correction). */
  unitCost?: number | null;
}

export class InventoryService {
  /** Resolves an entered quantity/UOM to the item's canonical base_uom,
   *  looking up the conversion factor from inventory_item_uoms unless the
   *  entered UOM already IS the base unit (factor 1, no lookup needed). */
  static async toBaseQty(trx: Transaction<Database>, tenantId: string, itemId: string, baseUom: string, enteredQty: number, enteredUom: string): Promise<number> {
    if (enteredUom === baseUom) return enteredQty;
    const conv = await trx.selectFrom('inventory_item_uoms').select('conversion_factor')
      .where('tenant_id', '=', tenantId).where('item_id', '=', itemId).where('uom_code', '=', enteredUom).executeTakeFirst();
    if (!conv) throw new UnknownUom(enteredUom);
    return enteredQty * Number(conv.conversion_factor);
  }

  static async recordMovement(trx: Transaction<Database>, tenantId: string, input: RecordMovementInput) {
    const item = await trx.selectFrom('inventory_items').select(['id', 'base_uom', 'is_batch_tracked', 'avg_cost'])
      .where('id', '=', input.itemId).executeTakeFirst();
    if (!item) throw new InvalidMovement(`Item not found: ${input.itemId}`);

    const batchNo = (input.batchNo?.trim() || '');
    if (item.is_batch_tracked && !batchNo) {
      throw new InvalidMovement('This item is batch/lot-tracked — a batch number is required.');
    }

    const baseQty = await InventoryService.toBaseQty(trx, tenantId, input.itemId, item.base_uom, input.enteredQty, input.enteredUom);

    let qtyDelta: number;
    let fromLocationId: string | null = null;
    let toLocationId: string | null = null;

    switch (input.movementType) {
      case 'receipt':
        if (!input.toLocationId) throw new InvalidMovement('A receipt requires a destination location.');
        qtyDelta = baseQty;
        toLocationId = input.toLocationId;
        break;
      case 'issue':
        if (!input.fromLocationId) throw new InvalidMovement('An issue requires a source location.');
        qtyDelta = -baseQty;
        fromLocationId = input.fromLocationId;
        break;
      case 'transfer':
        if (!input.fromLocationId || !input.toLocationId) throw new InvalidMovement('A transfer requires both a source and destination location.');
        if (input.fromLocationId === input.toLocationId) throw new InvalidMovement('A transfer must move stock to a different location.');
        qtyDelta = baseQty;
        fromLocationId = input.fromLocationId;
        toLocationId = input.toLocationId;
        break;
      case 'adjust':
      case 'count_correction':
        if (!input.toLocationId) throw new InvalidMovement('An adjustment requires the location being corrected.');
        qtyDelta = baseQty; // signed — caller passes a positive or negative enteredQty directly
        toLocationId = input.toLocationId;
        break;
      default:
        throw new InvalidMovement(`Unknown movement type: ${input.movementType}`);
    }

    // Weighted-average costing — recomputed on 'receipt' (a new average
    // blending what's already on hand with what's arriving), read
    // unchanged on 'issue' (COGS = qty x the average as it stood at that
    // moment, not recomputed later). Nothing else moves the average: a
    // transfer/adjust/count_correction changes location or quantity, not
    // what was paid for it.
    let unitCost: number | null = null;
    let totalCost: number | null = null;
    let newAvgCost: number | null = null;
    if (input.movementType === 'receipt' && input.unitCost != null && input.unitCost >= 0) {
      unitCost = input.unitCost;
      const onHandRow = await trx.selectFrom('inventory_stock_levels')
        .select(({ fn }) => fn.coalesce(fn.sum<string>('qty_on_hand'), sql.lit('0')).as('total'))
        .where('item_id', '=', input.itemId).executeTakeFirst();
      const currentQty = Number(onHandRow?.total ?? 0);
      const currentAvg = Number(item.avg_cost);
      const newTotalQty = currentQty + baseQty;
      newAvgCost = newTotalQty > 0 ? (currentQty * currentAvg + baseQty * unitCost) / newTotalQty : unitCost;
      newAvgCost = Math.round(newAvgCost * 10000) / 10000;
    } else if (input.movementType === 'issue') {
      totalCost = Math.round(baseQty * Number(item.avg_cost) * 100) / 100;
    }

    const movement = await trx.insertInto('inventory_movements').values({
      tenant_id: tenantId,
      unit_cost: unitCost,
      total_cost: totalCost,
      actor_id: input.actorId,
      actor_type: input.actorType ?? 'user',
      movement_type: input.movementType,
      item_id: input.itemId,
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      qty_delta: String(qtyDelta),
      entered_qty: String(input.enteredQty),
      entered_uom: input.enteredUom,
      batch_no: batchNo,
      expiry_date: input.expiryDate ? new Date(input.expiryDate) : null,
      reason_code: input.reasonCode ?? null,
      reference: input.reference ?? null,
    }).returningAll().executeTakeFirstOrThrow();

    async function applyDelta(locationId: string, delta: number) {
      await trx.insertInto('inventory_stock_levels').values({
        tenant_id: tenantId, item_id: input.itemId, location_id: locationId, batch_no: batchNo,
        expiry_date: input.expiryDate ? new Date(input.expiryDate) : null,
        qty_on_hand: String(delta),
      }).onConflict(oc => oc.columns(['item_id', 'location_id', 'batch_no']).doUpdateSet({
        qty_on_hand: sql`inventory_stock_levels.qty_on_hand + ${delta}`,
        expiry_date: sql`COALESCE(excluded.expiry_date, inventory_stock_levels.expiry_date)`,
        updated_at: new Date(),
      })).execute();
    }

    if (input.movementType === 'transfer') {
      await applyDelta(fromLocationId!, -baseQty);
      await applyDelta(toLocationId!, baseQty);
    } else if (toLocationId) {
      await applyDelta(toLocationId, qtyDelta);
    } else if (fromLocationId) {
      await applyDelta(fromLocationId, qtyDelta);
    }

    if (newAvgCost != null) {
      await trx.updateTable('inventory_items').set({ avg_cost: newAvgCost, updated_at: new Date() }).where('id', '=', input.itemId).execute();
    } else if (totalCost != null && totalCost > 0) {
      // COGS at the average cost as it stood the moment stock left —
      // same idempotency non-issue as cost-posting.service.ts's demurrage
      // posting: each movement posts exactly once, at creation, never re-run.
      await GLService.post(tenantId, {
        entryDate: new Date().toISOString().slice(0, 10),
        description: `COGS: issue of ${baseQty} ${item.base_uom}`,
        // inventory_movements.id is a BIGSERIAL, not a UUID —
        // journal_entries.source_id is UUID-typed, so the movement's own id
        // can't be passed there directly (confirmed live: posting failed
        // with "invalid input syntax for type uuid"). No idempotency check
        // currently needs to look this posting back up by source_id (unlike
        // demurrage/payroll), so it's left unset rather than forcing a
        // mismatched type in.
        reference: String(movement.id),
        sourceModule: 'EXPENSE',
        createdBy: input.actorId ?? undefined,
        lines: [
          { accountCode: COGS_ACCOUNT, debit: totalCost, credit: 0, description: 'Cost of goods sold' },
          { accountCode: INVENTORY_ASSET_ACCOUNT, debit: 0, credit: totalCost, description: 'Inventory reduced' },
        ],
      });
    }

    return movement;
  }
}
