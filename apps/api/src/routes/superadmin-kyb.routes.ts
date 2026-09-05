import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { recordAuthEvent } from '../lib/audit-chain.js';

/**
 * Platform review of tenants' own business-registration (KYB) submissions
 * — see 362_ondi_org_identity.sql's own header comment on why this is a
 * SuperAdmin queue rather than a tenant-admin one: a tenant certifying its
 * own business identity isn't verification, so the reviewer has to sit
 * outside the tenant being reviewed. Cross-tenant by nature, same
 * SUPER_ADMIN-at-the-route-level pattern as superadmin-issues.routes.ts.
 */
export async function superAdminKybRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  fastify.get('/kyb-queue', async () => {
    return dbPlatform.selectFrom('ondi_org_kyb as k')
      .innerJoin('tenants as t', 't.id', 'k.tenant_id')
      .innerJoin('users as u', 'u.id', 'k.submitted_by')
      .select(['k.id', 'k.extracted_company_name', 'k.extracted_registry_number', 'k.extracted_entity_type',
               'k.extracted_status', 'k.extracted_incorporation_date', 'k.created_at',
               't.id as tenant_id', 't.name as tenant_name', 'u.name as submitted_by_name', 'u.email as submitted_by_email'])
      .where('k.status', '=', 'pending')
      .orderBy('k.created_at', 'asc')
      .execute();
  });

  fastify.get('/kyb/:id/document', async (req, reply) => {
    const { id } = req.params as { id: string };
    const submission = await dbPlatform.selectFrom('ondi_org_kyb').select('document_storage_key').where('id', '=', id).executeTakeFirst();
    if (!submission) return reply.status(404).send({ error: 'Not found' });
    const { MinioIntegration } = await import('../integrations/minio.js');
    const bytes = MinioIntegration.readFile(submission.document_storage_key);
    if (!bytes) return reply.status(404).send({ error: 'Document not found' });
    reply.header('Content-Type', 'application/octet-stream');
    return reply.send(bytes);
  });

  fastify.post('/kyb/:id/approve', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const superAdmin = req.user;
    const submission = await dbPlatform.updateTable('ondi_org_kyb')
      .set({ status: 'verified', reviewed_by: superAdmin.sub, reviewed_at: new Date() })
      .where('id', '=', id).where('status', '=', 'pending')
      .returning(['tenant_id']).executeTakeFirst();
    if (!submission) return reply.status(404).send({ error: 'Submission not found or already reviewed' });

    await dbPlatform.updateTable('tenants').set({ kyb_status: 'verified' }).where('id', '=', submission.tenant_id).execute();
    await recordAuthEvent(submission.tenant_id, null, 'kyb_verified', { metadata: { submission_id: id, reviewed_by: superAdmin.sub } });
    return { success: true };
  });

  fastify.post('/kyb/:id/reject', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const superAdmin = req.user;
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const submission = await dbPlatform.updateTable('ondi_org_kyb')
      .set({ status: 'rejected', reviewed_by: superAdmin.sub, reviewed_at: new Date(), rejection_reason: reason })
      .where('id', '=', id).where('status', '=', 'pending')
      .returning(['tenant_id']).executeTakeFirst();
    if (!submission) return reply.status(404).send({ error: 'Submission not found or already reviewed' });

    await dbPlatform.updateTable('tenants').set({ kyb_status: 'rejected' })
      .where('id', '=', submission.tenant_id).where('kyb_status', '!=', 'verified').execute();
    await recordAuthEvent(submission.tenant_id, null, 'kyb_rejected', { metadata: { submission_id: id, reviewed_by: superAdmin.sub, reason } });
    return { success: true };
  });
}
