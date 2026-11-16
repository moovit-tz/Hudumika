import { dbPlatform, withTenant } from '../db/client.js';
import { sendEquipmentReminders } from '../services/project-equipment.service.js';

/**
 * Daily: certificates and inspections falling due within 14 days, and assets
 * not back by their booking's end date, go to the asset's custodian (or the
 * tenant admins). The per-tenant work runs under withTenant; only the list of
 * tenants that have a register at all is a platform read.
 */
export async function runEquipmentReminderJob(): Promise<void> {
  const tenants = await dbPlatform.selectFrom('project_resources').select('tenant_id').distinct().execute();
  let sent = 0;
  for (const { tenant_id } of tenants) {
    try { sent += await withTenant(tenant_id, trx => sendEquipmentReminders(trx, tenant_id)); }
    catch (e: any) { console.error(`[equipment-reminders] tenant ${tenant_id}:`, e.message); }
  }
  if (sent) console.log(`🛠️  Sent ${sent} equipment reminder(s).`);
}
