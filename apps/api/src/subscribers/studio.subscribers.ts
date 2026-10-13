import type { DomainEvent } from '../services/domain-events.service.js';
import { withTenant } from '../db/client.js';
import { TRIGGERS } from '../studio/triggers.js';
import { executeAndRecord } from '../studio/executor.js';
import { triggerMatches, hasAnyTrigger, type TargetingContext } from '../services/workflow-resolver.service.js';
import { tenantHasEntitlement } from '../middleware/entitlement.js';

/** Freight mode as clearance's targeting names it, from shipment_cases.type. */
const FREIGHT_MODE: Record<string, string> = {
  AIR: 'air', SEA_FCL: 'sea', SEA_LCL: 'sea', BULK: 'sea', ROAD: 'road', RAIL: 'rail',
};

function parseTargeting(val: unknown): any {
  if (val == null) return {};
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return {}; } }
  return val;
}

/**
 * Builds the targeting context from the shipment an event is about.
 *
 * Returns null when the event's entity is not a shipment of this tenant —
 * which is the honest answer for, say, an invoice event, and is what makes a
 * targeted automation skip rather than fire unrestricted. Tenant-scoped, so a
 * valid-looking id from elsewhere resolves to nothing.
 */
async function shipmentTargetingContext(tenantId: string, entityId: string | null | undefined): Promise<TargetingContext | null> {
  if (!entityId) return null;
  try {
    const s = await withTenant(tenantId, trx => trx
      .selectFrom('shipment_cases')
      .select(['type', 'consignment_type', 'customer_id', 'origin_port', 'dest_port'])
      .where('id', '=', entityId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (!s) return null;
    return {
      freightMode: FREIGHT_MODE[s.type] ?? 'sea',
      consignmentType: s.consignment_type ?? '',
      customerId: s.customer_id ?? '',
      originCountry: (s.origin_port || '').slice(0, 2).toUpperCase(),
      destCountry: (s.dest_port || '').slice(0, 2).toUpperCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Connects the domain event bus to Studio.
 *
 * The outbox worker calls this only after the originating event commits.
 * Studio no longer subscribes to pre-commit in-process dispatch.
 *
 * Only ACTIVE workflows run. DRAFT and PAUSED are inert by design: migration
 * 157 moved 21 seeded workflows to DRAFT precisely so nothing claims to be
 * automating something it is not.
 */
export async function deliverStudioEvent(tenantId: string, event: DomainEvent, snapshots: unknown): Promise<void> {
    if (!await tenantHasEntitlement(tenantId, 'studio')) return;
    const trigger = TRIGGERS.find(candidate => candidate.id === event.type && candidate.kind === 'DOMAIN_EVENT');
    if (!trigger) return;
    let deliveryFailed = false;
    if (!Array.isArray(snapshots) || snapshots.some(w => !w || w.tenant_id !== tenantId || w.trigger_event !== event.type || typeof w.id !== 'string')) {
      throw new Error('Invalid queued workflow snapshots');
    }
    // Pause stops queued work; edits cannot change an already queued graph.
    const active = await withTenant(tenantId, trx => trx.selectFrom('workflow_studio_apps').select('id')
      .where('tenant_id', '=', tenantId).where('status', '=', 'ACTIVE').execute());
    const activeIds = new Set(active.map(w => w.id));
    const all = snapshots.filter(w => activeIds.has(w.id));

    // Targeting (migration 168) narrows an automation beyond "which event" to
    // "which shipments" — the capability borrowed from clearance workflows.
    // An automation with no targeting is unrestricted, so every automation
    // that existed before this shipped behaves exactly as it did.
    const targeted = all.filter((w) => hasAnyTrigger(parseTargeting(w.targeting)));
    let ctx: TargetingContext | null = null;
    if (targeted.length > 0) ctx = await shipmentTargetingContext(tenantId, event.entityId);

    const workflows = all.filter((w) => {
      const t = parseTargeting(w.targeting);
      if (!hasAnyTrigger(t)) return true;
      if (!ctx) {
        // The author narrowed this to particular shipments, and this event
        // carries none we can identify. Running it anyway would ignore the
        // restriction they set, so it is skipped and said out loud.
        console.warn(`[Studio] "${w.name}" is targeted at specific shipments but ${trigger.id} carried no identifiable shipment — skipped.`);
        return false;
      }
      return triggerMatches(t, ctx);
    });

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
        deliveryFailed = true;
      }
    }
    if (deliveryFailed) throw new Error('Studio event delivery did not finish');
}
