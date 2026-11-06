import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { checkSeatLimit } from '../lib/plan-limits.js';

type Trx = Transaction<Database>;

export async function currencyChangeBlocker(trx: Trx, tenantId: string, targetPlan: string, currency: string, at: Date) {
  const seats = await checkSeatLimit(tenantId, targetPlan, trx);
  if (!seats.allowed && seats.limit !== null && seats.current > seats.limit) {
    return 'The workspace exceeds the target plan’s seat allowance.';
  }

  if (currency !== 'USD') {
    const addon = await trx.selectFrom('tenant_addons as ta')
      .innerJoin('package_addons as pa', 'pa.code', 'ta.addon_code')
      .select('ta.id').where('ta.tenant_id', '=', tenantId).where('ta.status', '=', 'active')
      .where(eb => eb.or([eb('pa.monthly_price', '>', 0), eb('pa.annual_price', '>', 0)]))
      .executeTakeFirst();
    if (addon) return 'Remove paid USD add-ons before switching billing currency.';
  }

  const products = await trx.selectFrom('tenant_product_subscriptions as sub')
    .innerJoin('packages as pkg', 'pkg.code', 'sub.package_code')
    .innerJoin('commercial_products as cp', 'cp.id', 'sub.commercial_product_id')
    .select(['sub.price_snapshot', 'pkg.currency', 'pkg.monthly_price', 'pkg.annual_price', 'pkg.price_flat_monthly', 'pkg.price_flat_annual', 'pkg.price_per_seat', 'pkg.extra_seat_price'])
    .where('sub.tenant_id', '=', tenantId)
    .where('cp.product_key', '!=', 'hudumika_business')
    .where('sub.status', 'in', ['active', 'grace', 'scheduled_cancellation'])
    .where(eb => eb.or([eb('sub.cancel_at', 'is', null), eb('sub.cancel_at', '>', at)]))
    .execute();
  for (const product of products) {
    const price = product.price_snapshot
      ? (typeof product.price_snapshot === 'string' ? JSON.parse(product.price_snapshot) : product.price_snapshot) as typeof product
      : product;
    if ((price.currency ?? 'USD') !== currency &&
        [price.monthly_price, price.annual_price, price.price_flat_monthly, price.price_flat_annual, price.price_per_seat, price.extra_seat_price]
          .some(amount => Number(amount) > 0)) {
      return 'A paid standalone product uses a different currency. End that subscription before switching.';
    }
  }
  return null;
}

export async function applyScheduledCurrencyChange(
  trx: Trx, tenantId: string, currentPlan: string, cycle: 'monthly' | 'annual', periodStart: Date, now: Date,
) {
  const change = await trx.selectFrom('subscription_currency_changes').selectAll()
    .where('tenant_id', '=', tenantId).where('status', '=', 'scheduled')
    .where('effective_at', '<=', periodStart).executeTakeFirst();
  if (!change) return null;

  const target = await trx.selectFrom('packages').select(['is_active', 'currency'])
    .where('code', '=', change.to_plan).executeTakeFirst();
  const blocked = currentPlan !== change.from_plan || cycle !== change.billing_cycle
    ? 'The current plan or billing cycle changed after scheduling.'
    : !target?.is_active || target.currency !== change.currency
      ? 'The target plan or currency is no longer available.'
      : await currencyChangeBlocker(trx, tenantId, change.to_plan, change.currency, periodStart);

  await trx.updateTable('subscription_currency_changes')
    .set({ status: blocked ? 'blocked' : 'applied', blocked_reason: blocked })
    .where('tenant_id', '=', tenantId).execute();
  if (blocked) return null;

  await trx.updateTable('tenants').set({ plan: change.to_plan as Database['tenants']['plan'], updated_at: now })
    .where('id', '=', tenantId).execute();
  await sql`
    UPDATE tenant_settings
    SET settings = jsonb_set(settings, '{enabled-apps}', COALESCE((
      SELECT jsonb_object_agg(app.key, app.value)
      FROM jsonb_each(settings->'enabled-apps') AS app(key, value)
      WHERE app.value <> 'true'::jsonb OR EXISTS (
        SELECT 1 FROM package_features
        WHERE package_code = ${change.to_plan} AND feature_key = app.key
      )
    ), '{}'::jsonb)), updated_at = ${now}
    WHERE tenant_id = ${tenantId} AND jsonb_typeof(settings->'enabled-apps') = 'object'
  `.execute(trx);
  await trx.insertInto('tenant_plan_changes').values({
    tenant_id: tenantId, from_plan: currentPlan, to_plan: change.to_plan,
    from_cycle: cycle, to_cycle: cycle, effective_at: periodStart,
    reason: 'Scheduled billing currency change', initiated_by: change.requested_by,
    proration_amount: null, proration_currency: null,
  }).execute();
  return change.to_plan;
}
