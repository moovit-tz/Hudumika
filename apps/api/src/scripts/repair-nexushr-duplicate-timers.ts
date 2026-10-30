import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { lockEmployeeTime } from '../services/timesheet-integrity.service.js';
import { MAX_SHIFT_MINUTES } from '../services/time-entry.service.js';

const apply = process.argv.includes('--apply');
const tenants = await dbPlatform.selectFrom('tenants').select('id').execute();
let affected = 0;
for (const tenant of tenants) {
  await withTenant(tenant.id, async trx => {
    const duplicates = await trx.selectFrom('hr_time_entries').select('user_id')
      .where('tenant_id', '=', tenant.id).where('ended_at', 'is', null).groupBy('user_id').having(sql<number>`count(*)`, '>', 1).execute();
    for (const { user_id: userId } of duplicates) {
      await lockEmployeeTime(trx, tenant.id, userId);
      const rows = await trx.selectFrom('hr_time_entries').selectAll().where('tenant_id', '=', tenant.id).where('user_id', '=', userId).where('ended_at', 'is', null).orderBy('started_at', 'desc').execute();
      const now = new Date();
      const toClose = rows.filter((r, index) => index > 0 || now.getTime() - new Date(r.started_at).getTime() > MAX_SHIFT_MINUTES * 60000);
      affected += toClose.length;
      if (!apply) continue;
      for (const entry of toClose) {
        const reason = 'Duplicate running timer reconciled. Duration remains unknown; HR must verify actual hours.';
        await trx.updateTable('hr_time_entries').set({ ended_at: now, duration_minutes: null, notes: [entry.notes, reason].filter(Boolean).join('\n'), updated_at: now }).where('tenant_id', '=', tenant.id).where('id', '=', entry.id).execute();
        await trx.insertInto('hr_activity_log').values({ tenant_id: tenant.id, user_id: userId, action: 'timer.duplicate_reconciled', metadata: { reason, previous: entry, repaired_at: now.toISOString() } }).execute();
      }
    }
  });
}
console.log(`${apply ? 'Closed' : 'Would close'} ${affected} duplicate/stale timers. No worked hours inferred.`);
await dbPlatform.destroy();
