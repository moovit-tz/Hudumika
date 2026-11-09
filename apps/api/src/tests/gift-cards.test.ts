import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('Gift cards — disposable tenant', () => {
  let owner: TestTenant; let junior: { userId: string; token: string };
  let service: string;
  async function giftCards(method: 'GET' | 'POST', path: string, payload?: object, token = owner.token) {
    return (await getApp()).inject({ method, url: `/v1/gift-cards${path}`, headers: authHeaders(token), ...(payload ? { payload } : {}) });
  }
  async function pos(method: 'GET' | 'POST', path: string, payload?: object, token = owner.token) {
    return (await getApp()).inject({ method, url: `/v1/finance/pos${path}`, headers: authHeaders(token), ...(payload ? { payload } : {}) });
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    junior = await owner.addUser('JUNIOR');
    service = randomUUID();
    await withTenant(owner.tenantId, async trx => {
      await trx.insertInto('tenant_settings').values({ tenant_id: owner.tenantId, settings: JSON.stringify({ 'enabled-apps': { finops: true, 'finance.pos': true }, company: { currency: 'TZS' } }) }).execute();
      await trx.insertInto('tenant_finance_capabilities').values({ tenant_id: owner.tenantId, capability_key: 'finance.pos', enabled: true }).execute();
      await GLService.seedChartOfAccounts(trx, owner.tenantId);
      await trx.insertInto('products').values({ id: service, tenant_id: owner.tenantId, code: 'GC-SERVICE', name: 'Gift card test service', type: 'service', sale_price: 100, tax_rate: 0, currency: 'TZS' }).execute();
    });
    const shiftOpen = await pos('POST', '/shifts/open', { opening_float: 0 });
    expect(shiftOpen.statusCode, shiftOpen.body).toBe(201);
  }, 120000);

  afterAll(async () => {
    await withTenant(owner.tenantId, async trx => {
      // gift_card_transactions references pos_sales, and pos_payments
      // references gift_cards — both must go before the tables they
      // reference, or the later deletes violate those FKs.
      await trx.deleteFrom('gift_card_transactions').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('pos_payments').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('gift_cards').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('pos_sale_lines').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('pos_sales').where('tenant_id', '=', owner.tenantId).execute();
    });
    await owner.cleanup();
  }, 120000);

  it('requires POS-tier access to issue, and refuses an unwaived issue with no tender method', async () => {
    expect((await giftCards('POST', '/', { initial_value: 100 }, junior.token)).statusCode).toBe(403);
    const noMethod = await giftCards('POST', '/', { initial_value: 100 });
    expect(noMethod.statusCode).toBe(400);
  });

  it('issues a card with a balanced journal entry, and lets a waived promotional issue skip the GL cash leg', async () => {
    const issued = await giftCards('POST', '/', { initial_value: 250, method: 'CASH' });
    expect(issued.statusCode, issued.body).toBe(200);
    const card = issued.json();
    expect(card.balance).toBe(250);
    const lines = await withTenant(owner.tenantId, trx => trx.selectFrom('gift_card_transactions').select('journal_entry_id').where('gift_card_id', '=', card.id).executeTakeFirstOrThrow());
    const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', lines.journal_entry_id!).execute());
    expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);

    const waived = await giftCards('POST', '/', { initial_value: 50, waive: true });
    expect(waived.statusCode, waived.body).toBe(200);
    const waivedTx = await withTenant(owner.tenantId, trx => trx.selectFrom('gift_card_transactions').select('journal_entry_id').where('gift_card_id', '=', waived.json().id).executeTakeFirstOrThrow());
    expect(waivedTx.journal_entry_id).toBeNull();
  });

  it('rejects a duplicate explicit code', async () => {
    const first = await giftCards('POST', '/', { code: 'DUP-CODE-1', initial_value: 10, method: 'CASH' });
    expect(first.statusCode, first.body).toBe(200);
    const second = await giftCards('POST', '/', { code: 'dup-code-1', initial_value: 10, method: 'CASH' });
    expect(second.statusCode).toBe(409);
  });

  it('redeems a gift card as POS tender, refuses an unknown code and an over-draw, and is case/whitespace-insensitive', async () => {
    const issued = await giftCards('POST', '/', { initial_value: 100, method: 'CASH' });
    const code = issued.json().code;

    const badCode = await pos('POST', '/sales', { currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'GIFT_CARD', amount: 100, gift_card_code: 'NOT-REAL' }] });
    expect(badCode.statusCode).toBe(422);

    const overDraw = await pos('POST', '/sales', { currency: 'TZS', items: [{ product_id: service, qty: 2 }], payments: [{ method: 'GIFT_CARD', amount: 200, gift_card_code: code }] });
    expect(overDraw.statusCode, overDraw.body).toBe(422);

    const sale = await pos('POST', '/sales', { currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'GIFT_CARD', amount: 100, gift_card_code: ` ${code.toLowerCase()} ` }] });
    expect(sale.statusCode, sale.body).toBe(201);

    const after = await giftCards('GET', `/${issued.json().id}`);
    expect(after.json().balance).toBe(0);

    // Sale posting itself (postSaleJournal) debits the GIFT_CARD tender
    // account (2160) and credits revenue — confirm that leg actually
    // happened, not just the card's own spendable-balance ledger.
    const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['account_id', 'debit']).where('journal_entry_id', '=', sale.json().journal_entry_id).execute());
    const giftCardAccount = await withTenant(owner.tenantId, trx => trx.selectFrom('chart_of_accounts').select('id').where('tenant_id', '=', owner.tenantId).where('code', '=', '2160').executeTakeFirstOrThrow());
    expect(jLines.some(l => l.account_id === giftCardAccount.id && Number(l.debit) === 100)).toBe(true);
  });

  it('restores a gift card balance when the sale that redeemed it is fully refunded', async () => {
    const issued = await giftCards('POST', '/', { initial_value: 100, method: 'CASH' });
    const code = issued.json().code;
    const sale = await pos('POST', '/sales', { currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'GIFT_CARD', amount: 100, gift_card_code: code }] });
    expect(sale.statusCode, sale.body).toBe(201);
    expect((await giftCards('GET', `/${issued.json().id}`)).json().balance).toBe(0);

    const refund = await pos('POST', `/sales/${sale.json().id}/refund`, { reason: 'Gift card test refund' });
    expect(refund.statusCode, refund.body).toBe(200);
    expect((await giftCards('GET', `/${issued.json().id}`)).json().balance).toBe(100);
  });

  it('restores a proportional gift card balance on an item-level partial return', async () => {
    const issued = await giftCards('POST', '/', { initial_value: 100, method: 'CASH' });
    const code = issued.json().code;
    const sale = await pos('POST', '/sales', {
      currency: 'TZS', items: [{ product_id: service, qty: 2 }],
      payments: [{ method: 'CASH', amount: 100 }, { method: 'GIFT_CARD', amount: 100, gift_card_code: code }],
    });
    expect(sale.statusCode, sale.body).toBe(201);
    expect((await giftCards('GET', `/${issued.json().id}`)).json().balance).toBe(0);

    const detail = await pos('GET', `/sales/${sale.json().id}`);
    const line = detail.json().lines[0];
    // Returning half the line (qty 1 of 2) is a 50% refund, split across
    // BOTH tenders in the same ratio they originally paid with — the gift
    // card should get back exactly half of what it was drawn down by.
    const partial = await pos('POST', `/sales/${sale.json().id}/refund`, { reason: 'Partial', lines: [{ sale_line_id: line.id, qty: 1, disposition: 'restock' }] });
    expect(partial.statusCode, partial.body).toBe(200);
    expect((await giftCards('GET', `/${issued.json().id}`)).json().balance).toBe(50);
  });

  it('writes off a voided card\'s remaining balance with a balanced journal, then refuses to void it again', async () => {
    const issued = await giftCards('POST', '/', { initial_value: 60, method: 'CASH' });
    const id = issued.json().id;
    expect((await giftCards('POST', `/${id}/void`, { reason: 'Card lost' }, junior.token)).statusCode).toBe(403);

    const voided = await giftCards('POST', `/${id}/void`, { reason: 'Card reported lost' });
    expect(voided.statusCode, voided.body).toBe(200);
    expect(voided.json().written_off).toBe(60);
    expect((await giftCards('GET', `/${id}`)).json().status).toBe('void');

    const writeOffTx = await withTenant(owner.tenantId, trx => trx.selectFrom('gift_card_transactions').select('journal_entry_id').where('gift_card_id', '=', id).where('type', '=', 'void_writeoff').executeTakeFirstOrThrow());
    const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', writeOffTx.journal_entry_id!).execute());
    expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);

    expect((await giftCards('POST', `/${id}/void`, { reason: 'Again' })).statusCode).toBe(409);
  });

  it('refuses to redeem a voided card', async () => {
    const issued = await giftCards('POST', '/', { initial_value: 40, method: 'CASH' });
    const code = issued.json().code;
    await giftCards('POST', `/${issued.json().id}/void`, { reason: 'Void before redeem test' });
    const sale = await pos('POST', '/sales', { currency: 'TZS', items: [{ product_id: service, qty: 1 }], payments: [{ method: 'GIFT_CARD', amount: 100, gift_card_code: code }] });
    expect(sale.statusCode).toBe(422);
  });
});
