/** Security regression tests — these assert SECURE behavior.
 *  Converted from the initial audit reproductions (which asserted insecure
 *  behavior was present). A green test now means the vulnerability is fixed. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { dbPlatform } from '../db/client.js';
vi.mock('../services/sign-pdf.service.js', async importOriginal => ({
  ...await importOriginal<typeof import('../services/sign-pdf.service.js')>(),
  buildSignedPdf: vi.fn().mockRejectedValue(new Error('Audit fixture: PDF storage/generation unavailable')),
}));
import { compareExtractedText } from '../services/sign-seal-verify.service.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==';

describe('eSign security: regression tests for fixed vulnerabilities', () => {
  let tenant: TestTenant;
  let source: string;

  beforeAll(async () => {
    await getApp();
    tenant = await createTestTenant();
    const doc = await PDFDocument.create();
    doc.addPage();
    source = `data:application/pdf;base64,${Buffer.from(await doc.save()).toString('base64')}`;
    await dbPlatform.insertInto('tenant_settings')
      .values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { sign: true } }) as any })
      .execute();
  });

  afterAll(async () => {
    await dbPlatform.deleteFrom('sign_document_versions').where('tenant_id', '=', tenant.tenantId).execute();
    await dbPlatform.deleteFrom('sign_envelopes').where('tenant_id', '=', tenant.tenantId).execute();
    await tenant.cleanup();
  });

  async function fixture(status: 'sent' | 'draft' | 'completed' = 'sent', extra: Record<string, unknown> = {}) {
    const envelope = await dbPlatform.insertInto('sign_envelopes')
      .values({ tenant_id: tenant.tenantId, created_by: tenant.userId, title: 'Security regression test', status, document_data: source, ...extra } as any)
      .returningAll().executeTakeFirstOrThrow();
    const recipient = await dbPlatform.insertInto('sign_recipients')
      .values({ tenant_id: tenant.tenantId, envelope_id: envelope.id, name: 'Test signer', email: 'signer@audit.invalid', sign_order: 1 })
      .returningAll().executeTakeFirstOrThrow();
    return { envelope, recipient };
  }

  // ── ES-11: short financial edits must be detected ───────────────────────
  it('ES-11: detects short financial edits as substantive differences', () => {
    const result = compareExtractedText('Pay USD 100 on 1 May.', 'Pay USD 900 on 9 May.');
    expect(result.substantiveDifferences.length).toBeGreaterThan(0);
  });

  // ── ES-03: draft content and saved signatures are gated ─────────────────
  it('ES-03: rejects public GET for a draft envelope', async () => {
    const { recipient } = await fixture('draft', { require_otp: true });
    await dbPlatform.updateTable('sign_recipients').set({ user_id: tenant.userId }).where('id', '=', recipient.id).execute();
    await dbPlatform.insertInto('sign_stamps')
      .values({ tenant_id: tenant.tenantId, owner_type: 'user', owner_user_id: tenant.userId, image_data: png, created_by: tenant.userId })
      .execute();
    const app = await getApp();
    const result = await app.inject({ method: 'GET', url: `/v1/sign/public/${recipient.token}` });
    expect(result.statusCode).toBe(403);
  });

  it('ES-03: withholds saved signature when OTP is required but not yet verified', async () => {
    const { recipient } = await fixture('sent', { require_otp: true });
    await dbPlatform.updateTable('sign_recipients').set({ user_id: tenant.userId }).where('id', '=', recipient.id).execute();
    const app = await getApp();
    const result = await app.inject({ method: 'GET', url: `/v1/sign/public/${recipient.token}` });
    expect(result.statusCode).toBe(200);
    expect(result.json().recipient.saved_signature).toBeNull();
  });

  // ── ES-01: unrelated tenant members cannot access envelopes ─────────────
  it('ES-01: rejects envelope detail access for unrelated tenant member', async () => {
    const { envelope } = await fixture();
    const outsider = await tenant.addUser('JUNIOR');
    const app = await getApp();
    const response = await app.inject({
      method: 'GET', url: `/v1/sign/envelopes/${envelope.id}`, headers: authHeaders(outsider.token),
    });
    expect(response.statusCode).toBe(403);
  });

  it('ES-01: strips signing tokens from envelope detail response', async () => {
    const { envelope } = await fixture();
    const app = await getApp();
    const response = await app.inject({
      method: 'GET', url: `/v1/sign/envelopes/${envelope.id}`, headers: authHeaders(tenant.token),
    });
    expect(response.statusCode).toBe(200);
    const recipients = response.json().recipients;
    for (const r of recipients) {
      expect(r.token).toBeUndefined();
      expect(r.otp_code_hash).toBeUndefined();
      expect(r.signature_data).toBeUndefined();
      expect(r.signed_ip).toBeUndefined();
      expect(r.signed_user_agent).toBeUndefined();
    }
  });

  // ── ES-02: personal stamp bound to authenticated user ───────────────────
  it('ES-02: ignores owner_user_id and uses authenticated user for stamp apply', async () => {
    const outsider = await tenant.addUser('JUNIOR');
    const response = await (await getApp()).inject({
      method: 'POST', url: '/v1/sign/stamps/apply', headers: authHeaders(outsider.token),
      payload: { pdf_data: source, owner_type: 'user', owner_user_id: tenant.userId, position: { page: 1, x: .1, y: .1, width: .3, height: .1 } },
    });
    // Should fail because the outsider has no personal stamp saved (not tenant owner's)
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/No personal signature/i);
  });

  // ── ES-04: signing requires valid signature data and fields ─────────────
  it('ES-04: rejects signing with empty body', async () => {
    const { recipient } = await fixture();
    const app = await getApp();
    const response = await app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`, payload: {} });
    expect(response.statusCode).toBe(400);
  });

  it('ES-04: rejects signing with missing required field answers', async () => {
    const { envelope, recipient } = await fixture();
    await dbPlatform.insertInto('sign_fields')
      .values({ tenant_id: tenant.tenantId, envelope_id: envelope.id, recipient_id: recipient.id, field_type: 'text', page: 1, x: .1, y: .1, width: .2, height: .05, required: true, placeholder: 'Full Name' })
      .execute();
    const app = await getApp();
    const response = await app.inject({
      method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`,
      payload: { signature_data: png, fields: [] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/required/i);
  });

  // ── ES-05: lifecycle guards prevent state downgrades ────────────────────
  it('ES-05: rejects decline on a completed envelope', async () => {
    const { recipient } = await fixture('completed');
    await dbPlatform.updateTable('sign_recipients').set({ status: 'signed', signed_at: new Date() }).where('id', '=', recipient.id).execute();
    const response = await (await getApp()).inject({
      method: 'POST', url: `/v1/sign/public/${recipient.token}/decline`, payload: { reason: 'Test' },
    });
    expect(response.statusCode).toBe(409);
    // Envelope status must NOT change
    const stored = await dbPlatform.selectFrom('sign_envelopes').select('status').where('id', '=', (await dbPlatform.selectFrom('sign_recipients').select('envelope_id').where('id', '=', recipient.id).executeTakeFirstOrThrow()).envelope_id).executeTakeFirstOrThrow();
    expect(stored.status).toBe('completed');
  });

  it('ES-05: GET does not downgrade a signed recipient to viewed', async () => {
    const { recipient } = await fixture();
    await dbPlatform.updateTable('sign_recipients').set({ status: 'signed', signed_at: new Date(), viewed_at: null }).where('id', '=', recipient.id).execute();
    await (await getApp()).inject({ method: 'GET', url: `/v1/sign/public/${recipient.token}` });
    const stored = await dbPlatform.selectFrom('sign_recipients').select('status').where('id', '=', recipient.id).executeTakeFirstOrThrow();
    expect(stored.status).toBe('signed');
  });

  // ── ES-09: OTP brute-force is limited ──────────────────────────────────
  it('ES-09: locks out after too many incorrect OTP attempts', async () => {
    const { recipient } = await fixture('sent', { require_otp: true });
    await dbPlatform.updateTable('sign_recipients').set({
      otp_code_hash: createHash('sha256').update('123456').digest('hex'),
      otp_expires_at: new Date(Date.now() + 600000),
      otp_attempts: 0,
    }).where('id', '=', recipient.id).execute();
    const app = await getApp();
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/verify-otp`, payload: { code: '000000' } });
    }
    // 6th attempt should be locked out (429)
    const response = await app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/verify-otp`, payload: { code: '000000' } });
    expect(response.statusCode).toBe(429);
    // The correct code should also fail now (OTP was invalidated)
    const correct = await app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/verify-otp`, payload: { code: '123456' } });
    expect(correct.statusCode).toBe(400); // no code pending after lockout
  });
});
