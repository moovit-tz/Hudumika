/**
 * The platform's single condition-operator vocabulary.
 *
 * Extracted from workflow-resolver.service.ts's evaluateEntryConditions so the
 * ClearOS step engine and Studio share one implementation. A second copy would
 * drift — the two landed-cost engines and the duplicated money parser are the
 * precedent, and both drifted within weeks.
 *
 * Semantics for the operators that were already in use (`required`,
 * `not_empty`, `equals`, `contains`, `greater_than`, `less_than`) are preserved
 * exactly. The remaining entries are aliases the Studio node editor emits.
 */

export type ConditionOperator =
  | 'required' | 'not_empty' | 'is_not_empty'
  | 'is_empty'
  | 'equals' | '=' | 'not_equals' | '!='
  | 'contains'
  | 'greater_than' | '>' | 'greater_or_equal' | '>='
  | 'less_than' | '<' | 'less_or_equal' | '<=';

export interface OperatorResult {
  ok: boolean;
  /** True when the operator was not recognised — callers decide how loudly to fail. */
  unknownOperator: boolean;
}

function isPresent(raw: unknown): boolean {
  return raw !== null && raw !== undefined && String(raw).trim() !== '';
}

export function applyOperator(raw: unknown, operator: string, value?: unknown): OperatorResult {
  switch (operator) {
    case 'required':
    case 'not_empty':
    case 'is_not_empty':
      return { ok: isPresent(raw), unknownOperator: false };
    case 'is_empty':
      return { ok: !isPresent(raw), unknownOperator: false };
    case 'equals':
    case '=':
      return { ok: String(raw ?? '') === String(value ?? ''), unknownOperator: false };
    case 'not_equals':
    case '!=':
      return { ok: String(raw ?? '') !== String(value ?? ''), unknownOperator: false };
    case 'contains':
      return { ok: String(raw ?? '').toLowerCase().includes(String(value ?? '').toLowerCase()), unknownOperator: false };
    case 'greater_than':
    case '>':
      return { ok: Number(raw) > Number(value), unknownOperator: false };
    case 'greater_or_equal':
    case '>=':
      return { ok: Number(raw) >= Number(value), unknownOperator: false };
    case 'less_than':
    case '<':
      return { ok: Number(raw) < Number(value), unknownOperator: false };
    case 'less_or_equal':
    case '<=':
      return { ok: Number(raw) <= Number(value), unknownOperator: false };
    default:
      // An operator nobody recognises must not let a gate through. The old
      // inline version returned `raw !== undefined` here, which *passed*
      // whenever the field merely existed — the opposite of what its own
      // "fail safe" comment claimed. No stored condition uses an unknown
      // operator (only `required` appears in workflow_steps), so correcting
      // this changes no existing behaviour.
      return { ok: false, unknownOperator: true };
  }
}

/** Reads `a.b.c` out of a nested event payload. */
export function readField(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, part) => (acc != null && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    source,
  );
}
