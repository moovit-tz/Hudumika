import { withTenant } from '../db/client.js';
import { loadResolvedWorkflow, pickStartStep, evaluateEntryConditions } from './workflow-resolver.service.js';

/**
 * The workflow engine, generalized off the shipment.
 *
 * transitionStage (workflow.service.ts) drives a shipment through its workflow
 * using columns on shipment_cases — that path is untouched. This engine drives
 * ANY entity (a trip, a SEAL lot, anything future) through the SAME resolver and
 * the SAME entry-condition evaluator, storing the running position in
 * workflow_instances keyed by (entity_type, entity_id) instead of a shipment
 * column. The only thing the engine needs per entity type is a CONTEXT PROVIDER
 * that reads that entity's fields/documents, so a condition ("field X required",
 * "document Y verified") evaluates for a trip exactly as for a shipment.
 */

export interface EntityContext { fields: Record<string, any>; documents: { type: string; status: string }[]; }
export type EntityContextProvider = (trx: any, tenantId: string, entityId: string) => Promise<EntityContext | null>;

const providers = new Map<string, EntityContextProvider>();

/** Each app registers its own entity's provider once at boot (entity-providers.ts). */
export function registerEntityProvider(entityType: string, provider: EntityContextProvider): void {
  providers.set(entityType, provider);
}
export function registeredEntityTypes(): string[] { return [...providers.keys()]; }

async function contextFor(trx: any, tenantId: string, entityType: string, entityId: string): Promise<EntityContext> {
  const provider = providers.get(entityType);
  if (!provider) return { fields: {}, documents: [] };
  return (await provider(trx, tenantId, entityId)) ?? { fields: {}, documents: [] };
}

async function logEvent(trx: any, tenantId: string, instanceId: string, fromStepId: string | null, toStepId: string, toStepName: string, status: string, note: string | null, conditions: any[], actorId: string | null) {
  await trx.insertInto('workflow_instance_events').values({
    tenant_id: tenantId, instance_id: instanceId, from_step_id: fromStepId, to_step_id: toStepId,
    to_step_name: toStepName, status, note: note ?? null, conditions: JSON.stringify(conditions ?? []), actor_id: actorId, created_at: new Date(),
  }).execute();
}

