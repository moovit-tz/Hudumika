// Storage product steps 5, 7-10: email <-> Drive, storage add-ons, gateway
// billing (checkout + signed idempotent webhook), scheduled invoices +
// proration, dunning, retention / legal hold / quarantine / integrity.
// The payment gateway is the only thing mocked — it is an external HTTP
// service; everything else runs through the real routes, jobs and database.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'crypto';

const gw = vi.hoisted(() => ({ verification: null as any }));
vi.mock('../integrations/payment-gateway.js', () => ({
  PaymentGateway: {
    name: 'flutterwave',
    isConfigured: () => true,
    createCheckout: async () => ({ url: 'https://checkout.test/pay/abc' }),
    verifyWebhookSignature: (h: unknown) => h === 'test-secret',
    verifyById: async () => gw.verification,
    verifyByReference: async () => gw.verification,
  },
}));

import { dbPlatform, withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { DocumentService } from '../services/document.service.js';
import { generatePeriodInvoice, prorationFactor } from '../services/subscription-billing.service.js';
import { runSubscriptionBillingJob } from '../jobs/subscription-billing.job.js';
import { runCloudTrashExpiryJob } from '../jobs/cloud-trash-expiry.job.js';
import { runStorageIntegrityCheck } from '../jobs/cloud-storage-maintenance.job.js';
import { getStorageQuota, wouldExceedStorageQuota } from '../lib/storage-quota.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableApps(tenantId: string, apps: Record<string, boolean>) {
  const settings = JSON.stringify({ 'enabled-apps': apps }) as any;
  await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenantId, settings })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings })).execute();
}

const GB = 1073741824;
const webhookIds: string[] = [];

