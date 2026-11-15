// Rule catalog for the Pulse segment builder.
//
// Contacts reuse the Contacts smart-group catalog unchanged (the API compiles
// contacts rules with the same ContactsService code). Leads, customers and
// engagement mirror apps/api/src/services/pulse-segments.service.ts — the API
// re-validates every rule, so a drift here is a UX bug, never a data one.

import { SMART_FIELDS as CONTACT_FIELDS, type SmartOpOption } from '../contacts/smartGroupFields.js';

export type PulseSource = 'contacts' | 'leads' | 'customers';
export type ValueKind = SmartOpOption['value'] | 'number' | 'campaign' | 'stage' | 'territory' | 'tier';
export interface OpOption { op: string; label: string; value: ValueKind }
export interface FieldOption { field: string; label: string; group: string; ops: OpOption[] }

const TEXT: OpOption[] = [
  { op: 'eq', label: 'is', value: 'text' },
  { op: 'neq', label: 'is not', value: 'text' },
  { op: 'contains', label: 'contains', value: 'text' },
  { op: 'not_contains', label: "doesn't contain", value: 'text' },
  { op: 'is_set', label: 'is set', value: 'none' },
  { op: 'is_empty', label: 'is empty', value: 'none' },
];
const IS: OpOption[] = [{ op: 'eq', label: 'is', value: 'text' }, { op: 'neq', label: 'is not', value: 'text' }];
const YESNO: OpOption[] = [{ op: 'is_true', label: 'yes', value: 'none' }, { op: 'is_false', label: 'no', value: 'none' }];
const DAYS: OpOption[] = [
  { op: 'within_days', label: 'in the last … days', value: 'days' },
  { op: 'before_days', label: 'more than … days ago', value: 'days' },
];
const person = (label: string): OpOption[] => [
  { op: 'eq', label: 'is', value: 'user' },
  { op: 'neq', label: 'is not', value: 'user' },
  { op: 'is_set', label: `has ${label}`, value: 'none' },
  { op: 'is_empty', label: `has no ${label}`, value: 'none' },
];

const ENGAGEMENT: FieldOption[] = [
  {
    field: 'campaign', label: 'Campaign', group: 'Engagement', ops: [
      { op: 'received', label: 'received', value: 'campaign' },
      { op: 'not_received', label: 'did not receive', value: 'campaign' },
      { op: 'opened', label: 'opened', value: 'campaign' },
      { op: 'clicked', label: 'clicked in', value: 'campaign' },
    ],
  },
  {
    field: 'engagement', label: 'Email engagement', group: 'Engagement', ops: [
      { op: 'opened_within_days', label: 'opened in the last … days', value: 'days' },
      { op: 'clicked_within_days', label: 'clicked in the last … days', value: 'days' },
      { op: 'not_opened_within_days', label: 'no opens in the last … days', value: 'days' },
    ],
  },
  {
    field: 'target_account', label: 'Company is a target account', group: 'Engagement', ops: [
      { op: 'is_target', label: 'any tier', value: 'none' },
      { op: 'is_hot', label: 'that is hot right now', value: 'none' },
      { op: 'tier_is', label: 'in tier', value: 'tier' },
    ],
  },
];

const LEADS: FieldOption[] = [
  { field: 'stage', label: 'Stage', group: 'Pipeline', ops: [{ op: 'eq', label: 'is', value: 'stage' }, { op: 'neq', label: 'is not', value: 'stage' }] },
  { field: 'source', label: 'Lead source', group: 'Pipeline', ops: IS },
  { field: 'priority', label: 'Priority', group: 'Pipeline', ops: IS },
  { field: 'value', label: 'Deal value', group: 'Pipeline', ops: [{ op: 'gte', label: 'at least', value: 'number' }, { op: 'lte', label: 'at most', value: 'number' }] },
  { field: 'company', label: 'Company', group: 'Details', ops: TEXT },
  { field: 'industry', label: 'Industry', group: 'Details', ops: TEXT },
  { field: 'location', label: 'Location', group: 'Details', ops: TEXT },
  { field: 'assigned_to_id', label: 'Owner', group: 'Ownership', ops: person('an owner') },
  { field: 'territory_id', label: 'Territory', group: 'Ownership', ops: [
    { op: 'eq', label: 'is', value: 'territory' }, { op: 'neq', label: 'is not', value: 'territory' },
    { op: 'is_set', label: 'has a territory', value: 'none' }, { op: 'is_empty', label: 'has no territory', value: 'none' },
  ] },
  { field: 'has_email', label: 'Has email', group: 'Status', ops: YESNO },
  { field: 'has_phone', label: 'Has phone', group: 'Status', ops: YESNO },
  { field: 'created', label: 'Created', group: 'Dates', ops: DAYS },
  { field: 'updated', label: 'Last updated', group: 'Dates', ops: DAYS },
];

const CUSTOMERS: FieldOption[] = [
  { field: 'name', label: 'Company name', group: 'Details', ops: TEXT },
  { field: 'category', label: 'Category', group: 'Details', ops: IS },
  { field: 'client_type', label: 'Client type', group: 'Details', ops: IS },
  { field: 'account_status', label: 'Account status', group: 'Details', ops: IS },
  { field: 'city', label: 'City', group: 'Location', ops: TEXT },
  { field: 'country', label: 'Country', group: 'Location', ops: TEXT },
  { field: 'assigned_officer_id', label: 'Account officer', group: 'Ownership', ops: person('an officer') },
  { field: 'is_partner', label: 'Is a partner', group: 'Status', ops: YESNO },
  { field: 'has_email', label: 'Has email', group: 'Status', ops: YESNO },
  { field: 'has_phone', label: 'Has phone', group: 'Status', ops: YESNO },
  { field: 'created', label: 'Added', group: 'Dates', ops: DAYS },
];

export const FIELDS: Record<PulseSource, FieldOption[]> = {
  contacts: [...(CONTACT_FIELDS as FieldOption[]), ...ENGAGEMENT],
  leads: [...LEADS, ...ENGAGEMENT],
  customers: [...CUSTOMERS, ...ENGAGEMENT],
};

export const SOURCE_LABEL: Record<PulseSource, string> = { contacts: 'Contacts', leads: 'CRM leads', customers: 'Customers' };

export const fieldOf = (source: PulseSource, field: string) => FIELDS[source].find((f) => f.field === field);
export const opOf = (source: PulseSource, field: string, op: string) => fieldOf(source, field)?.ops.find((o) => o.op === op);
