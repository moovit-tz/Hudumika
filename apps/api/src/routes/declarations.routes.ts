import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { DeclarationService } from '../services/declaration.service.js';
import { requireRole } from '../middleware/rbac.js';
import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import type {
  CreateDeclarationInput,
  CreateDeclarationItemInput,
  CreateDeclarationNoticeInput,
  DeclarationStatus,
} from '@hudumika/types';

const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function declarationRoutes(fastify: FastifyInstance) {
  // Enforce authentication on all routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  /**
   * GET /v1/declarations
   * List declarations with optional filters
   */
  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const query = request.query as any;

    const result = await DeclarationService.list(user.tenant_id, {
      shipment_id: query.shipment_id,
      status: query.status,
      selectivity_channel: query.selectivity_channel,
      search: query.search,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });

    return result;
  });

  /**
   * GET /v1/declarations/:id
   * Get declaration with items, notices, and tax lines
   */
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    const declaration = await DeclarationService.getById(user.tenant_id, id);
    if (!declaration) {
      return reply.status(404).send({ error: 'Declaration not found' });
    }

    return declaration;
  });

  /**
   * POST /v1/declarations
   * Create a new TANSAD declaration linked to a shipment
   */
  fastify.post(
    '/',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const input = request.body as CreateDeclarationInput;

      if (!input.shipment_id || !input.tancis_ref) {
        return reply.status(400).send({
          error: 'Missing required fields: shipment_id, tancis_ref',
        });
      }

      try {
        const created = await DeclarationService.createDeclaration(
          user.tenant_id,
          input
        );
        return reply.status(201).send(created);
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Failed to create declaration',
        });
      }
    }
  );

  /**
   * GET /v1/declarations/by-shipment/:shipmentId
   * Fetch the full TANCIS-style declaration linked to a shipment case (if
   * one exists yet), for ShipmentDetail's in-page Declaration tab.
   */
  fastify.get('/by-shipment/:shipmentId', async (request, reply) => {
    const user = request.user;
    const { shipmentId } = request.params as { shipmentId: string };
    return DeclarationService.getByShipment(user.tenant_id, shipmentId);
  });

  /**
   * PUT /v1/declarations/by-shipment/:shipmentId
   * Create-or-update the full declaration (general/parties/financial/
   * transport + item list) for a shipment case in one save, matching how
   * ShipmentDetail's Declaration tab submits the whole form at once.
   */
  fastify.put(
    '/by-shipment/:shipmentId',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { shipmentId } = request.params as { shipmentId: string };
      const { items, ...fields } = request.body as { items?: Array<Record<string, any>> } & Record<string, any>;

      try {
        const saved = await DeclarationService.upsertByShipment(user.tenant_id, shipmentId, fields, items || [], user.sub);
        return saved;
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Failed to save declaration' });
      }
    }
  );

  /**
   * GET /v1/declarations/:id/verify-chain
   * Re-derives every declaration_events row's hash and confirms the
   * append-only chain hasn't been rewritten — mirrors SEAL's
   * GET /lots/:id/verify-chain.
   */
  fastify.get('/:id/verify-chain', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return DeclarationService.verifyChain(user.tenant_id, id);
  });

  /**
   * PATCH /v1/declarations/:id/status
   * Update declaration status (DRAFT → VALIDATED → SAVED → TRANSFERRED → etc.)
   */
  fastify.patch(
    '/:id/status',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: DeclarationStatus };

      if (!status) {
        return reply.status(400).send({ error: 'Missing target status' });
      }

      try {
        const updated = await DeclarationService.updateStatus(
          user.tenant_id,
          id,
          status,
          user.sub
        );

        // Broadcast WebSocket event
        fastify.websocketServer?.clients.forEach((client: any) => {
          client.send(
            JSON.stringify({
              type: 'declaration.status_changed',
              declarationId: id,
              status,
            })
          );
        });

        return updated;
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Status update failed',
        });
      }
    }
  );

  /**
   * POST /v1/declarations/:id/items
   * Add a line item to a declaration
   */
  fastify.post(
    '/:id/items',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      const input = request.body as Omit<CreateDeclarationItemInput, 'declaration_id'>;

      try {
        const item = await DeclarationService.addItem(user.tenant_id, {
          ...input,
          declaration_id: id,
        });
        return reply.status(201).send(item);
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Failed to add item',
        });
      }
    }
  );

  /**
   * GET /v1/declarations/notices
   * List declaration notices with filters
   */
  fastify.get('/notices/list', async (request, reply) => {
    const user = request.user;
    const query = request.query as any;

    const result = await DeclarationService.listNotices(user.tenant_id, {
      declaration_id: query.declaration_id,
      notice_type: query.notice_type,
      acknowledged: query.acknowledged === 'true' ? true : query.acknowledged === 'false' ? false : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });

    return result;
  });

  /**
   * POST /v1/declarations/:id/notices
   * Record a TANESW notice (selectivity result, assessment, release, etc.)
   */
  fastify.post(
    '/:id/notices',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      const input = request.body as Omit<CreateDeclarationNoticeInput, 'declaration_id'>;

      // Look up the declaration to get shipment_id
      const declaration = await DeclarationService.getById(user.tenant_id, id);
      if (!declaration) {
        return reply.status(404).send({ error: 'Declaration not found' });
      }

      try {
        const notice = await DeclarationService.recordNotice(user.tenant_id, {
          ...input,
          declaration_id: id,
          shipment_id: input.shipment_id || declaration.shipment_id,
        });

        // Broadcast WebSocket event
        fastify.websocketServer?.clients.forEach((client: any) => {
          client.send(
            JSON.stringify({
              type: 'declaration.notice_received',
              declarationId: id,
              noticeType: input.notice_type,
            })
          );
        });

        return reply.status(201).send(notice);
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Failed to record notice',
        });
      }
    }
  );

  /**
   * PATCH /v1/declarations/notices/:noticeId/acknowledge
   * Mark a notice as acknowledged
   */
  fastify.patch(
    '/notices/:noticeId/acknowledge',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'MANAGER') },
    async (request, reply) => {
      const user = request.user;
      const { noticeId } = request.params as { noticeId: string };

      try {
        const updated = await DeclarationService.acknowledgeNotice(
          user.tenant_id,
          noticeId,
          user.sub
        );
        return updated;
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Failed to acknowledge notice',
        });
      }
    }
  );

  // ── Attachments ───────────────────────────────────────────────

  /**
   * GET /v1/declarations/:id/attachments
   */
  fastify.get('/:id/attachments', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('declaration_attachments').selectAll()
        .where('declaration_id', '=', id)
        .orderBy('document_no', 'asc')
        .execute()
    );
  });

  /**
   * POST /v1/declarations/:id/attachments/upload
   */
  fastify.post('/:id/attachments/upload', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const documentType = ((data.fields.document_type as any)?.value || (request.query as any).document_type || 'Other') as string;
    const documentDescription = (data.fields.document_description as any)?.value as string | undefined;

    try {
      const fileBuffer = await data.toBuffer();
      const uploadRes = await MinioIntegration.uploadDocument(user.tenant_id, 'declarations', id, data.filename, fileBuffer);

      const attachment = await withTenant(user.tenant_id, async (trx) => {
        const countRow = await trx.selectFrom('declaration_attachments')
          .select(trx.fn.count('id').as('cnt')).where('declaration_id', '=', id).executeTakeFirst();
        const documentNo = Number(countRow?.cnt ?? 0) + 1;

        return trx.insertInto('declaration_attachments').values({
          declaration_id: id,
          document_no: documentNo,
          document_type: documentType,
          document_description: documentDescription ?? null,
          filename: data.filename,
          storage_key: uploadRes.storageKey,
        }).returningAll().executeTakeFirstOrThrow();
      });

      reply.status(201);
      return attachment;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'File upload failed' });
    }
  });

  /**
   * GET /v1/declarations/:id/attachments/:attId/download
   */
  fastify.get('/:id/attachments/:attId/download', async (request, reply) => {
    const user = request.user;
    const { id, attId } = request.params as { id: string; attId: string };

    return withTenant(user.tenant_id, async (trx) => {
      const att = await trx.selectFrom('declaration_attachments').selectAll()
        .where('declaration_id', '=', id).where('id', '=', attId).executeTakeFirst();
      if (!att || !att.storage_key) return reply.status(404).send({ error: 'Attachment not found' });

      const fileBuffer = MinioIntegration.readFile(att.storage_key);
      if (fileBuffer) {
        const ext = (att.filename || '').split('.').pop()?.toLowerCase() || '';
        reply.header('Content-Type', ATTACHMENT_MIME_TYPES[ext] || 'application/octet-stream');
        reply.header('Content-Disposition', `inline; filename="${att.filename}"`);
        return reply.send(fileBuffer);
      }

      const signedUrl = await MinioIntegration.getSignedUrl(user.tenant_id, att.storage_key, 600);
      return { url: signedUrl };
    });
  });

  /**
   * DELETE /v1/declarations/:id/attachments/:attId
   */
  fastify.delete('/:id/attachments/:attId', async (request, reply) => {
    const user = request.user;
    const { id, attId } = request.params as { id: string; attId: string };

    return withTenant(user.tenant_id, async (trx) => {
      const att = await trx.selectFrom('declaration_attachments').selectAll()
        .where('declaration_id', '=', id).where('id', '=', attId).executeTakeFirst();
      if (!att) return reply.status(404).send({ error: 'Attachment not found' });

      if (att.storage_key) await MinioIntegration.deleteDocument(user.tenant_id, att.storage_key);
      await trx.deleteFrom('declaration_attachments').where('id', '=', attId).execute();
      reply.status(204);
      return null;
    });
  });
}
