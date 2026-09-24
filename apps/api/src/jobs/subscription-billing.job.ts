import { dbPlatform, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';
import { PettiService } from '../services/petti.service.js';
import { generatePeriodInvoice } from '../services/subscription-billing.service.js';
import { BILLING_LOCK_STAGE } from '../lib/storage-quota.js';

/**
 * Daily subscription billing (migration 504):
 *
 *  1. Scheduled invoices — every tenant gets its monthly 'period' invoice
 *     generated automatically (idempotent; the unique index makes a second
 *     run a no-op), instead of only when someone opens the Billing tab.
 *  2. Overdue sweep — 'due' invoices past their due date become 'overdue'.
 *  3. Dunning — an overdue invoice climbs a fixed ladder by days past due:
 *
 *        stage 1 (1+ days)   reminder + automatic charge attempt
 *        stage 2 (7+ days)   second reminder + retry
 *        stage 3 (14+ days)  warning: uploads will be blocked soon
 *        stage 4 (21+ days)  final notice — new Cloud uploads are blocked
 *                            (lib/storage-quota.ts BILLING_LOCK_STAGE); reads,
 *                            downloads and deletes keep working
 *
 *     Each stage runs once (dunning_stage), so the job is safe to run as often
 *     as the fallback scheduler fires it. Paying the invoice — by any route —
 *     ends the ladder and lifts the block immediately.
 *
 *  Automatic charging only works for a stored petti-wallet method, which is a
 *  real internal deduction. Cards and mobile money cannot be charged
 *  unattended here (that would need gateway tokenisation, which this
 *  integration does not do — the customer pays through hosted checkout), so
 *  for those the ladder is notifications only.
 */
const LADDER: { stage: number; minDaysOverdue: number; title: string; body: (n: string, days: number) => string }[] = [
  { stage: 1, minDaysOverdue: 1, title: 'Subscription invoice overdue', body: (n) => `Invoice ${n} is past its due date. Please pay it to keep your workspace in good standing.` },
  { stage: 2, minDaysOverdue: 7, title: 'Second reminder: invoice overdue', body: (n, d) => `Invoice ${n} is ${d} days overdue. Please pay it as soon as possible.` },
  { stage: 3, minDaysOverdue: 14, title: 'Action needed: uploads will be blocked soon', body: (n, d) => `Invoice ${n} is ${d} days overdue. If it is not paid in the next week, new Cloud uploads will be blocked.` },
  { stage: BILLING_LOCK_STAGE, minDaysOverdue: 21, title: 'Final notice: uploads are now blocked', body: (n, d) => `Invoice ${n} is ${d} days overdue. New Cloud uploads are blocked until it is paid. Your files remain available to view, download and delete.` },
];

const MAX_AUTO_ATTEMPTS = 3;

async function admins(tenantId: string) {
  return withTenant(tenantId, (trx) => trx.selectFrom('users').select(['id', 'role'])
    .where('tenant_id', '=', tenantId).where('active', '=', true).where('role', 'in', ['TENANT_ADMIN', 'ADMIN']).execute());
}

async function tryAutoCharge(inv: { id: string; tenant_id: string; invoice_number: string; amount: number; plan_code: string; seats: number; attempt_count: number }): Promise<boolean> {
  if (inv.attempt_count >= MAX_AUTO_ATTEMPTS) return false;
  const method = await withTenant(inv.tenant_id, (trx) => trx.selectFrom('payment_methods').selectAll()
    .where('tenant_id', '=', inv.tenant_id).where('type', '=', 'petti_wallet').where('petti_wallet_id', 'is not', null)
    .orderBy('is_default', 'desc').executeTakeFirst());
  if (!method?.petti_wallet_id) return false;
  const [actor] = await admins(inv.tenant_id);
  if (!actor) return false;
  try {
    const result = await PettiService.payFromWalletDirect(inv.tenant_id, { id: actor.id, role: actor.role as any }, {
      walletId: method.petti_wallet_id, amount: inv.amount, category: 'SUBSCRIPTION',
      purpose: `Hudumika subscription ${inv.invoice_number} — ${inv.plan_code} plan, ${inv.seats} seat${inv.seats === 1 ? '' : 's'} (automatic retry)`,
    });
    await withTenant(inv.tenant_id, (trx) => trx.updateTable('subscription_invoices')
      .set({ status: 'paid', paid_at: new Date(), payment_method_id: method.id, tx_ref: `PETTI-${result.withdrawalRequestId}`, attempt_count: inv.attempt_count + 1, last_attempt_at: new Date(), last_attempt_error: null, updated_at: new Date() })
      .where('id', '=', inv.id).where('tenant_id', '=', inv.tenant_id).execute());
    return true;
  } catch (err: any) {
    await withTenant(inv.tenant_id, (trx) => trx.updateTable('subscription_invoices')
      .set({ attempt_count: inv.attempt_count + 1, last_attempt_at: new Date(), last_attempt_error: String(err.message ?? err).slice(0, 500), updated_at: new Date() })
      .where('id', '=', inv.id).where('tenant_id', '=', inv.tenant_id).execute());
    return false;
  }
}

/** `onlyTenantId` scopes the whole run to one tenant — used by tests so they never touch other tenants' invoices. */
export async function runSubscriptionBillingJob(now = new Date(), onlyTenantId?: string): Promise<{ generated: number; escalated: number; autoPaid: number }> {
  let generated = 0, escalated = 0, autoPaid = 0;

  // 1. Scheduled invoices.
  let tenantQuery = dbPlatform.selectFrom('tenants').select('id');
  if (onlyTenantId) tenantQuery = tenantQuery.where('id', '=', onlyTenantId);
  const tenants = await tenantQuery.execute();
  for (const t of tenants) {
    try {
      const { created } = await withTenant(t.id, (trx) => generatePeriodInvoice(trx, t.id, now));
      if (created) generated++;
    } catch (err: any) {
      // A tenant on a plan with no pricing row is skipped, not a job failure.
      if (!/no pricing configured|Tenant not found/.test(err.message)) console.error(`❌ Subscription invoice generation failed for tenant ${t.id}:`, err.message);
    }
  }

  // 2. Overdue sweep (explicit status guard; cross-tenant by design, like every billing job).
  const today = now.toISOString().slice(0, 10);
  let sweep = dbPlatform.updateTable('subscription_invoices').set({ status: 'overdue', updated_at: now })
    .where('status', '=', 'due').where('due_date', '<', today);
  if (onlyTenantId) sweep = sweep.where('tenant_id', '=', onlyTenantId);
  await sweep.execute();

  // 3. Dunning.
  let overdueQuery = dbPlatform.selectFrom('subscription_invoices')
    .select(['id', 'tenant_id', 'invoice_number', 'amount', 'plan_code', 'seats', 'due_date', 'dunning_stage', 'attempt_count'])
    .where('status', '=', 'overdue').where('amount', '>', 0);
  if (onlyTenantId) overdueQuery = overdueQuery.where('tenant_id', '=', onlyTenantId);
  const overdue = await overdueQuery.execute();

  for (const inv of overdue) {
    const daysOverdue = Math.floor((now.getTime() - new Date(String(inv.due_date).slice(0, 10)).getTime()) / 86_400_000);
    const target = [...LADDER].reverse().find(l => daysOverdue >= l.minDaysOverdue);
    if (!target || target.stage <= inv.dunning_stage) continue;
    try {
      // Advance first: if anything below fails half-way we do not spam the tenant on the next run.
      await withTenant(inv.tenant_id, (trx) => trx.updateTable('subscription_invoices')
        .set({ dunning_stage: target.stage, last_dunning_at: now, updated_at: now })
        .where('id', '=', inv.id).where('tenant_id', '=', inv.tenant_id).execute());
      escalated++;

      if (target.stage <= 2 && await tryAutoCharge(inv)) { autoPaid++; continue; }

      for (const admin of await admins(inv.tenant_id)) {
        await NotificationService.createNotification({
          tenantId: inv.tenant_id, userId: admin.id, app: 'admin', type: 'warning',
          title: target.title, message: target.body(inv.invoice_number, daysOverdue), link: '/workspace/billing',
          entityType: 'subscription_invoice', entityId: inv.id,
        });
      }
    } catch (err: any) {
      console.error(`❌ Dunning failed for invoice ${inv.id}:`, err.message);
    }
  }

  if (generated || escalated) console.log(`💳 Subscription billing — invoices generated: ${generated}, dunning steps: ${escalated}, auto-paid: ${autoPaid}`);
  return { generated, escalated, autoPaid };
}
