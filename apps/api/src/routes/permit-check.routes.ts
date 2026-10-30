import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PermitCheckService } from '../services/permit-check.service.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
const SUPER_ADMIN_ROLES = ['SUPER_ADMIN'];

function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'Admin role required' });
    return;
  }
  done();
}

function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!SUPER_ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'SUPER_ADMIN required' });
    return;
  }
  done();
}

// ── Capture pipeline routes (tenant-scoped) ──────────────────────────────

export async function permitCaptureRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('complyos'));

  fastify.get('/', { preHandler: requireAdmin }, async (request) => {
    const q = request.query as Record<string, string>;
    return PermitCheckService.listCandidates(request.user!.tenant_id, {
      status: q.status, source_app: q.source_app, classification: q.classification,
    });
  });

  fastify.get('/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const c = await PermitCheckService.getCandidate(request.user!.tenant_id, id);
    if (!c) return { error: 'Not found' };
    return c;
  });

  fastify.post('/', async (request) => {
    const schema = z.object({
      source_app: z.string().min(1),
      source_record_type: z.string().optional(),
      source_record_id: z.string().uuid().optional(),
      source_attachment_id: z.string().uuid().optional(),
      source_file_name: z.string().min(1),
      source_file_url: z.string().optional(),
      holder_claim: z.string().optional(),
      issuer_claim: z.string().optional(),
      jurisdiction_claim: z.string().optional(),
      permit_number_claim: z.string().optional(),
      expiry_claim: z.string().optional(),
      issued_claim: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return PermitCheckService.captureCandidate(request.user!.tenant_id, request.user!.sub, body);
  });

  fastify.post('/:id/classify', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      classification: z.enum(['pending', 'permit', 'renewal', 'not_permit', 'needs_review', 'duplicate']),
      confidence: z.number().min(0).max(1).optional(),
      classifier_type: z.enum(['manual', 'ocr', 'ai', 'rule']),
      holder_claim: z.string().optional(),
      issuer_claim: z.string().optional(),
      jurisdiction_claim: z.string().optional(),
      permit_number_claim: z.string().optional(),
      expiry_claim: z.string().optional(),
      issued_claim: z.string().optional(),
      review_notes: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return PermitCheckService.classifyCandidate(request.user!.tenant_id, id, request.user!.sub, body);
  });

  fastify.post('/:id/register', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      linked_cert_id: z.string().uuid().optional(),
      linked_cycle_id: z.string().uuid().optional(),
      review_notes: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return PermitCheckService.registerCandidate(request.user!.tenant_id, id, request.user!.sub, body);
  });

  fastify.post('/:id/dismiss', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body as any) ?? {};
    return PermitCheckService.dismissCandidate(
      request.user!.tenant_id, id, request.user!.sub, body.reason,
    );
  });
}

// ── Check contract routes (tenant-scoped) ────────────────────────────────

export async function permitCheckRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('complyos'));

  fastify.post('/', async (request) => {
    const schema = z.object({
      requesting_app: z.string().min(1),
      requesting_record_type: z.string().optional(),
      requesting_record_id: z.string().uuid().optional(),
      check_type: z.enum(['status', 'clearance', 'pre_activity', 'audit']).optional(),
      entity_id: z.string().uuid().optional(),
      site_id: z.string().uuid().optional(),
      jurisdiction: z.string().optional(),
      requirement_code: z.string().optional(),
      cert_id: z.string().uuid().optional(),
    });
    const body = schema.parse(request.body);
    return PermitCheckService.performCheck(request.user!.tenant_id, request.user!.sub, body);
  });

  fastify.get('/', async (request) => {
    const q = request.query as Record<string, string>;
    return PermitCheckService.listChecks(request.user!.tenant_id, {
      requesting_app: q.requesting_app, cert_id: q.cert_id,
      entity_id: q.entity_id, result: q.result,
    });
  });
}

// ── App coverage register routes (platform-scoped) ───────────────────────

export async function appCoverageRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async () => {
    return PermitCheckService.listAppCoverage();
  });

  fastify.get('/:appId', async (request) => {
    const { appId } = request.params as { appId: string };
    const cov = await PermitCheckService.getAppCoverage(appId);
    if (!cov) return { error: 'Not found' };
    return cov;
  });

  fastify.patch('/:appId', { preHandler: requireSuperAdmin }, async (request) => {
    const { appId } = request.params as { appId: string };
    const schema = z.object({
      coverage_status: z.enum(['implemented', 'planned', 'not_applicable', 'excluded']).optional(),
      evidence_notes: z.string().optional(),
      last_verified: z.string().optional(),
      verified_by: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return PermitCheckService.updateAppCoverage(appId, body);
  });
}
