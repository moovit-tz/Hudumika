import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('ClearOS shipment sub-resource access', () => {
  let tenant: TestTenant;
  let customerToken: string;
  let ownShipmentId: string;
  let otherShipmentId: string;
  let otherTaskId: string;

  beforeAll(async () => {
    tenant = await createTestTenant();
    await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', tenant.tenantId).execute();
    const customerUser = await tenant.addUser('CUSTOMER');
    customerToken = customerUser.token;

    const customer = await dbPlatform.insertInto('customers').values({
      tenant_id: tenant.tenantId, name: 'Portal customer', email: 'portal-customer@test.invalid',
    } as any).returning(['id']).executeTakeFirstOrThrow();
    await dbPlatform.updateTable('users').set({ customer_id: customer.id })
      .where('id', '=', customerUser.userId).execute();

    const insertShipment = (customerId: string, ref: string) => withTenant(tenant.tenantId, (trx) =>
      trx.insertInto('shipment_cases').values({
        tenant_id: tenant.tenantId, customer_id: customerId, ref_number: ref,
        type: 'SEA_FCL', goods_desc: 'Access-control test cargo', containers: '[]',
        vessel: 'Test vessel', origin_port: 'Dar es Salaam', dest_port: 'Mwanza',
      }).returning(['id']).executeTakeFirstOrThrow(),
    );
    ownShipmentId = (await insertShipment(customer.id, 'ACCESS-OWN')).id;
    const otherCustomer = await dbPlatform.insertInto('customers').values({
      tenant_id: tenant.tenantId, name: 'Other customer', email: 'other-customer@test.invalid',
    } as any).returning(['id']).executeTakeFirstOrThrow();
    otherShipmentId = (await insertShipment(otherCustomer.id, 'ACCESS-OTHER')).id;
    otherTaskId = (await withTenant(tenant.tenantId, (trx) => trx.insertInto('shipment_tasks').values({
      tenant_id: tenant.tenantId, shipment_id: otherShipmentId, title: 'Other case task',
      status: 'open', priority: 'medium', assigned_to: null, due_date: null, note: null,
      description: null, labels: '[]', cover_color: null, created_by: tenant.userId,
      product_id: null, service_name: null, service_rate: null, service_currency: null,
      service_unit: null, closed_by: null, closed_at: null,
    }).returning(['id']).executeTakeFirstOrThrow())).id;
  });

  afterAll(async () => tenant.cleanup());

  it('does not expose another customer’s timeline or operational notes', async () => {
    const app = await getApp();
    const foreignTimeline = await app.inject({ method: 'GET', url: `/v1/shipments/${otherShipmentId}/timeline`, headers: authHeaders(customerToken) });
    const ownNotes = await app.inject({ method: 'GET', url: `/v1/shipments/${ownShipmentId}/notes`, headers: authHeaders(customerToken) });
    expect(foreignTimeline.statusCode).toBe(403);
    expect(ownNotes.statusCode).toBe(403);
  });

  it('rejects a task id that belongs to a different shipment', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'PATCH', url: `/v1/shipments/${ownShipmentId}/tasks/${otherTaskId}`,
      headers: authHeaders(tenant.token), payload: { title: 'Attempted cross-case edit' },
    });
    expect(response.statusCode).toBe(404);
  });
});
