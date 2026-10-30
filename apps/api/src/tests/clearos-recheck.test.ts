import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dbPlatform, withTenant } from '../db/client.js';
import { ShipmentService } from '../services/shipment.service.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('ClearOS independent recheck evidence', () => {
  let tenant: TestTenant;
  const evidence: Record<string, any> = {};
  beforeAll(async () => {
    tenant = await createTestTenant();
    await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', tenant.tenantId).execute();
  }, 120000);
  afterAll(async () => {
    const dir = resolve(process.cwd(), '../../docs/audits');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'clearos-recheck-evidence.json'), JSON.stringify(evidence, null, 2));
    await tenant?.cleanup();
  }, 120000);
  it('records supported-mode and numeric-prefix behavior', async () => {
    const app = await getApp();
    for (const extra of [{ mode: 'road' }, { mode: 'rail' }, { cif_usd: '10000junk' }]) {
      const r = await app.inject({ method: 'POST', url: '/v1/customs/landed-cost', headers: authHeaders(tenant.token), payload: { hs_code: '10063000', cif_usd: 10000, fx_rate_override: 2500, save_to_history: false, ...extra } });
      const body = r.json();
      evidence[JSON.stringify(extra)] = { status: r.statusCode, mode: body.mode, total: body.total, wharfage: body.wharfage, pid: body.pid };
    }
  });
  it('records pagination totals against filtered results', async () => {
    const customer = await dbPlatform.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Recheck synthetic customer' } as any).returning('id').executeTakeFirstOrThrow();
    await withTenant(tenant.tenantId, trx => trx.insertInto('shipment_cases').values(Array.from({ length: 502 }, (_, i) => ({ tenant_id: tenant.tenantId, customer_id: customer.id, ref_number: `RECHECK-${i}`, type: 'SEA_FCL' as const, goods_desc: i === 501 ? 'outside filter' : 'inside filter', vessel: 'Synthetic', origin_port: 'Synthetic', dest_port: 'Synthetic', containers: '[]' }))).execute());
    const result = await ShipmentService.listGroupedByCustomer(tenant.tenantId, { search: 'inside filter' });
    evidence.pagination = { expectedFilteredTotal: 501, ...result.pagination, returned: result.groups.reduce((n, g) => n + g.shipments.length, 0) };
    expect(evidence.pagination.returned).toBe(500);
  }, 120000);
  it('records compatibility of the real multi-item input contract', async () => {
    const app = await getApp();
    const r = await app.inject({ method: 'POST', url: '/v1/customs/landed-cost/multi-item', headers: authHeaders(tenant.token), payload: {
      items: [{ hs_code: '84713000', description: 'Laptop', qty: 10, unit_price_usd: 100 }],
      freight_usd: 100, insurance_usd: 10, fx_rate_override: 2500, mode: 'sea_fcl', save_to_history: false,
    } });
    evidence.multiItemContract = { status: r.statusCode, body: r.json() };
  });
});
