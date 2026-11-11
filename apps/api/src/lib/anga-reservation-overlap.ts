/**
 * ANGA hire-reservation double-booking check — ported verbatim from the
 * standalone Gereji app's lib/anga/reservation-overlap.ts. Pure, no I/O.
 *
 * The source app stood this in for a real exclusion constraint because
 * SQLite has neither the feature nor a range type. Hudumika runs real
 * Postgres, which does — but adding the `btree_gist` extension has no
 * existing precedent anywhere in this codebase, so rather than introduce a
 * new extension dependency for one table, the route layer uses this same
 * pure check plus `SELECT ... FOR UPDATE` on the stock unit row within the
 * creating transaction (gereji-anga-inventory.routes.ts), which is enough
 * to close the concurrent-double-booking race under Postgres's real MVCC —
 * a race the source app never had to worry about (SQLite is single-writer).
 *
 * End dates are exclusive: [d1, d5) and [d5, d10) do NOT overlap — a unit
 * returned in the morning can go back out the same day. Deliberate, not a bug.
 */
export type DateInterval = {
  startDate: Date;
  endDate: Date;
};

export function intervalsOverlap(a: DateInterval, b: DateInterval): boolean {
  return a.startDate.getTime() < b.endDate.getTime() && b.startDate.getTime() < a.endDate.getTime();
}

export function hasConflictingReservation(candidate: DateInterval, existingActive: DateInterval[]): boolean {
  return existingActive.some(r => intervalsOverlap(candidate, r));
}
