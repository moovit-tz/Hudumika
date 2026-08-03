import { registerSubscriber } from '../services/domain-events.service.js';
import { isSupersededByStudio } from '../studio/supersession.js';
import { withTenant } from '../db/client.js';

// Auto-records the customs-duty ledger line the moment a declaration is
// released — but only using a real, already-recorded TRA assessment/bill
// amount (declaration_notices.paid_amount / total_tax_amount). There is no
// reliable duty total on the declaration itself to fall back on (the
// Declaration tab's own duty/VAT rate fields are explicitly local-estimate-
// only, never persisted — see ShipmentDetail.tsx), so if no real notice
// exists yet this deliberately does nothing rather than invent a number.
registerSubscriber('declaration.released', async (tenantId, event) => {
  const declarationId = event.entityId;
  const shipmentId = event.payload.shipmentId as string | undefined;
  if (!declarationId || !shipmentId) return;
  // Stood down when this tenant has activated the Studio workflow that
  // replaces this handler (migration 165) — otherwise both would run.
  if (await isSupersededByStudio(tenantId, 'finance.declaration_released')) return;

  await withTenant(tenantId, async (trx) => {
    const notice = await trx.selectFrom('declaration_notices')
      .select(['id', 'paid_amount', 'total_tax_amount', 'bill_number'])
      .where('declaration_id', '=', declarationId)
      .where((eb) => eb.or([eb('paid_amount', 'is not', null), eb('total_tax_amount', 'is not', null)]))
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (!notice) return;

    const amount = Number(notice.paid_amount ?? notice.total_tax_amount);
    if (!amount || amount <= 0) return;

    const already = await trx.selectFrom('expenses')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('shipment_id', '=', shipmentId)
      .where('category', '=', 'DUTY')
      .executeTakeFirst();
    if (already) return; // don't double-record if this fires more than once

    await trx.insertInto('expenses').values({
      tenant_id: tenantId,
      shipment_id: shipmentId,
      category: 'DUTY',
      // The landed-cost card this actual belongs under. Without it the row is
      // invisible to the estimate-vs-actual comparison, which is the one place
      // an automatically-recorded duty figure is most worth having: it is the
      // real TRA assessment against what the calculator predicted.
      charge_head: 'DUTY_TAXES',
      label: `Customs duty — declaration ${event.payload.tancisRef ?? declarationId}${notice.bill_number ? ` (bill ${notice.bill_number})` : ''}`,
      amount_tzs: amount,
      is_revenue: false,
      recorded_by: null,
    }).execute();
  });
});
