import { beforeAll, afterAll, it, expect } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { FINANCE_CAPABILITY_KEYS } from '@hudumika/types';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';

let tenant: TestTenant;
beforeAll(async () => {
  tenant = await createTestTenant('FINANCE');
  await withTenant(tenant.tenantId, async trx => {
    await GLService.seedChartOfAccounts(trx, tenant.tenantId);
    await trx.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { finops: true, crm: true, nexushr: true, petti: true, ...Object.fromEntries(FINANCE_CAPABILITY_KEYS.map(key => [key, true])) } }) }).execute();
    await trx.insertInto('tenant_finance_capabilities').values(FINANCE_CAPABILITY_KEYS.map(capability_key => ({ tenant_id: tenant.tenantId, capability_key, enabled: true }))).execute();
  });
}, 120000);
afterAll(async () => { if (tenant) await tenant.cleanup(); }, 120000);

it('Finance page read APIs return usable data or an explicit access/validation response, never an internal error', async () => {
  const app = await getApp();
  const inventory = JSON.parse(await readFile('../../docs/finance/PAGE_AUDIT_INVENTORY.json', 'utf8')) as { pages: { apiCalls: string[] }[] };
  const candidates = [...new Set(inventory.pages.flatMap(page => page.apiCalls))].filter(path => path.startsWith('/v1/') && !/[${}]/.test(path));
  const results: { path: string; status: number; error?: string }[] = [];
  for (const path of candidates) {
    if (!app.hasRoute({ method: 'GET', url: path.split('?')[0] })) continue;
    const response = await app.inject({ method: 'GET', url: path, headers: authHeaders(tenant.token) });
    results.push({ path, status: response.statusCode, ...(response.statusCode >= 400 ? { error: response.json().error } : {}) });
  }
  await writeFile('../../docs/finance/PAGE_API_AUDIT_RESULTS.json', JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'Read-only requests using a disposable Finance tenant. No transaction mutations, external-provider syncs or statutory filings were exercised.', results }, null, 2) + '\n');
  expect(results.filter(result => result.status >= 500), JSON.stringify(results.filter(result => result.status >= 500))).toEqual([]);
  expect(results.length).toBeGreaterThan(30);
}, 120000);
