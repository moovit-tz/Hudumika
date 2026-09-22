import { dbPlatform, withTenant } from '../db/client.js';

/**
 * Milestone 3 of the agentic platform build (see
 * C:\Users\Viden\.claude\plans\ancient-bouncing-gem.md). Sweeps every
 * tenant's pending agent_approvals past their own expires_at and flips them
 * to 'expired' — same shape as sign-expiry.job.ts. Without this sweep, an
 * approval nobody ever opens (so the decision endpoint's own lazy-expiry
 * check in agent.routes.ts never runs) sits on 'pending' forever, and the
 * run it gates sits on 'awaiting_approval' forever with it. This job is what
 * actually resolves that: it expires the approval AND fails the run it was
 * blocking, so a stuck run doesn't silently outlive the approval that was
 * gating it.
 *
 * Naturally idempotent — the guarded UPDATE only ever touches an approval
 * still 'pending' with a past expires_at, so a decision recorded
 * concurrently with this sweep (via POST /v1/agent/approvals/:id/decision)
 * always wins the race rather than being clobbered by it.
 */
export async function runAgentApprovalExpiryJob(): Promise<void> {
  console.log('⏳ Running background job: Agent Approval Expiry...');
  try {
    const overdue = await dbPlatform
      .selectFrom('agent_approvals')
      .select(['id', 'tenant_id', 'run_id'])
      .where('status', '=', 'pending')
      .where('expires_at', '<', new Date())
      .execute();

    if (overdue.length === 0) {
      console.log('🤖 No expired agent approvals to sweep.');
      return;
    }

    let expired = 0;
    for (const approval of overdue) {
      await withTenant(approval.tenant_id, async (trx) => {
        const claimed = await trx.updateTable('agent_approvals').set({ status: 'expired' })
          .where('id', '=', approval.id).where('status', '=', 'pending').executeTakeFirst();
        if (Number(claimed.numUpdatedRows ?? 0) === 0) return; // a decision landed first
        await trx.updateTable('agent_runs').set({
          status: 'failed',
          error_message: 'The approval this run was waiting on expired before anyone decided it.',
          updated_at: new Date(), completed_at: new Date(),
        }).where('id', '=', approval.run_id).where('status', '=', 'awaiting_approval').execute();
      });
      expired++;
    }

    console.log(`✅ Agent Approval Expiry job completed — ${expired} approval(s) expired.`);
  } catch (error) {
    console.error('❌ Agent approval expiry job failed:', error);
  }
}
