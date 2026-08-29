import { FastifyInstance } from 'fastify';
import { extractUserId } from '../lib/org-auth.js';

/**
 * Personal (non-org) equivalent of the org-level PDPA rights-request tooling
 * (org-compliance-pdpa.ts) — "know your rights" for an individual Ondi user
 * requesting their own data from a third party. targetOrgName is free text
 * since the target isn't necessarily an Ondi Organization.
 */
export async function personalComplianceRoutes(app: FastifyInstance) {

  app.get('/rights-requests', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const requests = await app.prisma.personalRightsRequest.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' },
    });
    return reply.send({ requests });
  });

  app.post('/rights-requests', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { requestType, targetOrgName, description, deadlineDays } = req.body as {
      requestType?: string; targetOrgName?: string; description?: string; deadlineDays?: number;
    };
    if (!requestType || !targetOrgName || !description)
      return reply.code(400).send({ error: 'missing_fields' });

    const deadlineAt = new Date(Date.now() + (deadlineDays ?? 30) * 24 * 60 * 60 * 1000);
    const request = await app.prisma.personalRightsRequest.create({
      data: { userId, requestType: requestType as any, targetOrgName, description, deadlineAt },
    });

    await app.audit.write({
      entityType: 'USER', entityId: userId, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { action: 'personal_rights_request_logged', requestId: request.id, requestType, targetOrgName },
      severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send(request);
  });

  app.patch('/rights-requests/:requestId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { requestId } = req.params as { requestId: string };
    const existing = await app.prisma.personalRightsRequest.findUnique({ where: { id: requestId } });
    if (!existing || existing.userId !== userId) return reply.code(404).send({ error: 'not_found' });

    const { status, responseNotes } = req.body as { status?: string; responseNotes?: string };
    const data: any = {};
    if (status !== undefined) data.status = status;
    if (responseNotes !== undefined) data.responseNotes = responseNotes;
    if (status === 'FULFILLED' || status === 'REJECTED') data.respondedAt = new Date();

    const request = await app.prisma.personalRightsRequest.update({ where: { id: requestId }, data });
    return reply.send(request);
  });
}
