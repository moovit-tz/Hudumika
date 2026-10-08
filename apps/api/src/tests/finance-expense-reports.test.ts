import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';

describe('Expense reports and close reviews', () => {
  let tenant: TestTenant; let other: TestTenant; let reviewer: { userId: string; token: string };
  beforeAll(async () => {
    await getApp(); tenant = await createTestTenant('SALES'); other = await createTestTenant(); reviewer = await tenant.addUser('FINANCE');
    await withTenant(tenant.tenantId, async trx => {
      await GLService.seedChartOfAccounts(trx, tenant.tenantId);
      await trx.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { finops: true, 'finance.accounting.advanced': true } }) }).execute();
      await trx.insertInto('tenant_finance_capabilities').values({ tenant_id: tenant.tenantId, capability_key: 'finance.accounting.advanced', enabled: true }).execute();
    });
  }, 120000);
  afterAll(async () => {
    for (const current of [tenant, other].filter(Boolean)) {
      await withTenant(current.tenantId, async trx => {
        await trx.deleteFrom('finance_tax_preparations').where('tenant_id', '=', current.tenantId).execute();
        await trx.deleteFrom('finance_close_reviews').where('tenant_id', '=', current.tenantId).execute();
        await trx.deleteFrom('finance_expense_report_items').where('tenant_id', '=', current.tenantId).execute();
        await trx.deleteFrom('finance_expenses').where('tenant_id', '=', current.tenantId).execute();
        await trx.deleteFrom('finance_expense_reports').where('tenant_id', '=', current.tenantId).execute();
      });
      await current.cleanup();
    }
  }, 120000);
  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object, token = tenant.token) {
    return (await getApp()).inject({ method, url: path, payload, headers: authHeaders(token) });
  }
  it('requires evidence, independent approval and records reimbursement exactly once', async () => {
    const created = await call('POST', '/v1/finance/expense-reports', { name: 'Client visit' }); expect(created.statusCode, created.body).toBe(201); const id = created.json().id; const path = `/v1/finance/expense-reports/${id}`;
    expect((await call('POST', `${path}/submit`)).statusCode).toBe(422);
    const receipt = `data:image/png;base64,${Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=', 'base64'), Buffer.from(randomUUID())]).toString('base64')}`;
    const item = { name: 'Taxi', category: 'TRANSPORT', amount: 15000, expense_date: '2026-10-07', receipt_data: receipt };
    const customer = await withTenant(tenant.tenantId, trx => trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Shared CRM customer' }).returning('id').executeTakeFirstOrThrow());
    const vendorResponse = await call('POST', '/v1/suppliers', { name: 'Shared CRM vendor' }); expect(vendorResponse.statusCode, vendorResponse.body).toBe(201); const vendorId = vendorResponse.json().id;
    const foreignVendor = await withTenant(other.tenantId, trx => trx.insertInto('suppliers').values({ tenant_id: other.tenantId, name: 'Other vendor', contact_name: null, email: null, phone: null, address: null, city: null, country: 'Tanzania', tax_id: null, category: 'other', currency: 'TZS', payment_terms: 'net_30', status: 'active', bank_name: null, bank_account: null, notes: null, created_by: other.userId }).returning('id').executeTakeFirstOrThrow());
    expect((await call('POST', `${path}/items`, { ...item, supplier_id: foreignVendor.id })).statusCode).toBe(422);
    expect((await call('POST', `${path}/items`, { ...item, supplier_id: vendorId, customer_id: customer.id })).statusCode).toBe(201);
    expect((await call('PATCH', `/v1/suppliers/${vendorId}`, { name: 'Updated shared vendor' })).statusCode).toBe(200);
    expect((await call('GET', path)).json().items[0].supplier_name).toBe('Updated shared vendor');
    expect((await call('POST', `${path}/items`, item)).statusCode).toBe(409);
    expect((await call('GET', path, undefined, other.token)).statusCode).toBe(404);
    expect((await call('POST', `${path}/submit`)).statusCode).toBe(200);
    const approval = { approve: true, note: 'Receipt and business purpose checked' };
    const approvals = await Promise.all([call('POST', `${path}/review`, approval, reviewer.token), call('POST', `${path}/review`, approval, reviewer.token)]);
    expect(approvals.map(result => result.statusCode).sort()).toEqual([200, 409]);
    const report = (await call('GET', path)).json();
    const linked = await withTenant(tenant.tenantId, trx => trx.selectFrom('finance_expenses').select(['customer_id','supplier_id']).where('tenant_id', '=', tenant.tenantId).where('id', '=', report.items[0].expense_id).executeTakeFirstOrThrow());
    expect(linked.customer_id).toBe(customer.id); expect(linked.supplier_id).toBe(vendorId);
    expect((await call('PATCH', `/v1/finance/expenses/${report.items[0].expense_id}`, { amount: 9999 }, reviewer.token)).statusCode).toBe(404);
    const entries = await withTenant(tenant.tenantId, trx => trx.selectFrom('journal_entries').select('id').where('tenant_id', '=', tenant.tenantId).where('source_id', '=', report.items[0].expense_id).execute()); expect(entries).toHaveLength(1);
    const payments = await Promise.all([call('POST', `${path}/reimburse`, { reference: 'BANK-123', date: '2026-10-07' }, reviewer.token), call('POST', `${path}/reimburse`, { reference: 'BANK-123', date: '2026-10-07' }, reviewer.token)]);
    expect(payments.map(result => result.statusCode).sort()).toEqual([200, 409]);
    expect((await call('GET', path)).json().status).toBe('reimbursed');
  }, 120000);
  it('shares the vendor master with CRM-only tenants without granting Finance access', async () => {
    await withTenant(other.tenantId, trx => trx.insertInto('tenant_settings').values({ tenant_id: other.tenantId, settings: JSON.stringify({ 'enabled-apps': { crm: true, finops: false } }) }).execute());
    const vendor = await call('POST', '/v1/suppliers', { name: 'CRM master only' }, other.token); expect(vendor.statusCode, vendor.body).toBe(201);
    const page = await call('GET', '/v1/suppliers?page=1&search=CRM&limit=20', undefined, other.token);
    expect(page.statusCode, page.body).toBe(200); expect(page.json().data[0].id).toBe(vendor.json().id);
    expect((await call('GET', '/v1/finance/expense-reports', undefined, other.token)).statusCode).toBe(403);
  }, 120000);
  it('stores close sign-off and blocks it when bank evidence is unresolved', async () => {
    const period = await withTenant(tenant.tenantId, trx => trx.insertInto('gl_periods').values({ tenant_id: tenant.tenantId, name: 'October', period_start: '2026-10-01', period_end: '2026-10-31', closing_entry_id: null, closed_at: null, closed_by: null, reopened_at: null, reopened_by: null, reopen_reason: null }).returning('id').executeTakeFirstOrThrow());
    const path = `/v1/finance/gl-periods/${period.id}/review`;
    expect((await call('POST', `/v1/finance/gl-periods/${period.id}/close`, undefined, reviewer.token)).statusCode).toBe(409);
    expect((await call('GET', path, undefined, reviewer.token)).statusCode).toBe(200);
    const checklist = Object.fromEntries(['banking', 'receivables', 'payables', 'inventory', 'payroll', 'tax', 'adjustments'].map(key => [key, true]));
    expect((await call('POST', path, { checklist, note: 'Reviewed period' }, reviewer.token)).statusCode).toBe(201);
    await GLService.post(tenant.tenantId, { entryDate: '2026-10-07', sourceModule: 'MANUAL', description: 'New adjustment after review', createdBy: reviewer.userId, lines: [{ accountCode: '5900', debit: 100, credit: 0 }, { accountCode: '2100', debit: 0, credit: 100 }] });
    expect((await call('POST', `/v1/finance/gl-periods/${period.id}/close`, undefined, reviewer.token)).statusCode).toBe(409);
    await withTenant(tenant.tenantId, async trx => {
      const statement = await trx.insertInto('bank_statements').values({ tenant_id: tenant.tenantId, bank_name: 'Test bank', statement_date_from: '2026-10-01', statement_date_to: '2026-10-31', imported_by: reviewer.userId }).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('bank_statement_lines').values({ bank_statement_id: statement.id, txn_date: '2026-10-07', description: 'Unmatched payment', amount: -100, matched_journal_line_id: null, matched_at: null, matched_by: null }).execute();
    });
    const diagnostics = await call('GET', path, undefined, reviewer.token); expect(diagnostics.json().blocked).toBe(true);
    expect((await call('POST', path, { checklist, note: 'Still unresolved' }, reviewer.token)).statusCode).toBe(409);
  }, 120000);
  it('requires registration, independent tax review and a current source snapshot', async () => {
    const period = await call('POST','/v1/vat-periods',{ period_start:'2026-10-01',period_end:'2026-10-31',jurisdiction:'TZ' },reviewer.token);
    expect(period.statusCode,period.body).toBe(201); const id = period.json().id; const path = `/v1/vat-periods/${id}/preparation`;
    const checks = Object.fromEntries(['jurisdiction','registration','sales','purchases','currency','reconciliation'].map(key => [key,true]));
    expect((await call('POST',path,{ checks,evidence_note:'Reviewed sources' },reviewer.token)).statusCode).toBe(409);
    await withTenant(tenant.tenantId,trx => trx.insertInto('tax_registrations').values({ tenant_id:tenant.tenantId,jurisdiction:'TZ',status:'registered',registration_number:'TEST-VRN',basis:'VOLUNTARY',registered_from:'2026-01-01',registered_to:null,notes:'Test fixture registration' }).execute());
    const prepared = await call('POST',path,{ checks,evidence_note:'Sources and effective registration checked' },reviewer.token); expect(prepared.statusCode,prepared.body).toBe(201);
    const reviewPath = `${path}/${prepared.json().id}/review`;
    expect((await call('POST',reviewPath,{ approve:true,note:'Checked' },reviewer.token)).statusCode).toBe(403);
    const accountant = await tenant.addUser('FINANCE');
    await GLService.post(tenant.tenantId,{ entryDate:'2026-10-07',sourceModule:'MANUAL',description:'New VAT adjustment',createdBy:reviewer.userId,lines:[{ accountCode:'1010',debit:20,credit:0 },{ accountCode:'2200',debit:0,credit:20 }] });
    expect((await call('POST',reviewPath,{ approve:true,note:'Checked' },accountant.token)).statusCode).toBe(409);
    const fresh = await call('POST',path,{ checks,evidence_note:'Adjustment reconciled to sources' },reviewer.token); expect(fresh.statusCode,fresh.body).toBe(201);
    expect((await call('POST',`${path}/${fresh.json().id}/review`,{ approve:true,note:'Independent review with documented adjustment' },accountant.token)).statusCode).toBe(200);
    expect((await call('GET',path,undefined,accountant.token)).json().preparations.some((row:{ status:string; current:boolean }) => row.status === 'approved' && row.current)).toBe(true);
    expect((await call('GET',path,undefined,other.token)).statusCode).toBe(403);
    await withTenant(other.tenantId, trx => trx.updateTable('tenant_settings').set({ settings: JSON.stringify({ 'enabled-apps': { crm: true, finops: true } }) }).where('tenant_id', '=', other.tenantId).execute());
    expect((await call('GET',path,undefined,other.token)).statusCode).toBe(404);
  },120000);
});
