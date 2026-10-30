import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MarketplaceService } from '../services/marketplace.service.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'Admin role required' });
    return;
  }
  done();
}

export async function listingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { status, only_own } = request.query as Record<string, string>;
    return MarketplaceService.listListings(
      request.user!.tenant_id,
      { status, only_own: only_own === 'true' },
    );
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    return MarketplaceService.createListing(
      request.user!.tenant_id, request.user!.sub, request.body as any,
    );
  });

  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const l = await MarketplaceService.getListing(request.user!.tenant_id, id);
    if (!l) return request.server.httpErrors.notFound('Listing not found');
    return l;
  });

  fastify.patch('/:id/status', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as any;
    return MarketplaceService.updateListingStatus(request.user!.tenant_id, id, status);
  });
}

export async function enquiryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { side = 'client', status } = request.query as Record<string, string>;
    return MarketplaceService.listEnquiries(
      request.user!.tenant_id, side as 'client' | 'provider', { status },
    );
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    return MarketplaceService.createEnquiry(
      request.user!.tenant_id, request.user!.sub, request.body as any,
    );
  });

  fastify.patch('/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as any;
    return MarketplaceService.updateEnquiryStatus(request.user!.tenant_id, id, status);
  });
}

export async function quotationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { side = 'provider', status } = request.query as Record<string, string>;
    return MarketplaceService.listQuotations(
      request.user!.tenant_id, side as 'client' | 'provider', { status },
    );
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    return MarketplaceService.createQuotation(
      request.user!.tenant_id, request.user!.sub, request.body as any,
    );
  });

  fastify.post('/:id/send', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    return MarketplaceService.sendQuotation(request.user!.tenant_id, id);
  });

  fastify.post('/:id/accept', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    return MarketplaceService.acceptQuotation(request.user!.tenant_id, id, request.user!.sub);
  });

  fastify.post('/:id/reject', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as any;
    return MarketplaceService.rejectQuotation(request.user!.tenant_id, id, reason);
  });
}

export async function assignmentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { side = 'provider', status } = request.query as Record<string, string>;
    return MarketplaceService.listAssignments(
      request.user!.tenant_id, side as 'client' | 'provider', { status },
    );
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    return MarketplaceService.createAssignment(
      request.user!.tenant_id, request.user!.sub, request.body as any,
    );
  });

  fastify.patch('/:id/status', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const { status, cancellation_reason, reassigned_from } = request.body as any;
    return MarketplaceService.updateAssignmentStatus(
      request.user!.tenant_id, id, status,
      { cancellation_reason, reassigned_from },
    );
  });

  // Milestones nested under assignments
  fastify.get('/:id/milestones', async (request) => {
    const { id } = request.params as { id: string };
    return MarketplaceService.listMilestones(request.user!.tenant_id, id);
  });

  fastify.post('/:id/milestones', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    return MarketplaceService.createMilestone(
      request.user!.tenant_id, request.user!.sub,
      { ...body, assignment_id: id },
    );
  });

  fastify.post('/milestones/:milestoneId/submit', { preHandler: [requireAdmin] }, async (request) => {
    const { milestoneId } = request.params as { milestoneId: string };
    return MarketplaceService.submitMilestone(request.user!.tenant_id, milestoneId);
  });

  fastify.post('/milestones/:milestoneId/review', { preHandler: [requireAdmin] }, async (request) => {
    const { milestoneId } = request.params as { milestoneId: string };
    const { accepted, notes } = request.body as any;
    return MarketplaceService.reviewMilestone(
      request.user!.tenant_id, milestoneId, request.user!.sub, accepted, notes,
    );
  });
}

export async function disputeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { status } = request.query as Record<string, string>;
    return MarketplaceService.listDisputes(request.user!.tenant_id, { status });
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    return MarketplaceService.createDispute(
      request.user!.tenant_id, request.user!.sub, request.body as any,
    );
  });

  fastify.post('/:id/resolve', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const { resolution } = request.body as any;
    return MarketplaceService.resolveDispute(
      request.user!.tenant_id, id, request.user!.sub, resolution,
    );
  });
}
