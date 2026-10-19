/** Security regression tests for the recheck findings.
 *  Converted from evidence tests — green means the vulnerability is FIXED. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { dbPlatform } from '../db/client.js';
vi.mock('../services/sign-pdf.service.js', async importOriginal => ({
  ...await importOriginal<typeof import('../services/sign-pdf.service.js')>(),
  buildSignedPdf: vi.fn().mockRejectedValue(new Error('Recheck fixture: PDF generation failure')),
}));

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==';

describe('eSign recheck: regression tests for fixed vulnerabilities', () => {
  let tenant: TestTenant;
  let source: string;

  beforeAll(async () => {
    await getApp();
    tenant = await createTestTenant();
    const pdf = await PDFDocument.create();
    pdf.addPage();
    source = `data:application/pdf;base64,${Buffer.from(await pdf.save()).toString('base64')}`;
    await dbPlatform.insertInto('tenant_settings')
      .values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { sign: true } }) as any })
      .execute();
    await dbPlatform.insertInto('sign_stamps')
      .values({ tenant_id: tenant.tenantId, owner_type: 'user', owner_user_id: tenant.userId, image_data: png, created_by: tenant.userId })
      .execute();
  });

  afterAll(async () => {
    await dbPlatform.deleteFrom('sign_document_versions').where('tenant_id', '=', tenant.tenantId).execute();
    await dbPlatform.deleteFrom('sign_envelopes').where('tenant_id', '=', tenant.tenantId).execute();
    await tenant.cleanup();
  });

  async function fixture(otp = false) {
    const envelope = await dbPlatform.insertInto('sign_envelopes')
      .values({ tenant_id: tenant.tenantId, created_by: tenant.userId, title: 'Recheck regression', status: 'sent', document_data: source, require_otp: otp } as any)
      .returningAll().executeTakeFirstOrThrow();
    const recipient = await dbPlatform.insertInto('sign_recipients')
      .values({ tenant_id: tenant.tenantId, envelope_id: envelope.id, name: 'Sample signer', email: 'sample@recheck.invalid', sign_order: 1, user_id: tenant.userId })
      .returningAll().executeTakeFirstOrThrow();
    return { envelope, recipient };
  }

  // ── 1. Saved signature not disclosed to sender-created tokens without OTP ──
  it('does not expose saved signature when OTP is disabled', async () => {
    const actor = await tenant.addUser('JUNIOR');
    const response = await (await getApp()).inject({
      method: 'POST', url: '/v1/sign/envelopes', headers: authHeaders(actor.token),
      payload: { title: 'Signature lookup test', recipients: [{ name: 'Admin identity', email: 'sender@recheck.invalid', user_id: tenant.userId }], fields: [] },
    });
    expect(response.statusCode, response.body).toBe(201);
    // Tokens must be stripped from the creation response
    expect(response.json().recipients[0].token).toBeUndefined();

    // Move to sent via DB (avoids real invitation sending)
    const id = response.json().id;
    const recipientRow = await dbPlatform.selectFrom('sign_recipients').select('token')
      .where('envelope_id', '=', id).executeTakeFirstOrThrow();
    await dbPlatform.updateTable('sign_envelopes').set({ status: 'sent' }).where('id', '=', id).execute();

    const result = await (await getApp()).inject({ method: 'GET', url: `/v1/sign/public/${recipientRow.token}` });
    expect(result.statusCode).toBe(200);
    // Without OTP verification, saved signature must NOT be returned
    expect(result.json().recipient.saved_signature).toBeNull();
  });

  // ── 2. Document bytes withheld before OTP verification ──
  it('withholds document bytes before required OTP verification', async () => {
    const { recipient } = await fixture(true);
    const response = await (await getApp()).inject({ method: 'GET', url: `/v1/sign/public/${recipient.token}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().recipient.otp_verified).toBe(false);
    // Document data must be null until OTP is verified
    expect(response.json().envelope.document_data).toBeNull();
  });

  // ── 3. Completion not announced after PDF failure ──
  it('does not mark completed when PDF generation fails', async () => {
    const { envelope, recipient } = await fixture();
    const response = await (await getApp()).inject({
      method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`,
      payload: { signature_data: png, fields: [] },
    });
    expect(response.statusCode, response.body).toBe(200);
    // Must report NOT completed since PDF failed
    expect(response.json().completed).toBe(false);
    const stored = await dbPlatform.selectFrom('sign_envelopes').selectAll()
      .where('id', '=', envelope.id).executeTakeFirstOrThrow();
    expect(stored.status).toBe('finalization_failed');
    expect(stored.stamped_file_url).toBeNull();
  });

  // ── 3b. Malformed image rejected ──
  it('rejects a malformed image data URI as signature', async () => {
    const { recipient } = await fixture();
    const response = await (await getApp()).inject({
      method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`,
      payload: { signature_data: 'data:image/png;base64,not-valid-png', fields: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  // ── 4. Required checkbox rejects 'false' ──
  it('rejects false for a required checkbox', async () => {
    const { envelope, recipient } = await fixture();
    const field = await dbPlatform.insertInto('sign_fields')
      .values({ tenant_id: tenant.tenantId, envelope_id: envelope.id, recipient_id: recipient.id, field_type: 'checkbox', required: true, page: 1, x: .1, y: .1, width: .05, height: .05 })
      .returning('id').executeTakeFirstOrThrow();
    const response = await (await getApp()).inject({
      method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`,
      payload: { signature_data: png, fields: [{ field_id: field.id, value: 'false' }] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/checkbox/i);
  });

  // ── 5. Certification requires directory credentials ──
  it('rejects certification without directory credentials', async () => {
    const { recipient } = await fixture();
    await dbPlatform.updateTable('sign_recipients').set({
      execution_role: 'CERTIFIER', is_certifier: true, certifier_title: 'Commissioner for Oaths', certifier_id: null,
    }).where('id', '=', recipient.id).execute();
    const response = await (await getApp()).inject({
      method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`,
      payload: { signature_data: png, fields: [] },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toMatch(/credential/i);
  });
  it('serializes a signature against a simultaneous decline', async () => {
    const { envelope, recipient } = await fixture();
    const app = await getApp();
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`, payload: { signature_data: png, fields: [] } }),
      app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/decline`, payload: { reason: 'Disposable concurrency test' } }),
    ]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const events = await dbPlatform.selectFrom('sign_events').select('event_type').where('envelope_id', '=', envelope.id).where('event_type', 'in', ['signed', 'declined']).execute();
    expect(events).toHaveLength(1);
  });

});
