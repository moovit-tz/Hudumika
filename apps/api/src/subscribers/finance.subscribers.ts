import { registerSubscriber } from '../services/domain-events.service.js';
import { isSupersededByStudio } from '../studio/supersession.js';
import { withTenant } from '../db/client.js';
import { getNextDocNumber } from '../lib/doc-numbering.js';

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
      .where('declaration_id', '=', declarationId).where('tenant_id', '=', tenantId)
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

// FinOps is automatically linked to clearance: the moment a shipment's workflow
// reaches its Invoicing step, draft the customer's sales invoice so it is
// waiting in Finance instead of being re-keyed by hand. A DRAFT only — figures
// and lines are still the biller's to complete; nothing is posted to the ledger
// and no total is invented. Idempotent: one auto-draft per shipment ref.
registerSubscriber('clearance.workflow_step_entered', async (tenantId, event) => {
  if (event.payload.role !== 'invoicing') return;
  const customerId = event.payload.customerId as string | undefined;
  const shipmentRef = event.payload.shipmentRef as string | undefined;
  if (!customerId || !shipmentRef) return;

  await withTenant(tenantId, async (trx) => {
    // Don't double-draft if this fires again (redelivery, or a re-entry).
    const existing = await trx.selectFrom('sales_invoices').select('id')
      .where('tenant_id', '=', tenantId).where('shipment_ref', '=', shipmentRef)
      .executeTakeFirst();
    if (existing) return;

    const customer = await trx.selectFrom('customers').select(['name'])
      .where('id', '=', customerId).where('tenant_id', '=', tenantId).executeTakeFirst();

    const invoiceNumber = await getNextDocNumber(trx, tenantId, 'invoice');
    const [inv] = await trx.insertInto('sales_invoices').values({
      tenant_id: tenantId,
      invoice_number: invoiceNumber,
      shipment_ref: shipmentRef,
      customer_id: customerId,
      client_name: customer?.name ?? null,
      client_address: JSON.stringify([]),
      bl_number: (event.payload.blNumber as string | null) ?? null,
      status: 'Draft',
      received: 0,
      version: 1,
      exchange_rate: 1,
      notes: `Auto-drafted when clearance for ${shipmentRef} reached the Invoicing step. Complete the lines to issue.`,
      created_by: null,
    }).returningAll().execute();

    await trx.insertInto('invoice_activity_log').values({
      tenant_id: tenantId, invoice_id: inv.id, actor_id: null, actor_name: 'ClearOS workflow',
      action: 'created', detail: `Invoice ${inv.invoice_number} auto-drafted at the Invoicing step for ${shipmentRef}`, created_at: new Date(),
    }).execute();
  });
});
