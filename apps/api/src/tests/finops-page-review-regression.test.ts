import { beforeAll, afterAll, expect, it } from 'vitest';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';
import { withTenant } from '../db/client.js';

let tenant: TestTenant;
let other: TestTenant;
beforeAll(async () => {
  tenant = await createTestTenant('SUPER_ADMIN');
  other = await createTestTenant('SUPER_ADMIN');
  await withTenant(tenant.tenantId, async trx => {
    await trx.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { 'finance.consolidation': true } }) }).execute();
    await trx.insertInto('tenant_finance_capabilities').values({ tenant_id: tenant.tenantId, capability_key: 'finance.consolidation', enabled: true }).execute();
    await trx.insertInto('accounting_entities').values([
      { tenant_id: tenant.tenantId, name: 'Active entity', entity_code: 'A', currency: 'TZS', active: true },
      { tenant_id: tenant.tenantId, name: 'Inactive entity', entity_code: 'B', currency: 'USD', active: false },
    ]).execute();
  });
  await withTenant(other.tenantId, trx => trx.insertInto('accounting_entities').values({ tenant_id: other.tenantId, name: 'Other workspace', entity_code: 'A', currency: 'KES', active: true }).execute());
}, 120000);
afterAll(async () => {
  if (tenant) await tenant.cleanup();
  if (other) await other.cleanup();
}, 120000);

it('reads multi-entity metrics from the real accounting tables and isolates tenants', async () => {
  const response = await (await getApp()).inject({ method: 'GET', url: '/v1/finance/entities/stats', headers: authHeaders(tenant.token) });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ entities: 2, active: 1, currencies: 2, transactions: 0 });
});

it('renders zero cash flow for a new workspace without cash accounts', async () => {
  const response = await (await getApp()).inject({ method: 'GET', url: '/v1/finance/cash-flow?from=2026-11-01&to=2026-11-08', headers: authHeaders(tenant.token) });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ opening_cash: 0, closing_cash: 0, totals: { operating: 0, investing: 0, financing: 0, net: 0 } });
});

it.each([
  '/v1/finance/capabilities/configuration', '/v1/products', '/v1/products/stats',
  '/v1/bills', '/v1/bills/stats', '/v1/bills/recurring', '/v1/bills/payments',
  '/v1/finance/expenses', '/v1/finance/expenses/stats', '/v1/finance/expense-reports',
  '/v1/invoices', '/v1/quotations', '/v1/quotations/stats',
])('new-workspace page data does not fail: %s', async url => {
  const response = await (await getApp()).inject({ method: 'GET', url, headers: authHeaders(tenant.token) });
  expect(response.statusCode, JSON.stringify(response.json())).toBeLessThan(500);
});
