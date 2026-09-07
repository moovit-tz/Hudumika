import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { endMeetingRow } from '../routes/calls.routes.js';

/**
 * The "Teams approach" to meeting length: every bliss_meetings row carries a
 * real max_duration_minutes (set at creation — see calls.routes.ts's
 * POST /meetings), and this sweep ends any ACTIVE meeting that has run past
 * started_at + that cap, exactly the way a host manually ending it does
 * (same endMeetingRow — real participant rows closed, a real 'meeting-ended'
 * WS broadcast reaching everyone still in the room, end_reason recorded as
 * 'time_limit' so the client shows why, not a generic "meeting ended").
 *
 * Cross-tenant scan via dbPlatform (a real, audited exception to the
 * "always withTenant" rule — see CLAUDE.md), then a genuine withTenant
 * transaction per meeting to do the actual write, matching mail-outbox.job's
 * shape for the same reason: the write must go through RLS correctly.
 */
export async function runMeetingDurationLimitJob(): Promise<void> {
  try {
    const overdue = await dbPlatform.selectFrom('bliss_meetings')
      .select(['id', 'tenant_id', 'title'])
      .where('status', '=', 'ACTIVE')
      .where(sql<boolean>`started_at IS NOT NULL AND started_at + (max_duration_minutes || ' minutes')::interval <= now()`)
      .limit(200)
      .execute();

    if (overdue.length === 0) return;

    let ended = 0;
    for (const m of overdue) {
      try {
        const result = await withTenant(m.tenant_id, trx => endMeetingRow(trx, m.tenant_id, m.id, 'time_limit'));
        if (result) ended++;
      } catch (err) {
        console.error(`❌ Could not auto-end meeting ${m.id} (tenant ${m.tenant_id}):`, err);
      }
    }

    if (ended > 0) console.log(`⏱️  Meeting duration limit sweep — auto-ended ${ended} meeting(s) past their time limit.`);
  } catch (error) {
    console.error('❌ Meeting duration limit job failed:', error);
  }
}
