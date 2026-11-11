/**
 * ANGA AOG case milestone chain — ported verbatim from the standalone Gereji
 * app's lib/anga/aog-milestones.ts. Pure, no I/O. Linear, no skipping.
 */
export const MILESTONE_ORDER = [
  'REQUEST_RECEIVED',
  'PART_LOCATED',
  'QUOTE_ISSUED',
  'CUSTOMER_APPROVED',
  'PO_PLACED',
  'COLLECTED',
  'IN_FLIGHT',
  'LANDED',
  'CUSTOMS_CLEARED',
  'DELIVERED',
] as const;

export type Milestone = typeof MILESTONE_ORDER[number];

export class InvalidMilestoneTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot advance AOG case from "${from}" to "${to}" — milestones are linear, no skipping`);
    this.name = 'InvalidMilestoneTransitionError';
  }
}

export function isMilestone(value: string): value is Milestone {
  return (MILESTONE_ORDER as readonly string[]).includes(value);
}

/** The single milestone that follows `current`, or null if `current` is terminal (DELIVERED). */
export function nextMilestone(current: Milestone): Milestone | null {
  const idx = MILESTONE_ORDER.indexOf(current);
  return idx >= 0 && idx < MILESTONE_ORDER.length - 1 ? MILESTONE_ORDER[idx + 1] : null;
}

/** Throws InvalidMilestoneTransitionError unless `to` is exactly the next milestone after `from`. */
export function assertCanAdvance(from: Milestone, to: Milestone): void {
  if (nextMilestone(from) !== to) {
    throw new InvalidMilestoneTransitionError(from, to);
  }
}
