/**
 * ComplyOS Phase C integrity regression tests.
 * Each test reproduces a finding from the 2026-10-29 permit control review
 * and verifies the fix holds.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import { ComplyService } from '../services/comply.service.js';
import { createTestTenant, type TestTenant } from './helpers.js';

let tenantA: TestTenant;
let tenantB: TestTenant;

beforeAll(async () => {
  tenantA = await createTestTenant('TENANT_ADMIN');
  tenantB = await createTestTenant('TENANT_ADMIN');
}, 120000);

afterAll(async () => {
  if (tenantA) await tenantA.cleanup();
  if (tenantB) await tenantB.cleanup();
}, 120000);

async function seedCertificate(tenantId: string, overrides: Record<string, unknown> = {}) {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.insertInto('comply_certificates').values({
      tenant_id: tenantId,
      cert_number: `TEST-${randomUUID().slice(0, 8)}`,
      name: 'Test Certificate',
      agency_code: 'TEST',
      agency_name: 'Test Agency',
      ...overrides,
    }).returningAll().executeTakeFirstOrThrow();
    return row;
  });
}

async function seedCustomer(tenantId: string, name = 'Test Customer') {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.insertInto('customers').values({
      tenant_id: tenantId,
      name,
      category: 'sme',
      active: true,
      avatar_initials: name.slice(0, 2).toUpperCase(),
      avatar_color: '#0b7264',
    }).returningAll().executeTakeFirstOrThrow();
    return row;
  });
}

// ── C01: unchanged expiry must not close a renewal ──────────────────────────

describe('C01: false renewal completion', () => {
  it('re-submitting the same expiry_date does not mark a pending renewal as issued', async () => {
    const cert = await seedCertificate(tenantA.tenantId, {
      expiry_date: new Date('2030-12-31'),
    });

    const renewal = await ComplyService.startRenewal(tenantA.tenantId, cert.id, 'manual');
    expect(renewal.status).toBe('pending_review');

    // Re-submit the SAME expiry date — this is a metadata correction, not a renewal
    await ComplyService.updateCertificate(tenantA.tenantId, cert.id, {
      expiry_date: '2030-12-31',
    });

    const renewals = await ComplyService.getRenewals(tenantA.tenantId);
    const thisRenewal = renewals.find(r => r.id === renewal.id);
    expect(thisRenewal).toBeDefined();
    expect(thisRenewal!.status).toBe('pending_review');
    expect(thisRenewal!.completed_at).toBeNull();
  }, 30000);

  it('a genuinely different expiry_date DOES close an approved renewal', async () => {
    const cert = await seedCertificate(tenantA.tenantId, {
      expiry_date: new Date('2030-06-30'),
    });

    const renewal = await ComplyService.startRenewal(tenantA.tenantId, cert.id, 'manual');
    expect(renewal.status).toBe('pending_review');

    // Advance the renewal to 'approved' + 'submitted' (authority-submitted) before the expiry change
    await withTenant(tenantA.tenantId, async (db) => {
      await db.updateTable('comply_renewals')
        .set({ status: 'approved', approved_by: tenantA.userId, approved_at: new Date(), submitted_at: new Date() })
        .where('id', '=', renewal.id)
        .where('tenant_id', '=', tenantA.tenantId)
        .execute();
    });

    // Submit a DIFFERENT expiry date — completes the approved renewal
    await ComplyService.updateCertificate(tenantA.tenantId, cert.id, {
      expiry_date: '2031-06-30',
    });

    const renewals = await ComplyService.getRenewals(tenantA.tenantId);
    const thisRenewal = renewals.find(r => r.id === renewal.id);
    expect(thisRenewal).toBeDefined();
    expect(thisRenewal!.status).toBe('issued');
    expect(thisRenewal!.completed_at).not.toBeNull();
  }, 30000);
});

// ── C03: cross-tenant customer reference ────────────────────────────────────

describe('C03: cross-tenant customer reference', () => {
  it('updateCertificate rejects a foreign-tenant customer_id', async () => {
    const cert = await seedCertificate(tenantA.tenantId);
    const foreignCustomer = await seedCustomer(tenantB.tenantId, 'Foreign Co');

    await expect(
      ComplyService.updateCertificate(tenantA.tenantId, cert.id, {
        customer_id: foreignCustomer.id,
      }),
    ).rejects.toThrow();
  }, 30000);

  it('updateApplication rejects a foreign-tenant customer_id', async () => {
    const app = await ComplyService.createApplication(tenantA.tenantId, tenantA.userId, {
      cert_type: 'Business License', agency_code: 'BRELA',
    });
    const foreignCustomer = await seedCustomer(tenantB.tenantId, 'Foreign App Co');

    await expect(
      ComplyService.updateApplication(tenantA.tenantId, app.id, {
        customer_id: foreignCustomer.id,
      } as any),
    ).rejects.toThrow();
  }, 30000);

  it('updateObligation rejects a foreign-tenant customer_id', async () => {
    const obligation = await ComplyService.createObligation(tenantA.tenantId, {
      obligation_code: 'TEST-OBL-01', agency_code: 'TEST', name: 'Test Obligation', frequency: 'annual',
    });
    const foreignCustomer = await seedCustomer(tenantB.tenantId, 'Foreign Obl Co');

    await expect(
      ComplyService.updateObligation(tenantA.tenantId, obligation.id, {
        customer_id: foreignCustomer.id,
      }),
    ).rejects.toThrow();
  }, 30000);

  it('updateCertificate accepts a same-tenant customer_id', async () => {
    const cert = await seedCertificate(tenantA.tenantId);
    const ownCustomer = await seedCustomer(tenantA.tenantId, 'Own Co');

    await expect(
      ComplyService.updateCertificate(tenantA.tenantId, cert.id, {
        customer_id: ownCustomer.id,
      }),
    ).resolves.not.toThrow();
  }, 30000);
});

// ── C04: jurisdiction validation in obligation scan ─────────────────────────

describe('C04: jurisdiction validation', () => {
  it('rejects an unsupported jurisdiction explicitly', async () => {
    await expect(
      ComplyService.scanObligations(tenantA.tenantId, {
        sector: 'Manufacturing',
        jurisdiction: 'KE',
      } as any),
    ).rejects.toThrow(/not yet supported/);
  }, 30000);

  it('rejects an unsupported country field', async () => {
    await expect(
      ComplyService.scanObligations(tenantA.tenantId, {
        sector: 'Manufacturing',
        country: 'KE',
      } as any),
    ).rejects.toThrow(/not yet supported/);
  }, 30000);

  it('accepts TZ jurisdiction (the only supported one)', async () => {
    const result = await ComplyService.scanObligations(tenantA.tenantId, {
      sector: 'Manufacturing',
    } as any);
    expect(result.profile.jurisdiction).toBe('TZ');
  }, 30000);
});

// ── C07: dashboard health score truthfulness ────────────────────────────────

describe('C07: dashboard health score', () => {
  it('empty workspace returns health_score -1 (assessment incomplete)', async () => {
    // tenantB has no certificates
    const stats = await ComplyService.getDashboardStats(tenantB.tenantId);
    expect(stats.health_score).toBe(-1);
  }, 30000);

  it('null-expiry certificate status is "unknown", not "active"', async () => {
    await seedCertificate(tenantB.tenantId, { expiry_date: null });
    const certs = await ComplyService.getCertificates(tenantB.tenantId);
    const nullExpiryCert = certs.find(c => c.expiry_date === null);
    expect(nullExpiryCert).toBeDefined();
    expect(nullExpiryCert!.status).toBe('unknown');
  }, 30000);
});

// ── C09: approval of nonexistent renewal ────────────────────────────────────

describe('C09: nonexistent renewal approval', () => {
  it('approving a random UUID throws instead of returning success', async () => {
    const fakeId = randomUUID();
    await expect(
      ComplyService.approveRenewal(tenantA.tenantId, fakeId, tenantA.userId),
    ).rejects.toThrow(/not found/);
  }, 30000);

  it('approving an already-approved renewal throws', async () => {
    const cert = await seedCertificate(tenantA.tenantId, {
      expiry_date: new Date('2027-06-30'),
    });
    const renewal = await ComplyService.startRenewal(tenantA.tenantId, cert.id, 'manual');
    await ComplyService.approveRenewal(tenantA.tenantId, renewal.id, tenantA.userId);

    // Second approval should fail — it's no longer pending_review
    await expect(
      ComplyService.approveRenewal(tenantA.tenantId, renewal.id, tenantA.userId),
    ).rejects.toThrow(/not found|not in pending_review/);
  }, 30000);
});
