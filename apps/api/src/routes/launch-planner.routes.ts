import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { LaunchPlannerService } from '../services/launch-planner.service.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'Admin role required' });
    return;
  }
  done();
}

export async function launchPlannerRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── Cases ─────────────────────────────────────────────────────────────

  fastify.get('/', async (request) => {
    const q = request.query as Record<string, string>;
    return LaunchPlannerService.listCases(request.user!.tenant_id, {
      status: q.status,
    });
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const c = await LaunchPlannerService.getCase(request.user!.tenant_id, id);
    if (!c) return reply.code(404).send({ error: 'Not found' });
    return c;
  });

  fastify.post('/', { preHandler: requireAdmin }, async (request) => {
    const body = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      entity_id: z.string().uuid().optional(),
      industries: z.array(z.string()).optional(),
      jurisdictions: z.array(z.string()).optional(),
      target_date: z.string().optional(),
    }).parse(request.body);
    return LaunchPlannerService.createCase(
      request.user!.tenant_id, request.user!.sub, body,
    );
  });

  fastify.patch('/:id/status', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ status: z.string().min(1) }).parse(request.body);
    return LaunchPlannerService.updateCaseStatus(
      request.user!.tenant_id, id, body.status, request.user!.sub,
    );
  });

  // ── Sites ─────────────────────────────────────────────────────────────

  fastify.get('/:id/sites', async (request) => {
    const { id } = request.params as { id: string };
    return LaunchPlannerService.listSites(request.user!.tenant_id, id);
  });

  fastify.post('/:id/sites', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      site_name: z.string().min(1),
      site_type: z.string().optional(),
      jurisdiction: z.string().optional(),
      address: z.string().optional(),
      site_id: z.string().uuid().optional(),
    }).parse(request.body);
    return LaunchPlannerService.addSite(request.user!.tenant_id, id, body);
  });

  // ── Products ──────────────────────────────────────────────────────────

  fastify.get('/:id/products', async (request) => {
    const { id } = request.params as { id: string };
    return LaunchPlannerService.listProducts(request.user!.tenant_id, id);
  });

  fastify.post('/:id/products', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      product_name: z.string().min(1),
      product_type: z.string().optional(),
      hs_code: z.string().optional(),
      industry_key: z.string().optional(),
      jurisdiction: z.string().optional(),
      requires_permits: z.boolean().optional(),
    }).parse(request.body);
    return LaunchPlannerService.addProduct(request.user!.tenant_id, id, body);
  });

  // ── Plan items ────────────────────────────────────────────────────────

  fastify.get('/:id/items', async (request) => {
    const { id } = request.params as { id: string };
    const q = request.query as Record<string, string>;
    return LaunchPlannerService.listPlanItems(request.user!.tenant_id, id, {
      status: q.status, category: q.category,
    });
  });

  fastify.post('/:id/items', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      priority: z.number().int().optional(),
      jurisdiction: z.string().optional(),
      authority: z.string().optional(),
      legal_basis: z.string().optional(),
      estimated_cost: z.number().optional(),
      currency: z.string().optional(),
      estimated_days: z.number().int().optional(),
      deadline: z.string().optional(),
      owner_user_id: z.string().uuid().optional(),
      requirement_def_id: z.string().uuid().optional(),
      linked_cert_id: z.string().uuid().optional(),
      linked_cycle_id: z.string().uuid().optional(),
      dependency_ids: z.array(z.string().uuid()).optional(),
    }).parse(request.body);
    return LaunchPlannerService.addPlanItem(request.user!.tenant_id, id, body);
  });

  fastify.patch('/items/:itemId', async (request) => {
    const { itemId } = request.params as { itemId: string };
    const body = z.object({
      status: z.string().optional(),
      actual_cost: z.number().optional(),
      evidence_notes: z.string().optional(),
      exemption_reason: z.string().optional(),
      exemption_approved_by: z.string().uuid().optional(),
      owner_user_id: z.string().uuid().optional(),
      linked_cert_id: z.string().uuid().optional(),
      linked_cycle_id: z.string().uuid().optional(),
      linked_task_id: z.string().optional(),
    }).parse(request.body);
    return LaunchPlannerService.updatePlanItem(request.user!.tenant_id, itemId, body);
  });

  // ── Readiness & snapshots ─────────────────────────────────────────────

  fastify.get('/:id/readiness', async (request) => {
    const { id } = request.params as { id: string };
    return LaunchPlannerService.computeReadiness(request.user!.tenant_id, id);
  });

  fastify.post('/:id/resolve', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    return LaunchPlannerService.resolveRequirements(
      request.user!.tenant_id, id, request.user!.sub,
    );
  });

  fastify.get('/:id/snapshots', async (request) => {
    const { id } = request.params as { id: string };
    return LaunchPlannerService.listSnapshots(request.user!.tenant_id, id);
  });

  fastify.post('/:id/snapshots', async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      snapshot_type: z.string().optional(),
      label: z.string().optional(),
    }).parse(request.body);
    return LaunchPlannerService.takeSnapshot(
      request.user!.tenant_id, id, request.user!.sub, body,
    );
  });
}
