// The remaining Finance document types (credit notes, quotations, purchase
// orders, supplier bills) get their PDFs filed by finance-document-filing.
// job.ts — a committed-rows-only sweep, since these documents reach their
// "issued" state through several different routes. Real routes create the
// documents, then the job is invoked directly and the real Drive rows are
// asserted on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { runFinanceDocumentFilingJob } from '../jobs/finance-document-filing.job.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableApps(tenantId: string, apps: Record<string, boolean>) {
  await dbPlatform.insertInto('tenant_settings')
    .values({ tenant_id: tenantId, settings: JSON.stringify({ 'enabled-apps': apps }) as any })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'enabled-apps': apps }) as any }))
    .execute();
}

async function folderChain(tenantId: string, parentId: string | null): Promise<string[]> {
  const chain: string[] = [];
  while (parentId) {
    const f = await withTenant(tenantId, (trx) =>
      trx.selectFrom('cloud_files').select(['name', 'parent_id']).where('id', '=', parentId as string).executeTakeFirst());
    if (!f) break;
    chain.unshift(f.name);
    parentId = f.parent_id;
  }
  return chain;
}

const filed = (tenantId: string, entityType: string, entityId: string) =>
  withTenant(tenantId, (trx) =>
    trx.selectFrom('cloud_files').selectAll()
      .where('tenant_id', '=', tenantId).where('entity_type', '=', entityType).where('entity_id', '=', entityId)
      .execute());

