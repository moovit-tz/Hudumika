import { z } from 'zod';
import { dbPlatform, withTenant, type Database } from '../db/client.js';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { PaymentGateway } from '../integrations/payment-gateway.js';
import { buildPriceSnapshot } from './subscription-billing.service.js';

export const freightBundleKey = 'freight-forwarder';
export const freightUnitRate = z.number().int().min(0).max(1_000_000_000);
export const freightDiscount = z.number().int().min(0).max(100);
export const freightDraft = z.object({
  discount_percent: freightDiscount,
  rates: z.object({ clearos: freightUnitRate, hudufreight: freightUnitRate, cargotracker: freightUnitRate }),
});

export function quoteFreightLine(product_key: string, quantity: number, unit_price_tzs: number, discount: number) {
  const subtotal_tzs = quantity * unit_price_tzs;
  const discount_tzs = Number((BigInt(subtotal_tzs) * BigInt(discount) + 50n) / 100n);
  return { product_key, quantity, unit_price_tzs, subtotal_tzs, discount_tzs, total_tzs: subtotal_tzs - discount_tzs };
}

interface FreightPilotRate {
  startsAt: Date;
  revision: number;
  effective_on: string;
  configuration: z.infer<typeof freightDraft>;
}

export async function getFreightPilotRate(tenantId: string, from: string): Promise<FreightPilotRate | null> {
  const enrollment = await withTenant(tenantId, trx => trx.selectFrom('freight_usage_pilot')
    .select(['starts_at', 'rate_revision'])
    .where('tenant_id', '=', tenantId)
    .where('accepted_at', 'is not', null)
    .where('starts_at', '<=', new Date(from))
    .executeTakeFirst());
  if (!enrollment?.starts_at || enrollment.rate_revision === null) return null;
  const version = await dbPlatform.selectFrom('commercial_pricing_versions')
    .select(['revision', 'effective_on', 'configuration'])
    .where('bundle_key', '=', freightBundleKey).where('revision', '=', enrollment.rate_revision)
    .executeTakeFirstOrThrow();
  return { ...version, startsAt: enrollment.starts_at, configuration: freightDraft.parse(JSON.parse(version.configuration)) };
}

export async function getFreightStatement(tenantId: string, period: z.infer<typeof freightPreviewPeriod>, pilot?: FreightPilotRate) {
  const versions = pilot ? [pilot] : (await getFreightPricingVersions(true))
    .filter(version => version.status !== 'scheduled' && version.effective_on < period.to);
  const boundaries = [period.from, ...versions
    .filter(version => version.effective_on > period.from)
    .map(version => version.effective_on).reverse(), period.to];
  const segments = [];
  let total_tzs = 0;

  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i]!;
    const to = boundaries[i + 1]!;
    const version = versions.find(candidate => candidate.effective_on <= from);
    const usage = await getFreightUsagePreview(tenantId, { from, to }, pilot?.startsAt);
    if (usage.data.some(line => line.quantity > 1_000_000)) return null;
    const lines = usage.data.map(({ product_key, quantity, unit }) => {
      const quote = version
        ? quoteFreightLine(product_key, quantity, version.configuration.rates[product_key], version.configuration.discount_percent)
        : null;
      return { product_key, quantity, unit, quote };
    });
    const segmentTotal = version ? lines.reduce((total, line) => total + (line.quote?.total_tzs ?? 0), 0) : null;
    total_tzs += segmentTotal ?? 0;
    if (!Number.isSafeInteger(total_tzs)) return null;
    segments.push({ from_inclusive: from, to_exclusive: to, revision: version?.revision ?? null, lines, total_tzs: segmentTotal });
  }

  return { mode: pilot ? 'pilot' : 'estimate', currency: 'TZS', timezone: 'UTC', segments, total_tzs };
}

