// Privacy P0 (industry-readiness backlog, item 07): "separate request
// tracking from actual export/delete/correct execution. Updating a response
// status is not proof of downstream execution." Confirmed true of
// ngao-crud.routes.ts's own POST /v1/ngao/rights-requests/:id/respond —
// marking a request COMPLETED only ever set a status column; nothing ever
// actually exported or erased anything. This exercises the real fix end to
// end through the actual HTTP route against a disposable tenant.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('Privacy rights-request execution (not just a status flip)', () => {
  let tenant: TestTenant;
  let matchedCustomerId: string;
  const matchedEmail = `rights-subject-${randomUUID().slice(0, 8)}@example.com`;

  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object) {
    return (await getApp()).inject({ method, url: `/v1/ngao${path}`, headers: authHeaders(tenant.token), ...(payload ? { payload } : {}) });
  }

  beforeAll(async () => {
    tenant = await createTestTenant('ADMIN');
    await withTenant(tenant.tenantId, async trx => {
      await trx.insertInto('tenant_settings').values({
        tenant_id: tenant.tenantId,
        settings: JSON.stringify({ 'enabled-apps': { ngao: true } }),
      }).execute();
      matchedCustomerId = (await trx.insertInto('customers').values({
        tenant_id: tenant.tenantId, name: 'Real Subject', contact_name: 'Real Subject',
        email: matchedEmail, phone: '+255700000000',
      }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);

  afterAll(async () => {
    await withTenant(tenant.tenantId, async trx => {
      await trx.deleteFrom('privacy_rights_requests').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('customers').where('tenant_id', '=', tenant.tenantId).execute();
    });
    await tenant.cleanup();
  }, 120000);

  it('actually erases a matched customer record, not just the request status, and records real evidence', async () => {
    const created = await call('POST', '/rights-requests', {
      request_type: 'ERASURE', subject_name: 'Real Subject', subject_email: matchedEmail, description: 'Please delete my data.',
    });
    expect(created.statusCode, created.body).toBe(201);
    const requestId = created.json().id;

    const responded = await call('PATCH', `/rights-requests/${requestId}/respond`, { status: 'COMPLETED' });
    expect(responded.statusCode, responded.body).toBe(200);
    const body = responded.json();
    expect(body.status).toBe('COMPLETED');
    expect(Array.isArray(body.audit_log)).toBe(true);
    const evidence = body.audit_log.find((e: any) => e.action === 'erased');
    expect(evidence).toBeDefined();
    expect(evidence.customer_id).toBe(matchedCustomerId);
    expect(Array.isArray(evidence.erased_fields)).toBe(true);
    expect(evidence.erased_fields).toContain('email');

    const customerAfter = await withTenant(tenant.tenantId, trx =>
      trx.selectFrom('customers').selectAll().where('tenant_id', '=', tenant.tenantId).where('id', '=', matchedCustomerId).executeTakeFirstOrThrow()
    );
    expect(customerAfter.email).toBeNull();
    expect(customerAfter.phone).toBeNull();
    expect(customerAfter.active).toBe(false);
    expect(customerAfter.name).toMatch(/Erased subject/);
  });

  it('refuses to complete an unmatched request without a real description of what was actually done', async () => {
    const created = await call('POST', '/rights-requests', {
      request_type: 'ACCESS', subject_name: 'Unknown Person', subject_email: `nobody-${randomUUID().slice(0, 8)}@example.com`, description: 'Send me my data.',
    });
    expect(created.statusCode, created.body).toBe(201);
    const requestId = created.json().id;

    // No matching customer exists and no response_notes were given —
    // this must be refused, not silently marked COMPLETED.
    const blocked = await call('PATCH', `/rights-requests/${requestId}/respond`, { status: 'COMPLETED' });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error).toMatch(/No matching customer record/);

    const stillPending = await withTenant(tenant.tenantId, trx =>
      trx.selectFrom('privacy_rights_requests').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', requestId).executeTakeFirstOrThrow()
    );
    expect(stillPending.status).toBe('PENDING');

    // Describing the manual execution is accepted and recorded as real
    // evidence distinct from an ordinary free-text note.
    const completed = await call('PATCH', `/rights-requests/${requestId}/respond`, {
      status: 'COMPLETED', response_notes: 'Verified identity by phone and emailed the export manually — ticket #4471.',
    });
    expect(completed.statusCode, completed.body).toBe(200);
    const evidence = completed.json().audit_log.find((e: any) => e.action === 'manual_execution_described');
    expect(evidence).toBeDefined();
    expect(evidence.notes).toMatch(/ticket #4471/);
  });

  it('serializes concurrent respond attempts on the same request so it can only be completed once', async () => {
    const created = await call('POST', '/rights-requests', {
      request_type: 'ERASURE', subject_name: 'Race Subject', subject_email: `race-${randomUUID().slice(0, 8)}@example.com`, description: 'Delete me.',
    });
    expect(created.statusCode, created.body).toBe(201);
    const requestId = created.json().id;

    const fire = () => call('PATCH', `/rights-requests/${requestId}/respond`, { status: 'COMPLETED', response_notes: 'Manually executed outside the system.' });
    const [a, b] = await Promise.all([fire(), fire()]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 422]);
  });
});
