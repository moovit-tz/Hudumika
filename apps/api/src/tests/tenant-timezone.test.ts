import { describe, expect, it } from 'vitest';
import { addCalendarDays, localDateKey, splitIntervalByLocalDay, wallClockToUtc } from '../services/tenant-timezone.service.js';
import { zktecoAdapter } from '../lib/device-providers/zkteco.js';

describe('tenant and device timezone handling', () => {
  it('converts a timezone-free device wall clock independently of the host timezone', () => {
    const punch = zktecoAdapter.parsePunchBatch('42\t2026-07-03 22:00:00\t0')[0];
    expect(punch.sourceLocalTime).toBe('2026-07-03 22:00:00');
    expect(wallClockToUtc(punch.sourceLocalTime!, 'Africa/Dar_es_Salaam').toISOString()).toBe('2026-07-03T19:00:00.000Z');
  });

  it('splits overnight work by tenant-local date and preserves rounded elapsed minutes', () => {
    const start = wallClockToUtc('2026-07-03 22:00:00', 'Africa/Dar_es_Salaam');
    const end = wallClockToUtc('2026-07-04 06:00:00', 'Africa/Dar_es_Salaam');
    const allocation = splitIntervalByLocalDay(start, end, 'Africa/Dar_es_Salaam');
    expect(allocation).toEqual([{ date: '2026-07-03', minutes: 120 }, { date: '2026-07-04', minutes: 360 }]);
    expect(allocation.reduce((sum, segment) => sum + segment.minutes, 0)).toBe(480);
  });

  it('allocates actual elapsed time over a DST boundary rather than assuming 24-hour days', () => {
    const start = wallClockToUtc('2026-03-08 00:00:00', 'America/New_York');
    const end = wallClockToUtc('2026-03-09 00:00:00', 'America/New_York');
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
    expect(splitIntervalByLocalDay(start, end, 'America/New_York')).toEqual([{ date: '2026-03-08', minutes: 1380 }]);
  });

  it('uses UTC calendar math rather than server local date mutation', () => {
    expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(localDateKey(new Date('2026-07-03T21:30:00Z'), 'Africa/Dar_es_Salaam')).toBe('2026-07-04');
  });
});
