import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PermitEngineService, LifecycleDomainError } from '../services/permit-engine.service.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const SUPER_ADMIN_ROLES = ['SUPER_ADMIN'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!SUPER_ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'SUPER_ADMIN required' });
    return;
  }
  done();
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'Admin role required' });
    return;
  }
  done();
}

// ── Requirement definitions + fee definitions (platform-scoped, SUPER_ADMIN writes) ──

export async function requirementDefRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const q = request.query as Record<string, string>;
    return PermitEngineService.listRequirementDefs({
      jurisdiction: q.jurisdiction,
      industry_key: q.industry_key,
      review_state: q.review_state,
    });
  });

  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const def = await PermitEngineService.getRequirementDef(id);
    if (!def) return { error: 'Not found' };
    return def;
  });

  fastify.post('/', { preHandler: requireSuperAdmin }, async (request) => {
    const schema = z.object({
      code: z.string().min(1),
      jurisdiction: z.string().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      legal_instrument: z.string().optional(),
      source_url: z.string().optional(),
      industry_key: z.string().optional(),
      activity_type: z.string().optional(),
      holder_type: z.enum(['entity', 'site', 'product', 'asset', 'activity']).optional(),
      agency_code: z.string().optional(),
      frequency: z.enum(['once', 'annual', 'semi_annual', 'quarterly', 'monthly', 'on_demand']).optional(),
      mandatory: z.boolean().optional(),
      required_evidence: z.array(z.record(z.string(), z.unknown())).optional(),
      applicability: z.record(z.string(), z.unknown()).optional(),
      dependencies: z.array(z.string()).optional(),
      exemptions: z.array(z.record(z.string(), z.unknown())).optional(),
      effective_from: z.string().optional(),
      effective_to: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return PermitEngineService.createRequirementDef(body);
  });

  fastify.post('/:id/supersede', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      legal_instrument: z.string().optional(),
      source_url: z.string().optional(),
      frequency: z.enum(['once', 'annual', 'semi_annual', 'quarterly', 'monthly', 'on_demand']).optional(),
      mandatory: z.boolean().optional(),
      effective_from: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return PermitEngineService.supersedeDef(id, body);
  });

  // Fee definitions nested under a requirement
  fastify.get('/:id/fees', async (request) => {
    const { id } = request.params as { id: string };
    return PermitEngineService.listFeeDefs(id);
  });

  fastify.post('/:id/fees', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      fee_type: z.enum(['application', 'renewal', 'late_penalty', 'annual', 'inspection', 'other']),
      name: z.string().min(1),
      currency: z.string().optional(),
      amount: z.number().optional(),
      formula: z.string().optional(),
      formula_inputs: z.record(z.string(), z.unknown()).optional(),
      grace_days: z.number().int().optional(),
      cap_amount: z.number().optional(),
      effective_from: z.string().optional(),
      effective_to: z.string().optional(),
      source_reference: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return PermitEngineService.addFeeDef(id, body);
  });

  // Applicability resolver
  fastify.get('/resolve', async (request) => {
    const q = request.query as Record<string, string>;
    if (!q.jurisdiction) return { error: 'jurisdiction query param required' };
    return PermitEngineService.resolveApplicableRequirements({
      jurisdiction: q.jurisdiction,
      industry_key: q.industry_key,
      holder_type: q.holder_type,
    });
  });
}

// ── Lifecycle cycles + evidence (tenant-scoped) ──────────────────────────

export async function lifecycleRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('complyos'));

  fastify.get('/', async (request) => {
    const q = request.query as Record<string, string>;
    return PermitEngineService.listCycles(request.user!.tenant_id, {
      status: q.status, cycle_type: q.cycle_type,
      cert_id: q.cert_id, entity_id: q.entity_id,
    });
  });

  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const cycle = await PermitEngineService.getCycle(request.user!.tenant_id, id);
    if (!cycle) return { error: 'Not found' };
    return cycle;
  });

  fastify.post('/', { preHandler: requireAdmin }, async (request) => {
    const schema = z.object({
      cert_id: z.string().uuid().optional(),
      requirement_def_id: z.string().uuid().optional(),
      cycle_type: z.enum(['application', 'renewal', 'amendment', 'cancellation', 'surrender', 'transfer']),
      owner_id: z.string().uuid().optional(),
      delegate_id: z.string().uuid().optional(),
      entity_id: z.string().uuid().optional(),
      site_id: z.string().uuid().optional(),
      jurisdiction: z.string().optional(),
      agency_code: z.string().optional(),
      prerequisites: z.array(z.record(z.string(), z.unknown())).optional(),
      deadline: z.string().optional(),
      budget_estimate: z.number().optional(),
      budget_currency: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return PermitEngineService.createCycle(request.user!.tenant_id, request.user!.sub, body);
  });

  fastify.patch('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(['draft', 'pending_documents', 'pending_review', 'submitted', 'under_authority_review', 'approved', 'issued', 'rejected', 'cancelled', 'failed']).optional(),
      delegate_id: z.string().uuid().nullable().optional(),
      submission_ref: z.string().optional(),
      submission_date: z.string().optional(),
      authority_ref: z.string().optional(),
      outcome_date: z.string().optional(),
      outcome_notes: z.string().optional(),
      actual_cost: z.number().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    });
    const body = schema.parse(request.body);
    try {
      return await PermitEngineService.updateCycle(request.user!.tenant_id, id, body);
    } catch (err) {
      if (err instanceof LifecycleDomainError) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // Evidence per cycle
  fastify.get('/:id/evidence', async (request) => {
    const { id } = request.params as { id: string };
    return PermitEngineService.listEvidence(request.user!.tenant_id, id);
  });

  fastify.post('/:id/evidence', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      file_id: z.string().uuid().optional(),
      file_name: z.string().min(1),
      file_url: z.string().optional(),
      evidence_type: z.enum(['document', 'receipt', 'photo', 'screenshot', 'certificate', 'correspondence', 'other']).optional(),
      description: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return PermitEngineService.addEvidence(request.user!.tenant_id, id, request.user!.sub, body);
  });
}

// ── Jurisdiction packs (platform-scoped, read-only for now) ──────────────

export async function jurisdictionPackRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async () => {
    return PermitEngineService.listJurisdictionPacks();
  });

  fastify.get('/:jurisdiction', async (request) => {
    const { jurisdiction } = request.params as { jurisdiction: string };
    const pack = await PermitEngineService.getJurisdictionPack(jurisdiction);
    if (!pack) return { error: 'Not found' };
    return pack;
  });
}
