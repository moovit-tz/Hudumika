import { db, withTenant } from '../db/client.js';

/**
 * Clocking out of a shift nobody clocked out of.
 *
 * `PATCH /time/:id/stop` computed `now - started_at` and stored it. That is
 * right for a shift someone actually ends, and wrong for one they forget: this
 * database holds ten entries left open, the oldest for 650 hours. Pressing stop
 * on that one would have written 39,000 minutes of work to a timesheet.
 *
 * The cap is the Tanzanian statutory maximum working day — 12 hours under the
 * Employment and Labour Relations Act, the same figure the overtime rules in
 * this codebase already use. Past it, the clock-out did not happen, so the
 * question is not "how long was this shift" but "we do not know".
 *
 * Which is what gets recorded. `duration_minutes` is set to NULL rather than to
 * the elapsed time (a fiction) or to zero (a different fiction, that they did
 * no work). Every consumer already reads it as `duration_minutes ?? 0`, so an
 * unknown shift contributes nothing to a total instead of dominating it, and
 * the note says why.
 */
export const MAX_SHIFT_MINUTES = 12 * 60;

export interface SettledEntry {
  ended_at: Date;
  duration_minutes: number | null;
  notes: string | null;
}

/** What to write when an entry is closed at `endedAt`. */
export function settleEntry(
  startedAt: Date | string,
  endedAt: Date,
  existingNote: string | null,
): SettledEntry {
  const started = new Date(startedAt);
  const elapsed = Math.round((endedAt.getTime() - started.getTime()) / 60000);

  if (elapsed <= MAX_SHIFT_MINUTES) {
    return { ended_at: endedAt, duration_minutes: Math.max(0, elapsed), notes: existingNote };
  }

  const hours = Math.round(elapsed / 60);
  const note = `Auto-closed after ${hours}h — no clock-out was recorded, so the time worked is not known and has been left blank rather than guessed.`;
  return {
    ended_at: endedAt,
    duration_minutes: null,
    notes: existingNote ? `${existingNote}\n${note}` : note,
  };
}

/**
 * Closes every entry left running past the cap, across all tenants.
 *
 * Platform-wide by design — it is a scheduled sweep, not a request, and an
 * entry left open in one workspace is not visible from another. Each write is
 * still tenant-scoped.
 */
export async function sweepStaleCheckIns(now = new Date()): Promise<{ closed: number }> {
  const cutoff = new Date(now.getTime() - MAX_SHIFT_MINUTES * 60000);
  const stale = await db
    .selectFrom('hr_time_entries')
    .select(['id', 'tenant_id', 'user_id', 'started_at', 'notes'])
    .where('ended_at', 'is', null)
    .where('started_at', '<', cutoff)
    .execute();

  for (const e of stale) {
    const settled = settleEntry(e.started_at as any, now, e.notes ?? null);
    await withTenant(e.tenant_id, trx =>
      trx.updateTable('hr_time_entries')
        .set({ ended_at: settled.ended_at, duration_minutes: settled.duration_minutes,
               notes: settled.notes, updated_at: new Date() })
        .where('id', '=', e.id)
        .where('tenant_id', '=', e.tenant_id)
        .execute());
  }
  return { closed: stale.length };
}