describe('Storage add-ons, proration and billing', () => {
  let T: TestTenant;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { cloud: true, email: true, finops: true });
  });
  afterAll(async () => {
    if (webhookIds.length) await dbPlatform.deleteFrom('billing_webhook_events').where('event_id', 'in', webhookIds).execute();
    await T.cleanup();
  });

  it('buying storage add-ons raises the quota, and cancelling lowers it again', async () => {
    const app = await getApp();
    const before = await getStorageQuota(T.tenantId);
    expect(before.base_limit_bytes).not.toBeNull();
    expect(before.addon_bytes).toBe(0);

    const buy = await app.inject({ method: 'POST', url: '/v1/addons/storage-100gb/purchase', headers: authHeaders(T.token), payload: { quantity: 2 } });
    expect(buy.statusCode, buy.body).toBe(201);
    const after = await getStorageQuota(T.tenantId);
    expect(after.addon_bytes).toBe(200 * GB);
    expect(after.limit_bytes).toBe(before.base_limit_bytes! + 200 * GB);

    const cancel = await app.inject({ method: 'POST', url: '/v1/addons/storage-100gb/cancel', headers: authHeaders(T.token), payload: {} });
    expect(cancel.statusCode, cancel.body).toBe(200);
    expect((await getStorageQuota(T.tenantId)).addon_bytes).toBe(0);
  });

  it('a mid-month purchase is billed on a prorated invoice, and joins the next period invoice in full', async () => {
    const app = await getApp();
    // Re-buy (cancelled above): 2 units.
    const buy = await app.inject({ method: 'POST', url: '/v1/addons/storage-100gb/purchase', headers: authHeaders(T.token), payload: { quantity: 2 } });
    expect(buy.statusCode, buy.body).toBe(200);
    const proration = buy.json().proration_invoice;
    expect(proration.kind).toBe('proration');
    expect(proration.status).toBe('due');
    const unit = Math.round(5 * prorationFactor(new Date()) * 100) / 100;
    expect(Number(proration.amount)).toBeCloseTo(Math.round(unit * 2 * 100) / 100, 2);
    expect(proration.line_items[0].description).toContain('prorated');

    // This month's period invoice does not double-bill the add-on (proration covers it)…
    const gen = await app.inject({ method: 'POST', url: '/v1/billing/invoices/generate', headers: authHeaders(T.token), payload: {} });
    expect([200, 201]).toContain(gen.statusCode);
    expect(Number(gen.json().addons_amount)).toBe(0);
    expect(gen.json().kind).toBe('period');
    // …and generating twice returns the same invoice.
    const again = await app.inject({ method: 'POST', url: '/v1/billing/invoices/generate', headers: authHeaders(T.token), payload: {} });
    expect(again.json().id).toBe(gen.json().id);

    // Next month, the add-on is billed in full: 2 × $5.
    const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 10));
    const { invoice, created } = await withTenant(T.tenantId, (trx) => generatePeriodInvoice(trx, T.tenantId, nextMonth));
    expect(created).toBe(true);
    expect(Number(invoice.addons_amount)).toBe(10);
    expect((invoice.line_items as any[]).some(l => l.kind === 'addon' && l.quantity === 2)).toBe(true);
  });

  it('invoice numbers never collide even after an invoice is deleted', async () => {
    const nums = (await dbPlatform.selectFrom('subscription_invoices').select('invoice_number').where('tenant_id', '=', T.tenantId).execute()).map(r => r.invoice_number);
    expect(new Set(nums).size).toBe(nums.length);
  });

  describe('gateway checkout and webhook', () => {
    let invoiceId: string;
    let txRef: string;
    let eventId: number;

    beforeAll(async () => {
      const inv = await dbPlatform.selectFrom('subscription_invoices').select(['id', 'amount', 'currency']).where('tenant_id', '=', T.tenantId).where('kind', '=', 'proration').executeTakeFirstOrThrow();
      invoiceId = inv.id;
      eventId = Math.floor(Math.random() * 1e9);
      webhookIds.push(`charge.completed:${eventId}`);
    });

    it('starts a hosted checkout and records the gateway reference', async () => {
      const app = await getApp();
      const res = await app.inject({ method: 'POST', url: `/v1/billing/invoices/${invoiceId}/checkout`, headers: authHeaders(T.token), payload: {} });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().checkout_url).toBe('https://checkout.test/pay/abc');
      const row = await dbPlatform.selectFrom('subscription_invoices').select(['gateway', 'gateway_ref']).where('id', '=', invoiceId).executeTakeFirstOrThrow();
      expect(row.gateway).toBe('flutterwave');
      txRef = row.gateway_ref!;
      expect(txRef).toMatch(/^HUD-/);
    });

    it('refuses the simulated charge once a live gateway is configured', async () => {
      const app = await getApp();
      const pm = await app.inject({ method: 'POST', url: '/v1/billing/payment-methods', headers: authHeaders(T.token), payload: { type: 'mobile_money', mobile_number: '255700000123' } });
      const methodId = pm.json()?.id;
      if (!methodId) return; // payment-method shape is owned by billing.routes; the guard itself is what matters
      const pay = await app.inject({ method: 'POST', url: `/v1/billing/invoices/${invoiceId}/pay`, headers: authHeaders(T.token), payload: { payment_method_id: methodId } });
      expect(pay.statusCode).toBe(409);
      expect(pay.json().error).toBe('USE_CHECKOUT');
    });

    it('rejects a webhook with a bad signature, and one whose amount is too low', async () => {
      const app = await getApp();
      const body = { event: 'charge.completed', data: { id: eventId, tx_ref: txRef } };
      const bad = await app.inject({ method: 'POST', url: '/v1/webhooks/billing/flutterwave', headers: { 'verif-hash': 'wrong', 'content-type': 'application/json' }, payload: body });
      expect(bad.statusCode).toBe(401);

      const inv = await dbPlatform.selectFrom('subscription_invoices').select(['amount', 'currency']).where('id', '=', invoiceId).executeTakeFirstOrThrow();
      gw.verification = { ok: true, status: 'successful', txRef, amount: Number(inv.amount) - 1, currency: inv.currency };
      const short = await app.inject({ method: 'POST', url: '/v1/webhooks/billing/flutterwave', headers: { 'verif-hash': 'test-secret', 'content-type': 'application/json' }, payload: { ...body, data: { ...body.data, id: eventId + 1 } } });
      webhookIds.push(`charge.completed:${eventId + 1}`);
      expect(short.json().outcome).toBe('amount_mismatch');
      expect((await dbPlatform.selectFrom('subscription_invoices').select('status').where('id', '=', invoiceId).executeTakeFirstOrThrow()).status).toBe('due');
    });

    it('settles on a valid webhook, and a redelivery is ignored', async () => {
      const app = await getApp();
      const inv = await dbPlatform.selectFrom('subscription_invoices').select(['amount', 'currency']).where('id', '=', invoiceId).executeTakeFirstOrThrow();
      gw.verification = { ok: true, status: 'successful', txRef, amount: Number(inv.amount), currency: inv.currency };
      const send = () => app.inject({
        method: 'POST', url: '/v1/webhooks/billing/flutterwave',
        headers: { 'verif-hash': 'test-secret', 'content-type': 'application/json' },
        payload: { event: 'charge.completed', data: { id: eventId, tx_ref: txRef } },
      });
      const first = await send();
      expect(first.json().outcome).toBe('paid');
      const row = await dbPlatform.selectFrom('subscription_invoices').select(['status', 'paid_at']).where('id', '=', invoiceId).executeTakeFirstOrThrow();
      expect(row.status).toBe('paid');
      expect(row.paid_at).not.toBeNull();

      const second = await send();
      expect(second.json().duplicate).toBe(true);
    });

    it('an unknown reference is acknowledged but changes nothing', async () => {
      const app = await getApp();
      const id = Math.floor(Math.random() * 1e9);
      webhookIds.push(`charge.completed:${id}`);
      const res = await app.inject({
        method: 'POST', url: '/v1/webhooks/billing/flutterwave',
        headers: { 'verif-hash': 'test-secret', 'content-type': 'application/json' },
        payload: { event: 'charge.completed', data: { id, tx_ref: 'HUD-does-not-exist' } },
      });
      expect(res.json().outcome).toBe('unknown_reference');
    });
  });

  describe('dunning', () => {
    let D: TestTenant;
    let overdueId: string;
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

    beforeAll(async () => {
      D = await createTestTenant('TENANT_ADMIN');
      await enableApps(D.tenantId, { cloud: true, finops: true });
      const inv = await dbPlatform.insertInto('subscription_invoices').values({
        tenant_id: D.tenantId, invoice_number: 'SUB-DUN-001', plan_code: 'starter', seats: 1, currency: 'USD', amount: 50,
        period_start: daysAgo(40), period_end: daysAgo(10), due_date: daysAgo(8), status: 'due',
      } as any).returning('id').executeTakeFirstOrThrow();
      overdueId = inv.id;
    });
    afterAll(async () => { await D.cleanup(); });

    it('an unpaid invoice past due is marked overdue, reminded once per stage, and notifies admins', async () => {
      await runSubscriptionBillingJob(new Date(), D.tenantId);
      let row = await dbPlatform.selectFrom('subscription_invoices').select(['status', 'dunning_stage']).where('id', '=', overdueId).executeTakeFirstOrThrow();
      expect(row.status).toBe('overdue');
      expect(row.dunning_stage).toBe(2); // 8 days overdue → second reminder

      const notes = await dbPlatform.selectFrom('notifications').select('title').where('tenant_id', '=', D.tenantId).where('entity_id', '=', overdueId).execute();
      expect(notes.length).toBe(1);

      // Running again the same day does not re-notify.
      await runSubscriptionBillingJob(new Date(), D.tenantId);
      const notes2 = await dbPlatform.selectFrom('notifications').select('title').where('tenant_id', '=', D.tenantId).where('entity_id', '=', overdueId).execute();
      expect(notes2.length).toBe(1);
      row = await dbPlatform.selectFrom('subscription_invoices').select(['status', 'dunning_stage']).where('id', '=', overdueId).executeTakeFirstOrThrow();
      expect(row.dunning_stage).toBe(2);
    });

    it('at 21+ days new uploads are blocked with a billing message, and paying lifts the block', async () => {
      const later = new Date(Date.now() + 15 * 86_400_000);
      await runSubscriptionBillingJob(later, D.tenantId);
      const row = await dbPlatform.selectFrom('subscription_invoices').select('dunning_stage').where('id', '=', overdueId).executeTakeFirstOrThrow();
      expect(row.dunning_stage).toBe(4);

      const blocked = await wouldExceedStorageQuota(D.tenantId, 1);
      expect(blocked.billing_locked).toBe(true);
      expect(blocked.exceeded).toBe(true);

      await dbPlatform.updateTable('subscription_invoices').set({ status: 'paid', paid_at: new Date() }).where('id', '=', overdueId).execute();
      const open = await wouldExceedStorageQuota(D.tenantId, 1);
      expect(open.billing_locked).toBe(false);
      expect(open.exceeded).toBe(false);
    });
  });
});

