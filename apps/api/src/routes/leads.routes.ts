import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { dealSelect, mapDeal } from './deals.routes.js';
import { logCrmActivity } from './crm-activity.routes.js';

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
  assigned_to_id: z.string().uuid().nullish(),
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
  assigned_to_id: z.string().uuid().nullable().optional(),
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
    assigned_to_id: row.assigned_to_id ?? undefined,
    assigned_to_name: row.assigned_to_name ?? undefined,
    expected_close: row.expected_close ? new Date(row.expected_close).toISOString().slice(0, 10) : undefined,
    created_at: row.created_at,
    notes: row.notes ?? undefined,
    industry: row.industry ?? undefined,
    location: row.location ?? undefined,
    website: row.website ?? undefined,
  };
}

const leadSelect = (qb: any): any => qb
  .selectFrom('leads')
  .leftJoin('users', 'users.id', 'leads.assigned_to_id')
  .selectAll('leads')
  .select(['users.name as assigned_to_name']);

export async function leadsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(...LEAD_ROLES));

  fastify.get('/', async (request: any, reply) => {
    try {
      const rows = await withTenant<any[]>(request.user.tenant_id, trx =>
        leadSelect(trx).where('leads.tenant_id', '=', request.user.tenant_id).orderBy('leads.created_at', 'desc').execute()
      );
      return rows.map(mapLead);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/', async (request: any, reply) => {
    const b = leadCreateSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const id = await withTenant(tenantId, async trx => {
        const [row] = await trx.insertInto('leads').values({
          tenant_id: tenantId,
          company: b.company,
          contact_name: b.contact_name,
          contact_email: b.contact_email || null,
          contact_phone: b.contact_phone || null,
          source: b.source || 'Web Form',
          stage: b.stage || 'NEW',
          value: String(Number(b.value) || 0),
          priority: b.priority || 'MEDIUM',
          assigned_to: b.assigned_to || null,
          assigned_to_id: b.assigned_to_id || null,
          expected_close: b.expected_close ? new Date(b.expected_close) : null,
          notes: b.notes || null,
          industry: b.industry || null,
          location: b.location || null,
          website: b.website || null,
        }).returning('id').execute();
        await logCrmActivity(trx, {
          tenantId, subjectType: 'lead', subjectId: row.id, type: 'created',
          body: `Lead captured from ${b.source || 'Web Form'}`,
          actorId: request.user.sub, actorName: request.user.name,
        });
        return row.id;
      });
      const [row] = await withTenant<any[]>(tenantId, trx => leadSelect(trx).where('leads.id', '=', id).execute());
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
      if (b.assigned_to_id !== undefined) patch.assigned_to_id = b.assigned_to_id || null;
      if (b.expected_close !== undefined) patch.expected_close = b.expected_close ? new Date(b.expected_close) : null;
      if (b.notes !== undefined) patch.notes = b.notes || null;
      if (b.industry !== undefined) patch.industry = b.industry || null;
      if (b.location !== undefined) patch.location = b.location || null;
      if (b.website !== undefined) patch.website = b.website || null;

      const tenantId = request.user.tenant_id;
      await withTenant(tenantId, async trx => {
        let existingStage: string | undefined;
        if (b.stage !== undefined) {
          existingStage = (await trx.selectFrom('leads').select('stage')
            .where('id', '=', request.params.id).where('tenant_id', '=', tenantId).executeTakeFirst())?.stage;
        }
        await trx.updateTable('leads').set(patch).where('id', '=', request.params.id)
          .where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
        if (b.stage !== undefined && existingStage && existingStage !== b.stage) {
          await logCrmActivity(trx, {
            tenantId, subjectType: 'lead', subjectId: request.params.id, type: 'stage_change',
            body: `Stage moved from ${existingStage} to ${b.stage}`,
            meta: { from: existingStage, to: b.stage },
            actorId: request.user.sub, actorName: request.user.name,
          });
        }
      });
      const [row] = await withTenant<any[]>(tenantId, trx => leadSelect(trx).where('leads.id', '=', request.params.id).execute());
      return mapLead(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/:id', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      await withTenant(tenantId, async trx => {
        // crm_activities has no FK to leads (subject_id is a polymorphic
        // reference across leads/deals/customers — see migration 449's own
        // comment), so nothing cascades here automatically; a hard-deleted
        // lead would otherwise leave its whole timeline as permanent,
        // unreachable orphan rows.
        await trx.deleteFrom('crm_activities')
          .where('tenant_id', '=', tenantId).where('subject_type', '=', 'lead').where('subject_id', '=', request.params.id).execute();
        await trx.deleteFrom('leads').where('id', '=', request.params.id)
          .where('tenant_id', '=', tenantId).execute();
      });
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Creates a real Deal from this lead — the CRM gap-analysis's #1 "Now"
  // item. Doesn't touch the lead's own stage: the lead stays exactly what
  // it was (a record of how this prospect was first qualified), the deal
  // is the new, separate object the rest of the pipeline now tracks. A
  // lead can be converted more than once — a second deal from a lead that
  // adds a second product line is a real scenario, not a bug to prevent.
  fastify.post('/:id/convert', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const lead = await withTenant(tenantId, trx =>
        trx.selectFrom('leads').selectAll().where('id', '=', request.params.id)
          .where('tenant_id', '=', tenantId).executeTakeFirst()
      );
      if (!lead) return reply.status(404).send({ error: 'Lead not found' });

      const dealId = await withTenant(tenantId, async trx => {
        const [row] = await trx.insertInto('deals').values({
          tenant_id: tenantId,
          name: lead.company,
          lead_id: lead.id,
          stage: 'QUALIFICATION',
          value: lead.value,
          currency: 'TZS',
          probability: 50,
          owner_id: lead.assigned_to_id,
          source: lead.source,
          expected_close: lead.expected_close,
          notes: lead.notes,
          created_by: request.user.sub,
        }).returning('id').execute();
        await logCrmActivity(trx, {
          tenantId, subjectType: 'deal', subjectId: row.id, type: 'created',
          body: 'Deal created from a converted lead',
          actorId: request.user.sub, actorName: request.user.name,
        });
        await logCrmActivity(trx, {
          tenantId, subjectType: 'lead', subjectId: lead.id, type: 'note',
          body: 'Converted to a deal',
          actorId: request.user.sub, actorName: request.user.name,
        });
        return row.id;
      });

      const [row] = await withTenant<any[]>(tenantId, trx => dealSelect(trx).where('deals.id', '=', dealId).execute());
      return mapDeal(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Fuzzy-duplicate detection on company name — same pg_trgm mechanism
  // Contacts already uses (438_contacts_gap_closure.sql), applied to the
  // field that carries identity here. Company is the "same real thing typed
  // twice" surface for a lead; a lighter single-method pass than Contacts'
  // three (exact email/phone + normalized-phone + fuzzy name) because a
  // lead's own email/phone belong to whichever contact took the call, not
  // to the account — matching two different peoples' numbers proves
  // nothing about whether the two leads are the same company.
  fastify.get('/duplicates', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const rows = await withTenant(tenantId, async trx => {
        const fuzzy = await sql<{ id: string; other_id: string }>`
          SELECT a.id, b.id AS other_id
          FROM leads a
          JOIN leads b ON b.tenant_id = a.tenant_id AND b.id > a.id
          WHERE a.tenant_id = ${tenantId}
            AND similarity(a.company, b.company) >= 0.5
        `.execute(trx);
        if (fuzzy.rows.length === 0) return [];
        const ids = [...new Set(fuzzy.rows.flatMap(r => [r.id, r.other_id]))];
        const leads = await leadSelect(trx).where('leads.id', 'in', ids).execute();
        const byId = new Map(leads.map((l: any) => [l.id, mapLead(l)]));
        return fuzzy.rows.map(r => ({ leads: [byId.get(r.id), byId.get(r.other_id)].filter(Boolean) }));
      });
      return rows;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Merges duplicate_ids into primary_id: every deal, activity and label
  // pointing at a duplicate is repointed at the survivor, then the
  // duplicate rows are deleted. crm_label_mappings can collide (the primary
  // may already carry a label a duplicate also had) — onConflict/doNothing
  // there, same shape contacts.service.ts's own mergeContacts uses.
  const mergeSchema = z.object({ primary_id: z.string().uuid(), duplicate_ids: z.array(z.string().uuid()).min(1) });
  fastify.post('/merge', async (request: any, reply) => {
    const b = mergeSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      await withTenant(tenantId, async trx => {
        const primary = await trx.selectFrom('leads').select('id')
          .where('id', '=', b.primary_id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!primary) throw new Error('Primary lead not found');

        for (const dupId of b.duplicate_ids) {
          if (dupId === b.primary_id) continue;
          await trx.updateTable('deals').set({ lead_id: b.primary_id })
            .where('lead_id', '=', dupId).where('tenant_id', '=', tenantId).execute();
          await trx.updateTable('crm_activities').set({ subject_id: b.primary_id })
            .where('subject_type', '=', 'lead').where('subject_id', '=', dupId).where('tenant_id', '=', tenantId).execute();

          const dupLabels = await trx.selectFrom('crm_label_mappings').select('label_id')
            .where('subject_type', '=', 'lead').where('subject_id', '=', dupId).execute();
          if (dupLabels.length) {
            await trx.insertInto('crm_label_mappings')
              .values(dupLabels.map(l => ({ label_id: l.label_id, subject_type: 'lead' as const, subject_id: b.primary_id })))
              .onConflict(oc => oc.columns(['label_id', 'subject_type', 'subject_id']).doNothing())
              .execute();
          }
          await trx.deleteFrom('crm_label_mappings')
            .where('subject_type', '=', 'lead').where('subject_id', '=', dupId).execute();
          await trx.deleteFrom('leads').where('id', '=', dupId).where('tenant_id', '=', tenantId).execute();
        }
      });
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
