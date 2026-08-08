import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/client.js';

type Db = Kysely<Database> | Transaction<Database>;

/**
 * Tax codes that are more than one tax.
 *
 * Most jurisdictions need none of this: a code with no components is a single
 * tax at its own rate, which is every code in Tanzania, Kenya, Uganda, Rwanda
 * and the rest. Ghana is the case that needs it, and it needs both of its
 * shapes — the current one and the one that was law until January 2026 — because
 * invoices issued under the old rules still have to reproduce on a return
 * covering that period.
 */

export interface TaxComponent {
  code: string;
  name: string;
  rate: number;
  basis: 'NET' | 'NET_PLUS_PRIOR';
  recoverable: boolean;
  gl_account_code?: string | null;
}

export interface ComponentAmount extends TaxComponent {
  /** What this component was charged on — net, or net plus everything before it. */
  base: number;
  amount: number;
}

/**
 * Apply a component stack to a net value.
 *
 * `NET_PLUS_PRIOR` is what compounding actually is, spelled out: the component
 * is charged on the line value plus every component already added. Ghana's
 * pre-2026 21.9% came from exactly this — 6% of levies on net, then 15% VAT on
 * net-plus-levies — and it is worth noting that 21.9 is a *result* here, never
 * a number anyone types in.
 */
export function applyComponents(net: number, components: TaxComponent[]): {
  lines: ComponentAmount[];
  total: number;
  recoverable: number;
  nonRecoverable: number;
  effectiveRatePct: number;
} {
  const lines: ComponentAmount[] = [];
  let running = 0;

  for (const c of components) {
    const base = c.basis === 'NET_PLUS_PRIOR' ? net + running : net;
    const amount = base * (Number(c.rate) / 100);
    running += amount;
    lines.push({ ...c, base, amount });
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);
  return {
    lines,
    total,
    recoverable: lines.filter(l => l.recoverable).reduce((s, l) => s + l.amount, 0),
    nonRecoverable: lines.filter(l => !l.recoverable).reduce((s, l) => s + l.amount, 0),
    effectiveRatePct: net === 0 ? 0 : (total / net) * 100,
  };
}

/**
 * The single rate a component stack works out to.
 *
 * This is what belongs in `tax_codes.rate` and what gets snapshotted onto a
 * document line, so every total already written keeps working untouched — the
 * components explain the rate, they do not replace it.
 */
export function effectiveRate(components: TaxComponent[]): number {
  return applyComponents(100, components).total;
}

export async function componentsFor(db: Db, taxCodeId: string): Promise<TaxComponent[]> {
  const rows = await db
    .selectFrom('tax_code_components')
    .select(['code', 'name', 'rate', 'basis', 'recoverable', 'gl_account_code'])
    .where('tax_code_id', '=', taxCodeId)
    .orderBy('sequence', 'asc')
    .execute();
  return rows.map(r => ({
    code: r.code, name: r.name, rate: Number(r.rate),
    basis: r.basis as TaxComponent['basis'], recoverable: r.recoverable,
    gl_account_code: r.gl_account_code,
  }));
}

/**
 * Component templates, so a jurisdiction that needs a stack can be set up
 * without anyone deriving the arithmetic by hand.
 *
 * Reference material, dated for the same reason `tax_jurisdictions` rows are:
 * Ghana's own stack changed on 1 January 2026 and will change again.
 */
export const COMPONENT_TEMPLATES: Record<string, {
  label: string; asOf: string; note: string; components: TaxComponent[];
}[]> = {
  GH: [
    {
      label: 'Ghana standard, from 1 January 2026 (20%)',
      asOf: '2026-01-01',
      note:
        'The COVID-19 Health Recovery Levy was abolished and NHIL and GETFund were re-coupled ' +
        'into the VAT base and made input-creditable. All three are charged on the net value, ' +
        'so there is no compounding and the combined rate is a flat 20%.',
      components: [
        { code: 'VAT',     name: 'Value Added Tax',            rate: 15,  basis: 'NET', recoverable: true },
        { code: 'NHIL',    name: 'National Health Insurance Levy', rate: 2.5, basis: 'NET', recoverable: true },
        { code: 'GETFUND', name: 'GETFund Levy',               rate: 2.5, basis: 'NET', recoverable: true },
      ],
    },
    {
      label: 'Ghana, before 1 January 2026 (21.9% effective)',
      asOf: '2023-01-01',
      note:
        'Levies were charged on the net value and VAT was then charged on net plus levies — the ' +
        'compounding that produced 21.9% rather than 21%. None of the levies could be reclaimed ' +
        'as input tax. Kept because invoices issued under these rules still have to reproduce.',
      components: [
        { code: 'NHIL',    name: 'National Health Insurance Levy', rate: 2.5, basis: 'NET', recoverable: false },
        { code: 'GETFUND', name: 'GETFund Levy',               rate: 2.5, basis: 'NET', recoverable: false },
        { code: 'COVID',   name: 'COVID-19 Health Recovery Levy', rate: 1, basis: 'NET', recoverable: false },
        { code: 'VAT',     name: 'Value Added Tax',            rate: 15,  basis: 'NET_PLUS_PRIOR', recoverable: true },
      ],
    },
  ],
};
