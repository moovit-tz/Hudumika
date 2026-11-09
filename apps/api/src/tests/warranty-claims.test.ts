import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { InventoryService } from '../services/inventory.service.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('Warranty claims — disposable tenant', () => {
  let owner: TestTenant; let junior: { userId: string; token: string };
  let customer: string; let foreignCustomer: string; let other: TestTenant;
  let location: string; let item: string; let product: string;
  async function call(method: 'GET' | 'POST', path: string, payload?: object, token = owner.token) {
    return (await getApp()).inject({ method, url: `/v1/warranties${path}`, headers: authHeaders(token), ...(payload ? { payload } : {}) });
  }
  function today(offsetDays = 0): string {
    const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    other = await createTestTenant();
    junior = await owner.addUser('JUNIOR');
    product = randomUUID();
    for (const t of [owner, other]) {
      await withTenant(t.tenantId, async trx => {
        await trx.insertInto('tenant_settings').values({ tenant_id: t.tenantId, settings: JSON.stringify({ 'enabled-apps': { finops: true }, company: { currency: 'TZS' } }) }).execute();
        await GLService.seedChartOfAccounts(trx, t.tenantId);
      });
    }
    customer = (await withTenant(owner.tenantId, trx => trx.insertInto('customers').values({ tenant_id: owner.tenantId, name: 'Warranty customer' }).returning('id').executeTakeFirstOrThrow())).id;
    foreignCustomer = (await withTenant(other.tenantId, trx => trx.insertInto('customers').values({ tenant_id: other.tenantId, name: 'Foreign' }).returning('id').executeTakeFirstOrThrow())).id;
    await withTenant(owner.tenantId, async trx => {
      const warehouse = await trx.insertInto('inventory_warehouses').values({ tenant_id: owner.tenantId, name: 'Warranty audit', code: 'WARR', address: null }).returning('id').executeTakeFirstOrThrow();
      const bin = await trx.insertInto('inventory_locations').values({ tenant_id: owner.tenantId, warehouse_id: warehouse.id, code: 'BIN', name: 'Warranty bin' }).returning('id').executeTakeFirstOrThrow();
      location = bin.id;
      await trx.insertInto('products').values({ id: product, tenant_id: owner.tenantId, code: 'WARR-PROD', name: 'Warranted widget', type: 'product', sale_price: 500, tax_rate: 0, currency: 'TZS', track_inventory: true }).execute();
      item = (await trx.insertInto('inventory_items').values({ tenant_id: owner.tenantId, sku: 'WIDGET', name: 'Warranted widget', product_id: product, base_uom: 'EA' }).returning('id').executeTakeFirstOrThrow()).id;
      await InventoryService.recordMovement(trx, owner.tenantId, { actorId: owner.userId, movementType: 'receipt', itemId: item, toLocationId: location, enteredQty: 50, enteredUom: 'EA', unitCost: 100 });
    });
  }, 120000);

  afterAll(async () => {
    await withTenant(owner.tenantId, async trx => {
      await trx.deleteFrom('warranty_claims').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('warranties').where('tenant_id', '=', owner.tenantId).execute();
    });
    await owner.cleanup(); await other.cleanup();
  }, 120000);

  it('requires staff access to issue, and refuses a foreign/invalid customer or a backwards date range', async () => {
    expect((await call('POST', '/', { customer_id: customer, warranty_start: today(), warranty_end: today(30) }, junior.token)).statusCode).toBe(403);
    expect((await call('POST', '/', { customer_id: foreignCustomer, warranty_start: today(), warranty_end: today(30) })).statusCode).toBe(404);
    expect((await call('POST', '/', { customer_id: customer, warranty_start: today(30), warranty_end: today() })).statusCode).toBe(422);
  });

  it('issues a warranty and lists it for the customer', async () => {
    const issued = await call('POST', '/', { customer_id: customer, product_id: product, warranty_start: today(), warranty_end: today(30), terms: '30-day replacement warranty' });
    expect(issued.statusCode, issued.body).toBe(200);
    expect(issued.json().status).toBe('active');
    const list = await call('GET', `/?customer_id=${customer}`);
    expect(list.json().some((w: any) => w.id === issued.json().id)).toBe(true);
  });

  it('refuses a claim against an expired or voided warranty', async () => {
    const expired = await call('POST', '/', { customer_id: customer, warranty_start: today(-60), warranty_end: today(-30) });
    const expiredClaim = await call('POST', `/${expired.json().id}/claims`, { description: 'Stopped working' });
    expect(expiredClaim.statusCode, expiredClaim.body).toBe(422);
    // No explicit try/catch on this route — the error falls through to the
    // global handler's default Error shape, which puts the real text in
    // `message` and the generic HTTP reason phrase in `error` (unlike the
    // /resolve route below, which explicitly reshapes it into `error`).
    expect(expiredClaim.json().message).toMatch(/expired/);

    const toVoid = await call('POST', '/', { customer_id: customer, warranty_start: today(), warranty_end: today(30) });
    expect((await call('POST', `/${toVoid.json().id}/void`, {}, junior.token)).statusCode).toBe(403);
    expect((await call('POST', `/${toVoid.json().id}/void`)).statusCode).toBe(200);
    const voidedClaim = await call('POST', `/${toVoid.json().id}/claims`, { description: 'Broken' });
    expect(voidedClaim.statusCode).toBe(422);
    expect(voidedClaim.json().message).toMatch(/voided/);
  });

  it('resolves a claim as a replacement, consuming real inventory with a balanced journal, and refuses resolving twice', async () => {
    const warranty = await call('POST', '/', { customer_id: customer, product_id: product, warranty_start: today(), warranty_end: today(30) });
    const claim = await call('POST', `/${warranty.json().id}/claims`, { description: 'Arrived defective' });
    expect(claim.statusCode, claim.body).toBe(200);
    expect(claim.json().status).toBe('submitted');

    expect((await call('POST', `/claims/${claim.json().id}/resolve`, { resolution_type: 'replace', location_id: location, item_id: item, qty: 1, uom: 'EA' })).statusCode).toBe(409);

    const reviewed = await call('POST', `/claims/${claim.json().id}/review`, { decision: 'approve', note: 'Confirmed defective' });
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(reviewed.json().status).toBe('approved');

    const before = await withTenant(owner.tenantId, trx => trx.selectFrom('inventory_stock_levels').select('qty_on_hand').where('tenant_id', '=', owner.tenantId).where('item_id', '=', item).where('location_id', '=', location).executeTakeFirstOrThrow());
    const resolved = await call('POST', `/claims/${claim.json().id}/resolve`, { resolution_type: 'replace', location_id: location, item_id: item, qty: 1, uom: 'EA', note: 'Sent replacement unit' });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json().status).toBe('resolved');
    const after = await withTenant(owner.tenantId, trx => trx.selectFrom('inventory_stock_levels').select('qty_on_hand').where('tenant_id', '=', owner.tenantId).where('item_id', '=', item).where('location_id', '=', location).executeTakeFirstOrThrow());
    expect(Number(after.qty_on_hand)).toBe(Number(before.qty_on_hand) - 1);

    const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id').where('journal_entries.reference', '=', claim.json().claim_number).execute());
    expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);

    expect((await call('POST', `/claims/${claim.json().id}/resolve`, { resolution_type: 'replace', location_id: location, item_id: item, qty: 1, uom: 'EA' })).statusCode).toBe(409);
  });

  it('resolves a claim as a cash refund with a balanced journal', async () => {
    const warranty = await call('POST', '/', { customer_id: customer, product_id: product, warranty_start: today(), warranty_end: today(30) });
    const claim = await call('POST', `/${warranty.json().id}/claims`, { description: 'Customer wants a refund instead' });
    await call('POST', `/claims/${claim.json().id}/review`, { decision: 'approve' });

    const resolved = await call('POST', `/claims/${claim.json().id}/resolve`, { resolution_type: 'refund', amount: 500, method: 'CASH', note: 'Refunded in cash' });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json().refund_amount).toBe(500);
    expect(resolved.json().refund_method).toBe('CASH');

    const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', resolved.json().journal_entry_id).execute());
    expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);
  });

  it('refuses to review an already-reviewed claim, and refuses to resolve a rejected claim', async () => {
    const warranty = await call('POST', '/', { customer_id: customer, warranty_start: today(), warranty_end: today(30) });
    const claim = await call('POST', `/${warranty.json().id}/claims`, { description: 'Will be rejected' });
    const rejected = await call('POST', `/claims/${claim.json().id}/review`, { decision: 'reject', note: 'Outside terms' });
    expect(rejected.statusCode, rejected.body).toBe(200);
    expect(rejected.json().status).toBe('rejected');

    expect((await call('POST', `/claims/${claim.json().id}/review`, { decision: 'approve' })).statusCode).toBe(409);
    expect((await call('POST', `/claims/${claim.json().id}/resolve`, { resolution_type: 'refund', amount: 1, method: 'CASH' })).statusCode).toBe(409);
  });
});
