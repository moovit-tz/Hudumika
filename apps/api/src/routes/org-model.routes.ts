import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OrgModelService } from '../services/org-model.service.js';
import { IndustryRegistryService } from '../services/industry-registry.service.js';
import { AdminHierarchyService } from '../services/admin-hierarchy.service.js';
import type { UserRole } from '@hudumika/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

const ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

const createEntitySchema = z.object({
  legal_name: z.string().trim().min(1),
  short_name: z.string().trim().optional(),
  registration_no: z.string().trim().optional(),
  tax_id: z.string().trim().optional(),
  country_code: z.string().length(2).optional(),
  currency: z.string().length(3).optional(),
  entity_type: z.enum(['parent', 'subsidiary', 'branch', 'division', 'joint_venture', 'other']).optional(),
  parent_entity_id: z.string().uuid().optional(),
  registered_address: z.string().trim().optional(),
  primary_industry: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateEntitySchema = z.object({
  legal_name: z.string().trim().min(1).optional(),
  short_name: z.string().trim().nullable().optional(),
  registration_no: z.string().trim().nullable().optional(),
  tax_id: z.string().trim().nullable().optional(),
  country_code: z.string().length(2).optional(),
  currency: z.string().length(3).optional(),
  entity_type: z.enum(['parent', 'subsidiary', 'branch', 'division', 'joint_venture', 'other']).optional(),
  parent_entity_id: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'dormant', 'dissolved', 'pending_registration']).optional(),
  registered_address: z.string().trim().nullable().optional(),
  primary_industry: z.string().trim().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createSiteSchema = z.object({
  entity_id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  code: z.string().trim().optional(),
  site_type: z.enum(['office', 'factory', 'warehouse', 'retail', 'clinic', 'mine', 'farm', 'port', 'other']).optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  region: z.string().trim().optional(),
  country_code: z.string().length(2).optional(),
  timezone: z.string().trim().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateSiteSchema = z.object({
  entity_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).optional(),
  code: z.string().trim().nullable().optional(),
  site_type: z.enum(['office', 'factory', 'warehouse', 'retail', 'clinic', 'mine', 'farm', 'port', 'other']).optional(),
  address: z.string().trim().nullable().optional(),
  city: z.string().trim().nullable().optional(),
  region: z.string().trim().nullable().optional(),
  country_code: z.string().length(2).optional(),
  timezone: z.string().trim().optional(),
  status: z.enum(['active', 'inactive', 'under_construction', 'closed']).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const assignIndustrySchema = z.object({
  industry_key: z.string().trim().min(1),
  is_primary: z.boolean().optional(),
  effective_from: z.string().optional(),
});

const addActivitySchema = z.object({
  industry_key: z.string().trim().min(1),
  activity_name: z.string().trim().min(1),
  license_ref: z.string().trim().optional(),
});

const activateIndustrySchema = z.object({
  industry_key: z.string().trim().min(1),
  is_primary: z.boolean().optional(),
});

// ── Tenant-scoped org model routes ─────────────────────────────────────────

export async function orgModelRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  function requireAdmin(request: any, reply: any, done: any) {
    if (!ADMIN_ROLES.includes(request.user?.role)) {
      reply.status(403).send({ error: 'Requires TENANT_ADMIN or above.' });
      return;
    }
    done();
  }

  // ── Entities ──────────────────────────────────────────────────────────────

  fastify.get('/entities', async (request: any) => {
    return OrgModelService.listEntities(request.user.tenant_id);
  });

  fastify.get('/entities/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.status(400).send({ error: 'Invalid entity id.' });
    try {
      return await OrgModelService.getEntity(request.user.tenant_id, id);
    } catch {
      return reply.status(404).send({ error: 'Entity not found.' });
    }
  });

  fastify.post('/entities', { preHandler: requireAdmin }, async (request: any, reply) => {
    const parsed = createEntitySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const entity = await OrgModelService.createEntity(
        request.user.tenant_id, request.user.sub, parsed.data,
      );
      return reply.status(201).send(entity);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.put('/entities/:id', { preHandler: requireAdmin }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.status(400).send({ error: 'Invalid entity id.' });
    const parsed = updateEntitySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      return await OrgModelService.updateEntity(request.user.tenant_id, id, parsed.data);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Sites ─────────────────────────────────────────────────────────────────

  fastify.get('/sites', async (request: any) => {
    const { entity_id } = request.query as { entity_id?: string };
    return OrgModelService.listSites(request.user.tenant_id, entity_id);
  });

  fastify.post('/sites', { preHandler: requireAdmin }, async (request: any, reply) => {
    const parsed = createSiteSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const site = await OrgModelService.createSite(
        request.user.tenant_id, request.user.sub, parsed.data,
      );
      return reply.status(201).send(site);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.put('/sites/:id', { preHandler: requireAdmin }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.status(400).send({ error: 'Invalid site id.' });
    const parsed = updateSiteSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      return await OrgModelService.updateSite(request.user.tenant_id, id, parsed.data);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Entity ↔ Industry assignments ─────────────────────────────────────────

  fastify.get('/entities/:id/industries', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.status(400).send({ error: 'Invalid entity id.' });
    return OrgModelService.listEntityIndustries(request.user.tenant_id, id);
  });

  fastify.post('/entities/:id/industries', { preHandler: requireAdmin }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.status(400).send({ error: 'Invalid entity id.' });
    const parsed = assignIndustrySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const row = await OrgModelService.assignEntityIndustry(
        request.user.tenant_id, { entity_id: id, ...parsed.data },
      );
      return reply.status(201).send(row);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/entities/:entityId/industries/:key', { preHandler: requireAdmin }, async (request: any, reply) => {
    const { entityId, key } = request.params as { entityId: string; key: string };
    if (!isUuid(entityId)) return reply.status(400).send({ error: 'Invalid entity id.' });
    try {
      await OrgModelService.removeEntityIndustry(request.user.tenant_id, entityId, key);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // ── Site ↔ Activity assignments ───────────────────────────────────────────

  fastify.get('/sites/:id/activities', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.status(400).send({ error: 'Invalid site id.' });
    return OrgModelService.listSiteActivities(request.user.tenant_id, id);
  });

  fastify.post('/sites/:id/activities', { preHandler: requireAdmin }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.status(400).send({ error: 'Invalid site id.' });
    const parsed = addActivitySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const row = await OrgModelService.addSiteActivity(
        request.user.tenant_id, { site_id: id, ...parsed.data },
      );
      return reply.status(201).send(row);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Tenant-level industry activation ──────────────────────────────────────

  fastify.get('/industries', async (request: any) => {
    return OrgModelService.listTenantIndustries(request.user.tenant_id);
  });

  fastify.post('/industries', { preHandler: requireAdmin }, async (request: any, reply) => {
    const parsed = activateIndustrySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const row = await OrgModelService.activateTenantIndustry(
        request.user.tenant_id, request.user.sub, parsed.data.industry_key, parsed.data.is_primary,
      );
      return reply.status(201).send(row);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/industries/:key', { preHandler: requireAdmin }, async (request: any, reply) => {
    const { key } = request.params as { key: string };
    try {
      await OrgModelService.deactivateTenantIndustry(request.user.tenant_id, key);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  fastify.get('/summary', async (request: any) => {
    return OrgModelService.getOrgSummary(request.user.tenant_id);
  });

  // ── User ↔ Org assignments ──────────────────────────────────────────────

  fastify.get('/assignments', async (request: any) => {
    const { user_id } = request.query as { user_id?: string };
    return AdminHierarchyService.listUserAssignments(request.user.tenant_id, user_id);
  });

  fastify.post('/assignments', { preHandler: requireAdmin }, async (request: any, reply) => {
    const schema = z.object({
      user_id: z.string().uuid(),
      entity_id: z.string().uuid().optional(),
      site_id: z.string().uuid().optional(),
      is_primary: z.boolean().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const row = await AdminHierarchyService.assignUser(
        request.user.tenant_id, request.user.sub, parsed.data,
      );
      return reply.status(201).send(row);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/assignments/:id', { preHandler: requireAdmin }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.status(400).send({ error: 'Invalid assignment id.' });
    try {
      await AdminHierarchyService.removeAssignment(request.user.tenant_id, id);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}

// ── Platform operator audit (SUPER_ADMIN only) ──────────────────────────────

export async function platformAuditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user?.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ error: 'Platform audit requires SUPER_ADMIN.' });
    }
  });

  fastify.get('/', async (request: any) => {
    const { tenant_id, operator_id, limit } = request.query as {
      tenant_id?: string; operator_id?: string; limit?: string;
    };
    return AdminHierarchyService.listPlatformAudit({
      affectedTenantId: tenant_id,
      operatorId: operator_id,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  });
}

// ── Platform-scoped industry registry (read-only for tenant users) ──────────

export async function industryRegistryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request: any) => {
    const { status, parent_key } = request.query as { status?: string; parent_key?: string };
    return IndustryRegistryService.listIndustries({ status, parentKey: parent_key });
  });

  fastify.get('/activatable', async () => {
    return IndustryRegistryService.getActivatableIndustries();
  });

  fastify.get('/resolve/:keyOrAlias', async (request: any, reply) => {
    const { keyOrAlias } = request.params as { keyOrAlias: string };
    const resolved = await IndustryRegistryService.resolveKey(keyOrAlias);
    if (!resolved) return reply.status(404).send({ error: 'Unknown industry key or alias.' });
    return { key: resolved };
  });

  fastify.get('/:key', async (request: any, reply) => {
    const { key } = request.params as { key: string };
    const entry = await IndustryRegistryService.getIndustry(key);
    if (!entry) return reply.status(404).send({ error: 'Industry not found.' });
    return entry;
  });

  fastify.get('/:key/capabilities', async (request: any) => {
    const { key } = request.params as { key: string };
    return IndustryRegistryService.listAppCapabilities(key);
  });
}
