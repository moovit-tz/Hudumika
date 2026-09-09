// Catalog the smart-group rule builder reads for its dropdowns.
//
// This MIRRORS the API's authoritative `SMART_FIELDS` map in
// apps/api/src/services/contacts.service.ts — keep the two in step. The
// server re-validates every rule on save and silently drops any it no
// longer understands on evaluation, so a drift here is a UX bug, never a
// data-integrity one.

export type SmartValueKind = 'none' | 'text' | 'days' | 'label' | 'user';

export interface SmartOpOption {
  op: string;
  label: string;
  /** what the value input should be for this operator */
  value: SmartValueKind;
}

export interface SmartFieldSpec {
  field: string;
  label: string;
  group: string;
  ops: SmartOpOption[];
}

const TEXT_OPS: SmartOpOption[] = [
  { op: 'eq', label: 'is', value: 'text' },
  { op: 'neq', label: 'is not', value: 'text' },
  { op: 'contains', label: 'contains', value: 'text' },
  { op: 'not_contains', label: "doesn't contain", value: 'text' },
  { op: 'is_set', label: 'is set', value: 'none' },
  { op: 'is_empty', label: 'is empty', value: 'none' },
];

const YESNO_OPS: SmartOpOption[] = [
  { op: 'is_true', label: 'yes', value: 'none' },
  { op: 'is_false', label: 'no', value: 'none' },
];

export const SMART_FIELDS: SmartFieldSpec[] = [
  { field: 'company', label: 'Company', group: 'Details', ops: TEXT_OPS },
  { field: 'job_title', label: 'Job title', group: 'Details', ops: TEXT_OPS },
  { field: 'industry', label: 'Industry', group: 'Details', ops: TEXT_OPS },
  { field: 'city', label: 'City', group: 'Location', ops: TEXT_OPS },
  { field: 'country', label: 'Country', group: 'Location', ops: TEXT_OPS },
  {
    field: 'source', label: 'Source', group: 'Details', ops: [
      { op: 'eq', label: 'is', value: 'text' },
      { op: 'neq', label: 'is not', value: 'text' },
    ],
  },
  {
    field: 'sales_owner_id', label: 'Sales owner', group: 'Ownership', ops: [
      { op: 'eq', label: 'is', value: 'user' },
      { op: 'neq', label: 'is not', value: 'user' },
      { op: 'is_set', label: 'is assigned', value: 'none' },
      { op: 'is_empty', label: 'is unassigned', value: 'none' },
    ],
  },
  {
    field: 'label', label: 'Label', group: 'Labels', ops: [
      { op: 'has', label: 'includes', value: 'label' },
      { op: 'not_has', label: 'excludes', value: 'label' },
    ],
  },
  { field: 'is_favorite', label: 'Favourite', group: 'Status', ops: YESNO_OPS },
  { field: 'has_email', label: 'Has email', group: 'Status', ops: YESNO_OPS },
  { field: 'has_phone', label: 'Has phone', group: 'Status', ops: YESNO_OPS },
  { field: 'has_birthday', label: 'Has birthday', group: 'Status', ops: YESNO_OPS },
  {
    field: 'created', label: 'Added', group: 'Dates', ops: [
      { op: 'within_days', label: 'in the last … days', value: 'days' },
      { op: 'before_days', label: 'more than … days ago', value: 'days' },
    ],
  },
  {
    field: 'last_contacted', label: 'Last contacted', group: 'Dates', ops: [
      { op: 'within_days', label: 'in the last … days', value: 'days' },
      { op: 'before_days', label: 'more than … days ago', value: 'days' },
      { op: 'is_empty', label: 'never', value: 'none' },
    ],
  },
];

export function fieldSpec(field: string): SmartFieldSpec | undefined {
  return SMART_FIELDS.find(f => f.field === field);
}

export function opSpec(field: string, op: string): SmartOpOption | undefined {
  return fieldSpec(field)?.ops.find(o => o.op === op);
}

/** Human-readable one-liner for a saved rule, used in the sidebar tooltip / summary. */
export function describeRule(rule: { field: string; op: string; value?: unknown }, labelName?: (id: string) => string): string {
  const f = fieldSpec(rule.field);
  const o = opSpec(rule.field, rule.op);
  const fname = f?.label ?? rule.field;
  const oname = o?.label ?? rule.op;
  if (!o || o.value === 'none') return `${fname} ${oname}`;
  if (o.value === 'days') return `${fname} ${oname.replace('…', String(rule.value ?? '?'))}`;
  if (o.value === 'label') return `${fname} ${oname} ${labelName?.(String(rule.value ?? '')) ?? '…'}`;
  return `${fname} ${oname} "${rule.value ?? ''}"`;
}
