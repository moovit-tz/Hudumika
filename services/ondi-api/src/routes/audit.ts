import { FastifyInstance } from 'fastify';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';
import { requireAdmin } from '../lib/admin-auth.js';
import { buildAuditCsv, buildAuditPdf } from '../lib/audit-export.js';

export async function auditRoutes(app: FastifyInstance) {

  /**
   * GET /audit/export?format=csv|pdf
   * Exports the CALLING user's own security/audit history — unlike every
   * other route in this file, this one is authenticated and scoped, since
   * it's a user-facing feature rather than an internal/admin query surface.
   */
  app.get('/export', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer '))
      return reply.code(401).send({ error: 'missing_token' });

    let userId: string;
    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const format = (req.query.format as string) || 'csv';
    if (format !== 'csv' && format !== 'pdf')
      return reply.code(400).send({ error: 'invalid_format' });

    const logs = await app.prisma.auditLog.findMany({
      where:   { entityType: 'USER', entityId: userId },
      orderBy: { timestamp: 'desc' },
    });

    if (format === 'csv') {
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="ondi-security-report.csv"');
      return reply.send(buildAuditCsv(logs));
    }

    // format === 'pdf'
    const pdfBuffer = await buildAuditPdf(logs, 'Ondi Security Report');
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="ondi-security-report.pdf"');
    return reply.send(pdfBuffer);
  });

  /**
   * GET /audit/logs
   * Query audit logs with filtering. Admin only in production.
   * Query params: entityId, entityType, action, category, severity, isRegulatory,
   *               from, to, limit, offset
   */
  app.get('/logs', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const {
      entityId, entityType, action, category, severity,
      isRegulatory, from, to,
      limit  = '50',
      offset = '0',
    } = req.query;

    const where: any = {};
    if (entityId)    where.entityId    = entityId;
    if (entityType)  where.entityType  = entityType;
    if (action)      where.action      = action;
    if (category)    where.category    = category;
    if (severity)    where.severity    = severity;
    if (isRegulatory !== undefined) where.isRegulatory = isRegulatory === 'true';
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to)   where.timestamp.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      app.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take:    parseInt(limit),
        skip:    parseInt(offset),
      }),
      app.prisma.auditLog.count({ where }),
    ]);

    return reply.send({ total, limit: parseInt(limit), offset: parseInt(offset), logs });
  });


  /**
   * GET /audit/logs/:id
   * Fetch a single audit entry with its chain context.
   */
  app.get('/logs/:id', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const entry = await app.prisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!entry) return reply.code(404).send({ error: 'not_found' });
    return reply.send(entry);
  });


  /**
   * GET /audit/verify-chain
   * Walks the entire audit chain and verifies hash integrity.
   * Returns the first broken entry if tampered.
   */
  app.get('/verify-chain', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const result = await app.audit.verifyChain();
    return reply.code(result.valid ? 200 : 422).send({
      ...result,
      message: result.valid
        ? `Chain intact — ${result.checked} entries verified.`
        : `Chain broken at entry ${result.broken_at}. Possible tampering detected.`,
    });
  });


  /**
   * GET /audit/fraud-alerts
   * List all open fraud alerts, optionally filtered by severity or status.
   */
  app.get('/fraud-alerts', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { status, severity, userId, limit = '50', offset = '0' } = req.query;

    const where: any = {};
    if (status)   where.status   = status;
    if (severity) where.severity = severity;
    if (userId)   where.userId   = userId;

    const [alerts, total] = await Promise.all([
      app.prisma.fraudAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:    parseInt(limit),
        skip:    parseInt(offset),
        include: { user: { select: { id: true, ondi: true, phoneNumber: true } } },
      }),
      app.prisma.fraudAlert.count({ where }),
    ]);

    return reply.send({ total, alerts });
  });


  /**
   * POST /audit/fraud-alerts
   * Create a fraud alert (called by risk engine, ML pipelines, or admins).
   */
  app.post('/fraud-alerts', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { userId, type, severity, description, metadata } = req.body;
    if (!userId || !type || !severity || !description)
      return reply.code(400).send({ error: 'missing_fields' });

    const alert = await app.prisma.fraudAlert.create({
      data: { userId, type, severity, description, metadata },
    });

    // Write tamper-proof audit entry for the alert creation itself
    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'ADMIN_UPDATE',
      category:     'FRAUD',
      performedBy:  'system',
      metadata:     { alertId: alert.id, type, severity },
      severity:     'CRITICAL',
      isRegulatory: true,
    });

    return reply.code(201).send(alert);
  });


  /**
   * PATCH /audit/fraud-alerts/:id/resolve
   * Resolve or close a fraud alert.
   */
  app.patch('/fraud-alerts/:id/resolve', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { status, resolvedBy } = req.body;
    if (!['RESOLVED', 'FALSE_POSITIVE', 'INVESTIGATING'].includes(status))
      return reply.code(400).send({ error: 'invalid_status' });

    const alert = await app.prisma.fraudAlert.update({
      where: { id: req.params.id },
      data: { status, resolvedBy, resolvedAt: status === 'RESOLVED' ? new Date() : undefined },
    });

    await app.audit.write({
      entityType:   'USER',
      entityId:     alert.userId,
      action:       'ADMIN_UPDATE',
      category:     'FRAUD',
      performedBy:  resolvedBy ?? 'system',
      metadata:     { alertId: alert.id, resolution: status },
      severity:     'WARNING',
      isRegulatory: true,
    });

    return reply.send(alert);
  });


  /**
   * POST /audit/reports/generate
   * Trigger a compliance report generation job.
   * In production: dispatches to a background worker.
   */
  app.post('/reports/generate', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { reportType, periodStart, periodEnd, generatedBy = 'system' } = req.body;
    if (!reportType || !periodStart || !periodEnd)
      return reply.code(400).send({ error: 'missing_fields' });

    const start = new Date(periodStart);
    const end   = new Date(periodEnd);

    // Build summary metrics inline (production: queue to worker)
    const [loginCount, kycCount, fraudCount, loanCount] = await Promise.all([
      app.prisma.auditLog.count({
        where: { action: 'LOGIN_SUCCESS', timestamp: { gte: start, lte: end } },
      }),
      app.prisma.auditLog.count({
        where: { action: 'KYC_VERIFIED', timestamp: { gte: start, lte: end } },
      }),
      app.prisma.fraudAlert.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      app.prisma.auditLog.count({
        where: { action: 'LOAN_ISSUED', timestamp: { gte: start, lte: end } },
      }),
    ]);

    const report = await app.prisma.complianceReport.create({
      data: {
        reportType,
        generatedBy,
        periodStart: start,
        periodEnd:   end,
        summary: { loginCount, kycCount, fraudCount, loanCount },
      },
    });

    return reply.code(201).send(report);
  });


  /**
   * GET /audit/reports
   * List compliance reports.
   */
  app.get('/reports', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { reportType, limit = '20', offset = '0' } = req.query;
    const where: any = {};
    if (reportType) where.reportType = reportType;

    const reports = await app.prisma.complianceReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    parseInt(limit),
      skip:    parseInt(offset),
    });

    return reply.send(reports);
  });
}
