import { assertCanTransitionCondition, type Condition } from './anga-stock-condition.js';
import type { Availability } from './anga-stock-availability.js';

/**
 * Maps a goods-receipt inspection outcome onto the condition/availability
 * targets a stock unit should land on. Ported verbatim from the standalone
 * Gereji app's lib/anga/goods-receipt-disposition.ts. Pure, no I/O — reuses
 * the condition state machine for validation, so an illegal starting state
 * (e.g. inspecting a unit that's already SCRAP) still throws
 * InvalidConditionTransitionError.
 */
export type InspectionOutcome = 'accepted' | 'quarantined' | 'rejected';

export type Disposition = {
  condition: Condition;
  availability: Availability;
};

export function resolveDisposition(outcome: InspectionOutcome, currentCondition: Condition): Disposition {
  let condition = currentCondition;
  if (condition !== 'IN') {
    assertCanTransitionCondition(condition, 'IN');
    condition = 'IN';
  }

  if (outcome === 'accepted') {
    assertCanTransitionCondition(condition, 'SV');
    return { condition: 'SV', availability: 'AVAILABLE' };
  }

  if (outcome === 'rejected') {
    assertCanTransitionCondition(condition, 'US');
    return { condition: 'US', availability: 'QUARANTINE' };
  }

  // "quarantined" — inspected, but not yet dispositioned; held.
  return { condition: 'IN', availability: 'QUARANTINE' };
}
