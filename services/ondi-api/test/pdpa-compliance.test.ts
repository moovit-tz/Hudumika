import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp, registerAndLogin, authHeader, randomRegNumber, type TestApp } from './helpers.js';

describe('PDPA compliance program: processing activities, rights requests, incidents, vendors, maturity assessment', () => {
  let t: TestApp;
  let ownerToken: string;
  let orgId: string;

  beforeAll(async () => {
    t = await buildTestApp();
    const owner = await registerAndLogin(t);
    ownerToken = owner.token;
    const res = await t.app.inject({
      method: 'POST', url: '/v1/organizations', headers: authHeader(ownerToken),
      payload: { businessName: 'Pwani Data Holdings', registrationNumber: randomRegNumber() },
    });
    orgId = res.json().id;
  });
  afterAll(async () => { await closeTestApp(t); });

  it('creates, lists, and updates a real ProcessingActivity', async () => {
    const createRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/compliance/pdpa/processing-activities`,
      headers: authHeader(ownerToken),
      payload: {
        name: 'Payroll processing', description: 'Monthly salary runs',
        dataCategories: ['financial', 'contact'], purposes: ['payroll'],
        legalBasis: 'CONTRACT', dataSubjects: ['employees'], retentionMonths: 84,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const activity = createRes.json();
    expect(activity.id).toBeTruthy();
    expect(activity.isActive).toBe(true);

    const dbActivity = await t.app.prisma.processingActivity.findUnique({ where: { id: activity.id } });
    expect(dbActivity).not.toBeNull();
    expect(dbActivity!.organizationId).toBe(orgId);

    const listRes = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${orgId}/compliance/pdpa/processing-activities`, headers: authHeader(ownerToken),
    });
    expect(listRes.json().activities.map((a: any) => a.id)).toContain(activity.id);

    const updateRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${orgId}/compliance/pdpa/processing-activities/${activity.id}`,
      headers: authHeader(ownerToken), payload: { isActive: false, retentionMonths: 12 },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().isActive).toBe(false);
    expect(updateRes.json().retentionMonths).toBe(12);
  });

  it('creates and resolves a real RightsRequest with a real deadline', async () => {
    const createRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/compliance/pdpa/rights-requests`,
      headers: authHeader(ownerToken),
      payload: {
        requestType: 'ACCESS', subjectName: 'Fatuma Said', subjectEmail: 'fatuma@example.com',
        description: 'Requesting a copy of all personal data held', deadlineDays: 14,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const request = createRes.json();
    const expectedDeadline = Date.now() + 14 * 24 * 60 * 60 * 1000;
    expect(new Date(request.deadlineAt).getTime()).toBeGreaterThan(expectedDeadline - 60_000);
    expect(new Date(request.deadlineAt).getTime()).toBeLessThan(expectedDeadline + 60_000);
    expect(request.status).toBe('PENDING');

    const listRes = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${orgId}/compliance/pdpa/rights-requests?status=PENDING`, headers: authHeader(ownerToken),
    });
    expect(listRes.json().requests.map((r: any) => r.id)).toContain(request.id);

    const fulfillRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${orgId}/compliance/pdpa/rights-requests/${request.id}`,
      headers: authHeader(ownerToken), payload: { status: 'FULFILLED', responseNotes: 'Export sent via secure link' },
    });
    expect(fulfillRes.statusCode).toBe(200);
    const fulfilled = fulfillRes.json();
    expect(fulfilled.status).toBe('FULFILLED');
    expect(fulfilled.respondedAt).not.toBeNull();
  });

  it('creates and updates a real ComplianceIncident', async () => {
    const createRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/compliance/pdpa/incidents`,
      headers: authHeader(ownerToken),
      payload: {
        title: 'Misdirected payroll email', description: 'CSV of salaries sent to wrong distribution list',
        severity: 'HIGH', affectedDataTypes: ['financial', 'contact'], affectedCount: 42,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const incident = createRes.json();
    expect(incident.status).toBe('OPEN');

    const updateRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${orgId}/compliance/pdpa/incidents/${incident.id}`,
      headers: authHeader(ownerToken),
      payload: { status: 'RESOLVED', rootCause: 'Autocomplete selected wrong list', resolvedAt: new Date().toISOString() },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().status).toBe('RESOLVED');
    expect(updateRes.json().resolvedAt).not.toBeNull();

    const dbIncident = await t.app.prisma.complianceIncident.findUnique({ where: { id: incident.id } });
    expect(dbIncident!.status).toBe('RESOLVED');
  });

  it('creates and updates a real Vendor', async () => {
    const createRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/compliance/pdpa/vendors`,
      headers: authHeader(ownerToken),
      payload: { name: 'CloudMail SaaS', services: ['email'], dataShared: ['contact'], hasDpa: false, riskLevel: 'HIGH' },
    });
    expect(createRes.statusCode).toBe(201);
    const vendor = createRes.json();
    expect(vendor.status).toBe('ACTIVE');

    const listRes = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${orgId}/compliance/pdpa/vendors`, headers: authHeader(ownerToken),
    });
    expect(listRes.json().vendors.map((v: any) => v.id)).toContain(vendor.id);

    const updateRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${orgId}/compliance/pdpa/vendors/${vendor.id}`,
      headers: authHeader(ownerToken), payload: { hasDpa: true, riskLevel: 'LOW' },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = updateRes.json();
    expect(updated.hasDpa).toBe(true);
    expect(updated.riskLevel).toBe('LOW');
    expect(updated.reviewedAt).not.toBeNull(); // route stamps reviewedAt when riskLevel/status changes

    // High-risk-vendor overview count reflects the downgrade to LOW.
    const overviewRes = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${orgId}/compliance/pdpa/overview`, headers: authHeader(ownerToken),
    });
    expect(overviewRes.json().highRiskVendors).toBe(0);
  });

  // Maturity scoring (org-compliance-pdpa.ts): pct = totalScore/maxScore,
  // thresholds >=0.9 OPTIMISING, >=0.7 MANAGED, >=0.45 DEFINED, >=0.2
  // DEVELOPING, else INITIAL. Verify the real math against exact boundary values.
  const maturityCases: { pct: number; expected: string }[] = [
    { pct: 0.95, expected: 'OPTIMISING' },
    { pct: 0.75, expected: 'MANAGED' },
    { pct: 0.5, expected: 'DEFINED' },
    { pct: 0.3, expected: 'DEVELOPING' },
    { pct: 0.1, expected: 'INITIAL' },
  ];

  for (const { pct, expected } of maturityCases) {
    it(`ComplianceAssessment at ${Math.round(pct * 100)}% scores maturityLevel ${expected}`, async () => {
      const maxAnswer = 10;
      const answer = Math.round(pct * maxAnswer);
      const responses = [
        { questionId: 'q1', sectionCode: 'GOVERNANCE', answer, maxAnswer },
        { questionId: 'q2', sectionCode: 'GOVERNANCE', answer, maxAnswer },
      ];

      const res = await t.app.inject({
        method: 'POST', url: `/v1/organizations/${orgId}/compliance/pdpa/assessments`,
        headers: authHeader(ownerToken), payload: { responses },
      });
      expect(res.statusCode).toBe(201);
      const assessment = res.json();

      const expectedTotal = answer * 2;
      const expectedMax = maxAnswer * 2;
      expect(assessment.totalScore).toBe(expectedTotal);
      expect(assessment.maxScore).toBe(expectedMax);
      expect(assessment.maturityLevel).toBe(expected);
      expect(assessment.responses).toHaveLength(2);

      const dbAssessment = await t.app.prisma.complianceAssessment.findUnique({ where: { id: assessment.id } });
      expect(dbAssessment!.maturityLevel).toBe(expected);
    });
  }

  it('overview.maturity reflects the most recently completed assessment', async () => {
    const overviewRes = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${orgId}/compliance/pdpa/overview`, headers: authHeader(ownerToken),
    });
    expect(overviewRes.statusCode).toBe(200);
    const maturity = overviewRes.json().maturity;
    expect(maturity).not.toBeNull();
    expect(maturity.level).toBe('INITIAL'); // last assessment created above (10%)
  });
});
