/**
 * ANGA AOG case SLA clock — ported verbatim from the standalone Gereji app's
 * lib/anga/aog-sla.ts. Pure, no I/O. A pure function over an ordered event
 * list: given pause intervals, compute elapsed/remaining/breached, excluding
 * paused time. Overlapping pause intervals are merged so paused time is
 * never double-counted; an open pause (no resumedAt yet) is treated as
 * running until `now`.
 */
export type PauseInterval = {
  pausedAt: Date;
  resumedAt: Date | null;
};

export type AogSlaInput = {
  openedAt: Date;
  targetResolutionAt: Date;
  pauseEvents: PauseInterval[];
  now: Date;
};

export type AogSlaResult = {
  pausedMs: number;
  elapsedMs: number;
  remainingMs: number;
  breached: boolean;
};

export function computeAogSla(input: AogSlaInput): AogSlaResult {
  const { openedAt, targetResolutionAt, pauseEvents, now } = input;

  const intervals = pauseEvents
    .map(p => {
      const start = p.pausedAt.getTime();
      const end = (p.resumedAt ?? now).getTime();
      return { start: Math.min(start, end), end: Math.max(start, end) };
    })
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }

  const pausedMs = merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
  const totalMs = Math.max(0, now.getTime() - openedAt.getTime());
  const elapsedMs = Math.max(0, totalMs - pausedMs);
  const targetDurationMs = targetResolutionAt.getTime() - openedAt.getTime();
  const remainingMs = targetDurationMs - elapsedMs;
  const breached = remainingMs < 0;

  return { pausedMs, elapsedMs, remainingMs, breached };
}
