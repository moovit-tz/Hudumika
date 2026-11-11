import { describe, it, expect } from 'vitest';
import { resolveDisposition } from '../lib/anga-goods-receipt-disposition.js';
import { InvalidConditionTransitionError } from '../lib/anga-stock-condition.js';

describe('resolveDisposition', () => {
  it('accepted: NE (new) -> SV, available', () => {
    expect(resolveDisposition('accepted', 'NE')).toEqual({ condition: 'SV', availability: 'AVAILABLE' });
  });

  it('accepted: NS (new surplus) -> SV, available', () => {
    expect(resolveDisposition('accepted', 'NS')).toEqual({ condition: 'SV', availability: 'AVAILABLE' });
  });

  it('accepted: AR (as removed / core intake) -> SV, available', () => {
    expect(resolveDisposition('accepted', 'AR')).toEqual({ condition: 'SV', availability: 'AVAILABLE' });
  });

  it('rejected: NE -> US, held in quarantine', () => {
    expect(resolveDisposition('rejected', 'NE')).toEqual({ condition: 'US', availability: 'QUARANTINE' });
  });

  it('quarantined: NE -> IN, held in quarantine (inspected but undecided)', () => {
    expect(resolveDisposition('quarantined', 'NE')).toEqual({ condition: 'IN', availability: 'QUARANTINE' });
  });

  it("re-inspection: a unit already at IN can still be accepted (skips the ->IN hop)", () => {
    expect(resolveDisposition('accepted', 'IN')).toEqual({ condition: 'SV', availability: 'AVAILABLE' });
  });

  it('re-inspection: a unit already at IN can still be rejected', () => {
    expect(resolveDisposition('rejected', 'IN')).toEqual({ condition: 'US', availability: 'QUARANTINE' });
  });

  it('throws when inspecting a unit whose condition can never reach IN (e.g. already SV)', () => {
    expect(() => resolveDisposition('accepted', 'SV')).toThrow(InvalidConditionTransitionError);
  });

  it('throws when inspecting a terminal SCRAP unit', () => {
    expect(() => resolveDisposition('accepted', 'SCRAP')).toThrow(InvalidConditionTransitionError);
  });
});
