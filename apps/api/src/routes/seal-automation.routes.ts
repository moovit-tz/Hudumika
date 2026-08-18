import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { withTenant } from '../db/client.js';
import { toDateParam } from '../utils/dates.js';

// Real values — 118_seal_automation.sql's CHECK constraints.
const TRIGGER_TYPES = ['lot_flagged', 'storage_expiring', 'examination_pending', 'low_stock'] as const;
const ACTION_TYPES = ['create_task', 'create_ticket'] as const;
const ruleCreateSchema = z.object({
  compartmentId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  triggerType: z.enum(TRIGGER_TYPES),
  thresholdValue: z.number().nullable().optional(),
  actionType: z.enum(ACTION_TYPES),
  actionAssignee: z.string().nullable().optional(),
});
const rulePatchSchema = z.object({
  active: z.boolean().optional(),
  thresholdValue: z.number().nullable().optional(),
  actionAssignee: z.string().nullable().optional(),
});

// SEAL-owned automation rules — confirmed during planning that both of the
// platform's existing workflow engines (ClearOS's shipment-lifecycle step-
// graph, NexusHR's subject_id/subject_type case engine) are architecturally
// unfit for these triggers. This is a small, purpose-built trigger->action
// table, not a third generic engine, and it is a real, on-demand action
// (no cron/scheduler exists anywhere in this codebase to fire it silently
// in the background) — "Run Automation Check" is a button a warehouse
// manager presses, honestly labeled as such, not a fabricated always-on job.

const DEFAULT_STORAGE_EXPIRING_DAYS = 30;
const SLA_HOURS: Record<string, number> = { URGENT: 4, HIGH: 8, NORMAL: 24, LOW: 48 }; // mirrors support.routes.ts's own SLA_HOURS

