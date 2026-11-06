/**
 * Phase K: Marketplace integrity tests.
 * Full provider/client engagement lifecycle — listing, enquiry, quotation,
 * acceptance, assignment, milestones, delivery, disputes, cross-tenant isolation.
 */
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { MarketplaceService } from '../services/marketplace.service.js';
import { ConsultantDelegationService } from '../services/consultant-delegation.service.js';
import { createTestTenant, getApp, type TestTenant } from './helpers.js';

let providerTenant: TestTenant;
let clientTenant: TestTenant;
let bystander: TestTenant;

beforeAll(async () => {
  providerTenant = await createTestTenant('ADMIN');
  clientTenant = await createTestTenant('ADMIN');
  bystander = await createTestTenant('ADMIN');
}, 120000);

afterAll(async () => {
  if (providerTenant) await providerTenant.cleanup();
  if (clientTenant) await clientTenant.cleanup();
  if (bystander) await bystander.cleanup();
}, 120000);

// ── K01: Provider listings ────────────────────────────────────────

describe('K01: provider listings', () => {
  it('creates a draft listing', async () => {
    const l = await MarketplaceService.createListing(
      providerTenant.tenantId, providerTenant.userId, {
        display_name: 'TZ Compliance Experts',
        tagline: 'Full-service regulatory compliance',
        services: ['permit_application', 'renewal_management', 'customs_clearance'],
        jurisdictions: ['TZ', 'KE'],
        industries: ['logistics', 'pharmaceutical'],
        min_fee: 500000,
        max_fee: 5000000,
        fee_currency: 'TZS',
        contact_email: 'info@compliance.test',
      },
    );
    expect(l.id).toBeTruthy();
    expect(l.status).toBe('draft');
    expect(l.verification_status).toBe('unverified');
    expect(l.min_fee).toBe(500000);
    expect(typeof l.min_fee).toBe('number');
  });

  it('publishes the listing', async () => {
    const listings = await MarketplaceService.listListings(
      providerTenant.tenantId, { only_own: true },
    );
    const updated = await MarketplaceService.updateListingStatus(
      providerTenant.tenantId, listings[0].id as string, 'published',
    );
    expect(updated.status).toBe('published');
  });

  it('published listing is visible to client tenant', async () => {
    const all = await MarketplaceService.listListings(
      clientTenant.tenantId, { status: 'published' },
    );
    expect(all.length).toBeGreaterThanOrEqual(1);
    const found = all.find((l: any) => l.display_name === 'TZ Compliance Experts');
    expect(found).toBeTruthy();
  });

  it('draft listing NOT visible to client', async () => {
    await MarketplaceService.createListing(
      providerTenant.tenantId, providerTenant.userId, {
        display_name: 'Secret Draft Firm',
      },
    );
    const all = await MarketplaceService.listListings(clientTenant.tenantId);
    const found = all.find((l: any) => l.display_name === 'Secret Draft Firm');
    expect(found).toBeUndefined();
  });
});

// ── K02: Enquiry flow ─────────────────────────────────────────────

describe('K02: enquiry flow', () => {
  let enquiryId: string;

  it('client sends an enquiry to provider', async () => {
    const e = await MarketplaceService.createEnquiry(
      clientTenant.tenantId, clientTenant.userId, {
        provider_tenant_id: providerTenant.tenantId,
        subject: 'BRELA + TFDA renewals for 2027',
        brief: 'Need help renewing 5 business permits and 3 TFDA registrations',
        services_requested: ['renewal_management'],
        jurisdictions: ['TZ'],
        urgency: 'high',
        budget_min: 2000000,
        budget_max: 8000000,
      },
    );
    enquiryId = e.id as string;
    expect(e.status).toBe('open');
    expect(e.urgency).toBe('high');
  });

  it('provider can see the enquiry', async () => {
    const es = await MarketplaceService.listEnquiries(
      providerTenant.tenantId, 'provider',
    );
    expect(es.length).toBeGreaterThanOrEqual(1);
    const found = es.find((e: any) => e.id === enquiryId);
    expect(found).toBeTruthy();
  });

  it('provider responds to enquiry', async () => {
    const updated = await MarketplaceService.updateEnquiryStatus(
      providerTenant.tenantId, enquiryId, 'responded',
    );
    expect(updated.status).toBe('responded');
    expect(updated.responded_at).toBeTruthy();
  });

  it('bystander cannot see enquiry', async () => {
    const es = await MarketplaceService.listEnquiries(bystander.tenantId, 'client');
    expect(es).toHaveLength(0);
    const esProv = await MarketplaceService.listEnquiries(bystander.tenantId, 'provider');
    expect(esProv).toHaveLength(0);
  });
});

// ── K03: Quotation lifecycle ──────────────────────────────────────

