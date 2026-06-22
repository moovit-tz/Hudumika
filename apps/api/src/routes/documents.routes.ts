import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { NotificationService } from '../services/notification.service.js';
import { requireRole } from '../middleware/rbac.js';
import type { DocumentType, DocumentStatus } from '@clearos/types';

export async function documentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * GET /v1/shipments/:id/documents
   * Fetch checklist / documents list for shipment
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
   * Multipart upload a file. Handled via @fastify/multipart
   */
  fastify.post('/:id/documents/upload', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    // Read form fields
    const docType = (data.fields.type as any)?.value as DocumentType;
    if (!docType) {
      return reply.status(400).send({ error: 'Missing document type field' });
    }

    try {
      const fileBuffer = await data.toBuffer();
      
      // Upload to S3/MinIO (fallback local storage)
      const uploadRes = await MinioIntegration.uploadDocument(
        user.tenant_id,
        id,
        data.filename,
        fileBuffer
      );

      const now = new Date();

      await withTenant(user.tenant_id, async (trx) => {
        // Check if document slot already exists (e.g. was REQUIRED)
        const existingDoc = await trx
          .selectFrom('case_documents')
          .selectAll()
          .where('shipment_id', '=', id)
          .where('type', '=', docType)
          .executeTakeFirst();

        if (existingDoc) {
          // Update existing document slot
          await trx
            .updateTable('case_documents')
            .set({
              filename: data.filename,
              storage_key: uploadRes.storageKey,
              status: 'RECEIVED',
              uploaded_by: user.role !== 'CUSTOMER' ? user.sub : null,
              created_at: now,
            })
            .where('id', '=', existingDoc.id)
            .execute();
        } else {
          // Create new document slot
          await trx
            .insertInto('case_documents')
            .values({
              tenant_id: user.tenant_id,
              shipment_id: id,
              type: docType,
              filename: data.filename,
              storage_key: uploadRes.storageKey,
              status: 'RECEIVED',
              uploaded_by: user.role !== 'CUSTOMER' ? user.sub : null,
              created_at: now,
            })
            .execute();
        }

        // Send websocket alert to Ops Board
        fastify.websocketServer?.clients.forEach((client: any) => {
          client.send(
            JSON.stringify({
              type: 'case.document_uploaded',
              caseId: id,
              documentId: docType,
            })
          );
        });

        // Trigger WhatsApp/In-app alerts for staff
        NotificationService.triggerNotification(user.tenant_id, id, 'DOCUMENT_UPLOADED', {
          docType,
        }).catch(console.error);
      });

      return { success: true, storageKey: uploadRes.storageKey };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'File upload failed' });
    }
  });

  /**
   * GET /v1/shipments/:id/documents/:docId/download
   * Generates a secure, temporary signed S3 URL for downloading a file
   */
  fastify.get('/:id/documents/:docId/download', async (request, reply) => {
    const user = request.user;
    const { id, docId } = request.params as { id: string; docId: string };

    return withTenant(user.tenant_id, async (trx) => {
      const doc = await trx
        .selectFrom('case_documents')
        .selectAll()
        .where('shipment_id', '=', id)
        .where('id', '=', docId)
        .executeTakeFirst();

      if (!doc || !doc.storage_key) {
        return reply.status(404).send({ error: 'Document or storage link not found' });
      }

      // Generate signed URL (expires in 10 minutes)
      const signedUrl = await MinioIntegration.getSignedUrl(user.tenant_id, doc.storage_key, 600);

      // In development fallback, download directly if they click. Let's return redirect or the url
      return { url: signedUrl };
    });
  });

  /**
   * PATCH /v1/shipments/:id/documents/:docId/verify
   * Verify or Reject uploaded documents
   */
  fastify.patch('/:id/documents/:docId/verify', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id, docId } = request.params as { id: string; docId: string };
    const { status, notes } = request.body as { status: DocumentStatus; notes?: string };

    if (!['VERIFIED', 'REJECTED', 'MISSING'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid verification status' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const doc = await trx
        .selectFrom('case_documents')
        .selectAll()
        .where('shipment_id', '=', id)
        .where('id', '=', docId)
        .executeTakeFirst();

      if (!doc) {
        return reply.status(404).send({ error: 'Document record not found' });
      }

      await trx
        .updateTable('case_documents')
        .set({
          status,
          notes: notes || null,
          verified_at: status === 'VERIFIED' ? new Date() : null,
        })
        .where('id', '=', docId)
        .execute();

      return { success: true, status };
    });
  });
}