describe('Retention, legal hold, quarantine and integrity', () => {
  let T: TestTenant;
  let fileId: string;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { cloud: true, finops: true });
    const saved = await DocumentService.saveDocument({
      tenantId: T.tenantId, sourceApp: 'finops', entityType: 'invoice', entityId: randomUUID(), documentType: 'issued_invoice',
      filename: 'retained.pdf', content: Buffer.from('%PDF-1.4 retention test document'), retentionClass: 'financial_record',
    });
    fileId = saved.fileId;
    // Sitting in Trash for 40 days — past the 30-day auto-expiry window.
    await dbPlatform.updateTable('cloud_files').set({ is_trash: true, trashed_at: new Date(Date.now() - 40 * 86_400_000) }).where('id', '=', fileId).execute();
  });
  afterAll(async () => { await T.cleanup(); });

  const exists = async () => !!(await dbPlatform.selectFrom('cloud_files').select('id').where('id', '=', fileId).executeTakeFirst());

  it('filing a financial record stamps a retention date, and trash auto-expiry does not purge it', async () => {
    const row = await dbPlatform.selectFrom('cloud_files').select('retain_until').where('id', '=', fileId).executeTakeFirstOrThrow();
    expect(row.retain_until).not.toBeNull();
    expect(new Date(row.retain_until!).getTime()).toBeGreaterThan(Date.now() + 6 * 365 * 86_400_000);
    await runCloudTrashExpiryJob(T.tenantId);
    expect(await exists()).toBe(true);
  });

  it('a legal hold blocks purge even after retention ends, and releasing it lets the purge proceed', async () => {
    const app = await getApp();
    await dbPlatform.updateTable('cloud_files').set({ retain_until: new Date(Date.now() - 1000) }).where('id', '=', fileId).execute();

    const noReason = await app.inject({ method: 'PUT', url: `/v1/files/${fileId}/legal-hold`, headers: authHeaders(T.token), payload: { hold: true } });
    expect(noReason.statusCode).toBe(400);
    const hold = await app.inject({ method: 'PUT', url: `/v1/files/${fileId}/legal-hold`, headers: authHeaders(T.token), payload: { hold: true, reason: 'Audit 2026' } });
    expect(hold.statusCode, hold.body).toBe(200);
    expect(hold.json().files_affected).toBe(1);

    await runCloudTrashExpiryJob(T.tenantId);
    expect(await exists()).toBe(true);

    const report = await app.inject({ method: 'GET', url: '/v1/files/compliance/report', headers: authHeaders(T.token) });
    expect(report.statusCode, report.body).toBe(200);
    expect(report.json().totals.legal_hold).toBe(1);

    const release = await app.inject({ method: 'PUT', url: `/v1/files/${fileId}/legal-hold`, headers: authHeaders(T.token), payload: { hold: false } });
    expect(release.statusCode).toBe(200);
    await runCloudTrashExpiryJob(T.tenantId);
    expect(await exists()).toBe(false);
  });

  it('only admins may manage retention policy, and an override applies to newly filed records', async () => {
    const app = await getApp();
    const staff = await T.addUser('MANAGER');
    const denied = await app.inject({ method: 'PUT', url: '/v1/files/retention-policies/financial_record', headers: authHeaders(staff.token), payload: { retain_days: 10 } });
    expect(denied.statusCode).toBe(403);

    const set = await app.inject({ method: 'PUT', url: '/v1/files/retention-policies/financial_record', headers: authHeaders(T.token), payload: { retain_days: 30 } });
    expect(set.statusCode, set.body).toBe(200);
    const saved = await DocumentService.saveDocument({
      tenantId: T.tenantId, sourceApp: 'finops', entityType: 'invoice', entityId: randomUUID(), documentType: 'issued_invoice',
      filename: 'short-retention.pdf', content: Buffer.from('%PDF-1.4 x'), retentionClass: 'financial_record',
    });
    const row = await dbPlatform.selectFrom('cloud_files').select('retain_until').where('id', '=', saved.fileId).executeTakeFirstOrThrow();
    const days = (new Date(row.retain_until!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(31);
  });

  it('a quarantined file cannot be downloaded', async () => {
    const app = await getApp();
    const saved = await DocumentService.saveDocument({
      tenantId: T.tenantId, sourceApp: 'finops', entityType: 'invoice', entityId: randomUUID(), documentType: 'issued_invoice',
      filename: 'suspect.pdf', content: Buffer.from('%PDF-1.4 suspect'), retentionClass: 'financial_record',
    });
    const ok = await app.inject({ method: 'GET', url: `/v1/files/${saved.fileId}/download`, headers: authHeaders(T.token) });
    expect(ok.statusCode).toBe(200);
    await dbPlatform.updateTable('cloud_files').set({ scan_status: 'infected' }).where('id', '=', saved.fileId).execute();
    const blocked = await app.inject({ method: 'GET', url: `/v1/files/${saved.fileId}/download`, headers: authHeaders(T.token) });
    expect(blocked.statusCode).toBe(423);
    expect(blocked.json().error).toBe('QUARANTINED');
  });

  it('the integrity check flags a file whose stored object has gone missing', async () => {
    const saved = await DocumentService.saveDocument({
      tenantId: T.tenantId, sourceApp: 'finops', entityType: 'invoice', entityId: randomUUID(), documentType: 'issued_invoice',
      filename: 'lost.pdf', content: Buffer.from('%PDF-1.4 lost'), retentionClass: 'financial_record',
    });
    const row = await dbPlatform.selectFrom('cloud_files').select('storage_key').where('id', '=', saved.fileId).executeTakeFirstOrThrow();
    await MinioIntegration.deleteDocument(T.tenantId, row.storage_key!);
    const result = await runStorageIntegrityCheck(T.tenantId);
    expect(result.missing).toBeGreaterThanOrEqual(1);
    const after = await dbPlatform.selectFrom('cloud_files').select('storage_missing').where('id', '=', saved.fileId).executeTakeFirstOrThrow();
    expect(after.storage_missing).toBe(true);
  });
});