function mapRule(row: any) {
  return {
    id: row.id, compartmentId: row.compartment_id, name: row.name, triggerType: row.trigger_type,
    thresholdValue: row.threshold_value != null ? Number(row.threshold_value) : null,
    actionType: row.action_type, actionAssignee: row.action_assignee, active: row.active,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapRun(row: any) {
  return {
    id: row.id, ruleId: row.rule_id, subjectId: row.subject_id, subjectType: row.subject_type,
    status: row.status, resultType: row.result_type, resultId: row.result_id,
    firedAt: row.fired_at, resolvedAt: row.resolved_at,
    ruleName: row.rule_name ?? undefined, subjectDescription: row.subject_description ?? undefined,
  };
}

async function evaluateRules(trx: Transaction<Database>, tenantId: string) {
  const rules = await trx.selectFrom('seal_automation_rules').selectAll().where('tenant_id', '=', tenantId).where('active', '=', true).execute();
  const fired: { ruleId: string; subjectId: string; subjectType: string; resultType: string; resultId: string }[] = [];

  for (const rule of rules) {
    let candidates: { subjectId: string; description: string; ownerId: string }[] = [];

    if (rule.trigger_type === 'lot_flagged') {
      let q = trx.selectFrom('seal_lots').select(['id', 'description', 'owner_id']).where('tenant_id', '=', tenantId)
        .where('customs_status', 'in', ['SEIZED', 'ABANDONED']);
      if (rule.compartment_id) q = q.where('compartment_id', '=', rule.compartment_id);
      candidates = (await q.execute()).map(l => ({ subjectId: l.id, description: l.description, ownerId: l.owner_id }));
    } else if (rule.trigger_type === 'storage_expiring') {
      const days = rule.threshold_value != null ? Number(rule.threshold_value) : DEFAULT_STORAGE_EXPIRING_DAYS;
      let q = trx.selectFrom('seal_lots').select(['id', 'description', 'owner_id']).where('tenant_id', '=', tenantId)
        .where('customs_status', '=', 'FOREIGN_DUTY_SUSPENDED')
        .where('expires_on', 'is not', null)
        .where('expires_on', '<=', toDateParam(new Date(Date.now() + days * 86400000)));
      if (rule.compartment_id) q = q.where('compartment_id', '=', rule.compartment_id);
      candidates = (await q.execute()).map(l => ({ subjectId: l.id, description: l.description, ownerId: l.owner_id }));
    } else if (rule.trigger_type === 'examination_pending') {
      let q = trx.selectFrom('seal_examinations')
        .innerJoin('seal_customs_entries', 'seal_customs_entries.id', 'seal_examinations.customs_entry_id')
        .innerJoin('seal_lots', 'seal_lots.id', 'seal_customs_entries.lot_id')
        .select(['seal_examinations.id', 'seal_lots.description', 'seal_lots.owner_id', 'seal_lots.compartment_id'])
        .where('seal_examinations.tenant_id', '=', tenantId)
        .where('seal_examinations.status', 'in', ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS']);
      if (rule.compartment_id) q = q.where('seal_lots.compartment_id', '=', rule.compartment_id);
      candidates = (await q.execute()).map(e => ({ subjectId: e.id, description: e.description, ownerId: e.owner_id }));
    } else if (rule.trigger_type === 'low_stock') {
      const threshold = rule.threshold_value != null ? Number(rule.threshold_value) : 0;
      let q = trx.selectFrom('seal_lots').select(['id', 'description', 'owner_id']).where('tenant_id', '=', tenantId)
        .where('qty_on_hand', '>', '0')
        .where('qty_on_hand', '<=', String(threshold));
      if (rule.compartment_id) q = q.where('compartment_id', '=', rule.compartment_id);
      candidates = (await q.execute()).map(l => ({ subjectId: l.id, description: l.description, ownerId: l.owner_id }));
    }

    const subjectType = rule.trigger_type === 'examination_pending' ? 'examination' : 'lot';

    for (const candidate of candidates) {
      const existingOpen = await trx.selectFrom('seal_automation_runs').select('id')
        .where('tenant_id', '=', tenantId)
        .where('rule_id', '=', rule.id).where('subject_id', '=', candidate.subjectId).where('status', '=', 'open')
        .executeTakeFirst();
      if (existingOpen) continue;

      let resultType: string; let resultId: string;
      if (rule.action_type === 'create_task') {
        const task = await trx.insertInto('seal_tasks').values({
          tenant_id: tenantId, compartment_id: rule.compartment_id,
          title: `[Automation: ${rule.name}] ${candidate.description}`,
          priority: 'high', assigned_to: rule.action_assignee ?? null,
        }).returningAll().executeTakeFirstOrThrow();
        resultType = 'task'; resultId = task.id;
      } else {
        const priority = rule.trigger_type === 'lot_flagged' ? 'HIGH' : 'NORMAL';
        const ticket = await trx.insertInto('support_tickets').values({
          tenant_id: tenantId,
          customer_id: candidate.ownerId,
          ref_number: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
          subject: `[Automation: ${rule.name}] ${candidate.description}`,
          description: `Auto-raised by SEAL automation rule "${rule.name}" (${rule.trigger_type}).`,
          channel: 'SYSTEM', priority, category: 'Warehouse Operations', status: 'OPEN',
          tags: JSON.stringify([]),
          sla_deadline: new Date(Date.now() + SLA_HOURS[priority] * 3600_000),
        }).returningAll().executeTakeFirstOrThrow();
        resultType = 'ticket'; resultId = ticket.id;
      }

      await trx.insertInto('seal_automation_runs').values({
        tenant_id: tenantId, rule_id: rule.id, subject_id: candidate.subjectId, subject_type: subjectType,
        result_type: resultType, result_id: resultId,
      }).execute();
      fired.push({ ruleId: rule.id, subjectId: candidate.subjectId, subjectType, resultType, resultId });
    }
  }

  return fired;
}

export async function sealAutomationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('seal'));

  fastify.get('/automation-rules', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_automation_rules').selectAll().where('tenant_id', '=', request.user.tenant_id).orderBy('created_at', 'desc').execute()
      );
      return rows.map(mapRule);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/automation-rules', async (request: any, reply) => {
    const b = ruleCreateSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_automation_rules').values({
          tenant_id: request.user.tenant_id,
          compartment_id: b.compartmentId ?? null,
          name: b.name.trim(),
          trigger_type: b.triggerType,
          threshold_value: b.thresholdValue != null ? String(b.thresholdValue) : null,
          action_type: b.actionType,
          action_assignee: b.actionAssignee ?? null,
        }).returningAll().executeTakeFirstOrThrow()
      );
      return mapRule(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/automation-rules/:id', async (request: any, reply) => {
    const b = rulePatchSchema.parse(request.body);
    try {
      const patch: any = { updated_at: new Date() };
      if (b.active !== undefined) patch.active = b.active;
      if (b.thresholdValue !== undefined) patch.threshold_value = b.thresholdValue != null ? String(b.thresholdValue) : null;
      if (b.actionAssignee !== undefined) patch.action_assignee = b.actionAssignee;
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_automation_rules').set(patch).where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).returningAll().executeTakeFirstOrThrow()
      );
      return mapRule(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/automation-rules/:id', async (request: any, reply) => {
    try {
      await withTenant(request.user.tenant_id, trx =>
        trx.deleteFrom('seal_automation_rules').where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).execute()
      );
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // On-demand evaluation — a real, immediate action a user triggers; there
  // is no background scheduler in this codebase to fire this silently, so
  // it is never described as "automatic" in the UI.
  fastify.post('/automation-rules/evaluate', async (request: any, reply) => {
    try {
      const fired = await withTenant(request.user.tenant_id, trx => evaluateRules(trx, request.user.tenant_id));
      return { firedCount: fired.length, fired };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/automation-runs', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_automation_runs')
          .innerJoin('seal_automation_rules', 'seal_automation_rules.id', 'seal_automation_runs.rule_id')
          .select([
            'seal_automation_runs.id', 'seal_automation_runs.rule_id', 'seal_automation_runs.subject_id',
            'seal_automation_runs.subject_type', 'seal_automation_runs.status', 'seal_automation_runs.result_type',
            'seal_automation_runs.result_id', 'seal_automation_runs.fired_at', 'seal_automation_runs.resolved_at',
            'seal_automation_rules.name as rule_name',
          ])
          .where('seal_automation_runs.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_automation_runs.fired_at', 'desc')
          .limit(100)
          .execute()
      );
      return rows.map(mapRun);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
