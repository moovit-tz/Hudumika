// Daily generation of due recurring bills and invoices — the piece
// recurring_bills has been missing since it was built (Bills.tsx's own
// "Generate now" button was the only way anything ever got generated).
// Cross-tenant, so this queries via dbPlatform (see jobs/index.ts's
// daily-cadence group) rather than one tenant at a time, same shape as
// daily-shipment-report.job.ts.
import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';
import { generateDueBills, generateDueInvoices } from '../services/recurring-documents.service.js';

export async function runRecurringDocumentsJob(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const billTenants = await sql<{ tenant_id: string }>`
      SELECT DISTINCT tenant_id FROM recurring_bills WHERE state = 'ACTIVE' AND next_due <= ${today}
    `.execute(dbPlatform);
    let billsGenerated = 0;
    for (const { tenant_id } of billTenants.rows) {
      try {
        const result = await generateDueBills(tenant_id, today);
        billsGenerated += result.generated.length;
      } catch (err) {
        console.error(`❌ Recurring bill generation failed for tenant ${tenant_id}:`, err);
      }
    }
    if (billsGenerated > 0) console.log(`✅ Generated ${billsGenerated} bill(s) from recurring templates.`);
  } catch (err) {
    console.error('❌ Recurring bills sweep failed:', err);
  }

  try {
    const invoiceTenants = await sql<{ tenant_id: string }>`
      SELECT DISTINCT tenant_id FROM recurring_invoices WHERE state = 'ACTIVE' AND next_due <= ${today}
    `.execute(dbPlatform);
    let invoicesGenerated = 0;
    for (const { tenant_id } of invoiceTenants.rows) {
      try {
        const result = await generateDueInvoices(tenant_id, today);
        invoicesGenerated += result.generated.length;
      } catch (err) {
        console.error(`❌ Recurring invoice generation failed for tenant ${tenant_id}:`, err);
      }
    }
    if (invoicesGenerated > 0) console.log(`✅ Generated ${invoicesGenerated} invoice(s) from recurring templates.`);
  } catch (err) {
    console.error('❌ Recurring invoices sweep failed:', err);
  }
}