describe('K03: quotation lifecycle', () => {
  let quotationId: string;

  it('provider creates a quotation with fee breakdown', async () => {
    const q = await MarketplaceService.createQuotation(
      providerTenant.tenantId, providerTenant.userId, {
        client_tenant_id: clientTenant.tenantId,
        quote_number: `Q-${Date.now()}`,
        scope_description: '5 BRELA renewals + 3 TFDA re-registrations',
        authority_fees: 750000,
        professional_fees: 3500000,
        platform_charges: 175000,
        variable_services: 500000,
        currency: 'TZS',
        valid_until: '2027-06-30',
      },
    );
    quotationId = q.id as string;
    expect(q.status).toBe('draft');
    expect(q.authority_fees).toBe(750000);
    expect(q.professional_fees).toBe(3500000);
    expect(q.total_amount).toBe(4925000);
    expect(typeof q.total_amount).toBe('number');
  });

  it('provider sends the quotation', async () => {
    const sent = await MarketplaceService.sendQuotation(
      providerTenant.tenantId, quotationId,
    );
    expect(sent.status).toBe('sent');
  });

  it('client can see the sent quotation', async () => {
    const qs = await MarketplaceService.listQuotations(clientTenant.tenantId, 'client');
    expect(qs.length).toBeGreaterThanOrEqual(1);
    const found = qs.find((q: any) => q.id === quotationId);
    expect(found).toBeTruthy();
    expect(found!.status).toBe('sent');
  });

  it('client accepts the quotation', async () => {
    const accepted = await MarketplaceService.acceptQuotation(
      clientTenant.tenantId, quotationId, clientTenant.userId,
    );
    expect(accepted.status).toBe('accepted');
    expect(accepted.accepted_by).toBe(clientTenant.userId);
  });
});

// ── K04: Assignment and milestones ────────────────────────────────

describe('K04: assignments and milestones', () => {
  let assignmentId: string;
  let milestoneId: string;

  it('provider creates an assignment', async () => {
    const a = await MarketplaceService.createAssignment(
      providerTenant.tenantId, providerTenant.userId, {
        client_tenant_id: clientTenant.tenantId,
        title: 'BRELA Business License Renewal',
        description: 'Renew business license before March 2027 deadline',
        assigned_to: providerTenant.userId,
        priority: 'high',
        due_date: '2027-02-28',
      },
    );
    assignmentId = a.id as string;
    expect(a.status).toBe('pending');
    expect(a.priority).toBe('high');
  });

  it('client can see their assignments', async () => {
    const as_ = await MarketplaceService.listAssignments(
      clientTenant.tenantId, 'client',
    );
    expect(as_.length).toBeGreaterThanOrEqual(1);
  });

  it('provider starts work on assignment', async () => {
    const updated = await MarketplaceService.updateAssignmentStatus(
      providerTenant.tenantId, assignmentId, 'in_progress',
    );
    expect(updated.status).toBe('in_progress');
  });

  it('provider creates a milestone with evidence', async () => {
    const m = await MarketplaceService.createMilestone(
      providerTenant.tenantId, providerTenant.userId, {
        assignment_id: assignmentId,
        title: 'BRELA Application Submitted',
        description: 'Application form submitted with all required documents',
        evidence_type: 'receipt',
        evidence_url: 'https://storage.test/brela-receipt-2027.pdf',
      },
    );
    milestoneId = m.id as string;
    expect(m.status).toBe('pending');
    expect(m.evidence_type).toBe('receipt');
  });

  it('provider submits milestone for review', async () => {
    const submitted = await MarketplaceService.submitMilestone(
      providerTenant.tenantId, milestoneId,
    );
    expect(submitted.status).toBe('submitted');
    expect(submitted.submitted_at).toBeTruthy();
  });

  it('client accepts the milestone', async () => {
    const reviewed = await MarketplaceService.reviewMilestone(
      clientTenant.tenantId, milestoneId, clientTenant.userId,
      true, 'Receipt confirmed, thank you',
    );
    expect(reviewed.status).toBe('accepted');
    expect(reviewed.reviewed_by).toBe(clientTenant.userId);
    expect(reviewed.review_notes).toBe('Receipt confirmed, thank you');
  });

  it('provider completes the assignment', async () => {
    const completed = await MarketplaceService.updateAssignmentStatus(
      providerTenant.tenantId, assignmentId, 'completed',
    );
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).toBeTruthy();
  });
});

// ── K05: Disputes ─────────────────────────────────────────────────

