import { dbPlatform, withTenant } from '../db/client.js';
import { checkSeatLimit } from '../lib/plan-limits.js';
import type { TenantPlan } from '@hudumika/types';
import { PLAN_LEVELS, SIGNUP_BASE_PLAN_CODES } from '@hudumika/types';
import { computePlanAmount, periodBounds, prorationFactor } from './subscription-billing.service.js';
import { currencyChangeBlocker } from './subscription-currency-change.service.js';

type BillingCycle = 'monthly' | 'annual';

export interface PlanChangeRequest {
  tenantId: string;
  toPlan: TenantPlan;
  toCycle?: BillingCycle;
  reason?: string;
  initiatedBy?: string;
}

export interface PlanChangeResult {
  success: boolean;
  error?: string;
  code?: 'PLAN_NOT_FOUND' | 'SEAT_LIMIT_EXCEEDED' | 'SAME_PLAN' | 'PLAN_INACTIVE' | 'CURRENCY_CHANGE_REQUIRES_REVIEW';
  fromPlan: string;
  toPlan: string;
  fromCycle: BillingCycle;
  toCycle: BillingCycle;
  prorationAmount: number | null;
  prorationCurrency: string | null;
  changeId: string | null;
  scheduledFor?: Date;
}

export async function changePlan(req: PlanChangeRequest): Promise<PlanChangeResult> {
  const tenant = await dbPlatform.selectFrom('tenants')
    .select(['id', 'plan', 'billing_cycle', 'created_at'])
    .where('id', '=', req.tenantId)
    .executeTakeFirst();
  if (!tenant) throw new Error('Tenant not found');

  const fromPlan = tenant.plan as TenantPlan;
  const fromCycle = (tenant.billing_cycle ?? 'monthly') as BillingCycle;
  const toCycle = req.toCycle ?? fromCycle;
  const changeContext = { fromPlan, toPlan: req.toPlan, fromCycle, toCycle, prorationAmount: null, prorationCurrency: null, changeId: null };

  if (fromPlan === req.toPlan && fromCycle === toCycle) {
    return { success: false, error: 'Already on this plan and cycle', code: 'SAME_PLAN', fromPlan, toPlan: req.toPlan, fromCycle, toCycle, prorationAmount: null, prorationCurrency: null, changeId: null };
  }
  if (fromPlan !== req.toPlan && !SIGNUP_BASE_PLAN_CODES.includes(req.toPlan)) {
    return { ...changeContext, success: false, error: 'Select Starter, Business, or Scale for a plan change.', code: 'PLAN_NOT_FOUND' };
  }

  const newPkg = await dbPlatform.selectFrom('packages').selectAll()
    .where('code', '=', req.toPlan).executeTakeFirst();
  if (!newPkg) {
    return { success: false, error: 'Target plan not found', code: 'PLAN_NOT_FOUND', fromPlan, toPlan: req.toPlan, fromCycle, toCycle, prorationAmount: null, prorationCurrency: null, changeId: null };
  }
  if (!newPkg.is_active) {
    return { success: false, error: 'Target plan is not active', code: 'PLAN_INACTIVE', fromPlan, toPlan: req.toPlan, fromCycle, toCycle, prorationAmount: null, prorationCurrency: null, changeId: null };
  }
  const oldPkg = fromPlan === req.toPlan ? newPkg : await dbPlatform.selectFrom('packages').selectAll()
    .where('code', '=', fromPlan).executeTakeFirst();
  if (oldPkg && (oldPkg.currency ?? 'USD') !== (newPkg.currency ?? 'USD')) {
    const failure = (error: string): PlanChangeResult => ({
      ...changeContext, success: false, code: 'CURRENCY_CHANGE_REQUIRES_REVIEW', error,
    });
    if (toCycle !== fromCycle) return failure('Keep your current billing cycle when switching currency. You can change the cycle afterward.');
    return withTenant(req.tenantId, async trx => {
      const current = await trx.selectFrom('tenants').select(['plan', 'billing_cycle', 'created_at'])
        .where('id', '=', req.tenantId).forUpdate().executeTakeFirstOrThrow();
      if (current.plan !== fromPlan || (current.billing_cycle ?? 'monthly') !== fromCycle) {
        return failure('Your plan changed. Reload billing and try again.');
      }
      const scheduled = await trx.selectFrom('subscription_currency_changes').selectAll()
        .where('tenant_id', '=', req.tenantId).where('status', '=', 'scheduled').executeTakeFirst();
      if (scheduled) {
        return scheduled.to_plan === req.toPlan
          ? { ...changeContext, success: true, scheduledFor: scheduled.effective_at }
          : failure('Cancel the scheduled currency change before choosing another plan.');
      }
      const now = new Date();
      const anniversary = current.created_at ? new Date(current.created_at).getUTCMonth() : undefined;
      const { end } = periodBounds(now, fromCycle, anniversary);
      const effectiveAt = new Date(end.getTime() + 86_400_000);
      const currency = newPkg.currency ?? 'USD';
      const blocker = await currencyChangeBlocker(trx, req.tenantId, req.toPlan, currency, effectiveAt);
      if (blocker) return failure(blocker);
      const values = {
        from_plan: fromPlan, to_plan: req.toPlan, billing_cycle: fromCycle, currency,
        effective_at: effectiveAt, requested_by: req.initiatedBy ?? null, status: 'scheduled' as const, blocked_reason: null,
      };
      await trx.insertInto('subscription_currency_changes').values({ tenant_id: req.tenantId, ...values })
        .onConflict(conflict => conflict.column('tenant_id').doUpdateSet(values)).execute();
      return { ...changeContext, success: true, scheduledFor: effectiveAt };
    });
  }

  const seatCheck = await checkSeatLimit(req.tenantId, req.toPlan);
  if (!seatCheck.allowed) {
    return { success: false, error: seatCheck.message ?? `Current seat count (${seatCheck.current}) exceeds target plan limit (${seatCheck.limit})`, code: 'SEAT_LIMIT_EXCEEDED', fromPlan, toPlan: req.toPlan, fromCycle, toCycle, prorationAmount: null, prorationCurrency: null, changeId: null };
  }

  const isUpgrade = (PLAN_LEVELS[req.toPlan] ?? 0) > (PLAN_LEVELS[fromPlan] ?? 0);

  // Compute proration: difference between new and old plan for the remainder of the current period
  let prorationAmount: number | null = null;
  let prorationCurrency: string | null = null;
  const now = new Date();

  if (fromPlan !== req.toPlan) {
    if (oldPkg) {
      const seats = await withTenant(req.tenantId, async (trx) => {
        const row = await trx.selectFrom('users').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', req.tenantId).where('active', '=', true).where('role', '!=', 'CUSTOMER')
          .executeTakeFirst();
        return Math.max(1, Number(row?.c ?? 1));
      });

      const oldAmount = computePlanAmount(oldPkg as any, seats, fromCycle);
      const newAmount = computePlanAmount(newPkg as any, seats, toCycle);
      const factor = prorationFactor(now);

      if (isUpgrade) {
        // Upgrade: charge the difference for the remaining period
        const diff = newAmount - oldAmount;
        prorationAmount = Math.max(0, Math.round(diff * factor * 100) / 100);
      } else {
        // Downgrade: credit the difference (stored as negative for reference)
        const diff = oldAmount - newAmount;
        prorationAmount = -Math.round(diff * factor * 100) / 100;
      }
      prorationCurrency = (newPkg as any).currency ?? 'USD';
    }
  }

  // Apply the change
  const changed = await dbPlatform.updateTable('tenants')
    .set({ plan: req.toPlan, billing_cycle: toCycle, updated_at: new Date() } as any)
    .where('id', '=', req.tenantId).where('plan', '=', fromPlan).where('billing_cycle', '=', fromCycle)
    .returning('id').executeTakeFirst();
  if (!changed) {
    return { ...changeContext, success: false, error: 'Your plan changed. Reload billing and try again.' };
  }

  // Record the audit trail
  const change = await dbPlatform.insertInto('tenant_plan_changes' as any)
    .values({
      tenant_id: req.tenantId,
      from_plan: fromPlan,
      to_plan: req.toPlan,
      from_cycle: fromCycle,
      to_cycle: toCycle,
      effective_at: now,
      reason: req.reason ?? (isUpgrade ? 'Upgrade' : 'Downgrade'),
      initiated_by: req.initiatedBy ?? null,
      proration_amount: prorationAmount,
      proration_currency: prorationCurrency,
    } as any)
    .returning('id' as any)
    .executeTakeFirstOrThrow();

  // Prune enabled-apps overrides that exceed the new plan (same logic as superadmin.routes.ts)
  if (fromPlan !== req.toPlan) {
    const newPlanFeatures = await dbPlatform.selectFrom('package_features')
      .select('feature_key').where('package_code', '=', req.toPlan).execute();
    const allowedKeys = new Set(newPlanFeatures.map(f => f.feature_key));

    const settingsRow = await dbPlatform.selectFrom('tenant_settings').select('settings')
      .where('tenant_id', '=', req.tenantId).executeTakeFirst();
    if (settingsRow) {
      const settings = typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings;
      const enabledApps: Record<string, boolean> = (settings as any)['enabled-apps'] || {};
      const next: Record<string, boolean> = {};
      let pruned = false;
      for (const [key, value] of Object.entries(enabledApps)) {
        if (value === true && !allowedKeys.has(key)) { pruned = true; continue; }
        next[key] = value;
      }
      if (pruned) {
        const { sql } = await import('kysely');
        await sql`UPDATE tenant_settings SET settings = jsonb_set(settings, '{enabled-apps}', ${JSON.stringify(next)}::jsonb), updated_at = NOW() WHERE tenant_id = ${req.tenantId}`.execute(dbPlatform);
      }
    }
  }

  return {
    success: true,
    fromPlan,
    toPlan: req.toPlan,
    fromCycle,
    toCycle,
    prorationAmount,
    prorationCurrency,
    changeId: (change as any).id,
  };
}

/** Fetch plan-change history for a tenant (most recent first). */
export async function getPlanChangeHistory(tenantId: string, limit = 20) {
  return dbPlatform.selectFrom('tenant_plan_changes' as any)
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
}
