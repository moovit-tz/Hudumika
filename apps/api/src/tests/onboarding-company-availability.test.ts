import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestTenant, getApp, type TestTenant } from './helpers.js';
import { withTenant } from '../db/client.js';
import { isCompanyEntityAvailable } from '../services/onboarding.service.js';

let tenant: TestTenant;
const name = `Signup Entity ${randomUUID()}`;
beforeAll(async () => {
  tenant = await createTestTenant();
  await withTenant(tenant.tenantId, trx => trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name, country: 'Tanzania' }).execute());
}, 120000);
afterAll(async () => { if (tenant) await tenant.cleanup(); }, 120000);

it('blocks CRM entities despite case and repeated whitespace', async () => {
  expect(await isCompanyEntityAvailable(name.toUpperCase().replaceAll(' ', '   '), 'Tanzania')).toBe(false);
});

it('allows a new entity name', async () => {
  expect(await isCompanyEntityAvailable(`New Entity ${randomUUID()}`, 'Tanzania')).toBe(true);
});

it('validates supplied signup identity and returns only availability', async () => {
  const app = await getApp();
  const invalid = await app.inject({ method: 'POST', url: '/v1/onboarding/check-company', payload: { name, country: 'Tanzania', ondi_ticket: 'invalid' } });
  expect(invalid.statusCode).toBe(401);
  const ticket = (app.jwt.sign as any)({ typ: 'onboarding_signup', email: 'test@example.invalid' }, { expiresIn: '5m' });
  const response = await app.inject({ method: 'POST', url: '/v1/onboarding/check-company', payload: { name, country: 'Tanzania', ondi_ticket: ticket } });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ available: false });
});

it('supports email-first signup without an Ondi ticket', async () => {
  const app = await getApp();
  for (const ondi_ticket of [undefined, '']) {
    const response = await app.inject({ method: 'POST', url: '/v1/onboarding/check-company', payload: { name, country: 'Tanzania', ondi_ticket } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ available: false });
  }
});
