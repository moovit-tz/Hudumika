import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { dbPlatform, withTenant } from '../db/client.js';
import { calculateLandedCost, calculateMultiItemLandedCost, calculatePenalty, getHsCode } from '../services/customs.service.js';
import { calculateLclAdvanced, calculateAirAdvanced, calculateTransit } from '../services/advanced-calculators.service.js';
import { authHeaders, createTestTenant, getApp, grantStandaloneProduct, type TestTenant } from './helpers.js';
import { WorkflowService } from '../services/workflow.service.js';
import { demurrageService } from '../services/demurrage.service.js';

// Audit probes record current behavior, including defects, without endorsing it.
describe('ClearOS audit matrix', () => {
  let tenant: TestTenant;
  const evidence: Record<string, any> = { measuredAt: new Date().toISOString(), calculations: [], probes: {}, load: [] };
  beforeAll(async () => {
    tenant = await createTestTenant();
    await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', tenant.tenantId).execute();
    await grantStandaloneProduct(tenant.tenantId, 'clearos');
  }, 120000);
  afterAll(async () => {
    const folder = resolve(process.cwd(), '../../docs/audits');
    mkdirSync(folder, { recursive: true });
    writeFileSync(resolve(folder, 'clearos-audit-evidence.json'), JSON.stringify(evidence, null, 2));
    await tenant?.cleanup();
  }, 120000);

  it('checks arithmetic across modes, commodities, overrides, and mixed invoices', async () => {
    const codes = ['10063000', '30049000', '84713000', '87032390', '64029900', 'UNKNOWN-AUDIT'];
    for (const hs_code of codes) {
      const hs = await getHsCode(hs_code);
      for (const mode of ['sea_fcl', 'sea_lcl', 'air'] as const) {
        for (const tax of ['tariff', 'zero', 'override'] as const) {
          const rate_overrides = tax === 'zero' ? { duty_rate: 0, vat_rate: 0, rdl_rate: 0, cpf_rate: 0 } : tax === 'override' ? { duty_rate: 10, vat_rate: 18, rdl_rate: 2, cpf_rate: 1 } : undefined;
          const t = performance.now();
          const r = await calculateLandedCost({ hs_code, mode, cif_usd: 11000, fob_usd: 10000, freight_usd: 900, insurance_usd: 100, fx_rate_override: 2500, qty: 10, cbm: 12, weight_kg: 2000, containers: [{ size: '20ft', count: 1 }, { size: '40ft', count: 2 }], rate_overrides });
          expect(Number.isFinite(r.total)).toBe(true);
          expect(r.total).toBeGreaterThanOrEqual(r.cif_tzs);
          expect(r.duty).toBeCloseTo(r.cif_tzs * r.duty_rate / 100, 5);
          expect(r.per_unit * r.qty).toBeCloseTo(r.total, 4);
          evidence.calculations.push({ engine: 'main', hs_code, found: !!hs, mode, tax, total: r.total, duty: r.duty, excise: r.excise, ms: performance.now() - t });
        }
      }
      const common = { hs_code, fob_usd: 10000, freight_usd: 900, insurance_usd: 100, fx_rate_override: 2500, cbm: 12 };
      const lcl = await calculateLclAdvanced(common);
      const air = await calculateAirAdvanced({ hs_code, fob: 10000, freight: 900, insurance: 100, weight_kg: 2000, fx_rate_override: 2500 });
      for (const r of [lcl, air]) {
        expect(r.grand_total_tzs).toBeCloseTo(r.cif_tzs + r.statutory_total_tzs + r.charges_total_tzs, 4);
        evidence.calculations.push({ engine: r.mode, hs_code, total: r.grand_total_tzs, warnings: r.warnings });
      }
    }
    for (const container_size of ['20ft', '40ft'] as const) {
      for (const destination of ['Zambia', 'Rwanda', 'UNKNOWN-AUDIT']) {
        const r = await calculateTransit(tenant.tenantId, { destination, container_size, num_containers: 2, fob_usd: 10000, fx_rate_override: 2500 });
        expect(r.statutory_total).toBe(0);
        expect(Number.isFinite(r.grand_total_tzs)).toBe(true);
        evidence.calculations.push({ engine: 'transit', destination, container_size, total: r.grand_total_tzs, warnings: r.warnings });
      }
    }
    for (const mode of ['sea_fcl', 'sea_lcl', 'air'] as const) {
      const r = await calculateMultiItemLandedCost({ mode, freight_usd: 1000, insurance_usd: 100, fx_rate_override: 2500, cbm: 20, weight_kg: 3000, items: codes.slice(0, 4).map(hs_code => ({ hs_code, description: hs_code, qty: 10, unit_price_usd: 100 })) });
      evidence.calculations.push({ engine: 'multi', mode, result: r });
    }
  }, 120000);

  it('records boundary, authorization, and misleading-result probes', async () => {
    const app = await getApp();
    const headers = authHeaders(tenant.token);
    const probes: Record<string, any> = evidence.probes;
    const base = { hs_code: 'UNKNOWN-AUDIT', cif_usd: 10000, fx_rate_override: 2500, save_to_history: false };
    for (const [name, extra] of Object.entries({ negative_fx: { fx_rate_override: -1 }, zero_qty: { qty: 0 }, invalid_mode: { mode: 'road' }, negative_fob: { fob_usd: -1000 }, malformed_weight: { weight_kg: 'abc' } })) {
      const r = await app.inject({ method: 'POST', url: '/v1/customs/landed-cost', headers, payload: { ...base, ...extra } });
      probes[name] = { status: r.statusCode, body: r.json() };
    }
    const air = { hs_code: 'UNKNOWN-AUDIT', fob: 10000, weight_kg: 1000, fx_rate_override: 2500 };
    const noStorage = await calculateAirAdvanced({ ...air, storage_applicable: false });
    const storage = await calculateAirAdvanced({ ...air, storage_applicable: true });
    probes.air_storage_delta_tzs = storage.grand_total_tzs - noStorage.grand_total_tzs;
    for (const violation_type of ['under_declaration', 'misclassification', 'late_payment', 'no_pvoc', 'no_di', 'prohibited_goods'] as const) {
      probes[`penalty_${violation_type}`] = await calculatePenalty({ violation_type, hs_code: 'UNKNOWN-AUDIT', declared_hs: 'UNKNOWN-A', actual_hs: 'UNKNOWN-B', declared_value_usd: 0, actual_value_usd: 10000, late_months: 3, fx_rate: 2500 });
    }
    const sales = await tenant.addUser('SALES');
    const routeWrite = await app.inject({ method: 'POST', url: '/v1/customs/transit-routes', headers: authHeaders(sales.token), payload: { destination: 'AUDIT-SALES-WRITE', distance_km: 1, transport_20ft_usd: 1, transport_40ft_usd: 1, weighbridge_count: 1 } });
    probes.sales_can_edit_transit_rates = { status: routeWrite.statusCode };
    const customer = await tenant.addUser('CUSTOMER');
    for (const url of ['/v1/shipments/grouped', '/v1/customs/transit-routes', '/v1/customs/landed-cost/history']) {
      const r = await app.inject({ method: 'GET', url, headers: authHeaders(customer.token) });
      probes[`customer_${url}`] = { status: r.statusCode };
    }
    const anonymous = await app.inject({ method: 'GET', url: '/v1/shipments/grouped' });
    expect(anonymous.statusCode).toBe(401);
    probes.anonymous_grouped = anonymous.statusCode;
  }, 120000);

  it('measures grouped responses on a disposable 2000-shipment tenant', async () => {
    const customer = await dbPlatform.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Audit synthetic customer' } as any).returning('id').executeTakeFirstOrThrow();
    const app = await getApp();
    for (let batch = 0; batch < 4; batch++) {
      await withTenant(tenant.tenantId, trx => trx.insertInto('shipment_cases').values(Array.from({ length: 500 }, (_, i) => ({ tenant_id: tenant.tenantId, customer_id: customer.id, ref_number: `AUDIT-${batch}-${i}`, type: (['SEA_FCL', 'SEA_LCL', 'AIR', 'ROAD', 'RAIL', 'BULK'] as const)[i % 6], goods_desc: 'Synthetic scale audit cargo', containers: '[]', vessel: 'Audit synthetic vessel', origin_port: 'Audit origin', dest_port: 'Dar es Salaam' }))).execute());
      if (batch !== 0 && batch !== 3) continue;
      const measurements = [];
      const before = process.memoryUsage();
      for (let n = 0; n < 5; n++) {
        const t = performance.now();
        const r = await app.inject({ method: 'GET', url: '/v1/shipments/grouped', headers: authHeaders(tenant.token) });
        expect(r.statusCode).toBe(200);
        measurements.push({ ms: performance.now() - t, bytes: Buffer.byteLength(r.body) });
      }
      evidence.load.push({ shipments: (batch + 1) * 500, concurrency: 1, samples: measurements, before, after: process.memoryUsage(), caveat: 'In-process Fastify injection; local DB; no network/TLS, browser DOM, attachments, or concurrent users. Not a production capacity certification.' });
      if (batch === 3) {
        const t = performance.now();
        const parallel = await Promise.all(Array.from({ length: 10 }, async () => {
          const started = performance.now();
          const r = await app.inject({ method: 'GET', url: '/v1/shipments/grouped', headers: authHeaders(tenant.token) });
          return { ms: performance.now() - started, bytes: Buffer.byteLength(r.body), status: r.statusCode };
        }));
        evidence.load.push({ shipments: 2000, concurrency: 10, elapsedMs: performance.now() - t, samples: parallel, memory: process.memoryUsage() });
        expect(parallel.every(r => r.status === 200)).toBe(true);
      }
    }
  }, 120000);

  it('probes legacy document gates for all six shipment modes', async () => {
    const customer = await dbPlatform.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Audit workflow customer' } as any).returning('id').executeTakeFirstOrThrow();
    const flows = [];
    for (const type of ['SEA_FCL', 'SEA_LCL', 'AIR', 'ROAD', 'RAIL', 'BULK'] as const) {
      const shipment = await withTenant(tenant.tenantId, trx => trx.insertInto('shipment_cases').values({ tenant_id: tenant.tenantId, customer_id: customer.id, ref_number: `FLOW-${type}`, type, goods_desc: 'Synthetic workflow audit cargo', containers: '[]', vessel: 'Audit', origin_port: 'Audit', dest_port: 'Audit', stage: 'DOCS_RECEIVED' }).returning('id').executeTakeFirstOrThrow());
      let blocked = '';
      try { await WorkflowService.transitionStage(tenant.tenantId, shipment.id, 'VALIDATION', tenant.userId); }
      catch (err: any) { blocked = err.message; }
      expect(blocked).toContain('Prerequisite');
      const transportDoc = type === 'AIR' ? 'AWB' : 'BL';
      await withTenant(tenant.tenantId, trx => trx.insertInto('case_documents').values([transportDoc, 'INVOICE', 'PACKING_LIST'].map(doc => ({ tenant_id: tenant.tenantId, shipment_id: shipment.id, type: doc as any, filename: 'audit-no-real-file', storage_key: 'audit-no-real-file', status: 'VERIFIED' as const, uploaded_by: tenant.userId, verified_at: new Date(), due_date: null, notes: 'Synthetic audit metadata only' }))).execute());
      let outcome: any;
      try { outcome = await WorkflowService.transitionStage(tenant.tenantId, shipment.id, 'VALIDATION', tenant.userId); }
      catch (err: any) { outcome = { blocked: err.message }; }
      flows.push({ type, suppliedTransportDocument: transportDoc, outcome });
      if (type === 'SEA_FCL' && outcome.success) {
        const concurrent = await Promise.allSettled(Array.from({ length: 3 }, () => WorkflowService.transitionStage(tenant.tenantId, shipment.id, 'PERMITS', tenant.userId)));
        const history = await withTenant(tenant.tenantId, trx => trx.selectFrom('stage_history').select('id').where('tenant_id', '=', tenant.tenantId).where('shipment_id', '=', shipment.id).where('stage', '=', 'PERMITS').execute());
        evidence.concurrentTransitions = { requests: 3, outcomes: concurrent.map(r => r.status === 'fulfilled' ? r.value : String(r.reason)), newStageHistoryRows: history.length };
      }
    }
    evidence.workflows = flows;
  }, 120000);

  it('checks demurrage tier boundaries, currency conversion, and vehicle-age bands', async () => {
    await demurrageService.createTariff(tenant.tenantId, { carrier_name: 'AUDIT', container_size: '20FT', free_days: 7, effective_from: '2026-01-01', currency: 'USD', rate_tiers: [{ from_day: 1, to_day: 3, daily_rate: 10 }, { from_day: 4, to_day: 7, daily_rate: 20 }] });
    evidence.demurrage = [];
    for (const [return_date, expected] of [['2026-01-08', 0], ['2026-01-09', 10], ['2026-01-11', 30], ['2026-01-12', 50], ['2026-01-18', 170]] as const) {
      const r = await demurrageService.quickCalculate(tenant.tenantId, { carrier_name: 'AUDIT', container_size: '20FT', discharge_date: '2026-01-01', return_date, free_days: 7 });
      expect(r.demurrage_cost).toBe(expected);
      evidence.demurrage.push({ return_date, expected, ...r });
    }
    await expect(demurrageService.quickCalculate(tenant.tenantId, { carrier_name: 'AUDIT', container_size: '20FT', discharge_date: '2026-01-10', return_date: '2026-01-01', free_days: 7 })).rejects.toThrow();
    evidence.currencies = [];
    for (const [currency, fx_rate_override] of [['USD', 2500], ['EUR', 2750], ['ZAR', 140], ['TZS', 1]] as const) {
      const r = await calculateAirAdvanced({ hs_code: '84713000', fob: 1000, freight: 100, insurance: 0, weight_kg: 100, currency, fx_rate_override });
      expect(r.cif_tzs).toBe(1100 * fx_rate_override);
      evidence.currencies.push({ currency, fx_rate_override, cif_tzs: r.cif_tzs });
    }
    evidence.vehicleAges = [];
    for (const vehicle_age_years of [7, 8, 10, 11, 20, 21]) {
      const r = await calculateLandedCost({ hs_code: '87032390', cif_usd: 10000, fob_usd: 9000, fx_rate_override: 2500, vehicle_condition: 'used', vehicle_age_years });
      evidence.vehicleAges.push({ vehicle_age_years, excise: r.excise, note: r.excise_override_note });
    }
  }, 120000);
});