export class WorkflowEngineService {
  /** Begin a workflow on an entity. workflowId must be a real custom workflow. */
  static async start(tenantId: string, args: { entityType: string; entityId: string; workflowId: string; actorId?: string | null }) {
    return withTenant(tenantId, async (trx) => {
      const existing = await trx.selectFrom('workflow_instances').selectAll()
        .where('tenant_id', '=', tenantId).where('entity_type', '=', args.entityType).where('entity_id', '=', args.entityId)
        .executeTakeFirst();
      if (existing) return { ...existing, alreadyStarted: true };

      const resolved = await loadResolvedWorkflow(trx, tenantId, args.workflowId);
      if (resolved.kind !== 'CUSTOM' || resolved.steps.length === 0) throw new Error('A specific custom workflow with steps is required to start an instance.');
      const start = pickStartStep(resolved.steps);
      const now = new Date();
      const inst = await trx.insertInto('workflow_instances').values({
        tenant_id: tenantId, workflow_id: args.workflowId, entity_type: args.entityType, entity_id: args.entityId,
        current_step_id: start.id, status: 'active', started_at: now, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();
      await logEvent(trx, tenantId, inst.id, null, start.id, start.name, 'SUCCESS', 'Workflow started', [], args.actorId ?? null);
      return inst;
    });
  }

  /**
   * Advance an entity's instance to a target step — the generic mirror of
   * transitionStage: same forward/backward legality, same entry-condition gate,
   * same terminal handling. A blocked attempt is journalled and thrown.
   */
  static async advance(tenantId: string, args: { entityType: string; entityId: string; toStepId: string; actorId?: string | null; note?: string }) {
    // A BLOCKED attempt throws, which rolls back its transaction — so the block
    // is journalled AFTER, in its own transaction, or the record of why the
    // entity didn't move would vanish (the same rule transitionStage follows).
    // `any` on purpose: it is assigned inside the async callback below, which
    // TS's control-flow analysis can't see, so a precise type would narrow to
    // `never` at the catch-site read. The shape is fixed at the assignment.
    let blockJournal: any = null;
    try {
      return await withTenant(tenantId, async (trx) => {
        const inst = await trx.selectFrom('workflow_instances').selectAll()
          .where('tenant_id', '=', tenantId).where('entity_type', '=', args.entityType).where('entity_id', '=', args.entityId)
          .executeTakeFirst();
        if (!inst) throw new Error('No workflow is running on this entity.');

        const resolved = await loadResolvedWorkflow(trx, tenantId, inst.workflow_id);
        const current = resolved.steps.find((s) => s.id === inst.current_step_id);
        const next = resolved.steps.find((s) => s.id === args.toStepId);
        if (!next) throw new Error(`Invalid target step: ${args.toStepId}`);

        if (current) {
          const forward = current.nextStepIds.includes(next.id);
          const backward = next.order < current.order;
          if (!forward && !backward) throw new Error(`"${next.name}" is not reachable from "${current.name}".`);
        }

        if (next.entryConditions.length > 0) {
          const ctx = await contextFor(trx, tenantId, args.entityType, args.entityId);
          const evalRes = evaluateEntryConditions(ctx.fields, ctx.documents, next.entryConditions);
          if (!evalRes.valid) {
            blockJournal = { instanceId: inst.id, fromStepId: current?.id ?? null, toStepId: next.id, toStepName: next.name, outcomes: evalRes.outcomes };
            const err: any = new Error(`Prerequisite not met: ${evalRes.failures.join(', ')}`);
            err.workflowBlocked = true;
            throw err;
          }
        }

        const now = new Date();
        await trx.updateTable('workflow_instances').set({
          current_step_id: next.id, status: next.isTerminal ? 'done' : 'active',
          resolved_at: next.isTerminal ? now : null, updated_at: now,
        }).where('id', '=', inst.id).execute();
        await logEvent(trx, tenantId, inst.id, current?.id ?? null, next.id, next.name, 'SUCCESS', args.note ?? null, [], args.actorId ?? null);

        return { success: true, stepId: next.id, stepName: next.name, isTerminal: next.isTerminal };
      });
    } catch (err) {
      const j = blockJournal;
      if (j) {
        await withTenant(tenantId, (trx) => logEvent(trx, tenantId, j.instanceId, j.fromStepId, j.toStepId, j.toStepName, 'BLOCKED', args.note ?? null, j.outcomes, args.actorId ?? null))
          .catch((e) => console.error('[WorkflowEngine] failed to journal blocked attempt:', e.message));
      }
      throw err;
    }
  }

  /** Current state + every step with its live requirement checklist for this entity. */
  static async getState(tenantId: string, entityType: string, entityId: string) {
    return withTenant(tenantId, async (trx) => {
      const inst = await trx.selectFrom('workflow_instances').selectAll()
        .where('tenant_id', '=', tenantId).where('entity_type', '=', entityType).where('entity_id', '=', entityId)
        .executeTakeFirst();
      if (!inst) return null;
      const resolved = await loadResolvedWorkflow(trx, tenantId, inst.workflow_id);
      const ctx = await contextFor(trx, tenantId, entityType, entityId);
      return {
        instanceId: inst.id, workflowId: inst.workflow_id, entityType, entityId,
        currentStepId: inst.current_step_id, status: inst.status,
        resolvedAt: inst.resolved_at ? new Date(inst.resolved_at).toISOString() : null,
        steps: resolved.steps.slice().sort((a, b) => a.order - b.order).map((s) => ({
          id: s.id, name: s.name, order: s.order, isTerminal: s.isTerminal, nextStepIds: s.nextStepIds,
          requirements: evaluateEntryConditions(ctx.fields, ctx.documents, s.entryConditions).outcomes,
        })),
      };
    });
  }
}
