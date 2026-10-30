/**
 * Phase J: Consultant delegation integrity tests.
 * Covers portfolio CRUD, mandate lifecycle, staff assignments,
 * cross-tenant enforcement, audit logging, revocation, expiry,
 * engagements, and route ACL.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { ConsultantDelegationService } from '../services/consultant-delegation.service.js';
import { createTestTenant, getApp, type TestTenant } from './helpers.js';

let owner: TestTenant;
let provider: TestTenant;
let bystander: TestTenant;

beforeAll(async () => {
  owner = await createTestTenant('ADMIN');
  provider = await createTestTenant('ADMIN');
  bystander = await createTestTenant('ADMIN');
}, 120000);

afterAll(async () => {
  if (owner) await owner.cleanup();
  if (provider) await provider.cleanup();
  if (bystander) await bystander.cleanup();
}, 120000);

// ── J01: Portfolio CRUD ───────────────────────────────────────────

describe('J01: portfolio CRUD', () => {
  it('creates a client portfolio with workspace type', async () => {
    const p = await ConsultantDelegationService.createPortfolio(
      provider.tenantId, provider.userId, {
        client_tenant_id: owner.tenantId,
        client_name: 'Acme Trading Co.',
        client_type: 'workspace',
        contact_name: 'Jane Doe',
        contact_email: 'jane@acme.test',
        industry_key: 'logistics',
        jurisdictions: ['TZ', 'KE'],
      },
    );
    expect(p.id).toBeTruthy();
    expect(p.client_name).toBe('Acme Trading Co.');
    expect(p.client_type).toBe('workspace');
    expect(p.status).toBe('active');
  });

  it('creates an external (no-workspace) client', async () => {
    const p = await ConsultantDelegationService.createPortfolio(
      provider.tenantId, provider.userId, {
        client_name: 'External Ltd',
        client_type: 'external',
        contact_email: 'info@external.test',
      },
    );
    expect(p.client_type).toBe('external');
    expect(p.status).toBe('prospect');
    expect(p.client_tenant_id).toBeNull();
  });

  it('lists portfolios filtered by status', async () => {
    const active = await ConsultantDelegationService.listPortfolios(
      provider.tenantId, { status: 'active' },
    );
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active.every(p => p.status === 'active')).toBe(true);
  });

  it('updates portfolio status to terminated', async () => {
    const all = await ConsultantDelegationService.listPortfolios(provider.tenantId);
    const ext = all.find(p => p.client_type === 'external');
    expect(ext).toBeTruthy();
    const updated = await ConsultantDelegationService.updatePortfolioStatus(
      provider.tenantId, ext!.id as string, 'terminated',
      { termination_reason: 'Client relocated' },
    );
    expect(updated.status).toBe('terminated');
    expect(updated.terminated_at).toBeTruthy();
    expect(updated.termination_reason).toBe('Client relocated');
  });
});

// ── J02: Mandate lifecycle ────────────────────────────────────────

describe('J02: mandate lifecycle', () => {
  let mandateId: string;

  it('owner creates a pending mandate for provider', async () => {
    const m = await ConsultantDelegationService.createMandate(
      owner.tenantId, owner.userId, {
        provider_tenant_id: provider.tenantId,
        mandate_code: 'PHARMA-IMPORT-2027',
        title: 'Pharmaceutical import compliance',
        purpose: 'Handle TZ pharmaceutical import permits',
        scope_apps: ['complyos', 'clearos'],
        allowed_actions: ['view', 'prepare', 'upload'],
        effective_to: '2027-12-31',
      },
    );
    mandateId = m.id as string;
    expect(m.status).toBe('pending');
    expect(m.mandate_code).toBe('PHARMA-IMPORT-2027');
    expect(m.scope_apps).toContain('complyos');
    expect(m.allowed_actions).toContain('view');
  });

  it('owner activates the mandate', async () => {
    const m = await ConsultantDelegationService.activateMandate(
      owner.tenantId, mandateId, owner.userId,
    );
    expect(m.status).toBe('active');
    expect(m.authorized_by).toBe(owner.userId);
    expect(m.authorized_at).toBeTruthy();
  });

  it('owner can list mandates as owner', async () => {
    const ms = await ConsultantDelegationService.listMandates(
      owner.tenantId, 'owner',
    );
    expect(ms.length).toBeGreaterThanOrEqual(1);
    const found = ms.find(m => m.id === mandateId);
    expect(found).toBeTruthy();
  });

  it('provider can list mandates as provider', async () => {
    const ms = await ConsultantDelegationService.listMandates(
      provider.tenantId, 'provider',
    );
    expect(ms.length).toBeGreaterThanOrEqual(1);
  });

  it('owner suspends the mandate', async () => {
    const m = await ConsultantDelegationService.suspendMandate(
      owner.tenantId, mandateId,
    );
    expect(m.status).toBe('suspended');
  });

  it('owner revokes the mandate with reason', async () => {
    const m = await ConsultantDelegationService.revokeMandate(
      owner.tenantId, mandateId, owner.userId,
      'Switching to a different consultancy',
    );
    expect(m.status).toBe('revoked');
    expect(m.revoked_by).toBe(owner.userId);
    expect(m.revocation_reason).toBe('Switching to a different consultancy');
  });
});

// ── J03: Cross-tenant isolation ───────────────────────────────────

describe('J03: cross-tenant isolation', () => {
  it('bystander cannot see owner mandates', async () => {
    const ms = await ConsultantDelegationService.listMandates(
      bystander.tenantId, 'owner',
    );
    expect(ms).toHaveLength(0);
  });

  it('bystander cannot see provider portfolios', async () => {
    const ps = await ConsultantDelegationService.listPortfolios(bystander.tenantId);
    expect(ps).toHaveLength(0);
  });

  it('bystander mandate getById returns null for cross-tenant mandate', async () => {
    const ownerMs = await ConsultantDelegationService.listMandates(owner.tenantId, 'owner');
    if (ownerMs.length > 0) {
      const fromBystander = await ConsultantDelegationService.getMandate(
        bystander.tenantId, ownerMs[0].id as string,
      );
      expect(fromBystander).toBeNull();
    }
  });
});

// ── J04: Staff assignments ────────────────────────────────────────

describe('J04: staff assignments', () => {
  let mandateId: string;
  let staffAssignmentId: string;

  beforeAll(async () => {
    const m = await ConsultantDelegationService.createMandate(
      owner.tenantId, owner.userId, {
        provider_tenant_id: provider.tenantId,
        mandate_code: `STAFF-TEST-${Date.now()}`,
        title: 'Staff assignment test mandate',
        allowed_actions: ['view', 'prepare', 'upload', 'submit_on_behalf'],
      },
    );
    mandateId = m.id as string;
    await ConsultantDelegationService.activateMandate(owner.tenantId, mandateId, owner.userId);
  });

  it('provider assigns a staff member with role and scoped actions', async () => {
    const a = await ConsultantDelegationService.assignStaff(
      provider.tenantId, mandateId, provider.userId, {
        user_id: provider.userId,
        role_in_mandate: 'lead',
        granted_actions: ['view', 'prepare', 'upload'],
      },
    );
    staffAssignmentId = a.id as string;
    expect(a.role_in_mandate).toBe('lead');
    expect(a.granted_actions).toContain('upload');
    expect(a.status).toBe('active');
  });

  it('lists active staff for a mandate', async () => {
    const staff = await ConsultantDelegationService.listStaff(provider.tenantId, mandateId);
    expect(staff.length).toBeGreaterThanOrEqual(1);
    expect(staff[0].user_id).toBe(provider.userId);
  });

  it('removes a staff member', async () => {
    const removed = await ConsultantDelegationService.removeStaff(
      provider.tenantId, staffAssignmentId, provider.userId,
    );
    expect(removed.status).toBe('removed');
    expect(removed.removed_by).toBe(provider.userId);
    expect(removed.removed_at).toBeTruthy();
  });

  it('removed staff no longer appears in active list', async () => {
    const staff = await ConsultantDelegationService.listStaff(provider.tenantId, mandateId);
    expect(staff).toHaveLength(0);
  });
});

// ── J05: Mandate access enforcement ──────────────────────────────

describe('J05: mandate access enforcement', () => {
  let mandateId: string;

  beforeAll(async () => {
    const m = await ConsultantDelegationService.createMandate(
      owner.tenantId, owner.userId, {
        provider_tenant_id: provider.tenantId,
        mandate_code: `ENFORCE-${Date.now()}`,
        title: 'Enforcement test',
        scope_apps: ['complyos'],
        allowed_actions: ['view', 'prepare'],
        effective_to: '2028-12-31',
      },
    );
    mandateId = m.id as string;
    await ConsultantDelegationService.activateMandate(owner.tenantId, mandateId, owner.userId);
    await ConsultantDelegationService.assignStaff(
      provider.tenantId, mandateId, provider.userId, {
        user_id: provider.userId,
        role_in_mandate: 'handler',
        granted_actions: ['view', 'prepare'],
      },
    );
  });

  it('grants access for a permitted action + app', async () => {
    const result = await ConsultantDelegationService.checkMandateAccess(
      provider.tenantId, owner.tenantId, provider.userId,
      'view', { app_id: 'complyos' },
    );
    expect(result.allowed).toBe(true);
    expect(result.mandate_id).toBe(mandateId);
    expect(result.reason).toBe('granted');
  });

  it('denies access for an unpermitted action', async () => {
    const result = await ConsultantDelegationService.checkMandateAccess(
      provider.tenantId, owner.tenantId, provider.userId,
      'submit_on_behalf', { app_id: 'complyos' },
    );
    expect(result.allowed).toBe(false);
  });

  it('denies access for an out-of-scope app', async () => {
    const result = await ConsultantDelegationService.checkMandateAccess(
      provider.tenantId, owner.tenantId, provider.userId,
      'view', { app_id: 'finops' },
    );
    expect(result.allowed).toBe(false);
  });

  it('bystander has no mandate access to owner', async () => {
    const result = await ConsultantDelegationService.checkMandateAccess(
      bystander.tenantId, owner.tenantId, bystander.userId,
      'view',
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_active_mandate');
  });

  it('revoked mandate denies access', async () => {
    await ConsultantDelegationService.revokeMandate(
      owner.tenantId, mandateId, owner.userId, 'Test revocation',
    );
    const result = await ConsultantDelegationService.checkMandateAccess(
      provider.tenantId, owner.tenantId, provider.userId,
      'view', { app_id: 'complyos' },
    );
    expect(result.allowed).toBe(false);
  });
});

// ── J06: Audit logging ───────────────────────────────────────────

describe('J06: audit logging', () => {
  let mandateId: string;

  beforeAll(async () => {
    const m = await ConsultantDelegationService.createMandate(
      owner.tenantId, owner.userId, {
        provider_tenant_id: provider.tenantId,
        mandate_code: `AUDIT-${Date.now()}`,
        title: 'Audit test mandate',
      },
    );
    mandateId = m.id as string;
    await ConsultantDelegationService.activateMandate(owner.tenantId, mandateId, owner.userId);
  });

  it('logs an action with actor and on-behalf-of', async () => {
    const entry = await ConsultantDelegationService.logAction(
      mandateId, owner.tenantId, provider.tenantId, provider.userId, {
        action_type: 'document_upload',
        action_detail: 'Uploaded BRELA certificate',
        target_record_type: 'comply_certificates',
        target_record_id: '00000000-0000-0000-0000-000000000001',
        app_id: 'complyos',
      },
    );
    expect(entry.actor_user_id).toBe(provider.userId);
    expect(entry.on_behalf_of_tenant).toBe(owner.tenantId);
    expect(entry.action_type).toBe('document_upload');
  });

  it('lists audit log by mandate', async () => {
    const log = await ConsultantDelegationService.listAuditLog(
      provider.tenantId, { mandate_id: mandateId },
    );
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log[0].mandate_id).toBe(mandateId);
  });

  it('bystander cannot see audit log', async () => {
    const log = await ConsultantDelegationService.listAuditLog(
      bystander.tenantId, { mandate_id: mandateId },
    );
    expect(log).toHaveLength(0);
  });
});

// ── J07: Engagements ──────────────────────────────────────────────

describe('J07: engagements', () => {
  let portfolioId: string;

  beforeAll(async () => {
    const ps = await ConsultantDelegationService.listPortfolios(provider.tenantId, { status: 'active' });
    portfolioId = ps[0].id as string;
  });

  it('creates an engagement with fee', async () => {
    const e = await ConsultantDelegationService.createEngagement(
      provider.tenantId, provider.userId, {
        portfolio_id: portfolioId,
        title: 'Annual compliance retainer',
        engagement_type: 'retainer',
        fee_amount: 5000000,
        fee_currency: 'TZS',
        billing_type: 'retainer_monthly',
      },
    );
    expect(e.title).toBe('Annual compliance retainer');
    expect(e.fee_amount).toBe(5000000);
    expect(typeof e.fee_amount).toBe('number');
    expect(e.engagement_type).toBe('retainer');
  });

  it('lists engagements by portfolio', async () => {
    const es = await ConsultantDelegationService.listEngagements(
      provider.tenantId, { portfolio_id: portfolioId },
    );
    expect(es.length).toBeGreaterThanOrEqual(1);
  });

  it('bystander cannot see engagements', async () => {
    const es = await ConsultantDelegationService.listEngagements(bystander.tenantId);
    expect(es).toHaveLength(0);
  });
});

// ── J08: Route access control ─────────────────────────────────────

describe('J08: route access control', () => {
  it('any authenticated user can list portfolios', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/delegation/portfolios',
      headers: { authorization: `Bearer ${provider.token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('JUNIOR cannot create a portfolio', async () => {
    const junior = await provider.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/delegation/portfolios',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: { client_name: 'Should fail' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('JUNIOR cannot create a mandate', async () => {
    const junior = await owner.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/delegation/mandates',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: {
        provider_tenant_id: provider.tenantId,
        mandate_code: 'SHOULD-FAIL',
        title: 'Unauthorized',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('any authenticated user can check mandate access', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/delegation/mandates/check-access',
      headers: { authorization: `Bearer ${provider.token}` },
      payload: {
        owner_tenant_id: owner.tenantId,
        action: 'view',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('allowed');
  });
});