describe('K05: disputes', () => {
  let disputeId: string;
  let disputeAssignmentId: string;

  beforeAll(async () => {
    const a = await MarketplaceService.createAssignment(
      providerTenant.tenantId, providerTenant.userId, {
        client_tenant_id: clientTenant.tenantId,
        title: 'Disputed Assignment',
      },
    );
    disputeAssignmentId = a.id as string;
  });

  it('client raises a dispute', async () => {
    const d = await MarketplaceService.createDispute(
      clientTenant.tenantId, clientTenant.userId, {
        assignment_id: disputeAssignmentId,
        against_tenant: providerTenant.tenantId,
        reason: 'Work not completed within agreed timeline',
        details: 'Deadline was 2027-02-28 but no progress shown',
      },
    );
    disputeId = d.id as string;
    expect(d.status).toBe('open');
    expect(d.raised_by_tenant).toBe(clientTenant.tenantId);
    expect(d.against_tenant).toBe(providerTenant.tenantId);
  });

  it('provider can see the dispute', async () => {
    const ds = await MarketplaceService.listDisputes(providerTenant.tenantId);
    expect(ds.length).toBeGreaterThanOrEqual(1);
    const found = ds.find((d: any) => d.id === disputeId);
    expect(found).toBeTruthy();
  });

  it('dispute is resolved', async () => {
    const resolved = await MarketplaceService.resolveDispute(
      clientTenant.tenantId, disputeId, clientTenant.userId,
      'Provider agreed to extend deadline by 2 weeks and provide weekly updates',
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toContain('extend deadline');
  });

  it('bystander cannot see disputes', async () => {
    const ds = await MarketplaceService.listDisputes(bystander.tenantId);
    expect(ds).toHaveLength(0);
  });
});

// ── K06: Cross-tenant isolation ───────────────────────────────────

describe('K06: cross-tenant isolation', () => {
  it('bystander cannot see client enquiries', async () => {
    const es = await MarketplaceService.listEnquiries(bystander.tenantId, 'client');
    expect(es).toHaveLength(0);
  });

  it('bystander cannot see provider quotations', async () => {
    const qs = await MarketplaceService.listQuotations(bystander.tenantId, 'provider');
    expect(qs).toHaveLength(0);
  });

  it('bystander cannot see client assignments', async () => {
    const as_ = await MarketplaceService.listAssignments(bystander.tenantId, 'client');
    expect(as_).toHaveLength(0);
  });
});

// ── K07: End-to-end engagement with mandate integration ───────────

describe('K07: end-to-end engagement with delegation', () => {
  it('provider creates portfolio, mandate, engagement, and assignment — all linked', async () => {
    const portfolio = await ConsultantDelegationService.createPortfolio(
      providerTenant.tenantId, providerTenant.userId, {
        client_tenant_id: clientTenant.tenantId,
        client_name: 'E2E Test Client',
        client_type: 'workspace',
      },
    );

    const mandate = await ConsultantDelegationService.createMandate(
      clientTenant.tenantId, clientTenant.userId, {
        provider_tenant_id: providerTenant.tenantId,
        mandate_code: `E2E-${Date.now()}`,
        title: 'Full compliance delegation',
        scope_apps: ['complyos'],
        allowed_actions: ['view', 'prepare', 'upload', 'submit_on_behalf'],
      },
    );
    await ConsultantDelegationService.activateMandate(
      clientTenant.tenantId, mandate.id as string, clientTenant.userId,
    );

    const engagement = await ConsultantDelegationService.createEngagement(
      providerTenant.tenantId, providerTenant.userId, {
        portfolio_id: portfolio.id as string,
        mandate_id: mandate.id as string,
        title: 'Annual compliance contract',
        engagement_type: 'retainer',
        fee_amount: 12000000,
        billing_type: 'retainer_monthly',
      },
    );

    const assignment = await MarketplaceService.createAssignment(
      providerTenant.tenantId, providerTenant.userId, {
        client_tenant_id: clientTenant.tenantId,
        engagement_id: engagement.id as string,
        mandate_id: mandate.id as string,
        title: 'TFDA Product Registration',
        assigned_to: providerTenant.userId,
      },
    );

    expect(assignment.engagement_id).toBe(engagement.id);
    expect(assignment.mandate_id).toBe(mandate.id);

    await ConsultantDelegationService.assignStaff(
      providerTenant.tenantId, mandate.id as string, providerTenant.userId, {
        user_id: providerTenant.userId,
        role_in_mandate: 'lead',
        granted_actions: ['view', 'prepare', 'upload'],
      },
    );

    const access = await ConsultantDelegationService.checkMandateAccess(
      providerTenant.tenantId, clientTenant.tenantId, providerTenant.userId,
      'prepare', { app_id: 'complyos' },
    );
    expect(access.allowed).toBe(true);

    await ConsultantDelegationService.logAction(
      mandate.id as string, clientTenant.tenantId, providerTenant.tenantId,
      providerTenant.userId, {
        action_type: 'assignment_started',
        target_record_type: 'marketplace_assignments',
        target_record_id: assignment.id as string,
        app_id: 'complyos',
      },
    );

    const log = await ConsultantDelegationService.listAuditLog(
      providerTenant.tenantId, { mandate_id: mandate.id as string },
    );
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log[0].actor_user_id).toBe(providerTenant.userId);
    expect(log[0].on_behalf_of_tenant).toBe(clientTenant.tenantId);
  });
});

// ── K08: Route ACL ────────────────────────────────────────────────

describe('K08: route access control', () => {
  it('any authenticated user can list marketplace listings', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/marketplace/listings',
      headers: { authorization: `Bearer ${clientTenant.token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('JUNIOR cannot create a listing', async () => {
    const junior = await providerTenant.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/marketplace/listings',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: { display_name: 'Should fail' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('JUNIOR cannot create a dispute', async () => {
    const junior = await clientTenant.addUser('JUNIOR');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/marketplace/disputes',
      headers: { authorization: `Bearer ${junior.token}` },
      payload: {
        assignment_id: '00000000-0000-0000-0000-000000000001',
        against_tenant: providerTenant.tenantId,
        reason: 'test',
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
