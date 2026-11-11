import { describe, it, expect } from 'vitest';
import { MILESTONE_ORDER, nextMilestone, assertCanAdvance, InvalidMilestoneTransitionError, isMilestone } from '../lib/anga-aog-milestones.js';

describe('MILESTONE_ORDER', () => {
  it('matches the declared 10-step chain', () => {
    expect(MILESTONE_ORDER).toEqual([
      'REQUEST_RECEIVED', 'PART_LOCATED', 'QUOTE_ISSUED', 'CUSTOMER_APPROVED', 'PO_PLACED',
      'COLLECTED', 'IN_FLIGHT', 'LANDED', 'CUSTOMS_CLEARED', 'DELIVERED',
    ]);
  });
});

describe('nextMilestone', () => {
  it('returns the following milestone for every non-terminal step', () => {
    for (let i = 0; i < MILESTONE_ORDER.length - 1; i++) {
      expect(nextMilestone(MILESTONE_ORDER[i])).toBe(MILESTONE_ORDER[i + 1]);
    }
  });

  it('returns null for the terminal milestone (DELIVERED)', () => {
    expect(nextMilestone('DELIVERED')).toBeNull();
  });
});

describe('assertCanAdvance', () => {
  it('allows every declared transition', () => {
    for (let i = 0; i < MILESTONE_ORDER.length - 1; i++) {
      expect(() => assertCanAdvance(MILESTONE_ORDER[i], MILESTONE_ORDER[i + 1])).not.toThrow();
    }
  });

  it('throws when skipping a milestone', () => {
    expect(() => assertCanAdvance('REQUEST_RECEIVED', 'QUOTE_ISSUED')).toThrow(InvalidMilestoneTransitionError);
  });

  it('throws when moving backward', () => {
    expect(() => assertCanAdvance('PO_PLACED', 'PART_LOCATED')).toThrow(InvalidMilestoneTransitionError);
  });

  it('throws when advancing past the terminal milestone', () => {
    expect(() => assertCanAdvance('DELIVERED', 'PART_LOCATED')).toThrow(InvalidMilestoneTransitionError);
  });

  it('throws when advancing to the same milestone', () => {
    expect(() => assertCanAdvance('PART_LOCATED', 'PART_LOCATED')).toThrow(InvalidMilestoneTransitionError);
  });
});

describe('isMilestone', () => {
  it('recognises every declared milestone', () => {
    for (const m of MILESTONE_ORDER) expect(isMilestone(m)).toBe(true);
  });

  it('rejects an undeclared value', () => {
    expect(isMilestone('IN_ORBIT')).toBe(false);
  });
});
