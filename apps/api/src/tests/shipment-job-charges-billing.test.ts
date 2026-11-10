import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { authHeaders, createTestTenant, getApp, grantStandaloneProduct, type TestTenant } from './helpers.js';

// Logistics P1 "charge" step: shipment_job_charges' sell_posted/sell_invoice_id
// used to be plain client-settable fields — a caller could claim a charge was
// invoiced with nothing real behind it. This proves the real replacement:
// /job-charges/bill-sell creates an actual invoice + GL entry and only then
// stamps the charges it billed, and the old client-settable path is closed.
describe('Shipment job charges — real billing, not a client-settable flag', () => {
  let tenant: TestTenant;
  let customerId: string;
  let shipmentId: string;

  async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object) {
    return (await getApp()).inject({ method, url: `/v1/shipments${path}`, headers: authHeaders(tenant.token), ...(payload ? { payload } : {}) });
  }

  beforeAll(async () => {
    tenant = await createTestTenant();
    await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', tenant.tenantId).execute();
    await grantStandaloneProduct(tenant.tenantId, 'clearos');

    await withTenant(tenant.tenantId, async trx => {
      await GLService.seedChartOfAccounts(trx, tenant.tenantId);
      customerId = (await trx.insertInto('customers').values({
        tenant_id: tenant.tenantId, name: 'Job Charges Test Customer',
      }).returning('id').executeTakeFirstOrThrow()).id;
      shipmentId = (await trx.insertInto('shipment_cases').values({
        tenant_id: tenant.tenantId, customer_id: customerId, ref_number: 'JC-TEST-001',
        type: 'SEA_FCL', goods_desc: 'Billing test cargo', containers: '[]',
        vessel: 'Test vessel', origin_port: 'Dar es Salaam', dest_port: 'Mwanza',
      }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);

  afterAll(async () => {
    await withTenant(tenant.tenantId, async trx => {
      // shipment_job_charges.sell_invoice_id FK's sales_invoices — must go
      // first, or deleting the invoice it still points at is a real FK
      // violation (confirmed live while writing this fixture).
      await trx.deleteFrom('shipment_job_charges').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('sales_invoice_lines').where('invoice_id', 'in',
        trx.selectFrom('sales_invoices').select('id').where('tenant_id', '=', tenant.tenantId)).execute();
      await trx.deleteFrom('sales_invoices').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('shipment_cases').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('customers').where('tenant_id', '=', tenant.tenantId).execute();
    });
    await tenant.cleanup();
  }, 120000);

  it('ignores a client-supplied sell_posted/sell_invoice_id on create and patch', async () => {
    const created = await call('POST', `/${shipmentId}/job-charges`, {
      charge_code: 'FRT', description: 'Ocean freight', debtor_id: customerId,
      sell_currency: 'USD', sell_amount: 500,
      // Deliberately probing fields the schema no longer accepts — see
      // jobChargeSchema's own comment in shipments.routes.ts for why.
      sell_posted: true, sell_invoice_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(created.statusCode, created.body).toBe(201);
    const charge = created.json();
    expect(charge.sell_posted).toBe(false);
    expect(charge.sell_invoice_id).toBeNull();

    const patched = await call('PATCH', `/${shipmentId}/job-charges/${charge.id}`, {
      sell_posted: true, sell_invoice_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(patched.statusCode, patched.body).toBe(200);
    expect(patched.json().sell_posted).toBe(false);
    expect(patched.json().sell_invoice_id).toBeNull();
  });

  it('bills real unposted sell charges into a real invoice with a real GL entry, then refuses to delete a billed charge', async () => {
    const c1 = (await call('POST', `/${shipmentId}/job-charges`, {
      charge_code: 'FRT', description: 'Ocean freight', debtor_id: customerId, sell_currency: 'USD', sell_amount: 800,
    })).json();
    const c2 = (await call('POST', `/${shipmentId}/job-charges`, {
      charge_code: 'CCLR', description: 'Customs clearance fee', debtor_id: customerId, sell_currency: 'USD', sell_amount: 150,
    })).json();

    const billed = await call('POST', `/${shipmentId}/job-charges/bill-sell`, {});
    expect(billed.statusCode, billed.body).toBe(201);
    const { invoice, charges } = billed.json();
    expect(invoice.customer_id).toBe(customerId);
    expect(charges).toHaveLength(2);
    expect(charges.every((c: any) => c.sell_posted === true && c.sell_invoice_id === invoice.id)).toBe(true);

    // Real invoice, independently readable, with the right total and real lines.
    const lines = await withTenant(tenant.tenantId, trx =>
      trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', invoice.id).execute());
    expect(lines).toHaveLength(2);
    const total = lines.reduce((s, l) => s + Number(l.rate) * Number(l.qty), 0);
    expect(total).toBe(950);

    // Already-billed charges aren't picked up by a second bill-sell call.
    const second = await call('POST', `/${shipmentId}/job-charges/bill-sell`, {});
    expect(second.statusCode).toBe(400);

    // A billed charge can't be silently deleted out from under its invoice.
    const del = await call('DELETE', `/${shipmentId}/job-charges/${c1.id}`);
    expect(del.statusCode).toBe(409);
    const del2 = await call('DELETE', `/${shipmentId}/job-charges/${c2.id}`);
    expect(del2.statusCode).toBe(409);
  });

  it('refuses to bill charges spanning more than one debtor without charge_ids', async () => {
    const otherCustomer = await withTenant(tenant.tenantId, trx =>
      trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Second Debtor' }).returning('id').executeTakeFirstOrThrow());

    await call('POST', `/${shipmentId}/job-charges`, {
      charge_code: 'TRANS', description: 'Inland transport', debtor_id: otherCustomer.id, sell_currency: 'USD', sell_amount: 200,
    });

    const billed = await call('POST', `/${shipmentId}/job-charges/bill-sell`, {});
    expect(billed.statusCode).toBe(400);
    expect(billed.json().error).toMatch(/more than one debtor/);
  });
});
