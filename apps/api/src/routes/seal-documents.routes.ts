import { requireAnyEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';

// SEAL's document vault (spec §deferred from Increment 3). Deliberately
// entity_type/entity_id generalized rather than N dedicated FK columns —
// see 110_seal_documents_exams_stockaccount_ops.sql's header comment.
// Reuses the platform's real MinioIntegration for storage (same mechanism
// ClearOS's case_documents already uses via documents.routes.ts) rather
// than inventing new upload/storage plumbing.

const ENTITY_TYPES = ['lot', 'consignment', 'container', 'customs_entry', 'compartment'] as const;
type EntityType = typeof ENTITY_TYPES[number];

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function sealDocumentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // Documents can attach to a customs_entry (worked from ClearOS's Ops
  // Command) as well as lot/consignment/container/compartment (SEAL-only) —
  // simplest to gate the whole vault on either entitlement rather than
  // split it by entity_type.
  fastify.addHook('preHandler', requireAnyEntitlement(['seal', 'clearos']));

  fastify.get('/documents', async (request: any, reply) => {
    try {
      const { entity_type, entity_id } = request.query as { entity_type?: string; entity_id?: string };
      if (!entity_type || !entity_id) return reply.status(400).send({ error: 'entity_type and entity_id are required' });
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_documents').selectAll()
          .where('entity_type', '=', entity_type).where('entity_id', '=', entity_id)
          .orderBy('created_at', 'desc').execute()
      );
      return rows;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/documents/upload', async (request: any, reply) => {
    try {
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const entityType = (data.fields.entityType as any)?.value as EntityType | undefined;
      const entityId = (data.fields.entityId as any)?.value as string | undefined;
      const docType = ((data.fields.docType as any)?.value || 'other') as string;
      if (!entityType || !ENTITY_TYPES.includes(entityType)) return reply.status(400).send({ error: 'A valid entityType field is required' });
      if (!entityId) return reply.status(400).send({ error: 'entityId field is required' });

      const fileBuffer = await data.toBuffer();
      const upload = await MinioIntegration.uploadCloudFile(request.user.tenant_id, `seal/${entityType}/${entityId}`, data.filename, fileBuffer);

      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_documents').values({
          tenant_id: request.user.tenant_id,
          entity_type: entityType, entity_id: entityId, doc_type: docType,
          filename: data.filename, storage_key: upload.storageKey, size_bytes: upload.size,
          uploaded_by: request.user.id,
        }).returningAll().executeTakeFirstOrThrow()
      );
      return row;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'File upload failed' });
    }
  });

  fastify.get('/documents/:id/download', async (request: any, reply) => {
    try {
      const doc = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_documents').selectAll().where('id', '=', request.params.id).executeTakeFirst()
      );
      if (!doc) return reply.status(404).send({ error: 'Document not found' });

      const fileBuffer = MinioIntegration.readFile(doc.storage_key);
      if (!fileBuffer) return reply.status(404).send({ error: 'File missing from storage' });

      const ext = (doc.filename || '').split('.').pop()?.toLowerCase() || '';
      reply.header('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      reply.header('Content-Disposition', `inline; filename="${doc.filename}"`);
      return reply.send(fileBuffer);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/documents/:id', async (request: any, reply) => {
    try {
      const b = request.body as any;
      return await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_documents').set({
          status: b.status, notes: b.notes ?? undefined,
          verified_by: b.status === 'VERIFIED' ? request.user.id : undefined,
          verified_at: b.status === 'VERIFIED' ? new Date() : undefined,
        }).where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/documents/:id', async (request: any, reply) => {
    try {
      const doc = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_documents').selectAll().where('id', '=', request.params.id).executeTakeFirst()
      );
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      await MinioIntegration.deleteDocument(request.user.tenant_id, doc.storage_key);
      await withTenant(request.user.tenant_id, trx => trx.deleteFrom('seal_documents').where('id', '=', request.params.id).execute());
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
