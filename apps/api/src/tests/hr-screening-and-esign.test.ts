// Two of the items closed after the second build-out pass: a structured
// screening outcome (score + pass/fail) on an application, and a real,
// signable offer letter generated through the platform's own eSign app
// when an offer is sent — not a stub, a real sign_envelopes/sign_recipients
// row with a working signing link.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { dbPlatform } from '../db/client.js';

describe('Structured screening', () => {
  let tenant: TestTenant;
  beforeAll(async () => { tenant = await createTestTenant('TENANT_ADMIN'); });
  afterAll(async () => { await tenant.cleanup(); });

  it('records a screening score and pass/fail on an application', async () => {
    const app = await getApp();
    const opening = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/openings', headers: authHeaders(tenant.token),
      payload: { title: 'Screening Test Role' },
    })).json();
    const application = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/candidates', headers: authHeaders(tenant.token),
      payload: { job_opening_id: opening.id, name: 'Screening Candidate', email: 'screening@hr-test.invalid' },
    })).json();

    const rejected = await app.inject({
      method: 'PATCH', url: `/v1/hr/recruitment/applications/${application.id}`, headers: authHeaders(tenant.token),
      payload: { screening_score: 42, screening_passed: false, rejected_reason: 'Below the bar on the take-home exercise' },
    });
    expect(rejected.statusCode).toBe(200);
    const body = rejected.json();
    expect(Number(body.screening_score)).toBe(42);
    expect(body.screening_passed).toBe(false);
    expect(body.rejected_reason).toBe('Below the bar on the take-home exercise');

    // Out-of-range score is refused, not silently clamped.
    const invalid = await app.inject({
      method: 'PATCH', url: `/v1/hr/recruitment/applications/${application.id}`, headers: authHeaders(tenant.token),
      payload: { screening_score: 150 },
    });
    expect(invalid.statusCode).toBe(400);
  });
});

describe('Offer letter e-signature', () => {
  let tenant: TestTenant;
  beforeAll(async () => { tenant = await createTestTenant('TENANT_ADMIN'); });
  afterAll(async () => { await tenant.cleanup(); });

  it('sending an approved offer creates a real, signable envelope for the candidate', async () => {
    const app = await getApp();
    const opening = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/openings', headers: authHeaders(tenant.token),
      payload: { title: 'Esign Test Role' },
    })).json();
    const application = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/candidates', headers: authHeaders(tenant.token),
      payload: { job_opening_id: opening.id, name: 'Esign Candidate', email: 'esign.candidate@hr-test.invalid' },
    })).json();
    const offer = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/offers', headers: authHeaders(tenant.token),
      payload: { application_id: application.id, position_title: 'Esign Test Role', compensation_amount: 900000, compensation_currency: 'TZS' },
    })).json();

    await app.inject({ method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/submit`, headers: authHeaders(tenant.token), payload: {} });
    await app.inject({ method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/approve`, headers: authHeaders(tenant.token), payload: {} });
    const sent = await app.inject({ method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/send`, headers: authHeaders(tenant.token), payload: {} });
    expect(sent.statusCode).toBe(200);
    const sentBody = sent.json();
    expect(sentBody.status).toBe('SENT');
    expect(sentBody.sign_envelope_id).toBeTruthy();

    // The envelope is real: a real PDF (document_data) and a real signer
    // that needs no login (no user_id), matching sign_recipients' own
    // "may be external" design.
    const envelope = await dbPlatform.selectFrom('sign_envelopes')
      .select(['id', 'document_data', 'status', 'title'])
      .where('id', '=', sentBody.sign_envelope_id).executeTakeFirst();
    expect(envelope).toBeTruthy();
    expect(envelope!.document_data).toBeTruthy();
    expect(Buffer.from(envelope!.document_data as string, 'base64').subarray(0, 4).toString()).toBe('%PDF');

    const recipient = await dbPlatform.selectFrom('sign_recipients')
      .select(['name', 'email', 'user_id', 'token'])
      .where('envelope_id', '=', sentBody.sign_envelope_id).executeTakeFirst();
    expect(recipient?.email).toBe('esign.candidate@hr-test.invalid');
    expect(recipient?.user_id).toBeNull();
    expect(recipient?.token).toBeTruthy();

    const link = await app.inject({ method: 'GET', url: `/v1/hr/recruitment/offers/${offer.id}/signing-link`, headers: authHeaders(tenant.token) });
    expect(link.statusCode).toBe(200);
    expect(link.json().signing_url).toContain(recipient!.token);
  });

  it('still moves to SENT (with no envelope) when the candidate has no email on file', async () => {
    const app = await getApp();
    const opening = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/openings', headers: authHeaders(tenant.token),
      payload: { title: 'No-email Test Role' },
    })).json();
    const application = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/candidates', headers: authHeaders(tenant.token),
      payload: { job_opening_id: opening.id, name: 'No Email Candidate' },
    })).json();
    const offer = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/offers', headers: authHeaders(tenant.token),
      payload: { application_id: application.id, position_title: 'No-email Test Role' },
    })).json();
    await app.inject({ method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/submit`, headers: authHeaders(tenant.token), payload: {} });
    await app.inject({ method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/approve`, headers: authHeaders(tenant.token), payload: {} });
    const sent = await app.inject({ method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/send`, headers: authHeaders(tenant.token), payload: {} });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().status).toBe('SENT');
    expect(sent.json().sign_envelope_id).toBeNull();
  });
});
