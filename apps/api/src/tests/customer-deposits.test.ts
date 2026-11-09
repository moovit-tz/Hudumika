import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('Customer deposits — disposable tenant', () => {
  let owner: TestTenant; let junior: { userId: string; token: string }; let other: TestTenant;
  let customer: string; let foreignCustomer: string;
  async function call(method: 'GET' | 'POST', path: string, payload?: object, token = owner.token) {
    return (await getApp()).inject({ method, url: `/v1/customer-credits${path}`, headers: authHeaders(token), ...(payload ? { payload } : {}) });
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    other = await createTestTenant();
    junior = await owner.addUser('JUNIOR');
    for (const t of [owner, other]) {
      await withTenant(t.tenantId, async trx => {
        await trx.insertInto('tenant_settings').values({ tenant_id: t.tenantId, settings: JSON.stringify({ 'enabled-apps': { finops: true }, company: { currency: 'TZS' } }) }).execute();
        await GLService.seedChartOfAccounts(trx, t.tenantId);
      });
    }
    customer = (await withTenant(owner.tenantId, trx => trx.insertInto('customers').values({ tenant_id: owner.tenantId, name: 'Deposit customer' }).returning('id').executeTakeFirstOrThrow())).id;
    foreignCustomer = (await withTenant(other.tenantId, trx => trx.insertInto('customers').values({ tenant_id: other.tenantId, name: 'Foreign customer' }).returning('id').executeTakeFirstOrThrow())).id;
  }, 120000);

  afterAll(async () => {
    for (const t of [owner, other].filter(Boolean)) await t.cleanup();
  }, 120000);

  it('requires finance-tier access to record or refund a deposit', async () => {
    expect((await call('POST', '/', { customer_id: customer, amount: 100, method: 'CASH' }, junior.token)).statusCode).toBe(403);
  });

  it('rejects a deposit for a customer outside the workspace', async () => {
    const result = await call('POST', '/', { customer_id: foreignCustomer, amount: 100, method: 'CASH' });
    expect(result.statusCode).toBe(404);
  });

  it('records a real deposit with a balanced journal entry, distinct from an overpayment credit', async () => {
    const result = await call('POST', '/', { customer_id: customer, amount: 500, method: 'MOBILE_MONEY', note: 'Booking retainer' });
    expect(result.statusCode, result.body).toBe(200);
    const body = result.json();
    expect(body.source_type).toBe('deposit');
    expect(body.received_via).toBe('MOBILE_MONEY');
    expect(body.remaining_amount).toBe(500);

    const lines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', body.journal_entry_id).execute());
    expect(lines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);

    const listed = (await call('GET', `/?customer_id=${customer}`)).json();
    expect(listed.find((c: any) => c.id === body.id).remaining_amount).toBe(500);
  });

  it('refunds part of a deposit, then refuses a refund beyond what remains', async () => {
    const created = await call('POST', '/', { customer_id: customer, amount: 300, method: 'CASH' });
    const creditId = created.json().id;

    const partial = await call('POST', `/${creditId}/refund`, { amount: 120, method: 'CASH', note: 'Partial cancellation' });
    expect(partial.statusCode, partial.body).toBe(200);
    expect(partial.json().remaining_amount).toBe(180);

    const over = await call('POST', `/${creditId}/refund`, { amount: 181, method: 'CASH' });
    expect(over.statusCode).toBe(400);

    const full = await call('POST', `/${creditId}/refund`, { amount: 180, method: 'CASH' });
    expect(full.statusCode, full.body).toBe(200);
    expect(full.json().remaining_amount).toBe(0);

    const listed = (await call('GET', `/?customer_id=${customer}`)).json();
    const row = listed.find((c: any) => c.id === creditId);
    expect(row.refunded_amount).toBe(300);
    expect(row.remaining_amount).toBe(0);

    const refunds = await withTenant(owner.tenantId, trx => trx.selectFrom('customer_credit_refunds').select('journal_entry_id').where('credit_id', '=', creditId).execute());
    for (const r of refunds) {
      if (!r.journal_entry_id) continue;
      const jLines = await withTenant(owner.tenantId, trx => trx.selectFrom('journal_lines').select(['debit', 'credit']).where('journal_entry_id', '=', r.journal_entry_id!).execute());
      expect(jLines.reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0)).toBeCloseTo(0, 6);
    }
  });

  it('applies a deposit to an invoice through the same /apply path overpayment credits already use, then refuses a refund beyond what applying left', async () => {
    const created = await call('POST', '/', { customer_id: customer, amount: 1000, method: 'BANK' });
    const creditId = created.json().id;

    const invoiceId = await withTenant(owner.tenantId, async trx => {
      const inv = await trx.insertInto('sales_invoices').values({ tenant_id: owner.tenantId, invoice_number: `DEP-${randomUUID().slice(0, 8)}`, customer_id: customer, client_name: 'Deposit customer', status: 'Unpaid', currency: 'TZS', exchange_rate: 1, received: 0 } as any).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('sales_invoice_lines').values({ invoice_id: inv.id, name: 'Deposit-backed job', qty: 1, rate: 600, tax_pct: 0, currency: 'TZS' } as any).execute();
      return inv.id;
    });

    const apply = await (await getApp()).inject({ method: 'POST', url: `/v1/customer-credits/${creditId}/apply`, headers: authHeaders(owner.token), payload: { invoice_id: invoiceId, amount: 600 } });
    expect(apply.statusCode, apply.body).toBe(200);
    expect(apply.json().invoice_status).toBe('Paid');

    const afterApply = (await call('GET', `/?customer_id=${customer}`)).json().find((c: any) => c.id === creditId);
    expect(afterApply.remaining_amount).toBe(400);

    expect((await call('POST', `/${creditId}/refund`, { amount: 401, method: 'BANK' })).statusCode).toBe(400);
    const refund = await call('POST', `/${creditId}/refund`, { amount: 400, method: 'BANK' });
    expect(refund.statusCode, refund.body).toBe(200);
    expect(refund.json().remaining_amount).toBe(0);
  });
});
