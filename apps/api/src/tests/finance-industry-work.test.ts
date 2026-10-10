import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { GLService } from '../services/gl.service.js';
import { InventoryService } from '../services/inventory.service.js';

describe('Industry accounting workflows', () => {
  let tenant: TestTenant; let other: TestTenant; let customerId: string; let otherCustomerId: string;
  let inputItem: string; let outputItem: string; let location: string;
  beforeAll(async () => {
    await getApp(); tenant = await createTestTenant(); other = await createTestTenant();
    await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { finops: true, 'finance.inventory': true, 'finance.accounting.advanced': true } }) as any }).execute();
    await withTenant(tenant.tenantId, async trx => {
      await GLService.seedChartOfAccounts(trx, tenant.tenantId);
      await trx.insertInto('tenant_finance_capabilities').values(['finance.inventory', 'finance.accounting.advanced'].map(capability_key => ({ tenant_id: tenant.tenantId, capability_key, enabled: true }))).execute();
      customerId = (await trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Industry Customer' }).returning('id').executeTakeFirstOrThrow()).id;
      const warehouse = await trx.insertInto('inventory_warehouses').values({ tenant_id: tenant.tenantId, name: 'Factory', code: 'FACTORY', address: null }).returning('id').executeTakeFirstOrThrow();
      location = (await trx.insertInto('inventory_locations').values({ tenant_id: tenant.tenantId, warehouse_id: warehouse.id, code: 'BIN', name: 'Bin' }).returning('id').executeTakeFirstOrThrow()).id;
      inputItem = (await trx.insertInto('inventory_items').values({ tenant_id: tenant.tenantId, sku: 'RAW', name: 'Raw', base_uom: 'EA', product_id: null, reorder_point: null, reorder_qty: null }).returning('id').executeTakeFirstOrThrow()).id;
      outputItem = (await trx.insertInto('inventory_items').values({ tenant_id: tenant.tenantId, sku: 'OUTPUT', name: 'Output', base_uom: 'EA', product_id: null, reorder_point: null, reorder_qty: null }).returning('id').executeTakeFirstOrThrow()).id;
      await InventoryService.recordMovement(trx, tenant.tenantId, { actorId: tenant.userId, movementType: 'receipt', itemId: inputItem, toLocationId: location, enteredQty: 100, enteredUom: 'EA', unitCost: 10 });
    });
    otherCustomerId = (await withTenant(other.tenantId, trx => trx.insertInto('customers').values({ tenant_id: other.tenantId, name: 'Other customer' }).returning('id').executeTakeFirstOrThrow())).id;
  }, 120000);
  afterAll(async () => {
    for (const current of [tenant, other].filter(Boolean)) {
      await withTenant(current.tenantId, async trx => {
        await trx.updateTable('sales_invoices').set({ industry_work_id: null }).where('tenant_id', '=', current.tenantId).execute();
        for (const table of ['finance_work_cost_allocations', 'finance_production_recipes', 'finance_stock_allocations', 'finance_production_materials', 'finance_production_orders', 'finance_industry_work_lines', 'finance_industry_work'] as const) await trx.deleteFrom(table).where('tenant_id', '=', current.tenantId).execute();
      });
      await current.cleanup();
    }
  }, 120000);
  async function request(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
    return (await getApp()).inject({ method, url, headers: authHeaders(tenant.token), payload });
  }
  async function work(industry: string) {
    const result = await request('POST', '/v1/finance/industries', { industry, name: 'Test work', customer_id: customerId });
    expect(result.statusCode, result.body).toBe(201); return result.json();
  }
  async function activate(id: string) { expect((await request('PATCH', `/v1/finance/industries/${id}/status`, { status: 'active' })).statusCode).toBe(200); }
  it('rejects cross-tenant customer IDs and invalid dates', async () => {
    expect((await request('POST', '/v1/finance/industries', { industry: 'consulting', name: 'Leak', customer_id: otherCustomerId })).statusCode).toBe(400);
    expect((await request('POST', '/v1/finance/industries', { industry: 'consulting', name: 'Bad date', customer_id: customerId, due_date: '2026-02-30' })).statusCode).toBe(400);
  });
  it('creates construction projects with site and contract details', async () => {
    const result = await request('POST', '/v1/finance/industries', {
      industry: 'construction',
      name: 'Community clinic build',
      customer_id: customerId,
      budget: 250000000,
      due_date: '2027-06-30',
      specifications: {
        'Site Address': 'Plot 42, Dodoma',
        'Contract / BOQ Reference': 'BOQ-2026-014',
        'Project Manager': 'Asha Mushi',
        'Retention Terms': '10% for 180 days',
        'Defects Liability Period': '12 months',
      },
    });
    expect(result.statusCode, result.body).toBe(201);
    expect(result.json()).toMatchObject({ industry: 'construction', name: 'Community clinic build' });
    const detail = await request('GET', `/v1/finance/industries/${result.json().id}`);
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().specifications).toMatchObject({
      'Contract / BOQ Reference': 'BOQ-2026-014',
      'Retention Terms': '10% for 180 days',
    });
  });
  it('allocates posted costs once without changing company profit and reverses with the source', async () => {
    const job = await work('consulting'); await activate(job.id);
    const journalId = await GLService.post(tenant.tenantId, { entryDate: '2026-10-07', description: 'Payroll cost', createdBy: tenant.userId, sourceModule: 'MANUAL', lines: [{ accountCode: '5020', debit: 100, credit: 0 }, { accountCode: '2100', debit: 0, credit: 100 }] });
    const source = await withTenant(tenant.tenantId, trx => trx.selectFrom('journal_lines').select('id').where('journal_entry_id', '=', journalId).where('debit', '>', 0).executeTakeFirstOrThrow());
    const allocation = { source_journal_line_id: source.id, amount: 75, reason: 'Client delivery' };
    const results = await Promise.all([request('POST', `/v1/finance/industries/${job.id}/costs`, allocation), request('POST', `/v1/finance/industries/${job.id}/costs`, allocation)]);
    expect(results.map(result => result.statusCode).sort()).toEqual([201, 409]);
    expect(Number((await request('GET', `/v1/finance/industries/${job.id}`)).json().posted_cost)).toBe(75);
    const allocated = results.find(result => result.statusCode === 201)!.json();
    const neutral = await withTenant(tenant.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', allocated.allocation_journal_id).execute());
    expect(neutral.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0)).toBe(0);
    await withTenant(other.tenantId, trx => GLService.seedChartOfAccounts(trx, other.tenantId));
    const otherJournal = await GLService.post(other.tenantId, { entryDate: '2026-10-07', description: 'Other cost', sourceModule: 'MANUAL', lines: [{ accountCode: '5020', debit: 50, credit: 0 }, { accountCode: '2100', debit: 0, credit: 50 }] });
    const foreignLine = await withTenant(other.tenantId, trx => trx.selectFrom('journal_lines').select('id').where('journal_entry_id', '=', otherJournal).where('debit', '>', 0).executeTakeFirstOrThrow());
    expect((await request('POST', `/v1/finance/industries/${job.id}/costs`, { ...allocation, source_journal_line_id: foreignLine.id, amount: 1 })).statusCode).toBe(404);
    await GLService.voidEntry(tenant.tenantId, journalId, tenant.userId, 'Correct payroll');
    expect(Number((await request('GET', `/v1/finance/industries/${job.id}`)).json().posted_cost)).toBe(0);
    expect((await request('GET', `/v1/finance/industries/${job.id}/costs`)).json().allocations.find((item: { id: string }) => item.id === allocated.id).reversed_at).toBeTruthy();
    expect((await request('POST', `/v1/finance/industries/${job.id}/costs`, allocation)).statusCode).toBe(409);
  }, 120000);
  it('bills only approved lines and reserves them against duplicate/concurrent billing', async () => {
    const job = await work('professional_services'); await activate(job.id);
    const line = await request('POST', `/v1/finance/industries/${job.id}/lines`, { kind: 'time', description: 'Advice', quantity: 2, unit: 'hours', rate: 100, cost_rate: 40, work_date: '2026-10-07' });
    expect(line.statusCode, line.body).toBe(201);
    const correction = { kind: 'time', description: 'Advice', quantity: 2, unit: 'hours', rate: 100, cost_rate: 40, work_date: '2026-10-07' };
    expect((await request('PATCH', `/v1/finance/industries/${job.id}/lines/${line.json().id}`, correction)).statusCode).toBe(200);
    expect((await request('POST', '/v1/invoices', { industry_work_id: job.id })).statusCode).toBe(409);
    expect((await request('POST', `/v1/finance/industries/${job.id}/lines/${line.json().id}/approve`)).statusCode).toBe(200);
    expect((await request('PATCH', `/v1/finance/industries/${job.id}/lines/${line.json().id}`, { ...correction, rate: 9999 })).statusCode).toBe(409);
    const results = await Promise.all([request('POST', '/v1/invoices', { industry_work_id: job.id, status: 'Unpaid', items: [{ name: 'Forged', rate: 9999 }] }), request('POST', '/v1/invoices', { industry_work_id: job.id })]);
    expect(results.map(result => result.statusCode).sort()).toEqual([201, 409]);
    const invoice = results.find(result => result.statusCode === 201)!.json(); expect(invoice.status).toBe('Draft');
    expect((await request('PATCH', `/v1/invoices/${invoice.id}`, { items: [{ name: 'Advice', rate: 9999, qty: 2 }] })).statusCode).toBe(409);
    const lines = await withTenant(tenant.tenantId, trx => trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', invoice.id).execute());
    expect(lines[0].name).toBe('Advice'); expect(Number(lines[0].rate)).toBe(100);
    expect((await request('PATCH', `/v1/finance/industries/${job.id}/status`, { status: 'cancelled' })).statusCode).toBe(409);
  }, 120000);
  it('capitalises materials and conversion into WIP and receives yield once', async () => {
    const job = await work('manufacturing'); await activate(job.id);
    const created = await request('POST', `/v1/finance/industries/${job.id}/production`, { output_item_id: outputItem, source_location_id: location, target_location_id: location, planned_quantity: 5, conversion_cost: 20, materials: [{ item_id: inputItem, quantity: 10, unit: 'EA' }] });
    expect(created.statusCode, created.body).toBe(201); const productionId = created.json().id;
    const released = await request('POST', `/v1/finance/industries/${job.id}/production/${productionId}/release`, {});
    expect(released.statusCode, released.body).toBe(200); expect(Number(released.json().material_cost)).toBe(100);
    expect((await request('POST', `/v1/finance/industries/${job.id}/production/${productionId}/release`, {})).statusCode).toBe(409);
    expect((await request('POST', `/v1/finance/industries/${job.id}/production/${productionId}/complete`, { actual_quantity: 4 })).statusCode).toBe(200);
    const item = await withTenant(tenant.tenantId, trx => trx.selectFrom('inventory_items').select('avg_cost').where('tenant_id', '=', tenant.tenantId).where('id', '=', outputItem).executeTakeFirstOrThrow()); expect(Number(item.avg_cost)).toBe(30);
    expect((await request('POST', `/v1/finance/industries/${job.id}/production/${productionId}/complete`, { actual_quantity: 4 })).statusCode).toBe(409);
  });
  it('protects reserved stock and allows partial dispatch', async () => {
    const job = await work('wholesale'); await activate(job.id);
    const allocation = await request('POST', `/v1/finance/industries/${job.id}/allocations`, { item_id: inputItem, location_id: location, quantity: 80 });
    expect(allocation.statusCode, allocation.body).toBe(201);
    const otherJob = await work('wholesale'); await activate(otherJob.id);
    expect((await request('POST', `/v1/finance/industries/${otherJob.id}/allocations`, { item_id: inputItem, location_id: location, quantity: 20 })).statusCode).toBe(409);
    await expect(withTenant(tenant.tenantId, trx => InventoryService.recordMovement(trx, tenant.tenantId, { actorId: tenant.userId, movementType: 'issue', itemId: inputItem, fromLocationId: location, enteredQty: 20, enteredUom: 'EA' }))).rejects.toThrow('unreserved');
    const dispatch = await request('POST', `/v1/finance/industries/${job.id}/allocations/${allocation.json().id}/dispatch`, { quantity: 30 }); expect(dispatch.statusCode, dispatch.body).toBe(200); expect(Number(dispatch.json().dispatched_quantity)).toBe(30);
    expect((await request('PATCH', `/v1/finance/industries/${job.id}/status`, { status: 'completed' })).statusCode).toBe(409);
    const released = await request('POST', `/v1/finance/industries/${job.id}/allocations/${allocation.json().id}/release`);
    expect(released.statusCode, released.body).toBe(200); expect(Number(released.json().dispatched_quantity)).toBe(30);
    expect((await request('POST', `/v1/finance/industries/${job.id}/allocations/${allocation.json().id}/dispatch`, { quantity: 1 })).statusCode).toBe(404);
    expect((await request('PATCH', `/v1/finance/industries/${job.id}/status`, { status: 'completed' })).statusCode).toBe(200);
  });
  it('hides other-tenant work and denies sales users mutations', async () => {
    const job = await work('consulting'); const app = await getApp();
    const foreign = await app.inject({ method: 'GET', url: `/v1/finance/industries/${job.id}`, headers: authHeaders(other.token) }); expect(foreign.statusCode).toBeGreaterThanOrEqual(403);
    const sales = await tenant.addUser('SALES'); expect((await app.inject({ method: 'POST', url: '/v1/finance/industries', headers: authHeaders(sales.token), payload: { industry: 'retail', name: 'No permission', customer_id: customerId } })).statusCode).toBe(403);
  });
  it('rolls back stock and journal entries together when a business operation fails', async () => {
    const count = () => withTenant(tenant.tenantId, trx => trx.selectFrom('journal_entries').select(eb => eb.fn.countAll().as('count')).where('tenant_id', '=', tenant.tenantId).executeTakeFirstOrThrow());
    const before = Number((await count()).count);
    await expect(withTenant(tenant.tenantId, async trx => {
      await InventoryService.recordMovement(trx, tenant.tenantId, { actorId: tenant.userId, movementType: 'receipt', itemId: inputItem, toLocationId: location, enteredQty: 5, enteredUom: 'EA', unitCost: 10 });
      throw new Error('Simulated business failure');
    })).rejects.toThrow('Simulated');
    expect(Number((await count()).count)).toBe(before);
  });
  it('posts approved service costs once and keeps estimates separate from the ledger', async () => {
    const job = await work('consulting'); await activate(job.id);
    const created = await request('POST', `/v1/finance/industries/${job.id}/lines`, { kind: 'time', description: 'Delivery work', quantity: 2, unit: 'hours', rate: 100, cost_rate: 40, work_date: '2026-10-07' });
    const lineId = created.json().id;
    expect((await request('POST', `/v1/finance/industries/${job.id}/lines/${lineId}/accrue-cost`)).statusCode).toBe(409);
    await request('POST', `/v1/finance/industries/${job.id}/lines/${lineId}/approve`);
    const accrued = await request('POST', `/v1/finance/industries/${job.id}/lines/${lineId}/accrue-cost`); expect(accrued.statusCode, accrued.body).toBe(200);
    expect((await request('POST', `/v1/finance/industries/${job.id}/lines/${lineId}/accrue-cost`)).statusCode).toBe(409);
    const detail = await request('GET', `/v1/finance/industries/${job.id}`); expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().posted_cost).toBe(80); expect(detail.json().posted_revenue).toBe(0); expect(detail.json().estimated_revenue).toBe(200);
    const invoice = await request('POST', '/v1/invoices', { industry_work_id: job.id }); expect(invoice.statusCode, invoice.body).toBe(201);
    const issued = await request('PATCH', `/v1/invoices/${invoice.json().id}`, { status: 'Unpaid', version: 1 }); expect(issued.statusCode, issued.body).toBe(200);
    const after = await request('GET', `/v1/finance/industries/${job.id}`); expect(after.json().posted_revenue).toBe(200); expect(after.json().posted_cost).toBe(80);
    await GLService.voidEntry(tenant.tenantId, accrued.json().cost_journal_id, tenant.userId, 'Reverse erroneous direct cost');
    const reversed = await request('GET', `/v1/finance/industries/${job.id}`); expect(reversed.json().posted_cost).toBe(0); expect(reversed.json().posted_revenue).toBe(200);
  });
  it('stores immutable BOM versions and validates recipe references', async () => {
    const payload = { name: 'Reusable recipe', recipe: { output_item_id: outputItem, source_location_id: location, target_location_id: location, planned_quantity: 1, conversion_cost: 0, materials: [{ item_id: inputItem, quantity: 2, unit: 'EA' }] } };
    const first = await request('POST', '/v1/finance/industries/recipes', payload); expect(first.statusCode, first.body).toBe(201); expect(first.json().version).toBe(1);
    const second = await request('POST', '/v1/finance/industries/recipes', { ...payload, recipe: { ...payload.recipe, planned_quantity: 2 } }); expect(second.statusCode, second.body).toBe(201); expect(second.json().version).toBe(2);
    const recipes = await request('GET', '/v1/finance/industries/recipes'); expect(recipes.json().find((recipe: any) => recipe.id === first.json().id).recipe.planned_quantity).toBe(1);
    const bad = await request('POST', '/v1/finance/industries/recipes', { ...payload, recipe: { ...payload.recipe, output_item_id: otherCustomerId } }); expect(bad.statusCode).toBe(400);
  });
});
