import { describe, it, expect } from 'vitest';
import { computeAogSla } from '../lib/anga-aog-sla.js';

const BASE = new Date('2026-01-01T00:00:00.000Z').getTime();
const H = 3600_000;
const at = (hoursFromBase: number) => new Date(BASE + hoursFromBase * H);

describe('computeAogSla', () => {
  it('1. no pauses, well within target: not breached', () => {
    const r = computeAogSla({ openedAt: at(0), targetResolutionAt: at(24), pauseEvents: [], now: at(6) });
    expect(r.pausedMs).toBe(0);
    expect(r.elapsedMs).toBe(6 * H);
    expect(r.remainingMs).toBe(18 * H);
    expect(r.breached).toBe(false);
  });

  it('2. no pauses, past target: breached', () => {
    const r = computeAogSla({ openedAt: at(0), targetResolutionAt: at(24), pauseEvents: [], now: at(30) });
    expect(r.elapsedMs).toBe(30 * H);
    expect(r.remainingMs).toBe(-6 * H);
    expect(r.breached).toBe(true);
  });

  it('3. exactly at the target instant: not breached (remaining == 0)', () => {
    const r = computeAogSla({ openedAt: at(0), targetResolutionAt: at(24), pauseEvents: [], now: at(24) });
    expect(r.remainingMs).toBe(0);
    expect(r.breached).toBe(false);
  });

  it('4. a single closed pause reduces elapsed time', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(2), resumedAt: at(5) }],
      now: at(10),
    });
    expect(r.pausedMs).toBe(3 * H);
    expect(r.elapsedMs).toBe(7 * H); // 10h wall clock - 3h paused
    expect(r.remainingMs).toBe(17 * H);
    expect(r.breached).toBe(false);
  });

  it('5. an open pause (no resumedAt) runs until now', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(4), resumedAt: null }],
      now: at(10),
    });
    expect(r.pausedMs).toBe(6 * H); // paused from hour 4 to now (hour 10)
    expect(r.elapsedMs).toBe(4 * H);
  });

  it('6. back-to-back (touching) pauses merge into one interval', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(2), resumedAt: at(5) }, { pausedAt: at(5), resumedAt: at(8) }],
      now: at(10),
    });
    expect(r.pausedMs).toBe(6 * H); // 2->8, not 3h+3h double-counted at the boundary
  });

  it('7. overlapping pauses merge without double-counting', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(2), resumedAt: at(6) }, { pausedAt: at(4), resumedAt: at(9) }],
      now: at(10),
    });
    // union of [2,6] and [4,9] is [2,9] = 7h, NOT (4h + 5h = 9h)
    expect(r.pausedMs).toBe(7 * H);
    expect(r.elapsedMs).toBe(3 * H);
  });

  it('8. three-way overlapping pauses all merge into a single interval', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [
        { pausedAt: at(1), resumedAt: at(3) },
        { pausedAt: at(2), resumedAt: at(5) },
        { pausedAt: at(4), resumedAt: at(6) },
      ],
      now: at(10),
    });
    // union [1,6] = 5h
    expect(r.pausedMs).toBe(5 * H);
  });

  it('9. pause-at-breach: without the pause the case would be breached, but the pause covers the overage', () => {
    // Without any pause, 30h elapsed vs 24h target would breach by 6h.
    // A 6h pause exactly absorbs the overage.
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(10), resumedAt: at(16) }],
      now: at(30),
    });
    expect(r.pausedMs).toBe(6 * H);
    expect(r.elapsedMs).toBe(24 * H);
    expect(r.remainingMs).toBe(0);
    expect(r.breached).toBe(false);
  });

  it('10. pause-at-breach, but the pause is one hour short of covering the overage: still breached', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(10), resumedAt: at(15) }], // only 5h paused, needed 6h
      now: at(30),
    });
    expect(r.elapsedMs).toBe(25 * H);
    expect(r.breached).toBe(true);
  });

  it('11. events supplied out of chronological order produce the same result as in-order', () => {
    const outOfOrder = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(6), resumedAt: at(8) }, { pausedAt: at(1), resumedAt: at(2) }],
      now: at(10),
    });
    const inOrder = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(1), resumedAt: at(2) }, { pausedAt: at(6), resumedAt: at(8) }],
      now: at(10),
    });
    expect(outOfOrder).toEqual(inOrder);
    expect(outOfOrder.pausedMs).toBe(3 * H); // 1h + 2h, non-overlapping
  });

  it('12. a zero-duration pause contributes no paused time', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(5), resumedAt: at(5) }],
      now: at(10),
    });
    expect(r.pausedMs).toBe(0);
    expect(r.elapsedMs).toBe(10 * H);
  });

  it('13. multiple non-overlapping pauses sum correctly', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(48),
      pauseEvents: [{ pausedAt: at(2), resumedAt: at(4) }, { pausedAt: at(10), resumedAt: at(13) }, { pausedAt: at(20), resumedAt: at(21) }],
      now: at(30),
    });
    expect(r.pausedMs).toBe((2 + 3 + 1) * H);
    expect(r.elapsedMs).toBe(30 * H - 6 * H);
  });

  it('14. paused time can never exceed elapsed wall-clock time (elapsedMs floors at 0)', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(0), resumedAt: at(20) }],
      now: at(10), // pause interval clamped against "now" internally via resumedAt already <= now
    });
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('15. reversed pausedAt/resumedAt on a single event is normalised (min/max)', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(8), resumedAt: at(3) }], // resumedAt before pausedAt
      now: at(10),
    });
    expect(r.pausedMs).toBe(5 * H);
  });

  it('16. a case already well past target with no pauses at all is breached', () => {
    const r = computeAogSla({ openedAt: at(0), targetResolutionAt: at(24), pauseEvents: [], now: at(72) });
    expect(r.breached).toBe(true);
    expect(r.remainingMs).toBe(-48 * H);
  });

  it('17. an open pause starting after the target deadline still keeps the case from breaching if it covers the overage', () => {
    const r = computeAogSla({
      openedAt: at(0), targetResolutionAt: at(24),
      pauseEvents: [{ pausedAt: at(24), resumedAt: null }],
      now: at(30),
    });
    expect(r.pausedMs).toBe(6 * H);
    expect(r.elapsedMs).toBe(24 * H);
    expect(r.breached).toBe(false);
  });
});
