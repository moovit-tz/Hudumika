import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/** One database snapshot and round trip for the overview, rather than twelve
 * separately awaited counts on the transaction's single connection. */
export async function workforceMetrics(trx: Transaction<Database>, tenantId: string, today: string, monthStart: Date) {
  const result = await sql<Record<string, string | number>>`
    with staff as (
      select count(*) as total_staff, count(*) filter (where active) as active_staff
      from users where tenant_id = ${tenantId} and role <> 'CUSTOMER'
    ), attendance as (
      select count(*) filter (where a.status in ('PRESENT','LATE','HALF_DAY')) as today_present,
        count(*) filter (where a.status = 'ABSENT') as today_absent,
        count(*) filter (where a.status = 'LATE') as today_late,
        count(*) filter (where a.status = 'INCOMPLETE') as today_incomplete
      from hr_attendance a join users u on u.id = a.user_id and u.tenant_id = ${tenantId}
      where a.tenant_id = ${tenantId} and a.date = ${today}::date and u.active and u.role <> 'CUSTOMER'
    ), leaves as (
      select count(distinct l.user_id) filter (where l.status = 'APPROVED' and l.from_date <= ${today}::date and l.to_date >= ${today}::date) as on_leave,
        count(*) filter (where l.status = 'PENDING') as pending_leaves
      from hr_leaves l join users u on u.id = l.user_id and u.tenant_id = ${tenantId}
      where l.tenant_id = ${tenantId} and u.active and u.role <> 'CUSTOMER'
    ), docs as (
      select count(*) as docs_total, count(*) filter (where created_at >= ${monthStart}) as docs_month
      from case_documents where tenant_id = ${tenantId}
    ), chat as (
      select count(*) as messages_total, count(*) filter (where created_at >= ${monthStart}) as messages_month
      from case_messages where tenant_id = ${tenantId}
    ), notices as (
      select count(*) as notifications_total, count(*) filter (where not read) as notifications_unread
      from notifications where tenant_id = ${tenantId}
    ) select * from staff cross join attendance cross join leaves cross join docs cross join chat cross join notices
  `.execute(trx);
  const r = result.rows[0];
  return {
    hr: Object.fromEntries(['total_staff', 'active_staff', 'on_leave', 'pending_leaves', 'today_present', 'today_absent', 'today_late', 'today_incomplete'].map(key => [key, Number(r[key])])),
    files: { total: Number(r.docs_total), this_month: Number(r.docs_month), source: 'ClearOS case documents' },
    chat: { total_messages: Number(r.messages_total), this_month: Number(r.messages_month), source: 'ClearOS case messages' },
    support: { total_notifications: Number(r.notifications_total), unread: Number(r.notifications_unread), source: 'Workspace notifications' },
    fetched_at: new Date().toISOString(),
  };
}
