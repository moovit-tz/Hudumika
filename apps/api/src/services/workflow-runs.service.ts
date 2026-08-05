import { withTenant } from '../db/client.js';
import type { ConditionOutcome } from './workflow-resolver.service.js';

/**
 * Run history for clearance workflows — the capability borrowed from Studio,
 * which has recorded every automation run since migration 155 while clearance
 * recorded none.
 *
 * `stage_history` already answers "where did this shipment go, and when".
 * Nothing answered "what did the automation do getting it there" — and in
 * particular, dispatchAutoComms called sendOneComm fire-and-forget and dropped
 * its {success:false, error} return, so a customer email that never sent was
 * invisible to the operator, the manager and the workflow's author alike.
 * That is the gap these rows close.
 */

export type RunStatus = 'SUCCESS' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'SIMULATED';

export interface CommOutcome {
  commId: string;
  channel: string;
  recipient: string;
  /**
   * QUEUED    a delayed comm accepted onto workflow_comm_queue, not yet due.
   * CANCELLED the shipment left the step before the delay elapsed, so it was
   *           deliberately never sent — not a failure, and not a success.
   */
  status: 'SENT' | 'FAILED' | 'QUEUED' | 'CANCELLED';
  error?: string;
  delayMinutes?: number;
}

export interface RunInput {
  workflowId: string | null;
  shipmentId: string;
  fromStepId: string | null;
  toStepId: string;
  toStepName: string;
  actorId: string | null;
  status: RunStatus;
  conditions?: ConditionOutcome[];
  comms?: CommOutcome[];
  errorMessage?: string | null;
  durationMs?: number;
  simulated?: boolean;
}

/**
 * Writes one run row. Returns its id, or null if writing failed.
 *
 * Never throws: a transition that really happened must not be reported as
 * failed because we could not journal it. The caller checks for null only to
 * decide whether a later comm-outcome update has anything to attach to.
 */
export async function recordRun(tenantId: string, input: RunInput): Promise<string | null> {
  try {
    return await withTenant(tenantId, async (trx) => {
      const row = await trx
        .insertInto('workflow_step_runs')
        .values({
          tenant_id: tenantId,
          workflow_id: input.workflowId,
          shipment_id: input.shipmentId,
          from_step_id: input.fromStepId,
          to_step_id: input.toStepId,
          to_step_name: input.toStepName,
          actor_id: input.actorId,
          status: input.status,
          conditions: JSON.stringify(input.conditions ?? []),
          comms: JSON.stringify(input.comms ?? []),
          error_message: input.errorMessage ?? null,
          duration_ms: Math.max(0, Math.round(input.durationMs ?? 0)),
          simulated: input.simulated ?? false,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    });
  } catch (err: any) {
    console.error(`[WorkflowRuns] could not record run for shipment ${input.shipmentId}:`, err.message);
    return null;
  }
}

/**
 * Replaces a single QUEUED comm with what it eventually did.
 *
 * A delayed comm is recorded as QUEUED at transition time and only sent later
 * by workflow-comm.job.ts. Without this the run would read QUEUED forever —
 * optimistic, and wrong in precisely the case the journal exists to catch.
 */
export async function settleQueuedComm(
  tenantId: string,
  runId: string,
  commId: string,
  outcome: { status: 'SENT' | 'FAILED' | 'CANCELLED'; error?: string },
): Promise<void> {
  try {
    await withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('workflow_step_runs').select(['status', 'comms'])
        .where('id', '=', runId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!row) return;

      const comms: CommOutcome[] = typeof row.comms === 'string' ? JSON.parse(row.comms) : (row.comms as any) ?? [];
      const idx = comms.findIndex((x) => x.commId === commId);
      if (idx === -1) return;

      comms[idx] = {
        ...comms[idx],
        status: outcome.status,
        ...(outcome.status === 'FAILED' ? { error: outcome.error ?? 'Unknown error' } : { error: undefined }),
      };

      // A delayed message that failed downgrades the run exactly like an
      // immediate one does. Anything already worse than SUCCESS stays as it is.
      const status = row.status === 'SUCCESS' && comms.some((x) => x.status === 'FAILED') ? 'PARTIAL' : row.status;

      await trx.updateTable('workflow_step_runs')
        .set({ comms: JSON.stringify(comms), status })
        .where('id', '=', runId).where('tenant_id', '=', tenantId).execute();
    });
  } catch (err: any) {
    console.error(`[WorkflowRuns] could not settle queued comm ${commId} on run ${runId}:`, err.message);
  }
}

/**
 * Fills in what the comms actually did, once the detached sends have settled.
 *
 * A run that moved the shipment but failed to notify anyone is recorded as
 * PARTIAL, not SUCCESS — the whole point is that this stops being silent.
 * A comm still on the delayed queue is left QUEUED here and settled later by
 * settleQueuedComm when the job actually sends it.
 */
export async function attachCommOutcomes(tenantId: string, runId: string, comms: CommOutcome[]): Promise<void> {
  try {
    await withTenant(tenantId, async (trx) => {
      const existing = await trx.selectFrom('workflow_step_runs').select('status')
        .where('id', '=', runId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!existing) return;

      const anyFailed = comms.some((c) => c.status === 'FAILED');
      const status = existing.status === 'SUCCESS' && anyFailed ? 'PARTIAL' : existing.status;

      await trx.updateTable('workflow_step_runs')
        .set({ comms: JSON.stringify(comms), status })
        .where('id', '=', runId).where('tenant_id', '=', tenantId).execute();
    });
  } catch (err: any) {
    console.error(`[WorkflowRuns] could not attach comm outcomes to run ${runId}:`, err.message);
  }
}
