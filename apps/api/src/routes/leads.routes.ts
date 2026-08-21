import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

// SENIOR/JUNIOR/OFFICER added alongside the original CRM-pipeline roles —
// the landed-cost calculators (OPS_ROLES-gated) let clearing staff create a
// lead inline for a prospect who isn't a customer yet, so whoever can run a
// calculator needs to be able to search/create leads, not just Sales/Mgmt.
const LEAD_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;
// Real values — 128_crm_leads.sql's CHECK constraints.
const LEAD_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
const LEAD_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const leadCreateSchema = z.object({
  company: z.string().trim().min(1).max(300),
  contact_name: z.string().trim().min(1).max(300),
  contact_email: z.string().max(320).optional(),
  contact_phone: z.string().max(50).optional(),
  source: z.string().max(100).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  value: z.number().optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  assigned_to: z.string().optional(),
  expected_close: z.string().nullable().optional(),
  notes: z.string().max(5000).optional(),
  industry: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  website: z.string().max(500).optional(),
});
const leadPatchSchema = z.object({
  company: z.string().trim().min(1).max(300).optional(),
  contact_name: z.string().trim().min(1).max(300).optional(),
  contact_email: z.string().max(320).nullable().optional(),
  contact_phone: z.string().max(50).nullable().optional(),
  source: z.string().max(100).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  value: z.number().optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  assigned_to: z.string().nullable().optional(),
  expected_close: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  industry: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
});

function mapLead(row: any) {
  return {
    id: row.id,
    company: row.company,
    contact_name: row.contact_name,
    contact_email: row.contact_email ?? undefined,
    contact_phone: row.contact_phone ?? undefined,
    source: row.source,
    stage: row.stage,
    value: Number(row.value),
    priority: row.priority,
    assigned_to: row.assigned_to ?? undefined,
    expected_close: row.expected_close ? new Date(row.expected_close).toISOString().slice(0, 10) : undefined,
    created_at: row.created_at,
    notes: row.notes ?? undefined,
    industry: row.industry ?? undefined,
    location: row.location ?? undefined,
    website: row.website ?? undefined,
  };
}

export async function leadsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(...LEAD_ROLES));

  fastify.get('/', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('leads').selectAll().where('tenant_id', '=', request.user.tenant_id).orderBy('created_at', 'desc').execute()
      );
      return rows.map(mapLead);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/', async (request: any, reply) => {
    const b = leadCreateSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('leads').values({
          tenant_id: request.user.tenant_id,
          company: b.company,
          contact_name: b.contact_name,
          contact_email: b.contact_email || null,
          contact_phone: b.contact_phone || null,
          source: b.source || 'Web Form',
          stage: b.stage || 'NEW',
          value: String(Number(b.value) || 0),
          priority: b.priority || 'MEDIUM',
          assigned_to: b.assigned_to || null,
          expected_close: b.expected_close ? new Date(b.expected_close) : null,
          notes: b.notes || null,
          industry: b.industry || null,
          location: b.location || null,
          website: b.website || null,
        }).returningAll().executeTakeFirstOrThrow()
      );
      return mapLead(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const b = leadPatchSchema.parse(request.body);
    try {
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (b.company !== undefined) patch.company = b.company;
      if (b.contact_name !== undefined) patch.contact_name = b.contact_name;
      if (b.contact_email !== undefined) patch.contact_email = b.contact_email || null;
      if (b.contact_phone !== undefined) patch.contact_phone = b.contact_phone || null;
      if (b.source !== undefined) patch.source = b.source;
      if (b.stage !== undefined) patch.stage = b.stage;
      if (b.value !== undefined) patch.value = String(Number(b.value) || 0);
      if (b.priority !== undefined) patch.priority = b.priority;
      if (b.assigned_to !== undefined) patch.assigned_to = b.assigned_to || null;
      if (b.expected_close !== undefined) patch.expected_close = b.expected_close ? new Date(b.expected_close) : null;
      if (b.notes !== undefined) patch.notes = b.notes || null;
      if (b.industry !== undefined) patch.industry = b.industry || null;
      if (b.location !== undefined) patch.location = b.location || null;
      if (b.website !== undefined) patch.website = b.website || null;

      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('leads').set(patch).where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).returningAll().executeTakeFirstOrThrow()
      );
      return mapLead(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/:id', async (request: any, reply) => {
    try {
      await withTenant(request.user.tenant_id, trx =>
        trx.deleteFrom('leads').where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).execute()
      );
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
