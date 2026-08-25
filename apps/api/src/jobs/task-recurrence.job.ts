import { dbPlatform, withTenant } from '../db/client.js';

// M18 of the standalone Projects app — recurring tasks, the smallest real
// slice of "automation" (a task that regenerates on a schedule, not a
// conditional-routing/rules engine). A recurring task is its own anchor:
// tasks.recurrence_rule + recurrence_next_due live on the template row
// itself (migration 328), same shape as a recurring calendar event's
// master row. Daily sweep: every anchor whose next_due has arrived gets a
// fresh real clone (without the rule, so the clone itself doesn't recur),
// then the anchor's own next_due advances to the next occurrence.

interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
}

/** Adds the rule's interval to a 'YYYY-MM-DD' date, clamping a monthly
 *  advance to the last real day of the target month (Jan 31 + 1mo -> Feb
 *  28/29, not Mar 3) — same reasoning as calendar-recurrence.service.ts's
 *  own addMonthsClamped, reimplemented here rather than imported since that
 *  helper isn't exported and this only needs the daily/weekly/monthly slice. */
function advanceDate(dateStr: string, rule: RecurrenceRule): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (rule.freq === 'daily') {
    d.setUTCDate(d.getUTCDate() + rule.interval);
    return d.toISOString().slice(0, 10);
  }
  if (rule.freq === 'weekly') {
    d.setUTCDate(d.getUTCDate() + rule.interval * 7);
    return d.toISOString().slice(0, 10);
  }
  const day = d.getUTCDate();
  const targetMonthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + rule.interval, 1));
  const daysInTargetMonth = new Date(Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(day, daysInTargetMonth));
  return targetMonthStart.toISOString().slice(0, 10);
}

export async function runTaskRecurrenceJob(): Promise<void> {
  console.log('⏳ Running background job: Task recurrence...');
  try {
    const today = new Date().toISOString().slice(0, 10);
    const due = await dbPlatform.selectFrom('tasks')
      .select(['id', 'tenant_id'])
      .where('recurrence_rule', 'is not', null)
      .where('recurrence_next_due', '<=', today)
      .where('deleted_at', 'is', null)
      .execute();

    if (due.length === 0) {
      console.log('📝 No due recurring tasks.');
      return;
    }

    let generated = 0;
    for (const row of due) {
      try {
        await withTenant(row.tenant_id, async (trx) => {
          const anchor = await trx.selectFrom('tasks').selectAll().where('id', '=', row.id).executeTakeFirst();
          if (!anchor || !anchor.recurrence_rule || !anchor.recurrence_next_due) return;
          const rule = anchor.recurrence_rule as unknown as RecurrenceRule;
          const nextDueStr = String(anchor.recurrence_next_due).slice(0, 10);

          await trx.insertInto('tasks').values({
            id: crypto.randomUUID(), tenant_id: anchor.tenant_id, user_id: anchor.user_id, list_id: anchor.list_id,
            title: anchor.title, notes: anchor.notes, due: nextDueStr,
            priority: anchor.priority,
            tags: JSON.stringify(anchor.tags ?? []) as unknown as string[],
            assignee_id: anchor.assignee_id, project_id: anchor.project_id, milestone_id: anchor.milestone_id,
            is_private: anchor.is_private, is_billable: anchor.is_billable, hourly_rate: anchor.hourly_rate,
            sort_order: 0,
          }).execute();
          generated++;

          await trx.updateTable('tasks').set({ recurrence_next_due: advanceDate(nextDueStr, rule) })
            .where('id', '=', anchor.id).execute();
        });
      } catch (err) {
        console.error(`❌ Task recurrence failed for task ${row.id} (tenant ${row.tenant_id}):`, err);
      }
    }
    if (generated > 0) console.log(`✅ Generated ${generated} task(s) from recurring templates.`);
  } catch (err) {
    console.error('❌ Task recurrence sweep failed:', err);
  }
}
