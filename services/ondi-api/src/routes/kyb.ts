import { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../lib/admin-auth.js';

const kybRoutes: FastifyPluginAsync = async (fastify) => {
  // List all KYB submissions
  fastify.get('/submissions', async (request: any, reply) => {
    if (!requireAdmin(request, reply)) return;

    const submissions = await fastify.prisma.kYBRecord.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        organization: true
      }
    });
    return submissions;
  });

  // Resolve a KYB submission (Approve / Reject)
  fastify.patch('/submissions/:id/resolve', async (request: any, reply) => {
    if (!requireAdmin(request, reply)) return;

    const { id } = request.params;
    const { status } = request.body; // 'VERIFIED' or 'REJECTED'
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      return reply.code(400).send({ error: 'invalid_status' });
    }

    const record = await fastify.prisma.kYBRecord.update({
      where: { id },
      data: {
        status,
        verifiedAt: status === 'VERIFIED' ? new Date() : null,
      },
    });

    // Write to audit log
    await fastify.audit.write({
      entityType: 'ORG',
      entityId: record.organizationId,
      action: status === 'VERIFIED' ? 'KYB_VERIFIED' : 'KYB_REJECTED',
      category: 'IDENTITY',
      performedBy: 'admin',
      metadata: { recordId: id },
      severity: status === 'VERIFIED' ? 'INFO' : 'WARNING',
      isRegulatory: true,
    });

    return record;
  });
};

export default kybRoutes;