export async function generateFreightInvoiceDraft(
  tenantId: string,
  actorId: string,
  period: z.infer<typeof freightPreviewPeriod>,
  pilot?: FreightPilotRate,
) {
  const table = pilot ? 'freight_pilot_invoice_drafts' : 'freight_usage_invoice_drafts';
  const saved = (trx: Transaction<Database>) => trx.selectFrom(table)
      .select(['id', 'created_at', 'snapshot'])
      .where('tenant_id', '=', tenantId)
      .where('period_start', '=', period.from)
      .where('period_end', '=', period.to);
  const existing = await withTenant(tenantId, trx => saved(trx).executeTakeFirst());
  if (existing) return { outcome: 'saved' as const, draft: existing, created: false };

  const snapshot = await getFreightStatement(tenantId, period, pilot);
  if (!snapshot) return { outcome: 'volume_limit' as const };
  if (!snapshot.segments.some(segment => segment.lines.some(line => line.quote && line.quantity > 0))) {
    return { outcome: 'no_priced_usage' as const };
  }
  return withTenant(tenantId, async (trx) => {
    const inserted = await trx.insertInto(table)
      .values({
        tenant_id: tenantId,
        period_start: period.from,
        period_end: period.to,
        snapshot: JSON.stringify(snapshot),
        created_by: actorId,
      })
      .onConflict(conflict => conflict.columns(['tenant_id', 'period_start', 'period_end']).doNothing())
      .returning(['id', 'created_at', 'snapshot'])
      .executeTakeFirst();
    const draft = inserted ?? await saved(trx).executeTakeFirstOrThrow();
    return { outcome: 'saved' as const, draft, created: !!inserted };
  });
}

export function listFreightPilotDrafts(tenantId: string) {
  return withTenant(tenantId, trx => trx.selectFrom('freight_pilot_invoice_drafts')
    .select(['id', 'created_at', 'status', 'paid_at', sql<string>`period_start::text`.as('period_start'), sql<string>`period_end::text`.as('period_end')])
    .where('tenant_id', '=', tenantId)
    .orderBy('created_at', 'desc').orderBy('id', 'desc').limit(25)
    .execute());
}

export function getFreightPilotDraft(tenantId: string, id: string) {
  return withTenant(tenantId, trx => trx.selectFrom('freight_pilot_invoice_drafts')
    .select(['id', 'created_at', 'snapshot', 'status', 'paid_at'])
    .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst());
}

// ── Pilot invoice payment (migration 707) ──────────────────────────────
//
// Closes the draft -> invoice -> payment -> entitlement gap: a saved pilot
// invoice draft (generateFreightInvoiceDraft above) is a point-in-time usage
// snapshot only — nothing before this converted it into something a tenant
// could actually pay, or did anything once they had. Mirrors esb.service.ts's
// createTopUpCheckout/EsbService.topUp shape (Flutterwave hosted checkout,
// verify-by-reference, amount/currency re-checked against our own record
// rather than trusting the gateway body) but against a fixed invoice amount
// instead of an arbitrary top-up.

const FREIGHT_PILOT_PACKAGES: Record<string, string> = {
  clearos: 'clearos-pilot',
  hudufreight: 'hudufreight-pilot',
  cargotracker: 'cargotracker-pilot',
};

