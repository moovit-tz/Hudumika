import { sql } from 'kysely';
import { db } from '../db/client.js';

/**
 * The feedback loop: what the platform observed, and what it learned from it.
 *
 * Every function here is tenant-scoped by an explicit `tenant_id` filter.
 * That is not belt-and-braces — this file exists to turn one tenant's history
 * into advice, and a missing filter would quietly advise them using a
 * competitor's costings.
 *
 * Two rules run through all of it:
 *
 *  1. Nothing learned may ever replace a sourced figure. Duty, VAT, RDL, CPF,
 *     wharfage and PID come from the tariff and from published TPA rates. A
 *     "learned" duty rate is a fabricated duty rate. Learning applies only to
 *     commercial heads — freight, ICD, agency, transport — and to timing.
 *  2. Nothing is returned without its sample size. A median of two is not a
 *     prior, and the caller must be able to say so.
 */

/** Below this, history is an anecdote. Callers are told, not silently given
 *  a number computed from one shipment. */
export const MIN_SAMPLE = 3;

/**
 * The calculator's own cards, used as the vocabulary for actual costs so
 * variance needs no mapping table. DUTY_TAXES is included for completeness of
 * the comparison but is never a *learning* target — see rule 1 above.
 */
export const CHARGE_HEADS = [
  'DUTY_TAXES', 'FREIGHT', 'INSURANCE', 'TPA', 'ICD', 'TBS',
  'SHIPPING_LINE', 'CLEARANCE_AGENCY', 'TRANSPORT', 'OTHER',
] as const;
export type ChargeHead = typeof CHARGE_HEADS[number];

/** Heads whose figures are statutory. Learning must never touch these. */
export const SOURCED_HEADS: ReadonlySet<string> = new Set(['DUTY_TAXES', 'TPA']);

// ── HS classification memory ────────────────────────────────────────────────

export interface HsMemoryHit {
  code: string;
  /** How many times this tenant declared this code for similar goods. */
  times: number;
  /** The closest previously-classified wording, so the user can judge whether
   *  "similar" really means similar. */
  closestDescription: string;
  /** 0–1 trigram similarity of the closest match. */
  similarity: number;
  lastUsed: Date;
}

/**
 * What this tenant has previously declared for goods described like this.
 *
 * This is the single strongest signal available for HS suggestion and it is
 * not derivable from the tariff text: word-frequency ranking cannot separate
 * "Screws; bolts and nuts" from "Bolt action" because both contain "bolt",
 * whereas a tenant who has declared fasteners fourteen times has answered the
 * question already.
 *
 * Deliberately *evidence*, not an answer: it reports what was done before and
 * how similar the wording was. A wrong code declared consistently is still a
 * wrong code, so nothing here bypasses the human acceptance step.
 */
export async function hsMemory(tenantId: string, description: string, limit = 3): Promise<HsMemoryHit[]> {
  const text = description.trim().toLowerCase();
  if (text.length < 4) return [];

  const rows = await db
    .selectFrom('hs_classification_events')
    .select(['accepted_code', 'description', 'created_at'])
    .select(sql<number>`similarity(lower(description), ${text})`.as('sim'))
    .where('tenant_id', '=', tenantId)
    .where('accepted_code', 'is not', null)
    // 0.3 is pg_trgm's own default threshold — close enough that the previous
    // wording is recognisably the same goods, loose enough to survive a model
    // number differing between two lines of the same invoice.
    .where(sql<boolean>`similarity(lower(description), ${text}) > 0.3`)
    .orderBy(sql`similarity(lower(description), ${text})`, 'desc')
    .limit(60)
    .execute();

  const byCode = new Map<string, HsMemoryHit>();
  for (const r of rows) {
    const code = r.accepted_code as string;
    const sim = Number((r as any).sim) || 0;
    const hit = byCode.get(code);
    if (!hit) {
      byCode.set(code, { code, times: 1, closestDescription: r.description, similarity: sim, lastUsed: r.created_at });
    } else {
      hit.times += 1;
      if (sim > hit.similarity) { hit.similarity = sim; hit.closestDescription = r.description; }
      if (r.created_at > hit.lastUsed) hit.lastUsed = r.created_at;
    }
  }

  return [...byCode.values()]
    // Frequency first, then closeness: a code used ten times for roughly this
    // wording beats one used once for almost exactly it.
    .sort((a, b) => b.times - a.times || b.similarity - a.similarity)
    .slice(0, limit);
}

