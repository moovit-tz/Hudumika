/**
 * ANGA stock unit availability axis — ported verbatim from the standalone
 * Gereji app's lib/anga/stock-availability.ts. Pure, no I/O.
 */
export const AVAILABILITY_STATES = ['AVAILABLE', 'RESERVED', 'ALLOCATED', 'ON_LOAN', 'IN_REPAIR', 'QUARANTINE', 'SOLD', 'SCRAPPED'] as const;
export type Availability = typeof AVAILABILITY_STATES[number];

/** Declared transitions, excluding the QUARANTINE blanket rule handled separately below. */
export const AVAILABILITY_TRANSITIONS: Record<Availability, Availability[]> = {
  AVAILABLE: ['RESERVED', 'ON_LOAN', 'IN_REPAIR'],
  RESERVED: ['ALLOCATED', 'AVAILABLE'],
  ALLOCATED: ['AVAILABLE', 'SOLD'],
  ON_LOAN: ['AVAILABLE'],
  IN_REPAIR: ['AVAILABLE'],
  QUARANTINE: ['AVAILABLE', 'SCRAPPED'],
  SOLD: [],
  SCRAPPED: [],
};

const TERMINAL: Availability[] = ['SOLD', 'SCRAPPED'];

export class InvalidAvailabilityTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition stock unit availability from "${from}" to "${to}"`);
    this.name = 'InvalidAvailabilityTransitionError';
  }
}

export function isAvailability(value: string): value is Availability {
  return (AVAILABILITY_STATES as readonly string[]).includes(value);
}

export function canTransitionAvailability(from: Availability, to: Availability): boolean {
  if (TERMINAL.includes(from)) return false;
  if (to === 'QUARANTINE') return true; // "ANY (except SOLD/SCRAPPED) -> QUARANTINE"
  return AVAILABILITY_TRANSITIONS[from].includes(to);
}

export function assertCanTransitionAvailability(from: Availability, to: Availability): void {
  if (!canTransitionAvailability(from, to)) {
    throw new InvalidAvailabilityTransitionError(from, to);
  }
}
