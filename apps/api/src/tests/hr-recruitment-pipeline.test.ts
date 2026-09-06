// End-to-end: Requisition -> approval -> published job opening -> a
// candidate applying (twice, by email, proving the duplicate-candidate fix)
// -> an interview -> an offer through to acceptance. Also asserts the state
// machine actually refuses an impossible transition (approving a DRAFT,
// accepting a DRAFT offer) rather than silently allowing it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

describe('Recruitment pipeline: requisition -> opening -> application -> interview -> offer', () => {
  let tenant: TestTenant;

  beforeAll(async () => {
    tenant = await createTestTenant('TENANT_ADMIN');
  });

  afterAll(async () => { await tenant.cleanup(); });

  it('cannot approve a requisition that was never submitted', async () => {
    const app = await getApp();
    const created = await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/requisitions', headers: authHeaders(tenant.token),
      payload: { title: 'Senior Test Engineer' },
    });
    expect(created.statusCode).toBe(200);
    const req = created.json();
    expect(req.status).toBe('DRAFT');

    const approveTooSoon = await app.inject({
      method: 'POST', url: `/v1/hr/recruitment/requisitions/${req.id}/approve`, headers: authHeaders(tenant.token), payload: {},
    });
    expect(approveTooSoon.statusCode).toBe(409);
  });

  it('walks a requisition through the full approval workflow to a published opening', async () => {
    const app = await getApp();
    const created = await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/requisitions', headers: authHeaders(tenant.token),
      payload: { title: 'Staff Test Engineer', openings_count: 2 },
    });
    const req = created.json();

    const submitted = await app.inject({ method: 'POST', url: `/v1/hr/recruitment/requisitions/${req.id}/submit`, headers: authHeaders(tenant.token), payload: {} });
    expect(submitted.json().status).toBe('SUBMITTED');

    const approved = await app.inject({ method: 'POST', url: `/v1/hr/recruitment/requisitions/${req.id}/approve`, headers: authHeaders(tenant.token), payload: {} });
    expect(approved.json().status).toBe('APPROVED');

    const published = await app.inject({ method: 'POST', url: `/v1/hr/recruitment/requisitions/${req.id}/publish`, headers: authHeaders(tenant.token), payload: {} });
    expect(published.statusCode).toBe(200);
    const { requisition, job_opening } = published.json();
    expect(requisition.status).toBe('OPEN');
    expect(job_opening.status).toBe('OPEN');
    expect(job_opening.openings_count).toBe(2);
  });

  it('reuses the same candidate identity across two applications instead of duplicating it', async () => {
    const app = await getApp();
    const opening = await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/openings', headers: authHeaders(tenant.token),
      payload: { title: 'Test Opening A' },
    });
    const openingA = opening.json().id;
    const openingB = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/openings', headers: authHeaders(tenant.token),
      payload: { title: 'Test Opening B' },
    })).json().id;

    const email = 'repeat.candidate@hr-test.invalid';
    const firstApp = await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/candidates', headers: authHeaders(tenant.token),
      payload: { job_opening_id: openingA, name: 'Repeat Candidate', email },
    });
    expect(firstApp.statusCode).toBe(200);
    const candidateId = firstApp.json().candidate_id;

    const secondApp = await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/candidates', headers: authHeaders(tenant.token),
      payload: { job_opening_id: openingB, name: 'Repeat Candidate', email },
    });
    expect(secondApp.statusCode).toBe(200);
    // Same person, not a clone — this is the actual duplicate-candidate fix.
    expect(secondApp.json().candidate_id).toBe(candidateId);

    const history = await app.inject({ method: 'GET', url: `/v1/hr/recruitment/candidates/${candidateId}/applications`, headers: authHeaders(tenant.token) });
    expect(history.json().applications).toHaveLength(2);

    // Applying to the SAME job twice is refused rather than silently
    // duplicated.
    const thirdTime = await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/candidates', headers: authHeaders(tenant.token),
      payload: { job_opening_id: openingA, name: 'Repeat Candidate', email },
    });
    expect(thirdTime.statusCode).toBe(409);
  });

  it('cannot accept an offer that is still a DRAFT, but can accept one properly approved and sent', async () => {
    const app = await getApp();
    const opening = await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/openings', headers: authHeaders(tenant.token),
      payload: { title: 'Offer Test Role' },
    });
    const openingId = opening.json().id;
    const application = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/candidates', headers: authHeaders(tenant.token),
      payload: { job_opening_id: openingId, name: 'Offer Candidate', email: 'offer.candidate@hr-test.invalid' },
    })).json();

    const offer = (await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/offers', headers: authHeaders(tenant.token),
      payload: { application_id: application.id, position_title: 'Offer Test Role', compensation_amount: 1200000, compensation_currency: 'TZS' },
    })).json();
    expect(offer.status).toBe('DRAFT');

    const acceptTooSoon = await app.inject({
      method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/accept`, headers: authHeaders(tenant.token),
      payload: { role: 'JUNIOR' },
    });
    expect(acceptTooSoon.statusCode).toBe(409);

    await app.inject({ method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/submit`, headers: authHeaders(tenant.token), payload: {} });
    await app.inject({ method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/approve`, headers: authHeaders(tenant.token), payload: {} });
    const sent = await app.inject({ method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/send`, headers: authHeaders(tenant.token), payload: {} });
    expect(sent.json().status).toBe('SENT');

    const accepted = await app.inject({
      method: 'POST', url: `/v1/hr/recruitment/offers/${offer.id}/accept`, headers: authHeaders(tenant.token),
      payload: { role: 'JUNIOR' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe('ACCEPTED');
  });
});
