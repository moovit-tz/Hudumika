// Daily ~21:00 EAT shipment-report automation (migration 258) — email (PDF
// attached) + WhatsApp (link only) per active shipment, honouring the
// customer/shipment tri-state opt-out. Cross-tenant, so this queries via
// dbPlatform (see jobs/index.ts's daily-cadence group) rather than one tenant
// at a time.
import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';
import { sendDailyShipmentReport } from '../services/shipment-report.service.js';

interface Candidate {
  id: string;
  tenant_id: string;
  ref_number: string;
  shipment_flag: boolean | null;
  customer_flag: boolean | null;
}

export async function runDailyShipmentReportJob(): Promise<void> {
  try {
    // "Active" = not soft-deleted, not on the legacy CLOSED terminal stage,
    // and — for a custom workflow, whose `stage` is a workflow_steps.id, not
    // a ClearanceStage literal — not sitting on that workflow's own terminal
    // step. A shipment already fully closed doesn't need a nightly report.
    const rows = await sql<Candidate>`
      SELECT sc.id, sc.tenant_id, sc.ref_number,
             sc.daily_report_enabled AS shipment_flag,
             c.daily_report_enabled AS customer_flag
      FROM shipment_cases sc
      LEFT JOIN customers c ON c.id = sc.customer_id AND c.tenant_id = sc.tenant_id
      LEFT JOIN workflow_steps ws ON ws.id::text = sc.stage AND ws.tenant_id = sc.tenant_id
      WHERE sc.deleted_at IS NULL
        AND sc.stage != 'CLOSED'
        AND (ws.is_terminal IS NULL OR ws.is_terminal = false)
    `.execute(dbPlatform);

    const candidates = rows.rows.filter((r) => (r.shipment_flag ?? r.customer_flag ?? true) === true);
    if (candidates.length === 0) return;

    let sent = 0, skipped = 0, failed = 0;
    for (const c of candidates) {
      try {
        const result = await sendDailyShipmentReport(c.tenant_id, c.id);
        if (result.sent) sent++; else skipped++;
      } catch (err: any) {
        failed++;
        console.error(`❌ Daily shipment report failed for ${c.ref_number} (${c.id}):`, err.message || err);
      }
    }
    console.log(`📄 Daily shipment report sweep — sent: ${sent}, skipped: ${skipped}, failed: ${failed} (of ${candidates.length} eligible)`);
  } catch (error) {
    console.error('❌ Daily shipment report job failed:', error);
  }
}
