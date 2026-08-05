import { db } from '../db/client.js';
import { sendOneComm } from '../services/workflow-comms.service.js';
import { settleQueuedComm } from '../services/workflow-runs.service.js';

/**
 * Fires due delayed workflow-step auto-comms (AutoComm.delayMinutes > 0),
 * queued by workflow.service.ts's transitionStage into workflow_comm_queue.
 */
export async function runWorkflowCommQueueJob(): Promise<void> {
  console.log('⏳ Running background job: Workflow Comm Queue...');
  try {
    const due = await db
      .selectFrom('workflow_comm_queue')
      .selectAll()
      .where('status', '=', 'PENDING')
      .where('fire_at', '<=', new Date())
      .execute();

    if (due.length === 0) return;
    console.log(`📨 Found ${due.length} due workflow comm(s) to send.`);

    /** Marks a queued row cancelled and tells its run, so neither is left reading PENDING/QUEUED. */
    const cancel = async (row: typeof due[number], reason?: string) => {
      await db.updateTable('workflow_comm_queue')
        .set({ status: 'CANCELLED', ...(reason ? { error: reason } : {}) })
        .where('id', '=', row.id).execute();
      if (row.run_id) {
        await settleQueuedComm(row.tenant_id, row.run_id, row.auto_comm_id, { status: 'CANCELLED' });
      }
    };

    for (const row of due) {
      try {
        const shipment = await db
          .selectFrom('shipment_cases')
          .select(['workflow_step_id'])
          .where('id', '=', row.shipment_id)
          .executeTakeFirst();

        // The shipment moved off this step before the delay elapsed — the
        // transition engine cancels these proactively, but this is a
        // belt-and-suspenders check in case a row slipped through.
        if (!shipment || shipment.workflow_step_id !== row.workflow_step_id) {
          await cancel(row, 'Shipment left this step before the delay elapsed');
          continue;
        }

        const step = await db
          .selectFrom('workflow_steps')
          .select(['name', 'auto_comms'])
          .where('id', '=', row.workflow_step_id)
          .executeTakeFirst();
        if (!step) {
          await cancel(row, 'Step no longer exists');
          continue;
        }

        const autoComms = typeof step.auto_comms === 'string' ? JSON.parse(step.auto_comms) : (step.auto_comms ?? []);
        const comm = autoComms.find((c: any) => c.id === row.auto_comm_id);
        if (!comm) {
          await cancel(row, 'AutoComm no longer exists on step');
          continue;
        }

        const result = await sendOneComm(row.tenant_id, row.shipment_id, comm, step.name);
        await db.updateTable('workflow_comm_queue')
          .set({ status: result.success ? 'SENT' : 'FAILED', error: result.error ?? null, sent_at: new Date() })
          .where('id', '=', row.id).execute();

        // Write the outcome back onto the transition that queued it, so a
        // delayed message that failed downgrades that run to PARTIAL rather
        // than leaving it reading QUEUED forever.
        if (row.run_id) {
          await settleQueuedComm(row.tenant_id, row.run_id, row.auto_comm_id, {
            status: result.success ? 'SENT' : 'FAILED',
            error: result.error,
          });
        }
      } catch (err: any) {
        console.error(`❌ Failed to send queued workflow comm ${row.id}:`, err);
        await db.updateTable('workflow_comm_queue').set({ status: 'FAILED', error: err.message }).where('id', '=', row.id).execute().catch(() => {});
      }
    }
    console.log('✅ Workflow Comm Queue job completed.');
  } catch (error) {
    console.error('❌ Workflow Comm Queue job failed:', error);
  }
}
