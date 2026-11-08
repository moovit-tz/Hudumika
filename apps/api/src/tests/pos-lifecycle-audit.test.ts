import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { InventoryService } from '../services/inventory.service.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('POS lifecycle audit — disposable tenants', () => {
  let owner: TestTenant; let other: TestTenant;
  let cashier: { userId: string; token: string }; let reader: { userId: string; token: string };
  let service: string; let product: string; let foreignProduct: string; let foreignCustomer: string;
  let location: string; let foreignLocation: string; let item: string; let shift: string;
  async function call(method: 'GET' | 'POST' | 'DELETE', path: string, payload?: object, token = owner.token, extra = {}) {
    return (await getApp()).inject({ method, url: `/v1/finance/pos${path}`, headers: { ...authHeaders(token), ...extra }, ...(payload ? { payload } : {}) });
  }
  function checkout(overrides = {}) {
    return { currency: 'TZS', items: [{ product_id: service, qty: 1, discount: 0 }], payments: [{ method: 'CASH', amount: 118 }], ...overrides };
  }
  async function sale(overrides = {}) {
    const result = await call('POST', '/sales', checkout(overrides));
    expect(result.statusCode, result.body).toBe(201); return result.json();
  }
  beforeAll(async () => {
    owner = await createTestTenant(); other = await createTestTenant();
    cashier = await owner.addUser('SALES'); reader = await owner.addUser('JUNIOR');
    service = randomUUID(); product = randomUUID(); foreignProduct = randomUUID();
    for (const t of [owner, other]) {
      await withTenant(t.tenantId, async trx => {
        await trx.insertInto('tenant_settings').values({ tenant_id: t.tenantId, settings: JSON.stringify({ 'enabled-apps': { finops: true, 'finance.pos': true }, company: { currency: 'TZS' } }) }).execute();
        await trx.insertInto('tenant_finance_capabilities').values({ tenant_id: t.tenantId, capability_key: 'finance.pos', enabled: true }).execute();
        await GLService.seedChartOfAccounts(trx, t.tenantId);
        const warehouse = await trx.insertInto('inventory_warehouses').values({ tenant_id: t.tenantId, name: 'POS audit', code: 'AUDIT', address: null }).returning('id').executeTakeFirstOrThrow();
        const bin = await trx.insertInto('inventory_locations').values({ tenant_id: t.tenantId, warehouse_id: warehouse.id, code: 'BIN', name: 'POS bin' }).returning('id').executeTakeFirstOrThrow();
        if (t === owner) location = bin.id; else foreignLocation = bin.id;
      });
    }
    await withTenant(owner.tenantId, async trx => {
      await trx.insertInto('products').values([
        { id: service, tenant_id: owner.tenantId, code: 'SERVICE', name: 'Audit service', type: 'service', sale_price: 100, tax_rate: 18, currency: 'TZS' },
        { id: product, tenant_id: owner.tenantId, code: 'STOCK', name: 'Audit chocolate', type: 'product', sale_price: 100, tax_rate: 0, currency: 'TZS', track_inventory: true },
      ]).execute();
      item = (await trx.insertInto('inventory_items').values({ tenant_id: owner.tenantId, sku: 'CHOC', name: 'Audit chocolate', product_id: product, base_uom: 'EA', reorder_point: null, reorder_qty: null }).returning('id').executeTakeFirstOrThrow()).id;
      await InventoryService.recordMovement(trx, owner.tenantId, { actorId: owner.userId, movementType: 'receipt', itemId: item, toLocationId: location, enteredQty: 20, enteredUom: 'EA', unitCost: 40 });
    });
    await withTenant(other.tenantId, async trx => {
      await trx.insertInto('products').values({ id: foreignProduct, tenant_id: other.tenantId, code: 'FOREIGN', name: 'Foreign', sale_price: 100 }).execute();
      foreignCustomer = (await trx.insertInto('customers').values({ tenant_id: other.tenantId, name: 'Foreign' }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);
  afterAll(async () => {
    vi.restoreAllMocks();
    for (const t of [owner, other].filter(Boolean)) {
      await withTenant(t.tenantId, async trx => {
        await trx.deleteFrom('pos_payments').where('tenant_id', '=', t.tenantId).execute();
        await trx.deleteFrom('pos_sale_lines').where('tenant_id', '=', t.tenantId).execute();
        await trx.deleteFrom('pos_sales').where('tenant_id', '=', t.tenantId).execute();
        await trx.deleteFrom('pos_cash_movements').where('tenant_id', '=', t.tenantId).execute();
        await trx.deleteFrom('pos_shifts').where('tenant_id', '=', t.tenantId).execute();
      });
      await t.cleanup();
    }
  }, 120000);
  it('requires authentication and denies a junior operations user', async () => {
    expect((await (await getApp()).inject({ method: 'GET', url: '/v1/finance/pos/bootstrap' })).statusCode).toBe(401);
    expect((await call('GET', '/bootstrap', undefined, reader.token)).statusCode).toBe(403);
  });
  it('requires a register and prevents concurrent duplicate register openings', async () => {
    expect((await call('POST', '/sales', checkout())).statusCode).toBe(409);
    const results = await Promise.all([call('POST', '/shifts/open', { opening_float: 50 }), call('POST', '/shifts/open', { opening_float: 50 })]);
    expect(results.map(r => r.statusCode).sort()).toEqual([201, 409]);
    shift = results.find(r => r.statusCode === 201)!.json().id;
  });
  it('uses server prices, tax, discount and balanced journal with split tender/change', async () => {
    const created = await sale({ items: [{ product_id: service, qty: 2, discount: 10, unit_price: 1 }], payments: [{ method: 'CARD', amount: 100 }, { method: 'CASH', amount: 150 }] });
    expect(Number(created.grand_total)).toBe(224.2); expect(Number(created.change_due)).toBe(25.8);
    const detail = (await call('GET', `/sales/${created.id}`)).json(); expect(detail.lines[0].unit_price).toBe(100);
    const lines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', created.journal_entry_id).execute());
    expect(lines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);
  });
  it.each([
    ['short payment', { payments: [{ method: 'CASH', amount: 1 }] }],
    ['noncash overpayment', { payments: [{ method: 'CARD', amount: 120 }] }],
    ['excess discount', () => ({ items: [{ product_id: service, qty: 1, discount: 101 }] })],
    ['foreign product', () => ({ items: [{ product_id: foreignProduct, qty: 1 }] })],
    ['foreign customer', () => ({ customer_id: foreignCustomer })],
    ['foreign location', () => ({ inventory_location_id: foreignLocation })],
  ])('rejects %s without creating a sale', async (_name, input) => {
    const before = (await call('GET', '/sales')).json().total;
    expect((await call('POST', '/sales', checkout(typeof input === 'function' ? input() : input))).statusCode).toBe(422);
    expect((await call('GET', '/sales')).json().total).toBe(before);
  });
  it('rejects zero quantity and malformed paging', async () => {
    expect((await call('POST', '/sales', checkout({ items: [{ product_id: service, qty: 0 }] }))).statusCode).toBe(400);
    expect((await call('GET', '/sales?page_size=1000')).statusCode).toBe(400);
  });
  it('isolates sale detail, history and shifts between tenants', async () => {
    const created = await sale();
    expect((await call('GET', `/sales/${created.id}`, undefined, other.token)).statusCode).toBe(404);
    expect((await call('GET', '/sales', undefined, other.token)).json().total).toBe(0);
    expect((await call('POST', `/shifts/${shift}/movements`, { direction: 'OUT', amount: 1, reason: 'Foreign attempt' }, other.token)).statusCode).toBe(404);
  });
  it('treats search metacharacters literally and applies history filters', async () => {
    const created = await sale();
    const found = await call('GET', `/sales?search=${encodeURIComponent(created.sale_number)}&status=COMPLETED&page_size=5`);
    expect(found.statusCode, found.body).toBe(200); expect(found.json().items.map((row: { id: string }) => row.id)).toEqual([created.id]);
    expect((await call('GET', '/sales?search=%25%27%20OR%201%3D1--')).json().total).toBe(0);
  });
  it('preserves read access but refuses mutations when POS capability is disabled', async () => {
    await withTenant(owner.tenantId, trx => trx.updateTable('tenant_finance_capabilities').set({ enabled: false }).where('tenant_id', '=', owner.tenantId).where('capability_key', '=', 'finance.pos').execute());
    try {
      expect((await call('GET', '/bootstrap')).statusCode).toBe(200);
      expect((await call('POST', '/sales', checkout())).statusCode).toBe(403);
    } finally {
      await withTenant(owner.tenantId, trx => trx.updateTable('tenant_finance_capabilities').set({ enabled: true }).where('tenant_id', '=', owner.tenantId).where('capability_key', '=', 'finance.pos').execute());
    }
  });
  it('refunds a service sale once and hides it from completed sales reporting', async () => {
    const created = await sale();
    const result = await call('POST', `/sales/${created.id}/refund`, { reason: 'Service cancellation' }); expect(result.statusCode, result.body).toBe(200);
    expect((await call('GET', `/sales/${created.id}`)).json().status).toBe('REFUNDED');
    expect((await call('POST', `/sales/${created.id}/refund`, { reason: 'Repeated cancellation' })).statusCode).toBe(409);
    expect((await call('GET', '/sales-report')).json().some((row: { id: string }) => row.id === created.id)).toBe(false);
  });
  it('prevents cashier refund/retry and another cashier register adjustment', async () => {
    const created = await sale();
    expect((await call('POST', `/sales/${created.id}/refund`, { reason: 'Cashier refund attempt' }, cashier.token)).statusCode).toBe(403);
    expect((await call('POST', `/sales/${created.id}/retry-posting`, {}, cashier.token)).statusCode).toBe(403);
    expect((await call('POST', `/shifts/${shift}/movements`, { direction: 'OUT', amount: 1, reason: 'Cashier attempt' }, cashier.token)).statusCode).toBe(403);
  });
  it('issues stock, refunds it once, and rejects a second refund', async () => {
    const created = await sale({ inventory_location_id: location, items: [{ product_id: product, qty: 2 }], payments: [{ method: 'CASH', amount: 200 }] });
    expect((await call('GET', `/availability?location_id=${location}`)).json()[product]).toBe(18);
    const refunded = await call('POST', `/sales/${created.id}/refund`, { reason: 'Audit return' }); expect(refunded.statusCode, refunded.body).toBe(200);
    expect((await call('GET', `/availability?location_id=${location}`)).json()[product]).toBe(20);
    expect((await call('POST', `/sales/${created.id}/refund`, { reason: 'Repeat audit return' })).statusCode).toBe(409);
  });
  it('rolls back insufficient stock including duplicate product lines', async () => {
    const before = (await call('GET', `/availability?location_id=${location}`)).json()[product];
    const result = await call('POST', '/sales', checkout({ inventory_location_id: location, items: [{ product_id: product, qty: 11 }, { product_id: product, qty: 11 }], payments: [{ method: 'CASH', amount: 2200 }] }));
    expect(result.statusCode, result.body).toBe(422);
    expect((await call('GET', `/availability?location_id=${location}`)).json()[product]).toBe(before);
  });
  it('holds and restores a cart and refuses foreign references', async () => {
    const held = await call('POST', '/holds', { label: 'Audit hold', items: [{ product_id: service, qty: 1 }] }); expect(held.statusCode, held.body).toBe(201);
    expect((await call('GET', '/holds', undefined, other.token)).json()).toEqual([]);
    expect((await call('DELETE', `/holds/${held.json().id}`)).statusCode).toBe(200);
    expect((await call('POST', '/holds', { label: 'Foreign hold', customer_id: foreignCustomer, items: [{ product_id: service, qty: 1 }] })).statusCode).toBe(422);
  });
  it('recovers a failed accounting posting without duplicating its journal', async () => {
    const spy = vi.spyOn(GLService, 'post').mockRejectedValueOnce(new Error('Audit accounting outage'));
    const result = await call('POST', '/sales', checkout()); spy.mockRestore();
    expect(result.statusCode, result.body).toBe(202); const created = result.json();
    const results = await Promise.all([call('POST', `/sales/${created.id}/retry-posting`), call('POST', `/sales/${created.id}/retry-posting`)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
  });
  it('rejects changing a TZS product into USD without conversion', async () => {
    const result = await call('POST', '/sales', checkout({ currency: 'USD' }));
    expect(result.statusCode, result.body).toBe(422);
  });
  it('accepts the actual browser checkout payload when sale notes are empty', async () => {
    const result = await call('POST', '/sales', checkout({ customer_id: null, inventory_location_id: null, notes: null }));
    expect(result.statusCode, result.body).toBe(201);
  });
  it('does not let independently rounded tenders disagree with amount paid', async () => {
    const result = await call('POST', '/sales', checkout({ payments: [{ method: 'CARD', amount: 59.005 }, { method: 'CASH', amount: 58.995 }] }));
    if (result.statusCode === 400 || result.statusCode === 422) return;
    expect(result.statusCode, result.body).toBe(201);
    const detail = (await call('GET', `/sales/${result.json().id}`)).json();
    expect(detail.payments.reduce((sum: number, p: {amount: number}) => sum + p.amount, 0)).toBeCloseTo(detail.amount_paid, 6);
  });
  it('includes cash already received when accounting posting has failed', async () => {
    const before = (await call('GET', '/bootstrap')).json().shift.expected_cash;
    const spy = vi.spyOn(GLService, 'post').mockRejectedValueOnce(new Error('Audit cash accounting outage'));
    const result = await call('POST', '/sales', checkout()); spy.mockRestore();
    expect(result.statusCode, result.body).toBe(202);
    const after = (await call('GET', '/bootstrap')).json().shift.expected_cash;
    expect(after - before).toBeCloseTo(118, 6);
  });
  it('serializes competing sales so the same last stock is never issued twice', async () => {
    const available = (await call('GET', `/availability?location_id=${location}`)).json()[product];
    const payload = checkout({ inventory_location_id: location, items: [{ product_id: product, qty: available }], payments: [{ method: 'CASH', amount: available * 100 }] });
    const results = await Promise.all([call('POST', '/sales', payload), call('POST', '/sales', payload)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([201, 422]);
    expect((await call('GET', `/availability?location_id=${location}`)).json()[product]).toBe(0);
    await withTenant(owner.tenantId, trx => InventoryService.recordMovement(trx, owner.tenantId, { actorId: owner.userId, movementType: 'receipt', itemId: item, toLocationId: location, enteredQty: available, enteredUom: 'EA', unitCost: 40 }));
  });
  it('does not sell tracked stock without selecting an inventory location', async () => {
    const result = await call('POST', '/sales', checkout({ items: [{ product_id: product, qty: 1000 }], payments: [{ method: 'CASH', amount: 100000 }] }));
    expect(result.statusCode, result.body).toBe(422);
  });
  it('deduplicates a retried checkout using the same idempotency key', async () => {
    const headers = { 'idempotency-key': randomUUID() };
    const first = await call('POST', '/sales', checkout(), owner.token, headers);
    const second = await call('POST', '/sales', checkout(), owner.token, headers);
    expect(first.statusCode, first.body).toBe(201); expect(second.json().id).toBe(first.json().id);
  });
  it('keeps refund accounting and sale status atomic when stock return fails', async () => {
    const created = await sale({ inventory_location_id: location, items: [{ product_id: product, qty: 1 }], payments: [{ method: 'CASH', amount: 100 }] });
    const spy = vi.spyOn(InventoryService, 'recordMovement').mockRejectedValueOnce(new Error('Audit stock return outage'));
    const result = await call('POST', `/sales/${created.id}/refund`, { reason: 'Audit failure injection' }); spy.mockRestore();
    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    const entry = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_entries').select('voided_at').where('tenant_id', '=', owner.tenantId).where('id', '=', created.journal_entry_id).executeTakeFirstOrThrow());
    expect(entry.voided_at).toBeNull();
  });
  it('returns a mixed sale item-by-item, respecting disposition and the remaining-qty guard', async () => {
    const created = await sale({
      inventory_location_id: location,
      items: [{ product_id: product, qty: 4 }, { product_id: service, qty: 1 }],
      payments: [{ method: 'CASH', amount: 100 }, { method: 'CARD', amount: 418 }],
    });
    const detail = (await call('GET', `/sales/${created.id}`)).json();
    const productLine = detail.lines.find((l: any) => l.product_id === product);
    const serviceLine = detail.lines.find((l: any) => l.product_id === service);
    const before = (await call('GET', `/availability?location_id=${location}`)).json()[product];

    // Return half the stocked line, restocked — the rest of the sale
    // (the untouched service line) must keep the sale COMPLETED, not
    // flip it to REFUNDED the way a whole-sale refund would.
    const partial = await call('POST', `/sales/${created.id}/refund`, {
      reason: 'Customer kept half', lines: [{ sale_line_id: productLine.id, qty: 2, disposition: 'restock' }],
    });
    expect(partial.statusCode, partial.body).toBe(200);
    expect(partial.json().fully_refunded).toBe(false);
    expect(partial.json().refund_total).toBe(200);
    expect((await call('GET', `/availability?location_id=${location}`)).json()[product]).toBe(before + 2);
    const midStatus = await withTenant(owner.tenantId, trx => trx.selectFrom('pos_sales').select('status').where('tenant_id', '=', owner.tenantId).where('id', '=', created.id).executeTakeFirstOrThrow());
    expect(midStatus.status).toBe('COMPLETED');

    // Asking for more than what's left on that line must be refused, not
    // silently clamped.
    const over = await call('POST', `/sales/${created.id}/refund`, { reason: 'Too much', lines: [{ sale_line_id: productLine.id, qty: 3 }] });
    expect(over.statusCode).toBe(422);

    // The other 2 units come back damaged — refunded, but never restocked.
    const beforeDamaged = (await call('GET', `/availability?location_id=${location}`)).json()[product];
    const damaged = await call('POST', `/sales/${created.id}/refund`, {
      reason: 'Rest arrived damaged', lines: [{ sale_line_id: productLine.id, qty: 2, disposition: 'damaged' }],
    });
    expect(damaged.statusCode, damaged.body).toBe(200);
    expect((await call('GET', `/availability?location_id=${location}`)).json()[product]).toBe(beforeDamaged);
    expect(damaged.json().fully_refunded).toBe(false);

    // Returning the last untouched line finally fully refunds the sale.
    const finalReturn = await call('POST', `/sales/${created.id}/refund`, { reason: 'Service cancelled too', lines: [{ sale_line_id: serviceLine.id, qty: 1 }] });
    expect(finalReturn.statusCode, finalReturn.body).toBe(200);
    expect(finalReturn.json().fully_refunded).toBe(true);
    const finalStatus = await withTenant(owner.tenantId, trx => trx.selectFrom('pos_sales').select('status').where('tenant_id', '=', owner.tenantId).where('id', '=', created.id).executeTakeFirstOrThrow());
    expect(finalStatus.status).toBe('REFUNDED');

    // Every partial-return journal entry this test produced balances.
    const returns = await withTenant(owner.tenantId, trx => trx.selectFrom('pos_sale_line_returns').select('journal_entry_id')
      .where('tenant_id', '=', owner.tenantId).where('sale_id', '=', created.id).execute());
    for (const r of returns) {
      if (!r.journal_entry_id) continue;
      const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', r.journal_entry_id!).execute());
      expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);
    }
  });
  it('supports cash movements and closes the register with a frozen cash count', async () => {
    expect((await call('POST', `/shifts/${shift}/movements`, { direction: 'IN', amount: 20, reason: 'Audit cash float' })).statusCode).toBe(201);
    const before = (await call('GET', '/bootstrap')).json().shift.expected_cash;
    const result = await call('POST', `/shifts/${shift}/close`, { closing_cash: before }); expect(result.statusCode, result.body).toBe(200); expect(result.json().expected_cash).toBe(before);
    expect((await call('POST', '/sales', checkout())).statusCode).toBe(409);
    expect((await call('POST', `/shifts/${shift}/movements`, { direction: 'IN', amount: 1, reason: 'Closed attempt' })).statusCode).toBe(404);
  });
});