describe('Finance document filing sweep — credit notes, quotations, purchase orders, bills', () => {
  let T: TestTenant;
  const ids: Record<string, string> = {};
  const year = String(new Date().getFullYear());

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { finops: true, cloud: true });
    const app = await getApp();

    // Credit notes, bills, fixed assets and period close post to the GL, so the
    // tenant needs a chart of accounts — seeded the way onboarding does it.
    await withTenant(T.tenantId, (trx) => GLService.seedChartOfAccounts(trx, T.tenantId));

    const cn = await app.inject({
      method: 'POST', url: '/v1/credit-notes', headers: authHeaders(T.token),
      payload: { client_name: 'Credited Co', reason: 'Returned goods', items: [{ name: 'Refund', rate: 1000, qty: 2, tax_pct: 18 }] },
    });
    expect(cn.statusCode, cn.body).toBe(201);
    ids.credit_note = cn.json().id;

    const po = await app.inject({
      method: 'POST', url: '/v1/purchase-orders', headers: authHeaders(T.token),
      payload: { status: 'SENT', supplier_name: 'Supplier Ltd', lines: [{ description: 'Pallets', qty: 10, unit_price: 50, tax_rate: 18 }] },
    });
    expect(po.statusCode).toBe(201);
    ids.purchase_order = po.json().id;

    const draftPo = await app.inject({
      method: 'POST', url: '/v1/purchase-orders', headers: authHeaders(T.token),
      payload: { status: 'DRAFT', supplier_name: 'Draft Supplier', lines: [{ description: 'x', qty: 1, unit_price: 1, tax_rate: 0 }] },
    });
    ids.draft_po = draftPo.json().id;

    const bill = await app.inject({
      method: 'POST', url: '/v1/bills', headers: authHeaders(T.token),
      payload: { supplier_name: 'Vendor Ltd', status: 'POSTED', currency: 'TZS', items: [{ description: 'Freight', qty: 1, unit_price: 500, tax_rate: 0 }] },
    });
    expect(bill.statusCode, bill.body).toBe(201);
    ids.bill = bill.json().id;

    const expense = await app.inject({
      method: 'POST', url: '/v1/finance/expenses', headers: authHeaders(T.token),
      payload: { name: 'Fuel', amount: 75000, category: 'FUEL', payment_mode: 'CASH' },
    });
    expect(expense.statusCode, expense.body).toBe(201);
    ids.expense = expense.json().id;

    const asset = await app.inject({
      method: 'POST', url: '/v1/fixed-assets', headers: authHeaders(T.token),
      payload: { name: 'Forklift', acquisition_date: new Date().toISOString().slice(0, 10), cost: 12000000, useful_life_months: 60 },
    });
    expect(asset.statusCode, asset.body).toBe(201);
    ids.fixed_asset = asset.json().id;

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';
    // Close a *past* month: closing today's would (correctly) block the
    // postings below, and the sweep keys on closed_at, not the period dates.
    const prevEnd = new Date(new Date(monthStart).getTime() - 86400000).toISOString().slice(0, 10);
    const prevStart = prevEnd.slice(0, 8) + '01';
    const period = await app.inject({
      method: 'POST', url: '/v1/finance/gl-periods', headers: authHeaders(T.token),
      payload: { name: 'Test month', period_type: 'MONTH', period_start: prevStart, period_end: prevEnd },
    });
    expect(period.statusCode, period.body).toBe(201);
    const closed = await app.inject({ method: 'POST', url: `/v1/finance/gl-periods/${period.json().id}/close`, headers: authHeaders(T.token), payload: {} });
    expect(closed.statusCode, closed.body).toBe(200);
    ids.gl_period = period.json().id;

    // Multi-step flows (payment allocation, bank-statement CSV upload, return
    // computation + filing) reach their final state through several routes;
    // the sweep only reads the committed final row, so those are inserted.
    const inv = await app.inject({
      method: 'POST', url: '/v1/invoices', headers: authHeaders(T.token),
      payload: { client_name: 'Payer Co', status: 'Unpaid', items: [{ name: 'Service', rate: 1000, qty: 1, tax_pct: 0 }] },
    });
    expect(inv.statusCode, inv.body).toBe(201);
    const pay = await dbPlatform.insertInto('invoice_payments').values({
      tenant_id: T.tenantId, invoice_id: inv.json().id, amount: 1000, method: 'CASH', payment_date: today,
    } as any).returning('id').executeTakeFirstOrThrow();
    ids.invoice_payment = pay.id;
    const bpay = await dbPlatform.insertInto('bill_payments').values({
      tenant_id: T.tenantId, bill_id: ids.bill, amount: 500, currency: 'TZS', method: 'BANK', payment_date: today,
    } as any).returning('id').executeTakeFirstOrThrow();
    ids.bill_payment = bpay.id;
    const stmt = await dbPlatform.insertInto('bank_statements').values({
      tenant_id: T.tenantId, account_code: '1010', bank_name: 'NMB', statement_date_from: monthStart, statement_date_to: today,
      opening_balance: 0, closing_balance: 1000,
    } as any).returning('id').executeTakeFirstOrThrow();
    ids.bank_statement = stmt.id;
    await dbPlatform.insertInto('bank_statement_lines').values({ bank_statement_id: stmt.id, txn_date: today, description: 'Deposit', amount: 1000 } as any).execute();

    // Quotations are approved through a multi-step service flow; the sweep
    // only cares about the resulting committed row, so insert one directly.
    const cust = await dbPlatform.insertInto('customers').values({ tenant_id: T.tenantId, name: 'Quoted Customer' } as any).returning('id').executeTakeFirstOrThrow();
    const q = await dbPlatform.insertInto('quotations').values({
      tenant_id: T.tenantId, quote_number: 'Q-TEST-1', customer_id: cust.id, title: 'Test quote', shipment_type: 'FCL',
      subtotal: 100, tax_amount: 18, total_amount: 118, currency: 'TZS', status: 'APPROVED',
    } as any).returning('id').executeTakeFirstOrThrow();
    ids.quotation = q.id;
    await dbPlatform.insertInto('quotation_lines').values({
      quotation_id: q.id, line_number: 1, description: 'Ocean freight', category: 'freight', quantity: 1,
      unit_price: 100, tax_rate: 18, tax_amount: 18, line_total: 118,
    } as any).execute();
  });

  afterAll(async () => { await T.cleanup(); });

  it('files each issued document type into its own Finance ▸ <year> folder, and skips a Draft PO', async () => {
    await runFinanceDocumentFilingJob();

    const expectations: [string, string, string[]][] = [
      ['credit_note', ids.credit_note, ['Finance', year, 'Sales', 'Credit Notes']],
      ['purchase_order', ids.purchase_order, ['Finance', year, 'Purchases', 'Purchase Orders']],
      ['bill', ids.bill, ['Finance', year, 'Purchases', 'Bills']],
      ['quotation', ids.quotation, ['Finance', year, 'Sales', 'Quotations']],
      ['expense', ids.expense, ['Finance', year, 'Expenses']],
      ['fixed_asset', ids.fixed_asset, ['Finance', year, 'Fixed Assets']],
      ['gl_period', ids.gl_period, ['Finance', year, 'Reports']],
      ['invoice_payment', ids.invoice_payment, ['Finance', year, 'Payments', 'Incoming']],
      ['bill_payment', ids.bill_payment, ['Finance', year, 'Payments', 'Outgoing']],
      ['bank_statement', ids.bank_statement, ['Finance', year, 'Banking']],
    ];
    for (const [entityType, entityId, chain] of expectations) {
      const rows = await filed(T.tenantId, entityType, entityId);
      expect(rows, entityType).toHaveLength(1);
      expect(rows[0].name.endsWith('.pdf')).toBe(true);
      expect(rows[0].retention_class).toBe('financial_record');
      const suffix: Record<string, string> = { fixed_asset: 'registered', bank_statement: 'imported', gl_period: 'closed' };
      expect(rows[0].idempotency_key).toBe(`${entityType}:${entityId}:${suffix[entityType] ?? 'issued'}`);
      expect(Number(rows[0].size)).toBeGreaterThan(500); // a real rendered PDF, not an empty buffer
      expect(await folderChain(T.tenantId, rows[0].parent_id)).toEqual(chain);
    }
    expect(await filed(T.tenantId, 'purchase_order', ids.draft_po)).toHaveLength(0);
  });

  it('running the sweep again files nothing new (idempotent)', async () => {
    await runFinanceDocumentFilingJob();
    for (const [entityType, id] of [['credit_note', ids.credit_note], ['purchase_order', ids.purchase_order], ['bill', ids.bill], ['quotation', ids.quotation],
      ['expense', ids.expense], ['fixed_asset', ids.fixed_asset], ['gl_period', ids.gl_period], ['invoice_payment', ids.invoice_payment],
      ['bill_payment', ids.bill_payment], ['bank_statement', ids.bank_statement]]) {
      expect(await filed(T.tenantId, entityType, id), entityType).toHaveLength(1);
    }
  });

  it('a tenant without finops gets nothing filed by the sweep', async () => {
    const app = await getApp();
    const B = await createTestTenant('TENANT_ADMIN');
    await enableApps(B.tenantId, { finops: true, cloud: true });
    const po = await app.inject({
      method: 'POST', url: '/v1/purchase-orders', headers: authHeaders(B.token),
      payload: { status: 'SENT', supplier_name: 'S', lines: [{ description: 'x', qty: 1, unit_price: 1, tax_rate: 0 }] },
    });
    expect(po.statusCode).toBe(201);
    await enableApps(B.tenantId, { finops: false, cloud: true });
    await runFinanceDocumentFilingJob();
    expect(await filed(B.tenantId, 'purchase_order', po.json().id)).toHaveLength(0);
    await B.cleanup();
  });
});
