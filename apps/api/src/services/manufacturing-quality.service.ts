import { sql, type Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { IndustryWorkError } from './finance-industry-work.service.js';
import { GLService } from './gl.service.js';
import { InventoryService } from './inventory.service.js';

// ── Quality inspections ───────────────────────────────────────────────

export type InspectionInput = {
  inspection_type: 'incoming' | 'in_process' | 'final';
  production_id?: string;
  item_id: string;
  location_id: string;
  batch_no?: string;
  quantity_inspected: number;
};

export async function createInspection(tenantId: string, actorId: string, input: InspectionInput) {
  return withTenant(tenantId, async trx => {
    const item = await trx.selectFrom('inventory_items').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.item_id).executeTakeFirst();
    if (!item) throw new IndustryWorkError('Item not found.', 404);
    const loc = await trx.selectFrom('inventory_locations').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.location_id).executeTakeFirst();
    if (!loc) throw new IndustryWorkError('Location not found.', 404);
    if (input.production_id) {
      const prod = await trx.selectFrom('finance_production_orders').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.production_id).executeTakeFirst();
      if (!prod) throw new IndustryWorkError('Production order not found.', 404);
    }
    return trx.insertInto('finance_quality_inspections').values({
      tenant_id: tenantId,
      inspection_type: input.inspection_type,
      production_id: input.production_id || null,
      item_id: input.item_id,
      location_id: input.location_id,
      batch_no: input.batch_no || '',
      quantity_inspected: input.quantity_inspected,
      created_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export type InspectionResultInput = {
  quantity_passed: number;
  quantity_failed: number;
  disposition?: string;
};

export async function recordInspectionResult(tenantId: string, actorId: string, inspectionId: string, input: InspectionResultInput) {
  return withTenant(tenantId, async trx => {
    const insp = await trx.selectFrom('finance_quality_inspections').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', inspectionId).forUpdate().executeTakeFirst();
    if (!insp) throw new IndustryWorkError('Inspection not found.', 404);
    if (insp.status !== 'pending') throw new IndustryWorkError('Only pending inspections can receive results.');

    if (input.quantity_passed + input.quantity_failed > Number(insp.quantity_inspected)) {
      throw new IndustryWorkError('Passed + failed cannot exceed quantity inspected.', 400);
    }

    const failed = input.quantity_failed > 0;
    const status = failed ? 'on_hold' : 'passed';

    const updated = await trx.updateTable('finance_quality_inspections').set({
      quantity_passed: input.quantity_passed,
      quantity_failed: input.quantity_failed,
      disposition: input.disposition || null,
      status,
      inspector_id: actorId,
      inspected_at: new Date(),
      hold_reason: failed ? `${input.quantity_failed} units failed inspection` : null,
      updated_at: new Date(),
    }).where('id', '=', inspectionId).returningAll().executeTakeFirstOrThrow();

    if (failed) {
      await trx.updateTable('finance_stock_allocations').set({ quality_hold: true })
        .where('tenant_id', '=', tenantId)
        .where('item_id', '=', insp.item_id)
        .where('batch', '=', insp.batch_no)
        .where('released', '=', false)
        .execute();
    }

    return updated;
  });
}

export async function releaseQualityHold(tenantId: string, actorId: string, inspectionId: string, releaseNotes: string) {
  return withTenant(tenantId, async trx => {
    const insp = await trx.selectFrom('finance_quality_inspections').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', inspectionId).forUpdate().executeTakeFirst();
    if (!insp) throw new IndustryWorkError('Inspection not found.', 404);
    if (insp.status !== 'on_hold' && insp.status !== 'failed') throw new IndustryWorkError('Only held or failed inspections can be released.');

    const updated = await trx.updateTable('finance_quality_inspections').set({
      status: 'released',
      released_by: actorId,
      released_at: new Date(),
      release_notes: releaseNotes,
      updated_at: new Date(),
    }).where('id', '=', inspectionId).returningAll().executeTakeFirstOrThrow();

    await trx.updateTable('finance_stock_allocations').set({ quality_hold: false })
      .where('tenant_id', '=', tenantId)
      .where('item_id', '=', insp.item_id)
      .where('batch', '=', insp.batch_no)
      .where('released', '=', false)
      .execute();

    return updated;
  });
}

// ── Production stages ─────────────────────────────────────────────────

export type StageTemplate = { name: string; order: number; expected_duration_minutes?: number };

export async function initStagesFromRecipe(trx: Transaction<Database>, tenantId: string, productionId: string, stages: StageTemplate[]) {
  if (!stages.length) return [];
  return trx.insertInto('finance_production_stages').values(
    stages.map(s => ({
      tenant_id: tenantId,
      production_id: productionId,
      stage_name: s.name,
      stage_order: s.order,
    }))
  ).returningAll().execute();
}

export async function progressStage(tenantId: string, actorId: string, stageId: string, operation: 'start' | 'complete' | 'skip', data?: { output_quantity?: number; notes?: string }) {
  return withTenant(tenantId, async trx => {
    const stage = await trx.selectFrom('finance_production_stages').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', stageId).forUpdate().executeTakeFirst();
    if (!stage) throw new IndustryWorkError('Stage not found.', 404);

    if (operation === 'start') {
      if (stage.status !== 'pending') throw new IndustryWorkError('Only pending stages can be started.');
      return trx.updateTable('finance_production_stages').set({
        status: 'in_progress', operator_id: actorId, started_at: new Date(),
      }).where('id', '=', stageId).returningAll().executeTakeFirstOrThrow();
    }
    if (operation === 'skip') {
      if (stage.status !== 'pending') throw new IndustryWorkError('Only pending stages can be skipped.');
      return trx.updateTable('finance_production_stages').set({
        status: 'skipped', operator_id: actorId, notes: data?.notes || null,
      }).where('id', '=', stageId).returningAll().executeTakeFirstOrThrow();
    }
    if (stage.status !== 'in_progress') throw new IndustryWorkError('Only in-progress stages can be completed.');
    return trx.updateTable('finance_production_stages').set({
      status: 'completed', completed_at: new Date(),
      output_quantity: data?.output_quantity ?? null,
      notes: data?.notes || null,
    }).where('id', '=', stageId).returningAll().executeTakeFirstOrThrow();
  });
}

// ── Waste and rework ──────────────────────────────────────────────────

export type WasteInput = {
  production_id: string;
  stage_id?: string;
  item_id: string;
  waste_type: 'normal_loss' | 'abnormal_loss' | 'rework' | 'scrap';
  quantity: number;
  unit: string;
  reason: string;
  is_recoverable?: boolean;
  disposition?: string;
};

export async function recordWaste(tenantId: string, actorId: string, workId: string, input: WasteInput) {
  return withTenant(tenantId, async trx => {
    const production = await trx.selectFrom('finance_production_orders').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', input.production_id).executeTakeFirst();
    if (!production) throw new IndustryWorkError('Production order not found.', 404);
    if (production.status === 'draft') throw new IndustryWorkError('Release the production order before recording waste.');

    const item = await trx.selectFrom('inventory_items').select(['id', 'base_uom']).where('tenant_id', '=', tenantId).where('id', '=', input.item_id).executeTakeFirst();
    if (!item) throw new IndustryWorkError('Item not found.', 404);

    const baseQty = await InventoryService.toBaseQty(trx, tenantId, item.id, item.base_uom, input.quantity, input.unit);
    const avgCost = await getAvgCost(trx, tenantId, item.id);
    const costAmount = Math.round(baseQty * avgCost * 100) / 100;

    const waste = await trx.insertInto('finance_production_waste').values({
      tenant_id: tenantId,
      production_id: input.production_id,
      stage_id: input.stage_id || null,
      item_id: input.item_id,
      waste_type: input.waste_type,
      quantity: input.quantity,
      unit: input.unit,
      reason: input.reason,
      is_recoverable: input.is_recoverable ?? false,
      disposition: input.disposition || null,
      cost_amount: costAmount,
      recorded_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();

    const accountCode = input.waste_type === 'normal_loss' ? '5210' : '5211';
    await GLService.post(tenantId, {
      entryDate: new Date().toISOString().slice(0, 10),
      description: `Production waste (${input.waste_type}): ${input.reason}`,
      sourceModule: 'EXPENSE', sourceId: waste.id, createdBy: actorId,
      lines: [
        { accountCode, debit: costAmount, credit: 0, dimensions: { production_id: input.production_id, work_id: workId } },
        { accountCode: '1310', debit: 0, credit: costAmount, dimensions: { production_id: input.production_id, work_id: workId } },
      ],
    }, trx);

    return waste;
  });
}

async function getAvgCost(trx: Transaction<Database>, tenantId: string, itemId: string): Promise<number> {
  const row = await trx.selectFrom('inventory_movements')
    .select(sql<number>`COALESCE(SUM(total_cost) / NULLIF(SUM(CASE WHEN movement_type IN ('receipt','return') THEN base_qty ELSE 0 END), 0), 0)`.as('avg'))
    .where('tenant_id', '=', tenantId).where('item_id', '=', itemId).executeTakeFirst();
  return Number(row?.avg ?? 0);
}

// ── Traceability ──────────────────────────────────────────────────────

export type TraceabilityInput = {
  production_id: string;
  input_item_id: string;
  input_batch_no: string;
  input_quantity: number;
  output_item_id: string;
  output_batch_no: string;
};

export async function recordTraceabilityLink(tenantId: string, input: TraceabilityInput) {
  return withTenant(tenantId, async trx => {
    return trx.insertInto('finance_production_traceability').values({
      tenant_id: tenantId,
      production_id: input.production_id,
      input_item_id: input.input_item_id,
      input_batch_no: input.input_batch_no || '',
      input_quantity: input.input_quantity,
      output_item_id: input.output_item_id,
      output_batch_no: input.output_batch_no || '',
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function traceForward(tenantId: string, itemId: string, batchNo: string) {
  return withTenant(tenantId, async trx => {
    return trx.selectFrom('finance_production_traceability')
      .innerJoin('finance_production_orders', join =>
        join.onRef('finance_production_orders.id', '=', 'finance_production_traceability.production_id')
          .onRef('finance_production_orders.tenant_id', '=', 'finance_production_traceability.tenant_id'))
      .where('finance_production_traceability.tenant_id', '=', tenantId)
      .where('finance_production_traceability.input_item_id', '=', itemId)
      .where('finance_production_traceability.input_batch_no', '=', batchNo)
      .select([
        'finance_production_traceability.id',
        'finance_production_traceability.production_id',
        'finance_production_traceability.output_item_id',
        'finance_production_traceability.output_batch_no',
        'finance_production_traceability.input_quantity',
        'finance_production_orders.status as production_status',
      ])
      .execute();
  });
}

export async function traceBackward(tenantId: string, itemId: string, batchNo: string) {
  return withTenant(tenantId, async trx => {
    return trx.selectFrom('finance_production_traceability')
      .innerJoin('finance_production_orders', join =>
        join.onRef('finance_production_orders.id', '=', 'finance_production_traceability.production_id')
          .onRef('finance_production_orders.tenant_id', '=', 'finance_production_traceability.tenant_id'))
      .where('finance_production_traceability.tenant_id', '=', tenantId)
      .where('finance_production_traceability.output_item_id', '=', itemId)
      .where('finance_production_traceability.output_batch_no', '=', batchNo)
      .select([
        'finance_production_traceability.id',
        'finance_production_traceability.production_id',
        'finance_production_traceability.input_item_id',
        'finance_production_traceability.input_batch_no',
        'finance_production_traceability.input_quantity',
        'finance_production_orders.status as production_status',
      ])
      .execute();
  });
}