// ── Commercial-charge priors ────────────────────────────────────────────────

export interface ChargePrior {
  head: string;
  /** Median, not mean: one demurrage disaster must not move the prior. */
  medianTzs: number;
  sample: number;
  windowDays: number;
}

/**
 * What this tenant actually paid, per charge head, over a recent window.
 *
 * Median over mean is deliberate. Actual clearing costs are long-tailed — one
 * shipment that sat for three weeks would drag a mean somewhere no future
 * shipment will ever be, and it is precisely the calm middle that makes a
 * useful default.
 */
export async function chargePriors(tenantId: string, windowDays = 180): Promise<ChargePrior[]> {
  const rows = await db
    .selectFrom('expenses')
    .select(['charge_head'])
    .select(sql<number>`percentile_cont(0.5) within group (order by amount_tzs)`.as('median'))
    .select(sql<string>`count(*)`.as('n'))
    .where('tenant_id', '=', tenantId)
    .where('charge_head', 'is not', null)
    .where('is_revenue', '=', false)
    .where(sql<boolean>`created_at > now() - (${windowDays} || ' days')::interval`)
    .groupBy('charge_head')
    .execute();

  return rows
    .map(r => ({
      head: r.charge_head as string,
      medianTzs: Math.round(Number((r as any).median) || 0),
      sample: Number((r as any).n) || 0,
      windowDays,
    }))
    // A statutory head has no business being "learned", and anything thinner
    // than MIN_SAMPLE is not a prior at all.
    .filter(p => !SOURCED_HEADS.has(p.head) && p.sample >= MIN_SAMPLE);
}

// ── Estimate vs actual ──────────────────────────────────────────────────────

export interface VarianceLine {
  head: string;
  estimatedTzs: number | null;
  actualTzs: number | null;
  /** Null when either side is missing — an unknown is not a zero variance. */
  varianceTzs: number | null;
  variancePct: number | null;
}

