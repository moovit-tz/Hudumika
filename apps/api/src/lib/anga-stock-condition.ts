/**
 * ANGA stock unit condition axis — ported verbatim from the standalone
 * Gereji app's lib/anga/stock-condition.ts. Pure, no I/O.
 */
export const CONDITION_STATES = ['NE', 'NS', 'OH', 'SV', 'IN', 'RP', 'AR', 'US', 'SCRAP'] as const;
export type Condition = typeof CONDITION_STATES[number];

/** Declared transitions, excluding the SCRAP blanket rule handled separately below. */
export const CONDITION_TRANSITIONS: Record<Condition, Condition[]> = {
  NE: ['IN'],
  NS: ['IN'],
  AR: ['IN'],
  IN: ['SV', 'US', 'RP'],
  RP: ['OH', 'SCRAP'],
  OH: ['SV'],
  US: ['RP', 'SCRAP'],
  SV: [],
  SCRAP: [],
};

/** Per the table's literal enumeration, NE/NS are excluded — a new part must be
 *  inspected into IN before it can be scrapped. */
const SCRAP_ELIGIBLE: Condition[] = ['SV', 'OH', 'IN', 'RP', 'AR', 'US'];

export class InvalidConditionTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition stock unit condition from "${from}" to "${to}"`);
    this.name = 'InvalidConditionTransitionError';
  }
}

export function isCondition(value: string): value is Condition {
  return (CONDITION_STATES as readonly string[]).includes(value);
}

export function canTransitionCondition(from: Condition, to: Condition): boolean {
  if (from === 'SCRAP') return false; // terminal
  if (to === 'SCRAP') return SCRAP_ELIGIBLE.includes(from);
  return CONDITION_TRANSITIONS[from].includes(to);
}

export function assertCanTransitionCondition(from: Condition, to: Condition): void {
  if (!canTransitionCondition(from, to)) {
    throw new InvalidConditionTransitionError(from, to);
  }
}
