/**
 * Phase G: Cross-app permit capture, check contract, and coverage register
 * integrity tests. Covers the full capture→classify→register pipeline,
 * shared check contract with real cert status, dedup, tenant isolation,
 * and app coverage register.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { withTenant } from '../db/client.js';
import { PermitCheckService } from '../services/permit-check.service.js';
import { createTestTenant, getApp, type TestTenant } from './helpers.js';

let tenantA: TestTenant;
let tenantB: TestTenant;

beforeAll(async () => {
  tenantA = await createTestTenant('ADMIN');
  tenantB = await createTestTenant('ADMIN');
}, 120000);

afterAll(async () => {
  if (tenantA) await tenantA.cleanup();
  if (tenantB) await tenantB.cleanup();
}, 120000);

// ── G01: Capture pipeline ─────────────────────────────────────────────────

describe('G01: permit capture pipeline', () => {
  it('captures a candidate from a source app', async () => {
    const candidate = await PermitCheckService.captureCandidate(
      tenantA.tenantId, tenantA.userId,
      {
        source_app: 'clearos',
        source_record_type: 'shipment',
        source_file_name: 'business_license.pdf',
        holder_claim: 'Acme Ltd',
        issuer_claim: 'BRELA',
        jurisdiction_claim: 'TZ',
      },
    );
    expect(candidate.id).toBeTruthy();
    expect(candidate.source_app).toBe('clearos');
    expect(candidate.status).toBe('pending');
    expect(candidate.classification).toBe('pending');
    expect(candidate.holder_claim).toBe('Acme Ltd');
  });

  it('lists candidates filtered by source app', async () => {
    await PermitCheckService.captureCandidate(tenantA.tenantId, tenantA.userId, {
      source_app: 'nexushr',
      source_file_name: 'medical_license.pdf',
    });

    const hrCandidates = await PermitCheckService.listCandidates(tenantA.tenantId, {
      source_app: 'nexushr',
    });
    expect(hrCandidates.length).toBeGreaterThanOrEqual(1);
    expect(hrCandidates.every(c => c.source_app === 'nexushr')).toBe(true);
  });

  it('classifies a candidate as a permit', async () => {
    const candidate = await PermitCheckService.captureCandidate(
      tenantA.tenantId, tenantA.userId,
      { source_app: 'clearos', source_file_name: 'tra_license.pdf' },
    );

    const classified = await PermitCheckService.classifyCandidate(
      tenantA.tenantId, candidate.id, tenantA.userId,
      {
        classification: 'permit',
        classifier_type: 'manual',
        confidence: 0.95,
        permit_number_claim: 'TRA-2026-001',
        holder_claim: 'Test Corp',
        issuer_claim: 'TRA',
      },
    );
    expect(classified.classification).toBe('permit');
    expect(classified.status).toBe('classified');
    expect(classified.confidence).toBe(0.95);
    expect(classified.permit_number_claim).toBe('TRA-2026-001');
  });

  it('dismisses a non-permit candidate', async () => {
    const candidate = await PermitCheckService.captureCandidate(
      tenantA.tenantId, tenantA.userId,
      { source_app: 'drive', source_file_name: 'random_invoice.pdf' },
    );

    const dismissed = await PermitCheckService.dismissCandidate(
      tenantA.tenantId, candidate.id, tenantA.userId, 'Not a permit, just an invoice',
    );
    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.classification).toBe('not_permit');
    expect(dismissed.review_notes).toBe('Not a permit, just an invoice');
  });

  it('registers a candidate and links to a certificate', async () => {
    const certId = await withTenant(tenantA.tenantId, async trx => {
      const cert = await trx.insertInto('comply_certificates').values({
        tenant_id: tenantA.tenantId,
        cert_number: `REG-TEST-${Date.now()}`,
        name: 'Registration Test License',
        agency_code: 'BRELA',
        agency_name: 'BRELA',
        status: 'active',
      }).returningAll().executeTakeFirstOrThrow();
      return cert.id;
    });

    const candidate = await PermitCheckService.captureCandidate(
      tenantA.tenantId, tenantA.userId,
      { source_app: 'complyos', source_file_name: 'brela_cert.pdf' },
    );

    const registered = await PermitCheckService.registerCandidate(
      tenantA.tenantId, candidate.id, tenantA.userId,
      { linked_cert_id: certId, review_notes: 'Verified against original' },
    );
    expect(registered.status).toBe('registered');
    expect(registered.linked_cert_id).toBe(certId);
  });
});

// ── G02: Tenant isolation on candidates ───────────────────────────────────

describe('G02: candidate tenant isolation', () => {
  it('cannot read another tenant\'s candidate', async () => {
    const candidate = await PermitCheckService.captureCandidate(
      tenantA.tenantId, tenantA.userId,
      { source_app: 'clearos', source_file_name: 'private_doc.pdf' },
    );

    const fromB = await PermitCheckService.getCandidate(tenantB.tenantId, candidate.id);
    expect(fromB).toBeNull();
  });
});

// ── G03: Source dedup ─────────────────────────────────────────────────────

describe('G03: source dedup', () => {
  it('rejects duplicate capture from same source identity', async () => {
    const sourceRecordId = '00000000-0000-0000-0000-000000000099';
    const sourceAttachmentId = '00000000-0000-0000-0000-000000000088';

    await PermitCheckService.captureCandidate(tenantA.tenantId, tenantA.userId, {
      source_app: 'clearos',
      source_record_id: sourceRecordId,
      source_attachment_id: sourceAttachmentId,
      source_file_name: 'dedup_test.pdf',
    });

    await expect(
      PermitCheckService.captureCandidate(tenantA.tenantId, tenantA.userId, {
        source_app: 'clearos',
        source_record_id: sourceRecordId,
        source_attachment_id: sourceAttachmentId,
        source_file_name: 'dedup_test_copy.pdf',
      }),
    ).rejects.toThrow();
  });
});

// ── G04: Shared check contract ────────────────────────────────────────────

describe('G04: shared check contract', () => {
  it('returns valid for an active certificate with a future expiry', async () => {
    const futureExpiry = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    const certId = await withTenant(tenantA.tenantId, async trx => {
      const cert = await trx.insertInto('comply_certificates').values({
        tenant_id: tenantA.tenantId,
        cert_number: `CHECK-ACTIVE-${Date.now()}`,
        name: 'Active License',
        agency_code: 'TRA',
        agency_name: 'TRA',
        status: 'active',
        expiry_date: futureExpiry,
      }).returningAll().executeTakeFirstOrThrow();
      return cert.id;
    });

    const check = await PermitCheckService.performCheck(
      tenantA.tenantId, tenantA.userId,
      { requesting_app: 'clearos', cert_id: certId },
    );
    expect(check.result).toBe('valid');
    expect(check.impact_action).toBe('none');
    expect(check.freshness).toBe('live');
  });

  it('returns expired for an expired certificate', async () => {
    const certId = await withTenant(tenantA.tenantId, async trx => {
      const cert = await trx.insertInto('comply_certificates').values({
        tenant_id: tenantA.tenantId,
        cert_number: `CHECK-EXPIRED-${Date.now()}`,
        name: 'Expired License',
        agency_code: 'TRA',
        agency_name: 'TRA',
        status: 'expired',
      }).returningAll().executeTakeFirstOrThrow();
      return cert.id;
    });

    const check = await PermitCheckService.performCheck(
      tenantA.tenantId, tenantA.userId,
      { requesting_app: 'clearos', cert_id: certId },
    );
    expect(check.result).toBe('expired');
    expect(check.impact_action).toBe('require_review');
    expect(check.reasons.length).toBeGreaterThan(0);
  });

  it('returns revoked with block action for revoked cert', async () => {
    const certId = await withTenant(tenantA.tenantId, async trx => {
      const cert = await trx.insertInto('comply_certificates').values({
        tenant_id: tenantA.tenantId,
        cert_number: `CHECK-REVOKED-${Date.now()}`,
        name: 'Revoked License',
        agency_code: 'NEMC',
        agency_name: 'NEMC',
        status: 'revoked',
      }).returningAll().executeTakeFirstOrThrow();
      return cert.id;
    });

    const check = await PermitCheckService.performCheck(
      tenantA.tenantId, tenantA.userId,
      { requesting_app: 'clearos', cert_id: certId },
    );
    expect(check.result).toBe('revoked');
    expect(check.impact_action).toBe('block');
  });

  it('returns missing for a non-existent cert', async () => {
    const check = await PermitCheckService.performCheck(
      tenantA.tenantId, tenantA.userId,
      { requesting_app: 'clearos', cert_id: '00000000-0000-0000-0000-000000000001' },
    );
    expect(check.result).toBe('missing');
    expect(check.impact_action).toBe('block');
  });

  it('returns unknown when no cert_id or requirement_code provided', async () => {
    const check = await PermitCheckService.performCheck(
      tenantA.tenantId, tenantA.userId,
      { requesting_app: 'clearos' },
    );
    expect(check.result).toBe('unknown');
    expect(check.reasons).toContain('No cert_id or requirement_code provided');
  });

  it('cross-tenant cert check returns missing', async () => {
    const certId = await withTenant(tenantA.tenantId, async trx => {
      const cert = await trx.insertInto('comply_certificates').values({
        tenant_id: tenantA.tenantId,
        cert_number: `CROSS-CHECK-${Date.now()}`,
        name: 'Tenant A License',
        agency_code: 'BRELA',
        agency_name: 'BRELA',
        status: 'active',
      }).returningAll().executeTakeFirstOrThrow();
      return cert.id;
    });

    const check = await PermitCheckService.performCheck(
      tenantB.tenantId, tenantB.userId,
      { requesting_app: 'clearos', cert_id: certId },
    );
    expect(check.result).toBe('missing');
  });
});

// ── G05: Check history ────────────────────────────────────────────────────

describe('G05: check history', () => {
  it('lists check results filtered by requesting app', async () => {
    await PermitCheckService.performCheck(tenantA.tenantId, tenantA.userId, {
      requesting_app: 'nexushr', requirement_code: 'NONEXISTENT',
    });

    const checks = await PermitCheckService.listChecks(tenantA.tenantId, {
      requesting_app: 'nexushr',
    });
    expect(checks.length).toBeGreaterThanOrEqual(1);
    expect(checks.every(c => c.requesting_app === 'nexushr')).toBe(true);
  });
});

// ── G06: App coverage register ────────────────────────────────────────────

describe('G06: app coverage register', () => {
  it('lists all seeded app coverage entries', async () => {
    const coverage = await PermitCheckService.listAppCoverage();
    expect(coverage.length).toBeGreaterThanOrEqual(15);

    const complyos = coverage.find(c => c.app_id === 'complyos');
    expect(complyos).toBeTruthy();
    expect(complyos!.coverage_status).toBe('implemented');
  });

  it('retrieves coverage for a specific app', async () => {
    const clearos = await PermitCheckService.getAppCoverage('clearos');
    expect(clearos).toBeTruthy();
    expect(clearos!.intake_path).toBe('upload');
    expect(clearos!.check_path).toBe('clearance');
    expect(clearos!.coverage_status).toBe('planned');
  });

  it('correctly marks not-applicable apps', async () => {
    const tasks = await PermitCheckService.getAppCoverage('tasks');
    expect(tasks).toBeTruthy();
    expect(tasks!.coverage_status).toBe('not_applicable');
    expect(tasks!.intake_path).toBe('none');
    expect(tasks!.check_path).toBe('none');
  });
});

// ── G07: HTTP route access control ────────────────────────────────────────

describe('G07: route access control', () => {
  it('JUNIOR user cannot classify candidates', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const candidate = await PermitCheckService.captureCandidate(
      tenantA.tenantId, tenantA.userId,
      { source_app: 'test', source_file_name: 'acl_test.pdf' },
    );

    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/permit-capture/${candidate.id}/classify`,
      headers: { authorization: `Bearer ${junior.token}` },
      payload: { classification: 'permit', classifier_type: 'manual' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('any authenticated user can capture a candidate', async () => {
    const junior = await tenantA.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/permit-capture',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: { source_app: 'drive', source_file_name: 'some_doc.pdf' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('any authenticated user can perform a check', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/permit-checks',
      headers: { authorization: `Bearer ${tenantA.token}` },
      payload: { requesting_app: 'clearos' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe('unknown');
  });
});
