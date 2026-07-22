import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import type { CreateWorkflowInput, UpdateWorkflowInput, Workflow, WorkflowStep, WorkflowTrigger } from '@hudumika/types';

const OPS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;

function parseJson<T>(val: unknown, fallback: T): T {
  if (val == null) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return val as T;
}

function toStep(row: any): WorkflowStep {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    name: row.name,
    description: row.description,
    order: row.step_order,
    isStart: row.is_start,
    isTerminal: row.is_terminal,
    nextStepIds: parseJson(row.next_step_ids, []),
    entryConditions: parseJson(row.entry_conditions, []),
    autoComms: parseJson(row.auto_comms, []),
    slaHours: row.sla_hours ?? undefined,
    color: row.color,
  };
}

function toWorkflow(row: any, steps: WorkflowStep[]): Workflow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    isDefault: row.is_default,
    steps: steps.sort((a, b) => a.order - b.order),
    triggers: parseJson<WorkflowTrigger>(row.triggers, {
      freightModes: [], consignmentTypes: [], customerIds: [], originCountries: [], destinationCountries: [], isDefault: false,
    }),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function loadWorkflowWithSteps(trx: any, tenantId: string, workflowId: string): Promise<Workflow | null> {
  const wfRow = await trx.selectFrom('workflows').selectAll()
    .where('id', '=', workflowId).where('tenant_id', '=', tenantId).where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!wfRow) return null;
  const stepRows = await trx.selectFrom('workflow_steps').selectAll()
    .where('workflow_id', '=', workflowId).where('tenant_id', '=', tenantId)
    .orderBy('step_order', 'asc').execute();
  return toWorkflow(wfRow, stepRows.map(toStep));
}

/** Remaps client-generated temp step ids to real UUIDs (steps reference each other via nextStepIds within one payload). */
function remapStepIds(steps: CreateWorkflowInput['steps']): { id: string; step: CreateWorkflowInput['steps'][number] }[] {
  const idMap = new Map<string, string>();
  for (const s of steps) idMap.set(s.id, crypto.randomUUID());
  return steps.map((s) => ({
    id: idMap.get(s.id)!,
    step: { ...s, nextStepIds: s.nextStepIds.map((nid) => idMap.get(nid) ?? nid) },
  }));
}

