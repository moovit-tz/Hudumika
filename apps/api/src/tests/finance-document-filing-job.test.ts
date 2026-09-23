// The remaining Finance document types (credit notes, quotations, purchase
// orders, supplier bills) get their PDFs filed by finance-document-filing.
// job.ts — a committed-rows-only sweep, since these documents reach their
// "issued" state through several different routes. Real routes create the
// documents, then the job is invoked directly and the real Drive rows are
// asserted on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
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

    // Credit notes and bills post to the GL when created through their routes,
    // and a throwaway tenant has no chart of accounts — insert the committed
    // rows directly; the sweep only ever reads committed rows.
    const cn = await dbPlatform.insertInto('credit_notes').values({
      tenant_id: T.tenantId, credit_note_number: 'CN-TEST-1', client_name: 'Credited Co', status: 'POSTED',
    } as any).returning('id').executeTakeFirstOrThrow();
    ids.credit_note = cn.id;
    await dbPlatform.insertInto('credit_note_lines').values({
      credit_note_id: cn.id, name: 'Refund', rate: 1000, qty: 2, tax_pct: 18,
    } as any).execute();

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

    const bill = await dbPlatform.insertInto('supplier_bills').values({
      tenant_id: T.tenantId, bill_number: 'BILL-TEST-1', supplier_name: 'Vendor Ltd', status: 'POSTED',
      subtotal: 500, tax_amount: 0, total: 500,
    } as any).returning('id').executeTakeFirstOrThrow();
    ids.bill = bill.id;
    await dbPlatform.insertInto('supplier_bill_lines').values({
      bill_id: bill.id, description: 'Freight', qty: 1, unit_price: 500, tax_rate: 0,
    } as any).execute();

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
    ];
    for (const [entityType, entityId, chain] of expectations) {
      const rows = await filed(T.tenantId, entityType, entityId);
      expect(rows, entityType).toHaveLength(1);
      expect(rows[0].name.endsWith('.pdf')).toBe(true);
      expect(rows[0].retention_class).toBe('financial_record');
      expect(rows[0].idempotency_key).toBe(`${entityType}:${entityId}:issued`);
      expect(Number(rows[0].size)).toBeGreaterThan(500); // a real rendered PDF, not an empty buffer
      expect(await folderChain(T.tenantId, rows[0].parent_id)).toEqual(chain);
    }
    expect(await filed(T.tenantId, 'purchase_order', ids.draft_po)).toHaveLength(0);
  });

  it('running the sweep again files nothing new (idempotent)', async () => {
    await runFinanceDocumentFilingJob();
    for (const [entityType, id] of [['credit_note', ids.credit_note], ['purchase_order', ids.purchase_order], ['bill', ids.bill], ['quotation', ids.quotation]]) {
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