export async function createFreightPilotCheckout(
  tenantId: string, draftId: string, email: string, name: string, redirectUrl: string,
) {
  const draft = await withTenant(tenantId, trx => trx.selectFrom('freight_pilot_invoice_drafts')
    .select(['id', 'status', 'snapshot'])
    .where('tenant_id', '=', tenantId).where('id', '=', draftId).executeTakeFirst());
  if (!draft) return { outcome: 'not_found' as const };
  if (draft.status === 'paid') return { outcome: 'already_paid' as const };

  // snapshot is a JSONB column — node-postgres already parses it into an
  // object (unlike the TEXT `configuration` column elsewhere in this file,
  // which genuinely needs JSON.parse), so no parsing here.
  const snapshot = draft.snapshot as any;
  const amount = Math.round(Number(snapshot.total_tzs));
  if (!(amount > 0)) return { outcome: 'nothing_to_charge' as const };

  // A fresh reference per attempt — same as ESB top-up — so an abandoned
  // checkout never blocks a later retry; the old reference, if genuinely
  // paid, is still caught: verify re-reads this draft's CURRENT reference
  // only, so an operator would need to re-click checkout and pay again,
  // which is a UX gap worth fixing later but not a billing-safety one.
  const txRef = `freight-${tenantId.slice(0, 8)}-${draftId.slice(0, 8)}-${Date.now()}`;

  const { url } = await PaymentGateway.createCheckout({
    txRef, amount, currency: 'TZS', email, name, redirectUrl,
    title: 'Hudumika Freight Pilot Invoice',
    meta: { tenant_id: tenantId, purpose: 'freight_pilot_invoice', draft_id: draftId },
  });

  await withTenant(tenantId, trx => trx.updateTable('freight_pilot_invoice_drafts')
    .set({ status: 'invoiced', gateway_tx_ref: txRef, invoiced_at: new Date() })
    .where('tenant_id', '=', tenantId).where('id', '=', draftId).where('status', '!=', 'paid')
    .execute());

  return { outcome: 'created' as const, url };
}

export type FreightPilotVerifyOutcome =
  | { outcome: 'not_found' | 'already_paid' | 'not_invoiced' | 'not_successful' | 'amount_mismatch' }
  | { outcome: 'paid'; paidAt: Date };

export async function verifyFreightPilotPayment(tenantId: string, draftId: string): Promise<FreightPilotVerifyOutcome> {
  const draft = await withTenant(tenantId, trx => trx.selectFrom('freight_pilot_invoice_drafts')
    .select(['id', 'status', 'snapshot', 'gateway_tx_ref'])
    .where('tenant_id', '=', tenantId).where('id', '=', draftId).executeTakeFirst());
  if (!draft) return { outcome: 'not_found' };
  if (draft.status === 'paid') return { outcome: 'already_paid' };
  if (!draft.gateway_tx_ref) return { outcome: 'not_invoiced' };

  const verification = await PaymentGateway.verifyByReference(draft.gateway_tx_ref);
  if (!verification.ok) return { outcome: 'not_successful' };

  const snapshot = draft.snapshot as any;
  const expected = Math.round(Number(snapshot.total_tzs));
  if (verification.currency !== 'TZS' || Math.round(Number(verification.amount)) !== expected) {
    return { outcome: 'amount_mismatch' };
  }

  // The claim: only the caller whose UPDATE actually matches a still-unpaid
  // row proceeds to the entitlement swap — same "claim with a conditional
  // UPDATE inside the transaction" shape as developer.service.ts's
  // verifyTopUp, so two concurrent verify calls (a double-click on return
  // from the gateway) can't both run the swap.
  const now = new Date();
  const paid = await withTenant(tenantId, trx => trx.updateTable('freight_pilot_invoice_drafts')
    .set({
      status: 'paid', paid_at: now,
      gateway_tx_id: verification.transactionId ? String(verification.transactionId) : null,
    })
    .where('tenant_id', '=', tenantId).where('id', '=', draftId).where('status', '!=', 'paid')
    .returning(['id']).executeTakeFirst());
  if (!paid) return { outcome: 'already_paid' };

  await switchToFreightPilotPricing(tenantId);
  return { outcome: 'paid', paidAt: now };
}

/** First successful pilot payment: moves clearos/hudufreight/cargotracker off
 *  their normal flat-fee tenant_product_subscriptions row onto the zero-
 *  priced pilot carrier package (migration 707) — additive and idempotent,
 *  same as onsite-plan.routes.ts's activate-standalone. Never removes a
 *  subscription the tenant doesn't have; a tenant piloting the bundle
 *  without yet owning all three individually still gets all three, which is
 *  the point of the bundle. */
