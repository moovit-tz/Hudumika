import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { dbPlatform } from '../db/client.js';
import { env } from '../config/env.js';
import { EmailIntegration } from '../integrations/email.js';
import { MailService } from '../services/mail.service.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('CRM tenant references, email rendering, and bounded pagination', () => {
  let A: TestTenant;
  let B: TestTenant;

  async function customer(tenantId: string, name: string, email?: string) {
    return dbPlatform.insertInto('customers').values({
      tenant_id: tenantId, name, email: email ?? null, is_customer: true,
    } as any).returning('id').executeTakeFirstOrThrow();
  }

  async function territory(tenantId: string, name: string) {
    return dbPlatform.insertInto('crm_territories').values({ tenant_id: tenantId, name } as any)
      .returning('id').executeTakeFirstOrThrow();
  }

  async function quotation(tenantId: string, customerId: string) {
    return dbPlatform.insertInto('quotations').values({
      tenant_id: tenantId, quote_number: `Q-${randomUUID().slice(0, 12)}`,
      customer_id: customerId, title: 'Reference validation fixture', shipment_type: 'SEA_FCL',
    } as any).returning('id').executeTakeFirstOrThrow();
  }

  async function lead(app: Awaited<ReturnType<typeof getApp>>, tenant: TestTenant, data: Record<string, unknown> = {}) {
    const result = await app.inject({ method: 'POST', url: '/v1/leads', headers: authHeaders(tenant.token), payload: {
      company: `CRM fixture ${randomUUID().slice(0, 8)}`, contact_name: 'Test Contact',
      contact_email: 'contact@example.invalid', ...data,
    } });
    expect(result.statusCode, result.body).toBe(200);
    return result.json();
  }

  async function deal(app: Awaited<ReturnType<typeof getApp>>, tenant: TestTenant, data: Record<string, unknown> = {}) {
    const result = await app.inject({ method: 'POST', url: '/v1/deals', headers: authHeaders(tenant.token), payload: {
      name: `CRM fixture ${randomUUID().slice(0, 8)}`, ...data,
    } });
    expect(result.statusCode, result.body).toBe(200);
    return result.json();
  }

  beforeAll(async () => {
    await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
  });

  afterAll(async () => {
    await Promise.all([A?.cleanup(), B?.cleanup()]);
  }, 300_000);

  it('rejects foreign-tenant deal, lead, territory, quotation, task subject, and assignee references without partial writes', async () => {
    const app = await getApp();
    const customerA = await customer(A.tenantId, 'CRM A customer');
    const customerB = await customer(B.tenantId, 'CRM B customer');
    const territoryA = await territory(A.tenantId, 'A territory');
    const territoryB = await territory(B.tenantId, 'B territory');
    const quotationA = await quotation(A.tenantId, customerA.id);
    const quotationB = await quotation(B.tenantId, customerB.id);
    const leadA = await lead(app, A, { assigned_to_id: A.userId, territory_id: territoryA.id });
    const leadB = await lead(app, B, { assigned_to_id: B.userId, territory_id: territoryB.id });
    const dealA = await deal(app, A, {
      customer_id: customerA.id, lead_id: leadA.id, owner_id: A.userId,
      territory_id: territoryA.id, quotation_id: quotationA.id,
    });
    const dealB = await deal(app, B, {
      customer_id: customerB.id, lead_id: leadB.id, owner_id: B.userId,
      territory_id: territoryB.id, quotation_id: quotationB.id,
    });

    const dealCountBefore = Number((await dbPlatform.selectFrom('deals').select(dbPlatform.fn.countAll<string>().as('count'))
      .where('tenant_id', '=', A.tenantId).executeTakeFirstOrThrow()).count);
    const invalidCreate = await app.inject({ method: 'POST', url: '/v1/deals', headers: authHeaders(A.token), payload: {
      name: 'Must not be persisted', customer_id: customerB.id, lead_id: leadB.id, owner_id: B.userId,
      territory_id: territoryB.id, quotation_id: quotationB.id,
    } });
    expect(invalidCreate.statusCode, invalidCreate.body).toBe(400);
    const dealCountAfter = Number((await dbPlatform.selectFrom('deals').select(dbPlatform.fn.countAll<string>().as('count'))
      .where('tenant_id', '=', A.tenantId).executeTakeFirstOrThrow()).count);
    expect(dealCountAfter).toBe(dealCountBefore);

    for (const payload of [
      { customer_id: customerB.id }, { lead_id: leadB.id }, { owner_id: B.userId },
      { territory_id: territoryB.id }, { quotation_id: quotationB.id },
    ]) {
      const rejected = await app.inject({ method: 'PATCH', url: `/v1/deals/${dealA.id}`, headers: authHeaders(A.token), payload });
      expect(rejected.statusCode, JSON.stringify(payload)).toBe(400);
    }

    for (const payload of [
      { assigned_to_id: B.userId }, { territory_id: territoryB.id },
    ]) {
      const rejectedCreate = await app.inject({ method: 'POST', url: '/v1/leads', headers: authHeaders(A.token), payload: {
        company: 'Invalid foreign lead link', contact_name: 'Test Contact', ...payload,
      } });
      expect(rejectedCreate.statusCode).toBe(400);
      const rejectedPatch = await app.inject({ method: 'PATCH', url: `/v1/leads/${leadA.id}`, headers: authHeaders(A.token), payload });
      expect(rejectedPatch.statusCode).toBe(400);
    }

    const taskCountBefore = Number((await dbPlatform.selectFrom('crm_tasks').select(dbPlatform.fn.countAll<string>().as('count'))
      .where('tenant_id', '=', A.tenantId).executeTakeFirstOrThrow()).count);
    const anonymousTask = await app.inject({ method: 'POST', url: '/v1/crm/tasks', payload: {
      subject_type: 'deal', subject_id: dealA.id, title: 'Unauthenticated request',
    } });
    expect(anonymousTask.statusCode, anonymousTask.body).toBe(401);
    for (const payload of [
      { subject_type: 'deal', subject_id: dealB.id, title: 'Foreign subject' },
      { subject_type: 'deal', subject_id: dealA.id, assigned_to: B.userId, title: 'Foreign assignee' },
    ]) {
      const rejected = await app.inject({ method: 'POST', url: '/v1/crm/tasks', headers: authHeaders(A.token), payload });
      expect(rejected.statusCode, rejected.body).toBe(400);
    }
    const taskCountAfter = Number((await dbPlatform.selectFrom('crm_tasks').select(dbPlatform.fn.countAll<string>().as('count'))
      .where('tenant_id', '=', A.tenantId).executeTakeFirstOrThrow()).count);
    expect(taskCountAfter).toBe(taskCountBefore);
    const validTask = await app.inject({ method: 'POST', url: '/v1/crm/tasks', headers: authHeaders(A.token), payload: {
      subject_type: 'deal', subject_id: dealA.id, assigned_to: A.userId, title: 'Valid same-tenant task',
    } });
    expect(validTask.statusCode, validTask.body).toBe(201);
    const invalidTaskPatch = await app.inject({ method: 'PATCH', url: `/v1/crm/tasks/${validTask.json().id}`, headers: authHeaders(A.token), payload: { assigned_to: B.userId } });
    expect(invalidTaskPatch.statusCode).toBe(400);
  });

  it('pages leads, deals, and customers with stable ordering and bounded limits', async () => {
    const app = await getApp();
    for (let i = 0; i < 3; i++) {
      await lead(app, A);
      await deal(app, A);
      await customer(A.tenantId, `Paged CRM customer ${i}`);
    }
    const endpoints = [
      { url: '/v1/leads', getItems: (r: any) => r.items },
      { url: '/v1/deals', getItems: (r: any) => r.items },
      { url: '/v1/customers', getItems: (r: any) => r.data },
    ];
    for (const endpoint of endpoints) {
      const first = await app.inject({ method: 'GET', url: `${endpoint.url}?page=1&page_size=1`, headers: authHeaders(A.token) });
      const firstAgain = await app.inject({ method: 'GET', url: `${endpoint.url}?page=1&page_size=1`, headers: authHeaders(A.token) });
      const second = await app.inject({ method: 'GET', url: `${endpoint.url}?page=2&page_size=1`, headers: authHeaders(A.token) });
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json().page, `${endpoint.url}: ${first.body}`).toBe(1);
      expect(first.json().page_size).toBe(1);
      expect(first.json().total).toBeGreaterThanOrEqual(2);
      expect(endpoint.getItems(first.json())).toHaveLength(1);
      expect(endpoint.getItems(first.json())[0].id).toBe(endpoint.getItems(firstAgain.json())[0].id);
      expect(endpoint.getItems(second.json())[0].id).not.toBe(endpoint.getItems(first.json())[0].id);
    }
    for (const path of ['/v1/leads?page_size=101', '/v1/deals?page=0', '/v1/customers?page_size=101']) {
      const invalid = await app.inject({ method: 'GET', url: path, headers: authHeaders(A.token) });
      expect(invalid.statusCode, path).toBe(400);
    }
    const legacy = await app.inject({ method: 'GET', url: '/v1/deals', headers: authHeaders(A.token) });
    expect(Array.isArray(legacy.json())).toBe(true);
    expect(legacy.json().length).toBeLessThanOrEqual(100);
  }, 300_000);

  it('escapes untrusted CRM email content while preserving line breaks', async () => {
    const app = await getApp();
    const contact = await lead(app, A, { contact_email: 'recipient@example.invalid' });
    const send = vi.spyOn(MailService, 'sendNow').mockResolvedValue({ success: true, simulated: true } as any);
    try {
      const response = await app.inject({ method: 'POST', url: '/v1/crm/activity/send-email', headers: authHeaders(A.token), payload: {
        subject_type: 'lead', subject_id: contact.id, subject: 'Safe subject', body: 'Hello\n<script>alert(1)</script> & goodbye',
      } });
      expect(response.statusCode, response.body).toBe(200);
      const bodyHtml = send.mock.calls[0][1].bodyHtml;
      expect(bodyHtml).toContain('Hello\n&lt;script&gt;alert(1)&lt;/script&gt; &amp; goodbye');
      expect(bodyHtml).not.toContain('<script>');
    } finally {
      send.mockRestore();
    }
  });

  it('sends customer invitations using PUBLIC_APP_URL and its environment fallback', async () => {
    const app = await getApp();
    const invitee = await customer(A.tenantId, 'Invite URL Test', 'invitee@example.invalid');
    const send = vi.spyOn(EmailIntegration, 'sendEmail').mockResolvedValue({ success: true, simulated: true } as any);
    const previousUrl = env.PUBLIC_APP_URL;
    const previousEnvironment = env.APP_ENV;
    try {
      (env as any).PUBLIC_APP_URL = 'https://portal.example.invalid/';
      const configured = await app.inject({ method: 'POST', url: `/v1/customers/${invitee.id}/invite`, headers: authHeaders(A.token), payload: {} });
      expect(configured.statusCode, configured.body).toBe(200);
      expect(send.mock.calls.at(-1)?.[0].bodyHtml).toContain('https://portal.example.invalid/accept-customer-invite?token=');
      send.mockClear();

      (env as any).PUBLIC_APP_URL = undefined;
      (env as any).APP_ENV = 'test';
      const fallbackCustomer = await customer(A.tenantId, 'Invite URL Fallback', 'fallback@example.invalid');
      const fallback = await app.inject({ method: 'POST', url: `/v1/customers/${fallbackCustomer.id}/invite`, headers: authHeaders(A.token), payload: {} });
      expect(fallback.statusCode, fallback.body).toBe(200);
      expect(send.mock.calls.at(-1)?.[0].bodyHtml).toContain('http://localhost:5173/accept-customer-invite?token=');
    } finally {
      (env as any).PUBLIC_APP_URL = previousUrl;
      (env as any).APP_ENV = previousEnvironment;
      send.mockRestore();
    }
  });
});

