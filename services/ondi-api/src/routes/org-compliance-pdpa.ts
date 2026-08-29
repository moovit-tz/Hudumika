import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, requirePermission, assertOrgSecurityPolicy } from '../lib/org-auth.js';

/**
 * Real PDPA/GDPR-style compliance program routes — processing-activity
 * register, data-subject rights requests, incident/breach tracking, deadline
 * alerts, maturity assessments, and vendor risk. Ported concept-for-concept
 * from Ngao's proven schema (packages/ngao-db), built natively here so it's
 * available to any Ondi org without the SSO bridge. Namespaced under
 * /compliance/pdpa/* to stay distinct from the pre-existing self-attestation
 * /compliance/frameworks routes (org-compliance.ts).
 */
export async function orgCompliancePdpaRoutes(app: FastifyInstance) {

  // ─── Overview ────────────────────────────────────────────────────────────────

  app.get('/:id/compliance/pdpa/overview', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const now = new Date();
    const [
      activeActivities, openRightsRequests, overdueRightsRequests,
      openIncidents, upcomingAlerts, highRiskVendors, latestAssessment,
    ] = await Promise.all([
      app.prisma.processingActivity.count({ where: { organizationId: id, isActive: true } }),
      app.prisma.rightsRequest.count({ where: { organizationId: id, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      app.prisma.rightsRequest.count({ where: { organizationId: id, status: { in: ['PENDING', 'IN_PROGRESS'] }, deadlineAt: { lt: now } } }),
      app.prisma.complianceIncident.count({ where: { organizationId: id, status: { not: 'RESOLVED' } } }),
      app.prisma.complianceAlert.count({ where: { organizationId: id, status: 'PENDING', dueDate: { lt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } } }),
      app.prisma.vendor.count({ where: { organizationId: id, riskLevel: { in: ['HIGH', 'CRITICAL'] }, status: 'ACTIVE' } }),
      app.prisma.complianceAssessment.findFirst({ where: { organizationId: id }, orderBy: { completedAt: 'desc' } }),
    ]);

    return reply.send({
      activeActivities, openRightsRequests, overdueRightsRequests,
      openIncidents, upcomingAlerts, highRiskVendors,
      maturity: latestAssessment ? { level: latestAssessment.maturityLevel, score: latestAssessment.totalScore, maxScore: latestAssessment.maxScore, completedAt: latestAssessment.completedAt } : null,
    });
  });

  // ─── Processing activities (Art. 30 register) ───────────────────────────────

  app.get('/:id/compliance/pdpa/processing-activities', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const activities = await app.prisma.processingActivity.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' } });
    return reply.send({ activities });
  });

  app.post('/:id/compliance/pdpa/processing-activities', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name, description, dataCategories, purposes, legalBasis, dataSubjects, retentionMonths, thirdParties } = req.body as {
      name?: string; description?: string; dataCategories?: string[]; purposes?: string[];
      legalBasis?: string; dataSubjects?: string[]; retentionMonths?: number; thirdParties?: string[];
    };
    if (!name || !legalBasis || !dataCategories?.length || !purposes?.length || !dataSubjects?.length)
      return reply.code(400).send({ error: 'missing_fields' });

    const activity = await app.prisma.processingActivity.create({
      data: { organizationId: id, name, description, dataCategories, purposes, legalBasis, dataSubjects, retentionMonths, thirdParties: thirdParties ?? [] },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { action: 'processing_activity_created', activityId: activity.id, name }, severity: 'INFO', isRegulatory: true,
    });

    return reply.code(201).send(activity);
  });

  app.patch('/:id/compliance/pdpa/processing-activities/:activityId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id, activityId } = req.params as { id: string; activityId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const existing = await app.prisma.processingActivity.findFirst({ where: { id: activityId, organizationId: id } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const body = req.body as Record<string, unknown>;
    const allowed = ['name', 'description', 'dataCategories', 'purposes', 'legalBasis', 'dataSubjects', 'retentionMonths', 'thirdParties', 'isActive'];
    const data: any = {};
    for (const k of allowed) if (body[k] !== undefined) data[k] = body[k];

    const activity = await app.prisma.processingActivity.update({ where: { id: activityId }, data });
    return reply.send(activity);
  });

  // ─── Data-subject rights requests ───────────────────────────────────────────

  app.get('/:id/compliance/pdpa/rights-requests', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { status } = req.query as { status?: string };
    const where: any = { organizationId: id };
    if (status) where.status = status;

    const requests = await app.prisma.rightsRequest.findMany({ where, orderBy: { deadlineAt: 'asc' } });
    return reply.send({ requests });
  });

  app.post('/:id/compliance/pdpa/rights-requests', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { requestType, subjectName, subjectEmail, subjectPhone, description, deadlineDays } = req.body as {
      requestType?: string; subjectName?: string; subjectEmail?: string; subjectPhone?: string; description?: string; deadlineDays?: number;
    };
    if (!requestType || !subjectName || !subjectEmail || !description)
      return reply.code(400).send({ error: 'missing_fields' });

    const deadlineAt = new Date(Date.now() + (deadlineDays ?? 30) * 24 * 60 * 60 * 1000);
    const request = await app.prisma.rightsRequest.create({
      data: { organizationId: id, requestType: requestType as any, subjectName, subjectEmail, subjectPhone, description, deadlineAt },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { action: 'rights_request_logged', requestId: request.id, requestType }, severity: 'INFO', isRegulatory: true,
    });

    return reply.code(201).send(request);
  });

  app.patch('/:id/compliance/pdpa/rights-requests/:requestId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id, requestId } = req.params as { id: string; requestId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const existing = await app.prisma.rightsRequest.findFirst({ where: { id: requestId, organizationId: id } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const { status, responseNotes } = req.body as { status?: string; responseNotes?: string };
    const data: any = {};
    if (status !== undefined) data.status = status;
    if (responseNotes !== undefined) data.responseNotes = responseNotes;
    if (status === 'FULFILLED' || status === 'REJECTED') data.respondedAt = new Date();

    const request = await app.prisma.rightsRequest.update({ where: { id: requestId }, data });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { action: 'rights_request_updated', requestId, status }, severity: 'INFO', isRegulatory: true,
    });

    return reply.send(request);
  });

  // ─── Incidents / breach tracking ────────────────────────────────────────────

  app.get('/:id/compliance/pdpa/incidents', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const incidents = await app.prisma.complianceIncident.findMany({ where: { organizationId: id }, orderBy: { detectedAt: 'desc' } });
    return reply.send({ incidents });
  });

  app.post('/:id/compliance/pdpa/incidents', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { title, description, severity, affectedDataTypes, affectedCount, detectedAt } = req.body as {
      title?: string; description?: string; severity?: string; affectedDataTypes?: string[]; affectedCount?: number; detectedAt?: string;
    };
    if (!title || !description || !severity || !affectedDataTypes?.length)
      return reply.code(400).send({ error: 'missing_fields' });

    const incident = await app.prisma.complianceIncident.create({
      data: {
        organizationId: id, title, description, severity: severity as any,
        affectedDataTypes, affectedCount, detectedAt: detectedAt ? new Date(detectedAt) : new Date(),
        containmentSteps: [],
      },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'FRAUD',
      performedBy: userId, metadata: { action: 'incident_logged', incidentId: incident.id, severity }, severity: 'CRITICAL', isRegulatory: true,
    });

    return reply.code(201).send(incident);
  });

  app.patch('/:id/compliance/pdpa/incidents/:incidentId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id, incidentId } = req.params as { id: string; incidentId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const existing = await app.prisma.complianceIncident.findFirst({ where: { id: incidentId, organizationId: id } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const body = req.body as Record<string, unknown>;
    const allowed = ['status', 'containedAt', 'regulatorNotifiedAt', 'resolvedAt', 'containmentSteps', 'rootCause', 'lessonsLearned'];
    const data: any = {};
    for (const k of allowed) if (body[k] !== undefined) data[k] = ['containedAt', 'regulatorNotifiedAt', 'resolvedAt'].includes(k) ? new Date(body[k] as string) : body[k];

    const incident = await app.prisma.complianceIncident.update({ where: { id: incidentId }, data });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'FRAUD',
      performedBy: userId, metadata: { action: 'incident_updated', incidentId, ...data }, severity: 'WARNING', isRegulatory: true,
    });

    return reply.send(incident);
  });

  // ─── Deadline alerts ─────────────────────────────────────────────────────────

  app.get('/:id/compliance/pdpa/alerts', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const alerts = await app.prisma.complianceAlert.findMany({ where: { organizationId: id }, orderBy: { dueDate: 'asc' } });
    return reply.send({ alerts });
  });

  app.post('/:id/compliance/pdpa/alerts', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { type, title, dueDate, notes } = req.body as { type?: string; title?: string; dueDate?: string; notes?: string };
    if (!type || !title || !dueDate) return reply.code(400).send({ error: 'missing_fields' });

    const alert = await app.prisma.complianceAlert.create({
      data: { organizationId: id, type: type as any, title, dueDate: new Date(dueDate), notes },
    });
    return reply.code(201).send(alert);
  });

  app.patch('/:id/compliance/pdpa/alerts/:alertId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id, alertId } = req.params as { id: string; alertId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const existing = await app.prisma.complianceAlert.findFirst({ where: { id: alertId, organizationId: id } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const { status, notes } = req.body as { status?: string; notes?: string };
    const data: any = {};
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes;

    const alert = await app.prisma.complianceAlert.update({ where: { id: alertId }, data });
    return reply.send(alert);
  });

  // ─── Maturity assessments ────────────────────────────────────────────────────

  app.get('/:id/compliance/pdpa/assessments', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const assessments = await app.prisma.complianceAssessment.findMany({
      where: { organizationId: id }, orderBy: { completedAt: 'desc' }, include: { responses: true },
    });
    return reply.send({ assessments });
  });

  app.post('/:id/compliance/pdpa/assessments', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { responses } = req.body as { responses?: { questionId: string; sectionCode: string; answer: number; maxAnswer?: number }[] };
    if (!responses?.length) return reply.code(400).send({ error: 'responses_required' });

    const totalScore = responses.reduce((sum, r) => sum + r.answer, 0);
    const maxScore = responses.reduce((sum, r) => sum + (r.maxAnswer ?? 1), 0);
    const pct = maxScore > 0 ? totalScore / maxScore : 0;
    const maturityLevel = pct >= 0.9 ? 'OPTIMISING' : pct >= 0.7 ? 'MANAGED' : pct >= 0.45 ? 'DEFINED' : pct >= 0.2 ? 'DEVELOPING' : 'INITIAL';
    const actionPlan = maturityLevel === 'OPTIMISING'
      ? 'Maintain current controls; schedule the next review in 12 months.'
      : `Focus on the lowest-scoring sections first; re-assess in 90 days. Current maturity: ${maturityLevel}.`;

    const assessment = await app.prisma.complianceAssessment.create({
      data: {
        organizationId: id, totalScore, maxScore, maturityLevel, actionPlan,
        responses: { create: responses.map(r => ({ questionId: r.questionId, sectionCode: r.sectionCode, answer: r.answer, maxAnswer: r.maxAnswer ?? 1 })) },
      },
      include: { responses: true },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { action: 'compliance_assessment_completed', assessmentId: assessment.id, totalScore, maxScore, maturityLevel }, severity: 'INFO', isRegulatory: true,
    });

    return reply.code(201).send(assessment);
  });

  // ─── Vendor / third-party risk ───────────────────────────────────────────────

  app.get('/:id/compliance/pdpa/vendors', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const vendors = await app.prisma.vendor.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' } });
    return reply.send({ vendors });
  });

  app.post('/:id/compliance/pdpa/vendors', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name, contactName, contactEmail, website, services, dataShared, hasDpa, riskLevel } = req.body as {
      name?: string; contactName?: string; contactEmail?: string; website?: string;
      services?: string[]; dataShared?: string[]; hasDpa?: boolean; riskLevel?: string;
    };
    if (!name) return reply.code(400).send({ error: 'missing_fields' });

    const vendor = await app.prisma.vendor.create({
      data: {
        organizationId: id, name, contactName, contactEmail, website,
        services: services ?? [], dataShared: dataShared ?? [], hasDpa: hasDpa ?? false, riskLevel: (riskLevel as any) ?? 'LOW',
      },
    });
    return reply.code(201).send(vendor);
  });

  app.patch('/:id/compliance/pdpa/vendors/:vendorId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id, vendorId } = req.params as { id: string; vendorId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance'))) return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const existing = await app.prisma.vendor.findFirst({ where: { id: vendorId, organizationId: id } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const body = req.body as Record<string, unknown>;
    const allowed = ['name', 'contactName', 'contactEmail', 'website', 'services', 'dataShared', 'hasDpa', 'riskLevel', 'status', 'notes'];
    const data: any = {};
    for (const k of allowed) if (body[k] !== undefined) data[k] = body[k];
    if (body.status !== undefined || body.riskLevel !== undefined) data.reviewedAt = new Date();

    const vendor = await app.prisma.vendor.update({ where: { id: vendorId }, data });
    return reply.send(vendor);
  });
}