async function switchToFreightPilotPricing(tenantId: string) {
  await withTenant(tenantId, async (trx) => {
    for (const [productKey, pilotPackageCode] of Object.entries(FREIGHT_PILOT_PACKAGES)) {
      const product = await trx.selectFrom('commercial_products').select('id')
        .where('product_key', '=', productKey).executeTakeFirst();
      if (!product) continue; // should always exist (migrations 685/687/689) — skip rather than fail the whole swap
      const pkg = await trx.selectFrom('packages').selectAll().where('code', '=', pilotPackageCode).executeTakeFirst();
      if (!pkg) continue;
      const snapshot = JSON.stringify(buildPriceSnapshot(pkg, 'monthly'));
      await trx.insertInto('tenant_product_subscriptions')
        .values({
          tenant_id: tenantId, commercial_product_id: product.id, package_code: pilotPackageCode,
          status: 'active', started_at: new Date(), price_snapshot: snapshot,
        } as any)
        .onConflict(oc => oc.columns(['tenant_id', 'commercial_product_id']).doUpdateSet({
          package_code: pilotPackageCode, price_snapshot: snapshot, status: 'active',
          cancel_at: null, cancelled_at: null, updated_at: new Date(),
        }))
        .execute();
    }
  });
}

export async function getFreightPricingVersions(includeScheduled: boolean) {
  const today = new Date().toISOString().slice(0, 10);
  const versions = await dbPlatform.selectFrom('commercial_pricing_versions')
    .select(['revision', 'effective_on', 'configuration'])
    .where('bundle_key', '=', freightBundleKey)
    .orderBy('effective_on', 'desc')
    .$if(!includeScheduled, query => query.where('effective_on', '<=', today).limit(1))
    .execute();
  const active = versions.find(version => version.effective_on <= today);
  return versions.map(version => ({
    ...version,
    configuration: freightDraft.parse(JSON.parse(version.configuration)),
    status: version.effective_on > today ? 'scheduled' : version === active ? 'effective' : 'superseded',
  }));
}

export const freightPreviewPeriod = z.object({
  from: z.string().date(),
  to: z.string().date(),
}).refine(({ from, to }) => {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  return days > 0 && days <= 366;
});

export const freightStatementPeriod = freightPreviewPeriod.and(z.object({
  mode: z.enum(['estimate', 'pilot']).optional(),
}));

export async function getFreightUsagePreview(tenantId: string, period: z.infer<typeof freightPreviewPeriod>, pilotStart?: Date) {
  const from = new Date(period.from);
  const to = new Date(period.to);
  return withTenant(tenantId, async (trx) => {
    const cases = await trx.selectFrom('clearos_case_declarations')
      .where('tenant_id', '=', tenantId)
      .where('declared_at', '>=', from)
      .where('declared_at', '<', to)
      .$if(pilotStart !== undefined, query => query.where('recorded_at', '>=', pilotStart!))
      .select(({ fn }) => fn.countAll().as('quantity'))
      .executeTakeFirstOrThrow();
    const trips = await trx.selectFrom('hudufreight_departures')
      .where('tenant_id', '=', tenantId)
      .where('departed_at', '>=', from)
      .where('departed_at', '<', to)
      .$if(pilotStart !== undefined, query => query.where('recorded_at', '>=', pilotStart!))
      .select(({ fn }) => fn.countAll().as('quantity'))
      .executeTakeFirstOrThrow();
    const activations = await trx.selectFrom('cargotracker_activations')
      .where('tenant_id', '=', tenantId)
      .where('activated_at', '>=', from)
      .where('activated_at', '<', to)
      .select(({ fn }) => fn.countAll().as('quantity'))
      .executeTakeFirstOrThrow();

    return {
      mode: 'preview',
      from_inclusive: period.from,
      to_exclusive: period.to,
      timezone: 'UTC',
      data: [
        { product_key: 'clearos', unit: 'case_first_recorded_declaration', quantity: Number(cases.quantity) },
        { product_key: 'hudufreight', unit: 'trip_actual_start', quantity: Number(trips.quantity) },
        { product_key: 'cargotracker', unit: 'tracking_activation', quantity: Number(activations.quantity) },
      ] as const,
    };
  });
}
