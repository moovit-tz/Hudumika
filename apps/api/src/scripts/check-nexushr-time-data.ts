import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';

// Platform audit only: enumerate workspaces, then execute each data check
// inside its own tenant context. Never infer or rewrite employees' hours.
const tenants = await dbPlatform.selectFrom('tenants').select('id').execute();
const findings: Record<string, unknown>[] = [];
for (const tenant of tenants) {
  const counts = await withTenant(tenant.id, async trx => {
    const result = await sql<Record<string, string>>`
      select
        (select count(*) from (
          select user_id from hr_time_entries where tenant_id = ${tenant.id} and ended_at is null group by user_id having count(*) > 1
        ) d) as duplicate_running_timers,
        (select count(*) from hr_clock_sessions s join hr_clock_sessions o on o.tenant_id = ${tenant.id} and o.user_id = s.user_id and o.id > s.id
          where s.tenant_id = ${tenant.id} and s.status <> 'CANCELLED' and o.status <> 'CANCELLED'
            and s.worked_minutes is not null and o.worked_minutes is not null
            and s.clock_in_at < o.clock_out_at and o.clock_in_at < s.clock_out_at) as overlapping_known_sessions,
        (select count(*) from hr_clock_sessions where tenant_id = ${tenant.id} and status = 'COMPLETED' and worked_minutes is null) as unknown_sessions,
        (select count(*) from hr_timesheet_approvals a where a.tenant_id = ${tenant.id} and a.status = 'APPROVED' and (
          a.total_worked_minutes <> (select coalesce(sum(s.worked_minutes),0) from hr_clock_sessions s where s.tenant_id = ${tenant.id} and s.user_id = a.user_id and s.date between a.period_start and a.period_end and s.status = 'COMPLETED')
          or a.session_count <> (select count(*) from hr_clock_sessions s where s.tenant_id = ${tenant.id} and s.user_id = a.user_id and s.date between a.period_start and a.period_end and s.status = 'COMPLETED')
        )) as stale_approved_snapshots,
        (select count(*) from shipment_time_entries where tenant_id = ${tenant.id} and user_id is null) as unlinked_shipment_entries
    `.execute(trx);
    return Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]));
  });
  if (Object.values(counts).some(value => value > 0)) findings.push({ tenant_id: tenant.id, ...counts });
}
const directory = resolve(process.cwd(), '../../docs/audits');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'nexushr-existing-time-data.json'), JSON.stringify({ checked_at: new Date().toISOString(), server_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, workspaces_checked: tenants.length, workspaces_with_flags: findings.length, findings }, null, 2));
console.log(`Checked ${tenants.length} workspaces; ${findings.length} need time-data review. No records changed.`);
await dbPlatform.destroy();