/** Pulls the per-head estimate out of a stored calculation payload. */
function estimateByHead(payload: any): Partial<Record<ChargeHead, number>> {
  const t = payload?.result?.totals ?? payload?.result;
  if (!t) return {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const out: Partial<Record<ChargeHead, number>> = {
    DUTY_TAXES: n(t.duty) + n(t.excise) + n(t.rdl) + n(t.cpf) + n(t.vat),
    TPA: n(t.wharfage) + n(t.pid) + n(t.green_port_initiative),
    ICD: n(t.destination),
    TBS: n(t.tbs_charge),
    SHIPPING_LINE: n(t.shipping_line_charge),
    FREIGHT: n(t.freight_tzs),
    INSURANCE: n(t.insurance_tzs),
  };
  for (const k of Object.keys(out) as ChargeHead[]) if (!out[k]) delete out[k];
  return out;
}

/**
 * The comparison the whole loop exists to produce.
 *
 * Where one side is missing the variance is null rather than the full value of
 * the other — "we estimated 900k and have recorded nothing yet" is not a 100%
 * saving, and reporting it as one would make the whole panel untrustworthy the
 * first time somebody read it mid-clearance.
 */
export async function shipmentVariance(tenantId: string, shipmentId: string): Promise<{
  estimate: { id: string; created_at: Date; total_tzs: number | null } | null;
  lines: VarianceLine[];
  actualTotalTzs: number;
  estimatedTotalTzs: number;
}> {
  const estimate = await db
    .selectFrom('landed_cost_records')
    .select(['id', 'created_at', 'total_tzs', 'payload'])
    .where('tenant_id', '=', tenantId)
    .where('shipment_id', '=', shipmentId)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();

  const actuals = await db
    .selectFrom('expenses')
    .select(['charge_head'])
    .select(sql<string>`sum(amount_tzs)`.as('total'))
    .where('tenant_id', '=', tenantId)
    .where('shipment_id', '=', shipmentId)
    .where('is_revenue', '=', false)
    .groupBy('charge_head')
    .execute();

  const est = estimate?.payload ? estimateByHead(estimate.payload) : {};
  const act = new Map<string, number>();
  for (const a of actuals) act.set(a.charge_head ?? 'OTHER', Number((a as any).total) || 0);

  const heads = [...new Set([...Object.keys(est), ...act.keys()])];
  const lines: VarianceLine[] = heads.map(head => {
    const e = (est as any)[head] ?? null;
    const a = act.has(head) ? act.get(head)! : null;
    const variance = e != null && a != null ? a - e : null;
    return {
      head,
      estimatedTzs: e,
      actualTzs: a,
      varianceTzs: variance,
      variancePct: variance != null && e ? Math.round((variance / e) * 1000) / 10 : null,
    };
  }).sort((x, y) => (y.estimatedTzs ?? 0) - (x.estimatedTzs ?? 0));

  return {
    estimate: estimate ? { id: estimate.id, created_at: estimate.created_at, total_tzs: estimate.total_tzs } : null,
    lines,
    actualTotalTzs: [...act.values()].reduce((s, v) => s + v, 0),
    estimatedTotalTzs: Object.values(est).reduce((s: number, v) => s + (v as number), 0),
  };
}

// ── Trade Wizard & compliance accuracy ──────────────────────────────────────

/**
 * How often a Trade Wizard procedure turned out to be the right one.
 *
 * Reported per procedure with its sample, because the useful action is
 * per-procedure: a single badly-mapped procedure among hundreds is invisible
 * in an aggregate accuracy number and obvious here.
 */
export async function wizardAccuracy(tenantId: string | null) {
  let q = db
    .selectFrom('trade_wizard_outcomes')
    .select(['procedure_id', 'procedure_name'])
    .select(sql<string>`count(*)`.as('selected'))
    .select(sql<string>`count(*) filter (where outcome = 'completed')`.as('confirmed'))
    .select(sql<string>`count(*) filter (where outcome = 'wrong')`.as('wrong'))
    .groupBy(['procedure_id', 'procedure_name']);
  if (tenantId) q = q.where('tenant_id', '=', tenantId);

  return (await q.execute())
    .map(r => {
      const selected = Number((r as any).selected) || 0;
      const confirmed = Number((r as any).confirmed) || 0;
      const wrong = Number((r as any).wrong) || 0;
      const judged = confirmed + wrong;
      return {
        procedureId: r.procedure_id,
        procedureName: r.procedure_name,
        selected, confirmed, wrong,
        // Null until somebody actually reported back. An unreported procedure
        // is not a 100%-accurate one.
        accuracyPct: judged >= MIN_SAMPLE ? Math.round((confirmed / judged) * 100) : null,
        judged,
      };
    })
    .sort((a, b) => b.selected - a.selected);
}

/**
 * Which compliance requirements the rules got right.
 *
 * `unexpected` is the column that matters: a requirement enforced without
 * having been predicted is a rule gap, and it is the only class of error here
 * that costs the tenant a delay rather than a wasted certificate.
 */
export async function complianceAccuracy(tenantId: string | null) {
  let q = db
    .selectFrom('compliance_outcomes')
    .select(['requirement'])
    .select(sql<string>`count(*)`.as('reported'))
    .select(sql<string>`count(*) filter (where predicted and actual = 'applied')`.as('true_positive'))
    .select(sql<string>`count(*) filter (where predicted and actual = 'not_applied')`.as('false_positive'))
    .select(sql<string>`count(*) filter (where actual = 'unexpected')`.as('missed'))
    .groupBy('requirement');
  if (tenantId) q = q.where('tenant_id', '=', tenantId);

  return (await q.execute())
    .map(r => {
      const reported = Number((r as any).reported) || 0;
      const tp = Number((r as any).true_positive) || 0;
      const fp = Number((r as any).false_positive) || 0;
      const missed = Number((r as any).missed) || 0;
      return {
        requirement: r.requirement,
        reported, truePositive: tp, falsePositive: fp, missed,
        precisionPct: reported >= MIN_SAMPLE && tp + fp > 0 ? Math.round((tp / (tp + fp)) * 100) : null,
      };
    })
    .sort((a, b) => b.reported - a.reported);
}
