import { registerSubscriber } from '../services/domain-events.service.js';
import { isSupersededByStudio } from '../studio/supersession.js';
import { withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';
import { shipmentVariance } from '../services/intelligence.service.js';

/**
 * Closes the estimate → actual loop across ClearOS and FinOps.
 *
 * Everything else in this folder reacts to an app's own domain event. This one
 * reacts to the *comparison* between two apps: ClearOS produced an estimate,
 * FinOps recorded what was really spent, and the gap between them is the
 * signal that neither app can see alone.
 *
 * It only ever reports a gap it can actually compute. A head with an estimate
 * and no actual yet — the normal state mid-clearance — is not an overspend,
 * and saying so would train people to ignore the alert within a week.
 */

/** Below this the difference is rounding and rate-card drift, not a problem
 *  worth interrupting somebody for. */
const MATERIAL_PCT = 15;
/** …and it must also be worth more than this in absolute terms, so a head
 *  estimated at TZS 400 does not raise an alert for being 80% out. */
const MATERIAL_TZS = 100_000;

const HEAD_LABEL: Record<string, string> = {
  DUTY_TAXES: 'Duties & taxes', FREIGHT: 'Freight', INSURANCE: 'Insurance',
  TPA: 'Port & handling', ICD: 'ICD / destination', TBS: 'TBS',
  SHIPPING_LINE: 'Shipping line', CLEARANCE_AGENCY: 'Clearance & agency',
  TRANSPORT: 'Transport', OTHER: 'Other',
};

registerSubscriber('shipment.cost_recorded', async (tenantId, event) => {
  const shipmentId = event.entityId;
  if (!shipmentId) return;
  if (await isSupersededByStudio(tenantId, 'intelligence.cost_variance')) return;

  const variance = await withTenant(tenantId, trx => shipmentVariance(trx, tenantId, shipmentId));
  // No estimate was ever linked to this shipment — nothing to compare against.
  if (!variance.estimate) return;

  const material = variance.lines.filter(l =>
    l.varianceTzs != null && l.variancePct != null &&
    Math.abs(l.variancePct) >= MATERIAL_PCT && Math.abs(l.varianceTzs) >= MATERIAL_TZS);
  if (material.length === 0) return;

  await withTenant(tenantId, async (trx) => {
    const shipment = await trx.selectFrom('shipment_cases')
      .select(['id', 'ref_number', 'assigned_to'])
      .where('id', '=', shipmentId).where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!shipment?.assigned_to) return;

    // Named heads and real figures — an alert that says only "costs differ"
    // makes the reader open three screens to find out what happened.
    const worst = material.sort((a, b) => Math.abs(b.varianceTzs!) - Math.abs(a.varianceTzs!))[0];
    const over = worst.varianceTzs! > 0;
    const rest = material.length > 1 ? ` (+${material.length - 1} other head${material.length > 2 ? 's' : ''})` : '';

    await NotificationService.createNotification({
      tenantId, userId: shipment.assigned_to, app: 'finops', type: 'security',
      title: over ? 'Costs above estimate' : 'Costs below estimate',
      message:
        `${shipment.ref_number}: ${HEAD_LABEL[worst.head] ?? worst.head} came in at `
        + `TZS ${Math.round(worst.actualTzs!).toLocaleString('en-US')} against an estimate of `
        + `TZS ${Math.round(worst.estimatedTzs!).toLocaleString('en-US')} `
        + `(${over ? '+' : ''}${worst.variancePct}%)${rest}.`,
      link: `/clearos/clearance/${shipmentId}`,
      entityType: 'shipment', entityId: shipmentId, entityLabel: shipment.ref_number,
    }).catch(err => console.error('[IntelligenceSubscriber] notify failed:', err.message));
  });
});

/**
 * A released declaration is the moment the real duty is known, so it is also
 * the moment the estimate can finally be scored against it. The finance
 * subscriber has just written that actual under DUTY_TAXES; this re-checks the
 * comparison so the duty line is included rather than waiting for the next
 * manual ledger entry to trigger it.
 */
registerSubscriber('declaration.released', async (tenantId, event) => {
  const shipmentId = event.payload.shipmentId as string | undefined;
  if (!shipmentId) return;
  if (await isSupersededByStudio(tenantId, 'intelligence.cost_variance')) return;

  const variance = await withTenant(tenantId, trx => shipmentVariance(trx, tenantId, shipmentId));
  const duty = variance.lines.find(l => l.head === 'DUTY_TAXES');
  if (!variance.estimate || !duty || duty.varianceTzs == null || duty.variancePct == null) return;
  if (Math.abs(duty.variancePct) < MATERIAL_PCT || Math.abs(duty.varianceTzs) < MATERIAL_TZS) return;

  await withTenant(tenantId, async (trx) => {
    const shipment = await trx.selectFrom('shipment_cases')
      .select(['id', 'ref_number', 'assigned_to'])
      .where('id', '=', shipmentId).where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!shipment?.assigned_to) return;

    const over = duty.varianceTzs! > 0;
    await NotificationService.createNotification({
      tenantId, userId: shipment.assigned_to, app: 'clearos', type: 'security',
      title: 'Assessed duty differs from the estimate',
      message:
        `${shipment.ref_number}: TRA assessed TZS ${Math.round(duty.actualTzs!).toLocaleString('en-US')} `
        + `against an estimate of TZS ${Math.round(duty.estimatedTzs!).toLocaleString('en-US')} `
        + `(${over ? '+' : ''}${duty.variancePct}%). A gap this size usually means the classification `
        + `or the declared value differed from what was priced — worth checking before the next one.`,
      link: `/clearos/clearance/${shipmentId}`,
      entityType: 'shipment', entityId: shipmentId, entityLabel: shipment.ref_number,
    }).catch(err => console.error('[IntelligenceSubscriber] notify failed:', err.message));
  });
});
