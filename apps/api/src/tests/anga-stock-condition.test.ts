import { describe, it, expect } from 'vitest';
import {
  CONDITION_STATES, canTransitionCondition, assertCanTransitionCondition,
  InvalidConditionTransitionError, isCondition, type Condition,
} from '../lib/anga-stock-condition.js';

// The exact 15 transitions declared, transcribed independently of
// anga-stock-condition.ts so this test doesn't just re-check itself.
const DECLARED_PAIRS = new Set([
  'NE->IN', 'NS->IN', 'AR->IN',
  'IN->SV', 'IN->US', 'IN->RP',
  'RP->OH', 'OH->SV',
  'US->RP', 'US->SCRAP', 'RP->SCRAP',
  'SV->SCRAP', 'OH->SCRAP', 'IN->SCRAP', 'AR->SCRAP',
]);

describe('canTransitionCondition — exhaustive matrix (9x9 = 81 pairs)', () => {
  for (const from of CONDITION_STATES) {
    for (const to of CONDITION_STATES) {
      const expected = DECLARED_PAIRS.has(`${from}->${to}`);
      it(`${from} -> ${to} is ${expected ? 'allowed' : 'disallowed'}`, () => {
        expect(canTransitionCondition(from, to)).toBe(expected);
      });
    }
  }
});

describe('assertCanTransitionCondition', () => {
  it('does not throw for every declared transition', () => {
    for (const pair of DECLARED_PAIRS) {
      const [from, to] = pair.split('->') as [Condition, Condition];
      expect(() => assertCanTransitionCondition(from, to)).not.toThrow();
    }
  });

  it('throws InvalidConditionTransitionError for an undeclared transition', () => {
    expect(() => assertCanTransitionCondition('NE', 'SCRAP')).toThrow(InvalidConditionTransitionError);
  });

  it('throws for any transition out of the terminal SCRAP state', () => {
    for (const to of CONDITION_STATES) {
      if (to === 'SCRAP') continue;
      expect(() => assertCanTransitionCondition('SCRAP', to)).toThrow(InvalidConditionTransitionError);
    }
  });

  it("throws when scrapping a brand-new (NE/NS) unit that hasn't been inspected", () => {
    expect(() => assertCanTransitionCondition('NE', 'SCRAP')).toThrow();
    expect(() => assertCanTransitionCondition('NS', 'SCRAP')).toThrow();
  });
});

describe('isCondition', () => {
  it('recognises every declared state', () => {
    for (const c of CONDITION_STATES) expect(isCondition(c)).toBe(true);
  });

  it('rejects an undeclared value', () => {
    expect(isCondition('DAMAGED')).toBe(false);
  });
});
