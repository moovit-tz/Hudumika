import { dbPlatform, withTenant } from '../db/client.js';

/**
 * Metered billing for platform-default AI usage (agentic platform build,
 * migration 489). A tenant's own key (tenant_settings.settings['int-ai'])
 * always wins over the platform default — but only on a plan tier that
 * allows bringing one at all (packages.byok_ai_allowed, today just the
 * "Hudu Advanced" tier, code='enterprise'). Every other tenant draws
 * against a monthly credits allowance (packages.monthly_ai_credits) billed
 * to the platform; resolveAiCredentials() (platform-settings.ts) is the
 * one place both the allowance check and the eligibility check happen,
 * ahead of every AI call site (ai.routes.ts and agent.routes.ts alike).
 *
 * Deliberately not modeled on Petti's real GL-backed wallet — AI credits
 * are a usage allowance, not currency movement. A balance is derived live
 * from a lightweight debit ledger (agent_credit_ledger) rather than a
 * mutable counter or a "grant" row that would need its own reset job:
 * balance = this month's plan allowance − SUM(this month's debits). A plan
 * change takes effect immediately since the allowance is read live off the
 * tenant's current plan every time, never cached into a stored balance.
 */

/** One agent run/message/chat call against the platform key costs this
 *  many credits — a flat rate, since none of the 4 provider integrations
 *  (Anthropic/OpenAI/Groq/Google) currently parse real token usage out of
 *  their responses. A future real token-based rate is a schema-compatible
 *  upgrade (agent_credit_ledger.delta is already a plain integer, not tied
 *  to this constant), not a blocker to shipping the allowance/gate now. */
export const CREDITS_PER_CALL = 1;

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface TenantPlanRow { monthly_ai_credits: number; byok_ai_allowed: boolean }

async function getTenantPlanRow(tenantId: string): Promise<TenantPlanRow | null> {
  return withTenant(tenantId, async (trx) => {
    const tenant = await trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst();
    if (!tenant) return null;
    const pkg = await trx.selectFrom('packages').select(['monthly_ai_credits', 'byok_ai_allowed']).where('code', '=', tenant.plan).executeTakeFirst();
    // No matching package row (legacy/unknown plan code) — treat as the
    // most restrictive case (no allowance, no BYOK) rather than silently
    // granting unlimited platform-billed AI to a plan nobody configured.
    return pkg ?? { monthly_ai_credits: 0, byok_ai_allowed: false };
  });
}

/** Whether this tenant's plan allows overriding the platform AI key with
 *  their own. SUPER_ADMIN's own platform tenant is exempt — the same
 *  "role bypasses plan gates" precedent checkUsageLimit() already uses. */
export async function isByokAllowed(tenantId: string): Promise<boolean> {
  const row = await getTenantPlanRow(tenantId);
  return row?.byok_ai_allowed ?? false;
}

async function getMonthlyAllowance(tenantId: string): Promise<number> {
  const row = await getTenantPlanRow(tenantId);
  return row?.monthly_ai_credits ?? 0;
}

async function getDebitsThisPeriod(tenantId: string): Promise<number> {
  const row = await withTenant(tenantId, trx => trx.selectFrom('agent_credit_ledger')
    .select(({ fn }) => [fn.sum<number>('delta').as('total')])
    .where('tenant_id', '=', tenantId).where('period', '=', currentPeriod())
    .executeTakeFirst());
  // delta is always negative (a debit) — negate so callers work in
  // positive "credits used" terms.
  return -(Number(row?.total) || 0);
}

export interface AiCreditBalance { used: number; limit: number; remaining: number }

export async function getAiCreditBalance(tenantId: string): Promise<AiCreditBalance> {
  const [limit, used] = await Promise.all([getMonthlyAllowance(tenantId), getDebitsThisPeriod(tenantId)]);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export async function hasAiCreditsRemaining(tenantId: string): Promise<boolean> {
  const { remaining } = await getAiCreditBalance(tenantId);
  return remaining > 0;
}

/** Debits one platform-billed AI call. Called from resolveAiCredentials()
 *  at the moment platform credentials are actually handed out — eagerly,
 *  before the provider call itself completes, since the provider bills for
 *  the attempt regardless of whether the app-level result is a success. */
export async function debitAiCredit(tenantId: string, runId: string | null, reason: string): Promise<void> {
  await withTenant(tenantId, trx => trx.insertInto('agent_credit_ledger').values({
    tenant_id: tenantId, period: currentPeriod(), delta: -CREDITS_PER_CALL, run_id: runId, reason,
  }).execute());
}

/** A human-readable reason AI is unavailable for this tenant right now —
 *  used only on the failure path (resolveAiCredentials() returned null), so
 *  the generic "AI is not configured" 400 every route already threw can say
 *  something accurate instead: platform AI genuinely off, or this
 *  tenant's own credits are exhausted for the month. */
export async function describeAiUnavailable(tenantId: string): Promise<string> {
  const { remaining, limit } = await getAiCreditBalance(tenantId);
  if (limit > 0 && remaining <= 0) {
    return "Your workspace has used all its included AI credits for this month. They reset at the start of next month, or add your own API key in Settings > Integrations > AI Integration (available on the Hudu Advanced plan) to keep going without a monthly limit.";
  }
  return 'AI is not configured. Enable it in Settings > Integrations > AI Integration.';
}
