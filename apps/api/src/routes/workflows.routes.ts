import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { evaluateEntryConditions } from '../services/workflow-resolver.service.js';
import { WorkflowTemplateService } from '../services/workflow-template.service.js';
import { resolveComm } from '../services/workflow-comms.service.js';
import { recordRun } from '../services/workflow-runs.service.js';
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
    isSystem: row.is_system ?? false,
    templateKey: row.template_key ?? null,
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

  /**
   * GET /v1/workflows/templates — the platform template library the tenant can
   * adopt (latest published version per template key). Read-only; global rows,
   * not tenant-scoped. Must precede GET /:id so "templates" isn't read as an id.
   */
  fastify.get('/templates', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const published = await WorkflowTemplateService.listPublished();
    return {
      data: published.map((p) => ({
        id: p.id, templateKey: p.def.templateKey, version: p.version, source: p.source, isSystem: p.isSystem,
        name: p.def.name, description: p.def.description,
        freightModes: p.def.freightModes, consignmentTypes: p.def.consignmentTypes,
        stepCount: p.def.steps.length,
        steps: p.def.steps.map((s, i) => ({ name: s.name, order: i, isTerminal: !!s.isTerminal, checks: (s.conditions ?? []).length })),
      })),
    };
  });

  /**
   * POST /v1/workflows/templates/:id/adopt — clone a platform template into a
   * fully tenant-owned, editable workflow ("Use template"). The clone out-ranks
   * the matching system default at shipment resolution and can be freely edited
   * or deleted, exactly like any hand-built workflow.
   */
  fastify.post('/templates/:id/adopt', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const res = await WorkflowTemplateService.adopt(trx, user.tenant_id, id, user.sub);
        return { success: true, workflowId: res.workflowId, name: res.name };
      });
    } catch (err: any) {
      return reply.status(err.message === 'Template not found' ? 404 : 400).send({ error: err.message || 'Could not adopt template' });
    }
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

      /*
       * Plan the step changes BEFORE mutating anything.
       *
       * A step is not a shape on a canvas: `shipment_cases.workflow_step_id`
       * is a real FK to it and `stage` holds that same UUID, so a step's
       * identity *is* a live consignment's position.
       *
       * This handler used to delete every step and re-insert it with a fresh
       * crypto.randomUUID(). On a workflow governing any shipment the DELETE
       * hit that FK and the whole save failed — editing a workflow in use was
       * impossible. On an empty one it "worked" but silently re-issued every
       * step id, so step identity never survived a save.
       *
       * Instead: keep the ids that already belong to this workflow, mint one
       * only for a genuinely new step, and remove only the steps the user
       * actually deleted.
       */
      let plan: {
        idMap: Map<string, string>;
        removed: string[];
        existingIds: Set<string>;
      } | null = null;

      if (input.steps !== undefined) {
        const existingRows = await trx.selectFrom('workflow_steps').select(['id', 'name'])
          .where('workflow_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
        const existingIds = new Set(existingRows.map((r) => r.id));

        // An incoming id counts as existing only if it is already a step of
        // THIS workflow under THIS tenant. A client-supplied UUID from
        // anywhere else is treated as a new step, never adopted — otherwise a
        // valid-looking id would let one workflow reach into another's steps.
        const idMap = new Map<string, string>();
        for (const s of input.steps) {
          idMap.set(s.id, existingIds.has(s.id) ? s.id : crypto.randomUUID());
        }
        const kept = new Set([...idMap.values()].filter((v) => existingIds.has(v)));
        const removed = [...existingIds].filter((x) => !kept.has(x));

        if (removed.length > 0) {
          const stranded = await trx.selectFrom('shipment_cases')
            .select('workflow_step_id')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .where('tenant_id', '=', user.tenant_id)
            .where('workflow_id', '=', id)
            .where('workflow_step_id', 'in', removed)
            .groupBy('workflow_step_id')
            .execute();

          if (stranded.length > 0) {
            // Refuse the whole save rather than move someone's consignment
            // somewhere they did not choose. Name the steps and the counts so
            // the answer to "which ones?" is in the message itself.
            const nameOf = new Map(existingRows.map((r) => [r.id, r.name]));
            const detail = stranded
              .map((r) => `${nameOf.get(r.workflow_step_id as string) ?? 'a step'} (${r.n})`)
              .join(', ');
            return reply.status(409).send({
              error: `Cannot delete a step that shipments are still sitting on: ${detail}. Move those shipments to another step first.`,
              steps: stranded.map((r) => ({
                stepId: r.workflow_step_id,
                name: nameOf.get(r.workflow_step_id as string) ?? null,
                shipments: Number(r.n),
              })),
            });
          }
        }

        plan = { idMap, removed, existingIds };
      }

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

      if (input.steps !== undefined && plan) {
        const { idMap, removed, existingIds } = plan;

        // Proven unreferenced by the check above. This also drops any pending
        // workflow_comm_queue rows for the step (ON DELETE CASCADE), which is
        // right: a delayed "you are now at X" must not fire for a step that
        // no longer exists.
        if (removed.length > 0) {
          await trx.deleteFrom('workflow_steps')
            .where('id', 'in', removed).where('tenant_id', '=', user.tenant_id).execute();
        }

        const removedSet = new Set(removed);
        for (const step of input.steps) {
          const stepId = idMap.get(step.id)!;
          const values = {
            name: step.name,
            description: step.description || '',
            step_order: step.order,
            is_start: step.isStart,
            is_terminal: step.isTerminal,
            // Drop edges pointing at a step that is gone, so a deletion can
            // never leave a transition target that resolves to nothing.
            next_step_ids: JSON.stringify(
              step.nextStepIds.map((nid) => idMap.get(nid) ?? nid).filter((nid) => !removedSet.has(nid)),
            ),
            entry_conditions: JSON.stringify(step.entryConditions),
            auto_comms: JSON.stringify(step.autoComms),
            sla_hours: step.slaHours ?? null,
            color: step.color || '#0d9488',
            updated_at: now,
          };

          if (existingIds.has(stepId)) {
            await trx.updateTable('workflow_steps').set(values)
              .where('id', '=', stepId).where('tenant_id', '=', user.tenant_id).execute();
          } else {
            await trx.insertInto('workflow_steps')
              .values({ id: stepId, tenant_id: user.tenant_id, workflow_id: id, created_at: now, ...values })
              .execute();
          }
        }
      }

      const workflow = await loadWorkflowWithSteps(trx, user.tenant_id, id);
      return workflow;
    });
  });

  /** DELETE /v1/workflows/:id — soft delete; refuses if a live (non-terminal) shipment still uses it. */
  /**
   * GET /v1/workflows/:id/usage — what is actually live on this workflow.
   *
   * The blind spot in designing a clearance workflow is that its steps are not
   * a diagram: `shipment_cases.workflow_step_id` points at them, so reordering
   * or deleting a step moves or strands real consignments. The builder could
   * only warn about this at the moment of deletion, and only as a flat refusal.
   * This lets it show, per step, how many shipments are sitting there right
   * now — before anything is changed.
   */
  fastify.get('/:id/usage', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const wf = await trx.selectFrom('workflows').select('id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!wf) return reply.status(404).send({ error: 'Workflow not found' });

      const [byStep, total] = await Promise.all([
        trx.selectFrom('shipment_cases')
          .select(['workflow_step_id'])
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('workflow_id', '=', id)
          .where('tenant_id', '=', user.tenant_id)
          .groupBy('workflow_step_id')
          .execute(),
        trx.selectFrom('shipment_cases')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('workflow_id', '=', id)
          .where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst(),
      ]);

      return {
        totalShipments: Number(total?.n ?? 0),
        byStep: Object.fromEntries(
          byStep.filter((r) => r.workflow_step_id).map((r) => [r.workflow_step_id as string, Number(r.n)]),
        ),
      };
    });
  });

  /**
   * GET /v1/workflows/:id/runs — what this workflow actually did.
   *
   * Studio has had this since it shipped; clearance never did, so a customer
   * email that failed to send left no trace anyone could find. See migration
   * 168 and workflow-runs.service.ts.
   */
  fastify.get('/:id/runs', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { limit, status } = request.query as { limit?: string; status?: string };
    const take = Math.min(Math.max(Number(limit) || 25, 1), 200);

    return withTenant(user.tenant_id, async (trx) => {
      const wf = await trx.selectFrom('workflows').select('id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!wf) return reply.status(404).send({ error: 'Workflow not found' });

      let q = trx.selectFrom('workflow_step_runs')
        .leftJoin('shipment_cases', 'shipment_cases.id', 'workflow_step_runs.shipment_id')
        .leftJoin('users', 'users.id', 'workflow_step_runs.actor_id')
        .select([
          'workflow_step_runs.id', 'workflow_step_runs.shipment_id', 'workflow_step_runs.from_step_id',
          'workflow_step_runs.to_step_id', 'workflow_step_runs.to_step_name', 'workflow_step_runs.status',
          'workflow_step_runs.conditions', 'workflow_step_runs.comms', 'workflow_step_runs.error_message',
          'workflow_step_runs.duration_ms', 'workflow_step_runs.simulated', 'workflow_step_runs.created_at',
          'shipment_cases.ref_number as ref_number', 'users.name as actor_name',
        ])
        .where('workflow_step_runs.tenant_id', '=', user.tenant_id)
        .where('workflow_step_runs.workflow_id', '=', id)
        .orderBy('workflow_step_runs.created_at', 'desc')
        .limit(take);

      if (status) q = q.where('workflow_step_runs.status', '=', status);

      const rows = await q.execute();

      // Counts are over the whole history, not the page — a "3 problems"
      // badge that silently meant "3 in the last 25" would be worse than none.
      const tally = await trx.selectFrom('workflow_step_runs')
        .select(['status']).select((eb) => eb.fn.countAll<string>().as('n'))
        .where('tenant_id', '=', user.tenant_id).where('workflow_id', '=', id)
        .groupBy('status').execute();

      return {
        data: rows.map((r) => ({
          id: r.id,
          shipmentId: r.shipment_id,
          refNumber: r.ref_number ?? null,
          fromStepId: r.from_step_id,
          toStepId: r.to_step_id,
          toStepName: r.to_step_name,
          status: r.status,
          conditions: parseJson(r.conditions, [] as any[]),
          comms: parseJson(r.comms, [] as any[]),
          errorMessage: r.error_message,
          durationMs: r.duration_ms,
          simulated: r.simulated,
          actorName: r.actor_name ?? null,
          createdAt: new Date(r.created_at).toISOString(),
        })),
        counts: Object.fromEntries(tally.map((t) => [t.status, Number(t.n)])),
      };
    });
  });

  /**
   * POST /v1/workflows/:id/dry-run — rehearse without moving or sending.
   *
   * Two things it checks, and one it deliberately does not:
   *  - structure: unreachable steps, no start, no terminal — findable without
   *    any shipment at all;
   *  - reality, when given a real shipmentId: every step's entry conditions
   *    evaluated against that shipment's actual row and documents, and every
   *    auto-comm resolved through the same resolveComm() the live sender uses,
   *    so "would this actually reach the customer?" is answered from the same
   *    data rather than a hopeful guess.
   *  - it never sends anything, and never moves the shipment.
   */
  fastify.post('/:id/dry-run', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { shipmentId } = (request.body ?? {}) as { shipmentId?: string };
    const startedAt = Date.now();

    const loaded = await withTenant(user.tenant_id, async (trx) => {
      const workflow = await loadWorkflowWithSteps(trx, user.tenant_id, id);
      if (!workflow) return null;

      // Tenant-scoped on purpose: a valid-looking shipment id from another
      // tenant must not become a way to read that tenant's data back out.
      let shipment: any = null;
      let documents: { type: string; status: string }[] = [];
      if (shipmentId) {
        shipment = await trx.selectFrom('shipment_cases').selectAll()
          .where('id', '=', shipmentId).where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst() ?? null;
        if (shipment) {
          documents = await trx.selectFrom('case_documents').select(['type', 'status'])
            .where('shipment_id', '=', shipmentId).where('tenant_id', '=', user.tenant_id).execute();
        }
      }

      const settingsRow = await trx.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return { workflow, shipment, documents, settingsRow };
    });

    if (!loaded) return reply.status(404).send({ error: 'Workflow not found' });
    const { workflow, shipment, documents, settingsRow } = loaded;

    if (shipmentId && !shipment) {
      return reply.status(404).send({ error: 'Shipment not found in this workspace.' });
    }

    const settings = settingsRow?.settings
      ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
      : {};
    const hasWebhook = !!settings?.workflow_webhook_url;

    // ── structure ───────────────────────────────────────────────────────────
    const issues: { level: 'error' | 'warning'; message: string; stepId?: string }[] = [];
    const steps = workflow.steps;
    const starts = steps.filter((s) => s.isStart);
    if (starts.length === 0) issues.push({ level: 'error', message: 'No start step — nothing would ever enter this workflow.' });
    if (starts.length > 1) issues.push({ level: 'warning', message: `${starts.length} steps are marked as the start; the lowest-ordered one wins.` });

    const reachable = new Set<string>();
    const queue = starts.length ? starts.map((s) => s.id) : steps.length ? [steps[0].id] : [];
    while (queue.length) {
      const cur = queue.shift()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      const st = steps.find((s) => s.id === cur);
      for (const n of st?.nextStepIds ?? []) if (!reachable.has(n)) queue.push(n);
    }
    for (const s of steps) {
      if (!reachable.has(s.id)) issues.push({ level: 'error', message: `"${s.name}" cannot be reached from the start.`, stepId: s.id });
    }
    const terminals = steps.filter((s) => s.nextStepIds.length === 0);
    if (terminals.length === 0) issues.push({ level: 'error', message: 'No step ends the workflow — a shipment could never be completed.' });
    for (const s of steps) {
      for (const n of s.nextStepIds) {
        if (!steps.some((x) => x.id === n)) issues.push({ level: 'error', message: `"${s.name}" points at a step that no longer exists.`, stepId: s.id });
      }
    }

    // ── per-step, against the real shipment when one was given ──────────────
    const stepReports = [] as any[];
    for (const step of steps) {
      const conditions = shipment
        ? evaluateEntryConditions(shipment, documents, step.entryConditions).outcomes
        : step.entryConditions.map((c) => ({
            label: c.label || `"${c.field}" ${c.operator}`, field: c.field, operator: c.operator, passed: null,
          }));

      const comms = [] as any[];
      for (const comm of step.autoComms) {
        const base = { commId: comm.id, channel: comm.channel, recipient: comm.recipient, delayMinutes: comm.delayMinutes ?? 0 };
        if (comm.channel === 'sms') {
          // Stated plainly rather than shown as a green tick that never fires.
          comms.push({ ...base, wouldReach: false, detail: 'No SMS provider is integrated — this comm is logged, never sent.' });
          continue;
        }
        if (comm.channel === 'webhook') {
          comms.push({ ...base, wouldReach: hasWebhook, detail: hasWebhook ? 'Tenant webhook URL is configured.' : 'No workflow_webhook_url configured for this workspace.' });
          continue;
        }
        if (!shipment) {
          comms.push({ ...base, wouldReach: null, detail: 'Pick a shipment to check whether this would reach anyone.' });
          continue;
        }
        const r = await resolveComm(user.tenant_id, shipment.id, comm, step.name);
        if (!r) { comms.push({ ...base, wouldReach: false, detail: 'Shipment could not be loaded.' }); continue; }
        if (comm.channel === 'email') {
          comms.push({ ...base, wouldReach: !!r.toEmail, detail: r.toEmail ? `Would email ${r.toEmail}` : 'No email address on file for this recipient.', subject: r.subject });
        } else if (comm.channel === 'whatsapp') {
          comms.push({ ...base, wouldReach: !!r.toPhone, detail: r.toPhone ? `Would WhatsApp ${r.toPhone}` : 'No phone number on file for this recipient.' });
        } else if (comm.channel === 'system_notification') {
          comms.push({ ...base, wouldReach: !!r.toUserId, detail: r.toUserId ? 'Would notify them in-app.' : 'In-app notifications only reach staff (assigned agent or manager), not customers.' });
        } else {
          comms.push({ ...base, wouldReach: false, detail: `Unknown channel: ${comm.channel}` });
        }
      }

      stepReports.push({
        stepId: step.id, name: step.name, order: step.order,
        isStart: step.isStart, isTerminal: step.nextStepIds.length === 0,
        reachable: reachable.has(step.id),
        slaHours: step.slaHours ?? null,
        conditions, comms,
      });
    }

    const blockedSteps = stepReports.filter((s) => s.conditions.some((c: any) => c.passed === false));
    const unreachableComms = stepReports.flatMap((s) => s.comms.filter((c: any) => c.wouldReach === false));

    // Journalled like any other run, flagged simulated so it can never be
    // mistaken for something that actually moved a shipment.
    await recordRun(user.tenant_id, {
      workflowId: workflow.id,
      shipmentId: shipment?.id ?? '00000000-0000-0000-0000-000000000000',
      fromStepId: null,
      toStepId: 'DRY_RUN',
      toStepName: shipment ? `Dry run against ${shipment.ref_number}` : 'Dry run (structure only)',
      actorId: user.sub,
      status: 'SIMULATED',
      errorMessage: issues.some((i) => i.level === 'error') ? issues.find((i) => i.level === 'error')!.message : null,
      durationMs: Date.now() - startedAt,
      simulated: true,
    });

    return {
      workflow: { id: workflow.id, name: workflow.name },
      shipment: shipment ? { id: shipment.id, refNumber: shipment.ref_number, stage: shipment.stage } : null,
      issues,
      steps: stepReports,
      summary: {
        stepCount: steps.length,
        errors: issues.filter((i) => i.level === 'error').length,
        warnings: issues.filter((i) => i.level === 'warning').length,
        stepsBlockedForThisShipment: shipment ? blockedSteps.length : null,
        commsThatWouldNotReachAnyone: unreachableComms.length,
      },
    };
  });

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
