// Manufacturing P0 (industry-readiness backlog, item 03): progressProduction's
// 'complete' operation used to check only the production order's own status
// — nothing stopped a production with a stage still in_progress, or an
// unreleased quality hold, from being completed and receiving real output
// into sellable stock. This exercises the real HTTP surface end to end
// against a disposable tenant, not a unit mock, to prove the gate actually
// blocks completion and that releasing/completing the stage and inspection
// unblocks it again.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { InventoryService } from '../services/inventory.service.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('Manufacturing production completion gates (quality/stage release)', () => {
  let tenant: TestTenant;
  let customerId: string, outputItemId: string, materialItemId: string, outputProductId: string, materialProductId: string;
  let sourceLocationId: string, targetLocationId: string;

  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object) {
    return (await getApp()).inject({ method, url: `/v1/finance/industries${path}`, headers: authHeaders(tenant.token), ...(payload ? { payload } : {}) });
  }

  beforeAll(async () => {
    tenant = await createTestTenant('FINANCE');
    await withTenant(tenant.tenantId, async trx => {
      await trx.insertInto('tenant_settings').values({
        tenant_id: tenant.tenantId,
        settings: JSON.stringify({
          'enabled-apps': { finops: true, 'finance.manufacturing': true, 'finance.inventory': true, 'finance.accounting.advanced': true },
          company: { currency: 'TZS' },
        }),
      }).execute();
      for (const cap of ['finance.manufacturing', 'finance.inventory', 'finance.accounting.advanced']) {
        await trx.insertInto('tenant_finance_capabilities').values({ tenant_id: tenant.tenantId, capability_key: cap, enabled: true }).execute();
      }
      await GLService.seedChartOfAccounts(trx, tenant.tenantId);

      customerId = (await trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Gate Test Customer' }).returning('id').executeTakeFirstOrThrow()).id;

      const warehouse = await trx.insertInto('inventory_warehouses').values({ tenant_id: tenant.tenantId, name: 'Gate Test WH', code: 'GATE', address: null }).returning('id').executeTakeFirstOrThrow();
      sourceLocationId = (await trx.insertInto('inventory_locations').values({ tenant_id: tenant.tenantId, warehouse_id: warehouse.id, code: 'SRC', name: 'Source' }).returning('id').executeTakeFirstOrThrow()).id;
      targetLocationId = (await trx.insertInto('inventory_locations').values({ tenant_id: tenant.tenantId, warehouse_id: warehouse.id, code: 'TGT', name: 'Target' }).returning('id').executeTakeFirstOrThrow()).id;

      outputProductId = randomUUID(); materialProductId = randomUUID();
      await trx.insertInto('products').values([
        { id: outputProductId, tenant_id: tenant.tenantId, code: 'OUT', name: 'Finished widget', sale_price: 500, currency: 'TZS', type: 'product', track_inventory: true },
        { id: materialProductId, tenant_id: tenant.tenantId, code: 'MAT', name: 'Raw material', sale_price: 50, currency: 'TZS', type: 'product', track_inventory: true },
      ]).execute();
      outputItemId = (await trx.insertInto('inventory_items').values({ tenant_id: tenant.tenantId, sku: 'OUT', name: 'Finished widget', product_id: outputProductId, base_uom: 'EA' }).returning('id').executeTakeFirstOrThrow()).id;
      materialItemId = (await trx.insertInto('inventory_items').values({ tenant_id: tenant.tenantId, sku: 'MAT', name: 'Raw material', product_id: materialProductId, base_uom: 'EA' }).returning('id').executeTakeFirstOrThrow()).id;
      await InventoryService.recordMovement(trx, tenant.tenantId, { actorId: tenant.userId, movementType: 'receipt', itemId: materialItemId, toLocationId: sourceLocationId, enteredQty: 100, enteredUom: 'EA', unitCost: 10 });
    });
  }, 120000);

  afterAll(async () => {
    // finance_industry_work and its production/quality tables don't
    // cascade on tenant deletion (unlike most tenant-scoped tables in this
    // codebase) — clean them up explicitly, children before parents.
    await withTenant(tenant.tenantId, async trx => {
      await trx.deleteFrom('finance_production_traceability').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_production_waste').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_quality_inspections').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_production_stages').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_production_materials').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_production_orders').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_production_recipes').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_industry_work_lines').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_industry_work').where('tenant_id', '=', tenant.tenantId).execute();
    });
    await tenant.cleanup();
  }, 120000);

  async function createActiveWork() {
    const created = await call('POST', '/', { industry: 'manufacturing', name: 'Gate test job', customer_id: customerId, currency: 'TZS' });
    expect(created.statusCode, created.body).toBe(201);
    const workId = created.json().id;
    expect((await call('PATCH', `/${workId}/status`, { status: 'active' })).statusCode).toBe(200);
    return workId;
  }

  function productionPayload(overrides = {}) {
    return {
      output_item_id: outputItemId, source_location_id: sourceLocationId, target_location_id: targetLocationId,
      planned_quantity: 10, materials: [{ item_id: materialItemId, quantity: 10, unit: 'EA' }],
      ...overrides,
    };
  }

  it('blocks completion while a stage from the recipe is still open, then allows it once resolved', async () => {
    const workId = await createActiveWork();
    const recipe = await call('POST', '/recipes', {
      name: `Gate recipe ${randomUUID().slice(0, 8)}`,
      recipe: productionPayload(),
      stages: [{ name: 'Mixing', order: 1 }, { name: 'Curing', order: 2 }],
    });
    expect(recipe.statusCode, recipe.body).toBe(201);

    const created = await call('POST', `/${workId}/production`, { ...productionPayload(), recipe_id: recipe.json().id });
    expect(created.statusCode, created.body).toBe(201);
    const productionId = created.json().id;

    const released = await call('POST', `/${workId}/production/${productionId}/release`);
    expect(released.statusCode, released.body).toBe(200);

    const stages = (await call('GET', `/${workId}/production/${productionId}/stages`)).json();
    expect(stages.map((s: any) => s.status)).toEqual(['pending', 'pending']);

    // Neither stage has even been started — completion must be refused,
    // not silently allowed through.
    const blockedAtStart = await call('POST', `/${workId}/production/${productionId}/complete`, { actual_quantity: 10 });
    expect(blockedAtStart.statusCode).toBe(409);
    expect(blockedAtStart.json().error).toMatch(/Mixing/);

    // Starting but not finishing the first stage still blocks completion.
    expect((await call('POST', `/${workId}/stages/${stages[0].id}/start`)).statusCode).toBe(200);
    const blockedInProgress = await call('POST', `/${workId}/production/${productionId}/complete`, { actual_quantity: 10 });
    expect(blockedInProgress.statusCode).toBe(409);
    expect(blockedInProgress.json().error).toMatch(/Mixing/);

    expect((await call('POST', `/${workId}/stages/${stages[0].id}/complete`, { output_quantity: 10 })).statusCode).toBe(200);
    // Second stage is skipped (a legitimate terminal state), not completed.
    expect((await call('POST', `/${workId}/stages/${stages[1].id}/skip`, { notes: 'Not required for this batch' })).statusCode).toBe(200);

    const completed = await call('POST', `/${workId}/production/${productionId}/complete`, { actual_quantity: 10 });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json().status).toBe('completed');
  });

  it('blocks completion while a quality inspection on the production is pending or on hold, then allows it once released', async () => {
    const workId = await createActiveWork();
    const created = await call('POST', `/${workId}/production`, productionPayload());
    expect(created.statusCode, created.body).toBe(201);
    const productionId = created.json().id;
    expect((await call('POST', `/${workId}/production/${productionId}/release`)).statusCode).toBe(200);

    const inspection = await call('POST', `/${workId}/production/${productionId}/inspections`, {
      inspection_type: 'in_process', item_id: materialItemId, location_id: sourceLocationId, quantity_inspected: 10,
    });
    expect(inspection.statusCode, inspection.body).toBe(201);
    const inspectionId = inspection.json().id;

    // A pending inspection with no result yet blocks completion.
    const blockedPending = await call('POST', `/${workId}/production/${productionId}/complete`, { actual_quantity: 10 });
    expect(blockedPending.statusCode).toBe(409);
    expect(blockedPending.json().error).toMatch(/pending/i);

    // A failed result puts it on hold — still blocked.
    expect((await call('POST', `/${workId}/inspections/${inspectionId}/result`, { quantity_passed: 8, quantity_failed: 2 })).statusCode).toBe(200);
    const blockedHold = await call('POST', `/${workId}/production/${productionId}/complete`, { actual_quantity: 10 });
    expect(blockedHold.statusCode).toBe(409);
    expect(blockedHold.json().error).toMatch(/quality hold/i);

    // Releasing the hold finally unblocks completion.
    expect((await call('POST', `/${workId}/inspections/${inspectionId}/release`, { notes: 'Reviewed and accepted' })).statusCode).toBe(200);
    const completed = await call('POST', `/${workId}/production/${productionId}/complete`, { actual_quantity: 10 });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json().status).toBe('completed');
  });
});
