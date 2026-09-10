import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, type Database } from '../db/client.js';
import type { Transaction } from 'kysely';
import { requireRole } from '../middleware/rbac.js';

const SUBJECT_TYPES = ['lead', 'deal', 'customer'] as const;
type SubjectType = (typeof SUBJECT_TYPES)[number];
const MANUAL_TYPES = ['call', 'email', 'meeting', 'note'] as const;

const ACTIVITY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE'] as const;

const listQuerySchema = z.object({
  subject_type: z.enum(SUBJECT_TYPES),
  subject_id: z.string().uuid(),
});
const createSchema = z.object({
  subject_type: z.enum(SUBJECT_TYPES),
  subject_id: z.string().uuid(),
  type: z.enum(MANUAL_TYPES),
  body: z.string().trim().min(1).max(5000),
});

// The one table each subject_type resolves against, for the "does this
// belong to my tenant" check every write does before trusting the caller's
// subject_id — subject_type/subject_id has no FK (see migration 449), so
// this ownership check is the only thing standing in for one.
const SUBJECT_TABLE: Record<SubjectType, 'leads' | 'deals' | 'customers'> = {
  lead: 'leads',
  deal: 'deals',
  customer: 'customers',
};

async function assertSubjectInTenant(trx: Transaction<Database>, tenantId: string, subjectType: SubjectType, subjectId: string): Promise<boolean> {
  const row = await trx.selectFrom(SUBJECT_TABLE[subjectType]).select('id')
    .where('id', '=', subjectId).where('tenant_id', '=', tenantId).executeTakeFirst();
  return !!row;
}

/** Shared by every CRM route that wants to drop a system event onto a
 *  subject's timeline (deal stage moves, lead conversion, record creation)
 *  — callers pass an already-open transaction so the log write commits
 *  atomically with whatever it's recording. */
export async function logCrmActivity(
  trx: Transaction<Database>,
  params: {
    tenantId: string; subjectType: SubjectType; subjectId: string;
    type: 'stage_change' | 'created' | 'note'; body: string; meta?: unknown;
    actorId?: string | null; actorName?: string | null;
  },
): Promise<void> {
  await trx.insertInto('crm_activities').values({
    tenant_id: params.tenantId,
    subject_type: params.subjectType,
    subject_id: params.subjectId,
    type: params.type,
    body: params.body,
    meta: params.meta ? JSON.stringify(params.meta) : null,
    actor_id: params.actorId || null,
    actor_name: params.actorName || null,
  }).execute();
}

function mapActivity(row: any) {
  return {
    id: row.id,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    type: row.type,
    body: row.body,
    meta: row.meta ?? undefined,
    actor_id: row.actor_id ?? undefined,
    actor_name: row.actor_name ?? undefined,
    created_at: row.created_at,
  };
}

export async function crmActivityRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(...ACTIVITY_ROLES));

  fastify.get('/', async (request: any, reply) => {
    const q = listQuerySchema.parse(request.query);
    try {
      const tenantId = request.user.tenant_id;
      const rows = await withTenant(tenantId, trx =>
        trx.selectFrom('crm_activities').selectAll()
          .where('tenant_id', '=', tenantId)
          .where('subject_type', '=', q.subject_type)
          .where('subject_id', '=', q.subject_id)
          .orderBy('created_at', 'desc')
          .execute()
      );
      return rows.map(mapActivity);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/', async (request: any, reply) => {
    const b = createSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const row = await withTenant(tenantId, async trx => {
        const ok = await assertSubjectInTenant(trx, tenantId, b.subject_type, b.subject_id);
        if (!ok) return null;
        const [r] = await trx.insertInto('crm_activities').values({
          tenant_id: tenantId,
          subject_type: b.subject_type,
          subject_id: b.subject_id,
          type: b.type,
          body: b.body,
          actor_id: request.user.sub,
          actor_name: request.user.name,
        }).returningAll().execute();
        return r;
      });
      if (!row) return reply.status(404).send({ error: 'Subject not found' });
      return mapActivity(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Only the author (or management) may remove a manually-logged entry —
  // system events (stage_change/created) have no author to check against
  // and aren't deletable through this route at all.
  fastify.delete('/:id', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const isManager = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(request.user.role);
      await withTenant(tenantId, trx => {
        let q = trx.deleteFrom('crm_activities')
          .where('id', '=', request.params.id)
          .where('tenant_id', '=', tenantId)
          .where('type', 'in', MANUAL_TYPES);
        if (!isManager) q = q.where('actor_id', '=', request.user.sub);
        return q.execute();
      });
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
