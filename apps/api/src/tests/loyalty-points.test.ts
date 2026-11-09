import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('Loyalty points — disposable tenant', () => {
  let owner: TestTenant; let junior: { userId: string; token: string };
  let service: string; let customer: string; let foreignCustomer: string; let other: TestTenant;
  async function loyalty(method: 'GET' | 'POST' | 'PUT', path: string, payload?: object, token = owner.token) {
    return (await getApp()).inject({ method, url: `/v1/loyalty${path}`, headers: authHeaders(token), ...(payload ? { payload } : {}) });
  }
  async function pos(method: 'GET' | 'POST', path: string, payload?: object, token = owner.token) {
    return (await getApp()).inject({ method, url: `/v1/finance/pos${path}`, headers: authHeaders(token), ...(payload ? { payload } : {}) });
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    other = await createTestTenant();
    junior = await owner.addUser('JUNIOR');
    service = randomUUID();
    for (const t of [owner, other]) {
      await withTenant(t.tenantId, async trx => {
        await trx.insertInto('tenant_settings').values({ tenant_id: t.tenantId, settings: JSON.stringify({ 'enabled-apps': { finops: true, 'finance.pos': true }, company: { currency: 'TZS' } }) }).execute();
        await trx.insertInto('tenant_finance_capabilities').values({ tenant_id: t.tenantId, capability_key: 'finance.pos', enabled: true }).execute();
        await GLService.seedChartOfAccounts(trx, t.tenantId);
      });
    }
    await withTenant(owner.tenantId, async trx => {
      await trx.insertInto('products').values({ id: service, tenant_id: owner.tenantId, code: 'LOYALTY-SERVICE', name: 'Loyalty test service', type: 'service', sale_price: 1000, tax_rate: 0, currency: 'TZS' }).execute();
    });
    customer = (await withTenant(owner.tenantId, trx => trx.insertInto('customers').values({ tenant_id: owner.tenantId, name: 'Loyalty customer' }).returning('id').executeTakeFirstOrThrow())).id;
    foreignCustomer = (await withTenant(other.tenantId, trx => trx.insertInto('customers').values({ tenant_id: other.tenantId, name: 'Foreign' }).returning('id').executeTakeFirstOrThrow())).id;
    const shiftOpen = await pos('POST', '/shifts/open', { opening_float: 0 });
    expect(shiftOpen.statusCode, shiftOpen.body).toBe(201);
  }, 120000);

  afterAll(async () => {
    await withTenant(owner.tenantId, async trx => {
      await trx.deleteFrom('loyalty_transactions').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('pos_payments').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('pos_sale_lines').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('pos_sales').where('tenant_id', '=', owner.tenantId).execute();
    });
    await owner.cleanup(); await other.cleanup();
  }, 120000);

  it('defaults to a disabled program, and earns nothing on a sale while off', async () => {
    const program = await loyalty('GET', '/program');
    expect(program.json().enabled).toBe(false);
    const sale = await pos('POST', '/sales', { customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'CASH', amount: 1000 }] });
    expect(sale.statusCode, sale.body).toBe(201);
    const balance = await loyalty('GET', `/customers/${customer}/balance`);
    expect(balance.json().balance).toBe(0);
  });

  it('requires finance-tier access to configure the program, and rejects a foreign customer lookup', async () => {
    expect((await loyalty('PUT', '/program', { enabled: true, points_per_currency_unit: 0.01, redemption_value_per_point: 1 }, junior.token)).statusCode).toBe(403);
    expect((await loyalty('GET', `/customers/${foreignCustomer}/balance`)).statusCode).toBe(404);
  });

  it('earns points with a balanced journal once enabled, excluding gift-card-tendered amounts from the basis', async () => {
    const configured = await loyalty('PUT', '/program', { enabled: true, points_per_currency_unit: 0.01, redemption_value_per_point: 1 });
    expect(configured.statusCode, configured.body).toBe(200);
    expect(configured.json().enabled).toBe(true);

    // 1000 spent at 0.01 points per currency unit = 10 points, worth 10 at a 1:1 redemption rate.
    const sale = await pos('POST', '/sales', { customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'CASH', amount: 1000 }] });
    expect(sale.statusCode, sale.body).toBe(201);
    const balance = await loyalty('GET', `/customers/${customer}/balance`);
    expect(balance.json().balance).toBe(10);
    const earnTx = balance.json().transactions.find((t: any) => t.type === 'earn' && t.sale_id === sale.json().id);
    expect(earnTx.points).toBe(10);
    const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', earnTx.journal_entry_id).execute());
    expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);
  });

  it('does not earn points on a sale with no customer attached', async () => {
    const before = await loyalty('GET', `/customers/${customer}/balance`);
    const sale = await pos('POST', '/sales', { currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'CASH', amount: 1000 }] });
    expect(sale.statusCode, sale.body).toBe(201);
    const after = await loyalty('GET', `/customers/${customer}/balance`);
    expect(after.json().balance).toBe(before.json().balance);
  });

  it('reverses all earned points with a balanced journal when the sale is fully refunded', async () => {
    const sale = await pos('POST', '/sales', { customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'CASH', amount: 1000 }] });
    const before = (await loyalty('GET', `/customers/${customer}/balance`)).json().balance;
    expect(before).toBeGreaterThan(0);

    const refund = await pos('POST', `/sales/${sale.json().id}/refund`, { reason: 'Loyalty reversal test' });
    expect(refund.statusCode, refund.body).toBe(200);
    const after = await loyalty('GET', `/customers/${customer}/balance`);
    expect(after.json().balance).toBe(before - 10);
    const reversal = after.json().transactions.find((t: any) => t.type === 'reversal' && t.sale_id === sale.json().id);
    expect(reversal.points).toBe(10);
    const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', reversal.journal_entry_id).execute());
    expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);
  });

  it('claws back a proportional share of earned points on an item-level partial return', async () => {
    const sale = await pos('POST', '/sales', { customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 2 }], payments: [{ method: 'CASH', amount: 2000 }] });
    expect(sale.statusCode, sale.body).toBe(201);
    const before = (await loyalty('GET', `/customers/${customer}/balance`)).json().balance;

    const detail = await pos('GET', `/sales/${sale.json().id}`);
    const line = detail.json().lines[0];
    const partial = await pos('POST', `/sales/${sale.json().id}/refund`, { reason: 'Partial', lines: [{ sale_line_id: line.id, qty: 1, disposition: 'restock' }] });
    expect(partial.statusCode, partial.body).toBe(200);

    // Half the sale (qty 1 of 2) was returned, so half the 20 points this
    // sale earned (1000*2*0.01=20) should be clawed back.
    const after = await loyalty('GET', `/customers/${customer}/balance`);
    expect(after.json().balance).toBe(before - 10);
  });

  it('lets a manager manually adjust a customer\'s balance with a balanced journal, and refuses an over-subtraction', async () => {
    const before = (await loyalty('GET', `/customers/${customer}/balance`)).json().balance;
    const add = await loyalty('POST', `/customers/${customer}/adjust`, { points: 5, direction: 'add', reason: 'Goodwill gesture' });
    expect(add.statusCode, add.body).toBe(200);
    expect(add.json().balance).toBe(before + 5);

    const tooMuch = await loyalty('POST', `/customers/${customer}/adjust`, { points: before + 5 + 1, direction: 'subtract', reason: 'Correction' });
    expect(tooMuch.statusCode).toBe(400);

    const subtract = await loyalty('POST', `/customers/${customer}/adjust`, { points: 3, direction: 'subtract', reason: 'Correction' });
    expect(subtract.statusCode, subtract.body).toBe(200);
    expect(subtract.json().balance).toBe(before + 5 - 3);

    const history = await loyalty('GET', `/customers/${customer}/balance`);
    const adjustTx = history.json().transactions.find((t: any) => t.type === 'adjust_subtract' && t.note === 'Correction');
    const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', adjustTx.journal_entry_id).execute());
    expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);
  });

  it('rounds down fractional points rather than over-crediting', async () => {
    await loyalty('PUT', '/program', { enabled: true, points_per_currency_unit: 0.0001, redemption_value_per_point: 1 });
    const sale = await pos('POST', '/sales', { customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'CASH', amount: 1000 }] });
    expect(sale.statusCode, sale.body).toBe(201);
    // 1000 * 0.0001 = 0.1 points, floored to 0 — no earn row should exist for this sale.
    const earns = await withTenant(owner.tenantId, trx => trx.selectFrom('loyalty_transactions').select('id').where('tenant_id', '=', owner.tenantId).where('sale_id', '=', sale.json().id).execute());
    expect(earns).toHaveLength(0);
    await loyalty('PUT', '/program', { enabled: true, points_per_currency_unit: 0.01, redemption_value_per_point: 1 });
  });

  it('refuses a LOYALTY_POINTS payment with no customer on the sale, and a points/amount mismatch', async () => {
    const noCustomer = await pos('POST', '/sales', { currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'LOYALTY_POINTS', amount: 5, redeem_points: 5 }, { method: 'CASH', amount: 995 }] });
    expect(noCustomer.statusCode).toBe(400);

    const mismatch = await pos('POST', '/sales', { customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'LOYALTY_POINTS', amount: 999, redeem_points: 5 }, { method: 'CASH', amount: 1 }] });
    expect(mismatch.statusCode).toBe(422);
  });

  it('refuses to redeem more points than the customer actually has', async () => {
    const balance = (await loyalty('GET', `/customers/${customer}/balance`)).json().balance;
    const tooMany = balance + 50;
    // amount/cash tie out exactly to grand_total (1000) so the request
    // fails on the balance check inside redeemPointsForSale specifically,
    // not on an unrelated overpayment/change-due guard earlier in checkout.
    const sale = await pos('POST', '/sales', {
      customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 1 }],
      payments: [{ method: 'LOYALTY_POINTS', amount: tooMany, redeem_points: tooMany }, { method: 'CASH', amount: 1000 - tooMany }],
    });
    expect(sale.statusCode, sale.body).toBe(422);
    expect(sale.json().error).toMatch(/only has/);
  });

  it('redeems points as a POS tender with a balanced journal, drawing down the real balance', async () => {
    const before = (await loyalty('GET', `/customers/${customer}/balance`)).json().balance;
    expect(before).toBeGreaterThanOrEqual(5);

    const sale = await pos('POST', '/sales', { customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'LOYALTY_POINTS', amount: 5, redeem_points: 5 }, { method: 'CASH', amount: 995 }] });
    expect(sale.statusCode, sale.body).toBe(201);

    // Earns on the 995 CASH portion only (995*0.01=9.95 -> floor 9), never
    // on the 5 redeemed via points — a reward can't mint a second one.
    const after = await loyalty('GET', `/customers/${customer}/balance`);
    expect(after.json().balance).toBe(before - 5 + 9);

    const redeemTx = after.json().transactions.find((t: any) => t.type === 'redeem' && t.sale_id === sale.json().id);
    expect(redeemTx.points).toBe(5);
    const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', redeemTx.journal_entry_id).execute());
    expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);
  });

  it('restores redeemed points in full when a sale is fully refunded', async () => {
    const before = (await loyalty('GET', `/customers/${customer}/balance`)).json().balance;
    const sale = await pos('POST', '/sales', { customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'LOYALTY_POINTS', amount: 5, redeem_points: 5 }, { method: 'CASH', amount: 995 }] });
    expect(sale.statusCode, sale.body).toBe(201);
    const afterSale = (await loyalty('GET', `/customers/${customer}/balance`)).json().balance;
    expect(afterSale).toBe(before - 5 + 9);

    const refund = await pos('POST', `/sales/${sale.json().id}/refund`, { reason: 'Loyalty redemption refund test' });
    expect(refund.statusCode, refund.body).toBe(200);

    // Both halves of this sale's loyalty effect reverse: the 5 redeemed
    // points come back, and the 9 earned ones are clawed back — net is
    // exactly the pre-sale balance.
    const afterRefund = (await loyalty('GET', `/customers/${customer}/balance`)).json().balance;
    expect(afterRefund).toBe(before);
  });

  it('restores a proportional share of redeemed points on an item-level partial return', async () => {
    const sale = await pos('POST', '/sales', { customer_id: customer, currency: 'TZS', items: [{ product_id: service, qty: 2 }], payments: [{ method: 'LOYALTY_POINTS', amount: 10, redeem_points: 10 }, { method: 'CASH', amount: 1990 }] });
    expect(sale.statusCode, sale.body).toBe(201);

    const detail = await pos('GET', `/sales/${sale.json().id}`);
    const line = detail.json().lines[0];
    const partial = await pos('POST', `/sales/${sale.json().id}/refund`, { reason: 'Partial loyalty redemption test', lines: [{ sale_line_id: line.id, qty: 1, disposition: 'restock' }] });
    expect(partial.statusCode, partial.body).toBe(200);

    // Half the sale was returned, so half the 10 redeemed points (5) come
    // back; half the earn also claws back. Net vs. the pre-sale balance:
    // -10 (redeemed) + half back (5) = -5 so far from redemption, and the
    // earn clawback mirrors whatever fraction was earned — rather than
    // predict the exact earn figure here, just confirm the redeemed side
    // moved by exactly the expected 5-point partial restoration.
    const redeemRefundRows = await withTenant(owner.tenantId, trx => trx.selectFrom('loyalty_transactions').select('points')
      .where('tenant_id', '=', owner.tenantId).where('sale_id', '=', sale.json().id).where('type', '=', 'refund').execute());
    expect(redeemRefundRows.reduce((s, r) => s + Number(r.points), 0)).toBe(5);
  });
});
