import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, type Database } from '../db/client.js';
import type { Transaction } from 'kysely';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { MailService } from '../services/mail.service.js';

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
// A malformed (non-UUID) :id used to reach Postgres as-is and crash with a
// raw driver error (sanitized to an opaque 500) instead of a clean 404.
const idParamSchema = z.object({ id: z.string().uuid() });

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

// A deal has no contact of its own — it resolves through whichever of its
// customer_id/lead_id actually has an email, customer first (a live
// account is a better address than a lead's original inquiry contact once
// one exists). Returns null rather than throwing so the route can give a
// real "there's no email on file" error instead of a stack trace.
async function resolveRecipientEmail(trx: Transaction<Database>, tenantId: string, subjectType: SubjectType, subjectId: string): Promise<{ email: string; name: string } | null> {
  if (subjectType === 'lead') {
    const row = await trx.selectFrom('leads').select(['contact_email', 'contact_name'])
      .where('id', '=', subjectId).where('tenant_id', '=', tenantId).executeTakeFirst();
    return row?.contact_email ? { email: row.contact_email, name: row.contact_name } : null;
  }
  if (subjectType === 'customer') {
    const row = await trx.selectFrom('customers').select(['email', 'name'])
      .where('id', '=', subjectId).where('tenant_id', '=', tenantId).executeTakeFirst();
    return row?.email ? { email: row.email, name: row.name } : null;
  }
  const deal = await trx.selectFrom('deals').select(['customer_id', 'lead_id'])
    .where('id', '=', subjectId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!deal) return null;
  if (deal.customer_id) {
    const c = await trx.selectFrom('customers').select(['email', 'name'])
      .where('id', '=', deal.customer_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (c?.email) return { email: c.email, name: c.name };
  }
  if (deal.lead_id) {
    const l = await trx.selectFrom('leads').select(['contact_email', 'contact_name'])
      .where('id', '=', deal.lead_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (l?.contact_email) return { email: l.contact_email, name: l.contact_name };
  }
  return null;
}

/** Shared by every CRM route that wants to drop a system event onto a
 *  subject's timeline (deal stage moves, lead conversion, record creation)
 *  — callers pass an already-open transaction so the log write commits
 *  atomically with whatever it's recording. */
export async function logCrmActivity(
  trx: Transaction<Database>,
  params: {
    tenantId: string; subjectType: SubjectType; subjectId: string;
    // 'email'/'call' are here too, alongside the manual-entry types — the
    // send-email route below and (eventually) Bliss's own call-completed
    // hook both log a real system-recorded action, not a user's own note.
    type: 'stage_change' | 'created' | 'note' | 'email' | 'call' | 'meeting'; body: string; meta?: unknown;
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
  fastify.addHook('preHandler', requireEntitlement('crm'));
  fastify.addHook('preHandler', requireRole(...ACTIVITY_ROLES));

  fastify.get('/', async (request: any) => {
    const q = listQuerySchema.parse(request.query);
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
  });

  fastify.post('/', async (request: any, reply) => {
    const b = createSchema.parse(request.body);
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
  });

  // Only the author (or management) may remove a manually-logged entry —
  // system events (stage_change/created) have no author to check against
  // and aren't deletable through this route at all.
  fastify.delete('/:id', async (request: any, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const tenantId = request.user.tenant_id;
    const isManager = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(request.user.role);
    await withTenant(tenantId, trx => {
      let q = trx.deleteFrom('crm_activities')
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .where('type', 'in', MANUAL_TYPES);
      if (!isManager) q = q.where('actor_id', '=', request.user.sub);
      return q.execute();
    });
    reply.status(204);
    return null;
  });

  // Sends a real email through the platform's own mail service instead of
  // a bare mailto: link (CRM gap-analysis's native-email item) and logs it
  // to the same timeline every other activity uses. subject/body come from
  // the caller; the recipient is always resolved server-side from the
  // subject's own contact record — never trusted from the request — so
  // this can't be used to relay mail to an arbitrary address.
  const sendEmailSchema = z.object({
    subject_type: z.enum(SUBJECT_TYPES),
    subject_id: z.string().uuid(),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(20000),
  });
  fastify.post('/send-email', async (request: any, reply) => {
    const b = sendEmailSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const result = await withTenant(tenantId, async trx => {
      const recipient = await resolveRecipientEmail(trx, tenantId, b.subject_type, b.subject_id);
      if (!recipient) return { error: 'no-email' as const };

      const bodyHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; white-space: pre-wrap;">${b.body}</div>`;
      const sendResult = await MailService.sendNow(tenantId, {
        to: recipient.email, subject: b.subject, bodyHtml, sourceApp: 'crm',
      });
      if (!sendResult.success) return { error: 'send-failed' as const, detail: sendResult.error };

      await logCrmActivity(trx, {
        tenantId, subjectType: b.subject_type, subjectId: b.subject_id, type: 'email',
        body: `Emailed ${recipient.name} <${recipient.email}>: "${b.subject}"`,
        meta: { to: recipient.email, subject: b.subject },
        actorId: request.user.sub, actorName: request.user.name,
      });
      return { success: true, to: recipient.email, simulated: sendResult.simulated };
    });
    if ('error' in result) {
      if (result.error === 'no-email') return reply.status(400).send({ error: 'This record has no email address on file' });
      return reply.status(502).send({ error: result.detail || 'Failed to send email' });
    }
    return result;
  });
}
