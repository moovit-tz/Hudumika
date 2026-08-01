import { withTenant } from '../db/client.js';
import type { DomainEvent } from '../services/domain-events.service.js';

/**
 * Context resolvers — the answer to the question Phase 3 was designed to ask.
 *
 * Event payloads are deliberately thin. `shipment.sla_breach` carries only
 * `{ hoursExceeded, stage }`, but every real consumer needs the shipment's
 * reference number, customer and assignee. The five hardcoded subscribers each
 * solved that by querying `shipment_cases` themselves.
 *
 * A tenant-authored workflow cannot do that, which left three options:
 *
 *   1. Fatten every event payload — makes each emitter responsible for
 *      anticipating every future consumer. Unbounded, and the emitter pays.
 *   2. Give Studio a "lookup" node — Studio becomes a query builder over every
 *      app's schema, coupled to all of them, with tenant-authored reads against
 *      arbitrary tables. This is the failure mode the whole plan is built to
 *      avoid.
 *   3. Let each trigger declare how to load its own standard context, owned by
 *      the app that emits it.
 *
 * (3) is what this file is. Schema knowledge stays with the owning app, the
 * workflow author gets a stable documented shape (`{{shipment.refNumber}}`),
 * and Studio never learns what a `shipment_cases` row is.
 *
 * A resolver returns null for anything it cannot establish. It must never
 * substitute a plausible value — the duty amount below is the case that
 * matters, and the finance subscriber's own comment explains why.
 */

export type ContextResolver = (tenantId: string, event: Pick<DomainEvent, 'entityId' | 'payload'>) => Promise<Record<string, unknown>>;

const resolveShipment: ContextResolver = async (tenantId, event) => {
  if (!event.entityId) return {};
  const row = await withTenant(tenantId, trx => trx
    .selectFrom('shipment_cases')
    .select(['id', 'ref_number', 'customer_id', 'assigned_to', 'stage', 'type', 'goods_desc', 'free_time_end'])
    .where('id', '=', event.entityId!)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst());
  if (!row) return {};
  return {
    shipment: {
      id: row.id,
      refNumber: row.ref_number,
      customerId: row.customer_id,
      assignedTo: row.assigned_to,
      stage: row.stage,
      type: row.type,
      goodsDesc: row.goods_desc,
      freeTimeEnd: row.free_time_end ? new Date(row.free_time_end).toISOString() : null,
      // A display label, formatted here rather than in a template. The message
      // it feeds needs a date-or-"soon" fallback; the alternative was growing
      // filters and conditionals into the {{…}} syntax, and a template language
      // is a much bigger commitment than one app-owned label.
      freeTimeEndLabel: row.free_time_end ? new Date(row.free_time_end).toLocaleDateString() : 'soon',
    },
  };
};

const resolveDeclaration: ContextResolver = async (tenantId, event) => {
  const shipmentId = (event.payload?.shipmentId as string | undefined) ?? null;
  if (!event.entityId) return {};

  return withTenant(tenantId, async (trx) => {
    // The only trustworthy duty figure is a real recorded TRA assessment. The
    // Declaration tab's own duty/VAT fields are local estimates and are never
    // persisted, so when no notice exists this stays null and any workflow
    // depending on it is gated off rather than booking an invented amount.
    const notice = await trx.selectFrom('declaration_notices')
      .select(['paid_amount', 'total_tax_amount', 'bill_number'])
      .where('declaration_id', '=', event.entityId!)
      .where((eb) => eb.or([eb('paid_amount', 'is not', null), eb('total_tax_amount', 'is not', null)]))
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    const amount = notice ? Number(notice.paid_amount ?? notice.total_tax_amount) : NaN;

    const tancisRef = (event.payload?.tancisRef as string | undefined) ?? null;

    return {
      declaration: {
        id: event.entityId,
        shipmentId,
        tancisRef,
        dutyAmountTzs: Number.isFinite(amount) && amount > 0 ? amount : null,
        billNumber: notice?.bill_number ?? null,
        // Pre-resolved fallbacks, so wording stays editable in the workflow
        // while the "which value, and is there one at all" logic stays here.
        // The template syntax has no conditionals by design.
        ref: tancisRef ?? event.entityId,
        billSuffix: notice?.bill_number ? ` (bill ${notice.bill_number})` : '',
      },
    };
  });
};