describe('Customer OTP privacy and delivery behavior', () => {
  let tenant: TestTenant;
  beforeAll(async () => { await getApp(); tenant = await createTestTenant('TENANT_ADMIN'); });
  afterAll(async () => {
    await tenant?.cleanup();
  }, 180_000);

  it('does not log identifiers or codes and rejects unavailable production delivery', async () => {
    const app = await getApp();
    const phone = `+2557${Math.floor(10000000 + Math.random() * 89999999)}`;
    await dbPlatform.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'OTP Privacy Fixture', phone_wa: phone, is_customer: true } as any).execute();
    const logs: unknown[][] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args); });
    const info = vi.spyOn(console, 'info').mockImplementation((...args) => { logs.push(args); });
    const oldAppEnv = env.APP_ENV;
    try {
      (env as any).APP_ENV = 'test';
      const development = await app.inject({ method: 'POST', url: '/v1/auth/customer-otp', payload: { phone_wa: phone } });
      expect(development.statusCode).toBe(200);
      expect(development.json()).toMatchObject({ success: true, delivered: false, mode: 'development' });

      (env as any).APP_ENV = 'production';
      const configured = vi.spyOn(WhatsAppIntegration, 'isConfigured').mockReturnValue(false);
      const unavailable = await app.inject({ method: 'POST', url: '/v1/auth/customer-otp', payload: { phone_wa: phone } });
      expect(unavailable.statusCode).toBe(503);
      expect(logs.flat().join(' ')).not.toContain(phone);
      expect(logs.flat().join(' ')).not.toMatch(/\b\d{6}\b/);
      configured.mockRestore();
    } finally {
      (env as any).APP_ENV = oldAppEnv;
      log.mockRestore();
      info.mockRestore();
    }
  });

  it('delivers production OTPs through the provider without logging the code or phone', async () => {
    const app = await getApp();
    const phone = `+2557${Math.floor(10000000 + Math.random() * 89999999)}`;
    await dbPlatform.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'OTP Delivery Fixture', phone_wa: phone, is_customer: true } as any).execute();
    const logs: unknown[][] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args); });
    const info = vi.spyOn(console, 'info').mockImplementation((...args) => { logs.push(args); });
    const oldAppEnv = env.APP_ENV;
    const configured = vi.spyOn(WhatsAppIntegration, 'isConfigured').mockReturnValue(true);
    const send = vi.spyOn(WhatsAppIntegration, 'sendMessage').mockResolvedValue({ success: true, messageId: 'mock-message' });
    try {
      (env as any).APP_ENV = 'production';
      const response = await app.inject({ method: 'POST', url: '/v1/auth/customer-otp', payload: { phone_wa: phone } });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ success: true, delivered: true });
      const sentText = send.mock.calls[0][1];
      const otp = sentText.match(/\b(\d{6})\b/)?.[1];
      expect(otp).toBeTruthy();
      expect(logs.flat().join(' ')).not.toContain(phone);
      expect(logs.flat().join(' ')).not.toContain(otp);
      const verified = await app.inject({ method: 'POST', url: '/v1/auth/customer/verify', payload: { phone_wa: phone, otp } });
      expect(verified.statusCode, verified.body).toBe(200);
    } finally {
      (env as any).APP_ENV = oldAppEnv;
      configured.mockRestore();
      send.mockRestore();
      log.mockRestore();
      info.mockRestore();
    }
  });
});
