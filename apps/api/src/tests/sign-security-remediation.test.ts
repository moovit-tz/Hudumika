/** Security regression tests for the recheck findings.
 *  Converted from evidence tests — green means the vulnerability is FIXED. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { buildSignedPdf } from '../services/sign-pdf.service.js';
import { MinioIntegration } from '../integrations/minio.js';
import { dbPlatform } from '../db/client.js';
vi.mock('../services/sign-pdf.service.js', async importOriginal => ({
  ...await importOriginal<typeof import('../services/sign-pdf.service.js')>(),
  buildSignedPdf: vi.fn().mockRejectedValue(new Error('Recheck fixture: PDF generation failure')),
}));

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==';

describe('eSign authenticated signing and finalization remediation', () => {
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


  it('withholds saved assets after OTP unless the actual owner authenticates', async () => {
    const { recipient } = await fixture(true);
    await dbPlatform.updateTable('sign_recipients').set({ otp_verified_at: new Date() }).where('id', '=', recipient.id).execute();
    const app = await getApp();
    const anonymous = await app.inject({ method: 'GET', url: `/v1/sign/public/${recipient.token}` });
    expect(anonymous.json().recipient.saved_signature).toBeNull();
    const owner = await app.inject({ method: 'GET', url: `/v1/sign/public/${recipient.token}`, headers: authHeaders(tenant.token) });
    expect(owner.json().recipient.saved_signature).toBe(png);
  });

  it('serializes duplicate signing and persists a single event before responding', async () => {
    const { envelope, recipient } = await fixture(); const app = await getApp();
    const submit = () => app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`, payload: { signature_data: png, fields: [] } });
    expect((await Promise.all([submit(), submit()])).map(r => r.statusCode).sort()).toEqual([200, 409]);
    const events = await dbPlatform.selectFrom('sign_events').select('id').where('envelope_id', '=', envelope.id).where('event_type', '=', 'signed').execute();
    expect(events).toHaveLength(1);
    const stored = await dbPlatform.selectFrom('sign_envelopes').selectAll().where('id', '=', envelope.id).executeTakeFirstOrThrow();
    expect(stored.status).toBe('finalization_failed'); expect(stored.completed_at).toBeNull(); expect(stored.stamped_at).toBeNull();
  });

  it('limits recovery to owner/admin and completes only once after a successful retry', async () => {
    const { envelope, recipient } = await fixture(); const app = await getApp();
    await app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`, payload: { signature_data: png, fields: [] } });
    const other = await tenant.addUser('JUNIOR'); const url = `/v1/sign/envelopes/${envelope.id}/retry-finalization`;
    expect((await app.inject({ method: 'POST', url, headers: authHeaders(other.token) })).statusCode).toBe(403);
    const foreign = await createTestTenant();
    try { expect((await app.inject({ method: 'POST', url, headers: authHeaders(foreign.token) })).statusCode).toBe(404); }
    finally { await foreign.cleanup(); }
    const upload = vi.spyOn(MinioIntegration, 'uploadSignedDocument').mockResolvedValue({ storageKey: 'disposable/recheck.pdf' } as any);
    vi.mocked(buildSignedPdf).mockResolvedValueOnce(Buffer.from('test artifact; actual signing tested separately'));
    try {
      const result = await app.inject({ method: 'POST', url, headers: authHeaders(tenant.token) });
      expect(result.statusCode, result.body).toBe(200); expect(result.json().completed).toBe(true);
      expect((await app.inject({ method: 'POST', url, headers: authHeaders(tenant.token) })).json().completed).toBe(true);
      expect(upload).toHaveBeenCalledTimes(1);
    } finally { upload.mockRestore(); }
  });

  it('rejects unverified and foreign-tenant certifier credentials', async () => {
    const { recipient } = await fixture(); const foreign = await createTestTenant();
    try {
      for (const tid of [tenant.tenantId, foreign.tenantId]) {
        const cred = await dbPlatform.insertInto('sign_certifiers').values({ tenant_id: tid, name: 'Test certifier', title: 'Commissioner for Oaths', created_by: tid === tenant.tenantId ? tenant.userId : foreign.userId, user_id: tenant.userId, verification_status: tid === tenant.tenantId ? 'unverified' : 'verified' }).returning('id').executeTakeFirstOrThrow();
        await dbPlatform.updateTable('sign_recipients').set({ execution_role: 'CERTIFIER', certifier_id: cred.id }).where('id', '=', recipient.id).execute();
        const response = await (await getApp()).inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`, headers: authHeaders(tenant.token), payload: { signature_data: png, fields: [] } });
        expect(response.statusCode, response.body).toBe(403);
        await dbPlatform.updateTable('sign_recipients').set({ certifier_id: null }).where('id', '=', recipient.id).execute();
        await dbPlatform.deleteFrom('sign_certifiers').where('id', '=', cred.id).execute();
      }
    } finally { await foreign.cleanup(); }
  });

  it('requires the authenticated credential holder and records that identity', async () => {
    const { recipient } = await fixture(); const other = await tenant.addUser('JUNIOR');
    const cred = await dbPlatform.insertInto('sign_certifiers').values({ tenant_id: tenant.tenantId, name: 'Disposable certifier', title: 'Commissioner for Oaths', user_id: tenant.userId, verification_status: 'verified', created_by: tenant.userId }).returning('id').executeTakeFirstOrThrow();
    try {
      await dbPlatform.updateTable('sign_recipients').set({ execution_role: 'CERTIFIER', certifier_id: cred.id }).where('id', '=', recipient.id).execute();
      const app = await getApp(); const submit = (token?: string) => app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`, headers: token ? authHeaders(token) : {}, payload: { signature_data: png, fields: [] } });
      expect((await submit()).statusCode).toBe(403); expect((await submit(other.token)).statusCode).toBe(403);
      const valid = await submit(tenant.token); expect(valid.statusCode, valid.body).toBe(200);
      const stored = await dbPlatform.selectFrom('sign_recipients').select('authenticated_signer_id').where('id', '=', recipient.id).executeTakeFirstOrThrow();
      expect(stored.authenticated_signer_id).toBe(tenant.userId);
    } finally {
      await dbPlatform.updateTable('sign_recipients').set({ certifier_id: null }).where('id', '=', recipient.id).execute();
      await dbPlatform.deleteFrom('sign_certifiers').where('id', '=', cred.id).execute();
    }
  });

  it('requires authenticated company-stamp authority rather than a sender tag', async () => {
    const { envelope, recipient } = await fixture();
    await dbPlatform.insertInto('sign_fields').values({ tenant_id: tenant.tenantId, envelope_id: envelope.id, recipient_id: recipient.id, field_type: 'stamp', required: true, page: 1, x: .1, y: .1, width: .2, height: .1 }).execute();
    const app = await getApp(); const submit = (token?: string) => app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`, headers: token ? authHeaders(token) : {}, payload: { signature_data: png, fields: [] } });
    expect((await submit()).statusCode).toBe(403);
    const valid = await submit(tenant.token); expect(valid.statusCode, valid.body).toBe(200);
  });
  it('supports browser session cookies and enforces CSRF on authenticated signing', async () => {
    const { recipient } = await fixture(); const app = await getApp();
    const cookie = `hudumika_access=${tenant.token}; hudumika_csrf=disposable-csrf`;
    const lookup = await app.inject({ method: 'GET', url: `/v1/sign/public/${recipient.token}`, headers: { cookie } });
    expect(lookup.statusCode, lookup.body).toBe(200); expect(lookup.json().recipient.saved_signature).toBe(png);
    const submit = (csrf: boolean) => app.inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`, headers: { cookie, ...(csrf ? { 'x-csrf-token': 'disposable-csrf' } : {}) }, payload: { signature_data: png, fields: [] } });
    expect((await submit(false)).statusCode).toBe(403);
    const valid = await submit(true); expect(valid.statusCode, valid.body).toBe(200);
    const stored = await dbPlatform.selectFrom('sign_recipients').select('authenticated_signer_id').where('id', '=', recipient.id).executeTakeFirstOrThrow();
    expect(stored.authenticated_signer_id).toBe(tenant.userId);
  });

  it('rejects truncated images with valid PNG magic bytes without recording a signature', async () => {
    const { recipient } = await fixture();
    const invalid = `data:image/png;base64,${Buffer.from(png.split(',')[1], 'base64').subarray(0, 24).toString('base64')}`;
    const response = await (await getApp()).inject({ method: 'POST', url: `/v1/sign/public/${recipient.token}/sign`, payload: { signature_data: invalid, fields: [] } });
    expect(response.statusCode).toBe(400);
    const stored = await dbPlatform.selectFrom('sign_recipients').select('status').where('id', '=', recipient.id).executeTakeFirstOrThrow();
    expect(stored.status).toBe('pending');
  });

});