export async function workflowRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /** GET /v1/workflows — list (tenant-scoped, excludes soft-deleted), each with its steps. */
  fastify.get('/', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const wfRows = await trx.selectFrom('workflows').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is', null)
        .orderBy('created_at', 'asc').execute();
      if (wfRows.length === 0) return { data: [] };

      const stepRows = await trx.selectFrom('workflow_steps').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('workflow_id', 'in', wfRows.map((w) => w.id))
        .orderBy('step_order', 'asc').execute();

      const stepsByWorkflow = new Map<string, WorkflowStep[]>();
      for (const row of stepRows) {
        const list = stepsByWorkflow.get(row.workflow_id) ?? [];
        list.push(toStep(row));
        stepsByWorkflow.set(row.workflow_id, list);
      }

      const data = wfRows.map((w) => toWorkflow(w, stepsByWorkflow.get(w.id) ?? []));
      return { data };
    });
  });

  /** GET /v1/workflows/:id — single, with steps. */
  fastify.get('/:id', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const workflow = await loadWorkflowWithSteps(trx, user.tenant_id, id);
      if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });
      return workflow;
    });
  });

  /** POST /v1/workflows — create a workflow + its steps. */
  fastify.post('/', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const input = request.body as CreateWorkflowInput;

    if (!input.name || !Array.isArray(input.steps)) {
      return reply.status(400).send({ error: 'name and steps are required' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const now = new Date();

      if (input.isDefault) {
        await trx.updateTable('workflows').set({ is_default: false, updated_at: now })
          .where('tenant_id', '=', user.tenant_id).where('is_default', '=', true).execute();
      }

      const wfRow = await trx.insertInto('workflows').values({
        tenant_id: user.tenant_id,
        name: input.name,
        description: input.description || '',
        is_active: input.isActive ?? true,
        is_default: input.isDefault ?? false,
        triggers: JSON.stringify(input.triggers),
        created_by: user.sub,
        created_at: now,
        updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const remapped = remapStepIds(input.steps);
      for (const { id: stepId, step } of remapped) {
        await trx.insertInto('workflow_steps').values({
          id: stepId,
          tenant_id: user.tenant_id,
          workflow_id: wfRow.id,
          name: step.name,
          description: step.description || '',
          step_order: step.order,
          is_start: step.isStart,
          is_terminal: step.isTerminal,
          next_step_ids: JSON.stringify(step.nextStepIds),
          entry_conditions: JSON.stringify(step.entryConditions),
          auto_comms: JSON.stringify(step.autoComms),
          sla_hours: step.slaHours ?? null,
          color: step.color || '#0d9488',
          created_at: now,
          updated_at: now,
        }).execute();
      }

      const workflow = await loadWorkflowWithSteps(trx, user.tenant_id, wfRow.id);
      reply.status(201);
      return workflow;
    });
  });

  /** PATCH /v1/workflows/:id — patch top-level fields; a full steps array (if sent) replaces all steps. */
  fastify.patch('/:id', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const input = request.body as UpdateWorkflowInput;

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('workflows').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Workflow not found' });

      const now = new Date();
      if (input.isDefault) {
        await trx.updateTable('workflows').set({ is_default: false, updated_at: now })
          .where('tenant_id', '=', user.tenant_id).where('is_default', '=', true).where('id', '!=', id).execute();
      }

      const patch: Record<string, any> = { updated_at: now };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      if (input.isDefault !== undefined) patch.is_default = input.isDefault;
      if (input.triggers !== undefined) patch.triggers = JSON.stringify(input.triggers);

      await trx.updateTable('workflows').set(patch)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      if (input.steps !== undefined) {
        await trx.deleteFrom('workflow_steps')
          .where('workflow_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

        const remapped = remapStepIds(input.steps);
        for (const { id: stepId, step } of remapped) {
          await trx.insertInto('workflow_steps').values({
            id: stepId,
            tenant_id: user.tenant_id,
            workflow_id: id,
            name: step.name,
            description: step.description || '',
            step_order: step.order,
            is_start: step.isStart,
            is_terminal: step.isTerminal,
            next_step_ids: JSON.stringify(step.nextStepIds),
            entry_conditions: JSON.stringify(step.entryConditions),
            auto_comms: JSON.stringify(step.autoComms),
            sla_hours: step.slaHours ?? null,
            color: step.color || '#0d9488',
            created_at: now,
            updated_at: now,
          }).execute();
        }
      }

      const workflow = await loadWorkflowWithSteps(trx, user.tenant_id, id);
      return workflow;
    });
  });

  /** DELETE /v1/workflows/:id — soft delete; refuses if a live (non-terminal) shipment still uses it. */
  fastify.delete('/:id', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('workflows').select('id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Workflow not found' });

      const terminalStepIds = await trx.selectFrom('workflow_steps').select('id')
        .where('workflow_id', '=', id).where('tenant_id', '=', user.tenant_id).where('is_terminal', '=', true)
        .execute();
      const terminalIds = terminalStepIds.map((r) => r.id);

      let inUseQuery = trx.selectFrom('shipment_cases').select('id')
        .where('workflow_id', '=', id).where('tenant_id', '=', user.tenant_id);
      if (terminalIds.length > 0) {
        inUseQuery = inUseQuery.where('workflow_step_id', 'not in', terminalIds);
      }
      const inUse = await inUseQuery.executeTakeFirst();
      if (inUse) {
        return reply.status(409).send({ error: 'This workflow still governs active (non-terminal) shipments and cannot be deleted.' });
      }

      await trx.updateTable('workflows').set({ deleted_at: new Date(), updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      reply.status(204);
      return null;
    });
  });

  /** POST /v1/workflows/:id/duplicate — server-side copy (name suffixed, inactive+non-default). */
  fastify.post('/:id/duplicate', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const source = await loadWorkflowWithSteps(trx, user.tenant_id, id);
      if (!source) return reply.status(404).send({ error: 'Workflow not found' });

      const now = new Date();
      const wfRow = await trx.insertInto('workflows').values({
        tenant_id: user.tenant_id,
        name: `${source.name} (Copy)`,
        description: source.description,
        is_active: false,
        is_default: false,
        triggers: JSON.stringify(source.triggers),
        created_by: user.sub,
        created_at: now,
        updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const idMap = new Map<string, string>();
      for (const s of source.steps) idMap.set(s.id, crypto.randomUUID());

      for (const s of source.steps) {
        await trx.insertInto('workflow_steps').values({
          id: idMap.get(s.id)!,
          tenant_id: user.tenant_id,
          workflow_id: wfRow.id,
          name: s.name,
          description: s.description,
          step_order: s.order,
          is_start: s.isStart,
          is_terminal: s.isTerminal,
          next_step_ids: JSON.stringify(s.nextStepIds.map((nid) => idMap.get(nid) ?? nid)),
          entry_conditions: JSON.stringify(s.entryConditions),
          auto_comms: JSON.stringify(s.autoComms),
          sla_hours: s.slaHours ?? null,
          color: s.color,
          created_at: now,
          updated_at: now,
        }).execute();
      }

      const workflow = await loadWorkflowWithSteps(trx, user.tenant_id, wfRow.id);
      reply.status(201);
      return workflow;
    });
  });
}
