/**
 * The declaration vocabulary — statuses, TRA selectivity lanes and the two
 * formatters that go with them.
 *
 * This lived inside `pages/ClearOSDeclarations.tsx`. That page is being folded
 * into Ops (`/clearos/ops`), and this is the part of it that is genuinely
 * shared knowledge rather than page layout: the order a TANSAD moves through,
 * what each lane means, and how a customs value is written. Ops reads it now,
 * and anything else that needs to describe a declaration should read it here
 * rather than restating the list.
 */

export type DeclarationStatus =
  | 'DRAFT' | 'VALIDATED' | 'SAVED' | 'TRANSFERRED' | 'ACCEPTED'
  | 'ASSESSED' | 'PAID' | 'RELEASED' | 'AMENDED' | 'CANCELLED';

export type BadgeVariant = 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray';

/** Filing order, which is also the order these are offered in a filter. */
export const STATUS_ORDER: DeclarationStatus[] = [
  'DRAFT', 'VALIDATED', 'SAVED', 'TRANSFERRED', 'ACCEPTED',
  'ASSESSED', 'PAID', 'RELEASED', 'AMENDED', 'CANCELLED',
];

export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT: 'gray', VALIDATED: 'info', SAVED: 'info', TRANSFERRED: 'brand',
  ACCEPTED: 'brand', ASSESSED: 'warning', PAID: 'info', RELEASED: 'success',
  AMENDED: 'warning', CANCELLED: 'error',
};

/** Title-case for a label; the API stores these upper-case. */
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export const DECLARATION_STATUSES: { value: DeclarationStatus; label: string }[] =
  STATUS_ORDER.map(v => ({ value: v, label: title(v) }));

/**
 * The lane TRA assigns. These colours are the literal ones customs uses —
 * green is straight through, red is a physical examination — so they are
 * deliberately not themed to the app accent.
 */
export const LANE: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info'; hint: string }> = {
  GREEN:  { label: 'Green',  variant: 'success', hint: 'Straight through — no examination' },
  YELLOW: { label: 'Yellow', variant: 'warning', hint: 'Documentary check' },
  RED:    { label: 'Red',    variant: 'error',   hint: 'Physical examination required' },
  BLUE:   { label: 'Blue',   variant: 'info',    hint: 'Post-clearance audit' },
};

export const LANES = Object.entries(LANE).map(([value, m]) => ({ value, label: m.label }));

export const declMoney = (v: string | number | null | undefined, ccy = 'TZS') => {
  const n = Number(v ?? 0);
  if (!n) return '—';
  return `${ccy} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export const declDate = (s: string | null | undefined) =>
  (s ? new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