/**
 * Collections, for forEach nodes.
 *
 * These deliberately live beside the single-record resolvers rather than in a
 * Studio "lookup" node, for the same reason: the query belongs to the app that
 * owns the table. Note the ownership split — `declaration.released` is a
 * ClearOS event, but the bonded lots it affects are SEAL's and the linked trips
 * are Tracking's. Each app contributes its own slice, which is why a trigger
 * maps to a LIST of resolvers rather than one.
 */
const resolveLinkedTrips: ContextResolver = async (tenantId, event) => {
  if (!event.entityId) return {};
  const trips = await withTenant(tenantId, trx => trx
    .selectFrom('trips')
    .select(['id', 'created_by'])
    .where('shipment_id', '=', event.entityId!)
    .where('job_type', '=', 'CLEARANCE_LINKED')
    .execute());
  // created_by is the dispatcher — drivers are not `users` rows, so there is no
  // driver inbox to address. Trips without one cannot be notified.
  return { trips: trips.filter(t => t.created_by).map(t => ({ id: t.id, dispatcherId: t.created_by })) };
};

const resolveSuspendedLots: ContextResolver = async (tenantId, event) => {
  const shipmentId = (event.payload?.shipmentId as string | undefined) ?? null;
  if (!shipmentId) return {};
  const lots = await withTenant(tenantId, trx => trx
    .selectFrom('seal_lots')
    .select(['id'])
    .where('shipment_case_id', '=', shipmentId)
    .where('customs_status', '=', 'FOREIGN_DUTY_SUSPENDED')
    .where('tenant_id', '=', tenantId)
    .execute());
  return { suspendedLots: lots.map(l => ({ id: l.id })) };
};

export const CONTEXT_RESOLVERS: Record<string, ContextResolver[]> = {
  'shipment.case_opened': [resolveShipment],
  'shipment.stage_advanced': [resolveShipment, resolveLinkedTrips],
  'shipment.sla_breach': [resolveShipment],
  'shipment.demurrage_risk': [resolveShipment],
  'declaration.released': [resolveDeclaration, resolveSuspendedLots],
};

/**
 * Shapes shown in the Studio field picker. Kept beside the resolvers so the two
 * cannot drift — an author must not be offered a field the resolver never sets.
 */
export const CONTEXT_SHAPES: Record<string, string[]> = {
  'shipment.case_opened':    ['shipment.refNumber', 'shipment.customerId', 'shipment.assignedTo', 'shipment.stage', 'shipment.type', 'shipment.goodsDesc'],
  'shipment.stage_advanced': ['shipment.refNumber', 'shipment.customerId', 'shipment.assignedTo', 'shipment.stage'],
  'shipment.sla_breach':     ['shipment.refNumber', 'shipment.customerId', 'shipment.assignedTo', 'shipment.stage'],
  'shipment.demurrage_risk': ['shipment.refNumber', 'shipment.customerId', 'shipment.assignedTo', 'shipment.freeTimeEnd'],
  'declaration.released':    ['declaration.shipmentId', 'declaration.tancisRef', 'declaration.dutyAmountTzs', 'declaration.billNumber'],
};

export async function resolveContext(triggerId: string, tenantId: string, event: Pick<DomainEvent, 'entityId' | 'payload'>): Promise<Record<string, unknown>> {
  const resolvers = CONTEXT_RESOLVERS[triggerId] ?? [];
  const merged: Record<string, unknown> = {};
  for (const resolver of resolvers) {
    try {
      Object.assign(merged, await resolver(tenantId, event));
    } catch (err: any) {
      // One app's resolver failing must not blank out another's slice — and it
      // must not be silent: the workflow will see missing fields and the run
      // log needs to be able to explain why.
      console.error(`[Studio] a context resolver for "${triggerId}" failed:`, err?.message ?? err);
    }
  }
  return merged;
}