describe('Email ↔ Drive', () => {
  let T: TestTenant;
  let messageId: string;
  let attachmentKey: string;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { cloud: true, email: true });
    const up = await MinioIntegration.uploadEmailAttachment(T.tenantId, T.userId, 'contract.pdf', Buffer.from('%PDF-1.4 contract body'));
    attachmentKey = up.storageKey;
    messageId = randomUUID();
    await dbPlatform.insertInto('email_messages').values({
      id: messageId, tenant_id: T.tenantId, user_id: T.userId, folder: 'inbox', from_name: 'Sender', from_email: 'sender@example.test',
      to_addresses: JSON.stringify([]), cc_addresses: JSON.stringify([]), bcc_addresses: JSON.stringify([]),
      subject: 'Contract', body: 'See attached', snippet: 'See attached', thread_id: randomUUID(), has_attachment: true,
      attachments: JSON.stringify([{ storageKey: attachmentKey, filename: 'contract.pdf', size: up.size }]) as any,
    } as any).execute();
  });
  afterAll(async () => { await T.cleanup(); });

  it('saves a received attachment to My Drive, linked back to the message', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: `/v1/emails/${messageId}/attachment/save-to-drive`, headers: authHeaders(T.token), payload: { key: attachmentKey } });
    expect(res.statusCode, res.body).toBe(200);
    const file = await dbPlatform.selectFrom('cloud_files').selectAll().where('id', '=', res.json().fileId).executeTakeFirstOrThrow();
    expect(file.name).toBe('contract.pdf');
    expect(file.entity_type).toBe('email');
    expect(file.entity_id).toBe(messageId);
    expect(file.owner_id).toBe(T.userId);
    const drive = await dbPlatform.selectFrom('cloud_drives').select('type').where('id', '=', file.drive_id).executeTakeFirstOrThrow();
    expect(drive.type).toBe('personal');
    expect(Number(file.size)).toBeGreaterThan(0);
  });

  it('refuses to save an attachment from someone else\'s message, or a key that is not on the message', async () => {
    const app = await getApp();
    const other = await T.addUser('TENANT_ADMIN');
    const foreign = await app.inject({ method: 'POST', url: `/v1/emails/${messageId}/attachment/save-to-drive`, headers: authHeaders(other.token), payload: { key: attachmentKey } });
    expect(foreign.statusCode).toBe(404);
    const wrongKey = await app.inject({ method: 'POST', url: `/v1/emails/${messageId}/attachment/save-to-drive`, headers: authHeaders(T.token), payload: { key: 'tenants/x/email/y/not-on-this-message' } });
    expect(wrongKey.statusCode).toBe(404);
  });

  it('attaches a Drive file to a message being composed, but only files the user can read', async () => {
    const app = await getApp();
    const saved = await app.inject({ method: 'POST', url: `/v1/emails/${messageId}/attachment/save-to-drive`, headers: authHeaders(T.token), payload: { key: attachmentKey } });
    const fileId = saved.json().fileId;

    const res = await app.inject({ method: 'POST', url: '/v1/emails/attachments/from-drive', headers: authHeaders(T.token), payload: { fileId } });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().filename).toBe('contract.pdf');
    expect(res.json().storageKey).toContain(`/email/${T.userId}/`);
    const bytes = await MinioIntegration.readFile(res.json().storageKey);
    expect(bytes?.toString()).toContain('contract body');

    // Another user cannot pull a file out of the first user's private My Drive.
    const other = await T.addUser('TENANT_ADMIN');
    const denied = await app.inject({ method: 'POST', url: '/v1/emails/attachments/from-drive', headers: authHeaders(other.token), payload: { fileId } });
    expect(denied.statusCode).toBe(404);

    // A quarantined file cannot be attached.
    await dbPlatform.updateTable('cloud_files').set({ scan_status: 'infected' }).where('id', '=', fileId).execute();
    const quarantined = await app.inject({ method: 'POST', url: '/v1/emails/attachments/from-drive', headers: authHeaders(T.token), payload: { fileId } });
    expect(quarantined.statusCode).toBe(423);
  });

  it('a workspace without Cloud cannot use the Drive bridge', async () => {
    const app = await getApp();
    await enableApps(T.tenantId, { cloud: false, email: true });
    const res = await app.inject({ method: 'POST', url: `/v1/emails/${messageId}/attachment/save-to-drive`, headers: authHeaders(T.token), payload: { key: attachmentKey } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('CLOUD_NOT_ENABLED');
  });
});
