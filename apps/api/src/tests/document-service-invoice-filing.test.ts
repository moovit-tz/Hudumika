// Functional verification for DocumentService (document.service.ts) and its
// first real caller: invoices.routes.ts filing the real invoice PDF into
// Business Records the moment an invoice is actually issued (Draft → any
// other status) — closing the storage-product review's item 3/4 gap.
// The filing call is fire-and-forget (never allowed to slow down or fail
// the invoice write it rides on — see fileIssuedInvoicePdf's own comment),
// so these tests poll briefly for the resulting cloud_files row rather than
// expecting it synchronously in the HTTP response.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableApps(tenantId: string, apps: Record<string, boolean>) {
  await dbPlatform.insertInto('tenant_settings')
    .values({ tenant_id: tenantId, settings: JSON.stringify({ 'enabled-apps': apps }) as any })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'enabled-apps': apps }) as any }))
    .execute();
}

async function findFiledInvoicePdf(tenantId: string, invoiceId: string) {
  for (let i = 0; i < 20; i++) {
    const row = await withTenant(tenantId, (trx) =>
      trx.selectFrom('cloud_files').selectAll()
        .where('tenant_id', '=', tenantId).where('entity_type', '=', 'invoice').where('entity_id', '=', invoiceId)
        .executeTakeFirst());
    if (row) return row;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

describe('DocumentService — Finance invoice-issuance auto-filing', () => {
  let T: TestTenant;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { finops: true, cloud: true });
  });

  afterAll(async () => { await T.cleanup(); });

  it('a Draft invoice files nothing', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: '/v1/invoices', headers: authHeaders(T.token),
      payload: { status: 'Draft', client_name: 'Draft Only Co' },
    });
    expect(res.statusCode).toBe(201);
    const inv = res.json();

    // No poll needed for a negative — give the (non-existent) fire-and-forget
    // a moment anyway, then assert absence.
    await new Promise(r => setTimeout(r, 300));
    const filed = await withTenant(T.tenantId, (trx) =>
      trx.selectFrom('cloud_files').selectAll()
        .where('tenant_id', '=', T.tenantId).where('entity_type', '=', 'invoice').where('entity_id', '=', inv.id)
        .executeTakeFirst());
    expect(filed).toBeUndefined();
  });

  it('issuing an invoice (non-Draft) auto-files its PDF into Business Records ▸ Finance ▸ <year> ▸ Sales ▸ Invoices', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: '/v1/invoices', headers: authHeaders(T.token),
      payload: { status: 'Unpaid', client_name: 'Real Client Ltd' },
    });
    expect(res.statusCode).toBe(201);
    const inv = res.json();

    const filed = await findFiledInvoicePdf(T.tenantId, inv.id);
    expect(filed).toBeTruthy();
    expect(filed!.name).toBe(`${inv.invoice_number}.pdf`);
    expect(filed!.retention_class).toBe('financial_record');
    expect(filed!.idempotency_key).toBe(`invoice:${inv.id}:issued`);
    expect(filed!.storage_key).toBeTruthy();
    expect(Number(filed!.size)).toBeGreaterThan(0);

    // The folder chain is real and correctly nested — Business Records is
    // the drive, Finance ▸ <year> ▸ Sales ▸ Invoices are real cloud_files
    // folder rows, not a flat dump.
    const drive = await withTenant(T.tenantId, (trx) =>
      trx.selectFrom('cloud_drives').select(['id', 'type']).where('id', '=', filed!.drive_id).executeTakeFirst());
    expect(drive?.type).toBe('business');

    const chain: string[] = [];
    let parentId: string | null = filed!.parent_id;
    while (parentId) {
      const folder = await withTenant(T.tenantId, (trx) =>
        trx.selectFrom('cloud_files').select(['name', 'parent_id', 'type']).where('id', '=', parentId as string).executeTakeFirst());
      if (!folder) break;
      expect(folder.type).toBe('folder');
      chain.unshift(folder.name);
      parentId = folder.parent_id;
    }
    expect(chain).toEqual(['Finance', String(new Date().getFullYear()), 'Sales', 'Invoices']);
  });

  it('re-saving an already-issued invoice does not create a second copy (idempotency)', async () => {
    const app = await getApp();
    const created = await app.inject({
      method: 'POST', url: '/v1/invoices', headers: authHeaders(T.token),
      payload: { status: 'Unpaid', client_name: 'Idempotency Co' },
    });
    const inv = created.json();
    const first = await findFiledInvoicePdf(T.tenantId, inv.id);
    expect(first).toBeTruthy();

    // PATCH without changing status — still non-Draft, fires the filing
    // call again; must resolve to the SAME file, not a duplicate.
    const patched = await app.inject({
      method: 'PATCH', url: `/v1/invoices/${inv.id}`, headers: authHeaders(T.token),
      payload: { status: 'Unpaid', notes: 'a harmless edit' },
    });
    expect(patched.statusCode).toBe(200);
    await new Promise(r => setTimeout(r, 500));

    const all = await withTenant(T.tenantId, (trx) =>
      trx.selectFrom('cloud_files').select('id')
        .where('tenant_id', '=', T.tenantId).where('entity_type', '=', 'invoice').where('entity_id', '=', inv.id)
        .execute());
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(first!.id);
  });

  it('a tenant not entitled to finops gets no filing (and no crash) on invoice creation', async () => {
    const app = await getApp();
    const B = await createTestTenant('TENANT_ADMIN');
    await enableApps(B.tenantId, { finops: false, cloud: true, seal: true }); // 'seal' keeps invoicesRoutes' own gate open so the route itself is reachable
    const res = await app.inject({
      method: 'POST', url: '/v1/invoices', headers: authHeaders(B.token),
      payload: { status: 'Unpaid', client_name: 'Not Entitled Co' },
    });
    expect(res.statusCode).toBe(201); // the invoice itself is unaffected by the filing failure
    const inv = res.json();
    await new Promise(r => setTimeout(r, 400));
    const filed = await withTenant(B.tenantId, (trx) =>
      trx.selectFrom('cloud_files').selectAll()
        .where('tenant_id', '=', B.tenantId).where('entity_type', '=', 'invoice').where('entity_id', '=', inv.id)
        .executeTakeFirst());
    expect(filed).toBeUndefined();
    await B.cleanup();
  });
});
