import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { NotificationService } from '../services/notification.service.js';
import { CloudSync } from '../services/cloud-sync.service.js';
import { requireRole } from '../middleware/rbac.js';
import type { DocumentType, DocumentStatus } from '@hudumika/types';

export async function documentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  /**
   * GET /v1/shipments/:id/documents
   */
  fastify.get('/:id/documents', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const list = await trx
        .selectFrom('case_documents')
        .selectAll()
        .where('shipment_id', '=', id)
        .orderBy('created_at', 'desc')
        .execute();

      return { data: list };
    });
  });

  /**
   * POST /v1/shipments/:id/documents/upload
   */
  fastify.post('/:id/documents/upload', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    // Accept type from multipart field (if sent before the file) OR from query param fallback
    const queryType = (request.query as any).type as string | undefined;
    const docType = ((data.fields.type as any)?.value || queryType) as DocumentType | undefined;
    if (!docType) return reply.status(400).send({ error: 'Missing document type field' });

    try {
      const fileBuffer = await data.toBuffer();

      // Fetch shipment to get customer_id and bl_number for folder path
      const shipment = await withTenant(user.tenant_id, async (trx) =>
        trx.selectFrom('shipment_cases')
          .select(['id', 'customer_id', 'bl_number', 'awb_number', 'ref_number'])
          .where('id', '=', id)
          .executeTakeFirst()
      );
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      const folderName = shipment.bl_number || shipment.awb_number || shipment.ref_number || id;

      const uploadRes = await MinioIntegration.uploadDocument(
        user.tenant_id,
        shipment.customer_id,
        folderName,
        data.filename,
        fileBuffer
      );

      const now = new Date();

      await withTenant(user.tenant_id, async (trx) => {
        const existingDoc = await trx
          .selectFrom('case_documents')
          .selectAll()
          .where('shipment_id', '=', id)
          .where('type', '=', docType)
          .executeTakeFirst();

        if (existingDoc) {
          await trx.updateTable('case_documents').set({
            filename: data.filename,
            storage_key: uploadRes.storageKey,
            status: 'RECEIVED',
            uploaded_by: user.role !== 'CUSTOMER' ? user.sub : null,
            created_at: now,
          }).where('id', '=', existingDoc.id).execute();
        } else {
          await trx.insertInto('case_documents').values({
            tenant_id: user.tenant_id,
            shipment_id: id,
            type: docType,
            filename: data.filename,
            storage_key: uploadRes.storageKey,
            status: 'RECEIVED',
            uploaded_by: user.role !== 'CUSTOMER' ? user.sub : null,
            created_at: now,
          }).execute();
        }

        fastify.websocketServer?.clients.forEach((client: any) => {
          client.send(JSON.stringify({ type: 'case.document_uploaded', caseId: id, documentId: docType }));
        });

        // Mirror the document into the Cloud file manager under
        // Customers ▸ <customer> ▸ <BL>, so it turns up in Drive automatically.
        CloudSync.syncShipmentDoc(user.tenant_id, {
          customerId: shipment.customer_id, shipmentId: id, blRef: folderName, filename: data.filename, buffer: fileBuffer, mime: data.mimetype,
        }).catch(err => console.error('[Cloud] shipment doc sync failed:', err.message));

        NotificationService.triggerNotification(user.tenant_id, id, 'DOCUMENT_UPLOADED', { docType }).catch(console.error);
      });

      return { success: true, storageKey: uploadRes.storageKey };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'File upload failed' });
    }
  });

  /**
   * GET /v1/shipments/:id/documents/:docId/download
   * Returns a signed URL (or serves directly in dev).
   */
  fastify.get('/:id/documents/:docId/download', async (request, reply) => {
    const user = request.user;
    const { id, docId } = request.params as { id: string; docId: string };

    return withTenant(user.tenant_id, async (trx) => {
      const doc = await trx.selectFrom('case_documents').selectAll()
        .where('shipment_id', '=', id).where('id', '=', docId)
        .executeTakeFirst();

      if (!doc || !doc.storage_key) return reply.status(404).send({ error: 'Document not found' });

      // Try to serve file directly (dev mode)
      const fileBuffer = MinioIntegration.readFile(doc.storage_key);
      if (fileBuffer) {
        const ext = (doc.filename || '').split('.').pop()?.toLowerCase() || '';
        const mimeTypes: Record<string, string> = {
          pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
          jpeg: 'image/jpeg', gif: 'image/gif', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          xls: 'application/vnd.ms-excel', doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
        const mime = mimeTypes[ext] || 'application/octet-stream';
        reply.header('Content-Type', mime);
        reply.header('Content-Disposition', `inline; filename="${doc.filename}"`);
        return reply.send(fileBuffer);
      }

      const signedUrl = await MinioIntegration.getSignedUrl(user.tenant_id, doc.storage_key, 600);
      return { url: signedUrl };
    });
  });

  /**
   * GET /v1/shipments/:id/documents/:docId/view
   * Returns a short-lived URL suitable for iframe embedding.
   */
  fastify.get('/:id/documents/:docId/view', async (request, reply) => {
    const user = request.user;
    const { id, docId } = request.params as { id: string; docId: string };

    return withTenant(user.tenant_id, async (trx) => {
      const doc = await trx.selectFrom('case_documents').selectAll()
        .where('shipment_id', '=', id).where('id', '=', docId)
        .executeTakeFirst();

      if (!doc || !doc.storage_key) return reply.status(404).send({ error: 'Document not found' });

      // In dev, redirect to the download endpoint which serves inline
      return reply.redirect(`/v1/shipments/${id}/documents/${docId}/download`);
    });
  });

  /**
   * DELETE /v1/shipments/:id/documents/:docId
   */
  fastify.delete('/:id/documents/:docId',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { id, docId } = request.params as { id: string; docId: string };

      return withTenant(user.tenant_id, async (trx) => {
        const doc = await trx.selectFrom('case_documents').selectAll()
          .where('shipment_id', '=', id).where('id', '=', docId)
          .executeTakeFirst();

        if (!doc) return reply.status(404).send({ error: 'Document not found' });

        if (doc.storage_key) {
          await MinioIntegration.deleteDocument(user.tenant_id, doc.storage_key);
        }

        await trx.deleteFrom('case_documents').where('id', '=', docId).execute();
        return reply.status(204).send();
      });
    }
  );

  /**
   * PATCH /v1/shipments/:id/documents/:docId/verify
   */
  fastify.patch('/:id/documents/:docId/verify',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { id, docId } = request.params as { id: string; docId: string };
      const { status, notes } = request.body as { status: DocumentStatus; notes?: string };

      if (!['VERIFIED', 'REJECTED', 'MISSING'].includes(status)) {
        return reply.status(400).send({ error: 'Invalid verification status' });
      }

      return withTenant(user.tenant_id, async (trx) => {
        const doc = await trx.selectFrom('case_documents').selectAll()
          .where('shipment_id', '=', id).where('id', '=', docId)
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst();

        if (!doc) return reply.status(404).send({ error: 'Document record not found' });

        await trx.updateTable('case_documents').set({
          status, notes: notes || null,
          verified_at: status === 'VERIFIED' ? new Date() : null,
        }).where('id', '=', docId).execute();

        return { success: true, status };
      });
    }
  );
}
