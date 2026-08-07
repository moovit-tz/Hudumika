import { withTenant } from '../db/client.js';
import { co2Service } from './co2.service.js';
import { loadResolvedWorkflow, evaluateEntryConditions, type ConditionOutcome } from './workflow-resolver.service.js';
import { dispatchAutoComms, cancelPendingComms } from './workflow-comms.service.js';
import { recordRun } from './workflow-runs.service.js';

const CO2_MODE_MAP: Record<string, 'AIR' | 'SEA' | 'ROAD' | 'RAIL'> = {
  AIR: 'AIR', SEA_FCL: 'SEA', SEA_LCL: 'SEA', BULK: 'SEA', ROAD: 'ROAD', RAIL: 'RAIL',
};

export class WorkflowService {
  /**
   * Transition a shipment case to a new step, checking entry conditions and
   * logging history. Works identically whether the shipment is on the
   * legacy fixed 18-stage system (nextStage is a ClearanceStage literal,
   * synthesized into the same step shape by workflow-resolver.service.ts)
   * or a tenant-defined custom workflow (nextStage is a workflow_steps.id).
   */
  static async transitionStage(
    tenantId: string,
    shipmentId: string,
    nextStage: string,
    actorId: string,
    note?: string,
    blocker?: string
  ) {
    type Co2Trigger = { type: string; origin_port: string; dest_port: string; gross_weight_kg: number };
    const co2TriggerBox: { current: Co2Trigger | null } = { current: null };
    const commsBox: { current: { stepId: string; stepName: string; comms: any[] } | null } = { current: null };
    let exitedStepId: string | null = null;

    // Journalling context. Collected inside the transaction but written after
    // it settles: a BLOCKED attempt throws, which would roll back a run row
    // inserted inside — and the whole value of a blocked run is that it
    // survives to explain why the shipment did not move.
    const t0 = Date.now();
    const journal: {
      workflowId: string | null;
      fromStepId: string | null;
      toStepId: string;
      toStepName: string;
      conditions: ConditionOutcome[];
    } = { workflowId: null, fromStepId: null, toStepId: nextStage, toStepName: nextStage, conditions: [] };

    let result: any;
    try {
      result = await withTenant(tenantId, async (trx) => {
        // 1. Get current shipment case
        const shipment = await trx
          .selectFrom('shipment_cases')
          .select(['id', 'stage', 'workflow_id', 'workflow_step_id', 'created_at', 'resolved_at', 'type', 'origin_port', 'dest_port', 'gross_weight_kg'])
          .where('id', '=', shipmentId).where('tenant_id', '=', tenantId)
          .executeTakeFirst();

        if (!shipment) {
          throw new Error(`Shipment case not found: ${shipmentId}`);
        }

        const currentStage = shipment.stage;
        if (currentStage === nextStage) {
          return { success: true, message: 'Already in this stage', from: currentStage, to: nextStage, noop: true };
        }

        journal.workflowId = shipment.workflow_id ?? null;
        journal.fromStepId = shipment.workflow_step_id ?? currentStage;

        // 2. Resolve the shipment's governing workflow (legacy or custom) and
        // find the current + target step within it.
        const resolved = await loadResolvedWorkflow(trx, tenantId, shipment.workflow_id);
        const currentStep = resolved.steps.find((s) => s.id === (shipment.workflow_step_id ?? shipment.stage));
        const nextStep = resolved.steps.find((s) => s.id === nextStage);

        if (!nextStep) {
          throw new Error(`Invalid target stage: ${nextStage}`);
        }
        journal.toStepId = nextStep.id;
        journal.toStepName = nextStep.name;

        // 3. Transition legality: forward moves must be an allowed next step;
        // backward moves to any earlier step in the same workflow stay
        // permitted (re-validation), matching the old (never-enforced) intent.
        if (currentStep) {
          const isForwardAllowed = currentStep.nextStepIds.includes(nextStep.id);
          const isBackward = nextStep.order < currentStep.order;
          if (!isForwardAllowed && !isBackward) {
            throw new Error(`Stage transition not permitted: "${nextStep.name}" is not reachable from "${currentStep.name}".`);
          }
        }

        // 4. Verify entry conditions are met (generalizes the old
        // required-documents-only check; document: fields work identically)
        if (nextStep.entryConditions.length > 0) {
          const documents = await trx
            .selectFrom('case_documents')
            .select(['type', 'status'])
            .where('shipment_id', '=', shipmentId).where('tenant_id', '=', tenantId)
            .execute();

          const shipmentRow = await trx.selectFrom('shipment_cases').selectAll().where('id', '=', shipmentId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
          const evalResult = evaluateEntryConditions(shipmentRow as any, documents as any, nextStep.entryConditions);
          journal.conditions = evalResult.outcomes;
          if (!evalResult.valid) {
            // Tagged so the journal can distinguish "the workflow's own rules
            // stopped this" (BLOCKED — expected, actionable) from "something
            // broke" (FAILED). They read very differently to an operator.
            const err: any = new Error(`Prerequisite not met: ${evalResult.failures.join(', ')}`);
            err.workflowBlocked = true;
            throw err;
          }
        }

        const now = new Date();

        // 5. Update the active history log entry (exit it)
        const currentHistory = await trx
          .selectFrom('stage_history')
          .selectAll()
          .where('shipment_id', '=', shipmentId).where('tenant_id', '=', tenantId)
          .where('stage', '=', currentStage)
          .where('exited_at', 'is', null)
          .executeTakeFirst();

        if (currentHistory) {
          const enteredAtTime = new Date(currentHistory.entered_at).getTime();
          const durationHours = Math.max(0, (now.getTime() - enteredAtTime) / (1000 * 60 * 60));

          await trx
            .updateTable('stage_history')
            .set({
              exited_at: now,
              duration_h: parseFloat(durationHours.toFixed(2)),
            })
            .where('id', '=', currentHistory.id)
            .execute();
        }

        // 6. Create new stage history entry
        await trx
          .insertInto('stage_history')
          .values({
            tenant_id: tenantId,
            shipment_id: shipmentId,
            stage: nextStep.id,
            entered_at: now,
            actor_id: actorId,
            note: note || null,
            blocker: blocker || null,
          })
          .execute();

        // 7. Update the main shipment case stage
        const slaDeadline = new Date(now.getTime() + nextStep.slaHours * 60 * 60 * 1000);

        const updateFields: any = {
          stage: nextStep.id,
          workflow_step_id: nextStep.id,
          sla_deadline: nextStep.isTerminal ? null : slaDeadline,
          updated_at: now,
        };

        if (nextStep.isTerminal && !shipment.resolved_at) {
          updateFields.resolved_at = now;
          updateFields.resolution_time_seconds = Math.floor((now.getTime() - new Date(shipment.created_at).getTime()) / 1000);
        }

        await trx
          .updateTable('shipment_cases')
          .set(updateFields)
          .where('id', '=', shipmentId).where('tenant_id', '=', tenantId)
          .execute();

        if (nextStep.isTerminal && shipment.origin_port && shipment.dest_port && shipment.gross_weight_kg) {
          co2TriggerBox.current = {
            type: shipment.type,
            origin_port: shipment.origin_port,
            dest_port: shipment.dest_port,
            gross_weight_kg: shipment.gross_weight_kg,
          };
        }

        if (nextStep.autoComms.length > 0) {
          commsBox.current = { stepId: nextStep.id, stepName: nextStep.name, comms: nextStep.autoComms };
        }
        if (currentStep) exitedStepId = currentStep.id;

        return {
          success: true,
          from: currentStage,
          to: nextStep.id,
          slaDeadline: nextStep.isTerminal ? null : slaDeadline.toISOString(),
        };
      });
    } catch (err: any) {
      // The attempt is journalled whether or not it succeeded — a transition
      // that was refused is exactly the thing an operator needs a record of.
      await recordRun(tenantId, {
        workflowId: journal.workflowId,
        shipmentId,
        fromStepId: journal.fromStepId,
        toStepId: journal.toStepId,
        toStepName: journal.toStepName,
        actorId,
        status: err?.workflowBlocked ? 'BLOCKED' : 'FAILED',
        conditions: journal.conditions,
        errorMessage: err?.message ?? 'Unknown error',
        durationMs: Date.now() - t0,
      });
      throw err;
    }

    // CO2 auto-calc and automated comms run as detached side-effects after
    // the stage transition has committed — never block or fail the actual
    // transition.
    const co2Trigger = co2TriggerBox.current;
    if (co2Trigger) {
      co2Service.calculateForShipment(tenantId, shipmentId, {
        origin: co2Trigger.origin_port,
        destination: co2Trigger.dest_port,
        weight_kg: co2Trigger.gross_weight_kg,
        mode: CO2_MODE_MAP[co2Trigger.type] ?? 'SEA',
      }).catch(err => console.error(`[CO2] auto-calc failed for shipment ${shipmentId}:`, err.message));
    }

    if (exitedStepId) {
      cancelPendingComms(tenantId, shipmentId, exitedStepId).catch(err =>
        console.error(`[WorkflowComms] failed to cancel pending comms for shipment ${shipmentId}:`, err.message));
    }

    // A no-op ("already in this stage") is not a run — nothing happened.
    if (!result?.noop) {
      const runId = await recordRun(tenantId, {
        workflowId: journal.workflowId,
        shipmentId,
        fromStepId: journal.fromStepId,
        toStepId: journal.toStepId,
        toStepName: journal.toStepName,
        actorId,
        status: 'SUCCESS',
        conditions: journal.conditions,
        durationMs: Date.now() - t0,
      });

      const comms = commsBox.current;
      if (comms) {
        // Still detached — but now it reports back, so a send that fails
        // downgrades this run to PARTIAL instead of vanishing into a log line.
        dispatchAutoComms(tenantId, shipmentId, comms.stepId, comms.stepName, comms.comms, runId).catch(err =>
          console.error(`[WorkflowComms] dispatch failed for shipment ${shipmentId}:`, err.message));
      }
    }

    return result;
  }
}
