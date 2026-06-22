import { withTenant } from '../db/client.js';
import { WORKFLOW_CONFIGS } from '../config/workflow.config.js';
import type { ClearanceStage } from '@clearos/types';

export class WorkflowService {
  /**
   * Transition a shipment case to a new stage, checking prerequisites and logging history
   */
  static async transitionStage(
    tenantId: string,
    shipmentId: string,
    nextStage: ClearanceStage,
    actorId: string,
    note?: string,
    blocker?: string
  ) {
    return withTenant(tenantId, async (trx) => {
      // 1. Get current shipment case
      const shipment = await trx
        .selectFrom('shipment_cases')
        .select(['id', 'stage'])
        .where('id', '=', shipmentId)
        .executeTakeFirst();

      if (!shipment) {
        throw new Error(`Shipment case not found: ${shipmentId}`);
      }

      const currentStage = shipment.stage;
      if (currentStage === nextStage) {
        return { success: true, message: 'Already in this stage', from: currentStage, to: nextStage };
      }

      // 2. Validate target stage exists
      const nextConfig = WORKFLOW_CONFIGS[nextStage];
      if (!nextConfig) {
        throw new Error(`Invalid target stage: ${nextStage}`);
      }

      // 3. Verify required documents are present and verified
      if (nextConfig.requiredDocuments.length > 0) {
        const documents = await trx
          .selectFrom('case_documents')
          .select(['type', 'status'])
          .where('shipment_id', '=', shipmentId)
          .where('type', 'in', nextConfig.requiredDocuments)
          .execute();

        for (const reqDoc of nextConfig.requiredDocuments) {
          const doc = documents.find((d) => d.type === reqDoc);
          if (!doc || doc.status !== 'VERIFIED') {
            throw new Error(`Prerequisite document "${reqDoc}" is missing or not VERIFIED.`);
          }
        }
      }

      const now = new Date();

      // 4. Update the active history log entry (exit it)
      const currentHistory = await trx
        .selectFrom('stage_history')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
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

      // 5. Create new stage history entry
      await trx
        .insertInto('stage_history')
        .values({
          tenant_id: tenantId,
          shipment_id: shipmentId,
          stage: nextStage,
          entered_at: now,
          actor_id: actorId,
          note: note || null,
          blocker: blocker || null,
        })
        .execute();

      // 6. Update the main shipment case stage
      // Also update ETA/SLA calculations based on the new stage SLA
      const slaDeadline = new Date(now.getTime() + nextConfig.slaHours * 60 * 60 * 1000);

      await trx
        .updateTable('shipment_cases')
        .set({
          stage: nextStage,
          sla_deadline: nextStage === 'CLOSED' ? null : slaDeadline,
          updated_at: now,
        })
        .where('id', '=', shipmentId)
        .execute();

      return {
        success: true,
        from: currentStage,
        to: nextStage,
        slaDeadline: nextStage === 'CLOSED' ? null : slaDeadline.toISOString(),
      };
    });
  }
}
