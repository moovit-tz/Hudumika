import { requireAppEnabled } from '../middleware/appGate.js';
import type { FastifyInstance } from 'fastify';
import { DeclarationService } from '../services/declaration.service.js';
import { requireRole } from '../middleware/rbac.js';
import type {
  CreateDeclarationInput,
  CreateDeclarationItemInput,
  CreateDeclarationNoticeInput,
  DeclarationStatus,
} from '@hudumika/types';

export async function declarationRoutes(fastify: FastifyInstance) {
  // Enforce authentication on all routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAppEnabled('clearos'));

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
          status
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
}
