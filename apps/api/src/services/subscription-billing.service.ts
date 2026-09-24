import type { Transaction } from 'kysely';
import type { Database, PackagesTable } from '../db/client.js';

/**
 * Subscription invoicing: the monthly period invoice (plan + seats + add-ons)
 * and the proration invoice for an add-on bought mid-period. Shared by the
 * billing routes, the add-on purchase route and the scheduled billing job, so
 * there is one definition of "what does this tenant owe".
 *
 * Rules:
 *  - One 'period' invoice per tenant per calendar month (unique index,
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
 */
type Trx = Transaction<Database>;

export interface InvoiceLine { description: string; quantity: number; unit_price: number; amount: number; kind: 'plan' | 'addon' | 'proration' }

const iso = (d: Date) => d.toISOString().slice(0, 10);
// Calendar-month boundaries in UTC, so a period never depends on the server's timezone.
export function periodBounds(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5));
  return { start, end, due, key: `${start.getUTCFullYear()}${String(start.getUTCMonth() + 1).padStart(2, '0')}` };
}

export function computePlanAmount(pkg: Pick<PackagesTable, 'price_per_seat' | 'monthly_price' | 'extra_seat_price' | 'extra_seat_threshold'>, seats: number): number {
  if (pkg.price_per_seat == null) return pkg.monthly_price;
  if (pkg.extra_seat_price != null && pkg.extra_seat_threshold != null && seats > pkg.extra_seat_threshold) {
    return pkg.extra_seat_threshold * pkg.price_per_seat + (seats - pkg.extra_seat_threshold) * pkg.extra_seat_price;
  }
  return pkg.price_per_seat * seats;
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

/** Ensures the period invoice for `now`'s month exists; returns it and whether it was just created. */
export async function generatePeriodInvoice(trx: Trx, tenantId: string, now = new Date()) {
  const bounds = periodBounds(now);
  const { start, end, key } = bounds;
  // Normally due on the 5th. An invoice generated after the 5th (first run of
  // the scheduler, a tenant opening the Billing tab late in the month) gets a
  // 7-day term instead of being born overdue — otherwise turning the job on
  // would push every tenant straight into the dunning ladder.
  const due = now.getTime() > bounds.due.getTime() ? new Date(now.getTime() + 7 * 86_400_000) : bounds.due;
  const existing = await trx.selectFrom('subscription_invoices').selectAll()
    .where('tenant_id', '=', tenantId).where('kind', '=', 'period').where('period_start', '=', iso(start)).executeTakeFirst();
  if (existing) return { invoice: existing, created: false };

  const tenant = await trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst();
  if (!tenant) throw new Error('Tenant not found');
  const pkg = await trx.selectFrom('packages').selectAll().where('code', '=', tenant.plan).executeTakeFirst();
  if (!pkg) throw new Error('Current plan has no pricing configured');

  const seatRow = await trx.selectFrom('users').select(({ fn }) => fn.countAll<number>().as('c'))
    .where('tenant_id', '=', tenantId).where('active', '=', true).executeTakeFirst();
  const seats = Number(seatRow?.c ?? 1);
  const planAmount = round2(computePlanAmount(pkg, seats));

  const addonRows = await trx.selectFrom('tenant_addons')
    .innerJoin('package_addons', 'package_addons.code', 'tenant_addons.addon_code')
    .select(['package_addons.code', 'package_addons.name', 'package_addons.monthly_price', 'tenant_addons.quantity'])
    .where('tenant_addons.tenant_id', '=', tenantId)
    .where('tenant_addons.status', '=', 'active')
    // Add-ons bought this month are on their own proration invoice.
    .where('tenant_addons.started_at', '<', start)
    .execute();

  const lines: InvoiceLine[] = [{ description: `${tenant.plan} plan — ${seats} seat${seats === 1 ? '' : 's'}`, quantity: 1, unit_price: planAmount, amount: planAmount, kind: 'plan' }];
  for (const a of addonRows) {
    const unit = Number(a.monthly_price);
    lines.push({ description: `${a.name}${a.quantity > 1 ? ` × ${a.quantity}` : ''}`, quantity: a.quantity, unit_price: unit, amount: round2(unit * a.quantity), kind: 'addon' });
  }
  const addonsAmount = round2(lines.filter(l => l.kind === 'addon').reduce((s, l) => s + l.amount, 0));
  const amount = round2(planAmount + addonsAmount);

  const invoice = await trx.insertInto('subscription_invoices').values({
    tenant_id: tenantId, invoice_number: await nextInvoiceNumber(trx, tenantId, key), plan_code: tenant.plan, seats,
    currency: 'USD', amount, addons_amount: addonsAmount,
    period_start: iso(start), period_end: iso(end), due_date: iso(due),
    status: statusFor(amount, due, now), kind: 'period', line_items: JSON.stringify(lines),
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
