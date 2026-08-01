import { registerSubscriber } from '../services/domain-events.service.js';
import { withTenant } from '../db/client.js';
import { TRIGGERS } from '../studio/triggers.js';
import { executeAndRecord } from '../studio/executor.js';

/**
 * Connects the domain event bus to Studio.
 *
 * Rather than adding a wildcard to domain-events.service.ts, this registers one
 * handler per DOMAIN_EVENT entry in the trigger registry — so the bus keeps its
 * simple exact-match dispatch, and Studio can only ever react to events that
 * passed the registry's consistency check.
 *
 * Only ACTIVE workflows run. DRAFT and PAUSED are inert by design: migration
 * 157 moved 21 seeded workflows to DRAFT precisely so nothing claims to be
 * automating something it is not.
 */
for (const trigger of TRIGGERS) {
  if (trigger.kind !== 'DOMAIN_EVENT') continue;

  registerSubscriber(trigger.id, async (tenantId, event) => {
    const workflows = await withTenant(tenantId, trx => trx
      .selectFrom('workflow_studio_apps')
      .select(['id', 'name', 'trigger_event', 'nodes', 'edges'])
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'ACTIVE')
      .where('trigger_event', '=', trigger.id)
      .execute());

    for (const workflow of workflows) {
      try {
        const outcome = await executeAndRecord({
          tenantId,
          workflow,
          payload: event.payload,
          entityId: event.entityId,
          // Without this the same event redelivered would run the workflow
          // again — re-charging, re-ticketing, re-notifying.
          domainEventId: event.id ?? null,
          simulate: false,
          triggerSource: `event:${trigger.id}`,
        });
        if (outcome && outcome.status !== 'SUCCESS') {
          console.warn(`[Studio] workflow "${workflow.name}" finished ${outcome.status} (run ${outcome.runId})`);
        }
      } catch (err: any) {
        // One workflow's failure must not stop the others, and must never
        // fail the request that emitted the event.
        console.error(`[Studio] workflow "${workflow.name}" threw:`, err?.message ?? err);
      }
    }
  });
}
