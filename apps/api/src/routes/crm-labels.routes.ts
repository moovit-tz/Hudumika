import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

const SUBJECT_TYPES = ['lead', 'deal', 'customer'] as const;
type SubjectType = (typeof SUBJECT_TYPES)[number];
const SUBJECT_TABLE: Record<SubjectType, 'leads' | 'deals' | 'customers'> = {
  lead: 'leads', deal: 'deals', customer: 'customers',
};

const LABEL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;

const createSchema = z.object({ name: z.string().trim().min(1).max(60), color: z.string().max(20).optional() });
const patchSchema = z.object({ name: z.string().trim().min(1).max(60).optional(), color: z.string().max(20).optional() });
const assignSchema = z.object({ subject_type: z.enum(SUBJECT_TYPES), subject_id: z.string().uuid() });

export async function crmLabelsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(...LABEL_ROLES));

  // Every label + how many of each subject type it's on — the sidebar/
  // manage-labels UI's own list, not scoped to one record.
  fastify.get('/', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const rows = await withTenant(tenantId, async trx => {
        const labels = await trx.selectFrom('crm_labels').selectAll()
          .where('tenant_id', '=', tenantId).orderBy('name', 'asc').execute();
        const counts = await trx.selectFrom('crm_label_mappings')
          .innerJoin('crm_labels', 'crm_labels.id', 'crm_label_mappings.label_id')
          .select(['crm_label_mappings.label_id', (eb: any) => eb.fn.countAll().as('n')])
          .where('crm_labels.tenant_id', '=', tenantId)
          .groupBy('crm_label_mappings.label_id').execute();
        const countMap = new Map(counts.map((c: any) => [c.label_id, Number(c.n)]));
        return labels.map(l => ({ id: l.id, name: l.name, color: l.color, count: countMap.get(l.id) ?? 0 }));
      });
      return rows;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Labels attached to one specific record.
  fastify.get('/for', async (request: any, reply) => {
    const q = z.object({ subject_type: z.enum(SUBJECT_TYPES), subject_id: z.string().uuid() }).parse(request.query);
    try {
      const tenantId = request.user.tenant_id;
      const rows = await withTenant(tenantId, trx =>
        trx.selectFrom('crm_label_mappings')
          .innerJoin('crm_labels', 'crm_labels.id', 'crm_label_mappings.label_id')
          .select(['crm_labels.id', 'crm_labels.name', 'crm_labels.color'])
          .where('crm_labels.tenant_id', '=', tenantId)
          .where('crm_label_mappings.subject_type', '=', q.subject_type)
          .where('crm_label_mappings.subject_id', '=', q.subject_id)
          .orderBy('crm_labels.name', 'asc').execute()
      );
      return rows;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/', async (request: any, reply) => {
    const b = createSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const [row] = await withTenant(tenantId, trx =>
        trx.insertInto('crm_labels').values({ tenant_id: tenantId, name: b.name, color: b.color || 'teal' })
          .returningAll().execute()
      );
      return { ...row, count: 0 };
    } catch (err: any) {
      if (err.message?.includes('duplicate key')) return reply.status(400).send({ error: `A label named "${b.name}" already exists` });
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const b = patchSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const patch: Record<string, unknown> = {};
      if (b.name !== undefined) patch.name = b.name;
      if (b.color !== undefined) patch.color = b.color;
      const [row] = await withTenant(tenantId, trx =>
        trx.updateTable('crm_labels').set(patch).where('id', '=', request.params.id)
          .where('tenant_id', '=', tenantId).returningAll().execute()
      );
      if (!row) return reply.status(404).send({ error: 'Label not found' });
      return row;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/:id', async (request: any, reply) => {
    try {
      await withTenant(request.user.tenant_id, trx =>
        trx.deleteFrom('crm_labels').where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).execute()
      );
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/:id/assign', async (request: any, reply) => {
    const b = assignSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const ok = await withTenant(tenantId, async trx => {
        const label = await trx.selectFrom('crm_labels').select('id')
          .where('id', '=', request.params.id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!label) return false;
        const subject = await trx.selectFrom(SUBJECT_TABLE[b.subject_type]).select('id')
          .where('id', '=', b.subject_id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!subject) return false;
        await trx.insertInto('crm_label_mappings')
          .values({ label_id: request.params.id, subject_type: b.subject_type, subject_id: b.subject_id })
          .onConflict(oc => oc.columns(['label_id', 'subject_type', 'subject_id']).doNothing())
          .execute();
        return true;
      });
      if (!ok) return reply.status(404).send({ error: 'Label or subject not found' });
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/:id/assign', async (request: any, reply) => {
    const q = assignSchema.parse(request.query);
    try {
      await withTenant(request.user.tenant_id, trx =>
        trx.deleteFrom('crm_label_mappings')
          .where('label_id', '=', request.params.id)
          .where('subject_type', '=', q.subject_type)
          .where('subject_id', '=', q.subject_id)
          .execute()
      );
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
