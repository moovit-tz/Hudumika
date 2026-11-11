import { describe, it, expect } from 'vitest';
import {
  AVAILABILITY_STATES, canTransitionAvailability, assertCanTransitionAvailability,
  InvalidAvailabilityTransitionError, isAvailability, type Availability,
} from '../lib/anga-stock-availability.js';

// The transitions declared, transcribed independently of
// anga-stock-availability.ts. Includes the "ANY (except SOLD/SCRAPPED) ->
// QUARANTINE" blanket rule expanded out, literally (QUARANTINE ->
// QUARANTINE included, a no-op re-flag).
const DECLARED_PAIRS = new Set([
  'AVAILABLE->RESERVED', 'AVAILABLE->ON_LOAN', 'AVAILABLE->IN_REPAIR',
  'RESERVED->ALLOCATED', 'RESERVED->AVAILABLE',
  'ALLOCATED->AVAILABLE', 'ALLOCATED->SOLD',
  'ON_LOAN->AVAILABLE',
  'IN_REPAIR->AVAILABLE',
  'QUARANTINE->AVAILABLE', 'QUARANTINE->SCRAPPED',
  // blanket QUARANTINE rule, from every non-terminal state
  'AVAILABLE->QUARANTINE', 'RESERVED->QUARANTINE', 'ALLOCATED->QUARANTINE',
  'ON_LOAN->QUARANTINE', 'IN_REPAIR->QUARANTINE', 'QUARANTINE->QUARANTINE',
]);

describe('canTransitionAvailability — exhaustive matrix (8x8 = 64 pairs)', () => {
  for (const from of AVAILABILITY_STATES) {
    for (const to of AVAILABILITY_STATES) {
      const expected = DECLARED_PAIRS.has(`${from}->${to}`);
      it(`${from} -> ${to} is ${expected ? 'allowed' : 'disallowed'}`, () => {
        expect(canTransitionAvailability(from, to)).toBe(expected);
      });
    }
  }
});

describe('assertCanTransitionAvailability', () => {
  it('does not throw for every declared transition', () => {
    for (const pair of DECLARED_PAIRS) {
      const [from, to] = pair.split('->') as [Availability, Availability];
      expect(() => assertCanTransitionAvailability(from, to)).not.toThrow();
    }
  });

  it('throws for any transition out of the terminal SOLD state', () => {
    for (const to of AVAILABILITY_STATES) {
      if (to === 'SOLD') continue;
      expect(() => assertCanTransitionAvailability('SOLD', to)).toThrow(InvalidAvailabilityTransitionError);
    }
  });

  it('throws for any transition out of the terminal SCRAPPED state, including to QUARANTINE', () => {
    for (const to of AVAILABILITY_STATES) {
      expect(() => assertCanTransitionAvailability('SCRAPPED', to)).toThrow(InvalidAvailabilityTransitionError);
    }
  });

  it('throws when skipping straight from RESERVED to SOLD (must pass through ALLOCATED)', () => {
    expect(() => assertCanTransitionAvailability('RESERVED', 'SOLD')).toThrow();
  });
});

describe('isAvailability', () => {
  it('recognises every declared state', () => {
    for (const a of AVAILABILITY_STATES) expect(isAvailability(a)).toBe(true);
  });

  it('rejects an undeclared value', () => {
    expect(isAvailability('BACKORDERED')).toBe(false);
  });
});
