/**
 * TRA VFD Z-Report Nightly Job
 * Automatically submits daily Z-reports to TRA for all tenants
 * that have VFD configured. Should run at midnight (or just after
 * close of business) each day.
 */

import { dbPlatform } from '../db/client.js';
import { TRAService } from '../services/tra.service.js';

export async function runTRAZReportJob(): Promise<void> {
  console.log('[TRA Z-Report] Starting nightly Z-report submission...');

  try {
    // Get all tenants with TRA VFD configured and registered
    const configs = await dbPlatform
      .selectFrom('tra_vfd_config')
      .select(['tenant_id', 'last_zreport_date', 'environment'])
      .where('reg_id', 'is not', null)
      .execute();

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    let submitted = 0;
    let skipped = 0;
    let failed = 0;

    for (const config of configs) {
      // Skip if already submitted today
      const lastDate = config.last_zreport_date
        ? new Date(config.last_zreport_date).toISOString().slice(0, 10)
        : null;

      if (lastDate === todayStr) {
        console.log(`[TRA Z-Report] Tenant ${config.tenant_id}: already submitted today, skipping`);
        skipped++;
        continue;
      }

      // Use yesterday's date (end of business)
      const reportDate = new Date(today);
      reportDate.setDate(reportDate.getDate() - 1);

      try {
        const result = await TRAService.submitZReport(config.tenant_id, reportDate);
        if (result.success) {
          console.log(`[TRA Z-Report] Tenant ${config.tenant_id}: ✅ Success (ACKCODE=${result.ackCode})`);
          submitted++;
        } else {
          console.error(`[TRA Z-Report] Tenant ${config.tenant_id}: ❌ Failed - ${result.error || result.ackMsg}`);
          failed++;
        }
      } catch (err: any) {
        console.error(`[TRA Z-Report] Tenant ${config.tenant_id}: ❌ Exception - ${err.message}`);
        failed++;
      }

      // Small delay between tenants to avoid hammering TRA
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`[TRA Z-Report] Done: ${submitted} submitted, ${skipped} skipped, ${failed} failed`);
  } catch (err: any) {
    console.error('[TRA Z-Report] Fatal error:', err.message);
  }
}
