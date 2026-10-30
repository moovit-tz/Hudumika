import type { Transaction } from 'kysely';
import type { Database, PackagesTable } from '../db/client.js';

/**
 * Subscription invoicing: the period invoice (plan + seats + add-ons)
 * and the proration invoice for an add-on bought mid-period. Shared by the
 * billing routes, the add-on purchase route and the scheduled billing job, so
 * there is one definition of "what does this tenant owe".
 *
 * Rules:
 *  - One 'period' invoice per tenant per billing period (unique index,
 *    migration 504). Generating it twice is a no-op.
 *  - A period invoice bills the plan for the current seat count, plus every
 *    active add-on that was already active BEFORE the period started.
 *  - An add-on bought DURING the period is billed on its own 'proration'
 *    invoice for the days remaining (inclusive of today), and joins the
 *    period invoice from the next month. So nothing is ever billed twice or
 *    skipped, whichever order the purchase and the month's invoice happen in.
 *  - Cancelling an add-on stops future invoices; it does not refund the
 *    month already billed.
 *  - Invoice numbers are MAX-based, not COUNT-based, so a deleted or
 *    cancelled invoice can never make the next number collide.
 *
 * Phase 1 (migration 635): supports both monthly and annual billing cycles.
 * Annual tenants get one invoice per 12-month period; monthly is unchanged.
 * Supports both legacy per-seat pricing and the new flat + included-seats model.
 */
type Trx = Transaction<Database>;
type BillingCycle = 'monthly' | 'annual';

export interface InvoiceLine { description: string; quantity: number; unit_price: number; amount: number; kind: 'plan' | 'addon' | 'proration' }

/** Frozen copy of pricing at invoice time — ensures catalog changes don't
 *  rewrite history. Stored in subscription_invoices.price_snapshot (jsonb). */
