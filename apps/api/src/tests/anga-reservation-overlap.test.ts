import { describe, it, expect } from 'vitest';
import { intervalsOverlap, hasConflictingReservation, type DateInterval } from '../lib/anga-reservation-overlap.js';

const d = (day: number) => new Date(`2026-06-${String(day).padStart(2, '0')}T00:00:00.000Z`);
const iv = (start: number, end: number): DateInterval => ({ startDate: d(start), endDate: d(end) });

describe('intervalsOverlap', () => {
  it('identical ranges overlap', () => {
    expect(intervalsOverlap(iv(1, 5), iv(1, 5))).toBe(true);
  });

  it('partial overlap from the left', () => {
    expect(intervalsOverlap(iv(1, 5), iv(3, 8))).toBe(true);
  });

  it('partial overlap from the right', () => {
    expect(intervalsOverlap(iv(3, 8), iv(1, 5))).toBe(true);
  });

  it('fully-contained overlap', () => {
    expect(intervalsOverlap(iv(1, 10), iv(3, 5))).toBe(true);
  });

  it('touching (end === start) does NOT overlap', () => {
    expect(intervalsOverlap(iv(1, 5), iv(5, 10))).toBe(false);
    expect(intervalsOverlap(iv(5, 10), iv(1, 5))).toBe(false);
  });

  it('a gap between ranges does not overlap', () => {
    expect(intervalsOverlap(iv(1, 5), iv(10, 15))).toBe(false);
  });

  it('a single-day interval overlapping itself', () => {
    expect(intervalsOverlap(iv(1, 2), iv(1, 2))).toBe(true);
  });
});

describe('hasConflictingReservation', () => {
  it('no conflict against an empty list', () => {
    expect(hasConflictingReservation(iv(1, 5), [])).toBe(false);
  });

  it('no conflict when all existing reservations are elsewhere', () => {
    expect(hasConflictingReservation(iv(1, 5), [iv(10, 15), iv(20, 25)])).toBe(false);
  });

  it('conflict when any one of several existing reservations overlaps', () => {
    expect(hasConflictingReservation(iv(4, 8), [iv(10, 15), iv(1, 5)])).toBe(true);
  });

  it('no conflict when reservations only touch, never overlap', () => {
    expect(hasConflictingReservation(iv(5, 10), [iv(1, 5), iv(10, 15)])).toBe(false);
  });
});
