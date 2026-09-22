import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { getAiCreditBalance, type AiCreditBalance } from './ai-credits.js';

/**
 * Read-only usage reporting for the agent. Everything here is a real count
 * off agent_runs / agent_run_steps / agent_credit_ledger — token figures are
 * only what providers reported (null steps add nothing), and no dollar figure
 * is invented: credits are the platform's unit and agent_runs.cost_usd is
 * still unwritten, so this reports tokens and credits, not currency.
 */

export interface AgentUsageReport {
  days: number;
  since: string;
  runs: { total: number; byStatus: Record<string, number> };
  tokens: { in: number; out: number };
  credits: AiCreditBalance;
  topTools: { toolId: string; calls: number; errors: number }[];
  daily: { day: string; runs: number }[];
}

export async function getTenantAgentUsage(tenantId: string, days: number): Promise<AgentUsageReport> {
  const since = new Date(Date.now() - days * 86_400_000);
  const credits = await getAiCreditBalance(tenantId);

  const { statusRows, tokenRow, toolRows, dayRows } = await withTenant(tenantId, async (trx) => ({
    statusRows: await trx.selectFrom('agent_runs')
      .select(['status', ({ fn }) => fn.countAll<string>().as('n')])
      .where('tenant_id', '=', tenantId).where('created_at', '>=', since).groupBy('status').execute(),
    tokenRow: await trx.selectFrom('agent_run_steps')
      .select(({ fn }) => [fn.sum<string>('tokens_in').as('tin'), fn.sum<string>('tokens_out').as('tout')])
      .where('tenant_id', '=', tenantId).where('created_at', '>=', since).executeTakeFirst(),
    toolRows: await trx.selectFrom('agent_run_steps')
      .select(['tool_id', ({ fn }) => fn.countAll<string>().as('calls'),
        sql<string>`COUNT(*) FILTER (WHERE status = 'error')`.as('errors')])
      .where('tenant_id', '=', tenantId).where('step_type', '=', 'tool_result').where('tool_id', 'is not', null)
      .where('created_at', '>=', since).groupBy('tool_id').orderBy('calls', 'desc').limit(10).execute(),
    dayRows: await trx.selectFrom('agent_runs')
      .select([sql<string>`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as('day'), ({ fn }) => fn.countAll<string>().as('n')])
      .where('tenant_id', '=', tenantId).where('created_at', '>=', since).groupBy('day').orderBy('day', 'asc').execute(),
  }));

  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = Number(r.n);
  return {
    days, since: since.toISOString(),
    runs: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus },
    tokens: { in: Number(tokenRow?.tin) || 0, out: Number(tokenRow?.tout) || 0 },
    credits,
    topTools: toolRows.map(r => ({ toolId: r.tool_id as string, calls: Number(r.calls), errors: Number(r.errors) })),
    daily: dayRows.map(r => ({ day: r.day, runs: Number(r.n) })),
  };
}

export interface PlatformAgentUsageRow {
  tenantId: string;
  tenantName: string;
  plan: string;
  runs: number;
  tokensIn: number;
  tokensOut: number;
  creditsUsed: number;
  creditsLimit: number;
}

/** Every tenant's agent activity in the window, heaviest first — the
 *  cross-tenant view the platform operator needs to see who is drawing on the
 *  shared AI key. Uses the platform connection: this is a deliberately
 *  cross-tenant, SuperAdmin-only read. */
export async function getPlatformAgentUsage(days: number): Promise<{ days: number; totals: { runs: number; tokensIn: number; tokensOut: number; creditsUsed: number }; tenants: PlatformAgentUsageRow[] }> {
  const since = new Date(Date.now() - days * 86_400_000);
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const [runRows, tokenRows, creditRows, tenantRows] = await Promise.all([
    dbPlatform.selectFrom('agent_runs').select(['tenant_id', ({ fn }) => fn.countAll<string>().as('n')])
      .where('created_at', '>=', since).groupBy('tenant_id').execute(),
    dbPlatform.selectFrom('agent_run_steps')
      .select(['tenant_id', ({ fn }) => fn.sum<string>('tokens_in').as('tin'), ({ fn }) => fn.sum<string>('tokens_out').as('tout')])
      .where('created_at', '>=', since).groupBy('tenant_id').execute(),
    dbPlatform.selectFrom('agent_credit_ledger').select(['tenant_id', ({ fn }) => fn.sum<string>('delta').as('total')])
      .where('period', '=', period).groupBy('tenant_id').execute(),
    dbPlatform.selectFrom('tenants').leftJoin('packages', 'packages.code', 'tenants.plan')
      .select(['tenants.id as id', 'tenants.name as name', 'tenants.plan as plan', 'packages.monthly_ai_credits as credits']).execute(),
  ]);

  const runsBy = new Map(runRows.map(r => [r.tenant_id, Number(r.n)]));
  const tokBy = new Map(tokenRows.map(r => [r.tenant_id, { i: Number(r.tin) || 0, o: Number(r.tout) || 0 }]));
  const credBy = new Map(creditRows.map(r => [r.tenant_id, -(Number(r.total) || 0)]));

  const tenants: PlatformAgentUsageRow[] = tenantRows
    .map(t => ({
      tenantId: t.id, tenantName: t.name, plan: t.plan,
      runs: runsBy.get(t.id) ?? 0,
      tokensIn: tokBy.get(t.id)?.i ?? 0, tokensOut: tokBy.get(t.id)?.o ?? 0,
      creditsUsed: credBy.get(t.id) ?? 0, creditsLimit: Number(t.credits) || 0,
    }))
    .filter(t => t.runs > 0 || t.creditsUsed > 0)
    .sort((a, b) => b.creditsUsed - a.creditsUsed || b.runs - a.runs);

  return {
    days,
    totals: tenants.reduce((s, t) => ({ runs: s.runs + t.runs, tokensIn: s.tokensIn + t.tokensIn, tokensOut: s.tokensOut + t.tokensOut, creditsUsed: s.creditsUsed + t.creditsUsed }), { runs: 0, tokensIn: 0, tokensOut: 0, creditsUsed: 0 }),
    tenants,
  };
}