export interface PriceSnapshot {
  plan_code: string;
  currency: string;
  billing_cycle: BillingCycle;
  price_flat_monthly: number | null;
  price_flat_annual: number | null;
  price_per_seat: number | null;
  monthly_price: number;
  annual_price: number;
  included_seats: number | null;
  extra_seat_price: number | null;
  extra_seat_threshold: number | null;
  snapshot_at: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Calendar-month boundaries in UTC, or annual boundaries when cycle='annual'.
 *  Annual: starts on the 1st of the tenant's signup month, runs 12 months. */
export function periodBounds(now: Date, cycle: BillingCycle = 'monthly', anniversaryMonth?: number) {
  if (cycle === 'annual') {
    const year = now.getUTCFullYear();
    const month = anniversaryMonth ?? now.getUTCMonth();
    let startYear = year;
    if (now.getUTCMonth() < month) startYear = year - 1;
    const start = new Date(Date.UTC(startYear, month, 1));
    const end = new Date(Date.UTC(startYear + 1, month, 0));
    const due = new Date(Date.UTC(startYear, month, 5));
    const key = `${start.getUTCFullYear()}A${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
    return { start, end, due, key };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5));
  return { start, end, due, key: `${start.getUTCFullYear()}${String(start.getUTCMonth() + 1).padStart(2, '0')}` };
}

/** Compute the plan amount for a billing period.
 *
 *  Phase 1 model: if `price_flat_monthly`/`price_flat_annual` is set, use it
 *  (flat price includes `included_seats` users; overage at extra_seat_price).
 *  Legacy model: `price_per_seat * seats` with optional extra_seat tiering.
 */
export function computePlanAmount(
  pkg: Pick<PackagesTable, 'price_per_seat' | 'monthly_price' | 'extra_seat_price' | 'extra_seat_threshold' | 'price_flat_monthly' | 'price_flat_annual' | 'included_seats'>,
  seats: number,
  cycle: BillingCycle = 'monthly',
): number {
  // New flat-price model (TZS packages from migration 635)
  if (pkg.price_flat_monthly != null || pkg.price_flat_annual != null) {
    const base = cycle === 'annual'
      ? (pkg.price_flat_annual ?? (pkg.price_flat_monthly ?? 0) * 12)
      : (pkg.price_flat_monthly ?? 0);
    const included = pkg.included_seats ?? 0;
    if (seats <= included || pkg.extra_seat_price == null) return base;
    const overageSeats = seats - included;
    const overagePerPeriod = cycle === 'annual'
      ? pkg.extra_seat_price * 12
      : pkg.extra_seat_price;
    return base + overageSeats * overagePerPeriod;
  }
  // Legacy per-seat model (USD packages)
  if (pkg.price_per_seat == null) {
    return cycle === 'annual' ? (pkg as any).annual_price ?? pkg.monthly_price * 12 : pkg.monthly_price;
  }
  if (pkg.extra_seat_price != null && pkg.extra_seat_threshold != null && seats > pkg.extra_seat_threshold) {
    const perSeatAmount = pkg.extra_seat_threshold * pkg.price_per_seat + (seats - pkg.extra_seat_threshold) * pkg.extra_seat_price;
    return cycle === 'annual' ? perSeatAmount * 12 * 0.7 : perSeatAmount;
  }
  const perSeatAmount = pkg.price_per_seat * seats;
  return cycle === 'annual' ? perSeatAmount * 12 * 0.7 : perSeatAmount;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Share of the month left, counting today: 1.0 on the 1st, 1/daysInMonth on the last day. */
export function prorationFactor(now: Date): number {
  const { start, end } = periodBounds(now);
  const daysInMonth = end.getUTCDate();
  const dayOfMonth = now.getUTCDate();
  void start;
  return (daysInMonth - dayOfMonth + 1) / daysInMonth;
}

async function nextInvoiceNumber(trx: Trx, tenantId: string, periodKey: string): Promise<string> {
  const prefix = `SUB-${periodKey}-`;
  const rows = await trx.selectFrom('subscription_invoices').select('invoice_number')
    .where('tenant_id', '=', tenantId).where('invoice_number', 'like', `${prefix}%`).execute();
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.invoice_number.slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function statusFor(amount: number, due: Date, now: Date): 'paid' | 'overdue' | 'due' {
  // A $0 invoice has nothing owed — never "overdue" regardless of the date.
  if (amount <= 0) return 'paid';
  return due.getTime() < now.getTime() ? 'overdue' : 'due';
}

/** Billable seats: active users minus CUSTOMER-role (portal) and API keys.
 *  Per the brief: "do not charge customer portal users or machine identities." */
async function billableSeats(trx: Trx, tenantId: string): Promise<number> {
  const row = await trx.selectFrom('users').select(({ fn }) => fn.countAll<number>().as('c'))
    .where('tenant_id', '=', tenantId).where('active', '=', true)
    .where('role', '!=', 'CUSTOMER')
    .executeTakeFirst();
  return Math.max(1, Number(row?.c ?? 1));
}

function buildPriceSnapshot(pkg: any, cycle: BillingCycle): PriceSnapshot {
  return {
    plan_code: pkg.code,
    currency: pkg.currency ?? 'USD',
    billing_cycle: cycle,
    price_flat_monthly: pkg.price_flat_monthly ?? null,
    price_flat_annual: pkg.price_flat_annual ?? null,
    price_per_seat: pkg.price_per_seat ?? null,
    monthly_price: Number(pkg.monthly_price),
    annual_price: Number(pkg.annual_price),
    included_seats: pkg.included_seats ?? null,
    extra_seat_price: pkg.extra_seat_price ?? null,
    extra_seat_threshold: pkg.extra_seat_threshold ?? null,
    snapshot_at: new Date().toISOString(),
  };
}

/** Ensures the period invoice for the current billing period exists; returns it and whether it was just created. */
export async function generatePeriodInvoice(trx: Trx, tenantId: string, now = new Date()) {
  const tenant = await trx.selectFrom('tenants').select(['plan', 'billing_cycle', 'created_at']).where('id', '=', tenantId).executeTakeFirst();
  if (!tenant) throw new Error('Tenant not found');

  const cycle = (tenant.billing_cycle ?? 'monthly') as BillingCycle;
  const anniversaryMonth = cycle === 'annual' && tenant.created_at
    ? new Date(tenant.created_at as any).getUTCMonth() : undefined;
  const bounds = periodBounds(now, cycle, anniversaryMonth);
  const { start, end, key } = bounds;
  // Normally due on the 5th. An invoice generated after the 5th (first run of
  // the scheduler, a tenant opening the Billing tab late in the month) gets a
  // 7-day term instead of being born overdue — otherwise turning the job on
  // would push every tenant straight into the dunning ladder.
  const due = now.getTime() > bounds.due.getTime() ? new Date(now.getTime() + 7 * 86_400_000) : bounds.due;
  const existing = await trx.selectFrom('subscription_invoices').selectAll()
    .where('tenant_id', '=', tenantId).where('kind', '=', 'period').where('period_start', '=', iso(start)).executeTakeFirst();
  if (existing) return { invoice: existing, created: false };

  const pkg = await trx.selectFrom('packages').selectAll().where('code', '=', tenant.plan).executeTakeFirst();
  if (!pkg) throw new Error('Current plan has no pricing configured');

  const seats = await billableSeats(trx, tenantId);
  const planAmount = round2(computePlanAmount(pkg, seats, cycle));
  const currency = (pkg as any).currency ?? 'USD';

  const addonRows = await trx.selectFrom('tenant_addons')
    .innerJoin('package_addons', 'package_addons.code', 'tenant_addons.addon_code')
    .select(['package_addons.code', 'package_addons.name', 'package_addons.monthly_price', 'package_addons.annual_price', 'tenant_addons.quantity'])
    .where('tenant_addons.tenant_id', '=', tenantId)
    .where('tenant_addons.status', '=', 'active')
    .where('tenant_addons.started_at', '<', start)
    .execute();

  const periodLabel = cycle === 'annual' ? 'year' : 'month';
  const lines: InvoiceLine[] = [{ description: `${tenant.plan} plan — ${seats} seat${seats === 1 ? '' : 's'} / ${periodLabel}`, quantity: 1, unit_price: planAmount, amount: planAmount, kind: 'plan' }];
  for (const a of addonRows) {
    const unit = cycle === 'annual' ? Number(a.annual_price ?? 0) : Number(a.monthly_price);
    lines.push({ description: `${a.name}${a.quantity > 1 ? ` × ${a.quantity}` : ''}`, quantity: a.quantity, unit_price: unit, amount: round2(unit * a.quantity), kind: 'addon' });
  }
  const addonsAmount = round2(lines.filter(l => l.kind === 'addon').reduce((s, l) => s + l.amount, 0));
  const amount = round2(planAmount + addonsAmount);

  const snapshot = buildPriceSnapshot(pkg, cycle);

  const invoice = await trx.insertInto('subscription_invoices').values({
    tenant_id: tenantId, invoice_number: await nextInvoiceNumber(trx, tenantId, key), plan_code: tenant.plan, seats,
    currency, amount, addons_amount: addonsAmount,
    period_start: iso(start), period_end: iso(end), due_date: iso(due),
    status: statusFor(amount, due, now), kind: 'period', line_items: JSON.stringify(lines),
    billing_cycle: cycle, price_snapshot: JSON.stringify(snapshot),
  } as any).returningAll().executeTakeFirstOrThrow();
  return { invoice, created: true };
}

/** A proration invoice for `quantity` units of an add-on bought at `now`. Null when there is nothing to charge. */
export async function createProrationInvoice(trx: Trx, tenantId: string, addonCode: string, quantity: number, now = new Date()) {
  const addon = await trx.selectFrom('package_addons').select(['code', 'name', 'monthly_price']).where('code', '=', addonCode).executeTakeFirst();
  if (!addon || Number(addon.monthly_price) <= 0 || quantity < 1) return null;
  const tenant = await trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst();
  if (!tenant) return null;

  const { start, end, key } = periodBounds(now);
  const factor = prorationFactor(now);
  const unit = round2(Number(addon.monthly_price) * factor);
  const amount = round2(unit * quantity);
  if (amount <= 0) return null;
  const daysLeft = Math.round(factor * end.getUTCDate());
  const line: InvoiceLine = {
    description: `${addon.name}${quantity > 1 ? ` × ${quantity}` : ''} — prorated ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${iso(now)} to ${iso(end)})`,
    quantity, unit_price: unit, amount, kind: 'proration',
  };
  const seatRow = await trx.selectFrom('users').select(({ fn }) => fn.countAll<number>().as('c'))
    .where('tenant_id', '=', tenantId).where('active', '=', true).executeTakeFirst();
  // Due immediately — an add-on purchased today is paid for today.
  return trx.insertInto('subscription_invoices').values({
    tenant_id: tenantId, invoice_number: await nextInvoiceNumber(trx, tenantId, key), plan_code: tenant.plan,
    seats: Number(seatRow?.c ?? 1), currency: 'USD', amount, addons_amount: amount,
    period_start: iso(start), period_end: iso(end), due_date: iso(now),
    status: 'due', kind: 'proration', line_items: JSON.stringify([line]),
  } as any).returningAll().executeTakeFirstOrThrow();
}

// ── Settlement ──────────────────────────────────────────────────────────
import { withTenant } from '../db/client.js';
import type { GatewayVerification } from '../integrations/payment-gateway.js';

export type SettleOutcome = 'paid' | 'already_paid' | 'not_found' | 'amount_mismatch' | 'currency_mismatch' | 'not_successful';

/**
 * Marks an invoice paid from a gateway verification. Idempotent (a second
 * call on a paid invoice is a no-op) and defensive: the gateway's own record
 * must be successful, in the invoice's currency, and cover the invoice amount.
 */
export async function settleInvoiceFromGateway(tenantId: string, invoiceId: string, gateway: string, v: GatewayVerification): Promise<SettleOutcome> {
  return withTenant(tenantId, async (trx) => {
    const invoice = await trx.selectFrom('subscription_invoices').selectAll()
      .where('id', '=', invoiceId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!invoice) return 'not_found';
    if (invoice.status === 'paid') return 'already_paid';
    if (!v.ok) return 'not_successful';
    if (v.currency !== invoice.currency) return 'currency_mismatch';
    if (!(Number(v.amount) >= Number(invoice.amount))) return 'amount_mismatch';
    await trx.updateTable('subscription_invoices')
      .set({ status: 'paid', paid_at: new Date(), tx_ref: v.txRef ?? invoice.gateway_ref, gateway, updated_at: new Date() })
      .where('id', '=', invoiceId).where('tenant_id', '=', tenantId).execute();
    return 'paid';
  });
}
